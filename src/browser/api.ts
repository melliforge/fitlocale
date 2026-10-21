import type { Box, RawIssue, TextBlock } from '../types';
import type { FontProbe } from './probes';
import type { BoxRecord } from '../rules/mirror';

/** The API the in-page bundle installs as `window.__fitlocale`. */
export interface FitlocaleBrowserApi {
  version: string;
  /**
   * Remember every element's current DOM path as its key, so keys survive layout changes the check makes.
   * `testIdAttribute` (default `data-testid`) is used for readable selectors.
   */
  assignKeys(testIdAttribute?: string): void;
  /** The key of an element, also one inside an open shadow root or a same-origin frame. */
  keyFor(el: Element): string;
  /** The accessible name (aria-label, aria-labelledby, alt, title or placeholder) of each key's element; null when it has none or is gone. */
  namesFor(keys: string[]): Array<string | null>;
  /** Did the last assignKeys() meet an open shadow root or a readable frame? */
  hasComposed(): boolean;
  /** Rewrite visible text nodes into pseudo-long text. Returns the number of nodes rewritten. */
  rewriteText(expansion: number, ignore: string[]): number;
  /** Rewrite visible text of a pseudo-locale page into an approximation of the source text. Undo with `restoreText()`. */
  unpseudoText(ignore: string[]): number;
  /** The distinct texts of the visible, letter-bearing text nodes: the ones `rewriteText` would rewrite. */
  visibleTexts(ignore: string[]): string[];
  /** Rewrite each visible text node whose text is a key of `replacements` into its value. Undo with `restoreText()`. */
  replaceText(replacements: Record<string, string>, ignore: string[]): number;
  restoreText(): void;
  /** `null` restores the original `dir` attribute (or removes it). */
  setDir(dir: 'rtl' | null): void;
  documentDir(): 'ltr' | 'rtl';
  /** The direction most visible text is laid out in (catches dir set on an app wrapper). */
  contentDir(ignore: string[]): 'ltr' | 'rtl';
  lang(): string;
  scanLeaks(ignore: string[], knownKeys: string[]): RawIssue[];
  snapshotBoxes(ignore: string[], mirrorIgnore: string[]): BoxRecord[];
  /** Keep a `snapshotBoxes` result in the page, to compare against after switching direction. */
  rememberBoxes(ignore: string[], mirrorIgnore: string[]): void;
  /**
   * Snapshot again and return elements that did not mirror since `rememberBoxes`.
   * Runs in the page so that large snapshots never cross the wire.
   */
  findNotMirrored(ignore: string[], mirrorIgnore: string[]): RawIssue[];
  findOverflow(ignore: string[]): RawIssue[];
  /** Add hidden text runs for DevTools' font report; returns their selectors. Always followed by removeFontProbes(). */
  addFontProbes(probes: FontProbe[]): string[];
  removeFontProbes(): void;
  /** Single-line right-to-left text whose marks or descenders are cut off by the box that clips it. */
  findClippedMarks(ignore: string[]): RawIssue[];
  /** Text elements for the DevTools font check (right-to-left ones and a few others), and the loaded @font-face families. */
  fontSamples(ignore: string[]): {
    samples: Array<{
      key: string; selector: string; box: Box; text: string; fontFamily: string; fontWeight: string; fontStyle: string; fontSize: string; lang: string; rtl: boolean;
    }>;
    loadedFamilies: string[];
  };
  /** Visible canvases of at least 40×40px: they ignore the page direction. */
  findCanvases(ignore: string[]): RawIssue[];
  /** In right-to-left text with Arabic or Hebrew letters: mixed tokens (C++, +1) drawn out of logical order. */
  findBidiOrder(ignore: string[]): RawIssue[];
  /** Keep every icon's name, flip sign and drawing, to compare after switching direction. */
  rememberIcons(ignore: string[], icons: Record<string, 'mirror' | 'invariant' | 'ignore'>): void;
  /** Snapshot icons again and return directional icons that did not flip, and invariant icons that did. */
  findIconIssues(ignore: string[], icons: Record<string, 'mirror' | 'invariant' | 'ignore'>): RawIssue[];
  /** Visible text grouped by block, with each block's inline links and buttons. */
  collectTextBlocks(ignore: string[]): TextBlock[];
  documentSize(): { width: number; height: number };
}
