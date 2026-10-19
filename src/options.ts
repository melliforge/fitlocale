import type { Page } from '@playwright/test';
import type { Viewport } from './types';
import { DEFAULT_MIRROR_IGNORE } from './browser/dom';

export type SetLocale = (page: Page, locale: string) => Promise<void>;

export interface FitlocaleOptions {
  /** Pseudo modes to run while the page shows the source locale. */
  modes: Array<'pseudo-long' | 'pseudo-rtl'>;
  /** Extra length for pseudo-long text, as a fraction. */
  expansion: number;
  sourceLocale: string;
  /** How your app switches language; needed by `useLocale()`. */
  setLocale?: SetLocale;
  /** How to read the current locale; defaults to `<html lang>`. */
  localeProbe?: (page: Page) => Promise<string>;
  /** Path to the source-language message JSON, used to recognise raw keys. */
  sourceMessages?: string;
  ignore: string[];
  /** Elements that legitimately keep their position in right-to-left layouts. */
  mirrorIgnore: string[];
  viewports: Viewport[] | 'current';
  failOn: 'error' | 'warning' | 'never';
  screenshots: boolean;
}

export const DEFAULT_OPTIONS: FitlocaleOptions = {
  modes: ['pseudo-long', 'pseudo-rtl'],
  expansion: 0.4,
  sourceLocale: 'en',
  ignore: [],
  mirrorIgnore: DEFAULT_MIRROR_IGNORE,
  viewports: [{ width: 1280, height: 800 }, { width: 390, height: 844 }],
  failOn: 'error',
  screenshots: true,
};

export function resolveOptions(partial: Partial<FitlocaleOptions>): FitlocaleOptions {
  return { ...DEFAULT_OPTIONS, ...partial };
}
