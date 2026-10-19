import { test, expect, type Page } from '@playwright/test';
import { byCookie, byLocalStorage, byPathPrefix, byQueryParam } from '../../src/locales';

const ORIGIN = 'http://fitlocale.test';

test.beforeEach(async ({ page }) => {
  await page.route(`${ORIGIN}/**`, route => route.fulfill({
    contentType: 'text/html',
    body: `<pre id=out></pre><script>
      document.getElementById('out').textContent = JSON.stringify({
        href: location.href, cookie: document.cookie, ls: localStorage.getItem('lang') });
    </script>`,
  }));
});

const state = async (page: Page) => JSON.parse(await page.locator('#out').textContent() ?? '{}');

test('byQueryParam sets the query parameter', async ({ page }) => {
  await page.goto(`${ORIGIN}/x?a=1`);
  await byQueryParam()(page, 'de');
  expect((await state(page)).href).toContain('lang=de');
});

test('byCookie sets a cookie and reloads', async ({ page }) => {
  await page.goto(`${ORIGIN}/x`);
  await byCookie('lang')(page, 'de');
  expect((await state(page)).cookie).toContain('lang=de');
});

test('byLocalStorage sets the item and reloads', async ({ page }) => {
  await page.goto(`${ORIGIN}/x`);
  await byLocalStorage('lang')(page, 'de');
  expect((await state(page)).ls).toBe('de');
});

test('byPathPrefix replaces or adds the locale segment', async ({ page }) => {
  await page.goto(`${ORIGIN}/en/x`);
  await byPathPrefix()(page, 'de');
  expect(new URL(page.url()).pathname).toBe('/de/x');
  await page.goto(`${ORIGIN}/x`);
  await byPathPrefix()(page, 'de');
  expect(new URL(page.url()).pathname).toBe('/de/x');
});
