/**
 * Read/write helpers around the `hotel_source_records` collection. Insert-only
 * - see schemas/hotel-source-record.schema.ts for why - so there is no update
 *  helper here, only insertion, counting, and reads.
 *
 * Callers never issue their own Mongoose operations against this collection:
 * the retention window and the run-scoped idempotency rule both live here, and
 * a caller writing directly would have to reimplement both correctly.
 */

import type { Connection } from 'mongoose';
import type { HotelCatalogueSourceName, HotelCampaignEligibility } from '@odysseus/core';
import {
  createHotelSourceRecordModel,
  type HotelSourceRecordDocument,
  type HotelSourceRecordDocumentFields,
} from './schemas/hotel-source-record.schema.js';

const HOTEL_SOURCE_RECORD_RETENTION_DAYS = 90;

export type NewHotelSourceRecordInput = Omit<
  HotelSourceRecordDocumentFields,
  'createdAt' | 'expiresAt'
>;

export interface InsertHotelSourceRecordsResult {
  inserted: number;
  /** Rows already present for this run, source, and source id. Expected and
   *  harmless: it is what a resumed or retried batch produces, and counting
   *  them separately is how an operator tells a genuine re-run from a source
   *  that has started emitting duplicate ids. */
  duplicatesSkipped: number;
}

/** MongoDB's duplicate-key error code. */
const DUPLICATE_KEY_ERROR = 11000;

interface BulkWriteErrorShape {
  writeErrors?: Array<{ err?: { code?: number }; code?: number }>;
}

export async function insertHotelSourceRecords(
  connection: Connection,
  inputs: NewHotelSourceRecordInput[],
): Promise<InsertHotelSourceRecordsResult> {
  if (inputs.length === 0) return { inserted: 0, duplicatesSkipped: 0 };

  const Model = createHotelSourceRecordModel(connection);
  // The unique index IS this function's idempotency mechanism, and Mongoose
  // builds indexes in the background after the model is compiled. Without
  // waiting for that, the very first batch after a fresh connection races the
  // index and a resumed run silently doubles the catalogue instead of being
  // rejected. init() resolves once indexes exist and is memoized per model, so
  // subsequent batches pay nothing.
  await Model.init();
  const createdAt = new Date();
  const expiresAt = new Date(
    createdAt.getTime() + HOTEL_SOURCE_RECORD_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const docs: HotelSourceRecordDocumentFields[] = inputs.map((input) => ({
    ...input,
    createdAt,
    expiresAt,
  }));

  try {
    // ordered: false so one duplicate does not abandon the rest of the batch -
    // a resumed run legitimately re-presents rows it already wrote.
    const written = await Model.insertMany(docs, { ordered: false });
    return { inserted: written.length, duplicatesSkipped: 0 };
  } catch (error) {
    const bulk = error as BulkWriteErrorShape;
    const writeErrors = bulk.writeErrors ?? [];
    const duplicates = writeErrors.filter(
      (entry) => (entry.err?.code ?? entry.code) === DUPLICATE_KEY_ERROR,
    ).length;
    // Only a batch whose every failure was a duplicate key is absorbed.
    // Anything else is a real failure and must surface, because swallowing it
    // would report a yield the collection does not actually hold.
    if (writeErrors.length === 0 || duplicates !== writeErrors.length) throw error;
    return { inserted: docs.length - duplicates, duplicatesSkipped: duplicates };
  }
}

export interface HotelSourceYield {
  total: number;
  byEligibility: Record<HotelCampaignEligibility, number>;
  withDeclaredWebsite: number;
  eligibleWithDeclaredWebsite: number;
}

/** The measurement that decides whether an additional ingestion source is
 *  needed. Computed in the database rather than by streaming documents back,
 *  since the catalogue is tens of thousands of rows. */
export async function getHotelSourceYield(
  connection: Connection,
  ingestRunId: string,
): Promise<HotelSourceYield> {
  const Model = createHotelSourceRecordModel(connection);
  const rows = await Model.aggregate<{
    _id: HotelCampaignEligibility;
    count: number;
    withWebsite: number;
  }>([
    { $match: { ingestRunId } },
    {
      $group: {
        _id: '$campaignEligibility',
        count: { $sum: 1 },
        withWebsite: {
          $sum: {
            $cond: [{ $ifNull: ['$declaredWebsite', false] }, 1, 0],
          },
        },
      },
    },
  ]);

  const byEligibility: Record<HotelCampaignEligibility, number> = {
    eligible: 0,
    'parked-below-three-stars': 0,
    'parked-unknown-rating': 0,
  };
  let total = 0;
  let withDeclaredWebsite = 0;
  let eligibleWithDeclaredWebsite = 0;

  for (const row of rows) {
    byEligibility[row._id] = row.count;
    total += row.count;
    withDeclaredWebsite += row.withWebsite;
    if (row._id === 'eligible') eligibleWithDeclaredWebsite = row.withWebsite;
  }

  return { total, byEligibility, withDeclaredWebsite, eligibleWithDeclaredWebsite };
}

export async function listHotelSourceRecords(
  connection: Connection,
  filter: { source?: HotelCatalogueSourceName; ingestRunId?: string } = {},
  limit = 200,
): Promise<HotelSourceRecordDocument[]> {
  const Model = createHotelSourceRecordModel(connection);
  const query: Record<string, unknown> = {};
  if (filter.source !== undefined) query['source'] = filter.source;
  if (filter.ingestRunId !== undefined) query['ingestRunId'] = filter.ingestRunId;
  return Model.find(query).sort({ name: 1 }).limit(limit).lean<HotelSourceRecordDocument[]>();
}

/** Streams one run in `_id` order, for a caller that has to read the whole
 *  catalogue rather than a page of it. listHotelSourceRecords is capped and
 *  sorted for human-facing listings; this exists because identity resolution
 *  needs two full passes over a run - one to count establishments per domain,
 *  one to classify them - and holding tens of thousands of documents in memory
 *  twice to avoid a second query is the wrong trade. */
export async function* streamHotelSourceRecords(
  connection: Connection,
  ingestRunId: string,
  batchSize = 500,
): AsyncGenerator<HotelSourceRecordDocument> {
  const Model = createHotelSourceRecordModel(connection);
  const cursor = Model.find({ ingestRunId })
    .sort({ _id: 1 })
    .batchSize(batchSize)
    .lean<HotelSourceRecordDocument>()
    .cursor();
  try {
    for await (const document of cursor) {
      yield document as HotelSourceRecordDocument;
    }
  } finally {
    await cursor.close();
  }
}

/** The most recently written ingest run, so a CLI caller does not have to
 *  paste a UUID to resolve the batch they just ingested. */
export async function getLatestHotelIngestRunId(connection: Connection): Promise<string | null> {
  const Model = createHotelSourceRecordModel(connection);
  const latest = await Model.findOne().sort({ createdAt: -1 }).select({ ingestRunId: 1 }).lean<{
    ingestRunId: string;
  }>();
  return latest?.ingestRunId ?? null;
}
