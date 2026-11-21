import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { relative, sep } from 'node:path';
import type { CheckResult, FixedEntry, Issue, Mode, RuleId, RunResults, Severity } from './types';
export { fixedEntries } from './fixed';

/** Where an issue was found: Playwright project, test title path and the check's position in the test. */
export interface IdScope { project: string; titlePath: string[]; checkIndex: number }

/**
 * A stable fingerprint: what the issue is and where, but not its text or URL, so editing a translation
 * or a query string does not turn an accepted issue into a new one.
 */
export function issueId(scope: IdScope, issue: Pick<Issue, 'rule' | 'mode' | 'locale' | 'viewport' | 'selector'>): string {
  const key = JSON.stringify([
    scope.project, scope.titlePath.map(t => t.replace(/\\/g, '/')), scope.checkIndex,
    issue.rule, issue.mode, issue.locale, `${issue.viewport.width}x${issue.viewport.height}`, issue.selector,
  ]);
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/**
 * Which check an issue came from (project, title path, check index), short and stable. A baseline entry keeps it, so a
 * later run can tell "this check ran and the issue did not come back" from "this check did not run".
 */
export function checkScope(scope: IdScope): string {
  const key = JSON.stringify([scope.project, scope.titlePath.map(t => t.replace(/\\/g, '/')), scope.checkIndex]);
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}

export interface BaselineEntry {
  id: string; rule: RuleId; test: string; project?: string; selector: string; mode: Mode; locale: string; viewport: string;
  /** The check that accepted it (`checkScope`). Files written before 0.8 have none: their entries are never called fixed. */
  check?: string;
}

export interface BaselineFile { version: 1; note: string; issues: BaselineEntry[] }

const NOTE = 'Accepted fitlocale issues: only issues not listed here fail the tests. Regenerate with: npx fitlocale baseline <results.json>';

/** The accepted entries, or null when the file does not exist yet. */
export function readBaselineEntries(file: string): BaselineEntry[] | null {
  if (file === '' || (existsSync(file) && statSync(file).isDirectory())) {
    throw new Error(`fitlocale: baseline option must be a file path, got "${file}"`);
  }
  if (!existsSync(file)) return null;
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`fitlocale: baseline file ${file} is not valid JSON: ${(err as Error).message}`, { cause: err });
  }
  const version = (data as { version?: unknown } | null)?.version;
  if (version !== undefined && version !== 1) {
    throw new Error(`fitlocale: baseline file ${file} has version ${String(version)}; this fitlocale reads version 1`);
  }
  const issues = (data as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(issues)) throw new Error(`fitlocale: baseline file ${file} has no "issues" list`);
  return issues.map(e => ({ ...(e as BaselineEntry), id: String((e as { id?: unknown })?.id) }));
}

/** The accepted issue ids, or null when the file does not exist yet. */
export function readBaseline(file: string): Set<string> | null {
  const entries = readBaselineEntries(file);
  return entries ? new Set(entries.map(e => e.id)) : null;
}

/** A baseline accepting every issue of these runs (several runs: one per shard). */
export function buildBaseline(runs: RunResults[]): BaselineFile {
  const byId = new Map<string, BaselineEntry>();
  for (const run of runs) {
    for (const check of run.checks) {
      for (const issue of check.issues) {
        if (!issue.id) throw new Error('fitlocale: results.json has issues without an id; re-run the tests with fitlocale 0.3 or newer');
        if (byId.has(issue.id)) continue;
        byId.set(issue.id, {
          id: issue.id, rule: issue.rule, test: `${check.testFile} › ${check.testTitle}`,
          ...(check.project ? { project: check.project } : {}),
          selector: issue.selector, mode: issue.mode, locale: issue.locale, viewport: `${issue.viewport.width}x${issue.viewport.height}`,
          ...(check.scope ? { check: check.scope } : {}),
        });
      }
    }
  }
  const issues = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { version: 1, note: NOTE, issues };
}

/** The file without the fixed entries; every other entry is kept as it is, in its order. Nothing is added. */
export function pruneBaseline(file: BaselineFile, fixed: Array<Pick<FixedEntry, 'id'>>): { file: BaselineFile; removed: number } {
  const drop = new Set(fixed.map(e => e.id));
  const issues = file.issues.filter(e => !drop.has(e.id));
  return { file: { ...file, issues }, removed: file.issues.length - issues.length };
}

/**
 * Upgrade entries written before entries knew their check: an entry whose issue a check in these runs found gets that
 * check's scope. Nothing is added; entries whose issue was not found (fixed, or its test did not run) stay as they are.
 */
export function recordChecks(file: BaselineFile, runs: Array<Pick<RunResults, 'checks'>>): { file: BaselineFile; recorded: number; without: number } {
  const scopeOf = new Map<string, string>();
  for (const run of runs) for (const check of run.checks ?? []) for (const issue of check.issues ?? []) if (issue.id && check.scope) scopeOf.set(issue.id, check.scope);
  let recorded = 0;
  const issues = file.issues.map(e => {
    if (e.check || !scopeOf.has(e.id)) return e;
    recorded++;
    return { ...e, check: scopeOf.get(e.id)! };
  });
  return { file: { ...file, issues }, recorded, without: issues.filter(e => !e.check).length };
}

/** Deterministic text, so the file diffs cleanly in pull requests. */
export function formatBaseline(file: BaselineFile): string {
  return JSON.stringify(file, null, 2) + '\n';
}

/**
 * Give every issue its id and, with a baseline path, mark accepted issues. Returns which issues count toward failing:
 * none while the baseline file does not exist yet, new ones once it does, all of them with the baseline off (`null`).
 */
export function applyBaseline(result: CheckResult, scope: IdScope, baselinePath: string | null): { counts: (issue: Issue) => boolean } {
  for (const issue of result.issues) issue.id = issueId(scope, issue);
  result.scope = checkScope(scope);
  if (baselinePath === null) return { counts: () => true };
  const entries = readBaselineEntries(baselinePath);
  result.baseline = { status: entries ? 'applied' : 'missing', path: relative(process.cwd(), baselinePath).split(sep).join('/') };
  if (!entries) return { counts: () => false };
  const accepted = new Set(entries.map(e => e.id));
  for (const issue of result.issues) issue.baselined = accepted.has(issue.id!);
  // Accepted in this very check, and not found in it now: fixed. Entries of other checks are not this check's to judge.
  const found = new Set(result.issues.map(i => i.id));
  result.baseline.fixed = entries.filter(e => e.check === result.scope && !found.has(e.id))
    // Only `id` and `check` are required in the file: the rest is for people, and may be missing from a hand-written entry.
    .map(e => ({
      id: e.id, rule: String(e.rule ?? '') as RuleId, test: String(e.test ?? ''), ...(e.project ? { project: String(e.project) } : {}),
      selector: String(e.selector ?? ''), mode: String(e.mode ?? '') as Mode, locale: String(e.locale ?? ''), viewport: String(e.viewport ?? ''),
    }));
  if (entries.some(e => !e.check)) result.baseline.legacy = true;
  return { counts: issue => !issue.baselined };
}

/** The message of a failing check: the issues that fail it, and how many more the baseline accepted. */
export function failureSummary(failing: Issue[], accepted: number, baselinePath?: string): string {
  const lines = [`fitlocale found ${failing.length} issue(s):`, ...failing.map(i => `  ${i.rule} ${i.selector} (${i.mode})`)];
  if (accepted > 0 && baselinePath) lines.push(`(${accepted} more accepted in ${baselinePath})`);
  return lines.join('\n');
}

const RANK: Record<Severity, number> = { info: 1, warning: 2, error: 3 };
const THRESHOLD: Record<'error' | 'warning' | 'never', number> = { error: 3, warning: 2, never: Infinity };

/** Set `issue.fails`: it counts (new, or baseline off) and reaches `failOn`. */
export function markFailing(issues: Issue[], counts: (issue: Issue) => boolean, failOn: 'error' | 'warning' | 'never'): void {
  for (const issue of issues) issue.fails = counts(issue) && RANK[issue.severity] >= THRESHOLD[failOn];
}
