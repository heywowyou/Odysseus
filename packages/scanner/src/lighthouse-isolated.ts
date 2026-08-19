import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Result } from 'lighthouse';
import { getLighthouseTimeoutMs } from './config.js';

const WORKER_PATH = fileURLToPath(new URL('./lighthouse-worker.ts', import.meta.url));

/** Extra headroom past Lighthouse's own internal timeout, for fork/IPC
 *  overhead, before the parent gives up on an unresponsive worker. */
const WORKER_GRACE_MS = 15_000;

/** Caps the child's own V8 old-space heap. Deliberately smaller than the
 *  ~2GB default old-space ceiling this crashed against, so a runaway
 *  worker hits its own limit and exits well before it could threaten to
 *  starve the parent (which still holds Chromium, the job queue, and every
 *  other in-flight scan). */
const WORKER_MAX_OLD_SPACE_MB = 1024;

export interface RunLighthouseIsolatedOptions {
  timeoutMs?: number;
}

/**
 * Runs Lighthouse in a forked child process instead of in-process.
 *
 * Lighthouse's SourceMaps gatherer fetches and parses every script's
 * source map on the page, including third-party ones odysseus has no
 * control over, and it cannot be turned off: it's a required artifact not
 * just of the two byte-efficiency audits that obviously use it, but of the
 * five Core Web Vitals metric audits (LCP, TBT, FCP, speed-index,
 * interactive) the report's CWV table depends on, so skipping the audits
 * that need it would mean losing CWV data entirely. Blocking the fetch at
 * the network layer doesn't work either - confirmed against a real crash,
 * see the comment in lighthouse.ts - because Lighthouse fetches maps via
 * the CDP `Network.loadNetworkResource` command, which is documented to
 * bypass `Network.setBlockedURLs`.
 *
 * A real scan (lacoorniche.com) hit a malformed map from a third-party
 * cookie-consent widget that OOM-crashed the whole process. Since
 * `odysseus serve` runs its job queue in one process (no child_process use
 * anywhere in packages/interface), that took every other queued job down
 * with it. Running the call in its own bounded-heap child means a crash
 * there can only fail that one page's Lighthouse pass - reported as
 * lighthouseError, exactly like a timeout or any other Lighthouse failure
 * already is in scan-page.ts - instead of the daemon.
 */
export async function runLighthouseIsolated(
  url: string,
  debugPort: number,
  options: RunLighthouseIsolatedOptions = {},
): Promise<Result> {
  const timeoutMs = options.timeoutMs ?? getLighthouseTimeoutMs();

  return new Promise((resolve, reject) => {
    const child = fork(WORKER_PATH, [], {
      // tsx is how every entry point in this repo actually runs (see the
      // root "serve" script); the child needs the same loader to execute a
      // .ts file directly.
      execArgv: ['--import', 'tsx', `--max-old-space-size=${WORKER_MAX_OLD_SPACE_MB}`],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });

    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeAllListeners();
      child.kill();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            `runLighthouseIsolated: worker for ${url} did not respond within ${timeoutMs + WORKER_GRACE_MS}ms`,
          ),
        ),
      );
    }, timeoutMs + WORKER_GRACE_MS);

    child.on('message', (message: { ok: true; result: Result } | { ok: false; error: string }) => {
      if (message.ok) {
        finish(() => resolve(message.result));
      } else {
        finish(() => reject(new Error(`runLighthouseIsolated: ${message.error}`)));
      }
    });

    child.on('error', (error) => {
      finish(() => reject(error));
    });

    child.on('exit', (code, signal) => {
      finish(() =>
        reject(
          new Error(
            `runLighthouseIsolated: worker for ${url} exited before returning a result (code ${code}, signal ${signal})`,
          ),
        ),
      );
    });

    child.send({ url, debugPort, timeoutMs });
  });
}
