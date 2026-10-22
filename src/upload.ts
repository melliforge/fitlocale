import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { RunResults } from './types';

export const DEFAULT_CLOUD_URL = 'https://cloud.fitlocale.dev';
const TIMEOUT_MS = 30_000;
const PREFIX = 'fitlocale upload: ';

export type UploadOutcome =
  | { status: 'uploaded'; reportUrl: string; comment: 'created' | 'updated' | 'none' }
  | { status: 'skipped'; reason: 'node' | 'no-oidc' | 'no-results' | 'no-plan' | 'not-installed' | 'too-large' | 'service' };

type Skip = Extract<UploadOutcome, { status: 'skipped' }>['reason'];

const NOTICES: Partial<Record<Skip, string>> = {
  'no-oidc': 'no GitHub OIDC token: add `permissions: id-token: write` to the job (pull requests from forks get none); the local report is unchanged',
  'no-plan': 'no active fitlocale plan for this repository; the local report is unchanged',
  'not-installed': 'the fitlocale GitHub App is not installed on this repository',
};

export interface UploadOptions {
  /** The report directory: results.json and the screenshots it points at. */
  dir: string;
  endpoint: string;
  prNumber: number | null;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  log: (line: string) => void;
  /** Per request; default 30 s. */
  timeoutMs?: number;
}

/** A service problem: reported as one notice, never thrown to the job. */
class ServiceError extends Error {}

/** The pull request number of a `refs/pull/<n>/merge` ref, else null. */
export function prFromRef(ref: string | undefined): number | null {
  const m = /^refs\/pull\/(\d+)\//.exec(ref ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * The pull request's head commit, from the Actions event payload. Pull request jobs run on a temporary merge commit
 * (GITHUB_SHA), which people do not recognise; the comment names this one instead. Undefined when unavailable.
 */
function headShaFrom(eventPath: string | undefined): string | undefined {
  if (!eventPath) return undefined;
  try {
    const sha: unknown = JSON.parse(readFileSync(eventPath, 'utf8'))?.pull_request?.head?.sha;
    return typeof sha === 'string' && /^[0-9a-f]{7,40}$/.test(sha) ? sha : undefined;
  } catch {
    return undefined;
  }
}

/** results.json, then every screenshot and crop it points at that lies inside `dir` and exists, with sizes. */
function collectFiles(dir: string, results: RunResults, log: (line: string) => void): Array<{ path: string; size: number }> {
  const paths = new Set<string>();
  for (const check of results.checks) {
    for (const shot of check.screenshots ?? []) paths.add(shot.path);
    for (const issue of check.issues ?? []) if (issue.crop) paths.add(issue.crop);
  }
  const files = [{ path: 'results.json', size: statSync(resolve(dir, 'results.json')).size }];
  for (const path of paths) {
    if (typeof path !== 'string') continue;
    const inside = relative(dir, resolve(dir, path));
    if (isAbsolute(path) || inside === '' || inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside)) {
      log(`${PREFIX}not uploading ${path}: outside the report directory`);
      continue;
    }
    const file = resolve(dir, inside);
    if (!existsSync(file)) continue;
    files.push({ path: inside.split(sep).join('/'), size: statSync(file).size });
  }
  return files;
}

/** Send a finished report to fitlocale cloud (contract: spec §13). Every problem is a notice; it never throws. */
export async function uploadReport(opts: UploadOptions): Promise<UploadOutcome> {
  const { dir, env, log } = opts;
  const endpoint = opts.endpoint.replace(/\/+$/, '');
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const skip = (reason: Skip, notice = NOTICES[reason]!): UploadOutcome => {
    log(PREFIX + notice);
    return { status: 'skipped', reason };
  };

  const resultsFile = resolve(dir, 'results.json');
  if (!existsSync(resultsFile)) return skip('no-results', `no results.json in ${dir}; nothing to upload`);
  let results: RunResults;
  try {
    results = JSON.parse(readFileSync(resultsFile, 'utf8')) as RunResults;
    if (!Array.isArray(results?.checks)) throw new Error('no checks');
  } catch {
    return skip('no-results', `${resultsFile} is not a fitlocale results.json; nothing to upload`);
  }

  const tokenUrl = env.ACTIONS_ID_TOKEN_REQUEST_URL, tokenAuth = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!tokenUrl || !tokenAuth) return skip('no-oidc');

  /** One request, bounded by the timeout; the body is read inside the same bound. */
  const request = async (url: string, init: RequestInit, what: string): Promise<{ status: number; json: Record<string, unknown> | null }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await opts.fetch(url, { ...init, signal: controller.signal });
      const text = await res.text();
      let json: Record<string, unknown> | null = null;
      try {
        const parsed: unknown = text ? JSON.parse(text) : null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) json = parsed as Record<string, unknown>;
      } catch {
        // Not JSON: a proxy's error page, for example. The caller decides whether that matters.
      }
      return { status: res.status, json };
    } catch (err) {
      const reason = controller.signal.aborted ? `no answer within ${timeoutMs / 1000} s` : (err as Error).message;
      throw new ServiceError(`${what}: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const url = new URL(tokenUrl);
    url.searchParams.set('audience', 'fitlocale');
    const token = await request(url.toString(), { headers: { Authorization: `bearer ${tokenAuth}` } }, 'GitHub OIDC token');
    const jwt = token.json?.value;
    if (token.status !== 200 || typeof jwt !== 'string') throw new ServiceError(`GitHub OIDC token: HTTP ${token.status}`);

    const files = collectFiles(dir, results, log);
    const created = await request(`${endpoint}/v1/runs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sha: env.GITHUB_SHA, headSha: headShaFrom(env.GITHUB_EVENT_PATH), ref: env.GITHUB_REF, prNumber: opts.prNumber,
        ghRunId: env.GITHUB_RUN_ID, ghRunAttempt: env.GITHUB_RUN_ATTEMPT, files,
      }),
    }, 'POST /v1/runs');
    if (created.status === 402) return skip('no-plan', serviceMessage(created.json?.message) ?? NOTICES['no-plan']);
    if (created.status === 404 && created.json?.error === 'not_installed') return skip('not-installed');
    if (created.status === 413) return skip('too-large', `over the upload limit (${String(created.json?.limit ?? 'unknown')})`);
    const runId = created.json?.runId, secret = created.json?.uploadSecret;
    if (created.status !== 201 || typeof runId !== 'string' || typeof secret !== 'string') {
      throw new ServiceError(describe('POST /v1/runs', created));
    }

    const run = `${endpoint}/v1/runs/${encodeURIComponent(runId)}`;
    for (const file of files) {
      const path = file.path.split('/').map(encodeURIComponent).join('/');
      const put = await request(`${run}/files/${path}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': file.path === 'results.json' ? 'application/json' : 'image/png' },
        body: readFileSync(resolve(dir, file.path)),
      }, `PUT ${file.path}`);
      if (put.status < 200 || put.status > 299) throw new ServiceError(describe(`PUT ${file.path}`, put));
    }

    const done = await request(`${run}/complete`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } }, 'POST complete');
    const reportUrl = done.json?.reportUrl, comment = done.json?.comment;
    if (done.status !== 200 || typeof reportUrl !== 'string' || (comment !== 'created' && comment !== 'updated' && comment !== 'none')) {
      throw new ServiceError(describe('POST complete', done));
    }
    log(`${PREFIX}report: ${reportUrl}`);
    return { status: 'uploaded', reportUrl, comment };
  } catch (err) {
    const detail = err instanceof ServiceError ? err.message : `unexpected: ${(err as Error).message}`;
    return skip('service', `the fitlocale service did not answer (${detail})`);
  }
}

/** The service's own sentence for a refusal, made safe for a log line: one line, no control characters, at most 300 characters. */
function serviceMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const line = value.replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
  if (!line) return null;
  return line.length > 300 ? `${line.slice(0, 299)}…` : line;
}

function describe(what: string, res: { status: number; json: Record<string, unknown> | null }): string {
  if (!res.json) return `${what}: HTTP ${res.status}, not JSON`;
  const error = typeof res.json.error === 'string' ? ` ${res.json.error}` : '';
  return `${what}: HTTP ${res.status}${error}`;
}
