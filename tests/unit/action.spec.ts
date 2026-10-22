import { execFileSync } from 'node:child_process';
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

test('the upload step runs only with upload: true and never fails the job', () => {
  const action = readFileSync('action.yml', 'utf8');
  expect(action).toMatch(/\n {2}upload:\n {4}description: .+\n {4}default: 'false'/);
  expect(action).toMatch(/\n {2}upload-url:\n {4}description: .+\n {4}default: ''/);
  const step = action.slice(action.indexOf('- name: Upload to fitlocale cloud'));
  expect(step.length).toBeLessThan(action.length);
  const body = step.slice(0, step.indexOf('\n    - ', 1) === -1 ? undefined : step.indexOf('\n    - ', 1));
  expect(body).toContain("if: inputs.upload == 'true'");
  expect(body).toContain('continue-on-error: true');
  expect(body).toContain('PR_NUMBER: ${{ github.event.pull_request.number }}');
  expect(body).toContain('UPLOAD_URL: ${{ inputs.upload-url }}');
  expect(body).toContain('--endpoint "$UPLOAD_URL"');
  // Composite steps share no shell functions: the step carries its own copy of the CLI lookup.
  expect(body).toContain('npx --yes "fitlocale@${MAJOR}"');
});

test('the docs show the permission the upload needs', () => {
  const docs = readFileSync('docs/reference/github-action.md', 'utf8');
  expect(docs).toContain('id-token: write');
  expect(docs).toContain('upload: true');
});

/** The upload step's script, run with a stand-in CLI that prints its arguments. */
function runUploadStep(env: Record<string, string>): string {
  const action = readFileSync('action.yml', 'utf8');
  const step = action.slice(action.indexOf('- name: Upload to fitlocale cloud'));
  const script = step.slice(step.indexOf('run: |') + 'run: |'.length).split('\n').map(l => l.replace(/^ {8}/, '')).join('\n');
  // GitHub runs composite bash steps with -eo pipefail.
  return execFileSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', FITLOCALE_COMMAND: 'echo fl', REPORT_DIR: 'fitlocale-report', ACTION_REF: 'v0', UPLOAD_URL: '', ...env },
  }).trim();
}

// pull_request_target runs on the base branch: a PR number would not match the job's token, and the service would refuse it.
test('the upload step passes --pr only for a pull request merge ref', () => {
  expect(runUploadStep({ GITHUB_REF: 'refs/pull/7/merge', PR_NUMBER: '7' })).toBe('fl upload fitlocale-report --pr 7');
  expect(runUploadStep({ GITHUB_REF: 'refs/heads/main', PR_NUMBER: '7' })).toBe('fl upload fitlocale-report');
  expect(runUploadStep({ GITHUB_REF: 'refs/heads/main', PR_NUMBER: '' })).toBe('fl upload fitlocale-report');
  expect(runUploadStep({ GITHUB_REF: 'refs/pull/7/merge', PR_NUMBER: '7', UPLOAD_URL: 'https://x.test' }))
    .toBe('fl upload fitlocale-report --pr 7 --endpoint https://x.test');
});
