import type { Issue, RunResults, Severity } from './types';

const ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** A table cell: one line, no column breaks, no HTML. */
const cell = (s: string) => s.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').replace(/</g, '&lt;');
/** A code-span cell: `<` is already literal inside code; backticks would end the span. */
const code = (s: string) => `\`${s.replace(/\s*\n\s*/g, ' ').replace(/`/g, "'").replace(/\|/g, '\\|')}\``;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** GitHub-flavoured Markdown for a job summary: counts, a baseline note, and a table of the new issues. */
export function renderSummary(results: RunResults, opts: { maxRows: number; resultsPath?: string }): string {
  const rows: Array<{ issue: Issue; test: string }> = [];
  const seen = new Set<string>();
  let accepted = 0;
  for (const check of results.checks) {
    for (const issue of check.issues) {
      // --repeat-each runs a test several times: one row per issue id.
      if (issue.id) {
        if (seen.has(issue.id)) continue;
        seen.add(issue.id);
      }
      if (issue.baselined) accepted++;
      else rows.push({ issue, test: `${check.testFile} › ${check.testTitle}` });
    }
  }
  // Results written before issues recorded whether they fail keep the older summary layout.
  const marked = rows.some(r => r.issue.fails !== undefined);
  rows.sort((a, b) => ORDER[a.issue.severity] - ORDER[b.issue.severity]);
  const count = (s: Severity) => rows.filter(r => r.issue.severity === s).length;
  const acceptedNote = accepted ? ` · ${accepted} accepted in the baseline` : '';

  const lines = ['## fitlocale', ''];
  const counts = `${plural(count('error'), 'new error', 'new errors')}, ${plural(count('warning'), 'new warning', 'new warnings')}, ${count('info')} new info`;
  if (!rows.length) lines.push(`**No new issues.**${acceptedNote}`);
  else if (marked) lines.push(`**${rows.filter(r => r.issue.fails).length} failing** · ${counts}${acceptedNote}`);
  else lines.push(`**${plural(count('error'), 'new error', 'new errors')}**, ${plural(count('warning'), 'new warning', 'new warnings')}, ${count('info')} new info${acceptedNote}`);
  const missing = results.checks.find(c => c.baseline?.status === 'missing')?.baseline;
  if (missing) {
    // --out: the tests look for the file relative to playwright.config, not where this command runs.
    const command = `npx fitlocale baseline ${opts.resultsPath ?? '<path to results.json>'} --out ${missing.path}`;
    lines.push('', `> No baseline file yet, so no test failed. Accept these issues with \`${command}\` and commit the file.`);
  }
  if (rows.length) {
    lines.push('', `| Severity | Rule | Element | Test | Locale | Mode | Viewport |${marked ? ' Fails |' : ''}`, `|---|---|---|---|---|---|---|${marked ? '---|' : ''}`);
    for (const { issue: i, test } of rows.slice(0, opts.maxRows)) {
      const fails = marked ? ` ${i.fails ? 'yes' : ''} |` : '';
      lines.push(`| ${i.severity} | ${code(i.rule)} | ${code(i.selector)} | ${cell(test)} | ${cell(i.locale)} | ${i.mode} | ${i.viewport.width}x${i.viewport.height} |${fails}`);
    }
    if (rows.length > opts.maxRows) lines.push('', `…and ${rows.length - opts.maxRows} more in the fitlocale report artifact.`);
  }
  return lines.join('\n') + '\n';
}
