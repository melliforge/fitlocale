import type { CheckResult, Issue, RunResults, Screenshot } from '../types';

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
export interface RuleRow { rule: string; severity: string; problems: number; occurrences: number; sections: Array<{ id: string; label: string }> }
export interface ReportModel {
  pages: Page[]; rules: RuleRow[]; locales: string[]; projects: string[];
  /** locale → project ('' without projects) → problems seen there. */
  matrix: Map<string, Map<string, number>>;
  problems: number; occurrences: number;
  /** Problems per severity. */
  bySeverity: Record<string, number>;
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
  const shared = origins.size <= 1 && parsed.every(Boolean);
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
        // An issue id has no project in it, so the same issue in two projects is two occurrences.
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
  for (const problem of all) {
    bySeverity[problem.severity] = (bySeverity[problem.severity] ?? 0) + 1;
    push(locales, problem.locale);
    for (const project of problem.projects) push(projects, project);
    const row = matrix.get(problem.locale) ?? new Map<string, number>();
    matrix.set(problem.locale, row);
    for (const project of new Set(problem.occurrences.map(o => o.check.project ?? ''))) {
      row.set(project, (row.get(project) ?? 0) + 1);
    }
  }

  return {
    pages, rules: ruleRows(pages), locales, projects, matrix,
    problems: all.length, occurrences: all.reduce((n, p) => n + p.occurrences.length, 0), bySeverity,
  };
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
