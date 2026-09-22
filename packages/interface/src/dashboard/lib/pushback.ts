/**
 * What the operator needs to know about host pushback, read off the recorded
 * events. The scanner already slows itself on every event, up to a cap, so a
 * pushback on its own is information, not a call to action. A slower relaunch
 * is only worth suggesting when that automatic slowdown ran out: the site kept
 * pushing back with the delay already at the cap, or pages stayed blocked
 * after their retry.
 */

export interface PushbackEventLike {
  pageUrl: string;
  retryAfterMs?: number | undefined;
  delayMs?: number | undefined;
  atMaxDelay?: boolean | undefined;
}

export interface PushbackSummary {
  eventCount: number;
  pageCount: number;
  /** The pace the scan runs at now; the latest event's delay when the scanner
   *  recorded one, otherwise the starting delay. */
  currentDelayMs: number;
  /** The automatic slowdown ran out, so a slower relaunch is worth offering. */
  relaunchAdvised: boolean;
  /** Twice the current pace, at least the longest Retry-After and 5 s. */
  suggestedDelayMs: number;
}

const MIN_SUGGESTED_DELAY_MS = 5_000;

export function summarizePushback(
  events: readonly PushbackEventLike[],
  startingDelayMs: number,
  blockedPageCount = 0,
): PushbackSummary | undefined {
  if (events.length === 0) return undefined;
  const recordedDelays = events.flatMap((event) =>
    event.delayMs === undefined ? [] : [event.delayMs],
  );
  const currentDelayMs = Math.max(startingDelayMs, ...recordedDelays);
  const longestRetryAfterMs = Math.max(0, ...events.map((event) => event.retryAfterMs ?? 0));
  return {
    eventCount: events.length,
    pageCount: new Set(events.map((event) => event.pageUrl)).size,
    currentDelayMs,
    relaunchAdvised: events.some((event) => event.atMaxDelay === true) || blockedPageCount > 0,
    suggestedDelayMs: Math.max(currentDelayMs * 2, longestRetryAfterMs, MIN_SUGGESTED_DELAY_MS),
  };
}

/** Whole seconds for display; a delay is never shown as 0 s. */
export function delaySeconds(delayMs: number): number {
  return Math.max(1, Math.round(delayMs / 1_000));
}
