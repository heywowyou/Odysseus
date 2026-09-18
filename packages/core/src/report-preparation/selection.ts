import type { FindingsProvenance } from '../normalize/findings-provenance.js';
import type { ReportLanguage } from '../types/llm-output.js';
import type { AnalysisPairRef, AnalysisSelectionRef, WritingSelection } from './preparation.js';

/**
 * Plan 067 selected-analysis resolution. French is the canonical required
 * analysis; English is optional. Historical bilingual selections remain
 * readable because AnalysisSelectionRef keeps the old field names and only
 * relaxes enAnalysisId.
 */
export interface AnalysisRecordLike {
  analysisId: string;
  auditId: string;
  language: ReportLanguage;
  findingsProvenance: FindingsProvenance;
  generatedAt: Date | string;
  /** Absent on legacy rows. New English attachment validates this strictly. */
  structureGeneratedAt?: string;
}

export type SelectedAnalysisPairResolution<A extends AnalysisRecordLike> =
  | { kind: 'selected'; fr: A; en?: A }
  | { kind: 'legacy-latest'; fr: A; en?: A }
  | { kind: 'none'; reason: 'no-analyses' | 'no-complete-pair' | 'selection-incomplete' };

function timestampOf(analysis: AnalysisRecordLike): number {
  return analysis.generatedAt instanceof Date
    ? analysis.generatedAt.getTime()
    : Date.parse(analysis.generatedAt);
}

function provenanceKey(provenance: FindingsProvenance): string {
  return [
    provenance.findingsSchemaVersion,
    provenance.normalizationFingerprint,
    provenance.findingsDigest,
  ].join('\u0000');
}

function hasCompleteProvenance(analysis: AnalysisRecordLike): boolean {
  const provenance = analysis.findingsProvenance as FindingsProvenance | undefined;
  return (
    provenance !== undefined &&
    provenance.findingsSchemaVersion !== undefined &&
    typeof provenance.normalizationFingerprint === 'string' &&
    typeof provenance.findingsDigest === 'string'
  );
}

function refMatchesAnalysis(ref: AnalysisSelectionRef, analysis: AnalysisRecordLike): boolean {
  return (
    hasCompleteProvenance(analysis) &&
    provenanceKey(ref.findingsProvenance) === provenanceKey(analysis.findingsProvenance)
  );
}

/** Compatibility predicate for an active selection. French alone is valid. */
export function isCompatibleAnalysisSelection<A extends AnalysisRecordLike>(
  fr: A | undefined,
  en?: A,
): boolean {
  if (!fr || !hasCompleteProvenance(fr) || fr.language !== 'fr') return false;
  if (!en) return true;
  if (!hasCompleteProvenance(en)) return false;
  return (
    en.language === 'en' &&
    fr.auditId === en.auditId &&
    provenanceKey(fr.findingsProvenance) === provenanceKey(en.findingsProvenance)
  );
}

/** Historical helper kept for explicit bilingual operations such as CLI --all. */
export function isCompleteCompatiblePair<A extends AnalysisRecordLike>(
  fr: A | undefined,
  en: A | undefined,
): boolean {
  return Boolean(en && isCompatibleAnalysisSelection(fr, en));
}

/**
 * Strict rule for a newly attached English analysis. Legacy bilingual rows
 * are allowed to lack structureGeneratedAt when merely read, but new English
 * writing must prove it used the exact same structure as the selected French.
 */
export function isEnglishAttachableToFrench<A extends AnalysisRecordLike>(
  fr: A | undefined,
  en: A | undefined,
): boolean {
  return Boolean(
    fr &&
      en &&
      isCompleteCompatiblePair(fr, en) &&
      fr.structureGeneratedAt !== undefined &&
      en.structureGeneratedAt !== undefined &&
      fr.structureGeneratedAt === en.structureGeneratedAt,
  );
}

/** Historical complete-pair fallback retained for callers that explicitly need two languages. */
export function pickLegacyLatestPair<A extends AnalysisRecordLike>(
  analyses: readonly A[],
): { fr: A; en: A } | null {
  const selection = pickLegacyLatestSelection(analyses);
  return selection?.en ? { fr: selection.fr, en: selection.en } : null;
}

/**
 * Legacy fallback for audits created before explicit selection. The newest
 * compatible French analysis wins; a compatible English analysis is attached
 * when one exists for the same findings provenance. This makes old bilingual
 * records load unchanged while allowing historical French-only rows to become
 * the canonical report without a migration.
 */
export function pickLegacyLatestSelection<A extends AnalysisRecordLike>(
  analyses: readonly A[],
): { fr: A; en?: A } | null {
  const eligible = analyses.filter(hasCompleteProvenance);
  const french = eligible
    .filter((analysis) => analysis.language === 'fr')
    .sort(
      (a, b) =>
        timestampOf(b) - timestampOf(a) ||
        provenanceKey(b.findingsProvenance).localeCompare(provenanceKey(a.findingsProvenance)),
    );
  const fr = french[0];
  if (!fr) return null;

  const en = eligible
    .filter(
      (analysis) =>
        analysis.language === 'en' &&
        analysis.auditId === fr.auditId &&
        provenanceKey(analysis.findingsProvenance) === provenanceKey(fr.findingsProvenance),
    )
    .sort((a, b) => timestampOf(b) - timestampOf(a))[0];

  return en ? { fr, en } : { fr };
}

export function resolveSelectedAnalysisPair<A extends AnalysisRecordLike>(
  selection: WritingSelection | undefined,
  analyses: readonly A[],
): SelectedAnalysisPairResolution<A> {
  const selected = selection?.selected;
  if (selected) {
    const fr = analyses.find(
      (analysis) => analysis.analysisId === selected.frAnalysisId && analysis.language === 'fr',
    );
    if (!fr || !refMatchesAnalysis(selected, fr)) {
      return { kind: 'none', reason: 'selection-incomplete' };
    }

    const en =
      selected.enAnalysisId === undefined
        ? undefined
        : analyses.find(
            (analysis) =>
              analysis.analysisId === selected.enAnalysisId && analysis.language === 'en',
          );
    if (
      (selected.enAnalysisId !== undefined && !en) ||
      !isCompatibleAnalysisSelection(fr, en) ||
      (en !== undefined && !refMatchesAnalysis(selected, en))
    ) {
      return { kind: 'none', reason: 'selection-incomplete' };
    }
    return en ? { kind: 'selected', fr, en } : { kind: 'selected', fr };
  }

  if (analyses.length === 0) return { kind: 'none', reason: 'no-analyses' };

  const candidate = selection?.candidate;
  const excluded = new Set<string>();
  if (candidate?.status === 'ready') {
    excluded.add(candidate.pair.frAnalysisId);
    if (candidate.pair.enAnalysisId) excluded.add(candidate.pair.enAnalysisId);
  }
  if (candidate?.status === 'failed' && candidate.partialPair) {
    if (candidate.partialPair.frAnalysisId) excluded.add(candidate.partialPair.frAnalysisId);
    if (candidate.partialPair.enAnalysisId) excluded.add(candidate.partialPair.enAnalysisId);
  }
  const eligible =
    excluded.size > 0
      ? analyses.filter((analysis) => !excluded.has(analysis.analysisId))
      : analyses;
  const legacy = pickLegacyLatestSelection(eligible);
  if (!legacy) return { kind: 'none', reason: 'no-complete-pair' };
  return legacy.en
    ? { kind: 'legacy-latest', fr: legacy.fr, en: legacy.en }
    : { kind: 'legacy-latest', fr: legacy.fr };
}

export function analysisSelectionRefOf<A extends AnalysisRecordLike>(
  fr: A,
  en?: A,
): AnalysisSelectionRef {
  return {
    frAnalysisId: fr.analysisId,
    ...(en !== undefined ? { enAnalysisId: en.analysisId } : {}),
    findingsProvenance: fr.findingsProvenance,
  };
}

/** @deprecated Historical pair helper for callers explicitly holding both analyses. */
export function analysisPairRefOf<A extends AnalysisRecordLike>(fr: A, en: A): AnalysisPairRef {
  return analysisSelectionRefOf(fr, en);
}
