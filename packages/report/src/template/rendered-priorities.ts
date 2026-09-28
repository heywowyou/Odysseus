import {
  contentCheckedPageUrls,
  LCEN_MENTIONS_LEGALES_RULE_ID,
  SEVERITY_ORDER,
  type AuditManifest,
  type Finding,
  type ManifestPageEntry,
  type ReportLanguage,
  type StoredTheme,
} from '@odysseus/core';
import { buildMissingPercentIndex, classifyDiversion } from '@odysseus/llm';
import { interpolateSnippet, remediationFor, snippetFor } from './remediation/index.js';
import { resolveFindingDisplayLabel } from './rule-translations.js';
import { isThirdPartyFinding } from './third-party-attribution.js';
import { primaryFindingFilter } from '@odysseus/core';
import { MissingReviewedRemediationError } from '../errors.js';

export const MAX_RENDERED_THEMES = 6;

export type PriorityOwnership = 'first-party-action' | 'third-party-escalation' | 'verify-intent';
export type PriorityActionLevel = 'priority' | 'important' | 'improvement';
export type RemainingActionLevel = Exclude<PriorityActionLevel, 'priority'>;

/** Plan 067: every theme admitted to the existing six-card main-priority
 * section is a client-facing priority. Rank affects order, not level. */
export function actionLevelForRenderedPriority(): 'priority' {
  return 'priority';
}

/** Plan 067: only work outside the main priorities is split further, using
 * the deterministic worst severity already owned by the remaining-work view. */
export function actionLevelForRemainingSeverity(
  severity: Finding['severity'],
): RemainingActionLevel {
  return severity === 'critical' || severity === 'serious' ? 'important' : 'improvement';
}

export interface PriorityRemediation {
  ruleId: string;
  text: string;
  /** Plan 041 Part A: the rule's deterministic fix snippet, when one exists
   *  and is not classified `not-applicable`. `fixed` templates are already
   *  interpolated against this priority's own representative finding
   *  element; `fill-in-blank` templates are rendered as-is, since
   *  substituting the finding's own captured content into a blank meant for
   *  the client's own words would add noise, not help. */
  snippet?: { kind: 'fixed' | 'fill-in-blank'; rendered: string };
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
  theme: StoredTheme;
  /** Contiguous client-facing position. The model rank remains on theme. */
  displayRank: number;
  /** Plan 067: all themes admitted to the existing main-priority section are priority. */
  actionLevel: PriorityActionLevel;
  /** Issue #293: every finding of each (source, ruleId) pair the theme
   *  names - theme.findingIds is expanded to the same set - so a rule can
   *  never be split between a priority and the remaining-work section. */
  findings: Finding[];
  ownershipCounts: Record<PriorityOwnership, number>;
  remediations: PriorityRemediation[];
  evidence: PriorityEvidence;
}

function selectThemes(
  themes: readonly StoredTheme[],
  findingsById: ReadonlyMap<string, Finding>,
): StoredTheme[] {
  const withResolvedFindings = themes.filter((theme) =>
    theme.findingIds.some((id) => findingsById.has(id)),
  );
  const byRank = [...withResolvedFindings].sort((a, b) => a.priorityRank - b.priorityRank);
  const selected = byRank.slice(0, MAX_RENDERED_THEMES);
  if (selected.length < MAX_RENDERED_THEMES) return selected;

  const themeFindings = (theme: StoredTheme): Finding[] =>
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

function classifyPriorityOwnership(finding: Finding, manifest: AuditManifest): PriorityOwnership {
  const diversion = classifyDiversion(finding, buildMissingPercentIndex(manifest));
  if (diversion === 'legal' || diversion === 'regime-dependent') return 'verify-intent';
  if (diversion === 'wrapper' || isThirdPartyFinding(finding)) return 'third-party-escalation';
  return 'first-party-action';
}

/** Plan 018 step 6: builds the deterministic evidence summary for one
 *  priority. Selection rules, stated in full so callers can rely on them
 *  without re-deriving any of this in template code:
 *
 *  - representative finding: from the rule carrying most of the
 *    priority's work (occurrences, then pages reached, then that rule's
 *    own top severity, then ruleId), highest severity within that rule,
 *    then the lexicographically smallest findingId as the tie-break, so
 *    two render runs over the same stored analysis can never disagree
 *    (issue #297);
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
/** The page the observation sentence names. The alphabetically first URL
 *  used to be the example, and `/en/…` sorts before most French paths: seven
 *  of nine French reports quoted an English page as the place a defect was
 *  seen. A visited page in the report's language now comes first, then the
 *  shallowest page, then URL order so two renders always agree. */
function pickExamplePage(
  pageUrls: readonly string[],
  language: ReportLanguage,
  pagesByUrl: ReadonlyMap<string, ManifestPageEntry>,
): string | undefined {
  const rank = (url: string): [number, number, number] => {
    const page = pagesByUrl.get(url);
    const pageLanguage = page?.language?.toLowerCase().split('-')[0];
    return [
      pageLanguage === language ? 0 : 1,
      page?.status === 'visited' ? 0 : 1,
      page?.depth ?? Number.MAX_SAFE_INTEGER,
    ];
  };
  return [...new Set(pageUrls)]
    .map((url) => ({ url, rank: rank(url) }))
    .sort(
      (a, b) =>
        a.rank[0] - b.rank[0] ||
        a.rank[1] - b.rank[1] ||
        a.rank[2] - b.rank[2] ||
        (a.url < b.url ? -1 : a.url > b.url ? 1 : 0),
    )[0]?.url;
}

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
  category: StoredTheme['category'],
  /** Manifest facts about each page, used to pick the example page. */
  pagesByUrl: ReadonlyMap<string, ManifestPageEntry> = new Map(),
): PriorityEvidence {
  if (findings.length === 0) {
    // Unreachable through buildRenderedPriorities (selectThemes only keeps
    // themes with at least one resolved finding); a thrown error here keeps
    // a future caller from silently rendering an empty observation.
    throw new Error('Priority evidence requires at least one resolved finding');
  }
  const sameCategory = findings.filter((finding) => finding.category === category);
  const representativePool = sameCategory.length > 0 ? sameCategory : findings;
  // Issue #297: severity alone chose the example, so a single critical
  // outlier spoke for a priority built on something else. Haaitza's
  // "Rendre les liens, les images et les vidéos compréhensibles" quoted a
  // meta-refresh finding, and its "Réduire le temps d'affichage du contenu
  // principal" quoted a CLS one - in both cases the most severe finding in
  // the card, and in neither case what the card is about.
  //
  // The example is therefore drawn from the rule that carries the
  // priority's work: rules ranked by the occurrences they contribute, then
  // by the pages they reach, then by their own top severity, then by ruleId
  // so two renders of one stored analysis can never disagree. Severity
  // still decides within that rule, and still leads everywhere else on the
  // card - the conformity fact, the severity chips and the annex are
  // unchanged. "Representative" is a claim about the bulk of the job, not
  // about its worst single instance.
  const ruleReach = new Map<string, { occurrences: number; pages: Set<string>; top: number }>();
  for (const finding of representativePool) {
    const reach = ruleReach.get(finding.ruleId) ?? {
      occurrences: 0,
      pages: new Set<string>(),
      top: 0,
    };
    reach.occurrences += finding.occurrences;
    for (const url of finding.pageUrls) reach.pages.add(url);
    reach.top = Math.max(reach.top, SEVERITY_ORDER[finding.severity]);
    ruleReach.set(finding.ruleId, reach);
  }
  // Strict code-point lexicographic order for the ruleId and findingId
  // tie-breaks, not localeCompare: the plan's selection rule is
  // lexicographic, and a locale collation could reorder ids differently
  // across ICU versions.
  const dominantRuleId = [...ruleReach.entries()].sort(
    ([aRule, a], [bRule, b]) =>
      b.occurrences - a.occurrences ||
      b.pages.size - a.pages.size ||
      b.top - a.top ||
      (aRule < bRule ? -1 : aRule > bRule ? 1 : 0),
  )[0]![0];
  const representative = [...representativePool]
    .filter((finding) => finding.ruleId === dominantRuleId)
    .sort(
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
    representativePageUrl: pickExamplePage(representative.pageUrls, language, pagesByUrl),
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
  theme: StoredTheme,
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
    actionLevel: actionLevelForRenderedPriority(),
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
  themes: readonly StoredTheme[],
  findings: readonly Finding[],
  manifest: AuditManifest,
  language: ReportLanguage,
): RenderedPriority[] {
  // Q1: findings wholly inside a third-party frame remain in the annex, but
  // cannot become one of the report's primary client priorities. Mixed
  // findings stay eligible because they also carry first-party evidence.
  const primaryFindings = findings.filter(primaryFindingFilter(manifest));
  const findingsById = new Map(primaryFindings.map((finding) => [finding.findingId, finding]));
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
  // Issue #80's content-checked population, not the raw visited set: the
  // metadata sheet, the statistics tile and the methodology paragraph all
  // call the analysed perimeter by the content-checked figure, so a page
  // figure built on the visited set could exceed the perimeter the report
  // states it analysed - a real French report opened on "au moins 522
  // pages du périmètre analysé" three pages after "520 pages analysées".
  const scopePageUrls = contentCheckedPageUrls(manifest);
  const pagesByUrl = new Map(manifest.pages.map((page) => [page.url, page]));

  // Issue #293: a theme the model ranked names only a subset of a rule's
  // findings, so the remaining-work section - which excludes by findingId -
  // rendered the rest of the SAME rule as "Reste à traiter" with a second,
  // contradictory count for one defect (a real report split image-alt into
  // "6 findings / 114 occurrences" on the priority card and "164 findings /
  // 627 occurrences" in the remaining-work list, against a WCAG table
  // totaling 170/741). A rule chosen for a priority brings ALL of its
  // findings into that priority: each selected theme's findingIds are
  // expanded here, once, to every finding sharing the same (source, ruleId)
  // pair, so the theme cards, the checklist, the remaining-work exclusion
  // and every count derived from priority.findings describe one population.
  // Selection (selectThemes, MAX_RENDERED_THEMES) already ran on the
  // original themes above and is untouched; expansion only ever ADDS
  // findings of rules the theme already named, so the remediation rule set
  // cannot grow past what was reviewed.
  const findingsByRuleKey = new Map<string, Finding[]>();
  for (const finding of primaryFindings) {
    const key = `${finding.source}::${finding.ruleId}`;
    const group = findingsByRuleKey.get(key);
    if (group) group.push(finding);
    else findingsByRuleKey.set(key, [finding]);
  }

  const priorities = selected.map((theme, index): RenderedPriority => {
    const resolvedFindings = theme.findingIds
      .map((id) => findingsById.get(id))
      .filter((finding): finding is Finding => finding !== undefined);
    const ruleKeys = [
      ...new Set(resolvedFindings.map((finding) => `${finding.source}::${finding.ruleId}`)),
    ];
    // StoredTheme order first (the model's own picking order), then the rule's
    // remaining findings in stored findings order; deduped by findingId so
    // a doubled id in the theme can never double-count.
    const expandedFindings = [
      ...new Map(
        ruleKeys
          .flatMap((key) => findingsByRuleKey.get(key) ?? [])
          .map((finding) => [finding.findingId, finding] as const),
      ).values(),
    ];
    const priorityFindings = expandedFindings;
    const priorityTheme: StoredTheme = {
      ...theme,
      findingIds: expandedFindings.map((f) => f.findingId),
    };
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
        if (text === undefined) return undefined;
        const fixSnippet = snippetFor(ruleId, language);
        if (fixSnippet === undefined || fixSnippet.kind === 'not-applicable') {
          return { ruleId, text };
        }
        const representativeElement = priorityFindings.find((finding) => finding.ruleId === ruleId)
          ?.elements[0];
        const rendered =
          fixSnippet.kind === 'fixed'
            ? interpolateSnippet(fixSnippet, representativeElement ?? {})
            : fixSnippet.template;
        return { ruleId, text, snippet: { kind: fixSnippet.kind, rendered } };
      })
      .filter((item): item is PriorityRemediation => item !== undefined);
    return {
      theme: priorityTheme,
      displayRank: index + 1,
      actionLevel: actionLevelForRenderedPriority(),
      findings: priorityFindings,
      ownershipCounts,
      remediations,
      evidence: buildPriorityEvidence(
        priorityFindings,
        language,
        scopePageUrls,
        theme.category,
        pagesByUrl,
      ),
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
    throw new MissingReviewedRemediationError(missingRuleIds);
  }

  // Issue #84's hard-fail safety net (two priorities quoting the identical
  // example finding) is retired here rather than kept: since the issue #293
  // rule expansion above, a representative collision can only arise when two
  // themes name the same rule, and expansion then gives BOTH priorities the
  // rule's entire finding set by design - the overlap is explicit, each card
  // is self-consistent, and issue #83's cross-priority totals already dedupe
  // it (summarizePriorityOwnership). A hard failure would crash whole report
  // generations for data that previously rendered (the committed stress
  // fixture and a real, disclosed report both do this). Issue #84's actual
  // regression - a cross-category finding winning the quoted slot - remains
  // prevented in buildPriorityEvidence's category-scoped selection.
  return priorities;
}

/** Compatibility helper for focused section tests. New report assembly uses
 * buildRenderedPriorities once and passes the result through. */
export function selectRenderedThemes(
  themes: readonly StoredTheme[],
  findingsById: ReadonlyMap<string, Finding>,
): StoredTheme[] {
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
