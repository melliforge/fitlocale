import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { TestCase, TestResult } from '@playwright/test/reporter';
import FitlocaleReporter from '../../src/reporter';
import type { RunResults } from '../../src/types';
import { makeCheck, makeIssue } from './fixtures';

test('reporter collects results and copies screenshots', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fitlocale-'));
  const shot = join(dir, 'shot.png');
  writeFileSync(shot, 'png');
  const check = makeCheck({
    issues: [makeIssue(), makeIssue({ severity: 'warning', rule: 'rtl/not-mirrored' })],
    screenshots: [{ mode: 'pseudo-long', viewport: { width: 1280, height: 800 }, path: shot, size: { width: 1000, height: 2000 } }],
  });
  const result = {
    attachments: [
      { name: 'fitlocale:result', contentType: 'application/json', body: Buffer.from(JSON.stringify(check)) },
      { name: 'fitlocale:screenshot', contentType: 'image/png', path: shot },
    ],
  } as unknown as TestResult;

  const out = join(dir, 'report');
  const reporter = new FitlocaleReporter({ outputDir: out });
  reporter.onTestEnd({} as TestCase, result);
  await reporter.onEnd();

  const run = JSON.parse(readFileSync(join(out, 'results.json'), 'utf8')) as RunResults;
  expect(run.version).toBe(1);
  expect(run.summary).toEqual({ error: 1, warning: 1, info: 0 });
  const copied = run.checks[0].screenshots[0].path;
  expect(copied).toMatch(/^screenshots\/[0-9a-f]{12}\.png$/);
  expect(existsSync(join(out, copied))).toBe(true);
  expect(existsSync(join(out, 'index.html'))).toBe(true);
});
