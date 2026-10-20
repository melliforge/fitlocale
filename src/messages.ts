import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FitlocaleOptions } from './options';
import type { Messages } from './pseudo';
import { backTranslator, type BackTranslator } from './rules/back-translate';

const files = new Map<string, Messages>();

/** Parse a message JSON file (an absolute path), once per run; errors name the option that points at it. */
export function readMessages(file: string, option: 'sourceMessages' | 'localeMessages'): Messages {
  if (!files.has(file)) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch (err) {
      throw new Error(`fitlocale: cannot read ${option} file ${file} (${(err as NodeJS.ErrnoException).code ?? (err as Error).message})`, { cause: err });
    }
    try {
      files.set(file, JSON.parse(text) as Messages);
    } catch (err) {
      throw new Error(`fitlocale: ${option} file ${file} is not valid JSON: ${(err as Error).message}`, { cause: err });
    }
  }
  return files.get(file)!;
}

/** The `localeMessages` file for `locale`: as given (`de-CH`), with an underscore (`de_CH`), then the language alone (`de`). */
export function localeMessagesFile(pattern: string, locale: string, baseDir: string): string {
  if (!pattern.includes('{locale}')) {
    throw new Error(`fitlocale: localeMessages must contain {locale} where the locale code goes, for example 'locales/{locale}.json' (got '${pattern}').`);
  }
  const names = [...new Set([locale, locale.replace(/-/g, '_'), locale.split(/[-_]/)[0]])];
  const tried = names.map(name => resolve(baseDir, pattern.replaceAll('{locale}', name)));
  const found = tried.find(file => existsSync(file));
  if (!found) throw new Error(`fitlocale: no localeMessages file for "${locale}"; tried ${tried.join(', ')}`);
  return found;
}

const translators = new Map<string, BackTranslator>();

/** A back-translator from `locale`'s messages to the source messages, built once per pair of files. */
export function backTranslatorFor(
  options: Pick<FitlocaleOptions, 'sourceMessages' | 'localeMessages'>, locale: string, baseDir: string,
): BackTranslator {
  if (!options.sourceMessages) {
    throw new Error('fitlocale: localeMessages needs sourceMessages too: each translation is mapped back to the source text with the same key.');
  }
  const sourceFile = resolve(baseDir, options.sourceMessages);
  const localeFile = localeMessagesFile(options.localeMessages!, locale, baseDir);
  const id = `${sourceFile}\n${localeFile}`;
  if (!translators.has(id)) {
    translators.set(id, backTranslator(readMessages(sourceFile, 'sourceMessages'), readMessages(localeFile, 'localeMessages')));
  }
  return translators.get(id)!;
}
