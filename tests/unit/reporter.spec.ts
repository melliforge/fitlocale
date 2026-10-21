import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

test('reporter keeps only the last retry and records the project', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fitlocale-'));
  const check = makeCheck({ screenshots: [] });
  const attempt = { attachments: [{ name: 'fitlocale:result', contentType: 'application/json', body: Buffer.from(JSON.stringify(check)) }] } as unknown as TestResult;
  const testCase = { id: 't1', parent: { project: () => ({ name: 'chromium' }) } } as unknown as TestCase;
  const reporter = new FitlocaleReporter({ outputDir: join(dir, 'report') });
  reporter.onTestEnd(testCase, attempt);
  reporter.onTestEnd(testCase, attempt);
  reporter.onTestEnd(testCase, attempt);
  await reporter.onEnd();
  const run = JSON.parse(readFileSync(join(dir, 'report', 'results.json'), 'utf8')) as RunResults;
  expect(run.checks).toHaveLength(1);
  expect(run.summary.error).toBe(1);
  expect(run.checks[0].project).toBe('chromium');
});

const attempt = (check: object) =>
  ({ attachments: [{ name: 'fitlocale:result', contentType: 'application/json', body: Buffer.from(JSON.stringify(check)) }] }) as unknown as TestResult;

function staleReport(out: string): void {
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  writeFileSync(join(out, 'screenshots', 'old.png'), 'old');
  writeFileSync(join(out, 'results.json'), '{}');
  writeFileSync(join(out, 'index.html'), 'old');
}

test('reporter clears screenshots from earlier runs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fitlocale-'));
  const out = join(dir, 'report');
  staleReport(out);
  const reporter = new FitlocaleReporter({ outputDir: out });
  reporter.onTestEnd({ id: 't' } as TestCase, attempt(makeCheck({ screenshots: [] })));
  await reporter.onEnd();
  expect(existsSync(join(out, 'screenshots', 'old.png'))).toBe(false);
  expect(existsSync(join(out, 'results.json'))).toBe(true);
});

test('reporter removes a stale report when no checks ran', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fitlocale-'));
  const out = join(dir, 'report');
  staleReport(out);
  writeFileSync(join(out, 'notes.txt'), 'not ours');
  await new FitlocaleReporter({ outputDir: out }).onEnd();
  expect(existsSync(join(out, 'results.json'))).toBe(false);
  expect(existsSync(join(out, 'index.html'))).toBe(false);
  expect(existsSync(join(out, 'screenshots'))).toBe(false);
  expect(existsSync(join(out, 'notes.txt'))).toBe(true);
});

test('reporter drops screenshots Playwright already deleted (preserveOutput: failures-only)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fitlocale-'));
  const out = join(dir, 'report');
  const check = makeCheck({
    screenshots: [{ mode: 'pseudo-long', viewport: { width: 1280, height: 800 }, path: join(dir, 'gone.png'), size: { width: 1000, height: 2000 } }],
  });
  const reporter = new FitlocaleReporter({ outputDir: out });
  reporter.onTestEnd({ id: 't' } as TestCase, attempt(check));
  await reporter.onEnd();
  const run = JSON.parse(readFileSync(join(out, 'results.json'), 'utf8')) as RunResults;
  expect(run.checks[0].screenshots).toEqual([]);
  expect(run.checks[0].issues).toHaveLength(1);
  expect(readFileSync(join(out, 'index.html'), 'utf8')).not.toContain('gone.png');
});

async function consoleOf(checks: ReturnType<typeof makeCheck>[]): Promise<string> {
  const out = join(mkdtempSync(join(tmpdir(), 'fitlocale-')), 'report');
  const reporter = new FitlocaleReporter({ outputDir: out });
  const result = {
    attachments: checks.map(c => ({ name: 'fitlocale:result', contentType: 'application/json', body: Buffer.from(JSON.stringify(c)) })),
  } as unknown as TestResult;
  reporter.onTestEnd({ id: 't1' } as TestCase, result);
  const log = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };
  try {
    await reporter.onEnd();
  } finally {
    console.log = log;
  }
  return lines.join('\n');
}

test('reporter explains how to create a missing baseline', async () => {
  const text = await consoleOf([makeCheck({ screenshots: [], baseline: { status: 'missing', path: 'fitlocale-baseline.json' } })]);
  expect(text).toContain('no baseline file yet (fitlocale-baseline.json), so no test failed');
  expect(text).toMatch(/npx fitlocale baseline \S+\/results\.json --out fitlocale-baseline\.json/);
});

test('reporter counts accepted issues', async () => {
  const text = await consoleOf([makeCheck({
    screenshots: [], baseline: { status: 'applied', path: 'fitlocale-baseline.json' },
    issues: [makeIssue({ baselined: true }), makeIssue({ selector: '#t', baselined: false })],
  })]);
  expect(text).toContain('fitlocale: 2 errors, 0 warnings, 0 info (1 accepted in the baseline) →');
  expect(text).not.toContain('no baseline file yet');
});

test('the reporter copies crops and rewrites their paths', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fitlocale-'));
  const crop = join(dir, 'crop.png');
  writeFileSync(crop, 'png');
  const check = makeCheck({
    issues: [makeIssue({ crop }), makeIssue({ crop: join(dir, 'deleted.png') })],
    screenshots: [],
  });
  const out = join(dir, 'report');
  const reporter = new FitlocaleReporter({ outputDir: out });
  reporter.onTestEnd({ id: 't' } as TestCase, attempt(check));
  await reporter.onEnd();
  const [kept, lost] = (JSON.parse(readFileSync(join(out, 'results.json'), 'utf8')) as RunResults).checks[0].issues;
  expect(kept.crop).toMatch(/^screenshots\/[0-9a-f]{12}\.png$/);
  expect(existsSync(join(out, kept.crop!))).toBe(true);
  expect(lost).not.toHaveProperty('crop');
});
