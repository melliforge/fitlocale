import { existsSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { DEFAULT_OPTIONS, type FitlocaleOptions } from '../../src/options';
import { SEVERITY } from '../../src/types';
import { docsPages } from './docs-helpers';

const read = (path: string) => readFileSync(path, 'utf8');
const codeHeadings = (path: string, level: string) =>
  [...read(path).matchAll(new RegExp(`^${level} \`([^\`]+)\``, 'gm'))].map(m => m[1]);

test('every rule is documented, and only real rules are', () => {
  expect(new Set(codeHeadings('docs/reference/rules.md', '###'))).toEqual(new Set(Object.keys(SEVERITY)));
});

test('every option is documented, and only real options are', () => {
  const extra = ['setLocale', 'localeProbe', 'sourceMessages'] satisfies (keyof FitlocaleOptions)[];
  const all = new Set<string>([...Object.keys(DEFAULT_OPTIONS), ...extra]);
  expect(new Set(codeHeadings('docs/reference/options.md', '###'))).toEqual(all);
});

test('every CLI command is documented', () => {
  const commands = [...read('src/cli.ts').matchAll(/^ {2}fitlocale (\w+) /gm)].map(m => m[1]);
  expect(commands.length).toBeGreaterThanOrEqual(4);
  const documented = codeHeadings('docs/reference/cli.md', '##');
  for (const c of commands) expect(documented, c).toContain(`fitlocale ${c}`);
});

test('every Action input is documented', () => {
  const inputs = read('action.yml').split(/^inputs:\n/m)[1].split(/^\S/m)[0];
  const names = [...inputs.matchAll(/^ {2}([\w-]+):$/gm)].map(m => m[1]);
  expect(names.length).toBeGreaterThanOrEqual(4);
  const page = read('docs/reference/github-action.md');
  for (const name of names) expect(page, name).toContain(`\`${name}\``);
});

test('every imported code snippet exists, with its region', () => {
  for (const page of docsPages()) {
    for (const m of read(page).matchAll(/^<<<\s+@\/\.\.\/([^\s#{]+)(?:#([\w-]+))?/gm)) {
      const [, path, region] = m;
      expect(existsSync(path), `${page}: ${path}`).toBe(true);
      if (region) {
        const text = read(path);
        expect(text, `${page}: ${path}#${region}`).toContain(`#region ${region}`);
        expect(text, `${page}: ${path}#${region}`).toContain(`#endregion ${region}`);
      }
    }
  }
});
