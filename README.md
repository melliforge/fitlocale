# fitlocale

[![Tests](https://github.com/melliforge/localization-layout-tester/actions/workflows/ci.yml/badge.svg)](https://github.com/melliforge/localization-layout-tester/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/fitlocale)](https://www.npmjs.com/package/fitlocale) [![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Docs:** [melliforge.github.io/localization-layout-tester](https://melliforge.github.io/localization-layout-tester/) · Guides: [RTL layout in Playwright](https://melliforge.github.io/localization-layout-tester/guides/rtl-testing-playwright) · [Text truncation in CI](https://melliforge.github.io/localization-layout-tester/guides/text-truncation-ci) · [Pseudo-localization with i18next](https://melliforge.github.io/localization-layout-tester/guides/pseudo-localization-i18next)

Catch layout bugs caused by translation before your users do. These are German labels cut off inside buttons, text spilling out of its box, translation keys showing on screen, the language silently switching back, and right-to-left (Arabic, Hebrew) layouts that never mirrored. fitlocale plugs into the Playwright tests you already have. It needs no approved screenshots and no translations yet, and it uses no AI guesses: every issue comes from a measured rule.

![fitlocale report: each problem boxed on a screenshot of the page, with the rule, the element and a fix](https://melliforge.github.io/localization-layout-tester/report.png)

*The pseudo-long section of a report: every text made about 40% longer, and what no longer fits boxed in red. Leaked keys and placeholders, also visible here, are listed in the report's source section.*

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

Set `localeMessages: 'locales/{locale}.json'` too, and real locales get the overflow and truncation checks: fitlocale puts the source text back wherever it finds a translation, measures again, and reports only what the translation causes. Text it cannot find in your messages is left out, never guessed.

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

## Right-to-left checks

When fitlocale forces a page right-to-left (the `pseudo-rtl` mode), it compares the two renders:
- **mirroring** (`rtl/not-mirrored`): elements that stayed in place;
- **icons** (`rtl/icon-not-mirrored`): arrows, chevrons, back and next icons that still point the same way;
- **icons that should not flip** (`rtl/icon-mirrored`): play, pause, clock, check-mark and logo icons that flipped.

On a page that is right-to-left already, such as your Arabic or Hebrew locale, it checks:
- **text order** (`rtl/bidi-order`): values like `C++`, `+1 555…` or `$220` whose characters are drawn out of order inside Arabic or Hebrew text (`++C`, `220$`). The fix is `<bdi>` or `dir="auto"`;
- **missing direction** (`rtl/missing-dir`): a right-to-left locale whose page is still laid out left-to-right;
- **fallback fonts** (`rtl/font-fallback`): Arabic or Hebrew text drawn in a font you did not choose, because none of your fonts has these letters. Only the fonts drawing the Arabic or Hebrew letters count, and a `font-family` is judged only when every font it names (generic families like `sans-serif` aside) is on this machine: a loaded web font or an installed font;
- **clipped marks** (`rtl/clipped-marks`): accent marks or descenders of a one-line right-to-left label cut off by a tight height or line height.

Each `rtl/not-mirrored` issue also points at the CSS that keeps the element in place, mapped back through source maps when they exist, with the logical property to use instead:

```
fix: In src/styles/badge.css:3 (.badge), replace "left: 16px" with "inset-inline-start: 16px".
source: { url, line, column, selector, property, value, replacement, original: { url, line, column } }
```

Both kinds of page also get an **informational note** for each `<canvas>` (`rtl/canvas`): charts drawn on a canvas ignore the page direction, so check them by hand. These notes never fail a test.

Icons are recognised by their names: class, id, `data-icon`, `data-testid`, file name, SVG `<use>` and Material ligature text, each class name on its own. Descriptions (`aria-label`, `title`, `alt`) and the button or link around them ("Next", "Back") count as the control's name. Arrows pointing up or down are never reported. When a name is ambiguous, tell fitlocale:

```html
<svg class="my-glyph" data-fitlocale-icon="mirror">…</svg>   <!-- or "invariant", or "ignore" -->
```

```ts
test.use({ fitlocale: { icons: { glyph: 'mirror', compass: 'invariant' } } });
```

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
| `localeMessages` | — | Path to each locale's message JSON with `{locale}` (for example `locales/{locale}.json`), for overflow checks in real locales; needs `sourceMessages` |
| `ignore` | `[]` | Selectors to skip (code, `script`, `[data-fitlocale-ignore]` and similar are always skipped) |
| `mirrorIgnore` | logos, `video`, `audio`, `code`, `pre` | Elements that legitimately keep their place in RTL |
| `icons` | `{}` | Your icon names and whether they flip in right-to-left: `'mirror'`, `'invariant'` or `'ignore'` |
| `viewports` | `1280×800` and `390×844` | Viewports to check, or `'current'` |
| `failOn` | `'error'` | Fail the test on `'error'`, on `'warning'` and up, or `'never'` |
| `baseline` | `'fitlocale-baseline.json'` | Accepted issues file, relative to `playwright.config` (see [Baseline](#baseline)), or `false` to fail on every issue |
| `screenshots` | `true` | Save a full-page screenshot when a mode finds issues |
| `devtools` | `true` | Use Chromium DevTools for the fallback-font check and to point mirroring issues at their CSS; skipped on Firefox and WebKit |

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
| `rtl/icon-not-mirrored` | warning | An arrow, chevron, back or next icon points the same way in right-to-left |
| `rtl/icon-mirrored` | warning | A media control, clock, check mark or logo flipped in right-to-left |
| `rtl/bidi-order` | warning | Mixed-direction text (`C++`, `$220`) is drawn in the wrong order in right-to-left text |
| `rtl/missing-dir` | error | A right-to-left locale is laid out left-to-right |
| `rtl/canvas` | info | A canvas ignores the page direction: check it by hand |
| `rtl/font-fallback` | warning | Arabic or Hebrew text is drawn in a fallback font: none of your fonts has these letters |
| `rtl/clipped-marks` | warning | Accent marks or descenders of right-to-left text are cut off by a tight box |
| `i18n/hardcoded` | warning | In a pseudo locale, text without pseudo-locale markers: it is hardcoded (or it is data) |
| `i18n/concatenated` | warning | In a pseudo locale, one sentence built from several separately translated pieces |
| `i18n/untranslated` | warning | In a real locale, text identical to a source-language message |
| `i18n/pseudo-not-loaded` | error | The page is in a pseudo locale, but no text has pseudo-locale markers: the messages were not loaded |
| `i18n/locale-messages-not-matched` | warning | In a real locale, no visible text matches the `localeMessages` files, so overflow was not checked |

## Baseline

Most apps already have some of these issues. So fitlocale fails only on new ones:

1. The first run has no `fitlocale-baseline.json` yet. Issues are reported, but no test fails, and the run prints the command that accepts them.
2. Accept the current issues and commit the file:

   ```bash
   npx fitlocale baseline fitlocale-report/results.json
   ```

3. From then on, only issues missing from the baseline fail. Accepted ones still show in the report, marked "accepted".

Run the command again after fixing issues, to drop them from the file. It accepts whatever that run found, new issues included, so run it on a run you have reviewed. With sharded runs, pass every shard's `results.json`. The baseline file is looked up next to `playwright.config`: if you run the command from another folder, pass `--out` with the path the run's notice prints.

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
      - uses: melliforge/localization-layout-tester@v0
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
- Tested on Chromium, Firefox and WebKit. The fallback-font check and the CSS pointer need Chromium DevTools; on Firefox and WebKit they are skipped. Fonts are judged only where this machine has the fonts you declared, so CI and your users' devices can differ. The font check samples up to 100 right-to-left elements per check, each distinct font and text once.

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
