import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { main } from '../../src/cli';
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
