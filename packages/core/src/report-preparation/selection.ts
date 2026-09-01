import type { FindingsProvenance } from '../normalize/findings-provenance.js';
import type { ReportLanguage } from '../types/llm-output.js';
import type { AnalysisPairRef, WritingSelection } from './preparation.js';

/**
 * Selected-analysis resolution, plan 019 step 2. One centralized decision:
 * an explicit selection is honoured when it still refers to a complete
 * compatible pair, otherwise selection fails closed with a typed reason;
 * only a legacy record with no explicit selection falls back to the latest
 * complete pair. Callers (store, CLI, report orchestration) must not
 * recover the old latest-record behaviour ad hoc.
 */

export interface AnalysisRecordLike {
  analysisId: string;
  auditId: string;
  language: ReportLanguage;
  findingsProvenance: FindingsProvenance;
  generatedAt: Date | string;
}

export type SelectedAnalysisPairResolution<A extends AnalysisRecordLike> =
  | { kind: 'selected'; fr: A; en: A }
  | { kind: 'legacy-latest'; fr: A; en: A }
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

/**
 * Trade-off 40 fail-closed, applied to the selector: analysis documents
 * written before the provenance milestone carry no stamp at all (the TS
 * type says required, but Mongoose only validates on write, so old rows in
 * a real database predate it). Such an analysis is never trusted and never
 * selectable; it is skipped, not crashed on. Found live on a real audit
 * whose stored analyses predated the stamp.
 */
function hasCompleteProvenance(analysis: AnalysisRecordLike): boolean {
  const provenance = analysis.findingsProvenance as FindingsProvenance | undefined;
  return (
    provenance !== undefined &&
    provenance.findingsSchemaVersion !== undefined &&
    typeof provenance.normalizationFingerprint === 'string' &&
    typeof provenance.findingsDigest === 'string'
  );
}

export function isCompleteCompatiblePair<A extends AnalysisRecordLike>(
  fr: A | undefined,
  en: A | undefined,
): boolean {
  if (!fr || !en) return false;
  if (!hasCompleteProvenance(fr) || !hasCompleteProvenance(en)) return false;
  if (fr.auditId !== en.auditId) return false;
  if (fr.language !== 'fr' || en.language !== 'en') return false;
  return provenanceKey(fr.findingsProvenance) === provenanceKey(en.findingsProvenance);
}

/**
 * The legacy fallback for audits created before explicit selection: the
 * newest complete compatible pair, grouped by structural run. Within a
 * provenance group the latest French and English analyses are paired; the
 * group whose pair is newest wins, ties broken by provenance digest for
 * determinism. Analyses without a provenance stamp are skipped (they can
 * never form a compatible pair). Returns null when no complete pair exists
 * at all.
 */
export function pickLegacyLatestPair<A extends AnalysisRecordLike>(
  analyses: readonly A[],
): { fr: A; en: A } | null {
  const groups = new Map<string, { fr?: A; en?: A; latest: number }>();
  for (const analysis of analyses) {
    if (!hasCompleteProvenance(analysis)) continue;
    const key = provenanceKey(analysis.findingsProvenance);
    const group = groups.get(key) ?? { latest: 0 };
    if (analysis.language === 'fr') {
      const current = group.fr;
      if (!current || timestampOf(analysis) > timestampOf(current)) group.fr = analysis;
    } else {
      const current = group.en;
      if (!current || timestampOf(analysis) > timestampOf(current)) group.en = analysis;
    }
    groups.set(key, group);
  }

  let best: { fr: A; en: A; completedAt: number; key: string } | null = null;
  for (const [key, group] of groups) {
    const { fr, en } = group;
    if (!isCompleteCompatiblePair(fr, en) || !fr || !en) continue;
    const completedAt = Math.max(timestampOf(fr), timestampOf(en));
    if (
      !best ||
      completedAt > best.completedAt ||
      (completedAt === best.completedAt && key > best.key)
    ) {
      best = { fr, en, completedAt, key };
    }
  }
  return best ? { fr: best.fr, en: best.en } : null;
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
    const en = analyses.find(
      (analysis) => analysis.analysisId === selected.enAnalysisId && analysis.language === 'en',
    );
    if (!isCompleteCompatiblePair(fr, en) || !fr || !en) {
      return { kind: 'none', reason: 'selection-incomplete' };
    }
    return { kind: 'selected', fr, en };
  }

  if (analyses.length === 0) return { kind: 'none', reason: 'no-analyses' };
  // A ready candidate must never become the current pair through this
  // fallback: for a legacy audit without explicit selection, the newest
  // analyses after a regeneration ARE the candidate's, and the fallback
  // would silently make the candidate effective before approval (the
  // exact failure the plan forbids, found live during the operator
  // review). The partial analyses of a failed run are excluded for the
  // same reason: one language succeeding while the other fails must not
  // leave a half-generated pair looking current.
  const candidate = selection?.candidate;
  const excluded = new Set<string>();
  if (candidate?.status === 'ready') {
    excluded.add(candidate.pair.frAnalysisId);
    excluded.add(candidate.pair.enAnalysisId);
  }
  if (candidate?.status === 'failed' && candidate.partialPair) {
    if (candidate.partialPair.frAnalysisId) excluded.add(candidate.partialPair.frAnalysisId);
    if (candidate.partialPair.enAnalysisId) excluded.add(candidate.partialPair.enAnalysisId);
  }
  const eligible =
    excluded.size > 0
      ? analyses.filter((analysis) => !excluded.has(analysis.analysisId))
      : analyses;
  const legacy = pickLegacyLatestPair(eligible);
  if (!legacy) return { kind: 'none', reason: 'no-complete-pair' };
  return { kind: 'legacy-latest', fr: legacy.fr, en: legacy.en };
}

/** The pair reference a ready candidate or an approval stores. */
export function analysisPairRefOf<A extends AnalysisRecordLike>(fr: A, en: A): AnalysisPairRef {
  return {
    frAnalysisId: fr.analysisId,
    enAnalysisId: en.analysisId,
    findingsProvenance: fr.findingsProvenance,
  };
}
