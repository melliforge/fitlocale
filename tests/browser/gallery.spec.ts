import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect } from '../../src/playwright';
import { decodePng } from '../../src/png';

const setLang = async (page: Page, locale: string) => { await page.evaluate(l => { document.documentElement.lang = l; }, locale); };
const CLEAN = `<!doctype html><meta charset=utf-8><html lang=en><body style="margin:0;font:16px/20px sans-serif"><p id=p style="width:400px">Hello there</p>`;
const VIEWPORTS = [{ width: 1280, height: 800 }, { width: 390, height: 844 }];
const kinds = (shots: Array<{ mode: string; viewport: { width: number }; locale?: string }>) =>
  shots.map(s => `${s.mode}@${s.viewport.width}:${s.locale}`).sort();

test.describe('with gallery', () => {
  test.use({ fitlocale: { viewports: VIEWPORTS, gallery: true, failOn: 'never', baseline: false, setLocale: setLang } });

  test('gallery: true screenshots every mode at every viewport on a clean page', async ({ page, localeCheck }) => {
    await page.setContent(CLEAN);
    const result = await localeCheck();
    expect(result.issues).toEqual([]);
    expect(kinds(result.screenshots)).toEqual([
      'pseudo-long@1280:en', 'pseudo-long@390:en', 'pseudo-rtl@1280:en', 'pseudo-rtl@390:en', 'source@1280:en', 'source@390:en',
    ]);
    expect(result.gallery).toBe(true);
  });

  test('a real locale page is shot in its locale', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(CLEAN.replace('Hello there', 'Hallo zusammen'));
    await useLocale('de');
    expect(kinds((await localeCheck()).screenshots)).toEqual(['source@1280:de', 'source@390:de']);
  });

  test('a pseudo locale page is shot with its locale', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(CLEAN.replace('Hello there', '⟦Hélló théré ~~~⟧'));
    await useLocale('en-XA');
    // A pseudo-locale page also gets the pseudo-rtl mode: its shots carry the page's locale too.
    expect(kinds((await localeCheck()).screenshots)).toEqual(['pseudo-rtl@1280:en-XA', 'pseudo-rtl@390:en-XA', 'source@1280:en-XA', 'source@390:en-XA']);
  });
});

test.describe('without gallery', () => {
  test.use({ fitlocale: { viewports: VIEWPORTS, failOn: 'never', baseline: false } });

  test('off by default: a clean page gets no screenshots and no gallery flag', async ({ page, localeCheck }) => {
    await page.setContent(CLEAN);
    const result = await localeCheck();
    expect(result.screenshots).toEqual([]);
    expect(result.gallery).toBeUndefined();
  });

  test('screenshots of issues record their locale too', async ({ page, localeCheck }) => {
    await page.setContent(`${CLEAN}<button id=s style="width:120px;overflow:hidden;white-space:nowrap">Save changes</button>`);
    const shots = (await localeCheck()).screenshots;
    expect(shots.length).toBeGreaterThan(0);
    for (const s of shots) expect(s.locale).toBe('en');
  });
});

test.describe('screenshots off', () => {
  test.use({ fitlocale: { viewports: VIEWPORTS, gallery: true, screenshots: false, failOn: 'never', baseline: false } });
  test('screenshots: false wins over gallery', async ({ page, localeCheck }) => {
    await page.setContent(CLEAN);
    const result = await localeCheck();
    expect(result.screenshots).toEqual([]);
    expect(result.gallery).toBeUndefined();
  });
});

test.describe('mask', () => {
  test.use({ fitlocale: { viewports: [{ width: 1280, height: 800 }], gallery: true, mask: ['#secret'], failOn: 'never', baseline: false } });
  test('mask covers gallery screenshots', async ({ page, localeCheck }) => {
    await page.setContent(`${CLEAN}<div id=secret style="position:absolute;left:100px;top:100px;width:80px;height:80px;background:#f00"></div>`);
    const source = (await localeCheck()).screenshots.find(s => s.mode === 'source')!;
    const img = decodePng(readFileSync(source.path))!;
    const at = (x: number, y: number) => { const i = (y * img.width + x) * img.channels; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
    const [r, g, b] = at(140, 140);
    expect(r > 200 && g < 60 && b < 60).toBe(false);
  });
});

// Review fix: gallery shots are taken before the pseudo modes on every page; the issues found must not change.
const ISSUE_PAGE = `${CLEAN}<button id=s style="width:120px;overflow:hidden;white-space:nowrap">Save changes</button>`;
const issueList = async (localeCheck: () => Promise<{ issues: Array<{ rule: string; selector: string; mode: string; viewport: { width: number } }> }>) =>
  (await localeCheck()).issues.map(i => `${i.rule} ${i.selector} ${i.mode} ${i.viewport.width}`).sort();
const EXPECTED = ['overflow/clipped #s pseudo-long 1280', 'overflow/clipped #s pseudo-long 390'];
test.describe('issues with gallery on', () => {
  test.use({ fitlocale: { viewports: VIEWPORTS, gallery: true, failOn: 'never', baseline: false } });
  test('gallery does not change the issues found (on)', async ({ page, localeCheck }) => {
    await page.setContent(ISSUE_PAGE);
    expect(await issueList(localeCheck)).toEqual(EXPECTED);
  });
});
test.describe('issues with gallery off', () => {
  test.use({ fitlocale: { viewports: VIEWPORTS, failOn: 'never', baseline: false } });
  test('gallery does not change the issues found (off)', async ({ page, localeCheck }) => {
    await page.setContent(ISSUE_PAGE);
    expect(await issueList(localeCheck)).toEqual(EXPECTED);
  });
});
