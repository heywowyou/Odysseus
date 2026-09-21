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

import { buildCanonicalPageUrlMap, type TranslationCluster } from './translation-clusters.js';
import {
  normalizeCookieConsent,
  type CookieConsentCheckInput,
} from './normalize-cookie-consent.js';
import {
  normalizeAccessibilityStatement,
  type AccessibilityStatementCheckInput,
} from './normalize-accessibility-statement.js';
import {
  normalizeNapConsistency,
  type NapConsistencyCheckInput,
} from './normalize-nap-consistency.js';
import { normalizeReflow, type ReflowCheckInput } from './normalize-reflow.js';
import { normalizeHtmlValidity, type HtmlValidityCheckInput } from './normalize-html-validity.js';
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
import {
  computeSupersededAudits,
  extractLighthouseCandidates,
  type LighthouseResultInput,
} from './normalize-lighthouse.js';
import { extractRenderDiffCandidates, unusableRawFetches } from './normalize-renderdiff.js';
import { extractCustomCandidates, type MentionsLegalesCheckInput } from './normalize-custom.js';
import {
  extractHeadMetadataCandidates,
  lighthouseAuditsCoveredByHeadMetadata,
  type HeadMetadataCheckInput,
} from './normalize-head-metadata.js';
import { extractSitemapCandidates, type SitemapCheckInput } from './normalize-sitemap.js';
import {
  extractCrawlCandidates,
  type CrawlPageInput,
  type NormalizeCrawlInput,
} from './normalize-crawl.js';
import { extractHreflangCandidates } from './normalize-hreflang.js';
import {
  extractMixedContentCandidates,
  type MixedContentCheckInput,
} from './normalize-mixed-content.js';
import {
  extractKeyboardNavigationCandidates,
  type KeyboardNavigationCheckInput,
} from './normalize-keyboard-navigation.js';
import {
  extractFormErrorHandlingCandidates,
  type FormErrorHandlingCheckInput,
} from './normalize-form-error-handling.js';
import {
  extractVideoCaptionsCandidates,
  type VideoCaptionsCheckInput,
} from './normalize-video-captions.js';
import {
  extractPlaceholderLabelCandidates,
  type PlaceholderLabelsCheckInput,
} from './normalize-placeholder-labels.js';
import { extractAltTextCandidates, type AltTextCheckInput } from './normalize-alt-text.js';
import {
  extractCanonicalTargetCandidates,
  type CanonicalTargetCheckInput,
} from './normalize-canonical-target.js';
import { extractLlmsTxtCandidates, type LlmsTxtCheckInput } from './normalize-llms-txt.js';
import {
  extractGeoCandidates,
  readJsonLdTypes,
  QUESTION_HEADING_PATTERN,
  type GeoPageInput,
} from './normalize-geo.js';
import {
  extractSecurityHeadersCandidates,
  type SecurityHeadersCheckInput,
} from './normalize-security-headers.js';
import {
  extractStructuredDataCandidates,
  type StructuredDataCheckInput,
} from './normalize-structured-data.js';
import {
  extractCruxCandidates,
  goodFieldMetrics,
  type CruxFieldDataCheckInput,
} from './normalize-crux.js';
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
  /** Milestone 8.5a. Only set when this page declares exactly one
   *  canonical URL pointing at a different page - see
   *  packages/scanner/src/checks/canonical-target.ts. */
  canonicalTarget?: CanonicalTargetCheckInput;
  /** Only set on the crawl's own start URL (see scan-site.ts) - sitemap
   *  is a site-level concept, not a per-page one. */
  sitemapCheck?: SitemapCheckInput;
  /** Milestone 8.5a. Only set on the crawl's own start URL, same
   *  attribution as sitemapCheck above. */
  llmsTxtCheck?: LlmsTxtCheckInput;
  mixedContent?: MixedContentCheckInput;
  keyboardNavigation?: KeyboardNavigationCheckInput;
  formErrorHandling?: FormErrorHandlingCheckInput;
  videoCaptions?: VideoCaptionsCheckInput;
  placeholderLabels?: PlaceholderLabelsCheckInput;
  altText?: AltTextCheckInput;
  /** Milestone 8.6. Site-level, only set on the crawl's own start URL -
   *  same attribution pattern sitemapCheck/llmsTxtCheck already
   *  established, since response headers are near-always identical
   *  across a site's pages. */
  securityHeaders?: SecurityHeadersCheckInput;
  /** C1 (2026-08-24). Site-level, present only on the homepage's scan. */
  cookieConsent?: CookieConsentCheckInput;
  /** C4 (2026-08-24). Site-level, present only on the homepage's scan. */
  accessibilityStatement?: AccessibilityStatementCheckInput;
  /** C6 (2026-08-24). Per-page: contact details can legitimately differ
   *  between a contact page and a property page. */
  napConsistency?: NapConsistencyCheckInput;
  /** C3 (2026-08-24). Per-page WCAG 1.4.10 measurement. */
  reflow?: ReflowCheckInput;
  /** C7 (2026-08-24). Per-page structural markup validity. */
  htmlValidity?: HtmlValidityCheckInput;
  /** Milestone 8.6. Runs on every page (JSON-LD/microdata/RDFa are a
   *  per-page concern, same as headMetadata). */
  structuredData?: StructuredDataCheckInput;
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
  /** Milestone 8.6. Origin-level, not per-page - see
   *  CruxFieldDataResult's doc comment (types/manifest.ts) for why this
   *  lives at the audit level rather than attached to any one page. */
  cruxFieldData?: CruxFieldDataCheckInput;
  /** B2 (2026-08-24). Language-variant groups, built from the site's own
   *  hreflang declarations (translation-clusters.ts). Optional so
   *  offline re-normalization against a manifest predating this field
   *  still works - it simply gets no collapsing, exactly the behaviour
   *  before this change. Never affects what was scanned or what was
   *  detected: purely which pages count as the same place when
   *  collapsing duplicate findings. */
  translationClusters?: readonly TranslationCluster[];
}

/**
 * Issue #101: the one anchor for every site-level finding (CrUX field
 * data, hreflang-missing, structured-data-entity-missing). These findings
 * are facts about the site, but a Finding must still name a page, and the
 * report's appendix prints that page as where the fact was established.
 * The crawl start URL used to win unconditionally, so on a site whose
 * start URL redirects or is a bare language root recorded
 * discovered-not-scanned, the report attributed real-user metrics and
 * missing-markup facts to a page no scanner ever ran - and the executive
 * summary then claimed one more affected page than the analyzed scope
 * contained (the real Villas Foch report said 29 pages over a 28-page
 * scope). Trade-off 64's principle binds here: a finding is never
 * propagated to a page no scanner actually ran on.
 *
 * The start URL keeps the anchor when it was itself content-checked (the
 * common case, and byte-identical output for every audit where it was).
 * Only when it was not does the anchor move to the content-checked page
 * closest to the homepage: shallowest crawl depth first, then URL
 * ascending so the choice is deterministic regardless of page order,
 * which differs between a live run (crawl order) and `normalize <dir>`
 * (directory read order). Undefined only when nothing was content-checked
 * at all, in which case no site-level candidate is emitted rather than a
 * mis-anchored one.
 */
function resolveSiteLevelAnchorUrl(input: NormalizeAuditInput): string | undefined {
  const startUrl = input.crawl?.startUrl;
  if (startUrl !== undefined && input.pages.some((page) => page.url === startUrl)) {
    return startUrl;
  }
  const depthByUrl = new Map(
    (input.crawl?.pages ?? [])
      .filter((page): page is CrawlPageInput & { depth: number } => page.depth !== undefined)
      .map((page) => [page.url, page.depth]),
  );
  return [...input.pages]
    .map((page) => ({ url: page.url, depth: depthByUrl.get(page.url) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.depth - b.depth || a.url.localeCompare(b.url))[0]?.url;
}

function collectCandidates(input: NormalizeAuditInput): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];
  // D13: resolved over every page before any page is normalized, so a
  // successor emitting on one page suppresses its legacy audits everywhere.
  const supersededAudits = computeSupersededAudits(
    input.pages
      .map((page) => page.lighthouse)
      .filter((lhr): lhr is LighthouseResultInput => lhr !== undefined),
  );

  // Issue #301: whether a page's raw fetch received the page at all is
  // partly a cross-page question, so it is resolved over the whole audit
  // before any page is normalized.
  const unusableRaw = unusableRawFetches(
    input.pages
      .filter((page) => page.renderDiff !== undefined)
      .map((page) => ({
        pageUrl: page.url,
        httpStatus: page.renderDiff?.httpStatus,
        rawDocument: page.renderDiff?.rawDocument,
      })),
  );

  // Issue #300: resolved once for the whole audit, since CrUX is a
  // site-level record.
  const goodFieldMetricKeys = goodFieldMetrics(input.cruxFieldData);

  // Issue #302: two statuses mean "this page was scanned, but what was
  // scanned is not this URL's own content": an error template served under
  // its own URL, and a client-side redirect stub (issue #85). Both are
  // already excluded from the analysed-page list, by never receiving
  // analysisCoverage. Findings were not excluded with them, so a real
  // audit carried four copies of one 404 template's defects and counted
  // them against the site. Reported once here, at the only place that
  // sees every page's candidates.
  const contentExcludedUrls = new Set(
    (input.crawl?.pages ?? [])
      .filter(
        (page) => page.status === 'soft-error-page' || page.status === 'redirect-interstitial',
      )
      .map((page) => page.url),
  );

  for (const page of input.pages) {
    if (contentExcludedUrls.has(page.url)) continue;
    if (page.axe) candidates.push(...extractAxeCandidates(page.axe, page.url));
    if (page.lighthouse) {
      // Trade-off 110: audits the head-metadata check already answered on
      // this page are reported from there, on every page, not from here.
      const coveredAudits = lighthouseAuditsCoveredByHeadMetadata(page.headMetadata);
      candidates.push(
        ...extractLighthouseCandidates(
          page.lighthouse,
          page.url,
          supersededAudits,
          goodFieldMetricKeys,
        ).filter((candidate) => !coveredAudits.has(candidate.ruleId)),
      );
    }
    if (page.renderDiff) {
      candidates.push(
        ...extractRenderDiffCandidates(page.renderDiff, page.url, unusableRaw.get(page.url)),
      );
    }
    if (page.mentionsLegales) candidates.push(...extractCustomCandidates(page.mentionsLegales));
    if (page.headMetadata) candidates.push(...extractHeadMetadataCandidates(page.headMetadata));
    if (page.canonicalTarget)
      candidates.push(...extractCanonicalTargetCandidates(page.canonicalTarget));
    if (page.sitemapCheck) candidates.push(...extractSitemapCandidates(page.sitemapCheck));
    if (page.llmsTxtCheck)
      candidates.push(...extractLlmsTxtCandidates(page.llmsTxtCheck, page.url));
    if (page.mixedContent) candidates.push(...extractMixedContentCandidates(page.mixedContent));
    if (page.keyboardNavigation)
      candidates.push(...extractKeyboardNavigationCandidates(page.keyboardNavigation));
    if (page.formErrorHandling)
      candidates.push(...extractFormErrorHandlingCandidates(page.formErrorHandling));
    if (page.videoCaptions) candidates.push(...extractVideoCaptionsCandidates(page.videoCaptions));
    if (page.placeholderLabels)
      candidates.push(...extractPlaceholderLabelCandidates(page.placeholderLabels));
    if (page.altText) candidates.push(...extractAltTextCandidates(page.altText));
    if (page.securityHeaders)
      candidates.push(...extractSecurityHeadersCandidates(page.securityHeaders, page.url));
    if (page.cookieConsent)
      candidates.push(...normalizeCookieConsent(page.cookieConsent, page.url));
    if (page.accessibilityStatement)
      candidates.push(...normalizeAccessibilityStatement(page.accessibilityStatement, page.url));
    if (page.napConsistency)
      candidates.push(...normalizeNapConsistency(page.napConsistency, page.url));
    if (page.reflow) candidates.push(...normalizeReflow(page.reflow, page.url));
    if (page.htmlValidity) candidates.push(...normalizeHtmlValidity(page.htmlValidity, page.url));
    if (page.structuredData)
      candidates.push(...extractStructuredDataCandidates(page.structuredData));
  }

  if (input.crawl) candidates.push(...extractCrawlCandidates(input.crawl));

  if (input.cruxFieldData) {
    const homepageUrl = resolveSiteLevelAnchorUrl(input);
    if (homepageUrl) candidates.push(...extractCruxCandidates(input.cruxFieldData, homepageUrl));
  }

  // Every crawled page with head metadata is passed, including pages
  // declaring no hreflang at all. Filtering to pages that already have
  // hreflang made `hreflang-missing` unreachable by construction, since it
  // fires precisely when no page has any - the emitter existed, its unit
  // tests passed against a direct call, and a real trilingual site
  // (lagnonu.fr, 65 pages, zero hreflang) still produced no finding.
  // Passing every page also lets the reciprocity check above distinguish a
  // crawled target that genuinely fails to link back from one it cannot
  // see; it previously treated both as "outside crawl scope".
  const hreflangPages = input.pages
    .filter((page) => page.headMetadata)
    .map((page) => ({ url: page.url, hreflangLinks: page.headMetadata!.hreflangLinks }));
  if (hreflangPages.length > 0) {
    candidates.push(...extractHreflangCandidates(hreflangPages, resolveSiteLevelAnchorUrl(input)));
  }

  const pagesWithHeadMetadata = input.pages.filter((page) => page.headMetadata);
  if (pagesWithHeadMetadata.length > 0) {
    // Milestone 8.5a. Reads the same jsonLdBlocks/headings facts
    // normalize-head-metadata.ts already reads, for a different,
    // additive judgment - see normalize-geo.ts's own header comment for
    // why this is not a re-extraction.
    const geoPages: GeoPageInput[] = pagesWithHeadMetadata.map((page) => {
      const jsonLdTypes = page.headMetadata!.jsonLdBlocks.flatMap((block) =>
        readJsonLdTypes(block.parsed),
      );
      return {
        pageUrl: page.url,
        jsonLdTypes,
        jsonLdEntities: page.headMetadata!.jsonLdBlocks.map((block) => ({ parsed: block.parsed })),
        questionHeadingCount: page.headMetadata!.headings.filter((heading) =>
          QUESTION_HEADING_PATTERN.test(heading.text.trim()),
        ).length,
        hasFaqSchema: jsonLdTypes.some((type) => /^(faqpage|qapage)$/i.test(type)),
      };
    });
    const homepageUrl = resolveSiteLevelAnchorUrl(input);
    if (homepageUrl) candidates.push(...extractGeoCandidates(geoPages, homepageUrl));
  }

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

  const severity = group.map((c) => c.severity).reduce((acc, s) => maxSeverity(acc, s));

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

  // B4 (2026-08-24): the affected files, lifted out of the per-page evidence
  // so they survive the last-write-wins collapse above. A site-wide resource
  // finding (normalize-lighthouse.ts's RESOURCE_IDENTIFIED_LIGHTHOUSE_AUDITS)
  // has many candidates per page, so perPage keeps exactly one of them -
  // which is acceptable for a page's score but would throw away the list of
  // files the client actually has to fix. Sorted for a stable diff, deduped
  // because one file referenced from several pages is one thing to fix.
  // D12 (2026-08-25): two shapes reach here. Node-carrying audits push one
  // candidate per element with a singular `resourceUrl`; url-only audits push
  // one candidate per page with the page's whole `resourceUrls` list, so that
  // their occurrence count stays one-per-page rather than one-per-file.
  const resourceUrls = [
    ...new Set(
      group.flatMap((c) => {
        const single = c.rawEvidenceForPage['resourceUrl'];
        const many = c.rawEvidenceForPage['resourceUrls'];
        // Issue #292: axe records the file on the element rather than in
        // the per-page evidence, and collapsing a rule over a shared page
        // scope is exactly when that list stops being derivable from the
        // capped element sample - one image-alt row now stands for every
        // image, so it has to name them.
        const values = Array.isArray(many) ? many : [single, c.element?.resourceUrl];
        return values.filter((url): url is string => typeof url === 'string' && url.length > 0);
      }),
    ),
  ].sort();

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
        selector: first.dedupeIdentity ?? first.element?.selector ?? '',
      },
      ...(resourceUrls.length > 0 ? { resourceUrls } : {}),
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
 * node even when every node is the same underlying defect repeated
 * across the same set of pages. The fine per-selector groups above are
 * correct and stay untouched: a selector genuinely repeated across pages
 * must still collapse into one finding, and genuinely different
 * selectors must stay distinct. This second pass only catches the case
 * that fine grouping cannot: two or more fine groups that each cover the
 * exact same page scope for the same source and rule. Only then are they
 * combined into one finding, with a new dedupeKey computed from that
 * scope instead of a selector (reusing computeDedupeKey unchanged, the
 * same way page-scoped candidates already reuse it with an empty-string
 * selector). A fine group that is the only occupant of its coarse bucket
 * (the common case: one selector, one occurrence) passes through with
 * its original dedupeKey, unchanged.
 *
 * B2 (2026-08-24): page scope is judged after mapping each page onto its
 * translation cluster's canonical URL. A real Haaitza audit had 182 of
 * its 265 link-name findings each spanning exactly five pages, and those
 * five were always the fr/en/it/es/pt-pt variants of one gallery page -
 * one defect in one shared template, reported five times, which alone
 * drove a 265-entry finding-id list and most of an 81-page report. Those
 * groups are one page once the variants are recognised as one place, so
 * this existing pass handles them with no second mechanism and no
 * selector rewriting (which CLAUDE.md trade-off 3 rejected, for reasons
 * that still hold - nothing here touches a selector).
 *
 * Issue #292: the scope this pass compares used to be "exactly one
 * canonical page", which was an accident of the first case it was
 * written for rather than a principle. A Villas Foch audit produced 164
 * image-alt findings and 176 "critique" totals off a 24-page site,
 * because every gallery image sat on all 24 pages: identical rule,
 * identical remediation, identical page scope, and the one-page
 * condition let none of them meet. The annex then spent about 30 pages
 * printing them, 168 of the rows ending in "the same pages as f001" -
 * the report's own evidence that the scope was shared. Haaitza split
 * target-size into 30 findings the same way, one per menu item, each on
 * the same 2 pages.
 *
 * The condition is therefore the scope itself, at any size: fine groups
 * covering exactly the same canonical pages for the same rule are one
 * problem with many occurrences. Groups covering different scopes still
 * stay apart, which is what keeps two sliders on two different pages two
 * findings. This widens an accepted trade-off rather than making a new
 * one - per-element detail beyond the stored element sample was already
 * being dropped by this pass whenever the scope happened to be a single
 * page.
 *
 * The merged Finding still carries every real page URL it was seen on:
 * canonicalization decides grouping only, never what is recorded. On a
 * monolingual site the map is empty and every page maps to itself.
 */
function aggregateSharedScopeOccurrences(
  fineGroups: Map<string, FindingCandidate[]>,
  canonicalPageUrl: (pageUrl: string) => string,
): Map<string, FindingCandidate[]> {
  const fineKeysByCoarseKey = new Map<string, string[]>();
  const scopeByCoarseKey = new Map<string, string>();

  for (const [fineKey, group] of fineGroups) {
    const first = group[0];
    if (!first) continue;

    // The canonical pages, sorted, so the scope - and the dedupeKey
    // derived from it - is stable across runs even if the crawl reaches
    // the pages in a different order. Cross-run identity for the
    // monitoring tier is dedupeKey (CLAUDE.md trade-off 3).
    const scope = [...new Set(group.map((c) => canonicalPageUrl(c.pageUrl)))].sort().join(' ');

    // D4 (2026-08-25): aggregating purely on source and rule undid the
    // deliberate identities introduced the same day. For the alt-text
    // heuristic it merged two genuinely different instructions ("write alt
    // text for this image" and "these images share one alt text") into one
    // finding carrying only one of the two titles.
    //
    // The title is what separates them, and it is the honest test: this pass
    // exists to collapse one rule's positional selectors over one scope, and
    // two candidates that would print different titles are not that. Keying
    // on dedupeIdentity was tried first and is subtly wrong - it also splits
    // candidates that differ only in which template emitted them while saying
    // exactly the same thing, which cost a real sas-fernande.fr carousel its
    // merge (a "previous slide" and a "next slide" arrow, one component, one
    // fix, two rows). Candidates with no identity and one title behave
    // exactly as they did before either change.
    // 1dfe513 then unified every alt-text heuristic title so no single
    // signal is presented as the meaning of the rule (issue #68), which
    // removed the very separator this key relies on and merged those two
    // instructions back into one finding. coarseGroupIdentity is how a rule
    // with a deliberately broad title says so explicitly, instead of the
    // separation depending on title wording nobody realises is load-bearing.
    const coarseKey = `${first.source}|${first.ruleId}|${first.title}|${first.coarseGroupIdentity ?? ''}|${scope}`;
    scopeByCoarseKey.set(coarseKey, scope);
    const fineKeys = fineKeysByCoarseKey.get(coarseKey);
    if (fineKeys) {
      fineKeys.push(fineKey);
    } else {
      fineKeysByCoarseKey.set(coarseKey, [fineKey]);
    }
  }

  const result = new Map<string, FindingCandidate[]>();
  const consumedFineKeys = new Set<string>();

  for (const [coarseKey, fineKeys] of fineKeysByCoarseKey) {
    if (fineKeys.length < 2) continue;

    const combined: FindingCandidate[] = [];
    for (const fineKey of fineKeys) {
      combined.push(...(fineGroups.get(fineKey) ?? []));
      consumedFineKeys.add(fineKey);
    }

    const first = combined[0];
    if (!first) continue;
    const dedupeKey = computeDedupeKey(
      first.source,
      first.ruleId,
      scopeByCoarseKey.get(coarseKey) ?? '',
    );
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
    // dedupeIdentity wins when an extractor has declared that this rule's
    // identity is not its element (see FindingCandidate.dedupeIdentity).
    const identity = candidate.dedupeIdentity ?? candidate.element?.selector ?? '';
    const key = computeDedupeKey(candidate.source, candidate.ruleId, identity);
    const group = fineGroups.get(key);
    if (group) {
      group.push(candidate);
    } else {
      fineGroups.set(key, [candidate]);
    }
  }

  const canonicalByPageUrl = buildCanonicalPageUrlMap(input.translationClusters ?? []);
  const groups = aggregateSharedScopeOccurrences(
    fineGroups,
    (pageUrl) => canonicalByPageUrl.get(pageUrl) ?? pageUrl,
  );

  const merged = [...groups.entries()].map(([dedupeKey, group]) =>
    mergeGroup(input.auditId, dedupeKey, group, input.startedAt),
  );

  return assignFindingIds(merged);
}
