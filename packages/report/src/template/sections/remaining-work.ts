import type {
  Finding,
  FindingCategory,
  FindingElement,
  ReportLanguage,
  Severity,
} from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import {
  escapeCopy,
  escapeHtml,
  fillTemplate,
  formatCappedFindingIdLinks,
  formatNumber,
  pluralize,
  renderSheetHeader,
  sheet,
} from '../html-utils.js';
import { sectionTitle } from '../section-registry.js';
import { CATEGORY, CATEGORY_ORDER, SEVERITY } from '../design-tokens.js';
import { resolveFindingDisplayLabel } from '../rule-translations.js';
import { interpolateSnippet, remediationFor, snippetFor } from '../remediation/index.js';
import { renderFixSnippet } from '../remediation/render-fix-snippet.js';
import { accessibilityStatementGuidance } from '../accessibility-statement-guidance.js';
import { selectRenderedThemes } from './themes.js';
import { actionLevelForRemainingSeverity, type RenderedPriority } from '../rendered-priorities.js';

/**
 * "Reste a traiter": the findings no ranked priority covers, grouped by area
 * and by rule, each with fixed remediation copy.
 *
 * The 2026-08 Palais Gallien review, retained in Git history, found that a
 * real report ranked seven priorities and left the other 91 findings as annex
 * rows with no guidance at all. The annex says what and where; nothing said
 * what to do.
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
  /** Plan 041 Part A: the first element recorded on this rule's first
   *  finding, if any, used to interpolate a `fixed` fix snippet. Undefined
   *  for a site-wide rule whose findings carry no elements. */
  representativeElement: FindingElement | undefined;
}

/** Findings that no rendered priority accounts for.
 *
 *  Diverted findings are not filtered here: the caller passes the same
 *  findings array every other section reads, so this section and Observations
 *  can never disagree about what was withheld from the model (trade-off 8's
 *  single-implementation rule).
 *
 *  Issue #293: the priorities passed here carry every finding of each rule
 *  they name (rendered-priorities.ts expands the themes), so excluding by
 *  findingId can no longer split one rule between a priority and this
 *  section with two different counts for the same defect. */
export function selectRemainingFindings(
  analysis: StoredAnalysis,
  findings: readonly Finding[],
  priorities?: readonly RenderedPriority[],
): Finding[] {
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const covered = new Set(
    priorities
      ? priorities.flatMap((priority) => priority.findings.map((finding) => finding.findingId))
      : selectRenderedThemes(analysis.themes, findingsById).flatMap((theme) => theme.findingIds),
  );
  return findings.filter((finding) => !covered.has(finding.findingId));
}

function groupByRule(
  findings: readonly Finding[],
  language: ReportLanguage,
  /** Issue #291: the analysed (visited-scope) page set every page figure is
   *  confined to, threaded from render-html.ts. Findings record every real
   *  URL - language variants kept after a translation-cluster merge, and
   *  origin-level findings citing discovered-but-not-scanned pages - so the
   *  raw union can exceed the analysed-page total the reader was given (a
   *  real report claimed 206 pages out of 140). Undefined only in callers
   *  that predate the scope (focused tests); those keep the raw union. */
  scopePageUrls?: ReadonlySet<string>,
): RuleBlock[] {
  const byRule = new Map<string, Finding[]>();
  for (const finding of findings) {
    byRule.set(finding.ruleId, [...(byRule.get(finding.ruleId) ?? []), finding]);
  }

  return [...byRule.entries()]
    .map(([ruleId, group]): RuleBlock => {
      const first = group[0]!;
      return {
        ruleId,
        title: resolveFindingDisplayLabel(language, ruleId, first.title),
        severity: group.reduce<Severity>(
          (worst, f) => (SEVERITY_RANK[f.severity] < SEVERITY_RANK[worst] ? f.severity : worst),
          'minor',
        ),
        findingIds: group.map((f) => f.findingId),
        representativeElement: first.elements[0],
        occurrences: group.reduce((sum, f) => sum + f.occurrences, 0),
        pages: new Set(
          group
            .flatMap((f) => f.pageUrls)
            .filter((url) => scopePageUrls === undefined || scopePageUrls.has(url)),
        ).size,
      };
    })
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        b.occurrences - a.occurrences ||
        a.ruleId.localeCompare(b.ruleId),
    );
}

function renderRuleBlock(
  strings: ReportStrings,
  language: ReportLanguage,
  block: RuleBlock,
  analysis: StoredAnalysis,
): string {
  const r = strings.remainingWork;
  const counts = [
    `${formatNumber(block.findingIds.length, language)} ${pluralize(language, block.findingIds.length, r.findingSingular, r.findingPlural)}`,
    `${formatNumber(block.occurrences, language)} ${pluralize(language, block.occurrences, r.occurrenceSingular, r.occurrencePlural)}`,
    `${formatNumber(block.pages, language)} ${pluralize(language, block.pages, r.pageSingular, r.pagePlural)}`,
  ].join(' · ');

  const remediation =
    block.ruleId === 'accessibility-statement-missing'
      ? accessibilityStatementGuidance(strings, analysis.obligationAssessment).recommendation
      : remediationFor(block.ruleId, language);
  const actionLine =
    remediation === undefined
      ? ''
      : `<p class="remaining-action" style="font-size:13px;margin-top:4px;max-width:var(--measure-prose)">${escapeCopy(remediation, language)}</p>`;

  // Plan 041 Part A: same snippet computation as rendered-priorities.ts,
  // duplicated rather than shared because the two callers start from
  // different shapes (a RuleBlock here, a Finding list there) and the
  // computation itself is a few lines; renderFixSnippet is the part that
  // must not drift, and it is shared.
  const fixSnippet = snippetFor(block.ruleId, language);
  const snippetBlock =
    fixSnippet === undefined || fixSnippet.kind === 'not-applicable'
      ? ''
      : renderFixSnippet(
          {
            kind: fixSnippet.kind,
            rendered:
              fixSnippet.kind === 'fixed'
                ? interpolateSnippet(fixSnippet, block.representativeElement ?? {})
                : fixSnippet.template,
          },
          strings.remainingWork,
        );

  // block.severity was already computed (worst-of-group) for sort order
  // but never shown, so every remaining item looked equally urgent
  // regardless of its real severity - reusing the same badge colours
  // the annex and stats tiles already use, not a new palette.
  const severityColor = SEVERITY[block.severity];
  const severityBadge = `<span style="display:inline-block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.02em;padding:1px 6px;border-radius:4px;margin-left:6px;color:${severityColor.color};background:${severityColor.bg}">${escapeHtml(strings.findingsAppendix.severityLabels[block.severity])}</span>`;
  const actionLevel = actionLevelForRemainingSeverity(block.severity);
  const actionLevelBadge = `<span class="tag" style="margin-left:6px">${escapeHtml(strings.themes.actionLevelLabels[actionLevel])}</span>`;

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
      <div style="font-size:13.5px;font-weight:500">${escapeHtml(block.title)}${actionLevelBadge}${severityBadge}</div>
      <div class="text-muted" style="font-size:11px;margin-top:2px">${escapeHtml(counts)}</div>
      ${actionLine}
      ${snippetBlock}
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
  priorities?: readonly RenderedPriority[],
  /** Issue #291: the analysed (visited-scope) page set the per-rule page
   *  counts are confined to. See groupByRule. */
  scopePageUrls?: ReadonlySet<string>,
): string {
  const r = strings.remainingWork;
  const remaining = selectRemainingFindings(analysis, findings, priorities);

  if (remaining.length === 0) {
    return sheet(
      `
        ${renderSheetHeader(ordinal, r.eyebrow, r.heading)}
        <p style="font-size:13.5px;opacity:0.85;max-width:var(--measure-prose)">${escapeHtml(r.nothingRemaining)}</p>
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
      const blocks = groupByRule(byCategory.get(category) ?? [], language, scopePageUrls);
      const [firstBlock, ...restBlocks] = blocks;
      // The heading and its first rule block are wrapped in one
      // break-inside: avoid unit (paged.css's `.remaining-category-head`,
      // overriding the generic h1-h6 break-after: avoid rule for this
      // heading specifically) rather than relying on that generic rule
      // directly on the h5. On a real Lagnonu English report, the
      // combination of that generic rule with this section's longer
      // remediation copy put Paged.js's iterative break-after solver into
      // its own "Layout repeated" infinite-loop guard (pdf.ts) whenever a
      // category landed at a page boundary it could not resolve -
      // confirmed by bisecting the generated HTML down to this exact
      // heading/content pairing. A bounded atomic wrapper (one heading
      // plus one small rule block, "bounded by construction" per the
      // D1 stat-tile reasoning) keeps the same "never orphan the heading"
      // intent without the iterative mechanism that looped.
      return `
        <div class="remaining-category" style="margin-bottom:var(--space-8)">
          <div class="remaining-category-head">
            <h5 style="color:${CATEGORY[category].color}">${escapeHtml(strings.findingsAppendix.categoryLabels[category])}</h5>
            ${firstBlock ? renderRuleBlock(strings, language, firstBlock, analysis) : ''}
          </div>
          ${restBlocks.map((block) => renderRuleBlock(strings, language, block, analysis)).join('')}
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
      <p style="font-size:13.5px;opacity:0.85;max-width:var(--measure-prose);margin-bottom:var(--space-3)">${escapeHtml(intro)}</p>
      <p class="text-muted" style="font-size:11.5px;max-width:var(--measure-prose);margin-bottom:var(--space-6)">${escapeHtml(r.scopeNote)}</p>
      ${categoryBlocks}
    `,
    '',
    'section-05b',
  );
}
