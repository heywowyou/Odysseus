import type { AuditManifest, Finding, FindingCategory, ReportLanguage, Severity } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import {
  escapeHtml,
  fillTemplate,
  formatCappedFindingIdLinks,
  formatNumber,
  pluralize,
  renderSheetHeader,
  sheet,
} from '../html-utils.js';
import { sectionTitle } from '../section-registry.js';
import { CATEGORY, CATEGORY_ORDER } from '../design-tokens.js';
import { RULE_TRANSLATIONS_FR } from '../rule-translations.js';
import { remediationFor } from '../remediation/index.js';
import { selectRenderedThemes } from './themes.js';

/**
 * "Reste a traiter": the findings no ranked priority covers, grouped by area
 * and by rule, each with fixed remediation copy.
 *
 * archive/report-feedback-palais-gallien-v2.md item 3.2: a real report ranked
 * seven priorities and left the other 91 findings as annex rows with no
 * guidance at all. The annex says what and where; nothing said what to do.
 *
 * Entirely deterministic, on the same reasoning as legalRelevance (CLAUDE.md
 * trade-off 8) and the reference-stat citations (trade-off 16): the copy is
 * code-owned and reviewed in a diff, the model has no field for it, and it is
 * selected by the finding's own rule id rather than by anything the model
 * labelled. Nothing here can introduce a finding, restate one differently, or
 * disagree with the annex, because it reads the same findings array every
 * other section does.
 *
 * A rule with no reviewed remediation copy renders its group with the counts
 * and finding references and no action line, rather than a guess. That case
 * is also a build failure (remediation/remediation.test.ts) whenever the rule
 * appears in the committed reference audits, so in practice it means a rule
 * observed for the first time on a live client site: the client still gets
 * the finding, just without an instruction this repo has not reviewed.
 */

const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

interface RuleBlock {
  ruleId: string;
  title: string;
  severity: Severity;
  findingIds: string[];
  occurrences: number;
  pages: number;
}

/** Findings that no rendered priority accounts for.
 *
 *  Diverted findings are not filtered here: the caller passes the same
 *  findings array every other section reads, so this section and Observations
 *  can never disagree about what was withheld from the model (trade-off 8's
 *  single-implementation rule). */
export function selectRemainingFindings(analysis: StoredAnalysis, findings: readonly Finding[]): Finding[] {
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const covered = new Set(
    selectRenderedThemes(analysis.themes, findingsById).flatMap((theme) => theme.findingIds),
  );
  return findings.filter((finding) => !covered.has(finding.findingId));
}

function groupByRule(findings: readonly Finding[], language: ReportLanguage): RuleBlock[] {
  const byRule = new Map<string, Finding[]>();
  for (const finding of findings) {
    byRule.set(finding.ruleId, [...(byRule.get(finding.ruleId) ?? []), finding]);
  }

  return [...byRule.entries()]
    .map(([ruleId, group]): RuleBlock => {
      const first = group[0]!;
      const translation = language === 'fr' ? RULE_TRANSLATIONS_FR[ruleId] : undefined;
      return {
        ruleId,
        title: translation?.label ?? first.title,
        severity: group.reduce<Severity>(
          (worst, f) => (SEVERITY_RANK[f.severity] < SEVERITY_RANK[worst] ? f.severity : worst),
          'minor',
        ),
        findingIds: group.map((f) => f.findingId),
        occurrences: group.reduce((sum, f) => sum + f.occurrences, 0),
        pages: new Set(group.flatMap((f) => f.pageUrls)).size,
      };
    })
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        b.occurrences - a.occurrences ||
        a.ruleId.localeCompare(b.ruleId),
    );
}

function renderRuleBlock(strings: ReportStrings, language: ReportLanguage, block: RuleBlock): string {
  const r = strings.remainingWork;
  const counts = [
    `${formatNumber(block.findingIds.length, language)} ${pluralize(block.findingIds.length, r.findingSingular, r.findingPlural)}`,
    `${formatNumber(block.occurrences, language)} ${pluralize(block.occurrences, r.occurrenceSingular, r.occurrencePlural)}`,
    `${formatNumber(block.pages, language)} ${pluralize(block.pages, r.pageSingular, r.pagePlural)}`,
  ].join(' · ');

  const remediation = remediationFor(block.ruleId, language);
  const actionLine =
    remediation === undefined
      ? ''
      : `<p style="font-size:13px;margin-top:4px;max-width:70ch">${escapeHtml(remediation)}</p>`;

  // The ids are already anchor markup while the label around them is plain
  // text, so the template is split on its own placeholder and each half is
  // escaped separately. Splitting the filled string on whitespace was tried
  // and is wrong: the label itself contains spaces, so a template reading
  // "Constats : {findingIds}" rendered as "Constats", then the links, then
  // a stray colon.
  const [refsPrefix = '', refsSuffix = ''] = r.findingRefsTemplate.split('{findingIds}');
  const refs =
    escapeHtml(refsPrefix) +
    formatCappedFindingIdLinks(block.findingIds, language, strings.findingsAppendix) +
    escapeHtml(refsSuffix);

  return `
    <div class="remaining-rule" style="margin-bottom:var(--space-3)">
      <div style="font-size:13.5px;font-weight:500">${escapeHtml(block.title)}</div>
      <div class="text-muted" style="font-size:11px;margin-top:2px">${escapeHtml(counts)}</div>
      ${actionLine}
      <div class="text-muted" style="font-size:11px;margin-top:4px">${refs}</div>
    </div>
  `;
}

export function renderRemainingWork(
  strings: ReportStrings,
  ordinal: number,
  language: ReportLanguage,
  analysis: StoredAnalysis,
  findings: readonly Finding[],
): string {
  const r = strings.remainingWork;
  const remaining = selectRemainingFindings(analysis, findings);

  if (remaining.length === 0) {
    return sheet(
      `
        ${renderSheetHeader(ordinal, r.eyebrow, r.heading)}
        <p style="font-size:13.5px;opacity:0.85;max-width:64ch">${escapeHtml(r.nothingRemaining)}</p>
      `,
      '',
      'section-05b',
    );
  }

  const byCategory = new Map<FindingCategory, Finding[]>();
  for (const finding of remaining) {
    byCategory.set(finding.category, [...(byCategory.get(finding.category) ?? []), finding]);
  }

  const categoryBlocks = CATEGORY_ORDER.filter((category) => byCategory.has(category))
    .map((category) => {
      const blocks = groupByRule(byCategory.get(category) ?? [], language);
      return `
        <div class="remaining-category" style="margin-bottom:var(--space-6)">
          <h5 style="color:${CATEGORY[category].color}">${escapeHtml(strings.findingsAppendix.categoryLabels[category])}</h5>
          ${blocks.map((block) => renderRuleBlock(strings, language, block)).join('')}
        </div>
      `;
    })
    .join('');

  const intro = fillTemplate(r.introTemplate, {
    count: formatNumber(remaining.length, language),
    prioritiesSection: sectionTitle('section-04', strings),
  });

  return sheet(
    `
      ${renderSheetHeader(ordinal, r.eyebrow, r.heading)}
      <p style="font-size:13.5px;opacity:0.85;max-width:64ch;margin-bottom:var(--space-3)">${escapeHtml(intro)}</p>
      <p class="text-muted" style="font-size:11.5px;max-width:64ch;margin-bottom:var(--space-6)">${escapeHtml(r.scopeNote)}</p>
      ${categoryBlocks}
    `,
    '',
    'section-05b',
  );
}
