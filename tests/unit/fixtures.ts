import type { CheckResult, Issue, RunResults } from '../../src/types';

export function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    rule: 'overflow/clipped', key: 'body>button', selector: '#save', box: { x: 100, y: 200, width: 50, height: 20 },
    text: 'Save', severity: 'error', mode: 'pseudo-long', viewport: { width: 1280, height: 800 },
    url: 'http://app.test/settings', message: 'Text is cut off.', ...overrides,
  };
}

export function makeCheck(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    testTitle: 'settings', testFile: 'tests/settings.spec.ts', checkIndex: 0, url: 'http://app.test/settings',
    issues: [makeIssue()],
    screenshots: [{ mode: 'pseudo-long', viewport: { width: 1280, height: 800 }, path: 'screenshots/a.png', size: { width: 1000, height: 2000 } }],
    ...overrides,
  };
}

export function makeRun(checks: CheckResult[]): RunResults {
  return { version: 1, createdAt: '2026-10-19T00:00:00.000Z', checks, summary: { error: 0, warning: 0, info: 0 } };
}
