import { useCallback, useEffect, useRef, useState } from 'react';
import { createPollingController } from './polling';

export interface PollingState<T> {
  data: T | undefined;
  error: string | undefined;
  /** True only while no data has ever arrived; refreshes keep the previous
   *  data on screen instead of flashing a loader. */
  isLoading: boolean;
  lastUpdatedAt: number | undefined;
  refresh: () => void;
}

export interface PollingOptions {
  enabled?: boolean;
  /** Identity of the polled resource (e.g. the job id). A change resets all
   *  state and refetches; a re-render with the same key never does. */
  key?: string;
}

/** React binding over createPollingController. Poll errors keep the last
 *  good data on screen and surface through `error`, so a transient blip
 *  while the five-second poll runs never blanks a page the operator is
 *  reading. */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  options: PollingOptions = {},
): PollingState<T> {
  const { enabled = true, key = '' } = options;
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(enabled);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | undefined>(undefined);
  const [tick, setTick] = useState(0);

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const refresh = useCallback(() => setTick((current) => current + 1), []);

  const keyRef = useRef(key);
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return undefined;
    }
    const isKeyChange = keyRef.current !== key;
    keyRef.current = key;
    if (isKeyChange) {
      setData(undefined);
      setError(undefined);
      setLastUpdatedAt(undefined);
      setIsLoading(true);
    } else {
      setIsLoading((current) => current && data === undefined);
    }

    const controller = createPollingController({
      intervalMs,
      fetcher: () => fetcherRef.current(),
      onUpdate: (result) => setData(result as T),
      onError: (message) => setError(message),
      onSettled: (settledLoading) => {
        if (settledLoading) return;
        setLastUpdatedAt(Date.now());
        setIsLoading(false);
      },
    });
    controller.start();
    return () => controller.stop();
    // `data` is read only to compute isLoading; keeping it out of the deps
    // stops an update-every-poll refetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, intervalMs, tick]);

  return { data, error, isLoading, lastUpdatedAt, refresh };
}
