---
title: Pricing
description: fitlocale is free and open source. fitlocale cloud adds pull request comments with screenshots and hosted reports, from $49 a month.
---

# Pricing

fitlocale itself is free and open source, and stays complete: every check, the report and the Action. fitlocale cloud is the paid part. It brings the findings to your pull requests.

| | Free | Team | Business |
|---|---|---|---|
| **Price** | $0 | $49/month or $490/year | $149/month or $1,490/year |
| Every check, local HTML report, baseline, CLI | ✓ | ✓ | ✓ |
| [GitHub Action](/reference/github-action) and [any other CI](/reference/other-ci) | ✓ | ✓ | ✓ |
| One pull request comment with a cropped screenshot of each new problem | | ✓ | ✓ |
| Full report hosted behind GitHub sign-in | | ✓ | ✓ |
| Repositories | | 3 | Unlimited |
| Reports kept for | | 30 days | 90 days |

- **14-day trial:** installing the [fitlocale GitHub App](https://github.com/apps/fitlocale-cloud/installations/new) starts it. No card is needed, and it ends by itself.
- **Repositories:** a repository counts while it has had an upload in the last 30 days.
- **Payment:** prices are in US dollars. Paddle, our reseller, adds sales tax or VAT at checkout and sends the invoices.
- **Cancel any time** from your account page at [cloud.fitlocale.dev/account](https://cloud.fitlocale.dev/account). The plan runs to the end of the period you paid for. See [refunds](/legal/refunds).
- **GitHub only for now:** fitlocale cloud needs GitHub Actions and the GitHub App. The free package runs [anywhere](/reference/other-ci).

## Coming next

Run history, with "new" and "fixed in this pull request" compared against the default branch, and a review gallery that shows each screen side by side in every language.

## How it works

Add `upload: true` to the [fitlocale Action](/reference/github-action#upload). The job signs in with its GitHub OIDC token, so the repository needs no secret. Screenshots can be [masked](/reference/options#mask), and the [privacy policy](/legal/privacy) lists everything fitlocale cloud keeps.
