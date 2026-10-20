import type { Box } from '../types';

/** Icon fonts draw a glyph from a ligature word ("close", "arrow_forward"): not text, but still icons. */
export const ICON_FONT_IGNORE = ['[class*="material-icons"]', '[class*="material-symbols"]'];

/** Always skipped, in addition to the caller's ignore list. */
export const DEFAULT_IGNORE = [
  'script', 'style', 'noscript', 'template', 'code', 'pre', 'kbd', 'samp', 'textarea',
  '[contenteditable=""]', '[contenteditable="true"]', '[data-fitlocale-ignore]',
  ...ICON_FONT_IGNORE,
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
export function ignoreSelector(user: string[], except: string[] = []): string {
  validate(user);
  return [...DEFAULT_IGNORE.filter(sel => !except.includes(sel)), ...user].join(',');
}

/** A selector list for an optional caller-supplied list ('' when empty). */
export function optionalSelector(user: string[]): string {
  validate(user);
  return user.join(',');
}

export function isIgnored(el: Element, selector: string): boolean {
  return selector !== '' && composedClosest(el, selector) !== null;
}

const isShadowRoot = (node: Node): node is ShadowRoot => node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in node;

/** The `<iframe>` showing `doc`, or null for the page itself. */
export const frameElementOf = (doc: Document): Element | null => doc.defaultView?.frameElement ?? null;

/** The document of a visible, same-origin iframe that has loaded, or null (closed to us, hidden, or not a frame). */
export function frameDocument(el: Element): Document | null {
  if (el.localName !== 'iframe') return null;
  let doc: Document | null;
  try {
    doc = (el as HTMLIFrameElement).contentDocument;
  } catch {
    return null;
  }
  // Hidden like any element: display, visibility, opacity, or cut away by an ancestor.
  if (!doc?.body || !isVisible(el)) return null;
  return doc;
}

/** Was an open shadow root or a readable frame met by the last assignKeys()? Selectors then need checking in Playwright. */
let composedSeen = false;
export const hasComposed = () => composedSeen;

/**
 * Every element under the page's <body>, in order: an element, then its open shadow root's tree, then (for a
 * same-origin iframe) its document's <body> tree, then its own children. Slotted children are visited once, as children.
 */
export function composedElements(): Element[] {
  const out: Element[] = [];
  composedWalk(el => out.push(el), () => {});
  return out;
}

/** The text nodes whose text passes `select`, in the order of composedElements(), including text directly in a shadow root. */
export function composedTextNodes(select: (text: string) => boolean): Text[] {
  const out: Text[] = [];
  composedWalk(() => {}, text => { if (select(text.nodeValue ?? '')) out.push(text); });
  return out;
}

function composedWalk(onElement: (el: Element) => void, onText: (text: Text) => void): void {
  // An explicit stack: deep pages would overflow a recursive walk.
  const stack: Node[] = [];
  for (let i = document.body.childNodes.length - 1; i >= 0; i--) stack.push(document.body.childNodes[i]);
  while (stack.length) {
    const node = stack.pop()!;
    if (node.nodeType === Node.TEXT_NODE) {
      onText(node as Text);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;
    onElement(el);
    // Pushed last-first, one by one (spreading 100k+ children as arguments overflows the call stack).
    const push = (nodes: NodeList) => { for (let i = nodes.length - 1; i >= 0; i--) stack.push(nodes[i]); };
    push(el.childNodes);
    const doc = frameDocument(el);
    if (doc) push(doc.body.childNodes);
    if (el.shadowRoot) push(el.shadowRoot.childNodes);
  }
}

/** The parent in the composed tree: the host above a shadow root, the <iframe> above a frame's <html>. */
export function composedParent(el: Element): Element | null {
  const p = el.parentNode;
  if (!p) return null;
  if (p.nodeType === Node.ELEMENT_NODE) return p as Element;
  if (isShadowRoot(p)) return p.host;
  if (p.nodeType === Node.DOCUMENT_NODE) return frameElementOf(p as Document);
  return null;
}

/** The parent element within the same document: crosses shadow roots, not frames. */
function parentInDocument(el: Element): Element | null {
  const p = el.parentNode;
  if (p && p.nodeType === Node.ELEMENT_NODE) return p as Element;
  return p && isShadowRoot(p) ? p.host : null;
}

/** `closest()` that continues past shadow roots to their hosts, and past frames to their <iframe>. */
export function composedClosest(el: Element, selector: string): Element | null {
  for (let node: Element | null = el; node;) {
    const hit = node.closest(selector);
    if (hit) return hit;
    const root = node.getRootNode();
    node = isShadowRoot(root) ? root.host : frameElementOf(root as Document);
  }
  return null;
}

/** The closest `lang`: shadow content takes its host's, a frame document has its own. */
export function langOf(el: Element): string {
  for (let node: Element | null = el; node;) {
    const hit = node.closest('[lang]');
    if (hit) return hit.getAttribute('lang') ?? '';
    const root = node.getRootNode();
    node = isShadowRoot(root) ? root.host : null;
  }
  return '';
}

/** `instanceof HTMLElement` that also holds for elements of a frame (another window). */
export const isHTML = (el: Element): el is HTMLElement => el.namespaceURI === 'http://www.w3.org/1999/xhtml';

export const sameDocument = (a: Element, b: Element) => a.ownerDocument === b.ownerDocument;

/** The element a text node belongs to: its parent, or the host when it sits straight in a shadow root. */
export function textParent(node: Text): Element | null {
  const p = node.parentNode;
  if (p && p.nodeType === Node.ELEMENT_NODE) return p as Element;
  return p && isShadowRoot(p) ? p.host : null;
}

/** `a.contains(b)` as drawn: into shadow roots and frames, and a slotted element inside its slot. */
export function composedContains(a: Element, b: Element): boolean {
  for (let n: Element | null = b; n; n = n.assignedSlot ?? composedParent(n)) if (n === a) return true;
  return false;
}

const ranges = new WeakMap<Document, Range>();

/**
 * One shared Range per document (a frame's text is measured with its own document's Range): the browser updates
 * every live Range on each text change, so a Range per text node makes rewriting and restoring text quadratic.
 */
export function rangeFor(node: Node): Range {
  const doc = node.ownerDocument ?? document;
  let range = ranges.get(doc);
  if (!range) ranges.set(doc, range = doc.createRange());
  return range;
}

/** Where a frame document's viewport sits in the page's viewport: the content boxes of its enclosing <iframe>s. */
export function frameOffset(doc: Document): { x: number; y: number } {
  let x = 0, y = 0;
  for (let frame = frameElementOf(doc); frame; frame = frameElementOf(frame.ownerDocument)) {
    const r = frame.getBoundingClientRect();
    const s = getComputedStyle(frame);
    x += r.left + frame.clientLeft + (parseFloat(s.paddingLeft) || 0);
    y += r.top + frame.clientTop + (parseFloat(s.paddingTop) || 0);
  }
  return { x, y };
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
  // A frame boundary ends the search: frame content scrolls.
  if (!a || a === a.ownerDocument.documentElement) return NO_CLIP;
  const cached = clipCache?.get(a);
  if (cached) return cached;
  const s = getComputedStyle(a);
  const xClip = CLIPPING.has(s.overflowX), yClip = CLIPPING.has(s.overflowY);
  const xEnds = xClip || SCROLLING.has(s.overflowX), yEnds = yClip || SCROLLING.has(s.overflowY);
  const up = xEnds && yEnds ? NO_CLIP : clipFrom(parentInDocument(a));
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
  const { x, y } = clipFrom(parentInDocument(el));
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

/** The path of `el` within its tree (a document's <body> or a shadow root). */
function localPath(el: Element): string {
  const parts: string[] = [];
  let node: Element = el;
  for (;;) {
    const parent = node.parentNode;
    const doc = node.ownerDocument;
    if (node === doc.body || node === doc.documentElement) {
      parts.unshift(node === doc.documentElement ? 'html' : 'body');
      break;
    }
    const siblings = parent ? (parent as ParentNode).children : null;
    parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${siblings ? Array.prototype.indexOf.call(siblings, node) + 1 : 1})`);
    if (!parent || parent.nodeType !== Node.ELEMENT_NODE) {
      if (parent && isShadowRoot(parent)) parts.unshift(':scope');
      break;
    }
    node = parent as Element;
  }
  return parts.join('>');
}

/** A Playwright selector chain to `el`: `host >> :scope>path` into a shadow root, `iframe >> internal:control=enter-frame >> body>path` into a frame. */
export function domPath(el: Element): string {
  const path = localPath(el);
  const root = el.getRootNode();
  if (isShadowRoot(root)) return `${keyOf(root.host)} >> ${path}`;
  const frame = frameElementOf(root as Document);
  return frame ? `${keyOf(frame)} >> internal:control=enter-frame >> ${path}` : path;
}

/** Keys live outside the DOM, so the page is left exactly as it was. */
let keys = new WeakMap<Element, string>();
let testIdAttribute = 'data-testid';
/** Per document (a frame's, with its shadow roots): how many elements carry each test id and each id, counted once per assignKeys(). */
let testIdCounts: Map<Document, Map<string, number>> | null = null;
let idCounts: Map<Document, Map<string, number>> | null = null;

const count = (counts: Map<Document, Map<string, number>>, doc: Document, value: string) => {
  const perDoc = counts.get(doc) ?? counts.set(doc, new Map()).get(doc)!;
  perDoc.set(value, (perDoc.get(value) ?? 0) + 1);
};

export function assignKeys(testIdAttr = 'data-testid'): void {
  testIdAttribute = testIdAttr;
  keys = new WeakMap([[document.body, 'body']]);
  testIdCounts = new Map();
  idCounts = new Map();
  composedSeen = false;
  // Ids and test ids are counted over each whole document (<head> included) plus the shadow roots it shows,
  // the scope a Playwright CSS selector searches.
  const countIn = (root: Document | ShadowRoot, doc: Document) => {
    for (const el of root.querySelectorAll(`[${CSS.escape(testIdAttr)}]`)) count(testIdCounts!, doc, el.getAttribute(testIdAttr)!);
    for (const el of root.querySelectorAll('[id]')) count(idCounts!, doc, el.id);
  };
  countIn(document, document);
  // Same keys as domPath(), built from the parent's key instead of walking up from every element.
  const visit = (parent: ParentNode, path: string) => {
    let index = 0;
    for (const child of parent.children) {
      const key = `${path}>${child.tagName.toLowerCase()}:nth-child(${++index})`;
      keys.set(child, key);
      if (child.shadowRoot) {
        composedSeen = true;
        countIn(child.shadowRoot, child.ownerDocument);
        visit(child.shadowRoot, `${key} >> :scope`);
      }
      const doc = frameDocument(child);
      if (doc) {
        composedSeen = true;
        countIn(doc, doc);
        keys.set(doc.body, `${key} >> internal:control=enter-frame >> body`);
        visit(doc.body, `${key} >> internal:control=enter-frame >> body`);
      }
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

/** A readable selector: the test id (Playwright's `testIdAttribute`), a unique id, else the DOM path. Inside a frame, prefixed with the frame's. */
export function selectorOf(el: Element): string {
  const doc = el.ownerDocument;
  const frame = frameElementOf(doc);
  const prefix = frame ? `${selectorOf(frame)} >> internal:control=enter-frame >> ` : '';
  const testId = el.getAttribute(testIdAttribute);
  if (testId) {
    const selector = `[${CSS.escape(testIdAttribute)}=${cssString(testId)}]`;
    // A test id shared by repeated components names none of them: use the DOM path, as for a non-unique id.
    const n = testIdCounts?.get(doc)?.get(testId) ?? doc.querySelectorAll(selector).length;
    if (n === 1) return prefix + selector;
  }
  const id = el.id && `#${CSS.escape(el.id)}`;
  if (id && (idCounts?.get(doc)?.get(el.id) ?? doc.querySelectorAll(id).length) === 1) return prefix + id;
  return keyOf(el);
}

/** The element's own text: its text children, and text placed straight into its open shadow root (a bare value in a template). */
export function directTextNodes(el: Element): Text[] {
  const own = (nodes: NodeList) => Array.from(nodes).filter((n): n is Text => n.nodeType === Node.TEXT_NODE && n.nodeValue!.trim() !== '');
  return el.shadowRoot ? [...own(el.childNodes), ...own(el.shadowRoot.childNodes)] : own(el.childNodes);
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
  const offset = frameOffset(el.ownerDocument);
  return { x: r.left + offset.x + window.scrollX, y: r.top + offset.y + window.scrollY, width: r.width, height: r.height };
}
