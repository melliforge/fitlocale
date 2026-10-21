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
  | 'i18n/untranslated'
  | 'i18n/pseudo-not-loaded'
  | 'i18n/locale-messages-not-matched'
  | 'rtl/icon-not-mirrored'
  | 'rtl/icon-mirrored'
  | 'rtl/bidi-order'
  | 'rtl/missing-dir'
  | 'rtl/canvas'
  | 'rtl/font-fallback'
  | 'rtl/clipped-marks';

export type Mode = 'source' | 'pseudo-long' | 'pseudo-rtl';

/** Document coordinates in CSS pixels (matches a full-page screenshot). */
export interface Box { x: number; y: number; width: number; height: number }

export interface Viewport { width: number; height: number }

/** An issue as measured in the page, before Node-side enrichment. `text` is at most 120 chars. */
export interface RawIssue {
  rule: RuleId; key: string; selector: string; box: Box; text: string;
  /** For `rtl/bidi-order`: the text in the order it is drawn. */
  visual?: string;
  /** For `rtl/font-fallback`: the fallback font drawing the text, and the declared font-family. */
  used?: string;
  declared?: string;
  /** The element's accessible name (aria-label, aria-labelledby, alt, title or placeholder), whitespace-collapsed, at most 120 characters; absent when it has none. */
  name?: string;
}

/** Where the CSS behind an issue is: the stylesheet line (1-based), the declaration, its logical replacement, and the source-mapped origin. */
export interface CssSource {
  url: string; line: number; column: number; selector: string; property: string; value: string; replacement: string;
  original?: { url: string; line: number; column: number };
}

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
  /** Stable fingerprint of this issue (test, check, rule, mode, locale, viewport, element); used by the baseline file. */
  id?: string;
  /** True when the baseline file accepts this issue, so it does not fail the test. */
  baselined?: boolean;
  /** True when this issue fails the test: it is new (or the baseline is off) and reaches `failOn`. */
  fails?: boolean;
  /** For `rtl/not-mirrored`: the CSS declaration responsible (Chromium). */
  source?: CssSource;
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
  /** The baseline file used for this check (path relative to the working directory); absent with `baseline: false`. */
  baseline?: { status: 'missing' | 'applied'; path: string };
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
  'i18n/pseudo-not-loaded': 'error',
  'i18n/locale-messages-not-matched': 'warning',
  'rtl/icon-not-mirrored': 'warning',
  'rtl/icon-mirrored': 'warning',
  'rtl/bidi-order': 'warning',
  'rtl/missing-dir': 'error',
  'rtl/canvas': 'info',
  'rtl/font-fallback': 'warning',
  'rtl/clipped-marks': 'warning',
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
  'i18n/pseudo-not-loaded': 'The page is in pseudo locale "{locale}", but none of its text has pseudo-locale markers, so the pseudo-locale messages were not loaded.',
  'i18n/locale-messages-not-matched': 'None of the visible text matches the "{locale}" messages in localeMessages, so overflow was not checked in this locale.',
  'rtl/icon-not-mirrored': 'This directional icon (arrow, chevron, back or next) points the same way in right-to-left; it should usually flip.',
  'rtl/icon-mirrored': 'This icon flipped in right-to-left, but media controls, clocks, check marks and logos keep their direction.',
  'rtl/bidi-order': 'Mixed-direction text is shown in the wrong order: "{text}" appears as "{visual}".',
  'rtl/missing-dir': 'The page is in "{locale}", a right-to-left language, but it is laid out left-to-right.',
  'rtl/canvas': 'Canvas drawings ignore the page direction: check this chart or drawing by hand in right-to-left.',
  'rtl/font-fallback': 'This Arabic or Hebrew text is drawn in "{used}", a fallback font: none of your fonts ({declared}) has these letters.',
  'rtl/clipped-marks': 'Accent marks or descenders of this right-to-left text are cut off: its box or line height is too tight.',
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
  'i18n/pseudo-not-loaded': 'Generate the messages with `fitlocale pseudo` and register the locale in your i18n setup like any other language.',
  'i18n/locale-messages-not-matched': 'Point localeMessages at the message files this page renders, with {locale} where the locale code goes.',
  'rtl/icon-not-mirrored': 'Flip it in right-to-left, for example [dir="rtl"] .icon { transform: scaleX(-1); }, or mark it data-fitlocale-icon="invariant" if it must not flip.',
  'rtl/icon-mirrored': 'Exclude it from your right-to-left flip rule.',
  'rtl/bidi-order': 'Isolate the value: wrap it in <bdi>, or set dir="auto" (or dir="ltr") on its element.',
  'rtl/missing-dir': 'Set dir="rtl" on <html> for right-to-left locales.',
  'rtl/font-fallback': 'Add a font with these letters to font-family, before the generic family, for example font-family: Inter, "Noto Sans Arabic", sans-serif.',
  'rtl/clipped-marks': 'Give right-to-left text more room: a line-height around 1.6 to 1.8, and no fixed height with overflow: hidden.',
};
