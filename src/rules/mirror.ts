import type { Box, RawIssue } from '../types';

/** One element's box in one render. `key` is a DOM path, so an ancestor's key is a `>`-prefix of its descendants'. */
export interface BoxRecord { key: string; selector: string; box: Box; text: string; ignored: boolean; direction: 'ltr' | 'rtl' }

export interface MirrorOptions { viewportWidth: number; tolerancePx?: number }

const centerX = (b: Box) => b.x + b.width / 2;

/** Elements that kept their horizontal position when the page switched to right-to-left. */
export function findNotMirrored(ltr: BoxRecord[], rtl: BoxRecord[], opts: MirrorOptions): RawIssue[] {
  const W = opts.viewportWidth;
  const tol = opts.tolerancePx ?? Math.max(8, 0.02 * W);
  const rtlByKey = new Map(rtl.map(r => [r.key, r]));

  const flagged: BoxRecord[] = [];
  for (const before of ltr) {
    const after = rtlByKey.get(before.key);
    if (!after || before.ignored || after.ignored) continue;
    // Only elements the switch actually flipped can be judged (skips RTL app roots and dir="ltr" islands).
    if (before.direction !== 'ltr' || after.direction !== 'rtl') continue;
    if (before.box.width >= 0.9 * W) continue;
    if (before.box.x + before.box.width <= 0 || before.box.x >= W) continue; // off-screen, e.g. skip links
    if (Math.abs(centerX(before.box) - W / 2) <= tol) continue;
    if (Math.abs(centerX(after.box) - centerX(before.box)) <= tol) flagged.push(after);
  }

  return flagged
    .filter(r => !flagged.some(other => r.key.startsWith(other.key + '>')))
    .map(r => ({ rule: 'rtl/not-mirrored', key: r.key, selector: r.selector, box: r.box, text: r.text }));
}
