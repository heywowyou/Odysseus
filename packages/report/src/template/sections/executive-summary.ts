import type { AuditManifest, Finding, ObligationAssessment, ReportLanguage } from '@odysseus/core';
import { EAA_REGIME_ID, eaaSanctionFigureSentence } from '@odysseus/core';
import { partitionFindings } from '@odysseus/llm';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import {
  escapeCopy,
  escapeHtml,
  escapeProse,
  fillTemplate,
  formatNumber,
  pluralize,
  renderSheetHeader,
  sheet,
} from '../html-utils.js';
import { computeStatistics } from '../statistics.js';
import { primaryFindingFilter } from '../unlinked-sitemap-pages.js';
import { sectionTitle } from '../section-registry.js';
import { pickPrimaryBasis } from './methodology.js';
import { selectRenderedThemes } from './themes.js';
import { type RenderedPriority, summarizePriorityOwnership } from '../rendered-priorities.js';
import { renderPriorityOwnershipSentence } from '../priority-ownership-note.js';

const TOP_THEME_COUNT = 3;

/** item 16: flagged as a product-framing decision, not a pure bug -
 *  Jules to confirm whether the ranking itself should ever get an
 *  explicit legal-conformity weighting (report-feedback-palais-
 *  gallien.md's own framing of this item). Implemented regardless: when
 *  the #1-ranked theme (among those actually rendered, section 04's
 *  selectRenderedThemes cap) carries no legalRelevance, one sentence
 *  states that plainly and points to where a legal-conformity priority
 *  does rank, if one is rendered at all - the four pages of legal framing
 *  preceding this section otherwise leave the reader to notice the
 *  mismatch unaided. */
function renderTopPriorityLegalNote(
  strings: ReportStrings,
  themes: StoredAnalysis['themes'],
  findingsById: ReadonlyMap<string, Finding>,
): string {
  const rendered = selectRenderedThemes(themes, findingsById);
  const topTheme = rendered[0];
  if (!topTheme || topTheme.legalRelevance !== undefined) return '';

  const e = strings.executiveSummary;
  const firstLegalTheme = rendered.find((theme) => theme.legalRelevance !== undefined);
  const text = firstLegalTheme
    ? fillTemplate(e.topPriorityIsNotLegalWithPointerTemplate, {
        legalRank: firstLegalTheme.priorityRank,
      })
    : e.topPriorityIsNotLegalNoPointer;

  return `<p style="font-size:12px;color:var(--color-neutral-400);margin-top:var(--space-1);line-height:1.4">${escapeHtml(text)}</p>`;
}

function renderTopPriorityLegalNoteFromPriorities(
  strings: ReportStrings,
  priorities: readonly RenderedPriority[],
): string {
  const top = priorities[0];
  if (!top || top.theme.legalRelevance !== undefined) return '';
  const firstLegal = priorities.find((priority) => priority.theme.legalRelevance !== undefined);
  const text = firstLegal
    ? fillTemplate(strings.executiveSummary.topPriorityIsNotLegalWithPointerTemplate, {
        legalRank: firstLegal.displayRank,
      })
    : strings.executiveSummary.topPriorityIsNotLegalNoPointer;
  return `<p style="font-size:12px;color:var(--color-neutral-400);margin-top:var(--space-1);line-height:1.4">${escapeHtml(text)}</p>`;
}

/** "Par où commencer" card: a numbered circle plus the theme's own title,
 *  jumping to the theme card by id (themes.ts sets id="theme-{rank}").
 *  Doc §3 section 01 cap: 3 links, prose above. No independent business-
 *  impact sentence here anymore - the theme card is the one place that
 *  prose lives (report.reference.html's exec-summary jump list is title
 *  + rank badge + "Voir ->" only, nothing else). */
function renderStartHere(
  strings: ReportStrings,
  themes: StoredAnalysis['themes'],
  language: ReportLanguage,
): string {
  const topThemes = [...themes]
    .sort((a, b) => a.priorityRank - b.priorityRank)
    .slice(0, TOP_THEME_COUNT);
  if (topThemes.length === 0) return '';

  const e = strings.executiveSummary;
  const rows = topThemes
    .map((theme) => {
      // item 5: the link's own visible label states its destination
      // ("Voir priorité 1") instead of a bare "Voir ->" that gave no
      // indication of where it led when read out of context (a PDF
      // link-extraction pass, a screen reader jumping link-to-link).
      // Underline + accent colour give it a visual affordance distinct
      // from the plain-text theme title beside it.
      //
      // item 3.4: this used to also repeat {title} a second time
      // ("Voir priorité 1 : lenteur d'affichage"), directly next to the
      // theme title already shown in its own span two lines below - full
      // title duplication in one row, wrapping across the width on a
      // long title. Dropped {title} from the template: the rank number
      // plus the adjacent title span together already give the link
      // stand-alone accessible text (per item 5's own reasoning), without
      // repeating it.
      const jumpLinkLabel = fillTemplate(e.jumpLinkLabelTemplate, { rank: theme.priorityRank });
      // P3 (2026-08-21 La Corniche feedback pass): adding the new
      // section-00 intro page shifted this row across a page boundary in
      // the stress fixture, and Paged.js's DOM fragmentation split the
      // <a> itself, leaving a page-boundary fragment with no text content
      // - axe-core's post-pagination audit (paged-invariants.test.ts
      // invariant 8a) caught it as a link-name violation. break-inside:
      // avoid keeps the whole link on one page instead.
      return `
        <a href="#theme-${theme.priorityRank}" style="display:flex;align-items:center;gap:var(--space-3);text-decoration:none;color:var(--color-text);padding:var(--space-4) 0;break-inside:avoid;background:linear-gradient(to right,transparent,var(--color-divider) 0,var(--color-divider) 100%,transparent) no-repeat bottom/100% 1px">
          <span style="width:22px;height:22px;flex:none;color:var(--color-accent);font-size:11px;line-height:1;display:flex;align-items:center;justify-content:center;text-align:center;font-variant-numeric:tabular-nums">${theme.priorityRank}</span>
          <span style="font-size:14px;flex:1">${escapeProse(theme.title, language)}</span>
          <span style="font-size:11px;color:var(--color-accent-300)">${escapeHtml(jumpLinkLabel)}</span>
        </a>
      `;
    })
    .join('');

  return `
    <div class="start-here" data-render-atomic="start-here" style="margin-top:var(--space-8);padding:var(--space-4) var(--space-6);background:var(--color-surface);border-radius:var(--radius-lg)">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.02em;color:var(--color-accent-300);margin-bottom:var(--space-4)">${escapeHtml(e.startHereKicker)}</div>
      ${rows}
    </div>
  `;
}

function renderStartHerePriorities(
  strings: ReportStrings,
  priorities: readonly RenderedPriority[],
  language: ReportLanguage,
): string {
  const rows = priorities.slice(0, TOP_THEME_COUNT).map(({ theme, displayRank }) => {
    const label = fillTemplate(strings.executiveSummary.jumpLinkLabelTemplate, {
      rank: displayRank,
    });
    return `<a href="#theme-${displayRank}" style="display:flex;align-items:center;gap:var(--space-3);text-decoration:none;color:var(--color-text);padding:var(--space-4) 0;break-inside:avoid;background:linear-gradient(to right,transparent,var(--color-divider) 0,var(--color-divider) 100%,transparent) no-repeat bottom/100% 1px"><span style="width:22px;height:22px;flex:none;color:var(--color-accent);font-size:11px;line-height:1;display:flex;align-items:center;justify-content:center;text-align:center;font-variant-numeric:tabular-nums">${displayRank}</span><span style="font-size:14px;flex:1">${escapeProse(theme.title, language)}</span><span style="font-size:11px;color:var(--color-accent-300)">${escapeHtml(label)}</span></a>`;
  });
  if (rows.length === 0) return '';
  return `<div class="start-here" data-render-atomic="start-here" style="margin-top:var(--space-8);padding:var(--space-4) var(--space-6);background:var(--color-surface);border-radius:var(--radius-lg)"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.02em;color:var(--color-accent-300);margin-bottom:var(--space-4)">${escapeHtml(strings.executiveSummary.startHereKicker)}</div>${rows.join('')}</div>`;
}

/** P1.2 (2026-08-21 La Corniche feedback pass): same headline fact as
 *  statistics.ts's footnote, restated here since the résumé is the
 *  section most likely to be the only one a director actually reads in
 *  full. Rendered only when the percentage is meaningful (there is at
 *  least one non-heuristic accessibility occurrence to take a share of). */
function renderThirdPartySplitNote(
  strings: ReportStrings,
  stats: ReturnType<typeof computeStatistics>,
): string {
  if (stats.thirdPartyAccessibilityOccurrences === 0 || stats.accessibilityOccurrences === 0)
    return '';

  const e = strings.executiveSummary;
  const percent = Math.round(
    (stats.thirdPartyAccessibilityOccurrences / stats.accessibilityOccurrences) * 100,
  );
  return `<p style="font-size:12px;color:var(--color-neutral-400);margin-top:var(--space-1);line-height:1.4">${escapeHtml(
    fillTemplate(e.thirdPartySplitSentenceTemplate, { percent }),
  )}</p>`;
}

/** P2.4 (2026-08-21 La Corniche feedback pass): the cover promises four
 *  pillars (accessibilité, performance, SEO, GEO), but a real report had
 *  ~90% of substantive findings concentrated in accessibility - not a
 *  bug, but worth setting the expectation up front rather than letting a
 *  reader discover the imbalance 20 pages in. Threshold is deliberately
 *  simple and stated in the comment, not tuned: accessibility findings
 *  make up at least 80% of the total, and SEO+GEO together contributed
 *  at least one finding (an actual imbalance to note, not just "this
 *  site has no SEO/GEO findings at all", which needs no framing). */
const ACCESSIBILITY_DOMINANCE_THRESHOLD = 0.8;

function renderCategoryImbalanceNote(
  strings: ReportStrings,
  stats: ReturnType<typeof computeStatistics>,
): string {
  const seoGeoCount = stats.categoryCounts.seo + stats.categoryCounts.geo;
  if (seoGeoCount === 0 || stats.totalFindings === 0) return '';
  if (stats.accessibilityCount / stats.totalFindings < ACCESSIBILITY_DOMINANCE_THRESHOLD) return '';

  const e = strings.executiveSummary;
  return `<p style="font-size:12px;color:var(--color-neutral-400);margin-top:var(--space-1);line-height:1.4">${escapeHtml(e.categoryImbalanceNote)}</p>`;
}

/** The site-wide critical/serious count (computeStatistics) has no relation
 *  to what the 6-card Priorities section actually covers (themes.ts's
 *  MAX_RENDERED_THEMES cap) - a reader who saw "31 priority findings" here
 *  and then only 18 findings referenced across the Priorities cards had no
 *  way to know the other 13 were simply out of the top-6 cut, not dropped.
 *  Rendered only when there is a genuine remainder to point to; when every
 *  resolved finding is covered by a rendered priority, the base sentence
 *  already accounts for all of it and nothing more needs to be said. */
function renderCoveredByPrioritiesNote(
  strings: ReportStrings,
  analysis: StoredAnalysis,
  findings: readonly Finding[],
  findingsById: ReadonlyMap<string, Finding>,
  manifest: AuditManifest,
  priorities?: readonly RenderedPriority[],
): string {
  // Both sides of the "X of Y" sentence use the first-party population the stats tile
  // counts (plan 075, Q1); frame-only findings are neither covered nor total.
  const counted = new Set(
    findings.filter(primaryFindingFilter(manifest)).map((finding) => finding.findingId),
  );
  const covered = [
    ...new Set(
      priorities
        ? priorities.flatMap((priority) => priority.findings.map((finding) => finding.findingId))
        : selectRenderedThemes(analysis.themes, findingsById).flatMap((theme) => theme.findingIds),
    ),
  ].filter((findingId) => counted.has(findingId)).length;
  if (covered === 0 || covered >= counted.size) return '';

  // Issue #211 diverts contextual findings (an absent accessibility
  // statement, for one) to Observations rather than Remaining Work, so
  // pointing every uncovered finding at Remaining Work miscounted by those.
  const diverted = partitionFindings(findings, manifest).diverted.some(({ finding }) =>
    counted.has(finding.findingId),
  );
  const e = strings.executiveSummary;
  const text = fillTemplate(
    diverted ? e.coveredByPrioritiesWithObservationsTemplate : e.coveredByPrioritiesTemplate,
    {
      covered: formatNumber(covered, analysis.language),
      total: formatNumber(counted.size, analysis.language),
      // Issue #307: this sheet precedes the priorities by several pages, so
      // the sentence names their section instead of saying "below".
      prioritiesSection: sectionTitle('section-04', strings),
      remainingSection: sectionTitle('section-05b', strings),
      observationsSection: sectionTitle('section-06', strings),
    },
  );
  return `<p style="font-size:12px;color:var(--color-neutral-400);margin-top:var(--space-1);line-height:1.4">${escapeHtml(text)}</p>`;
}

/** Issue #57: the executive pages previously carried no trace of the
 *  regulatory regime, so a reader who stopped after section 01 never
 *  learned one was involved. This block states the criterion, splices
 *  the unchanged general EAA sanction sentence from core (byte-identical
 *  to legal-exposure.ts's own card - both call eaaSanctionFigureSentence,
 *  neither restates it), and recommends legal confirmation. Gated on the
 *  exact same determination as renderGeneralEaaReference: status
 *  in_scope or likely_in_scope with EAA as the primary basis. Deliberately
 *  adds no deadline and no verdict; docs/rules/obligation-basis.md
 *  section 7 amended 2026-09-04 names this as the sentence's second
 *  permitted location. */
function renderRegulatoryContextNote(
  strings: ReportStrings,
  language: StoredAnalysis['language'],
  obligationAssessment: ObligationAssessment | undefined,
): string {
  if (
    !obligationAssessment ||
    (obligationAssessment.status !== 'in_scope' &&
      obligationAssessment.status !== 'likely_in_scope') ||
    pickPrimaryBasis(obligationAssessment)?.regimeId !== EAA_REGIME_ID
  )
    return '';

  const e = strings.executiveSummary;
  return `
    <div class="card elev-sm" style="margin-top:var(--space-8);padding:var(--space-4);border-left:3px solid var(--color-accent);border-radius:0 var(--radius-lg) var(--radius-lg) 0" data-executive-regulatory-context>
      <div class="card-kicker" style="color:var(--color-accent-300);font-weight:600">${escapeHtml(e.regulatoryContextKicker)}</div>
      <p style="font-size:12.5px;margin-top:var(--space-2)">${escapeCopy(e.regulatoryContextCriterion, language)}</p>
      <p style="font-size:12.5px;margin-top:var(--space-2)">${escapeCopy(eaaSanctionFigureSentence(language), language)}</p>
      <p style="font-size:11.5px;margin-top:var(--space-2)" class="text-muted">${escapeHtml(e.regulatoryContextCounsel)}</p>
    </div>
  `;
}

export function renderExecutiveSummary(
  strings: ReportStrings,
  ordinal: number,
  analysis: StoredAnalysis,
  findings: readonly Finding[],
  manifest: AuditManifest,
  priorities?: readonly RenderedPriority[],
): string {
  const e = strings.executiveSummary;
  // Plan 018 step 6: the model's qualitative summary is rendered first and
  // these counts follow beneath it, so a director reads the decision story
  // before the scale. item 0.4's digit guard is unchanged: counts are bound
  // here, from the same resolvedFindings the
  // stats tile (section 03) and every other count in the report reads,
  // never from the writing pass's own prose - see this template's own
  // doc comment. The writing pass ran before render-time finding
  // resolution (lcen-resolution.ts's manual SIREN-source-url removal,
  // concretely) could still change the finding count, which is exactly
  // how a real report ended up stating "94 constats" in this sentence
  // while the cover, stats tile, and severity chart all said 93.
  const stats = computeStatistics(findings, manifest);
  const countedPhrase = (count: number, singular: string, plural: string): string =>
    fillTemplate(pluralize(analysis.language, count, singular, plural), {
      count: formatNumber(count, analysis.language),
    });
  const countsSentence = fillTemplate(e.summaryCountsTemplate, {
    actionable: countedPhrase(
      stats.critical + stats.serious,
      e.actionableCountSingularTemplate,
      e.actionableCountPluralTemplate,
    ),
    critical: countedPhrase(
      stats.critical,
      e.criticalCountSingularTemplate,
      e.criticalCountPluralTemplate,
    ),
    serious: formatNumber(stats.serious, analysis.language),
    total: formatNumber(stats.totalFindings, analysis.language),
  });
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const ownership = priorities ? summarizePriorityOwnership(priorities, manifest) : undefined;
  const ownershipSentence = ownership
    ? renderPriorityOwnershipSentence(ownership, e.priorityOwnership, analysis.language)
    : undefined;
  const ownershipNote = ownershipSentence
    ? `<p style="font-size:12px;color:var(--color-neutral-400);margin-top:var(--space-1);line-height:1.4">${escapeHtml(ownershipSentence)}</p>`
    : '';
  return sheet(
    `
    ${renderSheetHeader(ordinal, e.eyebrow, e.heading)}
    <!-- 2026-09-13 Impeccable acceptance (workbench, page 5): the sheet
         reads as three bands - prose, legal, actions. Steps tighten inside
         a band (--space-1/--space-3) and open to the sheet-level step
         (--space-8) between bands. Note muting uses the ink ladder
         (neutral-200/400), never opacity, to hold 4.5:1 on the ground. -->
    <p style="font-size:15px;line-height:1.55;color:var(--color-neutral-100)">${escapeProse(analysis.executiveSummary, analysis.language)}</p>
    <p style="font-size:12.5px;color:var(--color-neutral-200);margin-top:var(--space-3)">${escapeHtml(countsSentence)}</p>
    <p style="font-size:11px;color:var(--color-neutral-400);margin-top:var(--space-1);line-height:1.4">${escapeHtml(e.glossaryPointerSentence)}</p>
    ${renderCoveredByPrioritiesNote(strings, analysis, findings, findingsById, manifest, priorities)}
    ${ownershipNote}
    ${renderThirdPartySplitNote(strings, stats)}
    ${renderCategoryImbalanceNote(strings, stats)}
    ${priorities ? renderTopPriorityLegalNoteFromPriorities(strings, priorities) : renderTopPriorityLegalNote(strings, analysis.themes, findingsById)}
    ${renderRegulatoryContextNote(strings, analysis.language, analysis.obligationAssessment)}
    ${priorities ? renderStartHerePriorities(strings, priorities, analysis.language) : renderStartHere(strings, analysis.themes, analysis.language)}
  `,
    '',
    'section-01',
  );
}
