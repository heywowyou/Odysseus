/** Operator-recorded campaign outcomes. No model may infer these values. */
export const OUTREACH_OUTCOMES = [
  'no-reply',
  'reply-positive',
  'reply-not-now',
  'reply-negative',
  'opt-out',
  'call',
  'quoted',
  'won',
  'lost',
] as const;

export type OutreachOutcome = (typeof OUTREACH_OUTCOMES)[number];

/** Closed sales-loss vocabulary. Detail that does not fit remains outside the
 * aggregate rather than becoming free text in an operational event. */
export const OUTREACH_LOST_REASONS = [
  'budget',
  'timing',
  'not-a-priority',
  'existing-provider',
  'scope-mismatch',
  'other',
] as const;

export type OutreachLostReason = (typeof OUTREACH_LOST_REASONS)[number];

export function isOutreachOutcome(value: string): value is OutreachOutcome {
  return (OUTREACH_OUTCOMES as readonly string[]).includes(value);
}

export function isOutreachLostReason(value: string): value is OutreachLostReason {
  return (OUTREACH_LOST_REASONS as readonly string[]).includes(value);
}
