import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { main } from '../../src/cli';
import { makeCheck, makeRun } from './fixtures';

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
