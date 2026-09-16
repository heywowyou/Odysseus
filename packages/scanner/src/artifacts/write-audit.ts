/**
 * Writes a completed site scan to disk in the layout described in
 * paths.ts: manifest.json plus one pages/<slug>-<hash>/scan.json per
 * scanned page. Screenshots themselves are written earlier, in place,
 * during scanSite (the caller passes the correct pages/ parent directory
 * into scanSite's screenshotDir option before scanning starts), so there
 * is no write-then-move step here.
 *
 * Issue #64: for a page whose full result isn't in siteResult.pages (the
 * real full-audit path opts scanSite into writing each page's scan.json as
 * it completes, via writePagesAsScanned, rather than holding every page's
 * result in memory for the whole multi-hour run), this reads that
 * already-written scan.json back from disk instead of re-deriving it -
 * assembling the manifest and normalizeAudit's input from disk, not from
 * an in-memory accumulator.
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
import { isRedirectInterstitial } from '../redirect-interstitial.js';
import type { PageScanResult } from '../scan-page.js';
import type { NormalizePageInput } from '@odysseus/core';
import { buildAuditDir, buildPageDir } from './paths.js';
import { collectToolVersions } from './versions.js';
import { buildManifest } from './manifest.js';
import { readPageScanJson, writePageScanJson } from './page-scan-io.js';
import { selectSiteRoleContact, type SiteRoleContact } from '../role-contact.js';

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

function normalizeForBoilerplateCompare(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '');
}

/** Issue #72: a real Les Flots Bleus audit had \`og:site_name\` set to
 *  literally "Site Officiel" - a site owner filling in marketing
 *  boilerplate rather than a brand, not a page-title artifact. That value
 *  used to win outright, ahead of the title-derived boilerplate stripping
 *  below, because \`deriveSiteName\` returned \`og:site_name\` unconditionally
 *  whenever present. Reused for both the tag itself and for title
 *  segments so the two checks can never drift apart. */
function isBoilerplateSegment(segment: string): boolean {
  const normalized = normalizeForBoilerplateCompare(segment);
  return TITLE_BOILERPLATE_SEGMENTS.some(
    (entry) => normalizeForBoilerplateCompare(entry) === normalized,
  );
}

function stripTitleMarketing(title: string): string {
  const withoutRating = title
    .replace(TITLE_STAR_RATING, ' ')
    .replace(/\s{2,}/gu, ' ')
    .trim();
  const segments = withoutRating
    .split(/\s+[-–]\s+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  // Issue #72: a title that is nothing but a single boilerplate segment
  // ("Site Officiel" alone, no separator) must still end up empty rather
  // than being kept because only one segment remains - popping all the
  // way to zero is deliberate.
  while (segments.length > 0 && isBoilerplateSegment(segments[segments.length - 1]!)) {
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
  if (ogSiteName && !isBoilerplateSegment(ogSiteName)) return ogSiteName;

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

  // Issue #79: a length-based tiebreak has no relationship to which segment
  // is the actual brand name - a terse SEO keyword phrase reliably beats a
  // descriptive brand-plus-tagline segment on length alone. Sorted only for
  // a deterministic tie check below; localeCompare never decides the winner.
  const ranked = [...countsBySegment.entries()]
    .filter(([, count]) => count >= 2)
    .sort(([aSegment, aCount], [bSegment, bCount]) => {
      if (aCount !== bCount) return bCount - aCount;
      return aSegment.localeCompare(bSegment);
    });

  if (ranked.length === 0) return undefined;
  // Two segments tying on vote count is genuine ambiguity about which one is
  // the brand. Guessing via any tiebreak manufactures a false positive;
  // returning undefined here falls through to the per-page heuristics below,
  // which is more honest than picking arbitrarily.
  if (ranked.length > 1 && ranked[0]![1] === ranked[1]![1]) return undefined;
  return ranked[0]![0];
}

/** Issue #79: two crawled URLs (a trailing-slash spelling of the homepage,
 *  or a redirect stub that resolves to it) can carry the identical
 *  rendered title, letting one real page vote twice in the frequency
 *  count above and manufacture the >= 2 threshold for a page-specific
 *  phrase. Prefers the page's own declared canonical URL (only when
 *  exactly one is declared, the same reliability bar checkCanonicalTarget
 *  uses) since that is the site's own statement of identity; falls back
 *  to the page URL with a bare trailing slash removed, which collapses
 *  only the exact "same origin, with or without /" duplicate this issue's
 *  audit produced. */
function titleVotingIdentity(
  page: WriteAuditArtifactsInput['siteResult']['pages'][number],
): string {
  if (page.headMetadata?.canonicalUrls?.length === 1) return page.headMetadata.canonicalUrls[0]!;
  try {
    const url = new URL(page.url);
    if (url.pathname === '/') url.pathname = '';
    return url.toString();
  } catch {
    return page.url;
  }
}

function dedupeByTitleVotingIdentity(
  pages: readonly WriteAuditArtifactsInput['siteResult']['pages'][number][],
): WriteAuditArtifactsInput['siteResult']['pages'][number][] {
  const seen = new Set<string>();
  const result: WriteAuditArtifactsInput['siteResult']['pages'][number][] = [];
  for (const page of pages) {
    const identity = titleVotingIdentity(page);
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(page);
  }
  return result;
}

/** Homepage first, then the www/apex counterpart, then the shallowest page
 *  carrying the signal - shared by findSiteNameSource and the og:title
 *  lookup so both prefer the same "the homepage or the next thing to it"
 *  page rather than an arbitrary deep one. */
function findPageWithSignal(
  siteResult: WriteAuditArtifactsInput['siteResult'],
  hasSignal: (page: WriteAuditArtifactsInput['siteResult']['pages'][number]) => boolean,
): WriteAuditArtifactsInput['siteResult']['pages'][number] | undefined {
  const byUrl = (url: string | undefined) =>
    url === undefined
      ? undefined
      : siteResult.pages.find((page) => page.url === url && hasSignal(page));

  const homepage = byUrl(siteResult.crawl.startUrl);
  if (homepage) return homepage;

  const counterpart = byUrl(toggleWwwPrefix(siteResult.crawl.startUrl));
  if (counterpart) return counterpart;

  const depthByUrl = new Map(siteResult.crawl.pages.map((page) => [page.url, page.depth]));
  return siteResult.pages
    .filter(hasSignal)
    .sort(
      (a, b) =>
        (depthByUrl.get(a.url) ?? Number.MAX_SAFE_INTEGER) -
        (depthByUrl.get(b.url) ?? Number.MAX_SAFE_INTEGER),
    )
    .at(0);
}

function findSiteNameSource(
  siteResult: WriteAuditArtifactsInput['siteResult'],
): WriteAuditArtifactsInput['siteResult']['pages'][number] | undefined {
  return findPageWithSignal(siteResult, (page) => deriveSiteName(page.headMetadata) !== undefined);
}

/** Issue #79: `og:title` is hand-authored the same way `og:site_name` is -
 *  it is literally what the site tells social platforms to call the page -
 *  but it was never consulted. Read from the homepage-like page (see
 *  findPageWithSignal) rather than any page on the site, since the brand
 *  signal that matters is the one the site states about itself, not a
 *  page-specific og:title deep in the crawl. */
function findOgTitleSiteName(
  siteResult: WriteAuditArtifactsInput['siteResult'],
): string | undefined {
  const hasUsableOgTitle = (
    page: WriteAuditArtifactsInput['siteResult']['pages'][number],
  ): boolean => {
    const value = page.headMetadata?.openGraphTags?.['og:title']?.trim();
    return Boolean(value) && !isBoilerplateSegment(value!);
  };
  const source = findPageWithSignal(siteResult, hasUsableOgTitle);
  return source?.headMetadata?.openGraphTags?.['og:title']?.trim();
}

function buildSiteSignals(
  siteResult: WriteAuditArtifactsInput['siteResult'],
): AuditManifestSiteSignals & { roleContact?: SiteRoleContact } {
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
  // it still wins outright where it exists. Only when no page publishes a
  // usable one does the title-frequency pass run, ahead of the single-page
  // title heuristic that produced the Lagnonu cover defect. Issue #72: a
  // page whose og:site_name is itself boilerplate ("Site Officiel") is
  // treated as not publishing one at all, same as deriveSiteName below.
  const explicitSiteName = siteResult.pages
    .map((page) => page.headMetadata?.openGraphTags?.['og:site_name']?.trim())
    .find((name): name is string => Boolean(name) && !isBoilerplateSegment(name!));
  // Issue #79: og:title is hand-authored the same way og:site_name is, so
  // it wins ahead of the title-frequency heuristic (which can be fooled
  // when the same page is voted twice, see titleVotingIdentity) and the
  // single-page title fallback.
  const ogTitleSiteName = findOgTitleSiteName(siteResult);
  // Issue #79: dedupe by page identity first, so a trailing-slash spelling
  // of the homepage or a redirect stub resolving to it cannot vote twice
  // and manufacture the >= 2 threshold for a page-specific phrase.
  const recurringSiteName = deriveSiteNameFromTitleFrequency(
    dedupeByTitleVotingIdentity(siteResult.pages).map((page) => page.headMetadata?.title ?? ''),
  );
  const roleContact = selectSiteRoleContact(siteResult.pages.map((page) => page.roleContact));
  const siteName =
    explicitSiteName ??
    ogTitleSiteName ??
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
    ...(roleContact !== undefined
      ? { roleContact: { address: roleContact.address, sourceUrl: roleContact.sourceUrl } }
      : {}),
  };
}

/** Issue #85: true when render-diff's settled rendered URL is not the
 *  same page as the one requested, meaning the browser was carried away
 *  by a client-side redirect (meta refresh or a delayed script) before
 *  rendered content was captured - the rendered content genuinely
 *  belongs to another URL. Reuses the crawler's own identity normalizer
 *  (trailing slash, hash) rather than a fresh string comparison, the
 *  same trailing-slash-identity class of bug issue #79 hit. An
 *  off-origin landing normalizes to undefined, which still compares
 *  unequal to the requested URL's own normalization, so it is correctly
 *  treated as a redirect away rather than silently ignored. */
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
  // Every visited page's resolved scan.json, whichever source it came
  // from - fed to collectToolVersions/buildSiteSignals/etc below in place
  // of input.siteResult.pages, since under writePagesAsScanned that array
  // is empty (issue #64: the real full-audit path never accumulates full
  // page results in memory - see scan-site.ts).
  const resolvedPages: PageScanResult[] = [];

  function pushCrawlOnlyEntry(crawledPage: CrawlResult['pages'][number]): void {
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
  }

  for (const crawledPage of input.siteResult.crawl.pages) {
    if (crawledPage.status !== 'visited') {
      pushCrawlOnlyEntry(crawledPage);
      continue;
    }

    const inMemoryScanResult = scanByUrl.get(crawledPage.url);
    let pageDir: string;
    let scanJson: PageScanResult;

    if (inMemoryScanResult !== undefined) {
      const written = writePageScanJson(pagesDir, auditDir, inMemoryScanResult);
      pageDir = written.pageDir;
      scanJson = written.scanJson;
    } else {
      // scan-site.ts already wrote this page's scan.json as soon as it
      // finished (writePagesAsScanned), so it isn't in siteResult.pages -
      // read it back rather than re-deriving it. A visited page with
      // neither an in-memory result nor a scan.json on disk shouldn't
      // happen (every visited page's lane produces a result, even a
      // watchdog-timeout one), but is handled the same defensive way this
      // branch always has: a crawl-only manifest entry, not a crash.
      const fromDisk = readPageScanJson(pagesDir, crawledPage.url);
      if (fromDisk === undefined) {
        pushCrawlOnlyEntry(crawledPage);
        continue;
      }
      pageDir = buildPageDir(crawledPage.url);
      scanJson = fromDisk;
    }

    resolvedPages.push(scanJson);

    // Issue #85: detected only now, after this page has already been
    // scanned - render-diff's settled rendered URL is the earliest point
    // this signal exists. A redirect-interstitial page never gets
    // analysisCoverage, the same as every other non-'visited' status
    // here, which is what excludes it from the content-checked
    // population and the report's analysed-page list with no further
    // logic needed in either place.
    const redirectTargetUrl =
      scanJson.renderDiff !== undefined &&
      isRedirectInterstitial(scanJson.url, scanJson.renderDiff.renderedLandedUrl)
        ? scanJson.renderDiff.renderedLandedUrl
        : undefined;

    manifestPages.push({
      url: scanJson.url,
      pageDir: path.join('pages', pageDir),
      depth: crawledPage.depth,
      status: redirectTargetUrl !== undefined ? 'redirect-interstitial' : 'visited',
      discoveryMethod: crawledPage.discoveryMethod,
      // Issue #290: the page's own declared language (<html lang>), so the
      // report can attribute a root-path page - no /fr/-style prefix - to
      // a language at all.
      ...(scanJson.headMetadata?.htmlLang !== undefined && scanJson.headMetadata.htmlLang !== null
        ? { language: scanJson.headMetadata.htmlLang }
        : {}),
      ...(crawledPage.httpStatus !== undefined ? { httpStatus: crawledPage.httpStatus } : {}),
      ...(crawledPage.discoveredFrom !== undefined
        ? { discoveredFrom: crawledPage.discoveredFrom }
        : {}),
      ...(redirectTargetUrl !== undefined ? { redirectTargetUrl } : {}),
      ...(redirectTargetUrl === undefined &&
      input.siteResult.analysisCoverageByUrl?.get(scanJson.url) !== undefined
        ? { analysisCoverage: input.siteResult.analysisCoverageByUrl.get(scanJson.url)! }
        : {}),
      ...(scanJson.renderDiff !== undefined
        ? { renderDiffMissingPercent: scanJson.renderDiff.missingPercent }
        : {}),
      ...(scanJson.renderDiff?.rawDocument !== undefined
        ? { renderDiffRawDocument: scanJson.renderDiff.rawDocument }
        : {}),
      ...(scanJson.lighthouse !== undefined
        ? {
            lighthouseExcludedCategoryScores: extractLighthouseExcludedCategoryScores(
              scanJson.lighthouse,
            ),
          }
        : {}),
      ...(scanJson.lighthouse !== undefined
        ? { coreWebVitals: extractCoreWebVitals(scanJson.lighthouse) }
        : {}),
      errors: {
        ...(scanJson.renderDiffError !== undefined ? { renderDiff: scanJson.renderDiffError } : {}),
        ...(scanJson.axeError !== undefined ? { axe: scanJson.axeError } : {}),
        ...(scanJson.lighthouseError !== undefined ? { lighthouse: scanJson.lighthouseError } : {}),
      },
    });

    // Already carries the relativized render-diff result, so a Finding
    // merged from this page carries portable, directory-relative
    // screenshot refs in rawEvidence.perPage rather than machine-specific
    // absolute paths - true whether scanJson came from an in-memory write
    // just now or a disk read of one scan-site.ts already wrote.
    normalizePages.push(scanJson);
  }

  const tool = await collectToolVersions(input.browser, resolvedPages);
  // Same reasoning as resolvedPages above: siteResult.pages is empty under
  // writePagesAsScanned, so every site-level aggregation below reads the
  // resolved (in-memory-or-disk) set instead of the input as given.
  const resolvedSiteResult = { ...input.siteResult, pages: resolvedPages };
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
    siteSignals: buildSiteSignals(resolvedSiteResult),
    privacySecurityCoverage: buildPrivacySecurityCoverage(
      input.siteResult.crawl.startUrl,
      resolvedPages,
    ),
    // B2 (2026-08-24): recorded on the manifest rather than recomputed by
    // each consumer, so `normalize <dir>` reaches the same grouping
    // offline without re-reading every page's head metadata.
    translationClusters: buildTranslationClusters(
      resolvedPages.map((page) => ({
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
