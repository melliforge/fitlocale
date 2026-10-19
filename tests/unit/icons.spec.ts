import { test, expect } from '@playwright/test';
import { classifyIcon, iconTokens, isRtlLocale } from '../../src/rules/icons';
import { SEVERITY } from '../../src/types';

type Manifest = Record<string, 'mirror' | 'invariant' | 'ignore'>;
const c = (names: string, control = '', manifest: Manifest = {}, attr?: string) =>
  classifyIcon(iconTokens(names), iconTokens(control), manifest, attr);

test('iconTokens splits names into lower-case words', () => {
  expect(iconTokens('arrow_forward_ios')).toEqual(['arrow', 'forward', 'ios']);
  expect(iconTokens('icon-chevron-right', 'Next Page')).toEqual(['icon', 'chevron', 'right', 'next', 'page']);
});

test('directional icons should mirror', () => {
  for (const name of ['icon-chevron-right', 'arrow_back', 'fa fa-arrow-left', 'navigate_next', 'reply']) {
    expect(c(name), name).toBe('mirror');
  }
  expect(c('chevron', 'Next')).toBe('mirror');
});

test('media, clock, check-mark and logo icons are invariant, even with directional words', () => {
  for (const name of ['skip_next', 'fast_forward', 'skip-previous', 'play_arrow', 'icon-clock', 'check', 'logo']) {
    expect(c(name), name).toBe('invariant');
  }
});

test('vertical and ambiguous icons are unknown', () => {
  for (const [name, control] of [['chevron-down', ''], ['arrow_upward', ''], ['expand_more', ''], ['arrow', 'Back to top'],
    ['arrow', ''], ['icon-star', ''], ['chevron', 'Weiter']]) {
    expect(c(name, control), `${name} / ${control}`).toBeNull();
  }
});

test('the manifest and the data-fitlocale-icon attribute override built-in names', () => {
  expect(c('my-glyph', '', { glyph: 'mirror' })).toBe('mirror');
  expect(c('icon-chevron-right', '', { chevron: 'invariant' })).toBe('invariant');
  expect(c('icon-chevron-right', '', {}, 'ignore')).toBe('ignore');
  expect(c('play', '', {}, 'mirror')).toBe('mirror');
});

test('isRtlLocale', () => {
  for (const l of ['ar', 'he-IL', 'fa', 'ar-XB', 'UR']) expect(isRtlLocale(l), l).toBe(true);
  for (const l of ['en', 'de', '']) expect(isRtlLocale(l), l).toBe(false);
});

test('severities of the right-to-left rules', () => {
  expect([SEVERITY['rtl/icon-not-mirrored'], SEVERITY['rtl/icon-mirrored'], SEVERITY['rtl/bidi-order'], SEVERITY['rtl/missing-dir'], SEVERITY['rtl/canvas']])
    .toEqual(['warning', 'warning', 'warning', 'error', 'info']);
});

test('media forward and step icons are not navigation arrows', () => {
  expect(c('fa fa-step-forward', 'Forward')).toBe('invariant');
  expect(c('fa-solid fa-forward-step', 'Forward')).toBe('invariant');
  expect(c('fa fa-forward', 'Forward')).toBeNull();
  expect(c('arrow_forward')).toBe('mirror');
});
