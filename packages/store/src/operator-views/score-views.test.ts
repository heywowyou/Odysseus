import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { probeMongoAvailability } from '../test-support.js';
import { upsertHotelCandidates } from '../hotel-candidates.js';
import { recordHotelScores } from '../scores.js';
import { createHotelCandidateModel } from '../schemas/hotel-candidate.schema.js';
import { createHotelQualificationModel } from '../schemas/hotel-qualification.schema.js';
import { createPrescanModel } from '../schemas/prescan.schema.js';
import { createHotelScoreModel } from '../schemas/score.schema.js';
import { createHotelContactModel } from '../schemas/hotel-contact.schema.js';
import { createOutreachThreadModel } from '../schemas/outreach-thread.schema.js';
import { createOutreachDraftModel } from '../schemas/outreach-draft.schema.js';
import { createOutreachOutcomeModel } from '../schemas/outreach-outcome.schema.js';
import { createOutreachPreviewModel } from '../schemas/outreach-preview.schema.js';
import { getProspectScoreDiffView, getProspectScoreView } from './score-views.js';
import { candidateInput, SCORING_VERSION, scoreInput } from './test-fixtures.js';

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

  describe('score views', () => {
    it('returns the latest score with complete breakdown and version', async () => {
      if (!connection) return;
      const candidateId = 'cand-score';
      const candidate = candidateInput({ candidateId });
      await upsertHotelCandidates(connection!, [candidate]);
      await recordHotelScores(connection!, [
        scoreInput(candidateId, SCORING_VERSION, 10, 20, {
          computedAt: new Date('2026-08-22T08:00:00.000Z'),
        }),
        scoreInput(candidateId, SCORING_VERSION, 30, 40, {
          computedAt: new Date('2026-08-22T09:00:00.000Z'),
        }),
      ]);

      const view = await getProspectScoreView(connection!, candidateId);
      expect(view?.scoringVersion).toBe(SCORING_VERSION);
      // Insert-only collection: latest computation wins, the earlier one
      // remains a document beside it.
      expect(view?.brokenness.total).toBe(30);
      expect(view?.brokenness.components[0]?.id).toBe('render-gap');
      // Issue 94: the sub-page header names the hotel instead of the raw id.
      expect(view?.name).toBe(candidate.name);
      expect(view?.commune).toBe(candidate.commune);
      expect(view?.postcode).toBe(candidate.postcode);
    });

    it('falls back to the candidateId when the candidate record is gone', async () => {
      if (!connection) return;
      const candidateId = 'cand-score-orphan';
      await recordHotelScores(connection!, [scoreInput(candidateId, SCORING_VERSION, 10, 20)]);

      const view = await getProspectScoreView(connection!, candidateId);
      expect(view?.name).toBe(candidateId);
      expect(view?.commune).toBeNull();
      expect(view?.postcode).toBeNull();
    });

    it('diffs two scoring versions for one candidate', async () => {
      if (!connection) return;
      const candidateId = 'cand-diff';
      await upsertHotelCandidates(connection!, [candidateInput({ candidateId })]);
      await recordHotelScores(connection!, [
        scoreInput(candidateId, 'v-a', 30, 60),
        scoreInput(candidateId, 'v-b', 45, 55),
      ]);

      const diff = await getProspectScoreDiffView(connection!, candidateId, 'v-a', 'v-b');
      expect(diff.from?.brokenness.total).toBe(30);
      expect(diff.to?.brokenness.total).toBe(45);
      expect(diff.brokennessDelta).toBe(15);
      expect(diff.abilityDelta).toBe(-5);
    });

    it('reports null deltas when one version has no score', async () => {
      if (!connection) return;
      const candidateId = 'cand-diff-missing';
      await upsertHotelCandidates(connection!, [candidateInput({ candidateId })]);
      await recordHotelScores(connection!, [scoreInput(candidateId, 'v-a', 30, 60)]);

      const diff = await getProspectScoreDiffView(connection!, candidateId, 'v-a', 'v-b');
      expect(diff.to).toBeNull();
      expect(diff.brokennessDelta).toBeNull();
    });
  });
});
