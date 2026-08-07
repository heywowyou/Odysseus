import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { checkSitemap, parseSitemapXml } from './sitemap.js';

describe('parseSitemapXml', () => {
  it('extracts loc/lastmod pairs from a well-formed urlset sitemap', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/</loc><lastmod>2026-01-01</lastmod></url>
        <url><loc>https://example.com/about</loc><lastmod>2025-06-15</lastmod></url>
      </urlset>`;

    const result = parseSitemapXml(xml);

    expect(result.isSitemapIndex).toBe(false);
    expect(result.entries).toEqual([
      { url: 'https://example.com/', lastmod: '2026-01-01' },
      { url: 'https://example.com/about', lastmod: '2025-06-15' },
    ]);
  });

  it('handles entries with no lastmod', () => {
    const xml = `<urlset><url><loc>https://example.com/</loc></url></urlset>`;
    expect(parseSitemapXml(xml).entries).toEqual([{ url: 'https://example.com/' }]);
  });

  it('detects a sitemap index and extracts its <sitemap> entries', () => {
    const xml = `<sitemapindex>
      <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
      <sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
    </sitemapindex>`;

    const result = parseSitemapXml(xml);

    expect(result.isSitemapIndex).toBe(true);
    expect(result.entries).toEqual([
      { url: 'https://example.com/sitemap-pages.xml' },
      { url: 'https://example.com/sitemap-posts.xml' },
    ]);
  });

  it('does not pair a lastmod from one entry with the next entry loc', () => {
    const xml = `<urlset>
      <url><loc>https://example.com/a</loc><lastmod>2020-01-01</lastmod></url>
      <url><loc>https://example.com/b</loc></url>
    </urlset>`;

    const result = parseSitemapXml(xml);

    expect(result.entries).toEqual([
      { url: 'https://example.com/a', lastmod: '2020-01-01' },
      { url: 'https://example.com/b' },
    ]);
  });

  it('falls back to bare <loc> matching for non-conformant XML with no <url> wrapper', () => {
    const xml = `<somewrapper><loc>https://example.com/a</loc><loc>https://example.com/b</loc></somewrapper>`;
    expect(parseSitemapXml(xml).entries).toEqual([
      { url: 'https://example.com/a' },
      { url: 'https://example.com/b' },
    ]);
  });

  it('returns an empty entries array for empty input', () => {
    expect(parseSitemapXml('').entries).toEqual([]);
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
      res.writeHead(route.status, { 'content-type': 'application/xml' }).end(route.body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

describe('checkSitemap', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it('fetches a declared robots.txt sitemap URL and parses it', async () => {
    const started = await startServer({
      '/my-sitemap.xml': { status: 200, body: '<urlset><url><loc>https://example.com/</loc></url></urlset>' },
    });
    server = started.server;

    const result = await checkSitemap(started.origin, [`${started.origin}/my-sitemap.xml`], 5000);

    expect(result.found).toBe(true);
    expect(result.sitemapUrl).toBe(`${started.origin}/my-sitemap.xml`);
    expect(result.entries).toEqual([{ url: 'https://example.com/' }]);
  });

  it('falls back to /sitemap.xml when no declared URL is given', async () => {
    const started = await startServer({
      '/sitemap.xml': { status: 200, body: '<urlset><url><loc>https://example.com/</loc></url></urlset>' },
    });
    server = started.server;

    const result = await checkSitemap(started.origin, [], 5000);

    expect(result.found).toBe(true);
    expect(result.sitemapUrl).toBe(`${started.origin}/sitemap.xml`);
  });

  it('resolves not-found rather than throwing when neither declared nor fallback sitemap exists', async () => {
    const started = await startServer({});
    server = started.server;

    const result = await checkSitemap(started.origin, [], 5000);

    expect(result.found).toBe(false);
    expect(result.entries).toEqual([]);
    expect(result.fetchError).toBeDefined();
  });

  it('tries the fallback path when the declared URL 404s', async () => {
    const started = await startServer({
      '/sitemap.xml': { status: 200, body: '<urlset><url><loc>https://example.com/fallback</loc></url></urlset>' },
    });
    server = started.server;

    const result = await checkSitemap(started.origin, [`${started.origin}/missing-sitemap.xml`], 5000);

    expect(result.found).toBe(true);
    expect(result.sitemapUrl).toBe(`${started.origin}/sitemap.xml`);
  });
});
