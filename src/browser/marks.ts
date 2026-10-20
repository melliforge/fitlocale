import type { RawIssue } from '../types';
import { hasRtlLetters } from '../rules/bidi';
import { textElements } from './boxes';
import { clip, clipRects, directText, directTextNodes, docBox, ignoreSelector, keyOf, paddingRect, selectorOf, type Rect } from './dom';

const EPS = 1;
const CLIPPING = new Set(['hidden', 'clip']);

let ctx: OffscreenCanvasRenderingContext2D | null = null;

/** The client rects of an element's own text, or null when it spans more than one line. */
function singleLineRects(el: Element): DOMRect[] | null {
  const range = document.createRange();
  const rects: DOMRect[] = [];
  for (const node of directTextNodes(el)) {
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) rects.push(r);
  }
  range.detach();
  if (rects.length === 0 || rects.some(r => Math.abs(r.top - rects[0].top) > EPS)) return null;
  return rects;
}

/** Right-to-left text whose accent marks or descenders (measured ink) reach past the box that clips it. */
export function findClippedMarks(ignore: string[]): RawIssue[] {
  const issues: RawIssue[] = [];
  ctx ??= new OffscreenCanvas(1, 1).getContext('2d');
  if (!ctx) return issues;
  for (const el of textElements(ignoreSelector(ignore))) {
    const text = directText(el);
    if (!hasRtlLetters(text)) continue;
    const s = getComputedStyle(el);
    // Visually hidden text (sr-only: a 1px box, clip or clip-path) is meant to be cut off.
    const box = el.getBoundingClientRect();
    if (box.width <= 2 || box.height <= 2 || s.clip !== 'auto' || s.clipPath !== 'none') continue;
    // overflow does not apply to inline boxes: an inline span with overflow: hidden clips nothing.
    const ownClip = CLIPPING.has(s.overflowY) && s.display !== 'inline';
    const clipBox: Rect | null = ownClip ? paddingRect(el) : clipRects(el).y;
    if (!clipBox || clipBox.bottom - clipBox.top <= 2) continue;
    const rects = singleLineRects(el);
    if (!rects) continue; // wrapped text: R3, single-line text only
    ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const m = ctx.measureText(text);
    // A text rect is the font's ascent-to-descent box: the baseline sits fontBoundingBoxAscent below its top.
    const baseline = rects[0].top + m.fontBoundingBoxAscent;
    const inkTop = baseline - m.actualBoundingBoxAscent;
    const inkBottom = baseline + m.actualBoundingBoxDescent;
    if (inkTop < clipBox.top - EPS || inkBottom > clipBox.bottom + EPS) {
      issues.push({ rule: 'rtl/clipped-marks', key: keyOf(el), selector: selectorOf(el), box: docBox(el), text: clip(text) });
    }
  }
  return issues;
}
