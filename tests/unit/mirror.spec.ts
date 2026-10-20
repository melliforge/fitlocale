import { test, expect } from '@playwright/test';
import { findNotMirrored, type BoxRecord } from '../../src/rules/mirror';

const W = 1000;
const rec = (key: string, x: number, width: number, ignored = false, direction: 'ltr' | 'rtl' = 'ltr'): BoxRecord =>
  ({ key, selector: key, box: { x, y: 0, width, height: 20 }, text: '', ignored, direction });
const toRtl = (r: BoxRecord): BoxRecord => ({ ...r, direction: 'rtl' });
const run = (ltr: BoxRecord[], rtl: BoxRecord[]) => findNotMirrored(ltr, rtl.map(toRtl), { viewportWidth: W });

test('element that stayed put is flagged', () => {
  const issues = run([rec('body>a', 16, 100)], [rec('body>a', 16, 100)]);
  expect(issues).toHaveLength(1);
  expect(issues[0].rule).toBe('rtl/not-mirrored');
  expect(issues[0].key).toBe('body>a');
});

test('mirrored element passes', () => {
  expect(run([rec('body>a', 16, 100)], [rec('body>a', 884, 100)])).toEqual([]);
});

test('centred element is skipped', () => {
  expect(run([rec('body>a', 450, 100)], [rec('body>a', 450, 100)])).toEqual([]);
});

test('full-width element is skipped', () => {
  expect(run([rec('body>a', 0, 950)], [rec('body>a', 0, 950)])).toEqual([]);
});

test('ignored element is skipped', () => {
  expect(run([rec('body>a', 16, 100, true)], [rec('body>a', 16, 100, true)])).toEqual([]);
});

test('only outermost flagged', () => {
  const issues = run(
    [rec('body>a', 16, 100), rec('body>a>b', 20, 50)],
    [rec('body>a', 16, 100), rec('body>a>b', 20, 50)],
  );
  expect(issues.map(i => i.key)).toEqual(['body>a']);
});

test('missing in rtl is skipped', () => {
  expect(run([rec('body>a', 16, 100)], [])).toEqual([]);
});

test('off-screen element (skip link) is skipped', () => {
  expect(run([rec('body>a', -9999, 100)], [rec('body>a', -9999, 100)])).toEqual([]);
});

test('element already right-to-left before the switch is skipped', () => {
  const before = rec('body>a', 16, 100, false, 'rtl');
  expect(findNotMirrored([before], [toRtl(before)], { viewportWidth: W })).toEqual([]);
});

test('element that stays left-to-right after the switch is skipped', () => {
  const box = rec('body>a', 16, 100);
  expect(findNotMirrored([box], [box], { viewportWidth: W })).toEqual([]);
});

test('a flagged grandparent hides its grandchild, a sibling with a similar key does not', () => {
  const boxes = [rec('body>a', 16, 100), rec('body>a>b>c', 20, 50), rec('body>ab>c', 16, 40)];
  expect(run(boxes, boxes).map(i => i.key)).toEqual(['body>a', 'body>ab>c']);
});

test('framed elements are judged against their frame', () => {
  const framed = (x: number): BoxRecord => ({ ...rec('body>iframe:nth-child(1) >> internal:control=enter-frame >> body>div:nth-child(1)', x, 40), frame: { x: 400, width: 300 } });
  // Centred on the page, so the page-wide check skips it; in its 300px frame it sits on the left and must move.
  expect(run([framed(480)], [framed(480)])).toHaveLength(1);
  expect(run([framed(480)], [framed(580)])).toEqual([]);
});

test('a flagged shadow host hides its shadow children', () => {
  const host = 'body>my-card:nth-child(1)', child = `${host} >> :scope>div:nth-child(1)`;
  const issues = run([rec(host, 16, 200), rec(child, 20, 100)], [rec(host, 16, 200), rec(child, 20, 100)]);
  expect(issues.map(i => i.key)).toEqual([host]);
});
