import type { Connection } from 'mongoose';
import type {
  HotelCampaignEligibility,
  HotelCandidateReviewState,
  HotelGroupStatus,
  HotelIdentityStatus,
  HotelQualificationOutcome,
} from '@odysseus/core';
import {
  HOTEL_EVIDENCE_MIN_SUMMARIES,
  HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
} from '@odysseus/core';
import { generateOutreachPreviewHtml } from '@odysseus/report';
import {
  findOutreachThreadByCandidate,
  getOperatorProspect,
  getProspectQualificationHistory,
  listOperatorProspects,
  recordHotelCandidateReview,
} from '@odysseus/store';
import type { ListOperatorProspectsOptions, OperatorProspectQueue } from '@odysseus/store';
import { getPreviewPublicBaseUrl } from '../config.js';
import { createFollowUpForCandidate, createTouchOneDraft } from '../outreach/draft-runtime.js';
import { createMongoOutreachPreviewStore } from '../outreach/mongo-outreach-preview-store.js';
import { buildPreviewInput, type PublishPreviewRefusal } from '../outreach/publish-preview.js';
import { CURRENT_PRESCAN_VERSION } from '../prospecting/hotel-prescan/prescan-hotels.js';
import { CURRENT_QUALIFICATION_VERSION } from '../prospecting/hotel-qualification/qualify-hotels.js';
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

/** Free-text search is an unbounded string by nature; this cap keeps one
 *  query from carrying a pathological payload while staying far above any
 *  name, commune, or candidate id an operator would paste. */
const SEARCH_MAX_LENGTH = 100;

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

  const rawSearch = query.get('q');
  if (rawSearch !== null) {
    const search = rawSearch.trim();
    // Blank means "no search", matching a client that clears the field,
    // rather than an error: the other params reject empties because an
    // empty enum value cannot name a state.
    if (search !== '') {
      if (search.length > SEARCH_MAX_LENGTH) {
        throw new ProspectRequestError(`q must be at most ${SEARCH_MAX_LENGTH} characters`);
      }
      options.search = search;
    }
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

type PreviewRenderRefusal = Exclude<PublishPreviewRefusal, 'suppressed'>;

type PreviewRenderResponse =
  { rendered: true; html: string } | { rendered: false; refusal: PreviewRenderRefusal };

function previewRenderRefusal(refusal: PreviewRenderRefusal): PreviewRenderResponse {
  return { rendered: false, refusal };
}

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

  // Milestone 9c plan 030. The dashboard's Outreach sub-page reads this to
  // decide which action it can offer: nothing yet (first draft), due for a
  // follow-up, or an existing thread with no action available.
  router.get('/api/prospects/:candidateId/outreach', async ({ res, params }) => {
    const candidateId = params['candidateId']!;
    if (!isPlausibleCandidateId(candidateId)) {
      sendError(res, 400, 'candidateId must be a non-empty string without control characters');
      return;
    }
    const thread = await findOutreachThreadByCandidate(connection, candidateId);
    if (thread === null) {
      sendJson(res, 200, { thread: null });
      return;
    }
    sendJson(res, 200, {
      thread: {
        threadId: thread.threadId,
        state: thread.state,
        currentTouch: thread.currentTouch,
      },
    });
  });

  // This renders from the current stored evidence rather than attempting to
  // recover the bearer-token URL or published object. The same mapping as
  // publication makes a re-render safe to inspect while leaving publication
  // state and every bucket operation out of this read path.
  router.get('/api/prospects/:candidateId/outreach/preview-render', async ({ res, params }) => {
    const candidateId = params['candidateId']!;
    if (!isPlausibleCandidateId(candidateId)) {
      sendError(res, 400, 'candidateId must be a non-empty string without control characters');
      return;
    }

    const store = createMongoOutreachPreviewStore(connection, {
      prescanVersion: CURRENT_PRESCAN_VERSION,
      qualificationVersion: CURRENT_QUALIFICATION_VERSION,
    });
    const row = await store.findPublicationRow(candidateId);
    // The port deliberately collapses a missing candidate and a missing
    // current-version prescan, exactly as publication does. It must not add a
    // second store read solely to make this dashboard response more specific.
    if (row === null) {
      sendJson(res, 200, previewRenderRefusal('candidate-unknown'));
      return;
    }

    const evidence = row.evidence;
    if (evidence === undefined || evidence.status !== 'complete') {
      sendJson(res, 200, previewRenderRefusal('evidence-incomplete'));
      return;
    }
    if (evidence.schemaVersion !== HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION) {
      sendJson(res, 200, previewRenderRefusal('evidence-schema-outdated'));
      return;
    }
    if (evidence.summaries.length < HOTEL_EVIDENCE_MIN_SUMMARIES) {
      sendJson(res, 200, previewRenderRefusal('evidence-incomplete'));
      return;
    }
    if (row.prescanExpiresAt.getTime() <= Date.now()) {
      sendJson(res, 200, previewRenderRefusal('prescan-expired'));
      return;
    }

    const input = await buildPreviewInput({
      row,
      evidence,
      language: 'fr',
      publicBaseUrl: getPreviewPublicBaseUrl(),
    });
    sendJson(res, 200, { rendered: true, html: generateOutreachPreviewHtml(input) });
  });

  // Single-candidate, single-touch action: one LLM call, one preview
  // publish, one Gmail draft call, the same synchronous-route shape as
  // `/review` above rather than the job queue, which plan 030 reserves for
  // multi-candidate batches. `createTouchOneDraft` refuses (never throws)
  // when a thread already exists or the candidate is not contactable; a
  // refusal is a correct, complete outcome, so it comes back 200 with the
  // typed refusal code in the body for the dashboard to read, exactly like
  // the CLI's own JSON output. Only "no mailbox configured" is a genuine
  // operator setup problem, so that alone is a non-2xx (503).
  router.post('/api/prospects/:candidateId/outreach/draft', async ({ res, params }) => {
    const candidateId = params['candidateId']!;
    if (!isPlausibleCandidateId(candidateId)) {
      sendError(res, 400, 'candidateId must be a non-empty string without control characters');
      return;
    }
    const outcome = await createTouchOneDraft(connection, candidateId, {
      language: 'fr',
      dryRun: false,
    });
    if (!outcome.configured) {
      sendError(res, 503, `no mailbox is configured (${outcome.refusal})`);
      return;
    }
    const { configured: _configured, ...result } = outcome;
    sendJson(res, 200, result);
  });

  // Follow-up (touch 2 or 3) for a candidate's existing thread. 404s if no
  // thread exists yet, since a follow-up is only ever a continuation.
  router.post('/api/prospects/:candidateId/outreach/follow-up', async ({ res, params }) => {
    const candidateId = params['candidateId']!;
    if (!isPlausibleCandidateId(candidateId)) {
      sendError(res, 400, 'candidateId must be a non-empty string without control characters');
      return;
    }
    const thread = await findOutreachThreadByCandidate(connection, candidateId);
    if (thread === null) {
      sendError(res, 404, 'no outreach thread for this candidate yet');
      return;
    }
    const outcome = await createFollowUpForCandidate(connection, thread.threadId, {
      dryRun: false,
    });
    if (!outcome.configured) {
      sendError(res, 503, `no mailbox is configured (${outcome.refusal})`);
      return;
    }
    const { configured: _configured, ...result } = outcome;
    sendJson(res, 200, result);
  });
}
