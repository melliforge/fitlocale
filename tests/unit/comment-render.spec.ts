import { test, expect } from '@playwright/test';
import { MARKER, renderComment } from '../../src/comment/render';
import type { Issue } from '../../src/types';
import { makeCheck, makeIssue, makeRun } from './fixtures';

const issue = (over: Partial<Issue> = {}) =>
  makeIssue({ locale: 'de', viewport: { width: 390, height: 844 }, fix: 'Let the box grow.', ...over });
const results = (issues: Issue[], project = 'chromium') => makeRun([makeCheck({ issues, project })]);
const opts = { reportUrl: 'https://github.test/o/r/actions/runs/1/artifacts/2', reportLabel: 'the report artifact', sha: '0123456789abcdef', previous: false };
const render = (r: ReturnType<typeof results>, o: Partial<typeof opts> = {}) => renderComment(r, { ...opts, ...o });
const rows = (body: string) => body.split('\n').filter(l => l.startsWith('| ') && l !== '| Issue |');

test('starts with the marker and says how many issues are new', () => {
  const body = render(results([issue(), issue({ severity: 'warning', selector: '#w1' }), issue({ severity: 'warning', selector: '#w2' })]))!;
  expect(body.startsWith(`${MARKER}\n`)).toBe(true);
  expect(MARKER).toBe('<!-- fitlocale -->');
  expect(body).toContain('**fitlocale:** 3 new issues (1 error, 2 warnings)');
  expect(render(results([issue()]))).toContain('**fitlocale:** 1 new issue (1 error)');
});

test('lists at most 10 issues, errors then warnings then info', () => {
  const list = [
    ...Array.from({ length: 6 }, (_, i) => issue({ severity: 'info', selector: `#i${i}` })),
    ...Array.from({ length: 6 }, (_, i) => issue({ severity: 'warning', selector: `#w${i}` })),
    ...Array.from({ length: 2 }, (_, i) => issue({ severity: 'error', selector: `#e${i}` })),
  ];
  const body = render(results(list))!;
  expect(rows(body)).toHaveLength(10);
  expect([...body.matchAll(/<code>#(\w)\d<\/code>/g)].map(m => m[1]).join('')).toBe('eewwwwwwii');
  expect(body).toContain('…and 4 more in the full report.');
});

test('each row has the rule, locale · mode · viewport · project, message and fix; then the report link', () => {
  const body = render(results([issue()]))!;
  expect(body).toContain('<code>overflow/clipped</code>');
  expect(body).toContain('de · pseudo-long · 390×844 · chromium');
  expect(body).toContain('Text is cut off.');
  expect(body).toContain('Let the box grow.');
  expect(body).toContain('[the report artifact](https://github.test/o/r/actions/runs/1/artifacts/2)');
});

test('body starts with the marker and has no image', () => {
  const body = render(results([issue({ crop: 'screenshots/c.png' })]))!;
  expect(body.split('\n')[0]).toBe(MARKER);
  expect(body).not.toContain('<img');
});

test('footer names the commit, or just fitlocale without one', () => {
  expect(render(results([issue()]), { sha: 'abcdef1234' })).toContain('<sub>fitlocale · commit <code>abcdef1</code></sub>');
  expect(render(results([issue()]), { sha: '' })!.endsWith('<sub>fitlocale</sub>')).toBe(true);
});

test('baselined issues are not listed', () => {
  const body = render(results([issue({ selector: '#new' }), issue({ selector: '#old', baselined: true })]))!;
  expect(body).toContain('1 new issue');
  expect(body).toContain('#new');
  expect(body).not.toContain('#old');
});

test('the same issue from several report dirs is listed once', () => {
  const twice = makeRun([makeCheck({ issues: [issue({ id: 'same' })] }), makeCheck({ issues: [issue({ id: 'same' })] })]);
  expect(rows(render(twice)!)).toHaveLength(1);
});

test('hostile text stays inert', () => {
  const evil = '@org/team ![x](https://evil.test/a.png) <details> | #123\nnext';
  const body = render(results([issue({ message: evil, selector: evil, locale: evil, fix: evil, text: evil })], evil))!;
  expect(body).not.toContain('@org');
  expect(body).toContain('@​org');
  expect(body).not.toContain('](https://evil');
  expect(body).not.toContain('<details>');
  expect(body).toContain('#\u200b123');
  const listed = rows(body);
  expect(listed).toHaveLength(1);
  // One cell per row: no pipe from the data splits it, and no newline breaks it.
  for (const row of listed) {
    expect(row).toMatch(/^\| .* \|$/);
    expect(row.split('|')).toHaveLength(3);
  }
  // The report link's URL cannot close the attribute or the link.
  expect(render(results([issue()]), { reportUrl: 'https://x.test/a"b)c' })).toContain('(https://x.test/a%22b%29c)');
});

// GitHub links these on decoded text, so an entity is not enough: a zero-width space or an escaped ':' / '.' breaks them.
test('bare URLs, www addresses and issue references are not linked', () => {
  const refs = 'see https://evil.test/x and www.evil.test, #7, owner/repo#7, GH-5, JIRA-12, $x^2$';
  const body = render(results([issue({ message: refs, fix: refs, selector: '#save-2 https://evil.test/y www.evil.test' })]))!;
  const listed = rows(body).join('\n');
  // URLs autolink even inside <code>: escaped everywhere.
  expect(listed).not.toContain('://');
  expect(listed).not.toContain('www.');
  // Outside <code>, references, mentions and math are broken; inside it GitHub links none, so the selector is as typed.
  const outside = listed.replace(/<code>.*?<\/code>/g, '');
  expect(outside).not.toMatch(/(?<!&)#\d/);
  expect(outside).not.toMatch(/-\d/);
  expect(outside).not.toMatch(/(^|[^\u200b])\$/);
  expect(listed).toContain('<code>#save-2 https&#58;//evil&#46;test/y www&#46;evil&#46;test</code>');
  // A sentence keeps its full stop as typed.
  expect(render(results([issue({ message: 'Text is cut off.' })]))).toContain('Text is cut off.<br>');
});

test('a huge report stays under GitHub\'s limit', () => {
  const long = 'x'.repeat(10_000);
  const list = Array.from({ length: 1000 }, (_, i) => issue({ selector: `#s${i}${long}`, message: long, fix: long, text: long }));
  const body = render(results(list))!;
  expect(body.length).toBeLessThan(65_536);
  expect(rows(body)).toHaveLength(10);
  expect(body).toContain('…and 990 more in the full report.');
});

test('null when nothing is new and there is no previous comment', () => {
  expect(render(results([issue({ baselined: true })]))).toBeNull();
  expect(render(results([]))).toBeNull();
});

test('"All clear" when nothing is new but there was a previous comment', () => {
  const body = render(results([]), { previous: true })!;
  expect(body.startsWith(MARKER)).toBe(true);
  expect(body).toContain('All clear: no new issues since the last run.');
});
