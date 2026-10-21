import { test, expect } from '@playwright/test';
import { buildModel } from '../../src/report/model';
import type { Issue, Screenshot } from '../../src/types';
import { makeCheck, makeIssue, makeRun } from './fixtures';

const small = { width: 390, height: 844 };
const shot = (mode: Screenshot['mode'], viewport = { width: 1280, height: 800 }, path = `s/${mode}-${viewport.width}.png`): Screenshot =>
  ({ mode, viewport, path, size: { width: 1000, height: 2000 } });

test('one problem per element across projects and viewports', () => {
  const desktop = makeIssue();
  const phone = makeIssue({ viewport: small, selector: '#save-m', key: 'm>button' });
  const model = buildModel(makeRun([
    makeCheck({ project: 'chromium', issues: [desktop, phone] }),
    makeCheck({ project: 'webkit', issues: [{ ...desktop }, { ...phone }] }),
  ]));
  expect(model.problems).toBe(1);
  expect(model.occurrences).toBe(4);
  const [problem] = model.pages[0].sections[0].problems;
  expect(problem.projects).toEqual(['chromium', 'webkit']);
  expect(problem.viewports).toEqual(['1280×800', '390×844']);
  expect(problem.occurrences).toHaveLength(4);
  expect(problem.id).toBe('p1');
  expect(model.projects).toEqual(['chromium', 'webkit']);
});

test('a different rule, text, locale, mode or accepted state is a different problem', () => {
  const variants: Array<Partial<Issue>> = [
    {}, { rule: 'overflow/escapes-box' }, { text: 'Cancel' }, { locale: 'de' }, { mode: 'pseudo-rtl' }, { baselined: true },
  ];
  const model = buildModel(makeRun([makeCheck({ issues: variants.map(v => makeIssue(v)) })]));
  expect(model.problems).toBe(6);
});

test('one text on two elements is one problem listing both selectors', () => {
  const model = buildModel(makeRun([makeCheck({ issues: [makeIssue({ selector: '#a' }), makeIssue({ selector: '#b' })] })]));
  expect(model.problems).toBe(1);
  expect(model.pages[0].sections[0].problems[0].selectors).toEqual(['#a', '#b']);
});

test('repeats of one issue id count once', () => {
  const model = buildModel(makeRun([
    makeCheck({ issues: [makeIssue({ id: 'x' })] }),
    makeCheck({ issues: [makeIssue({ id: 'x' })] }),
  ]));
  expect(model.occurrences).toBe(1);
  expect(model.pages[0].sections[0].problems[0].occurrences).toHaveLength(1);
});

test('the same issue id in two projects is two occurrences', () => {
  const model = buildModel(makeRun([
    makeCheck({ project: 'chromium', issues: [makeIssue({ id: 'x' })] }),
    makeCheck({ project: 'webkit', issues: [makeIssue({ id: 'x' })] }),
  ]));
  expect(model.occurrences).toBe(2);
  expect(model.projects).toEqual(['chromium', 'webkit']);
});

test('opaque origins keep the whole URL as the label', () => {
  const label = (urls: string[]) => buildModel(makeRun(urls.map(url => makeCheck({ url, issues: [makeIssue({ url })] })))).pages.map(p => p.label);
  expect(label(['about:blank'])).toEqual(['about:blank']);
  expect(label(['data:text/html,<p>hi</p>'])).toEqual(['data:text/html,<p>hi</p>']);
  expect(label(['about:blank', 'about:blank#x'])).toEqual(['about:blank', 'about:blank#x']);
  expect(label(['about:blank', 'http://app.test/a'])).toEqual(['about:blank', 'http://app.test/a']);
  expect(label(['http://app.test/a', 'http://app.test/b'])).toEqual(['/a', '/b']);
});

test('pages in first-seen order; a shared origin is dropped from labels', () => {
  const a = makeCheck({ url: 'http://app.test/a', issues: [makeIssue()] });
  const b = makeCheck({ url: 'http://app.test/b?lng=de', issues: [makeIssue()] });
  const model = buildModel(makeRun([a, b]));
  expect(model.pages.map(p => p.id)).toEqual(['page-1', 'page-2']);
  expect(model.pages.map(p => p.label)).toEqual(['/a', '/b?lng=de']);
  expect(model.pages.map(p => p.url)).toEqual(['http://app.test/a', 'http://app.test/b?lng=de']);

  const mixed = buildModel(makeRun([a, b, makeCheck({ url: 'http://other.test/', issues: [makeIssue()] })]));
  expect(mixed.pages.map(p => p.label)).toEqual(['http://app.test/a', 'http://app.test/b?lng=de', 'http://other.test/']);
});

test('projects come from the checks, first-seen, even when a project has no problems', () => {
  const model = buildModel(makeRun([
    makeCheck({ project: 'chromium', issues: [] }),
    makeCheck({ project: 'firefox', issues: [makeIssue({ severity: 'warning', rule: 'overflow/ellipsis' })] }),
    makeCheck({ project: 'webkit', issues: [makeIssue()] }),
  ]));
  expect(model.projects).toEqual(['chromium', 'firefox', 'webkit']);
});

test('a single page, hash and unparseable URLs', () => {
  expect(buildModel(makeRun([makeCheck({ url: 'http://app.test/a#top' })])).pages[0].label).toBe('/a#top');
  expect(buildModel(makeRun([makeCheck({ url: 'not a url' })])).pages[0].label).toBe('not a url');
});

test('a page lists the tests that checked it', () => {
  const model = buildModel(makeRun([
    makeCheck({ testTitle: 'one' }), makeCheck({ testTitle: 'two' }), makeCheck({ testTitle: 'one' }),
  ]));
  expect(model.pages[0].tests).toEqual(['one', 'two']);
});

test('sections by locale · mode, in first-seen order', () => {
  const model = buildModel(makeRun([makeCheck({ issues: [
    makeIssue({ locale: 'de', mode: 'source' }),
    makeIssue({ locale: 'en', mode: 'pseudo-rtl' }),
    makeIssue({ locale: 'de', mode: 'source', text: 'Other' }),
  ] })]));
  const sections = model.pages[0].sections;
  expect(sections.map(s => s.label)).toEqual(['de · source', 'en · pseudo-rtl']);
  expect(sections.map(s => s.id)).toEqual(['page-1-1', 'page-1-2']);
  expect(sections[0].problems).toHaveLength(2);
  expect(model.locales).toEqual(['de', 'en']);

  const missing = buildModel(makeRun([makeCheck({ issues: [{ ...makeIssue({ mode: 'source' }), locale: undefined } as unknown as Issue] })]));
  expect(missing.pages[0].sections[0].label).toBe('source');
  expect(missing.pages[0].sections[0].locale).toBe('');
});

test('problems sorted by severity, then rule; unknown severities last', () => {
  const model = buildModel(makeRun([makeCheck({ issues: [
    makeIssue({ severity: 'info', rule: 'rtl/canvas', text: 'a' }),
    makeIssue({ severity: 'warning', rule: 'overflow/ellipsis', text: 'b' }),
    makeIssue({ severity: 'error', rule: 'rtl/missing-dir', text: 'c' }),
    makeIssue({ severity: 'error', rule: 'overflow/clipped', text: 'd' }),
    makeIssue({ severity: 'fatal' as never, rule: 'overflow/overlap', text: 'e' }),
  ] })]));
  const problems = model.pages[0].sections[0].problems;
  expect(problems.map(p => p.rule)).toEqual(['overflow/clipped', 'rtl/missing-dir', 'overflow/ellipsis', 'rtl/canvas', 'overflow/overlap']);
  expect(problems.map(p => p.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
});

test('problem ids follow render order across pages and sections', () => {
  const model = buildModel(makeRun([
    makeCheck({ url: 'http://app.test/a', issues: [makeIssue({ severity: 'info', rule: 'rtl/canvas' }), makeIssue({ text: 'x' })] }),
    makeCheck({ url: 'http://app.test/b', issues: [makeIssue()] }),
  ]));
  expect(model.pages.flatMap(p => p.sections.flatMap(s => s.problems.map(q => `${q.id}:${q.rule}`))))
    .toEqual(['p1:overflow/clipped', 'p2:rtl/canvas', 'p3:overflow/clipped']);
});

test('rule rows sorted by severity, then most problems, then name; with section links', () => {
  const model = buildModel(makeRun([
    makeCheck({ url: 'http://app.test/a', issues: [
      makeIssue({ rule: 'overflow/escapes-box', text: 'a' }),
      makeIssue({ rule: 'overflow/clipped', text: 'b' }),
      makeIssue({ rule: 'overflow/clipped', text: 'c' }),
      makeIssue({ rule: 'overflow/overlap', text: 'd' }),
      makeIssue({ rule: 'overflow/ellipsis', severity: 'warning', text: 'e' }),
      makeIssue({ rule: 'overflow/clipped', text: 'f', mode: 'source', locale: 'en' }),
    ] }),
    makeCheck({ url: 'http://app.test/b', issues: [makeIssue({ rule: 'overflow/ellipsis', severity: 'warning', text: 'g' })] }),
  ]));
  expect(model.rules.map(r => [r.rule, r.severity, r.problems])).toEqual([
    ['overflow/clipped', 'error', 3],
    ['overflow/escapes-box', 'error', 1],
    ['overflow/overlap', 'error', 1],
    ['overflow/ellipsis', 'warning', 2],
  ]);
  const ellipsis = model.rules[3];
  expect(ellipsis.occurrences).toBe(2);
  expect(ellipsis.sections).toEqual([
    { id: 'page-1-1', label: '/a · en · pseudo-long' },
    { id: 'page-2-1', label: '/b · en · pseudo-long' },
  ]);
  expect(model.rules[0].sections).toEqual([
    { id: 'page-1-1', label: '/a · en · pseudo-long' },
    { id: 'page-1-2', label: '/a · en · source' },
  ]);
  expect(model.bySeverity).toEqual({ error: 5, warning: 2 });
});

test('matrix counts a problem once per project it was seen in', () => {
  const model = buildModel(makeRun([
    makeCheck({ project: 'chromium', issues: [makeIssue({ locale: 'de' }), makeIssue({ locale: 'de', viewport: small }), makeIssue({ locale: 'de', text: 'two' })] }),
    makeCheck({ project: 'webkit', issues: [makeIssue({ locale: 'de' }), makeIssue({ locale: 'fr' })] }),
  ]));
  expect(model.matrix.get('de')!.get('chromium')).toBe(2);
  expect(model.matrix.get('de')!.get('webkit')).toBe(1);
  expect(model.matrix.get('fr')!.get('webkit')).toBe(1);
  expect(model.matrix.get('fr')!.get('chromium')).toBeUndefined();

  const plain = buildModel(makeRun([makeCheck({ issues: [makeIssue({ locale: 'de' })] })]));
  expect(plain.projects).toEqual([]);
  expect(plain.matrix.get('de')!.get('')).toBe(1);
});

test('a shot per check, mode and viewport, boxing only that section\'s issues', () => {
  const clipped = makeIssue({ selector: '#a' });
  const phone = makeIssue({ selector: '#b', viewport: small });
  const rtl = makeIssue({ selector: '#c', mode: 'pseudo-rtl', rule: 'rtl/not-mirrored', severity: 'warning' });
  const model = buildModel(makeRun([
    makeCheck({ project: 'chromium', issues: [clipped, phone, rtl], screenshots: [shot('pseudo-long'), shot('pseudo-long', small), shot('pseudo-rtl')] }),
    makeCheck({ project: 'webkit', testTitle: 'other', issues: [{ ...clipped }], screenshots: [shot('pseudo-long', undefined, 'w.png')] }),
  ]));
  const [long, rtlSection] = model.pages[0].sections;
  expect(long.shots.map(s => [s.project, s.testTitle, s.viewport, s.screenshot.path])).toEqual([
    ['chromium', 'settings', '1280×800', 's/pseudo-long-1280.png'],
    ['chromium', 'settings', '390×844', 's/pseudo-long-390.png'],
    ['webkit', 'other', '1280×800', 'w.png'],
  ]);
  const problemId = long.problems[0].id;
  expect(long.shots[0].boxes).toEqual([{ problem: problemId, issue: clipped }]);
  expect(long.shots[1].boxes).toEqual([{ problem: problemId, issue: phone }]);
  expect(rtlSection.shots).toHaveLength(1);
  expect(rtlSection.shots[0].boxes.map(b => b.issue.selector)).toEqual(['#c']);
  expect(rtlSection.shots[0].boxes[0].problem).toBe(rtlSection.problems[0].id);
});

test('with no matching screenshot there is no shot and the problem is kept', () => {
  const model = buildModel(makeRun([makeCheck({ screenshots: [shot('source')] })]));
  expect(model.pages[0].sections[0].shots).toEqual([]);
  expect(model.pages[0].sections[0].problems).toHaveLength(1);
});

test('old or hand-edited results render', () => {
  const old = makeIssue();
  delete (old as Partial<Issue>).locale;
  delete (old as Partial<Issue>).id;
  const noShots = makeCheck({ issues: [old] });
  delete (noShots as Partial<typeof noShots>).screenshots;
  const model = buildModel(makeRun([
    noShots,
    makeCheck({ issues: [makeIssue({ severity: 'fatal' as never, text: 'boom' })] }),
  ]));
  expect(model.problems).toBe(2);
  expect(model.pages[0].sections[0].shots).toEqual([]);
  const sev = model.pages.flatMap(p => p.sections.flatMap(s => s.problems.map(q => q.severity)));
  expect(sev[sev.length - 1]).toBe('fatal');
  expect(model.bySeverity.fatal).toBe(1);
  expect(model.bySeverity.error).toBe(1);
});

test('an empty run', () => {
  const model = buildModel(makeRun([]));
  expect(model).toMatchObject({ pages: [], rules: [], locales: [], projects: [], problems: 0, occurrences: 0, bySeverity: {} });
  expect(model.matrix.size).toBe(0);
});
