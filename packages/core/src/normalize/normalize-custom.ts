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

/** Plan 036: the resolved mentions-legales page plus every visited,
 *  non-error-status URL `findMentionsLegalesUrl` searched to produce it (or
 *  to find nothing) - the research note's "retain the pages, links and
 *  extracted evidence it checked" boundary held in evidence, not prose.
 *  Filled by scan-site.ts at resolution time from crawl.ts's own
 *  `mentionsLegalesSearchedUrls`, and carried through scan-page.ts with the
 *  page result. `homepageFallback` is true only when no URL matched the
 *  heuristic and scan-site.ts fell back to the homepage so the absence
 *  still surfaces (scan-site.ts's own fallback comment), never implying a
 *  real match where there was none. */
export interface MentionsLegalesCheckedPages {
  resolvedUrl: string;
  homepageFallback: boolean;
  searchedUrls: string[];
}

export interface MentionsLegalesCheckInput {
  pageUrl: string;
  siren?: string;
  rcs?: string;
  tva?: string;
  checkedPages?: MentionsLegalesCheckedPages;
}

/** Article 1-1, I field-table rows from the design's detector-status table
 *  (docs/research/lcen-identification-finding-design.md). A row moves from
 *  `absent-not-proven` to `detectably present` only when a reviewed
 *  deterministic extractor for that exact field lands in the tree;
 *  rewording, severity, or copy changes never move a row (plan 036 binding
 *  decision 1). With zero widening, the two registration-number rows are
 *  the only ones ever non-null - every other row is null by construction,
 *  not because it was checked and found absent. */
export type ArticleOneOneFieldId =
  | 'natural-name'
  | 'natural-given-names'
  | 'natural-domicile'
  | 'natural-telephone'
  | 'natural-registration-number'
  | 'legal-company-name'
  | 'legal-registered-office'
  | 'legal-telephone'
  | 'legal-registration-number'
  | 'legal-share-capital'
  | 'legal-registered-office-address'
  | 'editor-publication-director'
  | 'editor-editorial-manager'
  | 'host-name'
  | 'host-address'
  | 'host-telephone'
  | 'data-storage-party-identity';

export interface ArticleOneOneFieldPresence {
  field: ArticleOneOneFieldId;
  value: string | null;
}

const ARTICLE_ONE_ONE_FIELD_IDS: readonly ArticleOneOneFieldId[] = [
  'natural-name',
  'natural-given-names',
  'natural-domicile',
  'natural-telephone',
  'natural-registration-number',
  'legal-company-name',
  'legal-registered-office',
  'legal-telephone',
  'legal-registration-number',
  'legal-share-capital',
  'legal-registered-office-address',
  'editor-publication-director',
  'editor-editorial-manager',
  'host-name',
  'host-address',
  'host-telephone',
  'data-storage-party-identity',
];

const REGISTRATION_NUMBER_FIELD_IDS: ReadonlySet<ArticleOneOneFieldId> = new Set([
  'natural-registration-number',
  'legal-registration-number',
]);

function buildArticleOneOneFieldPresence(
  input: MentionsLegalesCheckInput,
): ArticleOneOneFieldPresence[] {
  const registrationNumber = input.siren ?? input.rcs ?? null;
  return ARTICLE_ONE_ONE_FIELD_IDS.map((field) => ({
    field,
    value: REGISTRATION_NUMBER_FIELD_IDS.has(field) ? registrationNumber : null,
  }));
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
      description: `LCEN article 1-1, I, 2° states the publisher-identification information to make available. No SIREN, RCS, or VAT identifier was found on the page checked for this audit: ${input.pageUrl}.`,
      pageUrl: input.pageUrl,
      element: null,
      rawEvidenceForPage: {
        siren: input.siren ?? null,
        rcs: input.rcs ?? null,
        tva: input.tva ?? null,
        articleOneOneFields: buildArticleOneOneFieldPresence(input),
        checkedPages: input.checkedPages ?? null,
      },
    },
  ];
}
