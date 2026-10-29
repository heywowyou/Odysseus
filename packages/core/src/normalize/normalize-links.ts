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

/** Markup that declares an `<a>` a script control rather than a link: what
 *  `role="button"` says, written another way. Lighthouse exempts only the
 *  role, so a cookie-settings opener, a menu toggle or a filter written as
 *  `<a href="javascript:void(0)" class="btn">` counted as a link search
 *  engines cannot follow, and on four hotel previews that footer control
 *  became a "links search engines cannot read" priority with no page
 *  behind it. A hidden anchor with no destination is the same non-link:
 *  nobody sees it and nothing can follow it. A hotel CMS writes a
 *  `display:none` admin loader, empty editable-link placeholders and "read
 *  more" expanders on every page, and on two more previews they became the
 *  same false priority. Read from the opening tag, so a stored scan is
 *  judged too.
 *
 *  One more batch showed the same control written other ways: a date
 *  picker's arrows (`data-handler`, `data-event`) on 95 pages of one site, a
 *  tab or a panel opener naming the element it shows (`data-target="#..."`),
 *  a gallery filter (`data-filter-*`), and openers named only by their id
 *  (`modalPlanityButton`) or by a class ending in `-open`. The id is read
 *  like the classes, and a camel-cased name is read as its words.
 *
 *  A privacy policy writes its cookie-preferences link as plain bold text
 *  (`class="link"`) whose only tell is a click handler that opens the
 *  consent manager (`onclick="openAxeptioCookies()"`); on one more preview
 *  it was the whole "links search engines cannot read" priority.
 *
 *  A booking button written as `<a class="book" href="javascript:void(0);">`
 *  opens the booking engine's overlay from script; on one more preview it
 *  was every sample of that priority. A booking class reads as a control
 *  only when the link has no destination, like every name here. */
const CONTROL_ATTRIBUTE_PATTERN =
  /\s(?:type\s*=\s*["']?button|aria-(?:controls|expanded|haspopup)\s*=|[\w:-]*toggle[\w:-]*\s*=|data-(?:handler|event)\s*=|data-filter[\w-]*\s*=|data-(?:bs-)?target\s*=\s*["']?#|onclick\s*=\s*["'][^"']*(?:axeptio|tarteaucitron|didomi|klaro|cookiebot|onetrust|cmplz|cookie)|hidden(?=[\s>=/]))/i;
const CONTROL_STYLE_PATTERN =
  /\sstyle\s*=\s*["'][^"']*(?:pointer-events\s*:\s*none|cursor\s*:\s*default|display\s*:\s*none|visibility\s*:\s*hidden)/i;
const CONTROL_CLASS_PATTERN =
  /(?:^|[\s_-])(?:btn|button|nolink|toggle|close|open|opener|modal|popup|popin|datepicker|read-?more|book(?:ing)?|reserv\w*|resa|tarteaucitron\w*|openaxeptio\w*|axeptio\w*|cmplz\w*|klaro\w*|cm-btn|didomi\w*|ot-sdk\w*|cky\w*|cookie\w*)(?:$|[\s_-])/i;

/** A consent manager's own panel, named by the id the link's selector
 *  starts from. Klaro writes its "set my preferences" opener as a bare
 *  `<a class="" href="javascript:void(0);">` inside `#klaro-manager`: nothing
 *  on the tag declares a control, and on one hotel preview that single link,
 *  repeated on every page, became the same false priority. */
const CONSENT_PANEL_SELECTOR_PATTERN =
  /^#(?:klaro|tarteaucitron|axeptio|cmplz|didomi|onetrust|ot-sdk|cky|cookie)/i;

function declaresScriptControl(snippet: string, selector: string): boolean {
  if (CONSENT_PANEL_SELECTOR_PATTERN.test(selector)) return true;
  const openingTag = snippet.slice(0, snippet.indexOf('>') + 1 || undefined);
  if (CONTROL_ATTRIBUTE_PATTERN.test(openingTag) || CONTROL_STYLE_PATTERN.test(openingTag)) {
    return true;
  }
  const classes = /\sclass\s*=\s*["']([^"']*)/i.exec(openingTag)?.[1] ?? '';
  const id = /\sid\s*=\s*["']([^"']*)/i.exec(openingTag)?.[1] ?? '';
  return [...classes.split(/\s+/), id].some((name) =>
    CONTROL_CLASS_PATTERN.test(name.replace(/([a-z0-9])([A-Z])/g, '$1-$2')),
  );
}

export function isUncrawlableAnchor(anchor: AnchorFactInput, pageUrl: string): boolean {
  const rawHref = (anchor.rawHref ?? '').replace(/\s/g, '');
  if (anchor.role.trim().length > 0) return false;
  // A control with no destination is not a link a crawler misses. An href
  // that names a destination is still judged, whatever the markup says. An
  // anchor with no destination and no text either is an icon control or an
  // empty wrapper (a booking widget's toolbar, a slideshow's slide): there
  // is no link there for a reader or a crawler to follow.
  if (
    (anchor.rawHref === null || anchor.href === '' || JAVASCRIPT_VOID_PATTERN.test(rawHref)) &&
    (anchor.text.trim() === '' || declaresScriptControl(anchor.snippet, anchor.selector))
  ) {
    return false;
  }
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
      // Page-independent (issue #503): the links are listed in the evidence.
      description: `Links on this page use generic text such as "read more" that says nothing about the destination. Descriptive link text helps search engines understand the linked content.`,
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
