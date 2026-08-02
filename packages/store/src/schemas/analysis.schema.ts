/**
 * Mongoose schema for the `analyses` collection. Unlike `audits`, this
 * collection intentionally allows multiple documents per auditId: the
 * same audit can be analysed more than once (once per language, and
 * again if the analysis is re-run after a prompt change). See
 * persist-analysis.ts and docs/llm-layer-rules.md section 5.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { ReportLanguage, Theme } from '@odysseus/core';

export interface AnalysisDocumentFields {
  auditId: string;
  language: ReportLanguage;
  /** Claude model identifier, e.g. 'claude-opus-5'. Recorded alongside
   *  effort for the same provenance reason the audit manifest records
   *  axe/Lighthouse versions: a model or effort-level change between two
   *  monitoring runs must never read as the client's site changing. */
  model: string;
  /** Claude's reasoning-depth parameter (output_config.effort) at the
   *  time this analysis was generated. Replaces what would have been a
   *  temperature field: Opus-tier models reject the temperature
   *  parameter outright. See docs/llm-layer-rules.md section 3. */
  effort: string;
  generatedAt: Date;
  executiveSummary: string;
  overallRisk: 'low' | 'medium' | 'high';
  themes: Theme[];
  quickWins: string[];
  notes: string;
}

export type AnalysisDocument = AnalysisDocumentFields;

const themeSchemaMongo = new Schema(
  {
    title: { type: String, required: true },
    category: {
      type: String,
      required: true,
      enum: ['accessibility', 'seo', 'performance', 'rendering'],
    },
    businessImpact: { type: String, required: true },
    legalRelevance: { type: String },
    effort: { type: String, required: true, enum: ['low', 'medium', 'high'] },
    impact: { type: String, required: true, enum: ['low', 'medium', 'high'] },
    priorityRank: { type: Number, required: true },
    findingIds: { type: [String], default: [] },
    recommendedActions: { type: [String], default: [] },
  },
  { _id: false },
);

const analysisSchema = new Schema<AnalysisDocument>(
  {
    auditId: { type: String, required: true },
    language: { type: String, required: true, enum: ['fr', 'en'] },
    model: { type: String, required: true },
    effort: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    executiveSummary: { type: String, required: true },
    overallRisk: { type: String, required: true, enum: ['low', 'medium', 'high'] },
    themes: { type: [themeSchemaMongo], default: [] },
    quickWins: { type: [String], default: [] },
    notes: { type: String, required: true },
  },
  { collection: 'analyses' },
);

// Deliberately no unique index on auditId: multiple analyses per audit
// (once per language, again after a prompt change) is the intended
// common case, unlike the single unique audits document per auditId.
analysisSchema.index({ auditId: 1 });
analysisSchema.index({ auditId: 1, language: 1, generatedAt: -1 });

export function createAnalysisModel(connection: Connection): Model<AnalysisDocument> {
  return connection.models['Analysis'] ?? connection.model<AnalysisDocument>('Analysis', analysisSchema);
}
