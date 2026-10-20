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
    expect(text, file).not.toMatch(/localization-layout-tester@v\d+\.\d+\.\d+/);
  }
  expect(read('README.md')).toContain('melliforge/localization-layout-tester@v0');
  expect(read('examples/github-workflow.yml')).toContain('melliforge/localization-layout-tester@v0');
});

test('the README shows the report, and says which part it shows', () => {
  const readme = read('README.md');
  expect(readme).toContain('](https://melliforge.github.io/localization-layout-tester/report.png)');
  // The image is the pseudo-long section: leaked keys on screen are reported in another section, not missed.
  for (const page of [readme, read('docs/index.md')]) expect(page).toContain("*The pseudo-long section of a report");
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
