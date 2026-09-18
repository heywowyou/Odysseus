import { promises as fs } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchBrowser } from './browser.js';
import { runRenderedAnalysis } from './scan-page.js';

const MISSING_ALT = '<img src="/pixel.png" width="200" height="120">';

let server: http.Server;
let port: number;
let browser: Browser;
let screenshotDir: string;

function page(body: string): string {
  return `<!doctype html><html lang="fr"><head><title>t</title></head><body><main>${body}</main></body></html>`;
}

describe('rendered readiness and frame coverage', () => {
  beforeAll(async () => {
    server = http.createServer((request, response) => {
      const url = request.url ?? '/';
      if (url === '/pixel.png') {
        response.writeHead(200, { 'content-type': 'image/png' }).end();
        return;
      }
      if (url === '/missing.js') {
        response.writeHead(404).end();
        return;
      }
      const html =
        url === '/frames.html'
          ? page(
              `<h1>Parent</h1>
               <iframe title="same" src="/inner.html" width="400" height="300"></iframe>
               <iframe title="cross" src="http://localhost:${port}/inner.html" width="400" height="300"></iframe>
               <iframe title="beacon" src="/inner.html" width="1" height="1"></iframe>
               <script src="/missing.js"></script>`,
            )
          : url === '/moving.html'
            ? page(
                `<h1>Ticker</h1><p id="t">0</p>
                 <script>let n = 0; setInterval(() => { document.getElementById('t').textContent = String(++n); }, 50);</script>`,
              )
            : page(`<h1>Inner</h1>${MISSING_ALT}`);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
    ({ browser } = await launchBrowser());
    screenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-readiness-'));
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(screenshotDir, { recursive: true, force: true });
  });

  it('records each frame, its origin, its size-based materiality and whether axe reached it', async () => {
    const result = await runRenderedAnalysis(browser, `http://127.0.0.1:${port}/frames.html`, {
      screenshotDir,
      delayMs: 0,
    });

    expect(result.frames).toHaveLength(3);
    const byTitleOrder = [...(result.frames ?? [])];
    const cross = byTitleOrder.find((frame) => !frame.sameOrigin);
    const same = byTitleOrder.filter((frame) => frame.sameOrigin);
    expect(cross).toMatchObject({
      frameOrigin: `http://localhost:${port}`,
      materiality: 'material',
      axeTraversed: true,
    });
    expect(same.map((frame) => frame.materiality).sort()).toEqual(['material', 'non-material']);
    expect(same.every((frame) => frame.axeTraversed)).toBe(true);

    // The claim above is only worth recording if axe really did inspect
    // inside the cross-origin frame: its violation must be in the results.
    const imageAlt = result.axe?.violations.find((rule: { id: string }) => rule.id === 'image-alt');
    const targets = (imageAlt?.nodes ?? []).map((node: { target: unknown }) =>
      JSON.stringify(node.target),
    );
    expect(targets.some((target: string) => target.includes('cross'))).toBe(true);

    expect(result.readiness?.significantResourceFailures).toEqual([
      `script http://127.0.0.1:${port}/missing.js`,
    ]);
  }, 90_000);

  it('marks a page whose DOM keeps changing as unstable rather than ready', async () => {
    const result = await runRenderedAnalysis(browser, `http://127.0.0.1:${port}/moving.html`, {
      screenshotDir,
      delayMs: 0,
    });
    expect(result.readiness).toMatchObject({
      domReady: true,
      mutationQuiescent: false,
      outcome: 'unstable',
      httpStatus: 200,
    });
  }, 90_000);

  it('marks a quiet page ready', async () => {
    const result = await runRenderedAnalysis(browser, `http://127.0.0.1:${port}/inner.html`, {
      screenshotDir,
      delayMs: 0,
    });
    expect(result.readiness).toMatchObject({ outcome: 'ready', networkQuiet: true });
    expect(result.frames).toEqual([]);
  }, 90_000);
});
