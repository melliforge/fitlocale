// Pure: decides from DevTools' platform-font report whether right-to-left text fell back to an unintended font.

export interface PlatformFont { familyName: string; isCustomFont: boolean; glyphCount: number }

const GENERIC = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'math', 'emoji', 'fangsong',
  'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', '-apple-system', 'blinkmacsystemfont',
]);

export const isGeneric = (family: string) => GENERIC.has(family.trim().toLowerCase());

/** `"Noto Sans", Inter, sans-serif` → Noto Sans, Inter, sans-serif. */
export function parseFontFamily(value: string): string[] {
  return value.split(',').map(f => f.trim().replace(/^(["'])(.*)\1$/, '$2').trim()).filter(Boolean);
}

/**
 * Fonts drawing this element's right-to-left letters (`rtlUsed`, measured on those letters alone) that are neither
 * named in its font-family nor loaded with @font-face: the fallback fonts. Judged only when the stack names real
 * families and every one of them is available on this machine; otherwise nothing.
 */
export function fallbackFonts(declared: string[], rtlUsed: PlatformFont[], available: Set<string>): string[] {
  const explicit = declared.filter(f => !isGeneric(f)).map(f => f.toLowerCase());
  if (explicit.length === 0 || !explicit.every(f => available.has(f))) return [];
  const names = new Set(explicit);
  return rtlUsed
    .filter(u => u.glyphCount > 0 && !u.isCustomFont && !names.has(u.familyName.toLowerCase()) && !/emoji|symbol/i.test(u.familyName))
    .map(u => u.familyName);
}
