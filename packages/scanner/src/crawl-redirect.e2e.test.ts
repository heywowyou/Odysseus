import http, { type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { crawlSite } from './crawl.js';

/**
 * Reproduces a real bug found auditing lacoorniche.com: the site's
 * www subdomain permanently redirects (301) to the apex domain, and every
 * link on the landed page is naturally absolute against that apex origin.
 * Before the fix, crawlSite resolved links against the pre-redirect
 * request URL, so the entire real site looked cross-origin and got
 * dropped - visitedCount was 1 no matter the configured maxPages. Two
 * origins in this test (PORT_A redirecting to PORT_B) reproduce the same
 * "requested origin != landed origin" shape without needing a resolvable
 * second hostname.
 */
const PORT_A = 5188;
const PORT_B = 5189;

let redirectServer: Server;
let targetServer: Server;
let browser: Browser;

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve) => server.listen(port, resolve));
}

function close(server: Server | undefined): Promise<void> {
  return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
}

describe('crawlSite following a cross-origin redirect', () => {
  beforeAll(async () => {
    redirectServer = http.createServer((_req, res) => {
      res.writeHead(301, { Location: `http://localhost:${PORT_B}/` });
      res.end();
    });
    targetServer = http.createServer((req, res) => {
      if (req.url === '/page2') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>page 2</body></html>');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body><a href="http://localhost:${PORT_B}/page2">Page 2</a></body></html>`);
    });
    await Promise.all([listen(redirectServer, PORT_A), listen(targetServer, PORT_B)]);
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await close(redirectServer);
    await close(targetServer);
  });

  it('follows links resolved against the landed origin, not the pre-redirect request origin', async () => {
    const result = await crawlSite(`http://localhost:${PORT_A}/`, {
      browser,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
    });

    expect(result.visitedCount).toBe(2);
    const page2 = result.pages.find((page) => page.url === `http://localhost:${PORT_B}/page2`);
    expect(page2?.status).toBe('visited');
  }, 30_000);
});

describe('sitemap coverage through a same-site redirect', () => {
  const PORT = 5190;
  const origin = `http://localhost:${PORT}`;
  let server: Server;
  let ownBrowser: Browser;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/robots.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml`);
        return;
      }
      if (req.url === '/sitemap.xml') {
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        res.end(
          `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
            `<url><loc>${origin}/</loc></url><url><loc>${origin}/old-room</loc></url></urlset>`,
        );
        return;
      }
      if (req.url === '/old-room') {
        res.writeHead(301, { Location: `${origin}/room` });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html lang="fr"><body><h1>${req.url}</h1></body></html>`);
    });
    await listen(server, PORT);
    ({ browser: ownBrowser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await ownBrowser?.close();
    await close(server);
  });

  it('counts a sitemap URL as reached when its redirect target was scanned', async () => {
    const result = await crawlSite(`${origin}/`, {
      browser: ownBrowser,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
      sitemapMode: 'supplement',
    });

    expect(result.pages.find((page) => page.url === `${origin}/old-room`)?.status).toBe(
      'redirect-interstitial',
    );
    expect(result.pages.find((page) => page.url === `${origin}/room`)?.status).toBe('visited');
    expect(result.sitemapCoverage).toMatchObject({ eligiblePageCount: 2, scannedPageCount: 2 });
  }, 45_000);
});

/**
 * Plan 075 H6. Grand Hôtel des Alpes runs WPML's browser-language redirect:
 * a visitor whose browser language differs from the page's is sent to the
 * translation in their language. Chromium's default English locale sent
 * every French page to its English twin, so the French site was never
 * audited. The audit browser now presents French.
 */
describe('a site that redirects by browser language', () => {
  const PORT = 5194;
  const origin = `http://localhost:${PORT}`;
  let server: Server;
  let ownBrowser: Browser;
  const acceptLanguages: string[] = [];

  const page = (lang: string, twin: string, body: string): string =>
    `<html lang="${lang}"><head><script>` +
    `if (!navigator.language.toLowerCase().startsWith('${lang}')) location.replace('${twin}');` +
    `</script></head><body>${body}</body></html>`;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      acceptLanguages.push(String(req.headers['accept-language'] ?? ''));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (req.url === '/fr/chambres') {
        res.end(page('fr', '/en/rooms', '<h1>Chambres</h1>'));
        return;
      }
      if (req.url === '/en/rooms') {
        res.end(page('en', '/fr/chambres', '<h1>Rooms</h1>'));
        return;
      }
      res.end('<html lang="fr"><body><a href="/fr/chambres">Chambres</a></body></html>');
    });
    await listen(server, PORT);
    ({ browser: ownBrowser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await ownBrowser?.close();
    await close(server);
  });

  it('audits the French page instead of following the redirect to its English twin', async () => {
    const result = await crawlSite(`${origin}/`, {
      browser: ownBrowser,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
    });

    const french = result.pages.find((entry) => entry.url === `${origin}/fr/chambres`);
    expect(french?.status).toBe('visited');
    expect(acceptLanguages.some((header) => header.startsWith('fr-FR'))).toBe(true);
  }, 30_000);
});

// A site that serves its pages only under the slashed spelling its links
// use and redirects the bare spelling to the homepage (atrium-hotel.fr):
// fetching the slash-free identity alone recorded every page as a redirect
// to the homepage.
describe('a page served only with its trailing slash', () => {
  const PORT = 5195;
  const origin = `http://localhost:${PORT}`;
  let server: Server;
  let ownBrowser: Browser;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? '/';
      if (url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html lang="fr"><body><a href="/chambres/">Chambres</a>' +
            '<a href="/ancienne-offre">Offre</a></body></html>',
        );
        return;
      }
      if (url === '/chambres/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html lang="fr"><body><h1>Chambres</h1></body></html>');
        return;
      }
      res.writeHead(302, { Location: `${origin}/` });
      res.end();
    });
    await listen(server, PORT);
    ({ browser: ownBrowser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await ownBrowser?.close();
    await close(server);
  });

  it('fetches the slashed spelling the link wrote and records it as the served spelling', async () => {
    const result = await crawlSite(`${origin}/`, {
      browser: ownBrowser,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
    });

    const rooms = result.pages.find((page) => page.url === `${origin}/chambres`);
    expect(rooms?.status).toBe('visited');
    expect(rooms?.servedUrl).toBe(`${origin}/chambres/`);
  }, 30_000);

  it('keeps a bare link that redirects home a redirect, without a second fetch', async () => {
    const result = await crawlSite(`${origin}/`, {
      browser: ownBrowser,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
    });

    const offer = result.pages.find((page) => page.url === `${origin}/ancienne-offre`);
    expect(offer?.status).toBe('redirect-interstitial');
    expect(offer?.redirectTargetUrl).toBe(`${origin}/`);
  }, 30_000);
});

// A site whose root redirects to its slashed language home and answers the
// bare spelling with an empty document (couronne-hotel-jougne.fr: / 302 to
// /fr/, /fr 200 with an empty body): fetching the slash-free identity made
// the whole audit one blank page.
describe('a language home whose bare spelling serves an empty document', () => {
  const PORT = 5196;
  const origin = `http://localhost:${PORT}`;
  let server: Server;
  let ownBrowser: Browser;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? '/';
      if (url === '/') {
        res.writeHead(302, { Location: `${origin}/fr/` });
        res.end();
        return;
      }
      if (url === '/fr/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html lang="fr"><head><title>Accueil</title></head><body><h1>Hôtel</h1>' +
            '<a href="/fr/chambres/">Chambres</a></body></html>',
        );
        return;
      }
      if (url === '/fr/chambres/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html lang="fr"><head><title>Chambres</title></head><body><h1>Chambres</h1></body></html>',
        );
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('');
    });
    await listen(server, PORT);
    ({ browser: ownBrowser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await ownBrowser?.close();
    await close(server);
  });

  it('follows the redirect to the slashed spelling and crawls the real site from it', async () => {
    const result = await crawlSite(`${origin}/`, {
      browser: ownBrowser,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
    });

    const home = result.pages.find((page) => page.url === `${origin}/fr`);
    expect(home?.status).toBe('visited');
    expect(home?.servedUrl).toBe(`${origin}/fr/`);
    const rooms = result.pages.find((page) => page.url === `${origin}/fr/chambres`);
    expect(rooms?.status).toBe('visited');
  }, 30_000);

  it('keeps an empty bare page that no link wrote with a slash', async () => {
    const result = await crawlSite(`${origin}/vide`, {
      browser: ownBrowser,
      maxPages: 1,
      maxDepth: 0,
      delayMs: 0,
    });

    const empty = result.pages.find((page) => page.url === `${origin}/vide`);
    expect(empty?.status).toBe('visited');
    expect(empty?.servedUrl).toBeUndefined();
  }, 30_000);
});
