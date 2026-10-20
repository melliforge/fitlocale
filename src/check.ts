import { dirname, relative, resolve } from 'node:path';
import type { Frame, FullConfig, Page, TestInfo } from '@playwright/test';
import { ensureInjected } from './inject';
import type { FitlocaleOptions } from './options';
import { flattenKeys, flattenValues } from './pseudo';
import { backTranslatorFor, readMessages } from './messages';
import { findConcatenated, findHardcoded, hasPseudoMarkers } from './rules/i18n';
import { isRtlLocale } from './rules/icons';
import { openDevtools, type Devtools } from './devtools/session';
import { attachCssSources } from './devtools/css-pointer';
import { findFontFallback } from './devtools/fonts';
import { subtractSource } from './rules/noise';
import { resolveSelectors } from './selectors';
import { findUntranslated, sourceMatcher, type SourceMatcher } from './rules/untranslated';
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
  /** Playwright's `testIdAttribute` option, used for readable selectors. */
  testIdAttribute?: string;
}

type Api = { __fitlocale: FitlocaleBrowserApi };

/** Parsed `sourceMessages` files, keyed by absolute path. */
const messagesCache = new Map<string, { keys: string[]; values: string[] }>();

/** Relative option paths resolve against the directory of the Playwright config, like Playwright's own. */
export function configDirOf(config: Pick<FullConfig, 'configFile'>): string {
  return config.configFile ? dirname(config.configFile) : process.cwd();
}

function loadMessages(path: string, baseDir: string): { keys: string[]; values: string[] } {
  const file = resolve(baseDir, path);
  if (!messagesCache.has(file)) {
    const messages = readMessages(file, 'sourceMessages');
    messagesCache.set(file, { keys: flattenKeys(messages), values: flattenValues(messages) });
  }
  return messagesCache.get(file)!;
}

/** Dotted keys of the `sourceMessages` file, resolved against `baseDir`. */
export function knownKeys(path: string | undefined, baseDir: string): string[] {
  return path ? loadMessages(path, baseDir).keys : [];
}

/** Every string of the `sourceMessages` file, resolved against `baseDir`. */
export function sourceValues(path: string | undefined, baseDir: string): string[] {
  return path ? loadMessages(path, baseDir).values : [];
}

const matcherCache = new Map<string, SourceMatcher>();

/** A matcher for the strings of the `sourceMessages` file, built once per file. */
function matcherFor(path: string, baseDir: string): SourceMatcher {
  const file = resolve(baseDir, path);
  if (!matcherCache.has(file)) matcherCache.set(file, sourceMatcher(sourceValues(path, baseDir)));
  return matcherCache.get(file)!;
}

/** Is `locale` one of the `pseudoLocales` (exact, case-insensitive)? */
export function isPseudoLocale(locale: string, options: FitlocaleOptions): boolean {
  return options.pseudoLocales.some(p => p.toLowerCase() === locale.toLowerCase());
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
 * Resolves false when the fonts were not ready in time.
 */
const settle = (page: Page, waitForFonts: boolean) =>
  page.evaluate(async ([timeout, fonts]) => {
    const ready = !fonts || await Promise.race([document.fonts.ready.then(() => true), new Promise<boolean>(r => setTimeout(() => r(false), timeout))]);
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    return ready;
  }, [FONT_TIMEOUT_MS, waitForFonts] as const);

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
  // A context created with `viewport: null` has no fixed size: use (and later restore) the window's size.
  const original = page.viewportSize()
    ?? await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const viewports: Viewport[] = options.viewports === 'current' ? [original] : options.viewports;
  const baseDir = configDirOf(testInfo.config);
  const keys = knownKeys(options.sourceMessages, baseDir);
  const issues: Issue[] = [];
  const screenshots: Screenshot[] = [];
  // Without useLocale(), a page showing a pseudo locale is still checked as one.
  let locale = expectedLocale ?? options.sourceLocale;
  if (expectedLocale === null) {
    const probed = await probeLocale(page, options);
    if (typeof probed === 'string' && isPseudoLocale(probed, options)) locale = probed;
  }
  const isPseudo = isPseudoLocale(locale, options);

  const enrich = (raw: RawIssue[], mode: Mode, viewport: Viewport, message?: string): Issue[] =>
    raw.map(r => ({
      ...r, mode, locale, viewport, url: page.url(), severity: SEVERITY[r.rule],
      // Replacer functions: a value like "$$5" must arrive as written, not as a replacement pattern.
      message: message ?? MESSAGES[r.rule].replace('{text}', () => r.text).replace('{visual}', () => r.visual ?? '').replace('{locale}', () => locale)
        .replace('{used}', () => r.used ?? '').replace('{declared}', () => r.declared ?? ''),
      ...(FIXES[r.rule] ? { fix: FIXES[r.rule] } : {}),
    }));

  const shot = new Set<string>();
  const shoot = async (mode: Mode, viewport: Viewport) => {
    const id = `${mode}-${viewport.width}x${viewport.height}`;
    if (!options.screenshots || shot.has(id)) return;
    shot.add(id);
    const path = testInfo.outputPath(`fitlocale-${checkIndex}-${mode}-${viewport.width}x${viewport.height}.png`);
    const size = await page.evaluate(() => (window as unknown as Api).__fitlocale.documentSize());
    await page.screenshot({ fullPage: true, path });
    screenshots.push({ mode, viewport, path, size });
  };

  // Checked first: a pseudo locale such as en-XA shares its language with the source.
  const isSource = !isPseudo && (expectedLocale === null || sameLocale(expectedLocale, options.sourceLocale));
  // Opened on first use only: most checks never need DevTools.
  let devtools: Devtools | null | undefined;
  const getDevtools = async () => {
    if (!options.devtools) return null;
    if (devtools === undefined) devtools = await openDevtools(page);
    return devtools;
  };
  let skippedRtl = false; // report an already-RTL page once, not once per viewport
  // A font that never loads would cost the full timeout at every text change: after one timeout, stop waiting for fonts.
  let fontsLoad = true;
  const settleHere = async () => { if (!await settle(page, fontsLoad)) fontsLoad = false; };
  let fellBack = false; // the page shows another locale than the one useLocale() asked for
  // In a real locale with localeMessages: maps the page's text back to the source text. Built before the page is touched.
  const toSource = expectedLocale !== null && !isSource && !isPseudo && options.localeMessages
    ? backTranslatorFor(options, locale, baseDir)
    : null;

  const findOverflow = () => page.evaluate(ig => (window as unknown as Api).__fitlocale.findOverflow(ig), options.ignore);
  /** Overflow on the page as it is, minus what it also has once `approximate()` puts back (roughly) the source text. */
  const overflowAgainst = async (approximate: () => Promise<boolean>): Promise<RawIssue[]> => {
    const asIs = await findOverflow();
    let approx = asIs;
    try {
      if (await approximate()) {
        await settleHere();
        approx = await findOverflow();
      }
    } finally {
      await page.evaluate(() => (window as unknown as Api).__fitlocale.restoreText());
      await settleHere();
    }
    return subtractSource(asIs, approx);
  };

  try {
    for (const [index, viewport] of viewports.entries()) {
      if (options.viewports !== 'current') await page.setViewportSize(viewport);
      await ensureInjected(page);
      await page.evaluate(attr => (window as unknown as Api).__fitlocale.assignKeys(attr), ctx.testIdAttribute ?? 'data-testid');

      // Leaks and locale persistence do not depend on the viewport: check them once.
      if (index === 0) {
        const sourceIssues = enrich(
          await page.evaluate(([ig, k]) => (window as unknown as Api).__fitlocale.scanLeaks(ig, k), [options.ignore, keys] as const),
          'source', viewport,
        );
        if (expectedLocale !== null) {
          const actual = await probeLocale(page, options);
          if (!sameLocale(actual, expectedLocale)) {
            fellBack = true;
            const box = { x: 0, y: 0, ...(await page.evaluate(() => (window as unknown as Api).__fitlocale.documentSize())) };
            const neverReflected = ctx.probeAfterSwitch != null && !sameLocale(ctx.probeAfterSwitch, expectedLocale);
            const template = neverReflected ? LOCALE_NOT_REFLECTED_MESSAGE : MESSAGES['locale/persistence'];
            const message = template.replace('{expected}', expectedLocale).replace('{actual}', actual);
            sourceIssues.push(...enrich([{ rule: 'locale/persistence', key: 'html', selector: 'html', box, text: actual }], 'source', viewport, message));
          }
        }
        if (isPseudo || (!isSource && options.sourceMessages)) {
          const blocks = await page.evaluate(ig => (window as unknown as Api).__fitlocale.collectTextBlocks(ig), options.ignore);
          const pageLocale = locale, sourceLocale = options.sourceLocale;
          if (isPseudo && blocks.length > 0 && !hasPseudoMarkers(blocks)) {
            // One clear issue instead of every string on the page reported as hardcoded.
            const box = { x: 0, y: 0, ...(await page.evaluate(() => (window as unknown as Api).__fitlocale.documentSize())) };
            const message = MESSAGES['i18n/pseudo-not-loaded'].replace('{locale}', locale);
            sourceIssues.push(...enrich([{ rule: 'i18n/pseudo-not-loaded', key: 'html', selector: 'html', box, text: '' }], 'source', viewport, message));
          } else {
            const found = isPseudo
              ? [...findHardcoded(blocks, { pageLocale, sourceLocale }), ...findConcatenated(blocks, { pageLocale })]
              : findUntranslated(blocks, matcherFor(options.sourceMessages!, baseDir), { pageLocale, sourceLocale });
            sourceIssues.push(...enrich(found, 'source', viewport));
          }
        }
        const dir = await page.evaluate(ig => (window as unknown as Api).__fitlocale.contentDir(ig), options.ignore);
        if (expectedLocale !== null && isRtlLocale(expectedLocale) && dir === 'ltr') {
          const box = { x: 0, y: 0, ...(await page.evaluate(() => (window as unknown as Api).__fitlocale.documentSize())) };
          sourceIssues.push(...enrich([{ rule: 'rtl/missing-dir', key: 'html', selector: 'html', box, text: '' }], 'source', viewport));
        }
        if (dir === 'rtl') {
          // A page that is right-to-left already: its mixed-direction text and canvases can be checked as they are.
          sourceIssues.push(...enrich([
            ...await page.evaluate(ig => (window as unknown as Api).__fitlocale.findBidiOrder(ig), options.ignore),
            ...await page.evaluate(ig => (window as unknown as Api).__fitlocale.findCanvases(ig), options.ignore),
            ...await page.evaluate(ig => (window as unknown as Api).__fitlocale.findClippedMarks(ig), options.ignore),
          ], 'source', viewport));
          const dt = await getDevtools();
          if (dt) sourceIssues.push(...enrich(await findFontFallback(page, dt, options.ignore), 'source', viewport));
        }
        if (sourceIssues.length) await shoot('source', viewport);
        issues.push(...sourceIssues);
      }

      // A page that fell back to another locale has no translation to compare: the persistence error says it all.
      if (toSource && !fellBack) {
        // The page is translated: compare it with the source text put back wherever the messages say what it was.
        // Read per viewport, since responsive pages show different text at different widths.
        const texts = await page.evaluate(ig => (window as unknown as Api).__fitlocale.visibleTexts(ig), options.ignore);
        const back = texts.map(text => [text, toSource(text)] as const);
        const replacements = Object.fromEntries(back.filter((pair): pair is readonly [string, string] => pair[1] !== null && pair[1] !== pair[0]));
        let found: Issue[] = [];
        if (index === 0 && texts.length > 0 && back.every(([, source]) => source === null)) {
          const box = { x: 0, y: 0, ...(await page.evaluate(() => (window as unknown as Api).__fitlocale.documentSize())) };
          found = enrich([{ rule: 'i18n/locale-messages-not-matched', key: 'html', selector: 'html', box, text: '' }], 'source', viewport);
        } else if (Object.keys(replacements).length > 0) {
          const raw = await overflowAgainst(async () =>
            await page.evaluate(([r, ig]) => (window as unknown as Api).__fitlocale.replaceText(r, ig), [replacements, options.ignore] as const) > 0);
          found = enrich(raw, 'source', viewport);
        }
        if (found.length) await shoot('source', viewport);
        issues.push(...found);
      }

      if (!isSource && !isPseudo) continue;

      if (isPseudo) {
        // The text is already long: compare the page as it is with an approximation of its source text.
        const found = await overflowAgainst(async () =>
          await page.evaluate(ig => (window as unknown as Api).__fitlocale.unpseudoText(ig), options.ignore) > 0);
        if (found.length) await shoot('source', viewport);
        issues.push(...enrich(found, 'source', viewport));
      }

      if (isSource && options.modes.includes('pseudo-long')) {
        const sourceOverflow = await page.evaluate(ig => (window as unknown as Api).__fitlocale.findOverflow(ig), options.ignore);
        try {
          await page.evaluate(([e, ig]) => (window as unknown as Api).__fitlocale.rewriteText(e, ig), [options.expansion, options.ignore] as const);
          await settleHere();
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
        const lists = [options.ignore, options.mirrorIgnore] as const;
        const iconArgs = [options.ignore, options.icons] as const;
        let rtlIssues: Issue[] = [];
        try {
          await page.evaluate(([ig, mi]) => (window as unknown as Api).__fitlocale.rememberBoxes(ig, mi), lists);
          await page.evaluate(([ig, ic]) => (window as unknown as Api).__fitlocale.rememberIcons(ig, ic), iconArgs);
          await page.evaluate(() => (window as unknown as Api).__fitlocale.setDir('rtl'));
          await settleHere();
          const found = [
            ...await page.evaluate(([ig, mi]) => (window as unknown as Api).__fitlocale.findNotMirrored(ig, mi), lists),
            ...await page.evaluate(([ig, ic]) => (window as unknown as Api).__fitlocale.findIconIssues(ig, ic), iconArgs),
            // Canvases do not depend on the viewport: list them once per check.
            ...(index === 0 ? await page.evaluate(ig => (window as unknown as Api).__fitlocale.findCanvases(ig), options.ignore) : []),
          ];
          if (found.length) await shoot('pseudo-rtl', viewport);
          rtlIssues = enrich(found, 'pseudo-rtl', viewport);
          issues.push(...rtlIssues);
        } finally {
          await page.evaluate(() => (window as unknown as Api).__fitlocale.setDir(null));
        }
        // Back to left-to-right, still at this viewport (media queries): read which CSS keeps each element in place.
        if (rtlIssues.some(i => i.rule === 'rtl/not-mirrored')) {
          const dt = await getDevtools();
          if (dt) await attachCssSources(page, dt, rtlIssues);
        }
      }
    }
  } finally {
    if (options.viewports !== 'current') await page.setViewportSize(original);
    if (devtools) await devtools.close();
  }
  await resolveSelectors(page, issues);

  return {
    testTitle: testInfo.title,
    testFile: relative(process.cwd(), testInfo.file),
    checkIndex,
    url: page.url(),
    issues,
    screenshots,
  };
}
