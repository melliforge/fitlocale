export type Severity = 'error' | 'warning' | 'info';

export type RuleId =
  | 'overflow/clipped'
  | 'overflow/ellipsis'
  | 'overflow/escapes-box'
  | 'overflow/overlap'
  | 'leak/raw-key'
  | 'leak/placeholder'
  | 'leak/bad-value'
  | 'locale/persistence'
  | 'rtl/not-mirrored'
  | 'rtl/skipped-already-rtl'
  | 'i18n/hardcoded'
  | 'i18n/concatenated'
  | 'i18n/untranslated';

export type Mode = 'source' | 'pseudo-long' | 'pseudo-rtl';

/** Document coordinates in CSS pixels (matches a full-page screenshot). */
export interface Box { x: number; y: number; width: number; height: number }

export interface Viewport { width: number; height: number }

/** An issue as measured in the page, before Node-side enrichment. `text` is at most 120 chars. */
export interface RawIssue { rule: RuleId; key: string; selector: string; box: Box; text: string }

/** An inline link or button inside a text block: `text.slice(start, end)` is its text; `lang` is its closest [lang] value. */
export interface InlineControl { start: number; end: number; key: string; selector: string; box: Box; lang: string }

/** A visible block of text (nearest non-inline ancestor of text), whitespace-collapsed and trimmed. `lang` is the closest [lang] value, '' if none. */
export interface TextBlock { key: string; selector: string; box: Box; text: string; lang: string; controls: InlineControl[] }

export interface Issue extends RawIssue {
  severity: Severity;
  mode: Mode;
  /** The locale the page was checked in: the one passed to `useLocale()`, else `sourceLocale`. */
  locale: string;
  viewport: Viewport;
  url: string;
  message: string;
  fix?: string;
}

export interface Screenshot { mode: Mode; viewport: Viewport; path: string; size: { width: number; height: number } }

export interface CheckResult {
  testTitle: string;
  /** Playwright project name, when the run has projects (set by the reporter). */
  project?: string;
  testFile: string;
  checkIndex: number;
  url: string;
  issues: Issue[];
  screenshots: Screenshot[];
}

export interface RunResults { version: 1; createdAt: string; checks: CheckResult[]; summary: Record<Severity, number> }

export const SEVERITY: Record<RuleId, Severity> = {
  'overflow/clipped': 'error',
  'overflow/ellipsis': 'warning',
  'overflow/escapes-box': 'error',
  'overflow/overlap': 'error',
  'leak/raw-key': 'error',
  'leak/placeholder': 'error',
  'leak/bad-value': 'error',
  'locale/persistence': 'error',
  'rtl/not-mirrored': 'warning',
  'rtl/skipped-already-rtl': 'info',
  'i18n/hardcoded': 'warning',
  'i18n/concatenated': 'warning',
  'i18n/untranslated': 'warning',
};

export const MESSAGES: Record<RuleId, string> = {
  'overflow/clipped': 'Text is cut off: it no longer fits its box and the overflow is hidden.',
  'overflow/ellipsis': 'Text is truncated with an ellipsis or line clamp that does not happen in the source language.',
  'overflow/escapes-box': 'Text spills outside its box.',
  'overflow/overlap': 'This control overlaps a neighbouring control.',
  'leak/raw-key': 'A translation key is shown instead of translated text.',
  'leak/placeholder': 'A placeholder was shown without being filled in.',
  'leak/bad-value': 'A broken value (undefined, NaN, null or [object Object]) is shown to users.',
  'locale/persistence': 'The page language changed back: expected "{expected}", found "{actual}".',
  'rtl/not-mirrored': 'This element stayed in place when the page switched to right-to-left; it should usually move to the opposite side.',
  'rtl/skipped-already-rtl': 'The page is already right-to-left, so the RTL mirroring check was skipped.',
  'i18n/hardcoded': 'This text has no pseudo-locale markers, so it did not come from your message files. It is hardcoded, or it is data: mark data areas with data-fitlocale-ignore.',
  'i18n/concatenated': 'This sentence is built from several separately translated pieces. Word order differs between languages, so translate it as one message with placeholders.',
  'i18n/untranslated': 'This text is identical to a source-language message, so it was probably left untranslated.',
};

export const LOCALE_NOT_REFLECTED_MESSAGE =
  'The page\'s lang attribute is "{actual}", not "{expected}", even right after switching locale. Update <html lang> or set the localeProbe option.';

const GROW_FIX = 'Let the box grow with its text (min-width instead of width) or allow wrapping.';

export const FIXES: Partial<Record<RuleId, string>> = {
  'overflow/clipped': GROW_FIX,
  'overflow/escapes-box': GROW_FIX,
  'rtl/not-mirrored': 'Use logical CSS properties (inset-inline-start, margin-inline-start, padding-inline-end) instead of left/right.',
  'i18n/hardcoded': 'Move the text into your message files and render it with your i18n library.',
  'i18n/concatenated': 'Use one message with placeholders, for example "You have {count} messages", or your library\'s rich-text component for links inside a sentence.',
  'i18n/untranslated': 'Add the translation to this locale\'s message file.',
};
