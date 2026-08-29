/**
 * Read/write helpers around the `hotel_qualifications` collection, and the one
 * place that keeps the candidate's denormalized `qualification` pointer in step
 * with it. Callers never issue their own operations against either, for the
 * reason hotel-candidates.ts gives about its own collection: the retention
 * window, the idempotency key, and the two-write invariant all live here, and a
 * caller writing directly would have to reimplement all three.
 *
 * The two writes are deliberately not a transaction. If the pointer update
 * fails after the record is written, the evidence still exists and a re-run at
 * the same version repairs the pointer, because both writes are idempotent on
 * (qualificationVersion, candidateId). The opposite ordering - pointer first -
 * would be the dangerous one: it would let prescan select a candidate whose
 * supporting evidence was never stored.
 */

import type { Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import type {
  HotelQualificationNote,
  HotelQualificationOutcome,
  HotelQualificationReason,
  HotelSireneJoin,
  HotelSiteFacts,
} from '@odysseus/core';
import {
  createHotelQualificationModel,
  type HotelQualificationDocument,
} from './schemas/hotel-qualification.schema.js';
import { createHotelCandidateModel } from './schemas/hotel-candidate.schema.js';

const HOTEL_QUALIFICATION_RETENTION_DAYS = 90;

export interface RecordHotelQualificationInput {
  candidateId: string;
  resolutionVersion: string;
  qualificationVersion: string;
  domain: string | null;
  outcome: HotelQualificationOutcome;
  reasons: HotelQualificationReason[];
  notes: HotelQualificationNote[];
  siteFacts: HotelSiteFacts;
  /** Omitted when no join was attempted, which is not the same as a join that
   *  found nothing - `HotelSireneJoin.status` already distinguishes the ways a
   *  join can come back empty. */
  sireneJoin?: HotelSireneJoin;
  evaluatedAt: Date;
}

export interface RecordHotelQualificationsResult {
  created: number;
  updated: number;
  /** Candidates whose pointer was written. Lower than created+updated only
   *  when a qualification names a candidate that no longer exists, which is
   *  worth surfacing rather than swallowing: it means the catalogue was
   *  re-resolved underneath a running batch. */
  pointersWritten: number;
}

export async function recordHotelQualifications(
  connection: Connection,
  inputs: RecordHotelQualificationInput[],
): Promise<RecordHotelQualificationsResult> {
  if (inputs.length === 0) return { created: 0, updated: 0, pointersWritten: 0 };

  const Model = createHotelQualificationModel(connection);
  // The unique index is the idempotency mechanism and Mongoose builds indexes
  // in the background - the same race, and the same fix, as
  // upsertHotelCandidates and insertHotelSourceRecords.
  await Model.init();

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + HOTEL_QUALIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const result = await Model.bulkWrite(
    inputs.map((input) => ({
      updateOne: {
        filter: {
          qualificationVersion: input.qualificationVersion,
          candidateId: input.candidateId,
        },
        update: {
          $set: {
            resolutionVersion: input.resolutionVersion,
            domain: input.domain,
            outcome: input.outcome,
            reasons: input.reasons,
            notes: input.notes,
            siteFacts: input.siteFacts,
            ...(input.sireneJoin !== undefined ? { sireneJoin: input.sireneJoin } : {}),
            evaluatedAt: input.evaluatedAt,
            expiresAt,
          },
          $setOnInsert: {
            qualificationId: randomUUID(),
            qualificationVersion: input.qualificationVersion,
            candidateId: input.candidateId,
            createdAt: now,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  const CandidateModel = createHotelCandidateModel(connection);
  const pointerResult = await CandidateModel.bulkWrite(
    inputs.map((input) => ({
      updateOne: {
        filter: { candidateId: input.candidateId },
        update: {
          $set: {
            qualification: {
              outcome: input.outcome,
              qualificationVersion: input.qualificationVersion,
              evaluatedAt: input.evaluatedAt,
            },
            updatedAt: now,
          },
        },
      },
    })),
    { ordered: false },
  );

  return {
    created: result.upsertedCount,
    updated: result.modifiedCount,
    // matchedCount, not modifiedCount: re-running a batch that changed nothing
    // still proves every pointer is present, which is what this number is for.
    pointersWritten: pointerResult.matchedCount,
  };
}

export async function getHotelQualification(
  connection: Connection,
  qualificationVersion: string,
  candidateId: string,
): Promise<HotelQualificationDocument | null> {
  const Model = createHotelQualificationModel(connection);
  return Model.findOne({ qualificationVersion, candidateId }).lean<HotelQualificationDocument>();
}

export interface HotelQualificationFilter {
  qualificationVersion?: string;
  outcome?: HotelQualificationOutcome;
}

export async function listHotelQualifications(
  connection: Connection,
  filter: HotelQualificationFilter = {},
  limit = 200,
): Promise<HotelQualificationDocument[]> {
  const Model = createHotelQualificationModel(connection);
  const query: Record<string, unknown> = {};
  if (filter.qualificationVersion !== undefined) {
    query['qualificationVersion'] = filter.qualificationVersion;
  }
  if (filter.outcome !== undefined) query['outcome'] = filter.outcome;
  return Model.find(query)
    .sort({ evaluatedAt: -1 })
    .limit(limit)
    .lean<HotelQualificationDocument[]>();
}

/** One page of a version's verdicts, ordered by candidateId so the whole
 *  generation can be walked without holding 13,000 documents in memory. The
 *  same cursor shape listCandidatesToQualify and listCandidatesToPrescan use. */
export async function listQualificationsByCandidate(
  connection: Connection,
  options: { qualificationVersion: string; limit: number; after?: string },
): Promise<HotelQualificationDocument[]> {
  const Model = createHotelQualificationModel(connection);
  const query: Record<string, unknown> = { qualificationVersion: options.qualificationVersion };
  if (options.after !== undefined) query['candidateId'] = { $gt: options.after };
  return Model.find(query)
    .sort({ candidateId: 1 })
    .limit(options.limit)
    .lean<HotelQualificationDocument[]>();
}

/** How many establishments in a resolution run already declare each of these
 *  domains as their own.
 *
 *  This is the second half of the redirect-target count, and it is why the
 *  count cannot be taken from the redirect rows alone: measured 2026-08-28,
 *  eleven hotels redirect to a domain another hotel already holds
 *  (`mandarinoriental.com`, `tribehotels.com`, and others). Those are
 *  acquisitions. Counting only redirects would read each as a rename and put
 *  two establishments on one domain, which trade-off 33 rules out as an
 *  identity key. */
export async function countCandidatesByOwnDomain(
  connection: Connection,
  options: { resolutionVersion: string; domains: readonly string[] },
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (options.domains.length === 0) return counts;
  const CandidateModel = createHotelCandidateModel(connection);
  const rows = await CandidateModel.aggregate<{ _id: string; count: number }>([
    {
      $match: {
        resolutionVersion: options.resolutionVersion,
        ownRegistrableDomain: { $in: [...options.domains] },
      },
    },
    { $group: { _id: '$ownRegistrableDomain', count: { $sum: 1 } } },
  ]);
  for (const row of rows) counts.set(row._id, row.count);
  return counts;
}

export interface HotelQualificationYield {
  total: number;
  byOutcome: Record<HotelQualificationOutcome, number>;
  /** Every reason recorded across the run, counted independently. Reasons
   *  accumulate per candidate, so these sum to more than `total` - that is the
   *  point: the question a loss-reason table answers is "how many hotels hit
   *  this condition", not "how many hotels hit only this condition". */
  byReason: Record<string, number>;
  byNote: Record<string, number>;
}

/** Computed in the database rather than by streaming documents back, the same
 *  reason getHotelCandidateYield gives: the catalogue is tens of thousands of
 *  rows. */
export async function getHotelQualificationYield(
  connection: Connection,
  qualificationVersion: string,
): Promise<HotelQualificationYield> {
  const Model = createHotelQualificationModel(connection);
  const [facets] = await Model.aggregate<{
    outcome: Array<{ _id: HotelQualificationOutcome; count: number }>;
    reason: Array<{ _id: string; count: number }>;
    note: Array<{ _id: string; count: number }>;
    total: Array<{ count: number }>;
  }>([
    { $match: { qualificationVersion } },
    {
      $facet: {
        outcome: [{ $group: { _id: '$outcome', count: { $sum: 1 } } }],
        reason: [{ $unwind: '$reasons' }, { $group: { _id: '$reasons', count: { $sum: 1 } } }],
        note: [{ $unwind: '$notes' }, { $group: { _id: '$notes', count: { $sum: 1 } } }],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const byOutcome: Record<HotelQualificationOutcome, number> = {
    qualified: 0,
    parked: 0,
    rejected: 0,
    'already-engaged': 0,
    'group-routed': 0,
  };
  for (const row of facets?.outcome ?? []) byOutcome[row._id] = row.count;

  const byReason: Record<string, number> = {};
  for (const row of facets?.reason ?? []) byReason[row._id] = row.count;
  const byNote: Record<string, number> = {};
  for (const row of facets?.note ?? []) byNote[row._id] = row.count;

  return { total: facets?.total[0]?.count ?? 0, byOutcome, byReason, byNote };
}
