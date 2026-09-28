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
 *
 * Plan 075 J3: the walk starts with whatever the page opened on load, and a
 * consent banner or popup that correctly keeps focus inside itself held the
 * whole walk on four production audits. Each tabbable records the dialog or
 * consent banner it sits in, so core can tell a held walk from the page's
 * own order. A held walk inside a popup that is not a consent banner is
 * repeated once after one Escape press, which closes most popups; a consent
 * banner is never dismissed, because the consent checks rely on the
 * untouched first visit.
 */

import { isTabWalkHeldByDialog } from '@odysseus/core';
import type { Page } from 'playwright';
import { CONSENT_BANNER_SELECTORS } from './cookie-consent.js';

export interface KeyboardNavigationExtraction {
  pageUrl: string;
  /** Every element considered tabbable, in DOM order. Empty when the
   *  page has nothing to tab through. */
  tabbableCount: number;
  tabbableSelectors: string[];
  tabbableKinds: Array<'ordinary' | 'native-substop' | 'embedded' | 'shadow-host'>;
  /** For each tabbable, the selector of the dialog or consent banner that
   *  contains it, or null. */
  tabbableContainers: Array<string | null>;
  /** DOM-order index of each element actually focused, in the order Tab
   *  visited them (nulls where a Tab press landed outside the tagged
   *  tabbable set, e.g. the browser chrome or an iframe boundary - not
   *  itself evidence of anything, just excluded from analysis). */
  focusSequence: Array<number | null>;
  /** The walk was held by a popup and repeated once after an Escape press;
   *  focusSequence is the second walk. */
  escapeRetried?: boolean;
}

/** Containers that legitimately keep focus inside themselves. */
const DIALOG_SELECTORS = [
  'dialog',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[aria-modal="true"]',
];

const TAB_ATTR = 'data-odysseus-tab-id';
/** Bounds worst-case cost on a page with an unusually large number of
 *  tabbable elements - real pages rarely need anywhere near this many
 *  Tab presses to reveal a trap or a bad reorder. */
const MAX_TAB_PRESSES = 60;

async function pressTabs(
  page: Page,
  presses: number,
  signal: AbortSignal | undefined,
): Promise<Array<number | null>> {
  const focusSequence: Array<number | null> = [];
  for (let i = 0; i < presses; i++) {
    if (signal?.aborted) throw new Error('keyboard-navigation aborted');
    await page.keyboard.press('Tab');
    if (signal?.aborted) throw new Error('keyboard-navigation aborted');
    const focusedId = await page.evaluate((attr) => {
      const el = document.activeElement;
      const value = el?.getAttribute?.(attr);
      return value !== null && value !== undefined ? Number(value) : null;
    }, TAB_ATTR);
    focusSequence.push(focusedId);
  }
  return focusSequence;
}

export async function walkKeyboardNavigation(
  page: Page,
  pageUrl: string,
  signal?: AbortSignal,
): Promise<KeyboardNavigationExtraction> {
  if (signal?.aborted) throw new Error('keyboard-navigation aborted');
  const tabbables = await page.evaluate(
    ({ attr, dialogSelector, consentSelector }) => {
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
      const selector =
        'a[href], button, input, select, textarea, iframe, object, embed, [tabindex]';
      const candidates = Array.from(document.querySelectorAll(selector)).filter((el) => {
        if (el.getAttribute('tabindex') === '-1') return false;
        if (el.hasAttribute('disabled')) return false;
        if (el.getAttribute('aria-hidden') === 'true') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = getComputedStyle(el);
        return style.visibility !== 'hidden' && style.display !== 'none';
      });

      candidates.forEach((el, i) => el.setAttribute(attr, String(i)));

      return candidates.map((el, i) => {
        const parts: string[] = [];
        let current: Element | null = el;
        while (current && current !== document.documentElement) {
          if (current.id) {
            parts.unshift(`#${CSS.escape(current.id)}`);
            break;
          }
          const parent: Element | null = current.parentElement;
          if (!parent) break;
          parts.unshift(
            `${current.tagName.toLowerCase()}:nth-child(${Array.from(parent.children).indexOf(current) + 1})`,
          );
          current = parent;
        }
        const tag = el.tagName.toLowerCase();
        const type = el.getAttribute('type')?.toLowerCase();
        const kind: 'ordinary' | 'native-substop' | 'embedded' | 'shadow-host' = [
          'date',
          'time',
          'datetime-local',
          'month',
          'week',
        ].includes(type ?? '')
          ? 'native-substop'
          : ['iframe', 'object', 'embed'].includes(tag)
            ? 'embedded'
            : (el as HTMLElement).shadowRoot !== null
              ? 'shadow-host'
              : 'ordinary';
        // The dialog or consent banner holding this element, named by its id
        // when it has one, else by its tag and role.
        const consentContainer = consentSelector === '' ? null : el.closest(consentSelector);
        const holder = consentContainer ?? el.closest(dialogSelector);
        const container =
          holder === null
            ? null
            : holder.id !== ''
              ? `#${CSS.escape(holder.id)}`
              : `${holder.tagName.toLowerCase()}${holder.getAttribute('role') !== null ? `[role="${holder.getAttribute('role')}"]` : ''}`;
        return {
          id: i,
          selector: parts.join(' > '),
          kind,
          container,
          consent: consentContainer !== null,
        };
      });
    },
    {
      attr: TAB_ATTR,
      dialogSelector: DIALOG_SELECTORS.join(', '),
      consentSelector: CONSENT_BANNER_SELECTORS.join(', '),
    },
  );

  const tabbableSelectors = tabbables.map((t) => t.selector);
  const tabbableKinds = tabbables.map((t) => t.kind);
  const tabbableContainers = tabbables.map((t) => t.container);
  let focusSequence: Array<number | null> = [];
  let escapeRetried = false;

  if (tabbables.length > 0) {
    const maxPresses = Math.min(tabbables.length + 5, MAX_TAB_PRESSES);
    try {
      focusSequence = await pressTabs(page, maxPresses, signal);
      const walk = {
        pageUrl,
        tabbableCount: tabbables.length,
        tabbableSelectors,
        tabbableContainers,
        focusSequence,
      };
      const heldIds = new Set(focusSequence.filter((id): id is number => id !== null));
      const heldByConsent = [...heldIds].some((id) => tabbables[id]?.consent === true);
      if (isTabWalkHeldByDialog(walk) && !heldByConsent) {
        await page.keyboard.press('Escape');
        focusSequence = await pressTabs(page, maxPresses, signal);
        escapeRetried = true;
      }
    } finally {
      await page.evaluate((attr) => {
        document.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));
      }, TAB_ATTR);
    }
  }

  return {
    pageUrl,
    tabbableCount: tabbables.length,
    tabbableSelectors,
    tabbableKinds,
    tabbableContainers,
    focusSequence,
    ...(escapeRetried ? { escapeRetried: true } : {}),
  };
}
