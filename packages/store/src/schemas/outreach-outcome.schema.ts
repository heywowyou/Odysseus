/**
 * Insert-only operator outcome events for one outreach thread. Raw addresses,
 * subjects and bodies have no field here; the current event is referenced by
 * id from the thread and expires with the 90-day operational record.
 */
import { Schema, type Connection, type Model } from 'mongoose';
import {
  OUTREACH_LOST_REASONS,
  OUTREACH_OUTCOMES,
  type OutreachLostReason,
  type OutreachOutcome,
} from '@odysseus/core';

export interface OutreachOutcomeDocumentFields {
  outcomeId: string;
  idempotencyKey: string;
  threadId: string;
  prospectId: string;
  outcome: OutreachOutcome;
  lostReason?: OutreachLostReason;
  actor: string;
  recordedAt: Date;
  expiresAt: Date;
}

export type OutreachOutcomeDocument = OutreachOutcomeDocumentFields;

const outreachOutcomeSchema = new Schema<OutreachOutcomeDocument>(
  {
    outcomeId: { type: String, required: true, unique: true },
    idempotencyKey: { type: String, required: true, unique: true },
    threadId: { type: String, required: true },
    prospectId: { type: String, required: true },
    outcome: { type: String, required: true, enum: OUTREACH_OUTCOMES },
    lostReason: { type: String, enum: OUTREACH_LOST_REASONS },
    actor: { type: String, required: true },
    recordedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'outreach_outcomes', minimize: false },
);

outreachOutcomeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
outreachOutcomeSchema.index({ threadId: 1, recordedAt: -1 });
outreachOutcomeSchema.index({ prospectId: 1, recordedAt: -1 });

export function createOutreachOutcomeModel(connection: Connection): Model<OutreachOutcomeDocument> {
  return (
    connection.models['OutreachOutcome'] ??
    connection.model<OutreachOutcomeDocument>('OutreachOutcome', outreachOutcomeSchema)
  );
}
