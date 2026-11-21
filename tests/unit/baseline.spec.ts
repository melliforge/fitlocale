import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { applyBaseline, buildBaseline, checkScope, failureSummary, fixedEntries, formatBaseline, issueId, markFailing, pruneBaseline, readBaseline, type BaselineFile, type IdScope } from '../../src/baseline';
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

test.describe('baseline file errors', () => {
  test('an empty path or a directory is not a baseline file', () => {
    expect(() => readBaseline('')).toThrow(/must be a file path/);
    expect(() => readBaseline(tmp())).toThrow(/must be a file path/);
  });

  test('another file version is refused', () => {
    const file = join(tmp(), 'b.json');
    writeFileSync(file, '{"version":2,"issues":[]}');
    expect(() => readBaseline(file)).toThrow(/has version 2; this fitlocale reads version 1/);
  });
});

test('markFailing sets fails from the baseline and failOn', () => {
  const issues = [makeIssue({ severity: 'error' }), makeIssue({ severity: 'warning', selector: '#w' }), makeIssue({ severity: 'error', selector: '#a', baselined: true })];
  markFailing(issues, i => !i.baselined, 'error');
  expect(issues.map(i => i.fails)).toEqual([true, false, false]);
  markFailing(issues, () => true, 'warning');
  expect(issues.map(i => i.fails)).toEqual([true, true, true]);
  markFailing(issues, () => true, 'never');
  expect(issues.every(i => i.fails === false)).toBe(true);
});

test.describe('check scope', () => {
  test('checkScope is stable and differs by project, title path and check index', () => {
    const a = checkScope(SCOPE);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(checkScope({ ...SCOPE, titlePath: [...SCOPE.titlePath] })).toBe(a);
    expect(checkScope({ ...SCOPE, titlePath: ['tests\\a.spec.ts', 'settings'] })).toBe(a);
    expect(checkScope({ ...SCOPE, project: 'webkit' })).not.toBe(a);
    expect(checkScope({ ...SCOPE, titlePath: ['tests/a.spec.ts', 'other'] })).not.toBe(a);
    expect(checkScope({ ...SCOPE, checkIndex: 1 })).not.toBe(a);
  });

  test('applyBaseline sets the result scope', () => {
    const result = makeCheck();
    applyBaseline(result, SCOPE, null);
    expect(result.scope).toBe(checkScope(SCOPE));
  });

  test('buildBaseline writes check from the result scope; results without scope write no check', () => {
    const scoped = makeCheck({ scope: 'abc123def456', issues: [makeIssue({ id: 'i1' })] });
    const plain = makeCheck({ issues: [makeIssue({ id: 'i2', selector: '#other' })] });
    const file = buildBaseline([makeRun([scoped, plain])]);
    expect(file.issues.find(e => e.id === 'i1')?.check).toBe('abc123def456');
    expect('check' in file.issues.find(e => e.id === 'i2')!).toBe(false);
  });
});

const entry = (id: string, check = 'c1') => ({ id, rule: 'overflow/clipped' as const, test: 't', selector: `#${id}`, mode: 'pseudo-long' as const, locale: 'en', viewport: '1280x720', check });
const fixedIn = (ids: string[], found: string[] = []) => makeCheck({
  issues: found.map(id => makeIssue({ id })), baseline: { status: 'applied', path: 'b.json', fixed: ids.map(id => { const { check: _, ...e } = entry(id); return e; }) },
});

test.describe('fixed since baseline', () => {
  test('fixedEntries: found anywhere in the runs means not fixed', () => {
    // --repeat-each or a retry: one run of the check did not find X, another did.
    expect(fixedEntries([makeRun([fixedIn(['x']), fixedIn([], ['x'])])])).toEqual([]);
  });

  test('fixedEntries merges shards and dedupes', () => {
    const got = fixedEntries([makeRun([fixedIn(['b', 'a'])]), makeRun([fixedIn(['a'])])]);
    expect(got.map(e => e.id)).toEqual(['a', 'b']);
  });

  test('prune removes only the fixed entries and keeps the rest byte-identical', () => {
    const file: BaselineFile = { version: 1, note: 'n', issues: [entry('a'), entry('b'), entry('c')] };
    const { file: pruned, removed } = pruneBaseline(file, [{ ...entry('b') }]);
    expect(removed).toBe(1);
    expect(formatBaseline(pruned)).toBe(formatBaseline({ ...file, issues: [entry('a'), entry('c')] }));
  });
});

test('a hand-written entry with only id and check can be fixed without breaking the summary', async () => {
  const { renderSummary } = await import('../../src/summary');
  const dir = tmp();
  const file = join(dir, 'b.json');
  writeFileSync(file, JSON.stringify({ version: 1, issues: [{ id: 'q', check: checkScope(SCOPE) }] }));
  const result = makeCheck({ issues: [] });
  applyBaseline(result, SCOPE, file);
  expect(result.baseline?.fixed).toHaveLength(1);
  expect(() => renderSummary(makeRun([result]), { maxRows: 50 })).not.toThrow();
});
