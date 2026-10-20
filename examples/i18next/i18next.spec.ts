import { buildSync } from 'esbuild';
import { expect, test, byQueryParam } from 'fitlocale/playwright';
import { checksOf } from '../helpers';

// Serve the example app (index.html and the bundled app.ts) on http://i18next.test/.
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>i18next example</title></head><body>
  <nav><a id="home" href="/">Home</a> <a id="orders" href="/orders">Your orders</a></nav>
  <p id="welcome"></p><p id="cart"></p><p id="shipping">Free shipping on all orders</p>
  <script type="module" src="/app.js"></script></body></html>`;
const app = buildSync({ entryPoints: ['examples/i18next/app.ts'], bundle: true, write: false, format: 'esm', target: 'es2022' }).outputFiles[0].text;
test.use({ baseURL: 'http://i18next.test' });
test.beforeEach(async ({ page }) => {
  await page.route('http://i18next.test/**', route => new URL(route.request().url()).pathname === '/app.js'
    ? route.fulfill({ body: app, contentType: 'text/javascript' })
    : route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' }));
});

// #region guide
// This app reads its language from ?lang=.
test.use({ fitlocale: { setLocale: byQueryParam('lang') } });

test('home page in the pseudo locale', async ({ page, useLocale, localeCheck }) => {
  await page.goto('/');
  await useLocale('en-XA');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1'); // your app has rendered
  await localeCheck(); // finds hardcoded text and sentences glued together
});
// #endregion guide

// What the guide says this test finds.
test.afterEach(async ({}, testInfo) => {
  const found = checksOf(testInfo).flatMap(c => c.issues).map(i => `${i.rule} ${i.selector}`);
  expect(found).toContain('i18n/hardcoded #shipping');
  expect(found).toContain('i18n/concatenated #cart');
  expect(found.filter(f => f.startsWith('i18n/pseudo-not-loaded') || f.endsWith('#welcome'))).toEqual([]);
});
