import { test, expect, type Page } from '@playwright/test';
import { load } from './helpers';

const TEXT = 'إِنَّ الْعِلْمَ';
const find = async (page: Page, body: string) => {
  await load(page, `<html dir="rtl" lang="ar"><body>${body}</body></html>`);
  return (await page.evaluate(() => window.__fitlocale.findClippedMarks([]))).map(i => `${i.rule} ${i.selector}`);
};

test('marks cut off by a tight box are reported', async ({ page }) => {
  expect(await find(page, `<div id=t style="height:14px;line-height:1;font-size:20px;overflow:hidden;white-space:nowrap">${TEXT}</div>`))
    .toEqual(['rtl/clipped-marks #t']);
});

test('text with room is fine', async ({ page }) => {
  expect(await find(page, `<div style="font-size:20px;line-height:1.8">${TEXT}</div>`)).toEqual([]);
  expect(await find(page, `<div style="height:48px;font-size:20px;line-height:2.4;overflow:hidden">${TEXT}</div>`)).toEqual([]);
});

test('Latin text is not checked', async ({ page }) => {
  expect(await find(page, '<div style="height:10px;overflow:hidden;font-size:20px">Hello</div>')).toEqual([]);
});

test('wrapped text is not checked', async ({ page }) => {
  const long = `${TEXT} `.repeat(30);
  expect(await find(page, `<div style="width:200px;height:30px;overflow:hidden;font-size:16px">${long}</div>`)).toEqual([]);
});
