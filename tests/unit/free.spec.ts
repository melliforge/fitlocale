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
