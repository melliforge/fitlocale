import type { FitlocaleBrowserApi } from './api';
import { assignKeys, withLayoutCache } from './dom';
import { documentDir, restoreText, rewriteText, setDir, unpseudoText } from './rewrite';
import { scanLeaks, snapshotBoxes } from './boxes';
import { findOverflow } from './overflow';
import { collectTextBlocks } from './blocks';
import { findNotMirrored } from '../rules/mirror';
import type { BoxRecord } from '../rules/mirror';

let remembered: BoxRecord[] | null = null;

const api: FitlocaleBrowserApi = {
  version: '0.1.0',
  assignKeys,
  rewriteText,
  unpseudoText,
  restoreText,
  setDir,
  documentDir,
  lang: () => document.documentElement.lang,
  // Read-only passes: ancestor clip results can be cached for the whole call.
  scanLeaks: (ignore, knownKeys) => withLayoutCache(() => scanLeaks(ignore, knownKeys)),
  snapshotBoxes: (ignore, mirrorIgnore) => withLayoutCache(() => snapshotBoxes(ignore, mirrorIgnore)),
  findOverflow: ignore => withLayoutCache(() => findOverflow(ignore)),
  collectTextBlocks: ignore => withLayoutCache(() => collectTextBlocks(ignore)),
  rememberBoxes: (ignore, mirrorIgnore) => {
    remembered = withLayoutCache(() => snapshotBoxes(ignore, mirrorIgnore));
  },
  findNotMirrored: (ignore, mirrorIgnore) => {
    const before = remembered ?? [];
    remembered = null;
    const after = withLayoutCache(() => snapshotBoxes(ignore, mirrorIgnore));
    return findNotMirrored(before, after, { viewportWidth: document.documentElement.clientWidth });
  },
  documentSize: () => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }),
};

(window as unknown as { __fitlocale: FitlocaleBrowserApi }).__fitlocale = api;
