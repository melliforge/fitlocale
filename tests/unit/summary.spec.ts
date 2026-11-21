import { test, expect } from '@playwright/test';
import { renderSummary } from '../../src/summary';
import { makeCheck, makeIssue, makeRun } from './fixtures';

const rows = (md: string) => md.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| Severity'));
const unescapedPipes = (line: string) => (line.match(/(?<!\\)\|/g) ?? []).length;

test('counts new issues and accepted ones', () => {
  const md = renderSummary(makeRun([makeCheck({
    issues: [makeIssue(), makeIssue({ selector: '#b' }), makeIssue({ selector: '#c', baselined: true })],
  })]), { maxRows: 50 });
  expect(md.startsWith('## fitlocale\n')).toBe(true);
  expect(md).toContain('**2 new errors**, 0 new warnings, 0 new info · 1 accepted in the baseline');
  expect(rows(md)).toHaveLength(2);
});

test('the missing-baseline note appears only when the baseline file is missing', () => {
  const missing = renderSummary(makeRun([makeCheck({ baseline: { status: 'missing', path: 'fitlocale-baseline.json' } })]),
    { maxRows: 50, resultsPath: 'fitlocale-report/results.json' });
  expect(missing).toContain('> No baseline file yet, so no test failed. Accept these issues with `npx fitlocale baseline fitlocale-report/results.json --out fitlocale-baseline.json`');
  const applied = renderSummary(makeRun([makeCheck({ baseline: { status: 'applied', path: 'fitlocale-baseline.json' } })]), { maxRows: 50 });
  expect(applied).not.toContain('No baseline file yet');
});

test('cell text cannot break the table or inject HTML', () => {
  const md = renderSummary(makeRun([makeCheck({ testTitle: 'x\ny <b>', issues: [makeIssue({ selector: 'a|b`c<d' })] })]), { maxRows: 50 });
  const [row] = rows(md);
  expect(unescapedPipes(row)).toBe(8);
  expect(row).toContain('`a\\|b\'c<d`');
  expect(row).toContain('x y &lt;b>');
  expect(md).not.toContain('\ny <b>');
});

test('long lists stop at maxRows', () => {
  const issues = Array.from({ length: 120 }, (_, i) => makeIssue({ selector: `#e${i}` }));
  const md = renderSummary(makeRun([makeCheck({ issues })]), { maxRows: 50 });
  expect(rows(md)).toHaveLength(50);
  expect(md).toContain('…and 70 more in the fitlocale report artifact.');
});

test('errors come first', () => {
  const md = renderSummary(makeRun([makeCheck({
    issues: [makeIssue({ severity: 'warning', rule: 'overflow/ellipsis' }), makeIssue({ severity: 'error' })],
  })]), { maxRows: 50 });
  expect(rows(md).map(r => r.split('|')[1].trim())).toEqual(['error', 'warning']);
});

test('no issues: one line, no table', () => {
  const md = renderSummary(makeRun([makeCheck({ issues: [] })]), { maxRows: 50 });
  expect(md).toContain('**No new issues.**');
  expect(md).not.toContain('| Severity');
});

test('the missing-baseline command writes the file where the tests look for it', () => {
  const md = renderSummary(makeRun([makeCheck({ baseline: { status: 'missing', path: 'e2e/fitlocale-baseline.json' } })]),
    { maxRows: 50, resultsPath: 'fitlocale-report/results.json' });
  expect(md).toContain('`npx fitlocale baseline fitlocale-report/results.json --out e2e/fitlocale-baseline.json`');
});

test('a repeated test (--repeat-each) gives one row per issue', () => {
  const issue = makeIssue({ id: 'a000000000000000' });
  const md = renderSummary(makeRun([makeCheck({ issues: [issue] }), makeCheck({ issues: [issue] })]), { maxRows: 50 });
  expect(rows(md)).toHaveLength(1);
});

test('issues that do not fail the test are marked, and the headline counts failing ones', () => {
  const md = renderSummary(makeRun([makeCheck({
    issues: [makeIssue({ fails: true }), makeIssue({ selector: '#w', severity: 'warning', rule: 'overflow/ellipsis', fails: false })],
  })]), { maxRows: 50 });
  expect(md).toContain('**1 failing**');
  const [errorRow, warningRow] = rows(md);
  expect(errorRow.trim().endsWith('| yes |')).toBe(true);
  expect(warningRow.trim().endsWith('|  |')).toBe(true);
});

test('summary names the project of each row', () => {
  const md = renderSummary(makeRun([makeCheck({ project: 'webkit', issues: [makeIssue()] }), makeCheck({ issues: [makeIssue({ selector: '#b' })] })]), { maxRows: 50 });
  const [withProject, without] = rows(md);
  expect(withProject).toMatch(/\[webkit\] \|/);
  expect(without).not.toContain('[');
});

const fixedEntry = (over: Record<string, string> = {}) => ({ id: 'x1', rule: 'overflow/clipped' as const, test: 'tests/a.spec.ts › settings', selector: '#save', mode: 'pseudo-long' as const, locale: 'en', viewport: '1280x720', ...over });

test('summary lists fixed entries with the prune command', () => {
  const md = renderSummary(makeRun([makeCheck({ issues: [], baseline: { status: 'applied', path: 'fitlocale-baseline.json', fixed: [fixedEntry()] } })]),
    { maxRows: 50, resultsPath: 'fitlocale-report/results.json' });
  expect(md).toContain('> 1 accepted issue(s) no longer occur. Drop them with `npx fitlocale baseline --prune fitlocale-report/results.json --out fitlocale-baseline.json`.');
  expect(md).toContain('| `overflow/clipped` | `#save` | tests/a.spec.ts › settings | 1280x720 |');
});

test('summary hints once for a legacy baseline', () => {
  const legacy = { status: 'applied' as const, path: 'fitlocale-baseline.json', legacy: true as const };
  const md = renderSummary(makeRun([makeCheck({ baseline: legacy }), makeCheck({ baseline: legacy })]), { maxRows: 50, resultsPath: 'r.json' });
  expect(md.match(/Fixed issues can't be told apart/g)).toHaveLength(1);
});

test('fixed entries with markup stay inert in the summary', () => {
  const md = renderSummary(makeRun([makeCheck({ issues: [], baseline: { status: 'applied', path: 'b.json', fixed: [fixedEntry({ selector: '<img src=x onerror=alert(1)>', test: 'a | b <script>' })] } })]), { maxRows: 50 });
  const row = md.split('\n').find(l => l.includes('overflow/clipped'))!;
  expect(unescapedPipes(row)).toBe(5);
  expect(row).not.toContain('<script>');
});
