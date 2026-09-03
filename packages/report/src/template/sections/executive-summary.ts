import type { AuditManifest, Finding } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import {
  escapeHtml,
  escapeProse,
  fillTemplate,
  formatNumber,
  renderSheetHeader,
  sheet,
} from '../html-utils.js';
import { computeStatistics } from '../statistics.js';
import { sectionTitle } from '../section-registry.js';
import { selectRenderedThemes } from './themes.js';
import { type RenderedPriority, summarizePriorityOwnership } from '../rendered-priorities.js';

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

  return `<p style="font-size:12px;opacity:0.6;margin-top:var(--space-3);max-width:66ch">${escapeHtml(text)}</p>`;
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
  return `<p style="font-size:12px;opacity:0.6;margin-top:var(--space-3);max-width:66ch">${escapeHtml(text)}</p>`;
}

/** "Par où commencer" card: a numbered circle plus the theme's own title,
 *  jumping to the theme card by id (themes.ts sets id="theme-{rank}").
 *  Doc §3 section 01 cap: 3 links, prose above. No independent business-
 *  impact sentence here anymore - the theme card is the one place that
 *  prose lives (report.reference.html's exec-summary jump list is title
 *  + rank badge + "Voir ->" only, nothing else). */
function renderStartHere(strings: ReportStrings, themes: StoredAnalysis['themes']): string {
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
        <a href="#theme-${theme.priorityRank}" style="display:flex;align-items:center;gap:var(--space-3);text-decoration:none;color:var(--color-text);padding:var(--space-3) 0;break-inside:avoid;background:linear-gradient(to right,transparent,var(--color-divider) 0,var(--color-divider) 100%,transparent) no-repeat bottom/100% 1px">
          <span style="width:22px;height:22px;flex:none;border-radius:50%;border:1px solid var(--color-accent);color:var(--color-accent);font-size:11px;display:flex;align-items:center;justify-content:center">${theme.priorityRank}</span>
          <span style="font-size:14px;flex:1">${escapeProse(theme.title)}</span>
          <span style="font-size:11px;color:var(--color-accent-300)">${escapeHtml(jumpLinkLabel)}</span>
        </a>
      `;
    })
    .join('');

  return `
    <div style="margin-top:var(--space-6);padding:var(--space-4);background:var(--color-surface);border-radius:var(--radius-lg)">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.02em;color:var(--color-accent-300);margin-bottom:var(--space-3)">${escapeHtml(e.startHereKicker)}</div>
      ${rows}
    </div>
  `;
}

function renderStartHerePriorities(
  strings: ReportStrings,
  priorities: readonly RenderedPriority[],
): string {
  const rows = priorities.slice(0, TOP_THEME_COUNT).map(({ theme, displayRank }) => {
    const label = fillTemplate(strings.executiveSummary.jumpLinkLabelTemplate, {
      rank: displayRank,
    });
    return `<a href="#theme-${displayRank}" style="display:flex;align-items:center;gap:var(--space-3);text-decoration:none;color:var(--color-text);padding:var(--space-3) 0;break-inside:avoid;background:linear-gradient(to right,transparent,var(--color-divider) 0,var(--color-divider) 100%,transparent) no-repeat bottom/100% 1px"><span style="width:22px;height:22px;flex:none;border-radius:50%;border:1px solid var(--color-accent);color:var(--color-accent);font-size:11px;display:flex;align-items:center;justify-content:center">${displayRank}</span><span style="font-size:14px;flex:1">${escapeProse(theme.title)}</span><span style="font-size:11px;color:var(--color-accent-300)">${escapeHtml(label)}</span></a>`;
  });
  if (rows.length === 0) return '';
  return `<div style="margin-top:var(--space-6);padding:var(--space-4);background:var(--color-surface);border-radius:var(--radius-lg)"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.02em;color:var(--color-accent-300);margin-bottom:var(--space-3)">${escapeHtml(strings.executiveSummary.startHereKicker)}</div>${rows.join('')}</div>`;
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
  return `<p style="font-size:12px;opacity:0.65;margin-top:var(--space-2);max-width:66ch">${escapeHtml(
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
  return `<p style="font-size:12px;opacity:0.6;margin-top:var(--space-2);max-width:66ch">${escapeHtml(e.categoryImbalanceNote)}</p>`;
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
  priorities?: readonly RenderedPriority[],
): string {
  const covered = new Set(
    priorities
      ? priorities.flatMap((priority) => priority.findings.map((finding) => finding.findingId))
      : selectRenderedThemes(analysis.themes, findingsById).flatMap((theme) => theme.findingIds),
  ).size;
  if (covered === 0 || covered >= findings.length) return '';

  const e = strings.executiveSummary;
  const text = fillTemplate(e.coveredByPrioritiesTemplate, {
    covered: formatNumber(covered, analysis.language),
    remainingSection: sectionTitle('section-05b', strings),
  });
  return `<p style="font-size:12px;opacity:0.6;margin-top:var(--space-2);max-width:66ch">${escapeHtml(text)}</p>`;
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
  const countsSentence = fillTemplate(e.summaryCountsTemplate, {
    actionable: formatNumber(stats.critical + stats.serious, analysis.language),
    critical: formatNumber(stats.critical, analysis.language),
    serious: formatNumber(stats.serious, analysis.language),
    total: formatNumber(stats.totalFindings, analysis.language),
  });
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const ownership = priorities ? summarizePriorityOwnership(priorities) : undefined;
  const ownershipNote = ownership
    ? `<p style="font-size:12px;opacity:0.65;margin-top:var(--space-2);max-width:66ch">${escapeHtml(
        fillTemplate(e.priorityOwnershipTemplate, {
          firstParty: formatNumber(ownership['first-party-action'], analysis.language),
          thirdParty: formatNumber(ownership['third-party-escalation'], analysis.language),
          verifyIntent: formatNumber(ownership['verify-intent'], analysis.language),
        }),
      )}</p>`
    : '';
  return sheet(
    `
    ${renderSheetHeader(ordinal, e.eyebrow, e.heading)}
    <p style="font-size:15px;max-width:66ch;opacity:0.9">${escapeProse(analysis.executiveSummary)}</p>
    <p style="font-size:12.5px;opacity:0.75;margin-top:var(--space-2);max-width:66ch">${escapeHtml(countsSentence)}</p>
    <p style="font-size:11px;opacity:0.5;margin-top:var(--space-2);max-width:66ch">${escapeHtml(e.glossaryPointerSentence)}</p>
    ${renderCoveredByPrioritiesNote(strings, analysis, findings, findingsById, priorities)}
    ${ownershipNote}
    ${renderThirdPartySplitNote(strings, stats)}
    ${renderCategoryImbalanceNote(strings, stats)}
    ${priorities ? renderTopPriorityLegalNoteFromPriorities(strings, priorities) : renderTopPriorityLegalNote(strings, analysis.themes, findingsById)}
    ${priorities ? renderStartHerePriorities(strings, priorities) : renderStartHere(strings, analysis.themes)}
  `,
    '',
    'section-01',
  );
}
