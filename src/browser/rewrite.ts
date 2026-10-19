import { pseudoLong } from '../pseudo';
import { ignoreSelector, isIgnored, isVisible } from './dom';

let rewritten: Array<{ node: Text; original: string; written: string }> = [];
let savedDir: string | null | undefined; // undefined = nothing saved

export function rewriteText(expansion: number, ignore: string[]): number {
  const ignoreSel = ignoreSelector(ignore);
  restoreText();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const visible = new Map<Element, boolean>();
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const original = node.nodeValue ?? '';
    const parent = node.parentElement;
    // Translation never lengthens numbers, prices or symbols, so text without letters stays as it is.
    if (!parent || !/\p{L}/u.test(original) || isIgnored(parent, ignoreSel)) continue;
    if (!visible.has(parent)) visible.set(parent, isVisible(parent));
    if (!visible.get(parent)) continue;
    const written = pseudoLong(original, { expansion });
    node.nodeValue = written;
    rewritten.push({ node, original, written });
  }
  return rewritten.length;
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
