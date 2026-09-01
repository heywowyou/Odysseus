import {
  LCEN_MENTIONS_LEGALES_RULE_ID,
  SEVERITY_ORDER,
  type AuditManifest,
  type Finding,
  type ReportLanguage,
  type Theme,
} from '@odysseus/core';
import { buildMissingPercentIndex, classifyDiversion } from '@odysseus/llm';
import { remediationFor } from './remediation/index.js';
import { resolveFindingDisplayLabel } from './rule-translations.js';
import { isThirdPartyFinding } from './third-party-attribution.js';

export const MAX_RENDERED_THEMES = 6;

export type PriorityOwnership = 'first-party-action' | 'third-party-escalation' | 'verify-intent';

export interface PriorityRemediation {
  ruleId: string;
  text: string;
}

/** Plan 018 step 6: the deterministic evidence one priority is built from,
 *  computed once here so every priority surface (theme card, and any future
 *  consumer) reads the same summary instead of each template re-deriving
 *  rule selection. */
export interface PriorityEvidence {
  /** Highest severity first, then the lexicographically smallest findingId
   *  as the tie-break (see buildPriorityEvidence). */
  representativeFinding: Finding;
  /** The representative finding's display label, resolved through the same
   *  shared helper the findings appendix uses: reviewed French rule label
   *  in a French report, scanner title in English. */
  representativeLabel: string;
  /** First URL of the deduplicated, lexicographically sorted union of every
   *  finding's page URLs in this priority. Undefined only for zero-page
   *  evidence: no finding in the priority carries a page URL at all. */
  representativePageUrl: string | undefined;
  /** Exact count of distinct pages across the whole priority. */
  uniquePageCount: number;
  /** Exact sum of every finding's occurrence count in this priority. */
  occurrenceCount: number;
}

export interface RenderedPriority {
  theme: Theme;
  /** Contiguous client-facing position. The model rank remains on theme. */
  displayRank: number;
  findings: Finding[];
  ownershipCounts: Record<PriorityOwnership, number>;
  remediations: PriorityRemediation[];
  evidence: PriorityEvidence;
}

function selectThemes(
  themes: readonly Theme[],
  findingsById: ReadonlyMap<string, Finding>,
): Theme[] {
  const withResolvedFindings = themes.filter((theme) =>
    theme.findingIds.some((id) => findingsById.has(id)),
  );
  const byRank = [...withResolvedFindings].sort((a, b) => a.priorityRank - b.priorityRank);
  const selected = byRank.slice(0, MAX_RENDERED_THEMES);
  if (selected.length < MAX_RENDERED_THEMES) return selected;

  const themeFindings = (theme: Theme): Finding[] =>
    theme.findingIds.map((id) => findingsById.get(id)).filter((f): f is Finding => f !== undefined);
  const criticalCategories = new Set<string>();
  for (const theme of byRank) {
    for (const finding of themeFindings(theme)) {
      if (finding.severity === 'critical') criticalCategories.add(finding.category);
    }
  }

  const selectedRanks = new Set(selected.map((theme) => theme.priorityRank));
  for (const category of criticalCategories) {
    if (
      selected.some((theme) =>
        themeFindings(theme).some(
          (finding) => finding.category === category && finding.severity === 'critical',
        ),
      )
    )
      continue;
    const promoted = byRank.find(
      (theme) =>
        !selectedRanks.has(theme.priorityRank) &&
        themeFindings(theme).some(
          (finding) => finding.category === category && finding.severity === 'critical',
        ),
    );
    if (!promoted) continue;

    for (let index = selected.length - 1; index >= 0; index -= 1) {
      const candidate = selected[index]!;
      const coveredCategories = [...criticalCategories].filter((criticalCategory) =>
        themeFindings(candidate).some(
          (finding) => finding.category === criticalCategory && finding.severity === 'critical',
        ),
      );
      const isOnlyRepresentative = coveredCategories.some(
        (criticalCategory) =>
          selected.filter((theme) =>
            themeFindings(theme).some(
              (finding) => finding.category === criticalCategory && finding.severity === 'critical',
            ),
          ).length === 1,
      );
      if (isOnlyRepresentative) continue;
      selectedRanks.delete(candidate.priorityRank);
      selected.splice(index, 1);
      break;
    }
    selected.push(promoted);
    selectedRanks.add(promoted.priorityRank);
  }
  return selected.sort((a, b) => a.priorityRank - b.priorityRank);
}

export function classifyPriorityOwnership(
  finding: Finding,
  manifest: AuditManifest,
): PriorityOwnership {
  const diversion = classifyDiversion(finding, buildMissingPercentIndex(manifest));
  if (diversion === 'legal' || diversion === 'regime-dependent') return 'verify-intent';
  if (diversion === 'wrapper' || isThirdPartyFinding(finding)) return 'third-party-escalation';
  return 'first-party-action';
}

/** Plan 018 step 6: builds the deterministic evidence summary for one
 *  priority. Selection rules, stated in full so callers can rely on them
 *  without re-deriving any of this in template code:
 *
 *  - representative finding: highest severity first (SEVERITY_ORDER), then
 *    the lexicographically smallest findingId as the tie-break, so two
 *    render runs over the same stored analysis can never disagree;
 *  - representative page: the priority's page URLs deduplicated, sorted
 *    lexicographically, first entry. Lexicographic order rather than the
 *    stored array order because pageUrls ordering is an artifact of scan
 *    timing, not something a reader should see wobble between renders;
 *  - counts: the exact distinct-page count and the exact occurrence sum
 *    across every finding in the priority, never an approximation. */
function buildPriorityEvidence(
  findings: readonly Finding[],
  language: ReportLanguage,
): PriorityEvidence {
  if (findings.length === 0) {
    // Unreachable through buildRenderedPriorities (selectThemes only keeps
    // themes with at least one resolved finding); a thrown error here keeps
    // a future caller from silently rendering an empty observation.
    throw new Error('Priority evidence requires at least one resolved finding');
  }
  // Strict code-point lexicographic order for the findingId tie-break, not
  // localeCompare: the plan's selection rule is lexicographic, and a locale
  // collation could reorder ids differently across ICU versions.
  const representative = [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
      (a.findingId < b.findingId ? -1 : a.findingId > b.findingId ? 1 : 0),
  )[0]!;
  const pageUrls = [...new Set(findings.flatMap((finding) => finding.pageUrls))].sort();
  return {
    representativeFinding: representative,
    representativeLabel: resolveFindingDisplayLabel(
      language,
      representative.ruleId,
      representative.title,
    ),
    representativePageUrl: pageUrls[0],
    uniquePageCount: pageUrls.length,
    occurrenceCount: findings.reduce((total, finding) => total + finding.occurrences, 0),
  };
}

/** Compatibility builder for the one call site that wraps a theme's
 *  already-resolved findings outside the full buildRenderedPriorities
 *  pipeline (renderThemes' internal fallback for focused tests). Evidence
 *  is always built so even this path renders a concrete observation;
 *  ownership counts stay zeroed because no manifest is available here. */
export function buildLegacyPriority(
  theme: Theme,
  displayRank: number,
  findingsById: ReadonlyMap<string, Finding>,
  language: ReportLanguage,
): RenderedPriority {
  const findings = theme.findingIds
    .map((id) => findingsById.get(id))
    .filter((finding): finding is Finding => finding !== undefined);
  return {
    theme,
    displayRank,
    findings,
    ownershipCounts: {
      'first-party-action': 0,
      'third-party-escalation': 0,
      'verify-intent': 0,
    },
    remediations: [],
    evidence: buildPriorityEvidence(findings, language),
  };
}

/** Builds the one report view model consumed by every priority surface. */
export function buildRenderedPriorities(
  themes: readonly Theme[],
  findings: readonly Finding[],
  manifest: AuditManifest,
  language: ReportLanguage,
): RenderedPriority[] {
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const legacyLcenIds = themes.flatMap((theme) =>
    theme.findingIds.filter((id) => findingsById.get(id)?.ruleId === LCEN_MENTIONS_LEGALES_RULE_ID),
  );
  if (legacyLcenIds.length > 0) {
    throw new Error(
      `Analysis contains LCEN findings in generated themes (${legacyLcenIds.join(', ')}). Regenerate the analysis structure.`,
    );
  }
  const selected = selectThemes(themes, findingsById);

  const priorities = selected.map((theme, index): RenderedPriority => {
    const priorityFindings = theme.findingIds
      .map((id) => findingsById.get(id))
      .filter((finding): finding is Finding => finding !== undefined);
    const ownershipCounts: Record<PriorityOwnership, number> = {
      'first-party-action': 0,
      'third-party-escalation': 0,
      'verify-intent': 0,
    };
    for (const finding of priorityFindings) {
      ownershipCounts[classifyPriorityOwnership(finding, manifest)] += 1;
    }
    const ruleIds = [...new Set(priorityFindings.map((finding) => finding.ruleId))].sort();
    const remediations = ruleIds
      .map((ruleId) => {
        const text = remediationFor(ruleId, language);
        return text === undefined ? undefined : { ruleId, text };
      })
      .filter((item): item is PriorityRemediation => item !== undefined);
    return {
      theme,
      displayRank: index + 1,
      findings: priorityFindings,
      ownershipCounts,
      remediations,
      evidence: buildPriorityEvidence(priorityFindings, language),
    };
  });

  const missingRuleIds = [
    ...new Set(
      priorities.flatMap((priority) => {
        const covered = new Set(priority.remediations.map((item) => item.ruleId));
        return priority.findings
          .map((finding) => finding.ruleId)
          .filter((ruleId) => !covered.has(ruleId));
      }),
    ),
  ].sort();
  if (missingRuleIds.length > 0) {
    throw new Error(
      `Missing reviewed report remediation for rule IDs: ${missingRuleIds.join(', ')}`,
    );
  }
  return priorities;
}

/** Compatibility helper for focused section tests. New report assembly uses
 * buildRenderedPriorities once and passes the result through. */
export function selectRenderedThemes(
  themes: readonly Theme[],
  findingsById: ReadonlyMap<string, Finding>,
): Theme[] {
  return selectThemes(themes, findingsById);
}

export function summarizePriorityOwnership(
  priorities: readonly RenderedPriority[],
): Record<PriorityOwnership, number> {
  return priorities.reduce<Record<PriorityOwnership, number>>(
    (total, priority) => ({
      'first-party-action':
        total['first-party-action'] + priority.ownershipCounts['first-party-action'],
      'third-party-escalation':
        total['third-party-escalation'] + priority.ownershipCounts['third-party-escalation'],
      'verify-intent': total['verify-intent'] + priority.ownershipCounts['verify-intent'],
    }),
    { 'first-party-action': 0, 'third-party-escalation': 0, 'verify-intent': 0 },
  );
}
