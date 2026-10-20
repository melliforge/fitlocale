import type { RawIssue } from '../types';
import { hasRtlLetters } from '../rules/bidi';
import { textElements } from './boxes';
import {
  clip, clipRects, directText, directTextNodes, docBox, ignoreSelector, isHTML, keyOf, paddingRect, rangeFor, selectorOf, type Rect,
} from './dom';

const EPS = 1;
/** Widest canvas drawn on to read ink: Chromium draws nothing on canvases 65536px wide or more. */
const MAX_INK_WIDTH = 8192;
const CLIPPING = new Set(['hidden', 'clip']);

let ctx: OffscreenCanvasRenderingContext2D | null = null;

/**
 * How far the drawn ink of `text` reaches above and below its baseline, read from the pixels of a drawing.
 * Canvas metrics are not used for this: WebKit misreports the size of combining marks.
 */
function inkExtent(font: string, size: number, text: string, cache: Map<string, InkExtent | null>): InkExtent | null {
  const id = `${font}\n${text}`;
  if (cache.has(id)) return cache.get(id)!;
  ctx!.font = font;
  // Only the vertical extent matters: a line wider than the canvas limit is drawn squeezed sideways.
  const natural = ctx!.measureText(text).width + 2 * size;
  const squeeze = Math.min(1, MAX_INK_WIDTH / natural);
  const width = Math.ceil(natural * squeeze), height = Math.ceil(4 * size), baseline = 2 * size;
  const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
  const g = canvas.getContext('2d', { willReadFrequently: true });
  let ink: InkExtent | null = null;
  if (g) {
    g.font = font;
    // A canvas inherits the page direction in Chromium: right-to-left text would be drawn left of x, off the canvas.
    g.direction = 'ltr';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.setTransform(squeeze, 0, 0, 1, 0, 0);
    g.fillText(text, size, baseline);
    const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
    const inked = (y: number) => {
      for (let x = 0, i = y * canvas.width * 4 + 3; x < canvas.width; x++, i += 4) if (data[i] > 0) return true;
      return false;
    };
    let top = 0, bottom = canvas.height - 1;
    while (top < canvas.height && !inked(top)) top++;
    while (bottom > top && !inked(bottom)) bottom--;
    if (top < canvas.height) ink = { ascent: baseline - top, descent: bottom + 1 - baseline };
  }
  cache.set(id, ink);
  return ink;
}

interface InkExtent { ascent: number; descent: number }

/** The client rects of an element's own text, or null when it spans more than one line. */
function singleLineRects(el: Element): DOMRect[] | null {
  const nodes = directTextNodes(el);
  if (nodes.length === 0) return null;
  const range = rangeFor(nodes[0]);
  const rects: DOMRect[] = [];
  for (const node of nodes) {
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) rects.push(r);
  }
  range.collapse(true);
  if (rects.length === 0 || rects.some(r => Math.abs(r.top - rects[0].top) > EPS)) return null;
  return rects;
}

/** Right-to-left text whose accent marks or descenders (measured ink) reach past the box that clips it. */
export function findClippedMarks(ignore: string[]): RawIssue[] {
  const issues: RawIssue[] = [];
  ctx ??= new OffscreenCanvas(1, 1).getContext('2d');
  if (!ctx) return issues;
  const inks = new Map<string, InkExtent | null>();
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
    const scaled = isHTML(el) && el.offsetHeight > 0 && Math.abs(box.height - el.offsetHeight) > 1;
    const scale = scaled ? box.height / el.offsetHeight : 1;
    if (scaled && !ownClip) continue;
    const clipBox: Rect | null = ownClip
      ? (scaled
        ? { left: box.left, right: box.right, top: box.top + el.clientTop * scale, bottom: box.top + (el.clientTop + el.clientHeight) * scale }
        : paddingRect(el))
      : clipRects(el).y;
    if (!clipBox || clipBox.bottom - clipBox.top <= 2) continue;
    const rects = singleLineRects(el);
    if (!rects) continue; // wrapped text: R3, single-line text only
    const font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const ink = inkExtent(font, parseFloat(s.fontSize) || 16, text, inks);
    if (!ink) continue;
    ctx.font = font;
    // A text rect is the font's ascent-to-descent box: the baseline sits fontBoundingBoxAscent below its top.
    const baseline = rects[0].top + ctx.measureText(text).fontBoundingBoxAscent * scale;
    const inkTop = baseline - ink.ascent * scale;
    const inkBottom = baseline + ink.descent * scale;
    // EPS is in the element's own pixels, like the rest of the measurement.
    if (inkTop < clipBox.top - EPS * scale || inkBottom > clipBox.bottom + EPS * scale) {
      issues.push({ rule: 'rtl/clipped-marks', key: keyOf(el), selector: selectorOf(el), box: docBox(el), text: clip(text) });
    }
  }
  return issues;
}
