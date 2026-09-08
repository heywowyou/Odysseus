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
  /** First URL of the representative finding's own pageUrls, sorted
   *  lexicographically. Undefined only when the representative finding
   *  itself carries no page URL. Issue #40: this used to be the first URL
   *  of the whole priority's page union, so the "observed for example on
   *  page P" sentence could name a page the representative finding never
   *  occurred on - P was chosen across the other findings in the priority,
   *  and a client opening it found no defect. The page is now chosen from
   *  the finding the sentence actually quotes, so the two can never
   *  disagree. */
  representativePageUrl: string | undefined;
  /** Exact count of distinct pages across the whole priority's finding
   *  set, confined to the visited scope (see buildPriorityEvidence). */
  uniquePageCount: number;
  /** Exact sum of the occurrence totals of the priority's visited-scope
   *  findings (see buildPriorityEvidence). */
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
 *  - representative page: the representative finding's own page URLs
 *    deduplicated, sorted lexicographically, first entry (issue #40: not
 *    the whole priority's union - the observation sentence quotes this
 *    finding, so the example page must be one of its own). Lexicographic
 *    order rather than the stored array order because pageUrls ordering
 *    is an artifact of scan timing, not something a reader should see
 *    wobble between renders;
 *  - counts: the exact distinct-page count and the exact occurrence sum
 *    across the priority's full resolved finding set, the same set the
 *    card prints under its finding references and its ownership line
 *    counts (issue #100: letting the category narrowing below shrink the
 *    counts made a real card print "32 occurrences" while listing
 *    findings carrying 33, against its own annex). Both counts are
 *    confined to the same visited scope (issue #41 keeps the pages half
 *    confined, since it renders against the visited-page denominator, so
 *    the occurrences half is confined to match): a finding whose every
 *    cited page sits outside the visited scope contributes to neither
 *    count, so the pages half and the occurrences half of the sentence
 *    always describe one population. Occurrences are stored as one
 *    per-finding total, so a finding cited on both scopes contributes
 *    its in-scope pages and its full occurrence total; per-page
 *    occurrence attribution below the finding does not exist in the
 *    stored document. A finding citing no page at all cannot be placed
 *    outside the scope by anything in the document, so it keeps its
 *    occurrences. */
function buildPriorityEvidence(
  findings: readonly Finding[],
  language: ReportLanguage,
  /** The analyzed scope the priority's page count is confined to: the
   *  manifest's own visited-page URL set, computed once by the caller from
   *  the same pages the "sur {totalPages}" denominator counts. */
  scopePageUrls: ReadonlySet<string>,
  /** Issue #84: a theme's own category. The observation sentence names the
   *  priority by this category ("Accessibilité") and quotes one finding's
   *  label, so the representative finding must come from findings that
   *  actually belong to it - otherwise a critical finding from an unrelated
   *  category (CLS, a performance metric, inside an accessibility theme)
   *  can become the accessibility example. Issue #100 confines the
   *  narrowing to this one selection: the page and occurrence counts are
   *  computed over the card's full resolved finding set. Falls back to the
   *  full finding set only when the theme has no same-category
   *  finding at all, which should not normally happen but must not throw. */
  category: Theme['category'],
): PriorityEvidence {
  if (findings.length === 0) {
    // Unreachable through buildRenderedPriorities (selectThemes only keeps
    // themes with at least one resolved finding); a thrown error here keeps
    // a future caller from silently rendering an empty observation.
    throw new Error('Priority evidence requires at least one resolved finding');
  }
  const sameCategory = findings.filter((finding) => finding.category === category);
  const representativePool = sameCategory.length > 0 ? sameCategory : findings;
  // Strict code-point lexicographic order for the findingId tie-break, not
  // localeCompare: the plan's selection rule is lexicographic, and a locale
  // collation could reorder ids differently across ICU versions.
  const representative = [...representativePool].sort(
    (a, b) =>
      SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
      (a.findingId < b.findingId ? -1 : a.findingId > b.findingId ? 1 : 0),
  )[0]!;
  // Issue #100: the counted population is the card's whole finding set
  // minus the findings the visited scope cannot see, not the
  // category-narrowed subset above.
  const inScope = findings.filter(
    (finding) =>
      finding.pageUrls.length === 0 || finding.pageUrls.some((url) => scopePageUrls.has(url)),
  );
  const pageUrls = [
    ...new Set(
      inScope
        .flatMap((finding) => finding.pageUrls)
        // A finding cited on both scopes keeps only its in-scope pages.
        .filter((url) => scopePageUrls.has(url)),
    ),
  ].sort();
  return {
    representativeFinding: representative,
    representativeLabel: resolveFindingDisplayLabel(
      language,
      representative.ruleId,
      representative.title,
    ),
    representativePageUrl: [...new Set(representative.pageUrls)].sort()[0],
    uniquePageCount: pageUrls.length,
    occurrenceCount: inScope.reduce((total, finding) => total + finding.occurrences, 0),
  };
}

/** Compatibility builder for the one call site that wraps a theme's
 *  already-resolved findings outside the full buildRenderedPriorities
 *  pipeline (renderThemes' internal fallback for focused tests). Evidence
 *  is always built so even this path renders a concrete observation;
 *  ownership counts stay zeroed because no manifest is available here.
 *  scopePageUrls defaults to an empty set, i.e. "no analyzed scope known":
 *  both counts are scope-relative figures (see buildPriorityEvidence), so
 *  a caller that cannot supply the manifest's visited pages gets zero for
 *  every finding that cites a page, never a count from an unstated
 *  population. */
export function buildLegacyPriority(
  theme: Theme,
  displayRank: number,
  findingsById: ReadonlyMap<string, Finding>,
  language: ReportLanguage,
  scopePageUrls: ReadonlySet<string> = new Set(),
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
    evidence: buildPriorityEvidence(findings, language, scopePageUrls, theme.category),
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

  // Issue #41: the same population the "sur {totalPages}" denominator
  // counts (checklist.ts and themes.ts both count manifest pages with
  // status 'visited'), so a priority's page count can never exceed it.
  const scopePageUrls = new Set(
    manifest.pages.filter((page) => page.status === 'visited').map((page) => page.url),
  );

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
      evidence: buildPriorityEvidence(priorityFindings, language, scopePageUrls, theme.category),
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

  // Issue #84: two priorities quoting the identical example finding read as
  // indistinguishable at the exact moment the report is asking which one to
  // fund first. Category-scoped selection above should already prevent
  // this; this is a hard-fail safety net rather than a silent overlap.
  const representativeIdOwners = new Map<string, number>();
  for (const priority of priorities) {
    const id = priority.evidence.representativeFinding.findingId;
    const owner = representativeIdOwners.get(id);
    if (owner !== undefined) {
      throw new Error(
        `Priorities ${owner} and ${priority.displayRank} share the same representative finding (${id})`,
      );
    }
    representativeIdOwners.set(id, priority.displayRank);
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

/** Issue #83: a finding that belongs to two priorities (a real, disclosed
 *  case - "une meme page peut relever des deux" already covers pages, but
 *  nothing said so for findings) used to be counted once per priority it
 *  appeared in, so this total could exceed the distinct-finding coverage
 *  figure printed two lines above it in the executive summary (82 vs 80 in
 *  the report that surfaced this). Each priority's own ownershipCounts
 *  (rendered on that priority's own card) is unchanged and still counts a
 *  shared finding under every priority it belongs to - only this
 *  cross-priority total dedupes, by findingId, so it sums the same
 *  distinct-finding population renderCoveredByPrioritiesNote does.
 *  classifyPriorityOwnership is a pure function of the finding and the
 *  manifest, so a finding shared between two priorities always classifies
 *  the same way regardless of which priority's pass encounters it first. */
export function summarizePriorityOwnership(
  priorities: readonly RenderedPriority[],
  manifest: AuditManifest,
): Record<PriorityOwnership, number> {
  const ownershipByFindingId = new Map<string, PriorityOwnership>();
  for (const priority of priorities) {
    for (const finding of priority.findings) {
      if (ownershipByFindingId.has(finding.findingId)) continue;
      ownershipByFindingId.set(finding.findingId, classifyPriorityOwnership(finding, manifest));
    }
  }

  const total: Record<PriorityOwnership, number> = {
    'first-party-action': 0,
    'third-party-escalation': 0,
    'verify-intent': 0,
  };
  for (const ownership of ownershipByFindingId.values()) {
    total[ownership] += 1;
  }
  return total;
}
