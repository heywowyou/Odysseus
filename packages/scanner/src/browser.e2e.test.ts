import { afterEach, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';

let browser: Browser | undefined;

afterEach(async () => {
  await browser?.close();
  browser = undefined;
});

describe('launchBrowser', () => {
  it('exposes a working CDP debug port', async () => {
    const launched = await launchBrowser();
    browser = launched.browser;

    expect(launched.debugPort).toBeGreaterThan(0);

    const response = await fetch(`http://127.0.0.1:${launched.debugPort}/json/version`);
    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body.webSocketDebuggerUrl).toBeDefined();
  }, 30_000);

  it('presents French to a tab opened over the debug port, outside any Playwright context', async () => {
    const launched = await launchBrowser();
    browser = launched.browser;
    const { chromium } = await import('playwright');
    const cdp = await chromium.connectOverCDP(`http://127.0.0.1:${launched.debugPort}`);
    try {
      const page = await cdp.contexts()[0]!.newPage();
      await page.setContent('<p>x</p>');
      expect(await page.evaluate(() => navigator.language)).toMatch(/^fr\b/);
    } finally {
      await cdp.close().catch(() => undefined);
    }
  }, 30_000);

  it('closes cleanly', async () => {
    const launched = await launchBrowser();
    browser = launched.browser;
    await expect(launched.browser.close()).resolves.not.toThrow();
    browser = undefined;
  }, 30_000);
});

describe('launchBrowser with a network policy', () => {
  it('refuses loopback navigation through the egress proxy', async () => {
    const { createServer } = await import('node:http');
    const { PUBLIC_SITE_NETWORK_POLICY } = await import('./network-target-policy.js');
    const hits: string[] = [];
    const server = createServer((request, response) => {
      hits.push(request.url ?? '');
      response.end('internal');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as import('node:net').AddressInfo).port;
    const blocked: string[] = [];
    try {
      const launched = await launchBrowser({
        networkPolicy: PUBLIC_SITE_NETWORK_POLICY,
        onNetworkSafetyBlocked: (disposition) => blocked.push(disposition.url),
      });
      browser = launched.browser;
      const page = await browser.newPage();
      for (const host of ['127.0.0.1', 'localhost']) {
        const response = await page.goto(`http://${host}:${port}/`).catch(() => null);
        expect(response?.status() ?? 403).toBe(403);
      }
      expect(hits).toEqual([]);
      expect(blocked.length).toBeGreaterThanOrEqual(2);
    } finally {
      server.close();
    }
  }, 30_000);
});
