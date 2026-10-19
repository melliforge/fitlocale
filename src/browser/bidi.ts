import type { RawIssue } from '../types';
import { hasRtlLetters, mixedTokens, outOfOrder, visualText, type CharBox } from '../rules/bidi';
import { ignoreSelector, isIgnored, isVisible, keyOf, selectorOf } from './dom';

const isInline = (el: Element) => ['inline', 'contents'].includes(getComputedStyle(el).display);

function blockOf(el: Element): Element {
  let node = el;
  while (node !== document.body && node.parentElement && isInline(node)) node = node.parentElement;
  return node;
}

/** In right-to-left text with Arabic or Hebrew letters: mixed tokens whose characters are drawn out of logical order. */
export function findBidiOrder(ignore: string[]): RawIssue[] {
  const ignoreSel = ignoreSelector(ignore);
  const issues: RawIssue[] = [];
  const range = document.createRange();
  const rtlBlock = new Map<Element, boolean>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement;
    const text = node.nodeValue ?? '';
    const tokens = mixedTokens(text);
    if (!parent || tokens.length === 0 || isIgnored(parent, ignoreSel)) continue;
    if (getComputedStyle(parent).direction !== 'rtl' || !isVisible(parent)) continue;
    const block = blockOf(parent);
    if (!rtlBlock.has(block)) rtlBlock.set(block, hasRtlLetters(block.textContent ?? ''));
    if (!rtlBlock.get(block)) continue;
    for (const token of tokens) {
      const chars: CharBox[] = [];
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (let i = token.start; i < token.end; i++) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getClientRects()[0];
        if (!r || r.width === 0) continue;
        chars.push({ x: r.left, top: r.top });
        left = Math.min(left, r.left); top = Math.min(top, r.top); right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom);
      }
      if (chars.length !== token.end - token.start || !outOfOrder(chars)) continue;
      issues.push({
        rule: 'rtl/bidi-order', key: keyOf(parent), selector: selectorOf(parent), text: token.text, visual: visualText(token.text, chars),
        box: { x: left + window.scrollX, y: top + window.scrollY, width: right - left, height: bottom - top },
      });
    }
  }
  range.detach();
  return issues;
}
