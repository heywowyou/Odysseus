import type { Connection } from 'mongoose';
import type {
  HotelCampaignEligibility,
  HotelCandidateReviewState,
  HotelGroupStatus,
  HotelIdentityStatus,
  HotelQualificationOutcome,
} from '@odysseus/core';
import {
  getOperatorProspect,
  getProspectQualificationHistory,
  listOperatorProspects,
  recordHotelCandidateReview,
} from '@odysseus/store';
import type { ListOperatorProspectsOptions, OperatorProspectQueue } from '@odysseus/store';
import type { Router } from '../router.js';
import { PayloadTooLargeError, readJsonBody, sendError, sendJson } from '../http-utils.js';

/** How many qualification generations one detail response carries. The
 *  catalogue pointer holds only the current generation; the history page is
 *  what lets an operator see an outcome change over time. Bounded by the
 *  same rule as every operator view: a detail must never grow with the
 *  collection. */
const DETAIL_QUALIFICATION_HISTORY_LIMIT = 10;

const QUEUES: readonly OperatorProspectQueue[] = [
  'join-review',
  'parked',
  'rejected',
  'already-engaged',
  'groups',
];

const IDENTITY_STATUSES: readonly HotelIdentityStatus[] = [
  'resolved',
  'needs-review',
  'ambiguous',
  'unmatched',
];

const GROUP_STATUSES: readonly HotelGroupStatus[] = [
  'independent',
  'group-member',
  'vendor-hosted',
  'unknown',
];

const REVIEW_STATES: readonly HotelCandidateReviewState[] = [
  'not-required',
  'pending',
  'accepted',
  'rejected',
];

/** `not-evaluated` is a route-level filter value (candidates no
 *  qualification generation has reached), not a stored outcome. */
const QUALIFICATION_OUTCOMES: readonly (HotelQualificationOutcome | 'not-evaluated')[] = [
  'qualified',
  'parked',
  'rejected',
  'already-engaged',
  'group-routed',
  'not-evaluated',
];

const CAMPAIGN_ELIGIBILITIES: readonly HotelCampaignEligibility[] = [
  'eligible',
  'parked-below-three-stars',
  'parked-unknown-rating',
];

/** Thrown at this module's boundary so a bad query or body fails fast with
 *  400 instead of travelling into the store (rule: fail fast at the
 *  boundary, same as routes/scans.ts). */
class ProspectRequestError extends Error {}

function requireEnumValue<T extends string>(raw: string, name: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new ProspectRequestError(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return raw as T;
}

function requirePageValue(raw: string, name: string, minimum: number): number {
  if (!/^\d+$/.test(raw)) {
    throw new ProspectRequestError(`${name} must be a whole number`);
  }
  const value = Number.parseInt(raw, 10);
  if (value < minimum) {
    throw new ProspectRequestError(`${name} must be at least ${minimum}`);
  }
  return value;
}

/** Query params map one-to-one onto ListOperatorProspectsOptions fields.
 *  The store clamps an oversized limit instead of rejecting it (one hard
 *  cap there), so this boundary only rejects values that are not page
 *  numbers at all. */
function parseListQuery(query: URLSearchParams): ListOperatorProspectsOptions {
  const options: ListOperatorProspectsOptions = {};

  const rawQueue = query.get('queue');
  if (rawQueue !== null && rawQueue !== 'all') {
    options.queue = requireEnumValue(rawQueue, 'queue', QUEUES);
  }

  const rawIdentity = query.get('identityStatus');
  if (rawIdentity !== null)
    options.identityStatus = requireEnumValue(rawIdentity, 'identityStatus', IDENTITY_STATUSES);

  const rawGroup = query.get('groupStatus');
  if (rawGroup !== null)
    options.groupStatus = requireEnumValue(rawGroup, 'groupStatus', GROUP_STATUSES);

  const rawReview = query.get('reviewState');
  if (rawReview !== null)
    options.reviewState = requireEnumValue(rawReview, 'reviewState', REVIEW_STATES);

  const rawQualification = query.get('qualificationOutcome');
  if (rawQualification !== null) {
    options.qualificationOutcome = requireEnumValue(
      rawQualification,
      'qualificationOutcome',
      QUALIFICATION_OUTCOMES,
    );
  }

  const rawEligibility = query.get('campaignEligibility');
  if (rawEligibility !== null) {
    options.campaignEligibility = requireEnumValue(
      rawEligibility,
      'campaignEligibility',
      CAMPAIGN_ELIGIBILITIES,
    );
  }

  const rawVersion = query.get('resolutionVersion');
  if (rawVersion !== null) {
    const version = rawVersion.trim();
    if (version === '') throw new ProspectRequestError('resolutionVersion must not be empty');
    options.resolutionVersion = version;
  }

  const rawLimit = query.get('limit');
  if (rawLimit !== null) options.limit = requirePageValue(rawLimit, 'limit', 1);
  const rawOffset = query.get('offset');
  if (rawOffset !== null) options.offset = requirePageValue(rawOffset, 'offset', 0);

  return options;
}

/** Boundary shape check only (the scans.ts rule): a candidate id is a
 *  bounded string of printable characters. Existence stays the store's
 *  answer, surfaced as 404. */
function isPlausibleCandidateId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    !/[\x00-\x1f\x7f]/.test(value)
  );
}

/** The dashboard is a single-operator private console (127.0.0.1 only), so
 *  the actor recorded on every review decision is the console itself; the
 *  CLI's `odysseus prospect hotel-review` remains the path for attributed
 *  decisions. */
const REVIEW_ACTOR = 'dashboard';

/** recordHotelCandidateReview requires a reason string; the dashboard
 *  confirm dialogs carry no free-text field, so the stored reason names the
 *  surface rather than inventing an explanation. */
const REVIEW_REASON_FALLBACK = 'dashboard-review';

const REASON_MAX_LENGTH = 500;

interface ReviewBody {
  decision: 'accepted' | 'rejected';
  reason: string;
}

function parseReviewBody(raw: unknown): ReviewBody {
  if (raw === null || typeof raw !== 'object') {
    throw new ProspectRequestError('request body must be a JSON object');
  }
  const record = raw as Record<string, unknown>;
  const action = record['action'];
  if (action !== 'accept' && action !== 'reject') {
    throw new ProspectRequestError('action must be "accept" or "reject"');
  }
  let reason = REVIEW_REASON_FALLBACK;
  const rawReason = record['reason'];
  if (rawReason !== undefined) {
    if (typeof rawReason !== 'string') {
      throw new ProspectRequestError('reason must be a string');
    }
    const trimmed = rawReason.trim();
    if (trimmed.length > REASON_MAX_LENGTH) {
      throw new ProspectRequestError(`reason must be at most ${REASON_MAX_LENGTH} characters`);
    }
    if (trimmed !== '') reason = trimmed;
  }
  return { decision: action === 'accept' ? 'accepted' : 'rejected', reason };
}

/** Registers the plan 013 slice 2 endpoints: the filterable prospect list,
 *  the composed prospect detail, and the manual review action. Every route
 *  here goes through operator-views / hotel-candidates store helpers; none
 *  queries Mongoose directly. */
export function registerProspectRoutes(router: Router, connection: Connection): void {
  router.get('/api/prospects', async ({ res, query }) => {
    let options: ListOperatorProspectsOptions;
    try {
      options = parseListQuery(query);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'invalid query');
      return;
    }
    const page = await listOperatorProspects(connection, options);
    sendJson(res, 200, page);
  });

  router.get('/api/prospects/:candidateId', async ({ res, params }) => {
    const candidateId = params['candidateId']!;
    if (!isPlausibleCandidateId(candidateId)) {
      sendError(res, 400, 'candidateId must be a non-empty string without control characters');
      return;
    }
    const detail = await getOperatorProspect(connection, candidateId);
    if (detail === null) {
      sendError(res, 404, 'prospect not found');
      return;
    }
    // getOperatorProspect already composes the source-conflict, contact,
    // thread, and outcome views (identical shapes to calling
    // getProspectSourceConflicts / getProspectThreadView /
    // getProspectContactView / getProspectOutcomeView again); the one view
    // it does not carry is the qualification history beyond the current
    // pointer, so that is the only extra read.
    const qualificationHistory = await getProspectQualificationHistory(connection, candidateId, {
      limit: DETAIL_QUALIFICATION_HISTORY_LIMIT,
      offset: 0,
    });
    sendJson(res, 200, { ...detail, qualificationHistory });
  });

  router.post('/api/prospects/:candidateId/review', async ({ req, res, params }) => {
    const candidateId = params['candidateId']!;
    if (!isPlausibleCandidateId(candidateId)) {
      sendError(res, 400, 'candidateId must be a non-empty string without control characters');
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        sendError(res, 413, 'request body is too large');
        return;
      }
      sendError(res, 400, 'request body must be valid JSON');
      return;
    }

    let parsed: ReviewBody;
    try {
      parsed = parseReviewBody(body);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'invalid review body');
      return;
    }

    const result = await recordHotelCandidateReview(connection, {
      candidateId,
      decision: parsed.decision,
      actor: REVIEW_ACTOR,
      reason: parsed.reason,
    });
    // Idempotent by store semantics: the same decision recorded again
    // returns changed: false with 200, not an error.
    if (!result.found) {
      sendError(res, 404, 'prospect not found');
      return;
    }
    sendJson(res, 200, {
      candidateId,
      reviewState: parsed.decision,
      changed: result.changed,
    });
  });
}
