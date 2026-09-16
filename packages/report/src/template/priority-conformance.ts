import { compareCriteria, isAuditedConformanceLevel } from '@odysseus/core';
import type { Finding, Theme } from '@odysseus/core';
import { buildLegalRelevance } from '@odysseus/llm';
import type { StoredAnalysis } from '../types.js';

/** Issue #310: the single computation behind both a priority card's
 *  "Exigence de conformité" line and the checklist's WCAG column. The card
 *  read the stored theme.legalRelevance, which the analysis merge gates on
 *  the theme's category, while the checklist took the raw union of every
 *  finding's criteria. A priority grouping hreflang with no-h1 and
 *  heading-hierarchy-skip (SEO findings tagged 1.3.1) printed "Sans objet"
 *  on its card and 1.3.1 in the checklist. Both now take the WCAG A/AA
 *  criteria of the priority's accessibility findings, the same population
 *  conformance-rollup.ts counts for the per-criterion table, so the card,
 *  the checklist and that table cannot disagree about a criterion. */
export function priorityConformanceCriteria(themeFindings: readonly Finding[]): string[] {
  return [
    ...new Set(
      themeFindings
        .filter((finding) => finding.category === 'accessibility')
        .flatMap((finding) => finding.wcagCriteria),
    ),
  ]
    .filter(isAuditedConformanceLevel)
    .sort(compareCriteria);
}

/** Rebuilds every theme's legalRelevance from priorityConformanceCriteria,
 *  so a stored analysis rendered today agrees with the checklist even when
 *  it was merged before this rule. */
export function withPriorityConformance(
  analysis: StoredAnalysis,
  findings: readonly Finding[],
): StoredAnalysis {
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const themes = analysis.themes.map((theme): Theme => {
    const themeFindings = theme.findingIds
      .map((id) => findingsById.get(id))
      .filter((finding): finding is Finding => finding !== undefined);
    const criteria = priorityConformanceCriteria(themeFindings);
    const legalRelevance =
      criteria.length > 0 ? buildLegalRelevance(criteria, analysis.language) : '';
    const { legalRelevance: _stored, ...rest } = theme;
    return legalRelevance ? { ...rest, legalRelevance } : rest;
  });
  return { ...analysis, themes };
}
