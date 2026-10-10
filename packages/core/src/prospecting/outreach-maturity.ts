/**
 * Plan 078: where one outreach thread stands against the brief's unit of
 * evidence, the matured first touch
 * (`docs/product/odysseus-project-brief.md` section 12): a prospect who
 * replied, or whose sequence closed without a reply.
 *
 * Pure and table-driven like `outreach-thread-state.ts`: the store only
 * counts the buckets this module returns, and the dashboard only prints
 * them. Nothing here reads a clock or a database.
 */

import { isOutreachReplyOutcome, type OutreachOutcome } from './outreach-outcome.js';
import type { OutreachThreadState } from './outreach-thread-state.js';

export const OUTREACH_MATURITY_BUCKETS = [
  /** A thread exists, but no first email was confirmed sent. */
  'prepared',
  /** A first email went out and a follow-up may still be sent. */
  'in-sequence',
  /** All three emails went out; the reply window is still open. */
  'reply-window',
  'matured-replied',
  'matured-silent',
  /** The first email bounced. */
  'undelivered',
  /** The first email went out inside another prospect's message, so its
   *  recipient is counted once, on the thread that carried it. */
  'merged',
  /** Closed for a reason this module does not know. Shown as its own count,
   *  never folded into another bucket. */
  'closed-other',
] as const;

export type OutreachMaturityBucket = (typeof OUTREACH_MATURITY_BUCKETS)[number];

/** Buckets whose first email reached a recipient of its own: the
 *  denominator of every rate. */
const DELIVERED_BUCKETS: ReadonlySet<OutreachMaturityBucket> = new Set([
  'in-sequence',
  'reply-window',
  'matured-replied',
  'matured-silent',
  'closed-other',
]);

export function isDeliveredOutreachBucket(bucket: OutreachMaturityBucket): boolean {
  return DELIVERED_BUCKETS.has(bucket);
}

export function isMaturedOutreachBucket(bucket: OutreachMaturityBucket): boolean {
  return bucket === 'matured-replied' || bucket === 'matured-silent';
}

/** Every reason production code writes when it moves a thread to `closed`.
 *  The writers are typed against this list, so a new reason cannot be added
 *  without being mapped below. */
export const OUTREACH_CLOSED_REASONS = [
  /** The operator confirmed a drafted touch went out in an email the mailbox
   *  sync cannot tie to this thread. */
  'operator-confirmed-send',
  /** Another prospect of the same domain objected. */
  'opted-out',
  /** The prospect is being deleted. */
  'prospect-deleted',
] as const;

export type OutreachClosedReason = (typeof OUTREACH_CLOSED_REASONS)[number];

export interface OutreachMaturityThread {
  state: OutreachThreadState;
  stateReason?: string | undefined;
  touches: readonly {
    touch: number;
    sentAt: Date | string;
    confirmedBy?: 'operator' | undefined;
  }[];
  spacing: { touch2AfterDays: number; touch3AfterDays: number; replyWindowDays: number };
  /** The thread's current operator-recorded outcome, when it has one. */
  outcome?: OutreachOutcome | undefined;
}

const STATE_BUCKETS: Record<Exclude<OutreachThreadState, 'closed'>, OutreachMaturityBucket> = {
  open: 'prepared',
  'e1-drafted': 'prepared',
  'e1-sent': 'in-sequence',
  'e2-drafted': 'in-sequence',
  'e2-sent': 'in-sequence',
  'e3-drafted': 'in-sequence',
  'e3-sent': 'reply-window',
  replied: 'matured-replied',
  'opted-out': 'matured-replied',
  'sequence-complete': 'matured-silent',
  bounced: 'undelivered',
};

/** A closed thread that carries a first email. `firstTouchByOperator` is
 *  true when that first email is the one the operator confirmed by hand. */
const CLOSED_REASON_BUCKETS: Record<
  OutreachClosedReason,
  (firstTouchByOperator: boolean) => OutreachMaturityBucket
> = {
  // When only a follow-up went out elsewhere, the first email was this
  // thread's own: it was delivered, and its sequence ended here.
  'operator-confirmed-send': (firstTouchByOperator) =>
    firstTouchByOperator ? 'merged' : 'matured-silent',
  // The objection is counted on the thread that received it. This one was
  // closed without an answer of its own.
  'opted-out': () => 'matured-silent',
  'prospect-deleted': () => 'matured-silent',
};

function isOutreachClosedReason(reason: string | undefined): reason is OutreachClosedReason {
  return reason !== undefined && (OUTREACH_CLOSED_REASONS as readonly string[]).includes(reason);
}

/**
 * The one bucket a thread belongs to. Total over `OutreachThreadState`: a
 * new state fails compilation in `STATE_BUCKETS`, a new closing reason in
 * `CLOSED_REASON_BUCKETS`.
 */
export function classifyOutreachMaturity(thread: OutreachMaturityThread): OutreachMaturityBucket {
  const firstTouch = thread.touches.find((touch) => touch.touch === 1);
  // Nothing was sent, so nothing can mature, whatever was recorded since.
  if (firstTouch === undefined) return 'prepared';
  // A recorded reply wins over the state: it arrives after the sequence
  // closed as often as during it, and it is never dropped.
  if (thread.outcome !== undefined && isOutreachReplyOutcome(thread.outcome)) {
    return 'matured-replied';
  }
  if (thread.state !== 'closed') return STATE_BUCKETS[thread.state] ?? 'closed-other';
  if (!isOutreachClosedReason(thread.stateReason)) return 'closed-other';
  return CLOSED_REASON_BUCKETS[thread.stateReason](firstTouch.confirmedBy === 'operator');
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC calendar day, `YYYY-MM-DD`. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addUtcDays(day: string, days: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS));
}

export function utcDaysBetween(fromDay: string, toDay: string): number {
  return Math.round(
    (Date.parse(`${toDay}T00:00:00.000Z`) - Date.parse(`${fromDay}T00:00:00.000Z`)) / DAY_MS,
  );
}

/** Days from a first email to the close of its sequence when every follow-up
 *  goes out the day it is due. Each follow-up is due a number of days after
 *  the touch before it, as the follow-up scheduler counts. */
export function outreachSequenceDays(spacing: OutreachMaturityThread['spacing']): number {
  return spacing.touch2AfterDays + spacing.touch3AfterDays + spacing.replyWindowDays;
}

/**
 * The earliest moment a thread still in its sequence can mature without a
 * reply, from the last touch it has sent and its own spacing snapshot. A
 * follow-up sent late moves it later, never earlier. Undefined for a thread
 * that is not waiting to mature.
 */
export function earliestOutreachMaturityDate(thread: OutreachMaturityThread): Date | undefined {
  const bucket = classifyOutreachMaturity(thread);
  if (bucket !== 'in-sequence' && bucket !== 'reply-window') return undefined;
  const sentAt = (touch: number): number | undefined => {
    const record = thread.touches.find((candidate) => candidate.touch === touch);
    return record === undefined ? undefined : new Date(record.sentAt).getTime();
  };
  const { touch3AfterDays, replyWindowDays } = thread.spacing;
  const third = sentAt(3);
  if (third !== undefined) return new Date(third + replyWindowDays * DAY_MS);
  const second = sentAt(2);
  if (second !== undefined) {
    return new Date(second + (touch3AfterDays + replyWindowDays) * DAY_MS);
  }
  const first = sentAt(1);
  if (first === undefined) return undefined;
  return new Date(first + outreachSequenceDays(thread.spacing) * DAY_MS);
}

/** The brief's checkpoints, in matured first touches. */
export const OUTREACH_CHECKPOINTS = [100, 300, 500] as const;

export type OutreachCheckpoint = (typeof OUTREACH_CHECKPOINTS)[number];

/** The sending pace is read over this many calendar days. */
export const OUTREACH_PACE_WINDOW_DAYS = 14;

/** No pace is extrapolated from fewer days of sending than this. */
export const OUTREACH_PACE_MIN_SENDING_DAYS = 7;

export interface OutreachCheckpointProjectionInput {
  matured: number;
  /** Delivered threads not yet matured, by the UTC day each matures at the
   *  earliest. */
  pendingMaturity: readonly { day: string; threads: number }[];
  /** First emails sent over the last `OUTREACH_PACE_WINDOW_DAYS` days. */
  recentFirstTouchSends: number;
  /** UTC day of the campaign's first email, absent when none was sent. */
  firstSendDay?: string | undefined;
  /** Days from a first email to the close of its sequence. */
  sequenceDays: number;
  /** UTC day the projection is made on. */
  today: string;
}

export type OutreachCheckpointProjection =
  | { checkpoint: OutreachCheckpoint; kind: 'reached' }
  /** The threads already sent reach it on their own, on this day at the
   *  earliest. */
  | { checkpoint: OutreachCheckpoint; kind: 'dated'; day: string }
  /** Reaching it needs first emails not sent yet: an extrapolation of the
   *  recent pace. */
  | { checkpoint: OutreachCheckpoint; kind: 'estimated'; day: string; firstTouchesPerDay: number }
  | { checkpoint: OutreachCheckpoint; kind: 'no-estimate' };

/**
 * When each checkpoint is reached. What the threads already sent decide is
 * dated; what depends on emails not sent yet is estimated from the pace, and
 * only once there is enough sending to read a pace from.
 */
export function projectOutreachCheckpoints(
  input: OutreachCheckpointProjectionInput,
): OutreachCheckpointProjection[] {
  const pending = [...input.pendingMaturity]
    .filter((entry) => entry.threads > 0)
    .sort((a, b) => a.day.localeCompare(b.day));
  const pendingTotal = pending.reduce((sum, entry) => sum + entry.threads, 0);
  const lastPendingDay = pending.at(-1)?.day;
  const firstTouchesPerDay = input.recentFirstTouchSends / OUTREACH_PACE_WINDOW_DAYS;
  const sendingDays =
    input.firstSendDay === undefined ? 0 : utcDaysBetween(input.firstSendDay, input.today);
  const later = (a: string, b: string): string => (a.localeCompare(b) >= 0 ? a : b);

  return OUTREACH_CHECKPOINTS.map((checkpoint): OutreachCheckpointProjection => {
    if (input.matured >= checkpoint) return { checkpoint, kind: 'reached' };
    if (input.matured + pendingTotal >= checkpoint) {
      let reached = input.matured;
      for (const entry of pending) {
        reached += entry.threads;
        // A date already behind us means a follow-up is late: today is the
        // earliest it can still happen.
        if (reached >= checkpoint) {
          return { checkpoint, kind: 'dated', day: later(entry.day, input.today) };
        }
      }
    }
    if (sendingDays < OUTREACH_PACE_MIN_SENDING_DAYS || firstTouchesPerDay <= 0) {
      return { checkpoint, kind: 'no-estimate' };
    }
    const stillToSend = checkpoint - input.matured - pendingTotal;
    const day = addUtcDays(
      input.today,
      Math.ceil(stillToSend / firstTouchesPerDay) + input.sequenceDays,
    );
    return {
      checkpoint,
      kind: 'estimated',
      day: lastPendingDay === undefined ? day : later(day, lastPendingDay),
      firstTouchesPerDay,
    };
  });
}
