import i18next from 'i18next';
import en from './locales/en.json';
// Generated with: npx fitlocale pseudo locales/en.json --out locales/en-XA.json
import enXA from './locales/en-XA.json';

export async function setupI18n(lng: string) {
  await i18next.init({
    lng,
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      'en-XA': { translation: enXA }, // the pseudo locale, registered like any other language
    },
  });
  // Keep <html lang> in step, so tests (and screen readers) know the page language.
  document.documentElement.lang = i18next.language;
  return i18next;
}
