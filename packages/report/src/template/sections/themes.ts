import type { AuditManifest, Finding, ReferenceStat, ReportLanguage, StatSector, Theme } from '@odysseus/core';
import { CORE_WEB_VITAL_THRESHOLDS, LCEN_MENTIONS_LEGALES_RULE_ID, selectReferenceStats } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatFindingIdLinks, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';
import { CATEGORY } from '../design-tokens.js';
import { renderReferenceStatNote } from '../reference-stat-note.js';

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
export const MAX_RENDERED_THEMES = 6;

/** Same top-N-by-rank selection shared by themes.ts and checklist.ts, so
 *  the two sections can never disagree on which themes made the cut.
 *
 *  item 0.6 (La Corniche pass): a theme can end up with zero resolved
 *  findings - e.g. the LCEN mentions-légales finding it was built from
 *  gets stripped later by lcen-resolution.ts's resolveLcenFinding once an
 *  operator confirms where the SIREN is displayed - and a dangling theme
 *  like that was still winning a top-6 slot and rendering "0 pages sur
 *  18" as if it were a real priority. Filtered out before ranking, not
 *  after, so it can never occupy a slot a real priority should have had.
 *  findingsById must be the same map the caller already builds for
 *  rendering, not a second lookup. */
export function selectRenderedThemes(themes: readonly Theme[], findingsById: ReadonlyMap<string, Finding>): Theme[] {
  const withResolvedFindings = themes.filter((theme) => theme.findingIds.some((id) => findingsById.has(id)));
  return [...withResolvedFindings].sort((a, b) => a.priorityRank - b.priorityRank).slice(0, MAX_RENDERED_THEMES);
}

/** Quick-win star icon, ported verbatim from report.reference.html's
 *  inline SVG (a 5-point star), fixed colour per the reference (not a
 *  design-tokens.ts entry - it's the one badge in the reference that
 *  isn't drawn from the severity/category palette). */
const QUICK_WIN_ICON =
  '<svg width="10" height="10" viewBox="0 0 256 256" fill="currentColor"><path d="M239.2 97.29a16 16 0 0 0-13.81-11L166 81.17 142.72 25.81a15.95 15.95 0 0 0-29.44 0L90 81.17l-59.39 5.16a16 16 0 0 0-9.11 28.06l45 38.83L53.09 211a16 16 0 0 0 23.84 17.34L128 198.49l51.07 29.83A16 16 0 0 0 202.91 211l-13.4-57.78 45-38.83a16 16 0 0 0 4.69-17.1Z"></path></svg>';

function pageWord(strings: ReportStrings, count: number): string {
  return count === 1 ? strings.findingsAppendix.pageSingular : strings.findingsAppendix.pagePlural;
}

const RATIO_KINDS_PER_TENTH_SECOND: ReadonlySet<string> = new Set(['conversion-uplift-per-0.1s', 'aov-uplift-per-0.1s']);

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function toSeconds(ms: number, language: ReportLanguage): string {
  return formatNumber(Math.round((ms / 1000) * 10) / 10, language);
}

/** item 14: a Deloitte "0.1 second = X% conversion" stat invites a reader
 *  to naively multiply that relationship by however many seconds they
 *  assume their site is over threshold. States the theme's own measured
 *  LCP gap instead of leaving that extrapolation to the reader - only for
 *  the two ratio kinds actually expressed per 0.1s, and only when this
 *  site's own median LCP (across the theme's affected pages) is
 *  genuinely above the "good" threshold, so a site that is actually fine
 *  never gets a manufactured gap sentence. */
function measuredLcpGapNote(
  strings: ReportStrings,
  language: ReportLanguage,
  stat: ReferenceStat,
  themeFindings: readonly Finding[],
  manifest: AuditManifest,
): string | undefined {
  if (!stat.ratio || !RATIO_KINDS_PER_TENTH_SECOND.has(stat.ratio.kind)) return undefined;

  const themePageUrls = new Set(themeFindings.flatMap((f) => f.pageUrls));
  const lcpValues = manifest.pages
    .filter((page) => themePageUrls.has(page.url))
    .map((page) => page.coreWebVitals?.lcp?.numericValue)
    .filter((value): value is number => value !== null && value !== undefined);

  const medianLcp = median(lcpValues);
  const lcpThreshold = CORE_WEB_VITAL_THRESHOLDS.find((t) => t.key === 'lcp');
  if (medianLcp === null || !lcpThreshold || medianLcp <= lcpThreshold.good) return undefined;

  return fillTemplate(strings.themes.measuredLcpGapTemplate, {
    value: toSeconds(medianLcp, language),
    gap: toSeconds(medianLcp - lcpThreshold.good, language),
    threshold: toSeconds(lcpThreshold.good, language),
  });
}

/** item 2.5: the metadata line below a theme card (effort/impact/pages/
 *  conformity/refs) used flex-wrap with no fixed widths, so a card whose
 *  finding-reference list happened to be long wrapped at a different point
 *  than one whose list was short - adjacent cards read as inconsistently
 *  laid out. Rendered as a fixed-column grid below instead, so every
 *  card's line wraps at the same positions regardless of content
 *  length. */
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
): string {
  const t = strings.themes;
  const themeFindings = theme.findingIds.map((id) => findingsById.get(id)).filter((f): f is Finding => f !== undefined);
  const uniquePages = new Set(themeFindings.flatMap((f) => f.pageUrls)).size;

  const category = CATEGORY[theme.category];
  const categoryTag = `<span class="tag" style="background:${category.bg};color:${category.color}">${escapeHtml(strings.findingsAppendix.categoryLabels[theme.category])}</span>`;
  const quickWinBadge = showQuickWinBadge && isQuickWinTheme(theme)
    ? `<span class="tag qw" style="display:inline-flex;align-items:center;gap:4px;background:#1c3a2c;color:#7cd9a0">${QUICK_WIN_ICON}${escapeHtml(t.quickWinBadgeLabel)}</span>`
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
  const legalBox = theme.legalRelevance
    ? `<p style="font-size:12px;opacity:0.6;margin:0">${escapeHtml(t.legalTagLabel)} : ${escapeHtml(theme.legalRelevance)}</p>`
    : `<p style="font-size:12px;opacity:0.6;margin:0">${escapeHtml(t.legalTagLabel)} : ${escapeHtml(t.conformityNotApplicable)}</p>`;

  const gapNote = citationStat ? measuredLcpGapNote(strings, language, citationStat, themeFindings, manifest) : undefined;
  const citationBox = citationStat
    ? renderReferenceStatNote(t.impactCitationLabel, citationStat, language, undefined, gapNote)
    : '';

  // item 27: a diagnosis without a prescription - the LLM already writes
  // recommendedActions on every theme (writing-schema.ts, capped at 3,
  // language/severity-vocabulary validated), it was simply never
  // rendered.
  const recommendedActionsBox =
    theme.recommendedActions.length > 0
      ? `
        <div style="margin-top:4px">
          <div style="font-size:11px;opacity:0.6;text-transform:uppercase;letter-spacing:0.02em;margin-bottom:4px">${escapeHtml(t.recommendedActionsLabel)}</div>
          <ul style="margin:0;padding-left:1.2em;font-size:12.5px;opacity:0.9">
            ${theme.recommendedActions.map((action) => `<li>${escapeHtml(action)}</li>`).join('')}
          </ul>
        </div>
      `
      : '';

  const pagesText = fillTemplate(t.pagesOfTotalTemplate, {
    pages: formatNumber(uniquePages, language),
    pageWord: pageWord(strings, uniquePages),
    totalPages: formatNumber(totalPagesScanned, language),
  });

  return `
    <div class="card elev-sm theme-card" style="margin-bottom:var(--space-4);gap:var(--space-3)" id="theme-${theme.priorityRank}">
      <div style="display:flex;align-items:flex-start;gap:var(--space-3)">
        <span style="width:26px;height:26px;flex:none;border-radius:50%;border:1px solid var(--color-accent);color:var(--color-accent);font-size:12px;display:flex;align-items:center;justify-content:center">${theme.priorityRank}</span>
        <div style="flex:1">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
            ${categoryTag}
            ${quickWinBadge}
          </div>
          <div class="card-title">${escapeHtml(theme.title)}</div>
        </div>
      </div>
      <p class="card-body" style="opacity:0.9">${escapeHtml(theme.businessImpact)}</p>
      ${legalBox}
      ${citationBox}
      ${recommendedActionsBox}
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) minmax(0,1.4fr);gap:var(--space-3);font-size:12px;opacity:0.75;margin-top:4px">
        <span>${escapeHtml(t.effortLabel)} : <strong>${escapeHtml(t.effortImpactLevels[theme.effort])}</strong></span>
        <span>${escapeHtml(t.impactLabel)} : <strong>${escapeHtml(t.effortImpactLevels[theme.impact])}</strong></span>
        <span>${escapeHtml(t.affectedPagesLabel)} : <strong>${escapeHtml(pagesText)}</strong></span>
        <span>${escapeHtml(t.conformityLabel)} : <strong>${escapeHtml(conformityValue)}</strong></span>
        <span>${escapeHtml(t.refsLabel)} : ${formatFindingIdLinks(theme.findingIds)}</span>
      </div>
    </div>
  `;
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
  return themeFindings.length === 0 || themeFindings.every((finding) => finding.ruleId === LCEN_MENTIONS_LEGALES_RULE_ID);
}

function isStatEligibleForTheme(
  stat: ReferenceStat,
  themeFindings: readonly Finding[],
  transactionalPageUrls: ReadonlySet<string>,
): boolean {
  if (!isStatEligibleForRuleIds(stat, themeFindings)) return false;
  if (!stat.ratio || !RATIO_KINDS_REQUIRING_TRANSACTIONAL_CONTEXT.has(stat.ratio.kind)) return true;
  return themeFindings.some((finding) => finding.pageUrls.some((url) => transactionalPageUrls.has(url)));
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
): string {
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const totalPagesScanned = manifest.pages.filter((page) => page.status === 'visited').length;
  const sortedThemes = selectRenderedThemes(analysis.themes, findingsById);
  const sector = sectorOverride ?? analysis.obligationAssessment?.sector ?? 'general';

  // One citation per category, shown once on that category's
  // highest-priority theme (sortedThemes is already priorityRank-order),
  // not repeated on every theme - avoids a report where five
  // accessibility themes each restate the identical Deloitte sentence.
  const citedCategories = new Set<string>();
  const citationByRank = new Map<number, ReferenceStat>();
  const transactionalPageUrls = transactionalFlowPageUrls(analysis);
  for (const theme of sortedThemes) {
    if (!isCitableThemeCategory(theme.category)) continue;
    if (citedCategories.has(theme.category)) continue;
    const themeFindings = theme.findingIds.map((id) => findingsById.get(id)).filter((f): f is Finding => f !== undefined);
    if (isCitationIneligibleTheme(themeFindings)) continue;
    const candidates = selectReferenceStats(theme.category, sector);
    const top = candidates.find(
      (stat) => !citedStatIds.has(stat.id) && isStatEligibleForTheme(stat, themeFindings, transactionalPageUrls),
    );
    if (top) {
      citationByRank.set(theme.priorityRank, top);
      citedCategories.add(theme.category);
      citedStatIds.add(top.id);
    }
  }

  const showQuickWinBadge = !sortedThemes.every(isQuickWinTheme);
  const themeBlocks = sortedThemes
    .map((theme) =>
      renderTheme(
        strings,
        analysis.language,
        theme,
        findingsById,
        totalPagesScanned,
        citationByRank.get(theme.priorityRank),
        manifest,
        showQuickWinBadge,
      ),
    )
    .join('');

  return sheet(`
    ${renderSheetHeader(ordinal, strings.themes.eyebrow, fillTemplate(strings.themes.headingTemplate, { count: sortedThemes.length }))}
    ${themeBlocks}
  `, '', 'section-04');
}
