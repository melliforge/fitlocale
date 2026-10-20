import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('the MIT license names melliforge as the copyright holder', () => {
  const license = readFileSync('LICENSE', 'utf8');
  expect(license.startsWith('MIT License')).toBe(true);
  expect(license).toContain('Copyright (c) 2026 melliforge');
});
