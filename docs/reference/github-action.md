---
title: GitHub Action reference
description: The fitlocale GitHub Action - new translation layout issues in the job summary, the HTML report as an artifact, and one pull request comment.
---

# GitHub Action

Run your Playwright tests as usual, then add the fitlocale step with `if: always()`, so it runs when tests fail too:

```yaml
- run: npx playwright test
- uses: melliforge/fitlocale@v0
  if: always()
```

It writes a table of new issues to the job summary and uploads the report directory as an artifact. It never fails the job: your test step already did, if there were new issues.

On GitLab CI or another CI system, run the tests and save the report directory yourself: see [GitLab CI and other CI systems](/reference/other-ci).

| Input | Default | Meaning |
|---|---|---|
| `report-dir` | `fitlocale-report` | The reporter's `outputDir` |
| `artifact-name` | `fitlocale-report` | Name of the uploaded report. In a matrix or with shards, give each job its own name |
| `max-rows` | `50` | Most issues listed in the job summary |
| `fitlocale-command` | your `node_modules/.bin/fitlocale`, else `npx fitlocale` at the Action's major version (`fitlocale@0` for `@v0`) | Command that runs the fitlocale CLI |
| `comment` | `false` | Post one pull request comment listing new issues (see below) |
| `upload`, `upload-url` | | Retired: they do nothing (see below) |

## `comment`

`comment: true` posts one comment on the pull request, listing the new issues: those not in your [baseline](/reference/options#baseline), errors first, at most 10, each with its rule, locale, element, message and fix. The comment links the report artifact, where the screenshots and crops are. Every push updates the same comment, and it turns into "All clear" once nothing new is left. A pull request that never had a new issue gets no comment, unless accepted issues no longer occur: then the comment says so, with the command that drops them from the baseline. Until the baseline on your default branch is pruned, every pull request gets that note, so prune in the pull request that fixed them.

The job needs `permissions: pull-requests: write`, and nothing else. The Action uses the job's own `github.token`: no secret, and nothing leaves GitHub.

<<< @/../examples/github-workflow-comment.yml{yaml}

Only the run of the pull request's newest commit writes the comment: a slower run of an older commit leaves it alone. Like the rest of the Action, the comment never fails the job. A missing permission, or GitHub not answering, is one line in the log. See [`fitlocale comment`](/reference/cli#fitlocale-comment).

## Matrix and shards

Jobs that run in parallel would overwrite each other's comment. So leave `comment` off in the matrix, give each job its own `artifact-name`, and comment from one final job with `melliforge/fitlocale/comment`, which reads several reports:

<<< @/../examples/github-workflow-matrix.yml{yaml}

| Input of `melliforge/fitlocale/comment` | Default | Meaning |
|---|---|---|
| `report-dirs` | | Report directories, one per line |
| `report-url` | the workflow run | Link for the full report |
| `fitlocale-command` | as above | Command that runs the fitlocale CLI |

## Forks

A pull request from a fork runs with a read-only token, so it cannot comment. GitHub's answer is two workflows. The tests run on `pull_request` as usual and upload the report. A second workflow runs on `workflow_run` when they finish. It runs from your default branch with a token that can write, downloads the report, and comments. It never runs the fork's code: it checks nothing out, and it treats the report as untrusted text, so a mention, link or image in it stays plain text. It finds the pull request by the run's branch and commit, not by anything in the report.

<<< @/../examples/github-workflow-forks-tests.yml{yaml}

<<< @/../examples/github-workflow-forks-comment.yml{yaml}

## Retired: `upload`

fitlocale is free and has no hosted service. fitlocale cloud has closed, so `upload: true` only prints a warning. Use `comment: true` instead.
