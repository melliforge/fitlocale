import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import type { Browser } from '@playwright/test';
import { flattenEntries, type Messages } from '../pseudo';
import { changedKeys } from './changed';
import { readFitMap, type FitMap } from './map';
import type { FitVerdict, predictFit } from './predict';
import { renderFitSummary } from './summary';

export interface FitArgs {
  files: string[]; map?: string; fonts?: string; changedFrom?: string; locale?: string; reportOnly?: boolean; json?: string;
}
export interface FitDeps {
  cwd: string;
  env: Record<string, string | undefined>;
  /** `@playwright/test`'s chromium, imported only when `fit` runs: every other command works without Playwright. */
  loadChromium(): Promise<{ launch(): Promise<Browser> }>;
  predict: typeof predictFit;
}
interface IO { stdout: (s: string) => void; stderr: (s: string) => void }

const P = 'fitlocale fit: ';

/** `fitlocale fit`: 0 when nothing overflows (or with reportOnly), 1 when something does, 2 on a usage or setup error. */
export async function runFit(a: FitArgs, io: IO, deps: FitDeps): Promise<number> {
  const fail = (message: string) => { io.stderr(P + message + '\n'); return 2; };
  const mapFile = resolve(deps.cwd, a.map ?? 'fitlocale-fit.json');
  if (!existsSync(mapFile)) return fail(`${mapFile} not found: record it with fitMap: true, then npx fitlocale fitmap`);
  let map: FitMap;
  try { map = readFitMap(mapFile); } catch (err) { return fail((err as Error).message); }
  let chromium: Awaited<ReturnType<FitDeps['loadChromium']>>;
  try { chromium = await deps.loadChromium(); } catch { return fail('fitlocale fit needs @playwright/test and its Chromium (npx playwright install chromium)'); }

  const fontsDir = a.fonts ? resolve(deps.cwd, a.fonts) : null;
  const report: Array<{ file: string; locale: string; verdicts: FitVerdict[]; fontWarnings: string[] }> = [];
  let overflows = 0;
  for (const given of a.files) {
    const file = resolve(deps.cwd, given);
    let entries: Array<[string, string]>;
    try { entries = flattenEntries(JSON.parse(readFileSync(file, 'utf8')) as Messages); } catch { return fail(`${file} is not a readable message file (JSON)`); }
    let keys: string[];
    try { keys = a.changedFrom ? changedKeys(file, a.changedFrom, deps.cwd) : entries.map(([k]) => k); } catch (err) { return fail((err as Error).message); }
    const locale = a.locale ?? basename(file).replace(/\.json$/i, '');
    const { verdicts, fontWarnings } = await deps.predict({ map, messages: new Map(entries), keys, locale, fontsDir, chromium });

    const over = verdicts.filter(v => v.verdict === 'overflows');
    overflows += over.length;
    const checked = verdicts.filter(v => v.verdict !== 'not-checked').length;
    io.stdout(`${P}${locale}: checked ${checked} of ${keys.length} changed keys; ${over.length} won't fit\n`);
    for (const v of over) io.stdout(`${P}${locale}: ${v.key} needs ${v.need} px, has ${v.room} px (${v.vp}, ${v.selector}): ${JSON.stringify(v.text)}\n`);
    for (const w of fontWarnings) io.stderr(`${P}${w}\n`);
    const blind = verdicts.filter(v => v.fontMissing).length;
    if (blind) io.stdout(`${P}${locale}: ${blind} key(s) were judged without their font: results may be wrong\n`);
    if (deps.env.GITHUB_STEP_SUMMARY) appendFileSync(deps.env.GITHUB_STEP_SUMMARY, renderFitSummary({ locale, verdicts, fontWarnings, changed: keys.length }) + '\n');
    report.push({ file: given, locale, verdicts, fontWarnings });
  }
  if (a.json) {
    const out = resolve(deps.cwd, a.json);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ version: 1, files: report }, null, 1) + '\n');
  }
  return overflows && !a.reportOnly ? 1 : 0;
}
