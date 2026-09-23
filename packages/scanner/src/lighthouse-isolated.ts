import { fork, type ChildProcess } from 'node:child_process';
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

const CDP_HTTP_TIMEOUT_MS = 2_000;
const WORKER_STOP_GRACE_MS = 1_000;

interface CdpPageTarget {
  id: string;
  type: string;
}

async function pageTargetIds(debugPort: number): Promise<Set<string>> {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, {
    signal: AbortSignal.timeout(CDP_HTTP_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Lighthouse target snapshot failed with HTTP ${response.status}`);
  }
  const targets = (await response.json()) as CdpPageTarget[];
  return new Set(
    targets
      .filter((target) => target.type === 'page' && typeof target.id === 'string')
      .map(({ id }) => id),
  );
}

async function closeNewPageTargets(debugPort: number, before: ReadonlySet<string>): Promise<void> {
  try {
    const after = await pageTargetIds(debugPort);
    const newTargets = [...after].filter((id) => !before.has(id));
    await Promise.allSettled(
      newTargets.map((id) =>
        fetch(`http://127.0.0.1:${debugPort}/json/close/${encodeURIComponent(id)}`, {
          signal: AbortSignal.timeout(CDP_HTTP_TIMEOUT_MS),
        }),
      ),
    );
  } catch {
    // Preserve the Lighthouse failure. Target cleanup is best-effort when
    // Chromium itself has already stopped answering its debug endpoint.
  }
}

function waitForChildExit(child: ChildProcess): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolve(false);
    }, WORKER_STOP_GRACE_MS);
    const onExit = (): void => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('exit', onExit);
  });
}

async function stopWorker(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = waitForChildExit(child);
  if (!child.kill('SIGTERM')) {
    await exited;
    return;
  }
  if (await exited) return;
  const killed = waitForChildExit(child);
  child.kill('SIGKILL');
  await killed;
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
  // Lighthouse controls a tab through the shared Chromium port. Capture the
  // baseline before forking so a failed worker can close only page targets it
  // created and leave the site's ordinary crawl pages alone.
  const existingTargetIds = await pageTargetIds(debugPort);

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
    const clearWorkerListeners = (): void => {
      child.removeAllListeners();
      child.stderr?.removeAllListeners();
    };
    const finishSuccess = (result: Result): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearWorkerListeners();
      child.kill();
      resolve(result);
    };
    const finishFailure = (error: Error, alreadyExited = false): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearWorkerListeners();
      const stderrSuffix = stderrOutput.trim() ? ` - stderr: ${stderrOutput.trim()}` : '';
      const reportedError = stderrSuffix ? new Error(`${error.message}${stderrSuffix}`) : error;
      void (async () => {
        if (!alreadyExited) await stopWorker(child);
        await closeNewPageTargets(debugPort, existingTargetIds);
        reject(reportedError);
      })();
    };

    const timer = setTimeout(() => {
      finishFailure(
        new Error(
          `runLighthouseIsolated: worker for ${url} did not respond within ${timeoutMs + WORKER_GRACE_MS}ms`,
        ),
      );
    }, timeoutMs + WORKER_GRACE_MS);

    child.on('message', (message: { ok: true; result: Result } | { ok: false; error: string }) => {
      if (message.ok) {
        finishSuccess(message.result);
      } else {
        finishFailure(new Error(`runLighthouseIsolated: ${message.error}`));
      }
    });

    child.on('error', (error) => {
      finishFailure(error);
    });

    child.on('exit', (code, signal) => {
      finishFailure(
        new Error(
          `runLighthouseIsolated: worker for ${url} exited before returning a result (code ${code}, signal ${signal})`,
        ),
        true,
      );
    });

    child.send({ url, debugPort, timeoutMs });
  });
}
