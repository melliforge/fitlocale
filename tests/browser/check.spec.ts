import { existsSync } from 'node:fs';
import { test, expect } from '../../src/playwright';
import type { CheckResult } from '../../src/types';

const CLIPPED = `<button id=s style="width:120px;overflow:hidden;white-space:nowrap">Save changes</button>`;
const BADGE = `<div id=badge style="position:absolute;left:16px">New</div>`;
const list = (r: CheckResult) => r.issues.map(i => `${i.rule} ${i.selector} ${i.mode}`).sort();

test.use({ fitlocale: { viewports: 'current', failOn: 'never' } });

test('source leaks and pseudo-long overflow', async ({ page, localeCheck }) => {
  await page.setContent(`${CLIPPED}<p id=k>dashboard.welcome.title</p>`);
  const result = await localeCheck();
  expect(list(result)).toEqual(['leak/raw-key #k source', 'overflow/clipped #s pseudo-long']);
  for (const i of result.issues) {
    expect(i.severity).toBe('error');
    expect(i.message.length).toBeGreaterThan(0);
    expect(i.url).toBe('about:blank');
    expect(i.viewport).toEqual({ width: 1280, height: 720 });
  }
});

test('noise rule drops issues already present in source', async ({ page, localeCheck }) => {
  await page.setContent(`<div id=e style="width:80px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">A very long account settings title</div>`);
  const result = await localeCheck();
  expect(result.issues.filter(i => i.rule.startsWith('overflow/'))).toEqual([]);
});

test('pseudo-rtl flags absolute left element', async ({ page, localeCheck }) => {
  await page.setContent(`<body style="margin:0">${BADGE}</body>`);
  const result = await localeCheck();
  expect(list(result)).toEqual(['rtl/not-mirrored #badge pseudo-rtl']);
  expect(await page.evaluate(() => document.documentElement.hasAttribute('dir'))).toBe(false);
  await expect(page.locator('#badge')).toHaveText('New');
});

test('already-RTL page skips mirroring', async ({ page, localeCheck }) => {
  await page.setContent(`<html dir="rtl"><body style="margin:0">${BADGE}</body></html>`);
  const result = await localeCheck();
  expect(list(result)).toEqual(['rtl/skipped-already-rtl html pseudo-rtl']);
  expect(result.issues[0].severity).toBe('info');
});

test.describe('with a locale switcher that updates lang', () => {
  test.use({ fitlocale: { viewports: 'current', failOn: 'never',
    setLocale: async (page, l) => { await page.evaluate(x => { document.documentElement.lang = x; }, l); } } });

  test('persistence', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(`<html lang="de"><body>${CLIPPED}</body></html>`);
    await useLocale('fr');
    await page.evaluate(() => { document.documentElement.lang = 'de'; });
    const result = await localeCheck();
    expect(list(result)).toEqual(['locale/persistence html source']);
    expect(result.issues[0].message).toBe('The page language changed back: expected "fr", found "de".');
  });
});

test.describe('with a locale switcher that never updates lang', () => {
  test.use({ fitlocale: { viewports: 'current', failOn: 'never', setLocale: async () => {} } });

  test('persistence says lang never reflected the locale', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(`<html lang="en"><body><p>Hallo</p></body></html>`);
    await useLocale('de');
    const result = await localeCheck();
    expect(list(result)).toEqual(['locale/persistence html source']);
    expect(result.issues[0].message).toBe(
      'The page\'s lang attribute is "en", not "de", even right after switching locale. Update <html lang> or set the localeProbe option.');
  });
});

test('useLocale without setLocale throws', async ({ useLocale }) => {
  await expect(useLocale('de')).rejects.toThrow('useLocale() needs the setLocale option');
});

test.describe('mobile viewport', () => {
  test.use({ fitlocale: { viewports: [{ width: 390, height: 844 }], failOn: 'never' } });

  test('viewports are applied and restored', async ({ page, localeCheck }) => {
    await page.setContent(CLIPPED);
    const before = page.viewportSize();
    const result = await localeCheck();
    expect(result.issues.length).toBeGreaterThan(0);
    for (const i of result.issues) expect(i.viewport).toEqual({ width: 390, height: 844 });
    expect(page.viewportSize()).toEqual(before);
  });
});

test.describe('failing on errors', () => {
  test.use({ fitlocale: { viewports: 'current', failOn: 'error' } });

  test('failOn error fails the test', async ({ page, localeCheck }) => {
    test.fail();
    await page.setContent(CLIPPED);
    await localeCheck();
  });
});

test('attachments are written', async ({ page, localeCheck }, testInfo) => {
  await page.setContent(CLIPPED);
  await localeCheck();
  expect(testInfo.attachments.filter(a => a.name === 'fitlocale:result')).toHaveLength(1);
  const shots = testInfo.attachments.filter(a => a.name === 'fitlocale:screenshot');
  expect(shots.length).toBeGreaterThan(0);
  expect(existsSync(shots[0].path!)).toBe(true);
});

test('body dir=rtl page skips mirroring with one info issue', async ({ page, localeCheck }) => {
  await page.setContent(`<body dir="rtl" style="margin:0">${BADGE}<p style="width:200px">مرحبا</p><button>زر</button></body>`);
  const result = await localeCheck();
  expect(list(result)).toEqual(['rtl/skipped-already-rtl html pseudo-rtl']);
});

test('app root with dir=rtl is not flagged', async ({ page, localeCheck }) => {
  await page.setContent(`<body style="margin:0"><div id=root dir="rtl" style="position:relative;height:100px">
    <div style="position:absolute;right:16px">شارة</div><p style="width:200px">مرحبا</p><button>زر</button></div></body>`);
  const result = await localeCheck();
  expect(result.issues.filter(i => i.rule === 'rtl/not-mirrored')).toEqual([]);
});

test('config-level fitlocale options merge with test.use overrides', async ({ page, localeCheck }) => {
  // playwright.config.ts sets fitlocale.ignore = ['.config-ignored'] for the browser project.
  await page.setContent(`<p class="config-ignored">You have {count} messages</p>`);
  const result = await localeCheck();
  expect(result.issues).toEqual([]);
});
