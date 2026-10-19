import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { renderReport } from './report/html';
import type { CheckResult, RunResults, Severity } from './types';

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
    if (!checks.length) return;
    const shotsDir = join(this.outputDir, 'screenshots');
    mkdirSync(shotsDir, { recursive: true });
    const summary: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
    for (const check of checks) {
      for (const issue of check.issues) summary[issue.severity]++;
      for (const shot of check.screenshots) {
        if (!existsSync(shot.path)) continue;
        const name = `${createHash('sha1').update(shot.path).digest('hex').slice(0, 12)}.png`;
        copyFileSync(shot.path, join(shotsDir, name));
        shot.path = `screenshots/${name}`;
      }
    }
    const results: RunResults = { version: 1, createdAt: new Date().toISOString(), checks, summary };
    writeFileSync(join(this.outputDir, 'results.json'), JSON.stringify(results, null, 2));
    writeFileSync(join(this.outputDir, 'index.html'), renderReport(results));
    const where = relative(process.cwd(), join(this.outputDir, 'index.html'));
    console.log(`fitlocale: ${summary.error} errors, ${summary.warning} warnings, ${summary.info} info → ${where}`);
  }
}
