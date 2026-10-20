import { test, expect } from '@playwright/test';
import { fallbackFonts, isGeneric, parseFontFamily } from '../../src/rules/fonts';

const font = (familyName: string, isCustomFont: boolean, glyphCount: number) => ({ familyName, isCustomFont, glyphCount });

test('parseFontFamily unquotes and trims', () => {
  expect(parseFontFamily('"Noto Sans", Inter,  sans-serif')).toEqual(['Noto Sans', 'Inter', 'sans-serif']);
  expect(parseFontFamily("'Segoe UI', Tahoma")).toEqual(['Segoe UI', 'Tahoma']);
});

test('generic families', () => {
  for (const f of ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif', 'ui-rounded']) expect(isGeneric(f), f).toBe(true);
  expect(isGeneric('Inter')).toBe(false);
});

test('Arabic drawn by a font you did not declare, while your font is available, is a fallback', () => {
  expect(fallbackFonts(['Inter', 'sans-serif'], [font('Geeza Pro', false, 8), font('Inter', true, 7)], new Set(['inter']))).toEqual(['Geeza Pro']);
});

test('a declared font this machine does not have is not judged', () => {
  expect(fallbackFonts(['Inter', 'sans-serif'], [font('Geeza Pro', false, 8), font('Helvetica', false, 7)], new Set())).toEqual([]);
});

test('a stack of generic families only is not judged', () => {
  expect(fallbackFonts(['system-ui'], [font('Geeza Pro', false, 8)], new Set(['system-ui']))).toEqual([]);
});

test('emoji and symbol fonts are not fallbacks', () => {
  expect(fallbackFonts(['Inter'], [font('Apple Color Emoji', false, 1), font('Noto Sans Symbols', false, 1), font('Inter', true, 5)], new Set(['inter'])))
    .toEqual([]);
});

test('a declared font that draws everything is fine', () => {
  expect(fallbackFonts(['Noto Sans Arabic', 'sans-serif'], [font('Noto Sans Arabic', false, 12)], new Set(['noto sans arabic']))).toEqual([]);
});

test('a stack is judged only when every named font is available here', () => {
  const bootstrap = parseFontFamily('system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif');
  expect(fallbackFonts(bootstrap, [font('Geeza Pro', false, 9)], new Set(['helvetica neue', 'arial']))).toEqual([]);
});

test('only fonts drawing the right-to-left letters count, and a declared one is fine', () => {
  expect(fallbackFonts(['Arial', 'sans-serif'], [font('Arial', false, 13)], new Set(['arial']))).toEqual([]);
  expect(fallbackFonts(['Geeza Pro', 'sans-serif'], [font('Geeza Pro', false, 9)], new Set(['geeza pro']))).toEqual([]);
});
