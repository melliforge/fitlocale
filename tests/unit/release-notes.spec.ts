import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { releaseNotes } from '../../scripts/release-notes.mjs';

const changelog = `# Changelog

## [Unreleased]

## [1.1.0] - 2026-11-01

### Added

- Thing two.

## [1.0.0] - 2026-10-01

First release.

[1.1.0]: https://example.com/compare
`;

test('extracts one version section without its heading or link refs', () => {
  expect(releaseNotes(changelog, '1.1.0')).toBe('### Added\n\n- Thing two.');
  expect(releaseNotes(changelog, '1.0.0')).toBe('First release.');
});

test('accepts a v-prefixed tag', () => {
  expect(releaseNotes(changelog, 'v1.1.0')).toBe('### Added\n\n- Thing two.');
});

test('a missing version throws, so a release is never cut without notes', () => {
  expect(() => releaseNotes(changelog, '9.9.9')).toThrow('CHANGELOG.md has no section for 9.9.9');
});

test('every version in package.json has changelog notes', () => {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(releaseNotes(readFileSync('CHANGELOG.md', 'utf8'), version).length).toBeGreaterThan(0);
});
