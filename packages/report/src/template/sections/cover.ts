import type { AuditManifest, AuditManualFields, Finding } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatDate, formatNumber, sheet } from '../html-utils.js';
import { LEVEL_COLOR } from '../design-tokens.js';
import { computeStatistics } from '../statistics.js';
import { hasMeasuredCoreWebVitals } from './core-web-vitals-table.js';

/** The report always states its own language in that same language - a
 *  French report says "Français" regardless of what other languages are
 *  available, an English report says "English". Not user-facing choice
 *  data, just a fixed self-description, so a plain map rather than a
 *  ReportStrings entry. */
const LANGUAGE_SELF_NAME: Record<StoredAnalysis['language'], string> = {
  fr: 'Français',
  en: 'English',
};

function field(label: string, valueHtml: string): string {
  return `
    <div>
      <div style="text-transform:uppercase;letter-spacing:0.02em;font-size:10px;opacity:0.5;margin-bottom:8px">${escapeHtml(label)}</div>
      <div style="font-size:18px">${valueHtml}</div>
    </div>
  `;
}

const RISK_LEVEL_ORDER: readonly StoredAnalysis['overallRisk'][] = ['low', 'medium', 'high'];

/** item 42: the badge showed "Élevé" with no scale and no stated basis -
 *  the reader had no way to calibrate the word or verify how the tool
 *  got there. Shows the full three-point scale with the current level
 *  highlighted, plus a one-line note on the underlying critical/serious
 *  counts (computeStatistics, the same live-computed source item 10's
 *  stats-page tile already uses). */
function renderRiskBadge(
  strings: ReportStrings,
  analysis: StoredAnalysis,
  findings: readonly Finding[],
  manifest: AuditManifest,
): string {
  const scale = RISK_LEVEL_ORDER.map((level) => {
    const isCurrent = level === analysis.overallRisk;
    const levelColor = LEVEL_COLOR[level];
    return `<span style="padding:4px 10px;border-radius:calc(var(--radius-md)*0.75);font-size:${isCurrent ? '14px' : '11px'};font-weight:${isCurrent ? '500' : '400'};background:${isCurrent ? levelColor.bg : 'transparent'};color:${isCurrent ? levelColor.color : 'color-mix(in srgb, var(--color-text) 50%, transparent)'};opacity:${isCurrent ? '1' : '0.7'}">${escapeHtml(strings.cover.riskLevels[level])}</span>`;
  }).join('');

  const stats = computeStatistics(findings, manifest);
  const basisNote = fillTemplate(strings.cover.riskBasisTemplate, {
    critical: formatNumber(stats.critical, analysis.language),
    criticalWord:
      stats.critical === 1
        ? strings.cover.criticalFindingSingular
        : strings.cover.criticalFindingPlural,
    serious: formatNumber(stats.serious, analysis.language),
    seriousWord:
      stats.serious === 1
        ? strings.cover.seriousFindingSingular
        : strings.cover.seriousFindingPlural,
  });

  return `
    <div>
      <div style="display:inline-flex;align-items:center;gap:4px">${scale}</div>
      <div style="font-size:11px;opacity:0.55;margin-top:6px">${escapeHtml(basisNote)}</div>
      <div style="font-size:10px;opacity:0.4;margin-top:2px">${escapeHtml(strings.cover.riskScaleBasisNote)}</div>
    </div>
  `;
}

/** Cover layout ported from report.reference.html's COVER section: a
 *  centered kicker/title/subtitle block over the radial-gradient ground
 *  (painted by the .sheet-cover class in paged.css), then a short accent
 *  rule and a six-field grid (site, date, scope, language, standard,
 *  risk).
 *
 *  The hidden `.footer-source` node (feeds paged.css's `string-set`, see
 *  render-html.ts) lives inside this section, not as a preceding sibling
 *  of the whole document flow: CSS Paged Media forces an implicit page
 *  break whenever the page selector changes between two boxes, and
 *  `.sheet-cover` requests the named `cover` page while every other sheet
 *  uses the default `@page`. A `.footer-source` node placed before the
 *  cover therefore sat on the default page by itself, pushing the
 *  cover's own content onto page 2 - confirmed against a real render, not
 *  a hypothetical. Placing it as the cover's own first child keeps it on
 *  the same named page from the start, so no such transition ever
 *  happens. */
/** item D8 (P4): the subtitle line used to be "Rapport d'audit" (reportTitle)
 *  whenever a company name occupied the H1 - generic against the product's
 *  actual four-category scope. strings.cover.subtitle now states that
 *  scope directly and is used in both cases (with or without a company
 *  name), not only when there's no company name. */
export function renderCover(
  strings: ReportStrings,
  manifest: AuditManifest,
  analysis: StoredAnalysis,
  findings: readonly Finding[] = [],
  manualFields?: AuditManualFields,
): string {
  const pagesScanned = manifest.pages.filter((page) => page.status === 'visited').length;

  // Manual-input-layer milestone, rule 5: every field absent must
  // produce a correctly rendering report - the headline identity falls
  // back to the site URL exactly as before when nomCommercial is unset,
  // and the legal-name line is omitted entirely rather than rendered
  // empty.
  //
  // item 3.9: the cover used to print the client's name three times (H1
  // via nomCommercial, "Dénomination sociale" via raisonSociale, and
  // "Préparé pour" via recipientName - all three legitimately holding the
  // same company name). "Préparé pour" dropped here rather than
  // repurposed for a distinct contact-person field, since no such field
  // exists in AuditManualFields yet and inventing one speculatively for a
  // copy fix would be exactly the kind of unrequested structure CLAUDE.md
  // warns against. AuditManualFields.recipientName itself is left in
  // place (not deleted) for a future session to actually wire to a
  // contact-person input if that input is ever built.
  const nomCommercial = manualFields?.nomCommercial?.value;
  const raisonSociale = manualFields?.raisonSociale?.value;

  return sheet(
    `
    <div class="footer-source">${escapeHtml(strings.footer.confidentialityLabel.toUpperCase())} &middot; ${escapeHtml(manifest.siteUrl)}</div>
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:var(--space-4)">
      <div style="font-size:11px;letter-spacing:0.02em;text-transform:uppercase;color:var(--color-accent-200)">${escapeHtml(strings.cover.kicker)}</div>
      <h1 style="font-size:52px;max-width:13ch;margin:0">${escapeHtml(nomCommercial ?? strings.cover.reportTitle)}</h1>
      <div style="font-size:17px;opacity:0.8;max-width:38ch">${escapeHtml(hasMeasuredCoreWebVitals(manifest) ? strings.cover.subtitle : strings.cover.subtitleNoPerformance)}</div>
      ${raisonSociale ? `<div style="font-size:13px;opacity:0.6">${escapeHtml(strings.cover.legalNameLabel)} : ${escapeHtml(raisonSociale)}</div>` : ''}
    </div>
    <div>
      <div style="height:1px;background:linear-gradient(to right,var(--color-accent) 0,var(--color-accent) 120px,transparent 120px);margin-bottom:var(--space-8)"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;row-gap:var(--space-8);column-gap:var(--space-8);font-size:13px">
        ${field(strings.cover.siteLabel, escapeHtml(manifest.siteUrl))}
        ${field(strings.cover.dateLabel, escapeHtml(formatDate(new Date(manifest.startedAt), analysis.language)))}
        ${field(strings.cover.pagesScannedLabel, escapeHtml(fillTemplate(strings.cover.pagesScannedValueTemplate, { count: pagesScanned })))}
        ${field(strings.cover.languageLabel, escapeHtml(LANGUAGE_SELF_NAME[analysis.language]))}
        ${field(
          strings.cover.wcagReferentialLabel,
          escapeHtml(
            hasMeasuredCoreWebVitals(manifest)
              ? strings.cover.wcagReferentialValue
              : strings.cover.wcagReferentialValueNoPerformance,
          ),
        )}
        ${field(strings.cover.riskSmallLabel, renderRiskBadge(strings, analysis, findings, manifest))}
      </div>
    </div>
  `,
    'sheet-cover',
  );
}
