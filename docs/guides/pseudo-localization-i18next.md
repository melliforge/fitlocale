---
title: Pseudo-localization with i18next and Playwright
description: Generate an en-XA pseudo locale for i18next, then find hardcoded strings, glued sentences and overflow in your Playwright tests.
---

# Pseudo-localization with i18next and Playwright

::: tip Next release
Parts of this page arrive in the next fitlocale release on npm (after 0.2.1). They are on `main` today.
:::

Pseudo-localization is a fake language made from your source language: every string accented, made longer, and wrapped in markers.

```
"Welcome back, {{name}}"   →   "⟦Wélçömé báçk, {{name}} ~~~~~⟧"
```

Your app loads it like any real language, so you can test translation before a single real translation exists. Every string that went through i18next carries markers. Anything on screen without them never did:
- **hardcoded text**, which no translator will ever see;
- **sentences glued together** from separate messages, which break word order in other languages;
- **text that no longer fits** once it is longer.

fitlocale generates the pseudo locale, and finds all three in your Playwright tests.

## 1. Generate the pseudo locale

```bash
npx fitlocale pseudo locales/en.json --out locales/en-XA.json
```

Placeholders (`{{name}}`), plurals, nesting (`$t(key)`) and HTML tags are kept intact, so the messages still work. `en-XA` is the standard code for a long pseudo locale. Add the command to your test script, so the file never falls behind your English messages:

```json
{ "scripts": { "pretest:e2e": "fitlocale pseudo locales/en.json --out locales/en-XA.json" } }
```

## 2. Register it in i18next

Add `en-XA` to your resources like any other language:

<<< @/../examples/i18next/i18n.ts

Keep `<html lang>` up to date when the language changes. fitlocale reads it to recognise the pseudo locale, and to check that the language stays set across navigations.

## 3. Switch to it in a test

Tell fitlocale how your app switches language, then call `useLocale('en-XA')`:

<<< @/../examples/i18next/i18next.spec.ts#guide

The ready-made helpers are `byQueryParam()`, `byCookie()` (for example `i18next` or `NEXT_LOCALE`), `byLocalStorage()` (for example `i18nextLng`) and `byPathPrefix()`.

## What it finds

On the example app this test reports two issues.

**`i18n/hardcoded`** on a "Free shipping on all orders" paragraph that was typed into the HTML instead of the message files. Dates, times, emails, URLs, numbers and language names are never reported.

**`i18n/concatenated`** on the cart line, which the code builds from two messages:

```ts
`${t('cart.saved')} ${t('cart.order')}` // "You saved" + "on this order"
```

In another language the amount, the verb and "this order" may need a different order. Write one message with a placeholder instead:

```json
{ "cart": { "saved": "You saved {{amount}} on this order" } }
```

It also checks the page as your app renders it for text that no longer fits (`overflow/clipped`, `overflow/escapes-box`, `overflow/overlap`). It compares against the same page with the markers removed, so only problems caused by longer text are reported.

If no text has markers at all, you get one `i18n/pseudo-not-loaded` error instead: the `en-XA` messages were not loaded.

## Data is not hardcoded text

User names, product titles and other data from your database have no markers either. Mark those areas, so they are not reported:

```html
<td data-fitlocale-ignore>{{ customer.name }}</td>
```

Or skip them everywhere with the [`ignore` option](/reference/options#ignore). These rules are warnings: set [`failOn: 'warning'`](/reference/options#failon) once your data areas are marked, to fail the build on them.

## Real locales: text left in English

The same test setup also checks your real locales. Point [`sourceMessages`](/reference/options#sourcemessages) at your English file, and fitlocale reports text in German, French or Arabic pages that is identical to an English message (`i18n/untranslated`):

```ts
test.use({ fitlocale: { sourceMessages: 'locales/en.json', setLocale: byQueryParam('lang') } });
```

Messages of one word ("OK", "Total") are left out, because many languages share them.

## Next

- [Catch text truncation and overflow in CI](/guides/text-truncation-ci), with no pseudo locale at all.
- Every [rule](/reference/rules) and [option](/reference/options).
