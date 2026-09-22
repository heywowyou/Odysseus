/**
 * Milestone 8 (extended accessibility pass): raw-fact extraction for the
 * alt-text quality heuristic. Deliberately does not flag a missing alt
 * attribute at all - axe's image-alt rule already does (accessible-name
 * computation), and duplicating it would recreate the same mistake
 * avoided everywhere else in milestone 8. This only reports facts about
 * alt text that IS present, plus enough context (src, decorative
 * markers, rendered size) for core to judge quality - see
 * normalize-alt-text.ts for why this stays a heuristic, never a
 * definitive detection, per docs/rules/manual-accessibility-checklist.md.
 */

import type { Page } from 'playwright';

export interface ImageFact {
  selector: string;
  /** null only when the attribute is entirely absent - already axe's
   *  territory, not judged here. Empty string ("") is a real, distinct
   *  case: a deliberate decorative-image marker if used correctly. */
  alt: string | null;
  src: string;
  /** role="presentation"/"none" or aria-hidden="true". */
  isMarkedDecorative: boolean;
  width: number;
  height: number;
  /** True when the element still exposes a data/blob placeholder rather than
   *  a loaded resource, so core records no confident heuristic finding. */
  undetermined?: boolean;
}

export interface AltTextExtraction {
  pageUrl: string;
  images: ImageFact[];
}

/** B5 (2026-08-24 three-site review): this check used to label every
 *  image `img:nth-of-type(N)` where N was its index among *all* images in
 *  the document. `:nth-of-type` is scoped to an element's parent, so that
 *  selector usually does not match the element it names, and often
 *  matches nothing at all - a developer handed "img:nth-of-type(32)" for
 *  172 occurrences across 23 pages (real Palais Gallien report) has
 *  nothing to act on. Replaced by, in order of preference: the element's
 *  id, its image source (what a developer actually recognises and can
 *  grep for), or a structural nth-child path, which is always valid CSS
 *  and always resolves to exactly one element. */
const SRC_SELECTOR_MAX_LENGTH = 120;

export async function extractAltTextFacts(page: Page, pageUrl: string): Promise<AltTextExtraction> {
  const images = await page.evaluate((srcSelectorMaxLength) => {
    /** A guaranteed-valid, guaranteed-unique path. Stops at the nearest
     *  ancestor carrying an id, since that already pins the subtree. */
    const structuralPath = (el: Element): string => {
      const parts: string[] = [];
      let current: Element | null = el;
      while (current && current !== document.documentElement) {
        if (current.id) {
          parts.unshift(`#${CSS.escape(current.id)}`);
          break;
        }
        const parent: Element | null = current.parentElement;
        if (!parent) break;
        const index = Array.from(parent.children).indexOf(current) + 1;
        parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
        current = parent;
      }
      return parts.join(' > ');
    };

    const elements = Array.from(document.querySelectorAll('img'));
    return elements.map((el) => {
      const rect = el.getBoundingClientRect();
      const role = el.getAttribute('role');
      const isMarkedDecorative =
        role === 'presentation' || role === 'none' || el.getAttribute('aria-hidden') === 'true';

      const rawSrc = el.getAttribute('src') ?? '';
      const currentSrc = el.currentSrc || '';
      // A data: URI is not a filename a developer can recognise, and a
      // very long src would make the annex's selector column unreadable.
      const srcIsUsable =
        rawSrc.length > 0 && rawSrc.length <= srcSelectorMaxLength && !rawSrc.startsWith('data:');

      const selector = el.id
        ? `#${CSS.escape(el.id)}`
        : srcIsUsable
          ? `img[src="${rawSrc}"]`
          : structuralPath(el);

      return {
        selector,
        alt: el.hasAttribute('alt') ? el.getAttribute('alt') : null,
        src: currentSrc || rawSrc,
        isMarkedDecorative,
        width: rect.width,
        height: rect.height,
        ...(currentSrc.startsWith('data:') || (!currentSrc && rawSrc.startsWith('data:'))
          ? { undetermined: true }
          : {}),
      };
    });
  }, SRC_SELECTOR_MAX_LENGTH);

  return { pageUrl, images };
}
