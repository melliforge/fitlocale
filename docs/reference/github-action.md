---
title: GitHub Action reference
description: The fitlocale GitHub Action - a table of new translation layout issues in the job summary, and the HTML report as an artifact.
---

# GitHub Action

Run your Playwright tests as usual, then add the fitlocale step with `if: always()`, so it runs when tests fail too:

```yaml
- run: npx playwright test
- uses: melliforge/localization-layout-tester@v0
  if: always()
```

It writes a table of new issues to the job summary and uploads the report directory as an artifact. It never fails the job: your test step already did, if there were new issues.

| Input | Default | Meaning |
|---|---|---|
| `report-dir` | `fitlocale-report` | The reporter's `outputDir` |
| `artifact-name` | `fitlocale-report` | Name of the uploaded report. In a matrix or with shards, give each job its own name |
| `max-rows` | `50` | Most issues listed in the job summary |
| `fitlocale-command` | your `node_modules/.bin/fitlocale`, else `npx fitlocale` at the Action's major version (`fitlocale@0` for `@v0`) | Command that runs the fitlocale CLI |
