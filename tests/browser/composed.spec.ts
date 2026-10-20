import type { Page } from '@playwright/test';
import { test, expect } from '../../src/playwright';
import { ensureInjected } from '../../src/inject';
import { load } from './helpers';

// Frames are loaded from routed URLs: app.test frames are same-origin with the page, other.test is not.
const PAGES: Record<string, string> = {
  'http://app.test/': `<!doctype html><html><body style="margin:0"><div style="height:1500px"></div>
    <my-card id=card><div><p>settings.profile.name</p></div></my-card>
    <my-outer id=outer></my-outer>
    <iframe id=f1 src="/frame1.html" style="border:5px solid;padding:7px;width:400px;height:300px"></iframe>
    <div id=closed></div>
    <iframe src="http://other.test/" style="width:200px;height:100px"></iframe>
    <iframe src="/hidden.html" style="display:none"></iframe>
    <my-card id=ign data-fitlocale-ignore></my-card>
    <script>
      card.attachShadow({ mode: 'open' }).innerHTML = '<div><p>dashboard.welcome.title</p><slot></slot></div>';
      const outer = document.getElementById('outer').attachShadow({ mode: 'open' });
      outer.innerHTML = '<my-inner></my-inner>';
      outer.querySelector('my-inner').attachShadow({ mode: 'open' }).innerHTML = '<p>account.billing.plan</p>';
      document.getElementById('closed').attachShadow({ mode: 'closed' }).innerHTML = '<p>closed.root.text</p>';
      document.getElementById('ign').attachShadow({ mode: 'open' }).innerHTML = '<p>ignored.host.text</p>';
    </script></body></html>`,
  'http://app.test/frame1.html': `<!doctype html><html><body style="margin:0"><p style="margin:20px">orders.history.title</p>
    <iframe src="/frame2.html" style="border:3px solid;width:300px;height:100px;margin-left:10px"></iframe></body></html>`,
  'http://app.test/frame2.html': `<!doctype html><html><body style="margin:0"><p>orders.detail.total</p></body></html>`,
  'http://app.test/hidden.html': `<!doctype html><html><body><p>hidden.frame.text</p></body></html>`,
  'http://other.test/': `<!doctype html><html><body><p>other.origin.text</p></body></html>`,
};

async function open(page: Page) {
  await page.route(/^http:\/\/(app|other)\.test\//, route =>
    route.fulfill({ body: PAGES[route.request().url()] ?? '', contentType: 'text/html; charset=utf-8' }));
  await page.goto('http://app.test/');
  await page.evaluate(() => window.scrollTo(0, 200));
  await ensureInjected(page);
  await page.evaluate(() => window.__fitlocale.assignKeys());
}

/** The element with this key: a key can match more than one element in Playwright (selectors are what get disambiguated). */
async function byKey(page: Page, key: string) {
  const all = page.locator(key);
  const keys = await all.evaluateAll(els => els.map(el => (el.ownerDocument.defaultView!.top as Window).__fitlocale.keyFor(el)));
  return all.nth(keys.indexOf(key));
}

const leaks = (page: Page) => page.evaluate(() => window.__fitlocale.scanLeaks([], []));
const READABLE = ['account.billing.plan', 'dashboard.welcome.title', 'orders.detail.total', 'orders.history.title', 'settings.profile.name'];

test.use({ fitlocale: { viewports: 'current', failOn: 'never', modes: [] } });

test('shadow roots and same-origin frames are scanned', async ({ page }) => {
  await open(page);
  expect((await leaks(page)).map(i => i.text).sort()).toEqual(READABLE);
});

test('what cannot be read is skipped quietly', async ({ page }) => {
  await open(page);
  const texts = (await leaks(page)).map(i => i.text);
  for (const text of ['closed.root.text', 'other.origin.text', 'hidden.frame.text', 'ignored.host.text']) expect(texts).not.toContain(text);
});

test('slotted text is visited once', async ({ page }) => {
  await open(page);
  const slotted = (await leaks(page)).filter(i => i.text === 'settings.profile.name');
  expect(slotted).toHaveLength(1);
  expect(slotted[0].key).not.toContain(' >> ');
});

test('boxes inside frames are placed on the page', async ({ page }) => {
  await open(page);
  const issues = await leaks(page);
  expect(issues.length).toBe(READABLE.length);
  for (const issue of issues) {
    const box = (await (await byKey(page, issue.key)).boundingBox())!;
    const scrollY = await page.evaluate(() => window.scrollY);
    for (const [got, want] of [[issue.box.x, box.x], [issue.box.y, box.y + scrollY], [issue.box.width, box.width], [issue.box.height, box.height]]) {
      expect(Math.abs(got - want), `${issue.text}: ${got} vs ${want}`).toBeLessThanOrEqual(1);
    }
  }
});

test('selectors into shadow roots resolve to one element', async ({ page, localeCheck }) => {
  await open(page);
  const issues = (await localeCheck()).issues.filter(i => i.rule === 'leak/raw-key');
  expect(issues.map(i => i.text).sort()).toEqual(READABLE);
  for (const issue of issues) {
    const found = page.locator(issue.selector);
    expect(await found.count(), issue.selector).toBe(1);
    expect(await found.textContent(), issue.selector).toBe(issue.text);
  }
});

// ---- Every check sees shadow roots and frames ----

/** Page content, with `shadow` put into an open shadow root of #host and `frame` into a same-origin srcdoc frame #f. */
const composed = (shadow: string, frame: string, top = '') => `${top}<my-host id=host></my-host>
  <iframe id=f style="width:400px;height:120px;border:0" srcdoc="${frame.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe>
  <script>document.getElementById('host').attachShadow({ mode: 'open' }).innerHTML = ${JSON.stringify(shadow)};</script>`;

const ruleList = (issues: { rule: string; selector: string }[], rule: string) => issues.filter(i => i.rule === rule).map(i => i.selector).sort();
const CLIPPED_BUTTON = `<button id=b style="width:120px;overflow:hidden;white-space:nowrap">Save changes</button>`;
const FRAMED_B = '#f >> internal:control=enter-frame >> #b';

test.describe('pseudo-long', () => {
  test.use({ fitlocale: { viewports: 'current', failOn: 'never', modes: ['pseudo-long'] } });

  test('pseudo-long overflow inside shadow roots and frames', async ({ page, localeCheck }) => {
    await page.setContent(composed(CLIPPED_BUTTON, CLIPPED_BUTTON));
    expect(ruleList((await localeCheck()).issues, 'overflow/clipped')).toEqual(['#b', FRAMED_B]);
  });
});

test.describe('integrated mode', () => {
  const setLang = async (page: Page, l: string) => { await page.evaluate(x => { document.documentElement.lang = x; }, l); };
  test.use({ fitlocale: { viewports: 'current', failOn: 'never', setLocale: setLang } });

  test('hardcoded text inside shadow roots and frames', async ({ page, localeCheck, useLocale }) => {
    await page.setContent(composed('<p id=s>Free shipping</p>', '<p id=s>Free shipping</p>', '<p>⟦Hömé ~⟧</p>'));
    await useLocale('en-XA');
    expect(ruleList((await localeCheck()).issues, 'i18n/hardcoded')).toEqual(['#f >> internal:control=enter-frame >> #s', '#s']);
  });
});

test('a shadow root is a block boundary', async ({ page }) => {
  await load(page, `<p id=t>Total: <my-price id=pr></my-price></p>
    <script>document.getElementById('pr').attachShadow({ mode: 'open' }).innerHTML = '<span>Gratis</span>';</script>`);
  const blocks = await page.evaluate(() => window.__fitlocale.collectTextBlocks([]));
  expect(blocks.map(b => b.text)).toEqual(['Total:', 'Gratis']);
  expect(blocks[1].key).toContain(' >> ');
});

test('language comes from the host, and a frame has its own', async ({ page }) => {
  await load(page, `<html lang=en><body>${composed('<p>Hallo Welt</p>', '<html lang=fr><body><p>Bonjour tout le monde</p></body></html>')}
    <script>document.getElementById('host').setAttribute('lang', 'de');</script></body></html>`);
  const blocks = await page.evaluate(() => window.__fitlocale.collectTextBlocks([]));
  expect(blocks.map(b => `${b.text} ${b.lang}`)).toEqual(['Hallo Welt de', 'Bonjour tout le monde fr']);
});

test('bidi order inside a shadow root', async ({ page }) => {
  await load(page, `<html dir="rtl" lang="ar"><body>${composed('<p>تعلم C++ اليوم</p>', '<p>x</p>')}</body></html>`);
  const issues = await page.evaluate(() => window.__fitlocale.findBidiOrder([]));
  expect(issues.map(i => `${i.rule} ${i.text}`)).toEqual(['rtl/bidi-order C++']);
});

test('clipped marks inside a frame', async ({ page }) => {
  const frame = `<html dir=rtl lang=ar><body style="margin:0"><div id=t style="height:20px;line-height:1;font-size:20px;overflow:hidden;white-space:nowrap">إِنَّ الْعِلْمَ</div></body></html>`;
  await load(page, `<div style="height:300px"></div>${composed('<p>x</p>', frame)}`);
  const issues = await page.evaluate(() => window.__fitlocale.findClippedMarks([]));
  expect(issues.map(i => `${i.rule} ${i.selector}`)).toEqual(['rtl/clipped-marks #f >> internal:control=enter-frame >> #t']);
  const frameBox = (await page.locator('#f').boundingBox())!;
  expect(issues[0].box.y).toBeGreaterThanOrEqual(frameBox.y - 1);
  expect(issues[0].box.y + issues[0].box.height).toBeLessThanOrEqual(frameBox.y + frameBox.height + 1);
});

test('canvases inside frames are listed', async ({ page }) => {
  await load(page, composed('<p>x</p>', '<canvas id=c width=200 height=100></canvas>'));
  const issues = await page.evaluate(() => window.__fitlocale.findCanvases([]));
  expect(issues.map(i => `${i.rule} ${i.selector}`)).toEqual(['rtl/canvas #f >> internal:control=enter-frame >> #c']);
});

/** The page as it is, including each open shadow root and each frame document. */
const snapshot = (page: Page) => page.evaluate(() => {
  const out: string[] = [document.documentElement.outerHTML];
  const visit = (root: ParentNode) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { out.push(el.shadowRoot.innerHTML); visit(el.shadowRoot); }
      const doc = (el as HTMLIFrameElement).contentDocument;
      if (el.localName === 'iframe' && doc) { out.push(doc.documentElement.outerHTML); visit(doc); }
    }
  };
  visit(document);
  return out;
});

test.describe('restoring', () => {
  test.use({ fitlocale: { viewports: 'current', failOn: 'never', modes: ['pseudo-long', 'pseudo-rtl'] } });

  test('the page is put back exactly, inside shadow roots and frames', async ({ page, localeCheck }) => {
    await page.setContent(composed(`${CLIPPED_BUTTON}<p>Some <b>bold</b> text</p>`, `${CLIPPED_BUTTON}<p dir=ltr>Some text</p>`));
    const before = await snapshot(page);
    await localeCheck();
    expect(await snapshot(page)).toEqual(before);
    // A check that stops between rewriting and restoring still restores: rewriteText, then restoreText.
    await page.evaluate(() => { window.__fitlocale.rewriteText(0.4, []); });
    expect(await snapshot(page)).not.toEqual(before);
    await page.evaluate(() => window.__fitlocale.restoreText());
    expect(await snapshot(page)).toEqual(before);
  });
});
