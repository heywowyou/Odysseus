import type {
  AuditManifest,
  CoreWebVitalMetricKey,
  Finding,
  ReferenceStat,
  ReportLanguage,
  StatSector,
  Theme,
} from '@odysseus/core';
import {
  AUDIT_ID_TO_CWV_KEY,
  CORE_WEB_VITAL_THRESHOLDS,
  LCEN_MENTIONS_LEGALES_RULE_ID,
  estimateRevenueImpact,
  selectReferenceStats,
} from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { formatMetricValue, METRIC_UNITS } from './core-web-vitals-table.js';
import {
  escapeHtml,
  escapeProse,
  fillTemplate,
  formatCappedFindingIdLinks,
  formatNumber,
  labelSeparator,
  pluralize,
  renderSheetHeader,
  sheet,
} from '../html-utils.js';
import { CATEGORY, LEVEL_COLOR, SEVERITY } from '../design-tokens.js';
import { detectFindingVendor, isThirdPartyFinding } from '../third-party-attribution.js';
import { sectionTitle } from '../section-registry.js';
import {
  buildLegacyPriority,
  type PriorityEvidence,
  type PriorityOwnership,
  type RenderedPriority,
  selectRenderedThemes,
} from '../rendered-priorities.js';

export { MAX_RENDERED_THEMES, selectRenderedThemes } from '../rendered-priorities.js';

/** F40: a quick win is low effort with medium or high impact, computed
 *  here in template code from the theme's own effort/impact - not from
 *  analysis.quickWins (which is a findingId list, a different, narrower
 *  concept: individual quick-fix findings, not whole themes). Verified
 *  against docs/report-v2-prototype-haaitza-fr.html: exactly the four
 *  low-effort themes (ranks 3, 4, 6, 7) carry the badge there. */
export function isQuickWinTheme(theme: Pick<Theme, 'effort' | 'impact'>): boolean {
  return theme.effort === 'low' && theme.impact !== 'low';
}

/** Doc §3 sections 04/05 cap: 6 themes, shared by "Priorités classées"
 *  and the printable checklist, even though the LLM layer's own schema
 *  allows up to 20 (llm-output.ts's themeSchema max). This is a report
 *  presentation cap, not a change to what the LLM is allowed to produce -
 *  the lower-priority themes past rank 6 are simply not printed. */

/** Quick-win star icon, ported verbatim from report.reference.html's
 *  inline SVG (a 5-point star), fixed colour per the reference (not a
 *  design-tokens.ts entry - it's the one badge in the reference that
 *  isn't drawn from the severity/category palette). */
const QUICK_WIN_ICON =
  '<svg width="10" height="10" viewBox="0 0 256 256" fill="currentColor"><path d="M239.2 97.29a16 16 0 0 0-13.81-11L166 81.17 142.72 25.81a15.95 15.95 0 0 0-29.44 0L90 81.17l-59.39 5.16a16 16 0 0 0-9.11 28.06l45 38.83L53.09 211a16 16 0 0 0 23.84 17.34L128 198.49l51.07 29.83A16 16 0 0 0 202.91 211l-13.4-57.78 45-38.83a16 16 0 0 0 4.69-17.1Z"></path></svg>';

function pageWord(strings: ReportStrings, count: number): string {
  return count === 1 ? strings.findingsAppendix.pageSingular : strings.findingsAppendix.pagePlural;
}

/** Plan 018 step 6, card block 3: the "What we observed" block. Never
 *  counts alone - the deterministic defect label always leads the sentence
 *  and the representative page and exact counts follow as that defect's
 *  scale. The label and the representative page come from the priority's
 *  own evidence selection (rendered-priorities.ts), so this card and the
 *  findings appendix cannot disagree about what the defect is called.
 *  overflow-wrap:anywhere keeps a long representative URL from pushing the
 *  card wider instead of wrapping. */
function renderObservationBox(
  strings: ReportStrings,
  language: ReportLanguage,
  evidence: PriorityEvidence,
): string {
  const t = strings.themes;
  const appendixStrings = strings.findingsAppendix;
  const sharedParams = {
    defect: evidence.representativeLabel,
    pages: formatNumber(evidence.uniquePageCount, language),
    pageWord: pageWord(strings, evidence.uniquePageCount),
    occurrences: formatNumber(evidence.occurrenceCount, language),
    occurrenceWord: pluralize(
      language,
      evidence.occurrenceCount,
      appendixStrings.occurrenceSingular,
      appendixStrings.occurrencePlural,
    ),
  };
  const text =
    evidence.representativePageUrl !== undefined
      ? fillTemplate(t.observationWithPageTemplate, {
          ...sharedParams,
          page: evidence.representativePageUrl,
        })
      : fillTemplate(t.observationNoPageTemplate, sharedParams);
  return renderRow(
    'evidence',
    t.observationLabel,
    `<p class="theme-row-text">${escapeHtml(text)}</p>`,
  );
}

const RATIO_KINDS_PER_TENTH_SECOND: ReadonlySet<string> = new Set([
  'conversion-uplift-per-0.1s',
  'aov-uplift-per-0.1s',
]);

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** The Core Web Vital a theme is actually about, read from its own
 *  findings' rule ids. Where several apply, the one the most findings name
 *  wins, ties broken by the fixed metric order so the choice is stable
 *  across runs.
 *
 *  2026-08-25 Lagnonu review, D7: this used to be hardcoded to LCP, so a
 *  priority titled "Blocage du navigateur par des scripts" - total blocking
 *  time, median 3 397 ms against a 200 ms threshold - carried the sentence
 *  "ecart mesure sur ce site : LCP median a 4 s". The note attached wherever
 *  the citation landed and described a different metric than the priority it
 *  sat under, which an IT-literate reader spots immediately. Same family as
 *  trade-off 16's B1: a deterministic attachment with the wrong anchor. */
const CWV_METRIC_PREFERENCE: readonly CoreWebVitalMetricKey[] = [
  'lcp',
  'tbt',
  'fcp',
  'speedIndex',
  'cls',
];

/** A real Lagnonu report exposed the gap this closes: a theme titled
 *  "Blocage du navigateur par des scripts JavaScript" (TBT) bundled one
 *  finding each for TBT, FCP, LCP and Speed Index (a real four-way tie),
 *  and the preference order below silently broke the tie toward LCP
 *  regardless of what the theme's own title was about - the exact wrong-
 *  anchor failure this function exists to prevent, just in a case the
 *  original D7 fix (single dominant metric) never covered. A genuine tie
 *  for the top count is now no metric at all: D7's own principle already
 *  states it - "saying nothing is correct there; quoting an unrelated
 *  metric is not" - and that principle does not stop applying just
 *  because the wrong metric it would otherwise quote happens to be the
 *  most commonly cited one (LCP) rather than an arbitrary one. */
function themeCoreWebVitalMetric(
  themeFindings: readonly Finding[],
): CoreWebVitalMetricKey | undefined {
  const counts = new Map<CoreWebVitalMetricKey, number>();
  for (const finding of themeFindings) {
    const key = AUDIT_ID_TO_CWV_KEY.get(finding.ruleId);
    if (key === undefined) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;

  const maxCount = Math.max(...counts.values());
  const topMetrics = CWV_METRIC_PREFERENCE.filter((key) => counts.get(key) === maxCount);
  return topMetrics.length === 1 ? topMetrics[0] : undefined;
}

const CWV_METRIC_LABELS: Record<CoreWebVitalMetricKey, (strings: ReportStrings) => string> = {
  lcp: (s) => s.coreWebVitals.lcpLabel,
  tbt: (s) => s.coreWebVitals.tbtLabel,
  fcp: (s) => s.coreWebVitals.fcpLabel,
  speedIndex: (s) => s.coreWebVitals.speedIndexLabel,
  cls: (s) => s.coreWebVitals.clsLabel,
};

/** item 14: a Deloitte "0.1 second = X% conversion" stat invites a reader
 *  to naively multiply that relationship by however many seconds they
 *  assume their site is over threshold. States the theme's own measured
 *  gap instead of leaving that extrapolation to the reader - only for
 *  the two ratio kinds actually expressed per 0.1s, and only when this
 *  site's own median for that metric (across the theme's affected pages) is
 *  genuinely above the "good" threshold, so a site that is actually fine
 *  never gets a manufactured gap sentence.
 *
 *  D7: a theme whose findings name no Core Web Vital gets no note at all,
 *  rather than being handed LCP's. Saying nothing is correct there; quoting
 *  an unrelated metric is not. */
function measuredCoreWebVitalGapNote(
  strings: ReportStrings,
  language: ReportLanguage,
  stat: ReferenceStat,
  themeFindings: readonly Finding[],
  manifest: AuditManifest,
): string | undefined {
  if (!stat.ratio || !RATIO_KINDS_PER_TENTH_SECOND.has(stat.ratio.kind)) return undefined;

  const metric = themeCoreWebVitalMetric(themeFindings);
  if (metric === undefined) return undefined;

  const themePageUrls = new Set(themeFindings.flatMap((f) => f.pageUrls));
  const values = manifest.pages
    .filter((page) => themePageUrls.has(page.url))
    .map((page) => page.coreWebVitals?.[metric]?.numericValue)
    .filter((value): value is number => value !== null && value !== undefined);

  const medianValue = median(values);
  const threshold = CORE_WEB_VITAL_THRESHOLDS.find((t) => t.key === metric);
  if (medianValue === null || !threshold || medianValue <= threshold.good) return undefined;

  const unit = METRIC_UNITS[metric];
  return fillTemplate(strings.themes.measuredCoreWebVitalGapTemplate, {
    metric: CWV_METRIC_LABELS[metric](strings),
    value: formatMetricValue(medianValue, unit, language),
    gap: formatMetricValue(medianValue - threshold.good, unit, language),
    threshold: formatMetricValue(threshold.good, unit, language),
  });
}

/** 2026-08-22 revenue-impact wiring: floors to 2 significant figures so
 *  a single-study ratio applied to a client's own turnover
 *  (estimateRevenueImpact's `annualRevenue x ratio` approximation) never
 *  reads as more precise than it is - "jusqu'à 4 200 EUR" is honest
 *  about being an order of magnitude, "jusqu'à 4 237 EUR" reads as a
 *  measurement. Floors, never rounds to nearest and never up, so the
 *  displayed figure is never larger than what the calculation actually
 *  produced - the same "never overstate" posture as the legal-exposure
 *  rule, extended to money. */
function roundConservativeEurEstimate(value: number): number {
  if (value <= 0) return 0;
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.floor(value / magnitude) * magnitude;
}

/** Present only when the theme's citation is a scalable stat (never a
 *  context-only case study or aggregate - estimateRevenueImpact itself
 *  refuses those) and the client's own Sirene-sourced turnover is known.
 *  Applies the stat's ratio exactly once against the client's full
 *  reported turnover, the same single, non-compounding application
 *  estimateRevenueImpact always does - never scaled by a measured gap or
 *  a page/finding count, which is what would turn a small real effect
 *  into an implausible one. */
function renderRevenueImpactNote(
  strings: ReportStrings,
  language: ReportLanguage,
  stat: ReferenceStat,
  turnoverEur: number | undefined,
): string | undefined {
  if (turnoverEur === undefined || stat.scalability !== 'scales-down' || !stat.ratio)
    return undefined;
  const result = estimateRevenueImpact(stat, turnoverEur);
  if ('error' in result) return undefined;
  const impact = roundConservativeEurEstimate(result.revenueGainEur);
  if (impact <= 0) return undefined;
  return fillTemplate(strings.themes.revenueImpactTemplate, {
    turnover: formatNumber(Math.round(turnoverEur), language),
    impact: formatNumber(impact, language),
  });
}

/** item 2.5: the metadata line below a theme card (effort/impact/pages/
 *  conformity/refs) used flex-wrap with no fixed widths, so a card whose
 *  finding-reference list happened to be long wrapped at a different point
 *  than one whose list was short - adjacent cards read as inconsistently
 *  laid out. Rendered as a fixed-column grid below instead, so every
 *  card's line wraps at the same positions regardless of content
 *  length. */
/** Issue #47 (superseding item 2.5's grid): the fixed five-column grid
 *  solved item 2.5's inconsistency by forcing every label/value pair into
 *  a narrow fixed cell, where the French pairs did not fit - a real report
 *  wrapped "Impact commercial" away from ": Élevé", stranded "28" at a
 *  line end away from "pages sur", and split "Conformité : Non /
 *  conforme" so a line began with a bare "Non". The strip is now a
 *  wrapping flex row of atomic label+value units: each unit keeps its
 *  label and value on one line (white-space:nowrap) and the row reflows
 *  between units, so a colon or a number can never be stranded. The
 *  finding-references unit stays wrappable: its capped id list is the one
 *  value long enough to need a second line, and it may only break between
 *  ids. */
/** P1.2 (2026-08-21 La Corniche feedback pass): a priority card's own
 *  recommendedActions (LLM-written prose) told the client to ask their
 *  agency to fix a defect that lived inside a third-party plugin (e.g.
 *  Gravity Forms) their agency structurally cannot patch, since the
 *  model has no way to know page-level vendor ownership. Rewriting the
 *  model's own bullets would need a new LLM pass; instead, a deterministic
 *  sentence beneath them splits the ask, reusing the same vendor
 *  detection third-party-attribution.ts already applies to findings.
 *  Rendered only when a theme's findings genuinely span both first- and
 *  third-party pages - a theme confined to one or the other needs no
 *  split, the existing prose already applies cleanly to all of it. */
/** True when every finding under a theme carries the theme's own
 *  category. A theme whose findings are all `privacy` or `geo` returns
 *  false for any label the locked schema allows, which is the intended
 *  outcome: no citation rather than a misattributed one. */
function themeFindingsAgreeWithCategory(
  theme: { category: string },
  themeFindings: readonly Finding[],
): boolean {
  if (themeFindings.length === 0) return false;
  return themeFindings.every((finding) => finding.category === theme.category);
}

function renderOwnershipSplitNote(
  strings: ReportStrings,
  language: ReportLanguage,
  themeFindings: readonly Finding[],
): string {
  const thirdPartyFindings = themeFindings.filter((f) => isThirdPartyFinding(f));
  const firstPartyFindings = themeFindings.filter((f) => !isThirdPartyFinding(f));
  if (thirdPartyFindings.length === 0 || firstPartyFindings.length === 0) return '';

  const t = strings.themes;
  const firstPartyPages = new Set(firstPartyFindings.flatMap((f) => f.pageUrls)).size;
  const thirdPartyPages = new Set(thirdPartyFindings.flatMap((f) => f.pageUrls)).size;
  const vendors = [
    ...new Set(
      thirdPartyFindings
        .map((f) => detectFindingVendor(f))
        .filter((v): v is string => v !== undefined),
    ),
  ];
  const vendorLabel = vendors.length > 0 ? vendors.join(', ') : t.ownershipSplitUnknownVendorLabel;

  const text = fillTemplate(t.ownershipSplitTemplate, {
    firstPartyPages: formatNumber(firstPartyPages, language),
    firstPartyPageWord: pageWord(strings, firstPartyPages),
    thirdPartyPages: formatNumber(thirdPartyPages, language),
    thirdPartyPageWord: pageWord(strings, thirdPartyPages),
    vendor: vendorLabel,
  });
  return `<p class="theme-note">${escapeHtml(text)}</p>`;
}

/** Companion to renderOwnershipSplitNote, for the case that function
 *  deliberately skips: a theme whose findings are entirely third-party. The
 *  model's own recommendedActions prose has no notion of vendor ownership
 *  and reads as "ask your agency" with no name - for a theme that is 100%
 *  one named vendor's markup (e.g. a booking widget's own iframe), that
 *  sends the client's agency after a fix it cannot make. Mutually exclusive
 *  with renderOwnershipSplitNote by construction: a theme is either split,
 *  fully third-party, or fully first-party, never two of those at once. */
function renderThirdPartyOnlyNote(
  strings: ReportStrings,
  themeFindings: readonly Finding[],
): string {
  if (themeFindings.length === 0 || !themeFindings.every((f) => isThirdPartyFinding(f))) return '';

  const t = strings.themes;
  const vendors = [
    ...new Set(
      themeFindings.map((f) => detectFindingVendor(f)).filter((v): v is string => v !== undefined),
    ),
  ];
  const vendorLabel = vendors.length > 0 ? vendors.join(', ') : t.ownershipSplitUnknownVendorLabel;

  const text = fillTemplate(t.thirdPartyOnlyTemplate, { vendor: vendorLabel });
  return `<p class="theme-note">${escapeHtml(text)}</p>`;
}

/** Points a priority card whose findings include the LCEN identification
 *  finding (rule id LCEN_MENTIONS_LEGALES_RULE_ID) back to the legal-
 *  exposure section, which is where the actual criterion, citation and
 *  scan observation are spliced deterministically (trade-off 28). Without
 *  this, a reader hits the finding here first with no indication that the
 *  same fact is addressed at length elsewhere in the report. */
function renderLcenCrossReferenceNote(
  strings: ReportStrings,
  themeFindings: readonly Finding[],
): string {
  if (!themeFindings.some((f) => f.ruleId === LCEN_MENTIONS_LEGALES_RULE_ID)) return '';

  const text = fillTemplate(strings.themes.lcenCrossReferenceTemplate, {
    legalSection: sectionTitle('section-02', strings),
  });
  return `<p class="theme-note">${escapeHtml(text)}</p>`;
}

function renderTheme(
  strings: ReportStrings,
  language: ReportLanguage,
  theme: Theme,
  findingsById: Map<string, Finding>,
  totalPagesScanned: number,
  citationStat: ReferenceStat | undefined,
  manifest: AuditManifest,
  /** report-feedback-la-corniche.md item 1.5: when every rendered theme
   *  is a quick win, the badge distinguishes nothing and the heading's
   *  claim to be sorted "par effort et par impact" reads as vacuous (a
   *  real report showed 6 of 6 cards carrying it, all "Effort : Faible").
   *  Rendered only when at least one rendered theme is not a quick win,
   *  same "don't show a signal that carries no information" reasoning as
   *  item D7's zero-count stat tiles. */
  showQuickWinBadge: boolean,
  /** P2.2 (2026-08-21 La Corniche feedback pass): "Sans objet" in the
   *  Conformité column read as "unknown" at the point a reader hits it -
   *  the explanation only existed in the glossary, 20 pages later. True
   *  for exactly the first rendered card whose conformity is "Sans
   *  objet", so the gloss appears once, right where it's first needed,
   *  not repeated on every card that shares the value. Issue #47 moved
   *  the gloss onto the "Exigence de conformité : Sans objet" box
   *  itself, since the footer strip no longer prints a second "Sans
   *  objet" line of its own. */
  showConformityGloss: boolean,
  /** 2026-08-22 revenue-impact wiring:
   *  ObligationAssessment.registrySnapshot.turnoverEur, threaded down
   *  from renderThemes. undefined whenever no Sirene lookup succeeded or
   *  the turnover figure specifically was marked unreliable for this
   *  client's effectif band - renderRevenueImpactNote already no-ops on
   *  undefined, this is just where it enters the call chain. */
  turnoverEur: number | undefined,
  priority?: RenderedPriority,
  /** Issue #41: the manifest's visited-page URL set, the same population
   *  the card's "sur {totalPages}" denominator counts. Confines the
   *  no-priority fallback page count to it so the ratio's two sides count
   *  the same pages. */
  scopePageUrls?: ReadonlySet<string>,
): string {
  const t = strings.themes;
  const themeFindings = theme.findingIds
    .map((id) => findingsById.get(id))
    .filter((f): f is Finding => f !== undefined);
  // Plan 018 step 6: the page count comes from the priority's own evidence
  // when one is attached, so the footer metadata and the observation block
  // are computed from the same selection by construction. The fallback (no
  // priority attached) counts the same population the evidence builder
  // does: distinct pages within the analyzed scope, never every cited URL
  // (issue #41 - a finding can cite a page outside the visited scope, and
  // this count renders against the visited-page total).
  const uniquePages = priority
    ? priority.evidence.uniquePageCount
    : new Set(
        themeFindings.flatMap((f) => f.pageUrls).filter((url) => scopePageUrls?.has(url) ?? true),
      ).size;

  const category = CATEGORY[theme.category];
  const categoryTag = `<span class="tag" style="background:${category.bg};color:${category.color}">${escapeHtml(strings.findingsAppendix.categoryLabels[theme.category])}</span>`;
  const quickWinBadge =
    showQuickWinBadge && isQuickWinTheme(theme)
      ? `<span class="tag qw" style="display:inline-flex;align-items:center;gap:4px">${QUICK_WIN_ICON}${escapeHtml(t.quickWinBadgeLabel)}</span>`
      : '';

  const isNonConformant = theme.legalRelevance !== undefined;
  const conformityValue = isNonConformant ? t.conformityNonConformant : t.conformityNotApplicable;

  // item 3.9 (La Corniche pass): legalRelevance is deterministically
  // accessibility-only (trade-off 16 in CLAUDE.md - a WCAG criterion
  // reference has no SEO/performance/rendering/GEO equivalent), so this
  // box used to render only for accessibility themes, leaving SEO
  // priority cards one row shorter and visibly different-shaped next to
  // them in the same "6 priorities" grid. Fabricating a fake standard
  // reference for SEO would violate rule 6 (never overstate a
  // requirement that does not exist), so every non-accessibility theme
  // instead gets the same box stating plainly that no such requirement
  // applies - the honest converse of the accessibility case, not an
  // invented one, using the same "Sans objet" wording item 3.8's
  // glossary entry already defines for the reader.
  //
  // P2.2 + issue #47: the "Sans objet" gloss (shown once, on the first
  // rendered card that needs it) sits on this box's sentence rather than
  // in the footer strip. The strip no longer prints a second "Conformité
  // : Sans objet" line three lines below this one saying the same thing
  // (issue #47's related duplication); the explanation still appears
  // exactly where "Sans objet" is first encountered.
  // P2.2 + issue #47: the "Sans objet" gloss is shown once, on the first
  // rendered card that needs it, beside the conformity requirement itself.
  const legalValue = theme.legalRelevance
    ? escapeHtml(theme.legalRelevance)
    : `${escapeHtml(t.conformityNotApplicable)}${showConformityGloss ? ` (${escapeHtml(t.conformityNotApplicableGloss)})` : ''}`;

  const gapNote = citationStat
    ? measuredCoreWebVitalGapNote(strings, language, citationStat, themeFindings, manifest)
    : undefined;
  const revenueImpactNote = citationStat
    ? renderRevenueImpactNote(strings, language, citationStat, turnoverEur)
    : undefined;
  // Same content and order as renderReferenceStatNote (the site's measured
  // gap first, the sourced benchmark, then the derived estimate), set as a
  // context item whose label sits in the card's rail.
  const citationItem = citationStat
    ? renderContextItem(
        t.impactCitationLabel,
        [gapNote, citationStat.citation[language], revenueImpactNote]
          .filter((line): line is string => line !== undefined)
          .map((line) => `<p>${escapeHtml(line)}</p>`)
          .join(''),
      )
    : '';

  // item 27: a diagnosis without a prescription - the LLM already writes
  // recommendedActions on every theme (writing-schema.ts, capped at 3,
  // language/severity-vocabulary validated), it was simply never
  // rendered.
  const recommendedActionsBox = renderThemeList(
    t.recommendedActionsLabel,
    theme.recommendedActions.map((action) => escapeProse(action)),
  );
  const deterministicActionsBox = renderThemeList(
    t.reviewedRemediationLabel,
    (priority?.remediations ?? []).map(
      (item) =>
        `<span class="mono theme-rule">${escapeHtml(item.ruleId)}</span>${labelSeparator(language)}${escapeHtml(item.text)}${renderThemeFixSnippet(item.snippet, t)}`,
    ),
  );
  const ownershipSentence = priority
    ? renderOwnershipSentence(strings, language, priority.ownershipCounts)
    : undefined;
  const ownershipBox = ownershipSentence
    ? `<p class="theme-note">${escapeHtml(ownershipSentence)}</p>`
    : '';
  const displayRank = priority?.displayRank ?? theme.priorityRank;

  const pagesText = fillTemplate(t.pagesOfTotalTemplate, {
    pages: formatNumber(uniquePages, language),
    pageWord: pageWord(strings, uniquePages),
    totalPages: formatNumber(totalPagesScanned, language),
  });

  // Plan 018 step 6 reading order, outcome first:
  //   1. rank, category, quick-win marker, stored title, then the decision
  //      facts a director budgets from (complexity, impact, affected pages,
  //      conformity when there is a status to state);
  //   2. "Why it matters", the model's own businessImpact;
  //   3. "What we observed", deterministic defect label + representative
  //      page + exact page and occurrence counts from the priority evidence;
  //   4. "What you can do", the recommended and reviewed remediation plus
  //      the ownership notes that qualify the ask;
  //   5. context: conformity requirement, citation, legal cross-reference,
  //      finding references.
  const facts = [
    renderFact(t.complexityLabel, escapeHtml(t.effortLevels[theme.effort])),
    renderFact(
      t.impactLabel,
      escapeHtml(t.effortImpactLevels[theme.impact]),
      LEVEL_COLOR[theme.impact].color,
    ),
    renderFact(t.affectedPagesLabel, escapeHtml(pagesText)),
    isNonConformant
      ? renderFact(t.conformityLabel, escapeHtml(conformityValue), SEVERITY.critical.color)
      : '',
  ].join('');

  const whyItMattersBox = renderRow(
    'problem',
    t.whyItMattersLabel,
    `<p class="theme-row-text">${escapeProse(theme.businessImpact)}</p>`,
  );
  const observationBox = priority ? renderObservationBox(strings, language, priority.evidence) : '';
  const trailingActionNotes = [
    ownershipBox,
    renderOwnershipSplitNote(strings, language, themeFindings),
    renderThirdPartyOnlyNote(strings, themeFindings),
  ].join('');
  const [actionLead, actionRest] = recommendedActionsBox
    ? [
        recommendedActionsBox.lead,
        recommendedActionsBox.rest + (deterministicActionsBox?.all ?? ''),
      ]
    : deterministicActionsBox
      ? [deterministicActionsBox.lead, deterministicActionsBox.rest]
      : [trailingActionNotes, ''];
  const whatYouCanDoBox = renderRow(
    'action',
    t.whatYouCanDoLabel,
    actionLead,
    recommendedActionsBox || deterministicActionsBox ? actionRest + trailingActionNotes : '',
  );
  const contextBox = `
      <div class="theme-row theme-row-context">
        <dl class="theme-context">
          ${renderContextItem(t.legalTagLabel, `<p>${legalValue}</p>${renderLcenCrossReferenceNote(strings, themeFindings)}`)}
          ${citationItem}
          ${renderContextItem(t.refsLabel, `<p>${formatCappedFindingIdLinks(theme.findingIds, language, strings.findingsAppendix)}</p>`)}
        </dl>
      </div>`;

  return `
    <div class="card elev-sm theme-card" style="margin-bottom:var(--space-8)" id="theme-${displayRank}" data-model-priority-rank="${theme.priorityRank}">
      <div class="theme-card-header">
        <span class="theme-rank">${displayRank}</span>
        <div class="theme-tags">
          ${categoryTag}
          ${quickWinBadge}
        </div>
        <div class="card-title">${escapeProse(theme.title)}</div>
        <div class="theme-facts">${facts}</div>
      </div>
      ${whyItMattersBox}
      ${observationBox}
      ${whatYouCanDoBox}
      ${contextBox}
    </div>
  `;
}

const OWNERSHIP_ORDER: readonly PriorityOwnership[] = [
  'first-party-action',
  'third-party-escalation',
  'verify-intent',
];

/** The card's correction ownership, naming only the groups that hold at
 *  least one correction: "0 à transmettre à un tiers et 0 à vérifier"
 *  told the client nothing. A card whose corrections all share one group
 *  gets a plain sentence instead of a one-item breakdown, and a card with
 *  no classified correction gets no sentence at all. */
export function renderOwnershipSentence(
  strings: ReportStrings,
  language: ReportLanguage,
  counts: Readonly<Record<PriorityOwnership, number>>,
): string | undefined {
  const t = strings.themes;
  const present = OWNERSHIP_ORDER.filter((group) => counts[group] > 0);
  if (present.length === 0) return undefined;
  if (present.length === 1) {
    const group = present[0]!;
    const count = counts[group];
    const templates = t.ownershipSingleGroupTemplates[group];
    return count === 1
      ? templates.one
      : fillTemplate(templates.many, { count: formatNumber(count, language) });
  }
  const parts = present.map((group) =>
    fillTemplate(t.ownershipPartTemplates[group], {
      count: formatNumber(counts[group], language),
    }),
  );
  return fillTemplate(t.ownershipSummaryTemplate, {
    parts: new Intl.ListFormat(language, { type: 'conjunction' }).format(parts),
  });
}

function renderFact(label: string, valueHtml: string, color?: string): string {
  const style = color ? ` style="color:${color}"` : '';
  return `<span class="theme-fact"><span class="theme-fact-label">${escapeHtml(label)}</span><span class="theme-fact-value"${style}>${valueHtml}</span></span>`;
}

function renderRow(
  kind: 'problem' | 'evidence' | 'action',
  label: string,
  leadHtml: string,
  restHtml = '',
): string {
  return `
      <div class="theme-row theme-row-${kind}">
        <div class="theme-row-lead"><div class="theme-row-label">${escapeHtml(label)}</div>${leadHtml}</div>
        ${restHtml}
      </div>`;
}

/** A labelled list split so its subhead and first item form the row's
 *  unbreakable lead block (see renderRow) and the remaining items flow as a
 *  second, visually continuous list. */
function renderThemeList(
  label: string,
  itemsHtml: readonly string[],
): { lead: string; rest: string; all: string } | undefined {
  if (itemsHtml.length === 0) return undefined;
  const [first, ...others] = itemsHtml;
  const lead = `<p class="theme-subhead">${escapeHtml(label)}</p><ul class="theme-list"><li>${first}</li></ul>`;
  const rest =
    others.length > 0
      ? `<ul class="theme-list theme-list-continued">${others.map((item) => `<li>${item}</li>`).join('')}</ul>`
      : '';
  return { lead, rest, all: `<div class="theme-list-group">${lead}${rest}</div>` };
}

function renderContextItem(label: string, valueHtml: string): string {
  return `<div class="theme-context-item"><dt>${escapeHtml(label)}</dt><dd>${valueHtml}</dd></div>`;
}

function renderThemeFixSnippet(
  snippet: { kind: 'fixed' | 'fill-in-blank'; rendered: string } | undefined,
  t: ReportStrings['themes'],
): string {
  if (snippet === undefined) return '';
  const note =
    snippet.kind === 'fill-in-blank'
      ? `<p class="theme-note" style="margin-top:var(--space-1)">${escapeHtml(t.fixSnippetFillInBlankNote)}</p>`
      : '';
  return `<div class="theme-snippet"><div class="theme-snippet-label">${escapeHtml(t.fixSnippetLabel)}</div><pre><code>${escapeHtml(snippet.rendered)}</code></pre>${note}</div>`;
}

/** Categories the reference-stat table has rows for. 'rendering' still
 *  gets no citation: no row in packages/core/src/reference-stats/stats.ts
 *  is tagged for it, and showing nothing is honest, not a bug. */
type CitableThemeCategory = 'accessibility' | 'seo' | 'performance';
function isCitableThemeCategory(category: Theme['category']): category is CitableThemeCategory {
  return category === 'accessibility' || category === 'seo' || category === 'performance';
}

/** item 13: the Baymard cart-abandonment/checkout-uplift stats are tagged
 *  ['accessibility', 'seo'] (stats.ts) so they can anchor either kind of
 *  theme, but their whole relevance is commercial checkout/cart context -
 *  a real report cited the 70.22% cart-abandonment figure on an ARIA
 *  structure finding for `.collection__list`, a generic listing element
 *  with no stated link to checkout at all. These two ratio kinds are the
 *  only ones in the table whose citation only makes sense when the
 *  specific theme actually touches a page the scan found transactional-
 *  flow evidence on, not merely "the site has a transactional flow
 *  somewhere". */
const RATIO_KINDS_REQUIRING_TRANSACTIONAL_CONTEXT: ReadonlySet<string> = new Set([
  'cart-abandonment-rate',
  'checkout-uplift',
]);

/** Pages the scan found direct transactional-flow evidence on (a checkout
 *  form, a payment or booking-engine script) - assessObligations() only
 *  ever attaches a 'transactional-flow' fact when SiteSignals.
 *  hasTransactionalFlow is confirmed true, and that fact carries the
 *  exact TransactionalFlowEvidence[] (each with its own pageUrl) the
 *  detector recorded, per packages/scanner's checks/transactional-flow.ts. */
function transactionalFlowPageUrls(analysis: StoredAnalysis): ReadonlySet<string> {
  const urls = new Set<string>();
  for (const basis of analysis.obligationAssessment?.basis ?? []) {
    for (const fact of basis.facts) {
      if (fact.kind !== 'transactional-flow') continue;
      for (const evidence of fact.evidence) urls.add(evidence.pageUrl);
    }
  }
  return urls;
}

/** item 1.1: a stat's `category` tag can be broader than its real topic
 *  (the Pew AI-overview stats are tagged 'seo' for a slot to attach to,
 *  but are really only about search-result click behavior) -
 *  `eligibleRuleIds`, when present, narrows attachment to themes whose
 *  own findings are actually about that topic, checked here rather than
 *  in selectReferenceStats (core has no notion of a "theme" to check
 *  against). */
function isStatEligibleForRuleIds(stat: ReferenceStat, themeFindings: readonly Finding[]): boolean {
  if (!stat.eligibleRuleIds) return true;
  return themeFindings.some((finding) => stat.eligibleRuleIds!.includes(finding.ruleId));
}

/** item 1.1: no statistic in REFERENCE_STAT_TABLE is about legal-notice
 *  or business-registry compliance - blocking the one confirmed
 *  mismatch (the Pew AI-overview stats, via eligibleRuleIds above) still
 *  let the next unfiltered SEO stat (Nestlé rich-results CTR) fall
 *  through onto the same "mentions légales incomplètes" (missing SIREN)
 *  theme, an equally topical mismatch a click-through-rate case study
 *  cannot speak to. A theme confined entirely to this one rule id gets
 *  no citation at all rather than whichever SEO stat happens to rank
 *  first with no topical check - "report, don't fabricate a comparison"
 *  applies to relevance, not only to sourcing.
 *
 *  Also true for a theme with zero resolvable findings at all: real
 *  manualFields resolved the underlying lcen-mentions-legales-missing
 *  finding out of resolvedFindings entirely (lcen-resolution.ts), but
 *  the theme itself still rendered with the finding it referenced simply
 *  gone - `themeFindings.every(...)` is vacuously true over an empty
 *  array, so without this an orphaned theme would pass the rule-id check
 *  trivially and still take whichever unrestricted stat came first, same
 *  defect as the non-empty case above. The theme itself no longer even
 *  reaches this function in the dangling case (item 0.6, fixed in
 *  selectRenderedThemes above), but this guard stays as defense in depth
 *  for a theme that has some real findings plus one already-resolved one,
 *  which selectRenderedThemes's filter does not touch. */
function isCitationIneligibleTheme(themeFindings: readonly Finding[]): boolean {
  return (
    themeFindings.length === 0 ||
    themeFindings.every((finding) => finding.ruleId === LCEN_MENTIONS_LEGALES_RULE_ID)
  );
}

function isStatEligibleForTheme(
  stat: ReferenceStat,
  themeFindings: readonly Finding[],
  transactionalPageUrls: ReadonlySet<string>,
): boolean {
  if (!isStatEligibleForRuleIds(stat, themeFindings)) return false;
  if (!stat.ratio || !RATIO_KINDS_REQUIRING_TRANSACTIONAL_CONTEXT.has(stat.ratio.kind)) return true;
  return themeFindings.some((finding) =>
    finding.pageUrls.some((url) => transactionalPageUrls.has(url)),
  );
}

export function renderThemes(
  strings: ReportStrings,
  ordinal: number,
  analysis: StoredAnalysis,
  findings: Finding[],
  manifest: AuditManifest,
  /** B1: shared across every citation render site in the document
   *  (render-html.ts creates one Set and passes it here and to
   *  renderFindingsAppendix, in the same order those sections render), so
   *  a statistic can appear at most once across the whole PDF - not just
   *  once per section. Mutated in place as citations are picked. Defaults
   *  to a fresh Set for callers (existing tests) that don't need
   *  cross-section dedupe. */
  citedStatIds: Set<string> = new Set(),
  /** Manual-input-layer milestone: AuditManualFields.sector, when the
   *  operator has confirmed a sector NAF-based auto-detection missed or
   *  got wrong. Wins over the auto-detected assessment.sector the same
   *  "manual wins" precedent resolveEffectiveSiren already uses for
   *  siren - only ever changes which reference-stat citation renders,
   *  never anything assessObligations decided. */
  sectorOverride?: StatSector,
  priorities?: readonly RenderedPriority[],
): string {
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const totalPagesScanned = manifest.pages.filter((page) => page.status === 'visited').length;
  // Issue #41: the same visited-page population the "sur {totalPages}"
  // denominator counts, threaded into both evidence paths so a priority's
  // page count can never exceed it.
  const scopePageUrls = new Set(
    manifest.pages.filter((page) => page.status === 'visited').map((page) => page.url),
  );
  // Plan 018 step 6: the fallback path goes through buildLegacyPriority so
  // even test/compatibility priorities carry the deterministic evidence the
  // observation block renders.
  const renderedPriorities =
    priorities ??
    selectRenderedThemes(analysis.themes, findingsById).map((theme, index) =>
      buildLegacyPriority(theme, index + 1, findingsById, analysis.language, scopePageUrls),
    );
  const sortedThemes = renderedPriorities.map((priority) => priority.theme);
  const sector = sectorOverride ?? analysis.obligationAssessment?.sector ?? 'general';

  // One citation per category, shown once on that category's
  // highest-priority theme (sortedThemes is already priorityRank-order),
  // not repeated on every theme - avoids a report where five
  // accessibility themes each restate the identical Deloitte sentence.
  const citedCategories = new Set<string>();
  const citationByRank = new Map<number, ReferenceStat>();
  const transactionalPageUrls = transactionalFlowPageUrls(analysis);
  for (const theme of sortedThemes) {
    const themeFindings = theme.findingIds
      .map((id) => findingsById.get(id))
      .filter((f): f is Finding => f !== undefined);
    // B2.2 (2026-08-24, Domaine Lagnonu). theme.category is chosen by the
    // model, and a real run labelled a security-headers theme
    // ('privacy' findings, per trade-off 25) as 'performance' - which would
    // attach a page-speed conversion statistic to a security priority.
    // That is trade-off 16's B1 defect arriving through the other input:
    // B1 fixed the stats table, nothing checked the category it is keyed on.
    //
    // The locked themeSchema (llm-output.ts) offers only accessibility |
    // seo | performance | rendering, so a privacy or geo theme has no
    // correct value available and the model's answer cannot be "fixed" by
    // rejecting it. Citations are therefore keyed off what the findings
    // actually are, and suppressed entirely when the theme's own findings
    // do not agree with its label - omitting a citation is always safe,
    // attaching the wrong one is not.
    if (!themeFindingsAgreeWithCategory(theme, themeFindings)) continue;
    if (!isCitableThemeCategory(theme.category)) continue;
    if (citedCategories.has(theme.category)) continue;
    if (isCitationIneligibleTheme(themeFindings)) continue;
    // P0.2 (2026-08-21 La Corniche feedback pass): strictSector so a
    // hospitality report never falls back to a generic/cross-sector stat
    // (e.g. Baymard e-commerce cart-abandonment on a labeling defect) -
    // omit the citation entirely rather than approximate.
    const candidates = selectReferenceStats(theme.category, sector, { strictSector: true });
    const top = candidates.find(
      (stat) =>
        !citedStatIds.has(stat.id) &&
        isStatEligibleForTheme(stat, themeFindings, transactionalPageUrls),
    );
    if (top) {
      citationByRank.set(theme.priorityRank, top);
      citedCategories.add(theme.category);
      citedStatIds.add(top.id);
    }
  }

  const showQuickWinBadge = !sortedThemes.every(isQuickWinTheme);
  // P2.2: the first rendered theme with no legalRelevance (i.e. whose
  // Conformité column reads "Sans objet") carries the inline gloss.
  const firstNotApplicableRank = sortedThemes.find(
    (theme) => theme.legalRelevance === undefined,
  )?.priorityRank;
  const turnoverEur = analysis.obligationAssessment?.registrySnapshot?.turnoverEur;
  const themeBlocks = renderedPriorities
    .map((priority) => {
      const theme = priority.theme;
      return renderTheme(
        strings,
        analysis.language,
        theme,
        findingsById,
        totalPagesScanned,
        citationByRank.get(theme.priorityRank),
        manifest,
        showQuickWinBadge,
        theme.priorityRank === firstNotApplicableRank,
        turnoverEur,
        priority,
        scopePageUrls,
      );
    })
    .join('');

  // P1.5 (2026-08-21 La Corniche feedback pass): every priority card gave
  // a qualitative effort label with no aggregate translation a director
  // could put in a budget line. Deterministic band-computation off the
  // rendered cards' own effort labels (packages/core's
  // estimateAggregateEffortDays), not a new LLM claim. Half-day
  // granularity: the underlying bands are already coarse, and a bare
  // integer would imply more precision than either range actually has.
  // P4.1 (2026-08-21 La Corniche feedback pass): Priorités is a heavy
  // section - accept the resulting white space rather than a section
  // header starting two lines above a page break, same reasoning already
  // applied to the checklist/annexe/glossaire sections.
  return sheet(
    `
    ${renderSheetHeader(ordinal, strings.themes.eyebrow, fillTemplate(strings.themes.headingTemplate, { count: sortedThemes.length }), 'var(--space-8)')}
    ${themeBlocks}
  `,
    '',
    'section-04',
  );
}
