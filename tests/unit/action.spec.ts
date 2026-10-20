import { existsSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// No YAML parser in the dependencies: these are text checks. The real test is this repo's CI, which uses the action.
test('the GitHub Action summarises and uploads the report', () => {
  expect(existsSync('action.yml')).toBe(true);
  const action = readFileSync('action.yml', 'utf8');
  expect(action).toMatch(/using: '?composite'?/);
  expect(action).toContain('branding:');
  expect(action).toContain('actions/upload-artifact@v7');
  expect(action).toContain('>> "$GITHUB_STEP_SUMMARY"');
  expect(action).toContain('if-no-files-found: ignore');
  // A second artifact with the same name (matrix, shards) is a 409 error: the upload must not fail the job.
  expect(action).toMatch(/upload-artifact@v7\n(\s+#.*\n)?\s+continue-on-error: true/);
});

test('action inputs reach scripts through env, never inline', () => {
  const action = readFileSync('action.yml', 'utf8');
  const scripts = [...action.matchAll(/run: \|\n([\s\S]*?)(?=\n {4}- |\n\S|$)/g)].map(m => m[1]);
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) expect(script).not.toContain('${{');
});

test('this repo\'s CI runs the action', () => {
  expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain('uses: ./');
});

test('the CLI fallback follows the Action major version, not the latest release', () => {
  const action = readFileSync('action.yml', 'utf8');
  expect(action).toContain('ACTION_REF: ${{ github.action_ref }}');
  expect(action).toContain('npx --yes "fitlocale@${MAJOR}"');
});
