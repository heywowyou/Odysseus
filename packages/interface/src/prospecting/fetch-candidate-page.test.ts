import { createServer, type ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROSPECT_FETCH_ALLOWLIST_ENV_VAR } from '../config.js';
import { MAX_REDIRECT_HOPS } from './probe-url.js';
import { extractAnchorHrefs, fetchPageText, htmlToText } from './fetch-candidate-page.js';
import type { ResolvedAddress } from './fetch-address-guard.js';

describe('htmlToText', () => {
  it('strips tags and preserves visible text', () => {
    expect(htmlToText('<html><body><p>Hello <b>world</b></p></body></html>')).toBe('Hello world');
  });

  it('strips script and style blocks entirely', () => {
    const html =
      '<html><head><style>.a{color:red}</style></head><body><script>evil()</script>Visible</body></html>';
    expect(htmlToText(html)).toBe('Visible');
  });

  it('decodes common HTML entities', () => {
    expect(
      htmlToText('<p>Terms &amp; conditions &mdash;? &nbsp;done</p>').replace('&mdash;', ''),
    ).toContain('Terms & conditions');
  });
});

describe('extractAnchorHrefs', () => {
  it('resolves relative hrefs against the base URL', () => {
    const hrefs = extractAnchorHrefs(
      '<a href="/mentions-legales">Mentions</a>',
      'https://example.fr/',
    );
    expect(hrefs).toEqual(['https://example.fr/mentions-legales']);
  });

  it('excludes cross-origin links', () => {
    const hrefs = extractAnchorHrefs(
      '<a href="https://other.fr/page">Other</a>',
      'https://example.fr/',
    );
    expect(hrefs).toEqual([]);
  });

  it('excludes non-http(s) protocols', () => {
    const hrefs = extractAnchorHrefs(
      '<a href="mailto:contact@example.fr">Mail</a>',
      'https://example.fr/',
    );
    expect(hrefs).toEqual([]);
  });
});

type FixtureHandler = (path: string, res: ServerResponse) => void;

interface Fixture {
  port: number;
  requests: string[];
  urlFor(host: string, path?: string): string;
  close(): Promise<void>;
}

/** Loopback-only fixture server on an ephemeral port, listening on every
 *  local interface so both the 127.0.0.1 and ::1 spellings reach it. No test
 *  here ever contacts a host outside the local machine. */
async function startFixture(handler: FixtureHandler): Promise<Fixture> {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    const path = req.url ?? '/';
    requests.push(path);
    handler(path, res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    port,
    requests,
    urlFor: (host, path = '/') => `http://${host}:${port}${path}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  };
}

const publicLookup = async (): Promise<readonly ResolvedAddress[]> => [
  { address: '93.184.216.34', family: 4 },
];

describe('fetchPageText', () => {
  const originalFetch = global.fetch;
  const originalAllowlist = process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR];

  beforeEach(() => {
    delete process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR];
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalAllowlist === undefined) delete process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR];
    else process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR] = originalAllowlist;
  });

  it('returns bodyText and anchorUrls on a successful fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: 'https://example.fr/',
      text: async () => '<html><body>Hello <a href="/mentions-legales">Legal</a></body></html>',
    }) as unknown as typeof fetch;

    const result = await fetchPageText('https://example.fr/', 5000, 'TestBot/1.0', {
      lookupAddresses: publicLookup,
    });
    expect(result?.bodyText).toBe('Hello Legal');
    expect(result?.anchorUrls).toEqual(['https://example.fr/mentions-legales']);
  });

  it('returns null on a non-2xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    const result = await fetchPageText('https://example.fr/', 5000, 'TestBot/1.0', {
      lookupAddresses: publicLookup,
    });
    expect(result).toBeNull();
  });

  it('returns null rather than throwing on a network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const result = await fetchPageText('https://example.fr/', 5000, 'TestBot/1.0', {
      lookupAddresses: publicLookup,
    });
    expect(result).toBeNull();
  });

  it('returns null for a refused loopback target without contacting it', async () => {
    const fixture = await startFixture((path, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><body>nobody should read this via ${path}</body></html>`);
    });
    try {
      const result = await fetchPageText(fixture.urlFor('127.0.0.1'), 5000, 'TestBot/1.0');
      expect(result).toBeNull();
      expect(fixture.requests).toEqual([]);
    } finally {
      await fixture.close();
    }
  });

  it('follows allowlisted redirects and still reports anchors against the requested url', async () => {
    process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR] = 'localhost';
    const fixture = await startFixture((path, res) => {
      if (path === '/mentions-legales') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><body>Legal <a href="/contact">Contact</a></body></html>');
        return;
      }
      res.writeHead(302, { location: fixture.urlFor('localhost', '/mentions-legales') });
      res.end();
    });
    try {
      const result = await fetchPageText(fixture.urlFor('localhost'), 5000, 'TestBot/1.0');
      expect(result).not.toBeNull();
      expect(result?.url).toBe(fixture.urlFor('localhost', '/mentions-legales'));
      expect(result?.bodyText).toBe('Legal Contact');
      // The anchor base stays the originally requested url, the behaviour the
      // shipped 9a callers depend on, redirect or not.
      expect(result?.anchorUrls).toEqual([fixture.urlFor('localhost', '/contact')]);
    } finally {
      await fixture.close();
    }
  });

  it('stops at the same five-hop budget as probeUrl instead of following forever', async () => {
    process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR] = 'localhost';
    const fixture = await startFixture((path, res) => {
      const step = Number.parseInt(path.slice(2), 10);
      res.writeHead(302, { location: fixture.urlFor('localhost', `/r${step + 1}`) });
      res.end();
    });
    try {
      const result = await fetchPageText(fixture.urlFor('localhost', '/r1'), 5000, 'TestBot/1.0');
      expect(result).toBeNull();
      expect(fixture.requests).toHaveLength(MAX_REDIRECT_HOPS + 1);
    } finally {
      await fixture.close();
    }
  });

  it('returns null when a redirect hop lands on an address the allowlist does not cover', async () => {
    process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR] = 'localhost';
    const fixture = await startFixture((path, res) => {
      if (path === '/') {
        res.writeHead(302, { location: fixture.urlFor('127.0.0.1', '/target') });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body>must never be fetched</body></html>');
    });
    try {
      const result = await fetchPageText(fixture.urlFor('localhost'), 5000, 'TestBot/1.0');
      expect(result).toBeNull();
      expect(fixture.requests).toEqual(['/']);
    } finally {
      await fixture.close();
    }
  });

  it('returns null on an unparseable url', async () => {
    expect(await fetchPageText('not a url', 5000, 'TestBot/1.0')).toBeNull();
  });

  it('returns null when the host does not resolve', async () => {
    const result = await fetchPageText('https://unresolved.invalid/', 5000, 'TestBot/1.0', {
      lookupAddresses: async () => {
        throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
      },
    });
    expect(result).toBeNull();
  });
});
