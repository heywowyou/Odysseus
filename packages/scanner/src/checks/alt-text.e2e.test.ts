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
