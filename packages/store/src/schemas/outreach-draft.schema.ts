/**
 * Mongoose schema for the `outreach_drafts` collection, milestone 9c plan 011.
 * One document per draft attempt: the exact message prepared, the contract
 * versions it was built under, and what the provider did with it.
 *
 * **Insert-only, like scores and cohorts.** A rejected draft is not edited
 * into a new one; it is marked `deleted` and a fresh attempt is inserted. What
 * that buys is the ability to answer "what did we actually put in front of the
 * operator on the third of September, and which prompt produced it" months
 * later, which a mutable row cannot answer at all.
 *
 * **One live draft per touch, enforced by a partial unique index.** The
 * orchestrator checks before creating, but a check is not a guarantee: two
 * concurrent batch runs, or a retry after a timeout that actually succeeded,
 * both race that check. The index over (`threadId`, `touch`) restricted to
 * `status: 'created'` makes the second insert fail rather than produce two
 * drafts of the same touch sitting in the mailbox, which is the failure most
 * likely to end with a duplicate being sent by hand.
 *
 * **The body is stored, and only for 90 days.** The operator reviews the exact
 * text, so the exact text has to be readable. Hashes are stored alongside it
 * rather than instead of it, because after the TTL removes the row the hashes
 * in a thread's history are what still prove two touches were not the same
 * message.
 */

import { Schema, type Connection, type Model } from 'mongoose';

/** `failed` records an attempt that never reached the provider, so a run that
 *  refused for a good reason leaves evidence instead of nothing. */
export type OutreachDraftStatus = 'created' | 'mailbox-delete-pending' | 'deleted' | 'failed';

/** Issue #96: how the operator resolved a review, recorded when the row
 *  leaves the review flow. Both values keep the same `deleted` status
 *  transition review has always made, so the live-draft partial index and
 *  every status consumer keep their exact meaning; the outcome is the
 *  additive distinction campaign analysis reads later. */
export type OutreachDraftReviewOutcome = 'approved' | 'skipped';

export interface OutreachDraftDocumentFields {
  draftId: string;
  prospectId: string;
  threadId: string;
  touch: number;
  language: 'fr' | 'en';
  roleAddress: string;
  subject: string;
  body: string;
  /** The HTML part, rendered from the same blocks as `body` (trade-off 82).
   *  Absent on drafts created before the HTML part existed and on failures;
   *  `body` stays the canonical text that `bodyHash` covers. */
  htmlBody?: string;
  subjectHash: string;
  bodyHash: string;
  /** Which deterministic evidence family opened touch 1. Absent on follow-ups
   * and historical touch-1 rows created before plan 012. */
  /** Touch 1 only. Touches 2 and 3 publish no preview and add no link (a
   *  reply-based opt-out instead, trade-off 54), so there is nothing honest
   *  to store here for them - absent, never an empty-string sentinel. */
  previewId?: string;
  previewUrl?: string;
  /** Touch 1's second, permanent proof link and the release it resolved to. */
  referenceAuditUrl?: string;
  referenceAuditVersion?: string;
  /** Present only when the optional first-party redirect was used. The raw
   *  token is never stored. */
  referenceAuditTokenHash?: string;
  referenceAuditFirstRequestedAt?: Date;
  referenceAuditLastRequestedAt?: Date;
  referenceAuditRequestCount?: number;
  /** The contract versions behind this exact text, so a draft can be told
   *  apart from one produced before a prompt or evidence change without
   *  re-deriving anything. */
  evidenceVersion: string;
  outreachPromptVersion: string;
  providerDraftId?: string;
  providerMessageId?: string;
  providerThreadId?: string;
  status: OutreachDraftStatus;
  /** Set on `failed`: the orchestrator's typed refusal, never free prose, so
   *  the reasons stay countable. */
  failureReason?: string;
  /** Set when the operator reviewed the draft (issue #96): `approved` keeps
   *  the campaign's approved set distinct from `skipped`'s discarded set.
   *  Absent on rows reviewed before the field existed and on rows that left
   *  `created` by another path. */
  reviewOutcome?: OutreachDraftReviewOutcome;
  reviewedAt?: Date;
  createdAt: Date;
  deletedAt?: Date;
  expiresAt: Date;
}

export type OutreachDraftDocument = OutreachDraftDocumentFields;

function requiredWhenCreated(this: { status?: OutreachDraftStatus }): boolean {
  return this.status === 'created';
}

const outreachDraftSchema = new Schema<OutreachDraftDocument>(
  {
    draftId: { type: String, required: true, unique: true },
    prospectId: { type: String, required: true },
    threadId: { type: String, required: true },
    touch: { type: Number, required: true, min: 1, max: 3 },
    language: { type: String, required: true, enum: ['fr', 'en'] },
    roleAddress: { type: String, required: true },
    // Required only for a draft that exists. A `failed` attempt deliberately
    // stores no text at all (see `recordFailedOutreachDraft`): the message was
    // never fit to be seen, and Mongoose counts an empty string as absent, so
    // a flat `required: true` would reject exactly the row that records why
    // nothing was created.
    subject: { type: String, required: requiredWhenCreated, default: '' },
    body: { type: String, required: requiredWhenCreated, default: '' },
    htmlBody: { type: String },
    subjectHash: { type: String, required: true },
    bodyHash: { type: String, required: true },
    previewId: { type: String },
    previewUrl: { type: String },
    referenceAuditUrl: { type: String },
    referenceAuditVersion: { type: String },
    referenceAuditTokenHash: { type: String },
    referenceAuditFirstRequestedAt: { type: Date },
    referenceAuditLastRequestedAt: { type: Date },
    referenceAuditRequestCount: { type: Number, min: 0 },
    evidenceVersion: { type: String, required: true },
    outreachPromptVersion: { type: String, required: true },
    providerDraftId: { type: String },
    providerMessageId: { type: String },
    providerThreadId: { type: String },
    status: {
      type: String,
      required: true,
      enum: ['created', 'mailbox-delete-pending', 'deleted', 'failed'],
    },
    failureReason: { type: String },
    reviewOutcome: { type: String, enum: ['approved', 'skipped'] },
    reviewedAt: { type: Date },
    createdAt: { type: Date, required: true },
    deletedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'outreach_drafts', minimize: false },
);

outreachDraftSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
outreachDraftSchema.index(
  { threadId: 1, touch: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['created', 'mailbox-delete-pending'] } },
  },
);
outreachDraftSchema.index({ prospectId: 1, createdAt: -1 });
outreachDraftSchema.index({ status: 1, createdAt: -1 });

export function createOutreachDraftModel(connection: Connection): Model<OutreachDraftDocument> {
  return (
    connection.models['OutreachDraft'] ??
    connection.model<OutreachDraftDocument>('OutreachDraft', outreachDraftSchema)
  );
}
