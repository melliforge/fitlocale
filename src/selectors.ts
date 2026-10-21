import type { Page } from '@playwright/test';
import type { RawIssue } from './types';
import type { FitlocaleBrowserApi } from './browser/api';

/**
 * Playwright's CSS reaches into open shadow roots and counts a host's shadow children as its children, so on a page
 * with shadow roots or frames a selector can match more than the element it was made for. Each such selector gets
 * `>> nth=k`, k being the element's position among Playwright's own matches.
 */
export async function resolveSelectors(page: Page, issues: RawIssue[]): Promise<void> {
  const composed = await page.evaluate(() => (window as unknown as { __fitlocale: FitlocaleBrowserApi }).__fitlocale.hasComposed());
  if (!composed) return;
  for (const selector of new Set(issues.map(i => i.selector))) {
    let keys: string[];
    try {
      keys = await page.locator(selector).evaluateAll(els => els.map(el =>
        (el.ownerDocument.defaultView!.top as unknown as { __fitlocale: FitlocaleBrowserApi }).__fitlocale.keyFor(el)));
    } catch {
      continue; // not a selector Playwright can run (an element gone, a frame detached): keep it as it is
    }
    if (keys.length <= 1) continue;
    for (const issue of issues) {
      const k = issue.selector === selector ? keys.indexOf(issue.key) : -1;
      if (k >= 0) issue.selector = `${selector} >> nth=${k}`;
    }
  }
}

/** Sets `name` on each issue whose element has an accessible name. Run while the page still shows the viewport the issues were found in. */
export async function nameIssues(page: Page, issues: RawIssue[]): Promise<void> {
  const keys = [...new Set(issues.map(i => i.key))].filter(k => k !== 'html');
  if (keys.length === 0) return;
  let names: Array<string | null>;
  try {
    names = await page.evaluate(k => (window as unknown as { __fitlocale: FitlocaleBrowserApi }).__fitlocale.namesFor(k), keys);
  } catch {
    return; // the page moved on: issues stay unnamed
  }
  const byKey = new Map(keys.map((k, i) => [k, names[i]] as const));
  for (const issue of issues) {
    const name = byKey.get(issue.key);
    if (name) issue.name = name;
  }
}
