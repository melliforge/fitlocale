# Changelog

All notable changes to fitlocale are listed here. Versions follow [semantic versioning](https://semver.org/).
Each section becomes the notes of the matching GitHub Release.

## [Unreleased]

### Added

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

[Unreleased]: https://github.com/melliforge/localization-layout-tester/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/melliforge/localization-layout-tester/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/melliforge/localization-layout-tester/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/melliforge/localization-layout-tester/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/melliforge/localization-layout-tester/releases/tag/v0.1.0
