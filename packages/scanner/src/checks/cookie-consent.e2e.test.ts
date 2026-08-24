/**
 * C1 (2026-08-24). Runs the real check against a local server that sets
 * real cookies and loads real (blocked) third-party URLs, so the
 * classification and the "brand-new context" guarantee are exercised
 * rather than asserted.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../browser.js';
import { checkCookieConsent, classifyCookie, classifyTrackerUrl } from './cookie-consent.js';

function startServer(html: string, setCookies: string[]): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res
        .writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': setCookies })
        .end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}/` });
    });
  });
}

describe('classifyCookie', () => {
  it('matches a per-property Google Analytics cookie by prefix', () => {
    expect(classifyCookie('_ga_G3XYZ')?.vendor).toBe('Google Analytics');
    expect(classifyCookie('_GA')?.vendor).toBe('Google Analytics');
  });

  it('does not classify a cookie whose purpose cannot be read from its name', () => {
    expect(classifyCookie('PHPSESSID')).toBeUndefined();
    expect(classifyCookie('csrf_token')).toBeUndefined();
    expect(classifyCookie('wordpress_logged_in_abc')).toBeUndefined();
  });
});

describe('classifyTrackerUrl', () => {
  it('matches a subdomain of a tracker host', () => {
    expect(classifyTrackerUrl('https://stats.g.doubleclick.net/x')?.vendor).toBe('Google DoubleClick');
  });

  it('does not match an ordinary first-party or CDN URL', () => {
    expect(classifyTrackerUrl('https://example.com/app.js')).toBeUndefined();
    expect(classifyTrackerUrl('https://fonts.gstatic.com/a.woff2')).toBeUndefined();
  });

  it('does not treat youtube.com as a tracker host', () => {
    expect(classifyTrackerUrl('https://www.youtube.com/embed/x')).toBeUndefined();
  });
});

describe('checkCookieConsent against a real page', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  async function run(html: string, cookies: string[]) {
    const { server, origin } = await startServer(html, cookies);
    try {
      return await checkCookieConsent(browser, origin, { timeoutMs: 15_000 });
    } finally {
      server.close();
    }
  }

  it('reports a clean site as clean', async () => {
    const result = await run('<p>Bonjour</p>', ['PHPSESSID=abc; Path=/']);
    expect(result.checked).toBe(true);
    expect(result.nonEssentialCookies).toEqual([]);
    expect(result.trackerRequests).toEqual([]);
    expect(result.usesTrackingYouTubeEmbed).toBe(false);
  }, 30_000);

  it('classifies a tracking cookie set on first load with no interaction', async () => {
    const result = await run('<p>Bonjour</p>', ['PHPSESSID=abc; Path=/', '_ga=GA1.1.9; Path=/']);
    expect(result.nonEssentialCookies.map((c) => c.name)).toEqual(['_ga']);
    expect(result.nonEssentialCookies[0]?.vendor).toBe('Google Analytics');
    // The session cookie is recorded but never classified as non-essential.
    expect(result.cookies.map((c) => c.name).sort()).toEqual(['PHPSESSID', '_ga']);
  }, 30_000);

  it('records a tracker request even when the request itself fails', async () => {
    // The host does not resolve from the test environment; the request is
    // still made, which is the fact that matters - the visitor's IP would
    // reach the vendor on a real network.
    const result = await run(
      '<img src="https://www.google-analytics.com/collect?v=1" alt="">',
      [],
    );
    expect(result.trackerRequests.map((r) => r.vendor)).toContain('Google Analytics');
  }, 30_000);

  it('detects a consent platform by the marker its own vendor publishes', async () => {
    const result = await run('<div id="tarteaucitronRoot"></div>', []);
    expect(result.consentPlatforms).toContain('Tarteaucitron');
  }, 30_000);

  it('flags a youtube.com embed but not a youtube-nocookie.com one', async () => {
    const tracking = await run('<iframe src="https://www.youtube.com/embed/x"></iframe>', []);
    expect(tracking.usesTrackingYouTubeEmbed).toBe(true);

    const privacyEnhanced = await run('<iframe src="https://www.youtube-nocookie.com/embed/x"></iframe>', []);
    expect(privacyEnhanced.usesTrackingYouTubeEmbed).toBe(false);
  }, 45_000);

  it('starts from a context with no stored state, so an earlier visit cannot read as consent', async () => {
    const html = '<p>Bonjour</p>';
    const first = await run(html, ['_ga=GA1.1.9; Path=/']);
    const second = await run(html, []);
    expect(first.nonEssentialCookies).toHaveLength(1);
    // The second run sets no cookie, and must not inherit the first run's.
    expect(second.cookies.map((c) => c.name)).not.toContain('_ga');
  }, 45_000);
});
