import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { probeMongoAvailability } from '../test-support.js';
import { createHotelCandidateModel } from '../schemas/hotel-candidate.schema.js';
import { createHotelQualificationModel } from '../schemas/hotel-qualification.schema.js';
import { createPrescanModel } from '../schemas/prescan.schema.js';
import { createHotelScoreModel } from '../schemas/score.schema.js';
import { createHotelContactModel } from '../schemas/hotel-contact.schema.js';
import { createOutreachThreadModel } from '../schemas/outreach-thread.schema.js';
import { createOutreachDraftModel } from '../schemas/outreach-draft.schema.js';
import { createOutreachOutcomeModel } from '../schemas/outreach-outcome.schema.js';
import { createOutreachPreviewModel } from '../schemas/outreach-preview.schema.js';
import type { HotelCandidate } from '@odysseus/core';
import { upsertHotelCandidates } from '../hotel-candidates.js';
import { createJob, deleteJob } from '../jobs.js';
import { getOperatorProspect } from './prospect-detail.js';
import {
  CURRENT_VERSIONS,
  PRESCAN_VERSION,
  QUALIFICATION_VERSION,
  SCORING_VERSION,
  seedFullFunnel,
} from './test-fixtures.js';

function minimalCandidate(
  candidateId: string,
  overrides: Partial<HotelCandidate> = {},
): HotelCandidate {
  return {
    candidateId,
    resolutionVersion: 'rv-fresh',
    identityKey: `domain:${candidateId}.fr`,
    identityStatus: 'unmatched',
    sourceRefs: [{ source: 'atout-france', sourceId: 'a1', sourceVersion: 's', ingestRunId: 'r1' }],
    name: `Hôtel ${candidateId}`,
    normalizedName: `hotel ${candidateId}`,
    campaignEligibility: 'eligible',
    websiteCandidates: [],
    groupStatus: 'independent',
    conflicts: [],
    review: { state: 'not-required' },
    ...overrides,
  };
}

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

describe.skipIf(!mongoAvailable)('operator views', () => {
  beforeEach(async () => {
    if (!connection) return;
    await createHotelCandidateModel(connection).deleteMany({});
    await createHotelQualificationModel(connection).deleteMany({});
    await createPrescanModel(connection).deleteMany({});
    await createHotelScoreModel(connection).deleteMany({});
    await createHotelContactModel(connection).deleteMany({});
    await createOutreachThreadModel(connection).deleteMany({});
    await createOutreachDraftModel(connection).deleteMany({});
    await createOutreachOutcomeModel(connection).deleteMany({});
    await createOutreachPreviewModel(connection).deleteMany({});
  });

  describe('composed detail', () => {
    it('returns coherent joined data for one seeded candidate', async () => {
      if (!connection) return;
      const candidateId = 'cand-detail';
      await seedFullFunnel(connection!, candidateId);

      const detail = await getOperatorProspect(connection!, candidateId, CURRENT_VERSIONS);
      expect(detail).not.toBeNull();
      expect(detail?.businessId).toBeNull();
      expect(detail?.name).toBe('Hôtel cand-detail');
      expect(detail?.reviewState).toBe('pending');
      expect(detail?.qualificationOutcome).toBe('qualified');
      expect(detail?.qualificationFreshness.state).toBe('current');
      expect(detail?.prescanFreshness.state).toBe('current');
      expect(detail?.scoreFreshness.state).toBe('current');
      expect(detail?.qualification?.outcome).toBe('qualified');
      expect(detail?.qualification?.sireneStatus).toBe('matched');
      expect(detail?.prescanStatus).toBe('complete');
      expect(detail?.prescan?.pages).toHaveLength(2);
      expect(detail?.prescan?.pages[0]?.metrics?.largestContentfulPaintMs).toBe(5200);
      expect(detail?.prescan?.pages[0]?.axe?.violationCount).toBe(3);
      // Issue 94: prescan, evidence, score, and preview sub-views each carry
      // the hotel's own identity so their pages can headline it.
      expect(detail?.prescan?.name).toBe('Hôtel cand-detail');
      expect(detail?.evidence?.specificFailure.state).toBe('captured');
      expect(detail?.evidence?.summaries).toHaveLength(3);
      expect(detail?.evidence?.name).toBe('Hôtel cand-detail');
      expect(detail?.score?.brokenness.total).toBe(42);
      expect(detail?.score?.ability.total).toBe(65);
      expect(detail?.score?.brokenness.components[0]?.reason).toBe('render-gap-severe');
      expect(detail?.score?.name).toBe('Hôtel cand-detail');
      expect(detail?.contact?.state).toBe('found');
      expect(detail?.contact?.mxStatus).toBe('has-mx');
      expect(detail?.thread?.state).toBe('open');
      expect(detail?.thread?.currentOutcome?.outcome).toBe('reply-positive');
      expect(detail?.thread?.drafts[0]?.status).toBe('created');
      expect(detail?.preview?.status).toBe('live');
      expect(detail?.preview?.name).toBe('Hôtel cand-detail');
      expect(detail?.outcomes.rows[0]?.outcome).toBe('reply-positive');
      expect(detail?.conflicts).toEqual([]);
      expect(detail?.sourceRefs).toHaveLength(1);
      // This suite seeds a full funnel as its first test, so it pays the
      // model compilation cost the single-file version amortized across its
      // 22 tests.
    }, 15_000);

    it('returns null for an unknown candidate', async () => {
      if (!connection) return;
      await expect(
        getOperatorProspect(connection!, 'cand-missing', CURRENT_VERSIONS),
      ).resolves.toBeNull();
    });
  });

  // Issue #217: a hub must never represent an old versioned artifact as
  // current merely because it exists.
  describe('pipeline freshness', () => {
    it('reports missing for a candidate with no qualification, prescan, or score', async () => {
      if (!connection) return;
      const candidateId = 'cand-fresh-missing';
      await upsertHotelCandidates(connection!, [minimalCandidate(candidateId)]);

      const detail = await getOperatorProspect(connection!, candidateId, CURRENT_VERSIONS);

      expect(detail?.qualificationFreshness).toEqual({ state: 'missing' });
      expect(detail?.prescanFreshness).toEqual({ state: 'missing' });
      expect(detail?.scoreFreshness).toEqual({ state: 'missing' });
    });

    it('reports stale, not current, for an older qualification generation - the gate still refuses', async () => {
      if (!connection) return;
      const candidateId = 'cand-fresh-stale-qual';
      await seedFullFunnel(connection!, candidateId);

      const detail = await getOperatorProspect(connection!, candidateId, {
        ...CURRENT_VERSIONS,
        qualificationVersion: 'qv-2',
      });

      expect(detail?.qualificationFreshness).toMatchObject({
        state: 'stale',
        version: QUALIFICATION_VERSION,
        currentVersion: 'qv-2',
      });
      // Historical values remain visible while labeled stale.
      expect(detail?.qualification?.outcome).toBe('qualified');
    });

    it('reports stale for an older prescan version, so Quick check is not current', async () => {
      if (!connection) return;
      const candidateId = 'cand-fresh-stale-prescan';
      await seedFullFunnel(connection!, candidateId);

      const detail = await getOperatorProspect(connection!, candidateId, {
        ...CURRENT_VERSIONS,
        prescanVersion: 'v4',
      });

      expect(detail?.prescanFreshness).toMatchObject({
        state: 'stale',
        version: PRESCAN_VERSION,
        currentVersion: 'v4',
      });
      // The prescan itself is still inspectable, only labeled stale.
      expect(detail?.prescan?.pages).toHaveLength(2);
    });

    it('reports a score derived from a stale prescan as stale, even at the current scoring version', async () => {
      if (!connection) return;
      const candidateId = 'cand-fresh-stale-score';
      await seedFullFunnel(connection!, candidateId);

      const detail = await getOperatorProspect(connection!, candidateId, {
        ...CURRENT_VERSIONS,
        prescanVersion: 'v4',
      });

      expect(detail?.scoreFreshness).toMatchObject({
        state: 'stale',
        currentVersion: SCORING_VERSION,
      });
      // The score value itself stays visible.
      expect(detail?.score?.brokenness.total).toBe(42);
    });

    it('reports refreshing, not stale, while a prescan job is active for the candidate domain', async () => {
      if (!connection) return;
      const candidateId = 'cand-fresh-refreshing';
      const domain = `${candidateId}.example.fr`;
      await upsertHotelCandidates(connection!, [
        minimalCandidate(candidateId, {
          identityKey: `domain:${domain}`,
          ownRegistrableDomain: domain,
        }),
      ]);
      const job = await createJob(connection!, {
        type: 'hotel-prescan',
        options: { domain },
      });

      const detail = await getOperatorProspect(connection!, candidateId, CURRENT_VERSIONS);

      expect(detail?.prescanFreshness).toEqual({ state: 'refreshing', jobId: job.jobId });
      expect(detail?.scoreFreshness).toEqual({ state: 'refreshing', jobId: job.jobId });

      // This job is deliberately left queued above so getOperatorProspect
      // sees it as active; the jobs collection is shared across the whole
      // test database (this file's beforeEach never touches it, unlike
      // every other collection here), so a leftover queued document
      // outlives this test and can jump ahead of jobs created by other,
      // concurrently-running test files' own FIFO-ordering assertions.
      await deleteJob(connection!, job.jobId);
    });
  });
});
