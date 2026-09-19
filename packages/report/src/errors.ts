import type { UnconfirmedField } from './template/unconfirmed-fields.js';

/**
 * Issue #73: the D8 gate in generateReportPdf is a deliberate stop, not a
 * crash - the pipeline finished, it is only waiting on the operator to
 * confirm a detected identity field before it will print it on a paid
 * cover. A plain Error made this indistinguishable from a real failure to
 * every catch-all in packages/interface's queue, which is why jobs.ts and
 * job-queue.ts marked it 'failed'. Typed the same way JobCancelledError
 * (packages/interface/src/queue/cancellation.ts) already distinguishes an
 * operator stop from a crash, so the queue can special-case it without
 * parsing the message string.
 */
export class ReportIdentityUnconfirmedError extends Error {
  readonly fields: UnconfirmedField[];

  constructor(fields: UnconfirmedField[], message: string) {
    super(message);
    this.name = 'ReportIdentityUnconfirmedError';
    this.fields = fields;
  }
}

/**
 * A selected priority names a rule with no reviewed remediation copy. Typed
 * so the outreach preview can fail closed with a refusal instead of
 * crashing, while the paid report keeps treating it as a hard stop.
 */
export class MissingReviewedRemediationError extends Error {
  readonly ruleIds: string[];

  constructor(ruleIds: string[]) {
    super(`Missing reviewed report remediation for rule IDs: ${ruleIds.join(', ')}`);
    this.name = 'MissingReviewedRemediationError';
    this.ruleIds = ruleIds;
  }
}
