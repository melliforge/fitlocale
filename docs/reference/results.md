---
title: Results format (results.json)
description: The results.json written by the fitlocale reporter and the baseline file format, documented for tools, scripts and AI coding agents.
---

# Results format

The reporter writes `results.json` next to `index.html`. It is stable, so tools and AI coding agents can act on it.

```ts
interface RunResults {
  version: 1;
  createdAt: string;                       // ISO date
  checks: CheckResult[];
  summary: { error: number; warning: number; info: number };
}

interface CheckResult {
  testTitle: string;
  testFile: string;                        // relative to the working directory
  project?: string;                        // Playwright project name
  checkIndex: number;                      // nth localeCheck() in the test
  url: string;
  issues: Issue[];
  screenshots: Array<{ mode: string; viewport: { width: number; height: number }; path: string; size: { width: number; height: number } }>;
  baseline?: { status: 'missing' | 'applied'; path: string };
}

interface Issue {
  rule: string;                            // see the rules reference
  severity: 'error' | 'warning' | 'info';
  mode: 'source' | 'pseudo-long' | 'pseudo-rtl';
  locale: string;
  viewport: { width: number; height: number };
  url: string;
  selector: string;                        // test id, unique id, else a DOM path; works with page.locator()
  key: string;                             // DOM path; a Playwright selector chain inside shadow roots and iframes
  box: { x: number; y: number; width: number; height: number }; // on the screenshot
  text: string;                            // at most 120 characters
  name?: string;                           // accessible name (aria-label, alt, title…), when the element has one
  message: string;
  fix?: string;
  id?: string;                             // stable fingerprint, used by the baseline
  baselined?: boolean;                     // accepted in the baseline file
  visual?: string;                         // rtl/bidi-order: the text as drawn
  used?: string; declared?: string;        // rtl/font-fallback: fonts
  source?: {                               // rtl/not-mirrored: the CSS responsible (Chromium)
    url: string; line: number; column: number; selector: string;
    property: string; value: string; replacement: string;
    original?: { url: string; line: number; column: number }; // through source maps
  };
}
```

An issue's `id` hashes its project, test title path, check position, rule, mode, locale, viewport and selector. It leaves out the text and URL, so editing a translation does not make an accepted issue look new.

## Baseline file

```json
{
  "version": 1,
  "note": "Accepted fitlocale issues: only issues not listed here fail the tests. …",
  "issues": [
    { "id": "3f2a…", "rule": "overflow/clipped", "test": "tests/settings.spec.ts › settings",
      "selector": "#save", "mode": "pseudo-long", "locale": "en", "viewport": "1280x800" }
  ]
}
```

Only `id` is matched. The other fields are there for people reviewing the file.
