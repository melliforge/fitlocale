import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { docsPages } from './docs-helpers';

const read = (path: string) => readFileSync(path, 'utf8');

test('each stable release moves the major tag (v0) after the GitHub Release', () => {
  const workflow = read('.github/workflows/release.yml');
  const release = workflow.indexOf('name: Create or update the GitHub Release');
  const move = workflow.indexOf('name: Move the major tag');
  expect(release).toBeGreaterThan(0);
  expect(move).toBeGreaterThan(release);
  const step = workflow.slice(move);
  expect(step).toContain("if: env.NPM_TAG == 'latest'");
  expect(step).toContain('git push -f origin "refs/tags/v${VERSION%%.*}"');
});

test('docs and examples use the Action through its major tag', () => {
  for (const file of ['README.md', 'examples/github-workflow.yml', ...docsPages()]) {
    const text = read(file);
    expect(text, file).not.toMatch(/fitlocale@v\d+\.\d+\.\d+/);
  }
  expect(read('README.md')).toContain('melliforge/fitlocale@v0');
  expect(read('examples/github-workflow.yml')).toContain('melliforge/fitlocale@v0');
});

test('the README shows the report, and says which part it shows', () => {
  const readme = read('README.md');
  expect(readme).toContain('](https://melliforge.github.io/fitlocale/report.png)');
  // The image is one view of a report, not the whole of it: say which.
  for (const page of [readme, read('docs/index.md')]) expect(page).toContain('*A report with one problem open');
});

test('the major tag moves only to the newest stable release, and never fails the release', () => {
  const workflow = read('.github/workflows/release.yml');
  const step = workflow.slice(workflow.indexOf('name: Move the major tag'));
  expect(step).toContain('continue-on-error: true');
  expect(step).toContain('git fetch --tags --force');
  expect(step).toContain('--sort=-v:refname');
  const compare = step.indexOf('"$GITHUB_REF_NAME"');
  expect(compare).toBeGreaterThan(0);
  expect(compare).toBeLessThan(step.indexOf('git tag -f'));
});

/** Each job of a workflow, by id, as text. */
function jobsOf(workflow: string): Record<string, string> {
  const body = workflow.slice(workflow.indexOf('\njobs:\n') + '\njobs:\n'.length);
  const parts = body.split(/^ {2}(?=[\w-]+:\s*$)/m).filter(Boolean);
  return Object.fromEntries(parts.map(p => [p.slice(0, p.indexOf(':')), p]));
}

test('the release installs and tests without write access; only a job that installs nothing can publish', () => {
  const workflow = read('.github/workflows/release.yml');
  const top = workflow.slice(0, workflow.indexOf('\njobs:\n'));
  // A compromised dependency's install script or a test must not be able to push or publish.
  expect(top).toMatch(/permissions:\s*\n\s+contents: read/);
  expect(top).not.toContain('id-token: write');
  const jobs = Object.values(jobsOf(workflow));
  const writers = jobs.filter(j => /id-token: write|contents: write/.test(j));
  expect(writers).toHaveLength(1);
  const [publish] = writers;
  expect(publish).toContain('npm stage publish');
  expect(publish).toMatch(/needs: \w+/);
  for (const step of ['npm ci', 'npm test', 'npm run', 'npx playwright']) expect(publish, step).not.toContain(step);
  const tester = jobs.find(j => j.includes('npm test'))!;
  expect(tester).not.toMatch(/id-token: write|contents: write/);
});
