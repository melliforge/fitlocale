import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { Frame, Page, TestInfo } from '@playwright/test';
import { ensureInjected } from './inject';
import type { FitlocaleOptions } from './options';
import { flattenKeys, type Messages } from './pseudo';
import { findNotMirrored } from './rules/mirror';
import { subtractSource } from './rules/noise';
import {
  FIXES, LOCALE_NOT_REFLECTED_MESSAGE, MESSAGES, SEVERITY, type CheckResult, type Issue, type Mode, type RawIssue, type Screenshot, type Viewport,
} from './types';
import type { FitlocaleBrowserApi } from './browser/api';

export interface CheckContext {
  page: Page;
  options: FitlocaleOptions;
  expectedLocale: string | null;
  /** What the locale probe read right after `useLocale()` switched, or null. */
  probeAfterSwitch?: string | null;
  testInfo: TestInfo;
  checkIndex: number;
}

type Api = { __fitlocale: FitlocaleBrowserApi };

const knownKeysCache = new Map<string, string[]>();

function knownKeys(path: string | undefined): string[] {
  if (!path) return [];
  if (!knownKeysCache.has(path)) {
    knownKeysCache.set(path, flattenKeys(JSON.parse(readFileSync(path, 'utf8')) as Messages));
  }
  return knownKeysCache.get(path)!;
}

/** `de` matches `de`, `de-CH` and `DE`; `de-CH` matches `de`. */
export function sameLocale(a: string, b: string): boolean {
  const x = a.toLowerCase(), y = b.toLowerCase();
  return x === y || x.startsWith(y + '-') || y.startsWith(x + '-');
}

/** The page's current locale: the `localeProbe` option, else `<html lang>`. */
export async function probeLocale(page: Page, options: FitlocaleOptions): Promise<string> {
  return options.localeProbe ? options.localeProbe(page) : page.evaluate(() => document.documentElement.lang);
}

const FONT_TIMEOUT_MS = 3000;

/**
 * Let the page settle after a text or direction change: wait for web fonts the new text needs
 * (capped, so a font that never loads cannot hang the check), then for two frames.
 */
const settle = (page: Page) =>
  page.evaluate(async timeout => {
    await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, timeout))]);
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }, FONT_TIMEOUT_MS);

const CONTEXT_DESTROYED = /Execution context was destroyed/;

/** Run a check; a navigation part-way through gets one clear error instead of whatever call it broke. */
export async function runLocaleCheck(ctx: CheckContext): Promise<CheckResult> {
  const { page } = ctx;
  let navigated = false;
  const onNavigated = (frame: Frame) => { if (frame === page.mainFrame()) navigated = true; };
  page.on('framenavigated', onNavigated);
  try {
    return await check(ctx);
  } catch (err) {
    if (navigated || CONTEXT_DESTROYED.test(String((err as Error)?.message))) {
      throw new Error(
        'fitlocale: the page navigated during localeCheck(). Wait until the page has settled '
        + '(for example with await expect(locator).toBeVisible()) before calling it.',
        { cause: err },
      );
    }
    throw err;
  } finally {
    page.off('framenavigated', onNavigated);
  }
}

async function check(ctx: CheckContext): Promise<CheckResult> {
  const { page, options, expectedLocale, testInfo, checkIndex } = ctx;
  const original = page.viewportSize();
  const viewports: Viewport[] = options.viewports === 'current'
    ? [original ?? { width: 1280, height: 720 }]
    : options.viewports;
  const keys = knownKeys(options.sourceMessages);
  const issues: Issue[] = [];
  const screenshots: Screenshot[] = [];

  const enrich = (raw: RawIssue[], mode: Mode, viewport: Viewport, message?: string): Issue[] =>
    raw.map(r => ({
      ...r, mode, viewport, url: page.url(), severity: SEVERITY[r.rule],
      message: message ?? MESSAGES[r.rule], ...(FIXES[r.rule] ? { fix: FIXES[r.rule] } : {}),
    }));

  const shoot = async (mode: Mode, viewport: Viewport) => {
    if (!options.screenshots) return;
    const path = testInfo.outputPath(`fitlocale-${checkIndex}-${mode}-${viewport.width}x${viewport.height}.png`);
    const size = await page.evaluate(() => (window as unknown as Api).__fitlocale.documentSize());
    await page.screenshot({ fullPage: true, path });
    screenshots.push({ mode, viewport, path, size });
  };

  const isSource = expectedLocale === null || sameLocale(expectedLocale, options.sourceLocale);
  let skippedRtl = false; // report an already-RTL page once, not once per viewport

  try {
    for (const [index, viewport] of viewports.entries()) {
      if (options.viewports !== 'current') await page.setViewportSize(viewport);
      await ensureInjected(page);
      await page.evaluate(() => (window as unknown as Api).__fitlocale.assignKeys());

      // Leaks and locale persistence do not depend on the viewport: check them once.
      if (index === 0) {
        const sourceIssues = enrich(
          await page.evaluate(([ig, k]) => (window as unknown as Api).__fitlocale.scanLeaks(ig, k), [options.ignore, keys] as const),
          'source', viewport,
        );
        if (expectedLocale !== null) {
          const actual = await probeLocale(page, options);
          if (!sameLocale(actual, expectedLocale)) {
            const box = { x: 0, y: 0, ...(await page.evaluate(() => (window as unknown as Api).__fitlocale.documentSize())) };
            const neverReflected = ctx.probeAfterSwitch != null && !sameLocale(ctx.probeAfterSwitch, expectedLocale);
            const template = neverReflected ? LOCALE_NOT_REFLECTED_MESSAGE : MESSAGES['locale/persistence'];
            const message = template.replace('{expected}', expectedLocale).replace('{actual}', actual);
            sourceIssues.push(...enrich([{ rule: 'locale/persistence', key: 'html', selector: 'html', box, text: actual }], 'source', viewport, message));
          }
        }
        if (sourceIssues.length) await shoot('source', viewport);
        issues.push(...sourceIssues);
      }

      if (!isSource) continue;
      const sourceOverflow = await page.evaluate(ig => (window as unknown as Api).__fitlocale.findOverflow(ig), options.ignore);

      if (options.modes.includes('pseudo-long')) {
        try {
          await page.evaluate(([e, ig]) => (window as unknown as Api).__fitlocale.rewriteText(e, ig), [options.expansion, options.ignore] as const);
          await settle(page);
          const found = subtractSource(
            await page.evaluate(ig => (window as unknown as Api).__fitlocale.findOverflow(ig), options.ignore),
            sourceOverflow,
          );
          if (found.length) await shoot('pseudo-long', viewport);
          issues.push(...enrich(found, 'pseudo-long', viewport));
        } finally {
          await page.evaluate(() => (window as unknown as Api).__fitlocale.restoreText());
        }
      }

      if (options.modes.includes('pseudo-rtl')) {
        if (await page.evaluate(() => (window as unknown as Api).__fitlocale.documentDir()) === 'rtl') {
          if (!skippedRtl) {
            const box = { x: 0, y: 0, ...(await page.evaluate(() => (window as unknown as Api).__fitlocale.documentSize())) };
            issues.push(...enrich([{ rule: 'rtl/skipped-already-rtl', key: 'html', selector: 'html', box, text: '' }], 'pseudo-rtl', viewport));
            skippedRtl = true;
          }
          continue;
        }
        const snapshot = () => page.evaluate(
          ([ig, mi]) => (window as unknown as Api).__fitlocale.snapshotBoxes(ig, mi), [options.ignore, options.mirrorIgnore] as const);
        try {
          const ltr = await snapshot();
          await page.evaluate(() => (window as unknown as Api).__fitlocale.setDir('rtl'));
          await settle(page);
          const rtl = await snapshot();
          const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
          const found = findNotMirrored(ltr, rtl, { viewportWidth });
          if (found.length) await shoot('pseudo-rtl', viewport);
          issues.push(...enrich(found, 'pseudo-rtl', viewport));
        } finally {
          await page.evaluate(() => (window as unknown as Api).__fitlocale.setDir(null));
        }
      }
    }
  } finally {
    if (original && options.viewports !== 'current') await page.setViewportSize(original);
  }

  return {
    testTitle: testInfo.title,
    testFile: relative(process.cwd(), testInfo.file),
    checkIndex,
    url: page.url(),
    issues,
    screenshots,
  };
}
