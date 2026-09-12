/**
 * Read/write helpers around the `prescans` collection, and the one place
 * that keeps the candidate's denormalized `prescan` pointer in step with it.
 * Callers never issue their own operations against either, for the reason
 * hotel-qualifications.ts gives about its own: the retention window and the
 * two-write invariant live here, and a caller writing directly would have to
 * reimplement both.
 *
 * The two writes are deliberately not a transaction, and deliberately
 * ordered evidence-first, exactly as recordHotelQualifications explains: if
 * the pointer write fails, the measurements still exist and the next run
 * repairs the pointer. The opposite order would let selection believe a
 * candidate had been prescanned when its evidence was never stored.
 *
 * ## Why this does not emit a `prospects` event
 *
 * `hotel-qualification.schema.ts` records the expectation that plan 004
 * would emit into `prospects`, since by this stage a `scanJobId` genuinely
 * exists and that was the one field blocking it at plan 003. Reading the
 * collection it would emit into, that is no longer the right call, and the
 * reason is the same principle plan 003 acted on rather than a reversal of
 * it.
 *
 * `prospects` is the milestone 9a AFNIC funnel's event log, and its shape
 * says so: `dataOrigin.domainSource` is enumerated to `afnic-fichier-a`,
 * `companyDataSource` to `sirene-stock`, and `siren`, `denomination`, and
 * `naf` are all required. A hotel candidate has none of those guaranteed.
 * The Atout France catalogue carries no SIREN at all, and plan 003 measured
 * 2,437 hotels publishing no identification on their own site either, so the
 * company identity a prospect document requires is genuinely absent for a
 * large minority of this population.
 *
 * Emitting anyway would mean either widening those enums and relaxing those
 * required fields - leaving one collection meaning two different things
 * depending on which fields happen to be present, the exact ambiguity plan
 * 003 declined to create - or fabricating provenance for data no source
 * supplied. The hotel funnel already has its own three collections, and this
 * is the third. Wiring the two funnels together is a real decision, and it
 * belongs to whoever needs a single view across both, with the shape that
 * question actually calls for.
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import {
  hotelPrescanEvidenceSchema,
  type HotelEvidenceStatus,
  type HotelPrescan,
  type HotelPrescanStatus,
} from '@odysseus/core';
import { createPrescanModel, type PrescanDocument } from './schemas/prescan.schema.js';
import {
  createHotelCandidateModel,
  type HotelCandidateDocument,
} from './schemas/hotel-candidate.schema.js';

const PRESCAN_RETENTION_DAYS = 90;

export type RecordPrescanInput = Omit<HotelPrescan, 'prescanId'>;

export interface RecordPrescanResult {
  prescanId: string;
  /** False when the prescan names a candidate that no longer exists, which
   *  means the catalogue was re-resolved underneath a running batch. Worth
   *  surfacing rather than swallowing. */
  pointerWritten: boolean;
}

export async function recordPrescan(
  connection: Connection,
  input: RecordPrescanInput,
): Promise<RecordPrescanResult> {
  if (input.prescanVersion === 'v2' && input.evidence === undefined) {
    throw new Error('Prescan v2 requires an evidence object');
  }
  if (input.evidence !== undefined) hotelPrescanEvidenceSchema.parse(input.evidence);
  const PrescanModel = createPrescanModel(connection);
  await PrescanModel.init();

  const createdAt = new Date();
  const prescanId = randomUUID();
  const document: PrescanDocument = {
    ...input,
    prescanId,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + PRESCAN_RETENTION_DAYS * 24 * 60 * 60 * 1000),
  };

  await PrescanModel.create(document);

  const CandidateModel = createHotelCandidateModel(connection);
  const update = await CandidateModel.updateOne(
    { candidateId: input.candidateId },
    {
      $set: {
        prescan: {
          prescanId,
          prescanVersion: input.prescanVersion,
          status: input.status,
          prescannedAt: input.startedAt,
        },
        updatedAt: new Date(),
      },
    },
  );

  return { prescanId, pointerWritten: update.matchedCount > 0 };
}

export async function getPrescan(
  connection: Connection,
  prescanId: string,
): Promise<PrescanDocument | null> {
  return createPrescanModel(connection).findOne({ prescanId }).lean<PrescanDocument>();
}

/** The most recent prescan of one candidate at one version, which is what
 *  the job's default skip is decided on. */
export async function getLatestPrescan(
  connection: Connection,
  candidateId: string,
  prescanVersion: string,
): Promise<PrescanDocument | null> {
  return createPrescanModel(connection)
    .findOne({ candidateId, prescanVersion })
    .sort({ startedAt: -1 })
    .lean<PrescanDocument>();
}

export interface ListCandidatesToPrescanOptions {
  resolutionVersion: string;
  qualificationVersion: string;
  limit: number;
  /** The last candidateId of the previous page, which is what makes a run
   *  over thousands of hotels resumable without holding the list in memory.
   *  The same cursor shape listCandidatesToQualify uses. */
  after?: string;
  /** Skip candidates already carrying a prescan at this version. False is
   *  `--rescan`: deliberately measure again. */
  skipAlreadyPrescanned: boolean;
  prescanVersion: string;
  /** One named registrable domain, when the batch is a single authorized
   *  site rather than a slice of the population. Without it the listing is
   *  ordered by `candidateId`, so a one-candidate batch would point a
   *  browser at whichever hotel sorts first - not at the one somebody
   *  actually authorized. */
  domain?: string;
  /** The fixed candidate list for a limit-bound queued job. It is captured
   *  before the browser work starts so recovery cannot select a new site. */
  candidateIds?: string[];
}

/**
 * The qualified, campaign-eligible candidates of one resolution run that
 * still hold their own domain.
 *
 * `qualification.outcome: 'qualified'` already implies the star gate and the
 * own-domain requirement, since plan 003 cannot return `qualified` without
 * both. They are re-stated in the filter anyway: this query decides which
 * live sites a browser is pointed at, and a caller reading it should be able
 * to see the campaign gate being applied rather than have to know that
 * another package's decision function enforces it.
 */
export async function listCandidatesToPrescan(
  connection: Connection,
  options: ListCandidatesToPrescanOptions,
): Promise<HotelCandidateDocument[]> {
  const CandidateModel = createHotelCandidateModel(connection);

  const filter: Record<string, unknown> = {
    resolutionVersion: options.resolutionVersion,
    'qualification.outcome': 'qualified',
    'qualification.qualificationVersion': options.qualificationVersion,
    campaignEligibility: 'eligible',
    ownRegistrableDomain: { $exists: true, $ne: null },
  };
  if (options.domain !== undefined) filter['ownRegistrableDomain'] = options.domain;
  const candidateIdFilter: Record<string, string | string[]> = {};
  if (options.candidateIds !== undefined) candidateIdFilter.$in = options.candidateIds;
  if (options.after !== undefined) candidateIdFilter.$gt = options.after;
  if (Object.keys(candidateIdFilter).length > 0) filter['candidateId'] = candidateIdFilter;
  if (options.skipAlreadyPrescanned) {
    filter['prescan.prescanVersion'] = { $ne: options.prescanVersion };
  }

  return CandidateModel.find(filter)
    .sort({ candidateId: 1 })
    .limit(options.limit)
    .lean<HotelCandidateDocument[]>();
}

export interface PrescanRunSummary {
  prescanVersion: string;
  byStatus: Record<HotelPrescanStatus, number>;
  total: number;
  byEvidenceStatus: Record<HotelEvidenceStatus | 'missing', number>;
}

/** Counts by outcome for one prescan version, for the CLI report. */
export async function getPrescanSummary(
  connection: Connection,
  prescanVersion: string,
): Promise<PrescanRunSummary> {
  const PrescanModel = createPrescanModel(connection);
  const rows = await PrescanModel.aggregate<{ _id: HotelPrescanStatus; count: number }>([
    { $match: { prescanVersion } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const byStatus: Record<HotelPrescanStatus, number> = {
    complete: 0,
    'blocked-by-robots': 0,
    'homepage-unreachable': 0,
    'homepage-interstitial-unresolved': 0,
  };
  let total = 0;
  for (const row of rows) {
    if (row._id in byStatus) byStatus[row._id] = row.count;
    total += row.count;
  }

  const evidenceRows = await PrescanModel.aggregate<{
    _id: HotelEvidenceStatus | null;
    count: number;
  }>([
    { $match: { prescanVersion } },
    { $group: { _id: { $ifNull: ['$evidence.status', null] }, count: { $sum: 1 } } },
  ]);
  const byEvidenceStatus: Record<HotelEvidenceStatus | 'missing', number> = {
    complete: 0,
    incomplete: 0,
    missing: 0,
  };
  for (const row of evidenceRows) {
    if (row._id === 'complete' || row._id === 'incomplete') byEvidenceStatus[row._id] = row.count;
    else byEvidenceStatus.missing += row.count;
  }

  return { prescanVersion, byStatus, byEvidenceStatus, total };
}

export interface PrescanVendorFingerprint {
  value: string;
  hotels: number;
}

export interface PrescanVendorAggregate {
  prescanVersion: string;
  /** Hotels contributing to the counts below. */
  prescansRead: number;
  minimumGroupSize: number;
  /** Off-site booking destinations, by registrable host, and the booking
   *  mechanisms seen on the page. An operator signal about how this market
   *  builds its funnels; it is not a vendor outreach list. */
  bookingHosts: PrescanVendorFingerprint[];
  bookingMechanisms: PrescanVendorFingerprint[];
  /** Accessibility rules recurring across the population. */
  failureRules: PrescanVendorFingerprint[];
}

/**
 * What recurs across a prescanned population, counted per hotel rather than
 * per occurrence.
 *
 * Anything appearing on fewer than `minimumGroupSize` hotels is dropped rather
 * than listed: a fingerprint seen once is a fact about one identifiable
 * business, and the question this answers - which engines and which failures
 * recur in this market - is only meaningful in aggregate. Plan 006 keeps this
 * as an operator signal, explicitly not a vendor outreach campaign.
 */
export async function getPrescanVendorAggregate(
  connection: Connection,
  prescanVersion: string,
  minimumGroupSize = 5,
): Promise<PrescanVendorAggregate> {
  const rows = await createPrescanModel(connection)
    .find({ prescanVersion })
    .select({ offsiteBookingLinks: 1, pages: 1 })
    .lean<{ offsiteBookingLinks: string[]; pages: HotelPrescan['pages'] }[]>();

  const bookingHosts = new Map<string, number>();
  const bookingMechanisms = new Map<string, number>();
  const failureRules = new Map<string, number>();

  const bump = (counter: Map<string, number>, values: Iterable<string>): void => {
    for (const value of new Set(values)) counter.set(value, (counter.get(value) ?? 0) + 1);
  };

  for (const row of rows) {
    bump(
      bookingHosts,
      row.offsiteBookingLinks.flatMap((link) => {
        try {
          return [new URL(link).hostname];
        } catch {
          return [];
        }
      }),
    );
    bump(
      bookingMechanisms,
      row.pages.flatMap((page) => page.bookingEvidenceKinds ?? []),
    );
    bump(
      failureRules,
      row.pages.flatMap((page) => page.axe?.ruleIds ?? []),
    );
  }

  const toList = (counter: Map<string, number>): PrescanVendorFingerprint[] =>
    [...counter.entries()]
      .filter(([, hotels]) => hotels >= minimumGroupSize)
      .map(([value, hotels]) => ({ value, hotels }))
      .sort((a, b) => b.hotels - a.hotels || (a.value < b.value ? -1 : 1));

  return {
    prescanVersion,
    prescansRead: rows.length,
    minimumGroupSize,
    bookingHosts: toList(bookingHosts),
    bookingMechanisms: toList(bookingMechanisms),
    failureRules: toList(failureRules),
  };
}
