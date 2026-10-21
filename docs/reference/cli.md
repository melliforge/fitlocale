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

## `fitlocale summary`

```bash
npx fitlocale summary fitlocale-report/results.json --max-rows 50 >> "$GITHUB_STEP_SUMMARY"
```

Prints a Markdown summary of the new issues: counts, a note when there is no baseline yet, and a table of at most `--max-rows` issues (default 50), errors first.

## `fitlocale upload`

```bash
npx fitlocale upload fitlocale-report --pr "$PR_NUMBER"
```

Sends a finished report to fitlocale cloud, which comments on the pull request and hosts the report. It runs in GitHub Actions; the [Action's `upload` input](/reference/github-action#upload) calls it for you.

- **What it sends:** `results.json` and the screenshots and crops it points at, and nothing outside the report directory. Use the [`mask` option](/reference/options#mask) to paint over customer data before anything is saved.
- **How it signs in:** with the job's GitHub OIDC token, so the repository needs no secret. The job needs `permissions: id-token: write`. Pull requests from forks get no token, and are not uploaded.
- **It never fails the job:** if there is no token or plan, or the service doesn't answer within 30 seconds, it prints one `fitlocale upload:` line and exits 0. It needs Node 18 or newer, and on older Node it says so and exits 0.
- **Options:** `--pr <n>` is the pull request number. When it's empty, the number is read from `GITHUB_REF`. `--endpoint <url>` (or `FITLOCALE_CLOUD_URL`) changes the service address, which defaults to `https://cloud.fitlocale.dev`.
