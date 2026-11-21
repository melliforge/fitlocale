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
  scope?: string;                          // which check this is (project, title path, check index), hashed: baseline entries record it as `check`
  url: string;
  issues: Issue[];
  screenshots: Array<{ mode: string; viewport: { width: number; height: number }; path: string; size: { width: number; height: number };
    origin?: { x: number; y: number } }>;     // where the page's (0, 0) is on the image, when not at its corner (Chromium, right-to-left pages wider than the window)
  baseline?: {
    status: 'missing' | 'applied'; path: string;
    fixed?: Array<{ id: string; rule: string; test: string; project?: string; selector: string; mode: string; locale: string; viewport: string }>;
                                           // accepted issues of this check that it did not find this time
    legacy?: true;                         // the baseline has entries without `check` (written before 0.8): those are never called fixed
  };
  fit?: Array<{                            // with fitMap: true, on source-locale pages: one record per viewport
    viewport: { width: number; height: number };
    styles: Array<Record<string, string>>; // text styles, referenced by index
    entries: Array<{ key: string; text: string; slots: Record<string, string>; lines: number; oneLine: boolean; wrapWidth: number;
      roomX: number | null; roomY: number | null; maxLines: number | null; measured: boolean; s: number; lang: string; dir: string; selector: string }>;
    fonts: Array<{ family: string; weight: string; style: string; src: string }>;
  }>;
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
  name?: string;                           // accessible name (aria-labelledby, aria-label, <label>, alt, title, placeholder), when it has one
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
  crop?: string;                           // a small screenshot around the issue (at most 20 per check), relative to results.json
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
      "selector": "#save", "mode": "pseudo-long", "locale": "en", "viewport": "1280x800", "check": "9c1e…" }
  ]
}
```

Only `id` is matched. `check` names the check that accepted the issue: when that check runs and no longer finds it, the issue is reported as fixed, and [`fitlocale baseline --prune`](/reference/cli#fitlocale-baseline) removes it. The other fields are there for people reviewing the file.
