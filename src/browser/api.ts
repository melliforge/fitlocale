import type { RawIssue } from '../types';
import type { BoxRecord } from '../rules/mirror';

/** The API the in-page bundle installs as `window.__fitlocale`. */
export interface FitlocaleBrowserApi {
  version: string;
  /** Set `data-fitlocale-key` (the element's DOM path) on every element under <body>. */
  assignKeys(): void;
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
