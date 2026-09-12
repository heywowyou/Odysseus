import type { Connection } from 'mongoose';
import type {
  HotelCampaignEligibility,
  HotelCandidateReviewState,
  HotelGroupStatus,
  HotelIdentityStatus,
  HotelQualificationOutcome,
} from '@odysseus/core';
import {
  createJob,
  findOutreachThreadByCandidate,
  getOperatorProspect,
  getOutreachAuditStatus,
  getProspectPreviewView,
  getProspectQualificationHistory,
  getSeverityRollup,
  listOperatorProspects,
  planOutreachFullScan,
  recordHotelCandidateReview,
} from '@odysseus/store';
import type { ListOperatorProspectsOptions, OperatorProspectQueue } from '@odysseus/store';
import { createFollowUpForCandidate, createTouchOneDraft } from '../outreach/draft-runtime.js';
import { createConfiguredPreviewPublisher } from '../outreach/configured-preview-publisher.js';
import { createMongoOutreachPreviewStore } from '../outreach/mongo-outreach-preview-store.js';
import { revokePreviewsForDomain } from '../outreach/publish-preview.js';
import { CURRENT_PRESCAN_VERSION } from '../prospecting/hotel-prescan/prescan-hotels.js';
import { CURRENT_QUALIFICATION_VERSION } from '../prospecting/hotel-qualification/qualify-hotels.js';
import type { JobQueue } from '../queue/job-queue.js';
import type { Router } from '../router.js';
import { jsonBodyNotRead, readJsonBodyOrRespond, sendError, sendJson } from '../http-utils.js';

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

/** Revocation reason for dashboard-triggered withdrawals, matching the CLI
 *  revoke command's default: a fixed string, never operator free prose. */
const DASHBOARD_REVOKE_REASON = 'operator request';

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
 *  queries Mongoose directly. `queue` is optional so unit tests can mount
 *  the routes without a worker; the outreach full-scan start action only
 *  uses it to wake the worker promptly. */
export function registerProspectRoutes(
  router: Router,
  connection: Connection,
  queue?: JobQueue,
): void {
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
    // Plan 037: the same fail-closed plan the start action validates, so
    // the action card can show the button (or the reason it is absent)
    // without a second validation path drifting from the real one.
    const plan = await planOutreachFullScan(connection, candidateId, {
      qualificationVersion: CURRENT_QUALIFICATION_VERSION,
    });
    // Plan 040 slice 4: the hub's Audit section reads the candidate's
    // latest outreach audit identity and severity totals here, and the id
    // of a scan still in flight. The report lifecycle stays on
    // GET /api/audits/:auditId, which computes it from the stored pair.
    const auditStatus = await getOutreachAuditStatus(connection, candidateId);
    const severityRollup =
      auditStatus.audit === null
        ? null
        : await getSeverityRollup(connection, auditStatus.audit.auditId);
    sendJson(res, 200, {
      ...detail,
      qualificationHistory,
      outreachScan:
        'refused' in plan ? { canStart: false, refusal: plan.refused } : { canStart: true },
      outreachScanJobId: auditStatus.runningJobId,
      outreachAudit:
        auditStatus.audit === null || severityRollup === null
          ? null
          : { ...auditStatus.audit, severityRollup },
    });
  });

  router.post('/api/prospects/:candidateId/review', async ({ req, res, params }) => {
    const candidateId = params['candidateId']!;
    if (!isPlausibleCandidateId(candidateId)) {
      sendError(res, 400, 'candidateId must be a non-empty string without control characters');
      return;
    }

    const body = await readJsonBodyOrRespond(req, res);
    if (body === jsonBodyNotRead) return;

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

  // Plan 037: start a candidate-linked outreach full scan. The route takes
  // no domain, no URL, and no options from the client: everything the scan
  // needs is resolved server-side from the candidate record, and the plan
  // helper's validations (cohort selection, current qualification, own
  // domain, suppression, duplicates) are the only path in.
  router.post('/api/prospects/:candidateId/outreach/full-scan', async ({ res, params }) => {
    const candidateId = params['candidateId']!;
    if (!isPlausibleCandidateId(candidateId)) {
      sendError(res, 400, 'candidateId must be a non-empty string without control characters');
      return;
    }
    const plan = await planOutreachFullScan(connection, candidateId, {
      qualificationVersion: CURRENT_QUALIFICATION_VERSION,
    });
    if ('refused' in plan) {
      if (plan.refused === 'candidate-unknown') {
        sendError(res, 404, 'candidate not found');
        return;
      }
      sendJson(res, 200, { started: false, refusal: plan.refused });
      return;
    }
    const job = await createJob(connection, {
      type: 'outreach-full-scan',
      siteUrl: `https://${plan.domain}`,
      options: {
        domain: plan.domain,
        outreachCandidateId: plan.candidateId,
        outreachCohortId: plan.cohortId,
        outreachScoringVersion: plan.scoringVersion,
      },
    });
    queue?.notify();
    sendJson(res, 201, { started: true, jobId: job.jobId });
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

  // Single-candidate, single-touch action: one LLM call, one preview
  // publish, one Gmail draft call, the same synchronous-route shape as
  // `/review` above rather than the job queue, which plan 030 reserves for
  // multi-candidate batches. `createTouchOneDraft` refuses (never throws)
  // when a thread already exists or the candidate is not contactable; a
  // refusal is a correct, complete outcome, so it comes back 200 with the
  // typed refusal code in the body for the dashboard to read, exactly like
  // the CLI's own JSON output. Only "no mailbox configured" is a genuine
  // operator setup problem, so that alone is a non-2xx (503).
  router.post('/api/prospects/:candidateId/outreach/draft', async ({ req, res, params }) => {
    const candidateId = params['candidateId']!;
    if (!isPlausibleCandidateId(candidateId)) {
      sendError(res, 400, 'candidateId must be a non-empty string without control characters');
      return;
    }
    // Plan 037: the body carries the one-time token of the already
    // published v2 preview the email will link. The route can no longer
    // publish or reissue a preview as a side effect of drafting.
    const body = await readJsonBodyOrRespond(req, res);
    if (body === jsonBodyNotRead) return;
    const rawToken =
      body !== null && typeof body === 'object'
        ? (body as Record<string, unknown>)['previewToken']
        : undefined;
    if (typeof rawToken !== 'string' || rawToken.trim() === '') {
      sendJson(res, 200, { created: false, refusal: 'preview-not-published' });
      return;
    }
    const outcome = await createTouchOneDraft(connection, candidateId, {
      language: 'fr',
      dryRun: false,
      previewToken: rawToken.trim(),
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

  // Issue #97: the dashboard counterpart of `odysseus prospect preview
  // revoke`, again through the same server-side function. The domain comes
  // from the candidate's own latest preview record, so the route never takes
  // a domain from the client. Like the CLI path, the stored object is deleted
  // first: a record can never read revoked while the link still serves.
  router.post('/api/prospects/:candidateId/preview/revoke', async ({ res, params }) => {
    const candidateId = params['candidateId']!;
    if (!isPlausibleCandidateId(candidateId)) {
      sendError(res, 400, 'candidateId must be a non-empty string without control characters');
      return;
    }
    const preview = await getProspectPreviewView(connection, candidateId);
    if (preview === null) {
      sendError(res, 404, 'no preview found for this candidate');
      return;
    }
    let publisher;
    try {
      publisher = createConfiguredPreviewPublisher();
    } catch {
      sendError(res, 503, 'the preview bucket is not configured on this machine');
      return;
    }
    const result = await revokePreviewsForDomain({
      store: createMongoOutreachPreviewStore(connection, {
        prescanVersion: CURRENT_PRESCAN_VERSION,
        qualificationVersion: CURRENT_QUALIFICATION_VERSION,
      }),
      publisher,
      domain: preview.domain,
      reason: DASHBOARD_REVOKE_REASON,
    });
    sendJson(res, 200, { revoked: result.revoked, alreadyRevoked: result.alreadyRevoked });
  });
}
