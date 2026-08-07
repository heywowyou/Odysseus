/**
 * Mongoose schema for the `analyses` collection. Unlike `audits`, this
 * collection intentionally allows multiple documents per auditId: the
 * same audit can be analysed more than once (once per language, and
 * again if the analysis is re-run after a prompt change). See
 * persist-analysis.ts and docs/llm-layer-rules.md section 5.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { ObligationAssessment, ReportLanguage, Theme } from '@odysseus/core';

export interface AnalysisDocumentFields {
  auditId: string;
  language: ReportLanguage;
  /** Mistral model identifier, e.g. 'mistral-large-latest'. Recorded
   *  alongside temperature for the same provenance reason the audit
   *  manifest records axe/Lighthouse versions: a model or temperature
   *  change between two monitoring runs must never read as the client's
   *  site changing. */
  model: string;
  /** Mistral's temperature parameter at the time this analysis was
   *  generated. Unlike Claude Opus 5 (which rejected temperature
   *  outright), Mistral accepts it normally, so this is a real sampling
   *  knob, not just a label. See docs/llm-layer-rules.md section 3. */
  temperature: number;
  generatedAt: Date;
  executiveSummary: string;
  overallRisk: 'low' | 'medium' | 'high';
  themes: Theme[];
  quickWins: string[];
  notes: string;
  /** Computed once per audit by @odysseus/core's assessObligations, not
   *  by the model - see entity.ts's doc comment. Optional: older
   *  analyses predate this milestone. */
  obligationAssessment?: ObligationAssessment;
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

// basis's internal shape is a small, closed, code-owned union (see
// @odysseus/core's ObligationBasisFact), not user input - Mixed here is
// the same acceptable pattern Finding.rawEvidence already uses.
const obligationAssessmentSchemaMongo = new Schema(
  {
    status: {
      type: String,
      required: true,
      enum: ['in_scope', 'likely_in_scope', 'out_of_scope', 'undetermined'],
    },
    basis: {
      type: [
        new Schema(
          { regimeId: { type: String, required: true }, facts: { type: [Schema.Types.Mixed], default: [] } },
          { _id: false },
        ),
      ],
      default: [],
    },
    // Never set by assessObligations itself - spliced on by
    // packages/interface's obligation-stage.ts once a SIREN has been
    // chosen from possibly two candidates. Absent when no SIREN was ever
    // available. See the manual-SIREN milestone.
    sirenSource: { type: String, enum: ['extracted', 'manual'] },
    sirenMismatch: {
      type: new Schema(
        { extractedSiren: { type: String, required: true }, manualSiren: { type: String, required: true } },
        { _id: false },
      ),
    },
  },
  { _id: false },
);

const analysisSchema = new Schema<AnalysisDocument>(
  {
    auditId: { type: String, required: true },
    language: { type: String, required: true, enum: ['fr', 'en'] },
    model: { type: String, required: true },
    temperature: { type: Number, required: true },
    generatedAt: { type: Date, required: true },
    executiveSummary: { type: String, required: true },
    overallRisk: { type: String, required: true, enum: ['low', 'medium', 'high'] },
    themes: { type: [themeSchemaMongo], default: [] },
    quickWins: { type: [String], default: [] },
    notes: { type: String, required: true },
    obligationAssessment: { type: obligationAssessmentSchemaMongo },
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
