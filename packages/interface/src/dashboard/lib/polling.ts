export interface PollingControllerOptions {
  intervalMs: number;
  fetcher: (signal: AbortSignal) => Promise<unknown>;
  onUpdate: (data: unknown) => void;
  /** Receives a failure message, then `undefined` when a later request
   *  succeeds so consumers cannot retain an obsolete transport error. */
  onError: (message: string | undefined) => void;
  onSettled: (isLoading: boolean) => void;
}

export interface PollingController {
  start: () => void;
  stop: () => void;
  /** Cancels the pending timer without dropping state, unlike stop(). An
   *  in-flight fetch is left to finish (its result still lands), but no
   *  further fetch is scheduled until resume(). */
  pause: () => void;
  /** Fetches immediately if idle and paused; resumes the normal interval
   *  cadence from there. A no-op if never paused, already stopped, or a
   *  fetch from before the pause is still in flight (that fetch's own
   *  completion resumes the cadence). */
  resume: () => void;
}

/** The polling state machine behind usePolling, extracted from React so the
 *  overlap rules are unit-testable without a component tree. Guarantees:
 *  the first fetch starts immediately; the next fetch is scheduled only
 *  after the current one settles (a slow response can never stack requests);
 *  stop() cancels the pending timer and aborts the in-flight request; intervalMs
 *  <= 0 means fetch once and never reschedule; pause()/resume() suspend and
 *  restart the interval without losing state (used to stop polling while the
 *  browser tab is hidden, plan 040's poll policy). */
export function createPollingController(options: PollingControllerOptions): PollingController {
  const { intervalMs, fetcher, onUpdate, onError, onSettled } = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let paused = false;
  let inFlight = false;
  let requestController: AbortController | undefined;

  const clearTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const runOnce = async (): Promise<void> => {
    if (stopped || inFlight) return;
    inFlight = true;
    requestController = new AbortController();
    onSettled(true);
    try {
      const data = await fetcher(requestController.signal);
      if (!stopped) {
        onError(undefined);
        onUpdate(data);
      }
    } catch (cause) {
      if (!stopped) onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      inFlight = false;
      requestController = undefined;
      if (!stopped) {
        onSettled(false);
        if (intervalMs > 0 && !paused) timer = setTimeout(() => void runOnce(), intervalMs);
      }
    }
  };

  return {
    start: () => {
      if (stopped) return;
      void runOnce();
    },
    stop: () => {
      stopped = true;
      clearTimer();
      requestController?.abort();
    },
    pause: () => {
      if (stopped || paused) return;
      paused = true;
      clearTimer();
    },
    resume: () => {
      if (stopped || !paused) return;
      paused = false;
      void runOnce();
    },
  };
}
