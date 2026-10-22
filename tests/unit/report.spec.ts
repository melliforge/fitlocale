import { test, expect } from '@playwright/test';
import { renderReport } from '../../src/report/html';
import ts from 'typescript';
import { HEAD_SCRIPT, SCRIPT } from '../../src/report/script';
import { STYLES } from '../../src/report/styles';
import type { CheckResult } from '../../src/types';
import { makeCheck, makeIssue, makeRun } from './fixtures';

/** The detail article of a problem, as rendered. */
function detailOf(html: string, id: string): string {
  const start = html.indexOf(`<article class="detail" id="d-${id}" `);
  expect(start, `detail of ${id}`).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('</article>', start));
}

test('report groups by page, then locale · mode', () => {
  const html = renderReport(makeRun([
    makeCheck({ url: 'http://app.test/a', issues: [makeIssue({ url: 'http://app.test/a' }), makeIssue({ url: 'http://app.test/a', mode: 'pseudo-rtl', rule: 'rtl/not-mirrored' })] }),
    makeCheck({ url: 'http://app.test/b', issues: [makeIssue({ url: 'http://app.test/b' })] }),
  ]));
  // The shared origin is dropped from page labels.
  expect(html.match(/<h2[^>]*>\/a<\/h2>/g)).toHaveLength(1);
  expect(html.match(/<h2[^>]*>\/b<\/h2>/g)).toHaveLength(1);
  const a = html.indexOf('<h2>/a</h2>'), b = html.indexOf('<h2>/b</h2>');
  const long = html.indexOf('<h3>en · pseudo-long</h3>'), rtl = html.indexOf('<h3>en · pseudo-rtl</h3>');
  expect(long).toBeGreaterThan(a);
  expect(rtl).toBeGreaterThan(a);
  expect(long).toBeLessThan(b);
  expect(rtl).toBeLessThan(b);
});

test('report escapes HTML and keeps Arabic', () => {
  const html = renderReport(makeRun([makeCheck({ issues: [makeIssue({ text: '</script><img src=x onerror=alert(1)>مرحبا' })] })]));
  expect(html).toContain('&lt;/script&gt;&lt;img');
  expect(html).toContain('مرحبا');
  expect(html).not.toContain('<img src=x onerror');
});

test('report is offline', () => {
  const html = renderReport(makeRun([makeCheck()]));
  expect(html).not.toMatch(/(src|href)=["']?https?:/);
  expect(html).not.toContain('<link rel="stylesheet"');
});

test('overlay boxes use percentages', () => {
  const html = renderReport(makeRun([makeCheck()]));
  expect(html).toContain('left:10%;top:10%;width:5%;height:1%');
});

// Chromium starts a right-to-left page's full screenshot at its leftmost overflow, not at the page's origin.
test('overlay boxes follow the screenshot origin', () => {
  const check = makeCheck({
    issues: [makeIssue({ mode: 'pseudo-rtl', rule: 'rtl/not-mirrored', severity: 'warning', box: { x: 50, y: 200, width: 50, height: 20 } })],
    screenshots: [{ mode: 'pseudo-rtl', viewport: { width: 1280, height: 800 }, path: 'screenshots/a.png', size: { width: 1000, height: 2000 }, origin: { x: 50, y: 0 } }],
  });
  expect(renderReport(makeRun([check]))).toContain('left:10%;top:10%;width:5%;height:1%');
});

test('empty run', () => {
  expect(renderReport(makeRun([]))).toContain('No localization layout issues found.');
});

test('every value from results.json is escaped', () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const source = { url: evil, line: evil as never, column: 1, selector: evil, property: evil, value: evil, replacement: evil, original: { url: evil, line: evil as never, column: 1 } };
  const run = makeRun([makeCheck({
    testTitle: evil, project: evil,
    issues: [makeIssue({ severity: evil as never, mode: evil as never, viewport: { width: evil as never, height: 1 }, selector: evil, text: evil, fix: evil, message: evil, source })],
    screenshots: [{ mode: evil as never, viewport: { width: evil as never, height: 1 }, path: 'a.png', size: { width: 1000, height: 2000 } }],
  })]);
  run.summary = { error: evil as never, warning: 0, info: 0 };
  const html = renderReport(run);
  expect(html).not.toContain('<img src=x');
  expect(html).toContain('<span class="sev">&quot;&gt;&lt;img src=x onerror=alert(1)&gt;</span>');
  // The detail panel shows the selector, text, CSS source and test titles too.
  const detail = detailOf(html, 'p1');
  expect(detail).not.toContain('<img src=x');
  expect(detail).toContain('<code>&quot;&gt;&lt;img src=x onerror=alert(1)&gt;</code>');
  expect(detail).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;:&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'); // url:line
});

test('sections are labelled locale · mode', () => {
  const html = renderReport(makeRun([makeCheck({ issues: [makeIssue({ locale: 'de', mode: 'source' })] })]));
  expect(html).toContain('<h3>de · source</h3>');
});

test('issue boxes stay visible on any background, in light and dark mode', async ({ page }) => {
  // Warning orange is close to yellow (especially the dark-mode shade), so boxes also get a dark and a light ring.
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.setContent(renderReport(makeRun([makeCheck({ issues: [makeIssue({ severity: 'warning' })] })])));
    const shadow = await page.locator('.box.warning').evaluate(el => getComputedStyle(el).boxShadow);
    expect(shadow).toContain('rgb(0, 0, 0)');
    expect(shadow).toContain('rgb(255, 255, 255)');
  }
});

test('accepted issues are marked and can be hidden', () => {
  const run = makeRun([makeCheck({
    issues: [makeIssue({ baselined: true }), makeIssue({ selector: '#t' })],
  })]);
  run.summary = { error: 2, warning: 0, info: 0 };
  const html = renderReport(run);
  expect(html).toContain('<tr class="problem error accepted"');
  expect(html).toContain('<span class="tag">accepted</span>');
  expect(html).toContain('box error accepted');
  expect(html).toContain('2 problem(s) · 2 issue(s) · 1 new · 1 accepted');
  expect(html).toContain('data-sev="accepted"');
});

test('the accepted toggle counts problems, like the severity toggles; the header counts issues', () => {
  // One accepted problem seen on two elements, plus one new problem.
  const run = makeRun([makeCheck({
    issues: [makeIssue({ baselined: true, selector: '#a' }), makeIssue({ baselined: true, selector: '#b' }), makeIssue({ text: 'Other' })],
  })]);
  run.summary = { error: 3, warning: 0, info: 0 };
  const html = renderReport(run);
  expect(html).toContain('2 problem(s) · 3 issue(s) · 1 new · 2 accepted');
  expect(html).toContain('data-sev="accepted"> 1 accepted in the baseline');
  expect(html).toContain('data-sev="error"> 2 error');
});

test('without accepted issues the report has no accepted toggle', () => {
  const html = renderReport(makeRun([makeCheck()]));
  expect(html).not.toContain('data-sev="accepted"');
  expect(html).not.toContain(' accepted');
});

test('a problem found in two projects is one row with both screenshots', () => {
  const check = (project: string) => makeCheck({
    project, issues: [makeIssue({ mode: 'source', locale: undefined })],
    screenshots: [{ mode: 'source', viewport: { width: 1280, height: 800 }, path: `shots/${project}.png`, size: { width: 1280, height: 800 } }],
  });
  const html = renderReport(makeRun([check('chromium'), check('firefox')]));
  expect(html.match(/<tr class="problem/g)).toHaveLength(1);
  expect(html).toContain('data-projects="[&quot;chromium&quot;,&quot;firefox&quot;]"');
  expect(html).toContain('chromium, firefox · 1280×800 · 2×');
  const section = html.indexOf('<details class="section" open id="page-1-1">');
  const end = html.indexOf('</details>\n', section);
  expect(section).toBeGreaterThan(-1);
  for (const path of ['shots/chromium.png', 'shots/firefox.png']) {
    expect(html.indexOf(path)).toBeGreaterThan(section);
    expect(html.indexOf(path)).toBeLessThan(end);
  }
  expect(html).toContain('<figure class="shot-wrap" data-project="firefox">');
});

test('without projects there is no project filter or column', () => {
  const html = renderReport(makeRun([makeCheck({ issues: [makeIssue({ locale: 'de', mode: 'source' })] })]));
  expect(html).toContain('<h3>de · source</h3>');
  expect(html).not.toContain('data-filter="project"');
  expect(html).toContain('<td class="seen">1280×800</td>');
  expect(html).not.toContain(' · undefined');
});

test('the summary lists each rule with its problems and links to its sections', () => {
  const html = renderReport(makeRun([makeCheck()]));
  const summary = html.slice(html.indexOf('<section id="summary">'), html.indexOf('</section>'));
  expect(summary).toContain('data-pick-rule="overflow/clipped"');
  expect(summary).toContain('href="#page-1-1"');
});

test('a rule seen in many sections links the first 8 and counts the rest', () => {
  const locales = Array.from({ length: 10 }, (_, i) => `l${i}`);
  const html = renderReport(makeRun([makeCheck({ issues: locales.map(locale => makeIssue({ locale })) })]));
  const row = /<tr class="error"><td><span class="sev">error<\/span><\/td><td><button type="button" class="pick" data-pick-rule="overflow\/clipped">.*?<\/tr>/.exec(html)![0];
  expect(row.match(/<a href="#page-1-\d+">/g)).toHaveLength(8);
  expect(row).toContain('href="#page-1-8"');
  expect(row).not.toContain('href="#page-1-9"');
  expect(row).toContain(' and 2 more</td>');
});

test('the element cell shows a readable label and keeps the full selector', () => {
  const selector = 'body > div:nth-child(2) > div:nth-child(3) > form > div:nth-child(4) > button:nth-child(1)';
  const html = renderReport(makeRun([makeCheck({ issues: [makeIssue({ text: 'Save', selector, key: 'body>div:nth-child(2)>form>button:nth-child(1)' })] })]));
  expect(html).toContain('<span class="label" dir="auto">Save</span>');
  const escaped = selector.replace(/>/g, '&gt;');
  expect(html).toMatch(new RegExp(`<details class="sel">(?:(?!</details>).)*${escaped.replace(/[()]/g, '\\$&')}`, 's'));
});

test('screenshots are lazy thumbnails', () => {
  const html = renderReport(makeRun([makeCheck()]));
  expect(html).toContain('loading="lazy"');
  expect(html).toContain('class="shot-wrap"');
});

test('sections are open without JavaScript', () => {
  const html = renderReport(makeRun([
    makeCheck({ url: 'http://app.test/a', issues: [makeIssue({ url: 'http://app.test/a' }), makeIssue({ url: 'http://app.test/a', mode: 'pseudo-rtl' })] }),
    makeCheck({ url: 'http://app.test/b', issues: [makeIssue({ url: 'http://app.test/b', locale: 'de' })] }),
  ]));
  const tags = html.match(/<details class="(?:page|section)"[^>]*>/g) ?? [];
  expect(tags).toHaveLength(5);
  for (const tag of tags) expect(tag).toMatch(/ open[ >]/);
});

test('a 0.4.2 results.json renders', () => {
  const bare = makeCheck({ url: 'http://app.test/b', issues: [makeIssue({ url: 'http://app.test/b' })] });
  delete (bare as Partial<CheckResult>).screenshots;
  const run = makeRun([makeCheck(), bare]);
  let html = '';
  expect(() => { html = renderReport(run); }).not.toThrow();
  expect(html.match(/<tr class="problem/g)).toHaveLength(2);
});

test('a large run renders quickly', () => {
  const viewports = [{ width: 1280, height: 800 }, { width: 390, height: 844 }];
  const checks: CheckResult[] = [];
  for (let t = 0; t < 16; t++) {
    const url = `http://app.test/page-${t}`;
    for (const project of ['chromium', 'webkit']) {
      for (const locale of ['de', 'fr', 'ar', 'ja']) {
        checks.push(makeCheck({
          testTitle: `test ${t}`, url, project,
          issues: viewports.flatMap(viewport => Array.from({ length: 40 }, (_, i) => makeIssue({
            url, locale, viewport, text: `Label ${t} ${locale} ${i}`,
            key: `body>div:nth-child(${i + 1})>span`, selector: `body > div:nth-child(${i + 1}) > span`,
            id: `${t}-${project}-${locale}-${viewport.width}-${i}`,
          }))),
          screenshots: viewports.map(viewport => ({ mode: 'pseudo-long', viewport, path: `shots/${t}-${project}-${locale}-${viewport.width}.png`, size: { width: viewport.width, height: 3000 } })),
        }));
      }
    }
  }
  expect(checks.reduce((n, c) => n + c.issues.length, 0)).toBe(10240);
  const start = Date.now();
  const html = renderReport(makeRun(checks));
  expect(Date.now() - start).toBeLessThan(3000);
  expect(html.match(/<tr class="problem/g)).toHaveLength(2560);
  // The detail screenshots are built in the browser, not shipped: this run was 8.2 MB when they were rendered here.
  expect(Buffer.byteLength(html)).toBeLessThan(6 * 1024 * 1024);
});

test('the report uses the docs theme tokens', () => {
  const html = renderReport(makeRun([makeCheck()]));
  for (const token of ['#3451b2', '#f6f6f7', '#1b1b1f']) expect(html).toContain(token);
});

test('the sidebar lists pages and sections with counts', async ({ page }) => {
  await page.setContent(renderReport(makeRun([
    makeCheck({ url: 'http://app.test/a', issues: [makeIssue({ url: 'http://app.test/a' }), makeIssue({ url: 'http://app.test/a', text: 'Other' }), makeIssue({ url: 'http://app.test/a', locale: 'de' })] }),
    makeCheck({ url: 'http://app.test/b', issues: [makeIssue({ url: 'http://app.test/b' })] }),
  ])));
  const nav = page.locator('nav.sidebar');
  await expect(nav.locator('a[href="#summary"]')).toHaveText('Overview');
  await expect(nav.locator('a[href="#page-1"]')).toContainText('/a');
  await expect(nav.locator('a[href="#page-1"]')).toContainText('3');
  await expect(nav.locator('a[href="#page-1-1"]')).toContainText('en · pseudo-long');
  await expect(nav.locator('a[href="#page-1-1"]')).toContainText('2');
  await expect(nav.locator('a[href="#page-1-2"]')).toContainText('de · pseudo-long');
  await expect(nav.locator('a[href="#page-2-1"]')).toContainText('1');
  // The filters live in the sidebar too.
  await expect(nav.locator('[data-sev="error"]')).toHaveCount(1);
  await expect(nav.locator('select[data-filter="locale"]')).toHaveCount(1);
});

test('the overview shows stat cards', async ({ page }) => {
  const run = makeRun([makeCheck({ issues: [
    makeIssue({ severity: 'error', text: 'E1' }), makeIssue({ severity: 'error', text: 'E2', baselined: true }),
    makeIssue({ severity: 'warning', text: 'W' }), makeIssue({ severity: 'info', text: 'I1' }), makeIssue({ severity: 'info', text: 'I2' }), makeIssue({ severity: 'info', text: 'I3' }),
  ] })]);
  await page.setContent(renderReport(run));
  const stat = (name: string) => page.locator(`#summary .stat[data-stat="${name}"] .n`);
  await expect(stat('error')).toHaveText('2');
  await expect(stat('warning')).toHaveText('1');
  await expect(stat('info')).toHaveText('3');
  await expect(stat('accepted')).toHaveText('1');
  await expect(page.locator('.stat')).toHaveCount(4);
});

test('styles and script come from their modules', () => {
  const html = renderReport(makeRun([makeCheck()]));
  expect(html).toContain(STYLES);
  expect(html).toContain(SCRIPT);
  // Plain ES2017 DOM code that can sit inside a <script> element.
  for (const banned of ['</script', '?.', '??', 'innerHTML', 'http:', 'https:']) expect(SCRIPT).not.toContain(banned);
  for (const banned of ['http:', 'https:', '@import']) expect(STYLES).not.toContain(banned);
});

/**
 * The scripts must run as written in ES2017 browsers. TypeScript, targeting ES2017, rewrites only syntax newer than
 * that (object spread, `?.`, `??`, `**=`, async iteration, class fields...) and copies everything else token for token.
 * So the scripts are ES2017 exactly when the transpiled tokens equal the source tokens: no `__assign` or other helper,
 * no `_a` temporary, no rewritten expression. Comments and whitespace are trivia and are skipped; semicolons are
 * skipped too, as the printer may add one where the source relies on automatic insertion.
 */
function tokens(code: string): string[] {
  const scanner = ts.createScanner(ts.ScriptTarget.ESNext, true, ts.LanguageVariant.Standard, code);
  const out: string[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind !== ts.SyntaxKind.SemicolonToken) out.push(scanner.getTokenText());
  }
  return out;
}

for (const [name, code] of [['SCRIPT', SCRIPT], ['HEAD_SCRIPT', HEAD_SCRIPT]] as const) {
  test(`${name} is ES2017: transpiling it to ES2017 changes nothing`, () => {
    const out = ts.transpileModule(code, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.None } });
    expect(out.diagnostics ?? []).toEqual([]);
    expect(out.outputText).not.toMatch(/\b__\w+|\b_[a-z]\b/);
    expect(tokens(out.outputText)).toEqual(tokens(code));
  });
}

test('the check above catches newer syntax', () => {
  const lowered = (code: string) => {
    const out = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.None } }).outputText;
    return tokens(out).join(' ') !== tokens(code).join(' ');
  };
  expect(lowered('var a = { b: 1 }; var c = { ...a };')).toBe(true);
  expect(lowered('var a = null; var b = a?.c;')).toBe(true);
  expect(lowered('var a = null; var b = a ?? 1;')).toBe(true);
  expect(lowered('try { f(); } catch { g(); }')).toBe(true);
  expect(lowered('var a = { b: 1 }; var c = Object.assign({}, a);')).toBe(false);
});

test('the panel announces copying, and the row selector summary is readable', () => {
  const html = renderReport(makeRun([makeCheck()]));
  expect(html).toMatch(/<aside class="panel"[^>]*>[\s\S]*<span class="sr" data-announce aria-live="polite"><\/span>/);
  // 12px text needs the secondary colour (about 5:1), not the tertiary one (about 3:1).
  expect(STYLES).toMatch(/\.sel summary \{ color:var\(--text-2\)/);
  expect(SCRIPT).not.toContain('aria-selected');
});

test('each problem has a hidden detail article', () => {
  const html = renderReport(makeRun([makeCheck({ issues: [
    makeIssue({ selector: '#save', fix: 'Let the button grow.' }),
    makeIssue({ selector: 'form > button:nth-child(2)', fix: 'Let the button grow.' }),
    makeIssue({ text: 'Other', selector: '#other' }),
  ] })]));
  expect(html).toContain('<aside class="panel" aria-label="Problem detail" hidden>');
  const detail = detailOf(html, 'p1');
  // Every full selector, each with a Copy button.
  expect(detail).toContain('<code>#save</code>');
  expect(detail).toContain('<code>form &gt; button:nth-child(2)</code>');
  expect(detail.match(/<button type="button" class="copy" data-copy>Copy<\/button>/g)).toHaveLength(2);
  expect(detail).toContain('Text is cut off.');
  expect(detail).toContain('Let the button grow.');
  expect(detail).toContain('href="#page-1-1"');
  expect(detailOf(html, 'p2')).toContain('<code>#other</code>');
  // The panel comes after the content, so the first image is a section thumbnail.
  expect(html.indexOf('<aside class="panel"')).toBeGreaterThan(html.indexOf('<div class="shots">'));
});

test('the detail keeps the full text that the label clips', () => {
  const text = `${'Long label '.repeat(10)}tail-word`;
  const detail = detailOf(renderReport(makeRun([makeCheck({ issues: [makeIssue({ text })] })])), 'p1');
  expect(detail).toContain('tail-word');
});

test('the CSS source of rtl/not-mirrored is shown', () => {
  const source = { url: 'http://app.test/app.css', line: 12, column: 3, selector: '.nav a', property: 'margin-left', value: '8px', replacement: 'margin-inline-start: 8px' };
  const html = renderReport(makeRun([makeCheck({ issues: [
    makeIssue({ rule: 'rtl/not-mirrored', severity: 'warning', mode: 'pseudo-rtl', source }),
    makeIssue({ rule: 'rtl/not-mirrored', severity: 'warning', mode: 'pseudo-rtl', text: 'Mapped', source: { ...source, original: { url: 'src/nav.css', line: 4, column: 1 } } }),
  ] })]));
  const plain = detailOf(html, 'p1');
  expect(plain).toContain('http://app.test/app.css:12');
  expect(plain).toContain('margin-left: 8px → margin-inline-start: 8px');
  expect(plain).toContain('.nav a');
  // A source-mapped origin wins over the built stylesheet.
  const mapped = detailOf(html, 'p2');
  expect(mapped).toContain('src/nav.css:4');
  expect(mapped).not.toContain('app.css:12');
  // Other rules have no source.
  expect(detailOf(renderReport(makeRun([makeCheck()])), 'p1')).not.toContain('CSS source');
});

test('detail articles carry no screenshots: the script builds them when a problem opens', () => {
  const checks = Array.from({ length: 8 }, (_, i) => makeCheck({
    testTitle: `test ${i}`,
    issues: [makeIssue(), makeIssue({ text: 'Other', box: { x: 0, y: 0, width: 10, height: 10 } })],
    screenshots: [{ mode: 'pseudo-long', viewport: { width: 1280, height: 800 }, path: `shots/${i}.png`, size: { width: 1000, height: 2000 } }],
  }));
  const html = renderReport(makeRun(checks));
  const detail = detailOf(html, 'p1');
  expect(detail).not.toContain('<img');
  expect(detail).not.toContain('class="dshot"');
  expect(detail).not.toContain('class="dbox');
  // The script finds the section's figures through the article, and a placeholder tells it there is something to show.
  expect(detail).toContain('data-section="page-1-1"');
  expect(detail).toMatch(/<div class="d-block" data-shots hidden>/);
  // Each screenshot is in the page once: the section's thumbnail.
  expect(html.match(/<img src="shots\/0\.png"/g)).toHaveLength(1);
});

test('a problem without screenshots has no placeholder for them', () => {
  const detail = detailOf(renderReport(makeRun([makeCheck({ screenshots: [] })])), 'p1');
  expect(detail).not.toContain('data-shots');
});

test('the detail lists where it was seen, with at most 8 test titles', () => {
  const checks = Array.from({ length: 10 }, (_, i) => makeCheck({ testTitle: `title ${i}`, project: i % 2 ? 'webkit' : 'chromium' }));
  const detail = detailOf(renderReport(makeRun(checks)), 'p1');
  expect(detail).toContain('chromium, webkit');
  expect(detail).toContain('1280×800');
  expect(detail).toContain('title 7');
  expect(detail).not.toContain('title 8');
  expect(detail).toContain(' and 2 more');
});

/** The by-locale matrix of a rendered report. */
const matrixOf = (html: string) => html.slice(html.indexOf('<table class="matrix">'), html.indexOf('</table>', html.indexOf('<table class="matrix">')));
const matrixCells = (html: string) => matrixOf(html).match(/<td class="num">[\s\S]*?<\/td>/g) ?? [];

test('a matrix cell is named by its locale, project and count', () => {
  const html = renderReport(makeRun([
    makeCheck({ project: 'chromium', issues: [makeIssue({ locale: 'de', text: 'One' }), makeIssue({ locale: 'de', text: 'Two' })] }),
    makeCheck({ project: 'webkit', issues: [makeIssue({ locale: 'de', text: 'One' })] }),
  ]));
  const cells = matrixCells(html);
  expect(cells).toHaveLength(2);
  expect(cells[0]).toContain('aria-label="de in chromium: 2 problems"');
  expect(cells[1]).toContain('aria-label="de in webkit: 1 problem"');
});

test('a matrix cell with one problem says problem, not problems', () => {
  const html = renderReport(makeRun([makeCheck({ project: 'chromium', issues: [makeIssue({ locale: 'de' })] }), makeCheck({ project: 'webkit', issues: [makeIssue({ locale: 'fr' })] })]));
  expect(matrixCells(html).filter(c => c.includes('<button'))[0]).toContain('aria-label="de in chromium: 1 problem"');
});

test('without projects a matrix cell is named by its locale alone and sets no project', () => {
  const html = renderReport(makeRun([makeCheck({ issues: [makeIssue({ locale: 'de' }), makeIssue({ locale: 'fr', text: 'Other' })] })]));
  const [cell] = matrixCells(html);
  expect(cell).toContain('aria-label="de: 1 problem"');
  expect(cell).toContain('data-pick-locale="de"');
  expect(cell).not.toContain('data-pick-project');
});

test('the "no locale" and "no project" matrix cells are not buttons, since no filter selects them', () => {
  const html = renderReport(makeRun([
    makeCheck({ project: 'chromium', issues: [makeIssue({ locale: 'de' }), makeIssue({ locale: '', text: 'No locale' })] }),
    makeCheck({ issues: [makeIssue({ locale: 'de', text: 'No project' })] }),
  ]));
  const matrix = matrixOf(html);
  // Rows: de, then the one without a locale. Columns: chromium, then the one without a project.
  expect(matrix).toContain('<th scope="row">—</th>');
  expect(matrix).toContain('no project');
  const rows = matrix.split('<tr>').slice(2);
  expect(rows).toHaveLength(2);
  const [de, none] = rows.map(r => r.match(/<td class="num">[\s\S]*?<\/td>/g)!);
  expect(de[0]).toContain('data-pick-locale="de" data-pick-project="chromium"');
  expect(de[1]).not.toContain('<button');
  expect(none[0]).not.toContain('<button');
  expect(none[1]).not.toContain('<button');
  // The counts are still shown.
  expect(de[1]).toContain('>1<');
  expect(none[0]).toContain('>1<');
  // Nothing in the matrix sets a filter to "All".
  expect(matrix).not.toMatch(/data-pick-(locale|project)=""/);
});
