import { readFileSync } from 'node:fs';
import type { FitFont, FitObservation, RunResults } from '../types';

/** One measured box of a key. Sizes are CSS px rounded to 0.5; `rx`, `ry` and `clamp` are absent when nothing stops the text. */
export interface FitMapEntry {
  text: string; slots?: Record<string, string>; lines: number; one?: true;
  wrap: number; rx?: number; ry?: number; clamp?: number;
  /** Index into `styles`. */
  s: number;
  /** The viewport, as `1280×800`. */
  vp: string;
  sel: string;
}

/** `fitlocale-fit.json`: where each message is shown and how much room it has. Written by `fitlocale fitmap`. */
export interface FitMap {
  version: 1; note: string; sourceLocale: string;
  styles: Array<Record<string, string>>;
  fonts: FitFont[];
  keys: Record<string, FitMapEntry[]>;
}

const NOTE = 'Written by `fitlocale fitmap` from test runs with fitMap: true. `fitlocale fit` checks translations against it. Re-record it when the UI changes.';
const half = (n: number) => Math.round(n * 2) / 2;
const byJson = (a: unknown, b: unknown) => { const x = JSON.stringify(a), y = JSON.stringify(b); return x < y ? -1 : x > y ? 1 : 0; };

/** Merge every check's fit records: entries repeated across runs, pages and viewports are kept once. */
export function buildFitMap(runs: RunResults[], sourceLocale: string): FitMap {
  const observations: Array<{ o: FitObservation; vp: string }> = [];
  const fonts = new Map<string, FitFont>();
  for (const run of runs) {
    for (const check of run.checks ?? []) {
      for (const rec of check.fit ?? []) {
        const vp = `${rec.viewport.width}×${rec.viewport.height}`;
        for (const o of rec.entries) observations.push({ o, vp });
        for (const f of rec.fonts) fonts.set(`${f.family}|${f.weight}|${f.style}|${f.src}`, f);
      }
    }
  }
  // Styles get their indices in a sorted order, so the same runs make the same file whatever order they came in.
  const styleJson = [...new Set(observations.map(({ o }) => JSON.stringify(sortKeys(o.style))))].sort();
  const styleIndex = new Map(styleJson.map((s, i) => [s, i]));
  const keys: Record<string, FitMapEntry[]> = {};
  const seen = new Set<string>();
  for (const { o, vp } of observations) {
    const e: FitMapEntry = {
      text: o.text, lines: o.lines, wrap: half(o.wrapWidth), s: styleIndex.get(JSON.stringify(sortKeys(o.style)))!, vp, sel: o.selector,
    };
    if (Object.keys(o.slots).length) e.slots = o.slots;
    if (o.oneLine) e.one = true;
    if (o.roomX !== null) e.rx = half(o.roomX);
    if (o.roomY !== null) e.ry = half(o.roomY);
    if (o.maxLines !== null) e.clamp = o.maxLines;
    const id = JSON.stringify([o.key, e.vp, e.wrap, e.rx, e.ry, e.clamp, e.one, e.s]);
    if (seen.has(id)) continue;
    seen.add(id);
    (keys[o.key] ??= []).push(e);
  }
  return {
    version: 1, note: NOTE, sourceLocale,
    styles: styleJson.map(s => JSON.parse(s) as Record<string, string>),
    fonts: [...fonts.values()].sort(byJson),
    keys,
  };
}

function sortKeys(o: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Sorted keys and entries, so a re-recorded map diffs only where the UI changed. */
export function formatFitMap(map: FitMap): string {
  const keys = Object.fromEntries(Object.keys(map.keys).sort().map(k => [k, [...map.keys[k]].sort(byJson)]));
  return JSON.stringify({ ...map, keys }, null, 1) + '\n';
}

export function readFitMap(file: string): FitMap {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${file} is not a fitlocale fit map`);
  }
  const v = value as Partial<FitMap> | null;
  if (!v || typeof v !== 'object' || typeof v.version !== 'number' || !v.keys || typeof v.keys !== 'object') throw new Error(`${file} is not a fitlocale fit map`);
  if (v.version !== 1) throw new Error(`${file} is fit map version ${v.version}; this fitlocale reads version 1`);
  return v as FitMap;
}
