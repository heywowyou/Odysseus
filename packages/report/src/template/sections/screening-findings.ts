import type { Finding, ReportLanguage } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatNumber, renderSectionHeader } from '../html-utils.js';
import { renderSeverityBadge } from '../severity-badge.js';
import { groupAppendix, type RuleGroup } from '../appendix-grouping.js';

/**
 * Screening-tier-only section (milestone-8-scope-addendum.md 1.6): names
 * and counts critical/serious findings without the page/selector detail
 * findings-appendix.ts shows in the full audit, plus the five extended
 * accessibility pass rule IDs reduced to a bare per-rule count. Tier is
 * a report-rendering decision, not a detection-time one (addendum
 * section 2), so this list is duplicated from severity.ts's
 * CUSTOM_CHECK_SEVERITY table here rather than imported from core - the
 * same "small duplicated table near a boundary, documented" precedent
 * methodology.ts already uses for EFFECTIF_BAND_LABELS_EN.
 */
const EXTENDED_ACCESSIBILITY_PASS_RULE_IDS = [
  'keyboard-trap',
  'focus-order-mismatch',
  'form-error-not-associated',
  'video-missing-captions',
  'alt-text-quality-heuristic',
] as const;

type ExtendedPassRuleId = (typeof EXTENDED_ACCESSIBILITY_PASS_RULE_IDS)[number];

const EXTENDED_PASS_LABEL_KEY: Record<
  ExtendedPassRuleId,
  keyof ReportStrings['screeningFindings']['extendedPassRuleLabels']
> = {
  'keyboard-trap': 'keyboardTrap',
  'focus-order-mismatch': 'focusOrderMismatch',
  'form-error-not-associated': 'formErrorNotAssociated',
  'video-missing-captions': 'videoMissingCaptions',
  'alt-text-quality-heuristic': 'altTextQualityHeuristic',
};

function isExtendedPassRuleId(ruleId: string): ruleId is ExtendedPassRuleId {
  return (EXTENDED_ACCESSIBILITY_PASS_RULE_IDS as readonly string[]).includes(ruleId);
}

/** Deliberately no sub-table of findingId/selector rows here, unlike
 *  findings-appendix.ts's renderRuleGroup - that detail is exactly what
 *  the full audit tier is withheld-from-screening on (addendum's
 *  business reasoning: knowing a problem exists is not the same as
 *  being able to act on it without paying for the detail). */
function renderTopFindingRow(strings: ReportStrings, language: ReportLanguage, group: RuleGroup): string {
  const a = strings.findingsAppendix;
  const representativeTitle = group.findings[0]?.title ?? group.ruleId;
  const parts = [
    `${formatNumber(group.totalOccurrences, language)} ${group.totalOccurrences === 1 ? a.occurrenceSingular : a.occurrencePlural}`,
    `${a.upToLabel} ${formatNumber(group.maxPages, language)} ${group.maxPages === 1 ? a.pageSingular : a.pagePlural}`,
  ];

  return `
    <div class="rule-group keep">
      <div class="rule-head">
        ${renderSeverityBadge(strings, group.severity)}
        <span class="rule-title">${escapeHtml(representativeTitle)}</span>
        <span class="mono rule-code">${escapeHtml(group.ruleId)}</span>
        <span class="rule-sum">${escapeHtml(parts.join(' · '))}</span>
      </div>
    </div>
  `;
}

function renderExtendedPassCounts(
  strings: ReportStrings,
  language: ReportLanguage,
  findings: readonly Finding[],
): string {
  const s = strings.screeningFindings;

  const rows = EXTENDED_ACCESSIBILITY_PASS_RULE_IDS.map((ruleId) => {
    const matches = findings.filter((f) => f.ruleId === ruleId);
    if (matches.length === 0) return null;
    const count = matches.reduce((sum, f) => sum + f.occurrences, 0);
    const labelPair = s.extendedPassRuleLabels[EXTENDED_PASS_LABEL_KEY[ruleId]];
    const label = count === 1 ? labelPair.singular : labelPair.plural;
    const text = fillTemplate(s.extendedPassCountTemplate, { count: formatNumber(count, language), label });
    return `<li>${escapeHtml(text)}</li>`;
  }).filter((row): row is string => row !== null);

  const body =
    rows.length > 0
      ? `<ul class="actions">${rows.join('')}</ul>`
      : `<p class="note">${escapeHtml(s.extendedPassNoneFoundNote)}</p>`;

  return `
    <h3 style="margin-top:6mm">${escapeHtml(s.extendedPassHeading)}</h3>
    <p class="intro">${escapeHtml(s.extendedPassIntro)}</p>
    ${body}
  `;
}

export function renderScreeningFindings(
  strings: ReportStrings,
  language: ReportLanguage,
  findings: Finding[],
): string {
  const s = strings.screeningFindings;

  const topFindings = findings.filter(
    (finding) =>
      (finding.severity === 'critical' || finding.severity === 'serious') &&
      !isExtendedPassRuleId(finding.ruleId),
  );
  const groups = groupAppendix(topFindings);
  const groupBlocks = groups.map((group) => renderTopFindingRow(strings, language, group)).join('');
  const topBody =
    groups.length > 0
      ? `${groupBlocks}<p class="note">${escapeHtml(s.upgradeNote)}</p>`
      : `<p class="note">${escapeHtml(s.noneFoundNote)}</p>`;

  return `
    <section class="new-page">
      ${renderSectionHeader(s.eyebrow, s.heading)}
      <p class="intro">${escapeHtml(s.intro)}</p>
      ${topBody}
      ${renderExtendedPassCounts(strings, language, findings)}
    </section>
  `;
}
