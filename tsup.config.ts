import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    playwright: 'src/playwright.ts',
    reporter: 'src/reporter.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node20',
  external: ['@playwright/test'],
});
