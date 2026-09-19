import {
  formatFullAuditPrice,
  OUTREACH_CONTACT,
  outreachPreviewSummaryV3Schema,
  type OutreachPreviewSummaryV3,
} from '@odysseus/core';
import { escapeHtml, fillTemplate, formatDate } from '../template/html-utils.js';
import { renderDocumentCoverLayout } from '../template/sections/cover.js';
import { resolveDecisionQuestion } from '../template/generic-question.js';
import { getStrings, type ReportStrings } from '../template/strings/i18n.js';
import { OUTREACH_PREVIEW_STYLES_V2 } from './styles-v2.js';
import { outreachPreviewStringsV3, type OutreachPreviewStringsV3 } from './strings-v3.js';
import { assertOutreachPreviewHtml } from './preview-lint.js';

const PREVIEW_RESULTS_ID = 'resultats';

const V3_ADDITIONAL_STYLES = `
.priority-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}
.priority-rank {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid var(--divider);
  border-radius: 50%;
  color: var(--accent-strong);
  font-size: 18px;
  font-weight: 600;
}
.priority-card .card-meta { margin-bottom: var(--space-2); }
.data-quality-status {
  display: inline-flex;
  margin-bottom: var(--space-4);
  padding: 6px 10px;
  border: 1px solid var(--divider);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.data-quality-status-limited { color: var(--sev-moderate); }
.data-quality-status-complete { color: var(--accent-strong); }
.data-quality-status-unavailable { color: var(--muted); }
.limitations-list { margin: var(--space-2) 0 0; padding-left: 1.2rem; }
.limitations-list li { margin: 0 0 var(--space-2); }
@media (max-width: 480px) {
  .priority-card { grid-template-columns: 34px minmax(0, 1fr); gap: var(--space-3); }
  .priority-rank { width: 30px; height: 30px; font-size: 15px; }
}
`;

function renderSectionHead(heading: string): string {
  return `<div class="section-head"><h2>${escapeHtml(heading)}</h2></div>`;
}

function renderStatTile(value: number, label: string, primary = false): string {
  return `<div class="${primary ? 'stat-tile stat-tile-primary' : 'stat-tile'}"><div class="stat-value">${value}</div><div class="stat-label">${escapeHtml(label)}</div></div>`;
}

function renderScrollCue(s: OutreachPreviewStringsV3): string {
  return [
    `<a class="cover-scroll-cue" href="#${PREVIEW_RESULTS_ID}" aria-label="${escapeHtml(s.scrollCueLabel)}">`,
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">',
    '<path d="M6 9.5 12 15.5 18 9.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    '</svg>',
    '</a>',
  ].join('');
}

function renderIntroduction(s: OutreachPreviewStringsV3): string {
  return `<div class="preview-introduction"><p>${escapeHtml(s.lede)}</p></div>`;
}

function renderResults(
  input: OutreachPreviewSummaryV3,
  s: OutreachPreviewStringsV3,
  reportStrings: ReportStrings,
): string {
  const severityMeanings = {
    critical: reportStrings.statistics.legendCriticalText,
    serious: reportStrings.statistics.legendSeriousText,
    moderate: reportStrings.statistics.legendModerateText,
    minor: reportStrings.statistics.legendMinorText,
  } as const;
  const nonZero = (['critical', 'serious', 'moderate', 'minor'] as const).filter(
    (severity) => input.severityTotals[severity] > 0,
  );
  const severityTiles = nonZero
    .map(
      (severity) =>
        `<div class="severity-tile severity-${severity}"><div class="severity-heading"><span class="severity-dot"></span><span class="severity-label">${escapeHtml(s.severity[severity])}</span></div><div class="severity-value">${input.severityTotals[severity]}</div><div class="severity-meaning">${escapeHtml(severityMeanings[severity])}</div></div>`,
    )
    .join('');
  return [
    `<section class="preview-section results-section" id="${PREVIEW_RESULTS_ID}">`,
    renderSectionHead(s.resultsHeading),
    `<h3 class="breakdown-heading">${escapeHtml(s.coverageSubheading)}</h3>`,
    `<p class="section-lede">${escapeHtml(s.coverageIntro)}</p>`,
    '<div class="stat-grid stat-grid-coverage">',
    renderStatTile(input.coverage.inventoriedPageCount, s.coverage.inventoried),
    renderStatTile(input.coverage.contentCheckedPageCount, s.coverage.contentChecked),
    renderStatTile(input.coverage.performanceMeasuredPageCount, s.coverage.performanceMeasured),
    '</div>',
    `<p class="fineprint">${escapeHtml(s.performanceNote)}</p>`,
    `<h3 class="breakdown-heading">${escapeHtml(s.totalsSubheading)}</h3>`,
    '<div class="stat-grid stat-grid-totals">',
    renderStatTile(input.distinctFindingCount, s.distinctFindings, true),
    renderStatTile(input.affectedPageCount, s.affectedPages),
    '</div>',
    `<h3 class="breakdown-heading">${escapeHtml(s.severityHeading)}</h3>`,
    `<div class="severity-grid severity-grid-${nonZero.length}">${severityTiles}</div>`,
    '</section>',
  ].join('');
}

function renderPriorities(input: OutreachPreviewSummaryV3, s: OutreachPreviewStringsV3): string {
  const cards = input.priorityCards
    .map((card) => {
      const reach =
        card.affectedPageCount === 0
          ? s.prioritySiteWide
          : `${card.affectedPageCount} ${card.affectedPageCount === 1 ? s.priorityPageSingular : s.priorityPagesPlural}`;
      return [
        '<div class="card priority-card">',
        `<div class="priority-rank" aria-label="${card.rank}">${card.rank}</div>`,
        '<div>',
        '<div class="card-meta">',
        `<span class="tag">${escapeHtml(s.category[card.category])}</span>`,
        `<span class="card-severity severity-${card.severity}"><span class="severity-dot"></span>${escapeHtml(s.severity[card.severity])}</span>`,
        `<span class="card-pages">${escapeHtml(reach)}</span>`,
        '</div>',
        `<h3>${escapeHtml(card.title[input.language])}</h3>`,
        '</div>',
        '</div>',
      ].join('');
    })
    .join('');
  return [
    '<section class="preview-section cards-section priorities-section">',
    renderSectionHead(s.prioritiesHeading),
    `<p class="section-lede">${escapeHtml(s.prioritiesIntro)}</p>`,
    `<div class="cards">${cards}</div>`,
    '</section>',
  ].join('');
}

function renderDataQuality(input: OutreachPreviewSummaryV3, s: OutreachPreviewStringsV3): string {
  const status = input.dataQuality.status;
  const limitations =
    status === 'limited'
      ? [
          `<h3 class="breakdown-heading">${escapeHtml(s.limitationsHeading)}</h3>`,
          '<ul class="limitations-list">',
          ...input.dataQuality.limitations.map(
            (limitation) => `<li>${escapeHtml(limitation.summary[input.language])}</li>`,
          ),
          '</ul>',
        ].join('')
      : status === 'unavailable'
        ? `<p class="fineprint">${escapeHtml(s.unavailableNote)}</p>`
        : '';
  return [
    '<section class="preview-section data-quality-section">',
    renderSectionHead(s.dataQualityHeading),
    `<p class="section-lede">${escapeHtml(s.dataQualityIntro)}</p>`,
    `<div class="data-quality-status data-quality-status-${status}">${escapeHtml(s.dataQualityStatus[status])}</div>`,
    limitations,
    '</section>',
  ].join('');
}

function renderFacts(input: OutreachPreviewSummaryV3): string {
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

function renderOffer(input: OutreachPreviewSummaryV3, s: OutreachPreviewStringsV3): string {
  return [
    '<section class="preview-section offer-section">',
    renderSectionHead(s.offerHeading),
    `<p class="section-lede">${escapeHtml(fillTemplate(s.offerBody, { price: formatFullAuditPrice(input.language) }))}</p>`,
    '<div class="offer-actions">',
    `<a class="cta" href="mailto:${OUTREACH_CONTACT.address}?subject=${encodeURIComponent(s.offerHeading)}">${escapeHtml(s.offerReplyLabel)}</a>`,
    `<a class="secondary-action" href="${escapeHtml(input.links.offer)}">${escapeHtml(s.offerLinkLabel)}</a>`,
    '</div>',
    '</section>',
  ].join('');
}

function renderPrivacy(input: OutreachPreviewSummaryV3, s: OutreachPreviewStringsV3): string {
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
    `<p class="actions"><a href="${escapeHtml(input.links.privacy)}">${escapeHtml(s.privacyLink)}</a><a href="${escapeHtml(input.links.optOut)}">${escapeHtml(s.optOutLink)}</a></p>`,
    '</section>',
  ].join('');
}

export function generateOutreachPreviewHtmlV3(input: OutreachPreviewSummaryV3): string {
  const validated = outreachPreviewSummaryV3Schema.parse(input);
  const s = outreachPreviewStringsV3(validated.language);
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
    '<meta name="robots" content="noindex, nofollow">',
    `<title>${escapeHtml(validated.recipient.businessName)} - ${escapeHtml(s.documentTitle)}</title>`,
    `<style>${OUTREACH_PREVIEW_STYLES_V2}\n${V3_ADDITIONAL_STYLES}</style>`,
    '</head>',
    '<body>',
    '<main>',
    '<header class="cover">',
    renderDocumentCoverLayout({
      kicker: reportStrings.cover.kicker,
      headline: validated.recipient.businessName,
      question: resolveDecisionQuestion(validated.language),
      reportType: reportType.replace(/ ·[\u00a0 ]/gu, '\u00a0· '),
      signature: `${observedDate} · Odysseus`,
      scrollCue: renderScrollCue(s),
    }),
    '</header>',
    renderIntroduction(s),
    renderResults(validated, s, reportStrings),
    renderPriorities(validated, s),
    renderDataQuality(validated, s),
    renderFacts(validated),
    renderOffer(validated, s),
    renderPrivacy(validated, s),
    '</main>',
    '</body>',
    '</html>',
  ].join('\n');

  assertOutreachPreviewHtml(html, { editorialCurrent: true });
  return html;
}
