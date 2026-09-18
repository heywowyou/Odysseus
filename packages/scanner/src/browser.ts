import { createServer } from 'node:net';
import { chromium, type Browser } from 'playwright';
import { buildSanitizedBrowserEnv } from './browser-isolation-preflight.js';
import { startEgressProxy, type EgressProxy } from './egress-proxy.js';
import type { NetworkSafetyDisposition, NetworkTargetPolicy } from './network-target-policy.js';

/**
 * Identifies Odysseus per the crawling-politeness rule. config.ts's
 * getCrawlerUserAgent() returns exactly this, so it is the identity that
 * goes out on the wire. Points at packages/site's /bot route, which
 * explains the bot to anyone who checks their logs.
 */
// Must match the token published on the public /bot page and /llms.txt.
export const ODYSSEUS_USER_AGENT = 'OdysseusBot/1.0 (+https://odysseusaudit.com/bot)';

/** Hard per-page timeout in ms, applied independently to each pass. */
export const DEFAULT_TIMEOUT_MS = 30_000;

const LAUNCH_PORT_ATTEMPTS = 3;

export interface LaunchedBrowser {
  browser: Browser;
  /** CDP debug port Lighthouse connects to independently of Playwright. */
  debugPort: number;
  /** Every Chromium flag this launch used, for the isolation assessment and
   *  environment fingerprint, which record flag names and never values. */
  launchArgs: readonly string[];
}

/**
 * Binds a throwaway server to port 0 to get an OS-assigned free port, then
 * releases it immediately. Playwright never hands back the port Chromium
 * actually bound, so it must be chosen up front and passed in via
 * --remote-debugging-port.
 */
async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('getFreePort: could not determine an assigned port'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Single choke point for launching Chromium, so render-diff, axe, and
 * Lighthouse all share one browser instance. Chromium always talks to
 * Playwright over its own pipe transport; passing --remote-debugging-port
 * additionally opens a CDP TCP port Lighthouse can connect to on its own,
 * since Lighthouse cannot accept a Playwright Page directly. A free port is
 * probed just before launch, so retry with a fresh port if another process
 * wins the narrow race and grabs it first.
 */
export interface LaunchBrowserOptions {
  /** Extra Chromium CLI args appended after the debug-port arg. Additive
   *  only - scanner's own crawl/axe/Lighthouse callers never pass this,
   *  so their launch is unchanged. Introduced for the report package's
   *  print-to-PDF path, which needs `--font-render-hinting=none` (see
   *  the call site in packages/report/src/index.ts for why). */
  extraArgs?: readonly string[];
  /** Plan 059: when set, every connection the browser opens (pages,
   *  subresources, service workers and Lighthouse's own CDP target) goes
   *  through a loopback egress proxy that dials only policy-approved
   *  addresses. See egress-proxy.ts for why a context route is not enough. */
  networkPolicy?: NetworkTargetPolicy;
  onNetworkSafetyBlocked?: (disposition: NetworkSafetyDisposition) => void;
}

/**
 * Rootless container Chromium cannot create its sandbox namespaces, which
 * needs flags like --no-sandbox, but those are deployment concerns rather
 * than scanner behavior, so they arrive through ODYSSEUS_CHROMIUM_EXTRA_ARGS
 * (space separated, compose supplies them) instead of being hardcoded here.
 * Parsed at launch time and appended after extraArgs, so a deployment can
 * never override the report's own --font-render-hinting=none.
 */
export function parseChromiumExtraArgs(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(' ')
    .map((arg) => arg.trim())
    .filter((arg) => arg.length > 0);
}

export async function launchBrowser(options: LaunchBrowserOptions = {}): Promise<LaunchedBrowser> {
  let lastError: unknown;
  const proxy: EgressProxy | undefined =
    options.networkPolicy === undefined
      ? undefined
      : await startEgressProxy({
          policy: options.networkPolicy,
          ...(options.onNetworkSafetyBlocked !== undefined
            ? { onBlocked: options.onNetworkSafetyBlocked }
            : {}),
        });
  for (let attempt = 0; attempt < LAUNCH_PORT_ATTEMPTS; attempt++) {
    const debugPort = await getFreePort();
    try {
      const launchArgs = [
        `--remote-debugging-port=${debugPort}`,
        ...(proxy?.chromiumArgs ?? []),
        ...(options.extraArgs ?? []),
        ...parseChromiumExtraArgs(process.env['ODYSSEUS_CHROMIUM_EXTRA_ARGS']),
      ];
      const browser = await chromium.launch({
        args: launchArgs,
        // Chromium otherwise inherits this process's whole environment, so
        // every renderer running a scanned site's JavaScript would sit next to
        // MONGODB_URI and the model API key. Nothing Chromium needs is
        // credential-shaped, and page JavaScript cannot read the process
        // environment in any case; this removes the reason to rely on that
        // (plan 059 section 3.10).
        env: buildSanitizedBrowserEnv(process.env),
      });
      if (proxy !== undefined) {
        browser.on('disconnected', () => void proxy.close());
      }
      return { browser, debugPort, launchArgs };
    } catch (error) {
      lastError = error;
    }
  }
  await proxy?.close();
  throw new Error(
    `launchBrowser: failed to launch Chromium with a debug port after ${LAUNCH_PORT_ATTEMPTS} attempts`,
    { cause: lastError },
  );
}
