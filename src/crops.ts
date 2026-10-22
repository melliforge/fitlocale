import { readFileSync, writeFileSync } from 'node:fs';
import { cropImage, decodePng, encodePng, type Image } from './png';
import type { CheckResult, Issue, Screenshot, Severity } from './types';

/** Crops per check, so a page with hundreds of issues does not write hundreds of images. */
export const CROPS_PER_CHECK = 20;
/** CSS pixels of context around an issue's box in its crop. */
export const CROP_PADDING = 24;

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** Issues about the whole page (wrong locale, missing dir) have the document as their box: a crop would be the screenshot again. */
const isPageLevel = (issue: Issue) => issue.key === 'html';

/**
 * Cut a small image around up to 20 issues out of their full-page screenshots (already masked), setting `issue.crop`.
 * Runs after the baseline: new failing issues first, then others not accepted, then accepted ones; errors before warnings.
 */
export function cropIssues(result: CheckResult, outputPath: (name: string) => string): void {
  const shotFor = (issue: Issue) => result.screenshots.find(s =>
    s.mode === issue.mode && s.viewport.width === issue.viewport.width && s.viewport.height === issue.viewport.height);
  const rank = (issue: Issue) => (issue.fails ? 0 : issue.baselined ? 2 : 1) * 10 + SEVERITY_ORDER[issue.severity];
  const candidates = result.issues
    .filter(issue => !isPageLevel(issue) && shotFor(issue))
    .map((issue, order) => ({ issue, order }))
    .sort((a, b) => rank(a.issue) - rank(b.issue) || a.order - b.order);

  const images = new Map<string, Image | null>();
  const imageOf = (shot: Screenshot) => {
    if (!images.has(shot.path)) {
      let image: Image | null = null;
      try {
        image = decodePng(readFileSync(shot.path));
      } catch {
        // Gone or unreadable: its issues go without a crop.
      }
      images.set(shot.path, image);
    }
    return images.get(shot.path)!;
  };

  let made = 0;
  for (const { issue } of candidates) {
    if (made >= CROPS_PER_CHECK) break;
    const shot = shotFor(issue)!;
    const image = imageOf(shot);
    if (!image || !shot.size.width) continue;
    const scale = image.width / shot.size.width;
    const ox = shot.origin?.x ?? 0, oy = shot.origin?.y ?? 0;
    const px = (v: number) => Math.round(v * scale);
    const left = Math.max(0, px(issue.box.x + ox - CROP_PADDING));
    const top = Math.max(0, px(issue.box.y + oy - CROP_PADDING));
    const right = Math.min(image.width, px(issue.box.x + ox + issue.box.width + CROP_PADDING));
    const bottom = Math.min(image.height, px(issue.box.y + oy + issue.box.height + CROP_PADDING));
    if (right <= left || bottom <= top) continue; // the box is off the image
    const path = outputPath(`fitlocale-${result.checkIndex}-crop-${made}.png`);
    writeFileSync(path, encodePng(cropImage(image, left, top, right - left, bottom - top)));
    issue.crop = path;
    made++;
  }
}
