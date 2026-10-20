---
title: How to test RTL layout in Playwright
description: Test right-to-left (Arabic, Hebrew) layouts in Playwright - mirroring, icons, mixed-direction text, fonts and clipped marks - with fitlocale.
---

# How to test RTL layout in Playwright

Right-to-left support is more than `dir="rtl"`. When a page switches to Arabic or Hebrew:
- the layout must mirror, but only selectively;
- arrows must flip, but play buttons and clocks must not;
- prices, product codes and phone numbers inside Arabic sentences must keep their order;
- Arabic letters need a font that has them, and room for their accent marks.

Most of these bugs are invisible to someone who doesn't read the language. fitlocale finds them in the Playwright tests you already have, without approved screenshots.

## Two ways to test

| | Forced right-to-left | Your real Arabic or Hebrew locale |
|---|---|---|
| Needs translations | No | Yes |
| How | `localeCheck()` on your source pages | `useLocale('ar')`, then `localeCheck()` |
| Finds | Layouts and icons that don't mirror | Text drawn in the wrong order, missing `dir`, fallback fonts, clipped marks |

Both also note every `<canvas>` (charts, maps), because canvas drawings ignore the page direction.

Start with forced right-to-left: it works today, even before you have any translation.

## Set up

Install fitlocale and add its reporter, as in [Getting started](/guide/getting-started). A full `playwright.config.ts`:

<<< @/../examples/playwright.config.ts

## Write the tests

<<< @/../examples/rtl.spec.ts#guide

The first test checks the page as your source language shows it, then forces it to right-to-left and compares. The second switches the app to Arabic the way a user would: `setLocale` says how your app switches language. Ready-made helpers are `byQueryParam()`, `byCookie()`, `byLocalStorage()` and `byPathPrefix()`.

Open `fitlocale-report/index.html` after the run: every problem is boxed on a screenshot of the page.

## What each problem means

### Elements that did not mirror

`rtl/not-mirrored` means an element kept its position when the page switched to right-to-left: a badge pinned with `left: 16px`, a sidebar floated left, a button pushed right with `margin-left: auto`. Full-width and centred elements are never reported.

On Chromium, the issue points at the exact CSS line, through your source maps when they exist, and gives the logical property to use instead:

```
In src/styles/badge.css:3 (.badge), replace "left: 16px" with "inset-inline-start: 16px".
```

| Physical (breaks in RTL) | Logical (mirrors itself) |
|---|---|
| `left` / `right` | `inset-inline-start` / `inset-inline-end` |
| `margin-left` / `margin-right` | `margin-inline-start` / `margin-inline-end` |
| `padding-left` / `padding-right` | `padding-inline-start` / `padding-inline-end` |
| `text-align: left` | `text-align: start` |
| `float: left` | `float: inline-start` |

### Icons that should or should not flip

`rtl/icon-not-mirrored` means an arrow, chevron, back or next icon still points the same way. In right-to-left, "next" points left. `rtl/icon-mirrored` is the opposite mistake: a play button, clock, check mark or logo that flipped.

fitlocale recognises icons by their names: class, id, `data-icon`, `data-testid`, file name, SVG `<use>`, and Material ligature text, each class name on its own (`chevron float-end` is not a right chevron). Descriptions (`aria-label`, `title`, `alt`, SVG `<title>`) and the button around the icon ("Next", "Back") count as the control's name. Arrows that point up or down are never reported. When a name says nothing, tell it:

```html
<svg class="my-glyph" data-fitlocale-icon="mirror">…</svg>   <!-- or "invariant", or "ignore" -->
```

Or name your own icons once, for every test, with the [`icons` option](/reference/options#icons).

### Text drawn in the wrong order

Inside Arabic or Hebrew text, a value written left to right can be drawn out of order. `C++` appears as `++C`, `+1 555 0100` loses its `+` to the other side, and a price written `$220` appears as `220$`. `rtl/bidi-order` measures each character, so it reports only values that really are drawn out of order, and says how they look:

```
Mixed-direction text is shown in the wrong order: "C++" appears as "++C".
```

The fix is to isolate the value, so it keeps its own direction:

```html
<p>تعلّم <bdi>C++</bdi> اليوم</p>
<p>السعر: <span dir="ltr">$220</span></p>
```

Numbers that Arabic readers read correctly right to left, such as `50%`, ranges and dates, are not reported.

### Missing direction

`rtl/missing-dir` means the page is in a right-to-left locale but most of its text is laid out left to right: the app forgot `dir="rtl"`. It counts a `dir` set on your app's wrapper element, not only on `<html>`.

### Fonts and accent marks

Latin fonts usually have no Arabic or Hebrew letters, so the browser draws them in a fallback font. `rtl/font-fallback` reports text where none of your fonts has these letters. Add one, before the generic family:

```css
body { font-family: Inter, "Noto Sans Arabic", sans-serif; }
```

The check runs on Chromium. To avoid false alarms, a font stack is judged only when every font it names is installed on the machine running the tests, or loaded as a web font.

Arabic also needs more height than Latin text for its accent marks. `rtl/clipped-marks` reports one-line labels whose marks are cut off by a fixed height or a tight line-height. Use a line-height around 1.6 to 1.8, and avoid fixed heights with `overflow: hidden`.

## In CI

The first run reports issues without failing, because there is no baseline yet. Accept the current issues with `npx fitlocale baseline fitlocale-report/results.json`, commit the file, and from then on only new issues fail. Most right-to-left rules are warnings, so set `failOn: 'warning'` to fail the build on them; `rtl/missing-dir` is an error and fails it already.

The [GitHub Action](/reference/github-action) adds a table of new issues to each run's summary.

## Next

- Every [rule](/reference/rules), with examples and fixes.
- Every [option](/reference/options).
