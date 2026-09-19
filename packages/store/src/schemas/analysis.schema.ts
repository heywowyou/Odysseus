/**
 * Mongoose schema for the `analyses` collection. Unlike `audits`, this
 * collection intentionally allows multiple documents per auditId: the
 * same audit can be analysed more than once (once per language, and
 * again if the analysis is re-run after a prompt change). See
 * persist-analysis.ts and docs/rules/llm-layer-rules.md section 5.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type {
  FindingsProvenance,
  AnalysisSiteContext,
  ObligationAssessment,
  ReportLanguage,
  StoredTheme,
} from '@odysseus/core';

export interface AnalysisDocumentFields {
  analysisId: string;
  auditId: string;
  findingsProvenance: FindingsProvenance;
  language: ReportLanguage;
  /** Model identifier recorded at generation time alongside temperature for
   *  the same provenance reason the audit
   *  manifest records axe/Lighthouse versions: a model or temperature
   *  change between two monitoring runs must never read as the client's
   *  site changing. */
  model: string;
  /** Sampling temperature at the time this analysis was generated. See
   *  docs/rules/llm-layer-rules.md section 3. */
  temperature: number;
  generatedAt: Date;
  executiveSummary: string;
  overallRisk: 'low' | 'medium' | 'high';
  themes: StoredTheme[];
  quickWins: string[];
  notes: string;
  /** Computed once per audit by @odysseus/core's assessObligations, not
   *  by the model - see entity.ts's doc comment. Optional: older
   *  analyses predate this milestone. */
  obligationAssessment?: ObligationAssessment;
  /** The exact facts shown to the writing pass. Optional for historical
   * analyses that predate writing-context provenance. */
  siteContext?: AnalysisSiteContext;
  /** Present only on analyses produced by the audit fallback gate
   *  (docs/rules/llm-layer-rules.md section 10): the structure and
   *  writing passes never ran for this document. Absent on every
   *  model-generated analysis, including all legacy artifacts. */
  generationMode?: 'static-fallback';
  /** Issue #410: the `generatedAt` of the structure document this analysis's
   *  writing pass was given. A later run reuses a stored analysis only when
   *  this matches the structure it is about to use, so the bilingual pair is
   *  merged onto one set of themes. Absent on the static-fallback path and on
   *  analyses written before this was recorded; absent means "not reusable". */
  structureGeneratedAt?: string;
  /** Plan 070: the grounded critic's counts for this analysis. Declared by
   *  value (store does not depend on llm); mirrors WritingCriticRecord.
   *  Absent when the critic is off and on every earlier analysis. */
  writingCritic?: {
    ran: boolean;
    issuesRaised: number;
    issuesAccepted: number;
    repairApplied: boolean;
  };
}

export type AnalysisDocument = AnalysisDocumentFields;

/**
 * Mirrors llm-output.ts's StoredTheme.category, which is what a persisted
 * analysis may actually carry. That is wider than the model-facing
 * themeSchema.category: trade-off 16 still forbids a model from
 * synthesizing a 'geo' theme, but Plan 058's evidence-bound pipeline
 * derives a project's category from the findings it groups, so a stored
 * geo theme is legitimate and must persist. 'privacy' was added
 * 2026-08-24 (trade-off 31). The Exclude below fails the build if the
 * stored category type gains a value this list does not have - the drift
 * that made a real analysis unpersistable after 'privacy' was added to
 * the Zod schema and its hand-mirror but not here.
 */
const THEME_CATEGORY_VALUES = [
  'accessibility',
  'seo',
  'geo',
  'performance',
  'rendering',
  'privacy',
] as const satisfies readonly StoredTheme['category'][];

type UnlistedThemeCategory = Exclude<
  StoredTheme['category'],
  (typeof THEME_CATEGORY_VALUES)[number]
>;
const _themeCategoriesAreExhaustive: UnlistedThemeCategory extends never ? true : never = true;
void _themeCategoriesAreExhaustive;

const themeSchemaMongo = new Schema(
  {
    title: { type: String, required: true },
    category: {
      type: String,
      required: true,
      enum: THEME_CATEGORY_VALUES,
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
          {
            regimeId: { type: String, required: true },
            facts: { type: [Schema.Types.Mixed], default: [] },
          },
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
        {
          extractedSiren: { type: String, required: true },
          manualSiren: { type: String, required: true },
        },
        { _id: false },
      ),
    },
  },
  { _id: false },
);

// findingsSchemaVersion must be Number here: core's FindingsProvenance
// carries a numeric literal, the audits and reports collections store it
// as a number, and freshness/selection comparisons are strict. Typing this
// mirror String made Mongoose cast every stored analysis' stamp to "1",
// which never equals the audit row's 1 and silently kept every audit from
// reaching a fresh verified pair. Found live on the La Coorniche audit
// during the plan 019 operator review (2026-09-01).
const findingsProvenanceSchemaMongo = new Schema(
  {
    findingsSchemaVersion: { type: Number, required: true },
    normalizationFingerprint: { type: String, required: true },
    findingsDigest: { type: String, required: true },
  },
  { _id: false },
);

const analysisSiteContextSchemaMongo = new Schema<AnalysisSiteContext>(
  {
    businessType: { type: String, required: true },
    primaryGoal: { type: String, required: true },
    languagesServed: { type: [String], required: true },
    targetMarkets: { type: [String], required: true },
    propertyType: { type: String },
    // Legacy rows may still store a roomCount under siteContext; the field
    // is deliberately no longer mirrored (removed 2026-09-10): the writing
    // pass must never see a catalogue count, and the type no longer
    // carries one.
    city: { type: String },
    sector: { type: String },
  },
  { _id: false },
);

const analysisSchema = new Schema<AnalysisDocument>(
  {
    analysisId: { type: String, required: true },
    auditId: { type: String, required: true },
    findingsProvenance: { type: findingsProvenanceSchemaMongo, required: true },
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
    siteContext: { type: analysisSiteContextSchemaMongo },
    generationMode: { type: String, enum: ['static-fallback'] },
    structureGeneratedAt: { type: String },
    writingCritic: {
      type: new Schema(
        {
          ran: { type: Boolean, required: true },
          issuesRaised: { type: Number, required: true },
          issuesAccepted: { type: Number, required: true },
          repairApplied: { type: Boolean, required: true },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { collection: 'analyses' },
);

// Deliberately no unique index on auditId: multiple analyses per audit
// (once per language, again after a prompt change) is the intended
// common case, unlike the single unique audits document per auditId.
analysisSchema.index({ auditId: 1 });
analysisSchema.index({ auditId: 1, language: 1, generatedAt: -1 });
analysisSchema.index({ analysisId: 1 }, { unique: true, sparse: true });

export function createAnalysisModel(connection: Connection): Model<AnalysisDocument> {
  return (
    connection.models['Analysis'] ?? connection.model<AnalysisDocument>('Analysis', analysisSchema)
  );
}
