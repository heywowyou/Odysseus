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
 * docs/rules/manual-accessibility-checklist.md. Missing title is
 * deliberately NOT checked here: axe's document-title rule already flags
 * it on every page (constants.ts, LIGHTHOUSE_EXCLUDED_AUDITS).
 *
 * Missing description, non-descriptive link text, uncrawlable links and a
 * noindex directive used to be left to Lighthouse's own SEO audits. Since
 * Lighthouse only runs on a sample of pages (trade-off 109), those are
 * checked here on every page instead, and
 * lighthouseAuditsCoveredByHeadMetadata tells normalize.ts which
 * Lighthouse audits to drop on a page this check covered (trade-off 110).
 */

import { LEGAL_PATH_PATTERN } from '../urls.js';
import type { FindingCandidate } from './candidate.js';
import { extractLinkCandidates, type AnchorFactInput } from './normalize-links.js';
import { shapeIdentity } from './normalize-axe.js';
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
  /** Opening tag when the scanner captured it; absent on older artifacts. */
  html?: string;
}

export interface HreflangLinkInput {
  lang: string;
  href: string;
}

export interface LanguageSwitcherLinkInput {
  lang?: string;
  href: string;
}

export interface HeadMetadataCheckInput {
  pageUrl: string;
  title: string | null;
  metaDescription: string | null;
  canonicalUrls: string[];
  openGraphTags: Record<string, string>;
  jsonLdBlocks: JsonLdBlockInput[];
  headings: HeadingInput[];
  hreflangLinks: HreflangLinkInput[];
  languageSwitcherLinks?: LanguageSwitcherLinkInput[];
  robotsMeta: string | null;
  /** Lowercased content of <meta name="googlebot">, or null. Absent on
   *  scans made before trade-off 110, like the two fields below. */
  googlebotMeta?: string | null;
  /** The document response's X-Robots-Tag header, or null when it sent
   *  none. Absent (undefined) means it was never read, not that it was
   *  empty. */
  xRobotsTag?: string | null;
  /** Links that fail link-text or crawlable-anchors, or undefined when the
   *  link extraction did not run on this page. */
  anchors?: AnchorFactInput[];
  /** Evidence that the page is intended to be discoverable. An explicitly
   *  empty object means the scanner checked the public signals and found none;
   *  absence preserves compatibility with pre-evidence stored artifacts. */
  publicEvidence?: {
    inSitemap?: boolean;
    isHomepage?: boolean;
    isLanguageHome?: boolean;
    isHreflangTarget?: boolean;
    isCanonicalTarget?: boolean;
    linkedFromPrimaryNavigation?: boolean;
  };
}

export const META_TITLE_LENGTH_RULE_ID = 'meta-title-length';
export const META_DESCRIPTION_LENGTH_RULE_ID = 'meta-description-length';
export const CANONICAL_CONFLICTING_RULE_ID = 'canonical-conflicting';
export const CANONICAL_MISSING_RULE_ID = 'canonical-missing';
export const JSONLD_MISSING_RULE_ID = 'jsonld-missing';
export const JSONLD_INVALID_RULE_ID = 'jsonld-invalid';
export const HEADING_HIERARCHY_SKIP_RULE_ID = 'heading-hierarchy-skip';
export const MULTIPLE_H1_RULE_ID = 'multiple-h1';
export const NO_H1_RULE_ID = 'no-h1';
export const OPENGRAPH_MISSING_RULE_ID = 'opengraph-missing';
export const NOINDEX_ON_PUBLIC_PAGE_RULE_ID = 'noindex-on-public-page';
export const SITEMAP_LISTS_NOINDEX_RULE_ID = 'sitemap-lists-noindex';
export const META_DESCRIPTION_MISSING_RULE_ID = 'meta-description-missing';

/** Directives that are themselves `name: value`, so their colon never
 *  names a user agent in an X-Robots-Tag header. */
const COLON_DIRECTIVES = new Set([
  'unavailable_after',
  'max-snippet',
  'max-image-preview',
  'max-video-preview',
]);

/** Whether an X-Robots-Tag value keeps the page out of Google's index.
 *  A value may be scoped to one crawler (`otherbot: noindex`), and a scope
 *  lasts until the next one; only unscoped and googlebot directives count,
 *  which is how Lighthouse's is-crawlable audit reads it. */
function headerBlocksIndexing(header: string): boolean {
  let agent: string | null = null;
  for (const part of header.toLowerCase().split(',')) {
    let directive = part.trim();
    const scoped = /^([a-z0-9_-]+)\s*:\s*(.*)$/.exec(directive);
    if (scoped && !COLON_DIRECTIVES.has(scoped[1]!)) {
      agent = scoped[1]!;
      directive = scoped[2]!.trim();
    }
    if (agent !== null && agent !== 'googlebot') continue;
    if (directive === 'noindex' || directive === 'none') return true;
  }
  return false;
}

function metaBlocksIndexing(content: string | null | undefined): boolean {
  return (content ?? '')
    .split(',')
    .map((directive) => directive.trim())
    .some((directive) => directive === 'noindex' || directive === 'none');
}

/** Whether the page asks search engines not to index it, from either the
 * meta directive or the response header. Kept public so the orchestrator can
 * suppress only page-local SEO content checks while retaining accessibility,
 * legal and privacy checks. */
export function headMetadataHasNoindex(input: HeadMetadataCheckInput): boolean {
  return (
    metaBlocksIndexing(input.robotsMeta) ||
    metaBlocksIndexing(input.googlebotMeta) ||
    (input.xRobotsTag !== undefined &&
      input.xRobotsTag !== null &&
      headerBlocksIndexing(input.xRobotsTag))
  );
}

/**
 * Lighthouse audits this page's head-metadata extraction already answers,
 * so normalize.ts drops Lighthouse's finding for them on this page rather
 * than reporting the same defect twice. Each audit is only claimed when the
 * field that replaces it was actually extracted: a scan stored before
 * trade-off 110 keeps its Lighthouse findings.
 */
export function lighthouseAuditsCoveredByHeadMetadata(
  input: HeadMetadataCheckInput | undefined,
): ReadonlySet<string> {
  if (input === undefined) return new Set();
  const covered = new Set(['meta-description']);
  // Head metadata owns this fact whenever it ran. Older artifacts may not
  // have x-robots data, but the page-level extraction still saw robots/meta
  // directives and is the only non-sampled source for the report.
  covered.add('is-crawlable');
  if (input.anchors !== undefined) {
    covered.add('link-text');
    covered.add('crawlable-anchors');
  }
  return covered;
}

/** Common SERP-display guidance (Google truncates around 50-60 chars for
 *  titles, ~155-160 for descriptions); a title/description far outside
 *  this range is a real, checkable defect regardless of the exact
 *  cutoff, so the bounds are round numbers rather than a precisely
 *  tuned threshold. */
const TITLE_MIN_LENGTH = 30;
// 65, not 60: on eight real audits 64 of 123 flagged titles were 61 to 65
// characters, which Google usually shows in full (it truncates by pixel width).
const TITLE_MAX_LENGTH = 65;
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
  dedupeIdentity?: string,
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
    ...(dedupeIdentity !== undefined ? { dedupeIdentity } : {}),
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
          `The <title> is ${length} characters. Titles shorter than ${TITLE_MIN_LENGTH} or longer than ${TITLE_MAX_LENGTH} characters are commonly truncated or under-descriptive in search results.`,
          pageUrl,
          null,
          { title: input.title, length },
        ),
      );
    }
  }

  if (input.metaDescription === null) {
    candidates.push(
      pageCandidate(
        META_DESCRIPTION_MISSING_RULE_ID,
        'seo',
        [],
        'The page has no meta description',
        'This page has no meta description, or an empty one. Search engines then write their own snippet from page content, which is often less relevant to the search.',
        pageUrl,
        null,
        {},
      ),
    );
  } else {
    const length = input.metaDescription.length;
    if (length < DESCRIPTION_MIN_LENGTH || length > DESCRIPTION_MAX_LENGTH) {
      candidates.push(
        pageCandidate(
          META_DESCRIPTION_LENGTH_RULE_ID,
          'seo',
          [],
          'Meta description length is outside the recommended range',
          `The meta description is ${length} characters. Descriptions shorter than ${DESCRIPTION_MIN_LENGTH} or longer than ${DESCRIPTION_MAX_LENGTH} characters are commonly truncated or under-descriptive in search results.`,
          pageUrl,
          null,
          { metaDescription: input.metaDescription, length },
        ),
      );
    }
  }

  // 2026-08-24 sweep: `canonical-missing` had a severity mapping and
  // remediation copy since milestone 8 and no emitter, so a page declaring
  // no canonical at all produced nothing. The two neighbouring checks both
  // require a canonical to already exist - canonical-conflicting needs more
  // than one, and scan-page.ts only runs the canonical-target reachability
  // check when there is exactly one - so zero was the uncovered case.
  //
  // Not covered by Lighthouse either: its own `canonical` audit validates a
  // canonical that is present rather than reporting its absence. This is
  // deliberately unlike `meta-title-missing` and `meta-description-missing`,
  // which were left unimplemented in the same sweep precisely because
  // Lighthouse's `document-title` and `meta-description` audits already
  // emit for those, and adding ours would duplicate them (trade-off 1).
  if (input.canonicalUrls.length === 0) {
    candidates.push(
      pageCandidate(
        CANONICAL_MISSING_RULE_ID,
        'seo',
        [],
        'No canonical URL declared',
        'This page does not declare a canonical URL. When the same content is reachable at more than one address, search engines have to guess which one is authoritative, and may split ranking signals between them or index the wrong one.',
        pageUrl,
        null,
        {},
      ),
    );
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
        `jsonld-parse-error:${block.parseError}`,
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
          `heading-skip:${previousLevel}-${heading.level}|${shapeIdentity(heading.html ?? '') ?? 'unknown'}`,
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

  // A noindex directive on a legal page (mentions légales, CGU/CGV,
  // cookies, privacy) is usually deliberate, and Lighthouse's is-crawlable
  // audit flagged those as defects too. This check reuses the shared
  // LEGAL_PATH_PATTERN mentions-legales.ts and packages/llm's diversion
  // logic already agree on, rather than inventing a second, potentially
  // drifting definition of "this looks like a legal page", so a page is
  // only flagged when its own noindex is genuinely unexpected.
  const noindexSources = [
    ...(metaBlocksIndexing(input.robotsMeta)
      ? [`<meta name="robots" content="${input.robotsMeta}">`]
      : []),
    ...(metaBlocksIndexing(input.googlebotMeta)
      ? [`<meta name="googlebot" content="${input.googlebotMeta}">`]
      : []),
    ...(input.xRobotsTag && headerBlocksIndexing(input.xRobotsTag)
      ? [`X-Robots-Tag: ${input.xRobotsTag}`]
      : []),
  ];
  const publicEvidence = input.publicEvidence;
  const publicSignals =
    publicEvidence === undefined
      ? undefined
      : Object.entries(publicEvidence)
          .filter(([, value]) => value === true)
          .map(([signal]) => signal);
  // A sitemap entry is the only public signal a CMS writes on its own: it
  // lists taxonomy and gallery archives the site deliberately keeps out of
  // search (lacoorniche, 2026-09-24: 13 noindex category archives). When it
  // is the only signal, the contradiction between sitemap and page is the
  // defect, not a hidden public page.
  const sitemapIsOnlySignal =
    publicSignals !== undefined && publicSignals.length === 1 && publicSignals[0] === 'inSitemap';
  const noindexEvidence = {
    robotsMeta: input.robotsMeta,
    ...(input.googlebotMeta !== undefined ? { googlebotMeta: input.googlebotMeta } : {}),
    ...(input.xRobotsTag !== undefined ? { xRobotsTag: input.xRobotsTag } : {}),
    ...(publicEvidence !== undefined ? { publicEvidence } : {}),
  };
  if (noindexSources.length > 0 && !LEGAL_PATH_PATTERN.test(pageUrl) && sitemapIsOnlySignal) {
    candidates.push(
      pageCandidate(
        SITEMAP_LISTS_NOINDEX_RULE_ID,
        'seo',
        [],
        'The sitemap lists pages that ask not to be indexed',
        `This page asks search engines not to index it (${noindexSources.join('; ')}), yet the sitemap submits it for indexing. It is neither a home page nor the hreflang or canonical target of another indexable page, so the exclusion looks deliberate and the sitemap entry is the inconsistency. Remove the page from the sitemap, or remove the noindex if the page should appear in search results.`,
        pageUrl,
        null,
        noindexEvidence,
      ),
    );
  } else if (
    noindexSources.length > 0 &&
    !LEGAL_PATH_PATTERN.test(pageUrl) &&
    (publicSignals === undefined || publicSignals.length > 0)
  ) {
    candidates.push(
      pageCandidate(
        NOINDEX_ON_PUBLIC_PAGE_RULE_ID,
        'seo',
        [],
        'A public page is excluded from search results',
        `This page asks search engines not to index it (${noindexSources.join('; ')}), and its URL does not match the pattern this tool treats as an intentionally-excluded legal page (mentions légales, CGU/CGV, cookies, privacy policy). If this exclusion was not deliberate, the page cannot appear in search results at all.`,
        pageUrl,
        null,
        noindexEvidence,
      ),
    );
  }

  if (input.anchors !== undefined)
    candidates.push(...extractLinkCandidates(input.anchors, pageUrl));

  return candidates;
}
