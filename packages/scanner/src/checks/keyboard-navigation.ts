/**
 * Milestone 8 (extended accessibility pass): keyboard-trap and
 * focus-order-mismatch. Both come from one real Tab-key walk of the
 * page - Playwright sends genuine keyboard events (page.keyboard.press),
 * not simulated focus() calls, since a trap only exists as a browser
 * behavior a real Tab press can reveal.
 *
 * Safety: this only presses Tab. It never clicks, never submits, never
 * types into a field, so it carries none of the live-side-effect risk a
 * check that interacts with real form controls would (see forms.ts's
 * own, much more careful, doc comment on that exact concern). Tabbing
 * through a page is what every real keyboard user already does by
 * visiting it.
 *
 * Elements are tagged with a temporary data attribute during the walk so
 * "did focus move to a genuinely different element" can be answered
 * precisely (selector-string comparison alone risks two different
 * elements coincidentally sharing a computed selector); the attribute is
 * removed again before returning, so nothing about the check itself
 * leaks into the page's own DOM state.
 */

import type { Page } from 'playwright';

export interface KeyboardNavigationExtraction {
  pageUrl: string;
  /** Every element considered tabbable, in DOM order. Empty when the
   *  page has nothing to tab through. */
  tabbableCount: number;
  tabbableSelectors: string[];
  /** DOM-order index of each element actually focused, in the order Tab
   *  visited them (nulls where a Tab press landed outside the tagged
   *  tabbable set, e.g. the browser chrome or an iframe boundary - not
   *  itself evidence of anything, just excluded from analysis). */
  focusSequence: Array<number | null>;
}

const TAB_ATTR = 'data-odysseus-tab-id';
/** Bounds worst-case cost on a page with an unusually large number of
 *  tabbable elements - real pages rarely need anywhere near this many
 *  Tab presses to reveal a trap or a bad reorder. */
const MAX_TAB_PRESSES = 60;

export async function walkKeyboardNavigation(page: Page, pageUrl: string): Promise<KeyboardNavigationExtraction> {
  const tabbables = await page.evaluate((attr) => {
    // isVisible is inlined here rather than pulled out as a named helper:
    // this whole callback is serialized via Function.prototype.toString()
    // and sent into the page's own JS context by page.evaluate(), which
    // has no knowledge of the file's outer scope. Under tsx's dev runtime
    // (esbuild --keep-names, used so stack traces stay readable), a named
    // function declaration here gets a __name(fn, "fn") call spliced in
    // right after it for .name preservation - a helper that only exists
    // in the *outer* module, not in the serialized string sent to the
    // page, so it throws ReferenceError there. An anonymous inline
    // predicate has no name for esbuild to preserve, so nothing gets
    // spliced in. Confirmed via a real fixture run: this check silently
    // produced zero findings under `tsx` until inlined.
    const candidates = Array.from(
      document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'),
    ).filter((el) => {
      if (el.getAttribute('tabindex') === '-1') return false;
      if (el.hasAttribute('disabled')) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none';
    });

    candidates.forEach((el, i) => el.setAttribute(attr, String(i)));

    return candidates.map((el, i) => ({
      id: i,
      selector: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}:nth-of-type(${i + 1})`,
    }));
  }, TAB_ATTR);

  const focusSequence: Array<number | null> = [];

  if (tabbables.length > 0) {
    const maxPresses = Math.min(tabbables.length + 5, MAX_TAB_PRESSES);
    for (let i = 0; i < maxPresses; i++) {
      await page.keyboard.press('Tab');
      const focusedId = await page.evaluate((attr) => {
        const el = document.activeElement;
        const value = el?.getAttribute?.(attr);
        return value !== null && value !== undefined ? Number(value) : null;
      }, TAB_ATTR);
      focusSequence.push(focusedId);
    }

    await page.evaluate((attr) => {
      document.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));
    }, TAB_ATTR);
  }

  return {
    pageUrl,
    tabbableCount: tabbables.length,
    tabbableSelectors: tabbables.map((t) => t.selector),
    focusSequence,
  };
}
