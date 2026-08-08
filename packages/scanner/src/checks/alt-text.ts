/**
 * Milestone 8 (extended accessibility pass): raw-fact extraction for the
 * alt-text quality heuristic. Deliberately does not flag a missing alt
 * attribute at all - axe's image-alt rule already does (accessible-name
 * computation), and duplicating it would recreate the same mistake
 * avoided everywhere else in milestone 8. This only reports facts about
 * alt text that IS present, plus enough context (src, decorative
 * markers, rendered size) for core to judge quality - see
 * normalize-alt-text.ts for why this stays a heuristic, never a
 * definitive detection, per docs/milestone-8-scope-addendum.md section
 * 1.4.
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
}

export interface AltTextExtraction {
  pageUrl: string;
  images: ImageFact[];
}

export async function extractAltTextFacts(page: Page, pageUrl: string): Promise<AltTextExtraction> {
  const images = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('img'));
    return elements.map((el, i) => {
      const rect = el.getBoundingClientRect();
      const role = el.getAttribute('role');
      const isMarkedDecorative =
        role === 'presentation' || role === 'none' || el.getAttribute('aria-hidden') === 'true';
      const selector = el.id ? `#${el.id}` : `img:nth-of-type(${i + 1})`;
      return {
        selector,
        alt: el.hasAttribute('alt') ? el.getAttribute('alt') : null,
        src: el.currentSrc || el.getAttribute('src') || '',
        isMarkedDecorative,
        width: rect.width,
        height: rect.height,
      };
    });
  });

  return { pageUrl, images };
}
