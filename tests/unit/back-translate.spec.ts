import { test, expect } from '@playwright/test';
import { backTranslator } from '../../src/rules/back-translate';
import { flattenEntries } from '../../src/pseudo';

test('exact strings map to their source', () => {
  const bt = backTranslator({ actions: { save: 'Save changes' } }, { actions: { save: 'Änderungen speichern' } });
  expect(bt('Änderungen speichern')).toBe('Save changes');
  expect(bt('  Änderungen   speichern\n')).toBe('  Save changes\n');
  expect(bt('Unbekannt')).toBeNull();
});

test('placeholders carry the rendered value into the source text', () => {
  expect(backTranslator({ a: 'You have {count} messages' }, { a: 'Sie haben {count} Nachrichten' })('Sie haben 3 Nachrichten')).toBe('You have 3 messages');
  expect(backTranslator({ a: 'Hi {{name}}' }, { a: 'Hallo {{name}}' })('Hallo Ana Lu')).toBe('Hi Ana Lu');
  expect(backTranslator({ a: '%1$s of %2$s' }, { a: '%2$s von %1$s' })('B von A')).toBe('A of B');
});

test('a template that is only placeholders never matches', () => {
  expect(backTranslator({ a: '{a} / {b}' }, { a: '{a} / {b}' })('x / y')).toBeNull();
});

const ITEMS = '{n, plural, one {# item} other {# items}}';

test('ICU branches map to the same branch of the source', () => {
  const bt = backTranslator({ a: ITEMS }, { a: '{n, plural, one {# Artikel} other {# Artikel}}' });
  // Both branches match "5 Artikel": the tie goes to the longer source text.
  expect(bt('5 Artikel')).toBe('5 items');
});

test('a plural form missing from the source falls back to other', () => {
  expect(backTranslator({ a: ITEMS }, { a: '{n, plural, one {# plik} few {# pliki} other {# plików}}' })('3 pliki')).toBe('3 items');
  const bt = backTranslator({ file_one: '{{count}} file', file_other: '{{count}} files' }, { file_few: '{{count}} pliki' });
  expect(bt('3 pliki')).toBe('3 files');
});

test('vue-i18n pipe plurals map by position', () => {
  const bt = backTranslator({ a: 'no apples | one apple | {count} apples' }, { a: 'keine Äpfel | ein Apfel | {count} Äpfel' });
  expect(bt('ein Apfel')).toBe('one apple');
  expect(bt('4 Äpfel')).toBe('4 apples');
});

test('fragments split by HTML tags map by position', () => {
  const bt = backTranslator({ a: 'Read the <a href="#">help center</a> first' }, { a: 'Lies zuerst das <a href="#">Hilfecenter</a>' });
  expect(bt('Hilfecenter')).toBe('help center');
  expect(bt('Lies zuerst das ')).toBe('Read the ');
  expect(bt('Lies zuerst das Hilfecenter')).toBeNull();
});

test('entities are decoded', () => {
  expect(backTranslator({ a: 'Terms &amp; conditions' }, { a: 'AGB &amp; Bedingungen' })('AGB & Bedingungen')).toBe('Terms & conditions');
});

test('nested and linked messages are skipped', () => {
  const bt = backTranslator({ a: '$t(a) now', b: '@:a now' }, { a: '$t(a) jetzt', b: '@:a jetzt' });
  expect(bt('x jetzt')).toBeNull();
});

test('ambiguous text maps to the longest source', () => {
  expect(backTranslator({ a: 'Open', b: 'Open file' }, { a: 'Öffnen', b: 'Öffnen' })('Öffnen')).toBe('Open file');
});

test('flattenEntries pairs keys and values in file order', () => {
  expect(flattenEntries({ a: 'x', b: { c: 'y' } })).toEqual([['a', 'x'], ['b.c', 'y']]);
});
