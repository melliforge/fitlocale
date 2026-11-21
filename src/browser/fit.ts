import type { FitFont, FitObservation } from '../types';
import { ignoreSelector, isIgnored, langOf, selectorOf } from './dom';

export interface FitRecording { entries: FitObservation[]; styles: Array<Record<string, string>>; fonts: FitFont[]; ambiguous: number }

/**
 * For every element whose text is exactly one source message (slots filled), record the room its text has: lengthen
 * the text for a moment and see which edge stops it. Measured in the source locale; `fitlocale fit` replays it with
 * translations. Built from the Will it fit? spike (fitlocale-internal/trials/2026-11-20-will-it-fit-spike.md).
 */
export function recordFit(messages: Array<{ key: string; text: string }>, ignore: string[]): FitRecording {
  const ignoreSel = ignoreSelector(ignore);
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const SLOT = /(\{\{\s*\w+\s*\}\}|\{\w+\})/;
  // Exact texts are a map lookup; only messages with slots need a regex. A message with no literal letters ({{name}},
  // "{{a}} {{b}}") would match every element: it says nothing about which element is which, so it is left out.
  const exact = new Map<string, string[]>();
  const slotted: Array<{ key: string; re: RegExp; names: string[]; literal: number }> = [];
  for (const m of messages) {
    const text = norm(m.text);
    if (!text) continue;
    if (!SLOT.test(text)) { exact.set(text, [...(exact.get(text) ?? []), m.key]); continue; }
    const names: string[] = [];
    let literal = 0;
    const src = text.split(SLOT).map(part => {
      const slot = /^\{\{?\s*(\w+)\s*\}?\}$/.exec(part);
      if (slot) { names.push(slot[1]); return '(.+?)'; }
      literal += (part.match(/\p{L}/gu) ?? []).length;
      return esc(part);
    }).join('');
    if (literal > 0) slotted.push({ key: m.key, re: new RegExp(`^${src}$`, 'u'), names, literal });
  }
  const STYLE = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariant', 'fontFeatureSettings', 'fontVariationSettings',
    'lineHeight', 'letterSpacing', 'wordSpacing', 'textTransform', 'whiteSpace', 'wordBreak', 'overflowWrap', 'hyphens', 'textIndent'] as const;
  const px = (v: string) => parseFloat(v) || 0;
  const lineCount = (node: Node) => {
    const r = document.createRange();
    r.selectNodeContents(node);
    return new Set(Array.from(r.getClientRects()).filter(x => x.width > 0).map(x => Math.round(x.top))).size;
  };
  /** The box inside padding and border. */
  const inner = (e: Element) => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return {
      left: r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft), right: r.right - px(cs.borderRightWidth) - px(cs.paddingRight),
      top: r.top + px(cs.borderTopWidth) + px(cs.paddingTop), bottom: r.bottom - px(cs.borderBottomWidth) - px(cs.paddingBottom),
    };
  };
  const clipsAxis = (v: string) => /hidden|clip/.test(v);
  const scrollsAxis = (v: string) => /auto|scroll/.test(v);

  const styles: Array<Record<string, string>> = [];
  const styleIndex = new Map<string, number>();
  const styleOf = (cs: CSSStyleDeclaration) => {
    const style = Object.fromEntries(STYLE.map(p => [p, cs[p] as string]));
    const id = JSON.stringify(style);
    if (!styleIndex.has(id)) { styleIndex.set(id, styles.length); styles.push(style); }
    return styleIndex.get(id)!;
  };

  const entries: FitObservation[] = [];
  let ambiguous = 0;
  const candidates = Array.from(document.body.querySelectorAll('*')).filter(el => {
    const r = el.getBoundingClientRect();
    // Screen-reader-only text (1×1 px, clipped) is not on screen.
    return r.width > 2 && r.height > 2 && !isIgnored(el, ignoreSel) && Array.from(el.childNodes).some(n => n.nodeType === 3 && norm(n.textContent ?? ''));
  });
  for (const el of candidates) {
    const text = norm(el.textContent ?? '');
    if (!text || text.length > 400) continue;
    let key: string, slots: Record<string, string> = {};
    const exactKeys = exact.get(text);
    if (exactKeys) {
      if (new Set(exactKeys).size > 1) { ambiguous++; continue; }
      key = exactKeys[0];
    } else {
      // Several patterns match: the one with the most literal letters is the most specific; a tie is ambiguous.
      const hits = slotted.map(c => ({ c, m: c.re.exec(text) })).filter(h => h.m).sort((a, b) => b.c.literal - a.c.literal);
      if (!hits.length) continue;
      if (hits.length > 1 && hits[1].c.literal === hits[0].c.literal && hits[1].c.key !== hits[0].c.key) { ambiguous++; continue; }
      key = hits[0].c.key;
      slots = Object.fromEntries(hits[0].c.names.map((n, i) => [n, hits[0].m![i + 1]]));
    }
    const cs = getComputedStyle(el);
    const rtl = cs.direction === 'rtl';
    const clamp = parseInt((cs as unknown as Record<string, string>).webkitLineClamp ?? '', 10);
    const entry: FitObservation = {
      key, text, slots, lines: lineCount(el),
      oneLine: /^(nowrap|pre)$/.test(cs.whiteSpace), wrapWidth: inner(el).right - inner(el).left, roomX: null, roomY: null,
      maxLines: clamp > 0 ? clamp : null, measured: false, s: styleOf(cs),
      lang: langOf(el), dir: cs.direction, selector: selectorOf(el),
    };
    // Safe to lengthen when one text node holds all the text: an icon or an empty child beside it does not matter.
    const texts = Array.from(el.childNodes).filter((n): n is Text => n.nodeType === 3 && norm((n as Text).data) !== '');
    const childHasText = Array.from(el.children).some(c => norm(c.textContent ?? '') !== '');
    if (texts.length === 1 && !childHasText) probe(el, texts[0], rtl, entry);
    entries.push(entry);
  }

  function probe(el: Element, node: Text, rtl: boolean, entry: FitObservation): void {
    const textRect = () => { const r = document.createRange(); r.selectNodeContents(node); return r.getBoundingClientRect(); };
    // Edges that stop the text, per axis: its own box (escapes, ellipsis) on both, and ancestors that clip on that axis.
    // An ancestor whose content already scrolls on an axis is a viewport onto a list there, not a box around this
    // text; an ancestor that scrolls on an axis ends the walk for that axis.
    const stoppers: Array<{ el: Element; x: boolean; y: boolean }> = [{ el, x: true, y: true }];
    let openX = true, openY = true;
    for (let a = el.parentElement; a && a !== document.documentElement && (openX || openY); a = a.parentElement) {
      const acs = getComputedStyle(a);
      const x = openX && clipsAxis(acs.overflowX) && a.scrollWidth <= a.clientWidth + 1;
      const y = openY && clipsAxis(acs.overflowY) && a.scrollHeight <= a.clientHeight + 1;
      if (x || y) stoppers.push({ el: a, x, y });
      if (scrollsAxis(acs.overflowX)) openX = false;
      if (scrollsAxis(acs.overflowY)) openY = false;
    }
    const t1 = textRect();
    // Only edges the text starts inside of: content already outside a clipping ancestor is not stopped by it.
    const inside = stoppers.filter((s, i) => {
      if (i === 0) return true;
      const r = inner(s.el);
      return t1.left >= r.left - 1 && t1.right <= r.right + 1 && t1.top >= r.top - 1 && t1.bottom <= r.bottom + 1;
    });
    const block = (() => { for (let b: Element | null = el; b; b = b.parentElement) if (!/^inline/.test(getComputedStyle(b).display)) return b; return el; })();
    const original = node.data;
    // 4× the text, and at least 60 more characters: a short label's 4× is shorter than many translations.
    let long = [original, original, original, original].join(' ');
    while (long.length < original.length + 60) long += ' ' + original;
    node.data = long;
    try {
      const t4 = textRect();
      const rooms = inside.map(s => ({ ...inner(s.el), x: s.x, y: s.y }));
      const xs = rooms.filter(r => r.x && (rtl ? t4.left < r.left - 1 : t4.right > r.right + 1)).map(r => (rtl ? t4.right - r.left : r.right - t4.left));
      const ys = rooms.filter(r => r.y && t4.bottom > r.bottom + 1).map(r => r.bottom - t4.top);
      entry.roomX = xs.length ? Math.max(0, Math.min(...xs)) : null;
      entry.roomY = ys.length ? Math.max(0, Math.min(...ys)) : null;
      const b = inner(block);
      entry.wrapWidth = Math.max(1, Math.min(b.right - b.left, rtl ? t4.right - b.left : b.right - t4.left));
      entry.measured = true;
    } finally {
      node.data = original;
    }
  }

  const fonts: FitFont[] = [];
  const visit = (rules: CSSRuleList, base: string) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSImportRule) {
        try { if (rule.styleSheet) visit(rule.styleSheet.cssRules, rule.styleSheet.href ?? base); } catch { /* cross-origin import */ }
        continue;
      }
      // @media, @supports, @layer, @container: their @font-face rules count too.
      if ('cssRules' in rule && !(rule instanceof CSSFontFaceRule)) { visit((rule as CSSGroupingRule).cssRules, base); continue; }
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const s = rule.style;
      const url = /url\(["']?([^"')]+)["']?\)/.exec(s.getPropertyValue('src'))?.[1];
      if (!url) continue;
      let src = url;
      try { src = new URL(url, base).href; } catch { /* an opaque base (about:blank): keep it as written */ }
      fonts.push({
        family: s.getPropertyValue('font-family').replace(/["']/g, '').trim(), weight: s.getPropertyValue('font-weight') || '400',
        style: s.getPropertyValue('font-style') || 'normal', src,
      });
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; } // a cross-origin stylesheet: fitlocale fit checks its families by name
    visit(rules, sheet.href ?? location.href);
  }
  return { entries, styles, fonts, ambiguous };
}
