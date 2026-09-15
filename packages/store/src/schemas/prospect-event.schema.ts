import { Schema, type Connection, type Model } from 'mongoose';
import type { ProspectEvent } from '@odysseus/core';

export type ProspectEventDocument = ProspectEvent;

const prospectEventSchema = new Schema<ProspectEventDocument>(
  {
    eventId: { type: String, required: true, unique: true },
    prospectId: { type: String, required: true },
    type: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    actor: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { collection: 'prospect_events', minimize: false },
);
prospectEventSchema.index({ prospectId: 1, at: -1 });

export function createProspectEventModel(connection: Connection): Model<ProspectEventDocument> {
  return (
    connection.models['ProspectEvent'] ??
    connection.model<ProspectEventDocument>('ProspectEvent', prospectEventSchema)
  );
}
