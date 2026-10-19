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

test.describe('with a locale switcher', () => {
  test.use({ fitlocale: { viewports: 'current', failOn: 'never', setLocale: async () => {} } });

  test('persistence', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(`<html lang="de"><body>${CLIPPED}</body></html>`);
    await useLocale('fr');
    const result = await localeCheck();
    expect(list(result)).toEqual(['locale/persistence html source']);
    expect(result.issues[0].message).toBe('The page language changed back: expected "fr", found "de".');
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
