import { describe, expect, it, vi } from 'vitest';
import type { Browser, BrowserContext } from 'playwright';
import { createPageWorkGuard } from './page-work-guard.js';
import { openScannerContext } from './scanner-context.js';
import { PUBLIC_SITE_NETWORK_POLICY } from './network-target-policy.js';

function fakeBrowser(route: () => Promise<void>) {
  const context = { route: vi.fn(route), close: vi.fn(async () => undefined) };
  const newContext = vi.fn(async () => context as unknown as BrowserContext);
  return { browser: { newContext } as unknown as Browser, context, newContext };
}

describe('openScannerContext (issue #550)', () => {
  it('opens every scanner context with downloads refused', async () => {
    const { browser, newContext } = fakeBrowser(async () => undefined);
    await openScannerContext(browser, { locale: 'fr-FR' });
    expect(newContext).toHaveBeenCalledWith({ locale: 'fr-FR', acceptDownloads: false });
  });

  it('closes and untracks the context when the network safety install rejects', async () => {
    const { browser, context } = fakeBrowser(async () => {
      throw new Error('Target page, context or browser has been closed');
    });
    const guard = createPageWorkGuard();

    await expect(
      openScannerContext(browser, {}, { guard, networkPolicy: PUBLIC_SITE_NETWORK_POLICY }),
    ).rejects.toThrow('has been closed');

    expect(context.close).toHaveBeenCalledTimes(1);
    await guard.closeAll();
    expect(context.close).toHaveBeenCalledTimes(1);
  });
});
