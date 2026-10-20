// Pure and dependency-free: this module is also bundled into the in-page script.

export type IconOverride = 'mirror' | 'invariant' | 'ignore';
export type IconKind = IconOverride | null;

const words = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Lower-case words of icon names: `arrow_forward_ios` → arrow, forward, ios; `ArrowLeft` → arrow, left. */
export function iconTokens(...names: string[]): string[] {
  return words(names.join(' '));
}

/** One word list per class name or attribute value: `fa fa-arrow-left` → [fa], [fa, arrow, left]. */
export function iconTokenGroups(...names: string[]): string[][] {
  return names.flatMap(n => n.split(/\s+/)).map(words).filter(g => g.length > 0);
}

/** Media controls, clocks, check marks and logos keep their direction in right-to-left. */
const INVARIANT = new Set([
  'play', 'pause', 'stop', 'rewind', 'replay', 'skip', 'seek', 'volume', 'mute',
  'clock', 'schedule', 'alarm', 'timer', 'check', 'checkmark', 'done', 'tick', 'logo',
]);
const INVARIANT_PAIRS = new Set(['fast forward', 'fast rewind', 'step forward', 'forward step', 'step backward', 'backward step']);
/** Up/down icons never flip; any of these makes an icon unknown. */
const VERTICAL = new Set(['up', 'down', 'upward', 'downward', 'top', 'bottom', 'north', 'south', 'expand', 'collapse', 'sort', 'vert']);
// `forward` alone is often a media control (fa-forward): it counts only with a shape word (arrow_forward).
const HORIZONTAL = new Set(['back', 'next', 'previous', 'prev', 'undo', 'redo', 'reply', 'send', 'east', 'west', 'before', 'logout', 'login']);
const HORIZONTAL_PAIRS = new Set(['first page', 'last page']);
const SHAPES = new Set(['arrow', 'chevron', 'caret', 'angle', 'triangle']);
const SIDES = new Set(['left', 'right', 'start', 'end', 'forward', 'back', 'backward']);
const CONTROL_WORDS = new Set(['next', 'back', 'previous', 'forward', 'continue']);
/** Shapes that a button's name ("Next") can make directional; a triangle is more often a warning sign. */
const CONTROL_SHAPES = new Set(['arrow', 'chevron', 'caret', 'angle']);
const OPPOSITES: Array<[string, string]> = [['left', 'right'], ['start', 'end']];

const pairs = (tokens: string[]) => tokens.slice(1).map((t, i) => `${tokens[i]} ${t}`);
const hasAny = (tokens: string[], set: Set<string>) => tokens.some(t => set.has(t));

/**
 * Should this icon flip in right-to-left? Precedence: the data-fitlocale-icon attribute, the `icons` option,
 * invariant names, vertical names (unknown), directional names. `null` means unknown: never reported.
 */
export function classifyIcon(own: string[][], controlName: string[], manifest: Record<string, IconOverride>, attribute?: string | null): IconKind {
  if (attribute === 'mirror' || attribute === 'invariant' || attribute === 'ignore') return attribute;
  const all = own.flat();
  for (const t of all) if (Object.prototype.hasOwnProperty.call(manifest, t)) return manifest[t];
  if (own.some(g => hasAny(g, INVARIANT) || hasAny(pairs(g), INVARIANT_PAIRS))) return 'invariant';
  if (hasAny(all, VERTICAL) || hasAny(controlName, VERTICAL)) return null;
  if (own.some(g => hasAny(g, HORIZONTAL) || hasAny(pairs(g), HORIZONTAL_PAIRS))) return 'mirror';
  // A shape and a side count together only within one name (icon-chevron-right, not "chevron float-end"),
  // and a name with both sides (arrow-left-right) points both ways.
  const symmetric = (g: string[]) => OPPOSITES.some(([a, b]) => g.includes(a) && g.includes(b));
  if (own.some(g => hasAny(g, SHAPES) && hasAny(g, SIDES) && !symmetric(g))) return 'mirror';
  if (own.some(g => hasAny(g, CONTROL_SHAPES) && !hasAny(g, SIDES)) && hasAny(controlName, CONTROL_WORDS)) return 'mirror';
  return null;
}

const RTL_LANGUAGES = new Set(['ar', 'he', 'iw', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb', 'syr']);

/** Is this locale's language written right-to-left? `ar-XB` (pseudo) counts. */
export function isRtlLocale(locale: string): boolean {
  return RTL_LANGUAGES.has(locale.trim().toLowerCase().split(/[-_]/)[0]);
}
