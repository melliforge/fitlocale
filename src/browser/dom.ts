import type { Box } from '../types';

/** Always skipped, in addition to the caller's ignore list. */
export const DEFAULT_IGNORE = [
  'script', 'style', 'noscript', 'template', 'code', 'pre', 'kbd', 'samp', 'textarea',
  '[contenteditable=""]', '[contenteditable="true"]', '[data-fitlocale-ignore]',
];

/** Elements that legitimately keep their position in right-to-left layouts. */
export const DEFAULT_MIRROR_IGNORE = ['[class*="logo" i]', 'img[alt*="logo" i]', 'video', 'audio', 'code', 'pre'];

const KEY_ATTR = 'data-fitlocale-key';
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

/** Rendered, non-transparent, non-empty, and not entirely cut away by an ancestor that hides overflow. */
export function isVisible(el: Element): boolean {
  if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
    const s = getComputedStyle(a);
    if (!/hidden|clip/.test(s.overflowX + s.overflowY)) continue;
    const ar = a.getBoundingClientRect();
    const left = ar.left + a.clientLeft, top = ar.top + a.clientTop;
    const w = Math.min(r.right, left + a.clientWidth) - Math.max(r.left, left);
    const h = Math.min(r.bottom, top + a.clientHeight) - Math.max(r.top, top);
    if (w <= 0 || h <= 0) return false;
  }
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

export function assignKeys(): void {
  document.body.setAttribute(KEY_ATTR, 'body');
  for (const el of document.body.querySelectorAll('*')) el.setAttribute(KEY_ATTR, domPath(el));
}

export function keyOf(el: Element): string {
  return el.getAttribute(KEY_ATTR) ?? domPath(el);
}

export function selectorOf(el: Element): string {
  const testId = el.getAttribute('data-testid');
  if (testId) return `[data-testid="${testId}"]`;
  if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${el.id}`;
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
