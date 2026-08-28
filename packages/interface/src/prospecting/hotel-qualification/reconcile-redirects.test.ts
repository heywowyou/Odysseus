import { describe, expect, it } from 'vitest';
import type {
  HotelCandidateDocument,
  HotelQualificationDocument,
  RecordHotelQualificationInput,
  RedirectReclassification,
} from '@odysseus/store';
import type { HotelSiteFacts } from '@odysseus/core';
import {
  reconcileRedirects,
  type ReconcileRedirectsOptions,
  type ReconcileRedirectsStorePort,
} from './reconcile-redirects.js';

function candidate(id: string, domain: string): HotelCandidateDocument {
  return {
    candidateId: id,
    resolutionVersion: 'rv1',
    identityKey: `domain:${domain}`,
    identityStatus: 'unmatched',
    sourceRefs: [],
    name: `Hôtel ${id}`,
    normalizedName: `hotel ${id}`,
    starRating: 3,
    campaignEligibility: 'eligible',
    websiteCandidates: [],
    ownRegistrableDomain: domain,
    groupStatus: 'independent',
    conflicts: [],
    review: { state: 'not-required' },
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
  } as unknown as HotelCandidateDocument;
}

function row(
  id: string,
  overrides: Partial<HotelQualificationDocument> = {},
): HotelQualificationDocument {
  return {
    qualificationId: `q-${id}`,
    candidateId: id,
    resolutionVersion: 'rv1',
    qualificationVersion: 'v1',
    domain: `${id}.fr`,
    outcome: 'qualified',
    reasons: [],
    notes: [],
    siteFacts: { reachability: 'ok' } as HotelSiteFacts,
    evaluatedAt: new Date('2026-08-27T00:00:00Z'),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  } as unknown as HotelQualificationDocument;
}

/** A row rejected by v1 for landing on `target`. */
function redirected(id: string, target: string): HotelQualificationDocument {
  return row(id, {
    outcome: 'rejected',
    reasons: ['redirect-offsite'],
    siteFacts: {
      reachability: 'redirect-offsite',
      finalUrl: `https://www.${target}/`,
    } as HotelSiteFacts,
  });
}

interface Harness {
  port: ReconcileRedirectsStorePort;
  written: RecordHotelQualificationInput[];
  applied: RedirectReclassification[];
  candidates: Map<string, HotelCandidateDocument>;
}

function fakeStore(
  rows: HotelQualificationDocument[],
  declaredOwners: Record<string, number> = {},
): Harness {
  const written: RecordHotelQualificationInput[] = [];
  const applied: RedirectReclassification[] = [];
  const candidates = new Map<string, HotelCandidateDocument>(
    rows.map((r) => [r.candidateId, candidate(r.candidateId, r.domain ?? `${r.candidateId}.fr`)]),
  );
  return {
    written,
    applied,
    candidates,
    port: {
      listQualifications: async ({ limit, after }) => {
        let sorted = [...rows].sort((a, b) => a.candidateId.localeCompare(b.candidateId));
        if (after !== undefined) sorted = sorted.filter((r) => r.candidateId > after);
        return sorted.slice(0, limit);
      },
      countCandidatesByOwnDomain: async ({ domains }) => {
        const counts = new Map<string, number>();
        for (const domain of domains) {
          const declared = declaredOwners[domain];
          if (declared !== undefined) counts.set(domain, declared);
        }
        return counts;
      },
      getCandidates: async (ids) =>
        ids
          .map((id) => candidates.get(id))
          .filter((c): c is HotelCandidateDocument => c !== undefined),
      applyReclassifications: async (inputs) => {
        applied.push(...inputs);
        for (const input of inputs) {
          const existing = candidates.get(input.candidateId);
          if (existing === undefined) continue;
          candidates.set(
            input.candidateId,
            input.kind === 'adopt'
              ? ({
                  ...existing,
                  ownRegistrableDomain: input.adoptedDomain,
                } as HotelCandidateDocument)
              : ({
                  ...existing,
                  groupStatus: input.groupStatus,
                  groupDomain: input.groupDomain,
                } as HotelCandidateDocument),
          );
        }
        return { applied: inputs.length };
      },
      record: async (inputs) => {
        written.push(...inputs);
      },
    },
  };
}

function options(
  harness: Harness,
  overrides: Partial<ReconcileRedirectsOptions> = {},
): ReconcileRedirectsOptions {
  return {
    store: harness.port,
    checkSite: async () => ({ reachability: 'ok' }) as HotelSiteFacts,
    resolutionVersion: 'rv1',
    fromVersion: 'v1',
    toVersion: 'v2',
    concurrency: 2,
    dryRun: false,
    ...overrides,
  };
}

describe('reconcileRedirects', () => {
  it('adopts a target no other establishment holds and qualifies it on its own facts', async () => {
    const harness = fakeStore([redirected('a', 'lacoorniche.com'), row('b')]);
    const report = await reconcileRedirects(options(harness));

    expect(report.byVerdict['own-moved-domain']).toBe(1);
    expect(harness.applied).toEqual([
      {
        kind: 'adopt',
        candidateId: 'a',
        adoptedDomain: 'lacoorniche.com',
        declaredDomain: 'a.fr',
      },
    ]);
    const rewritten = harness.written.find((w) => w.candidateId === 'a');
    expect(rewritten?.outcome).toBe('qualified');
    expect(rewritten?.domain).toBe('lacoorniche.com');
    expect(rewritten?.notes).toContain('domain-adopted-after-redirect');
  });

  it('routes a target several establishments arrive at, and contacts nobody about it', async () => {
    const harness = fakeStore([
      redirected('a', 'accor.com'),
      redirected('b', 'accor.com'),
      redirected('c', 'accor.com'),
    ]);
    const visited: string[] = [];
    const report = await reconcileRedirects(
      options(harness, {
        checkSite: async (domain) => {
          visited.push(domain);
          return { reachability: 'ok' } as HotelSiteFacts;
        },
      }),
    );

    expect(report.byVerdict['shared-target']).toBe(3);
    expect(report.byVerdict['own-moved-domain']).toBe(0);
    expect(visited).toEqual([]);
    expect(harness.applied.every((a) => a.kind === 'route')).toBe(true);
    expect(harness.written.every((w) => w.outcome === 'group-routed')).toBe(true);
  });

  it('counts a declared owner as an establishment, so an acquisition is not read as a rename', async () => {
    // Measured: 11 real rows redirect to a domain another hotel already holds.
    // Adopting would put two establishments on one domain, which trade-off 33
    // rules out as an identity key.
    const harness = fakeStore([redirected('a', 'mandarinoriental.com')], {
      'mandarinoriental.com': 1,
    });
    const report = await reconcileRedirects(options(harness));

    expect(report.byVerdict['own-moved-domain']).toBe(0);
    expect(report.byVerdict['shared-target']).toBe(1);
    expect(harness.applied[0]).toMatchObject({ kind: 'route', groupSize: 2 });
  });

  it('leaves a row with no usable landing URL exactly as v1 decided it', async () => {
    const harness = fakeStore([
      row('a', {
        outcome: 'rejected',
        reasons: ['redirect-offsite'],
        siteFacts: { reachability: 'redirect-offsite' } as HotelSiteFacts,
      }),
    ]);
    const report = await reconcileRedirects(options(harness));

    expect(report.byVerdict['no-target']).toBe(1);
    // A report whose parts do not sum to its own total reads as a defect the
    // next time someone checks the arithmetic by hand, so the untargetable
    // rows are inside the population, not beside it.
    expect(report.redirectRows).toBe(1);
    expect(harness.applied).toEqual([]);
    expect(harness.written[0]).toMatchObject({
      outcome: 'rejected',
      reasons: ['redirect-offsite'],
    });
  });

  it('records the adoption even when the adopted domain turns out to be dead', async () => {
    const harness = fakeStore([redirected('a', 'vendu.example')]);
    const report = await reconcileRedirects(
      options(harness, {
        checkSite: async () => ({ reachability: 'dns-unresolved' }) as HotelSiteFacts,
      }),
    );

    expect(report.adoptedOutcomes.rejected).toBe(1);
    const rewritten = harness.written.find((w) => w.candidateId === 'a');
    expect(rewritten?.reasons).toContain('dns-unresolved');
    expect(rewritten?.notes).toContain('domain-adopted-after-redirect');
  });

  it('writes one row per source row, so the new version is a complete generation', async () => {
    // The property that keeps listCandidatesToPrescan honest: a partial
    // generation would silently shrink the prescan population and look like a
    // correct filter while doing it.
    const harness = fakeStore([
      redirected('a', 'lacoorniche.com'),
      row('b'),
      row('c', { outcome: 'parked', reasons: ['below-three-stars'] }),
      row('d', { outcome: 'rejected', reasons: ['dns-unresolved'] }),
    ]);
    const report = await reconcileRedirects(options(harness));

    expect(report.rowsRead).toBe(4);
    expect(report.rowsWritten).toBe(4);
    expect(report.copiedForward).toBe(3);
    expect(harness.written.every((w) => w.qualificationVersion === 'v2')).toBe(true);
    expect(harness.written.find((w) => w.candidateId === 'c')).toMatchObject({
      outcome: 'parked',
      reasons: ['below-three-stars'],
    });
  });

  it('classifies the whole population but re-probes only up to the limit', async () => {
    const harness = fakeStore([
      redirected('a', 'un.example'),
      redirected('b', 'deux.example'),
      redirected('c', 'trois.example'),
    ]);
    const visited: string[] = [];
    const report = await reconcileRedirects(
      options(harness, {
        limit: 2,
        checkSite: async (domain) => {
          visited.push(domain);
          return { reachability: 'ok' } as HotelSiteFacts;
        },
      }),
    );

    // The count describes every row; the request budget is what --limit binds.
    expect(report.byVerdict['own-moved-domain']).toBe(3);
    expect(visited).toHaveLength(2);
    expect(report.domainsReprobed).toBe(2);
  });

  it('plans without contacting anybody or writing anything', async () => {
    const harness = fakeStore([
      redirected('a', 'lacoorniche.com'),
      redirected('b', 'accor.com'),
      redirected('c', 'accor.com'),
    ]);
    const visited: string[] = [];
    const report = await reconcileRedirects(
      options(harness, {
        dryRun: true,
        checkSite: async (domain) => {
          visited.push(domain);
          return { reachability: 'ok' } as HotelSiteFacts;
        },
      }),
    );

    expect(visited).toEqual([]);
    expect(harness.written).toEqual([]);
    expect(harness.applied).toEqual([]);
    expect(report.plan).toEqual({ wouldReprobe: 1, wouldWrite: 3 });
    // A plan reports work, never an outcome nobody observed.
    expect(report.adoptedOutcomes).toEqual({
      qualified: 0,
      parked: 0,
      rejected: 0,
      'already-engaged': 0,
      'group-routed': 0,
    });
  });

  it('refuses to rewrite a generation in place', async () => {
    const harness = fakeStore([row('a')]);
    await expect(reconcileRedirects(options(harness, { toVersion: 'v1' }))).rejects.toThrow(
      /new qualification version/,
    );
  });
});
