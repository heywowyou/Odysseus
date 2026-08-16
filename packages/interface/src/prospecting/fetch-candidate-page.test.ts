import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractAnchorHrefs, fetchPageText, htmlToText } from './fetch-candidate-page.js';

describe('htmlToText', () => {
  it('strips tags and preserves visible text', () => {
    expect(htmlToText('<html><body><p>Hello <b>world</b></p></body></html>')).toBe('Hello world');
  });

  it('strips script and style blocks entirely', () => {
    const html = '<html><head><style>.a{color:red}</style></head><body><script>evil()</script>Visible</body></html>';
    expect(htmlToText(html)).toBe('Visible');
  });

  it('decodes common HTML entities', () => {
    expect(htmlToText('<p>Terms &amp; conditions &mdash;? &nbsp;done</p>').replace('&mdash;', '')).toContain(
      'Terms & conditions',
    );
  });
});

describe('extractAnchorHrefs', () => {
  it('resolves relative hrefs against the base URL', () => {
    const hrefs = extractAnchorHrefs('<a href="/mentions-legales">Mentions</a>', 'https://example.fr/');
    expect(hrefs).toEqual(['https://example.fr/mentions-legales']);
  });

  it('excludes cross-origin links', () => {
    const hrefs = extractAnchorHrefs('<a href="https://other.fr/page">Other</a>', 'https://example.fr/');
    expect(hrefs).toEqual([]);
  });

  it('excludes non-http(s) protocols', () => {
    const hrefs = extractAnchorHrefs('<a href="mailto:contact@example.fr">Mail</a>', 'https://example.fr/');
    expect(hrefs).toEqual([]);
  });
});

describe('fetchPageText', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns bodyText and anchorUrls on a successful fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://example.fr/',
      text: async () => '<html><body>Hello <a href="/mentions-legales">Legal</a></body></html>',
    }) as unknown as typeof fetch;

    const result = await fetchPageText('https://example.fr/', 5000, 'TestBot/1.0');
    expect(result?.bodyText).toBe('Hello Legal');
    expect(result?.anchorUrls).toEqual(['https://example.fr/mentions-legales']);
  });

  it('returns null on a non-2xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const result = await fetchPageText('https://example.fr/', 5000, 'TestBot/1.0');
    expect(result).toBeNull();
  });

  it('returns null rather than throwing on a network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const result = await fetchPageText('https://example.fr/', 5000, 'TestBot/1.0');
    expect(result).toBeNull();
  });
});
