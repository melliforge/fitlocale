import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { renderReport } from './report/html';
import type { CheckResult, RunResults, Severity } from './types';

/** Copies a screenshot into the report under a name from its path; null when the file is gone. */
function copyShot(path: string, shotsDir: string): string | null {
  if (!existsSync(path)) return null;
  const name = `${createHash('sha1').update(path).digest('hex').slice(0, 12)}.png`;
  copyFileSync(path, join(shotsDir, name));
  return `screenshots/${name}`;
}

export interface FitlocaleReporterOptions { outputDir?: string }

/** Gathers `fitlocale:result` attachments into `<outputDir>/results.json` and an offline `index.html`. */
export default class FitlocaleReporter implements Reporter {
  private readonly outputDir: string;
  /** Checks per test; a retry replaces the earlier attempt's checks. */
  private readonly byTest = new Map<string, CheckResult[]>();
  private anonymous = 0;

  constructor(options: FitlocaleReporterOptions = {}) {
    this.outputDir = options.outputDir ?? 'fitlocale-report';
  }

  printsToStdio(): boolean {
    return false;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent?.project?.()?.name;
    const checks: CheckResult[] = [];
    for (const a of result.attachments) {
      if (a.name !== 'fitlocale:result' || !a.body) continue;
      const check = JSON.parse(a.body.toString('utf8')) as CheckResult;
      if (project) check.project = project;
      checks.push(check);
    }
    this.byTest.set(test.id ?? `anonymous-${this.anonymous++}`, checks);
  }

  async onEnd(): Promise<void> {
    const checks = [...this.byTest.values()].flat();
    const shotsDir = join(this.outputDir, 'screenshots');
    // Screenshots from earlier runs would pile up; only files this reporter writes are removed.
    rmSync(shotsDir, { recursive: true, force: true });
    if (!checks.length) {
      for (const file of ['results.json', 'index.html']) rmSync(join(this.outputDir, file), { force: true });
      return;
    }
    mkdirSync(shotsDir, { recursive: true });
    const summary: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
    let missingShots = 0;
    for (const check of checks) {
      for (const issue of check.issues) summary[issue.severity]++;
      // With preserveOutput: 'failures-only', Playwright deletes a passing test's output, screenshots included.
      check.screenshots = check.screenshots.filter(shot => {
        const copied = copyShot(shot.path, shotsDir);
        if (copied === null) {
          missingShots++;
          return false;
        }
        shot.path = copied;
        return true;
      });
      for (const issue of check.issues) {
        if (issue.crop === undefined) continue;
        const copied = copyShot(issue.crop, shotsDir);
        if (copied === null) delete issue.crop;
        else issue.crop = copied;
      }
    }
    const results: RunResults = { version: 1, createdAt: new Date().toISOString(), checks, summary };
    writeFileSync(join(this.outputDir, 'results.json'), JSON.stringify(results, null, 2));
    writeFileSync(join(this.outputDir, 'index.html'), renderReport(results));
    const rel = (path: string) => relative(process.cwd(), path).split(sep).join('/');
    const accepted = checks.reduce((n, c) => n + c.issues.filter(i => i.baselined).length, 0);
    const acceptedNote = accepted ? ` (${accepted} accepted in the baseline)` : '';
    console.log(`fitlocale: ${summary.error} errors, ${summary.warning} warnings, ${summary.info} info${acceptedNote} → ${rel(join(this.outputDir, 'index.html'))}`);
    const missing = checks.find(c => c.baseline?.status === 'missing')?.baseline;
    if (missing) {
      console.log(`fitlocale: no baseline file yet (${missing.path}), so no test failed. Accept the current issues with: `
        + `npx fitlocale baseline ${rel(join(this.outputDir, 'results.json'))} --out ${missing.path}`);
    }
    if (missingShots) {
      console.log(`fitlocale: ${missingShots} screenshot(s) were already deleted, probably by Playwright's preserveOutput setting; their issues are listed without a screenshot.`);
    }
  }
}
