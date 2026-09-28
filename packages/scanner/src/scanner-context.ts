import type { Browser, BrowserContext, BrowserContextOptions } from 'playwright';
import {
  installBrowserNetworkSafety,
  type NetworkSafetyBlockHandler,
} from './browser-network-safety.js';
import type { NetworkTargetPolicy } from './network-target-policy.js';
import type { PageWorkGuard } from './page-work-guard.js';

export interface ScannerContextSafety {
  guard?: PageWorkGuard | undefined;
  networkPolicy?: NetworkTargetPolicy | undefined;
  onNetworkSafetyBlocked?: NetworkSafetyBlockHandler | undefined;
}

/**
 * Issue #550: every browser context the scanner opens. Downloads are
 * refused, since no check reads a downloaded file and a site could
 * otherwise fill the disk that holds the artifacts. The guard tracks the
 * context before anything else can fail, and a failed network-safety
 * install closes it instead of leaving it open until the browser exits.
 */
export async function openScannerContext(
  browser: Browser,
  contextOptions: BrowserContextOptions,
  safety: ScannerContextSafety = {},
): Promise<BrowserContext> {
  const context = await browser.newContext({ ...contextOptions, acceptDownloads: false });
  safety.guard?.track(context);
  try {
    if (safety.networkPolicy !== undefined) {
      await installBrowserNetworkSafety(
        context,
        safety.networkPolicy,
        safety.onNetworkSafetyBlocked,
      );
    }
  } catch (error) {
    safety.guard?.untrack(context);
    try {
      await context.close();
    } catch {
      // Already closing, or the browser is gone: nothing left to reclaim.
    }
    throw error;
  }
  return context;
}
