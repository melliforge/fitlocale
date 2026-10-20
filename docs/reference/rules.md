---
title: Rules reference
description: Every fitlocale rule, with its severity, when it runs, what it means, an example that triggers it, and how to fix it.
---

# Rules

Every issue comes from one of these rules. Each is measured on the rendered page: nothing is guessed.

**Severity** decides what fails a test, with the `failOn` option (default: `error` only). **Modes** say when a rule runs:
- `source`: the page as it is;
- `pseudo-long`: text made about 40% longer;
- `pseudo-rtl`: the page forced right-to-left.

Issues already present in the source render are not reported in the pseudo modes (the noise rule).

## Overflow

### `overflow/clipped`

**Severity:** error · **Modes:** `pseudo-long`, and pages in a pseudo locale

Text no longer fits its box and the overflow is hidden, so part of it is cut off.

```html
<button style="width:120px;overflow:hidden;white-space:nowrap">Save changes</button>
```

**Fix:** let the box grow with its text (`min-width` instead of `width`), or allow wrapping.

### `overflow/ellipsis`

**Severity:** warning · **Modes:** `pseudo-long`, and pages in a pseudo locale

Text is truncated with an ellipsis or a line clamp that does not happen in the source language.

```html
<div style="width:160px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Account settings</div>
```

**Fix:** give the text room, or show the full text (for example in a tooltip) where truncation is expected.

### `overflow/escapes-box`

**Severity:** error · **Modes:** `pseudo-long`, and pages in a pseudo locale

Text spills outside its box (the overflow is visible), usually over its neighbours.

```html
<div style="width:130px;white-space:nowrap">Billing details</div>
```

**Fix:** let the box grow with its text, or allow wrapping.

### `overflow/overlap`

**Severity:** error · **Modes:** `pseudo-long`, and pages in a pseudo locale

A link, button or input overlaps a neighbouring control, so one of them is hard to click.

```html
<div style="position:relative"><button style="position:absolute;left:0">Delete</button><button style="position:absolute;left:70px">Archive</button></div>
```

**Fix:** lay controls out with flex or grid and a gap, instead of fixed positions.

## Text leaks

### `leak/raw-key`

**Severity:** error · **Modes:** `source`

A translation key is shown instead of translated text: a dotted key path such as `dashboard.welcome.title`, or any key from your `sourceMessages`.

```html
<p>dashboard.welcome.title</p>
```

**Fix:** add the missing message, or fix the key.

### `leak/placeholder`

**Severity:** error · **Modes:** `source`

A placeholder was shown without being filled in: `{count}`, `{{name}}`, `%s`, `%d`, `${x}`.

```html
<p>You have {count} messages</p>
```

**Fix:** pass the value when you render the message.

### `leak/bad-value`

**Severity:** error · **Modes:** `source`

A broken value is shown to users: `undefined`, `NaN`, `null` or `[object Object]`.

```html
<span>Price: undefined</span>
```

**Fix:** load the value before rendering, or show a fallback.

## Locale

### `locale/persistence`

**Severity:** error · **Modes:** `source`, after `useLocale()`

The page language changed back during the test, for example after a navigation that lost the saved locale. It is read from `<html lang>`, or from your `localeProbe`.

**Fix:** keep the locale across navigations (URL prefix, cookie or storage), and update `<html lang>` when it changes.

## Translation

### `i18n/hardcoded` <Badge type="tip" text="next release" />

**Severity:** warning · **Modes:** `source`, on a page in a [pseudo locale](/guides/pseudo-localization-i18next)

Text without pseudo-locale markers did not come from your message files: it is hardcoded, or it is data. Dates, times, emails, URLs, numbers and language names are not reported.

```html
<p>Free shipping on all orders</p>
```

**Fix:** move the text into your message files. Mark data areas (user names, product titles) with `data-fitlocale-ignore`.

### `i18n/concatenated` <Badge type="tip" text="next release" />

**Severity:** warning · **Modes:** `source`, on a page in a pseudo locale

One sentence is built from several separately translated pieces, which breaks word order in other languages. Links and buttons inside a sentence don't count as pieces.

```html
<p><span>⟦You saved ~⟧</span> <span>⟦on this order ~~⟧</span></p>
```

**Fix:** use one message with placeholders, or your library's rich-text component for links inside a sentence.

### `i18n/untranslated` <Badge type="tip" text="next release" />

**Severity:** warning · **Modes:** `source`, in a real locale with `sourceMessages` set

Text is identical to a source-language message (of at least two words), so it was probably left untranslated.

**Fix:** add the translation to that locale's message file.

### `i18n/pseudo-not-loaded` <Badge type="tip" text="next release" />

**Severity:** error · **Modes:** `source`, on a page in a pseudo locale

The page is in a pseudo locale, but no text has pseudo-locale markers: the pseudo-locale messages were not loaded.

**Fix:** generate them with `fitlocale pseudo` and register the locale in your i18n setup like any other language.

## Right-to-left

### `rtl/not-mirrored`

**Severity:** warning · **Modes:** `pseudo-rtl`

An element stayed in place when the page switched to right-to-left; it should usually move to the opposite side. On Chromium, the issue's `fix` names the stylesheet line and the logical property to use.

```html
<div style="position:absolute;left:16px">New</div>
```

**Fix:** use logical properties: `inset-inline-start` instead of `left`, `margin-inline-start` instead of `margin-left`, `text-align: start` instead of `left`.

### `rtl/skipped-already-rtl`

**Severity:** info · **Modes:** `pseudo-rtl`

The page is already right-to-left, so the forced right-to-left check was skipped.

### `rtl/icon-not-mirrored` <Badge type="tip" text="next release" />

**Severity:** warning · **Modes:** `pseudo-rtl`

An arrow, chevron, back or next icon points the same way in right-to-left; it should usually flip. Icons are recognised by their names (class, label, file name). Arrows pointing up or down are never reported.

```html
<a href="/next">Next <svg class="icon-chevron-right">…</svg></a>
```

**Fix:** flip it in right-to-left, for example `[dir="rtl"] .icon-chevron-right { transform: scaleX(-1) }`, or mark it `data-fitlocale-icon="invariant"` if it must not flip.

### `rtl/icon-mirrored` <Badge type="tip" text="next release" />

**Severity:** warning · **Modes:** `pseudo-rtl`

An icon flipped in right-to-left, but media controls, clocks, check marks and logos keep their direction.

**Fix:** exclude it from your right-to-left flip rule.

### `rtl/bidi-order` <Badge type="tip" text="next release" />

**Severity:** warning · **Modes:** `source`, on right-to-left pages

Mixed-direction text is drawn in the wrong order inside Arabic or Hebrew text: `C++` shows as `++C`, `$220` as `220$`, `+1` as `1+`. Each character is measured, so values drawn in order are never reported.

```html
<p dir="rtl">تعلّم C++ اليوم</p>
```

**Fix:** isolate the value with `<bdi>`, or set `dir="auto"` (or `dir="ltr"`) on its element.

### `rtl/missing-dir` <Badge type="tip" text="next release" />

**Severity:** error · **Modes:** `source`, after `useLocale()` with a right-to-left locale

The page is in a right-to-left language, but most of its text is laid out left-to-right.

**Fix:** set `dir="rtl"` on `<html>` for right-to-left locales.

### `rtl/canvas` <Badge type="tip" text="next release" />

**Severity:** info · **Modes:** `pseudo-rtl`, and right-to-left pages

A canvas ignores the page direction: check its chart or drawing by hand. This note never fails a test.

### `rtl/font-fallback` <Badge type="tip" text="next release" />

**Severity:** warning · **Modes:** `source`, on right-to-left pages (Chromium)

Arabic or Hebrew text is drawn in a fallback font, because none of your fonts has these letters. Only the fonts drawing those letters count. A `font-family` is judged only when every font it names (generic families aside) is on the machine running the tests.

**Fix:** add a font with these letters to `font-family`, before the generic family. For example: `font-family: Inter, "Noto Sans Arabic", sans-serif`.

### `rtl/clipped-marks` <Badge type="tip" text="next release" />

**Severity:** warning · **Modes:** `source`, on right-to-left pages

Accent marks or descenders of a one-line right-to-left label are cut off by a tight height or line height.

```html
<div style="height:16px;line-height:1;font-size:18px;overflow:hidden">الخِطَطُ الشَّهْرِيَّةُ</div>
```

**Fix:** give right-to-left text more room: a line-height around 1.6 to 1.8, and no fixed height with `overflow: hidden`.
