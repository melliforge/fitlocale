import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Seen { method: string; url: string; headers: IncomingMessage['headers']; body: string }
export type Reply = { status: number; body?: unknown } | 'hang';
/** A route answers with a reply, or computes one from the request. */
export type Route = Reply | ((req: Seen) => Reply);

/**
 * A GitHub REST API stand-in on 127.0.0.1: records every request and answers from `routes`. The key is
 * `METHOD /path` and matches when the request line starts with it; the longest match wins. Anything else is 404.
 */
export async function fakeGitHub(routes: Record<string, Route>) {
  const seen: Seen[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const request: Seen = { method: req.method!, url: req.url!, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
      seen.push(request);
      const line = `${req.method} ${req.url}`;
      const key = Object.keys(routes).filter(k => line.startsWith(k)).sort((a, b) => b.length - a.length)[0];
      const route = key ? routes[key] : { status: 404, body: { message: 'Not Found' } };
      const reply = typeof route === 'function' ? route(request) : route;
      if (reply === 'hang') return;
      res.writeHead(reply.status, { 'content-type': 'application/json' });
      res.end(reply.body === undefined ? '' : JSON.stringify(reply.body));
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, seen, close: () => { server.closeAllConnections(); server.close(); } };
}

export const BOT = { login: 'github-actions[bot]', type: 'Bot' };
