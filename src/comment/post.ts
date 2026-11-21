import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunResults } from '../types';
import { createGitHub, GitHubError } from './github';
import { renderComment } from './render';
import { resolveTarget } from './target';

export type CommentOutcome =
  | { status: 'created' | 'updated' | 'none'; url?: string }
  | { status: 'skipped'; reason: 'no-token' | 'no-results' | 'not-a-pr' | 'outdated' | 'forbidden' | 'service' };

export interface PostOptions {
  /** Report directories, each with a results.json: one comment covers them all (a matrix, shards). */
  dirs: string[];
  prNumber: number | null;
  /** The report artifact's page; without it, the comment links the workflow run. */
  reportUrl: string | null;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  log: (line: string) => void;
  timeoutMs?: number;
}

const PREFIX = 'fitlocale comment: ';
const FORKS = 'https://melliforge.github.io/fitlocale/reference/github-action#forks';

function readResults(dir: string): RunResults | null {
  try {
    const results = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8')) as RunResults;
    return Array.isArray(results?.checks) ? results : null;
  } catch {
    return null;
  }
}

/** Create, update or leave the pull request's one fitlocale comment. Every problem is one log line; it never throws. */
export async function postComment(o: PostOptions): Promise<CommentOutcome> {
  const log = (line: string) => o.log(PREFIX + line);
  const skip = (reason: Extract<CommentOutcome, { status: 'skipped' }>['reason'], line: string): CommentOutcome => {
    log(line);
    return { status: 'skipped', reason };
  };

  const checks: RunResults['checks'] = [];
  let found = 0;
  for (const dir of o.dirs) {
    const results = readResults(dir);
    if (results) { found++; checks.push(...results.checks); } else log(`no results.json in ${dir}`);
  }
  if (!found) return { status: 'skipped', reason: 'no-results' };

  const token = o.env.GITHUB_TOKEN;
  if (!token) return skip('no-token', 'no GitHub token: the Action passes github.token; outside it set GITHUB_TOKEN');
  const gh = createGitHub({ apiUrl: o.env.GITHUB_API_URL || 'https://api.github.com', token, fetch: o.fetch, timeoutMs: o.timeoutMs });

  try {
    const target = await resolveTarget(o.env, gh, o.prNumber);
    if ('skip' in target) return skip('not-a-pr', 'not a pull request run; nothing to comment on');
    // A late run of an older commit must not overwrite what the newer commit's run said.
    const pull = await gh.getPull(target.repo, target.pr);
    if (target.headSha && pull.headSha !== target.headSha) {
      return skip('outdated', 'a newer commit is on the pull request; leaving its comment alone');
    }
    const existing = await gh.findComment(target.repo, target.pr);
    const report = o.reportUrl ? { reportUrl: o.reportUrl, reportLabel: 'the report artifact' } : { reportUrl: target.runUrl, reportLabel: 'the workflow run' };
    const render = (previous: boolean) => renderComment({ checks }, { ...report, sha: target.headSha, previous });
    if (existing !== null) {
      const updated = await gh.updateComment(target.repo, existing, render(true)!);
      if (updated !== 'gone') {
        log(`comment updated: ${updated.url}`);
        return { status: 'updated', url: updated.url };
      }
    }
    // No comment (or someone deleted ours): post only when there is something new.
    const body = render(false);
    if (body === null) {
      log('no new issues and no earlier comment; nothing posted');
      return { status: 'none' };
    }
    const created = await gh.createComment(target.repo, target.pr, body);
    log(`comment created: ${created.url}`);
    return { status: 'created', url: created.url };
  } catch (err) {
    if (err instanceof GitHubError && (err.status === 403 || err.status === 404)) {
      return skip('forbidden', `the token cannot comment here: give the job \`permissions: pull-requests: write\`; pull requests from forks need the two-workflow recipe: ${FORKS}`);
    }
    const detail = err instanceof GitHubError ? err.message : `unexpected: ${(err as Error).message}`;
    return skip('service', `GitHub did not answer (${detail}); no comment`);
  }
}
