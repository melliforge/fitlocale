import type { Page } from '@playwright/test';
import { logicalReplacement, pickResponsible, type Declaration } from '../rules/logical';
import { originalPosition, parseSourceMap, type SourceMap } from '../sourcemap';
import type { CssSource, Issue } from '../types';
import type { Devtools } from './session';

const MAX_POINTERS = 20;
const INLINE_INDEX = Number.MAX_SAFE_INTEGER;

interface CdpProperty {
  name: string; value: string; important?: boolean; implicit?: boolean; disabled?: boolean; parsedOk?: boolean; range?: { startLine: number; startColumn: number };
}
interface CdpRule { origin: string; styleSheetId?: string; selectorList: { text: string }; style: { cssProperties: CdpProperty[] } }

/**
 * Declarations written in the stylesheet. With the stylesheet text, DevTools lists each declaration with its range
 * and again without one (and longhands implied by shorthands): keep the ranged ones. Without the text, nothing has a range.
 */
function explicit(props: CdpProperty[]): CdpProperty[] {
  const usable = props.filter(p => !p.implicit && !p.disabled && p.parsedOk !== false);
  return usable.some(p => p.range) ? usable.filter(p => p.range) : usable;
}
const valueOf = (p: CdpProperty) => p.value.replace(/\s*!important\s*$/i, '');

const MAP_TIMEOUT_MS = 3000;

/**
 * Fetch a source map from Node (the context's cookies, a timeout, and nothing seen by the page: no extra request,
 * no console error for a map that is not deployed), or decode a data: URL. Null on any failure.
 */
async function loadMap(page: Page, url: string, cache: Map<string, SourceMap | null>): Promise<SourceMap | null> {
  if (cache.has(url)) return cache.get(url)!;
  let text: string | null = null;
  try {
    if (url.startsWith('data:')) {
      const [, meta, data] = /^data:([^,]*),(.*)$/s.exec(url) ?? [];
      text = meta?.endsWith(';base64') ? Buffer.from(data, 'base64').toString('utf8') : decodeURIComponent(data ?? '');
    } else {
      const res = await page.context().request.get(url, { timeout: MAP_TIMEOUT_MS, failOnStatusCode: false });
      text = res.ok() ? await res.text() : null;
    }
  } catch {
    text = null;
  }
  const map = text === null ? null : parseSourceMap(text);
  cache.set(url, map);
  return map;
}

async function sourceFor(page: Page, devtools: Devtools, key: string, maps: Map<string, SourceMap | null>): Promise<CssSource | null> {
  const nodeId = await devtools.nodeFor(key);
  if (!nodeId) return null;
  const matched = await devtools.send('CSS.getMatchedStylesForNode', { nodeId }) as {
    matchedCSSRules?: Array<{ rule: CdpRule }>; inlineStyle?: { cssProperties: CdpProperty[] };
  };
  const { computedStyle } = await devtools.send('CSS.getComputedStyleForNode', { nodeId });
  const position = computedStyle.find(p => p.name === 'position')?.value ?? 'static';

  const declarations: Declaration[] = [];
  (matched.matchedCSSRules ?? []).forEach(({ rule }, index) => {
    if (rule.origin === 'user-agent') return;
    for (const p of explicit(rule.style.cssProperties)) {
      declarations.push({
        name: p.name, value: valueOf(p), important: !!p.important, ruleIndex: index, selector: rule.selectorList.text,
        styleSheetId: rule.styleSheetId, line: p.range ? p.range.startLine : -1, column: p.range ? p.range.startColumn : -1,
      });
    }
  });
  for (const p of explicit(matched.inlineStyle?.cssProperties ?? [])) {
    declarations.push({ name: p.name, value: valueOf(p), important: !!p.important, ruleIndex: INLINE_INDEX, selector: 'style attribute', line: 0, column: 0 });
  }

  const decl = pickResponsible(declarations, position);
  const replacement = decl && logicalReplacement(decl.name, decl.value);
  if (!decl || !replacement) return null;
  const base = { selector: decl.selector, property: decl.name, value: decl.value, replacement };
  if (decl.ruleIndex === INLINE_INDEX) return { ...base, url: page.url(), line: 0, column: 0 };

  const header = decl.styleSheetId ? devtools.sheets.get(decl.styleSheetId) : undefined;
  const url = header?.sourceURL || page.url();
  // Line 0: DevTools had no stylesheet text, so the declaration's position is unknown.
  if (decl.line < 0) return { ...base, url, line: 0, column: 0 };
  const line = (header?.startLine ?? 0) + decl.line + 1;
  const column = decl.column + 1 + (decl.line === 0 ? header?.startColumn ?? 0 : 0);
  const source: CssSource = { ...base, url, line, column };
  if (header?.sourceMapURL) {
    let mapUrl: string | null = null;
    try {
      mapUrl = header.sourceMapURL.startsWith('data:') ? header.sourceMapURL : new URL(header.sourceMapURL, url).href;
    } catch { /* an unresolvable map URL: keep the generated location */ }
    const map = mapUrl ? await loadMap(page, mapUrl, maps) : null;
    // Map positions are relative to the stylesheet text, not to the HTML document holding it.
    const original = map && originalPosition(map, decl.line + 1, decl.column + 1);
    if (original) source.original = { url: original.source, line: original.line, column: original.column };
  }
  return source;
}

function fixText(s: CssSource): string {
  const change = `replace "${s.property}: ${s.value}" with "${s.replacement}".`;
  if (s.selector === 'style attribute') return `In the element's style attribute, ${change}`;
  const where = s.original ?? s;
  return `In ${where.url}${where.line ? `:${where.line}` : ''} (${s.selector}), ${change}`;
}

/** Point each rtl/not-mirrored issue at the CSS declaration that keeps it in place, with its logical replacement. */
export async function attachCssSources(page: Page, devtools: Devtools, issues: Issue[]): Promise<void> {
  const maps = new Map<string, SourceMap | null>();
  const byKey = new Map<string, CssSource | null>();
  for (const issue of issues) {
    if (issue.rule !== 'rtl/not-mirrored') continue;
    if (!byKey.has(issue.key)) {
      if (byKey.size >= MAX_POINTERS) continue;
      let source: CssSource | null = null;
      try {
        source = await sourceFor(page, devtools, issue.key, maps);
      } catch {
        source = null; // the element or the page changed under us: keep the generic fix
      }
      byKey.set(issue.key, source);
    }
    const source = byKey.get(issue.key);
    if (source) {
      issue.source = source;
      issue.fix = fixText(source);
    }
  }
}
