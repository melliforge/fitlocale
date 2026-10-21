import { existsSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { docsPages } from './docs-helpers';

function frontmatter(path: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---/.exec(readFileSync(path, 'utf8'));
  if (!m) return {};
  return Object.fromEntries(m[1].split('\n').map(l => /^(\w+):\s*(.*)$/.exec(l)).filter(Boolean).map(x => [x![1], x![2].replace(/^(['"])(.*)\1$/, '$2')]));
}

test('the site is served under the project path, with a sitemap and dead-link checks', () => {
  const config = readFileSync('docs/.vitepress/config.ts', 'utf8');
  expect(config).toContain("base: '/fitlocale/'");
  expect(config).toContain("hostname: 'https://melliforge.github.io/fitlocale/'");
  expect(config).not.toContain('ignoreDeadLinks');
});

test('every page has a search-friendly title and description', () => {
  const pages = docsPages();
  expect(pages.length).toBeGreaterThan(0);
  for (const page of pages) {
    const { title, description } = frontmatter(page);
    expect(title, `${page} title`).toBeTruthy();
    expect(title.length, `${page} title length`).toBeLessThanOrEqual(60);
    expect(description, `${page} description`).toBeTruthy();
    expect(description.length, `${page} description length`).toBeLessThanOrEqual(155);
  }
  expect(existsSync('docs/index.md')).toBe(true);
});

test('the site deploys from main only, and every pull request builds it', () => {
  const docs = readFileSync('.github/workflows/docs.yml', 'utf8');
  const on = docs.split(/^on:\n/m)[1].split(/^\S/m)[0];
  expect(on).toMatch(/push:\n\s+branches: \[main\]/);
  expect(on).toContain('workflow_dispatch');
  expect(on).not.toContain('pull_request');
  expect(docs).toContain('pages: write');
  expect(docs).toContain('id-token: write');
  expect(docs).toMatch(/path: docs\/\.vitepress\/dist/);
  expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain('npm run docs:build');
});

test('the README links to the docs site', () => {
  expect(readFileSync('README.md', 'utf8')).toContain('https://melliforge.github.io/fitlocale/');
});

test('rendered titles stay within 60 characters, " | fitlocale" suffix included', () => {
  for (const page of docsPages()) {
    const fm = frontmatter(page);
    const rendered = fm.titleTemplate === 'false' ? fm.title : `${fm.title} | fitlocale`;
    expect(rendered.length, `${page}: ${rendered}`).toBeLessThanOrEqual(60);
  }
});

test('the docs workflow gives deploy rights to the deploy job only, from main, with full history', () => {
  const docs = readFileSync('.github/workflows/docs.yml', 'utf8');
  const [top, jobs] = docs.split(/^jobs:\n/m);
  expect(top).not.toContain('pages: write');
  expect(top).not.toContain('id-token: write');
  const [build, deploy] = jobs.split(/^ {2}deploy:\n/m);
  expect(build).not.toContain('pages: write');
  expect(build).toContain('fetch-depth: 0'); // last-updated dates and sitemap lastmod read git history
  expect(deploy).toContain('pages: write');
  expect(deploy).toContain('id-token: write');
  expect(deploy).toContain("if: github.ref == 'refs/heads/main'");
});

test('"next release" markers exist only while the changelog has unreleased changes', () => {
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  const unreleased = changelog.split('## [Unreleased]')[1].split(/^## \[/m)[0].trim();
  const marked = docsPages().filter(page => /next release/i.test(readFileSync(page, 'utf8')));
  // With nothing unreleased, every documented feature is on npm: no page may say otherwise.
  if (unreleased === '') expect(marked).toEqual([]);
});

test('overflow on pseudo-locale pages is documented with its real mode', () => {
  const rules = readFileSync('docs/reference/rules.md', 'utf8');
  expect(rules).not.toContain('**Modes:** `pseudo-long`, and pages in a pseudo locale');
  expect(rules.match(/`pseudo-long`; `source` on pages in a pseudo locale/g)).toHaveLength(4);
});

test('top menu labels are distinct, not singular and plural of one word', () => {
  const nav = readFileSync('docs/.vitepress/config.ts', 'utf8').split(/^\s+nav: \[/m)[1].split(/^\s+\],/m)[0];
  const labels = [...nav.matchAll(/text: '([^']+)'/g)].map(m => m[1].toLowerCase().replace(/s$/, ''));
  expect(new Set(labels).size).toBe(labels.length);
});

test('every page names its canonical URL, the same as og:url', () => {
  const config = readFileSync('docs/.vitepress/config.ts', 'utf8');
  const url = /\['meta', \{ property: 'og:url', content: (.+?) \}\]/.exec(config)?.[1];
  expect(url).toBeTruthy();
  expect(config).toContain(`['link', { rel: 'canonical', href: ${url} }]`);
});
