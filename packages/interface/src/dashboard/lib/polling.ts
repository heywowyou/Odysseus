export interface PollingControllerOptions {
  intervalMs: number;
  fetcher: () => Promise<unknown>;
  onUpdate: (data: unknown) => void;
  onError: (message: string) => void;
  onSettled: (isLoading: boolean) => void;
}

export interface PollingController {
  start: () => void;
  stop: () => void;
}

/** The polling state machine behind usePolling, extracted from React so the
 *  overlap rules are unit-testable without a component tree. Guarantees:
 *  the first fetch starts immediately; the next fetch is scheduled only
 *  after the current one settles (a slow response can never stack requests);
 *  stop() cancels the pending timer and every in-flight result; intervalMs
 *  <= 0 means fetch once and never reschedule. */
export function createPollingController(options: PollingControllerOptions): PollingController {
  const { intervalMs, fetcher, onUpdate, onError, onSettled } = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let inFlight = false;

  const runOnce = async (): Promise<void> => {
    if (stopped || inFlight) return;
    inFlight = true;
    onSettled(true);
    try {
      const data = await fetcher();
      if (!stopped) onUpdate(data);
    } catch (cause) {
      if (!stopped) onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      inFlight = false;
      if (!stopped) {
        onSettled(false);
        if (intervalMs > 0) timer = setTimeout(() => void runOnce(), intervalMs);
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
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
