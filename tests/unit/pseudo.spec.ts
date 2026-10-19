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

test('keeps surrounding whitespace outside the markers', () => {
  expect(pseudoLong('\n  Save changes\n')).toBe('\n  ⟦Šávé çháñgéš ~~~~⟧\n');
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

test('keeps i18next nesting, vue-i18n linked messages and HTML entities', () => {
  expect(pseudoLong('See $t(common.more)')).toBe('⟦Šéé $t(common.more) ~⟧');
  expect(pseudoLong('$t(a, {"count": 2}) left')).toContain('$t(a, {"count": 2}) léft');
  expect(pseudoLong('Go to @:nav.home')).toBe('⟦Gö tö @:nav.home ~~⟧');
  expect(pseudoLong('@.lower:common.save now')).toContain('@.lower:common.save ñöw');
  expect(pseudoLong('@:(nav.home) page')).toContain('@:(nav.home) págé');
  expect(pseudoLong('Terms &amp; conditions')).toContain('&amp;');
  expect(pseudoLong('10&nbsp;items')).toContain('&nbsp;');
  expect(pseudoLong('Copy&#123; &#x1F600;')).toContain('&#123; &#x1F600;');
});
