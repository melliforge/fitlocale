# Fixtures

`results-0.4.2.json` is a `results.json` written by fitlocale 0.4.2, unedited (52 KB, 56 issues in 7 checks, Chromium).
It has no `name` on its issues, which later versions record. A newer report must still render it.

It came from the demo project's own tests at the `v0.4.2` tag (commit 6786908):

```bash
git worktree add --detach ../fitlocale-0.4.2 v0.4.2
cd ../fitlocale-0.4.2 && npm run build
CI=true npx playwright test --project=demo   # writes test-results/fitlocale-report/results.json
```

Its screenshots are not kept: the tests that render it do not need the images.
