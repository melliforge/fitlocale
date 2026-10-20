---
title: Getting started with fitlocale
description: Install fitlocale, add the reporter to playwright.config, and check your first page for translation layout bugs in a few minutes.
---

# Getting started

fitlocale plugs into the Playwright tests you already have. It needs no approved screenshots and no translations to start.

## Install

```bash
npm install -D fitlocale
```

It needs Node 22+ and `@playwright/test` 1.45+, and runs on Chromium.

## Add the reporter

In `playwright.config.ts`, add the fitlocale reporter. It writes an HTML report with every problem boxed on a screenshot, and a `results.json` for tools:

```ts
import { defineConfig } from '@playwright/test';
import type { FitlocaleTestOptions } from 'fitlocale/playwright';

export default defineConfig<FitlocaleTestOptions>({
  reporter: [['list'], ['fitlocale/reporter', { outputDir: 'fitlocale-report' }]],
  use: {
    fitlocale: { sourceMessages: 'locales/en.json' },
  },
});
```

`sourceMessages` is optional. With it, fitlocale also recognises your raw translation keys on screen and text left in your source language.

## Check a page

Import `test` from `fitlocale/playwright`, then call `localeCheck()` once the page is in the state you want to check:

```ts
import { test } from 'fitlocale/playwright';

test('settings page', async ({ page, localeCheck }) => {
  await page.goto('/settings');
  await localeCheck();
});
```

`localeCheck()` checks the page three ways, then puts it back exactly as it was:

- **as it is**, for leaked keys, placeholders and broken values;
- **pseudo-long**, every visible text about 40% longer with accents, for text that no longer fits;
- **forced right-to-left**, for layouts and icons that do not mirror.

Open `fitlocale-report/index.html` to see each problem boxed on a screenshot.

## Your first run

The first run reports issues without failing any test, because there is no baseline file yet. When you are ready, accept the current issues and commit the file:

```bash
npx fitlocale baseline fitlocale-report/results.json
```

From then on, only new issues fail.

## Switching locale

To check your real locales, tell fitlocale how your app switches language, then call `useLocale()`:

```ts
import { test, byCookie } from 'fitlocale/playwright';

test.use({ fitlocale: { setLocale: byCookie('NEXT_LOCALE') } });

test('checkout in German', async ({ page, useLocale, localeCheck }) => {
  await page.goto('/checkout');
  await useLocale('de');
  await localeCheck();
});
```

Ready-made helpers: `byQueryParam()`, `byCookie()`, `byLocalStorage()` and `byPathPrefix()`.

Next: the [rules](/reference/rules) fitlocale checks, and every [option](/reference/options).
