import type { RawIssue, RuleId } from '../types';
import { clip, directText, directTextNodes, docBox, ignoreSelector, isVisible, keyOf, selectorOf } from './dom';
import { textElements } from './boxes';

const EPS = 1;
const CLIPPING = new Set(['hidden', 'clip']);
const INTERACTIVE = 'a[href], button, [role=button], input[type=button], input[type=submit], select';

interface Rect { left: number; top: number; right: number; bottom: number }

/** Union of the client rects of an element's own text nodes, or null when it has none. */
function textRect(el: Element): Rect | null {
  let rect: Rect | null = null;
  for (const node of directTextNodes(el)) {
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.width === 0 && r.height === 0) continue;
      rect = rect
        ? { left: Math.min(rect.left, r.left), top: Math.min(rect.top, r.top), right: Math.max(rect.right, r.right), bottom: Math.max(rect.bottom, r.bottom) }
        : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
  }
  return rect;
}

function contentRect(el: Element, style: CSSStyleDeclaration): Rect {
  const r = el.getBoundingClientRect();
  const px = (p: string) => parseFloat(style.getPropertyValue(p)) || 0;
  return {
    left: r.left + px('border-left-width') + px('padding-left'),
    top: r.top + px('border-top-width') + px('padding-top'),
    right: r.right - px('border-right-width') - px('padding-right'),
    bottom: r.bottom - px('border-bottom-width') - px('padding-bottom'),
  };
}

/** Padding box of an element (the area its overflow is clipped to). */
function paddingRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  const left = r.left + el.clientLeft;
  const top = r.top + el.clientTop;
  return { left, top, right: left + el.clientWidth, bottom: top + el.clientHeight };
}

const escapes = (inner: Rect, outer: Rect) =>
  inner.left < outer.left - EPS || inner.top < outer.top - EPS || inner.right > outer.right + EPS || inner.bottom > outer.bottom + EPS;

/** Nearest ancestor that hides its overflow (scrollable containers are not clipping). */
function clippingAncestor(el: Element): Element | null {
  for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
    const s = getComputedStyle(a);
    if (CLIPPING.has(s.overflowX) || CLIPPING.has(s.overflowY)) return a;
  }
  return null;
}

function ownOverflowRule(el: Element, s: CSSStyleDeclaration): RuleId | null {
  const wide = el.scrollWidth > el.clientWidth + EPS;
  const tall = el.scrollHeight > el.clientHeight + EPS;
  const clamp = s.getPropertyValue('-webkit-line-clamp');
  if ((s.textOverflow === 'ellipsis' && CLIPPING.has(s.overflowX) && wide) || (clamp && clamp !== 'none' && tall)) {
    return 'overflow/ellipsis';
  }
  if ((CLIPPING.has(s.overflowX) && wide) || (CLIPPING.has(s.overflowY) && tall)) return 'overflow/clipped';
  return null;
}

function issue(rule: RuleId, el: Element): RawIssue {
  return { rule, key: keyOf(el), selector: selectorOf(el), box: docBox(el), text: clip(directText(el)) };
}

function overlaps(ignoreSel: string): RawIssue[] {
  const controls = Array.from(document.body.querySelectorAll(INTERACTIVE))
    .filter(el => !(ignoreSel && el.closest(ignoreSel)) && isVisible(el));
  const rects = controls.map(el => el.getBoundingClientRect());
  const reported = new Set<Element>();
  const issues: RawIssue[] = [];
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i], b = controls[j];
      if (a.contains(b) || b.contains(a)) continue;
      const w = Math.min(rects[i].right, rects[j].right) - Math.max(rects[i].left, rects[j].left);
      const h = Math.min(rects[i].bottom, rects[j].bottom) - Math.max(rects[i].top, rects[j].top);
      if (w > 0 && h > 0 && w * h >= 4 && !reported.has(a)) {
        reported.add(a);
        issues.push(issue('overflow/overlap', a));
      }
    }
  }
  return issues;
}

export function findOverflow(ignore: string[]): RawIssue[] {
  const ignoreSel = ignoreSelector(ignore);
  const issues: RawIssue[] = [];
  for (const el of textElements(ignoreSel)) {
    const s = getComputedStyle(el);
    const own = ownOverflowRule(el, s);
    if (own) {
      issues.push(issue(own, el));
      continue;
    }
    const text = textRect(el);
    if (!text) continue;
    if (s.overflowX === 'visible' && escapes(text, contentRect(el, s))) {
      issues.push(issue('overflow/escapes-box', el));
      continue;
    }
    const ancestor = clippingAncestor(el);
    if (ancestor && escapes(text, paddingRect(ancestor))) issues.push(issue('overflow/clipped', el));
  }
  return [...issues, ...overlaps(ignoreSel)];
}
