import type { RawIssue } from '../types';

const family = (issue: RawIssue) => issue.rule.split('/')[0];

/** Drop candidates whose element already had an issue of the same rule family in the source render. */
export function subtractSource(candidates: RawIssue[], source: RawIssue[]): RawIssue[] {
  const seen = new Set(source.map(s => `${family(s)}|${s.key}`));
  return candidates.filter(c => !seen.has(`${family(c)}|${c.key}`));
}
