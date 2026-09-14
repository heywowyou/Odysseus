import { createServer, type ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROSPECT_FETCH_ALLOWLIST_ENV_VAR } from '../config.js';
import { MAX_REDIRECT_HOPS, probeUrl } from './probe-url.js';

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

const options = { timeoutMs: 1000, userAgent: 'odysseus-test' };

describe('probeUrl address guard', () => {
  const originalFetch = global.fetch;
  const originalAllowlist = process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR];

  beforeEach(() => {
    delete process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR];
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalAllowlist === undefined) delete process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR];
    else process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR] = originalAllowlist;
    vi.restoreAllMocks();
  });

  it('refuses a loopback initial host before any request is made', async () => {
    const fixture = await startFixture((path, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><body>nobody should read this via ${path}</body></html>`);
    });
    try {
      const result = await probeUrl(fixture.urlFor('127.0.0.1'), {
        ...options,
        sameSite: () => true,
      });
      expect(result).toEqual({
        kind: 'failed',
        failure: 'dns-unresolved',
        detail: 'refused internal address 127.0.0.1 (loopback)',
        finalUrl: fixture.urlFor('127.0.0.1'),
      });
      expect(fixture.requests).toEqual([]);
    } finally {
      await fixture.close();
    }
  });

  it('fetches an allowlisted loopback fixture end to end', async () => {
    process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR] = 'localhost';
    const fixture = await startFixture((path, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><body>local fixture answered ${path}</body></html>`);
    });
    try {
      const result = await probeUrl(fixture.urlFor('localhost'), {
        ...options,
        sameSite: () => true,
      });
      expect(result).toEqual({
        kind: 'ok',
        finalUrl: fixture.urlFor('localhost'),
        html: '<html><body>local fixture answered /</body></html>',
        redirectedWithinSite: false,
      });
    } finally {
      await fixture.close();
    }
  });

  it('refuses a redirect hop to an address the allowlist does not cover', async () => {
    process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR] = 'localhost';
    const fixture = await startFixture((path, res) => {
      if (path === '/start') {
        res.writeHead(302, { location: fixture.urlFor('127.0.0.1', '/target') });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body>must never be fetched</body></html>');
    });
    try {
      // sameSite always true: the address guard, not the site gate, is what
      // stops this hop.
      const result = await probeUrl(fixture.urlFor('localhost', '/start'), {
        ...options,
        sameSite: () => true,
      });
      expect(result).toMatchObject({
        kind: 'failed',
        failure: 'dns-unresolved',
        detail: 'refused internal address 127.0.0.1 (loopback)',
        finalUrl: fixture.urlFor('127.0.0.1', '/target'),
      });
      expect(fixture.requests).toEqual(['/start']);
    } finally {
      await fixture.close();
    }
  });

  it('still bounds a redirect chain at the shared hop budget across allowlisted hops', async () => {
    process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR] = 'localhost';
    const fixture = await startFixture((path, res) => {
      const step = Number.parseInt(path.slice(2), 10);
      res.writeHead(302, { location: fixture.urlFor('localhost', `/r${step + 1}`) });
      res.end();
    });
    try {
      const result = await probeUrl(fixture.urlFor('localhost', '/r1'), {
        ...options,
        sameSite: () => true,
      });
      expect(result).toMatchObject({
        kind: 'failed',
        failure: 'redirect-loop',
        detail: `more than ${MAX_REDIRECT_HOPS} redirects`,
      });
      expect(fixture.requests).toHaveLength(MAX_REDIRECT_HOPS + 1);
    } finally {
      await fixture.close();
    }
  });

  it('maps an unresolvable host onto the existing dns-unresolved path', async () => {
    const result = await probeUrl('https://unresolved.invalid/', {
      ...options,
      sameSite: () => true,
      lookupAddresses: async () => {
        throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
      },
    });
    expect(result).toMatchObject({
      kind: 'failed',
      failure: 'dns-unresolved',
      detail: 'ENOTFOUND',
    });
  });

  it('refuses an unparseable url through the same failure bucket', async () => {
    const result = await probeUrl('not a url', { ...options, sameSite: () => true });
    expect(result).toMatchObject({
      kind: 'failed',
      failure: 'dns-unresolved',
      detail: 'refused unparseable target url',
    });
  });

  it('refuses a non-http(s) protocol', async () => {
    const result = await probeUrl('file:///etc/hostname', { ...options, sameSite: () => true });
    expect(result).toMatchObject({
      kind: 'failed',
      failure: 'dns-unresolved',
      detail: 'refused non-http(s) url protocol file:',
    });
  });

  it('passes a public-resolving host through to the fetch unchanged', async () => {
    const fetchStub = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        url: 'https://example.fr/',
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => '<html><body>public site</body></html>',
      } as unknown as Response;
    });
    global.fetch = fetchStub as unknown as typeof fetch;
    const result = await probeUrl('https://example.fr/', {
      ...options,
      sameSite: () => true,
      lookupAddresses: async () => [{ address: '93.184.216.34', family: 4 }],
    });
    expect(result).toEqual({
      kind: 'ok',
      finalUrl: 'https://example.fr/',
      html: '<html><body>public site</body></html>',
      redirectedWithinSite: false,
    });
    expect(fetchStub).toHaveBeenCalledOnce();
    expect(fetchStub).toHaveBeenCalledWith(
      'https://example.fr/',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('aborts a response whose body stalls after the headers arrive', async () => {
    const fetchStub = vi.fn(async (_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () =>
          new Promise<string>((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted', 'AbortError'));
            });
          }),
      } as Response;
    });
    global.fetch = fetchStub as unknown as typeof fetch;

    const didNotFinish = Symbol('did-not-finish');
    const result = await Promise.race([
      probeUrl('https://slow-body.example/', {
        ...options,
        timeoutMs: 20,
        sameSite: () => true,
        lookupAddresses: async () => [{ address: '93.184.216.34', family: 4 }],
      }),
      new Promise<typeof didNotFinish>((resolve) => setTimeout(() => resolve(didNotFinish), 200)),
    ]);

    expect(result).toEqual({
      kind: 'failed',
      failure: 'timeout',
      detail: 'request aborted at the configured timeout',
      finalUrl: 'https://slow-body.example/',
    });
  });
});
