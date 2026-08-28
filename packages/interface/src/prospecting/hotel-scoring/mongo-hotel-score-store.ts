/**
 * The Mongo-backed implementations of the two scoring ports. Thin by design,
 * the same posture as mongo-hotel-qualification-store.ts: every rule about
 * retention, immutability, and grouping lives in @odysseus/store's helpers, and
 * this file only adapts their shapes.
 */

import type { Connection } from 'mongoose';
import {
  findScoredCandidateIds,
  findSuppressedDomains,
  getHotelCandidatesByIds,
  getHotelQualification,
  getPrescan,
  listCandidatesToScore,
  listLatestHotelScores,
  recordHotelScores,
  recordScoreCohort,
  type RecordHotelScoreInput,
} from '@odysseus/store';
import type { HotelSiteFacts, OutreachSelection } from '@odysseus/core';
import type { HotelScoringStorePort } from './score-hotels.js';
import type { CohortSelectionStorePort } from './select-cohort.js';

export function createMongoHotelScoringStore(connection: Connection): HotelScoringStorePort {
  return {
    listCandidatesToScore: (options) => listCandidatesToScore(connection, options),
    getPrescan: (prescanId) => getPrescan(connection, prescanId),
    getSiteFacts: async (qualificationVersion, candidateId): Promise<HotelSiteFacts | null> => {
      const qualification = await getHotelQualification(
        connection,
        qualificationVersion,
        candidateId,
      );
      return (qualification?.siteFacts as HotelSiteFacts | undefined) ?? null;
    },
    findScoredCandidateIds: (scoringVersion, candidateIds) =>
      findScoredCandidateIds(connection, scoringVersion, candidateIds),
    recordScores: async (inputs: RecordHotelScoreInput[]) => {
      const { inserted } = await recordHotelScores(connection, inputs);
      return { inserted };
    },
  };
}

export function createMongoCohortSelectionStore(connection: Connection): CohortSelectionStorePort {
  return {
    listLatestScores: (scoringVersion) => listLatestHotelScores(connection, scoringVersion),
    getCandidates: (candidateIds) => getHotelCandidatesByIds(connection, [...candidateIds]),
    findSuppressedDomains: (domains) => findSuppressedDomains(connection, domains),
    recordCohort: (selection: OutreachSelection) => recordScoreCohort(connection, selection),
  };
}
