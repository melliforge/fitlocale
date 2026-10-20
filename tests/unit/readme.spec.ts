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

// The oldest Node and Playwright are a promise: the docs state them and CI runs the packed package on exactly them.
test('the declared Node and Playwright floors are the ones CI tests and the docs state', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(pkg.engines.node).toBe('>=16.17');
  expect(pkg.peerDependencies['@playwright/test']).toBe('>=1.40.0');
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  expect(ci).toContain('image: mcr.microsoft.com/playwright:v1.40.0-jammy');
  expect(ci).toContain("node-version: '16.17'");
  expect(ci).toContain('@playwright/test@1.40.0');
  for (const file of ['README.md', 'docs/guide/getting-started.md']) {
    expect(readFileSync(file, 'utf8'), file).toContain('Node 16.17+ and `@playwright/test` 1.40+');
  }
});

test('the package is built for the oldest Node it declares', () => {
  expect(readFileSync('tsdown.config.ts', 'utf8')).toContain("target: 'node16.17'");
});
