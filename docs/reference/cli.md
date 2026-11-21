---
title: CLI reference
description: The fitlocale command line - generate pseudo-locale messages, re-render reports, accept issues into a baseline, and print CI summaries.
---

# CLI

Run with `npx fitlocale <command>`.

## `fitlocale pseudo`

```bash
npx fitlocale pseudo locales/en.json --out locales/en-XA.json
```

Writes a pseudo-locale message file: every string accented, about 40% longer, and wrapped in `⟦…⟧` markers. Placeholders (`{name}`, `{{name}}`, `%s`), ICU plural and select syntax, HTML tags, and i18next or vue-i18n nested messages are kept intact. `--expansion 0.6` changes the length. Without `--out`, it prints to stdout.

## `fitlocale report`

```bash
npx fitlocale report fitlocale-report/results.json --out another-dir
```

Re-renders the offline `index.html` from a `results.json`, copying its screenshots along.

## `fitlocale baseline`

```bash
npx fitlocale baseline fitlocale-report/results.json
npx fitlocale baseline shard-1/results.json shard-2/results.json --out e2e/fitlocale-baseline.json
```

Accepts every issue in one or more `results.json` files (one per shard) into the baseline file (default `fitlocale-baseline.json`). The file is sorted and readable, so it diffs cleanly in pull requests. The tests look for it next to `playwright.config`: pass `--out` when you run the command from another folder.

```bash
npx fitlocale baseline --prune fitlocale-report/results.json --out fitlocale-baseline.json
```

`--prune` removes the accepted issues that no longer occur, and changes nothing else: it never accepts a new issue, unlike running the command again. An issue counts as no longer occurring when the check that accepted it ran and did not find it, in any of the results given. Entries of checks that did not run (skipped tests, other shards) are kept. The job summary, the report, the reporter and the pull request comment say when there are some to remove. Baseline files written before fitlocale 0.8 don't record which check accepted each issue: regenerate them once to see fixed issues.

## `fitlocale summary`

```bash
npx fitlocale summary fitlocale-report/results.json --max-rows 50 >> "$GITHUB_STEP_SUMMARY"
```

Prints a Markdown summary of the new issues: counts, a note when there is no baseline yet, and a table of at most `--max-rows` issues (default 50), errors first.

## `fitlocale fitmap`

```bash
npx fitlocale fitmap fitlocale-report/results.json --out fitlocale-fit.json
```

Builds the fit map from test runs made with [`fitMap: true`](/reference/options#fitmap). It merges the `fit` records of every `results.json` given (shards, projects, several runs): for each message key, each distinct box it was shown in, at each viewport, with that box's room and text styles, and the fonts the pages loaded. Commit the file, and record it again when the UI changes. [`fitlocale fit`](#fitlocale-fit) checks translations against it.

- `--out <file>`: where to write it; default `fitlocale-fit.json`.
- `--source-locale <code>`: the source locale the map was recorded in; default `en`.
- No `fit` records in the results is an error (exit 2) that says how to turn them on.

## `fitlocale fit`

```bash
npx fitlocale fit locales/de.json --changed-from origin/main --fonts public
```

Checks translations against the [fit map](#fitlocale-fitmap), without building or running the app: one blank Chromium page, the app's fonts, and one box per message the map recorded, with that box's room. For each key it says:

- **won't fit** (an error): the text needs more room than its box has, for example `settings.save needs 148 px, has 120 px (390×844, #save)`.
- **grows**: the text takes more lines than the English one, and the layout moves.
- **English already overflows**: the box is too small for the source text too.
- **not checked**: no test showed this key, so nothing is known about its box. It is listed, never counted as fitting.

It exits 1 when something won't fit, 0 otherwise or with `--report-only`, and 2 on a usage or setup error (no map, no Playwright or its Chromium, an unknown option). In GitHub Actions it writes a summary to the job summary. It needs `@playwright/test` and its Chromium (`npx playwright install chromium`).

- `--map <file>`: the fit map; default `fitlocale-fit.json`.
- `--fonts <dir>`: where the app's font files are, such as its `public/` folder. The map records each font's URL; a file found under this folder by that path, or by its file name, is used first, then a public URL as it is. A font found nowhere is a warning, and the keys measured without it are marked: their verdict may be wrong.
- `--changed-from <ref>`: check only keys whose text differs from that git ref (new files: every key). Without it, every key.
- `--locale <code>`: the locale of the files; default the file name (`de-DE.json` → `de-DE`).
- `--json <file>`: every verdict, as JSON.

## `fitlocale comment`

```bash
npx fitlocale comment fitlocale-report
```

Posts or updates the pull request's one fitlocale comment, listing the new issues of one or more report directories. It runs in GitHub Actions. The [Action's `comment` input](/reference/github-action#comment) and `melliforge/fitlocale/comment` call it for you.

- **Which pull request:** under `pull_request`, the event's pull request. Under `workflow_run` (the [fork recipe](/reference/github-action#forks)), the one open pull request whose head is the run's branch and commit. A run of an older commit than the pull request's newest leaves the comment alone.
- **Token:** `GITHUB_TOKEN`, which the Actions set to the job's `github.token`. The job needs `permissions: pull-requests: write`. The comment is found again by its first line, `<!-- fitlocale -->`, and its author, `github-actions[bot]`. With any other token, each run would post a new comment.
- **It never fails the job:** without results, a token or a pull request, when the token cannot write, or when GitHub doesn't answer within 30 seconds, it prints one `fitlocale comment:` line and exits 0. It needs Node 18 or newer, and on older Node it says so and exits 0.
- **Options:** `--pr <n>` names the pull request. `--report-url <url>` is the link for the full report; the default is the workflow run.

## `fitlocale upload`

Retired, since fitlocale no longer has a hosted service. It prints one notice, sends nothing, and exits 0. Use [`fitlocale comment`](#fitlocale-comment).
