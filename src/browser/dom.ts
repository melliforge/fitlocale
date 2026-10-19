import type { Box } from '../types';

/** Always skipped, in addition to the caller's ignore list. */
export const DEFAULT_IGNORE = [
  'script', 'style', 'noscript', 'template', 'code', 'pre', 'kbd', 'samp', 'textarea',
  '[contenteditable=""]', '[contenteditable="true"]', '[data-fitlocale-ignore]',
];

/** Elements that legitimately keep their position in right-to-left layouts. */
export const DEFAULT_MIRROR_IGNORE = ['[class*="logo" i]', 'img[alt*="logo" i]', 'video', 'audio', 'code', 'pre'];

const MAX_TEXT = 120;

function validate(selectors: string[]): void {
  for (const sel of selectors) {
    try {
      document.createDocumentFragment().querySelector(sel);
    } catch {
      throw new Error(`fitlocale: invalid ignore selector "${sel}"`);
    }
  }
}

/** One selector list matching the defaults plus the caller's selectors. */
export function ignoreSelector(user: string[]): string {
  validate(user);
  return [...DEFAULT_IGNORE, ...user].join(',');
}

/** A selector list for an optional caller-supplied list ('' when empty). */
export function optionalSelector(user: string[]): string {
  validate(user);
  return user.join(',');
}

export function isIgnored(el: Element, selector: string): boolean {
  return selector !== '' && el.closest(selector) !== null;
}

export interface Rect { left: number; top: number; right: number; bottom: number }

const CLIPPING = new Set(['hidden', 'clip']);
const SCROLLING = new Set(['auto', 'scroll']);

/** Padding box of an element (the area its overflow is clipped to). */
export function paddingRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  const left = r.left + el.clientLeft;
  const top = r.top + el.clientTop;
  return { left, top, right: left + el.clientWidth, bottom: top + el.clientHeight };
}

interface ClipState { x: Rect | null; y: Rect | null }

const NO_CLIP: ClipState = { x: null, y: null };

/** Clip state per ancestor, kept for the duration of one `withLayoutCache` pass. */
let clipCache: Map<Element, ClipState> | null = null;

/**
 * Run `fn` with ancestor clip results cached. Only for passes that do not change layout:
 * deep DOMs otherwise re-read every ancestor's computed style for every element.
 */
export function withLayoutCache<T>(fn: () => T): T {
  if (clipCache) return fn();
  clipCache = new Map();
  try {
    return fn();
  } finally {
    clipCache = null;
  }
}

/** What `a` and its ancestors clip descendants of `a` to. */
function clipFrom(a: Element | null): ClipState {
  if (!a || a === document.documentElement) return NO_CLIP;
  const cached = clipCache?.get(a);
  if (cached) return cached;
  const s = getComputedStyle(a);
  const xClip = CLIPPING.has(s.overflowX), yClip = CLIPPING.has(s.overflowY);
  const xEnds = xClip || SCROLLING.has(s.overflowX), yEnds = yClip || SCROLLING.has(s.overflowY);
  const up = xEnds && yEnds ? NO_CLIP : clipFrom(a.parentElement);
  const rect = xClip || yClip ? paddingRect(a) : null;
  const state = { x: xEnds ? (xClip ? rect : null) : up.x, y: yEnds ? (yClip ? rect : null) : up.y };
  clipCache?.set(a, state);
  return state;
}

/**
 * Per axis, the padding box of the nearest ancestor that hides overflow on that axis.
 * A scroll container on an axis ends the search for that axis: its content can be scrolled into view.
 */
export function clipRects(el: Element): { x: Rect | null; y: Rect | null } {
  const { x, y } = clipFrom(el.parentElement);
  return { x, y };
}

/** Rendered, non-transparent, non-empty, and not entirely cut away by an ancestor that hides overflow. */
export function isVisible(el: Element): boolean {
  if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const { x, y } = clipRects(el);
  if (x && Math.min(r.right, x.right) - Math.max(r.left, x.left) <= 0) return false;
  if (y && Math.min(r.bottom, y.bottom) - Math.max(r.top, y.top) <= 0) return false;
  return true;
}

export function domPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body && node !== document.documentElement) {
    const parent: Element | null = node.parentElement;
    const index = parent ? Array.prototype.indexOf.call(parent.children, node) + 1 : 1;
    parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`);
    node = parent;
  }
  parts.unshift(node === document.documentElement ? 'html' : 'body');
  return parts.join('>');
}

/** Keys live outside the DOM, so the page is left exactly as it was. */
let keys = new WeakMap<Element, string>();
let testIdAttribute = 'data-testid';

export function assignKeys(testIdAttr = 'data-testid'): void {
  testIdAttribute = testIdAttr;
  keys = new WeakMap([[document.body, 'body']]);
  // Same keys as domPath(), built from the parent's key instead of walking up from every element.
  const visit = (parent: Element, path: string) => {
    let index = 0;
    for (const child of parent.children) {
      const key = `${path}>${child.tagName.toLowerCase()}:nth-child(${++index})`;
      keys.set(child, key);
      visit(child, key);
    }
  };
  visit(document.body, 'body');
}

export function keyOf(el: Element): string {
  return keys.get(el) ?? domPath(el);
}

/** A CSS string literal (double-quoted) for `value`. */
const cssString = (value: string) => `"${value.replace(/["\\]/g, '\\$&').replace(/\n/g, '\\a ')}"`;

/** A readable selector: the test id (Playwright's `testIdAttribute`), a unique id, else the DOM path. */
export function selectorOf(el: Element): string {
  const testId = el.getAttribute(testIdAttribute);
  if (testId) return `[${CSS.escape(testIdAttribute)}=${cssString(testId)}]`;
  const id = el.id && `#${CSS.escape(el.id)}`;
  if (id && document.querySelectorAll(id).length === 1) return id;
  return keyOf(el);
}

export function directTextNodes(el: Element): Text[] {
  return Array.from(el.childNodes).filter((n): n is Text => n.nodeType === Node.TEXT_NODE && n.nodeValue!.trim() !== '');
}

export function directText(el: Element): string {
  return directTextNodes(el).map(n => n.nodeValue).join('').trim();
}

export function clip(text: string): string {
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT - 1) + '…' : text;
}

/** Bounding box in document coordinates. */
export function docBox(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
}
