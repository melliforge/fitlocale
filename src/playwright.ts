import { test as base, expect } from '@playwright/test';
import { runLocaleCheck } from './check';
import { resolveOptions, type FitlocaleOptions } from './options';
import type { CheckResult, Severity } from './types';

export { expect };
export * from './locales';
export type { FitlocaleOptions, SetLocale } from './options';
export type { CheckResult, Issue } from './types';

interface FitlocaleFixtures {
  /** Options, set with `test.use({ fitlocale: { ... } })` or in playwright.config `use`. */
  fitlocale: Partial<FitlocaleOptions>;
  /** Check the page in its current state. Fails the test (softly) when issues reach `failOn`. */
  localeCheck: () => Promise<CheckResult>;
  /** Switch the app to `locale` via the `setLocale` option, and remember it for the persistence check. */
  useLocale: (locale: string) => Promise<void>;
  _fitlocaleState: { expectedLocale: string | null; checkIndex: number };
}

const RANK: Record<Severity, number> = { info: 1, warning: 2, error: 3 };
const THRESHOLD: Record<FitlocaleOptions['failOn'], number> = { error: 3, warning: 2, never: Infinity };

export const test = base.extend<FitlocaleFixtures>({
  fitlocale: [{}, { option: true }],

  _fitlocaleState: async ({}, use) => {
    await use({ expectedLocale: null, checkIndex: 0 });
  },

  useLocale: async ({ page, fitlocale, _fitlocaleState }, use) => {
    await use(async (locale: string) => {
      const { setLocale } = resolveOptions(fitlocale);
      if (!setLocale) throw new Error('fitlocale: useLocale() needs the setLocale option. See README "Switching locale".');
      await setLocale(page, locale);
      _fitlocaleState.expectedLocale = locale;
    });
  },

  localeCheck: async ({ page, fitlocale, _fitlocaleState }, use, testInfo) => {
    await use(async () => {
      const options = resolveOptions(fitlocale);
      const result = await runLocaleCheck({
        page, options, testInfo,
        expectedLocale: _fitlocaleState.expectedLocale,
        checkIndex: _fitlocaleState.checkIndex++,
      });
      await testInfo.attach('fitlocale:result', { body: JSON.stringify(result), contentType: 'application/json' });
      for (const shot of result.screenshots) {
        await testInfo.attach('fitlocale:screenshot', { path: shot.path, contentType: 'image/png' });
      }
      const failing = result.issues.filter(i => RANK[i.severity] >= THRESHOLD[options.failOn]);
      const summary = `fitlocale found ${failing.length} issue(s):\n`
        + failing.map(i => `  ${i.rule} ${i.selector} (${i.mode})`).join('\n');
      expect.soft(failing.length, summary).toBe(0);
      return result;
    });
  },
});
