import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Result } from 'lighthouse';
import { getLighthouseTimeoutMs } from './config.js';

// The fork target must match whichever extension this module itself was
// actually loaded with: '.ts' in dev (tsx runs source directly - see the
// root "serve" script) but only '.js' exists once this package is built
// to dist/ (the compiled tree `@odysseus/scanner` actually exports, which
// every real consumer - odysseus serve, the CLI's workspace resolution -
// uses). Hardcoding '.ts' worked in every dev-mode manual test and in the
// dev server, and failed identically and silently on every single page of
// every single scan run through the built package, which is why this
// looked like a per-site Lighthouse problem instead of the build-vs-source
// path mismatch it actually was.
/** Exported only so lighthouse-isolated.test.ts can assert the
 *  extension-matching logic directly (a regression guard for the exact
 *  class of bug this replaced - a hardcoded extension that only worked
 *  under tsx and broke identically on every page of every real, built-
 *  package scan) without needing an actual dist/ build in the test run. */
export function resolveWorkerPath(selfUrl: string): string {
  const extension = selfUrl.endsWith('.ts') ? '.ts' : '.js';
  return fileURLToPath(new URL(`./lighthouse-worker${extension}`, selfUrl));
}

const WORKER_PATH = resolveWorkerPath(import.meta.url);

/** Extra headroom past Lighthouse's own internal timeout, for fork/IPC
 *  overhead, before the parent gives up on an unresponsive worker. */
const WORKER_GRACE_MS = 15_000;

/** Caps the child's own V8 old-space heap. Deliberately smaller than the
 *  ~2GB default old-space ceiling this crashed against, so a runaway
 *  worker hits its own limit and exits well before it could threaten to
 *  starve the parent (which still holds Chromium, the job queue, and every
 *  other in-flight scan). */
const WORKER_MAX_OLD_SPACE_MB = 1024;

/** tsx is how this repo's entry points run from source (see the root
 *  "serve" script), and a .ts worker cannot execute without it. A built
 *  .js worker can, and loading tsx there costs a module resolution hook on
 *  every Lighthouse fork - once per performance-measured page - to
 *  translate nothing. Keyed off the same extension resolveWorkerPath
 *  already decides on, so the two can never disagree. */
const WORKER_EXEC_ARGV = [
  ...(WORKER_PATH.endsWith('.ts') ? ['--import', 'tsx'] : []),
  `--max-old-space-size=${WORKER_MAX_OLD_SPACE_MB}`,
];

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
      execArgv: WORKER_EXEC_ARGV,
      // stderr is piped, not ignored: a crash before the worker's own
      // try/catch can send a message (a module-load failure, an uncaught
      // exception thrown outside the awaited call) exits the process with
      // no IPC message at all, and previously took its stack trace down
      // with it - every failure looked like the same generic "exited
      // before returning a result", indistinguishable from a clean crash.
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });

    let stderrOutput = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString('utf8');
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
      finish(() => {
        const stderrSuffix = stderrOutput.trim() ? ` - stderr: ${stderrOutput.trim()}` : '';
        reject(
          new Error(
            `runLighthouseIsolated: worker for ${url} exited before returning a result (code ${code}, signal ${signal})${stderrSuffix}`,
          ),
        );
      });
    });

    child.send({ url, debugPort, timeoutMs });
  });
}
