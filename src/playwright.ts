import { test as base, expect } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import { resolve } from 'node:path';
import { applyBaseline, failureSummary, markFailing } from './baseline';
import { configDirOf, probeLocale, runLocaleCheck } from './check';
import { resolveOptions, type FitlocaleOptions } from './options';
import type { CheckResult } from './types';

export { expect };
export * from './locales';
export type { FitlocaleOptions, SetLocale } from './options';
export type { CheckResult, Issue } from './types';

/** Pass to `defineConfig<FitlocaleTestOptions>()` so `use: { fitlocale }` type-checks in playwright.config.ts. */
export interface FitlocaleTestOptions { fitlocale: Partial<FitlocaleOptions> }

interface FitlocaleFixtures {
  /** Options, set with `test.use({ fitlocale: { ... } })` or in playwright.config `use`. */
  fitlocale: Partial<FitlocaleOptions>;
  /** Check the page in its current state. Fails the test (softly) when issues reach `failOn`. */
  localeCheck: () => Promise<CheckResult>;
  /** Switch the app to `locale` via the `setLocale` option, and remember it for the persistence check. */
  useLocale: (locale: string) => Promise<void>;
  _fitlocaleState: { expectedLocale: string | null; probeAfterSwitch: string | null; checkIndex: number };
}

/**
 * `test.use({ fitlocale })` replaces the config-level value instead of merging with it,
 * so merge the project's `use.fitlocale` back in underneath the override.
 */
function optionsFor(testInfo: TestInfo, fitlocale: Partial<FitlocaleOptions>): FitlocaleOptions {
  const fromConfig = (testInfo.project.use as { fitlocale?: Partial<FitlocaleOptions> }).fitlocale ?? {};
  return resolveOptions({ ...fromConfig, ...fitlocale });
}

/** Warn about a missing baseline file once per worker; each test also gets an annotation. */
let warnedMissingBaseline = false;


export const test = base.extend<FitlocaleFixtures>({
  fitlocale: [{}, { option: true }],

  _fitlocaleState: async ({}, use) => {
    await use({ expectedLocale: null, probeAfterSwitch: null, checkIndex: 0 });
  },

  useLocale: async ({ page, fitlocale, _fitlocaleState }, use, testInfo) => {
    await use(async (locale: string) => {
      const options = optionsFor(testInfo, fitlocale);
      if (!options.setLocale) throw new Error('fitlocale: useLocale() needs the setLocale option. See README "Switching locale".');
      await options.setLocale(page, locale);
      _fitlocaleState.expectedLocale = locale;
      _fitlocaleState.probeAfterSwitch = await probeLocale(page, options);
    });
  },

  localeCheck: async ({ page, fitlocale, _fitlocaleState, testIdAttribute }, use, testInfo) => {
    await use(async () => {
      const options = optionsFor(testInfo, fitlocale);
      const result = await runLocaleCheck({
        page, options, testInfo, testIdAttribute,
        expectedLocale: _fitlocaleState.expectedLocale,
        probeAfterSwitch: _fitlocaleState.probeAfterSwitch,
        checkIndex: _fitlocaleState.checkIndex++,
      });
      const baselinePath = options.baseline === false ? null : resolve(configDirOf(testInfo.config), options.baseline);
      const { counts } = applyBaseline(
        result, { project: testInfo.project.name, titlePath: testInfo.titlePath, checkIndex: result.checkIndex }, baselinePath,
      );
      if (result.baseline?.status === 'missing' && !testInfo.annotations.some(a => a.type === 'fitlocale')) {
        // Seen even without the fitlocale reporter: otherwise a missing file would silently stop every failure.
        const note = `No baseline file yet (${result.baseline.path}): issues are reported but do not fail tests. `
          + `Create it with: npx fitlocale baseline <results.json> --out ${result.baseline.path}`;
        testInfo.annotations.push({ type: 'fitlocale', description: note });
        if (!warnedMissingBaseline) {
          warnedMissingBaseline = true;
          console.warn(`fitlocale: ${note}`);
        }
      }
      markFailing(result.issues, counts, options.failOn);
      await testInfo.attach('fitlocale:result', { body: JSON.stringify(result), contentType: 'application/json' });
      for (const shot of result.screenshots) {
        await testInfo.attach('fitlocale:screenshot', { path: shot.path, contentType: 'image/png' });
      }
      const failing = result.issues.filter(i => i.fails);
      const accepted = result.issues.filter(i => i.baselined).length;
      expect.soft(failing.length, failureSummary(failing, accepted, result.baseline?.path)).toBe(0);
      return result;
    });
  },
});
