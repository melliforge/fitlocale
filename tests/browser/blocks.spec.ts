import { test, expect, type Page } from '@playwright/test';
import { load } from './helpers';

const blocks = (page: Page, ignore: string[] = []) => page.evaluate(ig => window.__fitlocale.collectTextBlocks(ig), ignore);

test('inline elements join their block, with whitespace collapsed', async ({ page }) => {
  await load(page, `<p id=p>Hello <b>big</b>\n  world</p>`);
  expect((await blocks(page)).map(b => [b.selector, b.text])).toEqual([['#p', 'Hello big world']]);
});

test('an inline link is recorded as a control with its range', async ({ page }) => {
  await load(page, `<p id=p>⟦Read the <a id=l href=#>help</a> first ~⟧</p>`);
  const [block, ...rest] = await blocks(page);
  expect(rest).toEqual([]);
  expect(block.controls).toHaveLength(1);
  const [c] = block.controls;
  expect(c.selector).toBe('#l');
  expect(block.text.slice(c.start, c.end)).toBe('help');
});

test('a nested block is a block of its own', async ({ page }) => {
  await load(page, `<div id=d>Top<p id=q>Inner</p></div>`);
  expect((await blocks(page)).map(b => [b.selector, b.text])).toEqual([['#d', 'Top'], ['#q', 'Inner']]);
});

test('hidden text is left out', async ({ page }) => {
  await load(page, `<p>Shown <span style="display:none">hidden</span></p>`);
  expect((await blocks(page)).map(b => b.text)).toEqual(['Shown']);
});

test('ignored elements are left out', async ({ page }) => {
  await load(page, `<p data-fitlocale-ignore>Skip</p><p class=x>Also</p>`);
  expect(await blocks(page, ['.x'])).toEqual([]);
});

test('blocks and controls carry their closest lang', async ({ page }) => {
  await load(page, `<html lang="en-XA"><body><p><a lang="de" href=#>Deutsch</a></p><p lang="de" id=pd>Deutsch</p></body></html>`);
  const [first, second] = await blocks(page);
  expect(first.lang).toBe('en-XA');
  expect(first.controls.map(c => c.lang)).toEqual(['de']);
  expect(second.selector).toBe('#pd');
  expect(second.lang).toBe('de');
});

test('an inline-block badge inside a button is its own block', async ({ page }) => {
  await load(page, `<button id=btn>⟦Save ~⟧ <span id=b style="display:inline-block">⟦3 ~⟧</span></button>`);
  expect((await blocks(page)).map(b => [b.selector, b.text])).toEqual([['#btn', '⟦Save ~⟧'], ['#b', '⟦3 ~⟧']]);
});

test('display: contents children are part of their block', async ({ page }) => {
  await load(page, `<p id=p><span style="display:contents">⟦Free ~⟧</span> ⟦today ~⟧</p>`);
  expect((await blocks(page)).map(b => [b.selector, b.text])).toEqual([['#p', '⟦Free ~⟧ ⟦today ~⟧']]);
});

test('a huge block is capped at 2,000 characters', async ({ page }) => {
  await load(page, `<p id=p>${'word '.repeat(10_000)}</p>`);
  const [b] = await blocks(page);
  expect(b.text.length).toBe(2000);
});
