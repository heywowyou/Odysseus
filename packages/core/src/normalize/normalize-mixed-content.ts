/**
 * Milestone 8: violation judgment for mixed content. Same scanner-
 * extracts/core-decides split as every other custom check. One finding
 * per page (not per resource): every insecure resource URL found on that
 * page is recorded in rawEvidence, matching the jsonld-missing/
 * opengraph-missing precedent of aggregating a page-wide fact into one
 * candidate rather than one per occurrence.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const MIXED_CONTENT_RULE_ID = 'mixed-content';

export interface MixedContentCheckInput {
  pageUrl: string;
  isPageSecure: boolean;
  insecureResourceUrls: string[];
}

export function extractMixedContentCandidates(input: MixedContentCheckInput): FindingCandidate[] {
  if (!input.isPageSecure || input.insecureResourceUrls.length === 0) return [];

  return [
    {
      source: 'custom',
      ruleId: MIXED_CONTENT_RULE_ID,
      category: 'seo',
      severity: severityFromCustom(MIXED_CONTENT_RULE_ID),
      wcagCriteria: [],
      title: 'Page loads insecure (http://) resources',
      // Page-independent (issue #503): the resources are in the evidence.
      description: `This page is served over https, but loads resources over plain http. Browsers commonly block or warn about mixed content, which can silently break the page for visitors.`,
      pageUrl: input.pageUrl,
      element: null,
      rawEvidenceForPage: { insecureResourceUrls: input.insecureResourceUrls },
    },
  ];
}
