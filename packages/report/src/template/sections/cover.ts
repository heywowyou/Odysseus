import type { AuditManifest, AuditManualFields } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatDate, sheet } from '../html-utils.js';
import { SEVERITY } from '../design-tokens.js';

/** The report always states its own language in that same language - a
 *  French report says "Français" regardless of what other languages are
 *  available, an English report says "English". Not user-facing choice
 *  data, just a fixed self-description, so a plain map rather than a
 *  ReportStrings entry. */
const LANGUAGE_SELF_NAME: Record<StoredAnalysis['language'], string> = {
  fr: 'Français',
  en: 'English',
};

/** report.reference.html's own cover doesn't carry a severity badge
 *  (that colour scale is per-finding), so the risk badge borrows the
 *  closest of the 3 overall-risk levels onto the same critical/serious/
 *  moderate colour ramp rather than inventing a 4th scale: low -> the
 *  calmest tone (moderate's), medium -> serious's, high -> critical's. */
const RISK_COLOR: Record<StoredAnalysis['overallRisk'], { color: string; bg: string }> = {
  low: SEVERITY.moderate,
  medium: SEVERITY.serious,
  high: SEVERITY.critical,
};

function field(label: string, valueHtml: string): string {
  return `
    <div>
      <div style="text-transform:uppercase;letter-spacing:0.08em;font-size:10px;opacity:0.5;margin-bottom:8px">${escapeHtml(label)}</div>
      <div style="font-size:18px">${valueHtml}</div>
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
export function renderCover(
  strings: ReportStrings,
  manifest: AuditManifest,
  analysis: StoredAnalysis,
  manualFields?: AuditManualFields,
): string {
  const pagesScanned = manifest.pages.filter((page) => page.status === 'visited').length;
  const riskLabel = strings.cover.riskLevels[analysis.overallRisk];
  const risk = RISK_COLOR[analysis.overallRisk];

  // Manual-input-layer milestone, rule 5: every field absent must
  // produce a correctly rendering report - the headline identity falls
  // back to the site URL exactly as before when nomCommercial is unset,
  // and the "Préparé pour" line and legal-name line are omitted
  // entirely rather than rendered empty.
  const nomCommercial = manualFields?.nomCommercial?.value;
  const raisonSociale = manualFields?.raisonSociale?.value;
  const recipientName = manualFields?.recipientName?.value;

  return sheet(
    `
    <div class="footer-source">${escapeHtml(strings.footer.confidentialityLabel)} &middot; ${escapeHtml(manifest.siteUrl)}</div>
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:var(--space-4)">
      <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:var(--color-accent-200)">${escapeHtml(strings.cover.kicker)}</div>
      <h1 style="font-size:52px;max-width:13ch;margin:0">${escapeHtml(nomCommercial ?? strings.cover.reportTitle)}</h1>
      <div style="font-size:17px;opacity:0.8;max-width:38ch">${escapeHtml(nomCommercial ? strings.cover.reportTitle : strings.cover.subtitle)}</div>
      ${raisonSociale ? `<div style="font-size:13px;opacity:0.6">${escapeHtml(strings.cover.legalNameLabel)} : ${escapeHtml(raisonSociale)}</div>` : ''}
    </div>
    <div>
      <div style="height:1px;background:linear-gradient(to right,var(--color-accent) 0,var(--color-accent) 120px,transparent 120px);margin-bottom:var(--space-8)"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;row-gap:var(--space-8);column-gap:var(--space-8);font-size:13px">
        ${field(strings.cover.siteLabel, escapeHtml(manifest.siteUrl))}
        ${field(strings.cover.dateLabel, escapeHtml(formatDate(new Date(manifest.startedAt), analysis.language)))}
        ${field(strings.cover.pagesScannedLabel, escapeHtml(fillTemplate(strings.cover.pagesScannedValueTemplate, { count: pagesScanned })))}
        ${field(strings.cover.languageLabel, escapeHtml(LANGUAGE_SELF_NAME[analysis.language]))}
        ${field(strings.cover.wcagReferentialLabel, 'WCAG 2.2 AA')}
        ${field(
          strings.cover.riskSmallLabel,
          `<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:calc(var(--radius-md)*0.75);font-size:14px;font-weight:500;background:${risk.bg};color:${risk.color}">${escapeHtml(riskLabel)}</span>`,
        )}
        ${recipientName ? field(strings.cover.recipientLabel, escapeHtml(recipientName)) : ''}
      </div>
    </div>
  `,
    'sheet-cover',
  );
}
