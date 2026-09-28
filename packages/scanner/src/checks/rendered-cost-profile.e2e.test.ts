import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../browser.js';
import {
  extractRenderedDomCostFacts,
  recordRenderedResourceTotals,
} from './rendered-cost-profile.js';

function startStaticServer(routes: Record<string, { body: string; contentType: string }>): Promise<{
  server: Server;
  origin: string;
}> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const route = routes[req.url ?? '/'];
      if (route === undefined) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': route.contentType }).end(route.body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

let browser: Browser;

beforeAll(async () => {
  ({ browser } = await launchBrowser());
}, 30_000);

afterAll(async () => {
  await browser?.close();
});

describe('rendered-cost-profile against real pages', () => {
  it('counts DOM nodes and images from the rendered page', async () => {
    const { server, origin } = await startStaticServer({
      '/': {
        contentType: 'text/html; charset=utf-8',
        body: `<body>
          <div><p>one</p><p>two</p></div>
          <img src="a.png" />
          <img src="b.png" />
        </body>`,
      },
      '/a.png': { contentType: 'image/png', body: 'x' },
      '/b.png': { contentType: 'image/png', body: 'y' },
    });
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(origin);
      const facts = await extractRenderedDomCostFacts(page);
      expect(facts.imageCount).toBe(2);
      // html, head, body, div, p*2, img*2 = at least 7 elements.
      expect(facts.domNodeCount).toBeGreaterThanOrEqual(7);
    } finally {
      await context.close();
      server.close();
    }
  });

  it('totals response counts and known transfer bytes only for responses seen after attaching', async () => {
    const { server, origin } = await startStaticServer({
      '/': {
        contentType: 'text/html; charset=utf-8',
        body: `<body><img src="a.png" /><img src="b.png" /></body>`,
      },
      '/a.png': { contentType: 'image/png', body: 'x'.repeat(100) },
      '/b.png': { contentType: 'image/png', body: 'y'.repeat(200) },
    });
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const readTotals = recordRenderedResourceTotals(page);
      await page.goto(origin);
      await page.waitForLoadState('networkidle');

      const totals = await readTotals();
      // Document + two images, at minimum.
      expect(totals.resourceCount).toBeGreaterThanOrEqual(3);
      expect(totals.knownTransferBytes).toBeGreaterThan(0);
      expect(totals.unknownTransferSizeCount).toBe(0);
    } finally {
      await context.close();
      server.close();
    }
  });

  it('reports within its settle bound while a response never completes (plan 075 K2)', async () => {
    const server = createServer((req, res) => {
      if (req.url === '/stream') {
        // Headers, one chunk, then nothing: the body never ends.
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: open\n\n');
        return;
      }
      res
        .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        .end(
          `<body><script>fetch('/stream').then((r) => r.body.getReader().read());</script></body>`,
        );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const readTotals = recordRenderedResourceTotals(page, 500);
      await page.goto(origin);
      await page.waitForResponse((response) => response.url().endsWith('/stream'));
      const started = Date.now();
      const totals = await readTotals();
      expect(Date.now() - started).toBeLessThan(3_000);
      expect(totals.resourceCount).toBeGreaterThanOrEqual(2);
      expect(totals.unknownTransferSizeCount).toBeGreaterThanOrEqual(1);
      // The page still answers: nothing here holds it.
      expect(await page.evaluate(() => 1 + 1)).toBe(2);
    } finally {
      await context.close();
      server.closeAllConnections();
      server.close();
    }
  });

  it('misses the document response when attached after navigation', async () => {
    const { server, origin } = await startStaticServer({
      '/': { contentType: 'text/html; charset=utf-8', body: '<body>late</body>' },
    });
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(origin);
      const readTotals = recordRenderedResourceTotals(page);
      const totals = await readTotals();
      expect(totals.resourceCount).toBe(0);
    } finally {
      await context.close();
      server.close();
    }
  });
});
