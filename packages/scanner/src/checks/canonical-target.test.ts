import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { checkCanonicalTarget, extractRobotsMetaContent } from './canonical-target.js';

describe('extractRobotsMetaContent', () => {
  it('reads content from a well-formed meta robots tag', () => {
    const html = '<html><head><meta name="robots" content="noindex, nofollow"></head></html>';
    expect(extractRobotsMetaContent(html)).toBe('noindex, nofollow');
  });

  it('is case-insensitive and attribute-order-independent', () => {
    const html = '<META CONTENT="NoIndex" NAME="Robots">';
    expect(extractRobotsMetaContent(html)).toBe('noindex');
  });

  it('returns null when there is no robots meta tag', () => {
    const html = '<html><head><meta name="description" content="hello"></head></html>';
    expect(extractRobotsMetaContent(html)).toBeNull();
  });

  it('ignores an unrelated meta tag that merely mentions robots in its content', () => {
    const html = '<meta name="description" content="about robots and automation">';
    expect(extractRobotsMetaContent(html)).toBeNull();
  });
});

function startServer(routes: Record<string, { status: number; body: string }>): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const route = routes[req.url ?? '/'];
      if (!route) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(route.status, { 'content-type': 'text/html' }).end(route.body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

describe('checkCanonicalTarget', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it('returns null for a self-referencing canonical (nothing new to check)', async () => {
    const pageUrl = 'https://example.com/page';
    expect(await checkCanonicalTarget(pageUrl, pageUrl, 5000)).toBeNull();
  });

  it('reports the httpStatus and noindex: false for a healthy target', async () => {
    const started = await startServer({ '/target': { status: 200, body: '<html><head></head></html>' } });
    server = started.server;

    const result = await checkCanonicalTarget(`${started.origin}/page`, `${started.origin}/target`, 5000);

    expect(result).toEqual({ pageUrl: `${started.origin}/page`, canonicalUrl: `${started.origin}/target`, httpStatus: 200, noindex: false });
  });

  it('reports noindex: true when the target carries a noindex directive', async () => {
    const started = await startServer({
      '/target': { status: 200, body: '<html><head><meta name="robots" content="noindex"></head></html>' },
    });
    server = started.server;

    const result = await checkCanonicalTarget(`${started.origin}/page`, `${started.origin}/target`, 5000);

    expect(result?.noindex).toBe(true);
  });

  it('reports the httpStatus without throwing for a non-2xx target', async () => {
    const started = await startServer({});
    server = started.server;

    const result = await checkCanonicalTarget(`${started.origin}/page`, `${started.origin}/missing`, 5000);

    expect(result?.httpStatus).toBe(404);
    expect(result?.noindex).toBe(false);
  });
});
