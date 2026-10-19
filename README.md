# fitlocale

[![Tests](https://github.com/melliforge/localization-layout-tester/actions/workflows/ci.yml/badge.svg)](https://github.com/melliforge/localization-layout-tester/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/fitlocale)](https://www.npmjs.com/package/fitlocale) [![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Catch layout bugs caused by translation before your users do. These are German labels cut off inside buttons, text spilling out of its box, translation keys showing on screen, the language silently switching back, and right-to-left (Arabic, Hebrew) layouts that never mirrored. fitlocale plugs into the Playwright tests you already have. It needs no approved screenshots and no translations yet, and it uses no AI guesses: every issue comes from a measured rule.

## Install

```bash
npm install -D fitlocale
```

Requires Node 22+ and `@playwright/test` 1.45+.

## Quick start

`playwright.config.ts`:

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

In a real locale, set `sourceMessages` and fitlocale also reports text that is identical to a source-language message (`i18n/untranslated`), such as an English sentence left in the German messages.

## Integrated pseudo-locale mode

The pseudo modes above rewrite the page's text in the browser. For a deeper check, let your app load pseudo-locale messages itself:

1. Generate them from your source messages:

   ```bash
   npx fitlocale pseudo locales/en.json --out locales/en-XA.json
   ```

2. Register `en-XA` in your i18n setup like any other language.
3. Switch to it in a test:

   ```ts
   test('settings page in pseudo locale', async ({ page, useLocale, localeCheck }) => {
     await page.goto('/settings');
     await useLocale('en-XA');
     await localeCheck();
   });
   ```

Every translated string now carries `⟦…⟧` markers, so fitlocale also finds:
- **hardcoded text** (`i18n/hardcoded`): visible text without markers never went through your message files;
- **sentences glued together** (`i18n/concatenated`): one sentence made of several separately translated pieces, which breaks word order in other languages;
- **real overflow**: the page as your app renders it, compared with the same page with markers and padding removed.

Dates, times, relative times ("3 hours ago"), emails, URLs, numbers, icon-font ligatures and language names (`<a lang="de">Deutsch</a>`) are not reported as hardcoded. If no text on the page has markers at all, fitlocale reports one `i18n/pseudo-not-loaded` error instead: the pseudo-locale messages were not loaded. Data shown from your database (user names, product titles) has no markers either: mark those areas with `data-fitlocale-ignore` or the `ignore` option. These rules are warnings; set `failOn: 'warning'` to fail the build on them.

A page whose `<html lang>` is a pseudo locale gets these checks even without `useLocale()`. Pseudo locales are `en-XA` and `ar-XB` by default (the `pseudoLocales` option).

## Options

| Option | Default | Meaning |
|---|---|---|
| `modes` | `['pseudo-long', 'pseudo-rtl']` | Pseudo modes run while the page shows the source locale |
| `expansion` | `0.4` | Extra length for pseudo-long text |
| `sourceLocale` | `'en'` | Your source language |
| `pseudoLocales` | `['en-XA', 'ar-XB']` | Locales whose messages come from `fitlocale pseudo`; pages in them get the integrated checks |
| `setLocale` | — | How your app switches language (needed by `useLocale`) |
| `localeProbe` | `<html lang>` | How to read the current locale |
| `sourceMessages` | — | Path to your source message JSON (relative to `playwright.config`), to recognise raw keys and untranslated text |
| `ignore` | `[]` | Selectors to skip (code, `script`, `[data-fitlocale-ignore]` and similar are always skipped) |
| `mirrorIgnore` | logos, `video`, `audio`, `code`, `pre` | Elements that legitimately keep their place in RTL |
| `viewports` | `1280×800` and `390×844` | Viewports to check, or `'current'` |
| `failOn` | `'error'` | Fail the test on `'error'`, on `'warning'` and up, or `'never'` |
| `baseline` | `'fitlocale-baseline.json'` | Accepted issues file, relative to `playwright.config` (see [Baseline](#baseline)), or `false` to fail on every issue |
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
| `i18n/hardcoded` | warning | In a pseudo locale, text without pseudo-locale markers: it is hardcoded (or it is data) |
| `i18n/concatenated` | warning | In a pseudo locale, one sentence built from several separately translated pieces |
| `i18n/untranslated` | warning | In a real locale, text identical to a source-language message |
| `i18n/pseudo-not-loaded` | error | The page is in a pseudo locale, but no text has pseudo-locale markers: the messages were not loaded |

## Baseline

Most apps already have some of these issues. So fitlocale fails only on new ones:

1. The first run has no `fitlocale-baseline.json` yet. Issues are reported, but no test fails, and the run prints the command that accepts them.
2. Accept the current issues and commit the file:

   ```bash
   npx fitlocale baseline fitlocale-report/results.json
   ```

3. From then on, only issues missing from the baseline fail. Accepted ones still show in the report, marked "accepted".

Run the command again after fixing issues, to drop them from the file. With sharded runs, pass every shard's `results.json`. The baseline file is looked up next to `playwright.config`: if you run the command from another folder, pass `--out` with the path the run's notice prints.

Each issue is identified by its test, the check's position in that test, the rule, the mode, the locale, the viewport and the element's selector. Its text and the URL are not part of it. Give key elements a test id, so their selector survives markup changes. Set `baseline: false` to fail on every issue instead.

## GitHub Actions

Run your tests as usual, then add the fitlocale step. It writes a table of new issues to the job summary and uploads the HTML report as an artifact:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
      - uses: melliforge/localization-layout-tester@v0.3.0
        if: always()
```

| Input | Default | Meaning |
|---|---|---|
| `report-dir` | `fitlocale-report` | The reporter's `outputDir` |
| `artifact-name` | `fitlocale-report` | Name of the uploaded report |
| `max-rows` | `50` | Most issues listed in the job summary |
| `fitlocale-command` | your `node_modules/.bin/fitlocale` | Command that runs the fitlocale CLI |

The step never fails the job. Your test step already did, if there were new issues. In a matrix or with shards, give each job its own `artifact-name` (for example `fitlocale-report-${{ matrix.shardIndex }}`): an artifact name can be used once per workflow run.

## CLI

```bash
npx fitlocale pseudo locales/en.json --out locales/en-XA.json   # pseudo-locale message file
npx fitlocale report fitlocale-report/results.json              # re-render index.html
npx fitlocale baseline fitlocale-report/results.json            # accept the current issues
npx fitlocale summary fitlocale-report/results.json             # Markdown summary, for CI
```

## Limitations

- Text inside shadow roots and iframes is not checked yet.
- Chromium only for now: Firefox and WebKit are not tested yet.

## Releasing

1. Add the changes under a new `## [x.y.z] - date` heading in `CHANGELOG.md`.
2. Run `npm version patch` (or `minor` / `major`). It bumps `package.json`, then commits and tags `vx.y.z`.
3. Run `git push --follow-tags`.

The [Release workflow](.github/workflows/release.yml) then:
- tests the tagged commit;
- stages it on npm with trusted publishing and provenance;
- creates the GitHub Release, using the changelog section as its notes and attaching the package.

The new version goes live on npm once a maintainer approves the staged release on npmjs.com (**Staged Packages → Approve**, with 2FA).

## License

MIT
