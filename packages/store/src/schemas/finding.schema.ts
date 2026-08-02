/**
 * Mongoose schema for the `findings` collection. siteUrl is added here,
 * on the Mongoose document type only, never on @odysseus/core's locked
 * Finding interface: it's denormalized from the linked audit at persist
 * time so {siteUrl, dedupeKey} can be a compound index for the monitoring
 * tier (Milestone 10), without findings.ts needing to know about sites at
 * all.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { Finding } from '@odysseus/core';

export interface FindingDocument extends Finding {
  siteUrl: string;
}

const findingElementSchema = new Schema(
  {
    pageUrl: { type: String, required: true },
    selector: { type: String, required: true },
    snippet: { type: String, required: true },
    screenshotRef: { type: String },
  },
  { _id: false },
);

const findingSchema = new Schema<FindingDocument>(
  {
    findingId: { type: String, required: true },
    auditId: { type: String, required: true },
    siteUrl: { type: String, required: true },
    schemaVersion: { type: Number, required: true },
    source: { type: String, required: true, enum: ['axe', 'lighthouse', 'custom', 'renderdiff'] },
    ruleId: { type: String, required: true },
    category: {
      type: String,
      required: true,
      enum: ['accessibility', 'seo', 'performance', 'rendering'],
    },
    severity: {
      type: String,
      required: true,
      enum: ['critical', 'serious', 'moderate', 'minor'],
    },
    wcagCriteria: { type: [String], default: [] },
    title: { type: String, required: true },
    description: { type: String, required: true },
    helpUrl: { type: String },
    pageUrls: { type: [String], default: [] },
    occurrences: { type: Number, required: true },
    elements: { type: [findingElementSchema], default: [] },
    rawEvidence: { type: Schema.Types.Mixed, default: {} },
    dedupeKey: { type: String, required: true },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
  },
  { collection: 'findings' },
);

findingSchema.index({ auditId: 1 });
findingSchema.index({ siteUrl: 1, dedupeKey: 1 });
findingSchema.index({ auditId: 1, severity: 1 });

export function createFindingModel(connection: Connection): Model<FindingDocument> {
  return connection.models['Finding'] ?? connection.model<FindingDocument>('Finding', findingSchema);
}
