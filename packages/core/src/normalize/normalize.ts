/**
 * Normalization orchestrator: turns raw per-page scanner output into the
 * locked Finding[] shape.
 *
 * packages/core deliberately declares its own narrow structural input
 * types for axe/Lighthouse data (see normalize-axe.ts / normalize-
 * lighthouse.ts) rather than depending on axe-core/lighthouse/playwright
 * for types. Those packages are scanner's dependencies, not core's: core
 * is meant to be the lightest package in the workspace, and Lighthouse in
 * particular pulls in a large dependency tree. Because TypeScript is
 * structurally typed, scanner's real PageScanResult (whose axe/lighthouse
 * fields carry the full SDK types) is assignable to these narrower
 * interfaces with zero adapter code.
 */

import {
  FINDINGS_SCHEMA_VERSION,
  MAX_ELEMENTS_PER_FINDING,
  type Finding,
  type FindingElement,
} from '../types/findings.js';
import { maxSeverity } from './severity.js';
import { computeDedupeKey } from './dedupe.js';
import { assignFindingIds } from './finding-id.js';
import { compareCriteria } from './wcag-tags.js';
import { extractAxeCandidates, type AxeResultsInput } from './normalize-axe.js';
import { extractLighthouseCandidates, type LighthouseResultInput } from './normalize-lighthouse.js';
import { extractRenderDiffCandidates } from './normalize-renderdiff.js';
import { extractCustomCandidates, type MentionsLegalesCheckInput } from './normalize-custom.js';
import { extractHeadMetadataCandidates, type HeadMetadataCheckInput } from './normalize-head-metadata.js';
import { extractSitemapCandidates, type SitemapCheckInput } from './normalize-sitemap.js';
import { extractCrawlCandidates, type NormalizeCrawlInput } from './normalize-crawl.js';
import type { FindingCandidate } from './candidate.js';
import type { RenderDiffResult } from '../types/findings.js';

export interface NormalizePageInput {
  url: string;
  axe?: AxeResultsInput;
  axeError?: string;
  lighthouse?: LighthouseResultInput;
  lighthouseError?: string;
  renderDiff?: RenderDiffResult;
  renderDiffError?: string;
  /** Only set on the one page the crawl identified as the mentions-
   *  legales page. */
  mentionsLegales?: MentionsLegalesCheckInput;
  mentionsLegalesError?: string;
  /** Milestone 8, slice 1: runs on every page (unlike mentionsLegales,
   *  which is scoped to one page) since meta tags, canonical, JSON-LD,
   *  and headings are all per-page concerns. */
  headMetadata?: HeadMetadataCheckInput;
  headMetadataError?: string;
  /** Only set on the crawl's own start URL (see scan-site.ts) - sitemap
   *  is a site-level concept, not a per-page one. */
  sitemapCheck?: SitemapCheckInput;
}

export interface NormalizeAuditInput {
  auditId: string;
  /** Used for both firstSeenAt and lastSeenAt this milestone (cross-run
   *  population is Milestone 10). */
  startedAt: Date;
  pages: NormalizePageInput[];
  /** Optional so offline re-normalization against a pre-Milestone-8
   *  manifest (no discoveredFrom recorded) still works, just without
   *  robots-blocks-indexing/broken-internal-link. Judges the crawl's own
   *  results (a blocked homepage, a broken link target), not any one
   *  page's content, so it is collected once here rather than per page. */
  crawl?: NormalizeCrawlInput;
}

function collectCandidates(input: NormalizeAuditInput): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];

  for (const page of input.pages) {
    if (page.axe) candidates.push(...extractAxeCandidates(page.axe, page.url));
    if (page.lighthouse) candidates.push(...extractLighthouseCandidates(page.lighthouse, page.url));
    if (page.renderDiff) candidates.push(...extractRenderDiffCandidates(page.renderDiff, page.url));
    if (page.mentionsLegales) candidates.push(...extractCustomCandidates(page.mentionsLegales));
    if (page.headMetadata) candidates.push(...extractHeadMetadataCandidates(page.headMetadata));
    if (page.sitemapCheck) candidates.push(...extractSitemapCandidates(page.sitemapCheck));
  }

  if (input.crawl) candidates.push(...extractCrawlCandidates(input.crawl));

  return candidates;
}

function mergeGroup(
  auditId: string,
  dedupeKey: string,
  group: FindingCandidate[],
  startedAt: Date,
): Omit<Finding, 'findingId'> {
  const first = group[0];
  if (!first) throw new Error('normalize: mergeGroup called with an empty group');

  const severity = group
    .map((c) => c.severity)
    .reduce((acc, s) => maxSeverity(acc, s));

  const pageUrls = [...new Set(group.map((c) => c.pageUrl))].sort();

  const wcagCriteria = [...new Set(group.flatMap((c) => c.wcagCriteria))].sort(compareCriteria);

  const elements: FindingElement[] = group
    .filter((c): c is FindingCandidate & { element: FindingElement } => c.element !== null)
    .slice(0, MAX_ELEMENTS_PER_FINDING)
    .map((c) => c.element);

  // Last write wins if two candidates in the same group land on the same
  // page (e.g. two Lighthouse detail items sharing a selector). Documented
  // rather than silently accepted: this is a real, if rare, information
  // loss and worth knowing about if a finding's evidence looks thin.
  const perPage: Record<string, unknown> = {};
  for (const candidate of group) {
    perPage[candidate.pageUrl] = candidate.rawEvidenceForPage;
  }

  return {
    auditId,
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    source: first.source,
    ruleId: first.ruleId,
    category: first.category,
    severity,
    wcagCriteria,
    title: first.title,
    description: first.description,
    ...(first.helpUrl !== undefined ? { helpUrl: first.helpUrl } : {}),
    pageUrls,
    occurrences: group.length,
    elements,
    rawEvidence: {
      dedupeComponents: {
        source: first.source,
        ruleId: first.ruleId,
        selector: first.element?.selector ?? '',
      },
      perPage,
    },
    dedupeKey,
    firstSeenAt: startedAt,
    lastSeenAt: startedAt,
  };
}

/**
 * Some axe rules (link-in-text-block is the confirmed case, from a real
 * scan of sas-fernande.fr) hand out a distinct positional selector per
 * node even when every node is the same underlying defect repeated many
 * times on one page. The fine per-selector groups above are correct and
 * stay untouched: a selector genuinely repeated across pages must still
 * collapse into one finding, and genuinely different selectors must stay
 * distinct. This second pass only catches the case that fine grouping
 * cannot: two or more fine groups that are each confined to the exact
 * same single page for the same source and rule. Only then are they
 * combined into one finding, with a new dedupeKey computed from the page
 * instead of a selector (reusing computeDedupeKey unchanged, the same way
 * page-scoped candidates already reuse it with an empty-string selector).
 * A fine group that is the only occupant of its coarse bucket (the common
 * case: one selector, one occurrence) or that already spans multiple
 * pages passes through with its original dedupeKey, unchanged.
 */
function aggregateSamePageOccurrences(
  fineGroups: Map<string, FindingCandidate[]>,
): Map<string, FindingCandidate[]> {
  const coarseKeyByFineKey = new Map<string, string>();
  const fineKeysByCoarseKey = new Map<string, string[]>();

  for (const [fineKey, group] of fineGroups) {
    const first = group[0];
    if (!first) continue;

    const pageUrls = new Set(group.map((c) => c.pageUrl));
    if (pageUrls.size !== 1) continue;

    const coarseKey = `${first.source}|${first.ruleId}|${[...pageUrls][0]}`;
    coarseKeyByFineKey.set(fineKey, coarseKey);
    const fineKeys = fineKeysByCoarseKey.get(coarseKey);
    if (fineKeys) {
      fineKeys.push(fineKey);
    } else {
      fineKeysByCoarseKey.set(coarseKey, [fineKey]);
    }
  }

  const result = new Map<string, FindingCandidate[]>();
  const consumedFineKeys = new Set<string>();

  for (const [, fineKeys] of fineKeysByCoarseKey) {
    if (fineKeys.length < 2) continue;

    const combined: FindingCandidate[] = [];
    for (const fineKey of fineKeys) {
      combined.push(...(fineGroups.get(fineKey) ?? []));
      consumedFineKeys.add(fineKey);
    }

    const first = combined[0];
    if (!first) continue;
    const pageUrl = [...new Set(combined.map((c) => c.pageUrl))][0] ?? '';
    const dedupeKey = computeDedupeKey(first.source, first.ruleId, pageUrl);
    result.set(dedupeKey, combined);
  }

  for (const [fineKey, group] of fineGroups) {
    if (consumedFineKeys.has(fineKey)) continue;
    result.set(fineKey, group);
  }

  return result;
}

export function normalizeAudit(input: NormalizeAuditInput): Finding[] {
  const candidates = collectCandidates(input);

  const fineGroups = new Map<string, FindingCandidate[]>();
  for (const candidate of candidates) {
    const key = computeDedupeKey(candidate.source, candidate.ruleId, candidate.element?.selector ?? '');
    const group = fineGroups.get(key);
    if (group) {
      group.push(candidate);
    } else {
      fineGroups.set(key, [candidate]);
    }
  }

  const groups = aggregateSamePageOccurrences(fineGroups);

  const merged = [...groups.entries()].map(([dedupeKey, group]) =>
    mergeGroup(input.auditId, dedupeKey, group, input.startedAt),
  );

  return assignFindingIds(merged);
}
