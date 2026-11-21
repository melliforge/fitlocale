import { readFileSync } from 'node:fs';
import type { GitHub } from './github';

/** The pull request a run comments on, its head commit, and the run page that holds the report. */
export type Target = { repo: string; pr: number; headSha: string; runUrl: string };

const SHA = /^[0-9a-f]{7,40}$/;
const cleanSha = (value: unknown) => (typeof value === 'string' && SHA.test(value) ? value : '');

function readEvent(path: string | undefined): any | null {
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * From the Actions event: `pull_request` (and `pull_request_target`) carry the pull request. `workflow_run`, which is
 * how a fork's pull request gets a comment, carries no number for forks: the pull request is the one open pull request
 * whose head is the run's branch and commit. Nothing read from a report decides where the comment goes.
 */
export async function resolveTarget(
  env: Record<string, string | undefined>, gh: Pick<GitHub, 'openPullsForHead'>, prFlag: number | null,
): Promise<Target | { skip: 'not-a-pr' | 'no-event' }> {
  const repo = env.GITHUB_REPOSITORY ?? '';
  const event = readEvent(env.GITHUB_EVENT_PATH);
  if (!repo || (!event && prFlag === null)) return { skip: 'no-event' };
  const thisRun = `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repo}/actions/runs/${env.GITHUB_RUN_ID ?? ''}`;
  const name = env.GITHUB_EVENT_NAME;

  if ((name === 'pull_request' || name === 'pull_request_target') && event?.pull_request) {
    const pr = prFlag ?? Number(event.pull_request.number);
    if (!Number.isInteger(pr) || pr <= 0) return { skip: 'not-a-pr' };
    return { repo, pr, headSha: cleanSha(event.pull_request.head?.sha), runUrl: thisRun };
  }
  if (name === 'workflow_run' && event?.workflow_run) {
    const run = event.workflow_run;
    const headSha = cleanSha(run.head_sha);
    const runUrl = typeof run.html_url === 'string' && run.html_url ? run.html_url : thisRun;
    if (prFlag !== null) return { repo, pr: prFlag, headSha, runUrl };
    const owner = run.head_repository?.owner?.login, branch = run.head_branch;
    if (!headSha || typeof owner !== 'string' || typeof branch !== 'string') return { skip: 'not-a-pr' };
    const matches = (await gh.openPullsForHead(repo, `${owner}:${branch}`)).filter(p => p.headSha === headSha);
    if (matches.length !== 1) return { skip: 'not-a-pr' };
    return { repo, pr: matches[0].number, headSha, runUrl };
  }
  if (prFlag !== null) return { repo, pr: prFlag, headSha: cleanSha(env.GITHUB_SHA), runUrl: thisRun };
  return { skip: 'not-a-pr' };
}
