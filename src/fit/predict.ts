import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Browser } from '@playwright/test';
import { isRtlLocale } from '../rules/icons';
import type { FitFont } from '../types';
import type { FitMap, FitMapEntry } from './map';

export type FitVerdict = {
  key: string;
  verdict: 'fits' | 'grows' | 'overflows' | 'already' | 'not-checked';
  /** For a measured key: the box that decided, as `1280×800`, and its selector. */
  vp?: string; selector?: string;
  /** For `overflows`: the px the text needs and the px its box has, on `axis`. */
  need?: number; room?: number; axis?: 'x' | 'y';
  text: string;
  /** Its font could not be loaded: measured with a fallback font, so the verdict may be wrong. */
  fontMissing?: true;
};

export interface PredictOptions {
  map: FitMap;
  /** Key → translation. */
  messages: Map<string, string>;
  /** The keys to check (all, or the changed ones). */
  keys: string[];
  locale: string;
  /** Where the app's own font files are (its static folder). Fonts found there are used before their recorded URL. */
  fontsDir: string | null;
  chromium: { launch(): Promise<Browser> };
}

const RANK = { fits: 0, grows: 1, already: 2, overflows: 3 } as const;
const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|.*\.localhost)$/i;

/** The bytes of a font recorded on the app's origin: by its path under `fontsDir`, then by its file name anywhere in it. */
function localFont(src: string, fontsDir: string): Buffer | null {
  let path: string;
  try { path = decodeURIComponent(new URL(src).pathname); } catch { path = src; }
  const direct = join(fontsDir, path);
  if (existsSync(direct) && statSync(direct).isFile()) return readFileSync(direct);
  const name = basename(path);
  const stack = [fontsDir];
  let seen = 0;
  while (stack.length && seen < 50_000) {
    const dir = stack.pop()!;
    let names: string[];
    try { names = readdirSync(dir); } catch { continue; }
    for (const n of names) {
      if (n === 'node_modules' || n.startsWith('.')) continue;
      const p = join(dir, n);
      seen++;
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) stack.push(p);
      else if (n === name) return readFileSync(p);
    }
  }
  return null;
}

const isPublic = (src: string) => {
  try {
    const u = new URL(src);
    return /^https?:$/.test(u.protocol) && !LOCAL.test(u.hostname);
  } catch {
    return false;
  }
};
/** Generic families, and the system-font keywords: always there, never warned about. */
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace',
  'ui-rounded', 'emoji', 'math', 'fangsong', '-apple-system', 'blinkmacsystemfont', 'inherit', 'initial']);
const firstFamily = (stack: string) => (stack.split(',')[0] ?? '').replace(/["']/g, '').trim().toLowerCase();
const fill = (text: string, slots: Record<string, string> = {}) =>
  text.replace(/\{\{\s*(\w+)\s*\}\}|\{(\w+)\}/g, (_, a: string | undefined, b: string | undefined) => slots[a ?? b!] ?? (a ?? b!));

/** Judge each key's translation in every box the map recorded for it, in one blank Chromium page. */
export async function predictFit(o: PredictOptions): Promise<{ verdicts: FitVerdict[]; fontWarnings: string[] }> {
  const dir = isRtlLocale(o.locale) ? 'rtl' : 'ltr';
  const jobs: Array<{ key: string; e: FitMapEntry; style: Record<string, string>; text: string }> = [];
  const verdicts = new Map<string, FitVerdict>();
  for (const key of o.keys) {
    const text = o.messages.get(key);
    const entries = o.map.keys[key];
    if (typeof text !== 'string' || !text.trim() || !entries?.length) {
      verdicts.set(key, { key, verdict: 'not-checked', text: text ?? '' });
      continue;
    }
    // A box that was not measured says nothing about room: "fits" must always mean "measured and fits".
    const measured = entries.filter(e => !e.nm);
    if (!measured.length) { verdicts.set(key, { key, verdict: 'not-checked', text }); continue; }
    for (const e of measured) jobs.push({ key, e, style: o.map.styles[e.s] ?? {}, text: fill(text, e.slots) });
  }

  // Fonts: public URLs load as they are; fonts from the app's origin come from fontsDir.
  const faces: Array<{ font: FitFont; url?: string; bytes?: string }> = [];
  const fontWarnings: string[] = [];
  for (const font of o.map.fonts) {
    // A file under fontsDir first: CI may not reach the app's origin. Then a public URL as it is.
    const bytes = o.fontsDir ? localFont(font.src, o.fontsDir) : null;
    if (bytes) faces.push({ font, bytes: bytes.toString('base64') });
    else if (isPublic(font.src)) faces.push({ font, url: font.src });
    else fontWarnings.push(`font "${font.family}" (${font.weight} ${font.style}) from ${font.src} was not found${o.fontsDir ? ` under ${o.fontsDir}` : ': pass --fonts <the app\'s static folder>'}`);
  }

  const browser = await o.chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><meta charset=utf-8><style>.fitlocale-box{position:absolute;left:0;top:0;visibility:hidden}</style><body>');
    const failed: string[] = await page.evaluate(async list => {
      const bad: string[] = [];
      for (const f of list) {
        const source = f.bytes ? Uint8Array.from(atob(f.bytes), c => c.charCodeAt(0)).buffer : `url(${JSON.stringify(f.url)})`;
        const face = new FontFace(f.font.family, source, { weight: f.font.weight, style: f.font.style });
        try { await face.load(); document.fonts.add(face); } catch { bad.push(f.font.family); }
      }
      return bad;
    }, faces);
    for (const family of failed) {
      const f = faces.find(x => x.font.family === family)!.font;
      fontWarnings.push(`font "${family}" (${f.weight} ${f.style}) from ${f.src} could not be loaded`);
    }
    // Families the boxes ask for that this page cannot render: no face loaded for them, and not installed either
    // (the recorder cannot see every font: a cross-origin stylesheet, fonts added from script).
    const used = [...new Set(jobs.map(j => firstFamily(j.style.fontFamily ?? '')).filter(f => f && !GENERIC.has(f)))];
    const loadedFaces = faces.map(f => f.font.family.toLowerCase()).filter(f => !failed.map(x => x.toLowerCase()).includes(f));
    const unavailable: string[] = await page.evaluate(({ used, loadedFaces }) => used.filter(family => {
      if (loadedFaces.includes(family)) return false;
      const width = (stack: string) => {
        const s = document.createElement('span');
        s.style.cssText = `position:absolute;visibility:hidden;font-size:40px;white-space:nowrap;font-family:${stack}`;
        s.textContent = 'mmmmmmmmmmlliWWwwQ@#0123';
        document.body.appendChild(s);
        const w = s.getBoundingClientRect().width;
        s.remove();
        return w;
      };
      const quoted = `"${family.replace(/"/g, '')}"`;
      return width(`${quoted}, monospace`) === width('monospace') && width(`${quoted}, serif`) === width('serif');
    }), { used, loadedFaces });
    const recordedFamilies = new Set(o.map.fonts.map(f => f.family.toLowerCase()));
    // Named as the app's CSS writes it.
    const asWritten = new Map(jobs.map(j => [firstFamily(j.style.fontFamily ?? ''), (j.style.fontFamily ?? '').split(',')[0].replace(/["']/g, '').trim()]));
    for (const family of unavailable) {
      if (!recordedFamilies.has(family)) fontWarnings.push(`font "${asWritten.get(family) ?? family}" is used by the app but this page cannot load it: pass --fonts <the app's font files>, or install it`);
    }
    const missing = new Set(unavailable);

    const results = await page.evaluate(({ jobs, dir, locale }) => {
      const make = (style: Record<string, string>, text: string, wrap: number | null) => {
        const d = document.createElement('div');
        d.className = 'fitlocale-box';
        for (const [k, v] of Object.entries(style)) (d.style as unknown as Record<string, string>)[k] = v;
        d.dir = dir;
        d.lang = locale; // hyphenation, line breaking and glyphs follow the translation's language
        if (wrap === null) { d.style.whiteSpace = 'nowrap'; d.style.width = 'max-content'; } else d.style.width = `${wrap}px`;
        d.textContent = text; // never innerHTML: a translation is text, whatever it contains
        document.body.appendChild(d);
        return d;
      };
      const lines = (d: Element) => {
        const r = document.createRange();
        r.selectNodeContents(d);
        return new Set(Array.from(r.getClientRects()).filter(x => x.width > 0).map(x => Math.round(x.top))).size;
      };
      const judge = (e: typeof jobs[number]['e'], style: Record<string, string>, text: string) => {
        const one = make(style, text, null);
        const wrap = e.one ? null : make(style, text, Math.max(1, e.wrap));
        const width = one.getBoundingClientRect().width;
        const lh = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 20;
        const roomX = e.rx ?? null;
        const roomY = e.ry ?? (e.clamp ? e.clamp * lh : null);
        let out: { v: 'fits' | 'grows' | 'overflows'; need?: number; room?: number; axis?: 'x' | 'y' } = { v: 'fits' };
        if (e.one) {
          if (roomX !== null && width > roomX + 1) out = { v: 'overflows', need: Math.ceil(width), room: roomX, axis: 'x' };
        } else if (wrap) {
          const n = lines(wrap);
          if (wrap.scrollWidth > wrap.clientWidth + 1 && roomX !== null && wrap.scrollWidth > roomX + 1) out = { v: 'overflows', need: wrap.scrollWidth, room: roomX, axis: 'x' };
          else if (roomY !== null && n * lh > roomY + 1) out = { v: 'overflows', need: Math.ceil(n * lh), room: roomY, axis: 'y' };
          else if (n > e.lines) out = { v: 'grows' };
        }
        one.remove();
        wrap?.remove();
        return out;
      };
      return jobs.map(j => {
        const t = judge(j.e, j.style, j.text);
        // The English text overflows this box too: not something this translation broke.
        if (t.v === 'overflows' && judge(j.e, j.style, j.e.text).v === 'overflows') return { ...t, v: 'already' as const };
        return t;
      });
    }, { jobs: jobs.map(j => ({ e: j.e, style: j.style, text: j.text })), dir, locale: o.locale });

    results.forEach((m, i) => {
      const j = jobs[i];
      const family = firstFamily(j.style.fontFamily ?? '');
      const fontMissing = missing.has(family);
      const v: FitVerdict = {
        key: j.key, verdict: m.v, vp: j.e.vp, selector: j.e.sel, text: o.messages.get(j.key)!,
        ...(m.need !== undefined ? { need: m.need, room: m.room, axis: m.axis } : {}), ...(fontMissing ? { fontMissing: true as const } : {}),
      };
      const prev = verdicts.get(j.key);
      const worse = !prev || RANK[v.verdict as keyof typeof RANK] > RANK[prev.verdict as keyof typeof RANK]
        || (v.verdict === 'overflows' && prev.verdict === 'overflows' && v.need! - v.room! > prev.need! - prev.room!);
      if (worse) verdicts.set(j.key, v);
    });
  } finally {
    await browser.close();
  }
  return { verdicts: o.keys.map(k => verdicts.get(k)!), fontWarnings };
}
