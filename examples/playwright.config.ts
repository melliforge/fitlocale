// A playwright.config.ts for an app with fitlocale. Copy the parts you need.
import { defineConfig, devices } from '@playwright/test';
import type { FitlocaleTestOptions } from 'fitlocale/playwright';

export default defineConfig<FitlocaleTestOptions>({
  testDir: 'e2e',
  reporter: [['list'], ['fitlocale/reporter', { outputDir: 'fitlocale-report' }]],
  use: {
    baseURL: 'http://localhost:3000',
    fitlocale: {
      sourceMessages: 'locales/en.json', // recognises raw keys and untranslated text
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI },
});
