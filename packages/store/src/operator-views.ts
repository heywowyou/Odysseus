/**
 * Bounded, operator-safe view projections for the prospecting funnel,
 * milestone 9c plan 013 step 1.
 *
 * This module composes the existing collection helpers into the shapes the
 * operator interface renders. It adds no new collection and no write path:
 * routes call these helpers and never need a raw Mongoose query, for the
 * reason every sibling module gives about its own collection.
 *
 * Two constraints bind every function here.
 *
 * First, each returned shape is an explicitly picked projection, never a raw
 * document. Nothing may carry a message body or subject, an email address or
 * role address, a contact address material (`address`, `localPart`,
 * `sourceUrl`), a suppression or preview token hash, or a raw payload such as
 * a qualification's `siteFacts`. State is expressed as ids, enum states,
 * counts, booleans, and dates. The point is not that operators are untrusted;
 * it is that a view which cannot hold the data cannot leak it by accident
 * when a new field is rendered.
 *
 * Second, pagination is mandatory on every list function. A caller cannot ask
 * for "all": every list takes a `{ limit, offset }` options object, defaults
 * to 50 rows, clamps the limit at 200, and sorts with a unique tiebreaker so
 * repeated calls and offset windows never repeat or skip a row. The funnel
 * holds tens of thousands of candidates; a response that grew with the
 * catalogue would be the one unbounded query in the interface.
 */

import type { Connection } from 'mongoose';
import type {
  ContactSourceKind,
  HotelAbilityComponentId,
  HotelBrokennessComponentId,
  HotelCampaignEligibility,
  HotelCandidateReviewState,
  HotelContactState,
  HotelEvidenceAsset,
  HotelEvidenceBilingualText,
  HotelEvidenceOmissionReason,
  HotelEvidenceSelectionReason,
  HotelGroupStatus,
  HotelIdentityStatus,
  HotelPrescanPageRole,
  HotelPrescanRoleAbsence,
  HotelPrescanStatus,
  HotelQualificationOutcome,
  HotelQualificationReason,
  HotelScoreReason,
  MailDomainStatus,
  OutreachEvidenceSlot,
  OutreachLostReason,
  OutreachOutcome,
  OutreachThreadState,
  Severity,
} from '@odysseus/core';
import { createHotelCandidateModel } from './schemas/hotel-candidate.schema.js';
import { createHotelQualificationModel } from './schemas/hotel-qualification.schema.js';
import { createPrescanModel, type PrescanDocument } from './schemas/prescan.schema.js';
import { createHotelScoreModel, type HotelScoreDocument } from './schemas/score.schema.js';
import {
  createHotelContactModel,
  type HotelContactDocument,
} from './schemas/hotel-contact.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { createOutreachDraftModel } from './schemas/outreach-draft.schema.js';
import { createOutreachOutcomeModel } from './schemas/outreach-outcome.schema.js';
import { getHotelCandidate } from './hotel-candidates.js';
import { getHotelQualification } from './hotel-qualifications.js';
import { getLatestPrescan, getPrescanVendorAggregate } from './prescans.js';
import type { PrescanVendorAggregate } from './prescans.js';
import { getLatestHotelScore } from './scores.js';
import { getHotelContact } from './hotel-contacts.js';
import { findOutreachThreadByCandidate } from './outreach-threads.js';
import type { OutreachThreadDocument } from './schemas/outreach-thread.schema.js';
import { listOutreachDrafts } from './outreach-drafts.js';
import type {
  OutreachDraftDocument,
  OutreachDraftReviewOutcome,
  OutreachDraftStatus,
} from './schemas/outreach-draft.schema.js';
import { listOutreachPreviews } from './outreach-previews.js';
import type { OutreachPreviewStatus } from './schemas/outreach-preview.schema.js';
import type { OutreachLanguageSource } from './schemas/outreach-thread.schema.js';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
/** How many draft attempts one thread's detail view carries. Metadata only;
 *  bounded so a thread cannot grow a response. */
const THREAD_DRAFT_HISTORY_LIMIT = 20;

export interface OperatorViewPageOptions {
  limit?: number;
  offset?: number;
}

export interface OperatorViewPage<Row> {
  rows: Row[];
  total: number;
  limit: number;
  offset: number;
}

interface PageBounds {
  limit: number;
  offset: number;
  skip: number;
}

/** Clamps rather than rejects: a route passing a larger page size gets a
 *  bounded page, not an error, which keeps one hard cap instead of one
 *  cap per caller. */
function pageBounds(options: OperatorViewPageOptions): PageBounds {
  const requested = options.limit ?? DEFAULT_PAGE_LIMIT;
  const limit = Math.min(Math.max(Math.trunc(requested), 1), MAX_PAGE_LIMIT);
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0);
  return { limit, offset, skip: offset };
}

// ---------------------------------------------------------------------------
// Prospect list
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Source conflicts (the join review queue's evidence)
// ---------------------------------------------------------------------------

export interface OperatorSourceConflictRow {
  kind: string;
  detail: string;
  candidateIds: string[];
}

export interface OperatorSourceRefRow {
  source: string;
  sourceId: string;
  sourceVersion: string;
  ingestRunId: string;
}

export interface OperatorSourceConflictsView {
  candidateId: string;
  identityStatus: HotelIdentityStatus;
  reviewState: HotelCandidateReviewState;
  conflicts: OperatorSourceConflictRow[];
  /** The pointers to the immutable source records behind this candidate. The
   *  candidate never absorbed them, so a human reviewing the merge reads the
   *  original rows, not a re-telling. */
  sourceRefs: OperatorSourceRefRow[];
}

export async function getProspectSourceConflicts(
  connection: Connection,
  candidateId: string,
): Promise<OperatorSourceConflictsView | null> {
  const candidate = await getHotelCandidate(connection, candidateId);
  if (candidate === null) return null;
  return {
    candidateId: candidate.candidateId,
    identityStatus: candidate.identityStatus,
    reviewState: candidate.review.state,
    conflicts: candidate.conflicts.map((conflict) => ({
      kind: conflict.kind,
      detail: conflict.detail,
      candidateIds: [...conflict.candidateIds],
    })),
    sourceRefs: candidate.sourceRefs.map((ref) => ({
      source: ref.source,
      sourceId: ref.sourceId,
      sourceVersion: ref.sourceVersion,
      ingestRunId: ref.ingestRunId,
    })),
  };
}

// ---------------------------------------------------------------------------
// Qualification history
// ---------------------------------------------------------------------------

export interface OperatorQualificationEvent {
  qualificationId: string;
  qualificationVersion: string;
  domain: string | null;
  outcome: HotelQualificationOutcome;
  reasons: HotelQualificationReason[];
  notes: string[];
  /** The Sirene join's status and effectif band, which scoring reads. The
   *  rest of the join (denomination, NAF) stays out of the view. */
  sireneStatus: string | null;
  effectifBandCode: string | null;
  evaluatedAt: Date;
}

/** One candidate's qualification generations, newest first. `siteFacts` is
 *  deliberately not projected: it is the probe's raw payload, and the
 *  operator question this view answers is "what was concluded and why", not
 *  "what exactly did the fetch see". */
export async function getProspectQualificationHistory(
  connection: Connection,
  candidateId: string,
  options: OperatorViewPageOptions,
): Promise<OperatorViewPage<OperatorQualificationEvent>> {
  const { limit, offset, skip } = pageBounds(options);
  const QualificationModel = createHotelQualificationModel(connection);
  const filter: Record<string, unknown> = { candidateId };
  const [total, rows] = await Promise.all([
    QualificationModel.countDocuments(filter),
    QualificationModel.find(filter)
      .sort({ evaluatedAt: -1, qualificationVersion: 1 })
      .skip(skip)
      .limit(limit)
      .select({
        qualificationId: 1,
        qualificationVersion: 1,
        domain: 1,
        outcome: 1,
        reasons: 1,
        notes: 1,
        'sireneJoin.status': 1,
        'sireneJoin.effectifBandCode': 1,
        evaluatedAt: 1,
        _id: 0,
      })
      .lean<
        {
          qualificationId: string;
          qualificationVersion: string;
          domain?: string | null;
          outcome: HotelQualificationOutcome;
          reasons: string[];
          notes: string[];
          sireneJoin?: { status?: unknown; effectifBandCode?: unknown };
          evaluatedAt: Date;
        }[]
      >(),
  ]);

  return {
    rows: rows.map((row) => ({
      qualificationId: row.qualificationId,
      qualificationVersion: row.qualificationVersion,
      domain: row.domain ?? null,
      outcome: row.outcome,
      reasons: row.reasons as HotelQualificationReason[],
      notes: [...row.notes],
      sireneStatus: typeof row.sireneJoin?.status === 'string' ? row.sireneJoin.status : null,
      effectifBandCode:
        typeof row.sireneJoin?.effectifBandCode === 'string'
          ? row.sireneJoin.effectifBandCode
          : null,
      evaluatedAt: row.evaluatedAt,
    })),
    total,
    limit,
    offset,
  };
}

// ---------------------------------------------------------------------------
// Prescan and evidence
// ---------------------------------------------------------------------------

/** The identity fields every insight sub-view (prescan, score, evidence,
 *  preview) borrows from the candidate, so its own page can headline the
 *  hotel instead of the opaque candidateId in the URL. Falls back to the id
 *  itself if the candidate record is gone by the time the sub-view is read:
 *  the sub-record can outlive a deleted candidate, and a blank heading would
 *  be worse than the id it replaces. */
interface OperatorCandidateIdentity {
  name: string;
  commune: string | null;
  postcode: string | null;
}

async function candidateIdentityView(
  connection: Connection,
  candidateId: string,
): Promise<OperatorCandidateIdentity> {
  const candidate = await getHotelCandidate(connection, candidateId);
  return {
    name: candidate?.name ?? candidateId,
    commune: candidate?.commune ?? null,
    postcode: candidate?.postcode ?? null,
  };
}

export interface OperatorPrescanPageView {
  role: HotelPrescanPageRole;
  httpStatus: number | null;
  missingPercent: number | null;
  rawTextLength: number | null;
  renderedTextLength: number | null;
  consoleErrorCount: number | null;
  axe: {
    violationCount: number;
    byImpact: { critical: number; serious: number; moderate: number; minor: number };
    affectedElementCount: number;
    ruleIds: string[];
  } | null;
  metrics: {
    largestContentfulPaintMs: number | null;
    cumulativeLayoutShift: number | null;
    longTaskCount: number | null;
    mainThreadBlockingMs: number | null;
    requestCount: number;
    transferBytes: number;
    thirdPartyRequestCount: number;
    sizeUnavailableCount: number;
    observationWindowMs: number;
  } | null;
  bookingEvidenceKinds: string[];
  skippedByRobots: boolean;
  durationMs: number;
}

export interface OperatorPrescanView {
  prescanId: string;
  name: string;
  commune: string | null;
  postcode: string | null;
  prescanVersion: string;
  status: HotelPrescanStatus;
  domain: string;
  startedAt: Date;
  durationMs: number;
  robotsTxtFound: boolean;
  absentRoles: HotelPrescanRoleAbsence[];
  evidenceStatus: 'complete' | 'incomplete' | 'none';
  pages: OperatorPrescanPageView[];
}

export interface GetProspectPrescanViewOptions {
  /** Latest at this version when given; latest of any version otherwise. */
  prescanVersion?: string;
}

/** The latest prescan's page roles and metrics. Page urls, artifact paths,
 *  third-party host lists, and raw error strings stay out: the operator view
 *  is what a person reads to judge the site, and each excluded field is
 *  either an unbounded list or a string written by a tool. */
export async function getProspectPrescanView(
  connection: Connection,
  candidateId: string,
  options: GetProspectPrescanViewOptions = {},
): Promise<OperatorPrescanView | null> {
  const prescan = await latestPrescanForCandidate(connection, candidateId, options.prescanVersion);
  if (prescan === null) return null;
  const identity = await candidateIdentityView(connection, candidateId);
  return {
    prescanId: prescan.prescanId,
    ...identity,
    prescanVersion: prescan.prescanVersion,
    status: prescan.status,
    domain: prescan.domain,
    startedAt: prescan.startedAt,
    durationMs: prescan.durationMs,
    robotsTxtFound: prescan.robotsTxtFound,
    absentRoles: prescan.absentRoles.map((absence) => ({
      role: absence.role,
      reason: absence.reason,
    })),
    evidenceStatus: prescan.evidence?.status ?? 'none',
    pages: prescan.pages.map((page) => ({
      role: page.role,
      httpStatus: page.httpStatus ?? null,
      missingPercent: page.missingPercent ?? null,
      rawTextLength: page.rawTextLength ?? null,
      renderedTextLength: page.renderedTextLength ?? null,
      consoleErrorCount: page.consoleErrorCount ?? null,
      axe:
        page.axe === undefined
          ? null
          : {
              violationCount: page.axe.violationCount,
              byImpact: { ...page.axe.byImpact },
              affectedElementCount: page.axe.affectedElementCount,
              ruleIds: [...page.axe.ruleIds],
            },
      metrics:
        page.metrics === undefined
          ? null
          : {
              largestContentfulPaintMs: page.metrics.largestContentfulPaintMs,
              cumulativeLayoutShift: page.metrics.cumulativeLayoutShift,
              longTaskCount: page.metrics.longTaskCount,
              mainThreadBlockingMs: page.metrics.mainThreadBlockingMs,
              requestCount: page.metrics.requestCount,
              transferBytes: page.metrics.transferBytes,
              thirdPartyRequestCount: page.metrics.thirdPartyRequestCount,
              sizeUnavailableCount: page.metrics.sizeUnavailableCount,
              observationWindowMs: page.metrics.observationWindowMs,
            },
      bookingEvidenceKinds: page.bookingEvidenceKinds ?? [],
      skippedByRobots: page.skippedByRobots ?? false,
      durationMs: page.durationMs,
    })),
  };
}

export type OperatorEvidenceAssetView =
  | {
      state: 'captured';
      pageRole: HotelPrescanPageRole;
      selectionReason: HotelEvidenceSelectionReason;
      byteSize: number;
      width: number;
      height: number;
      /** The evidence record's own bilingual alternative text (issue #92), so
       *  the dashboard can render the asset accessibly. Part of the public
       *  preview already, so nothing new leaves the operator boundary. */
      altText: HotelEvidenceBilingualText;
    }
  | { state: 'omitted'; reason: HotelEvidenceOmissionReason };

export interface OperatorEvidenceSummaryView {
  observation: { fr: string; en: string };
  severity: Severity;
  wcagCriteria: string[];
  pageRole: HotelPrescanPageRole;
}

export interface OperatorEvidenceView {
  prescanId: string;
  name: string;
  commune: string | null;
  postcode: string | null;
  evidenceStatus: 'complete' | 'incomplete';
  renderComparison: OperatorEvidenceAssetView;
  specificFailure: OperatorEvidenceAssetView;
  summaries: OperatorEvidenceSummaryView[];
}

export interface GetProspectEvidenceViewOptions {
  prescanVersion?: string;
}

/** The two evidence assets' status. Captured assets are described by size and
 *  selection reason only: the sha256, the artifact ref, and the fact ref all
 *  stay out, because a view that returned them would let a route hand over
 *  artifact addresses without deciding to. */
export async function getProspectEvidenceView(
  connection: Connection,
  candidateId: string,
  options: GetProspectEvidenceViewOptions = {},
): Promise<OperatorEvidenceView | null> {
  const prescan = await latestPrescanForCandidate(connection, candidateId, options.prescanVersion);
  if (prescan === null || prescan.evidence === undefined) return null;
  const evidence = prescan.evidence;
  const identity = await candidateIdentityView(connection, candidateId);
  return {
    prescanId: prescan.prescanId,
    ...identity,
    evidenceStatus: evidence.status,
    renderComparison: projectEvidenceAsset(evidence.renderComparison),
    specificFailure: projectEvidenceAsset(evidence.specificFailure),
    summaries: evidence.summaries.map((summary) => ({
      observation: { fr: summary.observation.fr, en: summary.observation.en },
      severity: summary.severity,
      wcagCriteria: [...summary.wcagCriteria],
      pageRole: summary.pageRole,
    })),
  };
}

/** Which of the two evidence assets is asked for. The dashboard slot names
 *  the same two assets by page (homepage, contact); this is the store's
 *  evidence-field naming. */
export type OperatorEvidenceAssetSlot = 'renderComparison' | 'specificFailure';

/** What a route needs to resolve one evidence asset's bytes without the JSON
 *  view ever carrying an artifact address (issue #92): the prescan's own
 *  location facts plus the asset ref and digest it already stores. This type
 *  is for the byte-serving path only - a caller that sends it to a client
 *  verbatim would defeat the projection rule above. */
export interface OperatorEvidenceAssetSource {
  prescanId: string;
  /** The prescan's domain: the hostname of the artifacts layout. */
  domain: string;
  startedAt: Date;
  /** Prescan directory relative to the prescans root, exactly as stored. */
  artifactsDir: string;
  /** Asset ref relative to the prescan directory (evidence/<sha256>.png). */
  ref: string;
  sha256: string;
  mimeType: 'image/png';
  byteSize: number;
}

export interface GetProspectEvidenceAssetSourceOptions {
  prescanVersion?: string;
}

/** The stored facts needed to resolve one captured evidence asset's bytes.
 *  Null when there is no prescan, no evidence, or the slot's asset was
 *  omitted: a missing asset has nothing to serve, and the caller answers 404
 *  rather than inventing a placeholder. */
export async function getProspectEvidenceAssetSource(
  connection: Connection,
  candidateId: string,
  slot: OperatorEvidenceAssetSlot,
  options: GetProspectEvidenceAssetSourceOptions = {},
): Promise<OperatorEvidenceAssetSource | null> {
  const prescan = await latestPrescanForCandidate(connection, candidateId, options.prescanVersion);
  if (prescan === null || prescan.evidence === undefined) return null;
  const asset: HotelEvidenceAsset = prescan.evidence[slot];
  if (asset.state !== 'captured') return null;
  return {
    prescanId: prescan.prescanId,
    domain: prescan.domain,
    startedAt: prescan.startedAt,
    artifactsDir: prescan.artifactsDir,
    ref: asset.ref,
    sha256: asset.sha256,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
  };
}

function projectEvidenceAsset(asset: HotelEvidenceAsset): OperatorEvidenceAssetView {
  if (asset.state === 'omitted') {
    return { state: 'omitted', reason: asset.reason };
  }
  return {
    state: 'captured',
    pageRole: asset.pageRole,
    selectionReason: asset.selectionReason,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    altText: { fr: asset.altText.fr, en: asset.altText.en },
  };
}

async function latestPrescanForCandidate(
  connection: Connection,
  candidateId: string,
  prescanVersion?: string,
): Promise<PrescanDocument | null> {
  // Versioned lookups compose getLatestPrescan; the any-version case has no
  // existing helper and is one indexed query by candidateId.
  if (prescanVersion !== undefined) {
    return getLatestPrescan(connection, candidateId, prescanVersion);
  }
  return createPrescanModel(connection)
    .findOne({ candidateId })
    .sort({ startedAt: -1, prescanId: 1 })
    .lean<PrescanDocument>();
}

// ---------------------------------------------------------------------------
// Score views
// ---------------------------------------------------------------------------

export interface OperatorScoreComponentView {
  id: HotelBrokennessComponentId | HotelAbilityComponentId;
  points: number;
  reason: HotelScoreReason;
}

export interface OperatorScoreBreakdownView {
  total: number;
  components: OperatorScoreComponentView[];
}

export interface OperatorScoreView {
  scoreId: string;
  candidateId: string;
  name: string;
  commune: string | null;
  postcode: string | null;
  scoringVersion: string;
  prescanId: string;
  computedAt: Date;
  worthy: boolean;
  evidenceComplete: boolean;
  brokenness: OperatorScoreBreakdownView;
  ability: OperatorScoreBreakdownView;
}

export interface GetProspectScoreViewOptions {
  /** Latest at this version when given; latest of any version otherwise. */
  scoringVersion?: string;
}

function projectScore(
  score: HotelScoreDocument,
  identity: OperatorCandidateIdentity,
): OperatorScoreView {
  const projectComponents = (breakdown: {
    total: number;
    components: {
      id: HotelBrokennessComponentId | HotelAbilityComponentId;
      points: number;
      reason: HotelScoreReason;
    }[];
  }): OperatorScoreBreakdownView => ({
    total: breakdown.total,
    components: breakdown.components.map((component) => ({
      id: component.id,
      points: component.points,
      reason: component.reason,
    })),
  });
  return {
    scoreId: score.scoreId,
    candidateId: score.candidateId,
    ...identity,
    scoringVersion: score.scoringVersion,
    prescanId: score.prescanId,
    computedAt: score.computedAt,
    worthy: score.worthy,
    evidenceComplete: score.evidenceComplete,
    brokenness: projectComponents(score.brokenness),
    ability: projectComponents(score.ability),
  };
}

/** The latest score with its complete breakdown. Scores are insert-only, so
 *  "latest" is the newest computation, not a mutable current value. */
export async function getProspectScoreView(
  connection: Connection,
  candidateId: string,
  options: GetProspectScoreViewOptions = {},
): Promise<OperatorScoreView | null> {
  const score =
    options.scoringVersion !== undefined
      ? await getLatestHotelScore(connection, candidateId, options.scoringVersion)
      : await createHotelScoreModel(connection)
          .findOne({ candidateId })
          .sort({ computedAt: -1, scoreId: 1 })
          .lean<HotelScoreDocument>();
  if (score === null) return null;
  const identity = await candidateIdentityView(connection, candidateId);
  return projectScore(score, identity);
}

export interface OperatorScoreDiffView {
  candidateId: string;
  fromVersion: string;
  toVersion: string;
  from: OperatorScoreView | null;
  to: OperatorScoreView | null;
  /** Null when either side is missing: an absent score is not a zero. */
  brokennessDelta: number | null;
  abilityDelta: number | null;
}

/** What two scoring versions say about one hotel, with full breakdowns on
 *  both sides. diffHotelScoreVersions answers the same question for a whole
 *  population and totals only; the per-hotel why needs the components. */
export async function getProspectScoreDiffView(
  connection: Connection,
  candidateId: string,
  fromVersion: string,
  toVersion: string,
): Promise<OperatorScoreDiffView> {
  const [from, to] = await Promise.all([
    getProspectScoreView(connection, candidateId, { scoringVersion: fromVersion }),
    getProspectScoreView(connection, candidateId, { scoringVersion: toVersion }),
  ]);
  return {
    candidateId,
    fromVersion,
    toVersion,
    from,
    to,
    brokennessDelta:
      from === null || to === null ? null : to.brokenness.total - from.brokenness.total,
    abilityDelta: from === null || to === null ? null : to.ability.total - from.ability.total,
  };
}

// ---------------------------------------------------------------------------
// Contact, preview, thread, outcome views
// ---------------------------------------------------------------------------

export interface OperatorContactView {
  contactId: string;
  contactVersion: string;
  cohortId: string;
  domain: string;
  state: HotelContactState;
  reason: string;
  mxStatus: MailDomainStatus;
  /** The allowlisted source kind (contact page, legal page), never the page
   *  url and never the address itself. */
  sourceKind: ContactSourceKind | null;
  validatedAt: Date;
}

export interface GetProspectContactViewOptions {
  contactVersion?: string;
}

/** Contact state with no address material: `address`, `localPart`, and
 *  `sourceUrl` are the three fields this view must never carry, whatever a
 *  future render might want. */
export async function getProspectContactView(
  connection: Connection,
  candidateId: string,
  options: GetProspectContactViewOptions = {},
): Promise<OperatorContactView | null> {
  const contact =
    options.contactVersion !== undefined
      ? await getHotelContact(connection, options.contactVersion, candidateId)
      : await createHotelContactModel(connection)
          .findOne({ candidateId })
          .sort({ validatedAt: -1, contactId: 1 })
          .lean<HotelContactDocument>();
  if (contact === null) return null;
  return {
    contactId: contact.contactId,
    contactVersion: contact.contactVersion,
    cohortId: contact.cohortId,
    domain: contact.domain,
    state: contact.state,
    reason: contact.reason,
    mxStatus: contact.mxStatus,
    sourceKind: contact.source ?? null,
    validatedAt: contact.validatedAt,
  };
}

export interface OperatorPreviewView {
  previewId: string;
  name: string;
  commune: string | null;
  postcode: string | null;
  domain: string;
  language: 'fr' | 'en';
  status: OutreachPreviewStatus;
  publishedAt: Date;
  publicExpiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  prescanVersion: string;
  evidenceVersion: string;
  previewContentVersion: string;
}

/** The latest published preview for one candidate. `tokenHash` and
 *  `objectKey` are access-control material and have no place in an operator
 *  view, for the reason outreach-preview.schema.ts gives about the raw
 *  token. */
export async function getProspectPreviewView(
  connection: Connection,
  candidateId: string,
): Promise<OperatorPreviewView | null> {
  const [latest] = await listOutreachPreviews(connection, { candidateId, limit: 1 });
  if (latest === undefined) return null;
  const identity = await candidateIdentityView(connection, candidateId);
  return {
    previewId: latest.previewId,
    ...identity,
    domain: latest.domain,
    language: latest.language,
    status: latest.status,
    publishedAt: latest.publishedAt,
    publicExpiresAt: latest.publicExpiresAt,
    revokedAt: latest.revokedAt ?? null,
    revokedReason: latest.revokedReason ?? null,
    prescanVersion: latest.prescanVersion,
    evidenceVersion: latest.evidenceVersion,
    previewContentVersion: latest.previewContentVersion,
  };
}

export interface OperatorDraftView {
  draftId: string;
  touch: number;
  language: 'fr' | 'en';
  status: OutreachDraftStatus;
  touch1EvidenceSlot: OutreachEvidenceSlot | null;
  failureReason: string | null;
  hasProviderDraft: boolean;
  createdAt: Date;
  deletedAt: Date | null;
  /** Issue #96: how the operator resolved the review. Null on rows that left
   *  `created` before the outcome was recorded or by another path. */
  reviewOutcome: OutreachDraftReviewOutcome | null;
  reviewedAt: Date | null;
}

export interface OperatorThreadView {
  threadId: string;
  candidateId: string;
  domain: string;
  language: 'fr' | 'en';
  languageSource: OutreachLanguageSource;
  currentTouch: number;
  state: OutreachThreadState;
  stateEnteredAt: Date;
  stateReason: string | null;
  /** Provider-confirmed sends, timing metadata only. */
  touches: { touch: number; sentAt: Date; detectedAt: Date }[];
  lastSyncedAt: Date | null;
  needsReview: { reason: string; detectedAt: Date } | null;
  /** The operator-set outcome event the thread points at, resolved to its
   *  value. Absent until an operator records one. */
  currentOutcome: {
    outcome: OutreachOutcome;
    lostReason: OutreachLostReason | null;
    recordedAt: Date;
  } | null;
  /** Draft attempts for this thread, metadata only: no subject, no body, no
   *  content hashes, no preview url (which is itself a bearer link). */
  drafts: OperatorDraftView[];
}

/** Thread, draft, and reply state for one candidate, metadata only. The
 *  thread stores the role address raw so a draft can be addressed; this view
 *  is exactly the part of the record that stays true without it. */
export async function getProspectThreadView(
  connection: Connection,
  candidateId: string,
): Promise<OperatorThreadView | null> {
  const thread = await findOutreachThreadByCandidate(connection, candidateId);
  if (thread === null) return null;

  const [drafts, currentOutcome] = await Promise.all([
    listOutreachDrafts(connection, {
      threadId: thread.threadId,
      limit: THREAD_DRAFT_HISTORY_LIMIT,
    }),
    resolveOutcomePointer(connection, thread),
  ]);

  return {
    threadId: thread.threadId,
    candidateId: thread.candidateId,
    domain: thread.domain,
    language: thread.language,
    languageSource: thread.languageSource,
    currentTouch: thread.currentTouch,
    state: thread.state,
    stateEnteredAt: thread.stateEnteredAt,
    stateReason: thread.stateReason ?? null,
    touches: thread.touches.map((touch) => ({
      touch: touch.touch,
      sentAt: touch.sentAt,
      detectedAt: touch.detectedAt,
    })),
    lastSyncedAt: thread.lastSyncedAt ?? null,
    needsReview:
      thread.needsReview === undefined
        ? null
        : { reason: thread.needsReview.reason, detectedAt: thread.needsReview.detectedAt },
    currentOutcome,
    drafts: drafts.map(projectDraft),
  };
}

function projectDraft(draft: OutreachDraftDocument): OperatorDraftView {
  return {
    draftId: draft.draftId,
    touch: draft.touch,
    language: draft.language,
    status: draft.status,
    touch1EvidenceSlot: draft.touch1EvidenceSlot ?? null,
    failureReason: draft.failureReason ?? null,
    hasProviderDraft: draft.providerDraftId !== undefined,
    createdAt: draft.createdAt,
    deletedAt: draft.deletedAt ?? null,
    reviewOutcome: draft.reviewOutcome ?? null,
    reviewedAt: draft.reviewedAt ?? null,
  };
}

async function resolveOutcomePointer(
  connection: Connection,
  thread: OutreachThreadDocument,
): Promise<OperatorThreadView['currentOutcome']> {
  if (thread.currentOutcome === undefined) return null;
  const event = await createOutreachOutcomeModel(connection)
    .findOne({ outcomeId: thread.currentOutcome })
    .select({ outcome: 1, lostReason: 1, recordedAt: 1, _id: 0 })
    .lean<{ outcome: OutreachOutcome; lostReason?: OutreachLostReason; recordedAt: Date }>();
  if (event === null) return null;
  return {
    outcome: event.outcome,
    lostReason: event.lostReason ?? null,
    recordedAt: event.recordedAt,
  };
}

export interface OperatorOutcomeEventView {
  outcomeId: string;
  outcome: OutreachOutcome;
  lostReason: OutreachLostReason | null;
  actor: string;
  recordedAt: Date;
}

/** One candidate's operator-recorded outcome events, newest first. */
export async function getProspectOutcomeView(
  connection: Connection,
  candidateId: string,
  options: OperatorViewPageOptions,
): Promise<OperatorViewPage<OperatorOutcomeEventView>> {
  const { limit, offset, skip } = pageBounds(options);
  const OutcomeModel = createOutreachOutcomeModel(connection);
  const filter: Record<string, unknown> = { candidateId };
  const [total, rows] = await Promise.all([
    OutcomeModel.countDocuments(filter),
    OutcomeModel.find(filter)
      .sort({ recordedAt: -1, outcomeId: 1 })
      .skip(skip)
      .limit(limit)
      .select({ outcomeId: 1, outcome: 1, lostReason: 1, actor: 1, recordedAt: 1, _id: 0 })
      .lean<
        {
          outcomeId: string;
          outcome: OutreachOutcome;
          lostReason?: OutreachLostReason;
          actor: string;
          recordedAt: Date;
        }[]
      >(),
  ]);
  return {
    rows: rows.map((row) => ({
      outcomeId: row.outcomeId,
      outcome: row.outcome,
      lostReason: row.lostReason ?? null,
      actor: row.actor,
      recordedAt: row.recordedAt,
    })),
    total,
    limit,
    offset,
  };
}

// ---------------------------------------------------------------------------
// Cross-candidate review lists
// ---------------------------------------------------------------------------

export interface OperatorReviewDraftRow {
  draftId: string;
  threadId: string;
  candidateId: string;
  touch: number;
  language: 'fr' | 'en';
  touch1EvidenceSlot: OutreachEvidenceSlot | null;
  hasProviderDraft: boolean;
  createdAt: Date;
}

/** Every pending Gmail draft across candidates, metadata only. Reviewing a
 *  draft happens in the mailbox; this list is what tells the operator which
 *  candidates have one waiting and how old it is. */
export async function listOutreachReviewDrafts(
  connection: Connection,
  options: OperatorViewPageOptions,
): Promise<OperatorViewPage<OperatorReviewDraftRow>> {
  const { limit, offset, skip } = pageBounds(options);
  const DraftModel = createOutreachDraftModel(connection);
  const filter: Record<string, unknown> = { status: 'created' };
  const [total, rows] = await Promise.all([
    DraftModel.countDocuments(filter),
    DraftModel.find(filter)
      .sort({ createdAt: -1, draftId: 1 })
      .skip(skip)
      .limit(limit)
      .select({
        draftId: 1,
        threadId: 1,
        candidateId: 1,
        touch: 1,
        language: 1,
        touch1EvidenceSlot: 1,
        providerDraftId: 1,
        createdAt: 1,
        _id: 0,
      })
      .lean<
        {
          draftId: string;
          threadId: string;
          candidateId: string;
          touch: number;
          language: 'fr' | 'en';
          touch1EvidenceSlot?: OutreachEvidenceSlot;
          providerDraftId?: string;
          createdAt: Date;
        }[]
      >(),
  ]);
  return {
    rows: rows.map((row) => ({
      draftId: row.draftId,
      threadId: row.threadId,
      candidateId: row.candidateId,
      touch: row.touch,
      language: row.language,
      touch1EvidenceSlot: row.touch1EvidenceSlot ?? null,
      hasProviderDraft: row.providerDraftId !== undefined,
      createdAt: row.createdAt,
    })),
    total,
    limit,
    offset,
  };
}

export interface OperatorReplyReviewRow {
  threadId: string;
  candidateId: string;
  domain: string;
  language: 'fr' | 'en';
  state: OutreachThreadState;
  currentTouch: number;
  reviewReason: string;
  reviewDetectedAt: Date;
  lastSyncedAt: Date | null;
}

/** Threads whose reply state a sync could not confidently classify. Metadata
 *  only: what the ambiguity is and when it was noticed, never the reply
 *  text, which this collection does not store in the first place. */
export async function listRepliesNeedingReview(
  connection: Connection,
  options: OperatorViewPageOptions,
): Promise<OperatorViewPage<OperatorReplyReviewRow>> {
  const { limit, offset, skip } = pageBounds(options);
  const ThreadModel = createOutreachThreadModel(connection);
  const filter: Record<string, unknown> = { needsReview: { $exists: true } };
  const [total, rows] = await Promise.all([
    ThreadModel.countDocuments(filter),
    ThreadModel.find(filter)
      .sort({ 'needsReview.detectedAt': -1, threadId: 1 })
      .skip(skip)
      .limit(limit)
      .select({
        threadId: 1,
        candidateId: 1,
        domain: 1,
        language: 1,
        state: 1,
        currentTouch: 1,
        'needsReview.reason': 1,
        'needsReview.detectedAt': 1,
        lastSyncedAt: 1,
        _id: 0,
      })
      .lean<
        {
          threadId: string;
          candidateId: string;
          domain: string;
          language: 'fr' | 'en';
          state: OutreachThreadState;
          currentTouch: number;
          needsReview?: { reason: string; detectedAt: Date };
          lastSyncedAt?: Date;
        }[]
      >(),
  ]);
  return {
    rows: rows.map((row) => ({
      threadId: row.threadId,
      candidateId: row.candidateId,
      domain: row.domain,
      language: row.language,
      state: row.state,
      currentTouch: row.currentTouch,
      reviewReason: row.needsReview?.reason ?? '',
      reviewDetectedAt: row.needsReview?.detectedAt ?? new Date(0),
      lastSyncedAt: row.lastSyncedAt ?? null,
    })),
    total,
    limit,
    offset,
  };
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

/** The vendor and failure fingerprint aggregate. Composed unchanged from
 *  getPrescanVendorAggregate, which already bounds itself by minimum group
 *  size so a fingerprint seen once (a fact about one identifiable business)
 *  never reaches an operator view. */
export async function getVendorFingerprintAggregate(
  connection: Connection,
  prescanVersion: string,
  minimumGroupSize = 5,
): Promise<PrescanVendorAggregate> {
  return getPrescanVendorAggregate(connection, prescanVersion, minimumGroupSize);
}

export interface OperatorOutcomeSummary {
  total: number;
  byOutcome: Record<string, number>;
  byLostReason: Record<string, number>;
}

/** Privacy-safe outcome counts. Vocabulary-keyed counts only: no candidate
 *  ids, no threads, no free text, so the summary can be rendered anywhere
 *  without a leak path. */
export async function getOutcomeSummary(connection: Connection): Promise<OperatorOutcomeSummary> {
  const [facets] = await createOutreachOutcomeModel(connection).aggregate<{
    byOutcome: Array<{ _id: string; count: number }>;
    byLostReason: Array<{ _id: string; count: number }>;
    total: Array<{ count: number }>;
  }>([
    {
      $facet: {
        byOutcome: [{ $group: { _id: '$outcome', count: { $sum: 1 } } }],
        byLostReason: [
          { $match: { lostReason: { $exists: true, $ne: null } } },
          { $group: { _id: '$lostReason', count: { $sum: 1 } } },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const byOutcome: Record<string, number> = {};
  for (const row of facets?.byOutcome ?? []) byOutcome[row._id] = row.count;
  const byLostReason: Record<string, number> = {};
  for (const row of facets?.byLostReason ?? []) byLostReason[row._id] = row.count;
  return { total: facets?.total[0]?.count ?? 0, byOutcome, byLostReason };
}

// ---------------------------------------------------------------------------
// Composed prospect detail
// ---------------------------------------------------------------------------

export interface OperatorWebsiteCandidateView {
  raw: string;
  kind: string;
  hostname: string | null;
  registrableDomain: string | null;
  unusableReason: string | null;
}

export interface OperatorProspectDetail {
  candidateId: string;
  resolutionVersion: string;
  identityKey: string;
  identityStatus: HotelIdentityStatus;
  matchedOn: { kind: string; value: string } | null;
  siret: string | null;
  siren: string | null;
  name: string;
  commune: string | null;
  postcode: string | null;
  starRating: number | null;
  roomCount: number | null;
  capacity: number | null;
  campaignEligibility: HotelCampaignEligibility;
  groupStatus: HotelGroupStatus;
  groupDomain: string | null;
  groupSize: number | null;
  ownRegistrableDomain: string | null;
  domainProvenance: string | null;
  declaredRegistrableDomain: string | null;
  reviewState: HotelCandidateReviewState;
  review: {
    queuedReason: string | null;
    actor: string | null;
    reason: string | null;
    decidedAt: Date | null;
  };
  qualificationOutcome: HotelQualificationOutcome | 'not-evaluated';
  prescanStatus: HotelPrescanStatus | null;
  /** The declared websites, which is the evidence a join reviewer reads. The
   *  catalogue's street address stays out of every view here; commune and
   *  postcode locate the establishment. */
  websites: OperatorWebsiteCandidateView[];
  conflicts: OperatorSourceConflictRow[];
  sourceRefs: OperatorSourceRefRow[];
  qualification: OperatorQualificationEvent | null;
  prescan: OperatorPrescanView | null;
  evidence: OperatorEvidenceView | null;
  score: OperatorScoreView | null;
  contact: OperatorContactView | null;
  thread: OperatorThreadView | null;
  preview: OperatorPreviewView | null;
  outcomes: OperatorViewPage<OperatorOutcomeEventView>;
}

/** One candidate's whole funnel, composed from the per-stage views above. A
 *  detail response is bounded by construction: at most one qualification
 *  generation, one prescan, one score, one contact row, one thread with its
 *  draft metadata, one preview, and one page of outcome events. */
export async function getOperatorProspect(
  connection: Connection,
  candidateId: string,
): Promise<OperatorProspectDetail | null> {
  const candidate = await getHotelCandidate(connection, candidateId);
  if (candidate === null) return null;

  // The composed stages are read in parallel; none depends on another's
  // result. The qualification event follows the candidate's pointer so the
  // detail always shows the generation the catalogue currently believes.
  const [conflicts, historyPage, prescan, evidence, score, contact, thread, preview, outcomes] =
    await Promise.all([
      getProspectSourceConflicts(connection, candidateId),
      candidate.qualification === undefined
        ? getProspectQualificationHistory(connection, candidateId, { limit: 1 })
        : Promise.resolve({ rows: [], total: 0, limit: 1, offset: 0 }),
      getProspectPrescanView(connection, candidateId),
      getProspectEvidenceView(connection, candidateId),
      getProspectScoreView(connection, candidateId),
      getProspectContactView(connection, candidateId),
      getProspectThreadView(connection, candidateId),
      getProspectPreviewView(connection, candidateId),
      getProspectOutcomeView(connection, candidateId, { limit: 10 }),
    ]);

  let qualification: OperatorQualificationEvent | null = null;
  if (candidate.qualification !== undefined) {
    const pointed = await getHotelQualification(
      connection,
      candidate.qualification.qualificationVersion,
      candidateId,
    );
    if (pointed !== null) {
      qualification = {
        qualificationId: pointed.qualificationId,
        qualificationVersion: pointed.qualificationVersion,
        domain: pointed.domain ?? null,
        outcome: pointed.outcome,
        reasons: pointed.reasons as HotelQualificationReason[],
        notes: [...pointed.notes],
        sireneStatus: pointed.sireneJoin?.status ?? null,
        effectifBandCode: pointed.sireneJoin?.effectifBandCode ?? null,
        evaluatedAt: pointed.evaluatedAt,
      };
    }
  } else {
    qualification = historyPage.rows[0] ?? null;
  }

  return {
    candidateId: candidate.candidateId,
    resolutionVersion: candidate.resolutionVersion,
    identityKey: candidate.identityKey,
    identityStatus: candidate.identityStatus,
    matchedOn:
      candidate.matchedOn === undefined
        ? null
        : { kind: candidate.matchedOn.kind, value: candidate.matchedOn.value },
    siret: candidate.siret ?? null,
    siren: candidate.siren ?? null,
    name: candidate.name,
    commune: candidate.commune ?? null,
    postcode: candidate.postcode ?? null,
    starRating: candidate.starRating ?? null,
    roomCount: candidate.roomCount ?? null,
    capacity: candidate.capacity ?? null,
    campaignEligibility: candidate.campaignEligibility,
    groupStatus: candidate.groupStatus,
    groupDomain: candidate.groupDomain ?? null,
    groupSize: candidate.groupSize ?? null,
    ownRegistrableDomain: candidate.ownRegistrableDomain ?? null,
    domainProvenance: candidate.domainProvenance ?? null,
    declaredRegistrableDomain: candidate.declaredRegistrableDomain ?? null,
    reviewState: candidate.review.state,
    review: {
      queuedReason: candidate.review.queuedReason ?? null,
      actor: candidate.review.actor ?? null,
      reason: candidate.review.reason ?? null,
      decidedAt: candidate.review.decidedAt ?? null,
    },
    qualificationOutcome: candidate.qualification?.outcome ?? 'not-evaluated',
    prescanStatus: candidate.prescan?.status ?? null,
    websites: candidate.websiteCandidates.map((website) => ({
      raw: website.raw,
      kind: website.kind,
      hostname: website.hostname ?? null,
      registrableDomain: website.registrableDomain ?? null,
      unusableReason: website.unusableReason ?? null,
    })),
    conflicts: conflicts?.conflicts ?? [],
    sourceRefs: conflicts?.sourceRefs ?? [],
    qualification,
    prescan,
    evidence,
    score,
    contact,
    thread,
    preview,
    outcomes,
  };
}
