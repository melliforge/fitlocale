// Pure and dependency-free: this module is also bundled into the in-page script.

export interface LeakMatch { rule: 'leak/raw-key' | 'leak/placeholder' | 'leak/bad-value'; match: string }

const KEY_TOKEN = /^[A-Za-z_][\w-]*(\.[\w-]+)+$/;
const NOT_KEY_SUFFIXES = new Set([
  'com', 'org', 'net', 'io', 'dev', 'app', 'ca', 'fr', 'de', 'uk', 'co', 'tn',
  'js', 'ts', 'json', 'pdf', 'png', 'jpg', 'jpeg', 'svg', 'html', 'css', 'txt', 'csv', 'zip',
]);

const PLACEHOLDERS = [
  /\{\{\s*[\w.]+\s*\}\}/g,
  /\$\{[\w.]+\}/g,
  /(?<![{$])\{[A-Za-z_][\w.]*\}(?!\})/g,
  /%(\d+\$)?[sd]/g,
];

const BAD_VALUES = [/\bundefined\b/g, /\bNaN\b/g, /\[object Object\]/g];

function isRawKey(token: string, knownKeys?: ReadonlySet<string>): boolean {
  if (!KEY_TOKEN.test(token)) return false;
  if (knownKeys?.has(token)) return true;
  const segments = token.split('.');
  return segments.length >= 3
    && !token.startsWith('www.')
    && !segments.some(s => /^\d+$/.test(s))
    && !NOT_KEY_SUFFIXES.has(segments[segments.length - 1].toLowerCase());
}

/** Find text that is clearly broken i18n output: raw keys, unfilled placeholders, broken values. */
export function findLeaksInText(text: string, knownKeys?: ReadonlySet<string>): LeakMatch[] {
  const trimmed = text.trim();
  const found: Array<LeakMatch & { index: number }> = [];

  if (isRawKey(trimmed, knownKeys)) found.push({ rule: 'leak/raw-key', match: trimmed, index: text.indexOf(trimmed) });

  for (const re of PLACEHOLDERS) {
    for (const m of text.matchAll(re)) found.push({ rule: 'leak/placeholder', match: m[0], index: m.index! });
  }
  for (const re of BAD_VALUES) {
    for (const m of text.matchAll(re)) found.push({ rule: 'leak/bad-value', match: m[0], index: m.index! });
  }
  if (trimmed === 'null') found.push({ rule: 'leak/bad-value', match: 'null', index: text.indexOf('null') });

  return found.sort((a, b) => a.index - b.index).map(({ rule, match }) => ({ rule, match }));
}
