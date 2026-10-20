---
title: Catch text truncation and overflow in CI
description: Find labels cut off, text spilling out of its box and overlapping buttons before translations arrive, in Playwright and GitHub Actions.
---

# Catch text truncation and overflow in CI

::: tip Next release
Parts of this page arrive in the next fitlocale release on npm (after 0.2.1). They are on `main` today.
:::

German and Finnish run 30 to 40% longer than English. A button that fits "Save changes" cuts off "Änderungen speichern", and a tab label that fits "Billing" spills over its neighbour in Finnish. These bugs usually surface after the translations ship, when nobody on the team reads the language that broke.

fitlocale finds them before any translation exists, in the Playwright tests you already have, and fails the pull request that introduces them.

## How it works

`localeCheck()` rewrites every visible text on the page into a longer, accented version, about 40% longer:

```
Save changes   →   ⟦Šávé çháñgéš ~~~~⟧
```

Then it measures every element with text:
- **`overflow/clipped`**: text that no longer fits and is cut off by `overflow: hidden`;
- **`overflow/ellipsis`**: text newly truncated with an ellipsis or a line clamp;
- **`overflow/escapes-box`**: text spilling outside its box;
- **`overflow/overlap`**: buttons, links or inputs that now overlap.

It then puts the page back exactly as it was, so your test can carry on.

Problems that already exist in your source language are left out. A title truncated on purpose with an ellipsis in English is not reported when it is truncated in the longer text too. So a report only lists what translation will break.

## Write the test

Add the reporter to `playwright.config.ts`, as in [Getting started](/guide/getting-started), then call `localeCheck()` on the pages you care about:

<<< @/../examples/truncation.spec.ts#guide

On the demo app, this finds a save button that cuts off its label, a tab label that spills out, and two toolbar buttons that overlap. The ellipsis on the long page title is left out, because it is there in English too.

## Narrow screens

Text that fits on a laptop often breaks on a phone. By default every check runs at 1280 px and 390 px wide, then restores the window size. Choose your own widths with the [`viewports` option](/reference/options#viewports):

```ts
test.use({ fitlocale: { viewports: [{ width: 1440, height: 900 }, { width: 360, height: 780 }] } });
```

For languages that run longer than German, raise [`expansion`](/reference/options#expansion), for example to `0.6`.

## An app that already has issues

The first run reports everything it finds, but fails no test: there is no baseline file yet. Accept the current issues, then commit the file:

```bash
npx fitlocale baseline fitlocale-report/results.json
git add fitlocale-baseline.json
```

From then on, only new issues fail. Accepted ones stay in the report, marked "accepted". Run the command again after you fix some, to drop them from the file.

## In GitHub Actions

Run your tests, then add the fitlocale step with `if: always()`, so it reports when the tests fail too:

<<< @/../examples/github-workflow.yml

Each run then shows a table of new issues in its summary, with the full HTML report as a downloadable artifact. In a matrix or with shards, give each job its own `artifact-name`.

## What fails the build

Overflow issues are errors, and ellipsis truncation is a warning. By default only errors fail a test. Set [`failOn`](/reference/options#failon) to `'warning'` to fail on truncation too, or to `'never'` to report only.

## Next

- [How to test RTL layout in Playwright](/guides/rtl-testing-playwright): the same idea for Arabic and Hebrew.
- Every [rule](/reference/rules) and [option](/reference/options).
