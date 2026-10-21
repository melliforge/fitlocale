import type { RunResults, Severity } from '../types';
import { elementLabel } from './label';
import { buildModel } from './model';
import type { Page, Problem, ReportModel, Section, Shot } from './model';

const SEVERITIES: Severity[] = ['error', 'warning', 'info'];
/** Section links per rule row in the summary, and test titles per page; the rest are counted. */
const MAX_LINKS = 8;

const capped = (items: string[]) =>
  items.slice(0, MAX_LINKS).join(', ') + (items.length > MAX_LINKS ? ` and ${items.length - MAX_LINKS} more` : '');

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** results.json can be hand-edited or come from elsewhere: every value it supplies goes through here. */
const esc = (v: unknown) => escapeHtml(String(v));

const pct = (n: number, of: number) => `${+((n / of) * 100).toFixed(2)}%`;

const acceptedClass = (accepted: boolean | undefined) => (accepted === true ? ' accepted' : '');

/** Hand-edited results may lack `key` or `selector`; the label falls back instead of throwing. */
const labelOf = (issue: Problem['issue']) =>
  elementLabel({ key: String(issue.key ?? ''), selector: String(issue.selector ?? ''), text: issue.text, name: issue.name });

function elementCell(problem: Problem): string {
  const { label, kind, short } = labelOf(problem.issue);
  const span = `<span class="label" dir="auto">${esc(label)}</span>`;
  const code = kind === 'test-id' || kind === 'id' || kind === 'path';
  const count = problem.selectors.length > 1 ? ` · ${problem.selectors.length} elements` : '';
  const selectors = problem.selectors.map(s => `<code>${esc(s)}</code>`).join('');
  return `${code ? `<code>${span}</code>` : span}<details class="sel"><summary>${code || !short ? 'selector' : esc(short)}${count}</summary>${selectors}</details>`;
}

function seenIn(problem: Problem): string {
  const parts: string[] = [];
  if (problem.projects.length) parts.push(problem.projects.map(esc).join(', '));
  parts.push(problem.viewports.map(esc).join(', '));
  if (problem.occurrences.length > 1) parts.push(`${problem.occurrences.length}×`);
  return parts.join(' · ');
}

function row(problem: Problem): string {
  const { issue } = problem;
  const fix = issue.fix ? `<div class="fix">${esc(issue.fix)}</div>` : '';
  return `<tr class="problem ${esc(problem.severity)}${acceptedClass(problem.accepted)}" id="${esc(problem.id)}" data-rule="${esc(problem.rule)}" data-locale="${esc(problem.locale)}" data-projects="${esc(JSON.stringify(problem.projects))}">`
    + `<td><span class="sev">${esc(problem.severity)}</span>${problem.accepted ? ' <span class="tag">accepted</span>' : ''}</td>`
    + `<td><code>${esc(problem.rule)}</code></td><td>${elementCell(problem)}</td><td class="seen">${seenIn(problem)}</td>`
    + `<td>${esc(issue.message ?? '')}${fix}</td></tr>`;
}

function figure(section: Section, shot: Shot): string {
  const s = shot.screenshot;
  const boxes = shot.boxes.map(({ problem, issue }) =>
    `<span class="box ${esc(issue.severity)}${acceptedClass(issue.baselined)}" data-problem="${esc(problem)}" title="${esc(`${issue.rule} · ${labelOf(issue).label}`)}" style="left:${pct(issue.box.x, s.size.width)};top:${pct(issue.box.y, s.size.height)};width:${pct(issue.box.width, s.size.width)};height:${pct(issue.box.height, s.size.height)}"></span>`,
  ).join('');
  // Known dimensions reserve the thumbnail's height before a lazy image loads.
  const width = Number(s.size?.width), height = Number(s.size?.height);
  const size = width > 0 && height > 0 ? ` width="${esc(width)}" height="${esc(height)}"` : '';
  const caption = [shot.project, shot.viewport, shot.testTitle].filter(Boolean).map(esc).join(' · ');
  return `<figure class="shot-wrap" data-project="${esc(shot.project ?? '')}"><button type="button" class="shot" aria-expanded="false"><span class="frame">`
    + `<img src="${esc(s.path)}"${size} loading="lazy" decoding="async" alt="Screenshot, ${esc(section.label)} · ${esc(shot.viewport)}">${boxes}</span></button>`
    + `<figcaption>${caption}</figcaption></figure>`;
}

function section(s: Section): string {
  const shots = s.shots.length ? `<div class="shots">${s.shots.map(shot => figure(s, shot)).join('')}</div>` : '';
  return `<details class="section" open id="${esc(s.id)}"><summary><h3>${esc(s.label)}</h3> <span class="count">${s.problems.length} problem(s)</span></summary>
<div class="scroll"><table><thead><tr><th>Severity</th><th>Rule</th><th>Element</th><th>Seen in</th><th>Problem</th></tr></thead><tbody>
${s.problems.map(row).join('\n')}
</tbody></table></div>${shots}
</details>
`;
}

const problemsIn = (page: Page) => page.sections.reduce((n, s) => n + s.problems.length, 0);

function page(p: Page): string {
  const tests = p.tests.length ? `<p class="tests">${p.tests.length > 1 ? 'Tests' : 'Test'}: ${capped(p.tests.map(esc))}</p>\n` : '';
  return `<details class="page" open id="${esc(p.id)}"><summary><h2>${esc(p.label)}</h2> <span class="count">${problemsIn(p)} problem(s)</span></summary>
${tests}${p.sections.map(section).join('')}</details>
`;
}

function summary(model: ReportModel): string {
  const rules = model.rules.map(r => {
    const links = capped(r.sections.map(s => `<a href="#${esc(s.id)}">${esc(s.label)}</a>`));
    return `<tr class="${esc(r.severity)}"><td><span class="sev">${esc(r.severity)}</span></td>`
      + `<td><button type="button" class="pick" data-pick-rule="${esc(r.rule)}"><code>${esc(r.rule)}</code></button></td>`
      + `<td class="num">${r.problems}</td><td class="num">${r.occurrences}</td><td class="where">${links}</td></tr>`;
  }).join('\n');

  const unassigned = [...model.matrix.values()].some(m => m.has(''));
  const columns = model.projects.length ? [...model.projects, ...(unassigned ? [''] : [])] : [''];
  const heading = (project: string) => (project ? esc(project) : model.projects.length ? 'no project' : 'Problems');
  const matrix = model.locales.map(locale => `<tr><th scope="row">${locale ? esc(locale) : '—'}</th>${columns.map(project => {
    const n = model.matrix.get(locale)?.get(project) ?? 0;
    return `<td class="num">${n ? `<button type="button" class="pick" data-pick-locale="${esc(locale)}" data-pick-project="${esc(project)}">${n}</button>` : '<span class="zero">0</span>'}</td>`;
  }).join('')}</tr>`).join('\n');

  const index = model.pages.map(p => `<li><a href="#${esc(p.id)}">${esc(p.label)}</a> <span class="count">${problemsIn(p)}</span></li>`).join('');

  return `<section id="summary">
<div class="block rules-block"><h2 class="kicker">By rule</h2><div class="scroll"><table class="rules"><thead><tr><th>Severity</th><th>Rule</th><th class="num">Problems</th><th class="num">Issues</th><th>Where</th></tr></thead><tbody>
${rules}
</tbody></table></div></div>
<div class="block"><h2 class="kicker">By locale${model.projects.length ? ' and project' : ''}</h2><div class="scroll"><table class="matrix"><thead><tr><th>Locale</th>${columns.map(c => `<th class="num">${heading(c)}</th>`).join('')}</tr></thead><tbody>
${matrix}
</tbody></table></div></div>
<div class="block"><h2 class="kicker">Pages</h2><ol class="index">${index}</ol></div>
</section>
`;
}

function filter(name: string, label: string, values: string[]): string {
  if (values.length < 2) return '';
  const options = values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  return `<label>${label} <select data-filter="${name}"><option value="">All</option>${options}</select></label>`;
}

function controls(model: ReportModel): string {
  const accepted = model.pages.reduce((n, p) => n + p.sections.reduce((m, s) => m + s.problems.filter(x => x.accepted).length, 0), 0);
  const toggles = SEVERITIES.map(s =>
    `<label class="${s}"><input type="checkbox" checked data-sev="${s}"> ${model.bySeverity[s] ?? 0} ${s}</label>`).join('')
    + (accepted ? `<label><input type="checkbox" checked data-sev="accepted"> ${accepted} accepted in the baseline</label>` : '');
  const filters = filter('rule', 'Rule', model.rules.map(r => r.rule))
    + filter('locale', 'Locale', model.locales.filter(Boolean))
    + filter('project', 'Project', model.projects);
  return `<div class="bar"><div class="controls"><div class="toggles">${toggles}</div>
<div class="filters">${filters}<button type="button" data-fold="open">Expand all</button><button type="button" data-fold="close">Collapse all</button><button type="button" data-clear>Clear filters</button></div></div>
<p class="status" data-status></p></div>`;
}

/** A self-contained, offline HTML report. Screenshot paths are used as given (relative to the report). */
export function renderReport(results: RunResults): string {
  const model = buildModel(results);
  const total = SEVERITIES.reduce((n, s) => n + (Number(results.summary?.[s]) || 0), 0);
  const accepted = (results.checks ?? []).reduce((n, c) => n + (c.issues ?? []).filter(i => i.baselined).length, 0);
  const counts = accepted ? ` · ${total - accepted} new · ${accepted} accepted` : '';
  const body = model.problems
    ? `${controls(model)}\n${summary(model)}${model.pages.map(page).join('')}`
    : '<p class="empty">No localization layout issues found.</p>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>fitlocale report</title>
<style>
:root { color-scheme:light dark; --bg:#fff; --fg:#1d1d1f; --muted:#6e6e73; --line:#e5e5ea; --error:#d70015; --warning:#b25000; --info:#0060df; }
@media (prefers-color-scheme: dark) { :root { --bg:#161618; --fg:#f2f2f7; --muted:#a1a1a6; --line:#2c2c2e; --error:#ff6961; --warning:#ffb340; --info:#64a8ff; } }
body { margin:0; padding:24px 16px 48px; background:var(--bg); color:var(--fg); font:14px/1.5 system-ui, sans-serif; }
main { max-width:1100px; margin:0 auto; }
h1 { font-size:22px; margin:0 0 4px; } h2 { font-size:17px; margin:10px 0; word-break:break-all; } h3 { font-size:14px; margin:14px 0 6px; }
code { font:12.5px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
a { color:inherit; text-decoration-color:var(--line); text-underline-offset:3px; }
.meta { color:var(--muted); margin:0 0 12px; }
.bar { position:sticky; top:0; z-index:1; background:var(--bg); padding-top:8px; border-bottom:1px solid var(--line); }
.controls { display:flex; flex-wrap:wrap; align-items:center; gap:8px 32px; padding-bottom:8px; }
[hidden] { display:none !important; }
.page, .section, tr.problem { scroll-margin-top:96px; }
.toggles, .filters { display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; } .filters label { color:var(--muted); }
button, select { font:inherit; font-size:13px; color:inherit; }
button { background:none; border:1px solid var(--line); border-radius:6px; padding:2px 10px; cursor:pointer; }
select { background:var(--bg); border:1px solid var(--line); border-radius:6px; padding:2px 4px; max-width:16em; }
.status { color:var(--muted); font-size:13px; margin:0 0 8px; } .status:empty { display:none; }
#summary { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:16px 48px; margin:24px 0 32px; } .rules-block { grid-column:1 / -1; }
.kicker { font-size:12px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); margin:0 0 4px; word-break:normal; }
.pick { border:0; border-radius:0; padding:0; text-decoration:underline dotted var(--muted); text-underline-offset:3px; } .pick:hover { text-decoration-style:solid; }
.where { color:var(--muted); font-size:13px; } .zero { color:var(--line); } .index { margin:0; padding-left:1.6em; } .index li { padding:2px 0; }
.count { color:var(--muted); font-size:13px; font-weight:400; white-space:nowrap; }
.scroll { overflow-x:auto; } .scroll > table:not(.matrix) { min-width:600px; }
table { width:100%; border-collapse:collapse; } th, td { text-align:start; vertical-align:top; padding:6px 8px; border-bottom:1px solid var(--line); }
thead th { color:var(--muted); font-size:12px; font-weight:500; } tbody th { font-weight:400; } .num { text-align:end; font-variant-numeric:tabular-nums; }
.page { border-top:1px solid var(--line); margin-top:8px; } .section { margin:0 0 8px 20px; }
.page > summary, .section > summary { display:flex; align-items:baseline; gap:10px; cursor:pointer; list-style:none; }
.page > summary::-webkit-details-marker, .section > summary::-webkit-details-marker { display:none; }
.page > summary::before, .section > summary::before { content:'▸'; width:10px; color:var(--muted); font-size:12px; }
.page[open] > summary::before, .section[open] > summary::before { content:'▾'; }
.tests { color:var(--muted); font-size:13px; margin:-6px 0 4px 20px; }
.sev { font-weight:600; font-size:13px; } tr.error .sev, label.error { color:var(--error); } tr.warning .sev, label.warning { color:var(--warning); } tr.info .sev, label.info { color:var(--info); }
.sel { margin-top:2px; } .sel summary { color:var(--muted); font-size:12px; cursor:pointer; } .sel code { display:block; color:var(--muted); font-size:12px; word-break:break-all; margin-top:2px; }
.seen, .fix { color:var(--muted); font-size:13px; } .fix { margin-top:2px; }
.shots { display:flex; flex-wrap:wrap; align-items:flex-start; gap:16px; margin:14px 0 8px; }
.shot-wrap { width:240px; margin:0; } .shot-wrap.big { width:100%; }
.shot { display:block; width:100%; padding:0; border:1px solid var(--line); border-radius:4px; background:none; }
/* Cropping and zoom need the script; without it the whole screenshot stays reachable. */
.js .shot { max-height:360px; overflow:hidden; cursor:zoom-in; } .js .big .shot { max-height:none; cursor:zoom-out; }
.frame { position:relative; display:block; } .frame img { display:block; width:100%; height:auto; }
figcaption { color:var(--muted); font-size:12px; margin-top:4px; overflow-wrap:anywhere; }
.box { display:block; position:absolute; border:2px solid; box-sizing:border-box; box-shadow:0 0 0 1px #000, inset 0 0 0 1px #fff; } /* rings keep any colour visible on any background */ .box.error { border-color:var(--error); } .box.warning { border-color:var(--warning); } .box.info { border-color:var(--info); }
.box.accepted { border-style:dashed; } tr.accepted td { opacity:.65; } .tag { font-size:12px; border:1px solid var(--line); border-radius:4px; padding:0 4px; color:var(--muted); }
.empty { font-size:16px; }
</style></head>
<body><main>
<h1>fitlocale report</h1>
<p class="meta">${model.problems} problem(s) · ${esc(total)} issue(s)${counts} · ${esc(results.createdAt)}</p>
${body}
</main>
<script>
(function () {
  document.documentElement.classList.add('js');
  var all = function (selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); };
  var select = function (name) { return document.querySelector('select[data-filter="' + name + '"]'); };
  var value = function (name) { var s = select(name); return s ? s.value : ''; };
  var setValue = function (name, v) { var s = select(name); if (s) s.value = v; };
  var checks = all('[data-sev]');

  function visibleRow(row) {
    for (var i = 0; i < checks.length; i++) {
      if (!checks[i].checked && row.classList.contains(checks[i].getAttribute('data-sev'))) return false;
    }
    var rule = value('rule'), locale = value('locale'), project = value('project');
    if (rule && row.getAttribute('data-rule') !== rule) return false;
    if (locale && row.getAttribute('data-locale') !== locale) return false;
    return !project || JSON.parse(row.getAttribute('data-projects')).indexOf(project) >= 0;
  }

  function apply() {
    var rows = all('tr.problem'), shown = 0, project = value('project');
    rows.forEach(function (row) { row.hidden = !visibleRow(row); if (!row.hidden) shown++; });
    all('.box').forEach(function (box) {
      var row = document.getElementById(box.getAttribute('data-problem'));
      box.hidden = !!row && row.hidden;
    });
    all('figure.shot-wrap').forEach(function (fig) {
      var inProject = !project || fig.getAttribute('data-project') === project;
      fig.hidden = !(inProject && fig.querySelector('.box:not([hidden])'));
    });
    all('details.section, details.page').forEach(function (el) { el.hidden = !el.querySelector('tr.problem:not([hidden])'); });
    var status = document.querySelector('[data-status]');
    if (status) status.textContent = 'Showing ' + shown + ' of ' + rows.length + ' problems';
  }

  function isHidden(el) {
    for (; el; el = el.parentElement) if (el.hidden) return true;
    return false;
  }

  function reveal(target) {
    if (isHidden(target)) {
      // A filter hides the target: drop the select filters, then the toggles only if they still hide it.
      all('[data-filter]').forEach(function (s) { s.value = ''; });
      apply();
      if (isHidden(target)) {
        checks.forEach(function (box) { box.checked = true; });
        apply();
      }
    }
    for (var el = target; el; el = el.parentElement) if (el.tagName === 'DETAILS') el.open = true;
    target.scrollIntoView();
  }
  function revealHash(hash) {
    var target;
    try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch (e) { return; }
    if (target) reveal(target);
  }

  checks.forEach(function (box) { box.addEventListener('change', apply); });
  all('[data-filter]').forEach(function (s) { s.addEventListener('change', apply); });
  all('[data-pick-rule]').forEach(function (b) {
    b.addEventListener('click', function () { setValue('rule', b.getAttribute('data-pick-rule')); apply(); });
  });
  all('[data-pick-locale]').forEach(function (b) {
    b.addEventListener('click', function () {
      setValue('locale', b.getAttribute('data-pick-locale'));
      setValue('project', b.getAttribute('data-pick-project'));
      apply();
    });
  });
  all('[data-clear]').forEach(function (b) {
    b.addEventListener('click', function () {
      checks.forEach(function (box) { box.checked = true; });
      all('[data-filter]').forEach(function (s) { s.value = ''; });
      apply();
    });
  });
  all('[data-fold]').forEach(function (b) {
    b.addEventListener('click', function () {
      all('details.page, details.section').forEach(function (d) { d.open = b.getAttribute('data-fold') === 'open'; });
    });
  });
  all('.shot').forEach(function (b) {
    b.addEventListener('click', function () {
      var big = b.closest('.shot-wrap').classList.toggle('big');
      b.setAttribute('aria-expanded', String(big));
    });
  });
  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (link) revealHash(link.getAttribute('href'));
  });

  apply(); // a reload can restore the controls' state
  if (location.hash) revealHash(location.hash);
})();
</script>
</body></html>
`;
}
