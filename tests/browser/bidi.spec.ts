import { test, expect, type Page } from '@playwright/test';
import { load } from './helpers';

const rtl = (body: string) => `<html dir="rtl" lang="ar"><body>${body}</body></html>`;
const find = async (page: Page, html: string) => {
  await load(page, html);
  return page.evaluate(() => window.__fitlocale.findBidiOrder([]));
};

test('a token drawn out of order is reported with how it looks', async ({ page }) => {
  const issues = await find(page, rtl('<p id=c>تعلم C++ اليوم</p>'));
  expect(issues.map(i => `${i.rule} ${i.selector}`)).toEqual(['rtl/bidi-order #c']);
  expect(issues[0].text).toBe('C++');
  expect(issues[0].visual).toBe('++C');
});

test('an isolated token is fine', async ({ page }) => {
  expect(await find(page, rtl('<p id=ok>تعلم <bdi>C++</bdi> اليوم</p>'))).toEqual([]);
});

test('a phone number prefix drawn out of order is reported', async ({ page }) => {
  const issues = await find(page, rtl('<p id=ph>اتصل على +1 5551234</p>'));
  expect(issues.map(i => `${i.selector} ${i.text}`)).toEqual(['#ph +1']);
});

test('emails, versions and URLs drawn in order are not reported', async ({ page }) => {
  const html = rtl('<p>راسلنا john@x.com.</p><p>الإصدار v2.0</p><p>زوروا https://x.io</p>');
  expect(await find(page, html)).toEqual([]);
});

// The classic case: a price written "$220" inside Arabic text is drawn "220$".
test('a price whose currency sign jumps to the other side is reported', async ({ page }) => {
  const issues = await find(page, rtl('<p id=price>السعر $220</p>'));
  expect(issues.map(i => `${i.selector} ${i.text} → ${i.visual}`)).toEqual(['#price $220 → 220$']);
});

test('English text forced right-to-left is not checked', async ({ page }) => {
  expect(await find(page, rtl('<p>Learn C++ today</p>'))).toEqual([]);
});
