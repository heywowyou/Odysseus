import { runLighthouse } from './lighthouse.js';

/**
 * Child-process entry point for runLighthouseIsolated (lighthouse-isolated.ts).
 * Runs the real Lighthouse call and reports back over IPC instead of
 * returning a value, since this file's whole reason to exist is running in
 * a separate, bounded-heap process the parent can lose without dying
 * itself. Never imported directly by anything else; forked as a module
 * path.
 */

interface WorkerRequest {
  url: string;
  debugPort: number;
  timeoutMs?: number;
}

type WorkerResponse = { ok: true; result: unknown } | { ok: false; error: string };

// A throw or rejection outside the awaited runLighthouse() call (e.g. from
// an internal Lighthouse/Puppeteer event handler) bypasses the try/catch
// below entirely and used to fall through to Node's default handler, which
// prints to stderr and exits - previously invisible since stderr was
// discarded by the parent (see lighthouse-isolated.ts). Report it the same
// way a caught error is reported instead of exiting silently.
function reportFatal(error: unknown): void {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  if (process.send) {
    process.send({ ok: false, error: message } satisfies WorkerResponse, () => process.exit(1));
  } else {
    process.exit(1);
  }
}
process.on('uncaughtException', reportFatal);
process.on('unhandledRejection', reportFatal);

process.on('message', (message: WorkerRequest) => {
  void (async () => {
    let response: WorkerResponse;
    try {
      const result = await runLighthouse(message.url, message.debugPort, {
        ...(message.timeoutMs !== undefined ? { timeoutMs: message.timeoutMs } : {}),
      });
      response = { ok: true, result };
    } catch (error) {
      response = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    // process.send() queues the message for async IPC delivery; calling
    // process.exit() right after (without waiting for its callback) can
    // tear the channel down before the message actually reaches the
    // parent, confirmed against a real run where every worker exited
    // "successfully" (code 0) but the parent never saw a 'message' event.
    if (process.send) {
      process.send(response, () => process.exit(response.ok ? 0 : 1));
    } else {
      process.exit(response.ok ? 0 : 1);
    }
  })();
});
