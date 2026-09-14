/**
 * Prospect list views: the operator queues over the candidate catalogue,
 * with accent-insensitive search and per-row stage pointers (qualification,
 * score, contact, thread, outcome).
 */

import type { Connection } from 'mongoose';
import type {
  HotelCampaignEligibility,
  HotelCandidateReviewState,
  HotelContactState,
  HotelGroupStatus,
  HotelIdentityStatus,
  HotelPrescanStatus,
  HotelQualificationOutcome,
  HotelQualificationReason,
  OutreachOutcome,
  OutreachThreadState,
  PipelineFreshness,
} from '@odysseus/core';
import { computeFreshness, type ProspectFreshnessVersions } from './freshness.js';
import { createHotelCandidateModel } from '../schemas/hotel-candidate.schema.js';
import { createHotelQualificationModel } from '../schemas/hotel-qualification.schema.js';
import { createHotelScoreModel } from '../schemas/score.schema.js';
import { createHotelContactModel } from '../schemas/hotel-contact.schema.js';
import { createOutreachThreadModel } from '../schemas/outreach-thread.schema.js';
import { createOutreachOutcomeModel } from '../schemas/outreach-outcome.schema.js';
import { pageBounds, type OperatorViewPage, type OperatorViewPageOptions } from './shared.js';
import { getSelectionProjection } from './selection-projection.js';
import type { SelectionCohortFacts, SelectionSource } from './selection-projection.js';

/** The operator queues, each a named filter over the candidate catalogue.
 *  `join-review` is the manual identity review queue (candidates still
 *  awaiting a human accept or reject); the next three are qualification
 *  outcomes; `groups` covers both shared-web-presence statuses. */
export type OperatorProspectQueue =
  'join-review' | 'parked' | 'rejected' | 'already-engaged' | 'groups';

/** Issue #215: the two score-derived sort keys the list can order by. Kept
 *  as a closed allow-list (not an arbitrary field name) so a route can
 *  reject anything else before it ever reaches the query layer. */
export type ProspectSortField = 'brokenness' | 'fixability';
export type ProspectSortDirection = 'asc' | 'desc';

export interface ListOperatorProspectsOptions extends OperatorViewPageOptions {
  resolutionVersion?: string;
  queue?: OperatorProspectQueue;
  identityStatus?: HotelIdentityStatus;
  groupStatus?: HotelGroupStatus;
  campaignEligibility?: HotelCampaignEligibility;
  reviewState?: HotelCandidateReviewState;
  /** `not-evaluated` selects candidates no qualification generation has
   *  reached, which is a different set from any single outcome. */
  qualificationOutcome?: HotelQualificationOutcome | 'not-evaluated';
  /** Free-text search over the list's visible identity fields (name,
   *  commune, postcode) plus the candidate id. Blank means off. */
  search?: string;
  /** Plan 041 slice B1: true keeps only the hotels a record puts in the
   *  current wave, false keeps only the rest. Absent means the whole
   *  catalogue, which is what every existing caller gets. */
  inSelection?: boolean;
  /** Issue #215: sort the page by the candidate's latest brokenness or
   *  ability (fixability) score instead of the default name order. Absent
   *  keeps the existing `find().sort().skip().limit()` path unchanged;
   *  present switches to an aggregation that joins the latest score before
   *  paging, since sorting on a field paging currently only attaches after
   *  the page is chosen is otherwise impossible. Direction defaults to
   *  descending (most broken / most fixable first) when sortBy is set but
   *  sortDirection is not. */
  sortBy?: ProspectSortField;
  sortDirection?: ProspectSortDirection;
}

/** One row per fold family: the base letter plus its accented variants.
 *  Every member expands to the same character class, so a query typed with
 *  or without the accent finds both stored forms, whichever direction the
 *  catalogue recorded. Case is left to the pattern's `i` flag. */
const ACCENT_FOLD_FAMILIES: readonly (readonly [string, string])[] = [
  ['a', 'àâä'],
  ['e', 'éèêë'],
  ['i', 'îï'],
  ['o', 'ôö'],
  ['u', 'ùûü'],
  ['c', 'ç'],
  ['y', 'ÿ'],
];

const ACCENT_FOLD_CLASSES: Record<string, string> = {};
for (const [base, variants] of ACCENT_FOLD_FAMILIES) {
  for (const char of base + variants) {
    ACCENT_FOLD_CLASSES[char] = `[${base}${variants}]`;
  }
}

function escapeRegexLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The class content comes only from the fixed table above, so its
 *  characters never need in-class escaping. */
function buildProspectSearchPattern(search: string): RegExp {
  let source = '';
  for (const char of search.toLowerCase()) {
    const fold = ACCENT_FOLD_CLASSES[char];
    source += fold === undefined ? escapeRegexLiteral(char) : fold;
  }
  return new RegExp(source, 'i');
}

export interface OperatorProspectListPage extends OperatorViewPage<OperatorProspectRow> {
  /** The newest approved cohort's own facts, so the list's copy can quote
   *  the population size and cutoffs without a second request. Null when
   *  no cohort has ever been approved. */
  selection: SelectionCohortFacts | null;
  selectedCount: number;
  /** The whole catalogue's size at this resolution generation, ignoring
   *  every filter including this page's own `total` (which is filtered).
   *  Plan 041 slice B1: the count line states this so a filtered list
   *  never hides how large the catalogue actually is. */
  catalogueTotal: number;
}

export interface OperatorProspectRow {
  candidateId: string;
  name: string;
  commune: string | null;
  postcode: string | null;
  starRating: number | null;
  identityStatus: HotelIdentityStatus;
  groupStatus: HotelGroupStatus;
  campaignEligibility: HotelCampaignEligibility;
  reviewState: HotelCandidateReviewState;
  qualificationOutcome: HotelQualificationOutcome | 'not-evaluated';
  qualificationReasons: HotelQualificationReason[];
  /** Issue #217: whether the qualification pointer names the pipeline's
   *  current qualification generation, agreeing with the same field on the
   *  detail view. */
  qualificationFreshness: PipelineFreshness;
  prescanStatus: HotelPrescanStatus | null;
  scoringVersion: string | null;
  /** Same distinction as qualificationFreshness, for the latest score -
   *  also stale when the prescan generation the score was derived from is,
   *  so a sort or filter on the score never treats stale evidence as
   *  current. */
  scoreFreshness: PipelineFreshness;
  brokennessTotal: number | null;
  abilityTotal: number | null;
  worthy: boolean | null;
  contactState: HotelContactState | null;
  threadState: OutreachThreadState | null;
  outcome: OutreachOutcome | null;
  /** Plan 041 slice B1: whether a record puts this hotel in the current
   *  wave. Membership, not permission - the scan gate still decides, and
   *  suppression never flips this flag. */
  inSelection: boolean;
  selectionSource: SelectionSource | null;
  selectionRank: number | null;
}

interface ProspectCandidateRowDoc {
  candidateId: string;
  name: string;
  commune?: string;
  postcode?: string;
  starRating?: number;
  identityStatus: HotelIdentityStatus;
  groupStatus: HotelGroupStatus;
  campaignEligibility: HotelCampaignEligibility;
  review: { state: HotelCandidateReviewState };
  qualification?: {
    outcome: HotelQualificationOutcome;
    qualificationVersion: string;
    evaluatedAt: Date;
  };
  prescan?: { status: HotelPrescanStatus };
}

/** Shared by both freshness-aware list functions: turns one candidate row's
 *  qualification pointer into a PipelineFreshness against the caller's
 *  current version. */
function qualificationFreshnessOf(
  row: Pick<ProspectCandidateRowDoc, 'qualification'>,
  versions: ProspectFreshnessVersions,
): PipelineFreshness {
  return computeFreshness({
    version: row.qualification?.qualificationVersion,
    computedAt: row.qualification?.evaluatedAt,
    currentVersion: versions.qualificationVersion,
  });
}

/** Explicit pick, never a whole document: the catalogue holds a street
 *  address and per-source raw website strings the list has no use for. */
const PROSPECT_ROW_PROJECTION: Record<string, number> = {
  _id: 0,
  candidateId: 1,
  name: 1,
  commune: 1,
  postcode: 1,
  starRating: 1,
  identityStatus: 1,
  groupStatus: 1,
  campaignEligibility: 1,
  'review.state': 1,
  'qualification.outcome': 1,
  'qualification.qualificationVersion': 1,
  'qualification.evaluatedAt': 1,
  'prescan.status': 1,
};

function buildProspectFilter(
  options: ListOperatorProspectsOptions,
  selectionCandidateIds?: string[],
): Record<string, unknown> {
  const constraints: Record<string, unknown>[] = [];
  if (options.resolutionVersion !== undefined) {
    constraints.push({ resolutionVersion: options.resolutionVersion });
  }
  if (options.identityStatus !== undefined)
    constraints.push({ identityStatus: options.identityStatus });
  if (options.groupStatus !== undefined) constraints.push({ groupStatus: options.groupStatus });
  if (options.campaignEligibility !== undefined) {
    constraints.push({ campaignEligibility: options.campaignEligibility });
  }
  if (options.reviewState !== undefined) constraints.push({ 'review.state': options.reviewState });
  if (options.qualificationOutcome !== undefined) {
    constraints.push(
      options.qualificationOutcome === 'not-evaluated'
        ? { qualification: { $exists: false } }
        : { 'qualification.outcome': options.qualificationOutcome },
    );
  }
  if (options.search !== undefined && options.search.trim() !== '') {
    const pattern = buildProspectSearchPattern(options.search.trim());
    constraints.push({
      $or: [
        { name: pattern },
        { commune: pattern },
        { postcode: pattern },
        { candidateId: pattern },
      ],
    });
  }
  if (options.inSelection !== undefined && selectionCandidateIds !== undefined) {
    constraints.push(
      options.inSelection
        ? { candidateId: { $in: selectionCandidateIds } }
        : { candidateId: { $nin: selectionCandidateIds } },
    );
  }
  switch (options.queue) {
    case 'join-review':
      constraints.push({ 'review.state': 'pending' });
      break;
    case 'parked':
      constraints.push({ 'qualification.outcome': 'parked' });
      break;
    case 'rejected':
      constraints.push({ 'qualification.outcome': 'rejected' });
      break;
    case 'already-engaged':
      constraints.push({ 'qualification.outcome': 'already-engaged' });
      break;
    case 'groups':
      constraints.push({ groupStatus: { $in: ['group-member', 'vendor-hosted'] } });
      break;
    case undefined:
      break;
  }
  if (constraints.length === 0) return {};
  if (constraints.length === 1) return constraints[0] ?? {};
  return { $and: constraints };
}

/** Reason codes for one page's qualification pointers, in one query. The
 *  pointer on a candidate carries the outcome but not the reasons; the
 *  immutable qualification generation holds them. */
async function qualificationReasonsForCandidates(
  connection: Connection,
  candidates: ProspectCandidateRowDoc[],
): Promise<Map<string, HotelQualificationReason[]>> {
  const pointers: { candidateId: string; qualificationVersion: string }[] = [];
  for (const row of candidates) {
    if (row.qualification === undefined) continue;
    pointers.push({
      candidateId: row.candidateId,
      qualificationVersion: row.qualification.qualificationVersion,
    });
  }
  const byKey = new Map<string, HotelQualificationReason[]>();
  if (pointers.length === 0) return byKey;

  const rows = await createHotelQualificationModel(connection)
    .find({
      candidateId: { $in: [...new Set(pointers.map((p) => p.candidateId))] },
      qualificationVersion: { $in: [...new Set(pointers.map((p) => p.qualificationVersion))] },
    })
    .select({ candidateId: 1, qualificationVersion: 1, reasons: 1, _id: 0 })
    .lean<{ candidateId: string; qualificationVersion: string; reasons: string[] }[]>();
  for (const row of rows) {
    byKey.set(
      `${row.qualificationVersion}:${row.candidateId}`,
      row.reasons as HotelQualificationReason[],
    );
  }
  return byKey;
}

/** Latest score per candidate for one page, computed in the database. The
 *  scores collection is insert-only, so "latest" is a group-after-sort, the
 *  same shape listLatestHotelScores uses, bounded to this page's ids rather
 *  than run over a whole scoring version. */
interface LatestScoreRow {
  scoringVersion: string;
  prescanVersion: string;
  computedAt: Date;
  brokennessTotal: number;
  abilityTotal: number;
  worthy: boolean;
}

async function latestScoresForCandidates(
  connection: Connection,
  candidateIds: string[],
): Promise<Map<string, LatestScoreRow>> {
  const byCandidate = new Map<string, LatestScoreRow>();
  if (candidateIds.length === 0) return byCandidate;

  const rows = await createHotelScoreModel(connection).aggregate<{ _id: string } & LatestScoreRow>([
    { $match: { candidateId: { $in: candidateIds } } },
    { $sort: { candidateId: 1, computedAt: -1 } },
    {
      $group: {
        _id: '$candidateId',
        scoringVersion: { $first: '$scoringVersion' },
        prescanVersion: { $first: '$prescanVersion' },
        computedAt: { $first: '$computedAt' },
        brokennessTotal: { $first: '$brokenness.total' },
        abilityTotal: { $first: '$ability.total' },
        worthy: { $first: '$worthy' },
      },
    },
  ]);
  for (const row of rows) {
    byCandidate.set(row._id, {
      scoringVersion: row.scoringVersion,
      prescanVersion: row.prescanVersion,
      computedAt: row.computedAt,
      brokennessTotal: row.brokennessTotal,
      abilityTotal: row.abilityTotal,
      worthy: row.worthy,
    });
  }
  return byCandidate;
}

/** Same rule as prospect-detail.ts's scoreFreshness: current only when both
 *  the score's own scoringVersion and the prescan generation it was derived
 *  from are current. */
function scoreFreshnessOf(
  score: LatestScoreRow | undefined,
  versions: ProspectFreshnessVersions,
): PipelineFreshness {
  if (score !== undefined && score.prescanVersion !== versions.prescanVersion) {
    return {
      state: 'stale',
      version: score.scoringVersion,
      currentVersion: versions.scoringVersion,
      computedAt: score.computedAt,
    };
  }
  return computeFreshness({
    version: score?.scoringVersion,
    computedAt: score?.computedAt,
    currentVersion: versions.scoringVersion,
  });
}

async function latestContactStatesForCandidates(
  connection: Connection,
  candidateIds: string[],
): Promise<Map<string, HotelContactState>> {
  const byCandidate = new Map<string, HotelContactState>();
  if (candidateIds.length === 0) return byCandidate;
  // Sorted newest first, then reduced in memory: a candidate carries one row
  // per contact version, a handful at most, so the page stays bounded without
  // a per-candidate group stage.
  const rows = await createHotelContactModel(connection)
    .find({ candidateId: { $in: candidateIds } })
    .sort({ validatedAt: -1, contactId: 1 })
    .select({ candidateId: 1, state: 1, _id: 0 })
    .lean<{ candidateId: string; state: HotelContactState }[]>();
  for (const row of rows) {
    if (!byCandidate.has(row.candidateId)) byCandidate.set(row.candidateId, row.state);
  }
  return byCandidate;
}

async function threadStatesForCandidates(
  connection: Connection,
  candidateIds: string[],
): Promise<{
  states: Map<string, OutreachThreadState>;
  outcomePointers: Map<string, string>;
}> {
  const states = new Map<string, OutreachThreadState>();
  const outcomePointers = new Map<string, string>();
  if (candidateIds.length === 0) return { states, outcomePointers };
  // One thread per candidate is a database constraint
  // (outreach-thread.schema.ts), so no reduction is needed.
  const rows = await createOutreachThreadModel(connection)
    .find({ candidateId: { $in: candidateIds } })
    .select({ candidateId: 1, state: 1, currentOutcome: 1, _id: 0 })
    .lean<{ candidateId: string; state: OutreachThreadState; currentOutcome?: string }[]>();
  for (const row of rows) {
    states.set(row.candidateId, row.state);
    if (row.currentOutcome !== undefined) outcomePointers.set(row.candidateId, row.currentOutcome);
  }
  return { states, outcomePointers };
}

/** Issue #215: the field inside a `hotel_scores` document that a given sort
 *  key reads. */
function scoreFieldFor(sortBy: ProspectSortField): string {
  return sortBy === 'brokenness' ? 'brokenness.total' : 'ability.total';
}

/** The score-sorted page of candidates: unlike the default path, the latest
 *  score has to be joined *before* `$sort`/`$skip`/`$limit` run, since the
 *  sort key lives in a separate collection that the default path only joins
 *  once the page is already chosen. `hasScore` sorts first (descending) so
 *  an unscored candidate always lands after every scored one, in either
 *  direction; `name`/`candidateId` remain the tiebreaker so offset windows
 *  stay stable, matching the default path's own tiebreaker. The final
 *  `$project` narrows back down to exactly `PROSPECT_ROW_PROJECTION`'s
 *  fields, so the result satisfies the same `ProspectCandidateRowDoc[]`
 *  shape the rest of the function consumes either way. */
async function sortedProspectCandidates(
  connection: Connection,
  filter: Record<string, unknown>,
  sortBy: ProspectSortField,
  sortDirection: ProspectSortDirection | undefined,
  skip: number,
  limit: number,
): Promise<ProspectCandidateRowDoc[]> {
  const scoreField = scoreFieldFor(sortBy);
  const direction = sortDirection === 'asc' ? 1 : -1;

  return createHotelCandidateModel(connection).aggregate<ProspectCandidateRowDoc>([
    { $match: filter },
    {
      $lookup: {
        from: 'hotel_scores',
        let: { candidateId: '$candidateId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$candidateId', '$$candidateId'] } } },
          { $sort: { computedAt: -1 } },
          { $limit: 1 },
          { $project: { _id: 0, value: `$${scoreField}` } },
        ],
        as: 'latestScore',
      },
    },
    {
      $addFields: {
        hasScore: { $gt: [{ $size: '$latestScore' }, 0] },
        sortScore: { $arrayElemAt: ['$latestScore.value', 0] },
      },
    },
    { $sort: { hasScore: -1, sortScore: direction, name: 1, candidateId: 1 } },
    { $skip: skip },
    { $limit: limit },
    { $project: PROSPECT_ROW_PROJECTION },
  ]);
}

export async function listOperatorProspects(
  connection: Connection,
  options: ListOperatorProspectsOptions,
  versions: ProspectFreshnessVersions,
): Promise<OperatorProspectListPage> {
  const CandidateModel = createHotelCandidateModel(connection);
  const { limit, offset, skip } = pageBounds(options);

  // Computed unconditionally: even a request with no selection filter needs
  // it to stamp the per-row inSelection fact and the page-level cohort
  // facts. The cohort collection is small and TTL-bounded (a handful of
  // documents), so this stays one cheap read added to the page's fan-out.
  const selection = await getSelectionProjection(connection);
  const filter = buildProspectFilter(options, [...selection.members.keys()]);
  // The whole catalogue's size at this resolution generation, ignoring
  // every UI filter including the selection one: the list's count line
  // states this number so it is never merely discovered by paging.
  const catalogueFilter =
    options.resolutionVersion === undefined ? {} : { resolutionVersion: options.resolutionVersion };

  const [total, catalogueTotal, candidates] = await Promise.all([
    CandidateModel.countDocuments(filter),
    CandidateModel.countDocuments(catalogueFilter),
    options.sortBy === undefined
      ? CandidateModel.find(filter)
          // candidateId is unique, so the name tiebreaker makes offset
          // windows exact even when two establishments share a name.
          .sort({ name: 1, candidateId: 1 })
          .skip(skip)
          .limit(limit)
          .select(PROSPECT_ROW_PROJECTION)
          .lean<ProspectCandidateRowDoc[]>()
      : sortedProspectCandidates(
          connection,
          filter,
          options.sortBy,
          options.sortDirection,
          skip,
          limit,
        ),
  ]);

  const candidateIds = candidates.map((row) => row.candidateId);
  const [reasonsByCandidate, scoresByCandidate, contactsByCandidate, threadStates] =
    await Promise.all([
      qualificationReasonsForCandidates(connection, candidates),
      latestScoresForCandidates(connection, candidateIds),
      latestContactStatesForCandidates(connection, candidateIds),
      threadStatesForCandidates(connection, candidateIds),
    ]);

  const outcomeIds = [...new Set(threadStates.outcomePointers.values())];
  const outcomesById = new Map<string, OutreachOutcome>();
  if (outcomeIds.length > 0) {
    const outcomeRows = await createOutreachOutcomeModel(connection)
      .find({ outcomeId: { $in: outcomeIds } })
      .select({ outcomeId: 1, outcome: 1, _id: 0 })
      .lean<{ outcomeId: string; outcome: OutreachOutcome }[]>();
    for (const row of outcomeRows) outcomesById.set(row.outcomeId, row.outcome);
  }

  const rows: OperatorProspectRow[] = candidates.map((row) => {
    const score = scoresByCandidate.get(row.candidateId);
    const outcomePointer = threadStates.outcomePointers.get(row.candidateId);
    const selectionMember = selection.members.get(row.candidateId);
    return {
      candidateId: row.candidateId,
      inSelection: selectionMember !== undefined,
      selectionSource: selectionMember?.source ?? null,
      selectionRank: selectionMember?.rank ?? null,
      name: row.name,
      commune: row.commune ?? null,
      postcode: row.postcode ?? null,
      starRating: row.starRating ?? null,
      identityStatus: row.identityStatus,
      groupStatus: row.groupStatus,
      campaignEligibility: row.campaignEligibility,
      reviewState: row.review.state,
      qualificationOutcome: row.qualification?.outcome ?? 'not-evaluated',
      qualificationReasons:
        row.qualification === undefined
          ? []
          : (reasonsByCandidate.get(
              `${row.qualification.qualificationVersion}:${row.candidateId}`,
            ) ?? []),
      qualificationFreshness: qualificationFreshnessOf(row, versions),
      prescanStatus: row.prescan?.status ?? null,
      scoringVersion: score?.scoringVersion ?? null,
      scoreFreshness: scoreFreshnessOf(score, versions),
      brokennessTotal: score?.brokennessTotal ?? null,
      abilityTotal: score?.abilityTotal ?? null,
      worthy: score?.worthy ?? null,
      contactState: contactsByCandidate.get(row.candidateId) ?? null,
      threadState: threadStates.states.get(row.candidateId) ?? null,
      outcome: outcomePointer === undefined ? null : (outcomesById.get(outcomePointer) ?? null),
    };
  });

  return {
    rows,
    total,
    limit,
    offset,
    selection: selection.cohort,
    selectedCount: selection.members.size,
    catalogueTotal,
  };
}
