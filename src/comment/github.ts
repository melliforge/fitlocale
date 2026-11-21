import { MARKER } from './render';

/** A request GitHub refused, or one that got no answer in time. */
export class GitHubError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/** The author of comments made with an Actions job's `github.token`. */
export const ACTIONS_BOT = 'github-actions[bot]';
const TIMEOUT_MS = 30_000;

export interface GitHubOptions { apiUrl: string; token: string; fetch: typeof fetch; timeoutMs?: number }

const repoPath = (repo: string) => repo.split('/').map(encodeURIComponent).join('/');

/** The few GitHub REST calls `fitlocale comment` makes, through global fetch, each bounded by a timeout. */
export function createGitHub(o: GitHubOptions) {
  const api = o.apiUrl.replace(/\/+$/, '');
  const timeoutMs = o.timeoutMs ?? TIMEOUT_MS;

  const call = async (what: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; json: any }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await o.fetch(api + path, {
        method: init.method ?? 'GET',
        headers: {
          Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'fitlocale',
          Authorization: `Bearer ${o.token}`, ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
      const text = await res.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* a proxy's error page: the status decides */ }
      return { status: res.status, json };
    } catch (err) {
      throw new GitHubError(0, `${what}: ${controller.signal.aborted ? `no answer within ${timeoutMs / 1000} s` : (err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  };
  const expect = async (what: string, ok: number[], path: string, init?: { method?: string; body?: unknown }) => {
    const res = await call(what, path, init);
    if (!ok.includes(res.status)) throw new GitHubError(res.status, `${what}: HTTP ${res.status}`);
    return res;
  };
  const sha = (pull: any): string => String(pull?.head?.sha ?? '');

  return {
    async getPull(repo: string, pr: number): Promise<{ number: number; headSha: string; state: string }> {
      const { json } = await expect('read pull request', [200], `/repos/${repoPath(repo)}/pulls/${pr}`);
      return { number: Number(json?.number), state: String(json?.state ?? ''), headSha: sha(json) };
    },
    async openPullsForHead(repo: string, headLabel: string): Promise<Array<{ number: number; headSha: string }>> {
      const { json } = await expect('find pull request', [200], `/repos/${repoPath(repo)}/pulls?state=open&head=${encodeURIComponent(headLabel)}&per_page=100`);
      return (Array.isArray(json) ? json : []).map(p => ({ number: Number(p?.number), headSha: sha(p) }));
    },
    /** Our comment: the first whose body starts with the marker and that the Actions bot wrote. Others are never ours. */
    async findComment(repo: string, pr: number): Promise<number | null> {
      // 10 pages of 100 is far beyond what a pull request conversation holds.
      for (let page = 1; page <= 10; page++) {
        const { json } = await expect('list comments', [200], `/repos/${repoPath(repo)}/issues/${pr}/comments?per_page=100&page=${page}`);
        const list: any[] = Array.isArray(json) ? json : [];
        const ours = list.find(c => typeof c?.body === 'string' && c.body.startsWith(MARKER) && c?.user?.login === ACTIONS_BOT);
        if (ours) return Number(ours.id);
        if (list.length < 100) break;
      }
      return null;
    },
    async createComment(repo: string, pr: number, body: string): Promise<{ id: number; url: string }> {
      const { json } = await expect('create comment', [201], `/repos/${repoPath(repo)}/issues/${pr}/comments`, { method: 'POST', body: { body } });
      return { id: Number(json?.id), url: String(json?.html_url ?? '') };
    },
    async updateComment(repo: string, id: number, body: string): Promise<{ url: string } | 'gone'> {
      const res = await call('update comment', `/repos/${repoPath(repo)}/issues/comments/${id}`, { method: 'PATCH', body: { body } });
      if (res.status === 404) return 'gone';
      if (res.status !== 200) throw new GitHubError(res.status, `update comment: HTTP ${res.status}`);
      return { url: String(res.json?.html_url ?? '') };
    },
  };
}

export type GitHub = ReturnType<typeof createGitHub>;
