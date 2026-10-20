import { defineConfig } from '@playwright/test';
import type { FitlocaleTestOptions } from './src/playwright';

export default defineConfig<FitlocaleTestOptions>({
  reporter: [['list'], ['./src/reporter.ts', { outputDir: 'test-results/fitlocale-report' }]],
  webServer: {
    command: 'node demo/serve.mjs',
    port: 4310,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'unit', testDir: 'tests/unit' },
    { name: 'browser', testDir: 'tests/browser', use: { fitlocale: { ignore: ['.config-ignored'] } } },
    // The docs' guide code: runs against the demo app so a guide that stops working fails CI.
    {
      name: 'examples',
      testDir: 'examples',
      testMatch: /\.spec\.ts$/,
      use: { baseURL: 'http://localhost:4310', viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'demo',
      testDir: 'tests/demo',
      use: { baseURL: 'http://localhost:4310', viewport: { width: 1280, height: 800 } },
    },
  ],
});
