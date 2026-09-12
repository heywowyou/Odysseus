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
   *  context that is already closing or closed. */
  closeAll(): Promise<void>;
}

/**
 * `parent`, when given, mirrors every track/untrack into it too, so a
 * per-page guard can report into a run-wide guard (for cancellation's
 * closeAll) without the caller double-bookkeeping.
 */
export function createPageWorkGuard(parent?: PageWorkGuard): PageWorkGuard {
  const contexts = new Set<BrowserContext>();
  return {
    track(context) {
      contexts.add(context);
      parent?.track(context);
    },
    untrack(context) {
      contexts.delete(context);
      parent?.untrack(context);
    },
    async closeAll() {
      const toClose = [...contexts];
      contexts.clear();
      await Promise.all(
        toClose.map(async (context) => {
          try {
            await context.close();
          } catch {
            // Already closing/closed, or the browser itself is gone -
            // either way there is nothing left to reclaim.
          }
        }),
      );
    },
  };
}
