import type { BrowserContext, Route } from 'playwright';
import { describe, expect, it, vi } from 'vitest';
import { installBrowserNetworkSafety } from './browser-network-safety.js';
import {
  createTestOnlyLoopbackPolicy,
  PUBLIC_SITE_NETWORK_POLICY,
} from './network-target-policy.js';

type RouteHandler = (route: Route) => Promise<void>;

async function captureHandler(
  policy = createTestOnlyLoopbackPolicy(),
  onBlocked?: () => void,
): Promise<RouteHandler> {
  let handler: RouteHandler | undefined;
  const context = {
    route: async (_pattern: string, fn: RouteHandler) => {
      handler = fn;
    },
  } as unknown as BrowserContext;
  await installBrowserNetworkSafety(context, policy, onBlocked);
  return handler!;
}

function routeFor(url: string, error: Error) {
  return {
    request: () => ({ url: () => url }),
    continue: vi.fn(() => Promise.reject(error)),
    abort: vi.fn(() => Promise.reject(error)),
  };
}

const alreadyHandled = new Error('route.continue: Route is already handled!');

describe('installBrowserNetworkSafety', () => {
  it('resolves when an allowed request was already handled before it could be continued', async () => {
    const handler = await captureHandler();
    const route = routeFor('http://127.0.0.1/page', alreadyHandled);
    await expect(handler(route as unknown as Route)).resolves.toBeUndefined();
    expect(route.continue).toHaveBeenCalledOnce();
  });

  it('resolves when a refused request was already gone before it could be aborted', async () => {
    const onBlocked = vi.fn();
    const handler = await captureHandler(PUBLIC_SITE_NETWORK_POLICY, onBlocked);
    const route = routeFor('http://127.0.0.1/admin', new Error('Target page has been closed'));
    await expect(handler(route as unknown as Route)).resolves.toBeUndefined();
    expect(route.abort).toHaveBeenCalledWith('blockedbyclient');
    expect(route.continue).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledOnce();
  });

  it('resolves for a non-network scheme whose route was already handled', async () => {
    const handler = await captureHandler();
    const route = routeFor('data:text/plain,hi', alreadyHandled);
    await expect(handler(route as unknown as Route)).resolves.toBeUndefined();
  });
});
