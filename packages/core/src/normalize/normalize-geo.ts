/**
 * Milestone 8.5a: GEO (generative-engine-optimization) checks - whether
 * the site gives an AI answer engine real, machine-readable material to
 * extract and cite. Every fact here is already collected by
 * packages/scanner/src/checks/head-metadata.ts (jsonLdBlocks, headings)
 * for the milestone-8 SEO checks; this module reads the same facts for a
 * different, additive judgment rather than re-extracting anything.
 *
 * Deliberately excludes any check of *how well* a statement is phrased
 * for citation - that would require a semantic/language judgment this
 * milestone's hard rule (deterministic scanners detect, LLM only
 * explains) does not allow. Every check below is a structural pattern
 * match: does an entity-typed JSON-LD block exist, does it carry the
 * fields that make an entity identifiable, do question-shaped headings
 * have a matching FAQ/QA schema block.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const STRUCTURED_DATA_ENTITY_MISSING_RULE_ID = 'structured-data-entity-missing';
export const ENTITY_DATA_INCOMPLETE_RULE_ID = 'entity-data-incomplete';
export const FAQ_CONTENT_WITHOUT_SCHEMA_RULE_ID = 'faq-content-without-schema';

/** schema.org types that identify "who is this business" to an entity-
 *  based extractor. Organization/LocalBusiness cover the general SMB
 *  case this tool's whole client base falls into; WebSite is the weakest
 *  but still a real, if thin, entity anchor. Subtypes of LocalBusiness
 *  (Hotel, Restaurant, Store, etc.) are not enumerated here - schema.org
 *  models them as an "is-a" LocalBusiness, but the @type string on the
 *  page is the subtype name, not the literal word "LocalBusiness", so an
 *  exact-match list would miss every real case. ENTITY_TYPE_PATTERN
 *  below matches on that basis instead of an enumerated list. */
const ENTITY_TYPE_PATTERN =
  /(organization|localbusiness|website|hotel|restaurant|store|corporation)$/i;

/** The entity types that describe a business, so a missing address or
 *  telephone is a real gap. WebSite anchors an entity for the existence
 *  check above but never carries either field: Yoast writes a WebSite node
 *  into the `@graph` of every page it serves, and judging it here made one
 *  incomplete-entity finding per page on a site that is not missing
 *  anything. */
const BUSINESS_ENTITY_TYPE_PATTERN =
  /(organization|localbusiness|hotel|restaurant|store|corporation)$/i;

const REQUIRED_ENTITY_FIELDS = ['name', 'address', 'telephone'];

/** A heading is treated as question-shaped only on this narrow textual
 *  signal (ends in "?"), not on any judgment about whether it reads as a
 *  "good" question - a deliberately mechanical proxy, the same posture
 *  as alt-text-quality-heuristic's own narrow, named limitation. */
export const QUESTION_HEADING_PATTERN = /\?\s*$/;
/** Below this count, a page with one or two question-shaped headings is
 *  ordinary content (an FAQ page's defining trait is several grouped
 *  Q&A pairs, not a single rhetorical heading) - conservative so this
 *  does not fire on a normal page that happens to phrase one heading as
 *  a question. */
const MIN_QUESTION_HEADINGS_FOR_FAQ_PATTERN = 3;

export interface JsonLdEntityInput {
  parsed: unknown;
}

export interface GeoPageInput {
  pageUrl: string;
  jsonLdTypes: string[];
  jsonLdEntities: JsonLdEntityInput[];
  questionHeadingCount: number;
  hasFaqSchema: boolean;
}

/** Pure: the typed nodes a parsed JSON-LD block declares. A block may be
 *  one node, an array of nodes, or a `@graph` container whose members are
 *  the nodes - the shape Yoast and Rank Math write on most WordPress sites,
 *  and the one the scanner's structured-data-extract.ts already reads.
 *  Reading only the top level made structured-data-entity-missing claim
 *  "no page declares an Organization" on sites whose every page declared
 *  one inside `@graph`. */
export function readJsonLdNodes(parsed: unknown): unknown[] {
  const nodes: unknown[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if ('@graph' in record) visit(record['@graph']);
    if ('@type' in record) nodes.push(record);
  };
  visit(parsed);
  return nodes;
}

/** Pure: reads @type off a parsed JSON-LD node, handling the single-type
 *  string form and the array-of-types form schema.org also permits.
 *  Exported so scan-site-level aggregation (structured-data-entity-
 *  missing) and this module's own per-page checks share one reading of
 *  "what type does this block declare" - a JSON-LD block with no @type
 *  or an unparseable shape contributes nothing rather than throwing,
 *  since malformed JSON-LD is already normalize-head-metadata.ts's
 *  jsonld-invalid finding, not this module's concern. */
export function readJsonLdTypes(parsed: unknown): string[] {
  if (parsed === null || typeof parsed !== 'object') return [];
  const record = parsed as Record<string, unknown>;
  const type = record['@type'];
  if (typeof type === 'string') return [type];
  if (Array.isArray(type)) return type.filter((t): t is string => typeof t === 'string');
  return [];
}

/** Pure: does this parsed JSON-LD block declare one of the entity types
 *  ENTITY_TYPE_PATTERN recognizes, and if so, which of
 *  REQUIRED_ENTITY_FIELDS is missing from it. Returns null for a block
 *  that is not an entity block at all (e.g. a BreadcrumbList or a
 *  Product), since "missing fields" is meaningless for a type this check
 *  does not judge. */
export function findMissingEntityFields(parsed: unknown): string[] | null {
  const types = readJsonLdTypes(parsed);
  if (!types.some((type) => BUSINESS_ENTITY_TYPE_PATTERN.test(type))) return null;
  if (parsed === null || typeof parsed !== 'object') return REQUIRED_ENTITY_FIELDS;
  const record = parsed as Record<string, unknown>;
  return REQUIRED_ENTITY_FIELDS.filter((field) => {
    const value = record[field];
    return typeof value !== 'string' || value.trim().length === 0;
  });
}

/**
 * structured-data-entity-missing is a site-wide fact (does any page,
 * anywhere, declare an entity), so it takes every page's JSON-LD blocks
 * at once and attributes the one resulting candidate to homepageUrl -
 * the same "attribute a site-level fact to the one page every site has"
 * pattern sitemap.ts and mentions-legales.ts already established.
 * entity-data-incomplete and faq-content-without-schema are genuinely
 * per-page, so they are emitted once per qualifying page instead.
 */
export function extractGeoCandidates(
  pages: GeoPageInput[],
  homepageUrl: string,
): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];

  const anyEntityFound = pages.some((page) =>
    page.jsonLdTypes.some((type) => ENTITY_TYPE_PATTERN.test(type)),
  );
  if (!anyEntityFound) {
    candidates.push({
      source: 'custom',
      ruleId: STRUCTURED_DATA_ENTITY_MISSING_RULE_ID,
      category: 'geo',
      severity: severityFromCustom(STRUCTURED_DATA_ENTITY_MISSING_RULE_ID),
      wcagCriteria: [],
      title: 'No structured data identifies this business as an entity',
      description:
        'No page on this site declares an Organization, LocalBusiness, or WebSite structured-data block (or a recognized subtype, such as Hotel or Restaurant). Without one, an AI answer engine has no machine-readable statement of who this business is, separate from the free text of the page.',
      pageUrl: homepageUrl,
      element: null,
      rawEvidenceForPage: {},
    });
  }

  for (const page of pages) {
    for (const entity of page.jsonLdEntities) {
      const missingFields = findMissingEntityFields(entity.parsed);
      if (missingFields === null || missingFields.length === 0) continue;
      candidates.push({
        source: 'custom',
        ruleId: ENTITY_DATA_INCOMPLETE_RULE_ID,
        category: 'geo',
        severity: severityFromCustom(ENTITY_DATA_INCOMPLETE_RULE_ID),
        wcagCriteria: [],
        title: 'Structured-data entity is missing basic identifying fields',
        description: `This page's structured-data entity block is missing: ${missingFields.join(', ')}. An entity an AI answer engine can identify but not fully describe is less useful to cite than a complete one.`,
        pageUrl: page.pageUrl,
        element: null,
        rawEvidenceForPage: { missingFields },
      });
    }

    if (page.questionHeadingCount >= MIN_QUESTION_HEADINGS_FOR_FAQ_PATTERN && !page.hasFaqSchema) {
      candidates.push({
        source: 'custom',
        ruleId: FAQ_CONTENT_WITHOUT_SCHEMA_RULE_ID,
        category: 'geo',
        severity: severityFromCustom(FAQ_CONTENT_WITHOUT_SCHEMA_RULE_ID),
        wcagCriteria: [],
        title: 'Question-and-answer content has no matching structured data',
        description: `This page has ${page.questionHeadingCount} headings phrased as questions but no FAQPage or QAPage structured-data block. That content likely reads as an FAQ to a visitor but is not marked up as one, making it harder for an AI answer engine to extract as discrete question-and-answer pairs.`,
        pageUrl: page.pageUrl,
        element: null,
        rawEvidenceForPage: { questionHeadingCount: page.questionHeadingCount },
      });
    }
  }

  return candidates;
}
