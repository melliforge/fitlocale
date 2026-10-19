import { test, expect, byLocalStorage } from '../../src/playwright';
import type { CheckResult } from '../../src/types';

const list = (r: CheckResult) => r.issues.map(i => `${i.rule} ${i.selector}`).sort();

test.use({
  fitlocale: {
    viewports: 'current',
    failOn: 'never',
    setLocale: byLocalStorage('lang'),
    sourceMessages: 'demo/locales/en.json',
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
    'rtl/not-mirrored #promo-badge',
  ]);
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
    'rtl/not-mirrored #promo-badge',
  ]);
});

test('German: text left in English is found', async ({ page, localeCheck, useLocale }) => {
  await page.goto('/');
  await useLocale('de');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  const result = await localeCheck();
  expect(list(result)).toEqual([
    'i18n/untranslated #help-line',
    'leak/bad-value #price',
    'leak/placeholder #inbox-count',
    'leak/raw-key #welcome',
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
