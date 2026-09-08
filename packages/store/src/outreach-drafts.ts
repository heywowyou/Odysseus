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
import type { OutreachEvidenceSlot } from '@odysseus/core';

export type { OutreachDraftReviewOutcome };

/** Operational retention, per docs/rules/prospect-qualification.md section 7. */
export const OUTREACH_DRAFT_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Kept beside the text rather than instead of it: once the TTL removes the
 *  body, the hashes in a thread's history are what still prove two touches
 *  were not the same message. */
function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export interface RecordOutreachDraftInput {
  threadId: string;
  candidateId: string;
  touch: number;
  language: 'fr' | 'en';
  roleAddress: string;
  subject: string;
  body: string;
  /** Present on touch 1 only; follow-ups do not replace the opener variant. */
  touch1EvidenceSlot?: OutreachEvidenceSlot;
  /** Touch 1 only - see the schema's own note. */
  previewId?: string;
  previewUrl?: string;
  prescanVersion: string;
  evidenceVersion: string;
  outreachPromptVersion: string;
  providerDraftId: string;
  providerMessageId: string;
  providerThreadId: string;
  createdAt: Date;
}

export class DuplicateLiveDraftError extends Error {
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
    threadId: input.threadId,
    candidateId: input.candidateId,
    touch: input.touch,
    language: input.language,
    roleAddress: input.roleAddress,
    subject: input.subject,
    body: input.body,
    subjectHash: hash(input.subject),
    bodyHash: hash(input.body),
    ...(input.touch1EvidenceSlot === undefined
      ? {}
      : { touch1EvidenceSlot: input.touch1EvidenceSlot }),
    ...(input.previewId !== undefined ? { previewId: input.previewId } : {}),
    ...(input.previewUrl !== undefined ? { previewUrl: input.previewUrl } : {}),
    prescanVersion: input.prescanVersion,
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
  return document;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

export interface RecordFailedOutreachDraftInput {
  threadId: string;
  candidateId: string;
  touch: number;
  language: 'fr' | 'en';
  roleAddress: string;
  /** Touch 1 only - see the schema's own note. */
  previewId?: string;
  previewUrl?: string;
  prescanVersion: string;
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
    threadId: input.threadId,
    candidateId: input.candidateId,
    touch: input.touch,
    language: input.language,
    roleAddress: input.roleAddress,
    subject: '',
    body: '',
    subjectHash: hash(''),
    bodyHash: hash(''),
    ...(input.previewId !== undefined ? { previewId: input.previewId } : {}),
    ...(input.previewUrl !== undefined ? { previewUrl: input.previewUrl } : {}),
    prescanVersion: input.prescanVersion,
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
  return DraftModel.findOne({ threadId, touch, status: 'created' }).lean();
}

export async function findOutreachDraftById(
  connection: Connection,
  draftId: string,
): Promise<OutreachDraftDocument | null> {
  const DraftModel = createOutreachDraftModel(connection);
  return DraftModel.findOne({ draftId }).lean();
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
    { draftId, status: 'created' },
    { $set: { status: 'deleted', deletedAt: new Date() } },
  );
  return { changed: result.modifiedCount === 1 };
}

export interface RecordOutreachDraftReviewResult {
  /** False when the draft was already reviewed or discarded, so a repeat
   *  stays quiet and, crucially, never overwrites the first outcome: the
   *  filter only matches a `created` row, so the recorded decision is the
   *  first one the operator made. */
  changed: boolean;
}

/**
 * Record the operator's review of a draft (issue #96).
 *
 * The status transition is exactly `markOutreachDraftDeleted`'s - approve and
 * skip both end the draft's life in the review flow, and neither sends,
 * edits, or creates anything. What this adds is the outcome: the field that
 * lets plan 014's campaign analysis tell an approved draft from a discarded
 * one months later. Reviewing never touches the Gmail draft itself.
 */
export async function recordOutreachDraftReview(
  connection: Connection,
  draftId: string,
  outcome: OutreachDraftReviewOutcome,
): Promise<RecordOutreachDraftReviewResult> {
  const DraftModel = createOutreachDraftModel(connection);
  const now = new Date();
  const result = await DraftModel.updateOne(
    { draftId, status: 'created' },
    {
      $set: {
        status: 'deleted',
        deletedAt: now,
        reviewOutcome: outcome,
        reviewedAt: now,
      },
    },
  );
  return { changed: result.modifiedCount === 1 };
}

export interface ListOutreachDraftsOptions {
  status?: 'created' | 'deleted' | 'failed';
  threadId?: string;
  candidateId?: string;
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
  if (options.candidateId !== undefined) query['candidateId'] = options.candidateId;
  const cursor = DraftModel.find(query).sort({ createdAt: -1 });
  if (options.limit !== undefined) cursor.limit(options.limit);
  return cursor.lean();
}
