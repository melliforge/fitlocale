import type { Issue, RunResults } from '../types';

/** Ported from fitlocale cloud's renderer (same author, now MIT). Nothing here uses Node. */

export type Listed = { issue: Issue; project?: string };

/** The first line of every fitlocale comment: how a later run finds it again. */
export const MARKER = '<!-- fitlocale -->';
export const MAX_LISTED = 10;
const RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };

const ZWSP = '​';
const entity = (c: string) => `&#${c.charCodeAt(0)};`;

/** Newlines fold to spaces; long text is cut (before escaping, so the comment's size stays bounded). */
function cut(value: unknown, max: number): string {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Text from results.json is untrusted (a fork's pull request writes it). Checked against GitHub's own renderer:
 * - Entities stop tags, Markdown links and images, code spans and table cells. They also stop URL autolinks: an
 *   escaped `:` ends `https://`, and an escaped `.` before a letter ends `www.`. Both autolink even inside <code>.
 * - GitHub links mentions and issue references on decoded text, so an entity is not enough there: a zero-width space
 *   breaks `@org`, `#7`, `owner/repo#7` and `GH-5`, and zero-width spaces around `$` stop inline math.
 */
export function inert(value: unknown, max = 300): string {
  return cut(value, max).replace(/[&<>"'`|[\]()*_~\\!=:]|\.(?=\S)|[@#]|-(?=\d)|\$/g, c =>
    c === '@' || c === '#' || c === '-' ? c + ZWSP : c === '$' ? ZWSP + c + ZWSP : entity(c));
}

/**
 * For text inside <code>: GitHub links no issue reference or math there, so a selector keeps its `#`, `-` and `$` as
 * typed (and can be copied). URLs still autolink inside <code>, so `:` and `.` are escaped; `@` is broken as outside.
 */
const inertCode = (value: unknown, max: number) =>
  cut(value, max).replace(/[&<>"'`|[\]()*_~\\!=:]|\.(?=\S)|@/g, c => (c === '@' ? c + ZWSP : entity(c)));

/** A URL that cannot leave the Markdown link it sits in. */
const linkUrl = (url: string) => url.replace(/[\s"()<>]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);

/** Issues not accepted in the baseline, each once (a re-run reports the same ids), errors first, in report order within a severity. */
export function newIssues(results: Pick<RunResults, 'checks'>): Listed[] {
  const all: Listed[] = [];
  const seen = new Set<string>();
  for (const check of results.checks ?? []) {
    for (const issue of check.issues ?? []) {
      if (issue.baselined === true) continue;
      const key = issue.id ?? JSON.stringify([check.project, check.testFile, check.testTitle, check.checkIndex, issue.rule, issue.selector, issue.mode, issue.locale, issue.viewport]);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({ issue, project: check.project });
    }
  }
  return all.map((l, i) => ({ l, i }))
    .sort((a, b) => (RANK[a.l.issue.severity] ?? 3) - (RANK[b.l.issue.severity] ?? 3) || a.i - b.i)
    .map(x => x.l);
}

function counts(listed: Listed[]): string {
  const n = (s: string) => listed.filter(l => l.issue.severity === s).length;
  const parts = [
    n('error') && `${n('error')} error${n('error') === 1 ? '' : 's'}`,
    n('warning') && `${n('warning')} warning${n('warning') === 1 ? '' : 's'}`,
    n('info') && `${n('info')} info`,
  ].filter(Boolean);
  return `${listed.length} new issue${listed.length === 1 ? '' : 's'}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

export interface CommentOptions {
  /** Where the full report is: the artifact, or the workflow run. */
  reportUrl: string;
  reportLabel: string;
  /** The pull request's head commit; empty when unknown. */
  sha: string;
  /** A comment of ours already exists on the pull request. */
  previous: boolean;
  /** Accepted issues that no longer occur, and the baseline file they are in. */
  fixed?: number;
  baselinePath?: string;
}

/** The pull request comment, or null when there is nothing to say (nothing new, and no comment to update). */
export function renderComment(results: Pick<RunResults, 'checks'>, o: CommentOptions): string | null {
  const listed = newIssues(results);
  if (!listed.length && !o.previous) return null;
  const lines = [MARKER];
  if (!listed.length) {
    lines.push('**fitlocale:** All clear: no new issues since the last run.');
  } else {
    lines.push(`**fitlocale:** ${counts(listed)}`, '', '| Issue |', '|---|');
    for (const l of listed.slice(0, MAX_LISTED)) {
      const i = l.issue;
      const where = [i.locale, i.mode, i.viewport ? `${i.viewport.width}×${i.viewport.height}` : '', l.project].filter(Boolean).map(v => inert(v, 60)).join(' · ');
      const fix = i.fix ? `<br><i>Fix:</i> ${inert(i.fix)}` : '';
      lines.push(`| <b><code>${inertCode(i.rule, 60)}</code></b> · ${where}<br><code>${inertCode(i.selector, 120)}</code> ${inert(i.message)}${fix} |`);
    }
    if (listed.length > MAX_LISTED) lines.push('', `…and ${listed.length - MAX_LISTED} more in the full report.`);
  }
  if (o.fixed) {
    // The path comes from results.json (a fork's, maybe): only a plain path goes into the command.
    const path = o.baselinePath && /^[\w./-]{1,200}$/.test(o.baselinePath) ? o.baselinePath : 'fitlocale-baseline.json';
    lines.push('', `${o.fixed} accepted issue(s) no longer occur: drop them with \`npx fitlocale baseline --prune <results.json> --out ${path}\` (the job summary has the exact command).`);
  }
  const sha = inert(o.sha.slice(0, 7), 7);
  lines.push('', `Full report: [${inert(o.reportLabel, 60)}](${linkUrl(o.reportUrl)})`, '', sha ? `<sub>fitlocale · commit <code>${sha}</code></sub>` : '<sub>fitlocale</sub>');
  return lines.join('\n');
}
