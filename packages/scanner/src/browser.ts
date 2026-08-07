import { createServer } from 'node:net';
import { chromium, type Browser } from 'playwright';

/**
 * Identifies Odysseus per the crawling-politeness rule. This is the
 * fallback config.ts's getCrawlerUserAgent() returns when CRAWLER_USER_AGENT
 * is unset, so it is the identity that actually goes out on the wire by
 * default. Points at packages/site's /bot route, which explains the bot to
 * anyone who checks their logs.
 */
export const ODYSSEUS_USER_AGENT =
  'OdysseusAuditBot/0.1 (+https://odysseusaudit.com/bot)';

/** Hard per-page timeout in ms, applied independently to each pass. */
export const DEFAULT_TIMEOUT_MS = 30_000;

const LAUNCH_PORT_ATTEMPTS = 3;

export interface LaunchedBrowser {
  browser: Browser;
  /** CDP debug port Lighthouse connects to independently of Playwright. */
  debugPort: number;
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
export async function launchBrowser(): Promise<LaunchedBrowser> {
  let lastError: unknown;
  for (let attempt = 0; attempt < LAUNCH_PORT_ATTEMPTS; attempt++) {
    const debugPort = await getFreePort();
    try {
      const browser = await chromium.launch({
        args: [`--remote-debugging-port=${debugPort}`],
      });
      return { browser, debugPort };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `launchBrowser: failed to launch Chromium with a debug port after ${LAUNCH_PORT_ATTEMPTS} attempts`,
    { cause: lastError },
  );
}
