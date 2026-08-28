/**
 * The Mongo-backed implementation of qualify-hotels.ts's port. Thin by design,
 * the same posture as mongo-hotel-candidate-store.ts: every rule about
 * retention, idempotency, and the candidate pointer lives in @odysseus/store's
 * helpers, and this file only adapts their shapes.
 */

import type { Connection } from 'mongoose';
import {
  applyRedirectReclassifications,
  countCandidatesByOwnDomain,
  getHotelCandidatesByIds,
  listHotelCandidatesForQualification,
  listQualificationsByCandidate,
  recordHotelQualifications,
  type HotelCandidateDocument,
  type RecordHotelQualificationInput,
} from '@odysseus/store';
import type { HotelQualificationStorePort } from './qualify-hotels.js';
import type { ReconcileRedirectsStorePort } from './reconcile-redirects.js';

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

export function createMongoReconcileRedirectsStore(
  connection: Connection,
): ReconcileRedirectsStorePort {
  return {
    listQualifications: (options) => listQualificationsByCandidate(connection, options),
    countCandidatesByOwnDomain: (options) => countCandidatesByOwnDomain(connection, options),
    getCandidates: (candidateIds) => getHotelCandidatesByIds(connection, candidateIds),
    applyReclassifications: (inputs) => applyRedirectReclassifications(connection, inputs),
    record: (inputs) => recordHotelQualifications(connection, inputs),
  };
}
