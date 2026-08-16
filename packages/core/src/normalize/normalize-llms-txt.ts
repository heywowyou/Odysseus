/**
 * Milestone 8.5a: violation judgment for the llms.txt presence check.
 * Site-level, attributed to the homepage, same "attribute a site-level
 * fact to the one page every site has" pattern sitemap.ts and mentions-
 * legales.ts already established.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const LLMS_TXT_MISSING_RULE_ID = 'llms-txt-missing';

export interface LlmsTxtCheckInput {
  found: boolean;
}

export function extractLlmsTxtCandidates(input: LlmsTxtCheckInput, pageUrl: string): FindingCandidate[] {
  if (input.found) return [];

  return [
    {
      source: 'custom',
      ruleId: LLMS_TXT_MISSING_RULE_ID,
      category: 'geo',
      severity: severityFromCustom(LLMS_TXT_MISSING_RULE_ID),
      wcagCriteria: [],
      title: 'No llms.txt found',
      description:
        'This site has no /llms.txt file. It is an emerging, not yet standardized convention some AI answer engines use to understand what a site is and how to reference it - its absence is not a defect in the way a missing sitemap is, but an easy opportunity.',
      pageUrl,
      element: null,
      rawEvidenceForPage: {},
    },
  ];
}
