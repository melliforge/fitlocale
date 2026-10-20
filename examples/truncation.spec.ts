import { expect, test } from 'fitlocale/playwright';
import { checksOf } from './helpers';

// #region guide
test('home page: text that no longer fits', async ({ page, localeCheck }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1'); // your app has rendered
  await localeCheck(); // checks at 1280px and 390px wide, with text about 40% longer
});
// #endregion guide

// What the guide says this test finds in the demo app.
test.afterEach(async ({}, testInfo) => {
  const issues = checksOf(testInfo).flatMap(c => c.issues).filter(i => i.mode === 'pseudo-long');
  const found = issues.map(i => `${i.rule} ${i.selector}`);
  for (const expected of ['overflow/clipped #save-btn', 'overflow/escapes-box #tab-billing', 'overflow/overlap #btn-delete']) {
    expect(found, expected).toContain(expected);
  }
  // The title is cut with an ellipsis on purpose, in English too: the noise rule leaves it out.
  expect(issues.filter(i => i.selector === '#long-title')).toEqual([]);
});
