import type { ReportStrings } from './strings/i18n.js';

/** The id every numbered section's own `sheet(...)` call passes as its
 *  third argument (html-utils.ts), in the same fixed reading order
 *  render-html.ts's renderBody renders them. Stable regardless of which
 *  sections actually end up included in a given report - see
 *  computeSectionNumbers below for the live, renumbered ordinal. */
export const SECTION_IDS = [
  'section-01', 'section-02', 'section-03', 'section-04', 'section-05', 'section-06', 'section-07',
  'section-08', 'section-09', 'section-10', 'section-11', 'section-12', 'section-13', 'section-14',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

/** Canonical display title per section, resolved once here so the TOC
 *  row, the section's own numbered eyebrow, and any prose cross-reference
 *  pointing at it (e.g. accessibility-statement.ts's remediation-plan
 *  pointer) all read the exact same string.
 *
 *  report-feedback-palais-gallien.md items 3/4: previously the TOC label
 *  ("Priorités classées"), the section eyebrow ("Priorités"), and a
 *  hand-typed cross-reference quoting yet a third string were three
 *  independent copies per section, per language, and they drifted -
 *  section 04's cross-reference pointed at a title that matched none of
 *  the other two. Routing all three through this one function makes a
 *  fourth hand-typed copy a compile error (an unhandled SectionId) rather
 *  than a silent drift risk. */
export function sectionTitle(id: SectionId, strings: ReportStrings): string {
  switch (id) {
    case 'section-01':
      return strings.executiveSummary.eyebrow;
    case 'section-02':
      return strings.legalExposure.eyebrow;
    case 'section-03':
      return strings.statistics.eyebrow;
    case 'section-04':
      return strings.themes.eyebrow;
    case 'section-05':
      return strings.checklist.eyebrow;
    case 'section-06':
      return strings.observations.eyebrow;
    case 'section-07':
      return strings.conformanceSummary.eyebrow;
    case 'section-08':
      return strings.renderDiffEvidence.eyebrow;
    case 'section-09':
      return strings.coreWebVitals.eyebrow;
    case 'section-10':
      return strings.accessibilityStatement.eyebrow;
    case 'section-11':
      return strings.methodology.eyebrow;
    case 'section-12':
      return strings.findingsAppendix.eyebrow;
    case 'section-13':
      return strings.glossary.eyebrow;
    case 'section-14':
      return strings.nextSteps.eyebrow;
  }
}

/** Sequential 1-based ordinal for every included section, in registry
 *  order. Recomputed live from whichever sections actually rendered
 *  rather than a fixed per-section constant, so a suppressed section
 *  (observations.ts, when partitionFindings diverted nothing) never
 *  leaves a gap in the numbering shown to the client, and the TOC and the
 *  body headers can never disagree on what number a section carries. */
export function computeSectionNumbers(includedIds: ReadonlySet<SectionId>): ReadonlyMap<SectionId, number> {
  const numbers = new Map<SectionId, number>();
  let n = 0;
  for (const id of SECTION_IDS) {
    if (!includedIds.has(id)) continue;
    n += 1;
    numbers.set(id, n);
  }
  return numbers;
}
