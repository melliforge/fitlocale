import { clip } from '../browser/dom';
import type { RawIssue, TextBlock } from '../types';
import { explicitlyOtherLanguage, sameLanguage } from './i18n';

/** Is `text` (as rendered) one of the source-language messages? */
export type SourceMatcher = (text: string) => boolean;

const ICU = /\{\s*\w+\s*,\s*(plural|select|selectordinal)\s*,/;
const PLACEHOLDER = /\{\{\s*[\w.]+\s*\}\}|\$\{[^}]*\}|\{[^{}]*\}|%(?:\d+\$)?[sdif@]/g;
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Does `text` read as `literals` with at least one character between each two (a filled placeholder)?
 * Left to right, each literal at its first place after the previous one: linear, unlike a regex with lazy groups,
 * which backtracks for seconds on a long paragraph against a message with several placeholders.
 */
function fills(text: string, literals: string[]): boolean {
  const first = literals[0], last = literals[literals.length - 1];
  if (!text.startsWith(first) || !text.endsWith(last)) return false;
  const end = text.length - last.length;
  let pos = first.length;
  for (let i = 1; i < literals.length - 1; i++) {
    const at = text.indexOf(literals[i], pos + 1);
    if (at < 0) return false;
    pos = at + literals[i].length;
  }
  return end - pos >= 1;
}

/**
 * Matches rendered text against source messages: HTML tags stripped, placeholders filled with anything.
 * Messages with fewer than two words are left out: one-word labels ("OK", "Total") are often the same across languages.
 */
export function sourceMatcher(values: string[]): SourceMatcher {
  const exact = new Set<string>();
  const patterns: Array<{ literals: string[]; chunk: string }> = [];
  for (const value of values) {
    if (ICU.test(value) || value.includes('$t(') || value.includes('@:')) continue;
    const text = normalize(value.replace(/<[^>]*>/g, ''));
    const literals = text.split(PLACEHOLDER);
    if ((literals.join(' ').match(/\p{L}{2,}/gu) ?? []).length < 2) continue;
    if (literals.length === 1) {
      exact.add(text);
      continue;
    }
    const chunk = literals.reduce((a, b) => (b.length > a.length ? b : a), '');
    patterns.push({ literals, chunk });
  }
  return rendered => {
    const text = normalize(rendered);
    if (exact.has(text)) return true;
    return patterns.some(p => text.includes(p.chunk) && fills(text, p.literals));
  };
}

/** In a real locale: text identical to a source-language message was probably never translated. */
export function findUntranslated(blocks: TextBlock[], match: SourceMatcher, opts: { pageLocale: string; sourceLocale: string }): RawIssue[] {
  if (sameLanguage(opts.pageLocale, opts.sourceLocale)) return [];
  const issues: RawIssue[] = [];
  for (const block of blocks) {
    if (explicitlyOtherLanguage(block.lang, opts.pageLocale)) continue;
    if (match(block.text)) {
      issues.push({ rule: 'i18n/untranslated', key: block.key, selector: block.selector, box: block.box, text: clip(block.text) });
      continue;
    }
    for (const c of block.controls) {
      const text = block.text.slice(c.start, c.end);
      if (explicitlyOtherLanguage(c.lang, opts.pageLocale) || !match(text)) continue;
      issues.push({ rule: 'i18n/untranslated', key: c.key, selector: c.selector, box: c.box, text: clip(text) });
    }
  }
  return issues;
}
