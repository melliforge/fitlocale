---
layout: home
titleTemplate: false
title: fitlocale - translation layout testing for Playwright
description: Catch truncated labels, overflowing text, untranslated strings and right-to-left layout bugs in your Playwright tests.
hero:
  name: fitlocale
  text: Catch translation layout bugs before your users do
  tagline: Cut-off German buttons, text spilling out of its box, raw translation keys, layouts that never mirrored in Arabic. Found in the Playwright tests you already have.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: RTL testing guide
      link: /guides/rtl-testing-playwright
features:
  - title: No approved screenshots
    details: Pseudo-long text and forced right-to-left run on your pages as they are. No translations and no baseline images needed to start.
  - title: Built for Arabic and Hebrew
    details: Mirroring, icons that should or should not flip, mixed-direction text drawn in the wrong order, fallback fonts and clipped accent marks.
  - title: Every issue is measured
    details: Each report comes from a deterministic rule on the rendered page, with the element, a boxed screenshot and a suggested fix. No AI guesses.
---

![A fitlocale report: filters and pages in the sidebar, a list of problems with one selected, and a panel with that problem's selector, CSS source and where it was seen](/report.png)

*A report with one problem open: its row is selected in the list, and the panel beside it gives the selector with a Copy button, the CSS line to change (`left: 16px` → `inset-inline-start: 16px`), where it was seen and its screenshots. Press j and k to move between problems.*
