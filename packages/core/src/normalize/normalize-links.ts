/**
 * Per-page link checks that used to come only from Lighthouse's `link-text`
 * and `crawlable-anchors` SEO audits (trade-off 110).
 *
 * Lighthouse runs on a sample of pages since planner v2 (trade-off 109), so
 * a defect it alone detects is only ever reported on the pages it happened
 * to measure. These two audits are page-content checks, not measurements:
 * nothing about them needs Lighthouse's throttled navigation, and a link
 * with generic text on an unsampled page is just as real as one on a
 * sampled page. They now run on every page as part of the head-metadata
 * check, and normalize.ts drops Lighthouse's copy of both audits on any page
 * where this extraction ran, so the same link is never reported twice.
 *
 * The rule ids are kept (`link-text`, `crawlable-anchors`) so the existing
 * French and English report copy, remediation and proof-card wording carry
 * over unchanged. The predicates below reproduce Lighthouse 13's own rules
 * (core/audits/seo/link-text.js and crawlable-anchors.js, Apache-2.0) so the
 * move changes where a defect is found, not what counts as one.
 *
 * The same predicates run twice: in the scanner, to keep only the failing
 * anchors out of the hundreds a page can carry, and here, over what was
 * stored, so a stored scan is judged by today's rule.
 */

import type { FindingCandidate } from './candidate.js';
import { shapeIdentity } from './normalize-axe.js';
import { MAX_LIGHTHOUSE_DETAILS_ITEMS } from './constants.js';
import { severityFromCustom } from './severity.js';

export const LINK_TEXT_RULE_ID = 'link-text';
export const CRAWLABLE_ANCHORS_RULE_ID = 'crawlable-anchors';

/** One `<a>` element as the page presented it. */
export interface AnchorFactInput {
  selector: string;
  /** Opening tag, truncated, for the report annex. */
  snippet: string;
  /** The href attribute as written, or null when the attribute is absent. */
  rawHref: string | null;
  /** The href as the browser resolved it; '' when there is none. */
  href: string;
  /** Rendered text of the link. */
  text: string;
  rel: string;
  role: string;
  name: string;
  id: string;
  /** Nearest `lang` attribute at or above the link, or null. */
  textLang: string | null;
  /** True when the link points at the page it sits on, ignoring the
   *  fragment: an in-page jump link, which the text rule never judges. */
  pointsToSamePage: boolean;
  /** Carries one of the attributes the HTML spec only allows alongside an
   *  href (target, download, ping, rel, hreflang, type, referrerpolicy). */
  hasHrefAssociatedAttribute: boolean;
  /** Has at least one event listener registered on the element itself. */
  hasEventListener: boolean;
}

/** Lighthouse 13's list, verbatim. It has no French entry; see
 *  trade-off 110 for why that gap is kept rather than silently widened. */
const NON_DESCRIPTIVE_LINK_TEXTS: Readonly<Record<string, ReadonlySet<string>>> = {
  en: new Set([
    'click here',
    'click this',
    'go',
    'here',
    'information',
    'learn more',
    'more',
    'more info',
    'more information',
    'right here',
    'read more',
    'see more',
    'start',
    'this',
  ]),
  ja: new Set(['ここをクリック', 'こちらをクリック', 'リンク', '続きを読む', '続く', '全文表示']),
  es: new Set([
    'click aquí',
    'click aqui',
    'clicka aquí',
    'clicka aqui',
    'pincha aquí',
    'pincha aqui',
    'aquí',
    'aqui',
    'más',
    'mas',
    'más información',
    'más informacion',
    'mas información',
    'mas informacion',
    'este',
    'enlace',
    'este enlace',
    'empezar',
  ]),
  pt: new Set(['clique aqui', 'ir', 'mais informação', 'mais informações', 'mais', 'veja mais']),
  ko: new Set([
    '여기',
    '여기를 클릭',
    '클릭',
    '링크',
    '자세히',
    '자세히 보기',
    '계속',
    '이동',
    '전체 보기',
  ]),
  sv: new Set(['här', 'klicka här', 'läs mer', 'mer', 'mer info', 'mer information']),
  de: new Set([
    'klicke hier',
    'hier klicken',
    'hier',
    'mehr',
    'siehe',
    'dies',
    'das',
    'weiterlesen',
  ]),
  ta: new Set([
    'அடுத்த பக்கம்',
    'மறுபக்கம்',
    'முந்தைய பக்கம்',
    'முன்பக்கம்',
    'மேலும் அறிக',
    'மேலும் தகவலுக்கு',
    'மேலும் தரவுகளுக்கு',
    'தயவுசெய்து இங்கே அழுத்தவும்',
    'இங்கே கிளிக் செய்யவும்',
  ]),
  fa: new Set([
    'اطلاعات بیشتر',
    'اطلاعات',
    'این',
    'اینجا بزنید',
    'اینجا کلیک کنید',
    'اینجا',
    'برو',
    'بیشتر بخوانید',
    'بیشتر بدانید',
    'بیشتر',
    'شروع',
  ]),
};

/** A link's identity for the crawlability rule: its tag and classes when it
 *  has any, else its full markup shape. Link snippets are capped at 200
 *  characters, so the attribute list of a long opening tag depends on where
 *  the cap fell; on a real site the same booking button carried a different
 *  SEO aria-label on each page and its attribute list changed with it. The
 *  class names what kind of link it is, which is what the fix addresses. */
function anchorShape(snippet: string): string | undefined {
  const shape = shapeIdentity(snippet);
  if (shape === undefined) return undefined;
  const classed = /^([\w-]+\.[^[]+)\[/.exec(shape);
  return classed === null ? shape : classed[1];
}

export function hasNonDescriptiveLinkText(anchor: AnchorFactInput): boolean {
  if (!anchor.href || anchor.rel.includes('nofollow')) return false;
  const href = anchor.href.toLowerCase();
  if (href.startsWith('javascript:') || href.startsWith('mailto:') || anchor.pointsToSamePage) {
    return false;
  }
  const searchTerm = anchor.text.trim().toLowerCase();
  if (searchTerm === '') return false;
  // A detected language narrows the lookup to that language's list, and a
  // language with no list is never flagged; with no language every list
  // applies. Same as Lighthouse.
  if (anchor.textLang) {
    const lang = anchor.textLang.split('-')[0]!.toLowerCase();
    return NON_DESCRIPTIVE_LINK_TEXTS[lang]?.has(searchTerm) ?? false;
  }
  return Object.values(NON_DESCRIPTIVE_LINK_TEXTS).some((texts) => texts.has(searchTerm));
}

const JAVASCRIPT_VOID_PATTERN = /javascript:void(\(|)0(\)|)/;

export function isUncrawlableAnchor(anchor: AnchorFactInput, pageUrl: string): boolean {
  const rawHref = (anchor.rawHref ?? '').replace(/\s/g, '');
  if (anchor.role.trim().length > 0) return false;
  if (rawHref.startsWith('mailto:')) return false;
  // `<a id="...">` used as a jump target, not as a link.
  if (rawHref === '' && anchor.id) return false;
  if (rawHref.startsWith('file:')) return true;
  if (anchor.name.trim().length > 0) return false;
  // Without an href an <a> is a placeholder, unless script listens on it,
  // in which case it is acting as a link no crawler can follow.
  if (anchor.rawHref === null && !anchor.hasHrefAssociatedAttribute) {
    return anchor.hasEventListener;
  }
  if (anchor.href === '') return true;
  if (JAVASCRIPT_VOID_PATTERN.test(rawHref)) return true;
  try {
    new URL(rawHref, pageUrl);
  } catch {
    return true;
  }
  return false;
}

function crawlabilityFailureReason(anchor: AnchorFactInput, pageUrl: string): string {
  const rawHref = (anchor.rawHref ?? '').replace(/\s/g, '');
  if (rawHref.startsWith('file:')) return 'file-url';
  if (anchor.href === '') return anchor.rawHref === null ? 'missing-href' : 'empty-href';
  if (JAVASCRIPT_VOID_PATTERN.test(rawHref)) return 'javascript-url';
  try {
    new URL(rawHref, pageUrl);
    return 'uncrawlable-anchor';
  } catch {
    return 'invalid-url';
  }
}

export function extractLinkCandidates(
  anchors: readonly AnchorFactInput[],
  pageUrl: string,
): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];

  const genericLinks = anchors.filter(hasNonDescriptiveLinkText);
  if (genericLinks.length > 0) {
    // One finding per page, like Lighthouse: the defect is the page's
    // wording habit, and each link is listed as evidence.
    candidates.push({
      source: 'custom',
      ruleId: LINK_TEXT_RULE_ID,
      category: 'seo',
      severity: severityFromCustom(LINK_TEXT_RULE_ID),
      wcagCriteria: [],
      title: 'Links do not have descriptive text',
      description: `${genericLinks.length} link(s) on this page use generic text such as "read more" that says nothing about the destination. Descriptive link text helps search engines understand the linked content.`,
      pageUrl,
      element: null,
      rawEvidenceForPage: {
        links: genericLinks
          .slice(0, MAX_LIGHTHOUSE_DETAILS_ITEMS)
          .map(({ href, text }) => ({ href, text })),
        totalItems: genericLinks.length,
        truncated: genericLinks.length > MAX_LIGHTHOUSE_DETAILS_ITEMS,
      },
    });
  }

  const uncrawlable = anchors.filter((anchor) => isUncrawlableAnchor(anchor, pageUrl));
  for (const anchor of uncrawlable) {
    const reason = crawlabilityFailureReason(anchor, pageUrl);
    const shape = anchorShape(anchor.snippet);
    candidates.push({
      source: 'custom',
      ruleId: CRAWLABLE_ANCHORS_RULE_ID,
      category: 'seo',
      severity: severityFromCustom(CRAWLABLE_ANCHORS_RULE_ID),
      wcagCriteria: [],
      title: 'Links are not crawlable',
      description:
        'This link has no destination a search engine can follow (a missing or empty href, a javascript: URL, or an invalid address), so the page it leads to cannot be discovered through it.',
      pageUrl,
      ...(shape !== undefined ? { dedupeIdentity: `crawlable-anchors:${reason}|${shape}` } : {}),
      element: { pageUrl, selector: anchor.selector, snippet: anchor.snippet },
      rawEvidenceForPage: {
        rawHref: anchor.rawHref,
        hasEventListener: anchor.hasEventListener,
        reason,
      },
    });
  }

  return candidates;
}
