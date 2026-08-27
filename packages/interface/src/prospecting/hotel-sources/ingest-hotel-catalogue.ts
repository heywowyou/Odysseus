/**
 * Drives one hotel catalogue source into the `hotel_source_records`
 * collection and reports what it yielded.
 *
 * The campaign eligibility decision is applied here, once, from core's pure
 * gate, rather than inside either adapter: an adapter that could decide
 * eligibility could also disagree with the other adapter about it, and the
 * three-star threshold is a recorded operator decision with exactly one
 * implementation.
 *
 * Records are written in bounded batches rather than one at a time or all at
 * once, for the same reason the shipped ingestion job checkpoints periodically:
 * a crash mid-run loses at most one batch, and memory stays flat across a
 * national file.
 */

import { isCampaignEligibleRating, type HotelSourceIngestCounters } from '@odysseus/core';
import { insertHotelSourceRecords, type NewHotelSourceRecordInput } from '@odysseus/store';
import type { Connection } from 'mongoose';
import type { HotelCatalogueSource } from './hotel-catalogue-source.js';

export const HOTEL_INGEST_BATCH_SIZE = 500;

export interface HotelIngestReport {
  source: string;
  sourceVersion: string;
  ingestRunId: string;
  dryRun: boolean;
  counters: HotelSourceIngestCounters;
  eligible: number;
  parkedBelowThreeStars: number;
  parkedUnknownRating: number;
  withDeclaredWebsite: number;
  eligibleWithDeclaredWebsite: number;
  inserted: number;
  duplicatesSkipped: number;
  /** File and offset the next run resumes from, or null when the source was
   *  read to the end. */
  resumeFrom: { filePath: string; byteOffset: number } | null;
}

export interface IngestHotelCatalogueOptions {
  source: HotelCatalogueSource;
  ingestRunId: string;
  /** Stop after this many accepted records. Omitted means read to the end. */
  limit?: number;
  /** Parse and count without writing anything. */
  dryRun?: boolean;
  /** Required unless dryRun. */
  connection?: Connection;
}

export async function ingestHotelCatalogue(
  options: IngestHotelCatalogueOptions,
): Promise<HotelIngestReport> {
  const { source, ingestRunId } = options;
  const dryRun = options.dryRun ?? false;
  if (!dryRun && options.connection === undefined) {
    throw new Error('odysseus: ingestHotelCatalogue needs a connection unless dryRun is set');
  }

  let eligible = 0;
  let parkedBelowThreeStars = 0;
  let parkedUnknownRating = 0;
  let withDeclaredWebsite = 0;
  let eligibleWithDeclaredWebsite = 0;
  let inserted = 0;
  let duplicatesSkipped = 0;
  let sourceVersion = '';
  let resumeFrom: HotelIngestReport['resumeFrom'] = null;
  let batch: NewHotelSourceRecordInput[] = [];

  async function flush(): Promise<void> {
    if (batch.length === 0) return;
    if (!dryRun) {
      const result = await insertHotelSourceRecords(options.connection!, batch);
      inserted += result.inserted;
      duplicatesSkipped += result.duplicatesSkipped;
    }
    batch = [];
  }

  for await (const emission of source.read()) {
    const { record } = emission;
    sourceVersion = record.sourceVersion;
    const eligibility = isCampaignEligibleRating(record.starRating ?? null);
    if (eligibility === 'eligible') eligible += 1;
    else if (eligibility === 'parked-below-three-stars') parkedBelowThreeStars += 1;
    else parkedUnknownRating += 1;

    if (record.declaredWebsite !== undefined) {
      withDeclaredWebsite += 1;
      if (eligibility === 'eligible') eligibleWithDeclaredWebsite += 1;
    }

    batch.push({ ...record, ingestRunId, campaignEligibility: eligibility });
    if (batch.length >= HOTEL_INGEST_BATCH_SIZE) await flush();

    const acceptedSoFar = source.counters().accepted;
    if (options.limit !== undefined && acceptedSoFar >= options.limit) {
      resumeFrom = { filePath: emission.filePath, byteOffset: emission.byteOffset };
      break;
    }
  }
  await flush();

  return {
    source: source.name,
    sourceVersion,
    ingestRunId,
    dryRun,
    counters: source.counters(),
    eligible,
    parkedBelowThreeStars,
    parkedUnknownRating,
    withDeclaredWebsite,
    eligibleWithDeclaredWebsite,
    inserted,
    duplicatesSkipped,
    resumeFrom,
  };
}
