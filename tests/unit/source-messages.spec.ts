import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { knownKeys, configDirOf } from '../../src/check';

const tmp = () => mkdtempSync(join(tmpdir(), 'fitlocale-msgs-'));

test('sourceMessages resolves relative to the Playwright config directory', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'en.json'), '{"nav":{"home":"Home"}}');
  expect(knownKeys('en.json', dir)).toEqual(['nav.home']);
  expect(configDirOf({ configFile: join(dir, 'playwright.config.ts') })).toBe(dir);
});

test('a missing sourceMessages file gives a fitlocale error', () => {
  expect(() => knownKeys('missing.json', tmp())).toThrow(/^fitlocale: cannot read sourceMessages file .*missing\.json/);
});

test('invalid sourceMessages JSON gives a fitlocale error', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'bad.json'), '{"a": ');
  expect(() => knownKeys('bad.json', dir)).toThrow(/^fitlocale: sourceMessages file .*bad\.json is not valid JSON/);
});
