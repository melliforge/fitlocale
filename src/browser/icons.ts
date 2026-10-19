import type { Box, RawIssue } from '../types';
import { classifyIcon, iconTokens, type IconKind, type IconOverride } from '../rules/icons';
import { clip, docBox, ignoreSelector, isIgnored, isVisible, keyOf, selectorOf } from './dom';

export interface IconRecord { key: string; selector: string; box: Box; kind: IconKind; name: string; sign: number; signature: string }

const MAX_ICON = 64;
const ICON_CLASS = /icon|fa-|bi-|mdi|material|glyph|ti-|ri-/i;
const LIGATURE = /^[a-z_]+$/;
const CONTROL = 'a, button, [role=button]';
const EMPTY_CONTENT = new Set(['none', 'normal', '""', "''"]);

const pseudoContent = (el: Element, which: '::before' | '::after') => getComputedStyle(el, which).content;

/** A small svg, img, icon-font glyph or background-image sprite. */
function isIcon(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (el instanceof SVGElement && tag !== 'svg') return false;
  if (tag === 'svg' && el.parentElement?.closest('svg')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1 || r.width > MAX_ICON || r.height > MAX_ICON) return false;
  if (tag === 'svg' || tag === 'img') return true;
  const text = (el.textContent ?? '').trim();
  if (text !== '' && !LIGATURE.test(text)) return false;
  if (ICON_CLASS.test(el.getAttribute('class') ?? '')) return true;
  if (!EMPTY_CONTENT.has(pseudoContent(el, '::before'))) return true;
  return text === '' && getComputedStyle(el).backgroundImage !== 'none';
}

/** The last path segment of a URL without its extension; nothing for data: URLs (their base64 is not a name). */
const fileName = (url: string | null) => (!url || url.startsWith('data:') ? '' : url.split(/[?#]/)[0].split('/').pop()!.replace(/\.\w+$/, ''));

function ownNames(el: Element): string[] {
  const attr = (name: string) => el.getAttribute(name) ?? '';
  const use = el.querySelector('use');
  const useHref = use?.getAttribute('href') ?? use?.getAttribute('xlink:href') ?? '';
  const text = (el.textContent ?? '').trim();
  return [
    attr('class'), el.id, attr('data-icon'), attr('data-testid'), attr('aria-label'), attr('title'), attr('alt'),
    fileName(el.getAttribute('src')), useHref.includes('#') ? useHref.split('#').pop()! : fileName(useHref),
    el.querySelector('title')?.textContent ?? '', LIGATURE.test(text) ? text : '',
  ];
}

const controlOf = (el: Element) => el.parentElement?.closest(CONTROL) ?? null;

function controlName(control: Element | null): string {
  if (!control) return '';
  return control.getAttribute('aria-label') ?? (control.textContent ?? '').trim().slice(0, 40);
}

/** data-fitlocale-icon on the icon or an ancestor, up to and including its link or button. */
function overrideAttribute(el: Element, control: Element | null): string | null {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const value = n.getAttribute('data-fitlocale-icon');
    if (value) return value;
    if (n === control || !control) break;
  }
  return null;
}

function angleCos(value: string): number {
  const m = /(-?[\d.]+)(deg|rad|turn|grad)\s*$/.exec(value.trim());
  if (!m) return 1;
  const n = parseFloat(m[1]);
  const rad = m[2] === 'deg' ? (n * Math.PI) / 180 : m[2] === 'turn' ? n * 2 * Math.PI : m[2] === 'grad' ? (n * Math.PI) / 200 : n;
  return Math.cos(rad);
}

/** -1 when the element and its ancestors draw it horizontally flipped, else 1. */
function flipSign(el: Element): number {
  let sign = 1;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const s = getComputedStyle(n);
    const matrix = /matrix(?:3d)?\(\s*(-?[\d.e+-]+)/.exec(s.transform);
    if (matrix && parseFloat(matrix[1]) < 0) sign = -sign;
    if (s.scale && s.scale !== 'none' && parseFloat(s.scale) < 0) sign = -sign;
    // Only a rotation about the z axis turns the drawing around; `rotate: y 180deg` is a 3D flip we leave alone.
    if (s.rotate && s.rotate !== 'none' && !/^[xy]\s|^\S+\s+\S+\s+\S+\s/.test(s.rotate.trim()) && angleCos(s.rotate) < -1e-6) sign = -sign;
  }
  return sign;
}

/** 32-bit FNV-1a, to compare SVG markup cheaply. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}

/** What the icon draws: changes when an app swaps it for its right-to-left version. */
function signature(el: Element): string {
  const s = getComputedStyle(el);
  const parts = [pseudoContent(el, '::before'), pseudoContent(el, '::after'), s.backgroundImage, s.backgroundPosition, (el.textContent ?? '').trim()];
  if (el instanceof HTMLImageElement) parts.push(el.currentSrc || el.src);
  if (el.tagName.toLowerCase() === 'svg') parts.push(hash(el.outerHTML));
  return parts.join('|');
}

export function snapshotIcons(ignore: string[], manifest: Record<string, IconOverride>): IconRecord[] {
  const ignoreSel = ignoreSelector(ignore);
  const records: IconRecord[] = [];
  let lastIcon: Element | null = null;
  for (const el of document.body.querySelectorAll('*')) {
    if (lastIcon?.contains(el)) continue; // icons inside icons
    if (!isIcon(el) || isIgnored(el, ignoreSel) || !isVisible(el)) continue;
    lastIcon = el;
    const control = controlOf(el);
    const own = iconTokens(...ownNames(el));
    const kind = classifyIcon(own, iconTokens(controlName(control)), manifest, overrideAttribute(el, control));
    records.push({
      key: keyOf(el), selector: selectorOf(el), box: docBox(el), kind, name: clip(own.join(' ')), sign: flipSign(el), signature: signature(el),
    });
  }
  return records;
}

/** Icons that should have flipped and did not, and invariant icons that flipped. */
export function compareIcons(before: IconRecord[], after: IconRecord[]): RawIssue[] {
  const ltr = new Map(before.map(r => [r.key, r]));
  const issues: RawIssue[] = [];
  for (const rtl of after) {
    const was = ltr.get(rtl.key);
    if (!was) continue;
    const flipped = was.sign !== rtl.sign;
    const redrawn = was.signature !== rtl.signature;
    const issue = (rule: RawIssue['rule']) => ({ rule, key: rtl.key, selector: rtl.selector, box: rtl.box, text: rtl.name });
    if (rtl.kind === 'mirror' && !flipped && !redrawn) issues.push(issue('rtl/icon-not-mirrored'));
    if (rtl.kind === 'invariant' && flipped) issues.push(issue('rtl/icon-mirrored'));
  }
  return issues;
}
