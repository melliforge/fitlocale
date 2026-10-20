import type { RawIssue, RuleId } from '../types';
import {
  clip, clipRects, composedContains, composedElements, composedParent, directText, directTextNodes, docBox, ignoreSelector, isIgnored, isVisible, keyOf,
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

/**
 * The nearest element, `el` included, fixed or stuck to the screen: such a bar (a bottom navigation, an open menu)
 * covers the page on purpose, so only controls in the same one can overlap. Null for the page itself.
 */
function pinnedLayer(el: Element, cache: Map<Element, Element | null>): Element | null {
  // A loop, not recursion: pages can nest thousands deep.
  const path: Element[] = [];
  let layer: Element | null = null;
  for (let e: Element | null = el; e; e = composedParent(e)) {
    if (cache.has(e)) { layer = cache.get(e)!; break; }
    path.push(e);
    const position = getComputedStyle(e).position;
    if (position === 'fixed' || position === 'sticky') { layer = e; break; }
  }
  for (const e of path) cache.set(e, layer);
  return layer;
}

function overlaps(ignoreSel: string): RawIssue[] {
  const controls = composedElements()
    .filter(el => el.matches(INTERACTIVE) && !isIgnored(el, ignoreSel) && isVisible(el));
  // Per line fragment: a wrapped inline link's bounding box spans both lines and would "overlap" its neighbours.
  const fragments = controls.map(el => Array.from(el.getClientRects()).filter(r => r.width > 0 && r.height > 0));
  // Sweep the fragments from top to bottom: only fragments that share some height can touch, so a page with
  // thousands of links compares each with its neighbours on the same lines, not with every other link.
  const items: Array<{ c: number; r: DOMRect }> = [];
  fragments.forEach((rects, c) => { for (const r of rects) items.push({ c, r }); });
  items.sort((x, y) => x.r.top - y.r.top);
  const partners = new Map<number, Set<number>>(); // control index → later controls it touches
  let active: typeof items = [];
  for (const item of items) {
    active = active.filter(other => other.r.bottom > item.r.top);
    for (const other of active) {
      if (other.c === item.c) continue;
      const a = item.r, b = other.r;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 0 && h > 0 && w * h >= 4) {
        const i = Math.min(item.c, other.c), j = Math.max(item.c, other.c);
        (partners.get(i) ?? partners.set(i, new Set()).get(i)!).add(j);
      }
    }
    active.push(item);
  }
  const issues: RawIssue[] = [];
  const layers = new Map<Element, Element | null>();
  for (let i = 0; i < controls.length; i++) {
    const later = partners.get(i);
    if (!later) continue;
    const a = controls[i];
    for (const j of [...later].sort((x, y) => x - y)) {
      const b = controls[j];
      // Rects of different documents (a frame's and the page's) are not in the same coordinates.
      if (!sameDocument(a, b) || composedContains(a, b) || composedContains(b, a)) continue;
      if (pinnedLayer(a, layers) !== pinnedLayer(b, layers)) continue;
      issues.push(issue('overflow/overlap', a));
      break;
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
