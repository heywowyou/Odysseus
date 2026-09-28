/**
 * Issue #550: a page answering with an attachment does not make the scanner
 * download it.
 */
import http, { type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Download } from 'playwright';
import { launchBrowser } from './browser.js';
import { openScannerContext } from './scanner-context.js';

let server: Server;
let origin: string;
let browser: Browser;

function listen(target: Server): Promise<number> {
  return new Promise((resolve) => {
    target.listen(0, '127.0.0.1', () => {
      const address = target.address();
      if (address === null || typeof address === 'string') throw new Error('Expected TCP server.');
      resolve(address.port);
    });
  });
}

describe('openScannerContext downloads', () => {
  beforeAll(async () => {
    server = http.createServer((_request, response) => {
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="large.bin"',
      });
      response.end(Buffer.alloc(8 * 1024 * 1024));
    });
    origin = `http://127.0.0.1:${await listen(server)}`;
    ({ browser } = await launchBrowser());
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  });

  it('refuses an attachment instead of writing it to disk', async () => {
    const context = await openScannerContext(browser, {});
    try {
      const page = await context.newPage();
      const download = new Promise<Download>((resolve) => page.once('download', resolve));
      await expect(page.goto(`${origin}/large.bin`)).rejects.toThrow(/download/i);
      const started = await download;
      await expect(started.path()).rejects.toThrow();
      expect(await started.failure()).not.toBeNull();
    } finally {
      await context.close();
    }
  });
});
