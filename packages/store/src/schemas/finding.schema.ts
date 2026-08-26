/**
 * Mongoose schema for the `findings` collection. siteUrl is added here,
 * on the Mongoose document type only, never on @odysseus/core's locked
 * Finding interface: it's denormalized from the linked audit at persist
 * time so {siteUrl, dedupeKey} can be a compound index for the monitoring
 * tier (Milestone 10), without findings.ts needing to know about sites at
 * all.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { Finding, FindingCategory } from '@odysseus/core';

export interface FindingDocument extends Finding {
  siteUrl: string;
}

/**
 * Mirrors @odysseus/core's FindingCategory. Kept as a literal rather than
 * imported at runtime because findings.ts is a locked contract exporting a
 * type, not a value. `assertExhaustive` below fails the build if a category
 * is ever added to the union without being added here - which is exactly
 * what happened to `geo` (trade-off 14) and `privacy` (trade-off 25), both
 * of which sat unlisted for months. They persisted anyway only because
 * persist-audit.ts writes through bulkWrite, which does not run update
 * validators; confirmed against the live collection, which holds 39 geo and
 * 24 privacy findings. The analyses collection has no such reprieve - it
 * writes through full document validation and rejected `privacy` outright.
 */
const FINDING_CATEGORY_VALUES = [
  'accessibility',
  'seo',
  'geo',
  'performance',
  'rendering',
  'privacy',
] as const satisfies readonly FindingCategory[];

type UnlistedFindingCategory = Exclude<FindingCategory, (typeof FINDING_CATEGORY_VALUES)[number]>;
const _findingCategoriesAreExhaustive: UnlistedFindingCategory extends never ? true : never = true;
void _findingCategoriesAreExhaustive;

const findingElementSchema = new Schema(
  {
    pageUrl: { type: String, required: true },
    selector: { type: String, required: true },
    snippet: { type: String, required: true },
    screenshotRef: { type: String },
    // Optional and additive (findings.ts, 2026-08-25). Stored documents
    // written before it simply do not carry it, which is a valid element.
    resourceUrl: { type: String },
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
      enum: FINDING_CATEGORY_VALUES,
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
