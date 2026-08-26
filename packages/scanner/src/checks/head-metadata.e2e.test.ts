import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../browser.js';
import { extractHeadMetadata } from './head-metadata.js';

/** Same startStaticServer pattern as transactional-flow.e2e.test.ts: a
 *  plain HTTP server serving fixed HTML, no build step, just enough to
 *  drive a real Playwright navigation and confirm DOM extraction reads
 *  real page state (selectors especially - a fixture is the only way to
 *  confirm a real, non-sentinel selector comes back). */
function startStaticServer(
  routes: Record<string, string>,
): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const body = routes[req.url ?? '/'];
      if (body === undefined) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

describe('extractHeadMetadata against real pages', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  async function extractFromHtml(html: string): ReturnType<typeof extractHeadMetadata> {
    const { server, origin } = await startStaticServer({ '/': html });
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(origin);
      return await extractHeadMetadata(page, origin);
    } finally {
      await context.close();
      server.close();
    }
  }

  it('reads title, description, canonical, and Open Graph tags from a well-formed page', async () => {
    const html = `<head>
      <title>A reasonable page title</title>
      <meta name="description" content="A reasonable meta description." />
      <link rel="canonical" href="https://example.com/" />
      <meta property="og:title" content="Reasonable" />
      <meta property="og:description" content="Reasonable description" />
    </head><body><h1>Main heading</h1></body>`;

    const result = await extractFromHtml(html);

    expect(result.title).toBe('A reasonable page title');
    expect(result.metaDescription).toBe('A reasonable meta description.');
    expect(result.canonicalUrls).toEqual(['https://example.com/']);
    expect(result.openGraphTags).toEqual({
      'og:title': 'Reasonable',
      'og:description': 'Reasonable description',
    });
  });

  it('returns real, non-sentinel selectors for headings and JSON-LD blocks, and a parse error for invalid JSON-LD', async () => {
    const html = `<head>
      <script type="application/ld+json">{not valid json</script>
    </head><body>
      <h1>Main</h1>
      <h4>Skips to level 4</h4>
    </body>`;

    const result = await extractFromHtml(html);

    expect(result.headings).toHaveLength(2);
    expect(result.headings[0]).toMatchObject({ level: 1, text: 'Main' });
    expect(result.headings[0]?.selector).not.toBe('body');
    expect(result.headings[0]?.selector).not.toBe(':root');
    expect(result.headings[1]).toMatchObject({ level: 4, text: 'Skips to level 4' });

    expect(result.jsonLdBlocks).toHaveLength(1);
    expect(result.jsonLdBlocks[0]?.parseError).toBeDefined();
    expect(result.jsonLdBlocks[0]?.selector).not.toBe('script');
    expect(result.jsonLdBlocks[0]?.selector).toContain('script');
  });

  it('uses a real #id selector for a JSON-LD block that has one', async () => {
    const html = `<head>
      <script id="ld-main" type="application/ld+json">{"@type":"WebPage"}</script>
    </head><body></body>`;

    const result = await extractFromHtml(html);

    expect(result.jsonLdBlocks).toHaveLength(1);
    expect(result.jsonLdBlocks[0]?.selector).toBe('#ld-main');
    expect(result.jsonLdBlocks[0]?.parseError).toBeUndefined();
    expect(result.jsonLdBlocks[0]?.parsed).toEqual({ '@type': 'WebPage' });
  });

  it('reads multiple canonical tags and multiple JSON-LD blocks distinctly', async () => {
    const html = `<head>
      <link rel="canonical" href="https://example.com/a" />
      <link rel="canonical" href="https://example.com/b" />
      <script type="application/ld+json">{"@type":"A"}</script>
      <script type="application/ld+json">{"@type":"B"}</script>
    </head><body></body>`;

    const result = await extractFromHtml(html);

    expect(result.canonicalUrls).toEqual(['https://example.com/a', 'https://example.com/b']);
    expect(result.jsonLdBlocks).toHaveLength(2);
    expect(result.jsonLdBlocks[0]?.selector).not.toBe(result.jsonLdBlocks[1]?.selector);
  });

  it('returns null title/description and empty arrays when nothing is present', async () => {
    const html = `<head></head><body><p>No metadata here.</p></body>`;

    const result = await extractFromHtml(html);

    expect(result.title).toBeNull();
    expect(result.metaDescription).toBeNull();
    expect(result.canonicalUrls).toEqual([]);
    expect(result.openGraphTags).toEqual({});
    expect(result.jsonLdBlocks).toEqual([]);
    expect(result.headings).toEqual([]);
    expect(result.hreflangLinks).toEqual([]);
    expect(result.robotsMeta).toBeNull();
  });

  it('reads hreflang alternate links and the robots meta directive', async () => {
    const html = `<head>
      <link rel="alternate" hreflang="en" href="https://example.com/en/" />
      <link rel="alternate" hreflang="fr" href="https://example.com/fr/" />
      <meta name="robots" content="NOINDEX, follow" />
    </head><body></body>`;

    const result = await extractFromHtml(html);

    expect(result.hreflangLinks).toEqual([
      { lang: 'en', href: 'https://example.com/en/' },
      { lang: 'fr', href: 'https://example.com/fr/' },
    ]);
    expect(result.robotsMeta).toBe('noindex, follow');
  });
});
