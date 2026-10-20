import { byLocalStorage, expect, test } from 'fitlocale/playwright';
import { checksOf } from './helpers';

// #region real-locales
test.use({
  fitlocale: {
    sourceMessages: 'demo/locales/en.json',
    localeMessages: 'demo/locales/{locale}.json', // de → demo/locales/de.json
    setLocale: byLocalStorage('lang'),
  },
});

test('home page in German: text the translation no longer fits', async ({ page, useLocale, localeCheck }) => {
  await page.goto('/');
  await useLocale('de');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await localeCheck(); // reports only what overflows in German and not in English
});
// #endregion real-locales

// What the guide says this test finds in the demo app.
test.afterEach(async ({}, testInfo) => {
  const found = checksOf(testInfo).flatMap(c => c.issues)
    .filter(i => i.mode === 'source' && i.locale === 'de').map(i => `${i.rule} ${i.selector}`);
  expect(found).toContain('overflow/clipped #save-btn');
});
