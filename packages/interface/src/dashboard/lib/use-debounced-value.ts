import { useEffect, useState } from 'react';

/** Delays propagating a fast-changing value until the source pauses. The
 *  prospects search box keeps its own immediate state for the keystrokes;
 *  this settled value is what goes into the server query, so typing sends
 *  one request per pause instead of one per character. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return debounced;
}
