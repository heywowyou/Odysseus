import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FINDINGS_SCHEMA_VERSION,
  type AuditManifest,
  type Finding,
  type HotelCandidate,
} from '@odysseus/core';
import { persistAudit } from './persist-audit.js';
import {
  clearAuditGradeOverride,
  getAudit,
  getAuditGradeOverride,
  getAuditManualFields,
  getAuditRuntimeFields,
  getFindingsForAudit,
  linkAuditToHotelByDomain,
  prefillAuditManualFields,
  replaceDetectedManualFields,
  setAuditGradeOverride,
  setAuditManualFields,
} from './audits.js';
import { upsertHotelCandidates } from './hotel-candidates.js';
import { createAuditModel } from './schemas/audit.schema.js';
import { createFindingModel } from './schemas/finding.schema.js';
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
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages: [],
  };
}

function buildFinding(auditId: string, dedupeKey: string): Finding {
  return {
    findingId: `f-${dedupeKey}`,
    auditId,
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria: ['1.4.3'],
    title: 'Color contrast',
    description: 'Insufficient color contrast',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };
}

describe.skipIf(!mongoAvailable)('audits read helpers', () => {
  // These tests write fixed audit ids and assert on first-write behaviour, so
  // documents surviving a previous run make prefill find its field already set
  // and return nothing. Left uncleaned, the file passes once on a fresh
  // database and is red on every run after, which reads as a code regression.
  // Scoped to this file's own `audits-` id prefix rather than emptying the
  // collections, because other store test files share the database.
  const OWN_IDS = /^audits-/;

  beforeEach(async () => {
    if (!connection) return;
    await createAuditModel(connection).deleteMany({ auditId: OWN_IDS });
    await createFindingModel(connection).deleteMany({ auditId: OWN_IDS });
  });

  it('getAudit returns the stored audit, and null for an unknown auditId', async () => {
    await persistAudit(connection!, buildManifest('audits-read-1'), []);

    const found = await getAudit(connection!, 'audits-read-1');
    expect(found?.auditId).toBe('audits-read-1');

    const missing = await getAudit(connection!, 'audits-read-missing');
    expect(missing).toBeNull();
  });

  // The projection exists so the write and lookup handlers stop
  // deserializing the manifest pages array for a null check or two scalar
  // fields. toEqual (not toMatchObject) pins that no extra key, _id
  // included, ever rides along with the four projected fields.
  it('getAuditRuntimeFields returns exactly the projected scalar fields, and null for an unknown auditId', async () => {
    await persistAudit(connection!, buildManifest('audits-proj-1'), []);

    const found = await getAuditRuntimeFields(connection!, 'audits-proj-1');
    expect(found).toEqual({
      auditId: 'audits-proj-1',
      siteUrl: 'https://example.com/',
      startedAt: new Date('2026-08-02T00:00:00.000Z'),
      // buildManifest sets no findingsProvenance, so nothing is persisted
      // and the projected read returns undefined for it.
      findingsProvenance: undefined,
    });

    const missing = await getAuditRuntimeFields(connection!, 'audits-proj-missing');
    expect(missing).toBeNull();
  });

  it('getFindingsForAudit returns every finding for that audit', async () => {
    const manifest = buildManifest('audits-read-2');
    const findings = [
      buildFinding('audits-read-2', 'ar2-a'),
      buildFinding('audits-read-2', 'ar2-b'),
    ];
    await persistAudit(connection!, manifest, findings);

    const found = await getFindingsForAudit(connection!, 'audits-read-2');
    expect(found).toHaveLength(2);
    expect(found.map((f) => f.dedupeKey).sort()).toEqual(['ar2-a', 'ar2-b']);
  });

  it('getAuditManualFields returns undefined before any field is saved', async () => {
    await persistAudit(connection!, buildManifest('audits-manual-1'), []);
    expect(await getAuditManualFields(connection!, 'audits-manual-1')).toBeUndefined();
  });

  it('setAuditManualFields merges rather than replaces, and rejects an invalid siren', async () => {
    await persistAudit(connection!, buildManifest('audits-manual-2'), []);

    await setAuditManualFields(connection!, 'audits-manual-2', {
      nomCommercial: { value: 'Acme', provenance: 'operator' },
    });
    const afterFirst = await getAuditManualFields(connection!, 'audits-manual-2');
    expect(afterFirst?.nomCommercial?.value).toBe('Acme');

    await setAuditManualFields(connection!, 'audits-manual-2', {
      recipientName: { value: 'Jane Doe', provenance: 'operator' },
    });
    const afterSecond = await getAuditManualFields(connection!, 'audits-manual-2');
    expect(afterSecond?.nomCommercial?.value).toBe('Acme');
    expect(afterSecond?.recipientName?.value).toBe('Jane Doe');

    await expect(
      setAuditManualFields(connection!, 'audits-manual-2', {
        siren: { value: '732829321', provenance: 'operator' },
      }),
    ).rejects.toThrow(/valid SIREN/);
  });

  // 2026-08-22, La Corniche report review: unlike setAuditManualFields
  // (always overwrites), prefillAuditManualFields must never clobber a
  // field an operator already entered - the whole reason it exists
  // separately, per its own doc comment in audits.ts.
  it('prefillAuditManualFields fills only absent fields, with provenance "detected", and never overwrites an operator value', async () => {
    await persistAudit(connection!, buildManifest('audits-prefill-1'), []);

    await setAuditManualFields(connection!, 'audits-prefill-1', {
      nomCommercial: { value: 'Operator-typed name', provenance: 'operator' },
    });

    const written = await prefillAuditManualFields(connection!, 'audits-prefill-1', {
      nomCommercial: 'Detected name (should be ignored)',
      raisonSociale: 'DETECTED RAISON SOCIALE',
    });

    expect(written).toEqual({ raisonSociale: 'DETECTED RAISON SOCIALE' });

    const after = await getAuditManualFields(connection!, 'audits-prefill-1');
    expect(after?.nomCommercial?.value).toBe('Operator-typed name');
    expect(after?.nomCommercial?.provenance).toBe('operator');
    expect(after?.raisonSociale?.value).toBe('DETECTED RAISON SOCIALE');
    expect(after?.raisonSociale?.provenance).toBe('detected');
  });

  it('prefillAuditManualFields writes nothing and returns an empty object when every candidate field is already set', async () => {
    await persistAudit(connection!, buildManifest('audits-prefill-2'), []);
    await setAuditManualFields(connection!, 'audits-prefill-2', {
      nomCommercial: { value: 'Already set', provenance: 'operator' },
    });

    const written = await prefillAuditManualFields(connection!, 'audits-prefill-2', {
      nomCommercial: 'Detected name',
    });

    expect(written).toEqual({});
  });

  it('replaceDetectedManualFields overwrites a detected value but never an operator one', async () => {
    await persistAudit(connection!, buildManifest('audits-replace-1'), []);
    await setAuditManualFields(connection!, 'audits-replace-1', {
      nomCommercial: { value: 'Site Officiel', provenance: 'detected' },
      raisonSociale: { value: 'Operator-confirmed name', provenance: 'operator' },
    });

    const written = await replaceDetectedManualFields(connection!, 'audits-replace-1', {
      nomCommercial: 'Hôtel de la Plage',
      raisonSociale: 'Should never be written',
    });

    expect(written).toEqual({ nomCommercial: 'Hôtel de la Plage' });

    const after = await getAuditManualFields(connection!, 'audits-replace-1');
    expect(after?.nomCommercial).toEqual({ value: 'Hôtel de la Plage', provenance: 'detected' });
    expect(after?.raisonSociale).toEqual({
      value: 'Operator-confirmed name',
      provenance: 'operator',
    });
  });

  it('getAuditGradeOverride returns undefined before any override is saved', async () => {
    await persistAudit(connection!, buildManifest('audits-grade-1'), []);
    expect(await getAuditGradeOverride(connection!, 'audits-grade-1')).toBeUndefined();
  });

  it('setAuditGradeOverride saves the grade and reason, stamping reviewedAt/reviewedBy', async () => {
    await persistAudit(connection!, buildManifest('audits-grade-2'), []);

    const saved = await setAuditGradeOverride(connection!, 'audits-grade-2', {
      grade: 'B',
      reason: 'Findings resolved on the live site since this scan.',
    });

    expect(saved.grade).toBe('B');
    expect(saved.reason).toBe('Findings resolved on the live site since this scan.');
    expect(saved.reviewedBy).toBe('operator');
    expect(saved.reviewedAt).toBeInstanceOf(Date);

    const found = await getAuditGradeOverride(connection!, 'audits-grade-2');
    expect(found).toEqual(saved);
  });

  it('setAuditGradeOverride replaces a prior override rather than merging', async () => {
    await persistAudit(connection!, buildManifest('audits-grade-3'), []);

    await setAuditGradeOverride(connection!, 'audits-grade-3', {
      grade: 'C',
      reason: 'First review.',
    });
    const second = await setAuditGradeOverride(connection!, 'audits-grade-3', {
      grade: 'A',
      reason: 'Second review, superseding the first.',
    });

    expect(second.grade).toBe('A');
    expect(second.reason).toBe('Second review, superseding the first.');

    const found = await getAuditGradeOverride(connection!, 'audits-grade-3');
    expect(found).toEqual(second);
  });

  it('clearAuditGradeOverride removes a saved override', async () => {
    await persistAudit(connection!, buildManifest('audits-grade-4'), []);
    await setAuditGradeOverride(connection!, 'audits-grade-4', { grade: 'D', reason: 'x' });

    await clearAuditGradeOverride(connection!, 'audits-grade-4');

    expect(await getAuditGradeOverride(connection!, 'audits-grade-4')).toBeUndefined();
  });

  it('setAuditGradeOverride and clearAuditGradeOverride throw for an unknown auditId', async () => {
    await expect(
      setAuditGradeOverride(connection!, 'audits-grade-missing', { grade: 'A', reason: 'x' }),
    ).rejects.toThrow(/not found/);
    await expect(clearAuditGradeOverride(connection!, 'audits-grade-missing')).rejects.toThrow(
      /not found/,
    );
  });
});

/** Minimal HotelCandidate fixture for linkAuditToHotelByDomain's tests -
 *  the same shape hotel-candidates.test.ts's own baseCandidate builds,
 *  kept local rather than shared so this file's domain-matching setup
 *  stays self-contained. */
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

describe.skipIf(!mongoAvailable)('linkAuditToHotelByDomain', () => {
  const OWN_IDS = /^audits-link-/;

  beforeEach(async () => {
    if (!connection) return;
    await createAuditModel(connection).deleteMany({ auditId: OWN_IDS });
  });

  it('links an audit to the single-holder candidate for its own site domain, and returns it', async () => {
    const domain = `hotel-link-${randomUUID()}.fr`;
    const candidate = buildHotelCandidate({ ownRegistrableDomain: domain });
    await upsertHotelCandidates(connection!, [candidate]);
    await persistAudit(connection!, buildManifest('audits-link-1', `https://${domain}/`), []);

    const result = await linkAuditToHotelByDomain(
      connection!,
      'audits-link-1',
      `https://${domain}/`,
    );

    expect(result.candidate?.candidateId).toBe(candidate.candidateId);
    const stored = await getAudit(connection!, 'audits-link-1');
    expect(stored?.hotelLink).toMatchObject({
      candidateId: candidate.candidateId,
      matchedOn: 'own-registrable-domain',
    });
    expect(stored?.hotelLink?.businessId).toEqual(expect.any(String));
  });

  it('is idempotent: a second call resolves the same candidate without rewriting hotelLink', async () => {
    const domain = `hotel-link-${randomUUID()}.fr`;
    const candidate = buildHotelCandidate({ ownRegistrableDomain: domain });
    await upsertHotelCandidates(connection!, [candidate]);
    await persistAudit(connection!, buildManifest('audits-link-2', `https://${domain}/`), []);

    await linkAuditToHotelByDomain(connection!, 'audits-link-2', `https://${domain}/`);
    const firstLinkedAt = (await getAudit(connection!, 'audits-link-2'))?.hotelLink?.linkedAt;

    const second = await linkAuditToHotelByDomain(
      connection!,
      'audits-link-2',
      `https://${domain}/`,
    );

    expect(second.candidate?.candidateId).toBe(candidate.candidateId);
    const after = await getAudit(connection!, 'audits-link-2');
    expect(after?.hotelLink?.linkedAt).toEqual(firstLinkedAt);
  });

  it('never overwrites an existing outreach association, and resolves that candidate instead', async () => {
    const candidate = buildHotelCandidate();
    await upsertHotelCandidates(connection!, [candidate]);
    await persistAudit(
      connection!,
      buildManifest('audits-link-3', 'https://an-unrelated-domain.example/'),
      [],
    );
    await createAuditModel(connection!).updateOne(
      { auditId: 'audits-link-3' },
      {
        $set: {
          outreach: {
            candidateId: candidate.candidateId,
            cohortId: 'cohort-1',
            scoringVersion: 'hotel-outreach-v1',
            authorizedBy: 'cohort',
          },
        },
      },
    );

    const result = await linkAuditToHotelByDomain(
      connection!,
      'audits-link-3',
      'https://an-unrelated-domain.example/',
    );

    expect(result.candidate?.candidateId).toBe(candidate.candidateId);
    const stored = await getAudit(connection!, 'audits-link-3');
    expect(stored?.hotelLink).toBeUndefined();
  });

  it('returns a null candidate and writes nothing when the site domain matches no candidate', async () => {
    await persistAudit(
      connection!,
      buildManifest('audits-link-4', 'https://no-such-hotel-domain-xyz.example/'),
      [],
    );

    const result = await linkAuditToHotelByDomain(
      connection!,
      'audits-link-4',
      'https://no-such-hotel-domain-xyz.example/',
    );

    expect(result.candidate).toBeNull();
    const stored = await getAudit(connection!, 'audits-link-4');
    expect(stored?.hotelLink).toBeUndefined();
  });

  it('never matches a domain no candidate holds exclusively (single-holder-only gate, trade-off 33)', async () => {
    // A shared/vendor-hosted domain never gets ownRegistrableDomain set on
    // any candidate in the catalogue resolution itself, so
    // getLatestHotelCandidateByOwnRegistrableDomain finds nothing for it -
    // exercised directly here by never setting the field on a candidate
    // that shares this domain.
    const domain = `shared-${randomUUID()}.fr`;
    const candidate = buildHotelCandidate({ groupStatus: 'vendor-hosted', groupDomain: domain });
    await upsertHotelCandidates(connection!, [candidate]);
    await persistAudit(connection!, buildManifest('audits-link-5', `https://${domain}/`), []);

    const result = await linkAuditToHotelByDomain(
      connection!,
      'audits-link-5',
      `https://${domain}/`,
    );

    expect(result.candidate).toBeNull();
  });
});
