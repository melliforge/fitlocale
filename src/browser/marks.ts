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
    // Under a CSS transform the rects are scaled but layout sizes (clientHeight) and the canvas are not:
    // measure in the element's own scale. A clip from an ancestor under a transform is not judged.
    // offsetHeight is rounded, so a difference under a pixel is a fractional height, not a transform.
    const scaled = el instanceof HTMLElement && el.offsetHeight > 0 && Math.abs(box.height - el.offsetHeight) > 1;
    const scale = scaled ? box.height / (el as HTMLElement).offsetHeight : 1;
    if (scaled && !ownClip) continue;
    const clipBox: Rect | null = ownClip
      ? (scaled
        ? { left: box.left, right: box.right, top: box.top + el.clientTop * scale, bottom: box.top + (el.clientTop + el.clientHeight) * scale }
        : paddingRect(el))
      : clipRects(el).y;
    if (!clipBox || clipBox.bottom - clipBox.top <= 2) continue;
    const rects = singleLineRects(el);
    if (!rects) continue; // wrapped text: R3, single-line text only
    ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const m = ctx.measureText(text);
    // A text rect is the font's ascent-to-descent box: the baseline sits fontBoundingBoxAscent below its top.
    const baseline = rects[0].top + m.fontBoundingBoxAscent * scale;
    const inkTop = baseline - m.actualBoundingBoxAscent * scale;
    const inkBottom = baseline + m.actualBoundingBoxDescent * scale;
    if (inkTop < clipBox.top - EPS || inkBottom > clipBox.bottom + EPS) {
      issues.push({ rule: 'rtl/clipped-marks', key: keyOf(el), selector: selectorOf(el), box: docBox(el), text: clip(text) });
    }
  }
  return issues;
}
