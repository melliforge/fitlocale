import { clip } from '../browser/dom';
import { MARK_END, MARK_START } from '../pseudo';
import type { Box, RawIssue, TextBlock } from '../types';
import { findLeaksInText } from './leaks';

const primary = (locale: string) => locale.trim().toLowerCase().split(/[-_]/)[0];

/** The script a locale is written in (`zh-TW` → Hant, `zh-CN` → Hans, `sr` → Cyrl), or '' for an invalid tag. */
function scriptOf(locale: string): string {
  try {
    return new Intl.Locale(locale.trim()).maximize().script ?? '';
  } catch {
    return '';
  }
}

/** `en-GB` and `en-US` share a language; so do `EN` and `en-XA`. `zh-TW` and `zh-CN` don't: different scripts. */
export function sameLanguage(a: string, b: string): boolean {
  return primary(a) !== '' && primary(a) === primary(b) && scriptOf(a) === scriptOf(b);
}

/** Text marked with a `lang` of another language (a language picker, a quotation) is left alone. */
export const explicitlyOtherLanguage = (lang: string, pageLocale: string) => lang !== '' && !sameLanguage(lang, pageLocale);

/** For each character: is it inside, or part of, a `⟦…⟧` pair? An unmatched `⟦` marks to the end; a stray `⟧` is marked. */
export function markedMask(text: string): boolean[] {
  const mask: boolean[] = [];
  let depth = 0;
  for (const ch of text.split('')) {
    if (ch === MARK_START) {
      depth++;
      mask.push(true);
    } else if (ch === MARK_END) {
      mask.push(true);
      if (depth > 0) depth--;
    } else {
      mask.push(depth > 0);
    }
  }
  return mask;
}

/** The outermost `⟦…⟧` pairs; an unmatched `⟦` runs to the end of the text. */
export function topLevelFragments(text: string): Array<{ start: number; end: number }> {
  const fragments: Array<{ start: number; end: number }> = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === MARK_START) {
      if (depth++ === 0) start = i;
    } else if (text[i] === MARK_END && depth > 0 && --depth === 0) {
      fragments.push({ start, end: i + 1 });
    }
  }
  if (depth > 0) fragments.push({ start, end: text.length });
  return fragments;
}

export interface TextUnit {
  text: string; start: number; end: number; key: string; selector: string; box: Box; lang: string;
  /** The ranges of `block.text` this unit is made of: one for a control, the gaps between controls for the rest. */
  ranges: Array<[number, number]>;
}

/** Each inline control, then the block's remaining text (the block minus its controls), if any. */
export function units(block: TextBlock): TextUnit[] {
  const controls = [...block.controls].sort((a, b) => a.start - b.start);
  const result: TextUnit[] = controls.map(c => ({
    text: block.text.slice(c.start, c.end), start: c.start, end: c.end,
    key: c.key, selector: c.selector, box: c.box, lang: c.lang, ranges: [[c.start, c.end]],
  }));
  const ranges: Array<[number, number]> = [];
  let at = 0;
  for (const c of controls) {
    if (c.start > at) ranges.push([at, c.start]);
    at = Math.max(at, c.end);
  }
  if (at < block.text.length) ranges.push([at, block.text.length]);
  const rest = ranges.map(([s, e]) => block.text.slice(s, e)).join(' ').replace(/\s+/g, ' ').trim();
  if (rest !== '') {
    result.push({
      text: rest, start: 0, end: block.text.length, key: block.key, selector: block.selector, box: block.box, lang: block.lang, ranges,
    });
  }
  return result;
}

/** Languages whose own names commonly appear untranslated, in language pickers. */
const NATIVE_NAME_LOCALES = [
  'ar', 'bg', 'bn', 'ca', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fa', 'fi', 'fr', 'he', 'hi', 'hr', 'hu', 'id', 'it', 'ja',
  'ko', 'lt', 'lv', 'ms', 'nb', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sr', 'sv', 'sw', 'th', 'tr', 'uk', 'ur', 'vi', 'zh',
];

/** Regional and script variants whose own names appear in language pickers ("português (Brasil)", "简体中文"). */
const VARIANT_NAME_LOCALES = ['pt-BR', 'pt-PT', 'zh-Hans', 'zh-Hant', 'en-GB', 'en-US', 'es-419', 'es-MX', 'fr-CA', 'de-AT', 'de-CH', 'sr-Latn'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'CAD', 'AUD', 'CHF', 'BRL', 'MXN', 'SAR', 'AED', 'EGP', 'TND', 'MAD', 'ILS', 'TRY'];
const UNITS = [
  'byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'meter', 'kilometer', 'mile', 'foot', 'inch', 'gram', 'kilogram', 'pound',
  'liter', 'second', 'minute', 'hour', 'day', 'week', 'month', 'year', 'percent',
] as const;

const letterRuns = (s: string) => (s.match(/\p{L}+/gu) ?? []).map(w => w.toLowerCase());

let nativeNames: Set<string> | null = null;
const allowCache = new Map<string, Set<string>>();

/** Words that are not UI text even without markers: formatted dates, times, relative times, currencies and units, AM/PM, language names. */
function allowedWords(locales: string[]): Set<string> {
  const cacheKey = locales.join('|');
  const cached = allowCache.get(cacheKey);
  if (cached) return cached;
  if (!nativeNames) {
    nativeNames = new Set();
    for (const code of [...NATIVE_NAME_LOCALES, ...VARIANT_NAME_LOCALES]) {
      try {
        for (const w of letterRuns(new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? '')) nativeNames.add(w);
      } catch { /* a runtime without this locale's data */ }
    }
  }
  const words = new Set([...nativeNames, 'am', 'pm']);
  for (const locale of locales) {
    try {
      for (const style of ['long', 'short'] as const) {
        const month = new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' });
        const weekday = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' });
        for (let m = 0; m < 12; m++) for (const w of letterRuns(month.format(Date.UTC(2026, m, 15)))) words.add(w);
        // 4 January 2026 is a Sunday.
        for (let d = 0; d < 7; d++) for (const w of letterRuns(weekday.format(Date.UTC(2026, 0, 4 + d)))) words.add(w);
      }
      // Full dates and times ("October 19, 2026 at 10:30 PM UTC") and time-zone names.
      const at = Date.UTC(2026, 9, 19, 22, 30);
      for (const dateStyle of [undefined, 'full', 'long', 'medium', 'short'] as const) {
        for (const timeStyle of [undefined, 'full', 'long', 'medium', 'short'] as const) {
          if (!dateStyle && !timeStyle) continue;
          for (const w of letterRuns(new Intl.DateTimeFormat(locale, { dateStyle, timeStyle, timeZone: 'UTC' }).format(at))) words.add(w);
        }
      }
      for (const timeZone of ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo']) {
        for (const timeZoneName of ['short', 'long'] as const) {
          for (const w of letterRuns(new Intl.DateTimeFormat(locale, { timeZone, timeZoneName }).format(at))) words.add(w);
        }
      }
      // Currency names and units ("42.00 euros", "5 kB", "3 km").
      const names = new Intl.DisplayNames([locale], { type: 'currency' });
      for (const currency of CURRENCIES) {
        for (const w of letterRuns(names.of(currency) ?? '')) words.add(w);
        for (const currencyDisplay of ['name', 'symbol', 'narrowSymbol', 'code'] as const) {
          for (const w of letterRuns(new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay }).format(42))) words.add(w);
        }
      }
      for (const unit of UNITS) {
        for (const unitDisplay of ['long', 'short', 'narrow'] as const) {
          for (const n of [1, 5]) for (const w of letterRuns(new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay }).format(n))) words.add(w);
        }
      }
      // Relative times ("yesterday", "3 hours ago", "in 2 weeks").
      for (const style of ['long', 'short'] as const) {
        for (const numeric of ['auto', 'always'] as const) {
          const rtf = new Intl.RelativeTimeFormat(locale, { style, numeric });
          for (const unit of ['second', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'] as const) {
            for (const n of [-3, -1, 0, 1, 3]) for (const w of letterRuns(rtf.format(n, unit))) words.add(w);
          }
        }
      }
    } catch { /* an invalid locale tag: no date words for it */ }
  }
  allowCache.set(cacheKey, words);
  return words;
}

/** Emails, URLs, domains and file names; and ordinals ("19th", "2nd"). */
const NOT_WORDS = /[@/]|\p{L}\.\p{L}|^\d+(st|nd|rd|th)\W*$/iu;

/** Does `text` contain a word (2+ letters) that is not a date, time or language-name word? */
function hasUiWords(text: string, allowed: Set<string>): boolean {
  const kept = text.split(/\s+/).filter(token => token !== '' && !NOT_WORDS.test(token)).join(' ');
  return letterRuns(kept).some(w => [...w].length >= 2 && !allowed.has(w));
}

const issue = (rule: RawIssue['rule'], u: { key: string; selector: string; box: Box }, text: string): RawIssue =>
  ({ rule, key: u.key, selector: u.selector, box: u.box, text: clip(text) });

/** In a pseudo-locale page: visible text with no pseudo-locale markers never went through the message files. */
export function findHardcoded(blocks: TextBlock[], opts: { pageLocale: string; sourceLocale: string }): RawIssue[] {
  const allowed = allowedWords([opts.sourceLocale, opts.pageLocale]);
  const issues: RawIssue[] = [];
  for (const block of blocks) {
    const mask = markedMask(block.text);
    for (const u of units(block)) {
      if (explicitlyOtherLanguage(u.lang, opts.pageLocale)) continue;
      if (u.ranges.some(([s, e]) => mask.slice(s, e).some(Boolean))) continue;
      if (findLeaksInText(u.text).length > 0) continue;
      if (hasUiWords(u.text, allowed)) issues.push(issue('i18n/hardcoded', u, u.text));
    }
  }
  return issues;
}

/** In a pseudo-locale page: one block made of 2+ separately translated messages (links and buttons excepted). */
export function findConcatenated(blocks: TextBlock[], opts: { pageLocale: string }): RawIssue[] {
  const issues: RawIssue[] = [];
  for (const block of blocks) {
    if (explicitlyOtherLanguage(block.lang, opts.pageLocale)) continue;
    const pieces = topLevelFragments(block.text)
      .filter(f => !block.controls.some(c => f.start >= c.start && f.end <= c.end));
    if (pieces.length >= 2) issues.push(issue('i18n/concatenated', block, block.text));
  }
  return issues;
}

/** Did the page load pseudo-locale messages at all? With none, every string would look hardcoded. */
export function hasPseudoMarkers(blocks: TextBlock[]): boolean {
  return blocks.some(b => b.text.includes(MARK_START) || b.text.includes(MARK_END));
}
