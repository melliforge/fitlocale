// Pure and dependency-free: this module is also bundled into the in-page script.

export interface LeakMatch { rule: 'leak/raw-key' | 'leak/placeholder' | 'leak/bad-value'; match: string }

const KEY_TOKEN = /^[A-Za-z_][\w-]*(\.[\w-]+)+$/;
// Last segments that mean "hostname" or "file name", not a translation key.
const NOT_KEY_SUFFIXES = new Set([
  // domains
  'com', 'org', 'net', 'io', 'dev', 'app', 'ai', 'so', 'me', 'gg', 'tv', 'co', 'us', 'eu', 'uk', 'ca', 'fr', 'de',
  'es', 'it', 'nl', 'be', 'ch', 'at', 'au', 'jp', 'cn', 'in', 'br', 'tn', 'ma', 'dz', 'ae', 'sa', 'xyz', 'cloud',
  'info', 'biz', 'site', 'online', 'tech', 'store', 'shop', 'page', 'sh', 'ly', 'to', 'cc', 'gov', 'edu', 'local',
  // files
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'json', 'yml', 'yaml', 'xml', 'toml', 'ini', 'env', 'md', 'mdx', 'txt',
  'csv', 'log', 'lock', 'html', 'htm', 'css', 'scss', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico',
  'mp3', 'mp4', 'mov', 'webm', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'gz', 'tgz', 'tar',
  'exe', 'dmg', 'apk', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'php', 'sql', 'sh', 'bak',
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
  const last = segments[segments.length - 1].toLowerCase();
  return segments.length >= 3
    && !token.startsWith('www.')
    && !segments.some(s => /^\d+$/.test(s))
    // Any two-letter ending is a country's domain (m.webtoo.ls).
    && !/^[a-z]{2}$/.test(last)
    && !NOT_KEY_SUFFIXES.has(last);
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
