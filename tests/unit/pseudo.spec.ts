import { test, expect } from '@playwright/test';
import { pseudoLong, pseudoMessages, flattenKeys } from '../../src/pseudo';

test('expands and accents plain text', () => {
  expect(pseudoLong('Settings')).toBe('⟦Šéttîñgš ~~~⟧');
  expect(pseudoLong('Settings', { expansion: 1 })).toBe('⟦Šéttîñgš ~~~~~~~⟧');
});

test('keeps placeholders and tags', () => {
  expect(pseudoLong('Hello {name}')).toBe('⟦Héllö {name} ~~⟧');
  expect(pseudoLong('%s files')).toBe('⟦%s fîléš ~~⟧');
  expect(pseudoLong('Click <b>here</b>')).toBe('⟦Çlîçk <b>héré</b> ~~~⟧');
  expect(pseudoLong('Hi {{user.name}}')).toContain('{{user.name}}');
});

test('keeps ICU structure, accents branch text', () => {
  const out = pseudoLong('{count, plural, one {# item} other {# items}}');
  expect(out.startsWith('⟦{count, plural, one {# îtém} other {# îtémš}}')).toBe(true);
  expect(out.endsWith('⟧')).toBe(true);
});

test('leaves empty and whitespace strings alone', () => {
  expect(pseudoLong('')).toBe('');
  expect(pseudoLong('   ')).toBe('   ');
});

test('transforms nested message files and flattens keys', () => {
  const m = { nav: { home: 'Home' }, title: 'Settings' };
  expect(pseudoMessages(m)).toEqual({ nav: { home: pseudoLong('Home') }, title: '⟦Šéttîñgš ~~~⟧' });
  expect(flattenKeys(m).sort()).toEqual(['nav.home', 'title']);
});
