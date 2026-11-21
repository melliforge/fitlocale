import { fixedEntries } from '../fixed';
import type { CheckResult, FixedEntry, Issue, RunResults, Screenshot } from '../types';

export interface Occurrence { issue: Issue; check: CheckResult }

/** One thing to fix: the same text with the same rule, seen on any element, viewport or project. */
export interface Problem {
  /** 'p1', 'p2'… in render order: the row anchor and the `data-problem` of its boxes. */
  id: string;
  rule: string; severity: string; accepted: boolean; mode: string; locale: string;
  /** Repeats of one issue id are dropped. */
  occurrences: Occurrence[];
  /** Distinct `check.project`, first-seen order; empty without projects. */
  projects: string[];
  /** Distinct 'W×H', first-seen order. */
  viewports: string[];
  selectors: string[];
  /** The first occurrence: label, message and fix. */
  issue: Issue;
}

export interface ShotBox { problem: string; issue: Issue }
export interface Shot { screenshot: Screenshot; project?: string; testTitle: string; viewport: string; boxes: ShotBox[] }
export interface Section { id: string; label: string; locale: string; mode: string; problems: Problem[]; shots: Shot[] }
export interface Page { id: string; url: string; label: string; tests: string[]; sections: Section[] }
/** One screenshot of the Gallery: a page in one locale and mode. `column` is its label, e.g. `de` or `en · pseudo-long`. */
export interface GalleryCell { column: string; locale: string; mode: string; shot: Shot }
export interface GalleryRow { viewport: string; cells: GalleryCell[] }
/** A page (and project, and check position) of the Gallery: one row per viewport, widest first. */
export interface GalleryPage { id: string; url: string; label: string; project?: string; rows: GalleryRow[] }
export interface RuleRow { rule: string; severity: string; problems: number; occurrences: number; sections: Array<{ id: string; label: string }> }
export interface ReportModel {
  pages: Page[]; rules: RuleRow[]; locales: string[]; projects: string[];
  /** locale → project ('' without projects) → problems seen there. */
  matrix: Map<string, Map<string, number>>;
  problems: number; occurrences: number;
  /** Problems per severity. */
  bySeverity: Record<string, number>;
  /** Each page in each locale and mode, side by side; empty unless some check ran with `gallery: true`. */
  gallery: GalleryPage[];
  /** Accepted issues that no longer occur, and the baseline file they are in. */
  fixed: FixedEntry[];
  fixedBaselinePath?: string;
}

const RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };
const rank = (severity: string) => RANK[severity] ?? 3;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const viewportLabel = (v: { width: number; height: number }) => `${v.width}×${v.height}`;
const push = <T>(list: T[], value: T) => { if (!list.includes(value)) list.push(value); };

function parse(url: string): URL | undefined {
  try { return new URL(url); } catch { return undefined; }
}

/** Without the shared origin when every page has the same one; the full URL otherwise or when it does not parse. */
function pageLabels(urls: string[]): Map<string, string> {
  const parsed = urls.map(parse);
  const origins = new Set(parsed.filter((u): u is URL => !!u).map(u => u.origin));
  // An opaque origin (about:, data:, file: …) is the string "null": it names no site, so the URL stays whole.
  const shared = origins.size <= 1 && !origins.has('null') && parsed.every(Boolean);
  return new Map(urls.map((url, i) => {
    const u = parsed[i];
    return [url, shared && u ? `${u.pathname}${u.search}${u.hash}` : url];
  }));
}

function sameShot(s: Screenshot, issue: Issue): boolean {
  return s.mode === issue.mode && s.viewport.width === issue.viewport.width && s.viewport.height === issue.viewport.height;
}

export function buildModel(results: RunResults): ReportModel {
  const checks = results.checks ?? [];
  const labels = pageLabels([...new Set(checks.map(c => c.url))]);

  const pages: Page[] = [];
  const byUrl = new Map<string, Page>();
  const sectionKeys = new Map<Section, string>();
  const seenIds = new Set<string>();
  const problemsByKey = new Map<string, Problem>();

  for (const check of checks) {
    let page = byUrl.get(check.url);
    const pageIndex = page ? pages.indexOf(page) : pages.length;
    for (const issue of check.issues ?? []) {
      if (issue.id !== undefined) {
        // Ids already include the project; keying on it too only keeps hand-edited results with copied ids apart.
        const seen = JSON.stringify([check.project ?? '', issue.id]);
        if (seenIds.has(seen)) continue;
        seenIds.add(seen);
      }
      if (!page) {
        page = { id: `page-${pageIndex + 1}`, url: check.url, label: labels.get(check.url) ?? check.url, tests: [], sections: [] };
        byUrl.set(check.url, page);
        pages.push(page);
      }
      const locale = issue.locale ?? '';
      const sectionKey = JSON.stringify([check.url, locale, issue.mode]);
      let section = page.sections.find(s => sectionKeys.get(s) === sectionKey);
      if (!section) {
        section = {
          id: `${page.id}-${page.sections.length + 1}`, label: locale ? `${locale} · ${issue.mode}` : issue.mode,
          locale, mode: issue.mode, problems: [], shots: [],
        };
        sectionKeys.set(section, sectionKey);
        page.sections.push(section);
      }
      const accepted = issue.baselined === true;
      const text = (issue.text ?? '').replace(/\s+/g, ' ').trim() || issue.selector;
      const key = JSON.stringify([check.url, locale, issue.mode, issue.rule, issue.severity, accepted, text]);
      let problem = problemsByKey.get(key);
      if (!problem) {
        problem = {
          id: '', rule: issue.rule, severity: issue.severity, accepted, mode: issue.mode, locale,
          occurrences: [], projects: [], viewports: [], selectors: [], issue,
        };
        problemsByKey.set(key, problem);
        section.problems.push(problem);
      }
      problem.occurrences.push({ issue, check });
      if (check.project) push(problem.projects, check.project);
      push(problem.viewports, viewportLabel(issue.viewport));
      push(problem.selectors, issue.selector);
    }
  }

  for (const page of pages) {
    page.tests = [...new Set(checks.filter(c => c.url === page.url).map(c => c.testTitle))];
  }

  let counter = 0;
  for (const page of pages) {
    for (const section of page.sections) {
      // Array.prototype.sort is stable: ties keep first-seen order.
      section.problems.sort((a, b) => rank(a.severity) - rank(b.severity) || compare(a.rule, b.rule));
      for (const problem of section.problems) problem.id = `p${++counter}`;
      section.shots = shotsOf(section);
    }
  }

  const all = pages.flatMap(p => p.sections.flatMap(s => s.problems));
  const bySeverity: Record<string, number> = {};
  const matrix = new Map<string, Map<string, number>>();
  const locales: string[] = [];
  const projects: string[] = [];
  for (const check of checks) if (check.project) push(projects, check.project);
  for (const problem of all) {
    bySeverity[problem.severity] = (bySeverity[problem.severity] ?? 0) + 1;
    push(locales, problem.locale);
    const row = matrix.get(problem.locale) ?? new Map<string, number>();
    matrix.set(problem.locale, row);
    for (const project of new Set(problem.occurrences.map(o => o.check.project ?? ''))) {
      row.set(project, (row.get(project) ?? 0) + 1);
    }
  }

  return {
    pages, rules: ruleRows(pages), locales, projects, matrix,
    problems: all.length, occurrences: all.reduce((n, p) => n + p.occurrences.length, 0), bySeverity,
    gallery: buildGallery(checks, labels, problemOf(pages)),
    fixed: fixedEntries([results]),
    fixedBaselinePath: checks.find(c => c.baseline?.fixed?.length)?.baseline?.path,
  };
}

/** The problem id of each issue object the pages list. */
function problemOf(pages: Page[]): Map<Issue, string> {
  const ids = new Map<Issue, string>();
  for (const page of pages) for (const section of page.sections) for (const problem of section.problems) for (const o of problem.occurrences) ids.set(o.issue, problem.id);
  return ids;
}

const MODE_ORDER: Record<string, number> = { source: 0, 'pseudo-long': 1, 'pseudo-rtl': 2 };

/**
 * The Gallery: every screenshot of the checks run with `gallery: true`, by page and project, then viewport, then
 * locale and mode. Columns are keyed, not positional: a locale whose check did not run leaves a gap.
 */
function buildGallery(checks: CheckResult[], labels: Map<string, string>, problems: Map<Issue, string>): GalleryPage[] {
  const withGallery = checks.filter(c => c.gallery);
  if (!withGallery.length) return [];
  // Results from before screenshots recorded their locale: the check's issues say it, else it is unknown.
  const localeOf = (c: CheckResult, s: Screenshot) => s.locale ?? c.issues[0]?.locale ?? '';
  // Results from before 0.8.1 don't say their source locale: guess one for the run. pseudo-long runs only on pages in
  // the source locale, so that locale comes first. Else the most common one.
  let source: string | undefined;
  const counts = new Map<string, number>();
  for (const c of withGallery) for (const s of c.screenshots ?? []) {
    const l = localeOf(c, s);
    if (s.mode === 'pseudo-long' && source === undefined) source = l;
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  source ??= [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  type Block = { page: GalleryPage; rows: Map<string, { row: GalleryRow; w: number; h: number; keys: Set<string> }>; declared?: string; pseudoLong: Set<string> };
  const pages = new Map<string, Block>();
  for (const c of withGallery) {
    // Keyed by check position too: a test that checks a page, opens a dialog and checks again (same URL) shows both
    // states, and the same step of the tests for each locale lines up in one block.
    const pageKey = JSON.stringify([c.url, c.project ?? '', c.checkIndex ?? 0]);
    let entry = pages.get(pageKey);
    if (!entry) {
      const label = `${labels.get(c.url) ?? c.url}${c.checkIndex ? ` · check ${c.checkIndex + 1}` : ''}`;
      entry = { page: { id: `gallery-${pages.size + 1}`, url: c.url, label, ...(c.project ? { project: c.project } : {}), rows: [] }, rows: new Map(), pseudoLong: new Set() };
      pages.set(pageKey, entry);
    }
    entry.declared ??= c.sourceLocale;
    for (const s of c.screenshots ?? []) {
      const viewport = viewportLabel(s.viewport);
      let row = entry.rows.get(viewport);
      if (!row) {
        row = { row: { viewport, cells: [] }, w: s.viewport.width, h: s.viewport.height, keys: new Set() };
        entry.rows.set(viewport, row);
      }
      const locale = localeOf(c, s);
      if (s.mode === 'pseudo-long') entry.pseudoLong.add(locale.toLowerCase());
      const key = JSON.stringify([locale, s.mode]);
      if (row.keys.has(key)) continue; // the same page checked twice: the first one stays
      row.keys.add(key);
      const boxes = (c.issues ?? []).filter(i => sameShot(s, i) && (i.locale ?? '') === locale).map(issue => ({ problem: problems.get(issue) ?? '', issue }));
      row.row.cells.push({
        column: s.mode === 'source' ? locale : `${locale} · ${s.mode}`, locale, mode: s.mode,
        shot: { screenshot: s, project: c.project, testTitle: c.testTitle, viewport, boxes },
      });
    }
  }
  return [...pages.values()].map(({ page, rows, declared, pseudoLong }) => {
    // Each block's own source comes first: the locales that got pseudo-long (which runs only on source pages) and the
    // check's sourceLocale, compared exactly so that a pseudo locale such as en-XA is never taken for en.
    const isSource = (locale: string) => {
      const l = locale.toLowerCase();
      if (pseudoLong.has(l)) return true;
      if (declared !== undefined) return l === declared.toLowerCase();
      return !pseudoLong.size && locale === source;
    };
    const order = (a: GalleryCell, b: GalleryCell) =>
      Number(!isSource(a.locale)) - Number(!isSource(b.locale)) || compare(a.locale, b.locale) || (MODE_ORDER[a.mode] ?? 3) - (MODE_ORDER[b.mode] ?? 3);
    return { ...page, rows: [...rows.values()].sort((a, b) => b.w - a.w || b.h - a.h).map(r => ({ ...r.row, cells: [...r.row.cells].sort(order) })) };
  });
}

/** One shot per (check, screenshot) of the section's mode and viewports, boxing the section's issues drawn on it. */
function shotsOf(section: Section): Shot[] {
  const occurrences = section.problems.flatMap(p => p.occurrences.map(o => ({ problem: p.id, ...o })));
  const checks = [...new Set(occurrences.map(o => o.check))];
  const shots: Shot[] = [];
  for (const check of checks) {
    for (const screenshot of check.screenshots ?? []) {
      const boxes = occurrences
        .filter(o => o.check === check && sameShot(screenshot, o.issue))
        .map(o => ({ problem: o.problem, issue: o.issue }));
      if (!boxes.length) continue;
      shots.push({ screenshot, project: check.project, testTitle: check.testTitle, viewport: viewportLabel(screenshot.viewport), boxes });
    }
  }
  return shots;
}

function ruleRows(pages: Page[]): RuleRow[] {
  const rows = new Map<string, RuleRow>();
  for (const page of pages) {
    for (const section of page.sections) {
      for (const problem of section.problems) {
        let row = rows.get(problem.rule);
        if (!row) {
          row = { rule: problem.rule, severity: problem.severity, problems: 0, occurrences: 0, sections: [] };
          rows.set(problem.rule, row);
        }
        if (rank(problem.severity) < rank(row.severity)) row.severity = problem.severity;
        row.problems++;
        row.occurrences += problem.occurrences.length;
        if (!row.sections.some(s => s.id === section.id)) row.sections.push({ id: section.id, label: `${page.label} · ${section.label}` });
      }
    }
  }
  return [...rows.values()].sort((a, b) => rank(a.severity) - rank(b.severity) || b.problems - a.problems || compare(a.rule, b.rule));
}
