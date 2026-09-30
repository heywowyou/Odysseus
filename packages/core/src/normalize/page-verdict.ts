/**
 * The one decision of a scanned page's status (issue #565). A page the crawl
 * visited and scanned is a redirect, a refusal, a dead link, a soft 404 or
 * content, and that verdict used to be reached twice: once at scan time in
 * the scanner's write-audit, once on refresh by upgrading the stored status.
 * The two disagreed (a refresh never asked the soft-404 question, and could
 * not undo a status once written), and the soft-404 and redirect rules lived
 * in the scanner, outside the normalization fingerprint, so tightening them
 * never marked a stored audit stale. Both paths call this now, from the same
 * stored facts.
 *
 * Precedence, first match wins:
 *  1. redirect: the render settled on another URL, or Lighthouse's own
 *     navigation ended on another site (a booking doorway our render did not
 *     follow);
 *  2. blocked: the render did not obtain the site's own document, except
 *     that the site's own 404 or 410 template is a dead link (plan 075 K3);
 *  3. not HTML: a 2xx answer served as a feed, a file or another non-HTML
 *     type (a discovery-wave link reaches the scan without the crawl's own
 *     content-type check, plan 075 M4);
 *  4. soft 404: a 200 page that tells the visitor it does not exist, or
 *     that is the site's catch-all answer to a path that cannot exist;
 *  5. visited.
 */
import type { ManifestPageEntry, PageAnalysisCoverage } from '../types/manifest.js';
import type { RenderDiffResult } from '../types/findings.js';
import { isDeadLinkRender } from './dead-link-pages.js';
import { announcesMissingPage } from './error-title.js';
import type { NormalizePageInput } from './normalize.js';
import { finalUrlLandedOffSite, lighthouseFinalUrl } from './normalize-lighthouse.js';
import { isBlockedRender } from './normalize-renderdiff.js';
import { normalizeUrlIdentity } from './url-identity.js';

/** What a scan observed about one page, all of it stored in scan.json. */
export interface ScannedPageFacts {
  /** The URL the crawl requested. */
  url: string;
  /** The raw and rendered answers. */
  renderDiff?: RenderDiffResult;
  /** The URL the rendered page settled on after its scripts ran. */
  renderedLandedUrl?: string;
  title?: string | null;
  /** The page's headings, in document order. */
  headings?: readonly { level: number; text: string }[];
  /** The URL Lighthouse's own navigation settled on. */
  lighthouseFinalUrl?: string;
  /** The Content-Type of the raw (no-JavaScript) answer. */
  rawContentType?: string;
}

/**
 * Fallback for URLs whose extension doesn't reveal what they are; the link
 * extension check already caught the common case (wp-content/uploads/*.jpg)
 * before a navigation ever happens. A missing Content-Type is treated as
 * HTML rather than skipped, since there's nothing here to justify dropping
 * the page. Shared by the crawl and the page verdict.
 */
export function isNonHtmlContentType(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const type = contentType.toLowerCase();
  return !type.includes('text/html') && !type.includes('application/xhtml+xml');
}

/** Site-wide facts a page's verdict is read against. */
export interface ScannedPageSiteFacts {
  /** Raw text signatures of the site's catch-all answer (plan 075 M7). */
  catchAllTextSignatures?: ReadonlySet<string>;
}

/** The facts of a stored scan.json, as both the scan-time and refresh paths
 *  hold it. */
export function scannedPageFactsOf(
  page: Pick<NormalizePageInput, 'url' | 'headMetadata' | 'lighthouse'> & {
    /** The scanner's render-diff result, which also records the landed URL. */
    renderDiff?: RenderDiffResult & { renderedLandedUrl?: string; rawContentType?: string };
  },
): ScannedPageFacts {
  const finalUrl = page.lighthouse !== undefined ? lighthouseFinalUrl(page.lighthouse) : undefined;
  const landedUrl = page.renderDiff?.renderedLandedUrl;
  const rawContentType = page.renderDiff?.rawContentType;
  return {
    url: page.url,
    ...(page.renderDiff !== undefined ? { renderDiff: page.renderDiff } : {}),
    ...(landedUrl !== undefined ? { renderedLandedUrl: landedUrl } : {}),
    ...(page.headMetadata?.title !== undefined ? { title: page.headMetadata.title } : {}),
    ...(page.headMetadata?.headings !== undefined ? { headings: page.headMetadata.headings } : {}),
    ...(finalUrl !== undefined ? { lighthouseFinalUrl: finalUrl } : {}),
    ...(rawContentType !== undefined ? { rawContentType } : {}),
  };
}

export type ScannedPageVerdict =
  | { status: 'redirect-interstitial'; redirectTargetUrl?: string }
  | { status: 'http-error-status'; httpStatus: number }
  | { status: 'blocked' }
  | { status: 'skipped-non-html' }
  | { status: 'soft-error-page' }
  | { status: 'visited' };

export type ScannedPageStatus = ScannedPageVerdict['status'];

/** A page is a redirect interstitial when the URL the browser settled on
 *  after JavaScript ran is another page than the one requested (issue #85).
 *  Trailing slashes, fragments and escape casing are one page. */
export function isRedirectInterstitial(requestedUrl: string, renderedLandedUrl: string): boolean {
  return (
    normalizeUrlIdentity(requestedUrl) !== normalizeUrlIdentity(renderedLandedUrl, requestedUrl)
  );
}

const ERROR_SLUGS = new Set([
  '404',
  '404.html',
  '404.php',
  'erreur-404',
  'erreur404',
  'error-404',
  'error404',
  'page-not-found',
  'not-found',
  'page-introuvable',
  'pagina-no-encontrada',
  'pagina-non-trovata',
]);

function lastPathSegment(url: string): string {
  try {
    const segments = new URL(url).pathname.split('/').filter((segment) => segment !== '');
    return (segments.at(-1) ?? '').toLowerCase();
  } catch {
    return '';
  }
}

export interface SoftErrorPageInput {
  url: string;
  title: string | null | undefined;
  /** The page's headings, in document order. */
  headings: readonly { level: number; text: string }[] | undefined;
}

/**
 * Issue #302: a page that answers 200 while telling the visitor the page does
 * not exist. A real audit listed `/erreur-404` and three language copies of
 * it among its 140 analysed pages. Explicit matches rather than a similarity
 * score:
 *
 *  - the URL's own last path segment is an error slug. Whole-segment only, so
 *    an article at /blog/comment-eviter-les-erreurs-404 is not caught;
 *  - the page's first h1 announces the error;
 *  - its title announces the error and so does its first heading. An error
 *    title alone never makes an error page (plan 075 K4 and L1): aflatta's
 *    shop titles every offer, gift voucher and its cart « Page introuvable »;
 *    the offers lead with a content heading, the vouchers and the cart have
 *    none. Every true error page on the stored audits has an error slug or
 *    an error heading.
 */
export function isSoftErrorPage(page: SoftErrorPageInput): boolean {
  if (ERROR_SLUGS.has(lastPathSegment(page.url))) return true;
  const firstH1 = page.headings?.find((heading) => heading.level === 1);
  if (firstH1 !== undefined && announcesMissingPage(firstH1.text)) return true;
  if (!announcesMissingPage(page.title)) return false;
  const firstHeading = page.headings?.[0];
  return firstHeading !== undefined && announcesMissingPage(firstHeading.text);
}

export function decideScannedPageStatus(
  facts: ScannedPageFacts,
  site: ScannedPageSiteFacts = {},
): ScannedPageVerdict {
  const landedUrl = facts.renderedLandedUrl;
  if (landedUrl !== undefined && isRedirectInterstitial(facts.url, landedUrl)) {
    return { status: 'redirect-interstitial', redirectTargetUrl: landedUrl };
  }
  if (finalUrlLandedOffSite(facts.lighthouseFinalUrl, facts.url)) {
    return {
      status: 'redirect-interstitial',
      ...(facts.lighthouseFinalUrl !== undefined
        ? { redirectTargetUrl: facts.lighthouseFinalUrl }
        : {}),
    };
  }
  if (isBlockedRender(facts.renderDiff, facts.title)) {
    const renderDiff = facts.renderDiff;
    return renderDiff !== undefined && isDeadLinkRender(renderDiff)
      ? {
          status: 'http-error-status',
          httpStatus: renderDiff.renderedHttpStatus ?? renderDiff.httpStatus,
        }
      : { status: 'blocked' };
  }
  if (isNonHtmlContentType(facts.rawContentType)) return { status: 'skipped-non-html' };
  if (isSoftErrorPage({ url: facts.url, title: facts.title, headings: facts.headings })) {
    return { status: 'soft-error-page' };
  }
  const rawSignature = facts.renderDiff?.rawDocument?.textSignature;
  if (rawSignature !== undefined && site.catchAllTextSignatures?.has(rawSignature) === true) {
    return { status: 'soft-error-page' };
  }
  return { status: 'visited' };
}

/** Applies a verdict to a stored manifest entry of a scanned page. The fields
 *  only one status may carry follow it: the redirect target, the dead link's
 *  HTTP status, and the planner's content coverage, which only a `visited`
 *  page holds. The coverage of a page kept out of the content population is
 *  set aside rather than dropped, so a refresh that later decides the page
 *  is content restores it. */
export function applyScannedPageVerdict(
  entry: ManifestPageEntry,
  verdict: ScannedPageVerdict,
): ManifestPageEntry {
  const { redirectTargetUrl: _target, analysisCoverage, setAsideAnalysisCoverage, ...rest } = entry;
  const coverage: PageAnalysisCoverage | undefined = analysisCoverage ?? setAsideAnalysisCoverage;
  const next: ManifestPageEntry = { ...rest, status: verdict.status };
  if (verdict.status === 'redirect-interstitial' && verdict.redirectTargetUrl !== undefined) {
    next.redirectTargetUrl = verdict.redirectTargetUrl;
  }
  if (verdict.status === 'http-error-status') next.httpStatus = verdict.httpStatus;
  if (coverage !== undefined) {
    if (verdict.status === 'visited') next.analysisCoverage = coverage;
    else next.setAsideAnalysisCoverage = coverage;
  }
  return next;
}
