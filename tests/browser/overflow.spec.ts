import { test, expect, type Page } from '@playwright/test';
import { load } from './helpers';

const overflow = (page: Page) =>
  page.evaluate(() => window.__fitlocale.findOverflow([]).map(i => `${i.rule} ${i.selector}`));
const rewrite = (page: Page) => page.evaluate(() => window.__fitlocale.rewriteText(0.4, []));

const cases: Array<[name: string, html: string, expected: string[]]> = [
  ['clipped', `<button id=s style="width:120px;overflow:hidden;white-space:nowrap">Save changes</button>`, ['overflow/clipped #s']],
  ['ellipsis', `<div id=e style="width:80px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Account settings</div>`, ['overflow/ellipsis #e']],
  ['line clamp', `<p id=l style="width:120px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden">Short words here</p>`, ['overflow/ellipsis #l']],
  ['escapes box', `<div id=t style="width:90px;white-space:nowrap">Billing details</div>`, ['overflow/escapes-box #t']],
  ['clipped by ancestor', `<div style="width:100px;overflow:hidden"><span id=x style="white-space:nowrap">Notifications center</span></div>`, ['overflow/clipped #x']],
  ['fits', `<button id=ok style="min-width:100px;padding:4px">Save</button>`, []],
];

for (const [name, html, expected] of cases) {
  test(name, async ({ page }) => {
    await load(page, html);
    await rewrite(page);
    expect(await overflow(page)).toEqual(expected);
  });
}

test('clipped button is not clipped before the rewrite', async ({ page }) => {
  await load(page, cases[0][1]);
  expect(await overflow(page)).toEqual([]);
});

test('overlap', async ({ page }) => {
  await load(page, `<div style="position:relative;height:40px">
    <button id=a style="position:absolute;font-size:16px;inset-inline-start:0">Delete</button>
    <button id=b style="position:absolute;font-size:16px;inset-inline-start:90px">Archive</button></div>`);
  expect(await overflow(page)).toEqual([]);
  await rewrite(page);
  expect(await overflow(page)).toEqual(['overflow/overlap #a']);
});

// A bar fixed or stuck to the screen (a bottom navigation, an open menu) covers the page as it scrolls by on purpose.
test('a control under a fixed or sticky bar is not an overlap', async ({ page }) => {
  // A list longer than the screen, with a bar pinned to the bottom of the screen over it (Elk's bottom navigation).
  const list = Array.from({ length: 30 }, (_, i) => `<button style="display:block;height:40px">Item ${i}</button>`).join('');
  for (const position of ['fixed', 'sticky']) {
    await load(page, `<body style="margin:0">${list}
      <nav style="position:${position};bottom:0;left:0;width:300px;height:60px;background:#eee">
        <button style="height:60px">Home</button><button style="height:60px">Search</button></nav></body>`);
    expect(await overflow(page), position).toEqual([]);
  }
});

test('controls inside the same fixed bar can still overlap', async ({ page }) => {
  await load(page, `<nav style="position:fixed;top:0;left:0;width:400px;height:40px">
    <button id=a style="position:absolute;font-size:16px;inset-inline-start:0">Delete</button>
    <button id=b style="position:absolute;font-size:16px;inset-inline-start:90px">Archive</button></nav>`);
  await rewrite(page);
  expect(await overflow(page)).toEqual(['overflow/overlap #a']);
});

test('hidden elements are never reported', async ({ page }) => {
  const btn = `<button style="width:120px;overflow:hidden;white-space:nowrap">Save changes</button>`;
  await load(page, `
    <div style="display:none">${btn}</div>
    <div style="visibility:hidden">${btn}</div>
    <div style="opacity:0">${btn}</div>
    <details><summary>S</summary>${btn}</details>
    <div style="width:0;height:0;overflow:hidden">${btn}</div>`);
  await rewrite(page);
  expect(await overflow(page)).toEqual([]);
});

test('large page stays within budget', async ({ page }) => {
  const paragraphs = Array.from({ length: 2000 }, (_, i) => `<p>Paragraph number ${i} with some text</p>`).join('');
  const buttons = Array.from({ length: 200 }, (_, i) => `<button style="width:80px;overflow:hidden">Button ${i}</button>`).join('');
  await load(page, paragraphs + buttons);
  const ms = await page.evaluate(() => {
    const t0 = performance.now();
    window.__fitlocale.rewriteText(0.4, []);
    window.__fitlocale.findOverflow([]);
    window.__fitlocale.restoreText();
    return performance.now() - t0;
  });
  expect(ms).toBeLessThan(5000);
});

test('wrapped inline links do not count as overlapping', async ({ page }) => {
  const links = ['Privacy policy', 'Terms of service', 'Cookie settings', 'Careers at Acme', 'Press kit', 'System status', 'Security center', 'Contact us']
    .map(t => `<a href="#">${t}</a>`).join(', ');
  await load(page, `<footer style="width:320px">${links}</footer>`);
  await rewrite(page);
  expect(await overflow(page)).toEqual([]);
});

test('numbers and symbols are not lengthened, so fixed-size badges stay clean', async ({ page }) => {
  await load(page, `<span style="display:inline-block;width:24px;height:24px;overflow:hidden;white-space:nowrap">3</span>
    <span style="display:inline-block;width:40px;overflow:hidden;white-space:nowrap">12.50</span>`);
  // Fonts differ between engines (12.50 is wider than 40px in some): compare with the page before rewriting.
  const before = await overflow(page);
  await rewrite(page);
  expect(await overflow(page)).toEqual(before);
});

const shell = (inner: string) => `<div style="height:300px;overflow:hidden">
  <main style="height:300px;overflow-y:auto;overflow-x:hidden">${inner}</main></div>`;
const paragraphs = Array.from({ length: 30 }, (_, i) => `<p>Paragraph ${i} of the dashboard</p>`).join('');

test('app-shell scroller: text below the fold is not reported as clipped', async ({ page }) => {
  await load(page, shell(paragraphs));
  await rewrite(page);
  expect(await overflow(page)).toEqual([]);
});

test('the overlap pass grows linearly with the number of controls', async ({ page }) => {
  // Machines differ too much for a time budget: 4x the links costs ~4x when only nearby controls are compared, 16x for all pairs.
  const time = async (n: number) => {
    await load(page, Array.from({ length: n }, (_, i) => `<a href=#>Link ${i}</a>`).join(' '));
    let best = Infinity;
    for (let run = 0; run < 2; run++) {
      best = Math.min(best, await page.evaluate(() => {
        const t0 = performance.now();
        window.__fitlocale.findOverflow([]);
        return performance.now() - t0;
      }));
    }
    return best;
  };
  const small = await time(750), large = await time(3000);
  expect(large / small, `750 links ${small.toFixed(0)} ms, 3000 links ${large.toFixed(0)} ms`).toBeLessThan(8);
});
