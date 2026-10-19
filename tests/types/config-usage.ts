// Compile-only check (run by `npm run typecheck`): the README's playwright.config.ts must type-check.
import { defineConfig } from '@playwright/test';
import type { FitlocaleTestOptions } from '../../src/playwright';

export default defineConfig<FitlocaleTestOptions>({
  use: { fitlocale: { sourceMessages: 'locales/en.json', ignore: ['.ad'] } },
  projects: [{ name: 'chromium', use: { fitlocale: { viewports: 'current' } } }],
});
