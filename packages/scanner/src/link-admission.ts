/**
 * Issue #566: the one place that decides which links a page exposes the
 * crawl may follow. The rules used to live twice, inline in crawlSite and in
 * a partial copy for the browser-state surfaces, and had drifted: surfaces
 * dropped a nesting link without a record and never recorded an operator
 * exclusion, and the discovery waves filed their own per-referrer cap under
 * the continuation guard's name.
 *
 * Three entries hand their anchors here: the crawl (with the continuation
 * guard), the state surfaces (which only resolve their anchors; the wave
 * decides later), and the discovery waves (with their own per-referrer cap
 * and the page budget). Every entry resolves and normalizes the same way,
 * records exclusions and nesting the same way, and applies the depth bound
 * the same way. Robots and network safety stay with the caller that holds
 * those policies; they refuse a link for reasons outside this module.
 *
 * Which pages get discovered does not change: the continuation guard stays
 * a crawl rule (surfaces carry no rel or pagination evidence), and the waves
 * keep their cap, now under its own disposition.
 */
import type { Page } from 'playwright';
import {
  classifyContinuationLink,
  type ContinuationClassification,
  type ContinuationGuard,
} from './continuation-guard.js';
import type { InventoryDisposition, InventoryLedger } from './inventory-ledger.js';
import {
  globToRegExp,
  normalizePageUrl,
  relativeLinkNestingEvidence,
  type RelativeLinkNestingEvidence,
} from './links.js';

/** The numbered pagination control an anchor may sit in. Read per anchor for
 *  the continuation guard and counted per page by page-audit-profile.ts; one
 *  definition keeps the guard's evidence and the profile's fact identical. */
export const NUMBERED_PAGINATION_SELECTOR = 'nav[class*="pag" i] a, [class*="pagination" i] a';

/** At most this many links first seen on one page's state surfaces enter the
 *  discovery waves. A surface exposes whole menus and listings at once, and
 *  the fixed point must stay bounded per referring page. */
export const MAX_SURFACE_LINKS_PER_REFERRER = 50;

/** One anchor as the page exposes it, before resolution. */
export interface PageAnchor {
  href: string | null;
  /** The anchor's own `rel` contains "next". */
  relNext: boolean;
  /** The anchor sits in a numbered pagination control and its text is a
   *  number. */
  isNumberedPaginationControl: boolean;
}

export interface RelativeLinkNestingSummary {
  omittedUrlCount: number;
  omittedExampleUrls: string[];
  repeatedSegments: string[];
}

/** One distinct in-scope link a page exposes, resolved against the
 *  document's base URL and normalized against the URL the page landed on. */
export interface PageLink {
  url: string;
  /** The href as the first anchor reaching this URL wrote it. */
  observedHref: string;
  relNext: boolean;
  isNumberedPaginationControl: boolean;
  /** An anchor reaching this URL is a relative href that repeats its own
   *  directory (issue #497): a loop, not a page, unless already known. */
  nesting?: RelativeLinkNestingEvidence;
}

/** A link an operator exclusion refused. */
export interface ExcludedPageLink {
  url: string;
  observedHref: string;
}

export interface ResolvedPageLinks {
  /** In first-seen order. Two anchors to one URL merge their evidence. */
  links: PageLink[];
  excluded: ExcludedPageLink[];
}

export interface ResolvePageLinksOptions {
  /** document.baseURI: a relative href resolves against it, and <base href>
   *  can move it away from the page's own URL (issue #497). */
  documentBase: string;
  /** Where the navigation actually landed. A www-to-apex 301 lands on
   *  another origin, and the page's links are absolute against that one;
   *  the requested URL would make them all look cross-origin. */
  landedUrl: string;
  exclusions: readonly string[];
}

export async function readPageAnchors(page: Page): Promise<PageAnchor[]> {
  return page.$$eval(
    'a[href]',
    (anchorEls, paginationSelector) =>
      anchorEls.map((a) => ({
        href: a.getAttribute('href'),
        relNext: (a.getAttribute('rel') ?? '').split(/\s+/).includes('next'),
        isNumberedPaginationControl:
          a.matches(paginationSelector) && /^\d+$/.test((a.textContent ?? '').trim()),
      })),
    NUMBERED_PAGINATION_SELECTOR,
  );
}

export async function readDocumentBase(page: Page, fallback: string): Promise<string> {
  return page.evaluate(() => document.baseURI).catch(() => fallback);
}

function againstBase(href: string, documentBase: string): string {
  try {
    return new URL(href, documentBase).href;
  } catch {
    return href;
  }
}

/** Pure: the in-scope links and the operator-excluded links among a page's
 *  anchors. Origin, non-HTML extensions and non-public WordPress objects are
 *  decided by normalizePageUrl, the admission policy sitemap entries share. */
export function resolvePageLinks(
  anchors: readonly PageAnchor[],
  options: ResolvePageLinksOptions,
): ResolvedPageLinks {
  const exclusionRegexes = options.exclusions.map(globToRegExp);
  const byUrl = new Map<string, PageLink>();
  const excluded = new Map<string, ExcludedPageLink>();
  for (const anchor of anchors) {
    if (anchor.href === null || anchor.href === '') continue;
    const absoluteHref = againstBase(anchor.href, options.documentBase);
    const url = normalizePageUrl(absoluteHref, options.landedUrl, {
      exclusionPatterns: options.exclusions,
    });
    if (url === undefined) {
      const unexcluded = normalizePageUrl(absoluteHref, options.landedUrl);
      if (
        unexcluded !== undefined &&
        !excluded.has(unexcluded) &&
        exclusionRegexes.some((pattern) => pattern.test(unexcluded))
      ) {
        excluded.set(unexcluded, { url: unexcluded, observedHref: anchor.href });
      }
      continue;
    }
    const nesting = relativeLinkNestingEvidence(anchor.href, options.documentBase);
    const existing = byUrl.get(url);
    if (existing === undefined) {
      byUrl.set(url, {
        url,
        observedHref: anchor.href,
        relNext: anchor.relNext,
        isNumberedPaginationControl: anchor.isNumberedPaginationControl,
        ...(nesting !== undefined ? { nesting } : {}),
      });
      continue;
    }
    existing.relNext ||= anchor.relNext;
    existing.isNumberedPaginationControl ||= anchor.isNumberedPaginationControl;
    if (nesting !== undefined) existing.nesting = nesting;
  }
  return { links: [...byUrl.values()], excluded: [...excluded.values()] };
}

export type LinkAdmission =
  | { kind: 'admit' }
  /** Already visited, queued or decided: nothing to do. */
  | { kind: 'known' }
  | { kind: 'refused'; disposition: InventoryDisposition; detail: string };

/** The frontier's view of one candidate link. */
export interface LinkAdmissionContext {
  /** Already visited, queued, or given a disposition. */
  isKnown: boolean;
  /** The depth of the page the link was found on. */
  referrerDepth: number;
  maxDepth: number;
  /** Crawl entry: the continuation guard and the source page's evidence. */
  continuation?: {
    guard: ContinuationGuard;
    sourcePageUrl: string;
    sourceIsConfirmedListing: boolean;
    repeatedQueryKeysOnSourcePage: ReadonlySet<string>;
  };
  /** Wave entry: the crawl's page budget is spent. */
  pageBudgetSpent?: { maxPages: number };
  /** Wave entry: links from this referrer already admitted. */
  referrerAdmittedCount?: { referrer: string; count: number };
}

/**
 * Decides one link, in this order: known, depth bound, relative nesting,
 * then the entry's own bound (the continuation guard for the crawl, the page
 * budget and the per-referrer cap for the waves). A continuation link the
 * guard admits is counted by the guard as enqueued, so call this once per
 * link, at the moment the caller would enqueue it.
 */
export function decideLinkAdmission(
  link: Pick<PageLink, 'url' | 'nesting'> &
    Partial<Pick<PageLink, 'relNext' | 'isNumberedPaginationControl'>>,
  context: LinkAdmissionContext,
): LinkAdmission {
  if (context.isKnown) return { kind: 'known' };
  if (context.referrerDepth >= context.maxDepth) {
    return {
      kind: 'refused',
      disposition: 'depth-bound',
      detail: `discovered from depth ${context.referrerDepth}; maxDepth is ${context.maxDepth}`,
    };
  }
  if (link.nesting !== undefined) {
    return {
      kind: 'refused',
      disposition: 'relative-link-nesting',
      detail: `relative href ${link.nesting.href} repeated directory segment ${link.nesting.repeatedSegment}`,
    };
  }
  if (context.continuation !== undefined) {
    const classification: ContinuationClassification = classifyContinuationLink({
      targetUrl: link.url,
      sourcePageUrl: context.continuation.sourcePageUrl,
      relNext: link.relNext ?? false,
      isNumberedPaginationControl: link.isNumberedPaginationControl ?? false,
      sourceIsConfirmedListing: context.continuation.sourceIsConfirmedListing,
      repeatedQueryKeysOnSourcePage: context.continuation.repeatedQueryKeysOnSourcePage,
    });
    if (
      classification.isContinuation &&
      !context.continuation.guard.admit(classification, link.url)
    ) {
      return {
        kind: 'refused',
        disposition: 'continuation-guard',
        detail: `continuation family ${classification.familyKey} reached its bound`,
      };
    }
  }
  if (context.pageBudgetSpent !== undefined) {
    return {
      kind: 'refused',
      disposition: 'page-cap',
      detail: `crawl stopped after reaching maxPages=${context.pageBudgetSpent.maxPages}`,
    };
  }
  if (
    context.referrerAdmittedCount !== undefined &&
    context.referrerAdmittedCount.count >= MAX_SURFACE_LINKS_PER_REFERRER
  ) {
    return {
      kind: 'refused',
      disposition: 'surface-link-bound',
      detail: `surface discovery from ${context.referrerAdmittedCount.referrer} reached its ${MAX_SURFACE_LINKS_PER_REFERRER}-link bound`,
    };
  }
  return { kind: 'admit' };
}

/**
 * Records a refusal: the link's terminal disposition in the inventory ledger
 * (never over one already decided), and a nesting refusal in the run's
 * relative-nesting summary. The link must already be recorded as discovered.
 */
export function recordLinkRefusal(
  ledger: InventoryLedger | undefined,
  nestingSummary: RelativeLinkNestingSummary,
  link: Pick<PageLink, 'url' | 'nesting'>,
  refusal: Extract<LinkAdmission, { kind: 'refused' }>,
): void {
  if (refusal.disposition === 'relative-link-nesting' && link.nesting !== undefined) {
    nestingSummary.omittedUrlCount += 1;
    if (nestingSummary.omittedExampleUrls.length < 20) {
      nestingSummary.omittedExampleUrls.push(link.nesting.resolvedUrl);
    }
    if (!nestingSummary.repeatedSegments.includes(link.nesting.repeatedSegment)) {
      nestingSummary.repeatedSegments.push(link.nesting.repeatedSegment);
    }
  }
  if (ledger === undefined) return;
  const candidate = ledger.candidate(link.url);
  if (candidate === undefined) {
    throw new Error(`link admission: cannot dispose undiscovered inventory target ${link.url}`);
  }
  if (candidate.disposition !== undefined) return;
  ledger.recordDisposition({
    url: link.url,
    disposition: refusal.disposition,
    decidedAt: new Date(),
    detail: refusal.detail,
  });
}

/** The refusal of an operator-excluded link. */
export const OPERATOR_EXCLUSION_REFUSAL = {
  kind: 'refused',
  disposition: 'operator-excluded',
  detail: 'matched an operator-supplied crawl exclusion',
} as const satisfies LinkAdmission;
