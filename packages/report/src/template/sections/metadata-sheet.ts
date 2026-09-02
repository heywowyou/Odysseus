import type { AuditManifest, AuditManualFields, Finding } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatDate, formatNumber, sheet } from '../html-utils.js';
import { LEVEL_COLOR } from '../design-tokens.js';
import { computeStatistics } from '../statistics.js';
import { hasMeasuredCoreWebVitals } from './core-web-vitals-table.js';
import { buildCoverageDisclosure } from '../coverage-disclosure.js';

/** Stable DOM id of the metadata sheet. The reference template
 *  (report.reference.html) leaves this section without an id, so a stable,
 *  deliberately non-numbered one is used instead: it must never enter
 *  SECTION_IDS or match section-registry's `section-*` id shape, or it
 *  would perturb computeSectionNumbers and the TOC's live ordinals for a
 *  sheet that is unnumbered chrome, like the cover and the TOC. */
export const METADATA_SHEET_ID = 'report-metadata';

/** The report always states its own language in that same language - a
 *  French report says "Français" regardless of what other languages are
 *  available, an English report says "English". Not user-facing choice
 *  data, just a fixed self-description, so a plain map rather than a
 *  ReportStrings entry. Moved here from cover.ts with the rest of the old
 *  six-field grid (plan 018 step 4). */
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
 *  stats-page tile already uses). Moved here from cover.ts unchanged by
 *  plan 018 step 4: same data source, same badges - this is the sheet's
 *  severity scale with its basis note, the slot the reference markup
 *  reserves below the fact grid.
 *
 *  Two dimming values differ from the cover implementation on purpose.
 *  On the cover these labels sat over the .sheet-cover gradient, whose
 *  background-image left axe's contrast resolution inconclusive; on this
 *  plain sheet the body background is resolved exactly, and the old
 *  values (50 percent transparent mix at opacity 0.7, a 0.4-opacity
 *  note) measure 2.83:1 and 3.35:1 against it - real WCAG failures the
 *  report's own axe e2e tests now catch. The inactive labels use the
 *  stylesheet's own 55 percent dimmed-label mix (nocturne.css) and the
 *  note matches the 0.55 opacity every other plain-sheet footnote uses,
 *  both comfortably above 4.5:1. */
function renderRiskBadge(
  strings: ReportStrings,
  analysis: StoredAnalysis,
  findings: readonly Finding[],
  manifest: AuditManifest,
): string {
  const scale = RISK_LEVEL_ORDER.map((level) => {
    const isCurrent = level === analysis.overallRisk;
    const levelColor = LEVEL_COLOR[level];
    return `<span style="padding:4px 10px;border-radius:calc(var(--radius-md)*0.75);font-size:${isCurrent ? '14px' : '11px'};font-weight:${isCurrent ? '500' : '400'};background:${isCurrent ? levelColor.bg : 'transparent'};color:${isCurrent ? levelColor.color : 'color-mix(in srgb, var(--color-text) 55%, transparent)'}">${escapeHtml(strings.metadata.riskLevels[level])}</span>`;
  }).join('');

  const stats = computeStatistics(findings, manifest);
  const basisNote = fillTemplate(strings.metadata.riskBasisTemplate, {
    critical: formatNumber(stats.critical, analysis.language),
    criticalWord:
      stats.critical === 1
        ? strings.metadata.criticalFindingSingular
        : strings.metadata.criticalFindingPlural,
    serious: formatNumber(stats.serious, analysis.language),
    seriousWord:
      stats.serious === 1
        ? strings.metadata.seriousFindingSingular
        : strings.metadata.seriousFindingPlural,
  });

  return `
    <div>
      <div style="display:inline-flex;align-items:center;gap:4px">${scale}</div>
      <div style="font-size:11px;opacity:0.55;margin-top:6px">${escapeHtml(basisNote)}</div>
      <div style="font-size:10px;opacity:0.55;margin-top:2px">${escapeHtml(strings.metadata.riskScaleBasisNote)}</div>
    </div>
  `;
}

/** The second physical page, between the cover and the table of contents
 *  (plan 018 step 4), ported from report.reference.html's METADATA SHEET
 *  section: audit identity and scope as a plain fact grid (site, date,
 *  scope, language, referential), the legal name when the operator
 *  supplied one, and the risk scale moved off the now-minimal cover.
 *
 *  raisonSociale renders ONLY here, as the legal identity on the fact
 *  sheet - never above the trading name on the cover - and its whole row
 *  is omitted when the field is absent rather than rendered with an empty
 *  value (manual-input-layer milestone, rule 5).
 *
 *  Unnumbered chrome like the cover and the TOC: a plain `.sheet` with no
 *  section-head ordinal. paged.css already forces `break-before: page` on
 *  every non-cover sheet, so this section is its own physical page and the
 *  TOC starts on the next one with no extra class. */
export function renderMetadataSheet(
  strings: ReportStrings,
  manifest: AuditManifest,
  analysis: StoredAnalysis,
  findings: readonly Finding[] = [],
  manualFields?: AuditManualFields,
): string {
  const pagesScanned = manifest.pages.filter((page) => page.status === 'visited').length;
  const coverage = buildCoverageDisclosure(strings, manifest, analysis.language);
  const scopeValue = manifest.pages.some((page) => page.analysisCoverage !== undefined)
    ? coverage.summary
    : fillTemplate(strings.metadata.pagesScannedValueTemplate, { count: pagesScanned });
  const raisonSociale = manualFields?.raisonSociale?.value;

  return sheet(
    `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:var(--space-2)">
      <h6 style="color:var(--color-accent-300);margin:0">${escapeHtml(strings.metadata.eyebrow)}</h6>
    </div>
    <h2 style="margin-bottom:var(--space-6)">${escapeHtml(strings.metadata.heading)}</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;row-gap:var(--space-8);column-gap:var(--space-8);font-size:13px">
      ${field(strings.metadata.siteLabel, escapeHtml(manifest.siteUrl))}
      ${field(strings.metadata.dateLabel, escapeHtml(formatDate(new Date(manifest.startedAt), analysis.language)))}
      ${field(strings.metadata.pagesScannedLabel, escapeHtml(scopeValue))}
      ${field(strings.metadata.languageLabel, escapeHtml(LANGUAGE_SELF_NAME[analysis.language]))}
      ${field(
        strings.metadata.wcagReferentialLabel,
        escapeHtml(
          hasMeasuredCoreWebVitals(manifest)
            ? strings.metadata.wcagReferentialValue
            : strings.metadata.wcagReferentialValueNoPerformance,
        ),
      )}
      ${raisonSociale ? field(strings.metadata.legalNameLabel, escapeHtml(raisonSociale)) : ''}
      ${field(strings.metadata.riskSmallLabel, renderRiskBadge(strings, analysis, findings, manifest))}
    </div>
  `,
    '',
    METADATA_SHEET_ID,
  );
}
