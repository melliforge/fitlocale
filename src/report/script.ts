/**
 * The report's client scripts, inlined by `renderReport`. Plain ES2017 DOM code: no innerHTML, no optional chaining.
 * Every value the page shows was escaped on the server; the scripts only show, hide and move things.
 *
 * Keep the text free of a space followed by the word for baselined problems (see styles.ts).
 */

/** Theme key in localStorage, the only state the report stores. */
const THEME_KEY = 'fitlocale-report-theme';

/** Runs in <head>, before the first paint: the stored theme, and the `js` class the layout keys on. */
export const HEAD_SCRIPT = `(function () {
  var root = document.documentElement;
  root.classList.add('js');
  try {
    var theme = localStorage.getItem('${THEME_KEY}');
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  } catch (e) { /* storage blocked: the system preference applies */ }
})();`;

export const SCRIPT = String.raw`(function () {
  var root = document.documentElement;
  root.classList.add('js');
  var all = function (selector, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(selector)); };
  var select = function (name) { return document.querySelector('select[data-filter="' + name + '"]'); };
  var value = function (name) { var s = select(name); return s ? s.value : ''; };
  var setValue = function (name, v) { var s = select(name); if (s) s.value = v; };
  var checks = all('[data-sev]');
  var search = document.querySelector('[data-search]');
  var sidebar = document.querySelector('nav.sidebar');

  /* ---------- Search: free text plus rule: locale: project: sev: is:accepted / is:new ---------- */

  var KEYS = { rule: 1, locale: 1, project: 1, sev: 1, is: 1 };
  var haystacks = typeof WeakMap === 'function' ? new WeakMap() : null;

  /** Words must all appear; tokens of one key match any of their values, and different keys all must match. */
  function parseQuery(text) {
    var query = { words: [], rule: [], locale: [], project: [], sev: [], is: [], empty: true };
    var re = /([a-z]+):"([^"]*)"|"([^"]*)"|(\S+)/gi, m;
    while ((m = re.exec(text.toLowerCase()))) {
      var key = m[1], val = m[2], word = m[3];
      if (key === undefined && word === undefined) {
        var colon = m[4].indexOf(':');
        if (colon > 0 && KEYS[m[4].slice(0, colon)] === 1) { key = m[4].slice(0, colon); val = m[4].slice(colon + 1); }
        else word = m[4];
      }
      if (key !== undefined && KEYS[key] !== 1) { word = key + ':' + val; key = undefined; }
      if (key !== undefined) { if (val) { query[key].push(val); query.empty = false; } }
      else if (word) { query.words.push(word); query.empty = false; }
    }
    return query;
  }

  function haystack(row) {
    var cached = haystacks ? haystacks.get(row) : undefined;
    if (cached !== undefined) return cached;
    var text = (row.textContent + ' ' + row.getAttribute('data-locale')).replace(/\s+/g, ' ').toLowerCase();
    if (haystacks) haystacks.set(row, text);
    return text;
  }

  function some(values, test) {
    if (!values.length) return true;
    for (var i = 0; i < values.length; i++) if (test(values[i])) return true;
    return false;
  }

  function matchesQuery(row, q) {
    if (q.empty) return true;
    var text = haystack(row);
    for (var i = 0; i < q.words.length; i++) if (text.indexOf(q.words[i]) < 0) return false;
    var rule = (row.getAttribute('data-rule') || '').toLowerCase();
    var locale = (row.getAttribute('data-locale') || '').toLowerCase();
    var projects = JSON.parse(row.getAttribute('data-projects') || '[]').map(function (p) { return String(p).toLowerCase(); });
    var sevEl = row.querySelector('.sev');
    var sev = sevEl ? sevEl.textContent.toLowerCase() : '';
    var base = row.classList.contains('accepted');
    return some(q.rule, function (v) { return rule.indexOf(v) >= 0; })
      && some(q.locale, function (v) { return locale === v || locale.indexOf(v + '-') === 0; })
      && some(q.project, function (v) { return projects.some(function (p) { return p.indexOf(v) >= 0; }); })
      && some(q.sev, function (v) { return sev.indexOf(v) === 0; })
      && some(q.is, function (v) { return v === 'new' ? !base : v === 'accepted' ? base : true; });
  }

  /* ---------- Filtering ---------- */

  function visibleRow(row, q) {
    for (var i = 0; i < checks.length; i++) {
      if (!checks[i].checked && row.classList.contains(checks[i].getAttribute('data-sev'))) return false;
    }
    var rule = value('rule'), locale = value('locale'), project = value('project');
    if (rule && row.getAttribute('data-rule') !== rule) return false;
    if (locale && row.getAttribute('data-locale') !== locale) return false;
    if (project && JSON.parse(row.getAttribute('data-projects')).indexOf(project) < 0) return false;
    return matchesQuery(row, q);
  }

  function apply() {
    var rows = all('tr.problem'), shown = 0, project = value('project');
    var q = parseQuery(search ? search.value : '');
    rows.forEach(function (row) { row.hidden = !visibleRow(row, q); if (!row.hidden) shown++; });
    all('.box').forEach(function (box) {
      var row = document.getElementById(box.getAttribute('data-problem'));
      box.hidden = !!row && row.hidden;
    });
    all('figure.shot-wrap').forEach(function (fig) {
      var inProject = !project || fig.getAttribute('data-project') === project;
      fig.hidden = !(inProject && fig.querySelector('.box:not([hidden])'));
    });
    all('details.section, details.page').forEach(function (el) { el.hidden = !el.querySelector('tr.problem:not([hidden])'); });
    syncSidebar();
    var status = document.querySelector('[data-status]');
    if (status) status.textContent = 'Showing ' + shown + ' of ' + rows.length + ' problems';
  }

  /** Sidebar entries follow the filters: hidden with their section, counting what is shown. */
  function syncSidebar() {
    all('[data-nav]').forEach(function (link) {
      var target = document.getElementById(link.getAttribute('data-nav'));
      if (!target) return;
      link.parentElement.hidden = target.hidden;
      var count = link.querySelector('.n');
      if (count) count.textContent = String(target.querySelectorAll('tr.problem:not([hidden])').length);
    });
  }

  function isHidden(el) {
    for (; el; el = el.parentElement) if (el.hidden) return true;
    return false;
  }

  function reveal(target) {
    if (isHidden(target)) {
      // A filter hides the target: drop the select filters and the search, then the toggles only if they still hide it.
      all('[data-filter]').forEach(function (s) { s.value = ''; });
      if (search) search.value = '';
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
  if (search) {
    search.addEventListener('input', apply);
    // The query stays on the page: Enter never submits or navigates.
    search.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
  }
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
      if (search) search.value = '';
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

  /* ---------- Theme: auto (system), light, dark ---------- */

  var THEMES = ['auto', 'light', 'dark'];
  var toggle = document.querySelector('[data-theme-toggle]');
  function theme() {
    var t = root.getAttribute('data-theme');
    return t === 'light' || t === 'dark' ? t : 'auto';
  }
  function labelTheme() {
    if (!toggle) return;
    var next = THEMES[(THEMES.indexOf(theme()) + 1) % THEMES.length];
    var text = 'Theme: ' + theme() + '. Switch to ' + next;
    toggle.setAttribute('aria-label', text);
    toggle.setAttribute('title', text);
  }
  function setTheme(t) {
    if (t === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', t);
    try {
      if (t === 'auto') localStorage.removeItem('${THEME_KEY}');
      else localStorage.setItem('${THEME_KEY}', t);
    } catch (e) { /* storage blocked: the choice lasts until the page closes */ }
    labelTheme();
  }
  if (toggle) {
    toggle.addEventListener('click', function () { setTheme(THEMES[(THEMES.indexOf(theme()) + 1) % THEMES.length]); });
    labelTheme();
  }

  /* ---------- Drawer: the sidebar on narrow screens ---------- */

  var drawerButton = document.querySelector('[data-drawer]');
  var scrim = document.querySelector('[data-scrim]');
  var wide = window.matchMedia ? window.matchMedia('(min-width: 960px)') : null;
  function drawerOpen() { return root.classList.contains('drawer-open'); }
  function setDrawer(open, refocus) {
    if (!drawerButton) return;
    root.classList.toggle('drawer-open', open);
    drawerButton.setAttribute('aria-expanded', String(open));
    if (scrim) scrim.hidden = !open;
    if (open && sidebar) {
      var first = sidebar.querySelector('input, select, button, a[href]');
      if (first) first.focus();
    } else if (refocus) drawerButton.focus();
  }
  if (drawerButton) drawerButton.addEventListener('click', function () { setDrawer(!drawerOpen(), false); });
  if (scrim) scrim.addEventListener('click', function () { setDrawer(false, true); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawerOpen()) setDrawer(false, true);
  });
  if (wide) {
    var onWide = function () { if (wide.matches && drawerOpen()) setDrawer(false, false); };
    if (wide.addEventListener) wide.addEventListener('change', onWide); else if (wide.addListener) wide.addListener(onWide);
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!link) return;
    if (drawerOpen() && sidebar && sidebar.contains(link)) setDrawer(false, false);
    revealHash(link.getAttribute('href'));
  });

  /* ---------- Scrollspy: the sidebar marks the overview or section in view ---------- */

  var spy = all('#summary, details.section');
  var current = null;
  function mark(id) {
    if (!sidebar || id === current) return;
    current = id;
    all('a[aria-current]', sidebar).forEach(function (a) { a.removeAttribute('aria-current'); });
    var link = sidebar.querySelector('a[href="#' + id + '"]');
    if (!link) return;
    link.setAttribute('aria-current', 'true');
    // Keep the marked link within the sidebar's own scroll area.
    var box = sidebar.getBoundingClientRect(), at = link.getBoundingClientRect();
    if (sidebar.scrollHeight > sidebar.clientHeight && (at.top < box.top + 8 || at.bottom > box.bottom - 8)) {
      sidebar.scrollTop += at.top - box.top - box.height / 3;
    }
  }
  if (sidebar && spy.length && typeof IntersectionObserver === 'function') {
    var inView = {};
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { inView[entry.target.id] = entry.isIntersecting; });
      for (var i = 0; i < spy.length; i++) {
        if (inView[spy[i].id] && !isHidden(spy[i])) { mark(spy[i].id); return; }
      }
    }, { rootMargin: '-96px 0px -55% 0px' });
    spy.forEach(function (el) { observer.observe(el); });
  }

  apply(); // a reload can restore the controls' state
  if (location.hash) revealHash(location.hash);
})();`;
