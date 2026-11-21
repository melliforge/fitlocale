import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { main } from '../../src/cli';
import { postComment } from '../../src/comment/post';
import { MARKER } from '../../src/comment/render';
import type { Issue } from '../../src/types';
import { BOT, fakeGitHub, type Route } from './fake-github';
import { makeCheck, makeIssue, makeRun } from './fixtures';

const A = 'a'.repeat(40), B = 'b'.repeat(40);

/** A report directory whose results.json lists `issues`; null writes no results.json. */
function reportDir(issues: Issue[] | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'fitlocale-comment-'));
  if (issues) writeFileSync(join(dir, 'results.json'), JSON.stringify(makeRun([makeCheck({ issues })])));
  return dir;
}

function eventEnv(apiUrl: string, headSha = A): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'fitlocale-event-'));
  writeFileSync(join(dir, 'event.json'), JSON.stringify({ pull_request: { number: 7, head: { sha: headSha } } }));
  return {
    GITHUB_TOKEN: 'gh-token', GITHUB_API_URL: apiUrl, GITHUB_REPOSITORY: 'o/r', GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: join(dir, 'event.json'), GITHUB_SERVER_URL: 'https://github.test', GITHUB_RUN_ID: '99',
  };
}

const pull = (sha = A): Route => ({ status: 200, body: { number: 7, state: 'open', head: { sha } } });
const ours = (id: number) => ({ id, body: `${MARKER}\nold`, user: BOT, html_url: `https://github.test/c/${id}` });

async function post(routes: Record<string, Route>, o: { dirs?: string[]; eventSha?: string; env?: Record<string, string>; reportUrl?: string | null } = {}) {
  const api = await fakeGitHub({ 'GET /repos/o/r/pulls/7': pull(), ...routes });
  const lines: string[] = [];
  try {
    const outcome = await postComment({
      dirs: o.dirs ?? [reportDir([makeIssue()])], prNumber: null, reportUrl: o.reportUrl ?? null,
      env: o.env ?? eventEnv(api.url, o.eventSha), fetch, log: l => lines.push(l),
    });
    return { outcome, lines, seen: api.seen, writes: api.seen.filter(s => s.method === 'POST' || s.method === 'PATCH') };
  } finally {
    api.close();
  }
}

test('new issues and no comment: creates one', async () => {
  const { outcome, lines, writes } = await post({
    'GET /repos/o/r/issues/7/comments': { status: 200, body: [] },
    'POST /repos/o/r/issues/7/comments': { status: 201, body: { id: 5, html_url: 'https://github.test/c/5' } },
  });
  expect(outcome).toEqual({ status: 'created', url: 'https://github.test/c/5' });
  expect(writes).toHaveLength(1);
  const body = JSON.parse(writes[0].body).body as string;
  expect(body.startsWith(MARKER)).toBe(true);
  expect(body).toContain('1 new issue');
  expect(body).toContain('[the workflow run](https://github.test/o/r/actions/runs/99)');
  expect(lines).toEqual(['fitlocale comment: comment created: https://github.test/c/5']);
});

test('the artifact URL, when given, is the report link', async () => {
  const { writes } = await post({
    'GET /repos/o/r/issues/7/comments': { status: 200, body: [] },
    'POST /repos/o/r/issues/7/comments': { status: 201, body: { id: 5, html_url: 'u' } },
  }, { reportUrl: 'https://github.test/o/r/actions/runs/99/artifacts/3' });
  expect(JSON.parse(writes[0].body).body).toContain('[the report artifact](https://github.test/o/r/actions/runs/99/artifacts/3)');
});

test('a comment of ours exists: updated in place, to All clear when nothing is new', async () => {
  const routes = {
    'GET /repos/o/r/issues/7/comments': { status: 200, body: [ours(3)] },
    'PATCH /repos/o/r/issues/comments/3': { status: 200, body: { id: 3, html_url: 'https://github.test/c/3' } },
  };
  const first = await post(routes);
  expect(first.outcome).toEqual({ status: 'updated', url: 'https://github.test/c/3' });
  expect(first.writes.map(w => w.method)).toEqual(['PATCH']);
  const clear = await post(routes, { dirs: [reportDir([makeIssue({ baselined: true })])] });
  expect(clear.outcome.status).toBe('updated');
  expect(JSON.parse(clear.writes[0].body).body).toContain('All clear');
});

test('nothing new and no comment: posts nothing, and says so', async () => {
  const { outcome, writes, lines } = await post({ 'GET /repos/o/r/issues/7/comments': { status: 200, body: [] } }, { dirs: [reportDir([])] });
  expect(outcome).toEqual({ status: 'none' });
  expect(writes).toHaveLength(0);
  expect(lines).toEqual(['fitlocale comment: no new issues and no earlier comment; nothing posted']);
});

test('our comment was deleted: creates a new one', async () => {
  const { outcome, writes } = await post({
    'GET /repos/o/r/issues/7/comments': { status: 200, body: [ours(3)] },
    'PATCH /repos/o/r/issues/comments/3': { status: 404, body: { message: 'Not Found' } },
    'POST /repos/o/r/issues/7/comments': { status: 201, body: { id: 6, html_url: 'https://github.test/c/6' } },
  });
  expect(writes.map(w => w.method)).toEqual(['PATCH', 'POST']);
  expect(outcome).toEqual({ status: 'created', url: 'https://github.test/c/6' });
});

test('our comment was deleted and nothing is new: stays silent', async () => {
  const { outcome, writes } = await post({
    'GET /repos/o/r/issues/7/comments': { status: 200, body: [ours(3)] },
    'PATCH /repos/o/r/issues/comments/3': { status: 404, body: { message: 'Not Found' } },
  }, { dirs: [reportDir([])] });
  expect(writes.map(w => w.method)).toEqual(['PATCH']);
  expect(outcome).toEqual({ status: 'none' });
});

test('an older commit\'s late run leaves the comment alone', async () => {
  const { outcome, writes, lines } = await post({ 'GET /repos/o/r/pulls/7': pull(B), 'GET /repos/o/r/issues/7/comments': { status: 200, body: [ours(3)] } });
  expect(outcome).toEqual({ status: 'skipped', reason: 'outdated' });
  expect(writes).toHaveLength(0);
  expect(lines).toEqual(['fitlocale comment: a newer commit is on the pull request; leaving its comment alone']);
});

test('a read-only token is one notice, no retry', async () => {
  const { outcome, writes, lines } = await post({
    'GET /repos/o/r/issues/7/comments': { status: 200, body: [] },
    'POST /repos/o/r/issues/7/comments': { status: 403, body: { message: 'Resource not accessible by integration' } },
  });
  expect(outcome).toEqual({ status: 'skipped', reason: 'forbidden' });
  expect(writes).toHaveLength(1);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain('pull-requests: write');
  expect(lines[0]).toContain('https://melliforge.github.io/fitlocale/reference/github-action#forks');
});

test('GitHub not answering is one notice', async () => {
  const { outcome, lines } = await post({ 'GET /repos/o/r/issues/7/comments': { status: 500, body: {} } });
  expect(outcome).toEqual({ status: 'skipped', reason: 'service' });
  expect(lines).toEqual(['fitlocale comment: GitHub did not answer (list comments: HTTP 500); no comment']);
});

test('several report dirs make one comment; a missing one is skipped', async () => {
  const missing = reportDir(null);
  const { outcome, writes, lines } = await post({
    'GET /repos/o/r/issues/7/comments': { status: 200, body: [] },
    'POST /repos/o/r/issues/7/comments': { status: 201, body: { id: 5, html_url: 'u' } },
  }, { dirs: [reportDir([makeIssue({ selector: '#a' })]), missing, reportDir([makeIssue({ selector: '#c' })])] });
  expect(outcome.status).toBe('created');
  expect(JSON.parse(writes[0].body).body).toContain('2 new issues');
  expect(lines[0]).toBe(`fitlocale comment: no results.json in ${missing}`);
});

test('no results anywhere, no token, or no pull request: one notice and nothing sent', async () => {
  const none = await post({}, { dirs: [reportDir(null)] });
  expect(none.outcome).toEqual({ status: 'skipped', reason: 'no-results' });
  expect(none.seen).toHaveLength(0);

  const api = await fakeGitHub({});
  try {
    const env = eventEnv(api.url);
    const lines: string[] = [];
    const run = (e: Record<string, string>) => postComment({ dirs: [reportDir([makeIssue()])], prNumber: null, reportUrl: null, env: e, fetch, log: l => lines.push(l) });
    expect(await run({ ...env, GITHUB_TOKEN: '' })).toEqual({ status: 'skipped', reason: 'no-token' });
    expect(await run({ ...env, GITHUB_EVENT_NAME: 'push' })).toEqual({ status: 'skipped', reason: 'not-a-pr' });
    expect(lines).toEqual([
      'fitlocale comment: no GitHub token: the Action passes github.token; outside it set GITHUB_TOKEN',
      'fitlocale comment: not a pull request run; nothing to comment on',
    ]);
    expect(api.seen).toHaveLength(0);
  } finally {
    api.close();
  }
});

function capture() {
  const out = { stdout: '', stderr: '' };
  return { out, io: { stdout: (s: string) => { out.stdout += s; }, stderr: (s: string) => { out.stderr += s; } } };
}

test('CLI: exits 0 without a token and prints one line', async () => {
  const saved = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  try {
    const { out, io } = capture();
    expect(await main(['comment', reportDir([makeIssue()]), reportDir([])], io)).toBe(0);
    expect(out.stdout.split('\n').filter(Boolean)).toHaveLength(1);
    expect(out.stdout.startsWith('fitlocale comment: ')).toBe(true);
  } finally {
    if (saved !== undefined) process.env.GITHUB_TOKEN = saved;
  }
});

test('CLI: no directory is a usage error', async () => {
  const { out, io } = capture();
  expect(await main(['comment'], io)).toBe(1);
  expect(out.stderr).toContain('Usage:');
});
