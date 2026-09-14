import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { FINDINGS_SCHEMA_VERSION, type AuditManifest, type HotelCandidate } from '@odysseus/core';
import {
  getBusiness,
  getBusinessByDomain,
  getBusinessForCandidate,
  getAuditIdsForBusiness,
  resolveOrCreateBusinessForCandidate,
} from './businesses.js';
import { upsertHotelCandidates, getHotelCandidate } from './hotel-candidates.js';
import { createBusinessModel } from './schemas/business.schema.js';
import { createAuditModel } from './schemas/audit.schema.js';
import { persistAudit } from './persist-audit.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

function buildManifest(auditId: string, siteUrl = 'https://example.com/'): AuditManifest {
  return {
    auditId,
    kind: 'audit',
    siteUrl,
    startedAt: '2026-08-02T00:00:00.000Z',
    finishedAt: '2026-08-02T00:05:00.000Z',
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
      axeCoreVersion: '4.12.1',
      lighthouseVersion: '12.8.2',
      playwrightVersion: '1.49.0',
      chromiumVersion: '130.0.0.0',
    },
    config: {
      maxPages: 20,
      maxDepth: 5,
      crawlDelayMs: 1000,
      pageTimeoutMs: 30_000,
      lighthouseTimeoutMs: 60_000,
      userAgent: 'OdysseusAuditBot/0.1',
      scanConcurrency: 3,
    },
    crawl: {
      startUrl: siteUrl,
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages: [],
  };
}

function buildHotelCandidate(overrides: Partial<HotelCandidate> = {}): HotelCandidate {
  return {
    candidateId: randomUUID(),
    resolutionVersion: 'v1',
    identityKey: `domain:${randomUUID()}.fr`,
    identityStatus: 'unmatched',
    sourceRefs: [
      { source: 'atout-france', sourceId: 'a1', sourceVersion: 'size:mtime', ingestRunId: 'run-1' },
    ],
    name: 'Hôtel de la Plage',
    normalizedName: 'hotel de la plage',
    campaignEligibility: 'eligible',
    websiteCandidates: [],
    groupStatus: 'independent',
    conflicts: [],
    review: { state: 'not-required' },
    ...overrides,
  };
}

describe.skipIf(!mongoAvailable)('resolveOrCreateBusinessForCandidate', () => {
  beforeEach(async () => {
    if (!connection) return;
    await createBusinessModel(connection).deleteMany({});
  });

  it('returns null and creates nothing for a candidate with no own-registrable-domain', async () => {
    const candidate = buildHotelCandidate();
    await upsertHotelCandidates(connection!, [candidate]);

    const business = await resolveOrCreateBusinessForCandidate(connection!, candidate);

    expect(business).toBeNull();
    expect(await getBusinessForCandidate(connection!, candidate.candidateId)).toBeNull();
  });

  it('creates a durable business on first sight of a domain', async () => {
    const domain = `biz-${randomUUID()}.fr`;
    const candidate = buildHotelCandidate({ ownRegistrableDomain: domain });
    await upsertHotelCandidates(connection!, [candidate]);

    const business = await resolveOrCreateBusinessForCandidate(connection!, candidate);

    expect(business?.displayName).toBe(candidate.name);
    expect(business?.currentRegistrableDomain).toBe(domain);
    expect(business?.identityKeys).toEqual([
      expect.objectContaining({ kind: 'own-registrable-domain', value: domain }),
    ]);
    expect(business?.candidateGenerations).toEqual([
      expect.objectContaining({
        candidateId: candidate.candidateId,
        resolutionVersion: candidate.resolutionVersion,
      }),
    ]);
    expect(await getBusinessByDomain(connection!, domain)).toMatchObject({
      businessId: business!.businessId,
    });

    const stampedCandidate = await getHotelCandidate(connection!, candidate.candidateId);
    expect((stampedCandidate as { businessId?: string })?.businessId).toBe(business!.businessId);
  });

  it('reconciles a later candidate generation for the same domain back onto the same business', async () => {
    const domain = `biz-${randomUUID()}.fr`;
    const genOne = buildHotelCandidate({ ownRegistrableDomain: domain, resolutionVersion: 'v1' });
    await upsertHotelCandidates(connection!, [genOne]);
    const first = await resolveOrCreateBusinessForCandidate(connection!, genOne);

    const genTwo = buildHotelCandidate({
      ownRegistrableDomain: domain,
      resolutionVersion: 'v2',
      name: genOne.name,
    });
    await upsertHotelCandidates(connection!, [genTwo]);
    const second = await resolveOrCreateBusinessForCandidate(connection!, genTwo);

    expect(second?.businessId).toBe(first?.businessId);
    expect(second?.candidateGenerations).toHaveLength(2);
    expect(second?.candidateGenerations.map((g) => g.candidateId)).toEqual(
      expect.arrayContaining([genOne.candidateId, genTwo.candidateId]),
    );
  });

  it('updates displayName in place on a rename, keeping businessId stable', async () => {
    const domain = `biz-${randomUUID()}.fr`;
    const candidate = buildHotelCandidate({ ownRegistrableDomain: domain, name: 'Old Name' });
    await upsertHotelCandidates(connection!, [candidate]);
    const first = await resolveOrCreateBusinessForCandidate(connection!, candidate);

    const renamed = { ...candidate, name: 'New Name' };
    const second = await resolveOrCreateBusinessForCandidate(connection!, renamed);

    expect(second?.businessId).toBe(first?.businessId);
    expect(second?.displayName).toBe('New Name');
    expect(await getBusiness(connection!, first!.businessId)).toMatchObject({
      displayName: 'New Name',
    });
  });

  it('creates a new, separate business for a domain change (no auto-merge)', async () => {
    const domainOne = `biz-${randomUUID()}.fr`;
    const domainTwo = `biz-${randomUUID()}.fr`;
    const candidate = buildHotelCandidate({ ownRegistrableDomain: domainOne });
    await upsertHotelCandidates(connection!, [candidate]);
    const first = await resolveOrCreateBusinessForCandidate(connection!, candidate);

    const movedCandidate = { ...candidate, ownRegistrableDomain: domainTwo };
    const second = await resolveOrCreateBusinessForCandidate(connection!, movedCandidate);

    expect(second?.businessId).not.toBe(first?.businessId);
    expect(await getBusinessByDomain(connection!, domainOne)).toMatchObject({
      businessId: first!.businessId,
    });
    expect(await getBusinessByDomain(connection!, domainTwo)).toMatchObject({
      businessId: second!.businessId,
    });
  });

  it('is idempotent: a repeat call with no change does not duplicate the candidate generation', async () => {
    const domain = `biz-${randomUUID()}.fr`;
    const candidate = buildHotelCandidate({ ownRegistrableDomain: domain });
    await upsertHotelCandidates(connection!, [candidate]);

    await resolveOrCreateBusinessForCandidate(connection!, candidate);
    const second = await resolveOrCreateBusinessForCandidate(connection!, candidate);

    expect(second?.candidateGenerations).toHaveLength(1);
  });

  it('finds a business by its stamped candidate businessId via getBusinessForCandidate', async () => {
    const domain = `biz-${randomUUID()}.fr`;
    const candidate = buildHotelCandidate({ ownRegistrableDomain: domain });
    await upsertHotelCandidates(connection!, [candidate]);
    const created = await resolveOrCreateBusinessForCandidate(connection!, candidate);

    const found = await getBusinessForCandidate(connection!, candidate.candidateId);

    expect(found?.businessId).toBe(created!.businessId);
  });
});

describe.skipIf(!mongoAvailable)('getAuditIdsForBusiness', () => {
  const OWN_IDS = /^biz-audit-/;

  beforeEach(async () => {
    if (!connection) return;
    await createAuditModel(connection).deleteMany({ auditId: OWN_IDS });
    await createBusinessModel(connection).deleteMany({});
  });

  it('finds an audit via hotelLink.businessId even after its candidate generation is gone', async () => {
    const domain = `biz-${randomUUID()}.fr`;
    const candidate = buildHotelCandidate({ ownRegistrableDomain: domain });
    await upsertHotelCandidates(connection!, [candidate]);
    const business = await resolveOrCreateBusinessForCandidate(connection!, candidate);

    await persistAudit(connection!, buildManifest('biz-audit-1', `https://${domain}/`), []);
    await createAuditModel(connection!).updateOne(
      { auditId: 'biz-audit-1' },
      {
        $set: {
          hotelLink: {
            candidateId: candidate.candidateId,
            matchedOn: 'own-registrable-domain',
            linkedAt: new Date(),
            businessId: business!.businessId,
          },
        },
      },
    );

    const { createHotelCandidateModel } = await import('./schemas/hotel-candidate.schema.js');
    await createHotelCandidateModel(connection!).deleteOne({ candidateId: candidate.candidateId });

    const auditIds = await getAuditIdsForBusiness(connection!, business!.businessId);

    expect(auditIds).toEqual(['biz-audit-1']);
  });

  it('returns an empty list when no audit points at the business', async () => {
    const auditIds = await getAuditIdsForBusiness(connection!, randomUUID());
    expect(auditIds).toEqual([]);
  });
});
