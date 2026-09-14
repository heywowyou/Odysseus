import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { probeMongoAvailability } from '../test-support.js';
import { markOutreachThreadSynced } from '../outreach-threads.js';
import { createHotelCandidateModel } from '../schemas/hotel-candidate.schema.js';
import { createHotelQualificationModel } from '../schemas/hotel-qualification.schema.js';
import { createPrescanModel } from '../schemas/prescan.schema.js';
import { createHotelScoreModel } from '../schemas/score.schema.js';
import { createHotelContactModel } from '../schemas/hotel-contact.schema.js';
import { createOutreachThreadModel } from '../schemas/outreach-thread.schema.js';
import { createOutreachDraftModel } from '../schemas/outreach-draft.schema.js';
import { createOutreachOutcomeModel } from '../schemas/outreach-outcome.schema.js';
import { createOutreachPreviewModel } from '../schemas/outreach-preview.schema.js';
// The projection safety rule spans every view family, so this suite reads
// all of them through the barrel rather than one family module.
import {
  getOperatorProspect,
  getOutcomeSummary,
  getProspectContactView,
  getProspectEvidenceView,
  getProspectOutcomeView,
  getProspectPrescanView,
  getProspectPreviewView,
  getProspectQualificationHistory,
  getProspectScoreView,
  getProspectSourceConflicts,
  getProspectThreadView,
  getVendorFingerprintAggregate,
  listOperatorProspects,
  listOutreachReviewDrafts,
  listRepliesNeedingReview,
} from '../operator-views.js';
import {
  CURRENT_VERSIONS,
  expectSafeShape,
  PRESCAN_VERSION,
  RESOLUTION_VERSION,
  SECOND_PREVIEW_TOKEN_HASH,
  seedFullFunnel,
} from './test-fixtures.js';

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

  describe('projection safety', () => {
    it('exposes no message body, address, or hash material in any view', async () => {
      if (!connection) return;
      const candidateId = 'cand-safety';
      const { threadId } = await seedFullFunnel(connection!, candidateId);
      await markOutreachThreadSynced(connection!, threadId, new Date(), {
        reason: 'ambiguous-disappearance',
        detectedAt: new Date('2026-08-27T09:00:00.000Z'),
      });
      // A second candidate so the cross-candidate lists have breadth. Its
      // preview needs its own token hash: the collection enforces uniqueness.
      const otherId = 'cand-safety-2';
      await seedFullFunnel(connection!, otherId, SECOND_PREVIEW_TOKEN_HASH);

      const views: unknown[] = [
        await getOperatorProspect(connection!, candidateId, CURRENT_VERSIONS),
        await listOperatorProspects(
          connection!,
          { resolutionVersion: RESOLUTION_VERSION, limit: 50, offset: 0 },
          CURRENT_VERSIONS,
        ),
        await getProspectSourceConflicts(connection!, candidateId),
        await getProspectQualificationHistory(connection!, candidateId, { limit: 10, offset: 0 }),
        await getProspectPrescanView(connection!, candidateId),
        await getProspectEvidenceView(connection!, candidateId),
        await getProspectScoreView(connection!, candidateId),
        await getProspectContactView(connection!, candidateId),
        await getProspectPreviewView(connection!, candidateId),
        await getProspectThreadView(connection!, candidateId),
        await getProspectOutcomeView(connection!, candidateId, { limit: 10, offset: 0 }),
        await listOutreachReviewDrafts(connection!, { limit: 50, offset: 0 }),
        await listRepliesNeedingReview(connection!, { limit: 50, offset: 0 }),
        await getOutcomeSummary(connection!),
        await getVendorFingerprintAggregate(connection!, PRESCAN_VERSION),
      ];
      for (const view of views) expectSafeShape(view);

      // The composed detail still shows the states, only stripped of material.
      const detail = await getOperatorProspect(connection!, candidateId, CURRENT_VERSIONS);
      expect(detail?.contact?.state).toBe('found');
      expect(detail?.thread?.drafts).toHaveLength(1);
      expect(detail?.evidence?.evidenceStatus).toBe('complete');
      const reviewList = await listRepliesNeedingReview(connection!, { limit: 50, offset: 0 });
      expect(reviewList.total).toBeGreaterThanOrEqual(1);
      expect(reviewList.rows[0]?.reviewReason).toBe('ambiguous-disappearance');
      // This suite seeds two full funnels and reads every view family, so as
      // the file's first test it also pays the model compilation cost the
      // single-file version amortized across its 22 tests.
    }, 15_000);
  });
});
