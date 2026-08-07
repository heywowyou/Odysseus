/**
 * The first 'custom'-sourced extractor in the codebase: the LCEN
 * mentions-legales check. Establishes the pattern the still-deferred
 * Milestone 8 custom checks (meta, canonical, JSON-LD, sitemap, hreflang,
 * heading hierarchy, redirect chains - a separate, unrelated set, see
 * docs/odysseus-project-brief-v2.md) will later reuse.
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
      title: 'No SIREN, RCS, or VAT number found on the site',
      description:
        'French law (LCEN article 6-III) requires an online professional to publish a SIREN or RCS number identifying the business. None of the three identifiers (SIREN, RCS, VAT) could be found, either because no dedicated legal notice page could be identified or because the page found does not list any of them.',
      pageUrl: input.pageUrl,
      element: null,
      rawEvidenceForPage: { siren: input.siren, rcs: input.rcs, tva: input.tva },
    },
  ];
}
