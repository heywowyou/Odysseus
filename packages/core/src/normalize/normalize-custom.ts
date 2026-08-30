/**
 * The first 'custom'-sourced extractor in the codebase: the LCEN
 * mentions-legales check. Establishes the pattern the still-deferred
 * Milestone 8 custom checks (meta, canonical, JSON-LD, sitemap, hreflang,
 * heading hierarchy, redirect chains - a separate, unrelated set, see
 * docs/product/odysseus-project-brief.md) will later reuse.
 *
 * Page-scoped, like normalize-renderdiff.ts's pattern: emits nothing when
 * compliant (any of siren/rcs/tva present), one finding when none of the
 * three could be found on the identified mentions-legales page.
 */

import { severityFromCustom } from './severity.js';
import type { FindingCandidate } from './candidate.js';

export const LCEN_MENTIONS_LEGALES_RULE_ID = 'lcen-mentions-legales-missing';

export interface MentionsLegalesCheckInput {
  pageUrl: string;
  siren?: string;
  rcs?: string;
  tva?: string;
}

export function extractCustomCandidates(input: MentionsLegalesCheckInput): FindingCandidate[] {
  if (input.siren !== undefined || input.rcs !== undefined || input.tva !== undefined) return [];

  return [
    {
      source: 'custom',
      ruleId: LCEN_MENTIONS_LEGALES_RULE_ID,
      category: 'seo',
      severity: severityFromCustom(LCEN_MENTIONS_LEGALES_RULE_ID),
      wcagCriteria: [],
      title: 'No SIREN, RCS, or VAT number found on visited pages',
      description:
        'LCEN article 1-1, I, 2° states the publisher-identification information to make available. No SIREN, RCS, or VAT identifier was found on the pages visited during this audit.',
      pageUrl: input.pageUrl,
      element: null,
      rawEvidenceForPage: { siren: input.siren, rcs: input.rcs, tva: input.tva },
    },
  ];
}
