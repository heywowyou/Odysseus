import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { probeMongoAvailability } from '../test-support.js';
import { upsertHotelCandidates } from '../hotel-candidates.js';
import { recordPrescan } from '../prescans.js';
import { recordOutreachOutcome } from '../outreach-outcomes.js';
import { createHotelCandidateModel } from '../schemas/hotel-candidate.schema.js';
import { createHotelQualificationModel } from '../schemas/hotel-qualification.schema.js';
import { createPrescanModel } from '../schemas/prescan.schema.js';
import { createHotelScoreModel } from '../schemas/score.schema.js';
import { createHotelContactModel } from '../schemas/hotel-contact.schema.js';
import { createOutreachThreadModel } from '../schemas/outreach-thread.schema.js';
import { createOutreachDraftModel } from '../schemas/outreach-draft.schema.js';
import { createOutreachOutcomeModel } from '../schemas/outreach-outcome.schema.js';
import { createOutreachPreviewModel } from '../schemas/outreach-preview.schema.js';
import { getOutcomeSummary, getVendorFingerprintAggregate } from './aggregates.js';
import {
  candidateInput,
  expectSafeShape,
  PRESCAN_VERSION,
  prescanInput,
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

  describe('aggregates', () => {
    it('composes the vendor fingerprint aggregate', async () => {
      if (!connection) return;
      const a = 'cand-vendor-a';
      const b = 'cand-vendor-b';
      await upsertHotelCandidates(connection!, [
        candidateInput({ candidateId: a }),
        candidateInput({ candidateId: b }),
      ]);
      await recordPrescan(
        connection!,
        prescanInput(a, {
          offsiteBookingLinks: ['https://secure.booking-exemple.com/cart'],
        }),
      );
      await recordPrescan(
        connection!,
        prescanInput(b, {
          offsiteBookingLinks: ['https://secure.booking-exemple.com/cart'],
        }),
      );

      const aggregate = await getVendorFingerprintAggregate(connection!, PRESCAN_VERSION, 2);
      expect(aggregate.prescanVersion).toBe(PRESCAN_VERSION);
      expect(aggregate.prescansRead).toBe(2);
      expect(aggregate.bookingHosts[0]?.value).toBe('secure.booking-exemple.com');
      expect(aggregate.bookingHosts[0]?.hotels).toBe(2);
    });

    it('summarizes outcomes as vocabulary counts only', async () => {
      if (!connection) return;
      const positive = 'cand-outcome-pos';
      const lost = 'cand-outcome-lost';
      const threadPositive = await seedThread(connection!, positive);
      const threadLost = await seedThread(connection!, lost);
      await recordOutreachOutcome(connection!, {
        threadId: threadPositive,
        outcome: 'reply-positive',
        actor: 'operator',
        recordedAt: new Date('2026-08-26T09:00:00.000Z'),
      });
      await recordOutreachOutcome(connection!, {
        threadId: threadLost,
        outcome: 'lost',
        lostReason: 'budget',
        actor: 'operator',
        recordedAt: new Date('2026-08-26T10:00:00.000Z'),
      });

      const summary = await getOutcomeSummary(connection!);
      expect(summary.total).toBe(2);
      expect(summary.byOutcome['reply-positive']).toBe(1);
      expect(summary.byOutcome['lost']).toBe(1);
      expect(summary.byLostReason['budget']).toBe(1);
      expectSafeShape(summary);
    });
  });
});
