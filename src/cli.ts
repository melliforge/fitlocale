import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { buildBaseline, fixedEntries, formatBaseline, pruneBaseline, type BaselineFile } from './baseline';
import { pseudoMessages, type Messages } from './pseudo';
import { buildFitMap, formatFitMap } from './fit/map';
import { predictFit } from './fit/predict';
import { runFit } from './fit/run';
import { renderReport } from './report/html';
import { renderSummary } from './summary';
import type { RunResults } from './types';
import { postComment } from './comment/post';
import { UPLOAD_RETIRED } from './upload';

export interface CliIO { stdout: (s: string) => void; stderr: (s: string) => void }

const USAGE = `Usage:
  fitlocale pseudo <input.json> [--out <file>] [--expansion <n>]   Write a pseudo-locale message file
  fitlocale report <results.json> [--out <dir>]                   Re-render index.html from results.json
  fitlocale baseline <results.json>... [--out <file>]             Accept the issues found (default fitlocale-baseline.json)
  fitlocale baseline --prune <results.json>... [--out <file>]     Remove accepted issues that no longer occur
  fitlocale summary <results.json> [--max-rows <n>]               Print a Markdown summary (for CI job summaries)
  fitlocale fitmap <results.json>... [--out <file>]           Build the fit map from test runs (default fitlocale-fit.json)
  fitlocale fit <messages.json>... [--map <file>] [--fonts <dir>] [--changed-from <ref>] [--locale <code>] [--report-only] [--json <file>]
                                                                  Check translations against the fit map, without running the app
  fitlocale upload <report-dir>                                   Retired: prints a notice (use fitlocale comment)
  fitlocale comment <report-dir>... [--pr <n>] [--report-url <url>]  Comment on the pull request (GitHub Actions; never fails)
  fitlocale --help
`;

const defaultIO: CliIO = { stdout: s => process.stdout.write(s), stderr: s => process.stderr.write(s) };

const COMMANDS: Record<string, true> = { pseudo: true, report: true, summary: true, upload: true };

/** Read a JSON file whose top level must be an object. */
function readJsonObject(path: string): Record<string, unknown> {
  const value = readJson(path);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must contain a JSON object`);
  return value as Record<string, unknown>;
}

function writeFileCreatingDir(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/**
 * Screenshot paths in results.json are relative to that file. When the report goes elsewhere,
 * copy the screenshots along (or point at them, when they live outside the results directory).
 */
function relocateScreenshots(results: RunResults, fromDir: string, toDir: string): void {
  if (resolve(fromDir) === resolve(toDir)) return;
  for (const check of results.checks) {
    for (const shot of check.screenshots ?? []) {
      if (isAbsolute(shot.path)) continue;
      const source = resolve(fromDir, shot.path);
      if (!existsSync(source)) continue;
      const inside = !normalize(shot.path).startsWith('..' + sep) && normalize(shot.path) !== '..';
      if (inside) {
        mkdirSync(dirname(resolve(toDir, shot.path)), { recursive: true });
        copyFileSync(source, resolve(toDir, shot.path));
      } else {
        shot.path = relative(toDir, source).split(sep).join('/');
      }
    }
  }
}

function readResults(path: string): RunResults {
  const results = readJsonObject(path) as unknown as RunResults;
  if (!Array.isArray(results.checks)) throw new Error(`${path} is not a fitlocale results.json (no "checks" list)`);
  return results;
}

function readJson(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Cannot read ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} is not valid JSON`);
  }
}

/** `fit` and `fitmap` keep 1 for "won't fit": every usage or setup error is 2. */
const usageCode = (argv: string[]) => (argv[0] === 'fit' || argv[0] === 'fitmap' ? 2 : 1);

/** Run the CLI and return its exit code. */
export async function main(argv: string[], io: CliIO = defaultIO): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: 'string' }, expansion: { type: 'string' }, 'max-rows': { type: 'string' }, help: { type: 'boolean' },
        endpoint: { type: 'string' }, pr: { type: 'string' }, 'report-url': { type: 'string' }, 'source-locale': { type: 'string' },
        map: { type: 'string' }, fonts: { type: 'string' }, 'changed-from': { type: 'string' }, locale: { type: 'string' },
        'report-only': { type: 'boolean' }, json: { type: 'string' }, prune: { type: 'boolean' }, // --endpoint: accepted from old upload workflows
      },
    });
    const [command, input, ...extra] = positionals;
    if (values.help || command === 'help') {
      io.stdout(USAGE);
      return 0;
    }
    if (command && COMMANDS[command] && extra.length) throw new Error(`Unexpected argument: ${extra[0]}`);
    if (command === 'pseudo' && input) {
      const expansion = values.expansion === undefined ? undefined : Number(values.expansion);
      if (expansion !== undefined && !(expansion >= 0)) throw new Error('--expansion must be a number ≥ 0');
      const json = JSON.stringify(pseudoMessages(readJsonObject(input) as Messages, { expansion }), null, 2) + '\n';
      if (values.out) writeFileCreatingDir(values.out, json);
      else io.stdout(json);
      return 0;
    }
    if (command === 'baseline' && input && values.prune) {
      const out = values.out ?? 'fitlocale-baseline.json';
      if (!existsSync(out)) throw new Error(`no baseline file at ${out} to prune (pass --out with its path)`);
      const current = readJsonObject(out) as unknown as BaselineFile;
      if (!Array.isArray(current.issues)) throw new Error(`${out} is not a fitlocale baseline file (no "issues" list)`);
      const { file, removed } = pruneBaseline(current, fixedEntries([input, ...extra].map(path => readResults(path))));
      writeFileCreatingDir(out, formatBaseline(file));
      io.stdout(`fitlocale: removed ${removed} fixed issue(s) from ${out}; ${file.issues.length} remain\n`);
      return 0;
    }
    if (command === 'baseline' && input) {
      const runs = [input, ...extra].map(path => readResults(path));
      const file = buildBaseline(runs);
      const out = values.out ?? 'fitlocale-baseline.json';
      writeFileCreatingDir(out, formatBaseline(file));
      io.stdout(`fitlocale: wrote ${file.issues.length} accepted issue(s) to ${out}\n`);
      return 0;
    }
    if (command === 'fit' && input) {
      return await runFit({
        files: [input, ...extra], map: values.map, fonts: values.fonts, changedFrom: values['changed-from'], locale: values.locale,
        reportOnly: values['report-only'], json: values.json,
      }, io, {
        cwd: process.cwd(), env: process.env, predict: predictFit,
        // Imported only here: every other command works without Playwright.
        loadChromium: async () => (await import('@playwright/test')).chromium,
      });
    }
    if (command === 'fitmap' && input) {
      const map = buildFitMap([input, ...extra].map(path => readResults(path)), values['source-locale'] ?? 'en');
      const keys = Object.keys(map.keys).length;
      if (!keys) {
        throw new Error('no fit records in these results: run the tests with fitMap: true and sourceMessages set, on pages in the source locale');
      }
      const out = values.out ?? 'fitlocale-fit.json';
      writeFileCreatingDir(out, formatFitMap(map));
      io.stdout(`fitlocale: wrote the fit of ${keys} key(s) to ${out}\n`);
      return 0;
    }
    if (command === 'summary' && input) {
      const maxRows = values['max-rows'] === undefined ? 50 : Number(values['max-rows']);
      if (!Number.isInteger(maxRows) || maxRows < 1) throw new Error('--max-rows must be a whole number ≥ 1');
      io.stdout(renderSummary(readResults(input), { maxRows, resultsPath: input }));
      return 0;
    }
    if (command === 'upload' && input) {
      // fitlocale cloud has closed. Old workflows keep passing --pr and --endpoint: accepted, and nothing is sent.
      io.stdout(UPLOAD_RETIRED + '\n');
      return 0;
    }
    if (command === 'comment' && input) {
      // Never fails the job: every problem is one line on stdout and exit 0.
      const log = (line: string) => io.stdout(line + '\n');
      if (typeof fetch !== 'function') {
        log('fitlocale comment needs Node 18 or newer');
        return 0;
      }
      const pr = values.pr?.trim() ? Number(values.pr) : NaN;
      await postComment({
        dirs: [input, ...extra], prNumber: Number.isInteger(pr) && pr > 0 ? pr : null,
        reportUrl: values['report-url']?.trim() || null, env: process.env, fetch, log,
      });
      return 0;
    }
    if (command === 'report' && input) {
      const results = readResults(input);
      const dir = values.out ?? dirname(input);
      mkdirSync(dir, { recursive: true });
      relocateScreenshots(results, dirname(input), dir);
      writeFileSync(join(dir, 'index.html'), renderReport(results));
      io.stdout(`fitlocale: wrote ${join(dir, 'index.html')}\n`);
      return 0;
    }
    io.stderr(`${command ? `Unknown command or missing file: ${command}` : 'Unknown command'}\n\n${USAGE}`);
    return usageCode(argv);
  } catch (err) {
    io.stderr(`fitlocale: ${(err as Error).message}\n`);
    return usageCode(argv);
  }
}
