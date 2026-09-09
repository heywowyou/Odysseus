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
} from '@odysseus/core';
import { createHotelCandidateModel } from '../schemas/hotel-candidate.schema.js';
import { createHotelQualificationModel } from '../schemas/hotel-qualification.schema.js';
import { createHotelScoreModel } from '../schemas/score.schema.js';
import { createHotelContactModel } from '../schemas/hotel-contact.schema.js';
import { createOutreachThreadModel } from '../schemas/outreach-thread.schema.js';
import { createOutreachOutcomeModel } from '../schemas/outreach-outcome.schema.js';
import { pageBounds, type OperatorViewPage, type OperatorViewPageOptions } from './shared.js';

/** The operator queues, each a named filter over the candidate catalogue.
 *  `join-review` is the manual identity review queue (candidates still
 *  awaiting a human accept or reject); the next three are qualification
 *  outcomes; `groups` covers both shared-web-presence statuses. */
export type OperatorProspectQueue =
  'join-review' | 'parked' | 'rejected' | 'already-engaged' | 'groups';

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
export function buildProspectSearchPattern(search: string): RegExp {
  let source = '';
  for (const char of search.toLowerCase()) {
    const fold = ACCENT_FOLD_CLASSES[char];
    source += fold === undefined ? escapeRegexLiteral(char) : fold;
  }
  return new RegExp(source, 'i');
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
  prescanStatus: HotelPrescanStatus | null;
  scoringVersion: string | null;
  brokennessTotal: number | null;
  abilityTotal: number | null;
  worthy: boolean | null;
  contactState: HotelContactState | null;
  threadState: OutreachThreadState | null;
  outcome: OutreachOutcome | null;
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
  'prescan.status': 1,
};

function buildProspectFilter(options: ListOperatorProspectsOptions): Record<string, unknown> {
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
async function latestScoresForCandidates(
  connection: Connection,
  candidateIds: string[],
): Promise<
  Map<
    string,
    { scoringVersion: string; brokennessTotal: number; abilityTotal: number; worthy: boolean }
  >
> {
  const byCandidate = new Map<
    string,
    { scoringVersion: string; brokennessTotal: number; abilityTotal: number; worthy: boolean }
  >();
  if (candidateIds.length === 0) return byCandidate;

  const rows = await createHotelScoreModel(connection).aggregate<{
    _id: string;
    scoringVersion: string;
    brokennessTotal: number;
    abilityTotal: number;
    worthy: boolean;
  }>([
    { $match: { candidateId: { $in: candidateIds } } },
    { $sort: { candidateId: 1, computedAt: -1 } },
    {
      $group: {
        _id: '$candidateId',
        scoringVersion: { $first: '$scoringVersion' },
        brokennessTotal: { $first: '$brokenness.total' },
        abilityTotal: { $first: '$ability.total' },
        worthy: { $first: '$worthy' },
      },
    },
  ]);
  for (const row of rows) {
    byCandidate.set(row._id, {
      scoringVersion: row.scoringVersion,
      brokennessTotal: row.brokennessTotal,
      abilityTotal: row.abilityTotal,
      worthy: row.worthy,
    });
  }
  return byCandidate;
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

export async function listOperatorProspects(
  connection: Connection,
  options: ListOperatorProspectsOptions,
): Promise<OperatorViewPage<OperatorProspectRow>> {
  const CandidateModel = createHotelCandidateModel(connection);
  const { limit, offset, skip } = pageBounds(options);
  const filter = buildProspectFilter(options);

  const [total, candidates] = await Promise.all([
    CandidateModel.countDocuments(filter),
    CandidateModel.find(filter)
      // candidateId is unique, so the name tiebreaker makes offset windows
      // exact even when two establishments share a name.
      .sort({ name: 1, candidateId: 1 })
      .skip(skip)
      .limit(limit)
      .select(PROSPECT_ROW_PROJECTION)
      .lean<ProspectCandidateRowDoc[]>(),
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
    return {
      candidateId: row.candidateId,
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
      prescanStatus: row.prescan?.status ?? null,
      scoringVersion: score?.scoringVersion ?? null,
      brokennessTotal: score?.brokennessTotal ?? null,
      abilityTotal: score?.abilityTotal ?? null,
      worthy: score?.worthy ?? null,
      contactState: contactsByCandidate.get(row.candidateId) ?? null,
      threadState: threadStates.states.get(row.candidateId) ?? null,
      outcome: outcomePointer === undefined ? null : (outcomesById.get(outcomePointer) ?? null),
    };
  });

  return { rows, total, limit, offset };
}
