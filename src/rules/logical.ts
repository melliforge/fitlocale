/** One declaration from the element's matched styles, in cascade order (`ruleIndex`; the style attribute is highest). */
export interface Declaration {
  name: string; value: string; important: boolean; ruleIndex: number; selector: string; styleSheetId?: string; line: number; column: number;
}

const SIMPLE: Record<string, string> = {
  left: 'inset-inline-start', right: 'inset-inline-end',
  'margin-left': 'margin-inline-start', 'margin-right': 'margin-inline-end',
  'padding-left': 'padding-inline-start', 'padding-right': 'padding-inline-end',
  'border-top-left-radius': 'border-start-start-radius', 'border-top-right-radius': 'border-start-end-radius',
  'border-bottom-left-radius': 'border-end-start-radius', 'border-bottom-right-radius': 'border-end-end-radius',
};
const SIDE_VALUE: Record<string, Record<string, string>> = {
  'text-align': { left: 'start', right: 'end' },
  float: { left: 'inline-start', right: 'inline-end' },
  clear: { left: 'inline-start', right: 'inline-end' },
};

/** The logical declaration to use instead of a physical one, or null when nothing in it is left/right-specific. */
export function logicalReplacement(name: string, value: string): string | null {
  const v = value.trim();
  if (SIMPLE[name]) return `${SIMPLE[name]}: ${v}`;
  const border = /^border-(left|right)(-width|-style|-color)?$/.exec(name);
  if (border) return `border-inline-${border[1] === 'left' ? 'start' : 'end'}${border[2] ?? ''}: ${v}`;
  if (SIDE_VALUE[name]) {
    const side = SIDE_VALUE[name][v.toLowerCase()];
    return side ? `${name}: ${side}` : null;
  }
  if (name === 'margin' || name === 'padding' || name === 'inset') {
    const parts = v.split(/\s+/);
    if (parts.length === 4 && parts[1] !== parts[3]) {
      const [top, right, bottom, left] = parts;
      return `${name}-block: ${top} ${bottom}; ${name}-inline: ${left} ${right}`;
    }
  }
  return null;
}

const POSITIONED = new Set(['absolute', 'fixed', 'relative', 'sticky']);

/** The left and right values a declaration sets, if any: longhands directly, shorthands (`inset`, `margin`) by position. */
function sides(decl: Declaration, longhand: 'left' | 'right' | 'margin-left' | 'margin-right'): string | undefined {
  if (decl.name === longhand) return decl.value.trim();
  const shorthand = longhand.startsWith('margin') ? 'margin' : 'inset';
  if (decl.name !== shorthand) return undefined;
  const [top, right = top, , left = right] = decl.value.trim().split(/\s+/);
  return longhand.endsWith('left') ? left : right;
}

const LONGHANDS = ['left', 'right', 'margin-left', 'margin-right', 'float', 'text-align'] as const;
type Longhand = (typeof LONGHANDS)[number];

/**
 * The winning declaration most likely to keep this element from mirroring, or null. Causes, most likely first:
 * an inset offset of a positioned box, a float, an auto margin on one side, text alignment. Padding, borders and
 * fixed margins move content, not the box, so they are never named; symmetric values are never a cause.
 */
export function pickResponsible(declarations: Declaration[], position: string): Declaration | null {
  const winners = new Map<Longhand, { decl: Declaration; value: string }>();
  for (const decl of [...declarations].sort((a, b) => a.ruleIndex - b.ruleIndex)) {
    for (const longhand of LONGHANDS) {
      const value = longhand === 'float' || longhand === 'text-align'
        ? (decl.name === longhand ? decl.value.trim() : undefined)
        : sides(decl, longhand);
      if (value === undefined) continue;
      const current = winners.get(longhand);
      // A later declaration wins, unless the current winner is !important and the later one is not.
      if (!current || decl.important || !current.decl.important) winners.set(longhand, { decl, value });
    }
  }
  const usable = (w?: { decl: Declaration }) => (w && logicalReplacement(w.decl.name, w.decl.value) ? w.decl : null);
  const value = (l: Longhand, fallback: string) => (winners.get(l)?.value ?? fallback).toLowerCase();

  if (POSITIONED.has(position)) {
    const left = value('left', 'auto'), right = value('right', 'auto');
    if (left !== right) {
      const cause = left !== 'auto' ? usable(winners.get('left')) : usable(winners.get('right'));
      if (cause) return cause;
    }
  }
  if (['left', 'right'].includes(value('float', 'none'))) {
    const cause = usable(winners.get('float'));
    if (cause) return cause;
  }
  const marginLeft = value('margin-left', '0'), marginRight = value('margin-right', '0');
  if ((marginLeft === 'auto') !== (marginRight === 'auto')) {
    const cause = usable(winners.get(marginLeft === 'auto' ? 'margin-left' : 'margin-right'));
    if (cause) return cause;
  }
  if (['left', 'right'].includes(value('text-align', 'start'))) return usable(winners.get('text-align'));
  return null;
}
