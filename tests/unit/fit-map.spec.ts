import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { buildFitMap, formatFitMap, readFitMap } from '../../src/fit/map';
import type { FitObservation, FitRecord } from '../../src/types';
import { makeCheck, makeRun } from './fixtures';

const STYLE = { fontFamily: 'Inter', fontSize: '14px', lineHeight: '20px' };
const obs = (over: Partial<FitObservation> = {}): FitObservation => ({
  key: 'buttons.save', text: 'Save', slots: {}, lines: 1, oneLine: true, wrapWidth: 100, roomX: 100, roomY: null, maxLines: null,
  style: STYLE, lang: 'en', dir: 'ltr', selector: '#save', ...over,
});
const record = (entries: FitObservation[], width = 1280): FitRecord => ({
  viewport: { width, height: width === 1280 ? 800 : 844 }, entries, fonts: [{ family: 'Inter', weight: '400', style: 'normal', src: 'http://app.test/f/inter.woff2' }],
});
const run = (...fit: FitRecord[]) => makeRun([makeCheck({ fit })]);

test('merges two runs, dropping repeated entries', () => {
  const map = buildFitMap([run(record([obs()])), run(record([obs()]))], 'en');
  expect(map.keys['buttons.save']).toHaveLength(1);
  expect(map.fonts).toHaveLength(1);
});

test('keeps one entry per distinct room, with its viewport', () => {
  const map = buildFitMap([run(record([obs({ roomX: 262 })]), record([obs({ roomX: 180 })], 390))], 'en');
  expect(map.keys['buttons.save'].map(e => [e.vp, e.rx])).toEqual([['1280×800', 262], ['390×844', 180]]);
});

test('shares one style row between entries with the same styles', () => {
  const map = buildFitMap([run(record([obs(), obs({ key: 'a' }), obs({ key: 'b', style: { ...STYLE, fontSize: '16px' } })]))], 'en');
  expect(map.styles).toHaveLength(2);
  expect(map.keys.a[0].s).toBe(map.keys['buttons.save'][0].s);
});

test('rounds sizes to half pixels and omits empty rooms', () => {
  const e = buildFitMap([run(record([obs({ roomX: 99.74, wrapWidth: 120.2, roomY: null })]))], 'en').keys['buttons.save'][0];
  expect(e.rx).toBe(99.5);
  expect(e.wrap).toBe(120);
  expect('ry' in e).toBe(false);
  expect('clamp' in e).toBe(false);
});

test('formats stably: same map, same bytes, whatever the input order', () => {
  const a = obs({ key: 'z' }), b = obs({ key: 'a', roomX: 50 }), c = obs({ key: 'a', roomX: 40 });
  const one = formatFitMap(buildFitMap([run(record([a, b, c]))], 'en'));
  const two = formatFitMap(buildFitMap([run(record([c, a, b]))], 'en'));
  expect(one).toBe(two);
  expect(one.endsWith('\n')).toBe(true);
  expect(Object.keys(JSON.parse(one).keys)).toEqual(['a', 'z']);
});

test('reads its own output; rejects a version 2 map and a non-map file with the file named', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fitlocale-fitmap-'));
  const ok = join(dir, 'fit.json'), v2 = join(dir, 'v2.json'), other = join(dir, 'other.json');
  writeFileSync(ok, formatFitMap(buildFitMap([run(record([obs()]))], 'en')));
  writeFileSync(v2, JSON.stringify({ version: 2, keys: {} }));
  writeFileSync(other, JSON.stringify({ checks: [] }));
  expect(readFitMap(ok).keys['buttons.save']).toHaveLength(1);
  expect(() => readFitMap(v2)).toThrow(`${v2} is fit map version 2; this fitlocale reads version 1`);
  expect(() => readFitMap(other)).toThrow(`${other} is not a fitlocale fit map`);
});
