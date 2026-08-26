/**
 * Milestone 8.5a: violation judgment for the canonical-target checks.
 * Same scanner-extracts/core-decides split as every other custom check -
 * packages/scanner/src/checks/canonical-target.ts only reports whether
 * the target was reachable and whether it carries a noindex directive;
 * this module decides which of those facts is a defect.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const CANONICAL_TARGET_UNREACHABLE_RULE_ID = 'canonical-target-unreachable';
export const CANONICAL_TARGET_NOINDEX_RULE_ID = 'canonical-target-noindex';

export interface CanonicalTargetCheckInput {
  pageUrl: string;
  canonicalUrl: string;
  httpStatus?: number;
  fetchError?: string;
  noindex: boolean;
}

export function extractCanonicalTargetCandidates(
  input: CanonicalTargetCheckInput,
): FindingCandidate[] {
  const isUnreachable =
    input.fetchError !== undefined || (input.httpStatus !== undefined && input.httpStatus >= 400);

  if (isUnreachable) {
    return [
      {
        source: 'custom',
        ruleId: CANONICAL_TARGET_UNREACHABLE_RULE_ID,
        category: 'seo',
        severity: severityFromCustom(CANONICAL_TARGET_UNREACHABLE_RULE_ID),
        wcagCriteria: [],
        title: 'Canonical tag points to an unreachable page',
        description: input.fetchError
          ? `This page's canonical tag points to ${input.canonicalUrl}, which could not be reached: ${input.fetchError}.`
          : `This page's canonical tag points to ${input.canonicalUrl}, which returned HTTP ${input.httpStatus}. Search engines cannot treat an unreachable page as the definitive version of this content.`,
        pageUrl: input.pageUrl,
        element: null,
        rawEvidenceForPage: {
          canonicalUrl: input.canonicalUrl,
          httpStatus: input.httpStatus,
          fetchError: input.fetchError,
        },
      },
    ];
  }

  // Only checked once the target is confirmed reachable: a noindex
  // reading on a page that could not be fetched at all would not be a
  // real fact.
  if (input.noindex) {
    return [
      {
        source: 'custom',
        ruleId: CANONICAL_TARGET_NOINDEX_RULE_ID,
        category: 'seo',
        severity: severityFromCustom(CANONICAL_TARGET_NOINDEX_RULE_ID),
        wcagCriteria: [],
        title: 'Canonical tag points to a page excluded from search results',
        description: `This page's canonical tag points to ${input.canonicalUrl}, which itself carries a noindex directive. Search engines are told this is the definitive version of the content, while also being told not to index it.`,
        pageUrl: input.pageUrl,
        element: null,
        rawEvidenceForPage: { canonicalUrl: input.canonicalUrl },
      },
    ];
  }

  return [];
}
