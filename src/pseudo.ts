export const MARK_START = '⟦';
export const MARK_END = '⟧';

export interface PseudoOptions {
  /** Extra length as a fraction of the original text length. Default 0.4 (~40% longer). */
  expansion?: number;
}

export type Messages = { [key: string]: string | Messages };

const ACCENTS: Record<string, string> = {
  a: 'á', e: 'é', i: 'î', o: 'ö', u: 'ü', c: 'ç', n: 'ñ', s: 'š', y: 'ý',
  A: 'Å', E: 'É', I: 'Î', O: 'Ö', U: 'Ü', C: 'Ç', N: 'Ñ', S: 'Š', Y: 'Ý',
};

export const ICU_HEAD = /^\s*\w+\s*,\s*(plural|select|selectordinal)\s*,/;
const PRINTF = /^%(\d+\$)?[sdif@]/;
const HTML_TAG = /^<\/?[a-zA-Z][^>]*>/;
const HTML_ENTITY = /^&(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#[xX][0-9a-fA-F]+);/;
/** vue-i18n linked messages: `@:key`, `@.lower:key`, `@:(key)`. */
const VUE_LINKED = /^@(?:\.\w+)?:(?:\([\w\-:|./]+\)|[\w\-|./]+)/;

interface Transformed { out: string; textLength: number }

/** Index of the bracket closing the one at `start` (`{` or `(`), or -1. */
export function matchingBrace(s: string, start: number): number {
  const open = s[start], close = open === '(' ? ')' : '}';
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close && --depth === 0) return i;
  }
  return -1;
}

/** Recurse into the branches of an ICU plural/select body (everything after its head). */
function transformIcuBody(body: string): Transformed {
  let out = '';
  let textLength = 0;
  let i = 0;
  while (i < body.length) {
    if (body[i] === '{') {
      const end = matchingBrace(body, i);
      if (end === -1) { out += body.slice(i); break; }
      const inner = transform(body.slice(i + 1, end));
      out += `{${inner.out}}`;
      textLength += inner.textLength;
      i = end + 1;
    } else {
      out += body[i++]; // selectors and whitespace stay as they are
    }
  }
  return { out, textLength };
}

function transform(s: string): Transformed {
  let out = '';
  let textLength = 0;
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    let protectedLength = 0;
    if (rest.startsWith('{{')) {
      const end = s.indexOf('}}', i + 2);
      if (end !== -1) protectedLength = end + 2 - i;
    } else if (rest.startsWith('${')) {
      const end = s.indexOf('}', i + 2);
      if (end !== -1) protectedLength = end + 1 - i;
    } else if (rest.startsWith('$t(')) { // i18next nesting
      const end = matchingBrace(s, i + 2);
      if (end !== -1) protectedLength = end + 1 - i;
    } else if (rest[0] === '@') {
      protectedLength = VUE_LINKED.exec(rest)?.[0].length ?? 0;
    } else if (rest[0] === '&') {
      protectedLength = HTML_ENTITY.exec(rest)?.[0].length ?? 0;
    } else if (rest[0] === '%') {
      protectedLength = PRINTF.exec(rest)?.[0].length ?? 0;
    } else if (rest[0] === '<') {
      protectedLength = HTML_TAG.exec(rest)?.[0].length ?? 0;
    } else if (rest[0] === '{') {
      const end = matchingBrace(s, i);
      if (end !== -1) {
        const content = s.slice(i + 1, end);
        const head = ICU_HEAD.exec(content);
        if (head) {
          const body = transformIcuBody(content.slice(head[0].length));
          out += `{${head[0]}${body.out}}`;
          textLength += body.textLength;
          i = end + 1;
          continue;
        }
        protectedLength = end + 1 - i;
      }
    }
    if (protectedLength > 0) {
      out += s.slice(i, i + protectedLength);
      i += protectedLength;
      continue;
    }
    const ch = s[i++];
    out += ACCENTS[ch] ?? ch;
    if (ch !== '#') textLength++;
  }
  return { out, textLength };
}

/** Accent and lengthen `text`, keeping placeholders, ICU syntax, nested/linked messages, HTML tags and entities intact. */
export function pseudoLong(text: string, opts: PseudoOptions = {}): string {
  if (text.trim() === '') return text;
  const expansion = opts.expansion ?? 0.4;
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  const { out, textLength } = transform(core);
  const pad = Math.max(2, Math.ceil(textLength * expansion));
  return `${lead}${MARK_START}${out} ${'~'.repeat(pad - 1)}${MARK_END}${trail}`;
}

const UNACCENT: Record<string, string> = Object.fromEntries(Object.entries(ACCENTS).map(([plain, accented]) => [accented, plain]));

/** Undo `pseudoLong`, approximately: drop the markers and padding, and take the accents off. */
export function unpseudo(text: string): string {
  return text
    .replace(/ ~*\u27E7/g, '')
    .replace(/[\u27E6\u27E7]/g, '')
    .replace(/[^\x00-\x7F]/g, ch => UNACCENT[ch] ?? ch);
}

/** Apply `pseudoLong` to every string in a (possibly nested) message file. */
export function pseudoMessages(messages: Messages, opts?: PseudoOptions): Messages {
  const result: Messages = {};
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value === 'string') result[key] = pseudoLong(value, opts);
    else if (value && typeof value === 'object' && !Array.isArray(value)) result[key] = pseudoMessages(value, opts);
    else result[key] = value;
  }
  return result;
}

/** Dotted key paths of every string in a message file. */
export function flattenKeys(messages: Messages, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') keys.push(path);
    else if (value && typeof value === 'object' && !Array.isArray(value)) keys.push(...flattenKeys(value, path));
  }
  return keys;
}

/** Dotted key path and value of every string in a message file, in key order. */
export function flattenEntries(messages: Messages, prefix = ''): Array<[key: string, value: string]> {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') entries.push([path, value]);
    else if (value && typeof value === 'object' && !Array.isArray(value)) entries.push(...flattenEntries(value, path));
  }
  return entries;
}

/** Every string of a message file, in key order. */
export function flattenValues(messages: Messages): string[] {
  const values: string[] = [];
  for (const value of Object.values(messages)) {
    if (typeof value === 'string') values.push(value);
    else if (value && typeof value === 'object' && !Array.isArray(value)) values.push(...flattenValues(value));
  }
  return values;
}
