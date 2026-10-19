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
