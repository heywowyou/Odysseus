/**
 * Read/write helpers around the `outreach_drafts` collection, milestone 9c
 * plan 011.
 *
 * Insert-only, like scores and cohorts. There is no helper that edits a
 * draft's text, and there is deliberately no way to write one: a draft is an
 * attempt, and changing what an attempt said destroys the only record of what
 * the operator was actually shown.
 *
 * Two mutations, both state transitions rather than edits, both idempotent
 * for the same reason `PreviewPublisher.delete` is: reviewing a draft must not
 * fail because the operator already discarded it in the mail client.
 * `markOutreachDraftDeleted` is the CLI discard path. `recordOutreachDraftReview`
 * (issue #96) is the dashboard review path: it makes the same `deleted`
 * transition and additionally records which way the operator went, so campaign
 * analysis can distinguish "reviewed and approved" from "reviewed and
 * discarded" without re-semanting the status every other consumer reads.
 *
 * `recordFailedOutreachDraft` exists so a refusal leaves evidence. A run that
 * correctly declined to create a draft and stored nothing is indistinguishable
 * from a run that never happened, and the difference matters when the question
 * is why a selected hotel was never contacted.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import {
  createOutreachDraftModel,
  type OutreachDraftDocument,
  type OutreachDraftReviewOutcome,
} from './schemas/outreach-draft.schema.js';
import { draftedOutreachTouch, type OutreachThreadState } from '@odysseus/core';
import { advanceProspectStatus, appendProspectEvent } from './prospect-hub.js';
import {
  findOutreachThreadByProspect,
  recordOutreachThreadTouchSent,
  transitionOutreachThread,
} from './outreach-threads.js';

export type { OutreachDraftReviewOutcome };

/** Thread state reason for a send the operator confirmed by hand. */
const OPERATOR_CONFIRMED_SEND = 'operator-confirmed-send';

/** Operational retention, per docs/rules/prospect-qualification.md section 7. */
const OUTREACH_DRAFT_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Kept beside the text rather than instead of it: once the TTL removes the
 *  body, the hashes in a thread's history are what still prove two touches
 *  were not the same message. */
function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export interface RecordOutreachDraftInput {
  prospectId: string;
  threadId: string;
  touch: number;
  language: 'fr' | 'en';
  roleAddress: string;
  subject: string;
  body: string;
  htmlBody: string;
  /** Touch 1 only - see the schema's own note. */
  previewId?: string;
  previewUrl?: string;
  referenceAuditUrl?: string;
  referenceAuditVersion?: string;
  referenceAuditTokenHash?: string;
  referenceAuditFirstRequestedAt?: Date;
  referenceAuditLastRequestedAt?: Date;
  referenceAuditRequestCount?: number;
  evidenceVersion: string;
  outreachPromptVersion: string;
  providerDraftId: string;
  providerMessageId: string;
  providerThreadId: string;
  createdAt: Date;
}

class DuplicateLiveDraftError extends Error {
  constructor(threadId: string, touch: number) {
    super(`A live draft already exists for thread ${threadId} touch ${String(touch)}`);
    this.name = 'DuplicateLiveDraftError';
  }
}

/**
 * Store a draft the provider has accepted.
 *
 * Throws `DuplicateLiveDraftError` when the partial unique index rejects the
 * insert, which is the collection refusing a second live draft for the same
 * touch. The orchestrator turns that into a reconciliation: the provider draft
 * it just created has no record, so it deletes it again rather than leaving an
 * unreviewed message in the mailbox.
 */
export async function recordOutreachDraft(
  connection: Connection,
  input: RecordOutreachDraftInput,
): Promise<OutreachDraftDocument> {
  const DraftModel = createOutreachDraftModel(connection);
  await DraftModel.init();

  const document: OutreachDraftDocument = {
    draftId: randomUUID(),
    prospectId: input.prospectId,
    threadId: input.threadId,
    touch: input.touch,
    language: input.language,
    roleAddress: input.roleAddress,
    subject: input.subject,
    body: input.body,
    htmlBody: input.htmlBody,
    subjectHash: hash(input.subject),
    bodyHash: hash(input.body),
    ...(input.previewId !== undefined ? { previewId: input.previewId } : {}),
    ...(input.previewUrl !== undefined ? { previewUrl: input.previewUrl } : {}),
    ...(input.referenceAuditUrl !== undefined
      ? { referenceAuditUrl: input.referenceAuditUrl }
      : {}),
    ...(input.referenceAuditVersion !== undefined
      ? { referenceAuditVersion: input.referenceAuditVersion }
      : {}),
    ...(input.referenceAuditTokenHash !== undefined
      ? { referenceAuditTokenHash: input.referenceAuditTokenHash }
      : {}),
    ...(input.referenceAuditFirstRequestedAt !== undefined
      ? { referenceAuditFirstRequestedAt: input.referenceAuditFirstRequestedAt }
      : {}),
    ...(input.referenceAuditLastRequestedAt !== undefined
      ? { referenceAuditLastRequestedAt: input.referenceAuditLastRequestedAt }
      : {}),
    ...(input.referenceAuditRequestCount !== undefined
      ? { referenceAuditRequestCount: input.referenceAuditRequestCount }
      : {}),
    evidenceVersion: input.evidenceVersion,
    outreachPromptVersion: input.outreachPromptVersion,
    providerDraftId: input.providerDraftId,
    providerMessageId: input.providerMessageId,
    providerThreadId: input.providerThreadId,
    status: 'created',
    createdAt: input.createdAt,
    expiresAt: new Date(input.createdAt.getTime() + OUTREACH_DRAFT_RETENTION_DAYS * DAY_MS),
  };

  try {
    await DraftModel.create(document);
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new DuplicateLiveDraftError(input.threadId, input.touch);
    throw error;
  }
  // Issue #278: a draft is not contact. The prospect status only moves when
  // mailbox reconciliation confirms the send (recordOutreachTouchSent).
  try {
    await appendProspectEvent(connection, {
      eventId: randomUUID(),
      prospectId: input.prospectId,
      type: 'draft-created',
      payload: { draftId: document.draftId, touch: input.touch },
      actor: 'automation',
      at: new Date(),
    });
  } catch (error) {
    // The caller treats a throw as "not recorded" and deletes the provider
    // draft. Retire the local row too, or it stays live with nothing behind
    // it and the one-live-draft index refuses every later attempt.
    await markOutreachDraftDeleted(connection, document.draftId);
    throw error;
  }
  return document;
}

/**
 * The prospect-side effects of a provider-confirmed send: the sent draft
 * leaves review as approved, and the prospect becomes contacted (touch 1) or
 * in follow-up (later touches). Idempotent, so a repeated sync is a no-op.
 */
export async function recordOutreachTouchSent(
  connection: Connection,
  input: { prospectId: string; threadId: string; touch: number; sentAt: Date },
): Promise<void> {
  await createOutreachDraftModel(connection).updateMany(
    { threadId: input.threadId, touch: input.touch, status: 'created' },
    {
      $set: {
        status: 'deleted',
        reviewOutcome: 'approved',
        reviewedAt: input.sentAt,
        deletedAt: input.sentAt,
      },
    },
  );
  await advanceProspectStatus(
    connection,
    input.prospectId,
    input.touch === 1 ? 'contacted' : 'follow-up',
  );
}

export interface OperatorConfirmedOutreachSend {
  /** The drafted touch now recorded as sent, or undefined when nothing was
   *  waiting to be confirmed. */
  touch?: number;
  threadClosed: boolean;
  /** Mailbox drafts the caller still has to delete at the provider. */
  providerDrafts: Array<{ draftId: string; providerDraftId?: string }>;
}

/**
 * The operator says the drafted touch went out in an email the mailbox sync
 * cannot tie to this thread: sent from another thread (one message to a
 * contact shared by several prospects) or from outside the tool. The draft
 * leaves review as approved, the touch is recorded as operator-confirmed, and
 * the thread closes, because every later touch is drafted as a reply inside
 * the Gmail conversation this send never belonged to. Previews stay live: the
 * email that went out may link to them.
 *
 * `status` is the manual prospect status that triggered this: `contacted`
 * confirms touch 1, `follow-up` touch 2 or 3. Idempotent, and a rerun after a
 * partial failure finishes the job, since drafts are withdrawn before the
 * thread leaves its drafted state.
 */
export async function confirmOutreachSentByOperator(
  connection: Connection,
  prospectId: string,
  status: 'contacted' | 'follow-up',
  at = new Date(),
): Promise<OperatorConfirmedOutreachSend> {
  const nothing: OperatorConfirmedOutreachSend = { threadClosed: false, providerDrafts: [] };
  const thread = await findOutreachThreadByProspect(connection, prospectId);
  if (thread === null) return nothing;
  const touch = draftedOutreachTouch(thread.state);
  if (touch === undefined || (status === 'contacted') !== (touch === 1)) return nothing;

  const Drafts = createOutreachDraftModel(connection);
  const drafts = await Drafts.find({
    threadId: thread.threadId,
    touch,
    status: { $in: ['created', 'mailbox-delete-pending'] },
  })
    .select({ draftId: 1, providerDraftId: 1, _id: 0 })
    .lean<{ draftId: string; providerDraftId?: string }[]>();
  // A discarded draft left nothing that could have been sent.
  if (drafts.length === 0) return nothing;
  await Drafts.updateMany(
    { draftId: { $in: drafts.map((draft) => draft.draftId) }, status: 'created' },
    { $set: { status: 'mailbox-delete-pending', reviewOutcome: 'approved', reviewedAt: at } },
  );

  await recordOutreachThreadTouchSent(connection, thread.threadId, {
    touch,
    confirmedBy: 'operator',
    sentAt: at,
    detectedAt: at,
  });
  const drafted = thread.state;
  const sent = `e${touch}-sent` as OutreachThreadState;
  await transitionOutreachThread(connection, {
    threadId: thread.threadId,
    from: [drafted],
    to: sent,
    at,
    reason: OPERATOR_CONFIRMED_SEND,
  });
  const closed = await transitionOutreachThread(connection, {
    threadId: thread.threadId,
    from: [sent],
    to: 'closed',
    at,
    reason: OPERATOR_CONFIRMED_SEND,
  });

  return {
    touch,
    threadClosed: closed.changed,
    providerDrafts: drafts.map(({ draftId, providerDraftId }) => ({
      draftId,
      ...(providerDraftId === undefined ? {} : { providerDraftId }),
    })),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

export interface RecordFailedOutreachDraftInput {
  prospectId: string;
  threadId: string;
  touch: number;
  language: 'fr' | 'en';
  roleAddress: string;
  /** Touch 1 only - see the schema's own note. */
  previewId?: string;
  previewUrl?: string;
  referenceAuditUrl?: string;
  referenceAuditVersion?: string;
  referenceAuditTokenHash?: string;
  evidenceVersion: string;
  outreachPromptVersion: string;
  failureReason: string;
  createdAt: Date;
}

/**
 * Record an attempt that never reached the provider.
 *
 * Subject and body are empty strings rather than the partial text: a refusal
 * means the message was never fit to be seen, and storing a half-validated
 * draft body would put text in the operator's review list that no guard
 * passed. The reason is a typed refusal code, so the reasons stay countable.
 */
export async function recordFailedOutreachDraft(
  connection: Connection,
  input: RecordFailedOutreachDraftInput,
): Promise<OutreachDraftDocument> {
  const DraftModel = createOutreachDraftModel(connection);
  await DraftModel.init();

  const document: OutreachDraftDocument = {
    draftId: randomUUID(),
    prospectId: input.prospectId,
    threadId: input.threadId,
    touch: input.touch,
    language: input.language,
    roleAddress: input.roleAddress,
    subject: '',
    body: '',
    subjectHash: hash(''),
    bodyHash: hash(''),
    ...(input.previewId !== undefined ? { previewId: input.previewId } : {}),
    ...(input.previewUrl !== undefined ? { previewUrl: input.previewUrl } : {}),
    ...(input.referenceAuditUrl !== undefined
      ? { referenceAuditUrl: input.referenceAuditUrl }
      : {}),
    ...(input.referenceAuditVersion !== undefined
      ? { referenceAuditVersion: input.referenceAuditVersion }
      : {}),
    ...(input.referenceAuditTokenHash !== undefined
      ? { referenceAuditTokenHash: input.referenceAuditTokenHash }
      : {}),
    evidenceVersion: input.evidenceVersion,
    outreachPromptVersion: input.outreachPromptVersion,
    status: 'failed',
    failureReason: input.failureReason,
    createdAt: input.createdAt,
    expiresAt: new Date(input.createdAt.getTime() + OUTREACH_DRAFT_RETENTION_DAYS * DAY_MS),
  };

  await DraftModel.create(document);
  return document;
}

export async function findLiveOutreachDraft(
  connection: Connection,
  threadId: string,
  touch: number,
): Promise<OutreachDraftDocument | null> {
  const DraftModel = createOutreachDraftModel(connection);
  return DraftModel.findOne({
    threadId,
    touch,
    status: { $in: ['created', 'mailbox-delete-pending'] },
  }).lean();
}

export interface MarkOutreachDraftDeletedResult {
  /** False when the draft was already deleted, so a caller can stay quiet on a
   *  repeat rather than reporting a second deletion that did not happen. */
  changed: boolean;
}

export async function markOutreachDraftDeleted(
  connection: Connection,
  draftId: string,
): Promise<MarkOutreachDraftDeletedResult> {
  const DraftModel = createOutreachDraftModel(connection);
  const result = await DraftModel.updateOne(
    { draftId, status: { $in: ['created', 'mailbox-delete-pending'] } },
    { $set: { status: 'deleted', deletedAt: new Date() } },
  );
  return { changed: result.modifiedCount === 1 };
}

export async function markOutreachDraftDeletionPending(
  connection: Connection,
  draftId: string,
  reviewOutcome?: OutreachDraftReviewOutcome,
): Promise<{ changed: boolean }> {
  const now = new Date();
  const result = await createOutreachDraftModel(connection).updateOne(
    { draftId, status: 'created' },
    {
      $set: {
        status: 'mailbox-delete-pending',
        ...(reviewOutcome !== undefined ? { reviewOutcome, reviewedAt: now } : {}),
      },
    },
  );
  return { changed: result.modifiedCount === 1 };
}

export interface ListOutreachDraftsOptions {
  status?: 'created' | 'mailbox-delete-pending' | 'deleted' | 'failed';
  threadId?: string;
  prospectId?: string;
  limit?: number;
}

export async function listOutreachDrafts(
  connection: Connection,
  options: ListOutreachDraftsOptions = {},
): Promise<OutreachDraftDocument[]> {
  const DraftModel = createOutreachDraftModel(connection);
  const query: Record<string, unknown> = {};
  if (options.status !== undefined) query['status'] = options.status;
  if (options.threadId !== undefined) query['threadId'] = options.threadId;
  if (options.prospectId !== undefined) query['prospectId'] = options.prospectId;
  const cursor = DraftModel.find(query).sort({ createdAt: -1 });
  if (options.limit !== undefined) cursor.limit(options.limit);
  return cursor.lean();
}
