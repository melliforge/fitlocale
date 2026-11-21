import { test, expect, type Page } from '@playwright/test';
import { load } from './helpers';

type Msg = { key: string; text: string };
const record = (page: Page, messages: Msg[], ignore: string[] = []) =>
  page.evaluate(([m, ig]) => window.__fitlocale.recordFit(m, ig), [messages, ignore] as const);
const html = (body: string, head = '') => `<!doctype html><meta charset=utf-8><style>body{margin:0;font:16px/20px sans-serif}</style>${head}<body>${body}`;
const near = (actual: number | null, expected: number) => {
  expect(actual).not.toBeNull();
  expect(Math.abs(actual! - expected)).toBeLessThanOrEqual(1);
};

test('a fixed-width one-line button has room equal to its content width', async ({ page }) => {
  await load(page, html(`<button id=b style="width:120px;padding:0 10px;border:0;white-space:nowrap;overflow:hidden">Save</button>`));
  const { entries } = await record(page, [{ key: 'save', text: 'Save' }]);
  expect(entries).toHaveLength(1);
  expect(entries[0].oneLine).toBe(true);
  near(entries[0].roomX, 100);
});

test('ellipsis on a parent stops the text inside a span', async ({ page }) => {
  await load(page, html(`<div style="width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span id=s>Export</span></div>`));
  const [e] = (await record(page, [{ key: 'export', text: 'Export' }])).entries;
  expect(e.selector).toBe('#s');
  near(e.roomX, 150);
});

test('a paragraph that grows has no room on either axis', async ({ page }) => {
  await load(page, html(`<p id=p style="width:300px">Your settings are saved automatically.</p>`));
  const [e] = (await record(page, [{ key: 'saved', text: 'Your settings are saved automatically.' }])).entries;
  expect([e.roomX, e.roomY, e.oneLine]).toEqual([null, null, false]);
});

test('a fixed-height box with hidden overflow has vertical room', async ({ page }) => {
  await load(page, html(`<div id=d style="width:200px;height:40px;overflow:hidden;line-height:20px">Two lines at most here</div>`));
  const [e] = (await record(page, [{ key: 'two', text: 'Two lines at most here' }])).entries;
  near(e.roomY, 40);
});

test('a row scrolled out of a clipped list is not stopped by it', async ({ page }) => {
  const rows = Array.from({ length: 10 }, (_, i) => `<div id=r${i} style="line-height:20px">Row number ${i}</div>`).join('');
  await load(page, html(`<div style="width:200px;height:100px;overflow:hidden">${rows}</div>`));
  const { entries } = await record(page, [{ key: 'row9', text: 'Row number 9' }]);
  expect(entries).toHaveLength(1);
  expect(entries[0].roomY).toBeNull();
});

test('an inline span wraps at its block width', async ({ page }) => {
  await load(page, html(`<p style="width:200px"><span id=s>A long sentence that wraps over several lines in this box</span></p>`));
  const [e] = (await record(page, [{ key: 'long', text: 'A long sentence that wraps over several lines in this box' }])).entries;
  near(e.wrapWidth, 200);
});

test('screen-reader-only text is skipped', async ({ page }) => {
  await load(page, html(`<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Canvas actions</h2>`));
  expect((await record(page, [{ key: 'actions', text: 'Canvas actions' }])).entries).toEqual([]);
});

test('slots keep their values; text two keys share is not recorded', async ({ page }) => {
  await load(page, html(`<p id=a>Hello Ada</p><p id=b>Close</p>`));
  const rec = await record(page, [{ key: 'hello', text: 'Hello {{name}}' }, { key: 'close1', text: 'Close' }, { key: 'close2', text: 'Close' }]);
  expect(rec.entries.map(e => [e.key, e.slots])).toEqual([['hello', { name: 'Ada' }]]);
  expect(rec.ambiguous).toBe(1);
});

test('ignored elements are not recorded', async ({ page }) => {
  await load(page, html(`<p id=a data-fitlocale-ignore>Save</p><p id=b class=skip>Load</p>`));
  expect((await record(page, [{ key: 'save', text: 'Save' }, { key: 'load', text: 'Load' }], ['.skip'])).entries).toEqual([]);
});

test('the page is left as it was', async ({ page }) => {
  await load(page, html(`<button id=b style="width:80px;overflow:hidden;white-space:nowrap">Save</button><p id=p>Text here</p>
    <script>window.changes = 0; new MutationObserver(m => { window.changes += m.length; }).observe(document.body, { subtree: true, characterData: true, childList: true });</script>`));
  const before = await page.evaluate(() => document.body.innerHTML);
  await record(page, [{ key: 'save', text: 'Save' }, { key: 'text', text: 'Text here' }]);
  expect(await page.evaluate(() => document.body.innerHTML)).toBe(before);
  // Each lengthened node is set back: two writes per probed node, none left pending.
  expect(await page.evaluate(() => new Promise(r => setTimeout(() => r((window as unknown as { changes: number }).changes), 0)))).toBe(4);
});

test('fonts list the loaded @font-face rules with absolute URLs', async ({ page }) => {
  await page.route('http://fit.test/**', r => r.fulfill(r.request().url().endsWith('.woff2') ? { status: 404 } : { contentType: 'text/html', body: '<!doctype html>' }));
  await page.goto('http://fit.test/');
  await load(page, html(`<p id=p style="font-family:TestFace">Save</p>`, `<style>@font-face{font-family:TestFace;src:url(/f/test.woff2);font-weight:700}</style>`));
  const { fonts } = await record(page, [{ key: 'save', text: 'Save' }]);
  expect(fonts).toHaveLength(1);
  expect(fonts[0]).toMatchObject({ family: 'TestFace', weight: '700', style: 'normal' });
  expect(fonts[0].src).toMatch(/^[a-z]+:.*\/f\/test\.woff2$/);
});

// Review fixes (final review, 2026-11-21).
test('a message that is only a slot does not hide the others', async ({ page }) => {
  await load(page, html(`<p id=a>Save</p><p id=b>Billing details</p><p id=c>Profile:</p>`));
  const rec = await record(page, [{ key: 'save', text: 'Save' }, { key: 'billing', text: 'Billing details' }, { key: 'user', text: '{{name}}' },
    { key: 'pair', text: '{{a}} {{b}}' }, { key: 'label', text: '{{label}}:' }]);
  // `{{label}}:` has no letters of its own: like `{{name}}`, it cannot say which element is which.
  expect(rec.entries.map(e => e.key).sort()).toEqual(['billing', 'save']);
  expect(rec.ambiguous).toBe(0);
});

test('an icon beside the label still gets its room', async ({ page }) => {
  await load(page, html(`<button id=b style="width:120px;padding:0 10px;border:0;white-space:nowrap;overflow:hidden"><svg width=0 height=0></svg>Save</button>`));
  const [e] = (await record(page, [{ key: 'save', text: 'Save' }])).entries;
  expect(e.measured).toBe(true);
  near(e.roomX, 100);
});

test('text split across child elements is recorded as not measured', async ({ page }) => {
  await load(page, html(`<p id=p style="width:100px;white-space:nowrap;overflow:hidden">Save <b>now</b></p>`));
  const [e] = (await record(page, [{ key: 'now', text: 'Save now' }])).entries;
  expect(e.measured).toBe(false);
});

test('an ancestor that scrolls vertically does not stop the text vertically', async ({ page }) => {
  await load(page, html(`<nav style="width:200px;height:60px;overflow-x:hidden;overflow-y:auto"><a id=l>Account settings</a></nav>`));
  const [e] = (await record(page, [{ key: 'acct', text: 'Account settings' }])).entries;
  expect(e.roomY).toBeNull();
});

test('fonts inside @media and @layer are listed', async ({ page }) => {
  await page.route('http://fit.test/**', r => r.fulfill(r.request().url().endsWith('.woff2') ? { status: 404 } : { contentType: 'text/html', body: '<!doctype html>' }));
  await page.goto('http://fit.test/');
  await load(page, html(`<p id=p>Save</p>`, `<style>@media screen{@font-face{font-family:InMedia;src:url(/a.woff2)}} @layer base{@font-face{font-family:InLayer;src:url(/b.woff2)}}</style>`));
  expect((await record(page, [{ key: 'save', text: 'Save' }])).fonts.map(f => f.family).sort()).toEqual(['InLayer', 'InMedia']);
});

test('one style table per record: repeated styles are stored once', async ({ page }) => {
  const ps = Array.from({ length: 20 }, (_, i) => `<p id=p${i}>Line ${i}</p>`).join('');
  await load(page, html(ps));
  const rec = await record(page, Array.from({ length: 20 }, (_, i) => ({ key: `k${i}`, text: `Line ${i}` })));
  expect(rec.entries).toHaveLength(20);
  expect(rec.styles).toHaveLength(1);
  expect(rec.entries.every(e => e.s === 0)).toBe(true);
  expect(JSON.stringify(rec.entries).length / 20).toBeLessThan(250);
});
