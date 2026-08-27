/**
 * The Mongo-backed implementation of qualify-hotels.ts's port. Thin by design,
 * the same posture as mongo-hotel-candidate-store.ts: every rule about
 * retention, idempotency, and the candidate pointer lives in @odysseus/store's
 * helpers, and this file only adapts their shapes.
 */

import type { Connection } from 'mongoose';
import {
  listHotelCandidatesForQualification,
  recordHotelQualifications,
  type HotelCandidateDocument,
  type RecordHotelQualificationInput,
} from '@odysseus/store';
import type { HotelQualificationStorePort } from './qualify-hotels.js';

export function createMongoHotelQualificationStore(
  connection: Connection,
): HotelQualificationStorePort {
  return {
    listCandidatesToQualify: (options): Promise<HotelCandidateDocument[]> =>
      listHotelCandidatesForQualification(connection, options),
    record: async (inputs: RecordHotelQualificationInput[]) => {
      const { created, updated } = await recordHotelQualifications(connection, inputs);
      return { created, updated };
    },
  };
}
