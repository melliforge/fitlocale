/**
 * The report's CSS, inlined by `renderReport`. Theme tokens are the docs site's (VitePress default theme), so the
 * report looks like the docs. No external fonts or URLs: the report is one offline file.
 *
 * Keep the text free of a space followed by the word for baselined problems: a unit test checks that a report
 * without any shows none, so the related selectors are written `tr.accepted`, `.box.accepted`, `[data-stat=…]`.
 */
const LIGHT = `
  --bg:#ffffff; --bg-alt:#f6f6f7; --bg-soft:#f6f6f7; --bg-elv:#ffffff;
  --divider:#e2e2e3; --border:#c2c2c4;
  --text-1:#3c3c43; --text-2:#67676c; --text-3:#929295;
  --brand:#3451b2; --brand-2:#3a5ccc; --brand-soft:rgba(100,108,255,.14);
  --red:#b8272c; --red-soft:rgba(244,63,94,.14);
  --yellow:#915930; --yellow-soft:rgba(234,179,8,.14);
  --gray-soft:rgba(142,150,170,.14);
  --shadow:0 12px 32px rgba(0,0,0,.1), 0 2px 6px rgba(0,0,0,.08);
  --scrim:rgba(0,0,0,.6);`;

const DARK = `
  --bg:#1b1b1f; --bg-alt:#161618; --bg-soft:#202127; --bg-elv:#202127;
  --divider:#2e2e32; --border:#3c3f44;
  --text-1:#dfdfd6; --text-2:#98989f; --text-3:#6a6a71;
  --brand:#a8b1ff; --brand-2:#5c73e7; --brand-soft:rgba(100,108,255,.16);
  --red:#f66f81; --red-soft:rgba(244,63,94,.16);
  --yellow:#f9b44e; --yellow-soft:rgba(234,179,8,.16);
  --gray-soft:rgba(101,117,133,.16);
  --shadow:0 12px 32px rgba(0,0,0,.4), 0 2px 6px rgba(0,0,0,.3);
  --scrim:rgba(0,0,0,.6);`;

export const STYLES = `
:root { color-scheme:light dark;${LIGHT}
  --error:var(--red); --error-soft:var(--red-soft); --warning:var(--yellow); --warning-soft:var(--yellow-soft); --info:var(--brand); --info-soft:var(--brand-soft);
  --font:"Inter", ui-sans-serif, system-ui, sans-serif; --mono:ui-monospace, Menlo, Monaco, Consolas, monospace;
  --nav:64px; --side:272px; }
:root[data-theme="light"] { color-scheme:light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme:dark;${DARK} } }
:root[data-theme="dark"] { color-scheme:dark;${DARK} }

*, *::before, *::after { box-sizing:border-box; }
html { -webkit-text-size-adjust:100%; }
body { margin:0; background:var(--bg); color:var(--text-1); font:14px/1.6 var(--font); -webkit-font-smoothing:antialiased; }
[hidden] { display:none !important; }
/* Controls that need the script are left out without it; the navigation stays. */
:root:not(.js) .js-only { display:none !important; }
a { color:var(--brand); text-decoration:underline; text-underline-offset:2px; text-decoration-thickness:1px; }
a:hover { color:var(--brand-2); }
code { font:12.5px/1.5 var(--mono); }
button, select, input { font:inherit; color:inherit; }
button { cursor:pointer; }
:focus-visible { outline:2px solid var(--brand); outline-offset:2px; }
.sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
svg.i { width:16px; height:16px; flex:none; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }

/* Top bar */
.bar { position:sticky; top:0; z-index:20; display:flex; height:var(--nav); background:var(--bg); }
.brand { display:flex; align-items:center; gap:10px; flex:none; width:var(--side); padding:0 32px; background:var(--bg-alt); font-size:16px; font-weight:600; color:var(--text-1); white-space:nowrap; }
.logo { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:6px; background:#1f6feb; color:#fff; font-size:12px; font-weight:700; letter-spacing:-.02em; }
.brand .kind { font-weight:500; color:var(--text-2); }
.bar-main { display:flex; align-items:center; gap:12px; flex:1; min-width:0; padding:0 32px; border-bottom:1px solid var(--divider); }
.no-side .brand { background:none; width:auto; padding-right:0; }
.no-side .bar { border-bottom:1px solid var(--divider); } .no-side .bar-main { border-bottom:0; }
.search { display:none; align-items:center; gap:8px; flex:0 1 400px; min-width:0; height:40px; padding:0 12px; border:1px solid transparent; border-radius:8px; background:var(--bg-alt); color:var(--text-2); transition:border-color .25s; }
.js .search { display:flex; }
.search:hover, .search:focus-within { border-color:var(--brand); }
.search input { flex:1; min-width:0; height:100%; border:0; outline:0; background:none; color:var(--text-1); font-size:14px; }
.search input::placeholder { color:var(--text-3); }
.search input::-webkit-search-cancel-button { cursor:pointer; }
.hint { display:none; gap:4px; flex:none; }
.search input:placeholder-shown + .hint { display:flex; }
kbd { padding:0 5px; border:1px solid var(--divider); border-radius:4px; background:var(--bg); color:var(--text-2); font:11px/18px var(--mono); }
.spacer { flex:1; }
.date { color:var(--text-2); font-size:13px; white-space:nowrap; font-variant-numeric:tabular-nums; }
.icon-btn { display:none; flex:none; align-items:center; justify-content:center; gap:6px; height:36px; min-width:36px; padding:0 8px; border:1px solid var(--divider); border-radius:8px; background:var(--bg); color:var(--text-2); transition:color .25s, border-color .25s; }
.icon-btn:hover { color:var(--text-1); border-color:var(--border); }
.js .theme { display:inline-flex; }
.theme svg { display:none; }
:root:not([data-theme]) .theme .i-auto, :root[data-theme="light"] .theme .i-light, :root[data-theme="dark"] .theme .i-dark { display:block; }

/* Layout */
.layout { display:grid; grid-template-columns:var(--side) minmax(0, 1fr); align-items:start; }
.no-side .layout { display:block; }
.sidebar { position:sticky; top:var(--nav); height:calc(100vh - var(--nav)); overflow-y:auto; overscroll-behavior:contain; padding:8px 32px 96px; background:var(--bg-alt); }
main { min-width:0; }
.content { max-width:1024px; margin:0 auto; padding:40px 32px 128px; }
.scrim { display:none; }

/* Sidebar */
.group { padding:16px 0; border-top:1px solid var(--divider); }
.group:first-child, :root:not(.js) .group.js-only + .group.js-only + .group { border-top:0; }
.group-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0 0 8px; }
.group-title { margin:0; font-size:14px; font-weight:700; color:var(--text-1); }
.chips { display:flex; flex-direction:column; gap:2px; }
.chip { display:flex; align-items:center; gap:10px; padding:4px 8px; border-radius:6px; color:var(--text-2); font-size:14px; line-height:22px; cursor:pointer; user-select:none; font-variant-numeric:tabular-nums; transition:background-color .25s, color .25s; }
.chip:hover { background:var(--gray-soft); color:var(--text-1); }
.chip input { flex:none; margin:0; width:14px; height:14px; cursor:pointer; accent-color:var(--c); }
.chip.error { --c:var(--error); } .chip.warning { --c:var(--warning); } .chip.info { --c:var(--info); } .chip.base { --c:var(--text-2); }
.chip.none { color:var(--text-3); }
.chip.base { margin-top:6px; }
.field { display:flex; flex-direction:column; gap:2px; margin-top:10px; color:var(--text-2); font-size:12px; font-weight:500; }
.field select { width:100%; height:32px; padding:0 8px; border:1px solid var(--divider); border-radius:6px; background:var(--bg); color:var(--text-1); font-size:13px; }
.field select:hover { border-color:var(--border); }
.status { margin:12px 0 0; color:var(--text-2); font-size:12px; font-variant-numeric:tabular-nums; } .status:empty { display:none; }
.link-btn { padding:0; border:0; background:none; color:var(--brand); font-size:12px; font-weight:500; white-space:nowrap; }
.link-btn:hover { color:var(--brand-2); text-decoration:underline; text-underline-offset:2px; }
.fold { display:flex; gap:10px; }
.tree, .tree ul { list-style:none; margin:0; padding:0; }
.tree ul { margin:2px 0 6px 8px; padding-left:10px; border-left:1px solid var(--divider); }
.tree a { display:flex; align-items:baseline; gap:8px; padding:3px 0; color:var(--text-2); font-size:14px; line-height:22px; text-decoration:none; transition:color .25s; }
.tree ul a { font-size:13px; }
.tree a:hover { color:var(--text-1); }
.tree a[aria-current="true"] { color:var(--brand); font-weight:500; }
.tree .t { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tree .pg > a { color:var(--text-1); font-weight:500; }
.tree .pg > a[aria-current="true"] { color:var(--brand); } /* the Overview link, a top-level entry */
.tree .n { flex:none; color:var(--text-3); font-size:12px; font-weight:400; font-variant-numeric:tabular-nums; }

/* Overview */
h1 { margin:0; font-size:32px; line-height:40px; font-weight:600; letter-spacing:-.02em; color:var(--text-1); }
.meta { margin:8px 0 0; color:var(--text-2); font-size:14px; }
.stats { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px; margin:28px 0 8px; }
.stat { padding:16px 20px; border:1px solid var(--divider); border-radius:8px; background:var(--bg-soft); }
.stat .k { display:flex; align-items:center; gap:8px; color:var(--text-2); font-size:13px; font-weight:500; }
.stat .k::before { content:''; width:8px; height:8px; border-radius:50%; background:var(--c, var(--text-3)); }
.stat .n { display:block; margin-top:4px; font-size:28px; line-height:36px; font-weight:600; letter-spacing:-.02em; color:var(--c, var(--text-1)); font-variant-numeric:tabular-nums; }
.stat[data-stat="error"] { --c:var(--error); } .stat[data-stat="warning"] { --c:var(--warning); } .stat[data-stat="info"] { --c:var(--info); }
.stat .zero { color:var(--text-3); }
.block { margin-top:40px; }
.kicker { margin:0 0 12px; font-size:13px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--text-2); }
.card { border:1px solid var(--divider); border-radius:8px; background:var(--bg); overflow:hidden; }
.scroll { overflow-x:auto; }
.scroll > table:not(.matrix) { min-width:640px; }
.matrix { width:auto; min-width:100%; }

/* Tables */
table { width:100%; border-collapse:collapse; }
th, td { padding:10px 16px; text-align:start; vertical-align:top; border-top:1px solid var(--divider); }
thead th { border-top:0; background:var(--bg-soft); color:var(--text-2); font-size:12px; font-weight:600; white-space:nowrap; }
tbody th { font-weight:500; }
.num { text-align:end; font-variant-numeric:tabular-nums; }
.where { min-width:240px; color:var(--text-2); font-size:13px; }
.zero { color:var(--text-3); }
.pick { padding:0; border:0; background:none; color:var(--brand); font-weight:500; font-variant-numeric:tabular-nums; }
.pick:hover { color:var(--brand-2); text-decoration:underline; text-underline-offset:2px; }
td code, .pick code { padding:2px 6px; border-radius:4px; background:var(--gray-soft); color:var(--text-1); font-size:12.5px; white-space:nowrap; }
.pick code { color:var(--brand); }
.sev { display:inline-block; padding:0 8px; border-radius:999px; font-size:12px; font-weight:600; line-height:20px; background:var(--gray-soft); color:var(--text-2); }
tr.error .sev { background:var(--error-soft); color:var(--error); } tr.warning .sev { background:var(--warning-soft); color:var(--warning); } tr.info .sev { background:var(--info-soft); color:var(--info); }
.tag { display:inline-block; margin-top:4px; padding:0 6px; border:1px solid var(--divider); border-radius:4px; color:var(--text-2); font-size:11px; line-height:18px; }
tr.accepted td { opacity:.6; }

/* Pages and sections */
.problems { margin-top:56px; }
.page { margin-top:40px; padding-top:24px; border-top:1px solid var(--divider); }
.page > summary, .section > summary { display:flex; align-items:center; gap:10px; cursor:pointer; list-style:none; }
.page > summary::-webkit-details-marker, .section > summary::-webkit-details-marker { display:none; }
.page > summary::before, .section > summary::before { content:''; flex:none; width:7px; height:7px; margin:0 4px 0 2px; border-right:1.5px solid var(--text-3); border-bottom:1.5px solid var(--text-3); transform:rotate(-45deg); transition:transform .2s; }
.page[open] > summary::before, .section[open] > summary::before { transform:rotate(45deg); }
h2 { margin:0; font-size:22px; line-height:32px; font-weight:600; letter-spacing:-.01em; color:var(--text-1); overflow-wrap:anywhere; }
h2.kicker { font-size:13px; line-height:inherit; letter-spacing:.04em; color:var(--text-2); }
h3 { margin:0; font-size:15px; font-weight:600; color:var(--text-1); overflow-wrap:anywhere; }
summary > h2, summary > h3 { min-width:0; }
.count { margin-inline-start:auto; padding:0 8px; border-radius:999px; background:var(--gray-soft); color:var(--text-2); font-size:12px; font-weight:500; line-height:20px; white-space:nowrap; font-variant-numeric:tabular-nums; }
.tests { margin:6px 0 0 26px; color:var(--text-2); font-size:13px; }
.section { margin-top:16px; border:1px solid var(--divider); border-radius:8px; background:var(--bg); }
.section > summary { padding:12px 16px; border-radius:8px; }
.section[open] > summary { border-bottom:1px solid var(--divider); border-radius:8px 8px 0 0; background:var(--bg-soft); }
.page, .section, tr.problem, #summary { scroll-margin-top:calc(var(--nav) + 16px); }
.label { overflow-wrap:anywhere; font-weight:500; }
.sel { margin-top:4px; }
.sel summary { color:var(--text-3); font-size:12px; cursor:pointer; }
.sel summary:hover { color:var(--text-2); }
.sel code { display:block; margin-top:4px; padding:0; background:none; color:var(--text-2); font-size:12px; white-space:normal; word-break:break-all; }
.seen, .fix { color:var(--text-2); font-size:13px; }
.fix { margin-top:4px; }
.shots { display:flex; flex-wrap:wrap; align-items:flex-start; gap:16px; margin:0 16px; padding:16px 0; border-top:1px solid var(--divider); }
.shot-wrap { width:240px; margin:0; } .shot-wrap.big { width:100%; }
.shot { display:block; width:100%; padding:0; border:1px solid var(--divider); border-radius:8px; background:var(--bg-soft); cursor:default; }
/* Cropping and zoom need the script; without it the whole screenshot stays reachable. */
.js .shot { max-height:360px; overflow:hidden; cursor:zoom-in; transition:border-color .25s; } .js .shot:hover { border-color:var(--border); } .js .big .shot { max-height:none; cursor:zoom-out; }
.frame { position:relative; display:block; } .frame img { display:block; width:100%; height:auto; }
figcaption { margin-top:6px; color:var(--text-2); font-size:12px; overflow-wrap:anywhere; }
.box { display:block; position:absolute; border:2px solid; box-shadow:0 0 0 1px #000, inset 0 0 0 1px #fff; } /* rings keep any colour visible on any background */
.box.error { border-color:var(--error); } .box.warning { border-color:var(--warning); } .box.info { border-color:var(--info); }
.box.accepted { border-style:dashed; }
.empty { margin-top:24px; font-size:16px; color:var(--text-2); }
.when { display:none; }

/* Narrow screens: the sidebar becomes a drawer (only with the script; without it, it stays above the content). */
@media (max-width: 959px) {
  .brand { width:auto; padding:0 0 0 16px; background:none; }
  .bar { border-bottom:1px solid var(--divider); } .bar-main { padding:0 16px 0 4px; border-bottom:0; gap:8px; }
  .layout { display:block; }
  .sidebar { position:static; height:auto; overflow:visible; padding:8px 16px 16px; }
  .content { padding:24px 16px 96px; }
  .js .drawer-btn { display:inline-flex; }
  .search input:placeholder-shown + .hint { display:none; }
  .js .sidebar { position:fixed; z-index:30; top:var(--nav); bottom:0; left:0; width:min(320px, 86vw); height:auto; overflow-y:auto; padding:8px 24px 48px; box-shadow:var(--shadow); transform:translateX(-100%); visibility:hidden; transition:transform .25s ease, visibility .25s; }
  /* Visible at once on opening, so focus can move into it; hidden only after the slide-out. */
  .js.drawer-open .sidebar { transform:none; visibility:visible; transition:transform .25s ease, visibility 0s; }
  .js .scrim { display:block; position:fixed; z-index:25; inset:var(--nav) 0 0 0; background:var(--scrim); }
  .js .scrim[hidden] { display:none !important; }
}
@media (max-width: 767px) {
  .date { display:none; } .when { display:inline; }
  .js .brand .name, .brand .kind { display:none; }
  .search input { font-size:16px; }
  h1 { font-size:26px; line-height:34px; }
  .stats { grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px; margin-top:20px; } .stat { padding:12px 14px; } .stat .n { font-size:24px; line-height:32px; }
  h2 { font-size:18px; line-height:26px; }
  .tests { margin-left:0; }
  .shots { margin:0 12px; padding:12px 0; gap:12px; }
  .shot-wrap { width:calc(50% - 6px); }
  /* Problem rows stack instead of scrolling sideways. */
  .section .scroll > table { min-width:0; }
  .section thead { display:none; }
  .section table, .section tbody, .section tr.problem, .section tr.problem > td { display:block; }
  .section tr.problem { padding:12px 16px; border-top:1px solid var(--divider); }
  .section tbody > tr.problem:first-child { border-top:0; }
  .section tr.problem > td { padding:0; border:0; }
  .section tr.problem > td:nth-child(-n+2) { display:inline-block; margin:0 6px 6px 0; vertical-align:middle; }
  .section tr.problem > td:nth-child(n+3) { margin-top:4px; }
  .section tr.problem .tag { margin:0 0 0 4px; }
}
/* Phones: each rule is one compact row, its section links underneath. */
@media (max-width: 639px) {
  .scroll > table.rules { min-width:0; }
  .rules, .rules thead, .rules tbody { display:block; }
  .rules tr { display:grid; grid-template-columns:68px minmax(0, 1fr) 56px 40px; align-items:center; column-gap:6px; padding:8px 12px; border-top:1px solid var(--divider); }
  .rules .pick { text-align:start; }
  .rules .pick code { font-size:12px; }
  .rules thead tr { border-top:0; background:var(--bg-soft); }
  .rules th, .rules td { padding:0; border:0; background:none; }
  .rules thead th:last-child { display:none; }
  .rules td.where { grid-column:1 / -1; min-width:0; margin-top:4px; overflow-wrap:anywhere; }
  .rules .pick code { white-space:normal; overflow-wrap:anywhere; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition:none !important; } }
@media print { .bar, .sidebar, .scrim { display:none !important; } .layout { display:block; } }
`;
