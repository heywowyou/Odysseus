/**
 * C3 (2026-08-24). WCAG 1.4.10 is a mechanical criterion, so this is
 * tested against a real browser laying out real CSS rather than against a
 * stubbed measurement.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../browser.js';
import { checkReflow, REFLOW_VIEWPORT_WIDTH } from './reflow.js';

function startServer(body: string): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        .end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
          <style>*{box-sizing:border-box}body{margin:0}</style></head><body>${body}</body></html>`);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}/` });
    });
  });
}

describe('checkReflow against a real browser layout', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  async function run(body: string) {
    const { server, origin } = await startServer(body);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await context.newPage();
      await page.goto(origin);
      return { result: await checkReflow(page, origin), page };
    } finally {
      await context.close();
      server.close();
    }
  }

  it('passes a responsive page', async () => {
    const { result } = await run(
      '<div style="width:100%"><p>Bonjour, ceci est un paragraphe.</p></div>',
    );
    expect(result.checked).toBe(true);
    expect(result.requiresHorizontalScroll).toBe(false);
    expect(result.overflowElements).toEqual([]);
  }, 30_000);

  it('fails a page with a fixed-width element wider than 320px, and names it', async () => {
    const { result } = await run(
      '<div id="wide" style="width:900px;height:40px;background:#eee"></div>',
    );
    expect(result.requiresHorizontalScroll).toBe(true);
    expect(result.viewportWidthPx).toBe(REFLOW_VIEWPORT_WIDTH);
    expect(result.overflowElements[0]?.selector).toBe('#wide');
    expect(result.overflowElements[0]?.widthPx).toBe(900);
  }, 30_000);

  it('reports the outermost container first, not an arbitrary descendant', async () => {
    const { result } = await run(
      '<div id="outer" style="width:900px"><div id="inner" style="width:880px">x</div></div>',
    );
    expect(result.overflowElements.map((e) => e.selector)).toEqual(['#outer', '#inner']);
  }, 30_000);

  it('tolerates sub-pixel overflow that no reader can perceive', async () => {
    const { result } = await run('<div style="width:calc(100% + 1px);height:10px"></div>');
    expect(result.requiresHorizontalScroll).toBe(false);
  }, 30_000);

  it('ignores a hidden element, which forces no scrollbar', async () => {
    const { result } = await run('<div style="width:900px;display:none"></div><p>Bonjour</p>');
    expect(result.requiresHorizontalScroll).toBe(false);
    expect(result.overflowElements).toEqual([]);
  }, 30_000);

  it('restores the original viewport, so a later check does not see a reshaped page', async () => {
    const { server, origin } = await startServer('<div style="width:900px"></div>');
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await context.newPage();
      await page.goto(origin);
      await checkReflow(page, origin);
      expect(page.viewportSize()).toEqual({ width: 1280, height: 800 });
    } finally {
      await context.close();
      server.close();
    }
  }, 30_000);
});
