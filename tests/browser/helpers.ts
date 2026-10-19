import type { Page } from '@playwright/test';
import { ensureInjected } from '../../src/inject';
import type { FitlocaleBrowserApi } from '../../src/browser/api';

declare global {
  interface Window { __fitlocale: FitlocaleBrowserApi }
}

/** Set page content, inject the in-page bundle and assign element keys. */
export async function load(page: Page, html: string): Promise<void> {
  await page.setContent(html);
  await ensureInjected(page);
  await page.evaluate(() => window.__fitlocale.assignKeys());
}
