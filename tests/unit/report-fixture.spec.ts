import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { renderReport } from '../../src/report/html';
import { buildModel } from '../../src/report/model';
import type { RunResults } from '../../src/types';

/**
 * A results.json written by fitlocale 0.4.2 itself, before issues had a `name`: the demo project's tests
 * (`npx playwright test --project=demo` at the v0.4.2 tag, Chromium), unedited. See tests/fixtures/README.md.
 * A newer report has to open what an older run wrote.
 */
const raw = readFileSync('tests/fixtures/results-0.4.2.json', 'utf8');
const results = JSON.parse(raw) as RunResults;

test('the 0.4.2 fixture is a 0.4.2 file: no accessible names yet', () => {
  expect(results.version).toBe(1);
  const issues = results.checks.flatMap(c => c.issues);
  expect(issues).toHaveLength(56);
  expect(issues.filter(i => 'name' in i)).toHaveLength(0);
});

test('a results.json from 0.4.2 renders into a report', () => {
  const html = renderReport(results);
  const model = buildModel(results);
  // Two pages, grouped into problems; every problem has a row and a detail.
  expect(model.pages.map(p => p.label)).toEqual(['/', '/page2.html']);
  expect(model.problems).toBe(36);
  expect(model.bySeverity).toEqual({ error: 20, warning: 13, info: 3 });
  expect(model.locales).toEqual(['en', 'en-XA', 'de', 'ar']);
  expect(model.projects).toEqual(['demo']);
  expect(html.match(/<tr class="problem/g)).toHaveLength(model.problems);
  expect(html.match(/<article class="detail"/g)).toHaveLength(model.problems);
  expect(html).toContain(`${model.problems} problem(s) · 56 issue(s)`);
  // The overview counts problems per severity, and lists every rule the run found.
  expect(html).toMatch(/data-stat="error"><span class="k">Errors<\/span><span class="n">20<\/span>/);
  for (const rule of new Set(results.checks.flatMap(c => c.issues.map(i => i.rule)))) expect(html).toContain(`<code>${rule}</code>`);
  // Nothing printed from a value an older file lacks (a leak/bad-value message does name "undefined" in its text).
  expect(html).not.toMatch(/>(undefined|null|NaN)</);
  // The fix a 0.4.2 run recorded for the CSS source is still shown.
  expect(html).toContain('inset-inline-start: 16px');
});
