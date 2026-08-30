/**
 * Mongoose schema for the `outreach_threads` collection, milestone 9c plan
 * 011. One document per hotel conversation: who is being written to, which
 * evidence the conversation rests on, how far it has got, and whether it is
 * still open.
 *
 * **One thread per candidate, enforced by the database.** `candidateId` is
 * unique rather than merely indexed. A hotel receives one outreach
 * conversation, and a second thread for the same hotel would be a second cold
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
 */

import { Schema, type Connection, type Model } from 'mongoose';

export type OutreachThreadStatus = 'open' | 'closed';

/** Where the draft language came from. Only one value today; the field exists
 *  so the day a detector is added, old rows remain honest about not having
 *  used one. */
export type OutreachLanguageSource = 'operator';

export interface OutreachThreadDocumentFields {
  threadId: string;
  candidateId: string;
  prescanId: string;
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
  status: OutreachThreadStatus;
  closedAt?: Date;
  closedReason?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export type OutreachThreadDocument = OutreachThreadDocumentFields;

const outreachThreadSchema = new Schema<OutreachThreadDocument>(
  {
    threadId: { type: String, required: true, unique: true },
    candidateId: { type: String, required: true, unique: true },
    prescanId: { type: String, required: true },
    previewId: { type: String, required: true },
    domain: { type: String, required: true },
    roleAddress: { type: String, required: true },
    language: { type: String, required: true, enum: ['fr', 'en'] },
    languageSource: { type: String, required: true, enum: ['operator'] },
    providerThreadId: { type: String },
    currentTouch: { type: Number, required: true, default: 0 },
    status: { type: String, required: true, enum: ['open', 'closed'] },
    closedAt: { type: Date },
    closedReason: { type: String },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'outreach_threads', minimize: false },
);

outreachThreadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Closing every open thread for a domain is what an objection triggers, and it
// must be one indexed query rather than a scan, exactly as for previews.
outreachThreadSchema.index({ domain: 1, status: 1 });

export function createOutreachThreadModel(connection: Connection): Model<OutreachThreadDocument> {
  return (
    connection.models['OutreachThread'] ??
    connection.model<OutreachThreadDocument>('OutreachThread', outreachThreadSchema)
  );
}
