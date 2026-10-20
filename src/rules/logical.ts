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
  if (name === 'margin' || name === 'padding') {
    const parts = v.split(/\s+/);
    if (parts.length === 4 && parts[1] !== parts[3]) {
      const [top, right, bottom, left] = parts;
      return `${name}-block: ${top} ${bottom}; ${name}-inline: ${left} ${right}`;
    }
  }
  return null;
}

const POSITIONED = new Set(['absolute', 'fixed', 'relative', 'sticky']);
/** Most likely cause first: inset offsets of positioned boxes, floats, margins, text alignment, padding, borders. */
const PRIORITY: Array<(name: string, position: string) => boolean> = [
  (n, p) => (n === 'left' || n === 'right') && POSITIONED.has(p),
  n => n === 'float',
  n => n === 'margin-left' || n === 'margin-right' || n === 'margin',
  n => n === 'text-align',
  n => n === 'padding-left' || n === 'padding-right' || n === 'padding',
  n => /^border-(left|right)/.test(n),
];

/** The winning physical declaration most likely to keep this element from mirroring, or null. */
export function pickResponsible(declarations: Declaration[], position: string): Declaration | null {
  const winners = new Map<string, Declaration>();
  for (const decl of [...declarations].sort((a, b) => a.ruleIndex - b.ruleIndex)) {
    const current = winners.get(decl.name);
    // A later declaration wins, unless the current winner is !important and the later one is not.
    if (!current || decl.important || !current.important) winners.set(decl.name, decl);
  }
  for (const applies of PRIORITY) {
    for (const decl of winners.values()) {
      if (applies(decl.name, position) && logicalReplacement(decl.name, decl.value)) return decl;
    }
  }
  return null;
}
