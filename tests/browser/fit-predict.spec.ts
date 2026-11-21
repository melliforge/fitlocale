import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, test, expect, type Page } from '@playwright/test';
import { buildFitMap, type FitMap } from '../../src/fit/map';
import { predictFit } from '../../src/fit/predict';
import type { FitRecord } from '../../src/types';
import { load } from './helpers';

const INTER = 'node_modules/vitepress/dist/client/theme-default/fonts/inter-roman-latin.woff2';
const html = (body: string, head = '') => `<!doctype html><meta charset=utf-8><style>body{margin:0;font:16px/20px sans-serif}</style>${head}<body>${body}`;

/** Record `body` at each width with the real recorder, and build the map from it. */
async function mapOf(page: Page, body: string, messages: Record<string, string>, widths = [1280], head = ''): Promise<FitMap> {
  const fit: FitRecord[] = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await load(page, html(body, head));
    const rec = await page.evaluate(m => window.__fitlocale.recordFit(m, []), Object.entries(messages).map(([key, text]) => ({ key, text })));
    fit.push({ viewport: { width, height: 800 }, styles: rec.styles, entries: rec.entries, fonts: rec.fonts });
  }
  return buildFitMap([{ version: 1, createdAt: '', summary: { error: 0, warning: 0, info: 0 }, checks: [{ testTitle: 't', testFile: 'f', checkIndex: 0, url: '', issues: [], screenshots: [], fit }] }], 'en');
}
const predict = (map: FitMap, translations: Record<string, string>, o: { fontsDir?: string | null; keys?: string[] } = {}) =>
  predictFit({ map, messages: new Map(Object.entries(translations)), keys: o.keys ?? Object.keys(translations), locale: 'de', fontsDir: o.fontsDir ?? null, chromium });

const BUTTON = `<button id=b style="width:120px;padding:0 10px;border:0;white-space:nowrap;overflow:hidden">Save</button>`;

test('a German label too wide for its fixed button overflows, with need and room', async ({ page }) => {
  const map = await mapOf(page, BUTTON, { save: 'Save' });
  const { verdicts } = await predict(map, { save: 'Speichern unter einem neuen Namen' });
  expect(verdicts).toHaveLength(1);
  const [v] = verdicts;
  expect(v).toMatchObject({ key: 'save', verdict: 'overflows', axis: 'x', vp: '1280×800', selector: '#b' });
  expect(v.need!).toBeGreaterThan(v.room!);
});

test('a short translation fits; a longer paragraph grows', async ({ page }) => {
  const map = await mapOf(page, `${BUTTON}<p id=p style="width:200px">Short text</p>`, { save: 'Save', text: 'Short text' });
  const { verdicts } = await predict(map, { save: 'Los', text: 'Ein deutlich längerer Text, der über mehrere Zeilen umbricht' });
  expect(Object.fromEntries(verdicts.map(v => [v.key, v.verdict]))).toEqual({ save: 'fits', text: 'grows' });
});

test('a key whose source already overflows is already, not overflows', async ({ page }) => {
  const map = await mapOf(page, `<div id=d style="width:60px;overflow:hidden;white-space:nowrap">Account settings</div>`, { title: 'Account settings' });
  const { verdicts } = await predict(map, { title: 'Kontoeinstellungen' });
  expect(verdicts[0].verdict).toBe('already');
});

test('the tightest of several rooms decides, with its viewport', async ({ page }) => {
  const body = `<div id=m style="width:min(300px, 30vw);overflow:hidden;white-space:nowrap"><span id=s>Export</span></div>`;
  const map = await mapOf(page, body, { exp: 'Export' }, [1280, 390]);
  expect(map.keys.exp).toHaveLength(2);
  const { verdicts } = await predict(map, { exp: 'Exportieren als Bild' });
  expect(verdicts[0]).toMatchObject({ verdict: 'overflows', vp: '390×800' });
});

test('a key not in the map is not-checked', async ({ page }) => {
  const map = await mapOf(page, BUTTON, { save: 'Save' });
  const { verdicts } = await predict(map, { save: 'Los', other: 'Andere' });
  expect(verdicts.find(v => v.key === 'other')).toMatchObject({ verdict: 'not-checked', text: 'Andere' });
});

test('fonts: found in fontsDir by path, then by file name; missing ones are warned and marked', async ({ page }) => {
  await page.route('http://fit.test/**', r => r.request().url().endsWith('.woff2')
    ? r.fulfill({ contentType: 'font/woff2', body: readFileSync(INTER) })
    : r.fulfill({ contentType: 'text/html', body: '<!doctype html>' }));
  await page.goto('http://fit.test/');
  const head = `<style>@font-face{font-family:InterTest;src:url(/static/f/X.woff2)}</style>`;
  const button = `<button id=b style="font-family:InterTest;width:120px;padding:0 10px;border:0;white-space:nowrap;overflow:hidden">Save</button>`;
  const map = await mapOf(page, button, { save: 'Save' }, [1280], head);
  expect(map.fonts.map(f => f.family)).toEqual(['InterTest']);

  const byPath = mkdtempSync(join(tmpdir(), 'fitlocale-fonts-'));
  mkdirSync(join(byPath, 'static', 'f'), { recursive: true });
  copyFileSync(INTER, join(byPath, 'static', 'f', 'X.woff2'));
  const one = await predict(map, { save: 'Speichern' }, { fontsDir: byPath });
  expect(one.fontWarnings).toEqual([]);
  expect(one.verdicts[0].fontMissing).toBeUndefined();

  const byName = mkdtempSync(join(tmpdir(), 'fitlocale-fonts-'));
  mkdirSync(join(byName, 'assets', 'nested'), { recursive: true });
  copyFileSync(INTER, join(byName, 'assets', 'nested', 'X.woff2'));
  expect((await predict(map, { save: 'Speichern' }, { fontsDir: byName })).fontWarnings).toEqual([]);

  const empty = mkdtempSync(join(tmpdir(), 'fitlocale-fonts-'));
  const none = await predict(map, { save: 'Speichern' }, { fontsDir: empty });
  expect(none.fontWarnings).toHaveLength(1);
  expect(none.fontWarnings[0]).toContain('InterTest');
  expect(none.verdicts[0].fontMissing).toBe(true);
});

test('markup in a translation is text, not HTML', async ({ page }) => {
  const map = await mapOf(page, `<p id=p style="width:40px;white-space:nowrap;overflow:hidden">Save</p>`, { save: 'Save' });
  const word = (await predict(map, { save: 'Speichern' })).verdicts[0];
  const marked = (await predict(map, { save: '<b>Speichern</b>' })).verdicts[0];
  expect([word.verdict, marked.verdict]).toEqual(['overflows', 'overflows']);
  // Measured as the 16 characters it is, not as the word inside a <b> element.
  expect(marked.need!).toBeGreaterThan(word.need! + 20);
  expect(marked.text).toBe('<b>Speichern</b>');
});

// Review fixes (final review, 2026-11-21).
test('an entry that was not measured is not-checked, never fits', async ({ page }) => {
  const map = await mapOf(page, `<p id=p style="width:100px;white-space:nowrap;overflow:hidden">Save <b>now</b></p>`, { now: 'Save now' });
  expect(map.keys.now[0].nm).toBe(true);
  const { verdicts } = await predict(map, { now: 'Jetzt speichern, bitte sofort und ganz schnell' });
  expect(verdicts[0].verdict).toBe('not-checked');
});

test('a font the measuring page does not have is warned and marked, even with no recorded URL', async ({ page }) => {
  // A Google Fonts <link> without crossorigin hides its @font-face rules from the recorder: only the family name is known.
  const map = await mapOf(page, `<button id=b style="font-family:'NoSuchFamilyXyz', sans-serif;width:120px;padding:0;border:0;white-space:nowrap;overflow:hidden">Save</button>`, { save: 'Save' });
  expect(map.fonts).toEqual([]);
  const { verdicts, fontWarnings } = await predict(map, { save: 'Speichern' });
  expect(fontWarnings).toHaveLength(1);
  expect(fontWarnings[0]).toContain('NoSuchFamilyXyz');
  expect(verdicts[0].fontMissing).toBe(true);
  // Generic and installed system families are not warned about.
  const generic = await mapOf(page, `<button id=b style="font-family:sans-serif;width:120px">Save</button>`, { save: 'Save' });
  expect((await predict(generic, { save: 'Speichern' })).fontWarnings).toEqual([]);
});
