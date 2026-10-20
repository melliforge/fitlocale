import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestInfo } from '@playwright/test';
import { test, expect } from '../../src/playwright';
import { issueId } from '../../src/baseline';
import type { Issue } from '../../src/types';

const BASE = join(tmpdir(), `fitlocale-baseline-${process.pid}.json`);
const button = (id: string) => `<button id=${id} style="width:120px;overflow:hidden;white-space:nowrap">Save changes</button>`;
const TWO = button('s') + button('t');

/** The id the fixture should give the clipped button `selector` in this test's first check. */
const idFor = (testInfo: TestInfo, selector: string) => issueId(
  { project: testInfo.project.name, titlePath: testInfo.titlePath, checkIndex: 0 },
  { rule: 'overflow/clipped', mode: 'pseudo-long', locale: 'en', viewport: { width: 1280, height: 720 }, selector },
);
const accept = (ids: string[]) => writeFileSync(BASE, JSON.stringify({ version: 1, issues: ids.map(id => ({ id })) }));
const clipped = (issues: Issue[]) => issues.filter(i => i.rule === 'overflow/clipped');

test.use({ fitlocale: { viewports: 'current', modes: ['pseudo-long'], baseline: BASE } });
test.describe.configure({ mode: 'serial' }); // one baseline file per worker process

test('without a baseline file nothing fails, and issues get ids', async ({ page, localeCheck }, testInfo) => {
  rmSync(BASE, { force: true });
  await page.setContent(TWO);
  const result = await localeCheck();
  expect(result.baseline?.status).toBe('missing');
  expect(clipped(result.issues).map(i => i.id)).toEqual([idFor(testInfo, '#s'), idFor(testInfo, '#t')]);
  for (const i of result.issues) expect(i.id).toMatch(/^[0-9a-f]{16}$/);
});

test('a missing baseline is visible on the test, not only in the reporter', async ({ page, localeCheck }, testInfo) => {
  rmSync(BASE, { force: true });
  await page.setContent(TWO);
  await localeCheck();
  await localeCheck();
  const notes = testInfo.annotations.filter(a => a.type === 'fitlocale');
  expect(notes).toHaveLength(1);
  expect(notes[0].description).toMatch(/^No baseline file yet \(.*fitlocale-baseline-\d+\.json\): issues are reported but do not fail tests\./);
});

test('every issue accepted: nothing fails', async ({ page, localeCheck }, testInfo) => {
  accept([idFor(testInfo, '#s'), idFor(testInfo, '#t')]);
  await page.setContent(TWO);
  const result = await localeCheck();
  expect(result.baseline?.status).toBe('applied');
  expect(clipped(result.issues).every(i => i.baselined)).toBe(true);
});

test('a new issue fails even when another is accepted', async ({ page, localeCheck }, testInfo) => {
  test.fail();
  accept([idFor(testInfo, '#s')]);
  await page.setContent(TWO);
  await localeCheck();
});

test.describe('flags', () => {
  test.use({ fitlocale: { viewports: 'current', modes: ['pseudo-long'], baseline: BASE, failOn: 'never' } });

  test('accepted and new issues are marked', async ({ page, localeCheck }, testInfo) => {
    accept([idFor(testInfo, '#s')]);
    await page.setContent(TWO);
    const result = await localeCheck();
    expect(clipped(result.issues).map(i => [i.selector, i.baselined])).toEqual([['#s', true], ['#t', false]]);
  });
});

test.describe('baseline off', () => {
  test.use({ fitlocale: { viewports: 'current', modes: ['pseudo-long'], baseline: false } });

  test('every error fails and no baseline is recorded', async ({ page, localeCheck }) => {
    test.fail();
    await page.setContent(TWO);
    const result = await localeCheck();
    expect(result.baseline).toBeUndefined();
  });
});

test('a corrupt baseline file is an error, not "no baseline"', async ({ page, localeCheck }) => {
  writeFileSync(BASE, '{ bad');
  await page.setContent(TWO);
  await expect(localeCheck()).rejects.toThrow(/^fitlocale: baseline file .* is not valid JSON/);
});

test('issues on repeated components with one test id get their own ids', async ({ page, localeCheck }) => {
  rmSync(BASE, { force: true });
  await page.setContent(Array.from({ length: 5 }, () =>
    '<button data-testid="buy" style="width:120px;overflow:hidden;white-space:nowrap">Add to basket</button>').join(''));
  const result = await localeCheck();
  const ids = clipped(result.issues).map(i => i.id);
  expect(ids).toHaveLength(5);
  expect(new Set(ids).size).toBe(5);
  // No baseline file yet: nothing fails, and each issue says so.
  expect(result.issues.every(i => i.fails === false)).toBe(true);
});
