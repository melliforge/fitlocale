import type { InlineControl, TextBlock } from '../types';
import { textElements } from './boxes';
import { composedElements, docBox, frameElementOf, ignoreSelector, isIgnored, keyOf, langOf, selectorOf } from './dom';

const MAX_BLOCK_TEXT = 2000;
const CONTROL = 'a[href], button, [role=button]';

const isInline = (el: Element) => {
  const display = getComputedStyle(el).display;
  return display === 'inline' || display === 'contents';
};

/** The nearest ancestor-or-self that is not inline, stopping at `<body>` and at the top of a shadow root (a block boundary). */
function blockOf(el: Element): Element {
  let node: Element = el;
  while (node !== document.body && node.parentElement && isInline(node)) node = node.parentElement;
  return node;
}

/** The text a block shows (inline descendants included, nested blocks left to themselves), and its inline controls. */
function readBlock(block: Element, ignoreSel: string): { text: string; controls: InlineControl[] } {
  let text = '';
  const controls: InlineControl[] = [];
  const append = (s: string) => {
    for (const ch of s) {
      if (text.length > MAX_BLOCK_TEXT) return; // one extra character, so trimming then capping gives what the full text would
      if (/\s/.test(ch)) {
        if (text !== '' && !text.endsWith(' ')) text += ' ';
      } else {
        text += ch;
      }
    }
  };
  const visit = (parent: Element, inControl: boolean) => {
    for (const node of parent.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        append(node.nodeValue ?? '');
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as Element;
      if (el.tagName === 'BR') {
        append(' ');
        continue;
      }
      if (text.length > MAX_BLOCK_TEXT) break;
      // display: contents has no box, so checkVisibility() is false for it; its children are checked on their own.
      const contents = getComputedStyle(el).display === 'contents';
      if (isIgnored(el, ignoreSel) || (!contents && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))) continue;
      if (!isInline(el)) {
        append(' '); // a block of its own
        continue;
      }
      const isControl = !inControl && el.matches(CONTROL);
      const start = text.length;
      visit(el, inControl || isControl);
      if (isControl) {
        controls.push({ start, end: text.length, key: keyOf(el), selector: selectorOf(el), box: docBox(el), lang: langOf(el) });
      }
    }
  };
  visit(block, false);

  if (text.endsWith(' ')) text = text.slice(0, -1);
  if (text.length > MAX_BLOCK_TEXT) text = text.slice(0, MAX_BLOCK_TEXT);
  const trimmed = controls
    .map(c => {
      let { start, end } = c;
      end = Math.min(end, text.length);
      while (start < end && text[start] === ' ') start++;
      while (end > start && text[end - 1] === ' ') end--;
      return { ...c, start, end };
    })
    .filter(c => c.end > c.start);
  return { text, controls: trimmed };
}

/** Visible text grouped by block, with the inline links and buttons inside each block. */
export function collectTextBlocks(ignore: string[]): TextBlock[] {
  const ignoreSel = ignoreSelector(ignore);
  const blocks: Element[] = [];
  const seen = new Set<Element>();
  for (const el of textElements(ignoreSel)) {
    const block = blockOf(el);
    if (seen.has(block) || isIgnored(block, ignoreSel)) continue;
    seen.add(block);
    blocks.push(block);
  }
  // Text elements come in order, but an inline child can reach its block after a later sibling's block.
  // Order by the composed traversal: document order does not compare elements of different shadow roots or frames.
  const order = new Map(composedElements().map((el, i) => [el, i]));
  const rank = (el: Element) => order.get(el) ?? (el === document.body ? -1 : (order.get(frameElementOf(el.ownerDocument)!) ?? 0) + 0.5);
  blocks.sort((a, b) => rank(a) - rank(b));
  const result: TextBlock[] = [];
  for (const block of blocks) {
    const { text, controls } = readBlock(block, ignoreSel);
    if (text === '') continue;
    result.push({ key: keyOf(block), selector: selectorOf(block), box: docBox(block), text, lang: langOf(block), controls });
  }
  return result;
}
