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
