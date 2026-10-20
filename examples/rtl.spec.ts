import { expect, test, byLocalStorage } from 'fitlocale/playwright';
import { checksOf } from './helpers';

// #region guide
// How this app switches language: it reads the "lang" item from localStorage.
test.use({ fitlocale: { setLocale: byLocalStorage('lang') } });

test('home page, forced right-to-left', async ({ page, localeCheck }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1'); // your app has rendered
  await localeCheck(); // includes the forced right-to-left check
});

test('home page in Arabic', async ({ page, useLocale, localeCheck }) => {
  await page.goto('/');
  await useLocale('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await localeCheck();
});
// #endregion guide

// What the guide says these tests find in the demo app.
test.afterEach(async ({ browserName }, testInfo) => {
  const issues = checksOf(testInfo).flatMap(c => c.issues);
  const rules = new Set(issues.map(i => i.rule));
  if (testInfo.title === 'home page, forced right-to-left') {
    for (const rule of ['rtl/not-mirrored', 'rtl/icon-not-mirrored', 'rtl/icon-mirrored', 'rtl/canvas']) expect(rules, rule).toContain(rule);
    const badge = issues.find(i => i.rule === 'rtl/not-mirrored' && i.selector === '#promo-badge');
    // The CSS pointer needs Chromium DevTools; other browsers keep the generic fix.
    expect(badge?.source?.replacement).toBe(browserName === 'chromium' ? 'inset-inline-start: 16px' : undefined);
  } else {
    for (const rule of ['rtl/bidi-order', 'rtl/canvas', 'rtl/clipped-marks']) expect(rules, rule).toContain(rule);
    expect(issues.find(i => i.selector === '#course-title')?.visual).toBe('++C');
    expect(issues.find(i => i.selector === '#price-ar')?.visual).toBe('220$');
  }
});
