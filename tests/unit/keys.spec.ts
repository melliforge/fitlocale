import { test, expect } from '@playwright/test';
import { parentKey } from '../../src/rules/keys';

test('parentKey steps up through shadow roots and frames', () => {
  expect(parentKey('body>div:nth-child(2)')).toBe('body');
  expect(parentKey('body>my-card:nth-child(1) >> :scope>div:nth-child(1)')).toBe('body>my-card:nth-child(1)');
  expect(parentKey('body>my-card:nth-child(1) >> :scope>div:nth-child(1)>p:nth-child(2)')).toBe('body>my-card:nth-child(1) >> :scope>div:nth-child(1)');
  expect(parentKey('body>iframe:nth-child(3) >> internal:control=enter-frame >> body>p:nth-child(1)')).toBe('body>iframe:nth-child(3)');
  expect(parentKey('body')).toBeNull();
});
