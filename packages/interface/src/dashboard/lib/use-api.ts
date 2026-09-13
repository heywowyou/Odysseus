import { useCallback } from 'react';
import { fetchJson } from './api';
import { usePolling, type PollingState } from './use-polling';

export type ApiState<T> = PollingState<T>;

/** Single fetch of a JSON path. `null` disables the fetch (used while a
 *  route param is not yet known); a path change refetches. */
export function useApi<T>(path: string | null): ApiState<T> {
  const fetcher = useCallback(
    (signal: AbortSignal) => fetchJson<T>(path ?? '', { signal }),
    [path],
  );
  return usePolling<T>(fetcher, 0, { enabled: path !== null, key: path ?? 'none' });
}
