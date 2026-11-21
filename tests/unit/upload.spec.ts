import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { main } from '../../src/cli';
import { UPLOAD_RETIRED } from '../../src/upload';
import { makeCheck, makeRun } from './fixtures';

test('fitlocale upload is retired: one notice, exit 0, no network', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fitlocale-upload-'));
  writeFileSync(join(dir, 'results.json'), JSON.stringify(makeRun([makeCheck()])));
  const realFetch = globalThis.fetch;
  let called = 0;
  globalThis.fetch = (() => { called++; throw new Error('no network'); }) as typeof fetch;
  try {
    const out = { stdout: '', stderr: '' };
    const io = { stdout: (s: string) => { out.stdout += s; }, stderr: (s: string) => { out.stderr += s; } };
    expect(await main(['upload', dir, '--pr', '7', '--endpoint', 'https://x.test'], io)).toBe(0);
    expect(out.stdout).toBe(UPLOAD_RETIRED + '\n');
    expect(out.stderr).toBe('');
    expect(called).toBe(0);
  } finally {
    globalThis.fetch = realFetch;
  }
  expect(UPLOAD_RETIRED).toContain('https://melliforge.github.io/fitlocale/reference/github-action#comment');
});
