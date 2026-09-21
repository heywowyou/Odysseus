import type { BrowserContext } from 'playwright';
import {
  checkNetworkTarget,
  type NetworkSafetyDisposition,
  type NetworkTargetPolicy,
} from './network-target-policy.js';

export type NetworkSafetyBlockHandler = (disposition: NetworkSafetyDisposition) => void;

/**
 * Settles a route whose request may already be gone. The handler awaits a
 * DNS check before deciding, and in that window the page can navigate away,
 * close, or cancel the request, after which Playwright rejects the call with
 * "Route is already handled!" or a closed-target error. Playwright does not
 * catch a route handler's rejection, so left unhandled it took the whole
 * `odysseus serve` process down, and every audit running in it. Nothing
 * goes out on the network in that case either way: a request nobody can
 * continue any more was not continued by us.
 */
export async function settleRoute(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch {
    // The request ended before we could answer it; see the doc comment.
  }
}

/**
 * Applies the Plan 059 public-network policy at Chromium's request boundary.
 *
 * Playwright invokes this route for navigation requests, redirects and
 * subresources before they are continued. Non-network browser schemes are
 * allowed through because they do not create an outbound connection.
 */
export async function installBrowserNetworkSafety(
  context: BrowserContext,
  policy: NetworkTargetPolicy,
  onBlocked?: NetworkSafetyBlockHandler,
): Promise<void> {
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      onBlocked?.({
        reason: 'unparseable-url',
        url,
        policyId: policy.id,
        detail: 'browser request url does not parse',
        retryable: false,
      });
      await settleRoute(() => route.abort('blockedbyclient'));
      return;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      await settleRoute(() => route.continue());
      return;
    }

    const verdict = await checkNetworkTarget(url, policy);
    if (verdict.kind === 'refused') {
      onBlocked?.(verdict.disposition);
      await settleRoute(() => route.abort('blockedbyclient'));
      return;
    }

    await settleRoute(() => route.continue());
  });
}
