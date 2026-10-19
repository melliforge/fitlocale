import { defineConfig } from '@playwright/test';

export default defineConfig({
  projects: [
    { name: 'unit', testDir: 'tests/unit' },
    { name: 'browser', testDir: 'tests/browser' },
    { name: 'demo', testDir: 'tests/demo' },
  ],
});
