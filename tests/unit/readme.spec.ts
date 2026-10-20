import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// The README may claim only the browsers CI actually runs.
test('README names the browsers CI runs', () => {
  const readme = readFileSync('README.md', 'utf8');
  expect(readme).toContain('Chromium, Firefox and WebKit');
  expect(readme).not.toContain('Chromium only');
  expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain('BROWSERS: chromium,firefox,webkit');
});

// Layout tests depend on the fonts installed: CI runs in Playwright's own image, the one used to verify locally (Docker).
test('CI runs in the Playwright image of the installed version', () => {
  const version = JSON.parse(readFileSync('node_modules/@playwright/test/package.json', 'utf8')).version;
  expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain(`image: mcr.microsoft.com/playwright:v${version}-noble`);
});

test('README documents the baseline file and the GitHub Action', () => {
  const readme = readFileSync('README.md', 'utf8');
  expect(readme).toContain('## Baseline');
  expect(readme).toContain('npx fitlocale baseline');
  expect(readme).toContain('## GitHub Actions');
  expect(readme).toContain('uses: melliforge/localization-layout-tester@v');
  expect(readme).toMatch(/\| `baseline` \|/);
});
