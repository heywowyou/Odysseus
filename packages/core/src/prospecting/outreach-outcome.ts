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

/** Every outcome but `no-reply` records that the prospect answered, an
 *  objection included. */
export function isOutreachReplyOutcome(outcome: OutreachOutcome): boolean {
  return outcome !== 'no-reply';
}

/** Outcomes that say the prospect showed interest. A later stage (a call, a
 *  quote, a sale) replaces `reply-positive` as the thread's current outcome,
 *  so each one still counts as a positive reply. */
export const OUTREACH_POSITIVE_OUTCOMES: readonly OutreachOutcome[] = [
  'reply-positive',
  'call',
  'quoted',
  'won',
];

export function isOutreachPositiveOutcome(outcome: OutreachOutcome): boolean {
  return OUTREACH_POSITIVE_OUTCOMES.includes(outcome);
}

export function isOutreachLostReason(value: string): value is OutreachLostReason {
  return (OUTREACH_LOST_REASONS as readonly string[]).includes(value);
}

/** Issue #533: the campaign a thread belongs to, stamped when it opens so a
 *  campaign's funnel can be counted apart from the next one's. A new
 *  campaign (a new batch, or a change of email template, preview content,
 *  evidence version or spacing) gets a new version through
 *  ODYSSEUS_OUTREACH_CAMPAIGN_VERSION. The five threads opened on
 *  2026-09-24, before the field existed, belong to this first campaign and
 *  are counted as such. */
export const FIRST_OUTREACH_CAMPAIGN_VERSION = 'first-100-2026-09';
