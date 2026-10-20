import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { backTranslatorFor, localeMessagesFile } from '../../src/messages';

const tmp = (files: Record<string, string> = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'fitlocale-locale-msgs-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
};

test('the locale file is found as given, with an underscore, then by language', () => {
  const dir = tmp({ 'de-CH.json': '{}', 'pt_BR.json': '{}', 'fr.json': '{}' });
  expect(localeMessagesFile('{locale}.json', 'de-CH', dir)).toBe(join(dir, 'de-CH.json'));
  expect(localeMessagesFile('{locale}.json', 'pt-BR', dir)).toBe(join(dir, 'pt_BR.json'));
  expect(localeMessagesFile('{locale}.json', 'fr-CA', dir)).toBe(join(dir, 'fr.json'));
});

test('a missing locale file names every path tried', () => {
  const dir = tmp();
  let message = '';
  try { localeMessagesFile('{locale}.json', 'it-CH', dir); } catch (err) { message = (err as Error).message; }
  expect(message).toMatch(/^fitlocale: no localeMessages file for "it-CH"/);
  for (const name of ['it-CH.json', 'it_CH.json', 'it.json']) expect(message).toContain(join(dir, name));
});

test('a pattern without {locale} is refused', () => {
  expect(() => localeMessagesFile('locales/de.json', 'de', tmp())).toThrow(/^fitlocale: .*\{locale\}/);
});

test('localeMessages without sourceMessages is refused', () => {
  expect(() => backTranslatorFor({ localeMessages: '{locale}.json' }, 'de', tmp())).toThrow(
    'fitlocale: localeMessages needs sourceMessages too: each translation is mapped back to the source text with the same key.',
  );
});

test('invalid locale JSON gives a fitlocale error', () => {
  const dir = tmp({ 'en.json': '{}', 'de.json': '{"a": ' });
  expect(() => backTranslatorFor({ sourceMessages: 'en.json', localeMessages: '{locale}.json' }, 'de', dir))
    .toThrow(/^fitlocale: localeMessages file .*de\.json is not valid JSON/);
});

test('backTranslatorFor maps through the two files', () => {
  const dir = tmp({ 'en.json': '{"a":"Save"}', 'de.json': '{"a":"Speichern"}' });
  expect(backTranslatorFor({ sourceMessages: 'en.json', localeMessages: '{locale}.json' }, 'de', dir)('Speichern')).toBe('Save');
});
