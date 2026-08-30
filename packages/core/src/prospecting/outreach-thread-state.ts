/**
 * Milestone 9c plan 012: the explicit state machine for one hotel's outreach
 * thread.
 *
 * Pure and table-driven, per this repository's convention for every other
 * legality decision in `core` (compare `outreach-selection.ts`). A thread's
 * state must be testable without a database: the store layer only ever asks
 * this table whether a transition is legal, it never encodes the legality
 * itself.
 *
 * Provider facts (a message was sent, a reply arrived) and operator facts
 * (a categorical outcome) are kept on separate fields elsewhere
 * (`packages/store/src/schemas/outreach-thread.schema.ts`); this module only
 * decides which states exist and which moves between them are legal.
 */

export type OutreachThreadState =
  | 'open'
  | 'e1-drafted'
  | 'e1-sent'
  | 'e2-drafted'
  | 'e2-sent'
  | 'e3-drafted'
  | 'e3-sent'
  | 'replied'
  | 'bounced'
  | 'opted-out'
  | 'sequence-complete'
  | 'closed';

/** No further drafting, sending, or reconciliation may move a thread out of
 *  one of these. `closed` is the generic terminal state (objection, hard
 *  suppression, operator request); the others are the specific reasons that
 *  also happen to be terminal. */
export const TERMINAL_OUTREACH_THREAD_STATES: readonly OutreachThreadState[] = [
  'replied',
  'bounced',
  'opted-out',
  'sequence-complete',
  'closed',
];

export const ACTIVE_OUTREACH_THREAD_STATES: readonly OutreachThreadState[] = [
  'open',
  'e1-drafted',
  'e1-sent',
  'e2-drafted',
  'e2-sent',
  'e3-drafted',
  'e3-sent',
];

/**
 * Every legal move, as data, so the table itself is the one place that can
 * disagree with a caller's assumption. A state is reachable from itself only
 * where a retried sync must be a no-op (see `transitionOutreachThread`'s own
 * compare-and-set, which this table does not need to express: idempotent
 * retries are handled by the store guard matching on the current state, not
 * by a self-loop here).
 */
const ALLOWED_TRANSITIONS: Readonly<Record<OutreachThreadState, readonly OutreachThreadState[]>> = {
  // An objection can arrive before a single draft exists (the suppression
  // gate runs before generation), so `opted-out` and `closed` are reachable
  // from every active state, not only from a sent one. `bounced` is not:
  // a bounce is a fact about a message the provider actually tried to
  // deliver, so it can only follow a confirmed send.
  open: ['e1-drafted', 'opted-out', 'closed'],
  'e1-drafted': ['e1-sent', 'opted-out', 'closed'],
  'e1-sent': ['e2-drafted', 'replied', 'bounced', 'opted-out', 'closed'],
  'e2-drafted': ['e2-sent', 'opted-out', 'closed'],
  'e2-sent': ['e3-drafted', 'replied', 'bounced', 'opted-out', 'closed'],
  'e3-drafted': ['e3-sent', 'opted-out', 'closed'],
  'e3-sent': ['replied', 'bounced', 'opted-out', 'sequence-complete', 'closed'],
  replied: ['closed'],
  bounced: ['closed'],
  'opted-out': ['closed'],
  'sequence-complete': ['closed'],
  closed: [],
};

export function canTransitionOutreachThread(
  from: OutreachThreadState,
  to: OutreachThreadState,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalOutreachThreadState(state: OutreachThreadState): boolean {
  return TERMINAL_OUTREACH_THREAD_STATES.includes(state);
}
