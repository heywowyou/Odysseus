import type { BrowserContext } from 'playwright';

/**
 * Tracks the Playwright contexts one unit of work has open, so an
 * external watchdog can force-close them if that work never settles on
 * its own. A hung page.evaluate() has no built-in timeout, and Playwright
 * offers no way to cancel one in flight; closing the context it belongs
 * to is the only way to actually reclaim the renderer process, rather
 * than merely abandoning the promise watching it (issue #200: abandoning
 * alone is exactly what let 100+ renderer processes accumulate and OOM
 * a real audit).
 */
export interface PageWorkGuard {
  track(context: BrowserContext): void;
  untrack(context: BrowserContext): void;
  /** Force-closes every currently tracked context. Safe to call on a
   *  context that is already closing or closed. After this runs, new
   *  contexts are closed as soon as they are tracked. */
  closeAll(): Promise<void>;
}

async function closeIgnoringFailure(context: BrowserContext): Promise<void> {
  try {
    await context.close();
  } catch {
    // Already closing/closed, or the browser itself is gone -
    // either way there is nothing left to reclaim.
  }
}

/**
 * `parent`, when given, mirrors every track/untrack into it too, so a
 * per-page guard can report into a run-wide guard (for cancellation's
 * closeAll) without the caller double-bookkeeping.
 */
export function createPageWorkGuard(parent?: PageWorkGuard): PageWorkGuard {
  const contexts = new Set<BrowserContext>();
  let closed = false;
  let closePromise: Promise<void> | undefined;

  return {
    track(context) {
      if (closed) {
        // The operation outlived its deadline and opened this context
        // afterwards. It must never escape the guard just because the
        // watchdog already took its snapshot.
        void closeIgnoringFailure(context);
        return;
      }
      if (contexts.has(context)) return;
      contexts.add(context);
      parent?.track(context);
    },
    untrack(context) {
      contexts.delete(context);
      parent?.untrack(context);
    },
    closeAll() {
      if (closePromise !== undefined) return closePromise;
      closed = true;
      const toClose = [...contexts];
      contexts.clear();
      for (const context of toClose) parent?.untrack(context);
      closePromise = Promise.all(toClose.map(closeIgnoringFailure)).then(() => undefined);
      return closePromise;
    },
  };
}

export class PageWorkDeadlineError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`watchdog: ${operation} did not complete within ${timeoutMs}ms; abandoned`);
    this.name = 'PageWorkDeadlineError';
  }
}

/** Races one bounded page operation and reclaims its contexts when it expires. */
export async function withPageWorkDeadline<T>(
  operation: string,
  work: Promise<T>,
  timeoutMs: number,
  guard?: PageWorkGuard,
  onDeadline?: (error: PageWorkDeadlineError) => void,
): Promise<T> {
  work.catch(() => undefined);
  const deadlineMs = Math.max(1, timeoutMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new PageWorkDeadlineError(operation, deadlineMs);
      // Settle the deadline before cancellation closes contexts: closing a
      // target can reject the abandoned Playwright operation in the same turn.
      reject(error);
      try {
        onDeadline?.(error);
      } catch {
        // User cancellation callbacks must not prevent context cleanup.
      }
      try {
        void guard?.closeAll().catch(() => undefined);
      } catch {
        // The deadline must still clean up what it can if a custom guard fails.
      }
    }, deadlineMs);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
