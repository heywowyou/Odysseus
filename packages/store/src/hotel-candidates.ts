/**
 * Read/write helpers around the `hotel_candidates` collection. Callers never
 * issue their own Mongoose operations against it, for the reason
 * hotel-source-records.ts states about its own collection: the retention
 * window, the merge semantics, and the never-erase-provenance rule all live
 * here, and a caller writing directly would have to reimplement all three.
 */

import type { Connection } from 'mongoose';
import type {
  HotelCampaignEligibility,
  HotelCandidate,
  HotelCandidateReviewState,
  HotelGroupStatus,
  HotelIdentityStatus,
  HotelQualificationOutcome,
} from '@odysseus/core';
import {
  createHotelCandidateModel,
  type HotelCandidateDocument,
} from './schemas/hotel-candidate.schema.js';

const HOTEL_CANDIDATE_RETENTION_DAYS = 90;

export type NewHotelCandidateInput = HotelCandidate;

export interface UpsertHotelCandidatesResult {
  created: number;
  updated: number;
}

/** Fields a refresh is allowed to overwrite outright. Everything absent from
 *  this list is either append-only (`sourceRefs`, `conflicts`), identity
 *  (`candidateId`, `identityKey`), or human-owned (`review`). Listing the
 *  overwritable set explicitly, rather than spreading the whole input, is what
 *  stops a later field being silently made destructive by being added to the
 *  contract. */
const REFRESHABLE_FIELDS = [
  'identityStatus',
  'matchedOn',
  'siret',
  'siren',
  'name',
  'normalizedName',
  'address',
  'postcode',
  'commune',
  'accommodationType',
  'starRating',
  'roomCount',
  'capacity',
  'campaignEligibility',
  'websiteCandidates',
  'ownRegistrableDomain',
  'domainProvenance',
  'declaredRegistrableDomain',
  'groupStatus',
  'groupDomain',
  'groupSize',
  // Derived, and the one derived field a re-run is meant to change: the point
  // of re-qualifying is that a dead domain may have come back.
  'qualification',
] as const satisfies ReadonlyArray<keyof HotelCandidate>;

function refreshableSet(input: HotelCandidate): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const field of REFRESHABLE_FIELDS) {
    const value = input[field];
    if (value !== undefined) set[field] = value;
  }
  return set;
}

/**
 * Compare and set, one candidate at a time.
 *
 * `sourceRefs` and `conflicts` are appended with `$addToSet`, never replaced.
 * A candidate merged from three sources must not lose two of them because the
 * fourth run only saw one, and a conflict recorded once is evidence that was
 * set aside - it stays visible until a human resolves it.
 *
 * `review` is never overwritten outright, because a refresh that reset an
 * accepted or rejected candidate back to `pending` would silently discard a
 * human decision and re-queue work that was already done. It moves in one
 * direction only: a second pass promotes `not-required` to `pending` when the
 * refreshed facts have made the candidate reviewable, and touches nothing else.
 * Insert-only was tried first and was wrong - a candidate that develops a
 * conflict on a later run would never have reached the queue at all.
 */
export async function upsertHotelCandidates(
  connection: Connection,
  inputs: NewHotelCandidateInput[],
): Promise<UpsertHotelCandidatesResult> {
  if (inputs.length === 0) return { created: 0, updated: 0 };

  const Model = createHotelCandidateModel(connection);
  // The unique index is the idempotency mechanism, and Mongoose builds indexes
  // in the background after model compilation. Without this the first batch
  // after a fresh connection races the index build - see the same call and the
  // same reasoning in insertHotelSourceRecords.
  await Model.init();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + HOTEL_CANDIDATE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const result = await Model.bulkWrite(
    inputs.map((input) => ({
      updateOne: {
        filter: { resolutionVersion: input.resolutionVersion, identityKey: input.identityKey },
        update: {
          $set: { ...refreshableSet(input), updatedAt: now, expiresAt },
          $setOnInsert: {
            candidateId: input.candidateId,
            resolutionVersion: input.resolutionVersion,
            identityKey: input.identityKey,
            review: input.review,
            createdAt: now,
          },
          $addToSet: {
            sourceRefs: { $each: input.sourceRefs },
            conflicts: { $each: input.conflicts },
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  // Second pass: promote candidates whose refreshed facts made them reviewable.
  // Filtered on `not-required` so a pending item keeps its original reason, and
  // an accepted or rejected decision is never reopened by a data refresh. Only
  // the reviewable inputs are sent, which on the real national export is a low
  // hundreds out of thirteen thousand.
  const promotions = inputs.filter((input) => input.review.state === 'pending');
  if (promotions.length > 0) {
    await Model.bulkWrite(
      promotions.map((input) => ({
        updateOne: {
          filter: {
            resolutionVersion: input.resolutionVersion,
            identityKey: input.identityKey,
            'review.state': 'not-required',
          },
          update: { $set: { review: input.review, updatedAt: now } },
        },
      })),
      { ordered: false },
    );
  }

  return {
    created: result.upsertedCount,
    updated: result.modifiedCount,
  };
}

export interface HotelCandidateFilter {
  resolutionVersion?: string;
  identityStatus?: HotelIdentityStatus;
  groupStatus?: HotelGroupStatus;
  campaignEligibility?: HotelCampaignEligibility;
  reviewState?: HotelCandidateReviewState;
  qualificationOutcome?: HotelQualificationOutcome;
  /** True selects candidates never evaluated, which is a different set from
   *  any single outcome and is what a resumed batch needs to ask for. */
  qualificationMissing?: boolean;
}

export async function listHotelCandidates(
  connection: Connection,
  filter: HotelCandidateFilter = {},
  limit = 200,
): Promise<HotelCandidateDocument[]> {
  const Model = createHotelCandidateModel(connection);
  const query: Record<string, unknown> = {};
  if (filter.resolutionVersion !== undefined) query['resolutionVersion'] = filter.resolutionVersion;
  if (filter.identityStatus !== undefined) query['identityStatus'] = filter.identityStatus;
  if (filter.groupStatus !== undefined) query['groupStatus'] = filter.groupStatus;
  if (filter.campaignEligibility !== undefined) {
    query['campaignEligibility'] = filter.campaignEligibility;
  }
  if (filter.reviewState !== undefined) query['review.state'] = filter.reviewState;
  if (filter.qualificationOutcome !== undefined) {
    query['qualification.outcome'] = filter.qualificationOutcome;
  }
  if (filter.qualificationMissing === true) query['qualification'] = { $exists: false };
  return Model.find(query).sort({ name: 1 }).limit(limit).lean<HotelCandidateDocument[]>();
}

/** The named candidates, in no particular order.
 *
 *  Separate from listHotelCandidates because it answers a different question:
 *  that one filters a population, this one re-reads a set a pass has just
 *  written to. The reconciliation pass uses it so its decision sees what the
 *  catalogue now says rather than a copy it patched in memory. */
export async function getHotelCandidatesByIds(
  connection: Connection,
  candidateIds: readonly string[],
): Promise<HotelCandidateDocument[]> {
  if (candidateIds.length === 0) return [];
  const Model = createHotelCandidateModel(connection);
  return Model.find({ candidateId: { $in: [...candidateIds] } }).lean<HotelCandidateDocument[]>();
}

export interface ListHotelCandidatesForQualificationOptions {
  resolutionVersion: string;
  limit: number;
  /** The last candidateId of the previous page. */
  after?: string;
  /** Skip candidates already carrying a verdict at this version, so an
   *  interrupted batch continues rather than restarting. */
  skipAlreadyQualified: boolean;
  qualificationVersion: string;
}

/**
 * Cursor-paged over `candidateId` rather than skip/limit.
 *
 * A 7,000-domain run takes hours and writes to the same documents it is
 * reading. Under skip/limit, a document acquiring a `qualification` field
 * shifts every later page under the reading cursor, so candidates are silently
 * skipped - the classic pagination-while-mutating bug, and here it would look
 * like a coverage shortfall rather than like a defect. `candidateId` is unique
 * and never rewritten, so a cursor over it is stable against exactly the write
 * this run is performing.
 */
export async function listHotelCandidatesForQualification(
  connection: Connection,
  options: ListHotelCandidatesForQualificationOptions,
): Promise<HotelCandidateDocument[]> {
  const Model = createHotelCandidateModel(connection);
  const query: Record<string, unknown> = { resolutionVersion: options.resolutionVersion };
  if (options.after !== undefined) query['candidateId'] = { $gt: options.after };
  if (options.skipAlreadyQualified) {
    // Not `qualification: {$exists: false}`: a candidate carrying a verdict
    // from an *earlier* version has not been evaluated under this one and must
    // be re-checked, which is the whole point of versioning the rules.
    query['qualification.qualificationVersion'] = { $ne: options.qualificationVersion };
  }
  return Model.find(query)
    .sort({ candidateId: 1 })
    .limit(options.limit)
    .lean<HotelCandidateDocument[]>();
}

export async function getHotelCandidate(
  connection: Connection,
  candidateId: string,
): Promise<HotelCandidateDocument | null> {
  const Model = createHotelCandidateModel(connection);
  return Model.findOne({ candidateId }).lean<HotelCandidateDocument>();
}

/**
 * Current candidate projection for a registrable domain. Candidate generations
 * are versioned side by side, so newest `updatedAt` is the current catalogue
 * belief rather than an arbitrary row from an older resolution run.
 */
export async function getLatestHotelCandidateByOwnRegistrableDomain(
  connection: Connection,
  registrableDomain: string,
): Promise<HotelCandidateDocument | null> {
  const Model = createHotelCandidateModel(connection);
  return Model.findOne({ ownRegistrableDomain: registrableDomain })
    .sort({ updatedAt: -1, candidateId: 1 })
    .lean<HotelCandidateDocument>();
}

export interface HotelCandidateYield {
  total: number;
  byIdentityStatus: Record<HotelIdentityStatus, number>;
  byGroupStatus: Record<HotelGroupStatus, number>;
  byReviewState: Record<HotelCandidateReviewState, number>;
  /** The number this whole milestone is measured on: eligible, independent,
   *  and holding a domain no other establishment holds. */
  campaignReady: number;
  withConflicts: number;
  /** `not-evaluated` counts candidates plan 003 has not looked at yet, kept
   *  distinct from any outcome so a partially finished batch is visible as
   *  partially finished rather than as a poor yield. */
  byQualificationOutcome: Record<HotelQualificationOutcome | 'not-evaluated', number>;
}

/** Computed in the database rather than by streaming documents back: the
 *  catalogue is tens of thousands of rows, the same reason
 *  getHotelSourceYield gives. */
export async function getHotelCandidateYield(
  connection: Connection,
  resolutionVersion: string,
): Promise<HotelCandidateYield> {
  const Model = createHotelCandidateModel(connection);
  const [facets] = await Model.aggregate<{
    identity: Array<{ _id: HotelIdentityStatus; count: number }>;
    group: Array<{ _id: HotelGroupStatus; count: number }>;
    review: Array<{ _id: HotelCandidateReviewState; count: number }>;
    conflicts: Array<{ count: number }>;
    campaignReady: Array<{ count: number }>;
    qualification: Array<{ _id: HotelQualificationOutcome | null; count: number }>;
    total: Array<{ count: number }>;
  }>([
    { $match: { resolutionVersion } },
    {
      $facet: {
        identity: [{ $group: { _id: '$identityStatus', count: { $sum: 1 } } }],
        group: [{ $group: { _id: '$groupStatus', count: { $sum: 1 } } }],
        review: [{ $group: { _id: '$review.state', count: { $sum: 1 } } }],
        conflicts: [{ $match: { 'conflicts.0': { $exists: true } } }, { $count: 'count' }],
        qualification: [
          { $group: { _id: { $ifNull: ['$qualification.outcome', null] }, count: { $sum: 1 } } },
        ],
        campaignReady: [
          {
            $match: {
              campaignEligibility: 'eligible',
              groupStatus: 'independent',
              ownRegistrableDomain: { $exists: true, $ne: null },
            },
          },
          { $count: 'count' },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const byIdentityStatus: Record<HotelIdentityStatus, number> = {
    resolved: 0,
    'needs-review': 0,
    ambiguous: 0,
    unmatched: 0,
  };
  const byGroupStatus: Record<HotelGroupStatus, number> = {
    independent: 0,
    'group-member': 0,
    'vendor-hosted': 0,
    unknown: 0,
  };
  const byReviewState: Record<HotelCandidateReviewState, number> = {
    'not-required': 0,
    pending: 0,
    accepted: 0,
    rejected: 0,
  };
  for (const row of facets?.identity ?? []) byIdentityStatus[row._id] = row.count;
  for (const row of facets?.group ?? []) byGroupStatus[row._id] = row.count;
  for (const row of facets?.review ?? []) byReviewState[row._id] = row.count;
  const byQualificationOutcome: Record<HotelQualificationOutcome | 'not-evaluated', number> = {
    qualified: 0,
    parked: 0,
    rejected: 0,
    'already-engaged': 0,
    'group-routed': 0,
    'not-evaluated': 0,
  };
  for (const row of facets?.qualification ?? []) {
    byQualificationOutcome[row._id ?? 'not-evaluated'] = row.count;
  }

  return {
    total: facets?.total[0]?.count ?? 0,
    byIdentityStatus,
    byGroupStatus,
    byReviewState,
    campaignReady: facets?.campaignReady[0]?.count ?? 0,
    withConflicts: facets?.conflicts[0]?.count ?? 0,
    byQualificationOutcome,
  };
}

export interface RecordHotelCandidateReviewInput {
  candidateId: string;
  decision: 'accepted' | 'rejected';
  actor: string;
  reason: string;
}

export interface RecordHotelCandidateReviewResult {
  /** False when the candidate already carried this exact decision. The review
   *  surface is operated by hand and re-running a command is normal, so a
   *  repeat is reported rather than treated as an error. */
  changed: boolean;
  found: boolean;
}

export async function recordHotelCandidateReview(
  connection: Connection,
  input: RecordHotelCandidateReviewInput,
): Promise<RecordHotelCandidateReviewResult> {
  const Model = createHotelCandidateModel(connection);
  const existing = await Model.findOne({
    candidateId: input.candidateId,
  }).lean<HotelCandidateDocument>();
  if (existing === null) return { changed: false, found: false };
  if (existing.review.state === input.decision && existing.review.actor === input.actor) {
    return { changed: false, found: true };
  }
  await Model.updateOne(
    { candidateId: input.candidateId },
    {
      $set: {
        'review.state': input.decision,
        'review.actor': input.actor,
        'review.reason': input.reason,
        'review.decidedAt': new Date(),
        updatedAt: new Date(),
      },
    },
  );
  return { changed: true, found: true };
}

/** One candidate's redirect verdict, applied to the catalogue.
 *
 * Two shapes rather than one generic update, because they are two different
 * claims about the world and conflating them is exactly the mistake
 * qualification v1 made: `adopt` says this hotel renamed itself and the
 * campaign should follow, `route` says several establishments share this
 * domain so it belongs to somebody's group queue.
 *
 * `identityKey` is deliberately not touched. It addresses the candidate
 * within its resolution version, and rewriting it because a later pass
 * learned a better domain would break every reference already taken against
 * it. The provenance fields carry the new knowledge instead. */
export type RedirectReclassification =
  | {
      kind: 'adopt';
      candidateId: string;
      /** The domain the redirect landed on, which no other establishment
       *  holds. */
      adoptedDomain: string;
      /** What the catalogue declared, kept rather than overwritten. */
      declaredDomain?: string;
    }
  | {
      kind: 'route';
      candidateId: string;
      groupStatus: Extract<HotelGroupStatus, 'group-member' | 'vendor-hosted'>;
      groupDomain: string;
      /** Establishments at the shared domain, the evidence for the routing. */
      groupSize: number;
    };

export async function applyRedirectReclassifications(
  connection: Connection,
  inputs: readonly RedirectReclassification[],
): Promise<{ applied: number }> {
  if (inputs.length === 0) return { applied: 0 };
  const Model = createHotelCandidateModel(connection);
  const now = new Date();

  const result = await Model.bulkWrite(
    inputs.map((input) => ({
      updateOne: {
        filter: { candidateId: input.candidateId },
        update: {
          $set:
            input.kind === 'adopt'
              ? {
                  ownRegistrableDomain: input.adoptedDomain,
                  domainProvenance: 'redirect-adopted',
                  ...(input.declaredDomain === undefined
                    ? {}
                    : { declaredRegistrableDomain: input.declaredDomain }),
                  updatedAt: now,
                }
              : {
                  groupStatus: input.groupStatus,
                  groupDomain: input.groupDomain,
                  groupSize: input.groupSize,
                  updatedAt: now,
                },
        },
      },
    })),
    { ordered: false },
  );

  // matchedCount, not modifiedCount: re-running the pass over a catalogue it
  // already reclassified changed nothing and still applied to every row, which
  // is what makes this command safe to repeat.
  return { applied: result.matchedCount };
}
