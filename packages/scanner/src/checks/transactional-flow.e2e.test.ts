import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../browser.js';
import { findDelegatedBookingRedirectChecks, type RedirectHostCache } from './transactional-flow.js';

/** Two tiny static servers (no Vite, no build step) rather than reusing
 *  fixtures/spa-demo: this only needs plain HTML pages to drive real
 *  Playwright navigation for the redirect-following behavior itself,
 *  which findBookingIntentLinks/classifyDestinationPage's unit tests
 *  already cover in isolation. */
function startStaticServer(routes: Record<string, string>): Promise<{ server: Server; origin: string }> {
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

describe('findDelegatedBookingRedirectChecks against real pages', () => {
  let browser: Browser;
  let destination: { server: Server; origin: string };

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
    destination = await startStaticServer({
      '/single-property': `<title>Hotel La Coorniche | Réserver votre séjour</title>
        <body>4 Avenue de la Coorniche, 64600 Anglet. Vos dates ont été conservées.</body>`,
      '/marketplace': `<title>Find your next stay</title>
        <body>Choose your destination and compare thousands of hotels worldwide.</body>`,
      '/ambiguous': `<title>Secure Payment Gateway</title><body>Please wait.</body>`,
    });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    destination?.server.close();
  });

  async function runAgainstOriginPage(
    originHtml: string,
  ): Promise<Awaited<ReturnType<typeof findDelegatedBookingRedirectChecks>>> {
    const origin = await startStaticServer({ '/': originHtml });
    const context = await browser.newContext();
    let page: Page | undefined;
    try {
      page = await context.newPage();
      await page.goto(origin.origin);
      return await findDelegatedBookingRedirectChecks(page, origin.origin, {
        browser,
        timeoutMs: 10_000,
      });
    } finally {
      await context.close();
      origin.server.close();
    }
  }

  it("resolves single-property for a delegated booking engine whose destination shows the operator's own name and address", async () => {
    const originHtml = `<title>Hotel La Coorniche - Hébergement à Bayonne</title>
      <body><a href="${destination.origin}/single-property">Réserver</a></body>`;

    const checks = await runAgainstOriginPage(originHtml);

    expect(checks).toHaveLength(1);
    expect(checks[0]?.resolution).toBe('single-property');
    expect(checks[0]?.destinationUrl).toBe(`${destination.origin}/single-property`);
  });

  it('resolves marketplace for a destination showing a multi-property search UI', async () => {
    const originHtml = `<title>Hotel La Coorniche - Hébergement à Bayonne</title>
      <body><a href="${destination.origin}/marketplace">Book now</a></body>`;

    const checks = await runAgainstOriginPage(originHtml);

    expect(checks).toHaveLength(1);
    expect(checks[0]?.resolution).toBe('marketplace');
  });

  it('resolves marketplace without navigating at all for a known OTA marketplace host', async () => {
    const originHtml = `<title>Hotel La Coorniche</title>
      <body><a href="https://www.booking.com/hotel/fr/example.html">Réserver sur Booking.com</a></body>`;

    const checks = await runAgainstOriginPage(originHtml);

    expect(checks).toHaveLength(1);
    expect(checks[0]?.resolution).toBe('marketplace');
    expect(checks[0]?.destinationUrl).toBeUndefined();
  });

  it('resolves undetermined when the destination matches neither signal', async () => {
    const originHtml = `<title>Hotel La Coorniche - Hébergement à Bayonne</title>
      <body><a href="${destination.origin}/ambiguous">Réserver</a></body>`;

    const checks = await runAgainstOriginPage(originHtml);

    expect(checks).toHaveLength(1);
    expect(checks[0]?.resolution).toBe('undetermined');
  });

  it('resolves undetermined when the redirect cannot be reached', async () => {
    const originHtml = `<title>Hotel La Coorniche - Hébergement à Bayonne</title>
      <body><a href="http://127.0.0.1:1/reserver">Réserver</a></body>`;

    const checks = await runAgainstOriginPage(originHtml);

    expect(checks).toHaveLength(1);
    expect(checks[0]?.resolution).toBe('undetermined');
    expect(checks[0]?.detail).toMatch(/could not be followed/i);
  });

  it('regression: a first-party checkout form is unaffected by redirect-following (no candidates found)', async () => {
    const originHtml = `<title>Boutique</title>
      <body><form action="/panier"><button>Ajouter au panier</button></form></body>`;

    const checks = await runAgainstOriginPage(originHtml);

    expect(checks).toEqual([]);
  });
});

describe('findDelegatedBookingRedirectChecks with a shared RedirectHostCache', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  /** Counts requests per path, the same real-page shape as the single-
   *  property fixture above, to prove a second page linking to the same
   *  host reuses the cached check instead of navigating again - this is
   *  the exact scenario that hit the real booking vendor ~20 times in
   *  one haaitza.com crawl (once per page, since the CTA is in the nav
   *  on every page) before this fix. */
  function startCountingServer(routes: Record<string, string>): Promise<{
    server: Server;
    origin: string;
    requestCount: () => number;
  }> {
    return new Promise((resolve) => {
      let count = 0;
      const server = createServer((req, res) => {
        count += 1;
        const body = routes[req.url ?? '/'];
        if (body === undefined) {
          res.writeHead(404).end('not found');
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
      });
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo;
        resolve({ server, origin: `http://127.0.0.1:${port}`, requestCount: () => count });
      });
    });
  }

  async function checkPage(
    browserRef: Browser,
    pageHtml: string,
    hostCache: RedirectHostCache,
  ): Promise<Awaited<ReturnType<typeof findDelegatedBookingRedirectChecks>>> {
    const origin = await startCountingServer({ '/': pageHtml });
    const context = await browserRef.newContext();
    try {
      const page: Page = await context.newPage();
      await page.goto(origin.origin);
      return await findDelegatedBookingRedirectChecks(page, origin.origin, {
        browser: browserRef,
        timeoutMs: 10_000,
        hostCache,
      });
    } finally {
      await context.close();
      origin.server.close();
    }
  }

  it('follows the same external host only once across two different pages sharing a cache', async () => {
    const destination = await startCountingServer({
      '/single-property': `<title>Hotel La Coorniche | Réserver votre séjour</title>
        <body>4 Avenue de la Coorniche, 64600 Anglet.</body>`,
    });
    try {
      const hostCache: RedirectHostCache = new Map();
      const page1Html = `<title>Hotel La Coorniche - Hébergement à Bayonne</title>
        <body><a href="${destination.origin}/single-property">Réserver</a></body>`;
      const page2Html = `<title>Hotel La Coorniche - Chambres</title>
        <body><a href="${destination.origin}/single-property">Réserver</a></body>`;

      const page1Checks = await checkPage(browser, page1Html, hostCache);
      const page2Checks = await checkPage(browser, page2Html, hostCache);

      expect(destination.requestCount()).toBe(1);
      expect(page1Checks).toHaveLength(1);
      expect(page2Checks).toHaveLength(1);
      expect(page1Checks[0]?.resolution).toBe('single-property');
      expect(page2Checks[0]?.resolution).toBe('single-property');
      // Both pages record the link actually found on that page, even
      // though only page 1 triggered a real navigation.
      expect(page1Checks[0]?.linkUrl).toBe(`${destination.origin}/single-property`);
      expect(page2Checks[0]?.linkUrl).toBe(`${destination.origin}/single-property`);
    } finally {
      destination.server.close();
    }
  });

  it('still follows two different hosts independently under the same cache', async () => {
    const destinationA = await startCountingServer({
      '/single-property': `<title>Hotel La Coorniche</title><body>4 Avenue de la Coorniche.</body>`,
    });
    const destinationB = await startCountingServer({
      '/marketplace': `<title>Find your next stay</title><body>Choose your destination and compare thousands of hotels worldwide.</body>`,
    });
    try {
      const hostCache: RedirectHostCache = new Map();
      const pageHtml = `<title>Hotel La Coorniche - Hébergement à Bayonne</title>
        <body>
          <a href="${destinationA.origin}/single-property">Réserver</a>
          <a href="${destinationB.origin}/marketplace">Book now</a>
        </body>`;

      const checks = await checkPage(browser, pageHtml, hostCache);

      expect(destinationA.requestCount()).toBe(1);
      expect(destinationB.requestCount()).toBe(1);
      expect(checks).toHaveLength(2);
      expect(checks.find((c) => c.linkUrl.includes(destinationA.origin))?.resolution).toBe('single-property');
      expect(checks.find((c) => c.linkUrl.includes(destinationB.origin))?.resolution).toBe('marketplace');
    } finally {
      destinationA.server.close();
      destinationB.server.close();
    }
  });
});
