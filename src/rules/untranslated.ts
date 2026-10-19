import { clip } from '../browser/dom';
import type { RawIssue, TextBlock } from '../types';
import { explicitlyOtherLanguage, sameLanguage } from './i18n';

/** Is `text` (as rendered) one of the source-language messages? */
export type SourceMatcher = (text: string) => boolean;

const ICU = /\{\s*\w+\s*,\s*(plural|select|selectordinal)\s*,/;
const PLACEHOLDER = /\{\{\s*[\w.]+\s*\}\}|\$\{[^}]*\}|\{[^{}]*\}|%(?:\d+\$)?[sdif@]/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Matches rendered text against source messages: HTML tags stripped, placeholders filled with anything.
 * Messages with fewer than two words are left out: one-word labels ("OK", "Total") are often the same across languages.
 */
export function sourceMatcher(values: string[]): SourceMatcher {
  const exact = new Set<string>();
  const patterns: Array<{ re: RegExp; chunk: string }> = [];
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
    patterns.push({ re: new RegExp(`^${literals.map(escape).join('[\\s\\S]+?')}$`), chunk });
  }
  return rendered => {
    const text = normalize(rendered);
    if (exact.has(text)) return true;
    return patterns.some(p => text.includes(p.chunk) && p.re.test(text));
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
