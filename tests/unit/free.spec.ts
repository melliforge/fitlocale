import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { docsPages } from './docs-helpers';

const read = (path: string) => readFileSync(path, 'utf8');
const sources = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  if (name === 'generated') return [];
  return statSync(path).isDirectory() ? sources(path) : name.endsWith('.ts') ? [path] : [];
});

// fitlocale is free and has no service: the docs must not describe one.
test('no doc mentions the closed cloud, prices or trials', () => {
  const closed = /cloud\.fitlocale\.dev|fitlocale cloud|pricing|\btrial\b|\$\d+\s*\/\s*mo/gi;
  for (const page of ['README.md', ...docsPages()]) {
    const found = read(page).match(closed) ?? [];
    // The Action reference keeps one sentence saying upload was retired with the cloud.
    if (page.endsWith(join('reference', 'github-action.md'))) expect(found, page).toEqual(['fitlocale cloud']);
    else expect(found, page).toEqual([]);
  }
});

test('the fork recipe never checks out pull request code and downloads to runner.temp', () => {
  const comment = read('examples/github-workflow-forks-comment.yml');
  expect(comment).not.toContain('actions/checkout');
  expect(comment).toContain('workflow_run:');
  expect(comment).toContain("github.event.workflow_run.event == 'pull_request'");
  expect(comment).toContain('pull-requests: write');
  expect(comment).toContain('runner.temp');
  expect(comment).toContain('melliforge/fitlocale/comment@v0');
  const tests = read('examples/github-workflow-forks-tests.yml');
  expect(tests).toContain('pull_request:');
  expect(tests).not.toContain('pull-requests: write');
});

// A run that made no report (tests failed before fitlocale, a cancelled run) must not turn the comment job red.
test('the recipes\' artifact downloads never fail the comment job', () => {
  for (const file of ['examples/github-workflow-forks-comment.yml', 'examples/github-workflow-matrix.yml']) {
    expect(read(file), file).toMatch(/- uses: actions\/download-artifact@v8\n {8}continue-on-error: true\n/);
  }
});

test('the matrix recipe comments from one final job', () => {
  const matrix = read('examples/github-workflow-matrix.yml');
  expect(matrix).toContain('needs:');
  expect(matrix).toContain('pattern: fitlocale-report-*');
  expect(matrix).toContain('melliforge/fitlocale/comment@v0');
  expect(matrix).not.toContain('comment: true');
});

test('the package makes no network calls except GitHub\'s API in comment', () => {
  const calling = sources('src').filter(path => /\bfetch\(/.test(read(path)));
  expect(calling).toEqual([join('src', 'comment', 'github.ts')]);
});

// A translation pull request may come from a fork: the fit check runs its files with a token that can do nothing.
test('the fit example only reads', () => {
  const wf = read('examples/github-workflow-fit.yml');
  const perms = /\npermissions:\n((?: {2}.+\n)+)/.exec(wf)?.[1] ?? '';
  expect(perms.trim().split('\n').map(l => l.trim())).toEqual(['contents: read']);
  expect(wf).toContain('pull_request:');
  expect(wf).toContain("paths: ['locales/**']");
  expect(wf).toContain('fetch-depth: 0');
  expect(wf).toContain('npx fitlocale fit');
  expect(wf).not.toContain('playwright test');
});

// Review fix: a Playwright project's `fitlocale` replaces the top-level one (one-level merge), so a project recipe
// would silently drop `mask` from every full-page screenshot. The guide switches the option, keeping the others.
test('the gallery recipe keeps the other fitlocale options', () => {
  const guide = read('docs/guide/getting-started.md');
  expect(guide).toContain('FITLOCALE_GALLERY');
  expect(guide).not.toMatch(/use: \{ fitlocale: \{ gallery: true \} \}/);
  expect(guide).toMatch(/replaces the top-level one/);
});
