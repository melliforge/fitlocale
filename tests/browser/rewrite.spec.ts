import { test, expect } from '@playwright/test';
import { ensureInjected } from '../../src/inject';
import { load } from './helpers';

test('injects once and survives CSP', async ({ page }) => {
  await page.setContent(`<html><head><meta http-equiv="Content-Security-Policy" content="script-src 'none'"></head><body><p>Hi</p></body></html>`);
  await ensureInjected(page);
  await ensureInjected(page);
  expect(typeof await page.evaluate(() => window.__fitlocale.version)).toBe('string');
});

test('rewrite expands visible text and skips ignored', async ({ page }) => {
  await load(page, `<button id=b>Save</button><code id=c>{x}</code><span data-fitlocale-ignore id=i>Keep</span>`);
  await page.evaluate(() => window.__fitlocale.rewriteText(0.4, []));
  await expect(page.locator('#b')).toHaveText('⟦Šávé ~⟧');
  await expect(page.locator('#c')).toHaveText('{x}');
  await expect(page.locator('#i')).toHaveText('Keep');
});

test('restore puts back exact original', async ({ page }) => {
  await load(page, `<main><h1>Title</h1><p>Some <b>bold</b> text</p><button>Go</button></main>`);
  const before = await page.evaluate(() => document.body.innerHTML);
  await page.evaluate(() => { window.__fitlocale.rewriteText(0.4, []); window.__fitlocale.restoreText(); });
  expect(await page.evaluate(() => document.body.innerHTML)).toBe(before);
});

test('restore survives removed nodes and app changes', async ({ page }) => {
  await load(page, `<p id=a>Alpha</p><p id=b>Beta</p><p id=c>Gamma</p>`);
  await page.evaluate(() => {
    window.__fitlocale.rewriteText(0.4, []);
    document.getElementById('a')!.remove();
    document.getElementById('b')!.textContent = 'App changed';
  });
  await page.evaluate(() => window.__fitlocale.restoreText());
  await expect(page.locator('#b')).toHaveText('App changed');
  await expect(page.locator('#c')).toHaveText('Gamma');
});

test('replaceText swaps only the listed texts and restoreText undoes it', async ({ page }) => {
  await load(page, `<p id=a>Speichern</p><p id=b>Andere</p>`);
  const before = await page.evaluate(() => document.body.innerHTML);
  expect((await page.evaluate(() => window.__fitlocale.visibleTexts([]))).sort()).toEqual(['Andere', 'Speichern']);
  expect(await page.evaluate(() => window.__fitlocale.replaceText({ Speichern: 'Save' }, []))).toBe(1);
  await expect(page.locator('#a')).toHaveText('Save');
  await expect(page.locator('#b')).toHaveText('Andere');
  await page.evaluate(() => window.__fitlocale.restoreText());
  expect(await page.evaluate(() => document.body.innerHTML)).toBe(before);
});

test('setDir toggles and restores', async ({ page }) => {
  await load(page, `<html dir="ltr"><body><p>Hi</p></body></html>`);
  await page.evaluate(() => window.__fitlocale.setDir('rtl'));
  expect(await page.evaluate(() => window.__fitlocale.documentDir())).toBe('rtl');
  await page.evaluate(() => window.__fitlocale.setDir(null));
  expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('ltr');
});

test('invalid ignore selector gives a clear error', async ({ page }) => {
  await load(page, `<p>Hi</p>`);
  await expect(page.evaluate(() => window.__fitlocale.rewriteText(0.4, ['[[']))).rejects.toThrow('invalid ignore selector "[["');
});

test('text without letters is left alone', async ({ page }) => {
  await load(page, `<span id=n>3</span><span id=p>12.50 €</span><span id=w>Hi</span>`);
  await page.evaluate(() => window.__fitlocale.rewriteText(0.4, []));
  await expect(page.locator('#n')).toHaveText('3');
  await expect(page.locator('#p')).toHaveText('12.50 €');
  await expect(page.locator('#w')).not.toHaveText('Hi');
});

test('unpseudoText approximates the source text, and restoreText undoes it', async ({ page }) => {
  await load(page, `<button id=b>⟦Šávé çháñgéš ~~~~⟧</button>`);
  const before = await page.locator('body').innerHTML();
  await page.evaluate(() => window.__fitlocale.unpseudoText([]));
  await expect(page.locator('#b')).toHaveText('Save changes');
  await page.evaluate(() => window.__fitlocale.restoreText());
  expect(await page.locator('body').innerHTML()).toBe(before);
});
