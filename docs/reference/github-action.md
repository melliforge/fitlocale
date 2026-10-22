---
title: GitHub Action reference
description: The fitlocale GitHub Action - a table of new translation layout issues in the job summary, and the HTML report as an artifact.
---

# GitHub Action

Run your Playwright tests as usual, then add the fitlocale step with `if: always()`, so it runs when tests fail too:

```yaml
- run: npx playwright test
- uses: melliforge/fitlocale@v0
  if: always()
```

It writes a table of new issues to the job summary and uploads the report directory as an artifact. It never fails the job: your test step already did, if there were new issues.

| Input | Default | Meaning |
|---|---|---|
| `report-dir` | `fitlocale-report` | The reporter's `outputDir` |
| `artifact-name` | `fitlocale-report` | Name of the uploaded report. In a matrix or with shards, give each job its own name |
| `max-rows` | `50` | Most issues listed in the job summary |
| `fitlocale-command` | your `node_modules/.bin/fitlocale`, else `npx fitlocale` at the Action's major version (`fitlocale@0` for `@v0`) | Command that runs the fitlocale CLI |
| `upload` | `false` | Send the report to fitlocale cloud (see below) |
| `upload-url` | `https://cloud.fitlocale.dev` | fitlocale cloud address |

## `upload`

With a fitlocale cloud plan, `upload: true` sends the report to fitlocale cloud. It posts one comment on the pull request, showing the new issues with a crop of each, and links to the hosted report. The job signs in with its GitHub OIDC token, so it needs the `id-token: write` permission and no secret:

```yaml
permissions: { contents: read, id-token: write }
# after the tests:
- uses: melliforge/fitlocale@v0
  if: always()
  with: { upload: true }
```

Screenshots, crops and `results.json` are uploaded. The [`mask` option](/reference/options#mask) paints over customer data in the images, and [`ignore`](/reference/options#ignore) keeps an element's text out of `results.json`. Pull requests from forks are not uploaded. Like the rest of the Action, the upload never fails the job: a missing plan or permission, or a service that doesn't answer, is one line in the log. See [`fitlocale upload`](/reference/cli#fitlocale-upload).
