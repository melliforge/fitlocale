import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { ensureInjected } from './inject';
import type { FitlocaleOptions } from './options';
import { flattenKeys, type Messages } from './pseudo';
import { findNotMirrored } from './rules/mirror';
import { subtractSource } from './rules/noise';
import {
  FIXES, MESSAGES, SEVERITY, type CheckResult, type Issue, type Mode, type RawIssue, type Screenshot, type Viewport,
} from './types';
import type { FitlocaleBrowserApi } from './browser/api';

export interface CheckContext {
  page: Page;
  options: FitlocaleOptions;
  expectedLocale: string | null;
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

const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

export async function runLocaleCheck(ctx: CheckContext): Promise<CheckResult> {
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
          const actual = options.localeProbe
            ? await options.localeProbe(page)
            : await page.evaluate(() => (window as unknown as Api).__fitlocale.lang());
          if (!sameLocale(actual, expectedLocale)) {
            const box = { x: 0, y: 0, ...(await page.evaluate(() => (window as unknown as Api).__fitlocale.documentSize())) };
            const message = MESSAGES['locale/persistence'].replace('{expected}', expectedLocale).replace('{actual}', actual);
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
          await nextFrames(page);
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
          const box = { x: 0, y: 0, ...(await page.evaluate(() => (window as unknown as Api).__fitlocale.documentSize())) };
          issues.push(...enrich([{ rule: 'rtl/skipped-already-rtl', key: 'html', selector: 'html', box, text: '' }], 'pseudo-rtl', viewport));
          continue;
        }
        const snapshot = () => page.evaluate(
          ([ig, mi]) => (window as unknown as Api).__fitlocale.snapshotBoxes(ig, mi), [options.ignore, options.mirrorIgnore] as const);
        try {
          const ltr = await snapshot();
          await page.evaluate(() => (window as unknown as Api).__fitlocale.setDir('rtl'));
          await nextFrames(page);
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
