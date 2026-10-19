import { test, expect } from '@playwright/test';
import { renderReport } from '../../src/report/html';
import { makeCheck, makeIssue, makeRun } from './fixtures';

test('report groups by page then mode', () => {
  const html = renderReport(makeRun([
    makeCheck({ url: 'http://app.test/a', issues: [makeIssue({ url: 'http://app.test/a' }), makeIssue({ url: 'http://app.test/a', mode: 'pseudo-rtl', rule: 'rtl/not-mirrored' })] }),
    makeCheck({ url: 'http://app.test/b', issues: [makeIssue({ url: 'http://app.test/b' })] }),
  ]));
  expect(html.match(/<h2[^>]*>http:\/\/app\.test\/a<\/h2>/g)).toHaveLength(1);
  expect(html.match(/<h2[^>]*>http:\/\/app\.test\/b<\/h2>/g)).toHaveLength(1);
  expect(html).toContain('pseudo-long');
  expect(html).toContain('pseudo-rtl');
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
