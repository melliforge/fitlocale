import { readFileSync } from 'node:fs';
import { test, expect, byLocalStorage } from '../../src/playwright';
import type { CheckResult } from '../../src/types';

const list = (r: CheckResult) => r.issues.map(i => `${i.rule} ${i.selector}`).sort();

test.use({
  fitlocale: {
    viewports: 'current',
    failOn: 'never',
    setLocale: byLocalStorage('lang'),
    sourceMessages: 'demo/locales/en.json',
    localeMessages: 'demo/locales/{locale}.json',
  },
});

test('home page: finds every planted bug, no false alarms', async ({ page, localeCheck }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  const result = await localeCheck();
  expect(list(result)).toEqual([
    'leak/bad-value #price',
    'leak/placeholder #inbox-count',
    'leak/raw-key #welcome',
    'overflow/clipped #save-btn',
    'overflow/escapes-box #tab-billing',
    'overflow/overlap #btn-delete',
    'rtl/canvas #sales-chart',
    'rtl/icon-mirrored #play-icon',
    'rtl/icon-not-mirrored #next-chevron',
    'rtl/not-mirrored #promo-badge',
  ]);
  // The fix points at the stylesheet line that keeps the badge on the left.
  const line = readFileSync('demo/styles.css', 'utf8').split('\n').findIndex(l => l.startsWith('.promo {')) + 1;
  const badge = result.issues.find(i => i.rule === 'rtl/not-mirrored' && i.selector === '#promo-badge')!;
  expect(badge.source).toMatchObject({ property: 'left', value: '16px', replacement: 'inset-inline-start: 16px', line });
  expect(badge.source!.url).toMatch(/\/styles\.css$/);
  expect(badge.fix).toMatch(/^In http:\/\/localhost:4310\/styles\.css:\d+ \(\.promo\), replace "left: 16px" with "inset-inline-start: 16px"\.$/);
});

test('locale reset across navigation is caught', async ({ page, localeCheck, useLocale }) => {
  await page.goto('/');
  await useLocale('de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.click('#to-page2');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  const result = await localeCheck();
  expect(list(result)).toEqual(['locale/persistence html']);
});

test('pseudo locale en-XA: hardcoded and concatenated text, real overflow', async ({ page, localeCheck, useLocale }) => {
  await page.goto('/');
  await useLocale('en-XA');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  const result = await localeCheck();
  expect(list(result)).toEqual([
    'i18n/concatenated #cart-summary',
    'i18n/hardcoded #shipping-note',
    'leak/bad-value #price',
    'leak/placeholder #inbox-count',
    'leak/raw-key #welcome',
    'overflow/clipped #save-btn',
    'overflow/escapes-box #tab-billing',
    'overflow/overlap #btn-delete',
    'rtl/canvas #sales-chart',
    'rtl/icon-mirrored #play-icon',
    'rtl/icon-not-mirrored #next-chevron',
    'rtl/not-mirrored #promo-badge',
  ]);
});

test('German: text left in English, and text that no longer fits', async ({ page, localeCheck, useLocale }) => {
  await page.goto('/');
  await useLocale('de');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  const result = await localeCheck();
  expect(list(result)).toEqual([
    'i18n/untranslated #help-line',
    'leak/bad-value #price',
    'leak/placeholder #inbox-count',
    'leak/raw-key #welcome',
    'overflow/clipped #save-btn',
  ]);
});

test('Arabic: mixed-direction text drawn in the wrong order, and the chart', async ({ page, localeCheck, useLocale }) => {
  await page.goto('/');
  await useLocale('ar');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const result = await localeCheck();
  expect(list(result)).toEqual([
    'leak/bad-value #price',
    'leak/placeholder #inbox-count',
    'leak/raw-key #welcome',
    'rtl/bidi-order #course-title',
    'rtl/bidi-order #inbox-count',
    'rtl/bidi-order #price-ar',
    'rtl/canvas #sales-chart',
    'rtl/clipped-marks #ar-tab',
  ]);
});

test.describe('failing on errors', () => {
  test.use({ fitlocale: { viewports: 'current', failOn: 'error', baseline: false } });

  test('failing build on errors', async ({ page, localeCheck }) => {
    test.fail();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
    await localeCheck();
  });
});

test('check stays within time budget', async ({ page, localeCheck }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  const t0 = Date.now();
  await localeCheck();
  expect(Date.now() - t0).toBeLessThan(10_000);
});
