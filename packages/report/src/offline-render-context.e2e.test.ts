/**
 * Issue #487: a report render makes no network request, whatever its HTML
 * asks for, so a missed escape of site-controlled content cannot reach the
 * compose services or the outside.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { launchBrowser } from '@odysseus/scanner';
import { REPORT_PDF_CHROMIUM_ARGS } from './constants.js';
import { renderPdfWithPageCountFromHtml } from './pdf.js';

describe('report PDF rendering is offline', () => {
  it('never requests a URL the HTML names', async () => {
    let requests = 0;
    const server = http.createServer((_request, response) => {
      requests += 1;
      response.end('x');
    });
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
    });
    const { browser } = await launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS });
    try {
      const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
        <p>Rapport</p>
        <img src="http://127.0.0.1:${port}/pixel.png" alt="">
        <script>fetch('http://127.0.0.1:${port}/beacon').catch(() => {});</script>
      </body></html>`;
      const { pdf } = await renderPdfWithPageCountFromHtml(html, browser);
      expect(pdf.length).toBeGreaterThan(0);
    } finally {
      await browser.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    expect(requests).toBe(0);
  }, 60_000);
});
