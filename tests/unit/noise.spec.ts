import { test, expect } from '@playwright/test';
import { subtractSource } from '../../src/rules/noise';
import type { RawIssue, RuleId } from '../../src/types';

const issue = (rule: RuleId, key: string): RawIssue =>
  ({ rule, key, selector: key, box: { x: 0, y: 0, width: 1, height: 1 }, text: '' });

test('noise: same family in source drops candidate', () => {
  expect(subtractSource([issue('overflow/ellipsis', 'k')], [issue('overflow/clipped', 'k')])).toEqual([]);
});

test('noise: other family kept', () => {
  const candidate = issue('overflow/clipped', 'k');
  expect(subtractSource([candidate], [issue('leak/raw-key', 'k')])).toEqual([candidate]);
});
