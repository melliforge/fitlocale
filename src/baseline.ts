import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import type { CheckResult, Issue, Mode, RuleId, RunResults } from './types';

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

export interface BaselineEntry {
  id: string; rule: RuleId; test: string; project?: string; selector: string; mode: Mode; locale: string; viewport: string;
}

export interface BaselineFile { version: 1; note: string; issues: BaselineEntry[] }

const NOTE = 'Accepted fitlocale issues: only issues not listed here fail the tests. Regenerate with: npx fitlocale baseline <results.json>';

/** The accepted issue ids, or null when the file does not exist yet. */
export function readBaseline(file: string): Set<string> | null {
  if (!existsSync(file)) return null;
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`fitlocale: baseline file ${file} is not valid JSON: ${(err as Error).message}`, { cause: err });
  }
  const issues = (data as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(issues)) throw new Error(`fitlocale: baseline file ${file} has no "issues" list`);
  return new Set(issues.map(e => String((e as { id?: unknown })?.id)));
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
        });
      }
    }
  }
  const issues = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { version: 1, note: NOTE, issues };
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
  if (baselinePath === null) return { counts: () => true };
  const accepted = readBaseline(baselinePath);
  result.baseline = { status: accepted ? 'applied' : 'missing', path: relative(process.cwd(), baselinePath).split(sep).join('/') };
  if (!accepted) return { counts: () => false };
  for (const issue of result.issues) issue.baselined = accepted.has(issue.id!);
  return { counts: issue => !issue.baselined };
}

/** The message of a failing check: the issues that fail it, and how many more the baseline accepted. */
export function failureSummary(failing: Issue[], accepted: number, baselinePath?: string): string {
  const lines = [`fitlocale found ${failing.length} issue(s):`, ...failing.map(i => `  ${i.rule} ${i.selector} (${i.mode})`)];
  if (accepted > 0 && baselinePath) lines.push(`(${accepted} more accepted in ${baselinePath})`);
  return lines.join('\n');
}
