/**
 * Milestone 8, slice 1: violation judgment for the head-metadata custom
 * checks. Mirrors normalize-custom.ts's split exactly - the scanner-side
 * extractor (packages/scanner/src/checks/head-metadata.ts) only reports
 * raw facts, this module decides which of them are defects.
 *
 * These 9 rule IDs were chosen specifically because Lighthouse's own seo/
 * performance categories (not excluded, unlike accessibility/best-
 * practices) do not already cover them - confirmed against a real
 * haaitza.com Lighthouse result during the build session, recorded in
 * docs/milestone-8-scope-addendum.md's build notes. Missing title,
 * missing description, and missing canonical are deliberately NOT
 * checked here: Lighthouse's document-title, meta-description, and
 * canonical audits already flag those, and duplicating them would
 * recreate the exact axe/Lighthouse-accessibility duplicate-finding
 * mistake CLAUDE.md documents once already, just for SEO instead of
 * accessibility.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export interface JsonLdBlockInput {
  raw: string;
  parsed: unknown | null;
  selector: string;
  parseError?: string;
}

export interface HeadingInput {
  level: number;
  text: string;
  selector: string;
}

export interface HeadMetadataCheckInput {
  pageUrl: string;
  title: string | null;
  metaDescription: string | null;
  canonicalUrls: string[];
  openGraphTags: Record<string, string>;
  jsonLdBlocks: JsonLdBlockInput[];
  headings: HeadingInput[];
}

export const META_TITLE_LENGTH_RULE_ID = 'meta-title-length';
export const META_DESCRIPTION_LENGTH_RULE_ID = 'meta-description-length';
export const CANONICAL_CONFLICTING_RULE_ID = 'canonical-conflicting';
export const JSONLD_MISSING_RULE_ID = 'jsonld-missing';
export const JSONLD_INVALID_RULE_ID = 'jsonld-invalid';
export const HEADING_HIERARCHY_SKIP_RULE_ID = 'heading-hierarchy-skip';
export const MULTIPLE_H1_RULE_ID = 'multiple-h1';
export const NO_H1_RULE_ID = 'no-h1';
export const OPENGRAPH_MISSING_RULE_ID = 'opengraph-missing';

/** Common SERP-display guidance (Google truncates around 50-60 chars for
 *  titles, ~155-160 for descriptions); a title/description far outside
 *  this range is a real, checkable defect regardless of the exact
 *  cutoff, so the bounds are round numbers rather than a precisely
 *  tuned threshold. */
const TITLE_MIN_LENGTH = 30;
const TITLE_MAX_LENGTH = 60;
const DESCRIPTION_MIN_LENGTH = 70;
const DESCRIPTION_MAX_LENGTH = 160;

const REQUIRED_OG_PROPERTIES = ['og:title', 'og:description', 'og:image'];

function pageCandidate(
  ruleId: string,
  category: FindingCandidate['category'],
  wcagCriteria: string[],
  title: string,
  description: string,
  pageUrl: string,
  element: FindingCandidate['element'],
  rawEvidenceForPage: Record<string, unknown>,
): FindingCandidate {
  return {
    source: 'custom',
    ruleId,
    category,
    severity: severityFromCustom(ruleId),
    wcagCriteria,
    title,
    description,
    pageUrl,
    element,
    rawEvidenceForPage,
  };
}

/** Absolute-URL comparison so "https://example.com/" and
 *  "https://example.com" (or a relative href resolved against pageUrl)
 *  are not treated as conflicting when they resolve to the same place.
 *  An unparseable href is kept as its raw string, so it still
 *  contributes to "not all equal" rather than silently dropping out. */
function normalizeUrl(href: string, pageUrl: string): string {
  try {
    return new URL(href, pageUrl).href;
  } catch {
    return href;
  }
}

export function extractHeadMetadataCandidates(input: HeadMetadataCheckInput): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];
  const { pageUrl } = input;

  if (input.title !== null) {
    const length = input.title.length;
    if (length < TITLE_MIN_LENGTH || length > TITLE_MAX_LENGTH) {
      candidates.push(
        pageCandidate(
          META_TITLE_LENGTH_RULE_ID,
          'seo',
          [],
          'Page title length is outside the recommended range',
          `The <title> is ${length} characters. Titles much shorter than ${TITLE_MIN_LENGTH} or longer than ${TITLE_MAX_LENGTH} characters are commonly truncated or under-descriptive in search results.`,
          pageUrl,
          null,
          { title: input.title, length },
        ),
      );
    }
  }

  if (input.metaDescription !== null) {
    const length = input.metaDescription.length;
    if (length < DESCRIPTION_MIN_LENGTH || length > DESCRIPTION_MAX_LENGTH) {
      candidates.push(
        pageCandidate(
          META_DESCRIPTION_LENGTH_RULE_ID,
          'seo',
          [],
          'Meta description length is outside the recommended range',
          `The meta description is ${length} characters. Descriptions much shorter than ${DESCRIPTION_MIN_LENGTH} or longer than ${DESCRIPTION_MAX_LENGTH} characters are commonly truncated or under-descriptive in search results.`,
          pageUrl,
          null,
          { metaDescription: input.metaDescription, length },
        ),
      );
    }
  }

  if (input.canonicalUrls.length > 1) {
    const normalized = input.canonicalUrls.map((href) => normalizeUrl(href, pageUrl));
    const distinct = new Set(normalized);
    if (distinct.size > 1) {
      candidates.push(
        pageCandidate(
          CANONICAL_CONFLICTING_RULE_ID,
          'seo',
          [],
          'Multiple conflicting canonical tags found',
          `This page declares ${input.canonicalUrls.length} canonical URLs that do not all point to the same place: ${input.canonicalUrls.join(', ')}. Browsers and search engines pick one arbitrarily, which can send ranking signals to the wrong URL.`,
          pageUrl,
          null,
          { canonicalUrls: input.canonicalUrls },
        ),
      );
    }
  }

  if (input.jsonLdBlocks.length === 0) {
    candidates.push(
      pageCandidate(
        JSONLD_MISSING_RULE_ID,
        'seo',
        [],
        'No structured data (JSON-LD) found',
        'This page has no application/ld+json script block. Structured data helps search engines understand and richly display the page content.',
        pageUrl,
        null,
        {},
      ),
    );
  }

  for (const block of input.jsonLdBlocks) {
    if (block.parseError === undefined) continue;
    candidates.push(
      pageCandidate(
        JSONLD_INVALID_RULE_ID,
        'seo',
        [],
        'Structured data (JSON-LD) is not valid JSON',
        `A structured data block failed to parse: ${block.parseError}. Search engines cannot read invalid JSON-LD, so it provides no benefit while present.`,
        pageUrl,
        { pageUrl, selector: block.selector, snippet: block.raw.slice(0, 500) },
        { parseError: block.parseError },
      ),
    );
  }

  let previousLevel: number | null = null;
  for (const heading of input.headings) {
    if (previousLevel !== null && heading.level > previousLevel + 1) {
      candidates.push(
        pageCandidate(
          HEADING_HIERARCHY_SKIP_RULE_ID,
          'accessibility',
          ['1.3.1'],
          'Heading level skips a level in the hierarchy',
          `A heading level ${heading.level} ("${heading.text.slice(0, 80)}") follows a level ${previousLevel} heading without an intervening level ${previousLevel + 1}. Skipped heading levels make the document structure harder to follow with assistive technology.`,
          pageUrl,
          { pageUrl, selector: heading.selector, snippet: heading.text.slice(0, 500) },
          { level: heading.level, previousLevel, text: heading.text },
        ),
      );
    }
    previousLevel = heading.level;
  }

  const h1Count = input.headings.filter((heading) => heading.level === 1).length;
  if (h1Count > 1) {
    candidates.push(
      pageCandidate(
        MULTIPLE_H1_RULE_ID,
        'accessibility',
        ['1.3.1'],
        'Multiple <h1> headings found',
        `This page has ${h1Count} level-1 headings. A single, clear top-level heading best represents the page's primary topic to assistive technology and search engines.`,
        pageUrl,
        null,
        { h1Count },
      ),
    );
  } else if (h1Count === 0) {
    candidates.push(
      pageCandidate(
        NO_H1_RULE_ID,
        'accessibility',
        ['1.3.1'],
        'No <h1> heading found',
        'This page has no level-1 heading. A missing top-level heading leaves the page without a clear primary topic for assistive technology and search engines.',
        pageUrl,
        null,
        { headingLevelsFound: input.headings.map((heading) => heading.level) },
      ),
    );
  }

  const hasCoreOgTags = REQUIRED_OG_PROPERTIES.some((property) => property in input.openGraphTags);
  if (!hasCoreOgTags) {
    candidates.push(
      pageCandidate(
        OPENGRAPH_MISSING_RULE_ID,
        'seo',
        [],
        'No Open Graph tags found',
        'This page has none of the core Open Graph tags (og:title, og:description, og:image). Social platforms fall back to an unpredictable guess when generating a share preview.',
        pageUrl,
        null,
        {},
      ),
    );
  }

  return candidates;
}
