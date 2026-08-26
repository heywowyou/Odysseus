import type { AuditManifest, Finding } from '@odysseus/core';
import { buildMissingPercentIndex, classifyDiversion } from './diversion.js';
import type { StructureThemeWithKey } from './structure-schema.js';

/** A finding present on this share of crawled pages, and carrying at
 *  least one WCAG criterion, may not be ranked in the bottom quartile of
 *  themes, and its theme's impact may not be below 'medium'. This is what
 *  put blocked zoom (18 of 20 pages) at position 11 in the v1 report.
 *  See docs/report-v2-refactor.md A5. */
export const SITE_WIDE_FINDING_PAGE_PERCENT_THRESHOLD = 80;
const BOTTOM_QUARTILE_FRACTION = 0.75;

function crawledPageCount(manifest: AuditManifest): number {
  return manifest.pages.filter((page) => page.status === 'visited').length;
}

function isSiteWideAccessibilityFinding(finding: Finding, crawledPages: number): boolean {
  if (finding.wcagCriteria.length === 0 || crawledPages === 0) return false;
  return (finding.pageUrls.length / crawledPages) * 100 >= SITE_WIDE_FINDING_PAGE_PERCENT_THRESHOLD;
}

function themeFindings(
  theme: StructureThemeWithKey,
  findingsById: ReadonlyMap<string, Finding>,
): Finding[] {
  return theme.findingIds
    .map((id) => findingsById.get(id))
    .filter((finding): finding is Finding => finding !== undefined);
}

function renumberRanks(themes: readonly StructureThemeWithKey[]): StructureThemeWithKey[] {
  return themes.map((theme, index) => ({ ...theme, priorityRank: index + 1 }));
}

/** Enforces the floor described above: bumps impact to at least 'medium'
 *  for any theme with a site-wide, WCAG-tagged finding, then, if such a
 *  theme's model-assigned rank falls in the bottom quartile, moves it up
 *  to sit just above that boundary. Everything else keeps its relative
 *  order. Returns a densely renumbered 1..N priorityRank sequence. */
export function enforceSiteWideAccessibilityFloor(
  themes: readonly StructureThemeWithKey[],
  findings: readonly Finding[],
  manifest: AuditManifest,
): StructureThemeWithKey[] {
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const crawledPages = crawledPageCount(manifest);
  const isFloorTheme = (theme: StructureThemeWithKey): boolean =>
    themeFindings(theme, findingsById).some((finding) =>
      isSiteWideAccessibilityFinding(finding, crawledPages),
    );

  const withImpactFloor = themes.map((theme) =>
    isFloorTheme(theme) && theme.impact === 'low' ? { ...theme, impact: 'medium' as const } : theme,
  );

  const sorted = [...withImpactFloor].sort((a, b) => a.priorityRank - b.priorityRank);
  const bottomQuartileStart = Math.ceil(sorted.length * BOTTOM_QUARTILE_FRACTION);

  const promoted = sorted.filter(
    (theme, index) => index >= bottomQuartileStart && isFloorTheme(theme),
  );
  if (promoted.length === 0) return renumberRanks(sorted);

  const remaining = sorted.filter(
    (theme, index) => !(index >= bottomQuartileStart && isFloorTheme(theme)),
  );
  // Insert promoted themes so their final indices land strictly below
  // bottomQuartileStart, not at it - the boundary index is itself "in
  // the bottom quartile" by the index >= bottomQuartileStart rule below.
  const insertAt = Math.max(0, bottomQuartileStart - promoted.length);
  const reordered = [...remaining.slice(0, insertAt), ...promoted, ...remaining.slice(insertAt)];

  return renumberRanks(reordered);
}

/** occurrences already means "pages" for a page-scoped finding and
 *  "nodes" for an element-scoped one (docs/normalization-rules.md
 *  section 3), so summing it per theme is a single volume signal that
 *  already reflects page count as well as raw occurrence count -
 *  matching docs/report-v2-refactor.md A6's "rank by occurrence volume
 *  as well as page count" without a second, potentially contradictory
 *  page-count factor (a single-page, 180-occurrence finding and a
 *  17-page, 203-occurrence finding are both exactly the kind of finding
 *  this rule exists to surface; they should not be weighed against each
 *  other). */
function totalOccurrences(
  theme: StructureThemeWithKey,
  findingsById: ReadonlyMap<string, Finding>,
): number {
  return themeFindings(theme, findingsById).reduce((sum, finding) => sum + finding.occurrences, 0);
}

/** Promotes a theme that is in the top half by occurrence volume but the
 *  bottom half by the model's own rank, so a 180- or 203-occurrence
 *  finding cannot rank below a single-occurrence minor. This condition is
 *  independent of theme count (unlike a fixed multiplier against the
 *  median, which is unstable with few themes), and mirrors
 *  enforceSiteWideAccessibilityFloor's own promote-to-the-boundary shape.
 *  See docs/report-v2-refactor.md A6 - the one rule in 4.2 with prose but
 *  no exact formula, most likely to need tuning once run against more
 *  than the two real fixtures on hand (sas-fernande, haaitza). */
export function applyOccurrenceWeighting(
  themes: readonly StructureThemeWithKey[],
  findings: readonly Finding[],
): StructureThemeWithKey[] {
  if (themes.length <= 1) return renumberRanks(themes);

  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const sorted = [...themes].sort((a, b) => a.priorityRank - b.priorityRank);
  const halfIndex = Math.floor(sorted.length / 2);

  const byOccurrenceDesc = [...sorted].sort(
    (a, b) => totalOccurrences(b, findingsById) - totalOccurrences(a, findingsById),
  );
  const occurrenceRankIndex = new Map(
    byOccurrenceDesc.map((theme, index) => [theme.themeKey, index]),
  );

  const promoted = sorted.filter(
    (theme, modelRankIndex) =>
      modelRankIndex >= halfIndex &&
      (occurrenceRankIndex.get(theme.themeKey) ?? Infinity) < halfIndex,
  );
  if (promoted.length === 0) return renumberRanks(sorted);
  promoted.sort(
    (a, b) =>
      (occurrenceRankIndex.get(a.themeKey) ?? 0) - (occurrenceRankIndex.get(b.themeKey) ?? 0),
  );

  const rest = sorted.filter((theme) => !promoted.includes(theme));
  const insertAt = Math.max(0, halfIndex - promoted.length);
  const reordered = [...rest.slice(0, insertAt), ...promoted, ...rest.slice(insertAt)];

  return renumberRanks(reordered);
}

/** Should be unreachable after the 4.1 diversion filter, since a diverted
 *  finding can never be referenced by a structure-pass theme in the first
 *  place (it was never in the input). Logs rather than rejects, so a
 *  regression in the diversion filter is visible instead of silently
 *  shipping the exact A1-A3 bad advice the filter exists to prevent. */
export function logContainmentWarnings(
  themes: readonly StructureThemeWithKey[],
  findings: readonly Finding[],
  manifest: AuditManifest,
): void {
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const missingPercentByUrl = buildMissingPercentIndex(manifest);

  for (const theme of themes) {
    const themeFindingRecords = themeFindings(theme, findingsById);
    if (themeFindingRecords.length === 0) continue;

    const allDiverted = themeFindingRecords.every(
      (finding) => classifyDiversion(finding, missingPercentByUrl) !== null,
    );
    if (allDiverted) {
      console.warn(
        `odysseus analyze (structure pass): theme ${theme.themeKey} resolves entirely to diverted ` +
          `pages (findings: ${themeFindingRecords.map((finding) => finding.findingId).join(', ')}). ` +
          'This should be unreachable after the diversion filter - investigate.',
      );
    }
  }
}

/** Mirrors packages/report/src/template/sections/themes.ts's own
 *  isQuickWinTheme predicate exactly (low effort, non-low impact).
 *  Duplicated rather than imported: packages/llm depends on @odysseus/core
 *  only, never on packages/report (CLAUDE.md, Packages), the same
 *  "duplicate a small table near a boundary, document why" precedent
 *  packages/report's own EFFECTIF_BAND_LABELS_EN and
 *  packages/llm's own SEVERITY_VOCABULARY already use for this exact
 *  package boundary. Exported: enforceImpactEffortOrdering below reuses
 *  it directly rather than a third copy of the same two lines. */
export function isQuickWinTheme(theme: Pick<StructureThemeWithKey, 'effort' | 'impact'>): boolean {
  return theme.effort === 'low' && theme.impact !== 'low';
}

const EFFORT_IMPACT_WEIGHT: Record<'low' | 'medium' | 'high', number> = {
  low: 1,
  medium: 2,
  high: 3,
};

/** report-feedback-palais-gallien.md item 15: enforceQuickWinFloor above
 *  only promotes a quick win that falls *behind* the first impact-'low'
 *  theme - it does nothing when every theme in the set carries medium or
 *  high impact, which was exactly the reported failure: three themes, all
 *  "Impact commercial : Élevé", ranked by descending effort (Élevé,
 *  Moyen, Faible) instead of by the section's own promised "classés par
 *  effort et par impact". No impact-'low' theme existed for the floor
 *  rule to anchor against, so it never fired.
 *
 *  This is the general case the floor rule is a special case of: a full
 *  re-sort by descending impact-to-effort ratio, with the model's own
 *  priorityRank kept only as the final tiebreaker so themes the ratio
 *  can't distinguish keep the model's relative order rather than an
 *  arbitrary one. Run last in applyStructureRankingRules so it is the
 *  definitive order, superseding (not fighting) the more narrowly-scoped
 *  floor rules that ran before it.
 *
 *  report-feedback-la-corniche.md item 0.8 [REGRESSION]: this used to
 *  bucket every quick-win theme (isQuickWinTheme, low effort + non-low
 *  impact) ahead of every non-quick-win theme as an absolute first sort
 *  key, before ever looking at the ratio - not merely a tiebreak among
 *  close calls, a hard partition. A real report had `image-alt` (25
 *  Critique findings, 166 occurrences, all 18 pages, impact 'high',
 *  effort 'medium', ratio 1.5) and `link-name` (Sérieux, 282
 *  occurrences, all 18 pages, same shape) sorted below every trivial
 *  low-effort fix in the audit, including a single-occurrence one,
 *  purely because they were not quick wins - contradicting the
 *  occurrence-weighting promotion applyStructureRankingRules had already
 *  given them earlier in the same pipeline. The bucket turns out to have
 *  been redundant for its own original purpose the whole time: both
 *  existing tests below (the "ranks the quick win first" and "orders
 *  non-quick-win themes by ratio" cases) already pass from the ratio
 *  computation alone - a low-effort, non-low-impact theme's ratio is
 *  always at least 2 (impact >= 'medium' over effort 'low'), which
 *  already outranks a 'medium'-impact/'medium'-effort theme's ratio of 1
 *  without needing a separate absolute veto. Deleted the bucket rather
 *  than tune it; nothing in this file's own test suite depended on it
 *  doing anything the ratio didn't already do. */
export function enforceImpactEffortOrdering(
  themes: readonly StructureThemeWithKey[],
): StructureThemeWithKey[] {
  const sorted = [...themes].sort((a, b) => {
    const aRatio = EFFORT_IMPACT_WEIGHT[a.impact] / EFFORT_IMPACT_WEIGHT[a.effort];
    const bRatio = EFFORT_IMPACT_WEIGHT[b.impact] / EFFORT_IMPACT_WEIGHT[b.effort];
    if (aRatio !== bRatio) return bRatio - aRatio;

    return a.priorityRank - b.priorityRank;
  });

  return renumberRanks(sorted);
}

/** B9 (report-feedback-haaitza.md): the priorities section is titled
 *  "classés par effort et par impact", but the model's raw rank could
 *  still put a low-effort/high-impact quick win below a low-impact theme
 *  - the real haaitza symptom was a "Gain rapide"-badged theme (faible
 *  effort, impact élevé) ranked below a theme with impact Faible.
 *
 *  Enforces the floor the heading claims: no quick-win theme may rank
 *  below the first non-quick-win theme with impact 'low' - quick wins at
 *  or past that boundary are promoted to sit just above it, in their
 *  existing relative order, mirroring
 *  enforceSiteWideAccessibilityFloor's own promote-to-the-boundary shape.
 *  A theme with impact 'low' can never itself be a quick win (the
 *  predicate requires impact !== 'low'), so the boundary theme is always
 *  a genuine non-quick-win. */
export function enforceQuickWinFloor(
  themes: readonly StructureThemeWithKey[],
): StructureThemeWithKey[] {
  const sorted = [...themes].sort((a, b) => a.priorityRank - b.priorityRank);
  const lowImpactFloorIndex = sorted.findIndex((theme) => theme.impact === 'low');
  if (lowImpactFloorIndex === -1) return renumberRanks(sorted);

  const promoted = sorted.filter(
    (theme, index) => index >= lowImpactFloorIndex && isQuickWinTheme(theme),
  );
  if (promoted.length === 0) return renumberRanks(sorted);

  const remaining = sorted.filter(
    (theme, index) => !(index >= lowImpactFloorIndex && isQuickWinTheme(theme)),
  );
  const insertAt = Math.max(0, lowImpactFloorIndex - promoted.length);
  const reordered = [...remaining.slice(0, insertAt), ...promoted, ...remaining.slice(insertAt)];

  return renumberRanks(reordered);
}

/** Applies all post-structure-pass ranking rules in order, per
 *  docs/report-v2-refactor.md 4.2 plus B9's quick-win floor. Enforced in
 *  code after the structure pass returns, not asked of the model, since a
 *  model cannot be trusted to remember a numeric threshold rule across
 *  every response.
 *
 *  report-feedback-la-corniche.md item 0.8 [REGRESSION]: applyOccurrenceWeighting
 *  used to run before enforceImpactEffortOrdering, which is documented as
 *  (and is) a full re-sort - it uses each theme's priorityRank only as a
 *  tiebreak for an *exactly equal* impact/effort ratio, so any promotion
 *  applyOccurrenceWeighting made was discarded the instant the promoted
 *  theme's ratio differed at all from its new neighbours', which is the
 *  common case (ratios are quantized to a handful of values from
 *  EFFORT_IMPACT_WEIGHT). A real report's `image-alt` theme (25 Critique
 *  findings, 166 occurrences, all 18 pages) got promoted into the top
 *  half by occurrence, then immediately sorted back down to rank 8 of 12
 *  by enforceImpactEffortOrdering, because its 'medium' effort gives it a
 *  ratio of 1.5 against a run of trivial 'low'-effort fixes at ratio 2.0
 *  or better - a large, severe, site-wide finding family losing to a
 *  single-occurrence fix purely because "effort" is a coarse three-value
 *  label with no reach signal in it at all. Occurrence weighting now runs
 *  last, so a theme whose reach the ratio-based sort cannot see still
 *  gets its floor enforced on the sort's actual final output rather than
 *  on an intermediate order that gets thrown away. */
export function applyStructureRankingRules(
  themes: readonly StructureThemeWithKey[],
  findings: readonly Finding[],
  manifest: AuditManifest,
): StructureThemeWithKey[] {
  const floored = enforceSiteWideAccessibilityFloor(themes, findings, manifest);
  const ordered = enforceImpactEffortOrdering(floored);
  const quickWinFloored = enforceQuickWinFloor(ordered);
  const weighted = applyOccurrenceWeighting(quickWinFloored, findings);
  logContainmentWarnings(weighted, findings, manifest);
  return weighted;
}
