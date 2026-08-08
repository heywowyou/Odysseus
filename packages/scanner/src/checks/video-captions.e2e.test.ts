import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../browser.js';
import { checkVideoCaptions } from './video-captions.js';

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

describe('checkVideoCaptions against real pages', () => {
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
      return await checkVideoCaptions(page, origin);
    } finally {
      await context.close();
      server.close();
    }
  }

  it('flags a video with no track element at all', async () => {
    const result = await checkHtml(`<body><video id="promo" src="movie.mp4" controls></video></body>`);
    expect(result.videos).toEqual([{ selector: '#promo', hasCaptionTrack: false }]);
  });

  it('recognizes a captions track', async () => {
    const result = await checkHtml(
      `<body><video id="promo" src="movie.mp4" controls><track kind="captions" src="cap.vtt" srclang="en" /></video></body>`,
    );
    expect(result.videos).toEqual([{ selector: '#promo', hasCaptionTrack: true }]);
  });

  it('recognizes a subtitles track as equivalent to captions', async () => {
    const result = await checkHtml(
      `<body><video id="promo" src="movie.mp4" controls><track kind="subtitles" src="sub.vtt" srclang="en" /></video></body>`,
    );
    expect(result.videos).toEqual([{ selector: '#promo', hasCaptionTrack: true }]);
  });

  it('does not count a chapters or descriptions track as captions', async () => {
    const result = await checkHtml(
      `<body><video id="promo" src="movie.mp4" controls><track kind="chapters" src="ch.vtt" /></video></body>`,
    );
    expect(result.videos).toEqual([{ selector: '#promo', hasCaptionTrack: false }]);
  });

  it('returns an empty list for a page with no video elements', async () => {
    const result = await checkHtml('<body><p>No video here.</p></body>');
    expect(result.videos).toEqual([]);
  });
});
