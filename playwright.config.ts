import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [['list'], ['./src/reporter.ts', { outputDir: 'test-results/fitlocale-report' }]],
  webServer: {
    command: 'node demo/serve.mjs',
    port: 4310,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'unit', testDir: 'tests/unit' },
    { name: 'browser', testDir: 'tests/browser', use: { fitlocale: { ignore: ['.config-ignored'] } } as object },
    {
      name: 'demo',
      testDir: 'tests/demo',
      use: { baseURL: 'http://localhost:4310', viewport: { width: 1280, height: 800 } },
    },
  ],
});
