import {
  RENDER_DIFF_EMISSION_THRESHOLD_PERCENT,
  type AuditManifest,
  type Finding,
  type ReportLanguage,
} from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';
import { CATEGORY, CATEGORY_ORDER, SEVERITY } from '../design-tokens.js';
import { type RenderedPriority, summarizePriorityOwnership } from '../rendered-priorities.js';
import { computeStatistics } from '../statistics.js';
import { RULE_TRANSLATIONS_FR } from '../rule-translations.js';
import { buildCoverageDisclosure } from '../coverage-disclosure.js';

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

  return criticalRuleIds.map((ruleId) => {
    if (language === 'fr') {
      const translation = RULE_TRANSLATIONS_FR[ruleId];
      if (translation) return translation.label;
    }
    return findings.find((f) => f.ruleId === ruleId)?.title ?? ruleId;
  });
}

/** Doc §3 section 03 cap: the 4 number tiles are fixed (report.reference.
 *  html's numberTiles, the same first 4 metrics the pre-redesign 10-tile
 *  layout led with) and always render. Severity and category tiles are
 *  not fixed at 4 any more (item D7, P4): a severity or category with
 *  zero findings is dropped from render entirely rather than shown as an
 *  empty tile, so their grids can have anywhere from 1 to 4 (severity) or
 *  1 to CATEGORY_ORDER.length (category) tiles depending on what the scan
 *  actually found. */
function renderNumberTile(value: string, label: string): string {
  return `
    <div class="stat-tile" style="padding:var(--space-3);background:var(--color-surface);border-radius:var(--radius-md)">
      <div style="font-size:28px;font-family:var(--font-heading);font-weight:500">${value}</div>
      <div style="font-size:11.5px;opacity:0.65;margin-top:4px">${escapeHtml(label)}</div>
    </div>
  `;
}

function renderSeverityTile(
  label: string,
  count: string,
  meaning: string,
  color: string,
  bg: string,
): string {
  return `
    <div class="stat-tile" style="padding:var(--space-3);border-radius:var(--radius-md);background:${bg}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${color}"></span>
        <span style="font-size:12px;font-weight:500;color:${color}">${escapeHtml(label)}</span>
      </div>
      <div style="font-size:24px;font-family:var(--font-heading)">${count}</div>
      <div style="font-size:11px;opacity:0.65;margin-top:4px">${escapeHtml(meaning)}</div>
    </div>
  `;
}

function renderCategoryTile(label: string, count: string, color: string): string {
  return `
    <div class="stat-tile" style="padding:var(--space-3);border-radius:var(--radius-md);background:var(--color-surface)">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.02em;color:${color}">${escapeHtml(label)}</div>
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
  const coverage = buildCoverageDisclosure(strings, manifest, language);

  const numberTiles = [
    renderNumberTile(n(stats.pagesScanned), s.pagesTileLabel),
    renderNumberTile(n(stats.totalFindings), s.findingsTileLabel),
    renderNumberTile(n(stats.accessibilityOccurrences), s.accessibilityOccurrencesTileLabel),
    renderNumberTile(
      `${n(stats.pagesWithCritical)}/${n(stats.pagesScanned)}`,
      s.pagesWithCriticalTileLabel,
    ),
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
        categoryLabels[category],
        n(stats.categoryCounts[category]),
        CATEGORY[category].color,
      ),
    )
    .join('');

  const wcagFailText = fillTemplate(s.wcagFailingDescriptionTemplate, {
    pages: n(stats.pagesWithWcagFailure),
  });
  const wcagFailCountText = `${n(stats.wcagCriteriaFailingCount)} ${wcagFailText}`;

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
      ? `<p style="font-size:11px;opacity:0.55;margin-bottom:4px">${escapeHtml(
          fillTemplate(s.heuristicOccurrencesExcludedNoteTemplate, {
            count: n(stats.accessibilityHeuristicOccurrences),
          }),
        )}</p>`
      : '';

  const driverTitles = criticalDriverRuleTitles(findings, language);
  const criticalDriverNote =
    driverTitles.length > 0
      ? `<p style="font-size:11px;opacity:0.55;margin-bottom:4px">${escapeHtml(
          fillTemplate(s.criticalDriverNoteTemplate, { rules: driverTitles.join(', ') }),
        )}</p>`
      : '';

  // P1.2: this is the fact that determines who the client calls first -
  // computed off the already heuristic-excluded accessibilityOccurrences
  // total, same denominator the tile above shows.
  const thirdPartyOccurrencesNote =
    stats.thirdPartyAccessibilityOccurrences > 0 && stats.accessibilityOccurrences > 0
      ? `<p style="font-size:11px;opacity:0.55;margin-bottom:4px">${escapeHtml(
          fillTemplate(s.thirdPartyOccurrencesNoteTemplate, {
            percent: Math.round(
              (stats.thirdPartyAccessibilityOccurrences / stats.accessibilityOccurrences) * 100,
            ),
          }),
        )}</p>`
      : '';
  const ownership = priorities ? summarizePriorityOwnership(priorities) : undefined;
  const priorityOwnershipNote = ownership
    ? `<p style="font-size:11px;opacity:0.55;margin-bottom:4px">${escapeHtml(
        fillTemplate(s.priorityOwnershipTemplate, {
          firstParty: n(ownership['first-party-action']),
          thirdParty: n(ownership['third-party-escalation']),
          verifyIntent: n(ownership['verify-intent']),
        }),
      )}</p>`
    : '';

  const footnotes =
    heuristicOccurrencesNote ||
    criticalDriverNote ||
    thirdPartyOccurrencesNote ||
    priorityOwnershipNote
      ? `<div style="margin-bottom:var(--space-3)">${heuristicOccurrencesNote}${criticalDriverNote}${thirdPartyOccurrencesNote}${priorityOwnershipNote}</div>`
      : '<div style="margin-bottom:var(--space-3)"></div>';

  return sheet(
    `
    ${renderSheetHeader(ordinal, s.eyebrow, s.heading, 'var(--space-6)')}
    <p style="font-size:12px;opacity:0.65;margin-bottom:var(--space-3)">${escapeHtml(
      [coverage.summary, ...coverage.details].join(' '),
    )}</p>
    <div class="stat-tile-row" style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-4);margin-bottom:var(--space-3)">
      ${numberTiles}
    </div>
    ${footnotes}
    <h5>${escapeHtml(s.severityBreakdownHeading)}</h5>
    <div class="stat-tile-row" style="display:grid;grid-template-columns:repeat(${nonZeroSeverities.length},1fr);gap:var(--space-4);margin-bottom:var(--space-8)">
      ${severityTiles}
    </div>
    <h5>${escapeHtml(s.categoryBreakdownHeading)}</h5>
    <div class="stat-tile-row" style="display:grid;grid-template-columns:repeat(${nonZeroCategories.length},1fr);gap:var(--space-4);margin-bottom:var(--space-3)">
      ${categoryTiles}
    </div>
    ${stats.hasBelowThresholdRenderGap ? `<p style="font-size:11px;opacity:0.55;margin-bottom:var(--space-8)">${escapeHtml(fillTemplate(s.belowThresholdRenderGapNote, { threshold: RENDER_DIFF_EMISSION_THRESHOLD_PERCENT }))}</p>` : '<div style="margin-bottom:var(--space-8)"></div>'}
    <div class="hr"></div>
    <h5>${escapeHtml(s.wcagFailingHeading)}</h5>
    <p style="font-size:13.5px;opacity:0.85">${escapeHtml(wcagFailCountText)}</p>
  `,
    '',
    'section-03',
  );
}
