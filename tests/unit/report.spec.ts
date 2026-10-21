import { test, expect } from '@playwright/test';
import { renderReport } from '../../src/report/html';
import type { CheckResult } from '../../src/types';
import { makeCheck, makeIssue, makeRun } from './fixtures';

test('report groups by page, then locale · mode', () => {
  const html = renderReport(makeRun([
    makeCheck({ url: 'http://app.test/a', issues: [makeIssue({ url: 'http://app.test/a' }), makeIssue({ url: 'http://app.test/a', mode: 'pseudo-rtl', rule: 'rtl/not-mirrored' })] }),
    makeCheck({ url: 'http://app.test/b', issues: [makeIssue({ url: 'http://app.test/b' })] }),
  ]));
  // The shared origin is dropped from page labels.
  expect(html.match(/<h2[^>]*>\/a<\/h2>/g)).toHaveLength(1);
  expect(html.match(/<h2[^>]*>\/b<\/h2>/g)).toHaveLength(1);
  const a = html.indexOf('<h2>/a</h2>'), b = html.indexOf('<h2>/b</h2>');
  const long = html.indexOf('<h3>en · pseudo-long</h3>'), rtl = html.indexOf('<h3>en · pseudo-rtl</h3>');
  expect(long).toBeGreaterThan(a);
  expect(rtl).toBeGreaterThan(a);
  expect(long).toBeLessThan(b);
  expect(rtl).toBeLessThan(b);
});

test('report escapes HTML and keeps Arabic', () => {
  const html = renderReport(makeRun([makeCheck({ issues: [makeIssue({ text: '</script><img src=x onerror=alert(1)>مرحبا' })] })]));
  expect(html).toContain('&lt;/script&gt;&lt;img');
  expect(html).toContain('مرحبا');
  expect(html).not.toContain('<img src=x onerror');
});

test('report is offline', () => {
  const html = renderReport(makeRun([makeCheck()]));
  expect(html).not.toMatch(/(src|href)=["']?https?:/);
  expect(html).not.toContain('<link rel="stylesheet"');
});

test('overlay boxes use percentages', () => {
  const html = renderReport(makeRun([makeCheck()]));
  expect(html).toContain('left:10%;top:10%;width:5%;height:1%');
});

test('empty run', () => {
  expect(renderReport(makeRun([]))).toContain('No localization layout issues found.');
});

test('every value from results.json is escaped', () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const run = makeRun([makeCheck({
    issues: [makeIssue({ severity: evil as never, mode: evil as never, viewport: { width: evil as never, height: 1 } })],
    screenshots: [{ mode: evil as never, viewport: { width: evil as never, height: 1 }, path: 'a.png', size: { width: 1000, height: 2000 } }],
  })]);
  run.summary = { error: evil as never, warning: 0, info: 0 };
  const html = renderReport(run);
  expect(html).not.toContain('<img src=x');
  expect(html).toContain('<span class="sev">&quot;&gt;&lt;img src=x onerror=alert(1)&gt;</span>');
});

test('sections are labelled locale · mode', () => {
  const html = renderReport(makeRun([makeCheck({ issues: [makeIssue({ locale: 'de', mode: 'source' })] })]));
  expect(html).toContain('<h3>de · source</h3>');
});

test('issue boxes stay visible on any background, in light and dark mode', async ({ page }) => {
  // Warning orange is close to yellow (especially the dark-mode shade), so boxes also get a dark and a light ring.
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.setContent(renderReport(makeRun([makeCheck({ issues: [makeIssue({ severity: 'warning' })] })])));
    const shadow = await page.locator('.box.warning').evaluate(el => getComputedStyle(el).boxShadow);
    expect(shadow).toContain('rgb(0, 0, 0)');
    expect(shadow).toContain('rgb(255, 255, 255)');
  }
});

test('accepted issues are marked and can be hidden', () => {
  const run = makeRun([makeCheck({
    issues: [makeIssue({ baselined: true }), makeIssue({ selector: '#t' })],
  })]);
  run.summary = { error: 2, warning: 0, info: 0 };
  const html = renderReport(run);
  expect(html).toContain('<tr class="problem error accepted"');
  expect(html).toContain('<span class="tag">accepted</span>');
  expect(html).toContain('box error accepted');
  expect(html).toContain('2 problem(s) · 2 issue(s) · 1 new · 1 accepted');
  expect(html).toContain('data-sev="accepted"');
});

test('without accepted issues the report has no accepted toggle', () => {
  const html = renderReport(makeRun([makeCheck()]));
  expect(html).not.toContain('data-sev="accepted"');
  expect(html).not.toContain(' accepted');
});

test('a problem found in two projects is one row with both screenshots', () => {
  const check = (project: string) => makeCheck({
    project, issues: [makeIssue({ mode: 'source', locale: undefined })],
    screenshots: [{ mode: 'source', viewport: { width: 1280, height: 800 }, path: `shots/${project}.png`, size: { width: 1280, height: 800 } }],
  });
  const html = renderReport(makeRun([check('chromium'), check('firefox')]));
  expect(html.match(/<tr class="problem/g)).toHaveLength(1);
  expect(html).toContain('data-projects="[&quot;chromium&quot;,&quot;firefox&quot;]"');
  expect(html).toContain('chromium, firefox · 1280×800 · 2×');
  const section = html.indexOf('<details class="section" open id="page-1-1">');
  const end = html.indexOf('</details>\n', section);
  expect(section).toBeGreaterThan(-1);
  for (const path of ['shots/chromium.png', 'shots/firefox.png']) {
    expect(html.indexOf(path)).toBeGreaterThan(section);
    expect(html.indexOf(path)).toBeLessThan(end);
  }
  expect(html).toContain('<figure class="shot-wrap" data-project="firefox">');
});

test('without projects there is no project filter or column', () => {
  const html = renderReport(makeRun([makeCheck({ issues: [makeIssue({ locale: 'de', mode: 'source' })] })]));
  expect(html).toContain('<h3>de · source</h3>');
  expect(html).not.toContain('data-filter="project"');
  expect(html).toContain('<td class="seen">1280×800</td>');
  expect(html).not.toContain(' · undefined');
});

test('the summary lists each rule with its problems and links to its sections', () => {
  const html = renderReport(makeRun([makeCheck()]));
  const summary = html.slice(html.indexOf('<section id="summary">'), html.indexOf('</section>'));
  expect(summary).toContain('data-pick-rule="overflow/clipped"');
  expect(summary).toContain('href="#page-1-1"');
});

test('a rule seen in many sections links the first 8 and counts the rest', () => {
  const locales = Array.from({ length: 10 }, (_, i) => `l${i}`);
  const html = renderReport(makeRun([makeCheck({ issues: locales.map(locale => makeIssue({ locale })) })]));
  const row = /<tr class="error"><td><span class="sev">error<\/span><\/td><td><button type="button" class="pick" data-pick-rule="overflow\/clipped">.*?<\/tr>/.exec(html)![0];
  expect(row.match(/<a href="#page-1-\d+">/g)).toHaveLength(8);
  expect(row).toContain('href="#page-1-8"');
  expect(row).not.toContain('href="#page-1-9"');
  expect(row).toContain(' and 2 more</td>');
});

test('the element cell shows a readable label and keeps the full selector', () => {
  const selector = 'body > div:nth-child(2) > div:nth-child(3) > form > div:nth-child(4) > button:nth-child(1)';
  const html = renderReport(makeRun([makeCheck({ issues: [makeIssue({ text: 'Save', selector, key: 'body>div:nth-child(2)>form>button:nth-child(1)' })] })]));
  expect(html).toContain('<span class="label" dir="auto">Save</span>');
  const escaped = selector.replace(/>/g, '&gt;');
  expect(html).toMatch(new RegExp(`<details class="sel">(?:(?!</details>).)*${escaped.replace(/[()]/g, '\\$&')}`, 's'));
});

test('screenshots are lazy thumbnails', () => {
  const html = renderReport(makeRun([makeCheck()]));
  expect(html).toContain('loading="lazy"');
  expect(html).toContain('class="shot-wrap"');
});

test('sections are open without JavaScript', () => {
  const html = renderReport(makeRun([
    makeCheck({ url: 'http://app.test/a', issues: [makeIssue({ url: 'http://app.test/a' }), makeIssue({ url: 'http://app.test/a', mode: 'pseudo-rtl' })] }),
    makeCheck({ url: 'http://app.test/b', issues: [makeIssue({ url: 'http://app.test/b', locale: 'de' })] }),
  ]));
  const tags = html.match(/<details class="(?:page|section)"[^>]*>/g) ?? [];
  expect(tags).toHaveLength(5);
  for (const tag of tags) expect(tag).toMatch(/ open[ >]/);
});

test('a 0.4.2 results.json renders', () => {
  const bare = makeCheck({ url: 'http://app.test/b', issues: [makeIssue({ url: 'http://app.test/b' })] });
  delete (bare as Partial<CheckResult>).screenshots;
  const run = makeRun([makeCheck(), bare]);
  let html = '';
  expect(() => { html = renderReport(run); }).not.toThrow();
  expect(html.match(/<tr class="problem/g)).toHaveLength(2);
});

test('a large run renders quickly', () => {
  const viewports = [{ width: 1280, height: 800 }, { width: 390, height: 844 }];
  const checks: CheckResult[] = [];
  for (let t = 0; t < 16; t++) {
    const url = `http://app.test/page-${t}`;
    for (const project of ['chromium', 'webkit']) {
      for (const locale of ['de', 'fr', 'ar', 'ja']) {
        checks.push(makeCheck({
          testTitle: `test ${t}`, url, project,
          issues: viewports.flatMap(viewport => Array.from({ length: 40 }, (_, i) => makeIssue({
            url, locale, viewport, text: `Label ${t} ${locale} ${i}`,
            key: `body>div:nth-child(${i + 1})>span`, selector: `body > div:nth-child(${i + 1}) > span`,
            id: `${t}-${project}-${locale}-${viewport.width}-${i}`,
          }))),
          screenshots: viewports.map(viewport => ({ mode: 'pseudo-long', viewport, path: `shots/${t}-${project}-${locale}-${viewport.width}.png`, size: { width: viewport.width, height: 3000 } })),
        }));
      }
    }
  }
  expect(checks.reduce((n, c) => n + c.issues.length, 0)).toBe(10240);
  const start = Date.now();
  const html = renderReport(makeRun(checks));
  expect(Date.now() - start).toBeLessThan(3000);
  expect(html.match(/<tr class="problem/g)).toHaveLength(2560);
});
