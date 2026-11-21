import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  const action = readFileSync('action.yml', 'utf8') + '\n' + readFileSync('comment/action.yml', 'utf8');
  const scripts = [...action.matchAll(/run: \|\n([\s\S]*?)(?=\n {4}- |\n\S|$)/g)].map(m => m[1]);
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) expect(script).not.toContain('${{');
});

test('this repo\'s CI comments from one matrix job only', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  expect(ci).toContain('comment: ${{ matrix.node == 22 }}');
  expect(ci).toMatch(/\n {4}permissions:\n {6}contents: read\n {6}pull-requests: write/);
});

test('this repo\'s CI runs the action', () => {
  expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain('uses: ./');
});

test('the CLI fallback follows the Action major version, not the latest release', () => {
  const action = readFileSync('action.yml', 'utf8');
  expect(action).toContain('ACTION_REF: ${{ github.action_ref }}');
  expect(action).toContain('npx --yes "fitlocale@${MAJOR}"');
});

/** The body of the step named `name` in `file`, up to the next step. */
function stepBody(file: string, name: string): string {
  const action = readFileSync(file, 'utf8');
  const at = action.indexOf(`- name: ${name}`);
  expect(at, name).toBeGreaterThan(-1);
  const step = action.slice(at);
  const next = step.indexOf('\n    - ', 1);
  return next === -1 ? step : step.slice(0, next);
}

test('the comment step runs only with comment: true and never fails the job', () => {
  const action = readFileSync('action.yml', 'utf8');
  expect(action).toMatch(/\n {2}comment:\n {4}description: .+pull-requests: write.+\n {4}default: 'false'/);
  expect(action).not.toContain('github-token');
  expect(action).toMatch(/- name: Upload the fitlocale report\n {6}id: artifact\n/);
  const body = stepBody('action.yml', 'Comment on the pull request');
  expect(body).toContain("if: inputs.comment == 'true'");
  expect(body).toContain('continue-on-error: true');
  expect(body).toContain('GITHUB_TOKEN: ${{ github.token }}');
  expect(body).toContain('REPORT_URL: ${{ steps.artifact.outputs.artifact-url }}');
  // Composite steps share no shell functions: the step carries its own copy of the CLI lookup.
  expect(body).toContain('npx --yes "fitlocale@${MAJOR}"');
});

test('the upload step is a warning only', () => {
  const action = readFileSync('action.yml', 'utf8');
  expect(action).toMatch(/\n {2}upload:\n {4}description: 'Retired: .+\n {4}default: 'false'/);
  const body = stepBody('action.yml', 'Upload to fitlocale cloud');
  expect(body).toContain('::warning::');
  expect(body).not.toContain('fl upload');
});

test('the comment sub-action never fails the job and uses github.token', () => {
  const body = stepBody('comment/action.yml', 'Comment on the pull request');
  expect(body).toContain('continue-on-error: true');
  expect(body).toContain('GITHUB_TOKEN: ${{ github.token }}');
  expect(body).toContain('npx --yes "fitlocale@${MAJOR}"');
  expect(readFileSync('comment/action.yml', 'utf8')).toMatch(/\n {2}report-dirs:\n {4}description: .+\n {4}required: true/);
});

test('the docs show the permission the comment needs', () => {
  const docs = readFileSync('docs/reference/github-action.md', 'utf8');
  expect(docs).toContain('pull-requests: write');
  expect(docs).toContain('comment: true');
  expect(docs).not.toContain('id-token');
});

/** A step's script, run with a stand-in CLI that prints its arguments joined by `|`. */
function runStep(file: string, name: string, env: Record<string, string>): string {
  const body = stepBody(file, name);
  const script = body.slice(body.indexOf('run: |') + 'run: |'.length).split('\n').map(l => l.replace(/^ {8}/, '')).join('\n');
  const dir = mkdtempSync(join(tmpdir(), 'fitlocale-action-'));
  writeFileSync(join(dir, 'fl.sh'), 'printf "fl"; printf "|%s" "$@"; echo\n');
  // GitHub runs composite bash steps with -eo pipefail.
  return execFileSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', FITLOCALE_COMMAND: `bash ${join(dir, 'fl.sh')}`, REPORT_DIR: 'fitlocale-report', ACTION_REF: 'v0', ...env },
  }).trim();
}

test('the comment step passes the artifact URL when there is one', () => {
  expect(runStep('action.yml', 'Comment on the pull request', { REPORT_URL: 'https://x.test/a' })).toBe('fl|comment|fitlocale-report|--report-url|https://x.test/a');
  expect(runStep('action.yml', 'Comment on the pull request', { REPORT_URL: '' })).toBe('fl|comment|fitlocale-report');
});

test('the comment sub-action passes every report dir', () => {
  expect(runStep('comment/action.yml', 'Comment on the pull request', { REPORT_DIRS: 'a\n\n  b c  \n', REPORT_URL: '' })).toBe('fl|comment|a|b c');
  expect(runStep('comment/action.yml', 'Comment on the pull request', { REPORT_DIRS: 'a', REPORT_URL: 'https://x.test/r' })).toBe('fl|comment|a|--report-url|https://x.test/r');
});
