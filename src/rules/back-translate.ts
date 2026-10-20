import { HTML_TAG, ICU_HEAD, flattenEntries, matchingBrace, type Messages } from '../pseudo';

/** Rendered locale text in, the source text it came from out (outer whitespace kept), or null when no message matches. */
export type BackTranslator = (rendered: string) => string | null;

type Part = string | { slot: string };

/** One way a message can render: the ICU branch chosen for each argument, and the resulting text. */
interface Variant { choice: Array<[arg: string, selector: string]>; text: string }

const MAX_VARIANTS = 64;
const TAGS = new RegExp(HTML_TAG.source.slice(1), 'g');
const PLURAL_SUFFIX = /^(.*_(?:ordinal_)?)(?:zero|one|two|few|many|other)$/;
// {{x}} and {{- x}} (i18next), ${x}, {x} and {x, number…} (ICU, vue-i18n), %1$s, %s.
const SLOT = /\{\{-?\s*([\w.]+)\s*\}\}|\$\{\s*([\w.]+)\s*\}|\{\s*([\w.#]+)\s*(?:,[^{}]*)?\}|%(\d+)\$[sdif@]|%[sdif@]/g;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const collapse = (s: string) => s.replace(/\s+/g, ' ');
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const decode = (s: string) =>
  s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g, (m, dec, hex, name) =>
    dec ? String.fromCodePoint(+dec) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name] ?? m);

/** Expand the ICU plural/select blocks of a message, one level deep; null for deeper nesting or too many variants. */
function variants(value: string): Variant[] | null {
  let result: Variant[] = [{ choice: [], text: '' }];
  const append = (text: string) => { for (const v of result) v.text += text; };
  let i = 0;
  while (i < value.length) {
    const start = value.indexOf('{', i);
    if (start === -1) { append(value.slice(i)); break; }
    const end = matchingBrace(value, start);
    if (end === -1) { append(value.slice(i)); break; }
    append(value.slice(i, start));
    const content = value.slice(start + 1, end);
    const head = ICU_HEAD.exec(content);
    if (!head) {
      append(value.slice(start, end + 1));
    } else {
      const arg = content.split(',')[0].trim();
      const branches = icuBranches(content.slice(head[0].length), head[1] !== 'select');
      if (!branches || branches.length * result.length > MAX_VARIANTS) return null;
      result = result.flatMap(v => branches.map(([selector, text]) => ({ choice: [...v.choice, [arg, selector] as [string, string]], text: v.text + text })));
    }
    i = end + 1;
  }
  return result;
}

/** `one {# item} other {# items}` → [['one', '{#} item'], ['other', '{#} items']]; null if a branch nests another block. */
function icuBranches(body: string, plural: boolean): Array<[string, string]> | null {
  const branches: Array<[string, string]> = [];
  let i = 0;
  while (i < body.length) {
    const m = /^\s*(offset:\s*\d+\s*)?([^\s{}]+)\s*\{/.exec(body.slice(i));
    if (!m) break;
    const open = i + m[0].length - 1;
    const close = matchingBrace(body, open);
    if (close === -1) return null;
    const text = body.slice(open + 1, close);
    if (text.includes('{') && /\{[^{}]*,\s*(plural|select|selectordinal)\s*,/.test(text)) return null;
    branches.push([m[2], plural ? text.replace(/#/g, '{#}') : text]);
    i = close + 1;
  }
  return branches.length ? branches : null;
}

/** Literal text and named slots of one fragment, whitespace collapsed and trimmed; null when it has no letter. */
function parts(fragment: string): Part[] | null {
  const out: Part[] = [];
  let bare = 0, last = 0;
  const literal = (s: string) => { if (s) out.push(decode(s)); };
  for (const m of fragment.matchAll(SLOT)) {
    literal(fragment.slice(last, m.index));
    const [, i18next, dollar, icu, position] = m;
    out.push({ slot: i18next ?? dollar ?? icu ?? (position ? `$${position}` : `$${++bare}`) });
    last = m.index + m[0].length;
  }
  literal(fragment.slice(last));
  // Collapse and trim across the whole fragment, keeping slots where they are.
  const joined = out.map(p => (typeof p === 'string' ? collapse(p) : p));
  if (typeof joined[0] === 'string') joined[0] = joined[0].trimStart();
  const n = joined.length - 1;
  if (typeof joined[n] === 'string') joined[n] = (joined[n] as string).trimEnd();
  const kept = joined.filter(p => p !== '');
  return kept.some(p => typeof p === 'string' && /\p{L}/u.test(p)) ? kept : null;
}

const slots = (p: Part[]) => p.flatMap(x => (typeof x === 'string' ? [] : [x.slot]));
const fill = (p: Part[], values: Map<string, string>) => p.map(x => (typeof x === 'string' ? x : values.get(x.slot)!)).join('');

/** Pair each target variant with the source variant of the same branches, falling back to `other`. */
function pairVariants(source: Variant[], target: Variant[]): Array<[source: string, target: string]> {
  const key = (choice: Variant['choice']) => choice.map(([a, s]) => `${a}=${s}`).join('&');
  const bySource = new Map(source.map(v => [key(v.choice), v.text]));
  const branchesOf = new Map<string, Set<string>>();
  for (const v of source) for (const [a, s] of v.choice) (branchesOf.get(a) ?? branchesOf.set(a, new Set()).get(a)!).add(s);
  const args = source[0].choice.map(([a]) => a);
  const pairs: Array<[string, string]> = [];
  for (const t of target) {
    const wanted = new Map(t.choice);
    const choice = args.map(a => {
      const s = wanted.get(a);
      return [a, s !== undefined && branchesOf.get(a)!.has(s) ? s : 'other'] as [string, string];
    });
    const text = bySource.get(key(choice));
    if (text !== undefined) pairs.push([text, t.text]);
  }
  return pairs;
}

/** Source and target texts of one message that can render on their own: whole, per vue-i18n plural part, per ICU branch. */
function messagePairs(source: string, target: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  if (source.includes(' | ') && target.includes(' | ')) {
    const s = source.split(' | '), t = target.split(' | ');
    t.forEach((part, i) => pairs.push([s[Math.min(i, s.length - 1)], part]));
  }
  const sv = variants(source), tv = variants(target);
  if (sv && tv) pairs.push(...pairVariants(sv, tv));
  return pairs;
}

interface Pattern { re: RegExp; names: string[]; chunk: string; literal: number; source: Part[] }

/**
 * Map rendered text of a locale back to its source-language text, by pairing the two message files key by key.
 * Text that maps to several source texts gets the longest: a longer source text is likelier to overflow too,
 * so the noise rule drops the issue rather than inventing one.
 */
export function backTranslator(source: Messages, target: Messages): BackTranslator {
  const sources = new Map(flattenEntries(source));
  const exact = new Map<string, string>();
  const patterns: Pattern[] = [];
  const nested = (v: string) => v.includes('$t(') || v.includes('@:');

  for (const [key, value] of flattenEntries(target)) {
    const suffix = PLURAL_SUFFIX.exec(key);
    const src = sources.get(key) ?? (suffix ? sources.get(`${suffix[1]}other`) : undefined);
    if (src === undefined || nested(src) || nested(value)) continue;
    for (const [s, t] of messagePairs(src, value)) {
      const sFragments = s.split(TAGS), tFragments = t.split(TAGS);
      if (sFragments.length !== tFragments.length) continue;
      tFragments.forEach((tf, i) => {
        const tp = parts(tf), sp = parts(sFragments[i]);
        if (!tp || !sp) return;
        const names = slots(tp);
        if (!slots(sp).every(n => names.includes(n))) return;
        if (names.length === 0) {
          const text = tp.join(''), result = sp.join('');
          if ((exact.get(text)?.length ?? -1) < result.length) exact.set(text, result);
          return;
        }
        const literals = tp.filter((p): p is string => typeof p === 'string');
        patterns.push({
          re: new RegExp(`^${tp.map(p => (typeof p === 'string' ? escape(p).replace(/ /g, '\\s+') : '([\\s\\S]+?)')).join('')}$`),
          names,
          chunk: literals.reduce((a, b) => (b.length > a.length ? b : a), ''),
          literal: literals.join('').length,
          source: sp,
        });
      });
    }
  }

  return rendered => {
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(rendered)!;
    const text = collapse(core);
    if (text === '') return null;
    let best = exact.get(text) ?? null;
    if (best === null) {
      let bestLiteral = -1;
      for (const p of patterns) {
        if (!text.includes(p.chunk)) continue;
        const m = p.re.exec(text);
        if (!m) continue;
        const values = new Map<string, string>();
        p.names.forEach((n, i) => { if (!values.has(n)) values.set(n, m[i + 1]); });
        const result = fill(p.source, values);
        if (p.literal > bestLiteral || (p.literal === bestLiteral && result.length > best!.length)) {
          best = result;
          bestLiteral = p.literal;
        }
      }
    }
    return best === null ? null : `${lead}${best}${trail}`;
  };
}
