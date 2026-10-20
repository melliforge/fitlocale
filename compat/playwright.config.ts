import { defineConfig } from '@playwright/test';

// BROWSERS: comma-separated, as in the main suite.
const browsers = (process.env.BROWSERS ?? 'chromium').split(',');

export default defineConfig({
  testDir: 'tests',
  reporter: [['list'], ['fitlocale/reporter', { outputDir: 'fitlocale-report' }]],
  projects: browsers.map(name => ({ name, use: { browserName: name as 'chromium' | 'firefox' | 'webkit' } })),
});
