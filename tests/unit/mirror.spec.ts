import { test, expect } from '@playwright/test';
import { findNotMirrored, type BoxRecord } from '../../src/rules/mirror';

const W = 1000;
const rec = (key: string, x: number, width: number, ignored = false): BoxRecord =>
  ({ key, selector: key, box: { x, y: 0, width, height: 20 }, text: '', ignored });
const run = (ltr: BoxRecord[], rtl: BoxRecord[]) => findNotMirrored(ltr, rtl, { viewportWidth: W });

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
