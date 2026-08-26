import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../browser.js';
import { extractAltTextFacts } from './alt-text.js';

function startStaticServer(html: string): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

describe('extractAltTextFacts against real pages', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  async function checkHtml(html: string) {
    const { server, origin } = await startStaticServer(html);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(origin);
      return await extractAltTextFacts(page, origin);
    } finally {
      await context.close();
      server.close();
    }
  }

  it('reads alt text, decorative markers, and real rendered size', async () => {
    const html = `<body style="margin:0">
      <img id="hero" src="hero.jpg" alt="A vineyard at sunset" style="width:400px;height:300px;" />
    </body>`;

    const result = await checkHtml(html);

    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.alt).toBe('A vineyard at sunset');
    expect(result.images[0]?.selector).toBe('#hero');
    expect(result.images[0]?.isMarkedDecorative).toBe(false);
    expect(result.images[0]?.width).toBeCloseTo(400, 0);
    expect(result.images[0]?.height).toBeCloseTo(300, 0);
  });

  it('distinguishes a missing alt attribute (null) from an empty one ("")', async () => {
    const html = `<body>
      <img id="no-attr" src="a.jpg" />
      <img id="empty-attr" src="b.jpg" alt="" />
    </body>`;

    const result = await checkHtml(html);

    const noAttr = result.images.find((img) => img.selector === '#no-attr');
    const emptyAttr = result.images.find((img) => img.selector === '#empty-attr');
    expect(noAttr?.alt).toBeNull();
    expect(emptyAttr?.alt).toBe('');
  });

  it('recognizes role=presentation and aria-hidden as decorative markers', async () => {
    const html = `<body>
      <img id="a" src="a.jpg" alt="" role="presentation" />
      <img id="b" src="b.jpg" alt="" aria-hidden="true" />
    </body>`;

    const result = await checkHtml(html);

    expect(result.images.every((img) => img.isMarkedDecorative)).toBe(true);
  });

  it('returns an empty list for a page with no images', async () => {
    const result = await checkHtml('<body><p>No images here.</p></body>');
    expect(result.images).toEqual([]);
  });
});

/**
 * B5 (2026-08-24 three-site review): a real Palais Gallien report handed
 * a developer "img:nth-of-type(32)" for 172 occurrences across 23 pages.
 * `:nth-of-type` is parent-scoped, so an index counted across the whole
 * document usually names an element that does not exist.
 */
describe('B5: selectors actually resolve to the element they name', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  /** Keeps the page open so each emitted selector can be run back against
   *  the very document it was derived from - the only check that actually
   *  proves a selector resolves. */
  async function withPage<T>(
    html: string,
    fn: (page: import('playwright').Page) => Promise<T>,
  ): Promise<T> {
    const { server, origin } = await startStaticServer(html);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(origin);
      return await fn(page);
    } finally {
      await context.close();
      server.close();
    }
  }

  it('uses the image source when there is no id', async () => {
    const selector = await withPage(
      '<div><img src="/wp-content/uploads/chambre-deluxe.jpg" alt=""></div>',
      async (page) => (await extractAltTextFacts(page, 'https://example.com/')).images[0]?.selector,
    );
    expect(selector).toBe('img[src="/wp-content/uploads/chambre-deluxe.jpg"]');
  });

  it('falls back to a structural path for a data: URI', async () => {
    const selector = await withPage(
      '<div><span></span><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""></div>',
      async (page) =>
        (await extractAltTextFacts(page, 'https://example.com/')).images[0]?.selector ?? '',
    );
    expect(selector).not.toContain('data:');
    expect(selector).toContain('nth-child');
  });

  it('every emitted selector resolves to exactly one element on the page', async () => {
    await withPage(
      `<main>
         <img id="hero" src="/a.jpg" alt="">
         <div><img src="/b.jpg" alt=""><img src="/c.jpg" alt=""></div>
         <section><figure><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""></figure></section>
       </main>`,
      async (page) => {
        const result = await extractAltTextFacts(page, 'https://example.com/');
        expect(result.images).toHaveLength(4);
        for (const image of result.images) {
          const count = await page.evaluate(
            (s) => document.querySelectorAll(s).length,
            image.selector,
          );
          expect(count, `selector "${image.selector}" matched ${count} elements`).toBe(1);
        }
      },
    );
  });
});
