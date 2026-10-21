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
    var re = /([a-z]+):"([^"]*)"?|"([^"]*)"?|(\S+)/gi, m; // an unterminated quote runs to the end
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
    // The row, plus its detail's full text (the label is clipped) and selectors.
    var text = row.textContent + ' ' + row.getAttribute('data-locale');
    var detail = document.getElementById('d-' + row.id);
    if (detail) all('.d-text, .d-sels code', detail).forEach(function (el) { text += ' ' + el.textContent; });
    text = text.replace(/\s+/g, ' ').toLowerCase();
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
    if (!target) return;
    reveal(target);
    if (target.tagName === 'TR' && target.classList.contains('problem')) openDetail(target);
  }

  /** Full width, the panel covers the content: what the reader does there next needs it closed. */
  function uncover() { if (narrow && narrow.matches) closeDetail(false); }
  var filtered = function () { uncover(); apply(); };
  checks.forEach(function (box) { box.addEventListener('change', filtered); });
  all('[data-filter]').forEach(function (s) { s.addEventListener('change', filtered); });
  if (search) {
    search.addEventListener('input', filtered);
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
  if (wide) {
    var onWide = function () { if (wide.matches && drawerOpen()) setDrawer(false, false); };
    if (wide.addEventListener) wide.addEventListener('change', onWide); else if (wide.addListener) wide.addListener(onWide);
  }

  /* ---------- Problem detail: one article at a time in the right-hand panel ---------- */

  var panel = document.querySelector('aside.panel');
  var problemRows = all('tr.problem');
  var selected = null, shown = null;
  var narrow = window.matchMedia ? window.matchMedia('(max-width: 959px)') : null;
  // Rows are focusable only with the script: without it they have nothing to open.
  problemRows.forEach(function (row) { row.tabIndex = 0; });

  function panelOpen() { return !!panel && !panel.hidden; }
  function choose(row) {
    if (selected === row) return;
    if (selected) { selected.classList.remove('selected'); selected.removeAttribute('aria-selected'); }
    selected = row;
    if (row) { row.classList.add('selected'); row.setAttribute('aria-selected', 'true'); }
  }
  /** The hash follows the open problem without a history entry or a scroll jump. */
  function setHash(hash) {
    try { history.replaceState(history.state, '', location.href.split('#')[0] + hash); } catch (e) { /* about:blank, sandboxed frames */ }
  }
  /** Each screenshot in the detail scrolls to its first box. */
  function cropTo(article) {
    all('.crop', article).forEach(function (crop) {
      var box = crop.querySelector('.dbox');
      if (!box) return;
      var place = function () { crop.scrollTop = Math.max(0, box.offsetTop - (crop.clientHeight - box.offsetHeight) / 2); };
      place();
      var img = crop.querySelector('img');
      if (img && !img.complete) img.addEventListener('load', function () { if (!article.hidden) place(); });
    });
  }
  function openDetail(row) {
    var article = row ? document.getElementById('d-' + row.id) : null;
    if (!panel || !article) return;
    choose(row);
    if (shown && shown !== article) shown.hidden = true;
    var wasOpen = panelOpen();
    article.hidden = false;
    shown = article;
    panel.hidden = false;
    root.classList.add('panel-open');
    panel.scrollTop = 0;
    cropTo(article);
    setHash('#' + row.id);
    // Full width, the panel covers the row: focus moves into it.
    if (!wasOpen && narrow && narrow.matches) { var close = panel.querySelector('[data-close]'); if (close) close.focus(); }
  }
  function closeDetail(refocus) {
    if (!panelOpen()) return;
    panel.hidden = true;
    root.classList.remove('panel-open');
    // Only the problem's own hash goes: one the reader navigated to since stays.
    if (shown && location.hash === '#' + shown.id.slice(2)) setHash('');
    if (refocus && selected) selected.focus({ preventScroll: true });
  }

  /** The next (1) or previous (-1) problem shown, in document order; folded and filtered rows are skipped. */
  function step(dir) {
    var list = problemRows.filter(function (r) { return r.getClientRects().length > 0; });
    if (!list.length) return;
    var next = null, i;
    if (!selected) next = list[0];
    else if (list.indexOf(selected) >= 0) next = list[Math.min(list.length - 1, Math.max(0, list.indexOf(selected) + dir))];
    else if (dir > 0) {
      for (i = 0; i < list.length && !next; i++) if (selected.compareDocumentPosition(list[i]) & 4) next = list[i];
      next = next || list[list.length - 1];
    } else {
      for (i = list.length - 1; i >= 0 && !next; i--) if (selected.compareDocumentPosition(list[i]) & 2) next = list[i];
      next = next || list[0];
    }
    choose(next);
    if (panelOpen()) openDetail(next);
    if (!panelOpen() || !narrow || !narrow.matches) next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest' });
  }

  var problemsEl = document.querySelector('.problems');
  if (problemsEl) problemsEl.addEventListener('click', function (e) {
    var row = e.target.closest ? e.target.closest('tr.problem') : null;
    if (!row || e.target.closest('a, button, summary, details.sel')) return;
    var picked = window.getSelection ? window.getSelection() : null;
    if (picked && !picked.isCollapsed && row.contains(picked.anchorNode)) return; // selecting text, not opening
    openDetail(row);
  });

  function copy(button) {
    var code = button.parentElement.querySelector('code');
    if (!code) return;
    // The text is selected too: it shows what was copied, and Ctrl+C still works if copying is refused.
    var range = document.createRange();
    range.selectNodeContents(code);
    var picked = window.getSelection();
    var pick = function () { picked.removeAllRanges(); picked.addRange(range); };
    pick();
    var done = function (ok) {
      button.textContent = ok ? 'Copied' : 'Selected';
      clearTimeout(button.copyTimer);
      button.copyTimer = setTimeout(function () { button.textContent = 'Copy'; }, 1500);
    };
    var fallback = function () {
      var ok = false;
      pick();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      done(ok);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code.textContent).then(function () { done(true); }, fallback);
    else fallback();
  }

  if (panel) panel.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    if (b.hasAttribute('data-copy')) copy(b);
    else if (b.hasAttribute('data-close')) closeDetail(true);
    else if (b.hasAttribute('data-step')) step(Number(b.getAttribute('data-step')));
  });

  /* ---------- Keyboard: j/k move, Enter opens, Esc closes, / searches, ? helps ---------- */

  var keysBox = document.querySelector('[data-keys]');
  var keysButton = document.querySelector('[data-keys-toggle]');
  function setKeys(open) {
    if (!keysBox) return;
    keysBox.hidden = !open;
    if (keysButton) keysButton.setAttribute('aria-expanded', String(open));
  }
  if (keysButton) keysButton.addEventListener('click', function () { setKeys(keysBox.hidden); });
  function typing(el) {
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      // The topmost first: the help, then the drawer (above the panel on narrow screens), then the panel.
      if (keysBox && !keysBox.hidden) setKeys(false);
      else if (drawerOpen()) setDrawer(false, true);
      else if (panelOpen()) closeDetail(true);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || typing(e.target)) return;
    if (e.key === 'j' || e.key === 'k') {
      e.preventDefault();
      step(e.key === 'j' ? 1 : -1);
    } else if (e.key === 'Enter') {
      var row = e.target.tagName === 'TR' && e.target.classList.contains('problem') ? e.target
        : e.target === document.body ? selected : null;
      if (row) { e.preventDefault(); openDetail(row); }
    } else if (e.key === '/' && search) {
      e.preventDefault();
      search.focus();
      search.select();
    } else if (e.key === '?' && keysBox) {
      e.preventDefault();
      setKeys(keysBox.hidden);
    }
  });

  document.addEventListener('click', function (e) {
    if (keysBox && !keysBox.hidden && !keysBox.contains(e.target) && !(keysButton && keysButton.contains(e.target))) setKeys(false);
    var link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!link) return;
    if (drawerOpen() && sidebar && sidebar.contains(link)) setDrawer(false, false);
    // A full-width panel would cover the section the link shows.
    uncover();
    revealHash(link.getAttribute('href'));
  });
  window.addEventListener('hashchange', function () { revealHash(location.hash); });

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
    var atBottom = function () {
      var doc = document.documentElement;
      return doc.scrollHeight > window.innerHeight && window.innerHeight + window.pageYOffset >= doc.scrollHeight - 4;
    };
    var update = function () {
      var i;
      // Short sections at the end never reach the band: at the bottom of the page, the last one shown wins.
      if (atBottom()) {
        for (i = spy.length - 1; i >= 0; i--) if (!isHidden(spy[i])) { mark(spy[i].id); return; }
      }
      for (i = 0; i < spy.length; i++) if (inView[spy[i].id] && !isHidden(spy[i])) { mark(spy[i].id); return; }
    };
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { inView[entry.target.id] = entry.isIntersecting; });
      update();
    }, { rootMargin: '-96px 0px -55% 0px' });
    spy.forEach(function (el) { observer.observe(el); });
    // Reaching the bottom need not change any intersection, so scrolling checks it too (once per frame).
    var queued = false;
    window.addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; update(); });
    }, { passive: true });
  }

  apply(); // a reload can restore the controls' state
  if (location.hash) revealHash(location.hash);
})();`;
