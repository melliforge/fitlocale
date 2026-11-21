import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestInfo } from '@playwright/test';
import { test, expect } from '../../src/playwright';
import { checkScope, issueId, type BaselineEntry } from '../../src/baseline';

const BASE = join(tmpdir(), `fitlocale-fixed-${process.pid}.json`);
const CLIPPED = `<button id=s style="width:120px;overflow:hidden;white-space:nowrap">Save changes</button>`;
const WIDE = `<button id=s style="white-space:nowrap">Save changes</button>`;

/** The baseline entry this test's first check would have written for the clipped button. */
function entryFor(testInfo: TestInfo, over: Partial<BaselineEntry> = {}): BaselineEntry {
  const scope = { project: testInfo.project.name, titlePath: testInfo.titlePath, checkIndex: 0 };
  const issue = { rule: 'overflow/clipped' as const, mode: 'pseudo-long' as const, locale: 'en', viewport: { width: 1280, height: 720 }, selector: '#s' };
  return { id: issueId(scope, issue), rule: issue.rule, test: 'x › y', selector: '#s', mode: issue.mode, locale: 'en', viewport: '1280x720', check: checkScope(scope), ...over };
}
const accept = (entries: BaselineEntry[]) => writeFileSync(BASE, JSON.stringify({ version: 1, note: '', issues: entries }));

test.use({ fitlocale: { viewports: 'current', modes: ['pseudo-long'], baseline: BASE } });
test.describe.configure({ mode: 'serial' }); // one baseline file per worker process

test('an accepted issue that no longer occurs is listed as fixed', async ({ page, localeCheck }, testInfo) => {
  accept([entryFor(testInfo)]);
  await page.setContent(WIDE);
  const result = await localeCheck();
  expect(result.baseline?.fixed?.map(e => [e.rule, e.selector])).toEqual([['overflow/clipped', '#s']]);
  expect(result.baseline?.legacy).toBeUndefined();
});

test('an accepted issue still present is not fixed', async ({ page, localeCheck }, testInfo) => {
  accept([entryFor(testInfo)]);
  await page.setContent(CLIPPED);
  const result = await localeCheck();
  expect(result.issues.some(i => i.baselined)).toBe(true);
  expect(result.baseline?.fixed).toEqual([]);
});

test('entries of another check are never fixed here', async ({ page, localeCheck }, testInfo) => {
  accept([entryFor(testInfo, { id: 'f'.repeat(16), check: 'aaaaaaaaaaaa' })]);
  await page.setContent(WIDE);
  expect((await localeCheck()).baseline?.fixed).toEqual([]);
});

test('a baseline without check fields: nothing fixed, legacy flagged', async ({ page, localeCheck }, testInfo) => {
  const { check: _, ...legacy } = entryFor(testInfo);
  accept([legacy]);
  await page.setContent(WIDE);
  const result = await localeCheck();
  expect(result.baseline?.fixed).toEqual([]);
  expect(result.baseline?.legacy).toBe(true);
});
