import { defineConfig } from 'tsdown';

// @playwright/test re-exports its types from `playwright`; keep both out of our bundles and .d.ts files.
const PLAYWRIGHT = [/^@playwright\//, /^playwright(-core)?(\/|$)/];

const shared = {
  platform: 'node',
  deps: { neverBundle: PLAYWRIGHT, dts: { neverBundle: PLAYWRIGHT } },
  target: 'node16.17',
  // Keep .js for ESM and .cjs for CommonJS (package.json "type": "module"), matching the exports map.
  fixedExtension: false,
} as const;

export default defineConfig([
  {
    // Library entries ship as ESM and CommonJS: Playwright loads reporters with require(),
    // and CommonJS projects compile test files to require() too.
    ...shared,
    entry: { index: 'src/index.ts', playwright: 'src/playwright.ts', reporter: 'src/reporter.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
  },
  {
    // The report renderer on its own, in one file with no Node built-ins: fitlocale cloud renders it in a Worker.
    ...shared,
    platform: 'neutral',
    entry: { report: 'src/report/html.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: false,
  },
  {
    ...shared,
    entry: { cli: 'src/bin.ts' },
    format: ['esm'],
    dts: false,
    clean: false,
  },
]);
