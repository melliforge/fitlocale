import type { FitlocaleBrowserApi } from './api';
import { assignKeys } from './dom';
import { documentDir, restoreText, rewriteText, setDir } from './rewrite';
import { scanLeaks, snapshotBoxes } from './boxes';
import { findOverflow } from './overflow';

const api: FitlocaleBrowserApi = {
  version: '0.1.0',
  assignKeys,
  rewriteText,
  restoreText,
  setDir,
  documentDir,
  lang: () => document.documentElement.lang,
  scanLeaks,
  snapshotBoxes,
  findOverflow,
  documentSize: () => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }),
};

(window as unknown as { __fitlocale: FitlocaleBrowserApi }).__fitlocale = api;
