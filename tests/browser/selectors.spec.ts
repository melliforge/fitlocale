import { test, expect } from '@playwright/test';
import { load } from './helpers';

const leakSelectors = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__fitlocale.scanLeaks([], []).map(i => i.selector));

test('ids that need escaping give working selectors', async ({ page }) => {
  await load(page, `<p id="1:a.b">dashboard.title.text</p>`);
  const [selector] = await leakSelectors(page);
  expect(selector).toBe('#\\31 \\:a\\.b');
  expect(await page.evaluate(s => document.querySelector(s)?.textContent, selector)).toBe('dashboard.title.text');
});

test('test ids with quotes give working selectors', async ({ page }) => {
  await load(page, `<p data-testid='say "hi" \\ now'>dashboard.title.text</p>`);
  const [selector] = await leakSelectors(page);
  expect(await page.evaluate(s => document.querySelector(s)?.textContent, selector)).toBe('dashboard.title.text');
});

test('a custom test id attribute is used', async ({ page }) => {
  await load(page, `<p data-qa="welcome" data-testid="other">dashboard.title.text</p>`);
  await page.evaluate(() => window.__fitlocale.assignKeys('data-qa'));
  expect(await leakSelectors(page)).toEqual(['[data-qa="welcome"]']);
});

test('element keys are DOM paths that select the element', async ({ page }) => {
  await load(page, `<main><p>One</p><div><span>Two</span><b>Three</b></div></main><p>Four</p>`);
  const records = await page.evaluate(() => window.__fitlocale.snapshotBoxes([], []));
  expect(records.map(r => r.key)).toEqual([
    'body>main:nth-child(1)>p:nth-child(1)',
    'body>main:nth-child(1)>div:nth-child(2)>span:nth-child(1)',
    'body>main:nth-child(1)>div:nth-child(2)>b:nth-child(2)',
    'body>p:nth-child(2)',
  ]);
  for (const r of records) expect(await page.evaluate(k => document.querySelector(k)?.textContent, r.key)).toBe(r.text);
});

test('a test id shared by several elements falls back to their DOM paths', async ({ page }) => {
  await load(page, Array.from({ length: 5 }, (_, i) => `<button data-testid="buy">Add ${i}</button>`).join('') + '<p data-testid="solo">Hi</p>');
  const records = await page.evaluate(() => window.__fitlocale.snapshotBoxes([], []));
  const buttons = records.filter(r => r.text.startsWith('Add'));
  expect(new Set(buttons.map(r => r.selector)).size).toBe(5);
  for (const r of buttons) expect(await page.evaluate(s => document.querySelectorAll(s).length, r.selector)).toBe(1);
  expect(records.find(r => r.text === 'Hi')?.selector).toBe('[data-testid="solo"]');
});

const namesFor = (page: import('@playwright/test').Page, keys: string[]) =>
  page.evaluate(k => window.__fitlocale.namesFor(k), keys);

test('namesFor reads aria-label, aria-labelledby, alt, title and placeholder', async ({ page }) => {
  await load(page, `<span id=a>Save</span><span id=b>draft</span>
    <button id=t1 aria-label="Close dialog">x</button>
    <button id=t2 aria-labelledby="a b">y</button>
    <img id=t3 alt="Logo" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
    <span id=t4 title="Help">?</span>
    <input id=t5 placeholder="Search">`);
  const keys = await page.evaluate(() => ['t1', 't2', 't3', 't4', 't5'].map(id => window.__fitlocale.keyFor(document.getElementById(id)!)));
  expect(await namesFor(page, keys)).toEqual(['Close dialog', 'Save draft', 'Logo', 'Help', 'Search']);
});

test('namesFor follows keys into open shadow roots and frames', async ({ page }) => {
  await load(page, `<div id=host></div><iframe id=f srcdoc='<button aria-label="In frame">x</button>'></iframe>`);
  await page.evaluate(() => {
    document.getElementById('host')!.attachShadow({ mode: 'open' }).innerHTML = '<button aria-label="In shadow">x</button>';
  });
  await page.waitForFunction(() => (document.getElementById('f') as HTMLIFrameElement).contentDocument?.querySelector('button'));
  await page.evaluate(() => window.__fitlocale.assignKeys());
  const keys = await page.evaluate(() => [
    window.__fitlocale.keyFor(document.getElementById('host')!.shadowRoot!.querySelector('button')!),
    window.__fitlocale.keyFor((document.getElementById('f') as HTMLIFrameElement).contentDocument!.querySelector('button')!),
  ]);
  expect(await namesFor(page, keys)).toEqual(['In shadow', 'In frame']);
});

test('namesFor returns null for unknown keys and unnamed elements', async ({ page }) => {
  await load(page, `<p id=p>No name</p>`);
  const key = await page.evaluate(() => window.__fitlocale.keyFor(document.getElementById('p')!));
  expect(await namesFor(page, ['body>div:nth-child(9)', 'html', key])).toEqual([null, null, null]);
});
