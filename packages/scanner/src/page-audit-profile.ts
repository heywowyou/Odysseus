/**
 * Bounded, deterministic per-page structural profile for the full-audit
 * planner (plan 021, `docs/decisions/trade-offs.md` entry 64). Extracted
 * from the crawler's existing post-`load` page, no extra navigation.
 *
 * This module only extracts raw structural facts (`RawPageAuditFacts`) and
 * computes a template-family hash from them. It deliberately does not
 * decide a page's role: `full-audit-plan.ts`'s `buildContentAuditPlan`
 * owns the signal-threshold classification (how many independent signals
 * make a "listing", what promotes to "transactional", what falls back to
 * "unknown"), so every scheduling threshold lives in one auditable module
 * rather than split across two. This module answers only "what did the
 * page actually contain", never "what should we do about it".
 *
 * Never stores raw HTML, body text, or a full link list. Only a normalized
 * structural token stream is hashed; volatile IDs, inline styles, text,
 * URLs, dates, and attribute values are dropped before hashing.
 */

import { createHash } from 'node:crypto';
import type { Page as BrowserPage } from 'playwright';
import { NUMBERED_PAGINATION_SELECTOR } from './link-admission.js';

/** v2: the template-family hash is taken over the page skeleton
 *  (`templateSkeleton`), not the raw token stream. v1 and v2 hashes are not
 *  comparable; the planner version bump that shipped with this keeps a v1
 *  checkpoint from being resumed into a v2 plan. */
const PAGE_AUDIT_PROFILE_VERSION = 'v2';

/** A signal is independent structural evidence found on the page. The
 *  planner counts distinct *kinds* present, never raw occurrence counts,
 *  so five near-duplicate signals of the same kind never outweigh two
 *  different kinds. */
export type PageRoleSignalKind =
  | 'homepage-url'
  | 'operator-seed'
  | 'transactional-form'
  | 'external-transactional-link'
  | 'pagination-relation'
  | 'numbered-pagination-control'
  | 'listing-structural-class'
  | 'listing-json-ld-type'
  | 'content-json-ld-type'
  | 'repeated-teaser-links'
  | 'noindex-robots'
  | 'canonical-elsewhere';

export interface PageRoleSignal {
  kind: PageRoleSignalKind;
  detail: string;
}

export interface PageAuditProfile {
  url: string;
  /** Stored checkpoints can still carry v1 profiles. */
  profileVersion: 'v1' | typeof PAGE_AUDIT_PROFILE_VERSION;
  language?: string;
  roleSignals: readonly PageRoleSignal[];
  /** Absent means a unique family, never a shared default bucket: the
   *  planner must schedule this page as its own singleton family. */
  templateFamilyId?: string;
}

/** Facts extracted directly from the DOM of the already-loaded page. Kept
 *  separate from `PageAuditProfile` so the signal classification and
 *  hashing below are pure functions a test can call with a plain object,
 *  no browser required. */
export interface RawPageAuditFacts {
  htmlLang?: string;
  canonicalHref?: string;
  metaRobotsNoindex: boolean;
  /** Top-level `@type` values across every JSON-LD block on the page. A
   *  block declaring an array of types contributes each one. */
  jsonLdTypes: readonly string[];
  paginationRelNext: boolean;
  paginationRelPrev: boolean;
  /** Numbered pagination controls (page-number links/buttons inside a
   *  nav/pagination-labelled container), not raw anchor count. */
  numberedPaginationControlCount: number;
  /** Class tokens on `<body>` and its immediate structural containers. */
  bodyClassTokens: readonly string[];
  /** Forms whose action, id, or field names match booking/checkout/
   *  contact/quote intent, not merely present forms (a newsletter
   *  signup is not a transactional signal). */
  transactionalFormSignalCount: number;
  /** Links to a different origin whose visible text matches the same
   *  booking/checkout/contact/quote intent as transactionalFormSignalCount,
   *  e.g. "Reserver un sejour" pointing at a third-party booking engine.
   *  Issue #86: a hotel handing booking off to a PMS/booking engine has no
   *  same-document form at all, so this signal exists specifically for
   *  that real-world pattern rather than one this table only imagines. */
  externalTransactionalLinkCount: number;
  /** Largest group of near-identical repeated link/card structures found
   *  (e.g. a list of post teasers). Zero when no such repetition exists. */
  repeatedTeaserLinkGroupSize: number;
  /** Normalized structural token stream, in document order: tag names,
   *  landmark roles, and stable class/attribute names only. No text,
   *  URLs, dates, or volatile IDs. Empty when the page has no meaningful
   *  structure to hash (e.g. a near-blank error page). */
  structuralTokens: readonly string[];
}

/** At least six repeated card/teaser structures is what actually
 *  distinguishes an editorial listing from a page that merely has a
 *  related-posts widget in its sidebar (typically two or three items). */
const REPEATED_TEASER_THRESHOLD = 6;

const LISTING_JSON_LD_TYPES = new Set(['CollectionPage', 'ItemList', 'Blog', 'SearchResultsPage']);
const CONTENT_JSON_LD_TYPES = new Set([
  'Article',
  'BlogPosting',
  'NewsArticle',
  'Product',
  'FAQPage',
  'Hotel',
  'LodgingBusiness',
  'Resort',
  'BedAndBreakfast',
]);
const LISTING_CLASS_PATTERN =
  /\b(archive|blog-index|category|tag|taxonomy|listing|search-results|pagination)\b/i;

/** Issue #88: containers that exist once per page across the whole site.
 *  An external transactional link inside one of them is site navigation,
 *  not a fact about the page it appears on, so it contributes nothing to
 *  the page's transactional signal. Exported so the jsdom test pins the
 *  vocabulary; extractRawPageAuditFacts inlines the same selector because
 *  an evaluate closure cannot reference module scope - keep the two in
 *  sync. */
export const SITE_WIDE_CHROME_SELECTOR =
  'header, footer, nav, [role="navigation"], [role="banner"], [role="contentinfo"]';

export function anchorIsInSiteWideChrome(anchor: Element): boolean {
  return anchor.closest(SITE_WIDE_CHROME_SELECTOR) !== null;
}

/** One signal per matching class token, deduplicated by kind: the planner
 *  only ever counts a kind once regardless of how many class names or
 *  JSON-LD blocks produced it. */
export function classifyPageRoleSignals(facts: RawPageAuditFacts): PageRoleSignal[] {
  const signals: PageRoleSignal[] = [];
  const seenKinds = new Set<PageRoleSignalKind>();
  const addOnce = (kind: PageRoleSignalKind, detail: string): void => {
    if (seenKinds.has(kind)) return;
    seenKinds.add(kind);
    signals.push({ kind, detail });
  };

  if (facts.transactionalFormSignalCount > 0) {
    addOnce('transactional-form', `${facts.transactionalFormSignalCount} form(s)`);
  }
  if (facts.externalTransactionalLinkCount > 0) {
    addOnce('external-transactional-link', `${facts.externalTransactionalLinkCount} link(s)`);
  }
  if (facts.paginationRelNext || facts.paginationRelPrev) {
    const rels = [
      ...(facts.paginationRelNext ? ['next'] : []),
      ...(facts.paginationRelPrev ? ['prev'] : []),
    ];
    addOnce('pagination-relation', rels.join(','));
  }
  if (facts.numberedPaginationControlCount > 0) {
    addOnce('numbered-pagination-control', String(facts.numberedPaginationControlCount));
  }
  for (const token of facts.bodyClassTokens) {
    if (LISTING_CLASS_PATTERN.test(token)) {
      addOnce('listing-structural-class', token);
      break;
    }
  }
  for (const type of facts.jsonLdTypes) {
    if (LISTING_JSON_LD_TYPES.has(type)) addOnce('listing-json-ld-type', type);
    if (CONTENT_JSON_LD_TYPES.has(type)) addOnce('content-json-ld-type', type);
  }
  if (facts.repeatedTeaserLinkGroupSize >= REPEATED_TEASER_THRESHOLD) {
    addOnce('repeated-teaser-links', String(facts.repeatedTeaserLinkGroupSize));
  }
  if (facts.metaRobotsNoindex) {
    addOnce('noindex-robots', 'noindex');
  }

  return signals;
}

/** A canonical pointing somewhere other than the page's own URL (ignoring
 *  a trailing slash or fragment) is weak evidence the page is a duplicate
 *  or utility view rather than a primary one. Compared here, not inside
 *  `classifyPageRoleSignals`, because it needs the page's own URL, which
 *  lives on the crawl context rather than the DOM-only fact set. */
function isCanonicalElsewhere(canonicalHref: string, pageUrl: string): boolean {
  try {
    const canonical = new URL(canonicalHref, pageUrl);
    const self = new URL(pageUrl);
    canonical.hash = '';
    self.hash = '';
    const strip = (u: URL): string => u.toString().replace(/\/$/, '');
    return strip(canonical) !== strip(self);
  } catch {
    return false;
  }
}

const SKELETON_TAGS = new Set([
  'HEADER',
  'NAV',
  'MAIN',
  'ARTICLE',
  'SECTION',
  'ASIDE',
  'FOOTER',
  'FORM',
  'TABLE',
]);
const LANDMARK_ROLES = new Set([
  'banner',
  'navigation',
  'main',
  'contentinfo',
  'complementary',
  'search',
  'form',
]);
const TOKEN_PATTERN = /^([A-Za-z0-9-]+)(?:\[role=([^\]]+)\])?\.(.*)$/u;

/**
 * The part of a page's structural token stream that belongs to its template
 * rather than to its content or to the moment it was loaded.
 *
 * The raw stream put almost every page of a real hotel site in a family of
 * its own, which turned the two-representatives-per-family Lighthouse
 * sample into "measure every page". Reloading 320 known pages from five
 * audited sites showed why, and each rule below removes one cause:
 *
 * - Headings, and elements that are neither a structural tag nor a landmark
 *   role, vary with content: a room page with four blocks of text and one
 *   with five, or the items of an embedded Instagram feed, which also change
 *   between two loads of the same page (on three of the five sites, 41% to 83%
 *   of pages no longer reproduced their stored hash a few days later).
 * - Class names with a digit are per-page or per-build identifiers
 *   (`post-919`, `page-id-12`, `elementor-element-3fa2`).
 * - Classes on `<article>` describe the post, not the template
 *   (`has-post-thumbnail` against `no-img` on two posts of the same type).
 * - Consecutive identical elements are one repeated block, however many
 *   times the content repeats it.
 *
 * The check was that pages grouped together still perform alike: the
 * Lighthouse score spread inside a family stayed where it was under the raw
 * stream while the number of families fell substantially.
 */
export function templateSkeleton(structuralTokens: readonly string[]): string[] {
  const skeleton: string[] = [];
  for (const token of structuralTokens) {
    const match = TOKEN_PATTERN.exec(token);
    if (match === null) continue;
    const tag = match[1]!.toUpperCase();
    const role = match[2];
    const landmark = role !== undefined && LANDMARK_ROLES.has(role);
    if (!SKELETON_TAGS.has(tag) && !landmark) continue;
    const classes =
      tag === 'ARTICLE'
        ? ''
        : match[3]!
            .split('.')
            .filter((c) => c !== '' && !/\d/u.test(c))
            .sort()
            .join('.');
    const normalized = `${tag}${landmark ? `[role=${role}]` : ''}.${classes}`;
    if (skeleton.at(-1) !== normalized) skeleton.push(normalized);
  }
  return skeleton;
}

/** Deterministic structural hash over the page skeleton. Two pages with the
 *  same skeleton are the same template family; a page with no skeleton (no
 *  structural evidence) returns `undefined` so the caller treats it as its
 *  own unique family rather than grouping it with every other sparse page. */
export function hashTemplateFamily(structuralTokens: readonly string[]): string | undefined {
  const skeleton = templateSkeleton(structuralTokens);
  if (skeleton.length === 0) return undefined;
  const digest = createHash('sha256').update(skeleton.join('\n')).digest('hex');
  return `${PAGE_AUDIT_PROFILE_VERSION}:${digest.slice(0, 16)}`;
}

export interface PageAuditProfileContext {
  url: string;
  /** The crawl's own start URL, already normalized. Read as a role signal
   *  rather than inferred from path shape, since a homepage can live at
   *  any path after a redirect. */
  isHomepage: boolean;
  /** `CrawledPage.discoveryMethod === 'seed'`. Operator seeds never
   *  receive reduced coverage regardless of what the DOM looks like. */
  isOperatorSeed: boolean;
}

export function buildPageAuditProfile(
  facts: RawPageAuditFacts,
  context: PageAuditProfileContext,
): PageAuditProfile {
  const signals = classifyPageRoleSignals(facts);
  if (facts.canonicalHref !== undefined && isCanonicalElsewhere(facts.canonicalHref, context.url)) {
    signals.push({ kind: 'canonical-elsewhere', detail: facts.canonicalHref });
  }
  if (context.isHomepage) signals.unshift({ kind: 'homepage-url', detail: context.url });
  if (context.isOperatorSeed) signals.push({ kind: 'operator-seed', detail: context.url });

  const templateFamilyId = hashTemplateFamily(facts.structuralTokens);

  return {
    url: context.url,
    profileVersion: PAGE_AUDIT_PROFILE_VERSION,
    ...(facts.htmlLang !== undefined ? { language: facts.htmlLang } : {}),
    roleSignals: signals,
    ...(templateFamilyId !== undefined ? { templateFamilyId } : {}),
  };
}

/** Single DOM pass extracting every raw fact this module needs, run once
 *  per page immediately after `load`, before the loaded page is closed.
 *  A failure here (e.g. a page whose DOM throws on evaluation) must never
 *  fail the crawl; callers should catch and fall back to an empty-facts
 *  profile, which naturally classifies as `unknown`/fallback and therefore
 *  never reduces coverage. */
export async function extractRawPageAuditFacts(
  browserPage: BrowserPage,
): Promise<RawPageAuditFacts> {
  return browserPage.evaluate((paginationSelector) => {
    const doc = document;

    const htmlLang = doc.documentElement.getAttribute('lang')?.trim() || undefined;

    const canonicalLink = doc.querySelector('link[rel="canonical"]');
    const canonicalHref = canonicalLink?.getAttribute('href')?.trim() || undefined;

    const robotsMeta = doc.querySelector('meta[name="robots"]');
    const metaRobotsNoindex = /noindex/i.test(robotsMeta?.getAttribute('content') ?? '');

    const jsonLdTypes: string[] = [];
    for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
      try {
        const parsed: unknown = JSON.parse(script.textContent ?? '');
        const nodes = Array.isArray(parsed) ? parsed : [parsed];
        for (const node of nodes) {
          if (node !== null && typeof node === 'object' && '@type' in node) {
            const rawType = (node as { '@type': unknown })['@type'];
            const types = Array.isArray(rawType) ? rawType : [rawType];
            for (const t of types) if (typeof t === 'string') jsonLdTypes.push(t);
          }
        }
      } catch {
        // Malformed JSON-LD contributes no type facts; never fails extraction.
      }
    }

    const paginationRelNext = doc.querySelector('link[rel="next"], a[rel~="next"]') !== null;
    const paginationRelPrev = doc.querySelector('link[rel="prev"], a[rel~="prev"]') !== null;
    const numberedPaginationControlCount = Array.from(
      doc.querySelectorAll(paginationSelector),
    ).filter((el) => /^\d+$/.test((el.textContent ?? '').trim())).length;

    const bodyClassTokens = [
      ...Array.from(doc.body.classList),
      ...Array.from(doc.documentElement.classList),
    ];

    const transactionalPattern =
      /book|reserv|checkout|panier|cart|commande|order|contact|quote|devis/i;
    let transactionalFormSignalCount = 0;
    for (const form of Array.from(doc.querySelectorAll('form'))) {
      const haystack = [
        form.getAttribute('action') ?? '',
        form.getAttribute('id') ?? '',
        form.getAttribute('name') ?? '',
        form.className,
      ].join(' ');
      if (transactionalPattern.test(haystack)) transactionalFormSignalCount += 1;
    }

    // Issue #86: a booking/checkout/contact link-out to a different origin
    // is the dominant transactional pattern on a real hotel site, which
    // typically hands booking off to a third-party PMS/booking engine
    // rather than hosting its own form. Read from the anchor's visible
    // text, since the destination is an opaque third-party URL with no
    // reliable naming convention to match on.
    //
    // Issue #88: anchors inside site-wide chrome are excluded. A booking
    // link in the global header or footer is present on every page of the
    // site, so it carries no page-specific signal; counting it classified
    // every page of a hotel site (the target market) transactional with
    // high confidence, including the privacy policy, and disarmed plan
    // 026's Lighthouse stratification by construction. A page that links
    // out to booking from its content area still fires. Unlike the form
    // signal it was modelled on, which is page-local by nature, a link
    // needs this exclusion to mean anything about the page it appears on.
    // The selector is SITE_WIDE_CHROME_SELECTOR, inlined because an
    // evaluate closure cannot reference module scope; keep the two in sync.
    let externalTransactionalLinkCount = 0;
    for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
      if (
        anchor.closest(
          'header, footer, nav, [role="navigation"], [role="banner"], [role="contentinfo"]',
        ) !== null
      ) {
        continue;
      }
      const href = anchor.getAttribute('href') ?? '';
      let isExternal: boolean;
      try {
        isExternal = new URL(href, location.href).origin !== location.origin;
      } catch {
        isExternal = false;
      }
      if (isExternal && transactionalPattern.test((anchor.textContent ?? '').trim())) {
        externalTransactionalLinkCount += 1;
      }
    }

    // Largest set of sibling elements sharing the same tag and class
    // signature: a cheap, DOM-agnostic proxy for "list of teaser cards"
    // that works across unfamiliar CMS markup without a hand-picked
    // selector list.
    let repeatedTeaserLinkGroupSize = 0;
    const groups = new Map<string, number>();
    for (const el of Array.from(doc.querySelectorAll('a[href]'))) {
      const parent = el.parentElement;
      if (parent === null) continue;
      const signature = `${parent.tagName}.${Array.from(parent.classList).sort().join('.')}>${el.tagName}.${Array.from(el.classList).sort().join('.')}`;
      const next = (groups.get(signature) ?? 0) + 1;
      groups.set(signature, next);
      if (next > repeatedTeaserLinkGroupSize) repeatedTeaserLinkGroupSize = next;
    }

    // Structural token stream for the template-family hash: landmark
    // roles and tag names for a bounded set of structural elements, plus
    // sorted stable class tokens. No text, no URLs, no volatile IDs.
    const structuralTokens: string[] = [];
    const structuralSelector =
      'header, nav, main, article, section, aside, footer, form, table, ' + 'h1, h2, h3, [role]';
    for (const el of Array.from(doc.querySelectorAll(structuralSelector))) {
      const role = el.getAttribute('role');
      const classes = Array.from(el.classList)
        .filter((c) => !/^\d+$/.test(c) && c.length < 40)
        .sort();
      structuralTokens.push(`${el.tagName}${role ? `[role=${role}]` : ''}.${classes.join('.')}`);
    }

    return {
      ...(htmlLang !== undefined ? { htmlLang } : {}),
      ...(canonicalHref !== undefined ? { canonicalHref } : {}),
      metaRobotsNoindex,
      jsonLdTypes,
      paginationRelNext,
      paginationRelPrev,
      numberedPaginationControlCount,
      bodyClassTokens,
      transactionalFormSignalCount,
      externalTransactionalLinkCount,
      repeatedTeaserLinkGroupSize,
      structuralTokens,
    };
  }, NUMBERED_PAGINATION_SELECTOR);
}
