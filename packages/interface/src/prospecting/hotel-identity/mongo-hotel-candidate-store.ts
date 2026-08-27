/**
 * The Mongo-backed implementation of resolve-hotels.ts's port. Thin by design:
 * every rule about retention, merge semantics, and provenance lives in
 * @odysseus/store's helpers, and this file only adapts their shapes.
 */

import type { Connection } from 'mongoose';
import type { HotelCandidate } from '@odysseus/core';
import {
  listHotelCandidates,
  streamHotelSourceRecords,
  upsertHotelCandidates,
  type HotelCandidateDocument,
  type HotelSourceRecordDocument,
} from '@odysseus/store';
import type { HotelCandidateStorePort } from './resolve-hotels.js';

export function createMongoHotelCandidateStore(connection: Connection): HotelCandidateStorePort {
  return {
    // Called twice per run and replayable from the start each time, which a
    // fresh cursor per call satisfies. Reusing one cursor across both passes
    // would silently make the second pass empty.
    streamSourceRecords: (ingestRunId: string): AsyncIterable<HotelSourceRecordDocument> =>
      streamHotelSourceRecords(connection, ingestRunId),
    listCandidates: (resolutionVersion: string): Promise<HotelCandidateDocument[]> =>
      listHotelCandidates(connection, { resolutionVersion }, Number.MAX_SAFE_INTEGER),
    upsert: async (candidates: HotelCandidate[]) => upsertHotelCandidates(connection, candidates),
  };
}
