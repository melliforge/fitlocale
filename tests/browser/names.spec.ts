import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { load } from './helpers';

/** The accessible name of each element with an `id` in `ids`, in that order (null when it has none). */
async function names(page: Page, html: string, ids: string[]): Promise<Array<string | null>> {
  await load(page, html);
  const keys = await page.evaluate(i => i.map(id => window.__fitlocale.keyFor(document.getElementById(id)!)), ids);
  return page.evaluate(k => window.__fitlocale.namesFor(k), keys);
}

test('aria-labelledby wins over aria-label', async ({ page }) => {
  expect(await names(page, `<span id=s>Save draft</span><button id=b aria-label="Close" aria-labelledby="s">x</button>`, ['b'])).toEqual(['Save draft']);
});

test('a label for an input names it', async ({ page }) => {
  const html = `<label for=email>Email address</label><input id=email placeholder="you@example.com">
    <label for=bio>Short bio</label><textarea id=bio>Draft text</textarea>`;
  expect(await names(page, html, ['email', 'bio'])).toEqual(['Email address', 'Short bio']);
});

test('a label around an input names it, without the input\'s own content', async ({ page }) => {
  const html = `<label>First name <input id=a></label>
    <label>Country <select id=c><option>Tunisia</option><option>France</option></select></label>`;
  expect(await names(page, html, ['a', 'c'])).toEqual(['First name', 'Country']);
});

test('every label of an input counts, in document order', async ({ page }) => {
  expect(await names(page, `<label for=n>Name</label><label>(required) <input id=n></label>`, ['n'])).toEqual(['Name (required)']);
});

test('aria-label and aria-labelledby win over a label; a label wins over title and placeholder', async ({ page }) => {
  const html = `<span id=s>By reference</span>
    <label for=a>Visible</label><input id=a aria-label="By attribute">
    <label for=b>Visible</label><input id=b aria-labelledby="s">
    <label for=c>Visible</label><input id=c title="Tooltip" placeholder="Hint">`;
  expect(await names(page, html, ['a', 'b', 'c'])).toEqual(['By attribute', 'By reference', 'Visible']);
});

test('a label with no text falls through to the placeholder', async ({ page }) => {
  expect(await names(page, `<label for=q> </label><input id=q placeholder="Search">`, ['q'])).toEqual(['Search']);
});

test('whitespace in a name is collapsed and trimmed', async ({ page }) => {
  const html = `<button id=a aria-label="  Save \n\t  draft  ">x</button>
    <span id=p>  Save </span><span id=q>
      draft </span><button id=b aria-labelledby="p q">y</button>`;
  expect(await names(page, html, ['a', 'b'])).toEqual(['Save draft', 'Save draft']);
});

test('a name past 120 characters is clipped to 120 with an ellipsis; exactly 120 is kept', async ({ page }) => {
  const long = 'x'.repeat(200), exact = 'y'.repeat(120);
  const [clipped, kept] = await names(page, `<button id=a aria-label="${long}">x</button><button id=b aria-label="${exact}">y</button>`, ['a', 'b']);
  expect(clipped).toBe(`${'x'.repeat(119)}…`);
  expect(kept).toBe(exact);
});

test('an aria-labelledby id that is missing is skipped, and the rest of the name still applies', async ({ page }) => {
  const html = `<span id=s>Real</span>
    <button id=a aria-labelledby="nope" aria-label="Fallback">x</button>
    <button id=b aria-labelledby="nope s">y</button>
    <button id=c aria-labelledby="nope">z</button>`;
  expect(await names(page, html, ['a', 'b', 'c'])).toEqual(['Fallback', 'Real', null]);
});

test('alt names only an img, an area or an image input', async ({ page }) => {
  const gif = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  const html = `<div id=d alt="Ignored"></div><span id=s alt="Ignored" title="Title wins">?</span>
    <img id=i alt="Logo" src="${gif}"><map name=m><area id=r alt="Region" shape=rect coords="0,0,1,1"></map>
    <input id=n type=image alt="Go" src="${gif}"><input id=t type=text alt="Ignored">`;
  expect(await names(page, html, ['d', 's', 'i', 'r', 'n', 't'])).toEqual([null, 'Title wins', 'Logo', 'Region', 'Go', null]);
});
