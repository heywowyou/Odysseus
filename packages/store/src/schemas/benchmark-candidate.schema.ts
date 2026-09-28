/**
 * Mongoose schema for the `benchmarkCandidates` collection: milestone 10
 * stage 1's persisted, ordered candidate list for the published benchmark
 * cohort (docs/product/milestone-10-benchmark-permission-record.md). One
 * document per candidate, seeded with status 'pending' before the first
 * request per binding decision 18 ("the ordered domain list is written to
 * the job before the first request"). The status field is itself the
 * checkpoint: a restart re-queries for 'pending' rows and never re-fetches
 * a candidate that already reached a terminal status.
 *
 * Not subject to the 90-day prospect expiry
 * (packages/interface/src/retention/prospect-expiry.ts): this
 * collection holds no contact address and no outreach state, only
 * publicly-declared company identity facts about large, well-known
 * retailers used for an aggregate, never-individually-named statistic.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { BenchmarkQualificationFailureReason } from '@odysseus/core';

export type BenchmarkCandidateStatus = 'pending' | 'qualified' | 'disqualified' | 'fetch-failed';

/** Why a 'fetch-failed' candidate ended up that way. Null for every other
 *  status. See mentions-legales-fetch.ts's FetchFailureReason - carried
 *  through as-is, not reinvented here. */
export type BenchmarkFetchFailureReason = 'robots-disallowed' | 'homepage-unreachable' | null;

export interface BenchmarkCandidateDocumentFields {
  cohortVersion: string;
  rank: number;
  domain: string;
  /** The resolved storefront host after redirects, filled in once the
   *  homepage fetch completes. Null while pending. */
  resolvedHost: string | null;
  status: BenchmarkCandidateStatus;
  reasons: BenchmarkQualificationFailureReason[];
  fetchFailureReason: BenchmarkFetchFailureReason;
  siren: string | null;
  denomination: string | null;
  naf: string | null;
  evaluatedAt: Date | null;
  createdAt: Date;
}

export type BenchmarkCandidateDocument = BenchmarkCandidateDocumentFields;

const benchmarkCandidateSchema = new Schema<BenchmarkCandidateDocument>(
  {
    cohortVersion: { type: String, required: true },
    rank: { type: Number, required: true },
    domain: { type: String, required: true },
    resolvedHost: { type: String, default: null },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'qualified', 'disqualified', 'fetch-failed'],
    },
    reasons: {
      type: [String],
      required: true,
      enum: ['no-siren-extracted', 'siren-not-in-qualifying-sirene-set', 'domain-suppressed'],
    },
    fetchFailureReason: {
      type: String,
      enum: ['robots-disallowed', 'homepage-unreachable'],
      default: null,
    },
    siren: { type: String, default: null },
    denomination: { type: String, default: null },
    naf: { type: String, default: null },
    evaluatedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
  },
  { collection: 'benchmarkCandidates' },
);

benchmarkCandidateSchema.index({ cohortVersion: 1, domain: 1 }, { unique: true });
benchmarkCandidateSchema.index({ cohortVersion: 1, status: 1 });

export function createBenchmarkCandidateModel(
  connection: Connection,
): Model<BenchmarkCandidateDocument> {
  return (
    connection.models['BenchmarkCandidate'] ??
    connection.model<BenchmarkCandidateDocument>('BenchmarkCandidate', benchmarkCandidateSchema)
  );
}
