import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OriginLock } from '@odysseus/scanner';
import { PROSPECT_FETCH_ALLOWLIST_ENV_VAR } from '../../config.js';
import { fetchContactPages } from './fetch-contact-pages.js';

const OPTIONS = { crawlDelayMs: 0, userAgent: 'OdysseusBot/1.0', timeoutMs: 5000 };

describe('fetchContactPages', () => {
  const originalFetch = global.fetch;
  const originalAllowlist = process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR];

  beforeEach(() => {
    // The fetch address guard (issue #158) resolves every probed host, and
    // the stubs below answer for a fake domain: allowlist it so these tests
    // stay hermetic.
    process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR] = 'hotel-exemple.fr';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalAllowlist === undefined) delete process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR];
    else process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR] = originalAllowlist;
    vi.restoreAllMocks();
  });

  function mockSite(pages: Record<string, string>, robots?: string): string[] {
    const requested: string[] = [];
    global.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = input.toString();
      requested.push(url);
      if (url.endsWith('/robots.txt')) {
        return robots === undefined
          ? ({ ok: false, status: 404, url, text: async () => '' } as unknown as Response)
          : ({ ok: true, status: 200, url, text: async () => robots } as unknown as Response);
      }
      const body = pages[url];
      if (body === undefined) {
        return { ok: false, status: 404, url, text: async () => '' } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        url,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html' : null),
        },
        text: async () => body,
      } as unknown as Response;
    }) as unknown as typeof fetch;
    return requested;
  }

  it('reads the homepage, the mentions legales page and the contact page, and no more', async () => {
    const requested = mockSite({
      'https://hotel-exemple.fr/': `
        <a href="/mentions-legales">Mentions</a>
        <a href="/contact">Contact</a>
        <a href="/chambres">Chambres</a>
        <a href="/spa">Spa</a>`,
      'https://hotel-exemple.fr/mentions-legales': 'SIREN 123 456 789',
      'https://hotel-exemple.fr/contact': 'contact@hotel-exemple.fr',
    });

    const result = await fetchContactPages('hotel-exemple.fr', new OriginLock(), OPTIONS);

    expect(result.outcome).toBe('ok');
    expect(result.requestCount).toBe(3);
    expect(requested.filter((url) => !url.endsWith('/robots.txt'))).toHaveLength(3);
    expect(requested).not.toContain('https://hotel-exemple.fr/chambres');
  });

  it('returns sources in tie-break order, contact page first', async () => {
    mockSite({
      'https://hotel-exemple.fr/': '<a href="/mentions-legales">M</a><a href="/contact">C</a>',
      'https://hotel-exemple.fr/mentions-legales': 'legal',
      'https://hotel-exemple.fr/contact': 'contact',
    });

    const result = await fetchContactPages('hotel-exemple.fr', new OriginLock(), OPTIONS);

    expect(result.sources.map((source) => source.kind)).toEqual([
      'contact-page',
      'mentions-legales',
      'homepage',
    ]);
  });

  it('keeps mailto targets the visible text never spells out', async () => {
    mockSite({
      'https://hotel-exemple.fr/': '<a href="mailto:info@hotel-exemple.fr">Nous écrire</a>',
    });

    const result = await fetchContactPages('hotel-exemple.fr', new OriginLock(), OPTIONS);

    expect(result.sources[0]?.mailtoTargets).toEqual(['mailto:info@hotel-exemple.fr']);
  });

  it('spends no request on a page robots.txt disallows', async () => {
    const requested = mockSite(
      {
        'https://hotel-exemple.fr/': '<a href="/contact">C</a>',
        'https://hotel-exemple.fr/contact': 'contact@hotel-exemple.fr',
      },
      'User-agent: *\nDisallow: /contact',
    );

    const result = await fetchContactPages('hotel-exemple.fr', new OriginLock(), OPTIONS);

    expect(result.requestCount).toBe(1);
    expect(requested).not.toContain('https://hotel-exemple.fr/contact');
    expect(result.sources.map((source) => source.kind)).toEqual(['homepage']);
  });

  it('reports robots-denied without fetching the homepage at all', async () => {
    const requested = mockSite(
      { 'https://hotel-exemple.fr/': 'unreachable in principle' },
      'User-agent: *\nDisallow: /',
    );

    const result = await fetchContactPages('hotel-exemple.fr', new OriginLock(), OPTIONS);

    expect(result).toMatchObject({ outcome: 'robots-denied', requestCount: 0, sources: [] });
    expect(requested.filter((url) => !url.endsWith('/robots.txt'))).toHaveLength(0);
  });

  it('reports unreachable when the homepage does not answer', async () => {
    mockSite({});
    const result = await fetchContactPages('hotel-exemple.fr', new OriginLock(), OPTIONS);
    expect(result).toMatchObject({ outcome: 'unreachable', sources: [] });
  });

  it('does not spend two of its three requests on one page', async () => {
    // A site whose contact page is its mentions legales page.
    const requested = mockSite({
      'https://hotel-exemple.fr/': '<a href="/mentions-legales-contact">Contact</a>',
      'https://hotel-exemple.fr/mentions-legales-contact': 'contact@hotel-exemple.fr',
    });

    const result = await fetchContactPages('hotel-exemple.fr', new OriginLock(), OPTIONS);

    expect(result.requestCount).toBe(2);
    expect(
      requested.filter((url) => url === 'https://hotel-exemple.fr/mentions-legales-contact'),
    ).toHaveLength(1);
  });

  it('prefers the mentions legales URL the qualification already found', async () => {
    const requested = mockSite({
      'https://hotel-exemple.fr/': 'no links at all',
      'https://hotel-exemple.fr/legal-notice': 'contact@hotel-exemple.fr',
    });

    const result = await fetchContactPages('hotel-exemple.fr', new OriginLock(), {
      ...OPTIONS,
      knownMentionsLegalesUrl: 'https://hotel-exemple.fr/legal-notice',
    });

    expect(requested).toContain('https://hotel-exemple.fr/legal-notice');
    expect(result.sources.map((source) => source.kind)).toEqual(['mentions-legales', 'homepage']);
  });
});
