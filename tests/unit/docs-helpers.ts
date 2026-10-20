import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Every Markdown page of the docs site (internal docs never live in the repo). */
export function docsPages(dir = 'docs'): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (name === 'superpowers' || name === '.vitepress' || name === 'node_modules') return [];
    return statSync(path).isDirectory() ? docsPages(path) : name.endsWith('.md') ? [path] : [];
  });
}
