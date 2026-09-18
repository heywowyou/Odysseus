import type { BrowserContext } from 'playwright';
import {
  checkNetworkTarget,
  type NetworkSafetyDisposition,
  type NetworkTargetPolicy,
} from './network-target-policy.js';

export type NetworkSafetyBlockHandler = (disposition: NetworkSafetyDisposition) => void;

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
      await route.abort('blockedbyclient');
      return;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      await route.continue();
      return;
    }

    const verdict = await checkNetworkTarget(url, policy);
    if (verdict.kind === 'refused') {
      onBlocked?.(verdict.disposition);
      await route.abort('blockedbyclient');
      return;
    }

    await route.continue();
  });
}
