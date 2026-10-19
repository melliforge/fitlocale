# fitlocale

Catch layout bugs caused by translation before your users do. These are German labels cut off inside buttons, text spilling out of its box, translation keys showing on screen, the language silently switching back, and right-to-left (Arabic, Hebrew) layouts that never mirrored. fitlocale plugs into the Playwright tests you already have. It needs no approved screenshots and no translations yet, and it uses no AI guesses: every issue comes from a measured rule.

## Install

```bash
npm install -D fitlocale
```

Requires Node 20+ and `@playwright/test` 1.45+.

## Quick start

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [['list'], ['fitlocale/reporter', { outputDir: 'fitlocale-report' }]],
  use: {
    fitlocale: { sourceMessages: 'locales/en.json' },
  },
});
```

In a test, import `test` from `fitlocale/playwright` and call `localeCheck()` once the page is in the state you want to check:

```ts
import { test, expect } from 'fitlocale/playwright';

test('settings page', async ({ page, localeCheck }) => {
  await page.goto('/settings');
  await localeCheck();
});
```

`localeCheck()` tests the page in three ways:
- **source:** the page as it is;
- **pseudo-long:** every visible text about 40% longer, with accents, like `⟦Šéttîñgš ~~~⟧`;
- **pseudo-rtl:** the page forced to right-to-left.

It then puts the page back exactly as it was, so your test can carry on. Problems also present in the source render, such as an ellipsis you designed on purpose, are not reported. Open `fitlocale-report/index.html` for screenshots with each problem boxed. `results.json` beside it is the same data for machines.

## Switching locale

To check a real locale, tell fitlocale how your app switches language, then call `useLocale()`:

```ts
import { test, byCookie } from 'fitlocale/playwright';

test.use({ fitlocale: { setLocale: byCookie('NEXT_LOCALE') } });

test('checkout in German', async ({ page, useLocale, localeCheck }) => {
  await page.goto('/checkout');
  await useLocale('de');
  await page.click('text=Weiter');
  await localeCheck();   // also checks the page is still in German
});
```

| Helper | What it does |
|---|---|
| `byQueryParam(name = 'lang')` | Reloads the current URL with `?lang=de` |
| `byCookie(name)` | Sets a cookie for the current origin, then reloads |
| `byLocalStorage(key)` | Sets a localStorage item, then reloads |
| `byPathPrefix()` | `/en/x` → `/de/x`, or `/x` → `/de/x` |

You can also pass any `async (page, locale) => { … }`.

## Options

| Option | Default | Meaning |
|---|---|---|
| `modes` | `['pseudo-long', 'pseudo-rtl']` | Pseudo modes run while the page shows the source locale |
| `expansion` | `0.4` | Extra length for pseudo-long text |
| `sourceLocale` | `'en'` | Your source language |
| `setLocale` | — | How your app switches language (needed by `useLocale`) |
| `localeProbe` | `<html lang>` | How to read the current locale |
| `sourceMessages` | — | Path to your source message JSON (relative to `playwright.config`), to recognise raw keys |
| `ignore` | `[]` | Selectors to skip (code, `script`, `[data-fitlocale-ignore]` and similar are always skipped) |
| `mirrorIgnore` | logos, `video`, `audio`, `code`, `pre` | Elements that legitimately keep their place in RTL |
| `viewports` | `1280×800` and `390×844` | Viewports to check, or `'current'` |
| `failOn` | `'error'` | Fail the test on `'error'`, on `'warning'` and up, or `'never'` |
| `screenshots` | `true` | Save a full-page screenshot when a mode finds issues |

## Rules

| Rule | Severity | Problem |
|---|---|---|
| `overflow/clipped` | error | Text is cut off: it no longer fits its box and the overflow is hidden |
| `overflow/ellipsis` | warning | Text is truncated with an ellipsis or line clamp that does not happen in the source language |
| `overflow/escapes-box` | error | Text spills outside its box |
| `overflow/overlap` | error | A control overlaps a neighbouring control |
| `leak/raw-key` | error | A translation key is shown instead of translated text |
| `leak/placeholder` | error | A placeholder such as `{count}` was shown without being filled in |
| `leak/bad-value` | error | `undefined`, `NaN`, `null` or `[object Object]` is shown to users |
| `locale/persistence` | error | The page language changed back during the test |
| `rtl/not-mirrored` | warning | An element stayed in place when the page switched to right-to-left |
| `rtl/skipped-already-rtl` | info | The page is already right-to-left, so the mirroring check was skipped |

## CLI

```bash
npx fitlocale pseudo locales/en.json --out locales/en-XA.json   # pseudo-locale message file
npx fitlocale report fitlocale-report/results.json              # re-render index.html
```

## Limitations

- Text inside shadow roots and iframes is not checked yet.
- Chromium only for now: Firefox and WebKit are not tested yet.

## License

MIT
