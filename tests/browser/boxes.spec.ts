import { test, expect } from '@playwright/test';
import { load } from './helpers';

test('snapshotBoxes returns text-bearing visible elements with keys', async ({ page }) => {
  await load(page, `<p id=a>Hi</p><img id=logo alt=logo src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width=20 height=20>`);
  const boxes = await page.evaluate(() => window.__fitlocale.snapshotBoxes([], ['#logo']));
  const a = boxes.find(b => b.selector === '#a');
  const logo = boxes.find(b => b.selector === '#logo');
  expect(a).toBeTruthy();
  expect(a!.key).toMatch(/^body>p/);
  expect(a!.ignored).toBe(false);
  expect(logo!.ignored).toBe(true);
});

test('scanLeaks finds leaks with selectors', async ({ page }) => {
  await load(page, `<p id=k>dashboard.welcome.title</p><p id=p>You have {count}</p><code>{x}</code>`);
  const issues = await page.evaluate(() => window.__fitlocale.scanLeaks([], []));
  expect(issues.map(i => `${i.rule} ${i.selector}`)).toEqual(['leak/raw-key #k', 'leak/placeholder #p']);
});

test('scanLeaks skips hidden text', async ({ page }) => {
  await load(page, `<p style="display:none">{count}</p><details><summary>S</summary><p>{x}</p></details>`);
  expect(await page.evaluate(() => window.__fitlocale.scanLeaks([], []))).toEqual([]);
});

test('scanLeaks finds leaks below the fold inside an app-shell scroller', async ({ page }) => {
  const paragraphs = Array.from({ length: 30 }, (_, i) => `<p>Paragraph ${i}</p>`).join('');
  await load(page, `<div style="height:300px;overflow:hidden"><main style="height:300px;overflow-y:auto;overflow-x:hidden">
    ${paragraphs}<p id=late>You have {count} messages</p></main></div>`);
  const issues = await page.evaluate(() => window.__fitlocale.scanLeaks([], []));
  expect(issues.map(i => `${i.rule} ${i.selector}`)).toEqual(['leak/placeholder #late']);
});

test('scanLeaks finds leaks below the fold when html and body hide horizontal overflow', async ({ page }) => {
  const paragraphs = Array.from({ length: 60 }, (_, i) => `<p>Paragraph ${i}</p>`).join('');
  await load(page, `<html style="height:100%;overflow-x:hidden"><body style="height:100%;margin:0;overflow-x:hidden">
    ${paragraphs}<p id=late>Price: undefined</p></body></html>`);
  const issues = await page.evaluate(() => window.__fitlocale.scanLeaks([], []));
  expect(issues.map(i => `${i.rule} ${i.selector}`)).toEqual(['leak/bad-value #late']);
});
