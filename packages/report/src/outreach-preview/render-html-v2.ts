/**
 * Renders the v2 full-scan scorecard preview to a single self-contained
 * HTML document (plan 037).
 *
 * Same contract as the v1 renderer: synchronous, schema-validated before a
 * template runs, whole-document linted after, throwing on either failure.
 * The section order is product-specified: title and scan date, coverage
 * facts, aggregate totals, four severity tiles, three proof cards, the
 * deterministic legal block, the offer with its reply call to action, and
 * the article 14 disclosure with expiry. There is no image anywhere in the
 * template, so the no-screenshots decision is structural, not a rule.
 *
 * The offer price is filled from the code-owned constant, exactly as in v1:
 * it is not a field of the input, so a caller cannot pass a different one.
 */

import {
  formatFullAuditPrice,
  OUTREACH_CONTACT,
  outreachPreviewSummarySchema,
  type OutreachPreviewSummary,
} from '@odysseus/core';
import { escapeHtml, fillTemplate, formatDate, pluralize } from '../template/html-utils.js';
import { computeSeverityGrade, computeSeverityRiskLevel } from '../template/grade.js';
import { renderScorecardGrade } from '../template/render-scorecard.js';
import { renderDocumentCoverLayout } from '../template/sections/cover.js';
import { resolveDecisionQuestion } from '../template/generic-question.js';
import { getStrings, type ReportStrings } from '../template/strings/i18n.js';
import { OUTREACH_PREVIEW_STYLES_V2 } from './styles-v2.js';
import { outreachPreviewStringsV2, type OutreachPreviewStringsV2 } from './strings-v2.js';
import { assertOutreachPreviewHtml } from './preview-lint.js';

/** The full report's metadata-sheet signal (template/sections/metadata-
 *  sheet.ts's renderScorecard + renderRiskBadge), transcribed here rather
 *  than imported: that section reads `StoredAnalysis.overallRisk`, an LLM
 *  judgment the preview's schema deliberately has no field for. The risk
 *  level shown here is `computeSeverityRiskLevel` instead - see that
 *  function's doc comment for why it does not simply reuse the grade's own
 *  cutoffs. Rendered as its own centered block directly on the page
 *  background, matching the report's plain (non-card) sheet, immediately
 *  after the cover and before any section gets its bordered-card treatment. */
function renderGradeSignal(input: OutreachPreviewSummary, s: OutreachPreviewStringsV2): string {
  // Plan 041 Part A: own-counts grade only, never the benchmark percentile
  // (trade-off 42/16 forbid a comparison to other sites in this document -
  // the operator's own pick, made once this tension surfaced mid-design).
  const { grade: automaticGrade } = computeSeverityGrade(input.severityTotals);
  const grade = input.gradeOverride ?? automaticGrade;
  const riskLevel = computeSeverityRiskLevel(input.severityTotals);
  const scale = (['low', 'medium', 'high'] as const)
    .map((level) => {
      const className =
        level === riskLevel
          ? 'preview-risk-level preview-risk-level-current'
          : 'preview-risk-level';
      return `<span class="${className}" data-level="${level}">${escapeHtml(s.riskLevels[level])}</span>`;
    })
    .join('');
  const basisNote = fillTemplate(s.riskBasisTemplate, {
    critical: input.severityTotals.critical,
    criticalWord: pluralize(
      input.language,
      input.severityTotals.critical,
      s.criticalFindingSingular,
      s.criticalFindingPlural,
    ),
    serious: input.severityTotals.serious,
    seriousWord: pluralize(
      input.language,
      input.severityTotals.serious,
      s.seriousFindingSingular,
      s.seriousFindingPlural,
    ),
  });
  return [
    `<div class="preview-signal" id="${PREVIEW_CONTENT_ID}">`,
    `<div class="preview-scorecard">${renderScorecardGrade(grade, s.scorecardDisclaimer, s.scorecardLabel)}</div>`,
    '<div class="preview-risk">',
    `<div class="preview-risk-scale">${scale}</div>`,
    `<div class="preview-risk-basis">${escapeHtml(basisNote)}</div>`,
    `<div class="preview-risk-note">${escapeHtml(s.riskScaleBasisNote)}</div>`,
    '</div>',
    '</div>',
  ].join('');
}

/** The report's section head (nocturne.css's .statistics-sheet
 *  .section-head): the heading sits on the page ground over a hairline
 *  that carries a short accent segment. The report's numbered eyebrow is
 *  deliberately not carried over: the preview has no section numbering
 *  to navigate by, and the heading carries its own weight. */
function renderSectionHead(heading: string): string {
  return `<div class="section-head"><h2>${escapeHtml(heading)}</h2></div>`;
}

function renderStatTile(value: number, label: string, primary = false): string {
  const className = primary ? 'stat-tile stat-tile-primary' : 'stat-tile';
  return `<div class="${className}"><div class="stat-value">${value}</div><div class="stat-label">${escapeHtml(label)}</div></div>`;
}

function renderCoverage(input: OutreachPreviewSummary, s: OutreachPreviewStringsV2): string {
  return [
    '<section class="preview-section coverage-section">',
    renderSectionHead(s.coverageHeading),
    `<p class="section-lede">${escapeHtml(s.coverageIntro)}</p>`,
    '<div class="stat-grid stat-grid-coverage">',
    renderStatTile(input.coverage.inventoriedPageCount, s.coverage.inventoried),
    renderStatTile(input.coverage.contentCheckedPageCount, s.coverage.contentChecked),
    renderStatTile(input.coverage.performanceMeasuredPageCount, s.coverage.performanceMeasured),
    '</div>',
    `<p class="fineprint">${escapeHtml(s.performanceNote)}</p>`,
    '</section>',
  ].join('');
}

function renderTotals(
  input: OutreachPreviewSummary,
  s: OutreachPreviewStringsV2,
  reportStrings: ReportStrings,
): string {
  const severityMeanings = {
    critical: reportStrings.statistics.legendCriticalText,
    serious: reportStrings.statistics.legendSeriousText,
    moderate: reportStrings.statistics.legendModerateText,
    minor: reportStrings.statistics.legendMinorText,
  } as const;
  // The report's statistics.ts drops a severity tile entirely once its
  // count is zero (item D7/P4: "Modéré 0" reads as a bug, not a signal) and
  // sizes the grid to what actually renders, rather than always laying out
  // a fixed four-up row - reused here for the same reason. severityTotals
  // always sums to at least distinctFindingCount >= proofCards.length (3),
  // so at least one tile always renders.
  const nonZeroSeverities = (['critical', 'serious', 'moderate', 'minor'] as const).filter(
    (severity) => input.severityTotals[severity] > 0,
  );
  const severities = nonZeroSeverities.map(
    (severity) =>
      `<div class="severity-tile severity-${severity}"><div class="severity-heading"><span class="severity-dot"></span><span class="severity-label">${escapeHtml(s.severity[severity])}</span></div><div class="severity-value">${input.severityTotals[severity]}</div><div class="severity-meaning">${escapeHtml(severityMeanings[severity])}</div></div>`,
  );
  return [
    '<section class="preview-section results-section">',
    renderSectionHead(s.totalsHeading),
    // The report's editorial lead: the findings total is the primary tile,
    // the affected-page count its compact supporting figure.
    '<div class="stat-grid stat-grid-totals">',
    renderStatTile(input.distinctFindingCount, s.distinctFindings, true),
    renderStatTile(input.affectedPageCount, s.affectedPages),
    '</div>',
    `<h3 class="breakdown-heading">${escapeHtml(s.severityHeading)}</h3>`,
    `<div class="severity-grid severity-grid-${nonZeroSeverities.length}">${severities.join('')}</div>`,
    '</section>',
  ].join('');
}

/** The cover fills the first screen, so a reader landing from an email
 *  link can take it for the whole document. A drawn chevron under the
 *  decision question links to the grade that opens the rest of the
 *  preview; it is hidden from print, where pages already continue. */
function renderScrollCue(s: OutreachPreviewStringsV2): string {
  return [
    `<a class="cover-scroll-cue" href="#${PREVIEW_CONTENT_ID}" aria-label="${escapeHtml(s.scrollCueLabel)}">`,
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">',
    '<path d="M6 9.5 12 15.5 18 9.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    '</svg>',
    '</a>',
  ].join('');
}

const PREVIEW_CONTENT_ID = 'suite';

function renderIntroduction(s: OutreachPreviewStringsV2): string {
  return `<div class="preview-introduction"><p>${escapeHtml(s.lede)}</p></div>`;
}

function renderCards(input: OutreachPreviewSummary, s: OutreachPreviewStringsV2): string {
  const cards = input.proofCards
    .map((card) =>
      [
        '<div class="card">',
        '<div class="card-meta">',
        `<span class="tag">${escapeHtml(s.category[card.category])}</span>`,
        `<span class="card-severity severity-${card.severity}"><span class="severity-dot"></span>${escapeHtml(s.severity[card.severity])}</span>`,
        `<span class="card-pages">${card.affectedPageCount} ${escapeHtml(
          card.affectedPageCount === 1 ? s.cardPageLabelSingular : s.cardPagesLabel,
        )}</span>`,
        '</div>',
        `<h3>${escapeHtml(card.title[input.language])}</h3>`,
        '</div>',
      ].join(''),
    )
    .join('');
  return [
    '<section class="preview-section cards-section">',
    renderSectionHead(s.cardsHeading),
    `<p class="section-lede">${escapeHtml(s.cardsIntro)}</p>`,
    `<div class="cards">${cards}</div>`,
    '</section>',
  ].join('');
}

/** Already checked by the schema's own guard, and escaped here anyway: the
 *  paragraphs are code-generated today, and an escaping policy that depends
 *  on who generated a string is one refactor away from being wrong.
 *
 *  core's buildOutreachFactsBlock always emits the regime criterion first
 *  and the confirm-with-counsel caveat last, so the layout follows the
 *  report's own legal pages: the criterion is the raised reference card,
 *  the registry reading is body text on the ground, and the caveat is fine
 *  print. */
function renderFacts(input: OutreachPreviewSummary): string {
  if (input.facts.state === 'omitted') return '';
  const [criterion, ...rest] = input.facts.paragraphs;
  const caveat = rest.length > 0 ? rest[rest.length - 1] : undefined;
  const body = rest.slice(0, -1);
  return [
    '<section class="preview-section facts-section">',
    renderSectionHead(input.facts.heading),
    criterion === undefined
      ? ''
      : `<div class="facts-reference"><p>${escapeHtml(criterion)}</p></div>`,
    ...body.map((paragraph) => `<p class="facts-body">${escapeHtml(paragraph)}</p>`),
    caveat === undefined ? '' : `<p class="fineprint">${escapeHtml(caveat)}</p>`,
    '</section>',
  ].join('');
}

function renderOffer(input: OutreachPreviewSummary, s: OutreachPreviewStringsV2): string {
  return [
    '<section class="preview-section offer-section">',
    renderSectionHead(s.offerHeading),
    `<p class="section-lede">${escapeHtml(
      fillTemplate(s.offerBody, { price: formatFullAuditPrice(input.language) }),
    )}</p>`,
    '<div class="offer-actions">',
    `<a class="cta" href="mailto:${OUTREACH_CONTACT.address}?subject=${encodeURIComponent(
      s.offerHeading,
    )}">${escapeHtml(s.offerReplyLabel)}</a>`,
    `<a class="secondary-action" href="${escapeHtml(input.links.offer)}">${escapeHtml(
      s.offerLinkLabel,
    )}</a>`,
    '</div>',
    '</section>',
  ].join('');
}

function renderPrivacy(input: OutreachPreviewSummary, s: OutreachPreviewStringsV2): string {
  const origins = input.recipient.dataOrigins
    .map((origin) => `<li>${escapeHtml(s.dataOrigin[origin])}</li>`)
    .join('');
  return [
    '<section class="disclosure">',
    `<h2>${escapeHtml(s.privacyHeading)}</h2>`,
    `<p>${escapeHtml(s.privacyController)}</p>`,
    `<p>${escapeHtml(s.privacyData)}</p>`,
    `<p>${escapeHtml(s.privacyOriginsIntro)}</p>`,
    `<ul>${origins}</ul>`,
    `<p>${escapeHtml(s.privacyPurpose)}</p>`,
    `<p>${escapeHtml(s.privacyBasis)}</p>`,
    `<p class="fineprint">${escapeHtml(s.privacyExpiry)}</p>`,
    `<p class="fineprint">${escapeHtml(s.privacyRights)}</p>`,
    `<p class="actions"><a href="${escapeHtml(input.links.privacy)}">${escapeHtml(
      s.privacyLink,
    )}</a><a href="${escapeHtml(input.links.optOut)}">${escapeHtml(s.optOutLink)}</a></p>`,
    '</section>',
  ].join('');
}

export function generateOutreachPreviewHtmlV2(input: OutreachPreviewSummary): string {
  const validated = outreachPreviewSummarySchema.parse(input);
  const s = outreachPreviewStringsV2(validated.language);
  const reportStrings = getStrings(validated.language);
  const observedDate = formatDate(new Date(validated.observedAt), validated.language);
  const reportType =
    validated.coverage.performanceMeasuredPageCount > 0
      ? reportStrings.cover.reportType
      : reportStrings.cover.reportTypeNoPerformance;

  const html = [
    '<!doctype html>',
    `<html lang="${validated.language}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    // A preview is addressed to one recipient and is not a page we want indexed.
    '<meta name="robots" content="noindex, nofollow">',
    `<title>${escapeHtml(validated.recipient.businessName)} - ${escapeHtml(s.documentTitle)}</title>`,
    `<style>${OUTREACH_PREVIEW_STYLES_V2}</style>`,
    '</head>',
    '<body>',
    '<main>',
    // This is the paid report's actual cover renderer, with preview data bound
    // into its canonical slots. The longer preview introduction moves below
    // the cover so the cover keeps the report's deliberate two-act composition.
    '<header class="cover">',
    renderDocumentCoverLayout({
      kicker: reportStrings.cover.kicker,
      headline: validated.recipient.businessName,
      question: resolveDecisionQuestion(validated.language),
      // The shared copy binds each separator to the NEXT category
      // (" ·\u00a0"); the preview binds it to the previous one instead, so a
      // phone-width wrap never opens a line with "·".
      reportType: reportType.replace(/ ·[\u00a0 ]/gu, '\u00a0· '),
      signature: `${observedDate} · Odysseus`,
      scrollCue: renderScrollCue(s),
    }),
    '</header>',
    renderGradeSignal(validated, s),
    renderIntroduction(s),
    renderCoverage(validated, s),
    renderTotals(validated, s, reportStrings),
    renderCards(validated, s),
    renderFacts(validated),
    renderOffer(validated, s),
    renderPrivacy(validated, s),
    '</main>',
    '</body>',
    '</html>',
  ].join('\n');

  assertOutreachPreviewHtml(html, { editorialV2: true });
  return html;
}
