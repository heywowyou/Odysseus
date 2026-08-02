/**
 * Mongoose schema for the `audits` collection. Mirrors AuditManifest
 * field-for-field, with one deliberate deviation: manifest.json stores
 * startedAt/finishedAt/renormalizedAt as ISO strings (disk JSON has no
 * native Date), but Mongo stores them as native Date so range queries
 * (the {siteUrl, startedAt: -1} index) work. persist-audit.ts converts at
 * the boundary; AuditDocument reflects the stored, Date-typed shape
 * rather than reusing AuditManifest directly.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { AuditManifest } from '@odysseus/core';

export interface AuditDocumentFields
  extends Omit<AuditManifest, 'startedAt' | 'finishedAt' | 'renormalizedAt'> {
  startedAt: Date;
  finishedAt: Date;
  renormalizedAt?: Date;
}

export type AuditDocument = AuditDocumentFields;

const toolVersionsSchema = new Schema(
  {
    odysseusVersion: { type: String, required: true },
    findingsSchemaVersion: { type: Number, required: true },
    axeCoreVersion: { type: String, default: null },
    lighthouseVersion: { type: String, default: null },
    playwrightVersion: { type: String, required: true },
    chromiumVersion: { type: String, required: true },
  },
  { _id: false },
);

const configSnapshotSchema = new Schema(
  {
    maxPages: { type: Number, required: true },
    maxDepth: { type: Number, required: true },
    crawlDelayMs: { type: Number, required: true },
    pageTimeoutMs: { type: Number, required: true },
    lighthouseTimeoutMs: { type: Number, required: true },
    userAgent: { type: String, required: true },
  },
  { _id: false },
);

const crawlStatsSchema = new Schema(
  {
    startUrl: { type: String, required: true },
    visitedCount: { type: Number, required: true },
    maxPages: { type: Number, required: true },
    maxDepth: { type: Number, required: true },
    robotsTxtFound: { type: Boolean, required: true },
    effectiveDelayMs: { type: Number, required: true },
  },
  { _id: false },
);

const lighthouseExcludedCategoryScoresSchema = new Schema(
  {
    accessibility: { type: Number, default: null },
    bestPractices: { type: Number, default: null },
  },
  { _id: false },
);

const coreWebVitalMeasurementSchema = new Schema(
  {
    score: { type: Number, default: null },
    numericValue: { type: Number, default: null },
    displayValue: { type: String, default: null },
  },
  { _id: false },
);

const coreWebVitalsSchema = new Schema(
  {
    lcp: { type: coreWebVitalMeasurementSchema, required: true },
    cls: { type: coreWebVitalMeasurementSchema, required: true },
    tbt: { type: coreWebVitalMeasurementSchema, required: true },
  },
  { _id: false },
);

const manifestPageEntrySchema = new Schema(
  {
    url: { type: String, required: true },
    pageDir: { type: String },
    depth: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      enum: ['visited', 'skipped-robots', 'skipped-non-html', 'error'],
    },
    httpStatus: { type: Number },
    renderDiffMissingPercent: { type: Number },
    lighthouseExcludedCategoryScores: { type: lighthouseExcludedCategoryScoresSchema },
    coreWebVitals: { type: coreWebVitalsSchema },
    crawlError: { type: String },
    errors: {
      _id: false,
      type: {
        renderDiff: { type: String },
        axe: { type: String },
        lighthouse: { type: String },
      },
      default: {},
    },
  },
  // "errors" is a Mongoose-reserved schema pathname; it's an intentional
  // field name matching ManifestPageEntry.errors, not an accident.
  { _id: false, suppressReservedKeysWarning: true },
);

const auditSchema = new Schema<AuditDocument>(
  {
    auditId: { type: String, required: true, unique: true },
    kind: { type: String, required: true, enum: ['audit', 'render-diff'] },
    siteUrl: { type: String, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    renormalizedAt: { type: Date },
    tool: { type: toolVersionsSchema, required: true },
    config: { type: configSnapshotSchema, required: true },
    crawl: { type: crawlStatsSchema, required: true },
    pages: { type: [manifestPageEntrySchema], default: [] },
  },
  { collection: 'audits' },
);

auditSchema.index({ siteUrl: 1, startedAt: -1 });

export function createAuditModel(connection: Connection): Model<AuditDocument> {
  return connection.models['Audit'] ?? connection.model<AuditDocument>('Audit', auditSchema);
}
