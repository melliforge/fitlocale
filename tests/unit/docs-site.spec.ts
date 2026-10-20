import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

/** Every Markdown page of the docs site (internal docs never live in the repo). */
export function docsPages(dir = 'docs'): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (name === 'superpowers' || name === '.vitepress' || name === 'node_modules') return [];
    return statSync(path).isDirectory() ? docsPages(path) : name.endsWith('.md') ? [path] : [];
  });
}

function frontmatter(path: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---/.exec(readFileSync(path, 'utf8'));
  if (!m) return {};
  return Object.fromEntries(m[1].split('\n').map(l => /^(\w+):\s*(.*)$/.exec(l)).filter(Boolean).map(x => [x![1], x![2].replace(/^(['"])(.*)\1$/, '$2')]));
}

test('the site is served under the project path, with a sitemap and dead-link checks', () => {
  const config = readFileSync('docs/.vitepress/config.ts', 'utf8');
  expect(config).toContain("base: '/localization-layout-tester/'");
  expect(config).toContain("hostname: 'https://melliforge.github.io/localization-layout-tester/'");
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
