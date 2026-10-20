import type { Page } from '@playwright/test';
import { test, expect } from '../../src/playwright';
import { ensureInjected } from '../../src/inject';
import './helpers';

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
