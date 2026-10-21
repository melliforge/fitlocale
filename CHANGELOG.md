# Changelog

All notable changes to fitlocale are listed here. Versions follow [semantic versioning](https://semver.org/).
Each section becomes the notes of the matching GitHub Release.

## [Unreleased]

### Changed

- The report opens on a summary by rule and by locale × project. It shows each problem once across browsers and viewports, with a readable element label, and offers filters by rule, locale and project, foldable sections, and thumbnails that enlarge. On Excalidraw, the report went from 53,421 px to 6,435 px tall (at a 1280×800 window).
- The report has the docs site's look: a top bar with a search box (free text, or `rule:`, `locale:`, `project:`, `sev:` and `is:` tokens) and a light, dark or system theme toggle, and a sidebar with the filters and a tree of pages and sections.
- Clicking a problem opens a detail panel with its selectors (each with a Copy button), the CSS rule behind `rtl/not-mirrored` with its logical replacement, where the problem was seen, and its screenshots. Keys: j/k move between problems, Enter opens one, Esc closes, / searches, ? lists the keys. A link ending in `#p3` opens problem 3.
- A large report is smaller: the detail panel copies its screenshots from the section's figures when a problem opens, instead of the page carrying them twice. A run of 10,240 issues went from 8.2 MB to 5.1 MB.
- A section with many screenshots (an app with one URL, checked in several browsers and viewports) shows its first 6 thumbnails and a "Show all" control. Filters count only what they leave. Without JavaScript every thumbnail is shown.

### Added

- `name` on issues in `results.json`: the element's accessible name, when it has one. It is read in the order aria-labelledby, aria-label, the `<label>` of an input, alt, title, placeholder.

## [0.4.2] - 2026-10-20

### Changed

- Works on Node 16.17 or newer (was 22) and `@playwright/test` 1.40 or newer (was 1.45), so older projects can install it: npm refused it next to Playwright 1.40 to 1.44. CI now installs the packed package on exactly Node 16.17 and Playwright 1.40, on Chromium, Firefox and WebKit.

### Fixed

Found by running fitlocale on two real apps, Excalidraw and Elk:

- Each viewport is measured once the page has redrawn for it. Apps that draw their phone layout a frame after the resize got false overflow reports at the phone viewport: 80 on Excalidraw.
- The padding of pseudo-long text is split into word-sized runs (`~~~~~~~~ ~~~~`), so it wraps like real text. One long run stuck out of narrow boxes that translations wrap in.
- A control under a bar fixed or stuck to the screen (a bottom navigation, an open menu) is no longer reported as overlapping it.
- Host names such as `m.webtoo.ls` are no longer reported as raw keys: any two-letter ending counts as a country's domain.
- With `localeMessages`, a regional file is laid over its language file when both exist (`ar.json`, then `ar-EG.json`). Reading only the regional file matched nothing when it held just the differences.
- `rtl/clipped-marks` no longer fails on WebKit builds without `OffscreenCanvas` (those of Playwright before 1.45): it draws on an ordinary canvas there.

## [0.4.1] - 2026-10-20

### Fixed

- A web font that never loads no longer adds 3 seconds at every text change: a check waits for fonts once, then goes on. A page with such a font took about 12 seconds per check; it now takes about 3. On WebKit, such a page made the check hang until the test timed out.
- Checks on pages with thousands of links or buttons are much faster: the overlap check compares only controls on the same lines.
- Text left untranslated is matched in linear time: a long paragraph against a message with several placeholders could take seconds.
- The CSS pointer fetches source maps only from the stylesheet's or the page's own origin, without following redirects, and skips maps over 20 MB.

## [0.4.0] - 2026-10-20

### Added

- Open shadow roots and same-origin iframes are checked like the rest of the page. Issues inside them have selectors that work with `page.locator()` (`host >> …`, `iframe >> internal:control=enter-frame >> …`) and boxes placed on the full-page screenshot. Closed shadow roots and cross-origin iframes are skipped.
- Firefox and WebKit are tested in CI next to Chromium. Every check runs there except the fallback-font check and the CSS pointer, which need Chromium DevTools and are skipped.
- Overflow checks in real locales: set `localeMessages: 'locales/{locale}.json'` and a page switched with `useLocale()` gets the truncation and overflow checks, with only the issues its translation causes. A page whose text matches none of those messages gets one `i18n/locale-messages-not-matched` warning.

### Fixed

- With several browser projects, the HTML report shows each project's issues under its own heading and screenshot, and `fitlocale summary` names the project of each row.
- `rtl/clipped-marks` measures accent marks and descenders as they are drawn, so it gives the same verdicts on WebKit, whose canvas misreports their size. On Chromium a borderline verdict can move by a pixel.
- `zh-TW` and `zh-CN` (and other pairs written in different scripts) no longer count as the same language, so text left in Simplified Chinese is reported on a Traditional Chinese page. A `lang` that names only the language (`zh`), or is written with an underscore (`de_DE`), still matches the page.
- Regional language names ("português (Brasil)", "简体中文", "British English"), currency names, units ("5 kB") and ordinals ("19th") are no longer reported as hardcoded text.
- Text inside `display: contents` elements is no longer dropped from text blocks.
- A test id shared by repeated components (a list of cards with one `data-testid`) no longer gives all of them the same selector and issue id, which could hide a new issue behind an accepted one. They now get their DOM path, like a non-unique `id`.
- `baseline: ''` or a directory now gives a clear error, and a baseline file of another version is refused.
- `fitlocale summary` shows each issue once under `--repeat-each`, and marks which issues fail the test. `results.json` issues carry `fails`.
- The GitHub Action, with no local fitlocale, runs the CLI of its own major version (`fitlocale@0` for `@v0`) instead of the latest release.
- Icon names are judged one class name at a time: `chevron float-end` and two-way icons such as `arrow-left-right` are no longer reported, and neither is an avatar whose `alt` holds a name like "Nick West". Descriptions (`aria-label`, `title`, `alt`) now count only as the control's name, and a warning triangle in a "Continue" button is not an arrow.
- Icons turned sideways (a 90° rotation) are no longer judged, `rotate: y 180deg` counts as a flip, and a class added to an SVG root is no longer mistaken for a redrawn icon.
- Values containing emoji are no longer measured for text order, and a value such as `$$5` now appears in messages as written.
- CSS pointers through webpack-style source maps (`webpack://app/./src/x.scss`) and relative `sources` (`../../src/x.scss`) now show readable project paths.
- `rtl/clipped-marks` no longer reports roomy labels inside a CSS `transform: scale()`: the text is measured in the element's own scale. Text clipped by an ancestor of a scaled element is not judged. The 1px tolerance is in the element's own scale too, so a borderline clip gets the same verdict at any scale.

### Changed

- Pages with web components or same-origin iframes can show new issues after upgrading. Accept them with `fitlocale baseline`, or skip a component or frame with `ignore`.
- If your tests use one test id on several elements, their issue ids change once: regenerate the baseline with `npx fitlocale baseline`.

## [0.3.0] - 2026-10-20

### Breaking

- Without a baseline file, `localeCheck()` reports issues but no longer fails tests. Create the file with `npx fitlocale baseline`, or set `baseline: false` for the old behaviour.

### Added

- Integrated pseudo-locale mode. When your app loads messages generated by `fitlocale pseudo` (for example `en-XA`), `localeCheck()` also finds:
  - hardcoded text (`i18n/hardcoded`);
  - sentences glued together from separately translated pieces (`i18n/concatenated`);
  - overflow in the page as your app renders it;
  - pseudo-locale messages that were never loaded (`i18n/pseudo-not-loaded`).
- `i18n/untranslated`: in a real locale, with `sourceMessages` set, text identical to a source-language message is reported.
- `pseudoLocales` option (default `['en-XA', 'ar-XB']`).
- Baseline file (`fitlocale-baseline.json`, `baseline` option): accepted issues stay in the report but no longer fail tests; only new issues do.
- `fitlocale baseline` writes the baseline from one or more `results.json` files (one per shard).
- `fitlocale summary` prints a Markdown summary of the new issues, for CI job summaries.
- GitHub Action (`uses: melliforge/localization-layout-tester@v0.3.0`): writes the summary to the job summary and uploads the HTML report.
- Every issue in `results.json` has a stable `id`, and accepted ones are marked `baselined`.
- Right-to-left checks:
  - `rtl/icon-not-mirrored`: arrows and chevrons that did not flip;
  - `rtl/icon-mirrored`: media, clock, check-mark and logo icons that flipped;
  - `rtl/bidi-order`: mixed-direction text such as `C++` or `$220` drawn out of order in Arabic or Hebrew text;
  - `rtl/missing-dir`: a right-to-left locale laid out left-to-right;
  - `rtl/canvas`: an informational note for each canvas;
  - `rtl/font-fallback`: Arabic or Hebrew text drawn in a fallback font (Chromium DevTools);
  - `rtl/clipped-marks`: accent marks or descenders cut off by a tight box.
- `rtl/not-mirrored` issues point at the CSS declaration responsible (`issue.source`, through source maps when present) and name the logical property to use instead.
- `devtools` option, to turn off the checks that use Chromium DevTools.
- `icons` option and `data-fitlocale-icon` attribute, to say which of your icons flip.

### Changed

- Material icon-font ligatures (`material-icons`, `material-symbols-*`) are no longer checked: their text is an icon name, not words.

### Fixed

- The npm package now includes `CHANGELOG.md`. The 0.2.1 notes said it already did, but it wasn't shipped.

## [0.2.1] - 2026-10-19

### Changed

- Releases are now built and published by GitHub Actions, with npm provenance. On npm you can check that the package was built from this repository's source.

## [0.2.0] - 2026-10-19

### Breaking

- Requires Node 22 or newer. Node 20 reached end of life in April 2026.

### Added

- `FitlocaleTestOptions` type, so `use: { fitlocale }` type-checks in `playwright.config.ts`:
  `defineConfig<FitlocaleTestOptions>({ ... })`.

### Changed

- The package is now built with tsdown instead of tsup, which is no longer maintained. The published files and the API are unchanged.

## [0.1.1] - 2026-10-19

Tagged but not published to npm. Its fix shipped in 0.2.0.

### Fixed

- `require('fitlocale/package.json')` works. It was blocked by the `exports` map.

## [0.1.0] - 2026-10-19

First public release.

### Added

- Playwright add-on: `localeCheck()` tests the page as it is, in pseudo-long text (about 40% longer, with accents) and forced right-to-left. It then puts the page back exactly as it was.
- Checks:
  - text that is cut off, truncated with an ellipsis or line clamp, or spills outside its box;
  - controls that overlap;
  - raw translation keys, unfilled placeholders and broken values (`undefined`, `NaN`) shown to users;
  - the language changing back during a test;
  - layouts that don't mirror in right-to-left.
- Noise rule: anything already present in the source render, such as an ellipsis that is there on purpose, is not reported.
- `useLocale()` with helpers for query parameters, cookies, localStorage and path prefixes.
- Reporter: `results.json` plus an offline HTML report with every problem boxed on a screenshot.
- CLI: `fitlocale pseudo` writes pseudo-locale message files, and `fitlocale report` re-renders a report.
- CommonJS and ESM builds with TypeScript types.

[Unreleased]: https://github.com/melliforge/localization-layout-tester/compare/v0.4.2...HEAD
[0.4.2]: https://github.com/melliforge/localization-layout-tester/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/melliforge/localization-layout-tester/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/melliforge/localization-layout-tester/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/melliforge/localization-layout-tester/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/melliforge/localization-layout-tester/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/melliforge/localization-layout-tester/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/melliforge/localization-layout-tester/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/melliforge/localization-layout-tester/releases/tag/v0.1.0
