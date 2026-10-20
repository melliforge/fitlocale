import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// The README may claim only the browsers CI actually runs.
test('README names the browsers CI runs', () => {
  const readme = readFileSync('README.md', 'utf8');
  expect(readme).toContain('Chromium, Firefox and WebKit');
  expect(readme).not.toContain('Chromium only');
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  expect(ci).toContain('install --with-deps chromium firefox webkit');
  expect(ci).toContain('BROWSERS: chromium,firefox,webkit');
});

test('README documents the baseline file and the GitHub Action', () => {
  const readme = readFileSync('README.md', 'utf8');
  expect(readme).toContain('## Baseline');
  expect(readme).toContain('npx fitlocale baseline');
  expect(readme).toContain('## GitHub Actions');
  expect(readme).toContain('uses: melliforge/localization-layout-tester@v');
  expect(readme).toMatch(/\| `baseline` \|/);
});
