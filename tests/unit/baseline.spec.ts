import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { applyBaseline, buildBaseline, failureSummary, formatBaseline, issueId, readBaseline, type IdScope } from '../../src/baseline';
import { makeCheck, makeIssue, makeRun } from './fixtures';

const SCOPE: IdScope = { project: 'chromium', titlePath: ['tests/a.spec.ts', 'settings'], checkIndex: 0 };
const ISSUE = makeIssue();
const tmp = () => mkdtempSync(join(tmpdir(), 'fitlocale-baseline-'));

test.describe('issueId', () => {
  test('is 16 hex characters and stable', () => {
    expect(issueId(SCOPE, ISSUE)).toMatch(/^[0-9a-f]{16}$/);
    expect(issueId(SCOPE, ISSUE)).toBe(issueId({ ...SCOPE, titlePath: [...SCOPE.titlePath] }, { ...ISSUE }));
  });

  test('changes with where and what the issue is', () => {
    const id = issueId(SCOPE, ISSUE);
    const variants = [
      issueId({ ...SCOPE, project: 'mobile' }, ISSUE),
      issueId({ ...SCOPE, titlePath: ['tests/a.spec.ts', 'billing'] }, ISSUE),
      issueId({ ...SCOPE, checkIndex: 1 }, ISSUE),
      issueId(SCOPE, { ...ISSUE, rule: 'overflow/ellipsis' }),
      issueId(SCOPE, { ...ISSUE, mode: 'pseudo-rtl' }),
      issueId(SCOPE, { ...ISSUE, locale: 'de' }),
      issueId(SCOPE, { ...ISSUE, viewport: { width: 390, height: 844 } }),
      issueId(SCOPE, { ...ISSUE, selector: '#other' }),
    ];
    for (const v of variants) expect(v).not.toBe(id);
    expect(new Set(variants).size).toBe(variants.length);
  });

  test('ignores text, url, box and message', () => {
    const changed = makeIssue({ text: 'Other', url: 'http://app.test/x?y=1', box: { x: 1, y: 2, width: 3, height: 4 }, message: 'm' });
    expect(issueId(SCOPE, changed)).toBe(issueId(SCOPE, ISSUE));
  });

  test('Windows and POSIX test paths give the same id', () => {
    expect(issueId({ ...SCOPE, titlePath: ['tests\\a.spec.ts', 't'] }, ISSUE))
      .toBe(issueId({ ...SCOPE, titlePath: ['tests/a.spec.ts', 't'] }, ISSUE));
  });
});

test.describe('readBaseline', () => {
  test('a missing file is null', () => {
    expect(readBaseline(join(tmp(), 'none.json'))).toBeNull();
  });

  test('reads the ids', () => {
    const file = join(tmp(), 'b.json');
    writeFileSync(file, '{"version":1,"issues":[{"id":"abc"}]}');
    expect(readBaseline(file)).toEqual(new Set(['abc']));
  });

  test('invalid JSON is a clear error', () => {
    const file = join(tmp(), 'b.json');
    writeFileSync(file, '{ bad');
    expect(() => readBaseline(file)).toThrow(/^fitlocale: baseline file .* is not valid JSON/);
  });

  test('a file without an issues list is a clear error', () => {
    const file = join(tmp(), 'b.json');
    writeFileSync(file, '{"version":1}');
    expect(() => readBaseline(file)).toThrow(/has no "issues" list/);
  });
});

test.describe('buildBaseline', () => {
  const a = makeIssue({ id: 'a000000000000000' });
  const b = makeIssue({ id: 'b000000000000000', selector: '#b' });

  test('merges runs, drops duplicates and sorts by id', () => {
    const file = buildBaseline([makeRun([makeCheck({ issues: [b, a] })]), makeRun([makeCheck({ issues: [a] })])]);
    expect(file.version).toBe(1);
    expect(file.note).toMatch(/^Accepted fitlocale issues/);
    expect(file.issues.map(e => e.id)).toEqual(['a000000000000000', 'b000000000000000']);
    expect(file.issues[0]).toEqual({
      id: 'a000000000000000', rule: 'overflow/clipped', test: 'tests/settings.spec.ts › settings',
      selector: '#save', mode: 'pseudo-long', locale: 'en', viewport: '1280x800',
    });
  });

  test('records the project when there is one', () => {
    const file = buildBaseline([makeRun([makeCheck({ project: 'mobile', issues: [a] })])]);
    expect(file.issues[0].project).toBe('mobile');
  });

  test('issues without an id cannot be accepted', () => {
    expect(() => buildBaseline([makeRun([makeCheck({ issues: [makeIssue()] })])])).toThrow(/without an id/);
  });

  test('formatBaseline is pretty JSON with a trailing newline', () => {
    const file = buildBaseline([makeRun([makeCheck({ issues: [a] })])]);
    const text = formatBaseline(file);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "issues": [');
    expect(JSON.parse(text)).toEqual(file);
  });
});

test.describe('applyBaseline', () => {
  const file = () => {
    const path = join(tmp(), 'b.json');
    writeFileSync(path, JSON.stringify({ version: 1, issues: [{ id: issueId(SCOPE, makeIssue({ selector: '#s' })) }] }));
    return path;
  };
  const check = () => makeCheck({ issues: [makeIssue({ selector: '#s' }), makeIssue({ selector: '#t' })] });

  test('ids every issue; with a file, marks accepted ones and only new ones count', () => {
    const result = check();
    const { counts } = applyBaseline(result, SCOPE, file());
    expect(result.issues.map(i => i.id)).toEqual([issueId(SCOPE, result.issues[0]), issueId(SCOPE, result.issues[1])]);
    expect(result.issues.map(i => [i.baselined, counts(i)])).toEqual([[true, false], [false, true]]);
    expect(result.baseline?.status).toBe('applied');
    expect(result.baseline?.path).not.toMatch(/\\/);
  });

  test('a missing file: nothing counts', () => {
    const result = check();
    const { counts } = applyBaseline(result, SCOPE, join(tmp(), 'none.json'));
    expect(result.baseline?.status).toBe('missing');
    expect(result.issues.some(counts)).toBe(false);
  });

  test('baseline off: everything counts, nothing is marked', () => {
    const result = check();
    const { counts } = applyBaseline(result, SCOPE, null);
    expect(result.baseline).toBeUndefined();
    expect(result.issues.every(counts)).toBe(true);
    expect(result.issues.every(i => i.baselined === undefined && i.id)).toBe(true);
  });

  test('failureSummary lists failing issues and mentions accepted ones', () => {
    const failing = [makeIssue({ selector: '#t' })];
    expect(failureSummary(failing, 0)).toBe('fitlocale found 1 issue(s):\n  overflow/clipped #t (pseudo-long)');
    expect(failureSummary(failing, 2, 'fitlocale-baseline.json')).toBe(
      'fitlocale found 1 issue(s):\n  overflow/clipped #t (pseudo-long)\n(2 more accepted in fitlocale-baseline.json)');
  });
});
