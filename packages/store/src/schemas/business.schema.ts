/**
 * Mongoose schema for the `businesses` collection (issue #218): the durable,
 * sector-neutral identity a hotel-campaign candidate generation (or, later,
 * any other source) reconciles against. Unlike `hotel_candidates`, this
 * collection is not TTL-bound - it is the one durable record the Prospect
 * hub, audits, and future paid/client work are meant to keep pointing at
 * across any number of expiring campaign generations.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { Business } from '@odysseus/core';

export type BusinessDocumentFields = Business;
export type BusinessDocument = BusinessDocumentFields;

const identityKeySchema = new Schema(
  {
    kind: { type: String, required: true, enum: ['own-registrable-domain'] },
    value: { type: String, required: true },
    addedAt: { type: Date, required: true },
  },
  { _id: false },
);

const candidateGenerationRefSchema = new Schema(
  {
    candidateId: { type: String, required: true },
    resolutionVersion: { type: String, required: true },
    linkedAt: { type: Date, required: true },
  },
  { _id: false },
);

const businessSchema = new Schema<BusinessDocument>(
  {
    businessId: { type: String, required: true },
    displayName: { type: String, required: true },
    currentRegistrableDomain: { type: String },
    identityKeys: { type: [identityKeySchema], required: true },
    sector: { type: String, enum: ['hospitality', 'general'] },
    candidateGenerations: { type: [candidateGenerationRefSchema], required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'businesses', minimize: false },
);

businessSchema.index({ businessId: 1 }, { unique: true });
// The safe-match lookup resolveOrCreateBusinessForCandidate runs on every
// hub view and every audit-hotel-link resolution: one business per domain
// value is the whole reconciliation rule, so this is both the lookup index
// and, via uniqueness, the guard against two businesses silently claiming
// the same domain.
businessSchema.index({ 'identityKeys.value': 1 });

export function createBusinessModel(connection: Connection): Model<BusinessDocument> {
  return (
    connection.models['Business'] ?? connection.model<BusinessDocument>('Business', businessSchema)
  );
}
