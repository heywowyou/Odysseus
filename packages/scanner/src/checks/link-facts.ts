/**
 * Trade-off 110: the facts behind the per-page `link-text` and
 * `crawlable-anchors` rules, read from the same rendered page as the rest
 * of the head-metadata check. normalize-links.ts in @odysseus/core owns the
 * rules; this module reads every `<a>` on the page and keeps only the ones
 * those rules flag, so scan.json holds a few failing links rather than the
 * hundreds a hotel menu and footer carry.
 *
 * Whether an `<a>` without an href has an event listener is the one fact
 * the DOM cannot answer, and it is the difference between a placeholder and
 * a script-driven link no crawler can follow (725 such links failed
 * Lighthouse's audit across the stored hotel audits). It is read through
 * the Chrome DevTools Protocol, the same source Lighthouse uses, and only
 * for the anchors where it decides the outcome.
 */

import type { Page } from 'playwright';
import {
  hasNonDescriptiveLinkText,
  isUncrawlableAnchor,
  type AnchorFactInput,
} from '@odysseus/core';

/** Upper bound on the anchors stored per page. Findings cap their own
 *  element lists lower than this; the rest is only a count. */
const MAX_STORED_ANCHORS = 50;
/** Upper bound on the listener lookups per page, one protocol round trip
 *  each. A page with more placeholder anchors than this is judged on the
 *  first ones. */
const MAX_LISTENER_PROBES = 200;
const SNIPPET_MAX_LENGTH = 200;

type AnchorFact = Omit<AnchorFactInput, 'hasEventListener'> & {
  /** Position in document.querySelectorAll('a'), for the listener lookup. */
  index: number;
  /** The listener is what decides this anchor's crawlability. */
  needsListenerProbe: boolean;
};

async function readAnchorFacts(page: Page): Promise<AnchorFact[]> {
  return page.evaluate(
    // No named or const-bound function inside this callback: under tsx's
    // keep-names transform each one gains a __name() call that does not
    // exist in the page, and the whole evaluate throws. See the note in
    // head-metadata.ts.
    ({ snippetMaxLength }) => {
      const hrefAssociated = [
        'target',
        'download',
        'ping',
        'rel',
        'hreflang',
        'type',
        'referrerpolicy',
      ];
      const pageAddress = location.href.split('#')[0];

      // SVG <a> elements match too, which is why href is not assumed a string.
      return Array.from(document.querySelectorAll<Element>('a')).map((el, index) => {
        const rawHref = el.getAttribute('href');
        const resolved: unknown = (el as Element & { href?: unknown }).href;
        const href =
          typeof resolved === 'string'
            ? resolved
            : ((resolved as { baseVal?: string } | undefined)?.baseVal ?? '');
        const text = el instanceof HTMLElement ? el.innerText : (el.textContent ?? '');
        const role = el.getAttribute('role') ?? '';
        const name = el.getAttribute('name') ?? '';
        const id = el.id;
        const hasHrefAssociatedAttribute = hrefAssociated.some((attribute) =>
          el.hasAttribute(attribute),
        );
        const path: string[] = [];
        let current: Element | null = el;
        while (current && current !== document.documentElement) {
          if (current.id) {
            path.unshift(`#${CSS.escape(current.id)}`);
            break;
          }
          const parent: Element | null = current.parentElement;
          if (!parent) break;
          const position = Array.from(parent.children).indexOf(current) + 1;
          path.unshift(`${current.tagName.toLowerCase()}:nth-child(${position})`);
          current = parent;
        }
        const outer = el.outerHTML;
        const openingTag = outer.slice(0, outer.indexOf('>') + 1) || outer;
        return {
          index,
          selector: path.join(' > '),
          snippet: openingTag.slice(0, snippetMaxLength),
          rawHref,
          href,
          text,
          rel: el.getAttribute('rel') ?? '',
          role,
          name,
          id,
          textLang: el.closest('[lang]')?.getAttribute('lang') ?? null,
          pointsToSamePage: href !== '' && href.split('#')[0] === pageAddress,
          hasHrefAssociatedAttribute,
          needsListenerProbe:
            rawHref === null &&
            !hasHrefAssociatedAttribute &&
            role.trim() === '' &&
            name.trim() === '' &&
            id === '',
        };
      });
    },
    { snippetMaxLength: SNIPPET_MAX_LENGTH },
  );
}

/** Indexes of the probed anchors that have at least one event listener. */
async function anchorsWithListeners(page: Page, indexes: number[]): Promise<Set<number>> {
  const found = new Set<number>();
  if (indexes.length === 0) return found;
  const session = await page.context().newCDPSession(page);
  const objectGroup = 'odysseus-link-facts';
  try {
    for (const index of indexes.slice(0, MAX_LISTENER_PROBES)) {
      const { result } = await session.send('Runtime.evaluate', {
        expression: `document.querySelectorAll('a')[${index}]`,
        objectGroup,
      });
      if (result.objectId === undefined) continue;
      const { listeners } = await session.send('DOMDebugger.getEventListeners', {
        objectId: result.objectId,
      });
      if (listeners.length > 0) found.add(index);
    }
    await session.send('Runtime.releaseObjectGroup', { objectGroup });
  } finally {
    await session.detach();
  }
  return found;
}

/** Links on the rendered page that fail link-text or crawlable-anchors. */
export async function extractFailingAnchors(
  page: Page,
  pageUrl: string,
): Promise<AnchorFactInput[]> {
  const facts = await readAnchorFacts(page);
  const withListeners = await anchorsWithListeners(
    page,
    facts.filter((fact) => fact.needsListenerProbe).map((fact) => fact.index),
  );
  return facts
    .map(({ index, needsListenerProbe: _probe, ...fact }) => ({
      ...fact,
      hasEventListener: withListeners.has(index),
    }))
    .filter((anchor) => hasNonDescriptiveLinkText(anchor) || isUncrawlableAnchor(anchor, pageUrl))
    .slice(0, MAX_STORED_ANCHORS);
}
