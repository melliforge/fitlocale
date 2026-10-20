import type { Box, RawIssue } from '../types';
import { parentKey } from './keys';

/**
 * One element's box in one render. `key` is a DOM path (see parentKey). Inside a frame, `frame` is where the frame's
 * viewport sits in the page (x, in document coordinates) and its width: the element is judged within its frame.
 */
export interface BoxRecord {
  key: string; selector: string; box: Box; text: string; ignored: boolean; direction: 'ltr' | 'rtl';
  frame?: { x: number; width: number };
}

export interface MirrorOptions { viewportWidth: number; tolerancePx?: number }

const centerX = (b: Box) => b.x + b.width / 2;

/** Elements that kept their horizontal position when the page switched to right-to-left. */
export function findNotMirrored(ltr: BoxRecord[], rtl: BoxRecord[], opts: MirrorOptions): RawIssue[] {
  const rtlByKey = new Map(rtl.map(r => [r.key, r]));
  // Horizontal position within the element's frame (the page itself for most elements).
  const local = (r: BoxRecord): Box => ({ ...r.box, x: r.box.x - (r.frame?.x ?? 0) });

  const flagged: BoxRecord[] = [];
  for (const before of ltr) {
    const after = rtlByKey.get(before.key);
    if (!after || before.ignored || after.ignored) continue;
    // Only elements the switch actually flipped can be judged (skips RTL app roots and dir="ltr" islands).
    if (before.direction !== 'ltr' || after.direction !== 'rtl') continue;
    const W = before.frame?.width ?? opts.viewportWidth;
    const tol = opts.tolerancePx ?? Math.max(8, 0.02 * W);
    const was = local(before), now = local(after);
    if (was.width >= 0.9 * W) continue;
    if (was.x + was.width <= 0 || was.x >= W) continue; // off-screen, e.g. skip links
    if (Math.abs(centerX(was) - W / 2) <= tol) continue;
    if (Math.abs(centerX(now) - centerX(was)) <= tol) flagged.push(after);
  }

  // Report the outermost element only: a flagged ancestor's key is a `>`-prefix of its descendants'.
  const flaggedKeys = new Set(flagged.map(r => r.key));
  const hasFlaggedAncestor = (key: string) => {
    for (let k = parentKey(key); k; k = parentKey(k)) if (flaggedKeys.has(k)) return true;
    return false;
  };
  return flagged
    .filter(r => !hasFlaggedAncestor(r.key))
    .map(r => ({ rule: 'rtl/not-mirrored', key: r.key, selector: r.selector, box: r.box, text: r.text }));
}
