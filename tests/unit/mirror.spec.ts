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
