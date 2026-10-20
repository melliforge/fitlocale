import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, type Page } from '@playwright/test';
import { transform } from 'esbuild';
import { ensureInjected } from '../../src/inject';
import { openDevtools } from '../../src/devtools/session';
import { attachCssSources } from '../../src/devtools/css-pointer';
import type { Issue } from '../../src/types';
import { makeIssue } from '../unit/fixtures';

// A real HTTP server: DevTools has no stylesheet text (so no line numbers) for responses fulfilled by page.route.
let server: Server | null = null;
let ORIGIN = '';
test.afterEach(async () => {
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

const PAGE = (head: string, badge = '<div id=b class=b>New</div>') =>
  `<!doctype html>\n<html>\n<head>\n${head}\n</head>\n<body style="margin:0">\n${badge}\n</body>\n</html>\n`;

/** Serve `files` over HTTP, open `/`, and return the real rtl/not-mirrored issues found there. */
async function serve(page: Page, files: Record<string, { body: string; type: string } | null>): Promise<Issue[]> {
  server = createServer((req, res) => {
    const file = files[new URL(req.url ?? '/', 'http://x').pathname];
    if (file) res.writeHead(200, { 'content-type': file.type }).end(file.body);
    else res.writeHead(404).end('not found');
  });
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()));
  ORIGIN = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await page.goto(`${ORIGIN}/`);
  await ensureInjected(page);
  const raw = await page.evaluate(() => {
    const fl = window.__fitlocale;
    fl.assignKeys();
    fl.rememberBoxes([], []);
    fl.setDir('rtl');
    try {
      return fl.findNotMirrored([], []);
    } finally {
      fl.setDir(null);
    }
  });
  return raw.map(r => makeIssue({ ...r, mode: 'pseudo-rtl', fix: 'GENERIC' }));
}

const html = (body: string) => ({ body, type: 'text/html' });
const css = (body: string) => ({ body, type: 'text/css' });

async function point(page: Page, issues: Issue[]) {
  const devtools = await openDevtools(page);
  expect(devtools).not.toBeNull();
  try {
    await attachCssSources(page, devtools!, issues);
  } finally {
    await devtools!.close();
  }
  return issues;
}

test('an external stylesheet: file, line, rule and logical replacement', async ({ page }) => {
  const issues = await serve(page, { '/': html(PAGE('<link rel=stylesheet href=/app.css>')), '/app.css': css('.b{position:absolute}\n.b{left:16px}\n') });
  expect(issues).toHaveLength(1);
  const [issue] = await point(page, issues);
  expect(issue.source).toMatchObject({
    url: `${ORIGIN}/app.css`, line: 2, selector: '.b', property: 'left', value: '16px', replacement: 'inset-inline-start: 16px',
  });
  expect(issue.source!.original).toBeUndefined();
  expect(issue.fix).toBe(`In ${ORIGIN}/app.css:2 (.b), replace "left: 16px" with "inset-inline-start: 16px".`);
});

test('a source-mapped stylesheet points at the original file', async ({ page }) => {
  const source = '.b {\n  position: absolute;\n  left: 16px;\n}\n';
  const out = await transform(source, { loader: 'css', minify: true, sourcemap: 'external', sourcefile: 'src/styles/badge.css' });
  const issues = await serve(page, {
    '/': html(PAGE('<link rel=stylesheet href=/app.css>')),
    '/app.css': css(`${out.code}/*# sourceMappingURL=app.css.map */\n`),
    '/app.css.map': { body: out.map, type: 'application/json' },
  });
  const [issue] = await point(page, issues);
  expect(issue.source!.original).toMatchObject({ url: 'src/styles/badge.css', line: 3 });
  expect(issue.fix).toContain('In src/styles/badge.css:3 (.b)');
});

test('a source map that cannot be fetched keeps the generated location', async ({ page }) => {
  const issues = await serve(page, {
    '/': html(PAGE('<link rel=stylesheet href=/app.css>')),
    '/app.css': css('.b{position:absolute;left:16px}\n/*# sourceMappingURL=missing.css.map */\n'),
  });
  const [issue] = await point(page, issues);
  expect(issue.source).toMatchObject({ url: `${ORIGIN}/app.css`, line: 1 });
  expect(issue.source!.original).toBeUndefined();
});

test('the cascade decides: an earlier !important beats later rules and the style attribute', async ({ page }) => {
  const issues = await serve(page, {
    '/': html(PAGE('<link rel=stylesheet href=/app.css>', '<div id=b class=b style="left:3px">New</div>')),
    '/app.css': css('.b{position:absolute;left:16px !important}\n#b{left:20px}\n'),
  });
  const [issue] = await point(page, issues);
  expect(issue.source).toMatchObject({ line: 1, selector: '.b', value: '16px' });
});

test('a style attribute is named as such', async ({ page }) => {
  const issues = await serve(page, { '/': html(PAGE('', '<div id=b style="position:absolute;left:16px">New</div>')) });
  const [issue] = await point(page, issues);
  expect(issue.source).toMatchObject({ selector: 'style attribute', line: 0, property: 'left' });
  expect(issue.fix).toBe('In the element\'s style attribute, replace "left: 16px" with "inset-inline-start: 16px".');
});

test('an inline <style> gives the line inside the HTML file', async ({ page }) => {
  const doc = PAGE('<style>\n.b { position: absolute }\n.b { left: 16px }\n</style>');
  const issues = await serve(page, { '/': html(doc) });
  const [issue] = await point(page, issues);
  const line = doc.split('\n').findIndex(l => l.includes('left: 16px')) + 1;
  expect(issue.source).toMatchObject({ url: `${ORIGIN}/`, line, selector: '.b' });
});

test('an element gone before the lookup keeps its generic fix', async ({ page }) => {
  const issues = await serve(page, { '/': html(PAGE('<link rel=stylesheet href=/app.css>')), '/app.css': css('.b{position:absolute;left:16px}') });
  await page.evaluate(() => document.getElementById('b')!.remove());
  const [issue] = await point(page, issues);
  expect(issue.source).toBeUndefined();
  expect(issue.fix).toBe('GENERIC');
});

test('without stylesheet text the declaration is still named, without a line', async ({ page }) => {
  // page.route responses give DevTools no stylesheet text, like some cached or cross-origin sheets.
  await page.route('http://routed.test/**', route => new URL(route.request().url()).pathname === '/app.css'
    ? route.fulfill({ body: '.b{position:absolute;left:16px !important}', contentType: 'text/css' })
    : route.fulfill({ body: PAGE('<link rel=stylesheet href=/app.css>'), contentType: 'text/html' }));
  await page.goto('http://routed.test/');
  await ensureInjected(page);
  const raw = await page.evaluate(() => {
    const fl = window.__fitlocale;
    fl.assignKeys();
    fl.rememberBoxes([], []);
    fl.setDir('rtl');
    try {
      return fl.findNotMirrored([], []);
    } finally {
      fl.setDir(null);
    }
  });
  const [issue] = await point(page, raw.map(r => makeIssue({ ...r, mode: 'pseudo-rtl', fix: 'GENERIC' })));
  expect(issue.source).toMatchObject({ url: 'http://routed.test/app.css', line: 0, value: '16px', replacement: 'inset-inline-start: 16px' });
  expect(issue.fix).toBe('In http://routed.test/app.css (.b), replace "left: 16px" with "inset-inline-start: 16px".');
});

test('a missing source map makes no request or console error in the page', async ({ page }) => {
  const issues = await serve(page, {
    '/': html(PAGE('<link rel=stylesheet href=/app.css>')),
    '/app.css': css('.b{position:absolute;left:16px}\n/*# sourceMappingURL=missing.css.map */\n'),
  });
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => requests.push(r.url()));
  await point(page, issues);
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});
