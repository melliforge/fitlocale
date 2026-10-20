import type { TestInfo } from '@playwright/test';
import type { CheckResult } from 'fitlocale/playwright';

/** The localeCheck() results a test attached (the fitlocale fixture attaches one per check). */
export function checksOf(testInfo: TestInfo): CheckResult[] {
  return testInfo.attachments
    .filter(a => a.name === 'fitlocale:result' && a.body)
    .map(a => JSON.parse(a.body!.toString('utf8')) as CheckResult);
}
