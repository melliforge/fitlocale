import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { buildBaseline, formatBaseline } from './baseline';
import { pseudoMessages, type Messages } from './pseudo';
import { renderReport } from './report/html';
import { renderSummary } from './summary';
import type { RunResults } from './types';
import { DEFAULT_CLOUD_URL, prFromRef, uploadReport } from './upload';

export interface CliIO { stdout: (s: string) => void; stderr: (s: string) => void }

const USAGE = `Usage:
  fitlocale pseudo <input.json> [--out <file>] [--expansion <n>]   Write a pseudo-locale message file
  fitlocale report <results.json> [--out <dir>]                   Re-render index.html from results.json
  fitlocale baseline <results.json>... [--out <file>]             Accept the issues found (default fitlocale-baseline.json)
  fitlocale summary <results.json> [--max-rows <n>]               Print a Markdown summary (for CI job summaries)
  fitlocale upload <report-dir> [--endpoint <url>] [--pr <n>]     Send the report to fitlocale cloud (GitHub Actions; never fails)
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

/** Run the CLI and return its exit code. */
export async function main(argv: string[], io: CliIO = defaultIO): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: 'string' }, expansion: { type: 'string' }, 'max-rows': { type: 'string' }, help: { type: 'boolean' },
        endpoint: { type: 'string' }, pr: { type: 'string' },
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
    if (command === 'baseline' && input) {
      const runs = [input, ...extra].map(path => readResults(path));
      const file = buildBaseline(runs);
      const out = values.out ?? 'fitlocale-baseline.json';
      writeFileCreatingDir(out, formatBaseline(file));
      io.stdout(`fitlocale: wrote ${file.issues.length} accepted issue(s) to ${out}\n`);
      return 0;
    }
    if (command === 'summary' && input) {
      const maxRows = values['max-rows'] === undefined ? 50 : Number(values['max-rows']);
      if (!Number.isInteger(maxRows) || maxRows < 1) throw new Error('--max-rows must be a whole number ≥ 1');
      io.stdout(renderSummary(readResults(input), { maxRows, resultsPath: input }));
      return 0;
    }
    if (command === 'upload' && input) {
      // Never fails the job: every problem below is one line on stdout and exit 0.
      const log = (line: string) => io.stdout(line + '\n');
      if (typeof fetch !== 'function') {
        log('fitlocale upload needs Node 18 or newer');
        return 0;
      }
      const pr = values.pr?.trim() ? Number(values.pr) : NaN;
      await uploadReport({
        dir: input,
        endpoint: values.endpoint || process.env.FITLOCALE_CLOUD_URL || DEFAULT_CLOUD_URL,
        prNumber: Number.isInteger(pr) && pr > 0 ? pr : prFromRef(process.env.GITHUB_REF),
        env: process.env, fetch, log,
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
    return 1;
  } catch (err) {
    io.stderr(`fitlocale: ${(err as Error).message}\n`);
    return 1;
  }
}
