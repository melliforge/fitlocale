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

/**
 * The `localeMessages` files to read for `locale`, in merge order: a regional file (`ar-EG`, `pt_BR`) is laid over
 * its language file (`ar`) when both exist, as vue-i18n and i18next fall back from one to the other.
 */
export function localeMessagesFiles(pattern: string, locale: string, baseDir: string): string[] {
  const found = localeMessagesFile(pattern, locale, baseDir);
  const language = resolve(baseDir, pattern.replaceAll('{locale}', locale.split(/[-_]/)[0]));
  return language !== found && existsSync(language) ? [language, found] : [found];
}

/** `over` laid on `base`: nested messages are merged, and a message in `over` replaces the one in `base`. */
function layer(base: Messages, over: Messages): Messages {
  const merged: Messages = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const under = merged[key];
    merged[key] = typeof value === 'object' && value !== null && typeof under === 'object' && under !== null
      ? layer(under as Messages, value as Messages)
      : value;
  }
  return merged;
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
  const localeFiles = localeMessagesFiles(options.localeMessages!, locale, baseDir);
  const id = [sourceFile, ...localeFiles].join('\n');
  if (!translators.has(id)) {
    const messages = localeFiles.map(file => readMessages(file, 'localeMessages')).reduce(layer);
    translators.set(id, backTranslator(readMessages(sourceFile, 'sourceMessages'), messages));
  }
  return translators.get(id)!;
}
