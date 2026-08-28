import { describe, expect, it, vi } from 'vitest';
import type { CohortMemberToContact, RecordHotelContactInput } from '@odysseus/store';
import type { ContactPagesFetch } from './fetch-contact-pages.js';
import { discoverContacts, type HotelContactStorePort } from './discover-contacts.js';

function member(candidateId: string, domain: string): CohortMemberToContact {
  return { candidateId, cohortId: 'cohort-1', domain };
}

function pageWith(text: string, url = 'https://hotel-exemple.fr/contact'): ContactPagesFetch {
  return {
    outcome: 'ok',
    sources: [{ kind: 'contact-page', url, text }],
    requestCount: 3,
  };
}

interface Harness {
  store: HotelContactStorePort;
  written: RecordHotelContactInput[];
}

function harness(
  members: CohortMemberToContact[],
  overrides: Partial<HotelContactStorePort> = {},
): Harness {
  const written: RecordHotelContactInput[] = [];
  const store: HotelContactStorePort = {
    listMembers: async () => members,
    findSuppressedDomains: async () => new Set<string>(),
    isSuppressed: async () => false,
    knownMentionsLegalesUrl: async () => null,
    record: async (inputs) => {
      written.push(...inputs);
      return { created: inputs.length, updated: 0 };
    },
    ...overrides,
  };
  return { store, written };
}

function run(
  h: Harness,
  fetched: (domain: string) => ContactPagesFetch,
  options: Partial<Parameters<typeof discoverContacts>[0]> = {},
) {
  return discoverContacts({
    store: h.store,
    fetchPages: async (domain) => fetched(domain),
    verifyMailDomain: async () => 'has-mx',
    contactVersion: 'v1',
    concurrency: 2,
    dryRun: false,
    ...options,
  });
}

describe('discoverContacts', () => {
  it('stores a role address found on a cohort member', async () => {
    const h = harness([member('c1', 'hotel-exemple.fr')]);
    const report = await run(h, () => pageWith('direction@hotel-exemple.fr'));

    expect(report.byState.found).toBe(1);
    expect(h.written[0]).toMatchObject({
      candidateId: 'c1',
      cohortId: 'cohort-1',
      state: 'found',
      reason: 'role-address-published',
      address: 'direction@hotel-exemple.fr',
      localPart: 'direction',
      source: 'contact-page',
      mxStatus: 'has-mx',
    });
    expect(report.byLocalPart).toEqual({ direction: 1 });
  });

  it('parks a hotel that publishes no address, with the reason', async () => {
    const h = harness([member('c1', 'hotel-exemple.fr')]);
    const report = await run(h, () => pageWith('Bienvenue'));

    expect(report.byState.parked).toBe(1);
    expect(h.written[0]).toMatchObject({ state: 'parked', reason: 'no-address-published' });
    expect(h.written[0]?.address).toBeUndefined();
  });

  it.each([
    ['robots-denied' as const, 'robots-denied'],
    ['unreachable' as const, 'site-unreachable'],
  ])('parks a %s site as %s', async (outcome, reason) => {
    const h = harness([member('c1', 'hotel-exemple.fr')]);
    const report = await run(h, () => ({ outcome, sources: [], requestCount: 0 }));

    expect(report.byState.parked).toBe(1);
    expect(h.written[0]).toMatchObject({ state: 'parked', reason });
  });

  it('rejects a site publishing only named addresses, keeping none of them', async () => {
    const h = harness([member('c1', 'hotel-exemple.fr')]);
    const report = await run(h, () => pageWith('jean.dupont@hotel-exemple.fr'));

    expect(report.byState.rejected).toBe(1);
    expect(h.written[0]).toMatchObject({ state: 'rejected', reason: 'named-local-parts-only' });
    expect(h.written[0]?.address).toBeUndefined();
  });

  it('parks a found address whose domain publishes no MX, and keeps the address', async () => {
    const h = harness([member('c1', 'hotel-exemple.fr')]);
    const report = await run(h, () => pageWith('contact@hotel-exemple.fr'), {
      verifyMailDomain: async () => 'no-mx',
    });

    expect(report.byState.parked).toBe(1);
    expect(h.written[0]).toMatchObject({
      state: 'parked',
      reason: 'no-mail-service',
      address: 'contact@hotel-exemple.fr',
    });
  });

  it('never parks on a transient DNS failure', async () => {
    const h = harness([member('c1', 'hotel-exemple.fr')]);
    const report = await run(h, () => pageWith('contact@hotel-exemple.fr'), {
      verifyMailDomain: async () => 'unknown',
    });

    expect(report.byState.found).toBe(1);
    expect(h.written[0]).toMatchObject({ state: 'found', mxStatus: 'unknown' });
  });

  it('makes no request at all against a suppressed domain', async () => {
    const h = harness([member('c1', 'suppressed.fr')], {
      findSuppressedDomains: async () => new Set(['suppressed.fr']),
    });
    const fetchPages = vi.fn(async () => pageWith('contact@suppressed.fr'));

    const report = await discoverContacts({
      store: h.store,
      fetchPages,
      verifyMailDomain: async () => 'has-mx',
      contactVersion: 'v1',
      concurrency: 1,
      dryRun: false,
    });

    expect(fetchPages).not.toHaveBeenCalled();
    expect(report.byState.suppressed).toBe(1);
    expect(h.written[0]).toMatchObject({ state: 'suppressed', reason: 'domain-suppressed' });
  });

  it('drops an address suppressed between the fetch and the write', async () => {
    const h = harness([member('c1', 'hotel-exemple.fr')], {
      // Domain clean, address opted out: only answerable once an address exists.
      isSuppressed: async (_domain, address) => address !== undefined,
    });
    const report = await run(h, () => pageWith('contact@hotel-exemple.fr'));

    expect(report.byState.suppressed).toBe(1);
    expect(h.written[0]).toMatchObject({ state: 'suppressed', reason: 'address-suppressed' });
    expect(h.written[0]?.address).toBeUndefined();
  });

  it('plans without deciding on a dry run, and writes nothing', async () => {
    const h = harness([member('c1', 'a.fr'), member('c2', 'b.fr')]);
    const fetchPages = vi.fn(async () => pageWith('contact@a.fr'));

    const report = await discoverContacts({
      store: h.store,
      fetchPages,
      verifyMailDomain: async () => 'has-mx',
      contactVersion: 'v1',
      concurrency: 2,
      dryRun: true,
    });

    expect(fetchPages).not.toHaveBeenCalled();
    expect(h.written).toEqual([]);
    expect(report).toMatchObject({
      dryRun: true,
      processed: 0,
      membersConsidered: 2,
      plan: { wouldFetch: 2, maxRequests: 6, suppressedBeforeFetch: 0 },
    });
    expect(report.byState).toEqual({ found: 0, parked: 0, rejected: 0, suppressed: 0 });
  });

  it('counts requests and reconciles the outcome table', async () => {
    const h = harness([member('c1', 'a.fr'), member('c2', 'b.fr'), member('c3', 'c.fr')]);
    const report = await run(h, (domain) =>
      domain === 'a.fr'
        ? pageWith('contact@a.fr', 'https://a.fr/contact')
        : { outcome: 'unreachable', sources: [], requestCount: 1 },
    );

    expect(report.processed).toBe(3);
    expect(report.requestsMade).toBe(5);
    expect(report.reconciles).toBe(true);
    expect(h.written).toHaveLength(3);
  });
});
