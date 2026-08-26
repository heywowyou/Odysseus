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

function startServer(
  routes: Record<string, { status: number; body: string }>,
): Promise<{ server: Server; origin: string }> {
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
      '/my-sitemap.xml': {
        status: 200,
        body: '<urlset><url><loc>https://example.com/</loc></url></urlset>',
      },
    });
    server = started.server;

    const result = await checkSitemap(started.origin, [`${started.origin}/my-sitemap.xml`], 5000);

    expect(result.found).toBe(true);
    expect(result.sitemapUrl).toBe(`${started.origin}/my-sitemap.xml`);
    expect(result.entries).toEqual([{ url: 'https://example.com/' }]);
  });

  it('falls back to /sitemap.xml when no declared URL is given', async () => {
    const started = await startServer({
      '/sitemap.xml': {
        status: 200,
        body: '<urlset><url><loc>https://example.com/</loc></url></urlset>',
      },
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
      '/sitemap.xml': {
        status: 200,
        body: '<urlset><url><loc>https://example.com/fallback</loc></url></urlset>',
      },
    });
    server = started.server;

    const result = await checkSitemap(
      started.origin,
      [`${started.origin}/missing-sitemap.xml`],
      5000,
    );

    expect(result.found).toBe(true);
    expect(result.sitemapUrl).toBe(`${started.origin}/sitemap.xml`);
  });

  it('recursively flattens nested indexes, dedupes pages, and prevents cycles', async () => {
    const routes: Record<string, { status: number; body: string }> = {};
    const started = await startServer(routes);
    server = started.server;
    routes['/sitemap.xml'] = {
      status: 200,
      body: `<sitemapindex>
        <sitemap><loc>${started.origin}/pages-a.xml</loc></sitemap>
        <sitemap><loc>${started.origin}/nested.xml</loc></sitemap>
      </sitemapindex>`,
    };
    routes['/pages-a.xml'] = {
      status: 200,
      body: `<urlset>
        <url><loc>${started.origin}/one</loc></url>
        <url><loc>${started.origin}/shared</loc></url>
      </urlset>`,
    };
    routes['/nested.xml'] = {
      status: 200,
      body: `<sitemapindex>
        <sitemap><loc>${started.origin}/pages-b.xml</loc></sitemap>
        <sitemap><loc>${started.origin}/sitemap.xml</loc></sitemap>
      </sitemapindex>`,
    };
    routes['/pages-b.xml'] = {
      status: 200,
      body: `<urlset>
        <url><loc>${started.origin}/shared</loc></url>
        <url><loc>${started.origin}/two?x=1&amp;y=2</loc></url>
      </urlset>`,
    };

    const result = await checkSitemap(started.origin, [], 5000);

    expect(result.isSitemapIndex).toBe(true);
    expect(result.fetchedSitemapUrls).toHaveLength(4);
    expect(result.fetchedDocuments).toEqual([
      {
        url: `${started.origin}/sitemap.xml`,
        isRoot: true,
        isSitemapIndex: true,
        entryCount: 2,
      },
      {
        url: `${started.origin}/pages-a.xml`,
        isRoot: false,
        isSitemapIndex: false,
        entryCount: 2,
      },
      {
        url: `${started.origin}/nested.xml`,
        isRoot: false,
        isSitemapIndex: true,
        entryCount: 2,
      },
      {
        url: `${started.origin}/pages-b.xml`,
        isRoot: false,
        isSitemapIndex: false,
        entryCount: 2,
      },
    ]);
    expect(result.pageEntries.map((entry) => entry.url)).toEqual([
      `${started.origin}/one`,
      `${started.origin}/shared`,
      `${started.origin}/two?x=1&y=2`,
    ]);
    expect(result.fetchErrors).toEqual([]);
  });

  it('keeps readable child pages and records partial index failures', async () => {
    const routes: Record<string, { status: number; body: string }> = {};
    const started = await startServer(routes);
    server = started.server;
    routes['/sitemap.xml'] = {
      status: 200,
      body: `<sitemapindex>
        <sitemap><loc>${started.origin}/pages.xml</loc></sitemap>
        <sitemap><loc>${started.origin}/missing.xml</loc></sitemap>
      </sitemapindex>`,
    };
    routes['/pages.xml'] = {
      status: 200,
      body: `<urlset><url><loc>${started.origin}/kept</loc></url></urlset>`,
    };

    const result = await checkSitemap(started.origin, [], 5000);

    expect(result.found).toBe(true);
    expect(result.pageEntries).toEqual([{ url: `${started.origin}/kept` }]);
    expect(result.fetchErrors).toEqual([
      { url: `${started.origin}/missing.xml`, error: 'HTTP 404' },
    ]);
  });

  it('preserves malformed declared page URLs for coverage filtering', async () => {
    const started = await startServer({
      '/sitemap.xml': {
        status: 200,
        body: '<urlset><url><loc>http://[</loc></url></urlset>',
      },
    });
    server = started.server;

    const result = await checkSitemap(started.origin, [], 5000);

    expect(result.pageEntries).toEqual([{ url: 'http://[' }]);
  });

  it('does not fetch a child sitemap outside the authorized hostname', async () => {
    const routes: Record<string, { status: number; body: string }> = {};
    const started = await startServer(routes);
    server = started.server;
    routes['/sitemap.xml'] = {
      status: 200,
      body: '<sitemapindex><sitemap><loc>https://other.example/pages.xml</loc></sitemap></sitemapindex>',
    };

    const result = await checkSitemap(started.origin, [], 5000);

    expect(result.fetchedSitemapUrls).toEqual([`${started.origin}/sitemap.xml`]);
    expect(result.fetchErrors).toEqual([
      { url: 'https://other.example/pages.xml', error: 'outside authorized hostname' },
    ]);
  });
});
