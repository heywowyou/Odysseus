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
import type { BackfillSireneStorePort } from './backfill-sirene.js';
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

/** The Sirene backfill reads a stored generation and writes a new one. It
 *  needs no probe and no reclassification, so it gets three of the five
 *  operations the reconciliation port carries rather than borrowing that port
 *  whole. */
export function createMongoBackfillSireneStore(connection: Connection): BackfillSireneStorePort {
  return {
    listQualifications: (options) => listQualificationsByCandidate(connection, options),
    getCandidates: (candidateIds) => getHotelCandidatesByIds(connection, candidateIds),
    record: (inputs) => recordHotelQualifications(connection, inputs),
  };
}
