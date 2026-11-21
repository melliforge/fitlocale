import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { createGitHub, GitHubError } from '../../src/comment/github';
import { MARKER } from '../../src/comment/render';
import { resolveTarget } from '../../src/comment/target';
import { BOT, fakeGitHub, type Route } from './fake-github';

async function withGitHub<T>(routes: Record<string, Route>, fn: (gh: ReturnType<typeof createGitHub>, api: Awaited<ReturnType<typeof fakeGitHub>>) => Promise<T>, timeoutMs?: number) {
  const api = await fakeGitHub(routes);
  try {
    return await fn(createGitHub({ apiUrl: api.url, token: 'gh-token', fetch, timeoutMs }), api);
  } finally {
    api.close();
  }
}

const comment = (id: number, body: string, user: { login: string; type: string } = BOT) => ({ id, body, user, html_url: `https://github.test/c/${id}` });

test('findComment skips a marker comment by another user and finds ours on page 2', async () => {
  const page1 = [...Array.from({ length: 99 }, (_, i) => comment(i + 1, 'hello')), comment(500, `${MARKER}\nfake`, { login: 'mallory', type: 'User' })];
  const id = await withGitHub({
    'GET /repos/o/r/issues/7/comments?per_page=100&page=1': { status: 200, body: page1 },
    'GET /repos/o/r/issues/7/comments?per_page=100&page=2': { status: 200, body: [comment(777, `${MARKER}\n**fitlocale:** …`)] },
  }, gh => gh.findComment('o/r', 7));
  expect(id).toBe(777);
});

test('findComment returns null when only other users used the marker', async () => {
  const id = await withGitHub({
    'GET /repos/o/r/issues/7/comments': { status: 200, body: [comment(1, `${MARKER}\nfake`, { login: 'mallory', type: 'User' }), comment(2, 'no marker')] },
  }, gh => gh.findComment('o/r', 7));
  expect(id).toBeNull();
});

test('requests carry the API version, bearer token and user agent', async () => {
  await withGitHub({ 'POST /repos/o/r/issues/7/comments': { status: 201, body: comment(9, 'x') } }, async (gh, api) => {
    expect(await gh.createComment('o/r', 7, 'hi')).toEqual({ id: 9, url: 'https://github.test/c/9' });
    const h = api.seen[0].headers;
    expect(h.authorization).toBe('Bearer gh-token');
    expect(h['x-github-api-version']).toBe('2022-11-28');
    expect(h.accept).toBe('application/vnd.github+json');
    expect(h['user-agent']).toBe('fitlocale');
    expect(JSON.parse(api.seen[0].body)).toEqual({ body: 'hi' });
  });
});

test('a hung request fails within the timeout', async () => {
  const err = await withGitHub({ 'GET /repos/o/r/pulls/7': 'hang' }, gh => gh.getPull('o/r', 7).catch(e => e), 200);
  expect(err).toBeInstanceOf(GitHubError);
  expect((err as Error).message).toContain('no answer');
});

test('a refused request is a GitHubError with its status', async () => {
  const err = await withGitHub({ 'POST /repos/o/r/issues/7/comments': { status: 403, body: { message: 'Resource not accessible by integration' } } },
    gh => gh.createComment('o/r', 7, 'x').catch(e => e));
  expect(err).toBeInstanceOf(GitHubError);
  expect((err as GitHubError).status).toBe(403);
  expect((err as Error).message).toBe('create comment: HTTP 403');
});

test('updateComment reports a deleted comment as gone', async () => {
  await withGitHub({
    'PATCH /repos/o/r/issues/comments/5': { status: 404, body: { message: 'Not Found' } },
    'PATCH /repos/o/r/issues/comments/6': { status: 200, body: comment(6, 'x') },
  }, async gh => {
    expect(await gh.updateComment('o/r', 5, 'x')).toBe('gone');
    expect(await gh.updateComment('o/r', 6, 'x')).toEqual({ url: 'https://github.test/c/6' });
  });
});

test('getPull and openPullsForHead read the head sha', async () => {
  await withGitHub({
    'GET /repos/o/r/pulls/7': { status: 200, body: { number: 7, state: 'open', head: { sha: 'a'.repeat(40) } } },
    'GET /repos/o/r/pulls?state=open&head=fork%3Afeature&per_page=100': { status: 200, body: [{ number: 8, head: { sha: 'b'.repeat(40) } }] },
  }, async gh => {
    expect(await gh.getPull('o/r', 7)).toEqual({ number: 7, state: 'open', headSha: 'a'.repeat(40) });
    expect(await gh.openPullsForHead('o/r', 'fork:feature')).toEqual([{ number: 8, headSha: 'b'.repeat(40) }]);
  });
});

/** An Actions environment whose event file holds `payload`. */
function actionsEnv(name: string, payload: unknown): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'fitlocale-event-'));
  writeFileSync(join(dir, 'event.json'), JSON.stringify(payload));
  return {
    GITHUB_REPOSITORY: 'o/r', GITHUB_EVENT_NAME: name, GITHUB_EVENT_PATH: join(dir, 'event.json'),
    GITHUB_SERVER_URL: 'https://github.test', GITHUB_RUN_ID: '99',
  };
}
const A = 'a'.repeat(40), B = 'b'.repeat(40);
const noPulls = { openPullsForHead: async () => [] };

test('pull_request event: number and head sha from the payload', async () => {
  const env = actionsEnv('pull_request', { pull_request: { number: 7, head: { sha: A } } });
  expect(await resolveTarget(env, noPulls, null)).toEqual({ repo: 'o/r', pr: 7, headSha: A, runUrl: 'https://github.test/o/r/actions/runs/99' });
  expect(await resolveTarget({ ...env, GITHUB_EVENT_NAME: 'pull_request_target' }, noPulls, null)).toMatchObject({ pr: 7 });
});

test('workflow_run from a fork: the open PR whose head matches the run\'s sha', async () => {
  const env = actionsEnv('workflow_run', { workflow_run: {
    head_sha: A, head_branch: 'feature', html_url: 'https://github.test/o/r/actions/runs/42',
    head_repository: { owner: { login: 'fork' } }, pull_requests: [],
  } });
  const labels: string[] = [];
  const gh = { openPullsForHead: async (_repo: string, label: string) => { labels.push(label); return [{ number: 3, headSha: B }, { number: 4, headSha: A }]; } };
  expect(await resolveTarget(env, gh, null)).toEqual({ repo: 'o/r', pr: 4, headSha: A, runUrl: 'https://github.test/o/r/actions/runs/42' });
  expect(labels).toEqual(['fork:feature']);
});

test('workflow_run with no matching PR, or with several, is not-a-pr', async () => {
  const env = actionsEnv('workflow_run', { workflow_run: { head_sha: A, head_branch: 'f', html_url: 'u', head_repository: { owner: { login: 'x' } } } });
  expect(await resolveTarget(env, noPulls, null)).toEqual({ skip: 'not-a-pr' });
  const two = { openPullsForHead: async () => [{ number: 3, headSha: A }, { number: 4, headSha: A }] };
  expect(await resolveTarget(env, two, null)).toEqual({ skip: 'not-a-pr' });
});

test('push event is not-a-pr; --pr overrides', async () => {
  const env = actionsEnv('push', { after: A });
  expect(await resolveTarget(env, noPulls, null)).toEqual({ skip: 'not-a-pr' });
  expect(await resolveTarget(env, noPulls, 12)).toMatchObject({ repo: 'o/r', pr: 12, headSha: '' });
});

test('no event file is no-event; a malformed head sha becomes empty', async () => {
  expect(await resolveTarget({ GITHUB_REPOSITORY: 'o/r' }, noPulls, null)).toEqual({ skip: 'no-event' });
  const env = actionsEnv('pull_request', { pull_request: { number: 7, head: { sha: 'not-a-sha' } } });
  expect(await resolveTarget(env, noPulls, null)).toMatchObject({ pr: 7, headSha: '' });
});
