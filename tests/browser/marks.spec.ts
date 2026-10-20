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

test('visually hidden text is not reported', async ({ page }) => {
  const srOnly = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
  expect(await find(page, `<button>X<span style="${srOnly}">${TEXT}</span></button>`)).toEqual([]);
});

test('overflow on an inline span clips nothing', async ({ page }) => {
  expect(await find(page, `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px">حفظ التغييرات</span>`)).toEqual([]);
});

test('a box with a fractional height is not mistaken for a scaled one', async ({ page }) => {
  // offsetHeight rounds 16.5px to 17: a ratio of 0.97 is rounding, not a transform
  for (const lh of [1, 1.1]) {
    expect(await find(page, `<div style="height:12px;overflow:hidden;font-size:15px"><span id=t style="display:inline-block;line-height:${lh}">${TEXT}</span></div>`), `line-height ${lh}`)
      .toEqual(['rtl/clipped-marks #t']);
  }
});

test('a CSS scale never changes the verdict', async ({ page }) => {
  const box = (lh: number) => `height:${lh * 20}px;line-height:${lh};font-size:20px;overflow:hidden;white-space:nowrap`;
  const scaled = (lh: number, scale: number) =>
    `<div style="transform:scale(${scale});transform-origin:0 0"><div id=t style="${box(lh)}">${TEXT}</div></div>`;
  for (const scale of [0.5, 2]) {
    expect(await find(page, scaled(1.3, scale)), `tight, scale ${scale}`).toEqual(['rtl/clipped-marks #t']);
    expect(await find(page, scaled(1.6, scale)), `room enough, scale ${scale}`).toEqual([]);
  }
});
