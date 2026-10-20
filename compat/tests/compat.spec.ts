import type { Page } from '@playwright/test';
import { test, expect, byQueryParam, type CheckResult } from 'fitlocale/playwright';

// The published package as a user's project sees it: imported by name, on the oldest Node and Playwright it supports.
const PAGES: Record<string, string> = {
  // Sized to its own text as the page loads, so the label fits in the source render whatever fonts this machine has.
  '/clipped': `<div id=s style="display:inline-block;overflow:hidden;white-space:nowrap">Save changes</div><p id=k>dashboard.welcome.title</p>
    <script>s.style.width = (s.scrollWidth + 4) + 'px';</script>`,
  '/clean': `<button style="width:400px;white-space:nowrap">Save changes</button>`,
  '/badge': `<div id=badge style="position:absolute;left:16px">New</div>`,
  '/arabic': `<p dir=rtl lang=ar style="font-size:24px;line-height:2">مَرْحَبًا بِكُمْ</p>`,
  '/composed': `<my-card id=card></my-card><iframe id=f src="/frame" style="width:400px;height:120px"></iframe>
    <script>card.attachShadow({ mode: 'open' }).innerHTML = '<p>settings.profile.name</p>';</script>`,
  '/frame': `<p>orders.history.title</p>`,
};

async function open(page: Page, path: string) {
  await page.route(/^http:\/\/app\.test\//, route => {
    const url = new URL(route.request().url());
    const lang = url.searchParams.get('lang') ?? 'en';
    const body = PAGES[url.pathname] ?? '';
    return route.fulfill({ body: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"></head><body style="margin:0">${body}</body></html>`, contentType: 'text/html' });
  });
  await page.goto(`http://app.test${path}`);
}

const list = (r: CheckResult) => r.issues.map(i => `${i.rule} ${i.selector} ${i.mode}`).sort();

test.use({ fitlocale: { viewports: 'current', failOn: 'never', baseline: false } });

test('source leaks and pseudo-long overflow', async ({ page, localeCheck }) => {
  await open(page, '/clipped');
  expect(list(await localeCheck())).toEqual(['leak/raw-key #k source', 'overflow/clipped #s pseudo-long']);
});

test('a page that fits has no issues', async ({ page, localeCheck }) => {
  await open(page, '/clean');
  expect(list(await localeCheck())).toEqual([]);
});

test('pseudo-rtl finds a layout that does not mirror, then restores the page', async ({ page, localeCheck }) => {
  await open(page, '/badge');
  expect(list(await localeCheck())).toEqual(['rtl/not-mirrored #badge pseudo-rtl']);
  expect(await page.evaluate(() => document.documentElement.hasAttribute('dir'))).toBe(false);
});

test('Arabic with marks that fit is not reported', async ({ page, localeCheck }) => {
  await open(page, '/arabic');
  expect(list(await localeCheck()).filter(i => i.startsWith('rtl/'))).toEqual([]);
});

test('open shadow roots and same-origin iframes are checked', async ({ page, localeCheck }) => {
  await open(page, '/composed');
  await page.frameLocator('#f').locator('p').waitFor();
  const leaks = (await localeCheck()).issues.filter(i => i.rule === 'leak/raw-key').map(i => i.text).sort();
  expect(leaks).toEqual(['orders.history.title', 'settings.profile.name']);
});

test.describe('a real locale', () => {
  test.use({ fitlocale: { viewports: 'current', failOn: 'never', baseline: false, setLocale: byQueryParam() } });

  test('useLocale switches the app and the locale is still there at the check', async ({ page, localeCheck, useLocale }) => {
    await open(page, '/clean');
    await useLocale('de');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('de');
    expect((await localeCheck()).issues.filter(i => i.rule === 'locale/persistence')).toEqual([]);
  });
});
