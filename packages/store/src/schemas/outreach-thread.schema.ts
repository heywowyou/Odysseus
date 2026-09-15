/**
 * Mongoose schema for the `outreach_threads` collection, milestone 9c plans
 * 011 and 012. One document per hotel conversation: who is being written to,
 * which evidence the conversation rests on, how far it has got, and what
 * state it is in.
 *
 * **One thread per prospect, enforced by the database.** `prospectId` is
 * unique rather than merely indexed. A prospect receives one outreach
 * conversation, and a second thread for the same prospect would be a second cold
 * opener to the same inbox from the same sender, which is the exact failure
 * the touch sequence exists to prevent. Making it a unique index means a
 * retried command cannot produce one even if the caller's own check raced.
 *
 * **The role address is stored raw, and that is deliberate.** It lives here
 * for the 90 days of operational retention
 * (`docs/rules/prospect-qualification.md` section 7) because the operator has to be
 * able to see who a draft is addressed to. Permanent suppression stays
 * hash-only in its own collection and is not touched by this one: the two
 * answer different questions, and merging them would mean a permanent record
 * of every address ever contacted.
 *
 * **`languageSource` is recorded, not assumed.** `docs/rules/outreach-rules.md`
 * section 7 is explicit that the prospect's site language has no deterministic
 * source yet, so the operator supplies it and the record says so. A future
 * detector must be versioned and reviewed before it can write anything other
 * than `operator` here, and storing the provenance now is what makes that
 * change auditable later rather than silent.
 *
 * **`state` replaces plan 011's two-value `status`, plan 012.** Legality of a
 * move between states lives in `@odysseus/core`'s `outreach-thread-state.ts`,
 * never here: this schema only stores the current value. Provider facts
 * (`touches`, `lastSyncedAt`, `needsReview`) and the operator's own outcome
 * (`currentOutcome`, recorded on the separate `outreach_outcomes` collection
 * and pointed to here) are kept apart, per the plan's own instruction to
 * never let the two kinds of fact collapse into one.
 *
 * **`spacing` is a snapshot, not a live read of configuration.** It is
 * written once, when the thread opens, from whatever
 * `ODYSSEUS_OUTREACH_TOUCH2_DAYS` / `_TOUCH3_DAYS` / `_REPLY_WINDOW_DAYS` say
 * at that moment. A later change to the setting must never retroactively
 * redate a thread that is already in flight.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { OutreachThreadState } from '@odysseus/core';

/** Where the draft language came from. Only one value today; the field exists
 *  so the day a detector is added, old rows remain honest about not having
 *  used one. */
export type OutreachLanguageSource = 'operator';

export const OUTREACH_THREAD_STATES: readonly OutreachThreadState[] = [
  'open',
  'e1-drafted',
  'e1-sent',
  'e2-drafted',
  'e2-sent',
  'e3-drafted',
  'e3-sent',
  'replied',
  'bounced',
  'opted-out',
  'sequence-complete',
  'closed',
];

/** One touch the provider confirms was actually sent. `detectedAt` is when
 *  our own sync noticed it, kept apart from `sentAt` (the provider's own
 *  timestamp) because a batch may run long after the operator actually sent
 *  the message. */
export interface OutreachThreadTouchRecord {
  touch: number;
  providerMessageId: string;
  sentAt: Date;
  detectedAt: Date;
}

/** Present only while a sync could not confidently classify the thread's
 *  latest activity. A thread carrying this must not receive a new follow-up
 *  draft, per the plan's instruction that ambiguity blocks drafting rather
 *  than being resolved by a guess. */
export interface OutreachThreadReviewFlag {
  reason: string;
  detectedAt: Date;
}

/** Written once at open, from configuration at that moment. Defaults are the
 *  canonical day +4 / day +11 / 14-day reply window recorded in
 *  `docs/rules/outreach-rules.md` section 6. */
export interface OutreachThreadSpacing {
  touch2AfterDays: number;
  touch3AfterDays: number;
  replyWindowDays: number;
}

export interface OutreachThreadDocumentFields {
  threadId: string;
  prospectId: string;
  previewId: string;
  domain: string;
  roleAddress: string;
  language: 'fr' | 'en';
  languageSource: OutreachLanguageSource;
  /** Absent until the first draft is created: the thread exists in our records
   *  before the provider has any idea it does. */
  providerThreadId?: string;
  /** Highest touch that has a live draft or was sent. Zero means the thread is
   *  open but nothing has been prepared. */
  currentTouch: number;
  state: OutreachThreadState;
  /** When `state` last changed, and why, for whichever transition put the
   *  thread where it is now: an objection reason, a bounce classification, a
   *  suppression reason code, or an operator-supplied text. Generalizes plan
   *  011's `closedAt`/`closedReason`, which named only one of several
   *  terminal states. */
  stateEnteredAt: Date;
  stateReason?: string;
  /** Provider-confirmed sends only. A drafted-but-unsent touch is not here:
   *  it lives only as a `created` row in `outreach_drafts`. */
  touches: OutreachThreadTouchRecord[];
  lastSyncedAt?: Date;
  needsReview?: OutreachThreadReviewFlag;
  /** Points at the operator-set row on `outreach_outcomes`. Absent until an
   *  operator records one; never written by a sync or a model. */
  currentOutcome?: string;
  spacing: OutreachThreadSpacing;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export type OutreachThreadDocument = OutreachThreadDocumentFields;

const outreachThreadTouchSchema = new Schema<OutreachThreadTouchRecord>(
  {
    touch: { type: Number, required: true, min: 1, max: 3 },
    providerMessageId: { type: String, required: true },
    sentAt: { type: Date, required: true },
    detectedAt: { type: Date, required: true },
  },
  { _id: false },
);

const outreachThreadReviewFlagSchema = new Schema<OutreachThreadReviewFlag>(
  {
    reason: { type: String, required: true },
    detectedAt: { type: Date, required: true },
  },
  { _id: false },
);

const outreachThreadSpacingSchema = new Schema<OutreachThreadSpacing>(
  {
    touch2AfterDays: { type: Number, required: true },
    touch3AfterDays: { type: Number, required: true },
    replyWindowDays: { type: Number, required: true },
  },
  { _id: false },
);

const outreachThreadSchema = new Schema<OutreachThreadDocument>(
  {
    threadId: { type: String, required: true, unique: true },
    prospectId: { type: String, required: true, unique: true },
    previewId: { type: String, required: true },
    domain: { type: String, required: true },
    roleAddress: { type: String, required: true },
    language: { type: String, required: true, enum: ['fr', 'en'] },
    languageSource: { type: String, required: true, enum: ['operator'] },
    providerThreadId: { type: String },
    currentTouch: { type: Number, required: true, default: 0 },
    state: { type: String, required: true, enum: OUTREACH_THREAD_STATES },
    stateEnteredAt: { type: Date, required: true },
    stateReason: { type: String },
    touches: { type: [outreachThreadTouchSchema], required: true, default: [] },
    lastSyncedAt: { type: Date },
    needsReview: { type: outreachThreadReviewFlagSchema },
    currentOutcome: { type: String },
    spacing: { type: outreachThreadSpacingSchema, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'outreach_threads', minimize: false },
);

outreachThreadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Closing every open thread for a domain is what an objection triggers, and it
// must be one indexed query rather than a scan, exactly as for previews.
outreachThreadSchema.index({ domain: 1, state: 1 });
// Selecting due follow-ups scans by state, not by a full collection scan.
outreachThreadSchema.index({ state: 1 });

export function createOutreachThreadModel(connection: Connection): Model<OutreachThreadDocument> {
  return (
    connection.models['OutreachThread'] ??
    connection.model<OutreachThreadDocument>('OutreachThread', outreachThreadSchema)
  );
}
