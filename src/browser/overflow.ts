import type { RawIssue, RuleId } from '../types';
import {
  clip, clipRects, composedContains, composedElements, directText, directTextNodes, docBox, ignoreSelector, isIgnored, isVisible, keyOf,
  rangeFor, sameDocument, selectorOf, type Rect,
} from './dom';
import { textElements } from './boxes';

const EPS = 1;
const CLIPPING = new Set(['hidden', 'clip']);
const INTERACTIVE = 'a[href], button, [role=button], input[type=button], input[type=submit], select';

/** Union of the client rects of an element's own text nodes, or null when it has none. */
function textRect(el: Element): Rect | null {
  let rect: Rect | null = null;
  const nodes = directTextNodes(el);
  if (nodes.length === 0) return null;
  const range = rangeFor(nodes[0]);
  for (const node of nodes) {
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.width === 0 && r.height === 0) continue;
      rect = rect
        ? { left: Math.min(rect.left, r.left), top: Math.min(rect.top, r.top), right: Math.max(rect.right, r.right), bottom: Math.max(rect.bottom, r.bottom) }
        : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
  }
  range.collapse(true);
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

const escapesX = (inner: Rect, outer: Rect) => inner.left < outer.left - EPS || inner.right > outer.right + EPS;
const escapesY = (inner: Rect, outer: Rect) => inner.top < outer.top - EPS || inner.bottom > outer.bottom + EPS;
const escapes = (inner: Rect, outer: Rect) => escapesX(inner, outer) || escapesY(inner, outer);

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
  const controls = composedElements()
    .filter(el => el.matches(INTERACTIVE) && !isIgnored(el, ignoreSel) && isVisible(el));
  // Per line fragment: a wrapped inline link's bounding box spans both lines and would "overlap" its neighbours.
  const fragments = controls.map(el => Array.from(el.getClientRects()).filter(r => r.width > 0 && r.height > 0));
  const touches = (as: DOMRect[], bs: DOMRect[]) => as.some(a => bs.some(b => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 && w * h >= 4;
  }));
  const reported = new Set<Element>();
  const issues: RawIssue[] = [];
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i], b = controls[j];
      // Rects of different documents (a frame's and the page's) are not in the same coordinates.
      if (reported.has(a) || !sameDocument(a, b) || !touches(fragments[i], fragments[j])) continue;
      // Only for touching pairs: walking up the composed tree for every pair would be slow on pages with many links.
      if (!composedContains(a, b) && !composedContains(b, a)) {
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
    const clipBy = clipRects(el);
    if ((clipBy.x && escapesX(text, clipBy.x)) || (clipBy.y && escapesY(text, clipBy.y))) {
      issues.push(issue('overflow/clipped', el));
    }
  }
  return [...issues, ...overlaps(ignoreSel)];
}
