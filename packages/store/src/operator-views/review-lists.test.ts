import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { probeMongoAvailability } from '../test-support.js';
import { markOutreachThreadSynced } from '../outreach-threads.js';
import { markOutreachDraftDeleted, recordFailedOutreachDraft } from '../outreach-drafts.js';
import { createHotelCandidateModel } from '../schemas/hotel-candidate.schema.js';
import { createHotelQualificationModel } from '../schemas/hotel-qualification.schema.js';
import { createPrescanModel } from '../schemas/prescan.schema.js';
import { createHotelScoreModel } from '../schemas/score.schema.js';
import { createHotelContactModel } from '../schemas/hotel-contact.schema.js';
import { createOutreachThreadModel } from '../schemas/outreach-thread.schema.js';
import { createOutreachDraftModel } from '../schemas/outreach-draft.schema.js';
import { createOutreachOutcomeModel } from '../schemas/outreach-outcome.schema.js';
import { createOutreachPreviewModel } from '../schemas/outreach-preview.schema.js';
import { listOutreachReviewDrafts, listRepliesNeedingReview } from './review-lists.js';
import { upsertHotelCandidates } from '../hotel-candidates.js';
import {
  candidateInput,
  expectSafeShape,
  PRESCAN_VERSION,
  seedDraft,
  seedThread,
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

  describe('review lists', () => {
    it('lists only pending drafts across candidates, metadata only', async () => {
      if (!connection) return;
      const a = 'cand-drafts-a';
      const b = 'cand-drafts-b';
      const threadA = await seedThread(connection!, a);
      const threadB = await seedThread(connection!, b);
      const liveA = await seedDraft(connection!, threadA, a, 1);
      const deleted = await seedDraft(connection!, threadA, a, 2);
      await markOutreachDraftDeleted(connection!, deleted);
      await recordFailedOutreachDraft(connection!, {
        threadId: threadA,
        candidateId: a,
        touch: 3,
        language: 'fr',
        roleAddress: 'direction@hotel-exemple.fr',
        prescanVersion: PRESCAN_VERSION,
        evidenceVersion: 'v2',
        outreachPromptVersion: 'p1',
        failureReason: 'suppressed-before-draft',
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
      });
      const liveB = await seedDraft(connection!, threadB, b, 1);
      // Only candidate a has a catalogue row; candidate b's row is gone, so
      // its row must degrade to a null name rather than a guessed one.
      await upsertHotelCandidates(connection!, [
        candidateInput({
          candidateId: a,
          identityKey: `domain:${a}.fr`,
          name: 'Hôtel Résolu',
          normalizedName: 'hotel resolu',
          ownRegistrableDomain: `${a}.fr`,
        }),
      ]);

      const page = await listOutreachReviewDrafts(connection!, { limit: 10, offset: 0 });
      expect(page.total).toBe(2);
      expect(page.rows.map((row) => row.draftId).sort()).toEqual([liveA, liveB].sort());
      expect(page.rows.every((row) => row.hasProviderDraft)).toBe(true);
      const rowA = page.rows.find((row) => row.draftId === liveA);
      expect(rowA?.hotelName).toBe('Hôtel Résolu');
      const rowB = page.rows.find((row) => row.draftId === liveB);
      expect(rowB?.hotelName).toBeNull();
      expectSafeShape(page);
    });

    it('lists only threads whose replies need review', async () => {
      if (!connection) return;
      const flagged = 'cand-reply-flagged';
      const clean = 'cand-reply-clean';
      const threadFlagged = await seedThread(connection!, flagged);
      await seedThread(connection!, clean);
      await markOutreachThreadSynced(connection!, threadFlagged, new Date(), {
        reason: 'ambiguous-disappearance',
        detectedAt: new Date('2026-08-27T09:00:00.000Z'),
      });

      const page = await listRepliesNeedingReview(connection!, { limit: 10, offset: 0 });
      expect(page.total).toBe(1);
      expect(page.rows[0]?.candidateId).toBe(flagged);
      expect(page.rows[0]?.reviewReason).toBe('ambiguous-disappearance');
      // The flagged candidate has no catalogue row in this fixture: the name
      // stays null instead of a guess.
      expect(page.rows[0]?.hotelName).toBeNull();
      expectSafeShape(page);
    });
  });
});
