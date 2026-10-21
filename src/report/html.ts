import type { RunResults, Severity } from '../types';
import { elementLabel } from './label';
import { buildModel } from './model';
import { HEAD_SCRIPT, SCRIPT } from './script';
import { STYLES } from './styles';
import type { Page, Problem, ReportModel, Section, Shot } from './model';

/** What `fitlocale/report` renders: the shape of results.json. */
export type { RunResults } from '../types';

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

/** A box's place on its screenshot, in percentages, so it follows the image at any size. */
const boxStyle = (issue: Problem['issue'], s: Shot['screenshot']) =>
  `left:${pct(issue.box.x + (s.origin?.x ?? 0), s.size.width)};top:${pct(issue.box.y + (s.origin?.y ?? 0), s.size.height)};width:${pct(issue.box.width, s.size.width)};height:${pct(issue.box.height, s.size.height)}`;

/** Known dimensions reserve the image's height before a lazy image loads. */
function imageSize(s: Shot['screenshot']): string {
  const width = Number(s.size?.width), height = Number(s.size?.height);
  return width > 0 && height > 0 ? ` width="${esc(width)}" height="${esc(height)}"` : '';
}

const captionOf = (shot: Shot) => [shot.project, shot.viewport, shot.testTitle].filter(Boolean).map(esc).join(' · ');

function figure(section: Section, shot: Shot): string {
  const s = shot.screenshot;
  const boxes = shot.boxes.map(({ problem, issue }) =>
    `<span class="box ${esc(issue.severity)}${acceptedClass(issue.baselined)}" data-problem="${esc(problem)}" title="${esc(`${issue.rule} · ${labelOf(issue).label}`)}" style="${boxStyle(issue, s)}"></span>`,
  ).join('');
  return `<figure class="shot-wrap" data-project="${esc(shot.project ?? '')}"><button type="button" class="shot" aria-expanded="false"><span class="frame">`
    + `<img src="${esc(s.path)}"${imageSize(s)} loading="lazy" decoding="async" alt="Screenshot, ${esc(section.label)} · ${esc(shot.viewport)}">${boxes}</span></button>`
    + `<figcaption>${captionOf(shot)}</figcaption></figure>`;
}

/* ---------- Problem detail: one hidden article per problem, shown one at a time by the script ---------- */

/** Ids of the problems that appear in some screenshot of the section. */
function problemsWithShots(section: Section): Set<string> {
  const ids = new Set<string>();
  for (const shot of section.shots) for (const box of shot.boxes) ids.add(box.problem);
  return ids;
}

/** `file:line`, preferring the source-mapped original over the built stylesheet. */
function cssSource(source: NonNullable<Problem['issue']['source']>): string {
  const at = source.original && source.original.url ? source.original : source;
  return `<li><code class="at">${esc(at.url)}:${esc(at.line)}</code>`
    + `<code class="decl">${esc(source.property)}: ${esc(source.value)} → ${esc(source.replacement)}</code>`
    + (source.selector ? `<span class="rule-sel">in <code>${esc(source.selector)}</code></span>` : '')
    + '</li>';
}

const block = (title: string, body: string) => `<div class="d-block"><h3 class="d-title">${title}</h3>${body}</div>`;

function detail(problem: Problem, section: Section, page: Page, hasShots: boolean): string {
  const { issue } = problem;
  const { label } = labelOf(issue);
  const text = String(issue.text ?? '').replace(/\s+/g, ' ').trim();
  const full = text && text !== label ? `<p class="d-text" dir="auto">${esc(text)}</p>` : '';
  const selectors = problem.selectors.map(s =>
    `<li><code>${esc(s)}</code><button type="button" class="copy" data-copy>Copy</button></li>`).join('');

  const list = [...new Set(problem.occurrences.flatMap(({ issue: i }) => (i.source ? [cssSource(i.source)] : [])))];
  const source = list.length
    ? block('CSS source', `<ul class="d-sources">${list.slice(0, MAX_LINKS).join('')}</ul>${list.length > MAX_LINKS ? `<p class="more">and ${list.length - MAX_LINKS} more</p>` : ''}`)
    : '';

  const tests = [...new Set(problem.occurrences.map(o => String(o.check.testTitle ?? '')))].filter(Boolean);
  const seen = [
    problem.projects.length ? `<dt>${problem.projects.length > 1 ? 'Projects' : 'Project'}</dt><dd>${problem.projects.map(esc).join(', ')}</dd>` : '',
    `<dt>${problem.viewports.length > 1 ? 'Viewports' : 'Viewport'}</dt><dd>${problem.viewports.map(esc).join(', ')}</dd>`,
    tests.length ? `<dt>${tests.length > 1 ? 'Tests' : 'Test'}</dt><dd>${capped(tests.map(esc))}</dd>` : '',
    `<dt>Issues</dt><dd>${problem.occurrences.length}</dd>`,
  ].join('');

  // The screenshots are not shipped twice: the script copies the section's figures into this block when the problem opens.
  const pictures = hasShots ? '<div class="d-block" data-shots hidden><h3 class="d-title">Screenshots</h3><div class="dshots"></div></div>' : '';

  return `<article class="detail" id="d-${esc(problem.id)}" data-section="${esc(section.id)}" hidden>`
    + `<p class="d-head ${esc(problem.severity)}"><span class="sev">${esc(problem.severity)}</span><code>${esc(problem.rule)}</code>${problem.accepted ? '<span class="tag">accepted</span>' : ''}</p>`
    + `<h2 class="d-label" dir="auto">${esc(label)}</h2>${full}`
    + `<p class="d-where"><a href="#${esc(section.id)}">${esc(page.label)} · ${esc(section.label)}</a></p>`
    + block(problem.selectors.length > 1 ? 'Selectors' : 'Selector', `<ul class="d-sels">${selectors}</ul>`)
    + block('Problem', `<p>${esc(issue.message ?? '')}</p>${issue.fix ? `<p class="d-fix"><strong>Fix:</strong> ${esc(issue.fix)}</p>` : ''}`)
    + source
    + block('Where it was seen', `<dl class="d-seen">${seen}</dl>`)
    + pictures
    + '</article>';
}

const ARROW_UP = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>';
const ARROW_DOWN = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const CROSS = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/** The right-hand panel: hidden until a problem is opened, and left out without the script. */
function panel(model: ReportModel): string {
  const articles: string[] = [];
  for (const p of model.pages) {
    for (const s of p.sections) {
      const withShots = problemsWithShots(s);
      for (const problem of s.problems) articles.push(detail(problem, s, p, withShots.has(problem.id)));
    }
  }
  return `<aside class="panel" aria-label="Problem detail" hidden>
<div class="panel-bar"><span class="panel-title">Problem</span><span class="sr" data-announce aria-live="polite"></span>`
    + `<button type="button" class="icon-btn" data-step="-1" aria-label="Previous problem" title="Previous problem (k)">${ARROW_UP}</button>`
    + `<button type="button" class="icon-btn" data-step="1" aria-label="Next problem" title="Next problem (j)">${ARROW_DOWN}</button>`
    + `<button type="button" class="icon-btn" data-close aria-label="Close" title="Close (Esc)">${CROSS}</button></div>
${articles.join('\n')}
</aside>`;
}

/** The shortcut help, toggled by ? or its button in the top bar. */
const KEYS_HELP = `<div class="keys" data-keys role="dialog" aria-label="Keyboard shortcuts" hidden><p class="group-title">Keyboard shortcuts</p><dl>`
  + [['j', 'Next problem'], ['k', 'Previous problem'], ['Enter', 'Open the selected problem'], ['Esc', 'Close the panel'], ['/', 'Search'], ['?', 'This help']]
    .map(([key, what]) => `<dt><kbd>${key}</kbd></dt><dd>${what}</dd>`).join('')
  + '</dl></div>';

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

const acceptedCount = (model: ReportModel) =>
  model.pages.reduce((n, p) => n + p.sections.reduce((m, s) => m + s.problems.filter(x => x.accepted).length, 0), 0);

const PLURAL: Record<string, string> = { error: 'errors', warning: 'warnings', info: 'info' };

function stats(model: ReportModel): string {
  const card = (key: string, label: string, n: number) =>
    `<div class="stat" data-stat="${key}"><span class="k">${label}</span><span class="n${n ? '' : ' zero'}">${n}</span></div>`;
  return `<div class="stats">${SEVERITIES.map(s => card(s, s === 'info' ? 'Info' : `${s[0].toUpperCase()}${s.slice(1)}s`, model.bySeverity[s] ?? 0)).join('')}`
    + `${card('accepted', 'Accepted', acceptedCount(model))}</div>`;
}

/** The overview: stat cards, then problems by rule and by locale × project. */
function overview(model: ReportModel, meta: string): string {
  const rules = model.rules.map(r => {
    const links = capped(r.sections.map(s => `<a href="#${esc(s.id)}">${esc(s.label)}</a>`));
    return `<tr class="${esc(r.severity)}"><td><span class="sev">${esc(r.severity)}</span></td>`
      + `<td><button type="button" class="pick" data-pick-rule="${esc(r.rule)}"><code>${esc(r.rule)}</code></button></td>`
      + `<td class="num">${r.problems}</td><td class="num">${r.occurrences}</td><td class="where">${links}</td></tr>`;
  }).join('\n');

  const unassigned = [...model.matrix.values()].some(m => m.has(''));
  const columns = model.projects.length ? [...model.projects, ...(unassigned ? [''] : [])] : [''];
  const heading = (project: string) => (project ? esc(project) : model.projects.length ? 'no project' : 'Problems');
  // A cell is a filter button when locale and project each name something to filter by. "No locale" and "no project"
  // are not options of the filters (an empty value there means All), so those cells are plain counts. Without
  // projects the project filter does not exist, and the cell sets the locale only.
  const matrix = model.locales.map(locale => `<tr><th scope="row">${locale ? esc(locale) : '—'}</th>${columns.map(project => {
    const n = model.matrix.get(locale)?.get(project) ?? 0;
    if (!n) return '<td class="num"><span class="zero">0</span></td>';
    const byProject = model.projects.length > 0;
    if (!locale || (byProject && !project)) return `<td class="num">${n}</td>`;
    const name = `${locale}${byProject ? ` in ${project}` : ''}: ${n} ${n === 1 ? 'problem' : 'problems'}`;
    return `<td class="num"><button type="button" class="pick" data-pick-locale="${esc(locale)}"${byProject ? ` data-pick-project="${esc(project)}"` : ''} aria-label="${esc(name)}">${n}</button></td>`;
  }).join('')}</tr>`).join('\n');

  return `<section id="summary">
<h1>Overview</h1>
${meta}
${stats(model)}
<div class="block"><h2 class="kicker">By rule</h2><div class="card scroll"><table class="rules"><thead><tr><th>Severity</th><th>Rule</th><th class="num">Problems</th><th class="num">Issues</th><th>Where</th></tr></thead><tbody>
${rules}
</tbody></table></div></div>
<div class="block"><h2 class="kicker">By locale${model.projects.length ? ' and project' : ''}</h2><div class="card scroll"><table class="matrix"><thead><tr><th>Locale</th>${columns.map(c => `<th class="num">${heading(c)}</th>`).join('')}</tr></thead><tbody>
${matrix}
</tbody></table></div></div>
</section>
`;
}

function filter(name: string, label: string, values: string[]): string {
  if (values.length < 2) return '';
  const options = values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  return `<label class="field"><span>${label}</span><select data-filter="${name}"><option value="">All</option>${options}</select></label>`;
}

const navLink = (id: string, label: string, count: number) =>
  `<a href="#${esc(id)}" data-nav="${esc(id)}" title="${esc(label)}"><span class="t" dir="auto">${esc(label)}</span><span class="n">${count}</span></a>`;

/** Filters, then navigation: the overview and a page → section tree. Static content without the script. */
function sidebar(model: ReportModel): string {
  const accepted = acceptedCount(model);
  const toggles = SEVERITIES.map(s => {
    const n = model.bySeverity[s] ?? 0;
    return `<label class="chip ${s}${n ? '' : ' none'}"><input type="checkbox" checked data-sev="${s}"> ${n} ${n === 1 ? s : PLURAL[s]}</label>`;
  }).join('');
  const base = accepted ? `<label class="chip base"><input type="checkbox" checked data-sev="accepted"> ${accepted} accepted in the baseline</label>` : '';
  const filters = filter('rule', 'Rule', model.rules.map(r => r.rule))
    + filter('locale', 'Locale', model.locales.filter(Boolean))
    + filter('project', 'Project', model.projects);
  const tree = model.pages.map(p => `<li class="pg">${navLink(p.id, p.label, problemsIn(p))}<ul>${
    p.sections.map(s => `<li>${navLink(s.id, s.label, s.problems.length)}</li>`).join('')}</ul></li>`).join('\n');
  return `<nav class="sidebar" id="sidebar" aria-label="Filters and pages">
<div class="group js-only"><p class="group-title">Severity</p><div class="chips">${toggles}${base}</div></div>
<div class="group js-only"><div class="group-head"><p class="group-title">Filters</p><button type="button" class="link-btn" data-clear>Clear filters</button></div>${filters}<p class="status" data-status></p></div>
<div class="group"><div class="group-head"><p class="group-title">Pages</p><span class="fold js-only"><button type="button" class="link-btn" data-fold="open">Expand all</button><button type="button" class="link-btn" data-fold="close">Collapse all</button></span></div>
<ul class="tree"><li class="pg"><a href="#summary">Overview</a></li>
${tree}
</ul></div>
</nav>`;
}

const ICONS = {
  search: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  filters: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  auto: '<svg class="i i-auto" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
  light: '<svg class="i i-light" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg class="i i-dark" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
};

/** `2026-10-19T08:30:00.000Z` → `2026-10-19 08:30 UTC`; anything else as given. */
function runDate(createdAt: unknown): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?Z$/.exec(String(createdAt ?? ''));
  return m ? `${m[1]} ${m[2]} UTC` : String(createdAt ?? '');
}

function topBar(hasProblems: boolean, date: string, createdAt: unknown): string {
  const tools = hasProblems
    ? `<button type="button" class="icon-btn drawer-btn" data-drawer aria-controls="sidebar" aria-expanded="false">${ICONS.filters}<span>Filters</span></button>
<label class="search">${ICONS.search}<span class="sr">Search problems</span><input type="search" data-search placeholder="Search problems" aria-describedby="search-help" autocomplete="off" spellcheck="false"><span class="hint" aria-hidden="true"><kbd>rule:</kbd><kbd>locale:</kbd><kbd>is:new</kbd></span></label>
<span class="sr" id="search-help">Free text, or tokens: rule:, locale:, project:, sev:, is:new, is:accepted.</span>`
    : '';
  return `<header class="bar">
<div class="brand"><span class="logo" aria-hidden="true">fl</span><span class="name">fitlocale</span><span class="kind">report</span></div>
<div class="bar-main">${tools}<span class="spacer"></span>${date ? `<time class="date" datetime="${esc(createdAt)}">${esc(date)}</time>` : ''}
${hasProblems ? `<button type="button" class="icon-btn keys-btn" data-keys-toggle aria-expanded="false" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)"><kbd>?</kbd></button>` : ''}
<button type="button" class="icon-btn theme" data-theme-toggle aria-label="Theme">${ICONS.auto}${ICONS.light}${ICONS.dark}</button></div>
${hasProblems ? KEYS_HELP : ''}
</header>`;
}

/** A self-contained, offline HTML report. Screenshot paths are used as given (relative to the report). */
export function renderReport(results: RunResults): string {
  const model = buildModel(results);
  const total = SEVERITIES.reduce((n, s) => n + (Number(results.summary?.[s]) || 0), 0);
  const accepted = (results.checks ?? []).reduce((n, c) => n + (c.issues ?? []).filter(i => i.baselined).length, 0);
  const counts = accepted ? ` · ${total - accepted} new · ${accepted} accepted` : '';
  const date = runDate(results.createdAt);
  const when = date ? `<span class="when"> · ${esc(date)}</span>` : '';
  const meta = `<p class="meta">${model.problems} problem(s) · ${esc(total)} issue(s)${counts}${when}</p>`;
  const body = model.problems
    ? `${sidebar(model)}
<div class="scrim" data-scrim hidden></div>
<main id="main"><div class="content">
${overview(model, meta)}<div class="problems">
${model.pages.map(page).join('')}</div>
</div></main>
${panel(model)}`
    : `<main id="main"><div class="content">
<h1>Overview</h1>
${meta}
<p class="empty">No localization layout issues found.</p>
</div></main>`;
  return `<!doctype html>
<html lang="en"${model.problems ? '' : ' class="no-side"'}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>fitlocale report</title>
<script>${HEAD_SCRIPT}</script>
<style>${STYLES}</style></head>
<body>
${topBar(model.problems > 0, date, results.createdAt)}
<div class="layout">
${body}
</div>
<script>${SCRIPT}</script>
</body></html>
`;
}
