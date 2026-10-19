import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// The test suite runs on Chromium only, so the README must not promise more.
test('README claims only the browsers the suite runs on', () => {
  const readme = readFileSync('README.md', 'utf8');
  expect(readme).not.toMatch(/works with[^.\n]*(firefox|webkit)/i);
  expect(readme).toContain('Chromium only');
});
