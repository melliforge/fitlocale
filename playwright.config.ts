import { defineConfig } from '@playwright/test';
import type { FitlocaleTestOptions } from './src/playwright';
import { browserProjects } from './tests/browsers';

export default defineConfig<FitlocaleTestOptions>({
  reporter: [['list'], ['./src/reporter.ts', { outputDir: 'test-results/fitlocale-report' }]],
  webServer: {
    command: 'node demo/serve.mjs',
    port: 4310,
    reuseExistingServer: !process.env.CI,
  },
  // BROWSERS=chromium,firefox,webkit runs every browser project (CI does); Chromium alone by default.
  projects: browserProjects(process.env.BROWSERS),
});
