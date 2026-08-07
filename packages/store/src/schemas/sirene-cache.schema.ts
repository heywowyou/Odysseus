/**
 * Mongoose schema for the `sirene_cache` collection: one document per
 * SIREN, upserted (not inserted) on every successful Sirene lookup, since
 * the same SIREN recurs across scans and a repeat lookup should converge
 * to the latest retrievedAt rather than accumulate duplicates. Contrast
 * with analysis.schema.ts, whose collection deliberately allows many
 * documents per key.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { OperatorProfile } from '@odysseus/core';

export interface SireneCacheDocumentFields {
  siren: string;
  profile: OperatorProfile;
  retrievedAt: Date;
}

export type SireneCacheDocument = SireneCacheDocumentFields;

const provenancedSchema = new Schema(
  {
    value: { type: Schema.Types.Mixed, required: true },
    source: { type: String, required: true },
    retrievedAt: { type: Date, required: true },
  },
  { _id: false },
);

const operatorProfileSchema = new Schema(
  {
    siren: { type: provenancedSchema, required: true },
    denomination: { type: provenancedSchema, required: true },
    naf: { type: provenancedSchema, required: true },
    legalForm: { type: provenancedSchema, required: true },
    effectifBand: { type: provenancedSchema, required: true },
    turnover: { type: provenancedSchema, required: true },
  },
  { _id: false },
);

const sireneCacheSchema = new Schema<SireneCacheDocument>(
  {
    siren: { type: String, required: true, unique: true },
    profile: { type: operatorProfileSchema, required: true },
    retrievedAt: { type: Date, required: true },
  },
  { collection: 'sirene_cache' },
);

export function createSireneCacheModel(connection: Connection): Model<SireneCacheDocument> {
  return connection.models['SireneCache'] ?? connection.model<SireneCacheDocument>('SireneCache', sireneCacheSchema);
}
