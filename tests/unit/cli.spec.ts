import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { main } from '../../src/cli';
import { readFitMap } from '../../src/fit/map';
import { makeCheck, makeIssue, makeRun } from './fixtures';

function capture() {
  const out = { stdout: '', stderr: '' };
  return { out, io: { stdout: (s: string) => { out.stdout += s; }, stderr: (s: string) => { out.stderr += s; } } };
}

const tmp = () => mkdtempSync(join(tmpdir(), 'fitlocale-cli-'));

test('pseudo writes transformed JSON', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'en.json'), '{"a":"Settings"}');
  const { io } = capture();
  expect(await main(['pseudo', join(dir, 'en.json'), '--out', join(dir, 'xa.json')], io)).toBe(0);
  expect(JSON.parse(readFileSync(join(dir, 'xa.json'), 'utf8'))).toEqual({ a: '⟦Šéttîñgš ~~~⟧' });
});

test('pseudo honours --expansion', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'en.json'), '{"a":"Settings"}');
  const { out, io } = capture();
  expect(await main(['pseudo', join(dir, 'en.json'), '--expansion', '1'], io)).toBe(0);
  expect(JSON.parse(out.stdout)).toEqual({ a: '⟦Šéttîñgš ~~~~~~~⟧' });
});

test('report re-renders index.html', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'results.json'), JSON.stringify(makeRun([makeCheck()])));
  const { io } = capture();
  expect(await main(['report', join(dir, 'results.json')], io)).toBe(0);
  expect(readFileSync(join(dir, 'index.html'), 'utf8').startsWith('<!doctype html>')).toBe(true);
});

test('unknown command', async () => {
  const { out, io } = capture();
  expect(await main(['frobnicate'], io)).toBe(1);
  expect(out.stderr).toContain('Unknown command');
  expect(out.stderr).toContain('Usage');
});

test('missing file', async () => {
  const { out, io } = capture();
  expect(await main(['pseudo', join(tmp(), 'nope.json')], io)).toBe(1);
  expect(out.stderr).toContain('Cannot read');
});

test('report --out copies screenshots next to the new index.html, creating the directory', async () => {
  const dir = tmp();
  mkdirSync(join(dir, 'screenshots'));
  writeFileSync(join(dir, 'screenshots', 'a.png'), 'png');
  writeFileSync(join(dir, 'results.json'), JSON.stringify(makeRun([makeCheck()])));
  const out = join(dir, 'elsewhere', 'nested');
  const { io } = capture();
  expect(await main(['report', join(dir, 'results.json'), '--out', out], io)).toBe(0);
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  const src = /<img src="([^"]+)"/.exec(html)![1];
  expect(existsSync(join(out, src))).toBe(true);
});

test('pseudo --out creates missing directories', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'en.json'), '{"a":"Settings"}');
  const { io } = capture();
  expect(await main(['pseudo', join(dir, 'en.json'), '--out', join(dir, 'locales', 'xa', 'xa.json')], io)).toBe(0);
  expect(existsSync(join(dir, 'locales', 'xa', 'xa.json'))).toBe(true);
});

test('a JSON array is rejected', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'en.json'), '["Settings"]');
  for (const command of ['pseudo', 'report']) {
    const { out, io } = capture();
    expect(await main([command, join(dir, 'en.json')], io)).toBe(1);
    expect(out.stderr).toContain('must contain a JSON object');
  }
});

test('extra positional arguments are rejected', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'en.json'), '{"a":"Settings"}');
  const { out, io } = capture();
  expect(await main(['pseudo', join(dir, 'en.json'), join(dir, 'de.json')], io)).toBe(1);
  expect(out.stderr).toContain('Unexpected argument');
});

test('report --out points at screenshots that live outside the results directory', async () => {
  const dir = tmp();
  mkdirSync(join(dir, 'shots'));
  mkdirSync(join(dir, 'results'));
  writeFileSync(join(dir, 'shots', 'a.png'), 'png');
  const check = makeCheck();
  check.screenshots[0].path = '../shots/a.png';
  writeFileSync(join(dir, 'results', 'results.json'), JSON.stringify(makeRun([check])));
  const out = join(dir, 'out', 'report');
  const { io } = capture();
  expect(await main(['report', join(dir, 'results', 'results.json'), '--out', out], io)).toBe(0);
  const src = /<img src="([^"]+)"/.exec(readFileSync(join(out, 'index.html'), 'utf8'))![1];
  expect(src).toBe('../../shots/a.png');
  expect(existsSync(join(out, src))).toBe(true);
});

test.describe('baseline and summary', () => {
  const results = (dir: string, name: string, ids: string[]) => {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(makeRun([makeCheck({ issues: ids.map(id => makeIssue({ id, selector: `#${id}` })) })])));
    return path;
  };

  test('baseline merges several results files', async () => {
    const dir = tmp();
    const out = join(dir, 'fitlocale-baseline.json');
    const { out: o, io } = capture();
    expect(await main(['baseline', results(dir, 'a.json', ['b1']), results(dir, 'b.json', ['a1', 'b1']), '--out', out], io)).toBe(0);
    expect(JSON.parse(readFileSync(out, 'utf8')).issues.map((e: { id: string }) => e.id)).toEqual(['a1', 'b1']);
    expect(o.stdout).toContain('wrote 2 accepted issue(s)');
  });

  test('baseline refuses results without issue ids', async () => {
    const dir = tmp();
    const path = join(dir, 'r.json');
    writeFileSync(path, JSON.stringify(makeRun([makeCheck()])));
    const { out, io } = capture();
    expect(await main(['baseline', path, '--out', join(dir, 'b.json')], io)).toBe(1);
    expect(out.stderr).toMatch(/without an id/);
  });

  test('summary prints Markdown', async () => {
    const dir = tmp();
    const { out, io } = capture();
    expect(await main(['summary', results(dir, 'r.json', ['a1'])], io)).toBe(0);
    expect(out.stdout.startsWith('## fitlocale')).toBe(true);
  });

  test('summary checks --max-rows', async () => {
    const dir = tmp();
    const { out, io } = capture();
    expect(await main(['summary', results(dir, 'r.json', ['a1']), '--max-rows', '0'], io)).toBe(1);
    expect(out.stderr).toContain('--max-rows must be a whole number ≥ 1');
  });
});

test('fitmap writes a merged map and says how many keys', async () => {
  const dir = tmp();
  const obs = { key: 'buttons.save', text: 'Save', slots: {}, lines: 1, oneLine: true, wrapWidth: 100, roomX: 100, roomY: null, maxLines: null, measured: true, s: 0, lang: 'en', dir: 'ltr', selector: '#s' };
  const fit = (key: string) => [{ viewport: { width: 1280, height: 800 }, styles: [{ fontSize: '14px' }], entries: [{ ...obs, key }], fonts: [] }];
  writeFileSync(join(dir, 'a.json'), JSON.stringify(makeRun([makeCheck({ fit: fit('buttons.save') })])));
  writeFileSync(join(dir, 'b.json'), JSON.stringify(makeRun([makeCheck({ fit: fit('buttons.load') })])));
  const out = join(dir, 'fit', 'fitlocale-fit.json');
  const { out: o, io } = capture();
  expect(await main(['fitmap', join(dir, 'a.json'), join(dir, 'b.json'), '--out', out], io)).toBe(0);
  expect(o.stdout).toBe(`fitlocale: wrote the fit of 2 key(s) to ${out}\n`);
  const map = readFitMap(out);
  expect(Object.keys(map.keys)).toEqual(['buttons.load', 'buttons.save']);
  expect(map.sourceLocale).toBe('en');
});

test('fitmap without fit records says how to turn them on', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'a.json'), JSON.stringify(makeRun([makeCheck()])));
  const { out, io } = capture();
  expect(await main(['fitmap', join(dir, 'a.json'), '--out', join(dir, 'x.json')], io)).toBe(2);
  expect(out.stderr).toContain('fitMap: true');
  expect(out.stderr).toContain('sourceMessages');
  expect(existsSync(join(dir, 'x.json'))).toBe(false);
});

test.describe('baseline --prune', () => {
  const entry = (id: string, check: string) => ({ id, rule: 'overflow/clipped', test: 't', selector: `#${id}`, mode: 'pseudo-long', locale: 'en', viewport: '1280x720', check });
  /** A baseline with a (check c1) and b (check c2); results where a no longer occurs and a new issue n appeared. */
  function setupPrune() {
    const dir = tmp();
    const base = join(dir, 'fitlocale-baseline.json');
    writeFileSync(base, JSON.stringify({ version: 1, note: 'n', issues: [entry('a', 'c1'), entry('b', 'c2')] }, null, 2) + '\n');
    const check = makeCheck({ scope: 'c1', issues: [makeIssue({ id: 'n', selector: '#new' })], baseline: { status: 'applied', path: base, fixed: [{ ...entry('a', 'c1'), rule: 'overflow/clipped', mode: 'pseudo-long' }] } });
    writeFileSync(join(dir, 'results.json'), JSON.stringify(makeRun([check])));
    return { dir, base };
  }

  test('removes, reports counts, and never adds a new issue', async () => {
    const { dir, base } = setupPrune();
    const { out, io } = capture();
    expect(await main(['baseline', '--prune', join(dir, 'results.json'), '--out', base], io)).toBe(0);
    expect(out.stdout).toBe(`fitlocale: removed 1 fixed issue(s) from ${base}; 1 remain\n`);
    const ids = JSON.parse(readFileSync(base, 'utf8')).issues.map((e: { id: string }) => e.id);
    expect(ids).toEqual(['b']);
  });

  test('with given shards it keeps entries of checks not in them', async () => {
    // b belongs to check c2, which ran in another shard (not given): it stays.
    const { dir, base } = setupPrune();
    const { io } = capture();
    await main(['baseline', '--prune', join(dir, 'results.json'), '--out', base], io);
    expect(JSON.parse(readFileSync(base, 'utf8')).issues.map((e: { id: string }) => e.id)).toContain('b');
  });

  test('without a baseline file it fails naming it', async () => {
    const { dir } = setupPrune();
    const missing = join(dir, 'nope.json');
    const { out, io } = capture();
    expect(await main(['baseline', '--prune', join(dir, 'results.json'), '--out', missing], io)).toBe(1);
    expect(out.stderr).toContain(missing);
  });
});

test.describe('baseline --prune upgrades older files', () => {
  const legacy = (id: string) => ({ id, rule: 'overflow/clipped', test: 't', selector: `#${id}`, mode: 'pseudo-long', locale: 'en', viewport: '1280x720' });

  test('without results it says what it needs', async () => {
    const { out, io } = capture();
    expect(await main(['baseline', '--prune'], io)).toBe(1);
    expect(out.stderr).toContain('baseline --prune needs the results.json of the run');
  });

  test('it records the check of older entries it finds, and accepts nothing', async () => {
    const dir = tmp();
    const base = join(dir, 'b.json');
    writeFileSync(base, JSON.stringify({ version: 1, note: 'n', issues: [legacy('a'), legacy('b')] }, null, 2) + '\n');
    const check = makeCheck({ scope: 'c1', issues: [makeIssue({ id: 'a' }), makeIssue({ id: 'new', selector: '#new' })], baseline: { status: 'applied', path: base, fixed: [], legacy: true } });
    writeFileSync(join(dir, 'results.json'), JSON.stringify(makeRun([check])));
    const { out, io } = capture();
    expect(await main(['baseline', '--prune', join(dir, 'results.json'), '--out', base], io)).toBe(0);
    expect(out.stdout).toBe(`fitlocale: removed 0 fixed issue(s) from ${base}; 2 remain; recorded the check of 1 older entry(ies); 1 still without one (fixed, or its test did not run)\n`);
    const issues = JSON.parse(readFileSync(base, 'utf8')).issues as Array<{ id: string; check?: string }>;
    expect(issues.map(e => [e.id, e.check])).toEqual([['a', 'c1'], ['b', undefined]]);
  });
});
