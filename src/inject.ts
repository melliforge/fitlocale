import type { Page } from '@playwright/test';
import bundle from './generated/browser-bundle';

export { DEFAULT_IGNORE, DEFAULT_MIRROR_IGNORE } from './browser/dom';

/**
 * Install `window.__fitlocale` in the page if it is not there yet.
 * `page.evaluate` runs through the DevTools protocol, so the page's CSP cannot block it.
 */
export async function ensureInjected(page: Page): Promise<void> {
  const present = await page.evaluate(
    () => typeof (window as { __fitlocale?: { assignKeys?: unknown } }).__fitlocale?.assignKeys === 'function',
  );
  if (!present) await page.evaluate(bundle);
}
