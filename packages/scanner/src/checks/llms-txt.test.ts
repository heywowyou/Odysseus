import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { checkLlmsTxt } from './llms-txt.js';

function startServer(routes: Record<string, { status: number; body: string }>): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const route = routes[req.url ?? '/'];
      if (!route) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(route.status, { 'content-type': 'text/plain' }).end(route.body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

describe('checkLlmsTxt', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it('reports found: true when /llms.txt responds ok', async () => {
    const started = await startServer({ '/llms.txt': { status: 200, body: '# Example\n' } });
    server = started.server;

    const result = await checkLlmsTxt(started.origin, 5000);

    expect(result.found).toBe(true);
    expect(result.url).toBe(`${started.origin}/llms.txt`);
  });

  it('reports found: false without throwing when /llms.txt is absent', async () => {
    const started = await startServer({});
    server = started.server;

    const result = await checkLlmsTxt(started.origin, 5000);

    expect(result.found).toBe(false);
    expect(result.fetchError).toBeDefined();
  });
});
