---
title: GitLab CI and other CI systems
description: Run fitlocale in GitLab CI, Jenkins, CircleCI, Bitbucket or Azure DevOps, and keep the HTML report as a build artifact.
---

# GitLab CI and other CI systems

fitlocale is a Playwright reporter and fixture, so it runs wherever `npx playwright test` runs. The [GitHub Action](/reference/github-action) only adds a job summary and the artifact upload on top. In any other CI, run your tests and save the report directory: the reporter's `outputDir`, `fitlocale-report` in [Getting started](/guide/getting-started).

## GitLab CI

Run the job in Playwright's own Docker image, at the version of `@playwright/test` in your lockfile. It has Node, the browsers and their fonts, so there is no `npx playwright install` step, and the layout is measured with the same fonts on every run.

```yaml
# .gitlab-ci.yml
e2e:
  image: mcr.microsoft.com/playwright:v1.64.1-noble
  script:
    - npm ci
    - npx playwright test
  artifacts:
    when: always
    expire_in: 30 days
    expose_as: fitlocale report
    paths:
      - fitlocale-report/
```

`when: always` keeps the report when the tests fail, which is when you need it. `expose_as` adds a link to it on the merge request. Download the artifact and open `fitlocale-report/index.html`.

The tests fail on new issues only, as everywhere: commit `fitlocale-baseline.json` next to `playwright.config`, and the job reads it. To accept the issues of a run, download its `results.json` and run [`fitlocale baseline`](/reference/cli#fitlocale-baseline) on it:

```bash
npx fitlocale baseline fitlocale-report/results.json
```

With sharded jobs, give it every shard's `results.json` at once.

## Any other CI

Bitbucket Pipelines, Jenkins, CircleCI, Azure DevOps and the rest need the same two steps:

1. Run `npx playwright test`, ideally in the `mcr.microsoft.com/playwright` image of your Playwright version.
2. Save `fitlocale-report/` as a build artifact, also when the test step fails: Jenkins with `archiveArtifacts` in a `post { always { … } }` block, Azure DevOps with `condition: always()` on the publish step.

To print the new issues in the job log, run [`npx fitlocale summary fitlocale-report/results.json`](/reference/cli#fitlocale-summary) in a step that also runs after failures.

## fitlocale cloud

fitlocale cloud (the uploads, the pull request comment and the hosted reports) works only with GitHub for now. Outside GitHub Actions, [`fitlocale upload`](/reference/cli#fitlocale-upload) prints a notice and exits 0.
