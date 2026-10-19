import type { Issue, RunResults, Screenshot, Severity } from '../types';

const SEVERITIES: Severity[] = ['error', 'warning', 'info'];

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** results.json can be hand-edited or come from elsewhere: every value it supplies goes through here. */
const esc = (v: unknown) => escapeHtml(String(v));

const pct = (n: number, of: number) => `${+((n / of) * 100).toFixed(2)}%`;

interface Group { mode: string; viewport: string; locale?: string; issues: Issue[]; screenshot?: Screenshot }

function shot(group: Group): string {
  const s = group.screenshot;
  if (!s) return '';
  const boxes = group.issues.map(i =>
    `<div class="box ${esc(i.severity)}${i.baselined ? ' accepted' : ''}" title="${esc(`${i.rule} ${i.selector}`)}" style="left:${pct(i.box.x, s.size.width)};top:${pct(i.box.y, s.size.height)};width:${pct(i.box.width, s.size.width)};height:${pct(i.box.height, s.size.height)}"></div>`,
  ).join('');
  return `<div class="shot"><img src="${esc(s.path)}" alt="Screenshot, ${esc(group.mode)}">${boxes}</div>`;
}

function table(issues: Issue[]): string {
  const rows = issues.map(i => `<tr class="${esc(i.severity)}${i.baselined ? ' accepted' : ''}">
    <td><span class="sev">${esc(i.severity)}</span>${i.baselined ? ' <span class="tag">accepted</span>' : ''}</td><td><code>${esc(i.rule)}</code></td>
    <td><code>${esc(i.selector)}</code></td><td>${esc(i.message)}</td>
    <td>${esc(i.fix ?? '')}</td><td dir="auto">${esc(i.text)}</td></tr>`).join('');
  return `<table><thead><tr><th>Severity</th><th>Rule</th><th>Element</th><th>Problem</th><th>Fix</th><th>Text</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function sections(results: RunResults): string {
  const byUrl = new Map<string, Group[]>();
  for (const check of results.checks) {
    const groups = byUrl.get(check.url) ?? [];
    byUrl.set(check.url, groups);
    const local = new Map<string, Group>();
    for (const issue of check.issues) {
      const viewport = `${issue.viewport.width}×${issue.viewport.height}`;
      const id = `${issue.mode}|${viewport}|${issue.locale ?? ''}`;
      if (!local.has(id)) {
        const screenshot = check.screenshots.find(s =>
          s.mode === issue.mode && s.viewport.width === issue.viewport.width && s.viewport.height === issue.viewport.height);
        const group: Group = { mode: issue.mode, viewport, locale: issue.locale, issues: [], screenshot };
        local.set(id, group);
        groups.push(group);
      }
      local.get(id)!.issues.push(issue);
    }
  }
  return [...byUrl].filter(([, groups]) => groups.length).map(([url, groups]) => `<section>
    <h2>${esc(url)}</h2>
    ${groups.map(g => `<h3>${esc(g.mode)} · ${esc(g.viewport)}${g.locale ? ` · ${esc(g.locale)}` : ''}</h3>${shot(g)}${table(g.issues)}`).join('')}
  </section>`).join('');
}

/** A self-contained, offline HTML report. Screenshot paths are used as given (relative to the report). */
export function renderReport(results: RunResults): string {
  const total = SEVERITIES.reduce((n, s) => n + (Number(results.summary[s]) || 0), 0);
  const body = results.checks.some(c => c.issues.length)
    ? sections(results)
    : '<p class="empty">No localization layout issues found.</p>';
  const accepted = results.checks.reduce((n, c) => n + c.issues.filter(i => i.baselined).length, 0);
  const toggles = SEVERITIES.map(s =>
    `<label class="${s}"><input type="checkbox" checked data-sev="${s}"> ${esc(results.summary[s])} ${s}</label>`).join('')
    + (accepted ? `<label><input type="checkbox" checked data-sev="accepted"> ${accepted} accepted in the baseline</label>` : '');
  const counts = accepted ? ` · ${total - accepted} new · ${accepted} accepted` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>fitlocale report</title>
<style>
:root { --bg:#fff; --fg:#1d1d1f; --muted:#6e6e73; --line:#e5e5ea; --error:#d70015; --warning:#b25000; --info:#0060df; }
@media (prefers-color-scheme: dark) { :root { --bg:#161618; --fg:#f2f2f7; --muted:#a1a1a6; --line:#2c2c2e; --error:#ff6961; --warning:#ffb340; --info:#64a8ff; } }
body { margin:0; padding:24px 16px; background:var(--bg); color:var(--fg); font:14px/1.5 system-ui, sans-serif; }
main { max-width:1100px; margin:0 auto; }
h1 { font-size:22px; margin:0 0 4px; } h2 { font-size:17px; margin:32px 0 8px; word-break:break-all; } h3 { font-size:14px; color:var(--muted); margin:20px 0 8px; }
.meta { color:var(--muted); margin:0 0 16px; } .toggles { display:flex; gap:16px; flex-wrap:wrap; }
.shot { position:relative; border:1px solid var(--line); max-width:100%; } .shot img { display:block; width:100%; height:auto; }
.box { position:absolute; border:2px solid; box-sizing:border-box; box-shadow:0 0 0 1px #000, inset 0 0 0 1px #fff; } /* rings keep any colour visible on any background */ .box.error { border-color:var(--error); } .box.warning { border-color:var(--warning); } .box.info { border-color:var(--info); }
table { width:100%; border-collapse:collapse; margin:8px 0 0; display:block; overflow-x:auto; } th, td { text-align:start; vertical-align:top; padding:6px 8px; border-bottom:1px solid var(--line); }
.sev { font-weight:600; } tr.error .sev, label.error { color:var(--error); } tr.warning .sev, label.warning { color:var(--warning); } tr.info .sev, label.info { color:var(--info); }
.hide-error .error, .hide-warning .warning, .hide-info .info, .hide-accepted .accepted { display:none; } .empty { font-size:16px; }
.box.accepted { border-style:dashed; } tr.accepted td { opacity:.65; } .tag { font-size:12px; border:1px solid var(--line); border-radius:4px; padding:0 4px; color:var(--muted); }
</style></head>
<body><main>
<h1>fitlocale report</h1>
<p class="meta">${esc(total)} issue(s)${counts} · ${esc(results.createdAt)}</p>
<div class="toggles">${toggles}</div>
${body}
</main>
<script>
document.querySelectorAll('[data-sev]').forEach(function (box) {
  box.addEventListener('change', function () { document.body.classList.toggle('hide-' + box.dataset.sev, !box.checked); });
});
</script>
</body></html>
`;
}
