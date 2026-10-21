import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { main } from '../../src/cli';
import { uploadReport } from '../../src/upload';
import { makeCheck, makeIssue } from './fixtures';

interface Seen { method: string; url: string; auth: string; type: string; body: Buffer }
type Reply = { status: number; body?: unknown; raw?: string } | 'hang';

/** A fitlocale cloud stand-in: records every request and answers from `routes` (method + path prefix), else 404. */
async function fakeCloud(routes: Record<string, Reply>) {
  const seen: Seen[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization ?? '', type: req.headers['content-type'] ?? '', body: Buffer.concat(chunks) });
      const key = Object.keys(routes).find(k => `${req.method} ${req.url}`.startsWith(k));
      const reply = key ? routes[key] : { status: 404, body: { error: 'nope' } };
      if (reply === 'hang') return;
      res.writeHead(reply.status, { 'content-type': reply.raw ? 'text/html' : 'application/json' });
      res.end(reply.raw ?? (reply.body === undefined ? '' : JSON.stringify(reply.body)));
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, seen, close: () => { server.closeAllConnections(); server.close(); } };
}

const OK: Record<string, Reply> = {
  'GET /token': { status: 200, body: { value: 'oidc-jwt' } },
  'POST /v1/runs/run1/complete': { status: 200, body: { reportUrl: 'https://cloud.example/r/run1', comment: 'created' } },
  'PUT /v1/runs/run1/files/': { status: 204 },
  'POST /v1/runs': { status: 201, body: { runId: 'run1', uploadSecret: 'up-secret', expiresAt: '2026-01-01T01:00:00Z' } },
};

/** A report directory with results.json referencing `shots` (screenshot paths) and `crops` (issue crop paths). */
function reportDir(shots: string[] = ['screenshots/a.png', 'screenshots/b.png'], crops: string[] = ['screenshots/c.png']) {
  const dir = mkdtempSync(join(tmpdir(), 'fitlocale-upload-'));
  mkdirSync(join(dir, 'screenshots'));
  for (const [i, path] of [...shots, ...crops].entries()) {
    if (path.startsWith('screenshots/')) writeFileSync(join(dir, path), Buffer.alloc(10 + i));
  }
  const check = makeCheck({
    issues: crops.map(crop => makeIssue({ crop })),
    screenshots: shots.map(path => ({ mode: 'pseudo-long' as const, viewport: { width: 1280, height: 800 }, path, size: { width: 1280, height: 800 } })),
  });
  writeFileSync(join(dir, 'results.json'), JSON.stringify({ version: 1, createdAt: '2026-01-01T00:00:00Z', checks: [check], summary: { error: 1, warning: 0, info: 0 } }));
  return dir;
}

const actionsEnv = (url: string) => ({
  ACTIONS_ID_TOKEN_REQUEST_URL: `${url}/token?api-version=2.0`,
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token',
  GITHUB_SHA: 'abc123',
  GITHUB_REF: 'refs/pull/7/merge',
  GITHUB_RUN_ID: '99',
  GITHUB_RUN_ATTEMPT: '1',
});

async function upload(routes: Record<string, Reply>, opts: { dir?: string; env?: Record<string, string>; timeoutMs?: number } = {}) {
  const cloud = await fakeCloud(routes);
  const lines: string[] = [];
  try {
    const outcome = await uploadReport({
      dir: opts.dir ?? reportDir(), endpoint: cloud.url, prNumber: 7, env: opts.env ?? actionsEnv(cloud.url),
      fetch, log: line => lines.push(line), timeoutMs: opts.timeoutMs,
    });
    return { outcome, lines, seen: cloud.seen };
  } finally {
    cloud.close();
  }
}

test('uploads every declared file, then completes', async () => {
  const { outcome, lines, seen } = await upload(OK);
  const [token, create, ...rest] = seen;
  expect(token.url).toBe('/token?api-version=2.0&audience=fitlocale');
  expect(token.auth).toMatch(/^bearer request-token$/i);
  expect(create.method + ' ' + create.url).toBe('POST /v1/runs');
  expect(create.auth).toBe('Bearer oidc-jwt');
  const body = JSON.parse(create.body.toString());
  expect(body).toMatchObject({ sha: 'abc123', ref: 'refs/pull/7/merge', prNumber: 7, ghRunId: '99', ghRunAttempt: '1' });
  const sizes = Object.fromEntries((body.files as Array<{ path: string; size: number }>).map(f => [f.path, f.size]));
  expect(Object.keys(sizes).sort()).toEqual(['results.json', 'screenshots/a.png', 'screenshots/b.png', 'screenshots/c.png']);
  expect([sizes['screenshots/a.png'], sizes['screenshots/b.png'], sizes['screenshots/c.png']]).toEqual([10, 11, 12]);
  const puts = rest.filter(r => r.method === 'PUT');
  expect(puts.map(p => p.url).sort()).toEqual(['results.json', 'screenshots/a.png', 'screenshots/b.png', 'screenshots/c.png']
    .map(p => `/v1/runs/run1/files/${p}`));
  expect(puts.every(p => p.auth === 'Bearer up-secret')).toBe(true);
  expect(puts.find(p => p.url.endsWith('results.json'))!.type).toBe('application/json');
  expect(puts.find(p => p.url.endsWith('a.png'))!.type).toBe('image/png');
  expect(puts.find(p => p.url.endsWith('a.png'))!.body.length).toBe(10);
  const last = rest[rest.length - 1];
  expect(last.method + ' ' + last.url).toBe('POST /v1/runs/run1/complete');
  expect(last.auth).toBe('Bearer up-secret');
  expect(outcome).toEqual({ status: 'uploaded', reportUrl: 'https://cloud.example/r/run1', comment: 'created' });
  expect(lines).toContain('fitlocale upload: report: https://cloud.example/r/run1');
});

test('no OIDC environment is a notice', async () => {
  const { outcome, lines, seen } = await upload(OK, { env: { GITHUB_SHA: 'abc123' } });
  expect(outcome).toEqual({ status: 'skipped', reason: 'no-oidc' });
  expect(seen).toEqual([]);
  expect(lines).toEqual(['fitlocale upload: no GitHub OIDC token: add `permissions: id-token: write` to the job (pull requests from forks get none); the local report is unchanged']);
});

for (const [status, error, reason, notice] of [
  [402, { error: 'no_plan' }, 'no-plan', 'no active fitlocale plan for this repository; the local report is unchanged'],
  [404, { error: 'not_installed' }, 'not-installed', 'the fitlocale GitHub App is not installed on this repository'],
  [413, { error: 'too_large', limit: '200 files or 50 MB' }, 'too-large', 'over the upload limit (200 files or 50 MB)'],
] as const) {
  test(`${status} maps to ${reason}`, async () => {
    const { outcome, lines, seen } = await upload({ ...OK, 'POST /v1/runs': { status, body: error } });
    expect(outcome).toEqual({ status: 'skipped', reason });
    expect(lines).toEqual([`fitlocale upload: ${notice}`]);
    expect(seen.filter(r => r.method === 'PUT')).toEqual([]);
  });
}

test('a 500, HTML instead of JSON, or a timeout is a service notice', async () => {
  for (const reply of [{ status: 500, body: { error: 'boom' } }, { status: 201, raw: '<html>Bad gateway</html>' }] as const) {
    const { outcome, lines } = await upload({ ...OK, 'POST /v1/runs': reply });
    expect(outcome).toEqual({ status: 'skipped', reason: 'service' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^fitlocale upload: the fitlocale service did not answer \(.+\)$/);
  }
  const t0 = Date.now();
  const { outcome, lines } = await upload({ ...OK, 'POST /v1/runs': 'hang' }, { timeoutMs: 200 });
  expect(Date.now() - t0).toBeLessThan(1000);
  expect(outcome).toEqual({ status: 'skipped', reason: 'service' });
  expect(lines[0]).toMatch(/^fitlocale upload: the fitlocale service did not answer \(.+\)$/);
});

test('a failed file upload is a service notice and nothing is completed', async () => {
  const { outcome, seen } = await upload({ ...OK, 'PUT /v1/runs/run1/files/': { status: 500 } });
  expect(outcome).toEqual({ status: 'skipped', reason: 'service' });
  expect(seen.some(r => r.url.endsWith('/complete'))).toBe(false);
});

test('paths outside the report directory are not uploaded', async () => {
  const outside = join(tmpdir(), 'fitlocale-outside.png');
  writeFileSync(outside, 'secret');
  const dir = reportDir(['screenshots/a.png', '../outside.png', outside], []);
  writeFileSync(join(dir, '..', 'outside.png'), 'secret');
  const { outcome, lines, seen } = await upload(OK, { dir });
  const files = (JSON.parse(seen[1].body.toString()).files as Array<{ path: string }>).map(f => f.path).sort();
  expect(files).toEqual(['results.json', 'screenshots/a.png']);
  expect(lines.filter(l => l.includes('outside the report directory'))).toEqual([
    'fitlocale upload: not uploading ../outside.png: outside the report directory',
    `fitlocale upload: not uploading ${outside}: outside the report directory`,
  ]);
  expect(outcome.status).toBe('uploaded');
});

test('a run without issues still uploads', async () => {
  const { outcome } = await upload({ ...OK, 'POST /v1/runs/run1/complete': { status: 200, body: { reportUrl: 'https://cloud.example/r/run1', comment: 'none' } } },
    { dir: reportDir([], []) });
  expect(outcome).toEqual({ status: 'uploaded', reportUrl: 'https://cloud.example/r/run1', comment: 'none' });
});

test('no results.json is a notice', async () => {
  const { outcome, lines, seen } = await upload(OK, { dir: mkdtempSync(join(tmpdir(), 'fitlocale-upload-')) });
  expect(outcome).toEqual({ status: 'skipped', reason: 'no-results' });
  expect(lines[0]).toMatch(/^fitlocale upload: no results\.json in /);
  expect(seen).toEqual([]);
});

test('the CLI exits 0 on every skip', async () => {
  const cloud = await fakeCloud({ ...OK, 'POST /v1/runs': { status: 402, body: { error: 'no_plan' } } });
  const saved = { ...process.env };
  Object.assign(process.env, actionsEnv(cloud.url));
  const out: string[] = [];
  try {
    const code = await main(['upload', reportDir(), '--endpoint', cloud.url, '--pr', '7'], { stdout: s => out.push(s), stderr: s => out.push(s) });
    expect(code).toBe(0);
    expect(out.join('')).toContain('fitlocale upload: no active fitlocale plan for this repository');
  } finally {
    process.env = saved;
    cloud.close();
  }
});

test('the CLI takes the pull request from GITHUB_REF when --pr is empty', async () => {
  const cloud = await fakeCloud(OK);
  const saved = { ...process.env };
  Object.assign(process.env, actionsEnv(cloud.url), { GITHUB_REF: 'refs/pull/12/merge' });
  try {
    expect(await main(['upload', reportDir(), '--endpoint', `${cloud.url}/`, '--pr', ''], { stdout: () => {}, stderr: () => {} })).toBe(0);
    const create = cloud.seen.find(r => r.url === '/v1/runs')!;
    expect(JSON.parse(create.body.toString()).prNumber).toBe(12);
  } finally {
    process.env = saved;
    cloud.close();
  }
});
