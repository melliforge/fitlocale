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
  expect(await find(page, scaled(1, 1)), 'tight').toEqual(['rtl/clipped-marks #t']);
  expect(await find(page, scaled(2, 1)), 'room enough').toEqual([]);
  // Fonts differ between machines, so compare with the unscaled verdict line-height by line-height:
  // the borderline heights are where a tolerance measured in the wrong scale shows.
  for (let lh = 1; lh <= 2; lh = Math.round((lh + 0.05) * 100) / 100) {
    const plain = await find(page, scaled(lh, 1));
    for (const scale of [0.5, 2]) expect(await find(page, scaled(lh, scale)), `line-height ${lh}, scale ${scale}`).toEqual(plain);
  }
});

test('marks are judged by their drawn pixels', async ({ page }) => {
  // Canvas metrics for marks differ between engines (WebKit misreports them): the verdict must follow the ink as drawn.
  const div = (height: number) =>
    `<div id=t style="padding-top:20px;height:${height}px;overflow:hidden;font-size:20px;line-height:normal;white-space:nowrap">${TEXT}</div>`;
  await load(page, `<html dir="rtl" lang="ar"><body style="margin:0">${div(200)}</body></html>`);
  // This test's own measurement: the baseline in the box, and how far the drawn ink reaches below it.
  const { baseline, descent } = await page.evaluate(() => {
    const el = document.getElementById('t')!;
    const s = getComputedStyle(el);
    const g = new OffscreenCanvas(400, 120).getContext('2d', { willReadFrequently: true })!;
    g.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    g.fillText(el.textContent!, 20, 60);
    const data = g.getImageData(0, 0, 400, 120).data;
    let bottom = 0;
    for (let y = 0; y < 120; y++) for (let x = 0; x < 400; x++) if (data[(y * 400 + x) * 4 + 3] > 0) bottom = y;
    const range = document.createRange();
    range.selectNodeContents(el.firstChild!);
    const rect = range.getClientRects()[0];
    return { baseline: rect.top - el.getBoundingClientRect().top + g.measureText(el.textContent!).fontBoundingBoxAscent, descent: bottom + 1 - 60 };
  });
  const verdict = (clipBelowBaseline: number) =>
    find(page, div(Math.round(baseline + clipBelowBaseline - 20)));
  expect(await verdict(descent - 3), `clip 3px into the drawn ink (descent ${descent})`).toEqual(['rtl/clipped-marks #t']);
  expect(await verdict(descent + 3), `clip 3px below the drawn ink (descent ${descent})`).toEqual([]);
});

test('pixel ink stays fast on many elements', async ({ page }) => {
  const divs = Array.from({ length: 300 }, (_, i) =>
    `<div style="height:30px;overflow:hidden;white-space:nowrap;font-size:${[14, 16, 20][i % 3]}px">${TEXT} ${i % 30}</div>`).join('');
  await load(page, `<html dir="rtl" lang="ar"><body>${divs}</body></html>`);
  const ms = await page.evaluate(() => {
    const t0 = performance.now();
    window.__fitlocale.findClippedMarks([]);
    return performance.now() - t0;
  });
  expect(ms).toBeLessThan(1500);
});
