import {
  RENDER_DIFF_EMISSION_THRESHOLD_PERCENT,
  type AuditManifest,
  type Finding,
  type ReportLanguage,
} from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import {
  escapeHtml,
  fillTemplate,
  formatNumber,
  pluralize,
  renderSheetHeader,
  sheet,
} from '../html-utils.js';
import { CATEGORY, CATEGORY_ORDER, SEVERITY } from '../design-tokens.js';
import { type RenderedPriority, summarizePriorityOwnership } from '../rendered-priorities.js';
import { renderPriorityOwnershipSentence } from '../priority-ownership-note.js';
import { computeStatistics } from '../statistics.js';
import { resolveFindingDisplayLabel } from '../rule-translations.js';

/** item 1.10 (La Corniche pass): "N/N pages avec au moins un constat
 *  critique" reads as an alarming, broad finding, but on a real report
 *  all 33 Critique findings reduced to exactly 2 rules (image-alt,
 *  button-name) that both happen to fire on every page - the "N/N" is
 *  then mechanically guaranteed by those two rules alone, not by broad
 *  distinct risk. Named here, next to the tile, only when the driver is
 *  actually concentrated (a handful of rules), so a reader isn't left to
 *  discover the concentration only after reading the full annex. */
const CRITICAL_DRIVER_MAX_RULES = 3;

function criticalDriverRuleTitles(
  findings: readonly Finding[],
  language: ReportLanguage,
): string[] {
  const criticalRuleIds = [
    ...new Set(findings.filter((f) => f.severity === 'critical').map((f) => f.ruleId)),
  ];
  if (criticalRuleIds.length === 0 || criticalRuleIds.length > CRITICAL_DRIVER_MAX_RULES) return [];

  return criticalRuleIds.map((ruleId) =>
    resolveFindingDisplayLabel(language, ruleId, findings.find((f) => f.ruleId === ruleId)?.title),
  );
}

/** Doc §3 section 03 cap: the 4 number tiles are fixed (report.reference.
 *  html's numberTiles, the same first 4 metrics the pre-redesign 10-tile
 *  layout led with) and always render. Severity and category tiles are
 *  not fixed at 4 any more (item D7, P4): a severity or category with
 *  zero findings is dropped from render entirely rather than shown as an
 *  empty tile, so their grids can have anywhere from 1 to 4 (severity) or
 *  1 to CATEGORY_ORDER.length (category) tiles depending on what the scan
 *  actually found. */
function renderNumberTile(value: string, label: string, primary = false): string {
  const className = primary
    ? 'stat-tile statistics-number-tile statistics-number-tile-primary'
    : 'stat-tile statistics-number-tile';
  // The value never wraps: a narrow tile used to split a five-digit French
  // count after its first digits ("17 02" over "6"). Its character count
  // lets the stylesheet shrink a long value to the tile's width instead.
  return `
    <div class="${className}">
      <div class="statistics-number-value" style="--value-chars:${[...value].length}">${value}</div>
      <div class="statistics-number-label">${escapeHtml(label)}</div>
    </div>
  `;
}

function renderSeverityTile(
  severity: keyof typeof SEVERITY,
  label: string,
  count: string,
  meaning: string,
  color: string,
  bg: string,
): string {
  return `
    <div class="stat-tile report-severity-tile" data-report-severity="${severity}" style="padding:var(--space-3);border-radius:var(--radius-md);background:${bg}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span class="report-severity-swatch" data-report-severity="${severity}" style="width:8px;height:8px;border-radius:50%;background:${color}"></span>
        <span class="report-severity-label" data-report-severity="${severity}" style="font-size:12px;font-weight:500;color:${color}">${escapeHtml(label)}</span>
      </div>
      <div style="font-size:24px;font-family:var(--font-heading)">${count}</div>
      <div style="font-size:11px;opacity:0.65;margin-top:4px">${escapeHtml(meaning)}</div>
    </div>
  `;
}

function renderCategoryTile(
  category: keyof typeof CATEGORY,
  label: string,
  count: string,
  color: string,
): string {
  return `
    <div class="stat-tile report-category-tile" data-report-category="${category}" style="padding:var(--space-3);border-radius:var(--radius-md);background:var(--color-surface)">
      <div data-report-category="${category}" style="font-size:11px;text-transform:uppercase;letter-spacing:0.02em;color:${color}">${escapeHtml(label)}</div>
      <div style="font-size:22px;font-family:var(--font-heading);margin-top:6px">${count}</div>
    </div>
  `;
}

export function renderStatistics(
  strings: ReportStrings,
  ordinal: number,
  language: ReportLanguage,
  findings: Finding[],
  manifest: AuditManifest,
  priorities?: readonly RenderedPriority[],
): string {
  const stats = computeStatistics(findings, manifest);
  const s = strings.statistics;
  const n = (value: number): string => formatNumber(value, language);

  const numberTiles = [
    renderNumberTile(
      n(stats.pagesScanned),
      pluralize(language, stats.pagesScanned, s.pagesAnalyzedSingular, s.pagesAnalyzedPlural),
    ),
    renderNumberTile(n(stats.totalFindings), s.findingsTileLabel, true),
    renderNumberTile(n(stats.accessibilityOccurrences), s.accessibilityOccurrencesTileLabel),
    // Issue #77: this used to render as "{pagesWithCritical}/{pagesScanned}",
    // which reads as a fraction out of the tile above - but pagesWithCritical
    // unions pageUrls across every critical finding regardless of pass or
    // category, while pagesScanned counts only pages with completed content
    // analysis (axe/render-diff/extended). A site-wide finding (e.g. a
    // Lighthouse resource issue, trade-off 30) can legitimately name more
    // pages than pagesScanned, producing a numerator bigger than the
    // denominator right next to it. Two correctly-distinct, non-nested
    // counts, so shown as a bare count rather than a fraction that implies
    // "N out of D".
    renderNumberTile(n(stats.pagesWithCritical), s.pagesWithCriticalTileLabel),
  ].join('');

  const severityMeanings = {
    critical: s.legendCriticalText,
    serious: s.legendSeriousText,
    moderate: s.legendModerateText,
    minor: s.legendMinorText,
  } as const;
  const severityCounts = {
    critical: stats.critical,
    serious: stats.serious,
    moderate: stats.moderate,
    minor: stats.minor,
  } as const;
  const severityLabels = strings.findingsAppendix.severityLabels;
  // item D7 (P4): a severity with zero findings still got a full tile
  // ("Modéré 0") reading as either a bug or as the tool having nothing to
  // say, when the honest signal is that severity's simple absence.
  // Filtered before render rather than hidden with CSS, so the grid
  // column count below can shrink to match what's actually shown.
  const nonZeroSeverities = (['critical', 'serious', 'moderate', 'minor'] as const).filter(
    (severity) => severityCounts[severity] > 0,
  );
  const severityTiles = nonZeroSeverities
    .map((severity) =>
      renderSeverityTile(
        severity,
        severityLabels[severity],
        n(severityCounts[severity]),
        severityMeanings[severity],
        SEVERITY[severity].color,
        SEVERITY[severity].bg,
      ),
    )
    .join('');

  // B9: category tiles sorted descending by count, not the fixed
  // CATEGORY_ORDER used elsewhere (appendix, citation eligibility) - the
  // largest bucket (often performance) was rendering fourth regardless of
  // its size, reading as an arbitrary layout choice to a client.
  const categoryLabels = strings.findingsAppendix.categoryLabels;
  // item D7 (P4): same zero-tile problem as severity above ("Rendu 0"),
  // and this report's own hasBelowThresholdRenderGap note (below) already
  // explains the more common reason rendering measures nothing rather
  // than counting on the tile itself to carry that explanation.
  const nonZeroCategories = [...CATEGORY_ORDER]
    .filter((category) => stats.categoryCounts[category] > 0)
    .sort((a, b) => stats.categoryCounts[b] - stats.categoryCounts[a]);
  const categoryTiles = nonZeroCategories
    .map((category) =>
      renderCategoryTile(
        category,
        categoryLabels[category],
        n(stats.categoryCounts[category]),
        CATEGORY[category].color,
      ),
    )
    .join('');

  const wcagFailCountText = fillTemplate(s.wcagFailingDescriptionTemplate, {
    criteria: `${n(stats.wcagCriteriaFailingCount)} ${pluralize(language, stats.wcagCriteriaFailingCount, s.wcagCriterionSingular, s.wcagCriterionPlural)}`,
    pages: `${n(stats.pagesWithWcagFailure)} ${pluralize(language, stats.pagesWithWcagFailure, s.pageSingular, s.pagePlural)}`,
  });

  // item 1.8 (La Corniche pass): the tile above now excludes heuristic
  // occurrences (statistics.ts's computeStatistics), so it sits beside
  // three genuinely hard counts without inflation - but silently
  // dropping a real 74-occurrence signal is its own kind of omission.
  // Stated explicitly, once, only when it actually excluded something.
  // Same fixed-spacer-when-absent pattern the render-diff footnote below
  // already uses (hasBelowThresholdRenderGap), so the gap before the next
  // heading stays constant whether or not the note renders.
  const heuristicOccurrencesNote =
    stats.accessibilityHeuristicOccurrences > 0
      ? `<p class="statistics-note statistics-note-occurrences">${escapeHtml(
          fillTemplate(s.heuristicOccurrencesExcludedNoteTemplate, {
            count: n(stats.accessibilityHeuristicOccurrences),
          }),
        )}</p>`
      : '';

  const driverTitles = criticalDriverRuleTitles(findings, language);
  const criticalDriverNote =
    driverTitles.length > 0
      ? `<p class="statistics-note">${escapeHtml(
          fillTemplate(s.criticalDriverNoteTemplate, { rules: driverTitles.join(', ') }),
        )}</p>`
      : '';

  // P1.2: this is the fact that determines who the client calls first -
  // computed off the already heuristic-excluded accessibilityOccurrences
  // total, same denominator the tile above shows.
  const thirdPartyOccurrencesNote =
    stats.thirdPartyAccessibilityOccurrences > 0 && stats.accessibilityOccurrences > 0
      ? `<p class="statistics-note">${escapeHtml(
          fillTemplate(s.thirdPartyOccurrencesNoteTemplate, {
            percent: Math.round(
              (stats.thirdPartyAccessibilityOccurrences / stats.accessibilityOccurrences) * 100,
            ),
          }),
        )}</p>`
      : '';
  const thirdPartyFrameNote =
    stats.confinedThirdPartyOccurrenceCount > 0
      ? `<p class="statistics-note">${escapeHtml(
          fillTemplate(
            pluralize(
              language,
              stats.confinedThirdPartyOccurrenceCount,
              s.thirdPartyFrameNoteSingularTemplate,
              s.thirdPartyFrameNotePluralTemplate,
            ),
            {
              count: n(stats.confinedThirdPartyOccurrenceCount),
            },
          ),
        )}</p>`
      : '';
  const ownership = priorities ? summarizePriorityOwnership(priorities, manifest) : undefined;
  const ownershipSentence = ownership
    ? renderPriorityOwnershipSentence(ownership, s.priorityOwnership, language)
    : undefined;
  const priorityOwnershipNote = ownershipSentence
    ? `<p class="statistics-note">${escapeHtml(ownershipSentence)}</p>`
    : '';

  // Issue #307: the heuristic note used to come first and so filled the
  // left column, directly under the distinct-findings tile, where "this
  // figure excludes 260 occurrences" read as a claim about the findings
  // count. It now names the count it qualifies and sits in the right
  // column, under the accessibility-occurrences tile it actually excludes
  // from (.statistics-note-occurrences in nocturne.css).
  const footnotes =
    heuristicOccurrencesNote ||
    criticalDriverNote ||
    thirdPartyOccurrencesNote ||
    thirdPartyFrameNote ||
    priorityOwnershipNote
      ? `<div class="statistics-notes">${criticalDriverNote}${heuristicOccurrencesNote}${thirdPartyOccurrencesNote}${thirdPartyFrameNote}${priorityOwnershipNote}</div>`
      : '<div class="statistics-notes"></div>';

  return sheet(
    `
    ${renderSheetHeader(ordinal, s.eyebrow, s.heading, 'var(--space-6)')}
    <div class="stat-tile-row statistics-number-grid">
      ${numberTiles}
    </div>
    ${footnotes}
    <h5 class="statistics-breakdown-heading">${escapeHtml(s.severityBreakdownHeading)}</h5>
    <div class="stat-tile-row" style="display:grid;grid-template-columns:repeat(${nonZeroSeverities.length},1fr);gap:var(--space-4);margin-bottom:var(--space-8)">
      ${severityTiles}
    </div>
    <h5 class="statistics-breakdown-heading">${escapeHtml(s.categoryBreakdownHeading)}</h5>
    <div class="stat-tile-row" style="display:grid;grid-template-columns:repeat(${nonZeroCategories.length},1fr);gap:var(--space-4);margin-bottom:var(--space-3)">
      ${categoryTiles}
    </div>
    ${stats.hasBelowThresholdRenderGap ? `<p style="font-size:11px;opacity:0.55;margin-bottom:var(--space-8)">${escapeHtml(fillTemplate(s.belowThresholdRenderGapNote, { threshold: RENDER_DIFF_EMISSION_THRESHOLD_PERCENT }))}</p>` : '<div style="margin-bottom:var(--space-8)"></div>'}
    <div class="hr"></div>
    <h5 class="statistics-breakdown-heading">${escapeHtml(s.wcagFailingHeading)}</h5>
    <p style="font-size:13.5px;opacity:0.85">${escapeHtml(wcagFailCountText)}</p>
  `,
    'statistics-sheet',
    'section-03',
  );
}
