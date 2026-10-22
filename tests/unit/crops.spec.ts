import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { CROPS_PER_CHECK, cropIssues } from '../../src/crops';
import { decodePng, encodePng } from '../../src/png';
import type { Issue } from '../../src/types';
import { makeCheck, makeIssue } from './fixtures';

/** A width × height RGBA image, red where `red(x, y)`, else white. */
function image(width: number, height: number, red: (x: number, y: number) => boolean) {
  const data = Buffer.alloc(width * height * 4, 255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (red(x, y)) data.fill(0, (y * width + x) * 4 + 1, (y * width + x) * 4 + 3);
  return { width, height, channels: 4 as const, data };
}

test('PNG round trip', () => {
  const img = image(7, 5, (x, y) => x === y);
  const back = decodePng(encodePng(img))!;
  expect([back.width, back.height, back.channels]).toEqual([7, 5, 4]);
  expect(back.data.equals(img.data)).toBe(true);
});

test('a PNG it cannot read is null, not an error', () => {
  expect(decodePng(Buffer.from('not a png'))).toBeNull();
});

function setup(issues: Issue[], opts: { scale?: number; origin?: { x: number; y: number } } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fitlocale-crops-'));
  const scale = opts.scale ?? 1;
  const shot = join(dir, 'shot.png');
  // The document is 400 × 300 CSS px; one red square at document (100, 100)–(140, 140).
  const ox = opts.origin?.x ?? 0, oy = opts.origin?.y ?? 0;
  writeFileSync(shot, encodePng(image((400 + ox) * scale, 300 * scale, (x, y) =>
    x >= (100 + ox) * scale && x < (140 + ox) * scale && y >= (100 + oy) * scale && y < (140 + oy) * scale)));
  const check = makeCheck({
    issues,
    screenshots: [{ mode: 'pseudo-long', viewport: { width: 1280, height: 800 }, path: shot, size: { width: 400 + ox, height: 300 }, ...(opts.origin ? { origin: opts.origin } : {}) }],
  });
  return { check, out: (name: string) => join(dir, name) };
}

const box = { x: 100, y: 100, width: 40, height: 40 };

test('a crop is the box and 24 px around it, clamped to the document', () => {
  const { check, out } = setup([makeIssue({ box }), makeIssue({ box: { x: 380, y: 10, width: 100, height: 10 } })]);
  cropIssues(check, out);
  const [inside, edge] = check.issues.map(i => decodePng(readFileSync(i.crop!))!);
  expect([inside.width, inside.height]).toEqual([88, 88]);
  expect([edge.width, edge.height]).toEqual([400 - 356, 10 + 10 + 24]);
  // The red square starts 24 px in.
  const at = (x: number, y: number) => [...inside.data.subarray((y * 88 + x) * 4, (y * 88 + x) * 4 + 3)];
  expect(at(23, 30)).toEqual([255, 255, 255]);
  expect(at(24, 30)).toEqual([255, 0, 0]);
});

test('crops follow the device pixel ratio and the screenshot origin', () => {
  for (const opts of [{ scale: 2 }, { origin: { x: 60, y: 0 } }]) {
    const { check, out } = setup([makeIssue({ box })], opts);
    cropIssues(check, out);
    const crop = decodePng(readFileSync(check.issues[0].crop!))!;
    const s = opts.scale ?? 1;
    expect([crop.width, crop.height], JSON.stringify(opts)).toEqual([88 * s, 88 * s]);
    const at = (x: number, y: number) => [...crop.data.subarray((y * crop.width + x) * 4, (y * crop.width + x) * 4 + 3)];
    expect(at(30 * s, 30 * s), JSON.stringify(opts)).toEqual([255, 0, 0]);
  }
});

test('new issues get crops before accepted ones, errors before warnings', () => {
  const accepted = Array.from({ length: 25 }, () => makeIssue({ box, baselined: true, fails: false }));
  const warning = makeIssue({ box, severity: 'warning', fails: false });
  const failing = makeIssue({ box, fails: true });
  const { check, out } = setup([...accepted, warning, failing]);
  cropIssues(check, out);
  expect(check.issues.filter(i => i.crop)).toHaveLength(CROPS_PER_CHECK);
  expect(failing.crop).toBeTruthy();
  expect(warning.crop).toBeTruthy();
  expect(accepted.filter(i => i.crop)).toHaveLength(CROPS_PER_CHECK - 2);
});

test('page-level issues and issues without a screenshot get no crop', () => {
  const page = makeIssue({ rule: 'locale/persistence', key: 'html', selector: 'html', box: { x: 0, y: 0, width: 400, height: 300 } });
  const unshot = makeIssue({ box, mode: 'pseudo-rtl' });
  const { check, out } = setup([page, unshot]);
  cropIssues(check, out);
  expect(page).not.toHaveProperty('crop');
  expect(unshot).not.toHaveProperty('crop');
});
