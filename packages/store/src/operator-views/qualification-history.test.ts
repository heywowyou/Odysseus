import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { probeMongoAvailability } from '../test-support.js';
import { upsertHotelCandidates } from '../hotel-candidates.js';
import { recordHotelQualifications } from '../hotel-qualifications.js';
import { createHotelCandidateModel } from '../schemas/hotel-candidate.schema.js';
import { createHotelQualificationModel } from '../schemas/hotel-qualification.schema.js';
import { createPrescanModel } from '../schemas/prescan.schema.js';
import { createHotelScoreModel } from '../schemas/score.schema.js';
import { createHotelContactModel } from '../schemas/hotel-contact.schema.js';
import { createOutreachThreadModel } from '../schemas/outreach-thread.schema.js';
import { createOutreachDraftModel } from '../schemas/outreach-draft.schema.js';
import { createOutreachOutcomeModel } from '../schemas/outreach-outcome.schema.js';
import { createOutreachPreviewModel } from '../schemas/outreach-preview.schema.js';
import { getProspectQualificationHistory } from './qualification-history.js';
import { candidateInput, expectSafeShape, qualificationInput } from './test-fixtures.js';

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

  describe('qualification history', () => {
    it('paginates generations newest first with reasons and without raw site facts', async () => {
      if (!connection) return;
      const candidateId = 'cand-history';
      await upsertHotelCandidates(connection!, [candidateInput({ candidateId })]);
      await recordHotelQualifications(connection!, [
        qualificationInput(candidateId, {
          qualificationVersion: 'qv-1',
          outcome: 'rejected',
          reasons: ['dns-unresolved'],
          evaluatedAt: new Date('2026-08-01T10:00:00.000Z'),
        }),
        qualificationInput(candidateId, {
          qualificationVersion: 'qv-2',
          outcome: 'qualified',
          reasons: [],
          evaluatedAt: new Date('2026-08-05T10:00:00.000Z'),
        }),
      ]);

      const firstPage = await getProspectQualificationHistory(connection!, candidateId, {
        limit: 1,
        offset: 0,
      });
      expect(firstPage.total).toBe(2);
      expect(firstPage.rows[0]?.qualificationVersion).toBe('qv-2');
      expect(firstPage.rows[0]?.outcome).toBe('qualified');

      const secondPage = await getProspectQualificationHistory(connection!, candidateId, {
        limit: 1,
        offset: 1,
      });
      expect(secondPage.rows[0]?.qualificationVersion).toBe('qv-1');
      expect(secondPage.rows[0]?.reasons).toEqual(['dns-unresolved']);
      expect(secondPage.rows[0]?.sireneStatus).toBe('matched');

      expectSafeShape(firstPage);
    });
  });
});
