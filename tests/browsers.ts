import type { PlaywrightTestProject } from '@playwright/test';
import type { FitlocaleTestOptions } from '../src/playwright';

type Project = PlaywrightTestProject<FitlocaleTestOptions>;

const BROWSERS = ['chromium', 'firefox', 'webkit'] as const;
const demoApp = { baseURL: 'http://localhost:4310', viewport: { width: 1280, height: 800 } };

/** The projects that open a browser. Chromium keeps these names; other browsers get a `-firefox` or `-webkit` suffix. */
const inBrowser: Project[] = [
  { name: 'browser', testDir: 'tests/browser', use: { fitlocale: { ignore: ['.config-ignored'] } } },
  // The docs' guide code: runs against the demo app so a guide that stops working fails CI.
  { name: 'examples', testDir: 'examples', testMatch: /\.spec\.ts$/, use: demoApp },
  { name: 'demo', testDir: 'tests/demo', use: demoApp },
];

/** The suite's projects for a comma list of browsers (`BROWSERS`), Chromium alone by default. */
export function browserProjects(list: string | undefined): Project[] {
  const names = (list ?? 'chromium').split(',').map(n => n.trim()).filter(Boolean);
  const unknown = names.filter(n => !(BROWSERS as readonly string[]).includes(n));
  if (unknown.length) throw new Error(`BROWSERS: unknown browser ${unknown.join(', ')}; use chromium, firefox, webkit`);
  const projects: Project[] = [{ name: 'unit', testDir: 'tests/unit' }];
  if (names.includes('chromium')) projects.push(...inBrowser);
  for (const browser of BROWSERS.filter(b => b !== 'chromium' && names.includes(b))) {
    projects.push(...inBrowser.map(p => ({ ...p, name: `${p.name}-${browser}`, use: { ...p.use, browserName: browser } })));
  }
  return projects;
}
