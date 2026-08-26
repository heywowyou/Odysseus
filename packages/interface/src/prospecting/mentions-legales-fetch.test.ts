import { afterEach, describe, expect, it, vi } from 'vitest';
import { OriginLock } from '@odysseus/scanner';
import { fetchMentionsLegalesData } from './mentions-legales-fetch.js';

describe('fetchMentionsLegalesData', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockFetch(
    handler: (url: string) => { ok: boolean; text?: () => Promise<string>; url?: string },
  ) {
    global.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = input.toString();
      const result = handler(url);
      return {
        ok: result.ok,
        url: result.url ?? url,
        text: result.text ?? (async () => ''),
      } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  it('fetches the homepage and mentions-legales page when robots.txt allows both', async () => {
    mockFetch((url) => {
      if (url.endsWith('/robots.txt')) return { ok: false };
      if (url === 'https://example.fr/') {
        return { ok: true, text: async () => '<a href="/mentions-legales">Mentions</a>' };
      }
      if (url === 'https://example.fr/mentions-legales') {
        return { ok: true, text: async () => 'SIREN 123 456 789' };
      }
      return { ok: false };
    });

    const result = await fetchMentionsLegalesData('https://example.fr/', new OriginLock(), {
      crawlDelayMs: 0,
      userAgent: 'OdysseusBot/1.0',
      timeoutMs: 5000,
    });

    expect(result.homepageText).toBe('Mentions');
    expect(result.mentionsLegalesUrl).toBe('https://example.fr/mentions-legales');
    expect(result.mentionsLegalesText).toBe('SIREN 123 456 789');
  });

  it('skips the homepage fetch entirely when robots.txt disallows it', async () => {
    const fetchSpy = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = input.toString();
      if (url.endsWith('/robots.txt')) {
        return {
          ok: true,
          url,
          text: async () => 'User-agent: *\nDisallow: /',
        } as unknown as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await fetchMentionsLegalesData('https://example.fr/', new OriginLock(), {
      crawlDelayMs: 0,
      userAgent: 'OdysseusBot/1.0',
      timeoutMs: 5000,
    });

    expect(result).toEqual({
      homepageText: null,
      mentionsLegalesUrl: null,
      mentionsLegalesText: null,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('skips the mentions-legales fetch when its path is individually disallowed', async () => {
    mockFetch((url) => {
      if (url.endsWith('/robots.txt')) {
        return { ok: true, text: async () => 'User-agent: *\nDisallow: /mentions-legales' };
      }
      if (url === 'https://example.fr/') {
        return { ok: true, text: async () => '<a href="/mentions-legales">Mentions</a>' };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await fetchMentionsLegalesData('https://example.fr/', new OriginLock(), {
      crawlDelayMs: 0,
      userAgent: 'OdysseusBot/1.0',
      timeoutMs: 5000,
    });

    expect(result.homepageText).toBe('Mentions');
    expect(result.mentionsLegalesUrl).toBeNull();
    expect(result.mentionsLegalesText).toBeNull();
  });

  it('raises the effective delay to robots.txt Crawl-delay when it exceeds the configured default', async () => {
    mockFetch((url) => {
      if (url.endsWith('/robots.txt')) {
        return { ok: true, text: async () => 'User-agent: *\nCrawl-delay: 1' };
      }
      return { ok: true, text: async () => 'Homepage' };
    });

    const start = Date.now();
    await fetchMentionsLegalesData('https://example.fr/', new OriginLock(), {
      crawlDelayMs: 0,
      userAgent: 'OdysseusBot/1.0',
      timeoutMs: 5000,
    });

    expect(Date.now() - start).toBeGreaterThanOrEqual(1000);
  }, 10000);
});
