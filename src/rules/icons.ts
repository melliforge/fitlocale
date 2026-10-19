// Pure and dependency-free: this module is also bundled into the in-page script.

export type IconOverride = 'mirror' | 'invariant' | 'ignore';
export type IconKind = IconOverride | null;

/** Lower-case words of icon names: `arrow_forward_ios` → arrow, forward, ios; `ArrowLeft` → arrow, left. */
export function iconTokens(...names: string[]): string[] {
  return names
    .map(n => n.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())
    .join(' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
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

const pairs = (tokens: string[]) => tokens.slice(1).map((t, i) => `${tokens[i]} ${t}`);
const hasAny = (tokens: string[], set: Set<string>) => tokens.some(t => set.has(t));

/**
 * Should this icon flip in right-to-left? Precedence: the data-fitlocale-icon attribute, the `icons` option,
 * invariant names, vertical names (unknown), directional names. `null` means unknown: never reported.
 */
export function classifyIcon(own: string[], controlName: string[], manifest: Record<string, IconOverride>, attribute?: string | null): IconKind {
  if (attribute === 'mirror' || attribute === 'invariant' || attribute === 'ignore') return attribute;
  for (const t of own) if (Object.prototype.hasOwnProperty.call(manifest, t)) return manifest[t];
  if (hasAny(own, INVARIANT) || hasAny(pairs(own), INVARIANT_PAIRS)) return 'invariant';
  if (hasAny(own, VERTICAL) || hasAny(controlName, VERTICAL)) return null;
  if (hasAny(own, HORIZONTAL) || hasAny(pairs(own), HORIZONTAL_PAIRS)) return 'mirror';
  if (hasAny(own, SHAPES) && (hasAny(own, SIDES) || hasAny(controlName, CONTROL_WORDS))) return 'mirror';
  return null;
}

const RTL_LANGUAGES = new Set(['ar', 'he', 'iw', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb', 'syr']);

/** Is this locale's language written right-to-left? `ar-XB` (pseudo) counts. */
export function isRtlLocale(locale: string): boolean {
  return RTL_LANGUAGES.has(locale.trim().toLowerCase().split(/[-_]/)[0]);
}
