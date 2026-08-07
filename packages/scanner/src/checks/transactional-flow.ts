/**
 * First-party transactional flow detection: the second, independent
 * input the obligation engine needs (see @odysseus/core's
 * assessObligations). Runs inside scan-page.ts's existing onRenderedPage
 * hook, on every page, using the already-rendered navigation - no third
 * page load.
 *
 * The provider-domain allowlists below are a starting position, not a
 * measured result, the same status severityFromRenderDiff's thresholds
 * carry. Revisit once real-site scans surface providers missing here.
 */

import type { Page } from 'playwright';
import type { TransactionalFlowEvidence } from '@odysseus/core';

const CHECKOUT_FORM_SELECTOR =
  'form[action*="checkout"], form[action*="panier"], form[action*="cart"], [class*="add-to-cart"], [id*="add-to-cart"]';

const PAYMENT_SCRIPT_SUBSTRINGS = ['js.stripe.com', 'checkout.stripe.com', 'paypal.com/sdk', 'paypalobjects.com'];
const BOOKING_SCRIPT_SUBSTRINGS = ['simplebooking', 'resharmonics', 'thinkreservations'];

const OUTBOUND_BOOKING_HOSTS = [/(^|\.)booking\.com$/i, /(^|\.)airbnb\.[a-z.]+$/i, /(^|\.)expedia\.[a-z.]+$/i];

export async function detectTransactionalFlow(page: Page, pageUrl: string): Promise<TransactionalFlowEvidence[]> {
  const evidence: TransactionalFlowEvidence[] = [];

  const formMatches = await page.$$eval(CHECKOUT_FORM_SELECTOR, (elements) =>
    elements.map((el, index) => ({
      selector: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}:nth-of-type(${index + 1})`,
      detail: el.getAttribute('action') ?? el.outerHTML.slice(0, 120),
    })),
  );
  for (const match of formMatches) {
    evidence.push({ kind: 'checkout-form', selector: match.selector, pageUrl, detail: match.detail });
  }

  const scriptSrcs = await page.$$eval('script[src]', (elements) =>
    elements.map((el) => el.getAttribute('src') ?? ''),
  );
  for (const src of scriptSrcs) {
    if (PAYMENT_SCRIPT_SUBSTRINGS.some((substring) => src.includes(substring))) {
      evidence.push({ kind: 'payment-embed', selector: 'script[src]', pageUrl, detail: src });
    } else if (BOOKING_SCRIPT_SUBSTRINGS.some((substring) => src.includes(substring))) {
      evidence.push({ kind: 'booking-engine-script', selector: 'script[src]', pageUrl, detail: src });
    }
  }

  return evidence;
}

/** Confirms the negative case only: an outbound-only link to a
 *  third-party booking platform never sets hasTransactionalFlow, however
 *  many of these are found. Used by tests, not by the accumulation logic
 *  itself, which never calls this to set anything true. */
export function detectOutboundBookingLinks(hrefs: readonly string[]): string[] {
  return hrefs.filter((href) => {
    try {
      const host = new URL(href).hostname;
      return OUTBOUND_BOOKING_HOSTS.some((pattern) => pattern.test(host));
    } catch {
      return false;
    }
  });
}
