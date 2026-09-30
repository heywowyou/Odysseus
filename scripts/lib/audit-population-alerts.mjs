/**
 * Page-population alerts for one stored audit: the shapes the defect hunt
 * kept finding by hand on sites it had not read before, turned into checks
 * that run on every audit. Each alert names where to look before a report or
 * a preview goes out; it is not a verdict. A site can legitimately serve one
 * page under three addresses, and the alert is then explained, not fixed.
 *
 * The shapes, each first measured on a real audit:
 *  - most of the site redirecting to the homepage: a site that serves its
 *    pages only with a trailing slash and sends the bare spelling home;
 *  - several analysed pages serving one raw document: a catch-all answer or
 *    copies of one page;
 *  - analysed pages that differ by their query string only: booking dates,
 *    tracking tags, menu states;
 *  - an analysed page that is not HTML: a feed or a file;
 *  - a serious absence claim (no legal notice, no accessibility statement),
 *    which the client reads as a verified fact about the whole site;
 *  - an audit that analysed almost none of what it inventoried.
 */

export const MIN_REDIRECT_COLLAPSE_PAGES = 5;
export const REDIRECT_COLLAPSE_SHARE = 0.3;
export const MIN_SHARED_DOCUMENT_PAGES = 3;
export const MIN_QUERY_STRING_PAGES = 3;
export const MIN_INVENTORY_FOR_THIN_ANALYSIS = 10;
export const THIN_ANALYSIS_SHARE = 0.2;

/** Rules that state something is missing from the whole site. */
export const SITE_ABSENCE_RULE_IDS = [
  'lcen-mentions-legales-missing',
  'accessibility-statement-missing',
];

const NON_HTML_CONTENT_TYPE = /^(?!text\/html|application\/xhtml\+xml)[a-z]+\/[a-z0-9.+-]+/i;
const NON_HTML_PATH = /(?:\/feed\/?|\.(?:xml|rss|atom|json|pdf|txt|jpe?g|png|webp|gif|svg))$/i;

function identity(raw) {
  try {
    const url = new URL(raw);
    url.hash = '';
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    if (url.search === '?') url.search = '';
    return url.href;
  } catch {
    return raw;
  }
}

function pathOf(raw) {
  try {
    const url = new URL(raw);
    return `${url.pathname}${url.search}`;
  } catch {
    return raw;
  }
}

function examples(urls) {
  return urls
    .slice(0, 3)
    .map((url) => pathOf(url))
    .join(', ');
}

/**
 * @param {{ manifest: { pages?: Array<{ url: string, status?: string, depth?: number, redirectTargetUrl?: string }> },
 *           scans: Array<{ url: string, renderDiff?: { rawContentType?: string, renderedTitle?: string, rawDocument?: { textSignature?: string } } }>,
 *           findings: Array<{ ruleId: string, severity: string }> }} input
 * @returns {string[]}
 */
export function buildPopulationAlerts({ manifest, scans, findings }) {
  const pages = manifest.pages ?? [];
  const alerts = [];
  const home = pages.find((page) => page.depth === 0);
  const analysed = pages.filter((page) => page.status === undefined || page.status === 'visited');
  const analysedIds = new Set(analysed.map((page) => identity(page.url)));
  const analysedScans = scans.filter((scan) => analysedIds.has(identity(scan.url)));

  if (home === undefined) {
    alerts.push('population: no homepage in the inventory');
  } else {
    // A typed homepage that redirects (to `/fr/`, to the www host) is fine
    // when the page it lands on is analysed.
    const landed =
      home.redirectTargetUrl !== undefined &&
      (home.status === 'redirect-interstitial' || home.status === 'language-redirect')
        ? pages.find((page) => identity(page.url) === identity(home.redirectTargetUrl))
        : home;
    const status = landed?.status ?? 'missing';
    if (landed === undefined || (landed.status !== undefined && landed.status !== 'visited')) {
      alerts.push(
        landed === home
          ? `population: the homepage is not analysed (${status})`
          : `population: the page the homepage redirects to is not analysed (${status})`,
      );
    }
  }

  if (home !== undefined) {
    const homeId = identity(home.url);
    const toHome = pages.filter(
      (page) =>
        page.status === 'redirect-interstitial' &&
        page.redirectTargetUrl !== undefined &&
        identity(page.redirectTargetUrl) === homeId,
    );
    if (
      toHome.length >= MIN_REDIRECT_COLLAPSE_PAGES &&
      toHome.length / pages.length >= REDIRECT_COLLAPSE_SHARE
    ) {
      alerts.push(
        `population: ${toHome.length} of ${pages.length} inventoried pages redirect to the homepage` +
          ` (${examples(toHome.map((page) => page.url))}); check the spelling the site links to`,
      );
    }
  }

  // Same raw text and same rendered title: tag and category archives share
  // their raw text with each other but not their titles, while a catch-all
  // shell and a page's copies share both.
  const bySignature = new Map();
  for (const scan of analysedScans) {
    const signature = scan.renderDiff?.rawDocument?.textSignature;
    if (typeof signature !== 'string') continue;
    const key = `${signature}\u0000${scan.renderDiff?.renderedTitle ?? ''}`;
    bySignature.set(key, [...(bySignature.get(key) ?? []), scan.url]);
  }
  for (const urls of bySignature.values()) {
    if (urls.length < MIN_SHARED_DOCUMENT_PAGES) continue;
    alerts.push(
      `population: ${urls.length} analysed pages serve one raw document (${examples(urls)});` +
        ' a catch-all answer or copies of one page',
    );
  }

  const withQuery = analysed.filter((page) => {
    try {
      return new URL(page.url).search !== '';
    } catch {
      return false;
    }
  });
  if (withQuery.length >= MIN_QUERY_STRING_PAGES) {
    alerts.push(
      `population: ${withQuery.length} analysed pages carry a query string` +
        ` (${examples(withQuery.map((page) => page.url))})`,
    );
  }

  const contentTypeByPage = new Map(
    analysedScans.map((scan) => [identity(scan.url), scan.renderDiff?.rawContentType]),
  );
  const nonHtml = analysed.filter((page) => {
    const contentType = contentTypeByPage.get(identity(page.url));
    if (typeof contentType === 'string' && NON_HTML_CONTENT_TYPE.test(contentType)) return true;
    try {
      return NON_HTML_PATH.test(new URL(page.url).pathname);
    } catch {
      return false;
    }
  });
  if (nonHtml.length > 0) {
    alerts.push(
      `population: ${nonHtml.length} analysed page(s) look like a feed or a file` +
        ` (${examples(nonHtml.map((page) => page.url))})`,
    );
  }

  if (
    pages.length >= MIN_INVENTORY_FOR_THIN_ANALYSIS &&
    analysed.length / pages.length < THIN_ANALYSIS_SHARE
  ) {
    alerts.push(
      `population: only ${analysed.length} of ${pages.length} inventoried pages are analysed`,
    );
  }

  for (const ruleId of SITE_ABSENCE_RULE_IDS) {
    const claim = findings.find(
      (finding) =>
        finding.ruleId === ruleId &&
        (finding.severity === 'critical' || finding.severity === 'serious'),
    );
    if (claim !== undefined) {
      alerts.push(
        `absence: ${ruleId} (${claim.severity}) states the site has none; confirm on the live site`,
      );
    }
  }

  return alerts;
}
