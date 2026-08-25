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
  estimateAggregateEffortDays,
  estimateRevenueImpact,
  selectReferenceStats,
} from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { formatMetricValue, METRIC_UNITS } from './core-web-vitals-table.js';
import { escapeHtml, escapeProse, fillTemplate, formatCappedFindingIdLinks, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';
import { CATEGORY, LEVEL_COLOR, SEVERITY } from '../design-tokens.js';
import { renderReferenceStatNote } from '../reference-stat-note.js';
import { detectFindingVendor, isThirdPartyFinding } from '../third-party-attribution.js';

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
/**
 * B2.1 (2026-08-24, Domaine Lagnonu). Section 04 told the director "43/43
 * pages with a critical finding" while the Priorites section contained six
 * chantiers and not one of them was performance - yet four of that site's
 * five critical findings were performance (LCP, TBT, FCP, Speed Index, all
 * 43 pages, median TBT 3 936 ms against a 200 ms threshold). The model had
 * ranked those themes 12, 15 and 17, below the render cut, so the single
 * number on the cover was driven by a problem the priorities never named.
 *
 * Every category holding at least one critical finding is therefore
 * guaranteed its highest-ranked theme in the rendered list. Deterministic,
 * and it leaves the model's ordering otherwise untouched: promoted themes
 * take the place of the lowest-ranked themes that would have rendered,
 * and the final list stays in priorityRank order so the numbering a reader
 * sees is still ascending.
 */
export function selectRenderedThemes(themes: readonly Theme[], findingsById: ReadonlyMap<string, Finding>): Theme[] {
  const withResolvedFindings = themes.filter((theme) => theme.findingIds.some((id) => findingsById.has(id)));
  const byRank = [...withResolvedFindings].sort((a, b) => a.priorityRank - b.priorityRank);
  const selected = byRank.slice(0, MAX_RENDERED_THEMES);
  if (selected.length < MAX_RENDERED_THEMES) return selected;

  const themeFindings = (theme: Theme): Finding[] =>
    theme.findingIds.map((id) => findingsById.get(id)).filter((f): f is Finding => f !== undefined);

  const criticalCategories = new Set<string>();
  for (const theme of byRank) {
    for (const finding of themeFindings(theme)) {
      if (finding.severity === 'critical') criticalCategories.add(finding.category);
    }
  }

  const selectedKeys = new Set(selected.map((theme) => theme.priorityRank));
  for (const category of criticalCategories) {
    const alreadyShown = selected.some((theme) =>
      themeFindings(theme).some((f) => f.category === category && f.severity === 'critical'),
    );
    if (alreadyShown) continue;

    const promoted = byRank.find(
      (theme) =>
        !selectedKeys.has(theme.priorityRank) &&
        themeFindings(theme).some((f) => f.category === category && f.severity === 'critical'),
    );
    if (!promoted) continue;

    // Drop the lowest-ranked currently-selected theme that is not itself
    // the only representative of some critical category.
    for (let i = selected.length - 1; i >= 0; i--) {
      const candidate = selected[i]!;
      const covers = [...criticalCategories].filter((c) =>
        themeFindings(candidate).some((f) => f.category === c && f.severity === 'critical'),
      );
      const isSoleRepresentative = covers.some(
        (c) =>
          selected.filter((t) => themeFindings(t).some((f) => f.category === c && f.severity === 'critical'))
            .length === 1,
      );
      if (isSoleRepresentative) continue;
      selectedKeys.delete(candidate.priorityRank);
      selected.splice(i, 1);
      break;
    }

    selected.push(promoted);
    selectedKeys.add(promoted.priorityRank);
  }

  return selected.sort((a, b) => a.priorityRank - b.priorityRank);
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
const CWV_METRIC_PREFERENCE: readonly CoreWebVitalMetricKey[] = ['lcp', 'tbt', 'fcp', 'speedIndex', 'cls'];

function themeCoreWebVitalMetric(themeFindings: readonly Finding[]): CoreWebVitalMetricKey | undefined {
  const counts = new Map<CoreWebVitalMetricKey, number>();
  for (const finding of themeFindings) {
    const key = AUDIT_ID_TO_CWV_KEY.get(finding.ruleId);
    if (key === undefined) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: CoreWebVitalMetricKey | undefined;
  for (const key of CWV_METRIC_PREFERENCE) {
    const count = counts.get(key);
    if (count === undefined) continue;
    if (best === undefined || count > (counts.get(best) ?? 0)) best = key;
  }
  return best;
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
  if (turnoverEur === undefined || stat.scalability !== 'scales-down' || !stat.ratio) return undefined;
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

function renderOwnershipSplitNote(strings: ReportStrings, language: ReportLanguage, themeFindings: readonly Finding[]): string {
  const thirdPartyFindings = themeFindings.filter((f) => isThirdPartyFinding(f));
  const firstPartyFindings = themeFindings.filter((f) => !isThirdPartyFinding(f));
  if (thirdPartyFindings.length === 0 || firstPartyFindings.length === 0) return '';

  const t = strings.themes;
  const firstPartyPages = new Set(firstPartyFindings.flatMap((f) => f.pageUrls)).size;
  const thirdPartyPages = new Set(thirdPartyFindings.flatMap((f) => f.pageUrls)).size;
  const vendors = [...new Set(thirdPartyFindings.map((f) => detectFindingVendor(f)).filter((v): v is string => v !== undefined))];
  const vendorLabel = vendors.length > 0 ? vendors.join(', ') : t.ownershipSplitUnknownVendorLabel;

  const text = fillTemplate(t.ownershipSplitTemplate, {
    firstPartyPages: formatNumber(firstPartyPages, language),
    firstPartyPageWord: pageWord(strings, firstPartyPages),
    thirdPartyPages: formatNumber(thirdPartyPages, language),
    thirdPartyPageWord: pageWord(strings, thirdPartyPages),
    vendor: vendorLabel,
  });
  return `<p style="font-size:11.5px;opacity:0.6;margin-top:4px">${escapeHtml(text)}</p>`;
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
   *  not repeated on every card that shares the value. */
  showConformityGloss: boolean,
  /** 2026-08-22 revenue-impact wiring:
   *  ObligationAssessment.registrySnapshot.turnoverEur, threaded down
   *  from renderThemes. undefined whenever no Sirene lookup succeeded or
   *  the turnover figure specifically was marked unreliable for this
   *  client's effectif band - renderRevenueImpactNote already no-ops on
   *  undefined, this is just where it enters the call chain. */
  turnoverEur: number | undefined,
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

  const gapNote = citationStat ? measuredCoreWebVitalGapNote(strings, language, citationStat, themeFindings, manifest) : undefined;
  const revenueImpactNote = citationStat ? renderRevenueImpactNote(strings, language, citationStat, turnoverEur) : undefined;
  const citationBox = citationStat
    ? renderReferenceStatNote(t.impactCitationLabel, citationStat, language, undefined, gapNote, revenueImpactNote)
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
            ${theme.recommendedActions.map((action) => `<li>${escapeProse(action)}</li>`).join('')}
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
          <div class="card-title">${escapeProse(theme.title)}</div>
        </div>
      </div>
      <p class="card-body" style="opacity:0.9">${escapeProse(theme.businessImpact)}</p>
      ${legalBox}
      ${citationBox}
      ${recommendedActionsBox}
      ${renderOwnershipSplitNote(strings, language, themeFindings)}
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) minmax(0,1.4fr);gap:var(--space-3);font-size:12px;margin-top:4px">
        <span class="text-muted">${escapeHtml(t.effortLabel)} : <strong style="color:var(--color-text)">${escapeHtml(t.effortImpactLevels[theme.effort])}</strong></span>
        <span class="text-muted">${escapeHtml(t.impactLabel)} : <strong style="color:${LEVEL_COLOR[theme.impact].color}">${escapeHtml(t.effortImpactLevels[theme.impact])}</strong></span>
        <span class="text-muted">${escapeHtml(t.affectedPagesLabel)} : <strong style="color:var(--color-text)">${escapeHtml(pagesText)}</strong></span>
        <span class="text-muted">${escapeHtml(t.conformityLabel)} : <strong style="color:${isNonConformant ? SEVERITY.critical.color : 'var(--color-neutral-500)'}">${escapeHtml(conformityValue)}</strong>${!isNonConformant && showConformityGloss ? ` <span style="font-weight:400">(${escapeHtml(t.conformityNotApplicableGloss)})</span>` : ''}</span>
        <span class="text-muted">${escapeHtml(t.refsLabel)} : ${formatCappedFindingIdLinks(theme.findingIds, language, strings.findingsAppendix)}</span>
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
    const themeFindings = theme.findingIds.map((id) => findingsById.get(id)).filter((f): f is Finding => f !== undefined);
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
      (stat) => !citedStatIds.has(stat.id) && isStatEligibleForTheme(stat, themeFindings, transactionalPageUrls),
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
  const firstNotApplicableRank = sortedThemes.find((theme) => theme.legalRelevance === undefined)?.priorityRank;
  const turnoverEur = analysis.obligationAssessment?.registrySnapshot?.turnoverEur;
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
        theme.priorityRank === firstNotApplicableRank,
        turnoverEur,
      ),
    )
    .join('');

  // P1.5 (2026-08-21 La Corniche feedback pass): every priority card gave
  // a qualitative effort label with no aggregate translation a director
  // could put in a budget line. Deterministic band-computation off the
  // rendered cards' own effort labels (packages/core's
  // estimateAggregateEffortDays), not a new LLM claim. Half-day
  // granularity: the underlying bands are already coarse, and a bare
  // integer would imply more precision than either range actually has.
  const effortEstimate = estimateAggregateEffortDays(sortedThemes.map((theme) => theme.effort));
  const roundToHalfDay = (days: number): number => Math.max(0.5, Math.round(days * 2) / 2);
  const aggregateEstimateNote =
    sortedThemes.length > 0
      ? `<p style="font-size:12px;opacity:0.6;margin-bottom:var(--space-4);max-width:66ch">${escapeHtml(
          fillTemplate(strings.themes.aggregateEffortEstimateTemplate, {
            min: formatNumber(roundToHalfDay(effortEstimate.minDays), analysis.language),
            max: formatNumber(roundToHalfDay(effortEstimate.maxDays), analysis.language),
            count: sortedThemes.length,
          }),
        )}</p>`
      : '';

  // P4.1 (2026-08-21 La Corniche feedback pass): Priorités is a heavy
  // section - accept the resulting white space rather than a section
  // header starting two lines above a page break, same reasoning already
  // applied to the checklist/annexe/glossaire sections.
  return sheet(`
    ${renderSheetHeader(ordinal, strings.themes.eyebrow, fillTemplate(strings.themes.headingTemplate, { count: sortedThemes.length }))}
    ${aggregateEstimateNote}
    ${themeBlocks}
  `, 'sheet-standalone', 'section-04');
}
