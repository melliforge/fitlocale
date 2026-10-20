import { globSync, readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { ensureInjected } from '../../src/inject';
import { openDevtools } from '../../src/devtools/session';
import { findFontFallback } from '../../src/devtools/fonts';

// A Latin-only font that ships with Playwright: it has no Arabic letters.
const LATIN_FONT = globSync('node_modules/playwright-core/lib/vite/traceViewer/codicon*.ttf')[0];

async function check(page: Page, head: string, body: string) {
  await page.route('http://fonts.test/**', route => new URL(route.request().url()).pathname === '/latin.ttf'
    ? route.fulfill({ body: readFileSync(LATIN_FONT), contentType: 'font/ttf' })
    : route.fulfill({ body: `<!doctype html><html dir="rtl" lang="ar"><head>${head}</head><body>${body}</body></html>`, contentType: 'text/html; charset=utf-8' }));
  await page.goto('http://fonts.test/');
  await page.evaluate(() => document.fonts.ready);
  await ensureInjected(page);
  await page.evaluate(() => window.__fitlocale.assignKeys());
  const devtools = (await openDevtools(page))!;
  try {
    return await findFontFallback(page, devtools, []);
  } finally {
    await devtools.close();
  }
}

test('Arabic text in a Latin-only web font is drawn in a fallback font', async ({ page }) => {
  test.skip(!LATIN_FONT, 'no Latin-only font found in node_modules/playwright-core');
  const issues = await check(page, '<style>@font-face { font-family: LatinOnly; src: url(/latin.ttf) }</style>',
    '<p id=a style="font-family: LatinOnly, sans-serif">مرحبا بكم</p>');
  expect(issues.map(i => `${i.rule} ${i.selector}`)).toEqual(['rtl/font-fallback #a']);
  expect(issues[0].used).not.toMatch(/LatinOnly/i);
  expect(issues[0].declared).toBe('LatinOnly, sans-serif');
});

test('a declared font this machine does not have is not judged', async ({ page }) => {
  expect(await check(page, '', '<p style="font-family: FitlocaleNoSuchFont, serif">مرحبا بكم</p>')).toEqual([]);
});

test('a stack of generic families only is not judged', async ({ page }) => {
  expect(await check(page, '', '<p style="font-family: system-ui">مرحبا بكم</p>')).toEqual([]);
});
