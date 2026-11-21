import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { changedKeys } from '../../src/fit/changed';
import { formatFitMap, type FitMap } from '../../src/fit/map';
import type { FitVerdict, PredictOptions } from '../../src/fit/predict';
import { runFit, type FitDeps } from '../../src/fit/run';

const tmp = () => mkdtempSync(join(tmpdir(), 'fitlocale-fit-'));
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'pipe' }).toString();

test('changedKeys: changed and new keys only; a file new at ref makes all keys changed', () => {
  const dir = tmp();
  git(dir, 'init', '-q');
  writeFileSync(join(dir, 'de.json'), JSON.stringify({ a: 'Eins', b: { c: 'Zwei' } }));
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'one');
  writeFileSync(join(dir, 'de.json'), JSON.stringify({ a: 'Eins', b: { c: 'Zwei!' }, d: 'Neu' }));
  writeFileSync(join(dir, 'fr.json'), JSON.stringify({ a: 'Un' }));
  expect(changedKeys(join(dir, 'de.json'), 'HEAD', dir)).toEqual(['b.c', 'd']);
  expect(changedKeys(join(dir, 'fr.json'), 'HEAD', dir)).toEqual(['a']);
  expect(() => changedKeys(join(dir, 'de.json'), 'no-such-ref', dir)).toThrow(/git show no-such-ref:/);
});

const MAP: FitMap = { version: 1, note: '', sourceLocale: 'en', styles: [{}], fonts: [], keys: { save: [{ text: 'Save', lines: 1, one: true, wrap: 100, rx: 100, s: 0, vp: '1280×800', sel: '#save' }] } };

/** A project folder with a map and one German file; `predict` answers with `verdicts`. */
function setup(messages: Record<string, string>, verdicts: (o: PredictOptions) => FitVerdict[], fontWarnings: string[] = []) {
  const dir = tmp();
  writeFileSync(join(dir, 'fitlocale-fit.json'), formatFitMap(MAP));
  writeFileSync(join(dir, 'de.json'), JSON.stringify(messages));
  const calls: PredictOptions[] = [];
  const deps: FitDeps = {
    cwd: dir, env: {},
    loadChromium: async () => ({ launch: async () => { throw new Error('not in unit tests'); } }),
    predict: async o => { calls.push(o); return { verdicts: verdicts(o), fontWarnings }; },
  };
  const out = { stdout: '', stderr: '' };
  const io = { stdout: (s: string) => { out.stdout += s; }, stderr: (s: string) => { out.stderr += s; } };
  return { dir, deps, io, out, calls };
}
const over = (key: string, text: string): FitVerdict => ({ key, verdict: 'overflows', vp: '1280×800', selector: '#save', need: 148, room: 100, axis: 'x', text });

test('fit exits 1 when a changed key overflows, 0 with --report-only, and prints the need', async () => {
  const s = setup({ save: 'Speichern unter' }, () => [over('save', 'Speichern unter')]);
  expect(await runFit({ files: [join(s.dir, 'de.json')] }, s.io, s.deps)).toBe(1);
  expect(s.out.stdout).toContain('save needs 148 px, has 100 px (1280×800, #save)');
  expect(s.calls[0]).toMatchObject({ locale: 'de', keys: ['save'], fontsDir: null });
  const r = setup({ save: 'Speichern unter' }, () => [over('save', 'Speichern unter')]);
  expect(await runFit({ files: [join(r.dir, 'de.json')], reportOnly: true }, r.io, r.deps)).toBe(0);
});

test('a changed key on no tested page is not-checked and listed, never counted as fitting', async () => {
  const s = setup({ save: 'Los', other: 'Andere' }, o => o.keys.map(k => (k === 'save' ? { key: k, verdict: 'fits' as const, text: 'Los' } : { key: k, verdict: 'not-checked' as const, text: 'Andere' })));
  const summary = join(s.dir, 'summary.md');
  s.deps.env.GITHUB_STEP_SUMMARY = summary;
  writeFileSync(summary, '');
  expect(await runFit({ files: [join(s.dir, 'de.json')] }, s.io, s.deps)).toBe(0);
  const md = readFileSync(summary, 'utf8');
  expect(md).toContain('checked 1 of 2 changed keys');
  expect(md).toContain('other');
  expect(md).not.toMatch(/2 (keys )?fit/);
});

test('the summary is inert', async () => {
  const evil = '@team <img src=x> https://evil.test';
  const s = setup({ save: evil }, () => [over('save', evil)]);
  const summary = join(s.dir, 'summary.md');
  s.deps.env.GITHUB_STEP_SUMMARY = summary;
  writeFileSync(summary, '');
  await runFit({ files: [join(s.dir, 'de.json')], reportOnly: true }, s.io, s.deps);
  const md = readFileSync(summary, 'utf8');
  expect(md).not.toContain('@team');
  expect(md).not.toContain('<img');
  expect(md).not.toContain('://');
});

test('a missing map, or a map of another version, exits 2 with the reason', async () => {
  const s = setup({ save: 'Los' }, () => []);
  expect(await runFit({ files: [join(s.dir, 'de.json')], map: join(s.dir, 'nope.json') }, s.io, s.deps)).toBe(2);
  expect(s.out.stderr).toContain('nope.json');
  writeFileSync(join(s.dir, 'v2.json'), JSON.stringify({ version: 2, keys: {} }));
  expect(await runFit({ files: [join(s.dir, 'de.json')], map: join(s.dir, 'v2.json') }, s.io, s.deps)).toBe(2);
  expect(s.out.stderr).toContain('version 2');
});

test('without @playwright/test it exits 2 with the install hint', async () => {
  const s = setup({ save: 'Los' }, () => []);
  s.deps.loadChromium = async () => { throw new Error('Cannot find package'); };
  expect(await runFit({ files: [join(s.dir, 'de.json')] }, s.io, s.deps)).toBe(2);
  expect(s.out.stderr).toContain('fitlocale fit needs @playwright/test and its Chromium (npx playwright install chromium)');
});

test('--json writes every verdict; --locale overrides the file name', async () => {
  const s = setup({ save: 'Los' }, () => [{ key: 'save', verdict: 'fits', text: 'Los' }]);
  writeFileSync(join(s.dir, 'messages.json'), JSON.stringify({ save: 'Los' }));
  const json = join(s.dir, 'out', 'fit.json');
  expect(await runFit({ files: [join(s.dir, 'messages.json')], locale: 'de-CH', json }, s.io, s.deps)).toBe(0);
  const data = JSON.parse(readFileSync(json, 'utf8'));
  expect(data).toMatchObject({ version: 1, files: [{ locale: 'de-CH', verdicts: [{ key: 'save', verdict: 'fits' }], fontWarnings: [] }] });
  expect(s.calls[0].locale).toBe('de-CH');
});

test('font warnings are printed and summed up', async () => {
  const s = setup({ save: 'Los' }, () => [{ key: 'save', verdict: 'fits', text: 'Los', fontMissing: true }], ['font "Inter" (400 normal) from http://app/x.woff2 was not found']);
  await runFit({ files: [join(s.dir, 'de.json')] }, s.io, s.deps);
  expect(s.out.stderr).toContain('font "Inter"');
  expect(s.out.stdout).toContain('1 key(s) were judged without their font: results may be wrong');
});

// Review fixes (final review, 2026-11-21): 1 means "won't fit", so every setup problem must be 2.
test('a browser that is not installed exits 2 with the install hint, not 1', async () => {
  const s = setup({ save: 'Los' }, () => { throw new Error("browserType.launch: Executable doesn't exist at /ms-playwright/chromium/chrome"); });
  expect(await runFit({ files: [join(s.dir, 'de.json')], reportOnly: true }, s.io, s.deps)).toBe(2);
  expect(s.out.stderr).toContain('npx playwright install chromium');
});

test('any other predictor failure exits 2 with the reason', async () => {
  const s = setup({ save: 'Los' }, () => { throw new Error('page crashed'); });
  expect(await runFit({ files: [join(s.dir, 'de.json')] }, s.io, s.deps)).toBe(2);
  expect(s.out.stderr).toContain('page crashed');
});

test('usage errors of fit and fitmap exit 2', async () => {
  const { main } = await import('../../src/cli');
  const out = { stdout: '', stderr: '' };
  const io = { stdout: (x: string) => { out.stdout += x; }, stderr: (x: string) => { out.stderr += x; } };
  expect(await main(['fit', 'de.json', '--font', 'public'], io)).toBe(2);
  expect(await main(['fit'], io)).toBe(2);
  expect(await main(['fitmap'], io)).toBe(2);
});
