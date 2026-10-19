import { pseudoLong, unpseudo } from '../pseudo';
import { ignoreSelector, isIgnored, isVisible, withLayoutCache } from './dom';

let rewritten: Array<{ node: Text; original: string; written: string }> = [];
let savedDir: string | null | undefined; // undefined = nothing saved

/** Rewrite visible, letter-bearing text nodes with `transform`, recording them for `restoreText()`. */
function rewriteVisibleText(transform: (text: string) => string, ignore: string[]): number {
  const ignoreSel = ignoreSelector(ignore);
  restoreText();
  // Measure everything first, then write: writing as we go would force a layout per text node.
  const targets = withLayoutCache(() => {
    const found: Text[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const visible = new Map<Element, boolean>();
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const parent = node.parentElement;
      // Translation never lengthens numbers, prices or symbols, so text without letters stays as it is.
      if (!parent || !/\p{L}/u.test(node.nodeValue ?? '') || isIgnored(parent, ignoreSel)) continue;
      if (!visible.has(parent)) visible.set(parent, isVisible(parent));
      if (visible.get(parent)) found.push(node);
    }
    return found;
  });
  for (const node of targets) {
    const original = node.nodeValue ?? '';
    const written = transform(original);
    if (written === original) continue;
    node.nodeValue = written;
    rewritten.push({ node, original, written });
  }
  return rewritten.length;
}

export function rewriteText(expansion: number, ignore: string[]): number {
  return rewriteVisibleText(text => pseudoLong(text, { expansion }), ignore);
}

/** Approximate the source-language text of a pseudo-locale page (markers, padding and accents removed). */
export function unpseudoText(ignore: string[]): number {
  return rewriteVisibleText(unpseudo, ignore);
}

/** Undo `rewriteText`, leaving alone any node the app removed or changed in the meantime. */
export function restoreText(): void {
  for (const { node, original, written } of rewritten) {
    if (node.isConnected && node.nodeValue === written) node.nodeValue = original;
  }
  rewritten = [];
}

export function setDir(dir: 'rtl' | null): void {
  const html = document.documentElement;
  if (dir === 'rtl') {
    if (savedDir === undefined) savedDir = html.getAttribute('dir');
    html.setAttribute('dir', 'rtl');
    return;
  }
  if (savedDir === undefined) return;
  if (savedDir === null) html.removeAttribute('dir');
  else html.setAttribute('dir', savedDir);
  savedDir = undefined;
}

/** Direction of the page content: `<body>` decides, since apps often set `dir` there rather than on `<html>`. */
export function documentDir(): 'ltr' | 'rtl' {
  return getComputedStyle(document.body ?? document.documentElement).direction === 'rtl' ? 'rtl' : 'ltr';
}
