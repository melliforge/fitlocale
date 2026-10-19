import type { SetLocale } from './options';

const LOCALE_SEGMENT = /^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$/;

/** Reload the current URL with `?<name>=<locale>`. */
export function byQueryParam(name = 'lang'): SetLocale {
  return async (page, locale) => {
    const url = new URL(page.url());
    url.searchParams.set(name, locale);
    await page.goto(url.toString());
  };
}

/** Set a cookie for the current origin, then reload. */
export function byCookie(name: string): SetLocale {
  return async (page, locale) => {
    await page.context().addCookies([{ name, value: locale, url: new URL(page.url()).origin }]);
    await page.reload();
  };
}

/** Set a localStorage item, then reload. */
export function byLocalStorage(key: string): SetLocale {
  return async (page, locale) => {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, locale] as const);
    await page.reload();
  };
}

/** Replace the first path segment when it looks like a locale (`/en/x` → `/de/x`), otherwise prefix it (`/x` → `/de/x`). */
export function byPathPrefix(): SetLocale {
  return async (page, locale) => {
    const url = new URL(page.url());
    const segments = url.pathname.split('/');
    if (LOCALE_SEGMENT.test(segments[1] ?? '')) segments[1] = locale;
    else segments.splice(1, 0, locale);
    url.pathname = segments.join('/');
    await page.goto(url.toString());
  };
}
