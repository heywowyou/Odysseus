import { describe, expect, it, vi } from 'vitest';
import {
  findDelegatedBookingRedirectChecks,
  type RedirectHostCache,
} from './transactional-flow.js';

const PAGE_URL = 'https://hotel.example/';
const BOOKING_URL = 'https://booking.example/book';

function stubPage() {
  return {
    $$eval: vi.fn(async () => [{ href: BOOKING_URL, text: 'Réserver' }]),
    title: vi.fn(async () => 'Hôtel Exemple'),
    $eval: vi.fn(async () => 'Hôtel Exemple'),
  };
}

function stubBrowser(goto: () => Promise<unknown>) {
  return {
    newContext: vi.fn(async () => ({
      setDefaultTimeout: vi.fn(),
      setDefaultNavigationTimeout: vi.fn(),
      route: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      newPage: vi.fn(async () => ({
        goto,
        url: () => BOOKING_URL,
        title: async () => 'Hôtel Exemple | Réserver',
        evaluate: async () => 'Hôtel Exemple',
      })),
    })),
  };
}

const lookupAddresses = async () => [{ address: '93.184.216.34', family: 4 }];

async function follow(browser: ReturnType<typeof stubBrowser>, hostCache: RedirectHostCache) {
  return findDelegatedBookingRedirectChecks(stubPage() as never, PAGE_URL, {
    browser: browser as never,
    hostCache,
    lookupAddresses,
  });
}

describe('the shared redirect host cache (issue #537)', () => {
  it('forgets a follow cut short by a closed target, so the next page follows again', async () => {
    const hostCache: RedirectHostCache = new Map();
    const closed = stubBrowser(async () => {
      throw new Error('page.goto: Target page, context or browser has been closed');
    });

    const [first] = await follow(closed, hostCache);

    expect(first?.resolution).toBe('undetermined');
    expect(hostCache.size).toBe(0);

    const healthy = stubBrowser(async () => undefined);
    const [second] = await follow(healthy, hostCache);

    expect(healthy.newContext).toHaveBeenCalledOnce();
    expect(second?.resolution).toBe('single-property');
    expect(hostCache.size).toBe(1);
  });

  it('keeps a follow that failed for a reason about the host itself', async () => {
    const hostCache: RedirectHostCache = new Map();
    const unresolvable = stubBrowser(async () => {
      throw new Error('page.goto: net::ERR_NAME_NOT_RESOLVED');
    });

    await follow(unresolvable, hostCache);

    expect(hostCache.size).toBe(1);
  });
});
