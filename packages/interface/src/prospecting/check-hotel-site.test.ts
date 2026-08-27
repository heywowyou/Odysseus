import { describe, it, expect, afterEach, vi } from 'vitest';
import { OriginLock } from '@odysseus/scanner';
import { checkHotelSite } from './check-hotel-site.js';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

interface StubResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  /** Throw instead of responding, with a Node-style transport error cause. */
  throwCode?: string;
  abort?: boolean;
}

/** Every handler must answer /robots.txt, the same requirement
 *  mentions-legales-fetch.test.ts imposes: a missing branch there silently
 *  changes what the test is exercising. */
function mockFetch(handler: (url: string) => StubResponse): void {
  global.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    const stub = handler(url);
    if (stub.abort === true) {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }
    if (stub.throwCode !== undefined) {
      throw Object.assign(new TypeError('fetch failed'), {
        cause: { code: stub.throwCode },
      });
    }
    const status = stub.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      url,
      headers: new Headers({ 'content-type': 'text/html', ...(stub.headers ?? {}) }),
      text: async () => stub.body ?? '',
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const options = { crawlDelayMs: 0, userAgent: 'odysseus-test', timeoutMs: 1_000 };

function check(domain = 'hotel-exemple.fr') {
  return checkHotelSite(domain, new OriginLock(), options);
}

const HOMEPAGE = `
  <html><body>
    <h1>Hôtel des Voyageurs</h1>
    <p>24 chambres au coeur de Lyon.</p>
    <a href="/reserver">Réserver</a>
    <a href="/mentions-legales">Mentions légales</a>
  </body></html>`;

describe('checkHotelSite', () => {
  it('reports a healthy hotel site with its reservation path and identification', async () => {
    mockFetch((url) => {
      if (url.endsWith('/robots.txt')) return { status: 404 };
      if (url.includes('/mentions-legales')) {
        return { body: '<html><body>SIREN 552 100 554</body></html>' };
      }
      return { body: HOMEPAGE };
    });

    const facts = await check();
    expect(facts.reachability).toBe('ok');
    expect(facts.parkedPage).toBe(false);
    expect(facts.reservationUrl).toBe('https://hotel-exemple.fr/reserver');
    expect(facts.mentionsLegalesUrl).toBe('https://hotel-exemple.fr/mentions-legales');
    expect(facts.siren).toBe('552100554');
    expect(facts.accessibilityStatementUrl).toBeNull();
  });

  it('honours a robots.txt disallow instead of fetching the homepage', async () => {
    mockFetch((url) => {
      if (url.endsWith('/robots.txt')) {
        return { body: 'User-agent: *\nDisallow: /', headers: { 'content-type': 'text/plain' } };
      }
      throw new Error(`must not fetch ${url}`);
    });

    const facts = await check();
    expect(facts.reachability).toBe('robots-denied');
  });

  it('skips the mentions-legales page when robots disallows it, keeping the homepage facts', async () => {
    mockFetch((url) => {
      if (url.endsWith('/robots.txt')) {
        return {
          body: 'User-agent: *\nDisallow: /mentions-legales',
          headers: { 'content-type': 'text/plain' },
        };
      }
      if (url.includes('/mentions-legales')) throw new Error('must not fetch the disallowed path');
      return { body: HOMEPAGE };
    });

    const facts = await check();
    expect(facts.reachability).toBe('ok');
    expect(facts.mentionsLegalesUrl).toBeNull();
    expect(facts.siren).toBeNull();
  });

  describe('transport failures keep their reason', () => {
    it.each([
      ['ENOTFOUND', 'dns-unresolved'],
      ['ECONNREFUSED', 'dns-unresolved'],
      ['CERT_HAS_EXPIRED', 'tls-invalid'],
      ['ERR_TLS_CERT_ALTNAME_INVALID', 'tls-invalid'],
      ['ETIMEDOUT', 'timeout'],
    ] as const)('maps %s to %s', async (code, reachability) => {
      mockFetch((url) => (url.endsWith('/robots.txt') ? { status: 404 } : { throwCode: code }));
      expect((await check()).reachability).toBe(reachability);
    });

    it('reports an aborted request as a timeout', async () => {
      mockFetch((url) => (url.endsWith('/robots.txt') ? { status: 404 } : { abort: true }));
      expect((await check()).reachability).toBe('timeout');
    });
  });

  it('reports a non-2xx homepage as an http error', async () => {
    mockFetch((url) => (url.endsWith('/robots.txt') ? { status: 404 } : { status: 503 }));
    expect((await check()).reachability).toBe('http-error');
  });

  it('reports a non-HTML homepage rather than parsing it as one', async () => {
    mockFetch((url) =>
      url.endsWith('/robots.txt')
        ? { status: 404 }
        : { headers: { 'content-type': 'application/pdf' }, body: '%PDF-1.4' },
    );
    expect((await check()).reachability).toBe('non-html-response');
  });

  describe('redirects', () => {
    it('follows a same-site redirect and records that it happened', async () => {
      mockFetch((url) => {
        if (url.endsWith('/robots.txt')) return { status: 404 };
        if (url === 'https://hotel-exemple.fr/') {
          return { status: 301, headers: { location: 'https://www.hotel-exemple.fr/' } };
        }
        if (url.includes('/mentions-legales')) return { body: '<html><body>rien</body></html>' };
        return { body: HOMEPAGE };
      });

      const facts = await check();
      expect(facts.reachability).toBe('ok');
      expect(facts.finalUrl).toBe('https://www.hotel-exemple.fr/');
      expect(facts.redirectedWithinSite).toBe(true);
    });

    it('rejects a redirect that lands on another registrable domain', async () => {
      mockFetch((url) => {
        if (url.endsWith('/robots.txt')) return { status: 404 };
        return { status: 302, headers: { location: 'https://www.booking.com/hotel/fr/x.html' } };
      });

      const facts = await check();
      expect(facts.reachability).toBe('redirect-offsite');
      expect(facts.finalUrl).toContain('booking.com');
    });

    it('detects a redirect loop rather than following it forever', async () => {
      mockFetch((url) => {
        if (url.endsWith('/robots.txt')) return { status: 404 };
        if (url === 'https://hotel-exemple.fr/') {
          return { status: 302, headers: { location: 'https://hotel-exemple.fr/a' } };
        }
        return { status: 302, headers: { location: 'https://hotel-exemple.fr/' } };
      });

      expect((await check()).reachability).toBe('redirect-loop');
    });
  });

  it('flags a registrar holding page and spends no second request on it', async () => {
    const fetched: string[] = [];
    mockFetch((url) => {
      fetched.push(url);
      if (url.endsWith('/robots.txt')) return { status: 404 };
      return {
        body:
          '<html><body>Ce nom de domaine est enregistré chez OVH.' +
          '<a href="/mentions-legales">ml</a></body></html>',
      };
    });

    const facts = await check();
    expect(facts.parkedPage).toBe(true);
    expect(fetched.filter((url) => url.includes('/mentions-legales'))).toEqual([]);
  });

  it('reports a brochure-only site with no reservation path', async () => {
    mockFetch((url) => {
      if (url.endsWith('/robots.txt')) return { status: 404 };
      return { body: '<html><body><a href="/contact">Contact</a></body></html>' };
    });

    const facts = await check();
    expect(facts.reachability).toBe('ok');
    expect(facts.reservationUrl).toBeNull();
    expect(facts.bookingVendors).toEqual([]);
  });

  it('records an OTA link as a vendor fact, never as a reservation path', async () => {
    mockFetch((url) => {
      if (url.endsWith('/robots.txt')) return { status: 404 };
      return {
        body:
          '<html><body><a href="https://www.booking.com/hotel/fr/exemple.html">Booking</a>' +
          '<a href="https://www.tripadvisor.fr/Hotel_Review-x">Avis</a></body></html>',
      };
    });

    const facts = await check();
    expect(facts.reservationUrl).toBeNull();
    expect(facts.bookingVendors?.map((vendor) => vendor.registrableDomain).sort()).toEqual([
      'booking.com',
      'tripadvisor.fr',
    ]);
  });

  it('finds a published accessibility statement', async () => {
    mockFetch((url) => {
      if (url.endsWith('/robots.txt')) return { status: 404 };
      if (url.includes('/mentions-legales')) return { body: '<html><body>rien</body></html>' };
      return {
        body:
          '<html><body><a href="/declaration-accessibilite">Accessibilité</a>' +
          '<a href="/mentions-legales">ml</a></body></html>',
      };
    });

    expect((await check()).accessibilityStatementUrl).toBe(
      'https://hotel-exemple.fr/declaration-accessibilite',
    );
  });

  it('does not mistake an accessible-rooms page for an accessibility statement', async () => {
    mockFetch((url) => {
      if (url.endsWith('/robots.txt')) return { status: 404 };
      return { body: '<html><body><a href="/chambres-accessibles">Chambres</a></body></html>' };
    });

    expect((await check()).accessibilityStatementUrl).toBeNull();
  });

  it('keeps homepage facts when the mentions-legales fetch itself fails', async () => {
    mockFetch((url) => {
      if (url.endsWith('/robots.txt')) return { status: 404 };
      if (url.includes('/mentions-legales')) return { status: 500 };
      return { body: HOMEPAGE };
    });

    const facts = await check();
    expect(facts.reachability).toBe('ok');
    expect(facts.siren).toBeNull();
    expect(facts.mentionsLegalesUrl).toBeNull();
  });

  it('accepts a bare registrable domain and probes it over https', async () => {
    const fetched: string[] = [];
    mockFetch((url) => {
      fetched.push(url);
      if (url.endsWith('/robots.txt')) return { status: 404 };
      return { body: '<html><body>ok</body></html>' };
    });

    await check('hotel-exemple.fr');
    expect(fetched).toContain('https://hotel-exemple.fr/');
  });
});

describe('booking engines versus travel agencies', () => {
  it('treats a vendor booking engine as the hotel selling direct', async () => {
    // Measured on the first live batch: sablesdocre.fr links its Reservit
    // booking engine and nothing else. Calling that "offsite only" says a
    // direct-selling hotel does not sell direct.
    mockFetch((url) => {
      if (url.endsWith('/robots.txt')) return { status: 404 };
      return {
        body: '<html><body><a href="https://secure.reservit.com/x?hotel=1">Réserver</a></body></html>',
      };
    });

    const facts = await check();
    expect(facts.reservationUrl).toContain('reservit.com');
    expect(facts.bookingVendors?.map((v) => v.registrableDomain)).toEqual(['reservit.com']);
  });

  it('still treats an online travel agency as somebody else s funnel', async () => {
    mockFetch((url) => {
      if (url.endsWith('/robots.txt')) return { status: 404 };
      return {
        body: '<html><body><a href="https://www.booking.com/hotel/fr/x.html">Booking</a></body></html>',
      };
    });

    const facts = await check();
    expect(facts.reservationUrl).toBeNull();
    expect(facts.bookingVendors?.map((v) => v.registrableDomain)).toEqual(['booking.com']);
  });

  it('prefers the hotel s own reservation page over a vendor link', async () => {
    mockFetch((url) => {
      if (url.endsWith('/robots.txt')) return { status: 404 };
      return {
        body:
          '<html><body><a href="/reserver">Réserver</a>' +
          '<a href="https://secure.reservit.com/x">Réserver</a></body></html>',
      };
    });

    expect((await check()).reservationUrl).toBe('https://hotel-exemple.fr/reserver');
  });
});

describe('a domain that moved TLD', () => {
  it('records the same-name landing rather than reporting a bare offsite redirect', async () => {
    mockFetch((url) => {
      if (url.endsWith('/robots.txt')) return { status: 404 };
      if (url.includes('hotel-exemple.fr'))
        return { status: 301, headers: { location: 'https://www.hotel-exemple.com/' } };
      return { body: '<html><body>Hôtel</body></html>' };
    });

    const facts = await check();
    expect(facts.reachability).toBe('redirect-offsite');
    expect(facts.redirectedToRelatedDomain).toBe(true);
  });

  it('does not claim kinship with an unrelated landing domain', async () => {
    mockFetch((url) => {
      if (url.endsWith('/robots.txt')) return { status: 404 };
      if (url.includes('hotel-exemple.fr'))
        return { status: 301, headers: { location: 'https://www.booking.com/hotel/fr/x.html' } };
      return { body: '<html><body>Booking</body></html>' };
    });

    const facts = await check();
    expect(facts.reachability).toBe('redirect-offsite');
    expect(facts.redirectedToRelatedDomain).toBeUndefined();
  });
});
