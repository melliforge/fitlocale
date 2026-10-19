import { defineConfig } from 'tsup';

const shared = { dts: true, target: 'node20' as const, external: ['@playwright/test'] };

export default defineConfig([
  {
    // Library entries ship as ESM and CommonJS: Playwright loads reporters with require(),
    // and CommonJS projects compile test files to require() too.
    ...shared,
    entry: { index: 'src/index.ts', playwright: 'src/playwright.ts', reporter: 'src/reporter.ts' },
    format: ['esm', 'cjs'],
    clean: true,
  },
  {
    ...shared,
    entry: { cli: 'src/bin.ts' },
    format: ['esm'],
    dts: false,
  },
]);
