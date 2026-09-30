import {
  SEVERITY_ORDER,
  summarizeAuditCoverage,
  type AuditManifest,
  type Finding,
} from '@odysseus/core';
import { buildMissingPercentIndex, classifyDiversion } from './diversion.js';
import type { StructureThemeWithKey } from './structure-schema.js';

/** A finding present on this share of crawled pages, and carrying at
 *  least one WCAG criterion, may not be ranked in the bottom quartile of
 *  themes, and its theme's impact may not be below 'medium'. This is what
 *  put blocked zoom (18 of 20 pages) at position 11 in the v1 report.
 *  See docs/archive/report-v2-refactor.md A5. */
export const SITE_WIDE_FINDING_PAGE_PERCENT_THRESHOLD = 80;
const BOTTOM_QUARTILE_FRACTION = 0.75;

function crawledPageCount(manifest: AuditManifest): number {
  const coverage = summarizeAuditCoverage(manifest);
  return coverage.kind === 'current'
    ? coverage.passes.axe.completed
    : manifest.pages.filter((page) => page.status === 'visited').length;
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
 *  "nodes" for an element-scoped one (docs/rules/normalization-rules.md
 *  section 3), so summing it per theme is a single volume signal that
 *  already reflects page count as well as raw occurrence count -
 *  matching docs/archive/report-v2-refactor.md A6's "rank by occurrence volume
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
 *  See docs/archive/report-v2-refactor.md A6 - the one rule in 4.2 with prose but
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
function isQuickWinTheme(theme: Pick<StructureThemeWithKey, 'effort' | 'impact'>): boolean {
  return theme.effort === 'low' && theme.impact !== 'low';
}

const EFFORT_IMPACT_WEIGHT: Record<'low' | 'medium' | 'high', number> = {
  low: 1,
  medium: 2,
  high: 3,
};

/** Shared by enforceImpactEffortOrdering (below) and
 *  enforceSeverityReachOrdering, whose secondary key this ratio is.
 *  Quantized to a handful of values (1, 1.5, 2, 3, ...), which is exactly
 *  why it works as a tiebreak rather than a primary key: see
 *  enforceSeverityReachOrdering. */
function impactEffortRatio(theme: Pick<StructureThemeWithKey, 'effort' | 'impact'>): number {
  return EFFORT_IMPACT_WEIGHT[theme.impact] / EFFORT_IMPACT_WEIGHT[theme.effort];
}

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
 *  arbitrary one. It used to run as the definitive order of
 *  applyStructureRankingRules; issue #295 demoted it (see
 *  enforceSeverityReachOrdering, which reuses this ratio as its secondary
 *  key), because a ratio-first sort carries no severity or page-reach
 *  signal at all. Still exported, unchanged, as the ratio-only order:
 *  its own tests pin the tiebreak semantics the new sort inherits. */
export function enforceImpactEffortOrdering(
  themes: readonly StructureThemeWithKey[],
): StructureThemeWithKey[] {
  const sorted = [...themes].sort((a, b) => {
    const ratioDiff = impactEffortRatio(b) - impactEffortRatio(a);
    if (ratioDiff !== 0) return ratioDiff;

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
 *  a genuine non-quick-win.
 *
 *  Issue #295 demoted this out of applyStructureRankingRules: its
 *  promotion ignores severity and page reach entirely, so it would lift
 *  a low-reach quick win above a critical, site-wide workstream that the
 *  severity-reach sort had correctly placed higher - the exact Villas
 *  Foch failure the issue is about, reintroduced as a "floor". Its
 *  legitimate guarantee survives demotion without this function: a
 *  quick-win theme's impact/effort ratio is always >= 2 and every
 *  non-quick-win's ratio is <= 1, so inside any severity-reach tie group
 *  (the only place the secondary ratio key is consulted) quick wins
 *  already rank above non-quick-wins, and above low-impact themes in
 *  particular. Kept exported with its original behavior for its own
 *  documented unit tests. */
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

/** Per-theme severity x reach: for each distinct audited page the theme's
 *  findings appear on, the SEVERITY_ORDER weight (critical 4, serious 3,
 *  moderate 2, minor 1 - the same weights computeBrokennessScore uses) of
 *  the worst finding on that page, summed over those pages. The page count
 *  is the reach; the per-page worst severity is the harm there.
 *
 *  It used to be the sum of the weights over the theme's distinct findings,
 *  multiplied by its page count. That measured how finely normalization
 *  split a rule, not how much harm the theme causes: a heading-order theme
 *  whose skips split into seven moderate findings by level pair (weight 14)
 *  outranked a contrast theme of four serious findings (weight 12) on the
 *  same 37 pages, and a hotel's first priority became a moderate one.
 *  Deliberately findings, not occurrences: occurrences conflate pages with
 *  DOM nodes (docs/rules/normalization-rules.md section 3); volume has its
 *  own bounded rule, applyOccurrenceWeighting. A theme whose findings
 *  resolve to nothing scores 0 and falls through to the tiebreaks. */
function severityReach(
  theme: StructureThemeWithKey,
  findingsById: ReadonlyMap<string, Finding>,
): number {
  const worstByPage = new Map<string, number>();
  for (const finding of themeFindings(theme, findingsById)) {
    const weight = SEVERITY_ORDER[finding.severity];
    for (const url of finding.pageUrls) {
      worstByPage.set(url, Math.max(worstByPage.get(url) ?? 0, weight));
    }
  }
  let total = 0;
  for (const weight of worstByPage.values()) total += weight;
  return total;
}

/** Issue #295 [Villas Foch, Haaitza]: the definitive full re-sort that
 *  replaces enforceImpactEffortOrdering as the pipeline's primary order.
 *  The old ratio-first sort carries no severity and no page-reach signal
 *  at all, which is how a real report ranked 1. Touch targets (Faible
 *  effort / Moyen impact, 3/24 pages) and 2. Contrast (Faible/Moyen,
 *  2/24) above 3. Alt text (Elevé/Elevé, 24/24 pages - the source of
 *  ~170 critical findings), ranked a Faible/Faible heading theme above
 *  it too, and left critical button-name and serious untitled-iframes
 *  work (24 pages) out of the rendered priorities entirely; Haaitza's
 *  priority 1 was structured data (Faible/Moyen, 16 pages) while its own
 *  page 4 called accessibility the main subject.
 *
 *  Sort keys, in order:
 *
 *  1. severityReach, descending - severity x reach first, per the
 *     issue. This is report-feedback-la-corniche.md item
 *     0.8's real lesson generalized: that regression (image-alt, 25
 *     Critique findings on all 18 pages, buried at rank 8 of 12) was
 *     diagnosed as an effort-ratio failure, but the deeper defect is that
 *     any sort without severity and reach in its key can bury a large,
 *     severe, site-wide family under trivial work, whatever its secondary
 *     keys are.
 *  2. impact/effort ratio, descending - effort still matters, but only
 *     between themes the harm signal cannot distinguish. Every
 *     quick-win ratio is >= 2 and every non-quick-win ratio is <= 1, so
 *     within a tie group quick wins outrank low-impact themes: B9's
 *     guarantee (enforceQuickWinFloor, demoted from the pipeline - see
 *     its own comment) survives as this tiebreak without ever overriding
 *     the severity-reach order.
 *  3. the model's priorityRank, ascending - themes otherwise
 *     indistinguishable keep the model's relative order.
 *  4. the quick-win flag - reachable only if the model emitted duplicate
 *     priorityRanks (the schema does not force them distinct), kept as
 *     the explicit final tiebreak so "quick win" is a flag, never a
 *     bucket.
 *
 *  Pure: derives everything from the themes and the findings they
 *  reference; no I/O, no manifest (reach's denominator is constant per
 *  run, so the integer product above orders identically to the share). */
export function enforceSeverityReachOrdering(
  themes: readonly StructureThemeWithKey[],
  findings: readonly Finding[],
): StructureThemeWithKey[] {
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));

  const keyed = themes.map((theme) => ({
    theme,
    weight: severityReach(theme, findingsById),
  }));

  keyed.sort((a, b) => {
    if (a.weight !== b.weight) return b.weight - a.weight;

    const ratioDiff = impactEffortRatio(b.theme) - impactEffortRatio(a.theme);
    if (ratioDiff !== 0) return ratioDiff;

    if (a.theme.priorityRank !== b.theme.priorityRank) {
      return a.theme.priorityRank - b.theme.priorityRank;
    }

    return (isQuickWinTheme(b.theme) ? 1 : 0) - (isQuickWinTheme(a.theme) ? 1 : 0);
  });

  return renumberRanks(keyed.map((entry) => entry.theme));
}

/** Issue #295, stated as an invariant: no critical finding may be left
 *  outside the rendered priorities while a low-impact priority is
 *  included. enforceSeverityReachOrdering already satisfies it whenever
 *  the critical theme has meaningful reach, but a critical finding
 *  confined to a few pages scores low on severity x reach and can
 *  legitimately sort below broader moderate work - and then still below
 *  a theme the model itself labelled impact 'low'. That last step is
 *  never defensible: the model's own impact label says "do this later",
 *  while a critical finding is the report's headline harm.
 *
 *  Enforces exactly that boundary, in
 *  enforceSiteWideAccessibilityFloor's promote-to-the-boundary shape:
 *  every theme carrying at least one critical-severity finding is moved
 *  to sit just above the first critical-free impact-'low' theme, in
 *  their existing relative order. Themes whose findings include a
 *  critical one are never buried by their own low impact label, and
 *  critical-free low-impact themes keep their order among themselves.
 *  Runs last in applyStructureRankingRules so the guarantee holds on the
 *  final order, after applyOccurrenceWeighting's bounded promotions. */
export function enforceCriticalVisibilityFloor(
  themes: readonly StructureThemeWithKey[],
  findings: readonly Finding[],
): StructureThemeWithKey[] {
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const carriesCritical = (theme: StructureThemeWithKey): boolean =>
    themeFindings(theme, findingsById).some((finding) => finding.severity === 'critical');

  const sorted = [...themes].sort((a, b) => a.priorityRank - b.priorityRank);
  const buriesCritical = (theme: StructureThemeWithKey): boolean =>
    !carriesCritical(theme) && theme.impact === 'low';
  const floorIndex = sorted.findIndex(buriesCritical);
  if (floorIndex === -1) return renumberRanks(sorted);

  const promoted = sorted.filter((theme, index) => index > floorIndex && carriesCritical(theme));
  if (promoted.length === 0) return renumberRanks(sorted);

  const remaining = sorted.filter((theme) => !promoted.includes(theme));
  const insertAt = Math.max(0, floorIndex - promoted.length);
  const reordered = [...remaining.slice(0, insertAt), ...promoted, ...remaining.slice(insertAt)];

  return renumberRanks(reordered);
}

/** Applies all post-structure-pass ranking rules in order, per
 *  docs/archive/report-v2-refactor.md 4.2 as amended by issue #295.
 *  Enforced in code after the structure pass returns, not asked of the
 *  model, since a model cannot be trusted to remember a numeric
 *  threshold rule across every response.
 *
 *  Order, and why each stage sits where it does:
 *
 *  1. enforceSiteWideAccessibilityFloor - kept first, as before. Its
 *     lasting effect is the impact bump (low -> medium) on themes with a
 *     site-wide WCAG finding, which feeds the ratio tiebreak of stage 2;
 *     its promotion is subsumed by stage 2's severity x reach key, which
 *     already puts a site-wide accessibility theme with critical
 *     findings above every low-reach low-impact theme (issue #295's
 *     restatement of this rule's goal).
 *  2. enforceSeverityReachOrdering - the definitive full re-sort
 *     (#295): severity x reach first, ratio second, model rank third,
 *     quick-win flag last. Supersedes enforceImpactEffortOrdering's
 *     ratio-first sort, which buried critical site-wide workstreams
 *     under low-impact quick wins in the real Villas Foch report.
 *  3. applyOccurrenceWeighting - kept, bounded as ever: promotes
 *     occurrence-heavy themes from the bottom half to the half boundary
 *     (report-v2 A6). It is no longer asked to rescue themes the primary
 *     sort buried - severity x reach already sees page count and finding
 *     weight - but a modest-severity, high-occurrence family on few
 *     pages still deserves its bounded promotion, and it cannot break
 *     stage 4's invariant.
 *  4. enforceCriticalVisibilityFloor - the final invariant (#295): no
 *     theme carrying a critical finding below any critical-free
 *     low-impact theme, so a critical finding can never be rendered out
 *     of the priorities while a low-impact priority is included. Runs
 *     last because stages 2-3 reorder the list and the guarantee must
 *     hold on the order actually returned.
 *
 *  enforceQuickWinFloor is no longer in the pipeline (demoted to a
 *  tiebreak inside stage 2 - see its own comment): its promotion ignores
 *  severity and reach, so keeping it would lift low-reach quick wins
 *  back over critical site-wide work, the exact #295 failure.
 *  enforceImpactEffortOrdering is likewise no longer called as a stage;
 *  its ratio lives on as stage 2's secondary key. */
export function applyStructureRankingRules(
  themes: readonly StructureThemeWithKey[],
  findings: readonly Finding[],
  manifest: AuditManifest,
): StructureThemeWithKey[] {
  const floored = enforceSiteWideAccessibilityFloor(themes, findings, manifest);
  const ordered = enforceSeverityReachOrdering(floored, findings);
  const weighted = applyOccurrenceWeighting(ordered, findings);
  const criticalFloored = enforceCriticalVisibilityFloor(weighted, findings);
  logContainmentWarnings(criticalFloored, findings, manifest);
  return criticalFloored;
}
