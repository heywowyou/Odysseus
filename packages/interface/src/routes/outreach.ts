import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connection } from 'mongoose';
import { isOutreachLostReason, isOutreachOutcome } from '@odysseus/core';
import {
  addSuppressionEntry,
  closeOutreachThreadsForDomain,
  createJob,
  findOutreachDraftById,
  findOutreachThreadById,
  getHotelCandidate,
  getOutcomeSummary,
  isSuppressed,
  listLivePreviewsForDomain,
  listOutreachOutcomes,
  listOutreachReviewDrafts,
  listRepliesNeedingReview,
  markOutreachThreadSynced,
  recordOutreachDraftReview,
  recordOutreachOutcome,
  revokeOutreachPreview,
} from '@odysseus/store';
import type { Router } from '../router.js';
import { jsonBodyNotRead, readJsonBodyOrRespond, sendError, sendJson } from '../http-utils.js';
import type { JobQueue } from '../queue/job-queue.js';

/** Plan 013 step 4: pending Gmail draft review, replies needing review,
 *  suppression lookup by entered value, and operator outcome actions. Every
 *  handler calls exported @odysseus/store helpers, never queries Mongoose
 *  models directly, and nothing here sends, delivers, or makes a provider
 *  request beyond creating a Gmail draft: reviewing a draft records the
 *  operator's outcome (issue #96) and nothing else. Plan 030 adds the two
 *  batch-drafting endpoints, which only enqueue a job the queue then runs
 *  through the same refusal-not-throw orchestrators the single-candidate
 *  routes use. */

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
/** Outcomes are operator-set events with 90 day retention, so the deepest
 *  page any operator realistically asks for stays tiny; the cap only keeps
 *  a hand-built offset from turning into an unbounded collection scan,
 *  because listOutreachOutcomes pages by limit alone. */
const MAX_OUTCOME_SCAN = 2000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shape check only, the same fail-fast role as scans.ts's isPlausibleGlob:
 *  something@domain.tld with no whitespace. Suppression matching does not
 *  need a stricter grammar, and hashing normalizes whatever passes. */
const ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Page windows clamp instead of rejecting, matching pageBounds in
 *  operator-views.ts: a client asking past the cap gets a bounded page, so
 *  there is one hard cap rather than one cap per caller. */
function parsePageQuery(query: URLSearchParams): { limit: number; offset: number } {
  const rawLimit = query.get('limit');
  const rawOffset = query.get('offset');
  const parsedLimit = rawLimit === null ? DEFAULT_PAGE_LIMIT : Number.parseInt(rawLimit, 10);
  const limit = Number.isNaN(parsedLimit)
    ? DEFAULT_PAGE_LIMIT
    : Math.min(Math.max(parsedLimit, 1), MAX_PAGE_LIMIT);
  const parsedOffset = rawOffset === null ? 0 : Number.parseInt(rawOffset, 10);
  const offset = Number.isNaN(parsedOffset) || parsedOffset < 0 ? 0 : parsedOffset;
  return { limit, offset };
}

/** Shared POST body handling: parses JSON, answers 413/400 itself, and
 *  returns null once the response is sent so the caller can just return. */
async function readJsonObjectBody(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<Record<string, unknown> | null> {
  const body = await readJsonBodyOrRespond(req, res);
  if (body === jsonBodyNotRead) return null;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    sendError(res, 400, 'request body must be a JSON object');
    return null;
  }
  return body as Record<string, unknown>;
}

/** Body shape shared by both batch-enqueue routes below. */
function parseBatchLimit(body: Record<string, unknown>): number | null {
  const raw = body['limit'];
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) return null;
  return raw;
}

export function registerOutreachRoutes(
  router: Router,
  connection: Connection,
  queue: JobQueue,
): void {
  // Pending review Gmail drafts across candidates, metadata only.
  router.get('/api/outreach/drafts', async ({ res, query }) => {
    const page = await listOutreachReviewDrafts(connection, parsePageQuery(query));
    sendJson(res, 200, page);
  });

  // Issue #15: the exact subject and body of one live draft. The text is
  // persisted with the row precisely so the operator can still read it once
  // the one-time CLI output is gone, and this is the only dashboard surface
  // that serves it - the list endpoint above stays metadata-only. Read-only
  // like every handler in this module: nothing sends, edits, or deletes.
  // Only status 'created' is served, so a draft reviewed mid-flight reads
  // back as gone (404) instead of half-leaving the review flow, and the
  // providerThreadId-less failed rows (empty text by store design) are
  // unreachable here too.
  router.get('/api/outreach/drafts/:draftId/text', async ({ res, params }) => {
    const draftId = params['draftId'] ?? '';
    if (!UUID_PATTERN.test(draftId)) {
      sendError(res, 400, 'draftId must be a UUID');
      return;
    }
    const draft = await findOutreachDraftById(connection, draftId);
    if (draft === null || draft.status !== 'created') {
      sendError(res, 404, 'no live draft found for this id');
      return;
    }
    // The candidate's name travels along so the dialog shows a hotel, not a
    // bare id; an unknown candidate degrades to null rather than failing a
    // read whose text is already on the row.
    const candidate = await getHotelCandidate(connection, draft.candidateId);
    sendJson(res, 200, {
      draftId: draft.draftId,
      threadId: draft.threadId,
      candidateId: draft.candidateId,
      businessName: candidate?.name ?? null,
      touch: draft.touch,
      language: draft.language,
      recipient: draft.roleAddress,
      subject: draft.subject,
      body: draft.body,
      createdAt: draft.createdAt,
    });
  });

  // Issue #96: approve and skip now persist distinct review outcomes on the
  // draft row (approved vs skipped) while making the same `deleted` status
  // transition review has always made. Still nothing is sent, edited, or
  // created anywhere, and the Gmail draft itself is untouched.
  router.post('/api/outreach/drafts/:draftId/review', async ({ req, res, params }) => {
    const draftId = params['draftId'] ?? '';
    if (!UUID_PATTERN.test(draftId)) {
      sendError(res, 400, 'draftId must be a UUID');
      return;
    }
    const body = await readJsonObjectBody(req, res);
    if (body === null) return;
    const action = body['action'];
    if (action !== 'approve' && action !== 'skip') {
      sendError(res, 400, 'action must be "approve" or "skip"');
      return;
    }
    const draft = await findOutreachDraftById(connection, draftId);
    if (draft === null) {
      sendError(res, 404, 'draft not found');
      return;
    }
    const { changed } = await recordOutreachDraftReview(
      connection,
      draftId,
      action === 'approve' ? 'approved' : 'skipped',
    );
    sendJson(res, 200, { draftId, action, changed });
  });

  // Threads whose reply state a sync could not classify, metadata only:
  // never the reply text, which the store does not keep in the first place.
  router.get('/api/outreach/replies', async ({ res, query }) => {
    const page = await listRepliesNeedingReview(connection, parsePageQuery(query));
    sendJson(res, 200, page);
  });

  // Resolve an ambiguity flag. The flag is what blocks follow-ups while the
  // state is unknown; clearing it is the operator's judgement call, and the
  // thread state machine still decides what may happen next.
  router.post('/api/outreach/replies/:threadId/review', async ({ res, params }) => {
    const threadId = params['threadId'] ?? '';
    if (!UUID_PATTERN.test(threadId)) {
      sendError(res, 400, 'threadId must be a UUID');
      return;
    }
    const thread = await findOutreachThreadById(connection, threadId);
    if (thread === null) {
      sendError(res, 404, 'thread not found');
      return;
    }
    await markOutreachThreadSynced(connection, threadId, new Date());
    sendJson(res, 200, { threadId, reviewed: true });
  });

  // Check one entered address against suppression. Hashing happens inside
  // isSuppressed through the same core helpers the write path uses, so the
  // entered value and its hash exist only in this call's memory: nothing is
  // persisted, echoed, or listed.
  router.post('/api/outreach/suppression-check', async ({ req, res }) => {
    const body = await readJsonObjectBody(req, res);
    if (body === null) return;
    const raw = body['address'];
    if (typeof raw !== 'string' || !ADDRESS_PATTERN.test(raw.trim())) {
      sendError(res, 400, 'address must be a valid email address');
      return;
    }
    const address = raw.trim();
    const domain = address.slice(address.indexOf('@') + 1);
    const suppressed = await isSuppressed(connection, domain, address);
    sendJson(res, 200, { suppressed });
  });

  // Privacy-safe outcome counts plus the newest outcome events. Event rows
  // are an explicit pick of the stored document: thread and candidate ids,
  // the categorical value, and who set it when.
  router.get('/api/outreach/outcomes', async ({ res, query }) => {
    const { limit, offset } = parsePageQuery(query);
    const [summary, events] = await Promise.all([
      getOutcomeSummary(connection),
      listOutreachOutcomes(connection, { limit: Math.min(offset + limit, MAX_OUTCOME_SCAN) }),
    ]);
    const rows = events.slice(offset).map((event) => ({
      outcomeId: event.outcomeId,
      threadId: event.threadId,
      candidateId: event.candidateId,
      outcome: event.outcome,
      lostReason: event.lostReason ?? null,
      actor: event.actor,
      recordedAt: event.recordedAt,
    }));
    sendJson(res, 200, { summary, rows, total: summary.total, limit, offset });
  });

  // Record one operator-set categorical outcome and point the thread at it
  // (recordOutreachOutcome owns the idempotency key and the pointer write).
  router.post('/api/outreach/threads/:threadId/outcome', async ({ req, res, params }) => {
    const threadId = params['threadId'] ?? '';
    if (!UUID_PATTERN.test(threadId)) {
      sendError(res, 400, 'threadId must be a UUID');
      return;
    }
    const body = await readJsonObjectBody(req, res);
    if (body === null) return;
    const rawOutcome = body['outcome'];
    if (typeof rawOutcome !== 'string' || !isOutreachOutcome(rawOutcome)) {
      sendError(res, 400, 'outcome must be one of the categorical outcome values');
      return;
    }
    const rawLostReason = body['lostReason'];
    if (rawLostReason !== undefined) {
      if (typeof rawLostReason !== 'string' || !isOutreachLostReason(rawLostReason)) {
        sendError(res, 400, 'lostReason must be one of the controlled lost reason values');
        return;
      }
      if (rawOutcome !== 'lost') {
        sendError(res, 400, 'lostReason is allowed only when outcome is lost');
        return;
      }
    }
    const rawActor = body['actor'];
    const actor =
      typeof rawActor === 'string' && rawActor.trim() !== '' ? rawActor.trim() : 'operator';
    const result = await recordOutreachOutcome(connection, {
      threadId,
      outcome: rawOutcome,
      ...(typeof rawLostReason === 'string' ? { lostReason: rawLostReason } : {}),
      actor,
      recordedAt: new Date(),
    });
    if ('reason' in result) {
      sendError(res, 404, 'thread not found');
      return;
    }
    sendJson(res, 200, {
      recorded: result.recorded,
      outcomeId: result.outcome.outcomeId,
      threadId: result.outcome.threadId,
      outcome: result.outcome.outcome,
      lostReason: result.outcome.lostReason ?? null,
      actor: result.outcome.actor,
      recordedAt: result.outcome.recordedAt,
    });
  });

  // The plan 012 objection flow, keyed by thread and reduced to what a
  // route may do: suppression write first, then preview revocation, then
  // thread closing, all idempotent. Storage object deletion and provider
  // draft deletion remain the CLI objection command's job - the interface
  // never makes a provider request. Only counts are echoed, never the
  // address or any hash.
  router.post('/api/outreach/threads/:threadId/opt-out', async ({ res, params }) => {
    const threadId = params['threadId'] ?? '';
    if (!UUID_PATTERN.test(threadId)) {
      sendError(res, 400, 'threadId must be a UUID');
      return;
    }
    const thread = await findOutreachThreadById(connection, threadId);
    if (thread === null) {
      sendError(res, 404, 'thread not found');
      return;
    }
    const reason = 'opt-out recorded by the operator';
    await addSuppressionEntry(connection, {
      domain: thread.domain,
      address: thread.roleAddress,
      reasonCode: 'objection',
      reason,
    });
    const live = await listLivePreviewsForDomain(connection, thread.domain);
    let previewsRevoked = 0;
    for (const preview of live) {
      const result = await revokeOutreachPreview(connection, preview.previewId, reason);
      if (result.changed) previewsRevoked += 1;
    }
    const threads = await closeOutreachThreadsForDomain(connection, thread.domain, reason);
    sendJson(res, 200, {
      threadId,
      suppressed: true,
      previewsRevoked,
      threadsClosed: threads.closed,
    });
  });

  // Milestone 9c plan 030: dashboard-triggered equivalent of
  // `odysseus prospect draft batch`. Runs through the job queue, not
  // synchronously, because a real batch is tens of seconds to minutes of
  // LLM and Gmail round trips - see run-outreach-draft-batch-job.ts.
  router.post('/api/outreach/draft-batch', async ({ req, res }) => {
    const body = await readJsonObjectBody(req, res);
    if (body === null) return;
    const limit = parseBatchLimit(body);
    if (limit === null) {
      sendError(res, 400, 'limit must be a positive integer');
      return;
    }
    const rawLanguage = body['language'];
    if (rawLanguage !== undefined && rawLanguage !== 'fr' && rawLanguage !== 'en') {
      sendError(res, 400, 'language must be "fr" or "en"');
      return;
    }
    const job = await createJob(connection, {
      type: 'outreach-draft-batch',
      options: { limit, ...(rawLanguage === undefined ? {} : { language: rawLanguage }) },
    });
    queue.notify();
    sendJson(res, 201, { jobId: job.jobId });
  });

  // Follow-up counterpart of draft-batch above, running
  // run-outreach-followup-batch-job.ts.
  router.post('/api/outreach/followup-batch', async ({ req, res }) => {
    const body = await readJsonObjectBody(req, res);
    if (body === null) return;
    const limit = parseBatchLimit(body);
    if (limit === null) {
      sendError(res, 400, 'limit must be a positive integer');
      return;
    }
    const job = await createJob(connection, {
      type: 'outreach-followup-batch',
      options: { limit },
    });
    queue.notify();
    sendJson(res, 201, { jobId: job.jobId });
  });
}
