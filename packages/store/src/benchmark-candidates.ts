/**
 * Persistence for milestone 10 stage 1's benchmark candidate list. See
 * schemas/benchmark-candidate.schema.ts for the collection's shape and
 * retention posture.
 */

import type { Connection } from 'mongoose';
import type { BenchmarkQualificationFailureReason } from '@odysseus/core';
import {
  createBenchmarkCandidateModel,
  type BenchmarkCandidateDocument,
  type BenchmarkCandidateStatus,
  type BenchmarkFetchFailureReason,
} from './schemas/benchmark-candidate.schema.js';

export interface BenchmarkCandidateSeed {
  rank: number;
  domain: string;
}

/**
 * Upserts every candidate with status 'pending', touching nothing about a
 * candidate that already exists (an upsert with $setOnInsert leaves an
 * already-decided row's status, reasons, and evidence untouched). This is
 * "the ordered domain list is written to the job before the first
 * request" - safe to call at the start of every invocation, including a
 * resumed one.
 */
export async function seedBenchmarkCandidates(
  connection: Connection,
  cohortVersion: string,
  candidates: readonly BenchmarkCandidateSeed[],
): Promise<void> {
  const BenchmarkCandidateModel = createBenchmarkCandidateModel(connection);
  const createdAt = new Date();

  await BenchmarkCandidateModel.bulkWrite(
    candidates.map((candidate) => ({
      updateOne: {
        filter: { cohortVersion, domain: candidate.domain },
        update: {
          $setOnInsert: {
            cohortVersion,
            rank: candidate.rank,
            domain: candidate.domain,
            resolvedHost: null,
            status: 'pending' as const,
            reasons: [],
            fetchFailureReason: null,
            siren: null,
            denomination: null,
            naf: null,
            evaluatedAt: null,
            createdAt,
          },
        },
        upsert: true,
      },
    })),
  );
}

export async function listBenchmarkCandidates(
  connection: Connection,
  cohortVersion: string,
): Promise<BenchmarkCandidateDocument[]> {
  const BenchmarkCandidateModel = createBenchmarkCandidateModel(connection);
  return BenchmarkCandidateModel.find({ cohortVersion }).sort({ rank: 1 }).lean();
}

/** Candidates still awaiting a fetch and a decision. A restart resumes
 *  exactly from here: a candidate with a terminal status is never
 *  re-fetched. */
export async function listPendingBenchmarkCandidates(
  connection: Connection,
  cohortVersion: string,
): Promise<BenchmarkCandidateDocument[]> {
  const BenchmarkCandidateModel = createBenchmarkCandidateModel(connection);
  return BenchmarkCandidateModel.find({ cohortVersion, status: 'pending' })
    .sort({ rank: 1 })
    .lean();
}

/** Candidates whose homepage fetch did not return usable content on the
 *  last attempt. A deliberate, separate list from `listPendingBenchmarkCandidates`
 *  - 'fetch-failed' is a terminal status a normal run never revisits, so
 *  reaching these requires an explicit retry decision, not an automatic
 *  resume. */
export async function listFetchFailedBenchmarkCandidates(
  connection: Connection,
  cohortVersion: string,
): Promise<BenchmarkCandidateDocument[]> {
  const BenchmarkCandidateModel = createBenchmarkCandidateModel(connection);
  return BenchmarkCandidateModel.find({ cohortVersion, status: 'fetch-failed' })
    .sort({ rank: 1 })
    .lean();
}

export interface BenchmarkCandidateOutcome {
  resolvedHost: string | null;
  status: BenchmarkCandidateStatus;
  reasons: BenchmarkQualificationFailureReason[];
  /** Only meaningful when status is 'fetch-failed'; null otherwise. */
  fetchFailureReason: BenchmarkFetchFailureReason;
  siren: string | null;
  denomination: string | null;
  naf: string | null;
}

/** One document update, written immediately after this candidate's fetch
 *  and decision. This is the checkpoint: it happens per candidate, not
 *  batched at the end of a run, so a crash mid-batch loses no completed
 *  work and never causes a completed candidate to be re-fetched. */
export async function recordBenchmarkCandidateOutcome(
  connection: Connection,
  cohortVersion: string,
  domain: string,
  outcome: BenchmarkCandidateOutcome,
): Promise<void> {
  const BenchmarkCandidateModel = createBenchmarkCandidateModel(connection);
  await BenchmarkCandidateModel.updateOne(
    { cohortVersion, domain },
    { $set: { ...outcome, evaluatedAt: new Date() } },
  );
}

export interface BenchmarkQualificationSummary {
  cohortVersion: string;
  total: number;
  byStatus: Record<BenchmarkCandidateStatus, number>;
  byReason: Record<string, number>;
  byFetchFailureReason: Record<string, number>;
}

/** The reasoned-yield report: cumulative reality across the whole
 *  persisted list, not the last internal pass. */
export async function getBenchmarkQualificationSummary(
  connection: Connection,
  cohortVersion: string,
): Promise<BenchmarkQualificationSummary> {
  const candidates = await listBenchmarkCandidates(connection, cohortVersion);
  const byStatus: Record<BenchmarkCandidateStatus, number> = {
    pending: 0,
    qualified: 0,
    disqualified: 0,
    'fetch-failed': 0,
  };
  const byReason: Record<string, number> = {};
  const byFetchFailureReason: Record<string, number> = {};

  for (const candidate of candidates) {
    byStatus[candidate.status] += 1;
    for (const reason of candidate.reasons) {
      byReason[reason] = (byReason[reason] ?? 0) + 1;
    }
    // ?? rather than a !== null check: a candidate recorded before this
    // field existed has it genuinely absent (undefined) in Mongo, not
    // null - lean() reflects the raw document, and Mongoose does not
    // retroactively backfill a schema default onto an old document.
    const fetchFailureReason = candidate.fetchFailureReason ?? null;
    if (fetchFailureReason !== null) {
      byFetchFailureReason[fetchFailureReason] =
        (byFetchFailureReason[fetchFailureReason] ?? 0) + 1;
    }
  }

  return { cohortVersion, total: candidates.length, byStatus, byReason, byFetchFailureReason };
}
