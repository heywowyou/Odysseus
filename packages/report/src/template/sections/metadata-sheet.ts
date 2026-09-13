import type { AuditManifest, AuditManualFields, Finding } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import {
  escapeHtml,
  fillTemplate,
  formatDate,
  formatNumber,
  pluralize,
  sheet,
} from '../html-utils.js';
import { LEVEL_COLOR } from '../design-tokens.js';
import { computeStatistics } from '../statistics.js';
import { hasMeasuredCoreWebVitals } from './core-web-vitals-table.js';
import { buildCoverageDisclosure } from '../coverage-disclosure.js';
import { computeComparativeGrade, computeSeverityGrade } from '../grade.js';
import { renderScorecardGrade } from '../render-scorecard.js';

/** Stable DOM id of the metadata sheet. The reference template
 *  (report.reference.html) leaves this section without an id, so a stable,
 *  deliberately non-numbered one is used instead: it must never enter
 *  SECTION_IDS or match section-registry's `section-*` id shape, or it
 *  would perturb computeSectionNumbers and the TOC's live ordinals for a
 *  sheet that is unnumbered chrome, like the cover and the TOC. */
export const METADATA_SHEET_ID = 'report-metadata';

function field(label: string, valueHtml: string, extraClass = ''): string {
  const className = extraClass ? `metadata-field ${extraClass}` : 'metadata-field';
  return `
    <div class="${className}">
      <div class="metadata-field-label" style="text-transform:uppercase;letter-spacing:0.02em;font-size:10px;opacity:0.5;margin-bottom:var(--space-3)">${escapeHtml(label)}</div>
      <div class="metadata-field-value" style="font-size:18px">${valueHtml}</div>
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
    const className = isCurrent
      ? 'metadata-risk-level metadata-risk-level-current'
      : 'metadata-risk-level';
    return `<span class="${className}" style="padding:4px 10px;border-radius:calc(var(--radius-md)*0.75);font-size:${isCurrent ? '14px' : '11px'};font-weight:${isCurrent ? '500' : '400'};background:${isCurrent ? levelColor.bg : 'transparent'};color:${isCurrent ? levelColor.color : 'color-mix(in srgb, var(--color-text) 55%, transparent)'}">${escapeHtml(strings.metadata.riskLevels[level])}</span>`;
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
    <div class="metadata-risk">
      <div class="metadata-risk-scale" style="display:inline-flex;align-items:center;gap:4px">${scale}</div>
      <div class="metadata-risk-basis" style="font-size:11px;opacity:0.55;margin-top:6px">${escapeHtml(basisNote)}</div>
      <div class="metadata-risk-note" style="font-size:10px;opacity:0.55;margin-top:2px">${escapeHtml(strings.metadata.riskScaleBasisNote)}</div>
    </div>
  `;
}

/** Plan 041 Part A: a deterministic letter grade, always paired with its
 *  disclaimer sentence (render-scorecard.ts enforces this by construction).
 *  Deliberately its own field, visually distinct from renderRiskBadge above
 *  it: the risk badge is `overallRisk`, an LLM judgement call
 *  (llm-output.ts); this grade is computed purely from scanner findings, so
 *  the two must never be merged or restyled to look like one signal.
 *
 *  Uses the benchmark percentile when this audit has been compared against
 *  a frozen cohort (manifest.benchmarkPercentile, milestone 10); otherwise
 *  falls back to the own-counts severity grade, the same source the
 *  outreach preview always uses (that document's stricter no-statistics
 *  rule, trade-off 42/16, forbids it from ever using the percentile). */
function renderScorecard(
  strings: ReportStrings,
  findings: readonly Finding[],
  manifest: AuditManifest,
): string {
  const outcome = manifest.benchmarkPercentile;
  const grade =
    outcome?.kind === 'scored'
      ? computeComparativeGrade(outcome).grade
      : computeSeverityGrade(computeStatistics(findings, manifest)).grade;
  return renderScorecardGrade(grade, strings.metadata.scorecardDisclaimer);
}

/** The second physical page, between the cover and the table of contents
 *  (plan 018 step 4), ported from report.reference.html's METADATA SHEET
 *  section: audit identity and scope as a plain fact grid (site, date,
 *  scope, referential), the legal name when the operator supplied one, and
 *  the risk scale moved off the now-minimal cover. The report-language row
 *  the old grid also carried is gone (issue #51): the client is reading
 *  that language, so the line answered no question they have, and PDF
 *  filenames plus the render identity still carry the language for the
 *  flows that need it.
 *
 *  raisonSociale renders ONLY here, as the legal identity on the fact
 *  sheet - never above the trading name on the cover - and its whole row
 *  is omitted when the field is absent rather than rendered with an empty
 *  value (manual-input-layer milestone, rule 5).
 *
 *  Unnumbered chrome like the cover and the TOC: a plain `.sheet` with no
 *  section-head ordinal. paged.css already forces `break-before: page` on
 *  every non-cover sheet, so this section is its own physical page and the
 *  TOC starts on the next one with no extra class.
 *
 *  Plan 023 recomposition: the sheet renders as a flex column
 *  (.sheet-metadata, paged.css) and the risk scale is the closing band -
 *  full width under a fading hairline, margin-top:auto pulling it to
 *  roughly two-thirds page height with a fixed quiet spacer after it -
 *  so the page reads as composed instead of ending where the grid ran
 *  out. No field moves between languages and no wording changes: the
 *  scale keeps its exact field anatomy, just full width below the grid
 *  instead of as the grid's last cell. */
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
    : `${formatNumber(pagesScanned, analysis.language)} ${pluralize(pagesScanned, strings.metadata.pagesScannedSingular, strings.metadata.pagesScannedPlural)}`;
  const raisonSociale = manualFields?.raisonSociale?.value;

  return sheet(
    `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:var(--space-2)">
      <h6 style="color:var(--color-accent-300);margin:0">${escapeHtml(strings.metadata.eyebrow)}</h6>
    </div>
    <h2 style="margin-bottom:var(--space-6)">${escapeHtml(strings.metadata.heading)}</h2>
    <div class="metadata-facts" style="display:grid;grid-template-columns:1fr 1fr;row-gap:var(--space-8);column-gap:var(--space-8);font-size:13px">
      ${field(strings.metadata.siteLabel, escapeHtml(manifest.siteUrl))}
      ${field(strings.metadata.dateLabel, escapeHtml(formatDate(new Date(manifest.startedAt), analysis.language)))}
      ${field(strings.metadata.pagesScannedLabel, escapeHtml(scopeValue))}
      ${field(
        strings.metadata.wcagReferentialLabel,
        escapeHtml(
          hasMeasuredCoreWebVitals(manifest)
            ? strings.metadata.wcagReferentialValue
            : strings.metadata.wcagReferentialValueNoPerformance,
        ),
      )}
      ${raisonSociale ? field(strings.metadata.legalNameLabel, escapeHtml(raisonSociale)) : ''}
    </div>
    <div class="metadata-signal" style="margin-top:auto">
      <div class="hr"></div>
      <div class="metadata-signal-stack" style="display:flex;gap:var(--space-8);align-items:flex-start">
        ${field(strings.metadata.riskSmallLabel, renderRiskBadge(strings, analysis, findings, manifest), 'metadata-risk-field')}
        ${field(strings.metadata.scorecardLabel, renderScorecard(strings, findings, manifest), 'metadata-grade-field')}
      </div>
    </div>
    <div class="metadata-spacer" style="min-height:60mm"></div>
  `,
    'sheet-metadata',
    METADATA_SHEET_ID,
  );
}
