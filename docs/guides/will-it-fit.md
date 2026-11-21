---
title: Check translations before they merge
description: Will it fit? checks a pull request that only changes locale files, in about a second, without building or running your app.
---

# Check translations before they merge

A translator opens a pull request that changes `locales/de.json`. Nobody on the team reads German, and nobody wants to build the app to look at it. Two weeks later, a user reports that the "Save" button says "Änderungen speich".

**Will it fit?** answers before the merge. It takes about a second, and the app doesn't run:

```text
fitlocale fit: de: checked 41 of 44 changed keys; 1 won't fit
fitlocale fit: de: settings.save needs 148 px, has 120 px (390×844, #save): "Änderungen speichern"
```

It works in two steps. Your normal Playwright tests record a **fit map**: for each message on screen, the box it sits in, its font, and the edge that would stop a longer text. Then `fitlocale fit` measures each changed translation in that box, in a blank browser page.

## 1. Record the fit map

Turn on [`fitMap`](/reference/options#fitmap) where you already set `sourceMessages`:

```ts
// playwright.config.ts
use: {
  fitlocale: { sourceMessages: 'locales/en.json', fitMap: true },
},
```

Run your tests as usual. Every `check()` on a page in your source language adds a `fit` record to `results.json` (about 200 bytes per message and viewport, so you may want it only in the runs that record the map). Then build the map and commit it next to your baseline:

```bash
npx playwright test
npx fitlocale fitmap fitlocale-report/results.json   # writes fitlocale-fit.json
```

Record it again when the UI changes. A box that moved or shrank is only known after a new recording.

## 2. Check translation pull requests

The check needs your repository, Node, and Playwright's Chromium. It doesn't need your app's build or a server:

<<< @/../examples/github-workflow-fit.yml{yaml}

`--changed-from` checks only the keys whose text changed. `--fonts public` points at the folder your app serves its font files from, so the text is measured in your own font. A font the map recorded with a public URL loads from that URL. A font `fit` can't load (the usual Google Fonts `<link>` hides its `@font-face` rules from the recorder) is a warning, and the keys measured without it are marked. See [`fitlocale fit`](/reference/cli#fitlocale-fit) for every option.

## What the answers mean

- **won't fit**: the text needs more room than its box has. This fails the job.
- **grows**: the text takes more lines than the English one, and the layout moves. Look at it if that screen is tight.
- **English already overflows**: the box is too small for the source text as well. Fix the box, not the translation.
- **not checked**: no test showed this message, so nothing is known about its box. These keys are listed, never counted as fitting. The more screens your tests visit, the fewer keys end up here.

## What it can't know

- **Boxes that grow.** Most text sits in boxes that simply get taller, and `fit` reports those as "grows". The errors come from fixed boxes: buttons, tabs, menu items, one-line rows, clamped text.
- **Keys no test shows.** Coverage comes from your tests. A key that only appears in a dialog no test opens is "not checked".
- **Values in placeholders** beyond the ones seen while recording. `Hello {{name}}` is measured with the name the recording saw.
- **Fonts it can't load.** Measured without the app's font, a verdict can be wrong. `fit` warns about each missing font and marks the keys it affected.

Measured before release on Excalidraw and on fitlocale's demo app, with real German, Russian and Arabic and with German stretched up to 3×, it caught 96% of 57 real overflows, with 5% false alarms, when the app's fonts were available.
