import type { Box, RawIssue } from '../types';
import type { BoxRecord } from '../rules/mirror';
import { findLeaksInText } from '../rules/leaks';
import { hasRtlLetters } from '../rules/bidi';
import {
  clip, composedElements, directText, docBox, ignoreSelector, isIgnored, isVisible, keyOf, langOf, optionalSelector, selectorOf,
} from './dom';

const BOXED_TAGS = new Set(['img', 'svg', 'button', 'input', 'select']);

/** Visible, non-ignored elements that carry their own text. */
function textElements(ignoreSel: string): Element[] {
  return composedElements()
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
  const bodyDir = getComputedStyle(document.body ?? document.documentElement).direction === 'rtl' ? 'rtl' : 'ltr';
  // Without a dir attribute other than ltr, text follows <body>: skip counting every text element on large pages.
  if (!document.querySelector('[dir]:not([dir="ltr" i])')) return bodyDir;
  const elements = textElements(ignoreSelector(ignore));
  if (elements.length === 0) return bodyDir;
  const rtl = elements.filter(el => getComputedStyle(el).direction === 'rtl').length;
  return rtl * 2 > elements.length ? 'rtl' : 'ltr';
}

const MIN_CANVAS = 40;

/** Visible canvases big enough to hold a chart or drawing: they ignore the page direction. */
export function findCanvases(ignore: string[]): RawIssue[] {
  const ignoreSel = ignoreSelector(ignore);
  return composedElements()
    .filter(el => el.localName === 'canvas')
    .filter(el => !isIgnored(el, ignoreSel) && isVisible(el))
    .filter(el => { const r = el.getBoundingClientRect(); return r.width >= MIN_CANVAS && r.height >= MIN_CANVAS; })
    .map(el => ({ rule: 'rtl/canvas' as const, key: keyOf(el), selector: selectorOf(el), box: docBox(el), text: '' }));
}

const MAX_RTL_SAMPLES = 100;
const MAX_OTHER_SAMPLES = 20;

/** Text elements to ask DevTools about: right-to-left ones, plus a few others that show which fonts this machine has. */
export function fontSamples(ignore: string[]) {
  const samples: Array<{
    key: string; selector: string; box: Box; text: string; fontFamily: string; fontWeight: string; fontStyle: string; fontSize: string; lang: string; rtl: boolean;
  }> = [];
  const seen = new Set<string>();
  let rtlCount = 0, otherCount = 0;
  for (const el of textElements(ignoreSelector(ignore))) {
    const text = directText(el);
    const rtl = hasRtlLetters(text);
    if (rtl ? rtlCount >= MAX_RTL_SAMPLES : otherCount >= MAX_OTHER_SAMPLES) continue;
    const style = getComputedStyle(el);
    const fontFamily = style.fontFamily;
    const id = `${fontFamily}|${text}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (rtl) rtlCount++;
    else otherCount++;
    samples.push({
      key: keyOf(el), selector: selectorOf(el), box: docBox(el), text, fontFamily, rtl,
      fontWeight: style.fontWeight, fontStyle: style.fontStyle, fontSize: style.fontSize, lang: langOf(el),
    });
    if (rtlCount >= MAX_RTL_SAMPLES && otherCount >= MAX_OTHER_SAMPLES) break;
  }
  const loadedFamilies = Array.from(document.fonts).filter(f => f.status === 'loaded').map(f => f.family.replace(/^(["'])(.*)\1$/, '$2'));
  return { samples, loadedFamilies };
}
