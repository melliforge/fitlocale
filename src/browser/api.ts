import type { RawIssue } from '../types';
import type { BoxRecord } from '../rules/mirror';

/** The API the in-page bundle installs as `window.__fitlocale`. */
export interface FitlocaleBrowserApi {
  version: string;
  /**
   * Remember every element's current DOM path as its key, so keys survive layout changes the check makes.
   * `testIdAttribute` (default `data-testid`) is used for readable selectors.
   */
  assignKeys(testIdAttribute?: string): void;
  /** Rewrite visible text nodes into pseudo-long text. Returns the number of nodes rewritten. */
  rewriteText(expansion: number, ignore: string[]): number;
  restoreText(): void;
  /** `null` restores the original `dir` attribute (or removes it). */
  setDir(dir: 'rtl' | null): void;
  documentDir(): 'ltr' | 'rtl';
  lang(): string;
  scanLeaks(ignore: string[], knownKeys: string[]): RawIssue[];
  snapshotBoxes(ignore: string[], mirrorIgnore: string[]): BoxRecord[];
  findOverflow(ignore: string[]): RawIssue[];
  documentSize(): { width: number; height: number };
}
