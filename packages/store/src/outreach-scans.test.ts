import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { FINDINGS_SCHEMA_VERSION, type AuditManifest, type HotelCandidate } from '@odysseus/core';
import { persistAudit } from './persist-audit.js';
import { createJobModel } from './schemas/job.schema.js';
import { createHotelScoreCohortModel } from './schemas/score-cohort.schema.js';
import { addSuppressionEntry } from './suppression.js';
import { upsertHotelCandidates } from './hotel-candidates.js';
import {
  findActiveOutreachFullScanJob,
  findActiveScanJobForHost,
  planOutreachFullScan,
  resolveOutreachAuditForCandidate,
} from './outreach-scans.js';
import { addWaveRosterEntry } from './wave-roster.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.dropDatabase();
  if (connection) await connection.close();
});

const QUALIFICATION_VERSION = 'v3';
const VERSIONS = { qualificationVersion: QUALIFICATION_VERSION };

function baseCandidate(overrides: Partial<HotelCandidate> = {}): HotelCandidate {
  return {
    candidateId: randomUUID(),
    resolutionVersion: 'v1',
    identityKey: `domain:${randomUUID()}`,
    identityStatus: 'resolved',
    sourceRefs: [
      { source: 'atout-france', sourceId: 'a1', sourceVersion: 'size:mtime', ingestRunId: 'run-1' },
    ],
    name: 'Hôtel de la Plage',
    normalizedName: 'hotel de la plage',
    postcode: '38000',
    commune: 'GRENOBLE',
    starRating: 3,
    campaignEligibility: 'eligible',
    websiteCandidates: [
      {
        raw: 'https://www.example.fr',
        source: 'atout-france',
        sourceId: 'a1',
        kind: 'own-domain',
        hostname: 'www.example.fr',
        registrableDomain: 'example.fr',
      },
    ],
    ownRegistrableDomain: 'example.fr',
    groupStatus: 'independent',
    conflicts: [],
    review: { state: 'not-required' },
    ...overrides,
  };
}

function qualifiedCandidate(domain: string): HotelCandidate {
  return baseCandidate({
    ownRegistrableDomain: domain,
    qualification: {
      outcome: 'qualified',
      qualificationVersion: QUALIFICATION_VERSION,
      evaluatedAt: new Date(),
    },
  });
}

async function seedCohort(input: {
  cohortId: string;
  candidateId: string;
  approved?: boolean;
  state?: 'selected' | 'calibration';
  computedAt?: Date;
  scoringVersion?: string;
}): Promise<void> {
  await createHotelScoreCohortModel(connection!).create({
    cohortId: input.cohortId,
    scoringVersion: input.scoringVersion ?? 'hotel-outreach-v1',
    selectionRuleVersion: 'half-ability-decile-brokenness-v1',
    approved: input.approved ?? true,
    populationSize: 1,
    abilityCutoff: null,
    brokennessCutoff: null,
    selectedCount: 1,
    members: [
      {
        candidateId: input.candidateId,
        scoreId: randomUUID(),
        rank: 1,
        state: input.state ?? 'selected',
        reason: 'top-brokenness-decile',
      },
    ],
    notSelectedByReason: {},
    computedAt: input.computedAt ?? new Date(),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
}

async function seedOutreachAudit(input: {
  candidateId: string;
  auditId?: string;
  siteUrl?: string;
  pages?: AuditManifest['pages'];
  withProvenance?: boolean;
}): Promise<void> {
  const auditId = input.auditId ?? randomUUID();
  const pages =
    input.pages ??
    ([
      {
        url: input.siteUrl ?? 'https://example.fr/',
        status: 'visited',
        errors: {},
        analysisCoverage: {
          templateFamilyId: 'home',
          passes: {
            rendered: { outcome: 'completed' },
            axe: { outcome: 'completed' },
            extended: { outcome: 'completed' },
            lighthouse: { outcome: 'completed' },
          },
        },
      },
    ] as unknown as AuditManifest['pages']);
  const manifest: AuditManifest = {
    auditId,
    kind: 'audit',
    siteUrl: input.siteUrl ?? 'https://example.fr/',
    startedAt: '2026-09-11T00:00:00.000Z',
    finishedAt: '2026-09-11T00:05:00.000Z',
    ...(input.withProvenance === false
      ? {}
      : {
          findingsProvenance: {
            findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
            normalizationFingerprint: 'fp',
            findingsDigest: 'digest',
          },
        }),
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
      axeCoreVersion: '4.10.2',
      lighthouseVersion: '12.2.1',
      playwrightVersion: '1.49.0',
      chromiumVersion: '130.0.0.0',
    },
    config: {
      maxPages: 20,
      maxDepth: 5,
      crawlDelayMs: 1000,
      pageTimeoutMs: 30000,
      lighthouseTimeoutMs: 60000,
      userAgent: 'OdysseusAuditBot/0.1',
      scanConcurrency: 3,
    },
    crawl: {
      startUrl: input.siteUrl ?? 'https://example.fr/',
      visitedCount: pages.length,
      maxPages: 20,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages,
    outreach: {
      candidateId: input.candidateId,
      cohortId: `cohort-${randomUUID()}`,
      scoringVersion: 'hotel-outreach-v1',
      authorizedBy: 'cohort',
    },
  };
  await persistAudit(connection!, manifest, []);
}

async function seedJob(input: {
  type: 'outreach-full-scan' | 'full-audit';
  status: 'queued' | 'running' | 'failed';
  siteUrl: string;
  candidateId?: string;
}): Promise<string> {
  const jobId = randomUUID();
  await createJobModel(connection!).create({
    jobId,
    type: input.type,
    status: input.status,
    phase: 'queued',
    siteUrl: input.siteUrl,
    options:
      input.type === 'outreach-full-scan'
        ? {
            domain: new URL(input.siteUrl).hostname,
            outreachCandidateId: input.candidateId ?? randomUUID(),
            outreachCohortId: `cohort-${randomUUID()}`,
            outreachScoringVersion: 'hotel-outreach-v1',
          }
        : {},
    createdAt: new Date(),
    progress: {},
  });
  return jobId;
}

/** A candidate fully authorized for an outreach scan: selected in its own
 *  fresh cohort (the newest one), currently qualified, sole owner of its
 *  own domain. */
async function seedSelectedCandidate(domain = 'example.fr'): Promise<{
  candidate: HotelCandidate;
  cohortId: string;
}> {
  const candidate = qualifiedCandidate(domain);
  await upsertHotelCandidates(connection!, [candidate]);
  const cohortId = `cohort-${randomUUID()}`;
  await seedCohort({ cohortId, candidateId: candidate.candidateId });
  return { candidate, cohortId };
}

describe.skipIf(!mongoAvailable)('planOutreachFullScan', () => {
  it('plans a scan for a selected, qualified, unsuppressed candidate', async () => {
    const { candidate, cohortId } = await seedSelectedCandidate();
    const plan = await planOutreachFullScan(connection!, candidate.candidateId, VERSIONS);
    expect(plan).toMatchObject({
      candidateId: candidate.candidateId,
      domain: 'example.fr',
      cohortId,
      scoringVersion: 'hotel-outreach-v1',
    });
  });

  it('refuses an unknown candidate', async () => {
    const plan = await planOutreachFullScan(connection!, 'does-not-exist', VERSIONS);
    expect(plan).toEqual({ refused: 'candidate-unknown' });
  });

  it('refuses a qualified candidate outside every cohort', async () => {
    const candidate = qualifiedCandidate('outsider.fr');
    await upsertHotelCandidates(connection!, [candidate]);
    expect(await planOutreachFullScan(connection!, candidate.candidateId, VERSIONS)).toEqual({
      refused: 'not-selected',
    });
  });

  it('refuses a calibration member and an unapproved cohort', async () => {
    const calibration = qualifiedCandidate('calibration.fr');
    await upsertHotelCandidates(connection!, [calibration]);
    await seedCohort({
      cohortId: `cohort-${randomUUID()}`,
      candidateId: calibration.candidateId,
      state: 'calibration',
      computedAt: new Date(Date.now() + 1000),
    });

    const unapproved = qualifiedCandidate('unapproved.fr');
    await upsertHotelCandidates(connection!, [unapproved]);
    await seedCohort({
      cohortId: `cohort-${randomUUID()}`,
      candidateId: unapproved.candidateId,
      approved: false,
      computedAt: new Date(Date.now() + 2000),
    });

    expect(await planOutreachFullScan(connection!, calibration.candidateId, VERSIONS)).toEqual({
      refused: 'not-selected',
    });
    expect(await planOutreachFullScan(connection!, unapproved.candidateId, VERSIONS)).toEqual({
      refused: 'cohort-not-approved',
    });
  });

  it('authorizes a candidate no cohort selects, via the wave roster', async () => {
    const candidate = qualifiedCandidate('roster-only.fr');
    await upsertHotelCandidates(connection!, [candidate]);
    // A unique scoring version isolates this test's "latest cohort at this
    // version" lookup from every other test in this file recording a
    // cohort under the shared 'hotel-outreach-v1' constant.
    const scoringVersion = `sv-${randomUUID()}`;
    // Provenance only: the roster entry needs a cohort to record as the
    // selection run the decision was taken against, even though this
    // candidate is not one of its members.
    const provenanceCohortId = `cohort-${randomUUID()}`;
    await seedCohort({ cohortId: provenanceCohortId, candidateId: randomUUID(), scoringVersion });

    await addWaveRosterEntry(connection!, {
      wave: 'wave-1',
      candidateId: candidate.candidateId,
      rank: 8,
      scoringVersion,
      actor: 'operator',
    });

    const plan = await planOutreachFullScan(connection!, candidate.candidateId, VERSIONS);
    expect(plan).toMatchObject({
      candidateId: candidate.candidateId,
      domain: 'roster-only.fr',
      cohortId: provenanceCohortId,
      scoringVersion,
      authorizedBy: 'wave-roster',
    });
  });

  it('the wave roster authorizes even when the candidate is also selected in an unapproved cohort', async () => {
    const candidate = qualifiedCandidate('roster-and-unapproved.fr');
    await upsertHotelCandidates(connection!, [candidate]);
    const scoringVersion = `sv-${randomUUID()}`;
    await seedCohort({
      cohortId: `cohort-${randomUUID()}`,
      candidateId: candidate.candidateId,
      approved: false,
      scoringVersion,
    });
    await addWaveRosterEntry(connection!, {
      wave: 'wave-1',
      candidateId: candidate.candidateId,
      scoringVersion,
      actor: 'operator',
    });

    const plan = await planOutreachFullScan(connection!, candidate.candidateId, VERSIONS);
    expect(plan).toMatchObject({ authorizedBy: 'wave-roster' });
  });

  it('a cohort-selected, approved candidate is authorized by the cohort, not the roster', async () => {
    const { candidate, cohortId } = await seedSelectedCandidate('cohort-wins.fr');
    const plan = await planOutreachFullScan(connection!, candidate.candidateId, VERSIONS);
    expect(plan).toMatchObject({ cohortId, authorizedBy: 'cohort' });
  });

  it('refuses a stale qualification generation', async () => {
    const candidate = baseCandidate({
      ownRegistrableDomain: 'stale-qual.fr',
      qualification: {
        outcome: 'qualified',
        qualificationVersion: 'v2-old',
        evaluatedAt: new Date(),
      },
    });
    await upsertHotelCandidates(connection!, [candidate]);
    await seedCohort({ cohortId: `cohort-${randomUUID()}`, candidateId: candidate.candidateId });
    expect(await planOutreachFullScan(connection!, candidate.candidateId, VERSIONS)).toEqual({
      refused: 'qualification-not-current',
    });
  });

  it('refuses when the domain now belongs to a different candidate', async () => {
    const { candidate: first } = await seedSelectedCandidate('moved.fr');
    const second = baseCandidate({ ownRegistrableDomain: 'moved.fr' });
    await upsertHotelCandidates(connection!, [second]);
    await seedCohort({
      cohortId: `cohort-${randomUUID()}`,
      candidateId: second.candidateId,
      computedAt: new Date(Date.now() + 1000),
    });

    expect(await planOutreachFullScan(connection!, first.candidateId, VERSIONS)).toEqual({
      refused: 'domain-mismatch',
    });
  });

  it('refuses a suppressed domain', async () => {
    const { candidate } = await seedSelectedCandidate('suppressed.fr');
    await addSuppressionEntry(connection!, {
      domain: 'suppressed.fr',
      reasonCode: 'objection',
      reason: 'test opt-out',
    });
    expect(await planOutreachFullScan(connection!, candidate.candidateId, VERSIONS)).toEqual({
      refused: 'suppressed',
    });
  });

  it('refuses while an outreach scan is already in flight', async () => {
    const { candidate } = await seedSelectedCandidate('inflight.fr');
    await seedJob({
      type: 'outreach-full-scan',
      status: 'running',
      siteUrl: 'https://inflight.fr/',
      candidateId: candidate.candidateId,
    });
    expect(await planOutreachFullScan(connection!, candidate.candidateId, VERSIONS)).toEqual({
      refused: 'already-in-flight',
    });
    const active = await findActiveOutreachFullScanJob(connection!, candidate.candidateId);
    expect(active?.options.outreachCandidateId).toBe(candidate.candidateId);
  });

  it('excludes the claimed job itself from the claim-time re-check', async () => {
    const { candidate, cohortId } = await seedSelectedCandidate('selfclaim.fr');
    const jobId = await seedJob({
      type: 'outreach-full-scan',
      status: 'running',
      siteUrl: 'https://selfclaim.fr/',
      candidateId: candidate.candidateId,
    });
    const plan = await planOutreachFullScan(connection!, candidate.candidateId, VERSIONS, {
      excludeJobId: jobId,
    });
    expect(plan).toMatchObject({
      candidateId: candidate.candidateId,
      domain: 'selfclaim.fr',
      cohortId,
      scoringVersion: 'hotel-outreach-v1',
    });
    expect(
      await findActiveOutreachFullScanJob(connection!, candidate.candidateId, jobId),
    ).toBeNull();
  });

  it('still refuses with an exclusion when a different scan is in flight', async () => {
    const { candidate } = await seedSelectedCandidate('twoscan.fr');
    const otherJobId = await seedJob({
      type: 'outreach-full-scan',
      status: 'queued',
      siteUrl: 'https://twoscan.fr/',
      candidateId: candidate.candidateId,
    });
    await seedJob({
      type: 'outreach-full-scan',
      status: 'running',
      siteUrl: 'https://twoscan.fr/',
      candidateId: candidate.candidateId,
    });
    expect(
      await planOutreachFullScan(connection!, candidate.candidateId, VERSIONS, {
        excludeJobId: otherJobId,
      }),
    ).toEqual({ refused: 'already-in-flight' });
  });

  it('finds an active full-audit job for the same host', async () => {
    await seedJob({ type: 'full-audit', status: 'queued', siteUrl: 'https://www.busy.fr/' });
    expect(await findActiveScanJobForHost(connection!, 'busy.fr')).not.toBeNull();
    expect(await findActiveScanJobForHost(connection!, 'quiet.fr')).toBeNull();
  });
});

describe.skipIf(!mongoAvailable)('resolveOutreachAuditForCandidate', () => {
  it('resolves the candidate-linked audit exactly', async () => {
    const { candidate } = await seedSelectedCandidate('resolved.fr');
    await seedOutreachAudit({
      candidateId: candidate.candidateId,
      siteUrl: 'https://resolved.fr/',
    });
    const resolution = await resolveOutreachAuditForCandidate(connection!, candidate.candidateId);
    expect(resolution.state).toBe('resolved');
    if (resolution.state === 'resolved') {
      expect(resolution.audit.outreach?.candidateId).toBe(candidate.candidateId);
    }
  });

  it('refuses an audit whose domain no longer matches the candidate', async () => {
    const { candidate } = await seedSelectedCandidate('renamed.fr');
    await seedOutreachAudit({
      candidateId: candidate.candidateId,
      siteUrl: 'https://old-name.fr/',
    });
    expect(await resolveOutreachAuditForCandidate(connection!, candidate.candidateId)).toEqual({
      state: 'refused',
      reason: 'domain-mismatch',
    });
  });

  it('refuses without a stamped provenance', async () => {
    const { candidate } = await seedSelectedCandidate('nostamp.fr');
    await seedOutreachAudit({
      candidateId: candidate.candidateId,
      siteUrl: 'https://nostamp.fr/',
      withProvenance: false,
    });
    expect(await resolveOutreachAuditForCandidate(connection!, candidate.candidateId)).toEqual({
      state: 'refused',
      reason: 'stale-provenance',
    });
  });

  it('refuses a coverage-incomplete crawl', async () => {
    const { candidate } = await seedSelectedCandidate('broken-crawl.fr');
    const pages = [
      { url: 'https://broken-crawl.fr/', status: 'visited', errors: {} },
      { url: 'https://broken-crawl.fr/dead', status: 'error', errors: {} },
      { url: 'https://broken-crawl.fr/dead-2', status: 'error', errors: {} },
    ] as unknown as AuditManifest['pages'];
    await seedOutreachAudit({
      candidateId: candidate.candidateId,
      siteUrl: 'https://broken-crawl.fr/',
      pages,
    });
    expect(await resolveOutreachAuditForCandidate(connection!, candidate.candidateId)).toEqual({
      state: 'refused',
      reason: 'coverage-incomplete',
    });
  });

  it('refuses a suppressed candidate even with a resolved audit', async () => {
    const { candidate } = await seedSelectedCandidate('later-suppressed.fr');
    await seedOutreachAudit({
      candidateId: candidate.candidateId,
      siteUrl: 'https://later-suppressed.fr/',
    });
    await addSuppressionEntry(connection!, {
      domain: 'later-suppressed.fr',
      reasonCode: 'objection',
      reason: 'test opt-out',
    });
    expect(await resolveOutreachAuditForCandidate(connection!, candidate.candidateId)).toEqual({
      state: 'refused',
      reason: 'suppressed',
    });
  });

  it('distinguishes no audit from a failed scan from one still running', async () => {
    const { candidate: quiet } = await seedSelectedCandidate('quiet.fr');
    expect(await resolveOutreachAuditForCandidate(connection!, quiet.candidateId)).toEqual({
      state: 'refused',
      reason: 'no-audit',
    });

    const { candidate: failed } = await seedSelectedCandidate('failed.fr');
    await seedJob({
      type: 'outreach-full-scan',
      status: 'failed',
      siteUrl: 'https://failed.fr/',
      candidateId: failed.candidateId,
    });
    expect(await resolveOutreachAuditForCandidate(connection!, failed.candidateId)).toEqual({
      state: 'refused',
      reason: 'audit-failed',
    });

    const { candidate: running } = await seedSelectedCandidate('running.fr');
    await seedJob({
      type: 'outreach-full-scan',
      status: 'running',
      siteUrl: 'https://running.fr/',
      candidateId: running.candidateId,
    });
    expect(await resolveOutreachAuditForCandidate(connection!, running.candidateId)).toEqual({
      state: 'refused',
      reason: 'audit-in-flight',
    });
  });
});
