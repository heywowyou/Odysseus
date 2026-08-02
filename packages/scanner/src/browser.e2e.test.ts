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

  it('closes cleanly', async () => {
    const launched = await launchBrowser();
    browser = launched.browser;
    await expect(launched.browser.close()).resolves.not.toThrow();
    browser = undefined;
  }, 30_000);
});
