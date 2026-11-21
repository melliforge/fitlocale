import type { FixedEntry, RunResults } from './types';

// Pure, with no Node built-ins: the HTML report renderer uses it too.

/**
 * Accepted issues that no longer occur, across runs (shards, retries, --repeat-each): listed as fixed by the check that
 * accepted them, and found by no check of any run. Sorted by id.
 */
export function fixedEntries(runs: Array<Pick<RunResults, 'checks'>>): FixedEntry[] {
  const found = new Set<string>();
  const fixed = new Map<string, FixedEntry>();
  for (const run of runs) {
    for (const check of run.checks ?? []) {
      for (const issue of check.issues ?? []) if (issue.id) found.add(issue.id);
      for (const e of check.baseline?.fixed ?? []) fixed.set(e.id, e);
    }
  }
  return [...fixed.values()].filter(e => !found.has(e.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
