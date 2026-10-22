---
title: Privacy policy
description: What fitlocale cloud stores about you and your repositories, for how long, where it is kept, and how to have it deleted.
---

# Privacy policy

_Last updated 2026-10-22_

fitlocale cloud is run by [SELLER LEGAL NAME], [COUNTRY] ("we"). This page says what the hosted service keeps. The open-source fitlocale package sends nothing anywhere unless you turn `upload` on.

## What we keep

| What | Why | How long |
|---|---|---|
| Your GitHub account or organization: its id, login and type, and the ids and names of the repositories the App is installed on | To know which repositories belong to which plan | Until you uninstall the App and ask us to delete it |
| Uploaded reports: `results.json` with each issue's text, selector and page URL, plus the screenshots and crops | To post the pull request comment and show the hosted report | 30 days on Team, 90 days on Business |
| For each run: the commit, branch, pull request number and GitHub run id | To place the comment on the right pull request | Deleted along with the run's report |
| When you sign in: your GitHub user id and login, and your GitHub sign-in token, encrypted | To check that you can see a repository before showing its report | 7 days, or until you sign out |
| Your plan: the Paddle customer and subscription ids, and the subscription's status and dates | To give you the plan you paid for | While the account exists |

We keep no payment card or bank details. Paddle, our reseller and merchant of record, handles payment under [its own privacy policy](https://www.paddle.com/legal/privacy).

## Who can see it

- **Hosted reports** are shown only to signed-in GitHub users who can see the repository.
- **Crop images in pull request comments** are served from unguessable public links, because GitHub loads comment images without signing in. The links work until the report expires. You can turn them off on your account page, and the [`mask` option](/reference/options#mask) paints over customer data before anything is uploaded.
- **Service providers:** the service runs on Cloudflare (Workers, D1 and R2 storage), and GitHub and Paddle receive what their part of the service needs. We sell nothing to anyone, and use no analytics or advertising trackers.

## Cookies

There is one sign-in cookie, `fl_session`, plus a short-lived `fl_state` cookie during sign-in. Both are needed for the service to work.

## Your rights

You can ask for a copy of your data, or for it to be corrected or deleted, at [PRIVACY EMAIL]. Uninstalling the GitHub App stops new uploads, and stored reports expire on their own. If you're in the EU or UK, you can also complain to your data protection authority.
