/**
 * Writes a completed site scan to disk in the layout described in
 * paths.ts: manifest.json plus one pages/<slug>-<hash>/scan.json per
 * scanned page. Screenshots themselves are written earlier, in place,
 * during scanSite (the caller passes the correct pages/ parent directory
 * into scanSite's screenshotDir option before scanning starts), so there
 * is no write-then-move step here.
 *
 * Deliberately never calls @odysseus/core's normalizeAudit or writes
 * findings.json: scanner is I/O, core is pure normalization, and only the
 * CLI composes the two together (plus persistence via @odysseus/store).
 * Keeping that boundary means scanner never has to know what a Finding
 * is.
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright';
import {
  extractCoreWebVitals,
  extractLighthouseExcludedCategoryScores,
  type AuditConfigSnapshot,
  type AuditManifest,
  type AuditManifestSiteSignals,
  type CruxFieldDataResult,
  type ManifestKind,
  type ManifestPageEntry,
  type PageAnalysisCoverage,
  type PrivacySecurityCoverage,
  buildTranslationClusters,
} from '@odysseus/core';
import { getArtifactsRoot } from '../config.js';
import type { CrawlResult } from '../crawl.js';
import type { PageScanResult } from '../scan-page.js';
import type { NormalizePageInput } from '@odysseus/core';
import { buildAuditDir, buildPageDir } from './paths.js';
import { toAuditRelativeRefs } from './relativize.js';
import { collectToolVersions } from './versions.js';
import { buildManifest } from './manifest.js';

export interface WriteAuditArtifactsInput {
  kind: ManifestKind;
  siteResult: {
    crawl: CrawlResult;
    pages: PageScanResult[];
    cruxFieldData?: CruxFieldDataResult;
    analysisCoverageByUrl?: ReadonlyMap<string, PageAnalysisCoverage>;
  };
  browser: Browser;
  startedAt: Date;
  finishedAt: Date;
  config: AuditConfigSnapshot;
  /** Generated via crypto.randomUUID() if omitted. */
  auditId?: string;
}

export interface WriteAuditArtifactsResult {
  auditId: string;
  auditDir: string;
  manifest: AuditManifest;
  /** Relativized and ready to hand straight to @odysseus/core's
   *  normalizeAudit(). */
  pages: NormalizePageInput[];
}

function buildScanJson(
  scanResult: PageScanResult,
  relativizedRenderDiff: PageScanResult['renderDiff'],
): PageScanResult {
  return {
    url: scanResult.url,
    ...(relativizedRenderDiff !== undefined ? { renderDiff: relativizedRenderDiff } : {}),
    ...(scanResult.renderDiffError !== undefined
      ? { renderDiffError: scanResult.renderDiffError }
      : {}),
    ...(scanResult.axe !== undefined ? { axe: scanResult.axe } : {}),
    ...(scanResult.axeError !== undefined ? { axeError: scanResult.axeError } : {}),
    ...(scanResult.lighthouse !== undefined ? { lighthouse: scanResult.lighthouse } : {}),
    ...(scanResult.lighthouseError !== undefined
      ? { lighthouseError: scanResult.lighthouseError }
      : {}),
    ...(scanResult.mentionsLegales !== undefined
      ? { mentionsLegales: scanResult.mentionsLegales }
      : {}),
    ...(scanResult.mentionsLegalesError !== undefined
      ? { mentionsLegalesError: scanResult.mentionsLegalesError }
      : {}),
    ...(scanResult.transactionalFlowEvidence !== undefined
      ? { transactionalFlowEvidence: scanResult.transactionalFlowEvidence }
      : {}),
    ...(scanResult.transactionalFlowRedirectChecks !== undefined
      ? { transactionalFlowRedirectChecks: scanResult.transactionalFlowRedirectChecks }
      : {}),
    ...(scanResult.transactionalFlowAmbiguities !== undefined
      ? { transactionalFlowAmbiguities: scanResult.transactionalFlowAmbiguities }
      : {}),
    ...(scanResult.headMetadata !== undefined ? { headMetadata: scanResult.headMetadata } : {}),
    ...(scanResult.headMetadataError !== undefined
      ? { headMetadataError: scanResult.headMetadataError }
      : {}),
    ...(scanResult.canonicalTarget !== undefined
      ? { canonicalTarget: scanResult.canonicalTarget }
      : {}),
    ...(scanResult.sitemapCheck !== undefined ? { sitemapCheck: scanResult.sitemapCheck } : {}),
    ...(scanResult.llmsTxtCheck !== undefined ? { llmsTxtCheck: scanResult.llmsTxtCheck } : {}),
    ...(scanResult.mixedContent !== undefined ? { mixedContent: scanResult.mixedContent } : {}),
    ...(scanResult.mixedContentError !== undefined
      ? { mixedContentError: scanResult.mixedContentError }
      : {}),
    ...(scanResult.keyboardNavigation !== undefined
      ? { keyboardNavigation: scanResult.keyboardNavigation }
      : {}),
    ...(scanResult.keyboardNavigationError !== undefined
      ? { keyboardNavigationError: scanResult.keyboardNavigationError }
      : {}),
    ...(scanResult.formErrorHandling !== undefined
      ? { formErrorHandling: scanResult.formErrorHandling }
      : {}),
    ...(scanResult.formErrorHandlingError !== undefined
      ? { formErrorHandlingError: scanResult.formErrorHandlingError }
      : {}),
    ...(scanResult.videoCaptions !== undefined ? { videoCaptions: scanResult.videoCaptions } : {}),
    ...(scanResult.videoCaptionsError !== undefined
      ? { videoCaptionsError: scanResult.videoCaptionsError }
      : {}),
    ...(scanResult.altText !== undefined ? { altText: scanResult.altText } : {}),
    ...(scanResult.altTextError !== undefined ? { altTextError: scanResult.altTextError } : {}),
    ...(scanResult.securityHeaders !== undefined
      ? { securityHeaders: scanResult.securityHeaders }
      : {}),
    ...(scanResult.cookieConsent !== undefined ? { cookieConsent: scanResult.cookieConsent } : {}),
    ...(scanResult.accessibilityStatement !== undefined
      ? { accessibilityStatement: scanResult.accessibilityStatement }
      : {}),
    ...(scanResult.napConsistency !== undefined
      ? { napConsistency: scanResult.napConsistency }
      : {}),
    ...(scanResult.reflow !== undefined ? { reflow: scanResult.reflow } : {}),
    ...(scanResult.htmlValidity !== undefined ? { htmlValidity: scanResult.htmlValidity } : {}),
    ...(scanResult.structuredData !== undefined
      ? { structuredData: scanResult.structuredData }
      : {}),
    ...(scanResult.structuredDataError !== undefined
      ? { structuredDataError: scanResult.structuredDataError }
      : {}),
  };
}

function buildPrivacySecurityCoverage(
  startUrl: string,
  pages: readonly PageScanResult[],
): PrivacySecurityCoverage {
  const homepage = pages.find((page) => page.url === startUrl);
  return {
    securityHeaders: homepage?.securityHeaders !== undefined ? 'completed' : 'unavailable',
    cookieConsent: homepage?.cookieConsent !== undefined ? 'completed' : 'unavailable',
  };
}

/** Accumulates the two site-level obligation-engine signals across every
 *  scanned page: the SIREN found on the identified mentions-legales page
 *  (if any), and whether any page anywhere on the site shows a
 *  first-party transactional flow. Always populated for an audit run
 *  under this milestone's code - AuditManifestSiteSignals is optional on
 *  AuditManifest only for backward compatibility with older manifests. */
/** Separators a title tag commonly uses to append the site name after a
 *  page-specific headline (e.g. "Chambre Deluxe | La Co(o)rniche") - the
 *  brand name is conventionally the *last* segment, not the first, since
 *  the page-specific part is what search engines truncate first. Tried
 *  in order; the first one found in the title wins. Only "|" and an em
 *  dash are tried - a plain hyphen or middle dot appears too often
 *  inside a real title or company name itself (a hyphenated surname,
 *  "·" as Odysseus's own report title uses it) to safely treat as a
 *  separator. */
const TITLE_SITE_NAME_SEPARATORS = ['|', '—'];

/** 2026-08-22, La Corniche report review: `og:site_name` is the
 *  deliberate, hand-authored signal a site sets specifically to name
 *  itself (unlike the page `<title>`, which is often page-specific
 *  headline text). Falls back to the title tag's last separator-delimited
 *  segment only when `og:site_name` is absent, since most sites that skip
 *  Open Graph metadata still put the brand name at the end of the title. */
/** A homepage title with no separator at all is usually already just the
 *  business name for a small site (fixtures/spa-demo's own homepage title
 *  is exactly "Domaine des Trois Chenes", no punctuation) - but only
 *  short enough to plausibly be a name, not a descriptive sentence a
 *  longer, separator-free title is more likely to be. */
const BARE_TITLE_MAX_LENGTH = 60;

/** A1 (2026-08-24 three-site review): a real Palais Gallien report put
 *  "Hôtel Le Palais Gallien 5***** - Bordeaux - Site Officiel" on the
 *  cover of a paid audit as the client's own name. The title was 56
 *  characters, so the BARE_TITLE_MAX_LENGTH path returned it whole,
 *  marketing furniture included.
 *
 *  Hyphen is deliberately still not a TITLE_SITE_NAME_SEPARATORS entry -
 *  the brand-is-last convention that holds for "|" is wrong for hyphens
 *  ("... - Bordeaux - Site Officiel" would yield "Site Officiel", worse
 *  than doing nothing). Instead the hyphen is used only to find trailing
 *  segments that are pure boilerplate, which are dropped from the end
 *  while any segment carrying real information is kept. A city is not
 *  boilerplate and is kept on purpose: guessing which words are place
 *  names would be inventing a fact, and this value is a *prefill* the
 *  operator confirms (provenance 'detected'), not a final answer. */
const TITLE_BOILERPLATE_SEGMENTS = [
  'site officiel',
  'site web officiel',
  'official site',
  'official website',
  'accueil',
  'home',
  'homepage',
  'page d accueil',
  "page d'accueil",
  'reservation en ligne',
  'réservation en ligne',
  'book online',
];

/** Star ratings ("5*****", "4 étoiles", "5 stars") are a marketing token,
 *  not part of a registered or commercial name. Removed before the
 *  boilerplate split so "Gallien 5***** - Bordeaux" splits the same way
 *  "Gallien - Bordeaux" would. */
// The trailing \b lives inside the word alternatives only: "*" is not a
// word character, so a \b after "5*****" never matches.
const TITLE_STAR_RATING = /\s*\b[1-5]\s*(?:\*{1,5}|(?:étoiles?|etoiles?|stars?)\b)/giu;

function stripTitleMarketing(title: string): string {
  const withoutRating = title
    .replace(TITLE_STAR_RATING, ' ')
    .replace(/\s{2,}/gu, ' ')
    .trim();
  const segments = withoutRating
    .split(/\s+[-–]\s+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  while (segments.length > 1) {
    const last = segments[segments.length - 1]!.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/gu, '');
    const isBoilerplate = TITLE_BOILERPLATE_SEGMENTS.some(
      (entry) => entry.normalize('NFD').replace(/[\u0300-\u036f]/gu, '') === last,
    );
    if (!isBoilerplate) break;
    segments.pop();
  }
  return segments
    .join(' - ')
    .replace(/\s{2,}/gu, ' ')
    .trim();
}

export function deriveSiteName(
  headMetadata: WriteAuditArtifactsInput['siteResult']['pages'][number]['headMetadata'],
): string | undefined {
  const ogSiteName = headMetadata?.openGraphTags?.['og:site_name']?.trim();
  if (ogSiteName) return ogSiteName;

  const title = headMetadata?.title?.trim();
  if (!title) return undefined;
  for (const separator of TITLE_SITE_NAME_SEPARATORS) {
    const segments = title
      .split(separator)
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments.length > 1)
      return stripTitleMarketing(segments[segments.length - 1]!) || undefined;
  }
  const cleaned = stripTitleMarketing(title);
  if (!cleaned) return undefined;
  return cleaned.length <= BARE_TITLE_MAX_LENGTH ? cleaned : undefined;
}

/** A1 (2026-08-24 three-site review): the La Corniche cover printed the
 *  generic "Rapport d'audit" instead of the client's name. Root cause was
 *  not deriveSiteName at all - the scan started at
 *  https://www.lacoorniche.com/, that navigation timed out at 30s
 *  (renderDiffError, "waiting until networkidle"), and so the one page
 *  this lookup consulted carried no headMetadata whatsoever. The apex
 *  https://lacoorniche.com/ was crawled seconds later and does carry
 *  og:site_name "La Co(o)rniche".
 *
 *  So the homepage is preferred but no longer required: the www/apex
 *  counterpart of the start URL is tried next (same site, one redirect
 *  apart), then the shallowest remaining page that actually returned head
 *  metadata. Ordering by depth keeps this close to "the homepage or the
 *  next thing to it" rather than picking an arbitrary deep page whose
 *  title is page-specific. Returns undefined when nothing on the site
 *  produced head metadata, which still yields no siteName - an absent
 *  prefill, never a guessed one. */
function toggleWwwPrefix(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    parsed.hostname = parsed.hostname.startsWith('www.')
      ? parsed.hostname.slice(4)
      : `www.${parsed.hostname}`;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * B1.1 (2026-08-24, Domaine Lagnonu). The cover of a paid report named the
 * client "Mariages et evenements prives". The business is "Domaine
 * Lagnonu", and both halves were in the same string: the weddings page's
 * title is "Domaine Lagnonu | Mariages et evenements prives", and
 * deriveSiteName takes the LAST separator-delimited segment.
 *
 * That convention ("Page | Site") is real, but so is its mirror ("Site |
 * Page"), and nothing in one title says which one a site follows. What
 * does say so is the rest of the site: a brand repeats across pages, a
 * page topic does not. Measured on the real 43-page scan, "Domaine
 * Lagnonu" appeared in 6 titles while every page-specific segment
 * appeared exactly once.
 *
 * Requires at least two titles to agree, so a small site that genuinely
 * has nothing recurring falls through to the per-page chain below rather
 * than promoting a single page's topic. Ties break toward the shorter
 * segment, then lexicographically, so the result is deterministic across
 * runs - the manifest records it and monitoring diffs read it.
 */
export function deriveSiteNameFromTitleFrequency(titles: readonly string[]): string | undefined {
  const countsBySegment = new Map<string, number>();

  for (const title of titles) {
    const trimmed = title.trim();
    if (!trimmed) continue;

    const seenInThisTitle = new Set<string>();
    for (const separator of TITLE_SITE_NAME_SEPARATORS) {
      if (!trimmed.includes(separator)) continue;
      for (const rawSegment of trimmed.split(separator)) {
        const segment = stripTitleMarketing(rawSegment.trim());
        // Same length ceiling the bare-title path uses: a segment longer
        // than this is a descriptive sentence, not a name.
        if (!segment || segment.length > BARE_TITLE_MAX_LENGTH) continue;
        if (seenInThisTitle.has(segment)) continue;
        seenInThisTitle.add(segment);
        countsBySegment.set(segment, (countsBySegment.get(segment) ?? 0) + 1);
      }
    }
  }

  const ranked = [...countsBySegment.entries()]
    .filter(([, count]) => count >= 2)
    .sort(([aSegment, aCount], [bSegment, bCount]) => {
      if (aCount !== bCount) return bCount - aCount;
      if (aSegment.length !== bSegment.length) return aSegment.length - bSegment.length;
      return aSegment.localeCompare(bSegment);
    });

  return ranked.at(0)?.[0];
}

function findSiteNameSource(
  siteResult: WriteAuditArtifactsInput['siteResult'],
): WriteAuditArtifactsInput['siteResult']['pages'][number] | undefined {
  const hasMetadata = (page: WriteAuditArtifactsInput['siteResult']['pages'][number]): boolean =>
    deriveSiteName(page.headMetadata) !== undefined;

  const byUrl = (url: string | undefined) =>
    url === undefined
      ? undefined
      : siteResult.pages.find((page) => page.url === url && hasMetadata(page));

  const homepage = byUrl(siteResult.crawl.startUrl);
  if (homepage) return homepage;

  const counterpart = byUrl(toggleWwwPrefix(siteResult.crawl.startUrl));
  if (counterpart) return counterpart;

  const depthByUrl = new Map(siteResult.crawl.pages.map((page) => [page.url, page.depth]));
  return siteResult.pages
    .filter(hasMetadata)
    .sort(
      (a, b) =>
        (depthByUrl.get(a.url) ?? Number.MAX_SAFE_INTEGER) -
        (depthByUrl.get(b.url) ?? Number.MAX_SAFE_INTEGER),
    )
    .at(0);
}

function buildSiteSignals(
  siteResult: WriteAuditArtifactsInput['siteResult'],
): AuditManifestSiteSignals {
  const transactionalFlowEvidence = siteResult.pages.flatMap(
    (page) => page.transactionalFlowEvidence ?? [],
  );
  const transactionalFlowRedirectChecks = siteResult.pages.flatMap(
    (page) => page.transactionalFlowRedirectChecks ?? [],
  );
  const transactionalFlowAmbiguities = siteResult.pages.flatMap(
    (page) => page.transactionalFlowAmbiguities ?? [],
  );
  const mentionsLegalesPageUrl = siteResult.crawl.mentionsLegalesPageUrl;
  const mentionsLegalesPage = mentionsLegalesPageUrl
    ? siteResult.pages.find((page) => page.url === mentionsLegalesPageUrl)
    : undefined;
  const siren = mentionsLegalesPage?.mentionsLegales?.siren;

  // og:site_name is the hand-authored signal a site sets to name itself, so
  // it still wins outright where it exists. Only when no page publishes one
  // does the title-frequency pass run, ahead of the single-page title
  // heuristic that produced the Lagnonu cover defect.
  const explicitSiteName = siteResult.pages
    .map((page) => page.headMetadata?.openGraphTags?.['og:site_name']?.trim())
    .find((name): name is string => Boolean(name));
  const recurringSiteName = deriveSiteNameFromTitleFrequency(
    siteResult.pages.map((page) => page.headMetadata?.title ?? ''),
  );
  const siteName =
    explicitSiteName ??
    recurringSiteName ??
    deriveSiteName(findSiteNameSource(siteResult)?.headMetadata);

  return {
    hasTransactionalFlow: transactionalFlowEvidence.length > 0,
    transactionalFlowEvidence,
    ...(transactionalFlowRedirectChecks.length > 0 ? { transactionalFlowRedirectChecks } : {}),
    // Never merged into transactionalFlowEvidence: an unresolved booking
    // control must not flip hasTransactionalFlow (issue #42) - it is
    // recorded so assessObligations can tell a clean negative from an
    // inconclusive detection.
    ...(transactionalFlowAmbiguities.length > 0 ? { transactionalFlowAmbiguities } : {}),
    ...(siren !== undefined ? { siren } : {}),
    ...(mentionsLegalesPageUrl !== undefined ? { mentionsLegalesPageUrl } : {}),
    ...(siteName !== undefined ? { siteName } : {}),
  };
}

export async function writeAuditArtifacts(
  input: WriteAuditArtifactsInput,
): Promise<WriteAuditArtifactsResult> {
  // The file writes below are deliberately synchronous. This pass runs
  // once, after an audit has already spent hours crawling and scanning,
  // and async libuv file operations have hung forever on this exact step
  // under WSL2 (io_uring completions that never arrive), destroying the
  // whole run. Direct syscalls cannot take that path. The function stays
  // async so callers are unchanged.
  const auditId = input.auditId ?? randomUUID();
  const hostname = new URL(input.siteResult.crawl.startUrl).hostname;
  const auditDir = buildAuditDir(getArtifactsRoot(), hostname, input.startedAt);
  const pagesDir = path.join(auditDir, 'pages');
  fs.mkdirSync(pagesDir, { recursive: true });

  const scanByUrl = new Map(input.siteResult.pages.map((page) => [page.url, page]));
  const manifestPages: ManifestPageEntry[] = [];
  const normalizePages: NormalizePageInput[] = [];

  for (const crawledPage of input.siteResult.crawl.pages) {
    const scanResult = scanByUrl.get(crawledPage.url);

    if (crawledPage.status !== 'visited' || !scanResult) {
      manifestPages.push({
        url: crawledPage.url,
        depth: crawledPage.depth,
        status: crawledPage.status,
        discoveryMethod: crawledPage.discoveryMethod,
        ...(crawledPage.httpStatus !== undefined ? { httpStatus: crawledPage.httpStatus } : {}),
        ...(crawledPage.error !== undefined ? { crawlError: crawledPage.error } : {}),
        ...(crawledPage.discoveredFrom !== undefined
          ? { discoveredFrom: crawledPage.discoveredFrom }
          : {}),
        errors: {},
      });
      continue;
    }

    const pageDir = buildPageDir(scanResult.url);
    const pageDirPath = path.join(pagesDir, pageDir);
    fs.mkdirSync(pageDirPath, { recursive: true });

    const relativizedRenderDiff = scanResult.renderDiff
      ? toAuditRelativeRefs(scanResult.renderDiff, auditDir)
      : undefined;

    const scanJson = buildScanJson(scanResult, relativizedRenderDiff);
    fs.writeFileSync(path.join(pageDirPath, 'scan.json'), JSON.stringify(scanJson, null, 2));

    manifestPages.push({
      url: scanResult.url,
      pageDir: path.join('pages', pageDir),
      depth: crawledPage.depth,
      status: 'visited',
      discoveryMethod: crawledPage.discoveryMethod,
      ...(crawledPage.httpStatus !== undefined ? { httpStatus: crawledPage.httpStatus } : {}),
      ...(crawledPage.discoveredFrom !== undefined
        ? { discoveredFrom: crawledPage.discoveredFrom }
        : {}),
      ...(input.siteResult.analysisCoverageByUrl?.get(scanResult.url) !== undefined
        ? { analysisCoverage: input.siteResult.analysisCoverageByUrl.get(scanResult.url)! }
        : {}),
      ...(scanResult.renderDiff !== undefined
        ? { renderDiffMissingPercent: scanResult.renderDiff.missingPercent }
        : {}),
      ...(scanResult.lighthouse !== undefined
        ? {
            lighthouseExcludedCategoryScores: extractLighthouseExcludedCategoryScores(
              scanResult.lighthouse,
            ),
          }
        : {}),
      ...(scanResult.lighthouse !== undefined
        ? { coreWebVitals: extractCoreWebVitals(scanResult.lighthouse) }
        : {}),
      errors: {
        ...(scanResult.renderDiffError !== undefined
          ? { renderDiff: scanResult.renderDiffError }
          : {}),
        ...(scanResult.axeError !== undefined ? { axe: scanResult.axeError } : {}),
        ...(scanResult.lighthouseError !== undefined
          ? { lighthouse: scanResult.lighthouseError }
          : {}),
      },
    });

    // Passed the relativized render-diff result too, so a Finding merged
    // from this page carries portable, directory-relative screenshot refs
    // in rawEvidence.perPage rather than machine-specific absolute paths.
    normalizePages.push(buildScanJson(scanResult, relativizedRenderDiff));
  }

  const tool = await collectToolVersions(input.browser, input.siteResult.pages);
  const manifest = buildManifest({
    auditId,
    kind: input.kind,
    siteUrl: input.siteResult.crawl.startUrl,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    tool,
    config: input.config,
    crawl: input.siteResult.crawl,
    pages: manifestPages,
    siteSignals: buildSiteSignals(input.siteResult),
    privacySecurityCoverage: buildPrivacySecurityCoverage(
      input.siteResult.crawl.startUrl,
      input.siteResult.pages,
    ),
    // B2 (2026-08-24): recorded on the manifest rather than recomputed by
    // each consumer, so `normalize <dir>` reaches the same grouping
    // offline without re-reading every page's head metadata.
    translationClusters: buildTranslationClusters(
      input.siteResult.pages.map((page) => ({
        pageUrl: page.url,
        hreflangLinks: page.headMetadata?.hreflangLinks ?? [],
      })),
    ),
    ...(input.siteResult.cruxFieldData !== undefined
      ? { cruxFieldData: input.siteResult.cruxFieldData }
      : {}),
  });

  fs.writeFileSync(path.join(auditDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  return { auditId, auditDir, manifest, pages: normalizePages };
}
