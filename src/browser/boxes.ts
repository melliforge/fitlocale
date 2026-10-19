import type { RawIssue } from '../types';
import type { BoxRecord } from '../rules/mirror';
import { findLeaksInText } from '../rules/leaks';
import {
  clip, directText, docBox, ignoreSelector, isIgnored, isVisible, keyOf, optionalSelector, selectorOf,
} from './dom';

const BOXED_TAGS = new Set(['img', 'svg', 'button', 'input', 'select']);

/** Visible, non-ignored elements that carry their own text. */
function textElements(ignoreSel: string): Element[] {
  return Array.from(document.body.querySelectorAll('*'))
    .filter(el => directText(el) !== '' && !isIgnored(el, ignoreSel) && isVisible(el));
}

export function snapshotBoxes(ignore: string[], mirrorIgnore: string[]): BoxRecord[] {
  const ignoreSel = ignoreSelector(ignore);
  const mirrorSel = optionalSelector(mirrorIgnore);
  const records: BoxRecord[] = [];
  for (const el of document.body.querySelectorAll('*')) {
    const text = directText(el);
    if (text === '' && !BOXED_TAGS.has(el.tagName.toLowerCase())) continue;
    if (isIgnored(el, ignoreSel) || !isVisible(el)) continue;
    records.push({
      key: keyOf(el), selector: selectorOf(el), box: docBox(el), text: clip(text), ignored: isIgnored(el, mirrorSel),
      direction: getComputedStyle(el).direction === 'rtl' ? 'rtl' : 'ltr',
    });
  }
  return records;
}

export function scanLeaks(ignore: string[], knownKeys: string[]): RawIssue[] {
  const known = new Set(knownKeys);
  const issues: RawIssue[] = [];
  for (const el of textElements(ignoreSelector(ignore))) {
    const text = directText(el);
    for (const leak of findLeaksInText(text, known)) {
      issues.push({ rule: leak.rule, key: keyOf(el), selector: selectorOf(el), box: docBox(el), text: clip(text) });
    }
  }
  return issues;
}

export { textElements };

/** The direction most visible text is laid out in; apps often set dir on a wrapper rather than <html> or <body>. */
export function contentDir(ignore: string[]): 'ltr' | 'rtl' {
  const elements = textElements(ignoreSelector(ignore));
  if (elements.length === 0) return getComputedStyle(document.body ?? document.documentElement).direction === 'rtl' ? 'rtl' : 'ltr';
  const rtl = elements.filter(el => getComputedStyle(el).direction === 'rtl').length;
  return rtl * 2 > elements.length ? 'rtl' : 'ltr';
}

const MIN_CANVAS = 40;

/** Visible canvases big enough to hold a chart or drawing: they ignore the page direction. */
export function findCanvases(ignore: string[]): RawIssue[] {
  const ignoreSel = ignoreSelector(ignore);
  return Array.from(document.body.querySelectorAll('canvas'))
    .filter(el => !isIgnored(el, ignoreSel) && isVisible(el))
    .filter(el => { const r = el.getBoundingClientRect(); return r.width >= MIN_CANVAS && r.height >= MIN_CANVAS; })
    .map(el => ({ rule: 'rtl/canvas' as const, key: keyOf(el), selector: selectorOf(el), box: docBox(el), text: '' }));
}
