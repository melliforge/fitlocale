import type { FitFont, FitObservation } from '../types';
import { ignoreSelector, isIgnored, langOf, selectorOf } from './dom';

/**
 * For every element whose text is exactly one source message (slots filled), record the room its text has: lengthen
 * the text for a moment and see which edge stops it. Measured in the source locale; `fitlocale fit` replays it with
 * translations. Built from the Will it fit? spike (fitlocale-internal/trials/2026-11-20-will-it-fit-spike.md).
 */
export function recordFit(messages: Array<{ key: string; text: string }>, ignore: string[]): { entries: FitObservation[]; fonts: FitFont[]; ambiguous: number } {
  const ignoreSel = ignoreSelector(ignore);
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const compiled = messages.filter(m => norm(m.text)).map(m => {
    const names: string[] = [];
    const src = norm(m.text).split(/(\{\{\s*\w+\s*\}\}|\{\w+\})/).map(part => {
      const slot = /^\{\{?\s*(\w+)\s*\}?\}$/.exec(part);
      if (slot) { names.push(slot[1]); return '(.+?)'; }
      return esc(part);
    }).join('');
    return { key: m.key, re: new RegExp(`^${src}$`, 'u'), names };
  });
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
  const clips = (cs: CSSStyleDeclaration) => /hidden|clip/.test(cs.overflowX) || /hidden|clip/.test(cs.overflowY);

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
    const hits = compiled.map(c => ({ c, m: c.re.exec(text) })).filter(h => h.m);
    if (!hits.length) continue;
    if (new Set(hits.map(h => h.c.key)).size > 1) { ambiguous++; continue; }
    const { c, m } = hits[0];
    const cs = getComputedStyle(el);
    const rtl = cs.direction === 'rtl';
    const textNodes = Array.from(el.childNodes).filter((n): n is Text => n.nodeType === 3);
    const clamp = parseInt((cs as unknown as Record<string, string>).webkitLineClamp ?? '', 10);
    const entry: FitObservation = {
      key: c.key, text, slots: Object.fromEntries(c.names.map((n, i) => [n, m![i + 1]])), lines: lineCount(el),
      oneLine: /^(nowrap|pre)$/.test(cs.whiteSpace), wrapWidth: inner(el).right - inner(el).left, roomX: null, roomY: null,
      maxLines: clamp > 0 ? clamp : null,
      style: Object.fromEntries(STYLE.map(p => [p, cs[p] as string])), lang: langOf(el), dir: cs.direction, selector: selectorOf(el),
    };
    // Only text the element holds alone can be lengthened safely; the rest is recorded without room.
    if (el.children.length === 0 && textNodes.length === 1) probe(el, textNodes[0], rtl, entry);
    entries.push(entry);
  }

  function probe(el: Element, node: Text, rtl: boolean, entry: FitObservation): void {
    const textRect = () => { const r = document.createRange(); r.selectNodeContents(node); return r.getBoundingClientRect(); };
    // Edges that stop the text: its own box (escapes, ellipsis) and clipping ancestors. A clipping ancestor whose content
    // already scrolls is a viewport onto a list, not a box around this text; a scrolling ancestor ends the walk.
    const stoppers: Element[] = [el];
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (clips(acs) && a.scrollHeight <= a.clientHeight + 1) stoppers.push(a);
      if (/auto|scroll/.test(acs.overflowY) && a.scrollHeight > a.clientHeight + 1) break;
    }
    const t1 = textRect();
    // Only edges the text starts inside of: content already outside a clipping ancestor is not stopped by it.
    const inside = stoppers.filter((s, i) => {
      if (i === 0) return true;
      const r = inner(s);
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
      const rooms = inside.map(inner);
      const xs = rooms.filter(r => (rtl ? t4.left < r.left - 1 : t4.right > r.right + 1)).map(r => (rtl ? t4.right - r.left : r.right - t4.left));
      const ys = rooms.filter(r => t4.bottom > r.bottom + 1).map(r => r.bottom - t4.top);
      entry.roomX = xs.length ? Math.max(0, Math.min(...xs)) : null;
      entry.roomY = ys.length ? Math.max(0, Math.min(...ys)) : null;
      const b = inner(block);
      entry.wrapWidth = Math.max(1, Math.min(b.right - b.left, rtl ? t4.right - b.left : b.right - t4.left));
    } finally {
      node.data = original;
    }
  }

  const fonts: FitFont[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; } // a cross-origin stylesheet: its fonts are not listed
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const s = rule.style;
      const url = /url\(["']?([^"')]+)["']?\)/.exec(s.getPropertyValue('src'))?.[1];
      if (!url) continue;
      let src = url;
      try { src = new URL(url, sheet.href ?? location.href).href; } catch { /* an opaque base (about:blank): keep it as written */ }
      fonts.push({
        family: s.getPropertyValue('font-family').replace(/["']/g, '').trim(), weight: s.getPropertyValue('font-weight') || '400',
        style: s.getPropertyValue('font-style') || 'normal', src,
      });
    }
  }
  return { entries, fonts, ambiguous };
}
