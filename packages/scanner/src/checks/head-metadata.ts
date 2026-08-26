/**
 * Milestone 8, slice 1: raw-fact extraction for the head-metadata custom
 * checks (meta title/description length, canonical conflicts, JSON-LD,
 * heading hierarchy, Open Graph). Same split as every other custom check
 * in this codebase - this module only reports what it found on the page;
 * @odysseus/core's normalize-head-metadata.ts decides what counts as a
 * defect. Runs inside scan-page.ts's existing onRenderedPage hook, no
 * extra page load.
 *
 * Deliberately does not extract facts for whether title/description/
 * canonical are *missing* - Lighthouse's own document-title,
 * meta-description, and canonical audits (seo category, not excluded)
 * already cover the missing case today. Duplicating it here would
 * recreate the exact axe/Lighthouse-accessibility duplicate-finding
 * mistake CLAUDE.md already documents once, just for SEO instead of
 * accessibility. See docs/milestone-8-scope-addendum.md's build session
 * for the full Lighthouse-overlap audit this was checked against.
 */

import type { Page } from 'playwright';

export interface JsonLdBlock {
  raw: string;
  parsed: unknown | null;
  /** Selector for the specific <script> block, computed the same way
   *  detectTransactionalFlow's checkout-form matcher already does (#id
   *  when present, else an nth-of-type positional selector) - never a
   *  sentinel like "script" or "body", per docs/normalization-rules.md
   *  §3. */
  selector: string;
  parseError?: string;
}

export interface HeadingFact {
  level: number;
  text: string;
  selector: string;
}

export interface HreflangLink {
  lang: string;
  href: string;
}

export interface HeadMetadataExtraction {
  pageUrl: string;
  title: string | null;
  metaDescription: string | null;
  /** Every canonical href found, in document order - usually 0 or 1;
   *  more than one is itself the signal normalize-head-metadata.ts
   *  checks for. */
  canonicalUrls: string[];
  openGraphTags: Record<string, string>;
  jsonLdBlocks: JsonLdBlock[];
  headings: HeadingFact[];
  /** Every <link rel="alternate" hreflang="..."> found on this page.
   *  Reciprocity (does the linked page link back) is a cross-page
   *  question this module cannot answer on its own - see
   *  normalize-hreflang.ts, which is given every page's set at once. */
  hreflangLinks: HreflangLink[];
  /** Lowercased content of <meta name="robots">, or null if absent.
   *  X-Robots-Tag response headers are not read here (this hook only
   *  has DOM access, not response headers) - a known, documented
   *  simplification. */
  robotsMeta: string | null;
}

/** Pure: JSON.parse each raw block, capturing a parse error rather than
 *  throwing. Exported separately so this part is unit-testable without a
 *  browser, matching the rest of this codebase's "pure logic, thin
 *  Playwright glue" split. */
export function parseJsonLdBlocks(
  rawBlocks: readonly { raw: string; selector: string }[],
): JsonLdBlock[] {
  return rawBlocks.map(({ raw, selector }) => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return { raw, selector, parsed };
    } catch (error) {
      return {
        raw,
        selector,
        parsed: null,
        parseError: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

export async function extractHeadMetadata(
  page: Page,
  pageUrl: string,
): Promise<HeadMetadataExtraction> {
  const raw = await page.evaluate(() => {
    // The selector expression below is duplicated at each of its two use
    // sites (jsonLdRawBlocks, headings) rather than pulled into a shared
    // named helper: this callback is serialized via
    // Function.prototype.toString() and sent into the page's own JS
    // context by page.evaluate(), which has no knowledge of the file's
    // outer scope. Under tsx's dev runtime (esbuild --keep-names, used so
    // stack traces stay readable), any named function declaration OR any
    // function assigned to a const inside this block gets a
    // __name(fn, "fn") call spliced in right after it for .name
    // preservation - a helper that only exists in the *outer* module, not
    // in the serialized string sent to the page, so it throws
    // ReferenceError there and this whole evaluate() call fails silently
    // into headMetadataError. Only a fully anonymous, unbound expression
    // avoids the injection. See keyboard-navigation.ts for the same fix
    // applied to a different check.
    const title = document.title.trim() || null;
    const metaDescription =
      document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || null;

    const canonicalUrls = Array.from(document.querySelectorAll('link[rel="canonical"]'))
      .map((el) => el.getAttribute('href') ?? '')
      .filter((href) => href.length > 0);

    const openGraphTags: Record<string, string> = {};
    for (const el of Array.from(document.querySelectorAll('meta[property^="og:"]'))) {
      const property = el.getAttribute('property');
      const content = el.getAttribute('content');
      if (property && content) openGraphTags[property] = content;
    }

    const jsonLdElements = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]'),
    );
    const jsonLdRawBlocks = jsonLdElements.map((el) => ({
      raw: el.textContent ?? '',
      selector: el.id
        ? `#${el.id}`
        : `${el.tagName.toLowerCase()}:nth-of-type(${jsonLdElements.indexOf(el) + 1})`,
    }));

    const headingElements = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const headings = headingElements.map((el) => ({
      level: Number(el.tagName.slice(1)),
      text: (el.textContent ?? '').trim(),
      selector: el.id
        ? `#${el.id}`
        : `${el.tagName.toLowerCase()}:nth-of-type(${headingElements.indexOf(el) + 1})`,
    }));

    const hreflangLinks = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]'))
      .map((el) => ({
        lang: el.getAttribute('hreflang') ?? '',
        href: el.getAttribute('href') ?? '',
      }))
      .filter((link) => link.lang.length > 0 && link.href.length > 0);

    const robotsMeta =
      document
        .querySelector('meta[name="robots"]')
        ?.getAttribute('content')
        ?.trim()
        .toLowerCase() || null;

    return {
      title,
      metaDescription,
      canonicalUrls,
      openGraphTags,
      jsonLdRawBlocks,
      headings,
      hreflangLinks,
      robotsMeta,
    };
  });

  return {
    pageUrl,
    title: raw.title,
    metaDescription: raw.metaDescription,
    canonicalUrls: raw.canonicalUrls,
    openGraphTags: raw.openGraphTags,
    jsonLdBlocks: parseJsonLdBlocks(raw.jsonLdRawBlocks),
    headings: raw.headings,
    hreflangLinks: raw.hreflangLinks,
    robotsMeta: raw.robotsMeta,
  };
}
