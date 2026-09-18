/**
 * Append-only ledger of check attempts for one evidence epoch (plan 059
 * sections 3.9, 5.8, 5.9, 5.11 and 10).
 *
 * The failure this module exists to prevent is a quiet one. A full audit runs
 * the same check against the same page more than once: a timeout gets a
 * longer settle, a flaky tool gets a fresh context, a consent overlay gets a
 * second look. Once more than one attempt exists, some code has to say which
 * one counts, and the tempting implementation is to keep the last attempt that
 * did not throw. That implementation produces a report the operator cannot
 * defend, because the evidence behind a finding then depends on which attempt
 * happened to be convenient rather than on anything the site did. Worse, the
 * discarded attempts leave no trace, so nobody can tell afterwards that there
 * was ever a disagreement to resolve.
 *
 * So nothing here can overwrite or drop an attempt. `appendCheckAttempt` and
 * `appendSelectionDecision` both return a new ledger; there is no update and
 * no delete, the records are frozen, and every attempt that ever ran stays in
 * the ledger whether it succeeded, failed, was rejected, or was later replaced.
 *
 * That constraint forces one design decision worth spelling out. Section 5.8
 * lists `accepted | rejected | superseded` as a field of the attempt, but a
 * field cannot both live on the record and be immutable: accepting a second
 * attempt would have to reach back and rewrite the first one to `superseded`.
 * The selection state is therefore not stored on the attempt at all. It is
 * folded out of a separate append-only decision log by `selectionStateOf`, and
 * supersession is derived rather than asserted: an acceptance is superseded
 * exactly when a later acceptance exists for the same check, target and
 * surface. Accepting a different attempt is one more append, and the record of
 * the first acceptance survives it.
 *
 * Section 3.9 is the other half. Two attempts that both succeeded can still
 * disagree, because consent state, A/B assignment, personalization, service
 * workers and caches all make "observed once" weaker than "true of this site".
 * `resolveAttemptSet` refuses to arbitrate that: disagreeing successes return
 * `unstable-result` and no attempt at all, so a caller physically cannot ask
 * this module for the convenient answer. Only an explicit operator rejection,
 * itself an append, can narrow a contradictory set back down to a coherent one.
 *
 * Section 10's recovery profiles live here too, because the retry decision and
 * the record of what was retried are the same subject. `nextExecutionProfile`
 * is total over the failure taxonomy, which is the point: the rule that a 404
 * must never be retried only holds if no caller is left to invent its own
 * answer for a status it did not recognize. Policy refusals (robots,
 * network-safety, operator exclusion) and definitive site answers escalate
 * instead of retrying, and `failureClassForHttpStatus` exists so that a
 * generic "the request failed" can never reach the retry ladder without first
 * being told apart from a page that genuinely is not there.
 *
 * Diagnostic detail is deliberately thin. A stack trace names our own file
 * paths and belongs in the operator's logs, not in an evidence artifact that
 * outlives the run and feeds a client-facing coverage statement, so the ledger
 * stores a short code and the input type has nowhere to put anything longer.
 */

import { canonicalDigest } from '@odysseus/core';

export const CHECK_ATTEMPT_LEDGER_VERSION = 'check-attempt-ledger-v1';

/**
 * Why an attempt produced no usable evidence. Closed, because an open string
 * would let a caller route an unrecognized failure into the retry ladder by
 * accident, which is exactly how a 404 ends up being requested four times.
 *
 * Three departures from the section 5.8 list, which says "at least" and so
 * permits them. Section 5.8 writes "scanner timeout/tool error" as one bullet;
 * they are split because they justify different recoveries, a timeout wanting
 * a longer bounded settle and a tool error wanting a fresh context first.
 *
 * `site-http-state` means the origin gave a definitive answer about the
 * resource, not that any request failed: an overload or a bot wall is
 * `anti-bot-rate-limit`, and the distinction is what keeps the never-retry
 * rule meaningful.
 *
 * `origin-transient-error` is the third, and it exists because the first draft
 * of this taxonomy routed every 5xx into `site-http-state` and therefore never
 * retried one. A 502 or a 503 from a small hotel's shared host during a crawl
 * that lasts several minutes is a common and usually momentary event, and
 * treating it as the origin's final word would silently drop a real page from
 * a paid audit - the precise failure plan 059 exists to stop. It is kept apart
 * from `anti-bot-rate-limit` because the correct responses differ: retrying a
 * bot wall harder is futile and rude, whereas backing off and retrying a
 * transient 503 is the polite and correct thing to do. A caller that sees one
 * should still tell the host scheduler about it, so the retry arrives later
 * rather than sooner.
 */
export type AttemptFailureClass =
  | 'site-http-state'
  | 'origin-transient-error'
  | 'robots-policy'
  | 'network-safety-block'
  | 'soft-error-interstitial'
  | 'not-applicable'
  | 'operator-excluded'
  | 'scanner-timeout'
  | 'tool-error'
  | 'browser-environment-error'
  | 'dependency-error'
  | 'anti-bot-rate-limit'
  | 'unstable-result'
  | 'unknown';

/** Section 10's four central profiles. */
export type ExecutionProfile = 'normal' | 'isolated-retry' | 'diagnostic-retry' | 'stop-escalate';

/**
 * The profiles an attempt can actually have run under. `stop-escalate` is a
 * decision not to run anything, so recording an attempt that claims it would
 * mean the recovery policy was consulted and then ignored; `appendCheckAttempt`
 * refuses it.
 */
export type AttemptExecutionProfile = Exclude<ExecutionProfile, 'stop-escalate'>;

/**
 * What the check was run against. Page and performance targets are both keyed
 * by URL but are not interchangeable: a performance target also names the
 * measurement profile, because a mobile and a desktop Lighthouse run are two
 * measurements rather than two attempts at one.
 */
export type AttemptTarget =
  | { kind: 'page'; url: string }
  | { kind: 'site'; origin: string }
  | { kind: 'performance'; url: string; performanceProfile: string };

interface CheckAttemptCore {
  attemptId: string;
  evidenceEpoch: number;
  /** Digest of the `AuditScopeSnapshot` this attempt ran under (section 5.1).
   *  Recorded because a mid-run scope change restarts the epoch, and an
   *  attempt carried across one would be evidence about a different audit. */
  scopeDigest: string;
  checkId: string;
  target: AttemptTarget;
  /** The `ScanSurface` identity (section 5.5): viewport, interaction state and
   *  isolation group. Part of the selection key, so a mobile and a desktop
   *  observation never compete for the same acceptance. */
  surfaceId: string;
  startedAt: string;
  finishedAt: string;
  executionProfile: AttemptExecutionProfile;
  /** The acquisition artifact the check read, or null where the attempt failed
   *  before one existed. */
  sourceArtifactDigest: string | null;
}

export type CheckAttempt =
  | (CheckAttemptCore & {
      outcome: 'succeeded';
      /**
       * Digest of the check's material result, which is what section 3.9
       * compares when it asks whether two attempts disagree. Distinct from
       * `sourceArtifactDigest` on purpose: re-capturing a page yields new
       * bytes for the same rendered state, so comparing acquisition digests
       * would call every honest retry unstable.
       */
      materialResultDigest: string;
    })
  | (CheckAttemptCore & {
      outcome: 'failed';
      failureClass: AttemptFailureClass;
      /** A short stable code such as `nav-timeout` or `axe-worker-exit`. Long
       *  or multi-line values are refused so a stack trace cannot be smuggled
       *  into the evidence graph. */
      diagnosticCode: string;
    });

/** `Omit` over a union keeps only the keys both members share, which would
 *  quietly erase the outcome-specific fields below. This distributes instead. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type CheckAttemptInput =
  | (Omit<CheckAttemptCore, 'attemptId' | 'startedAt' | 'finishedAt'> & {
      startedAt: Date;
      finishedAt: Date;
      outcome: 'succeeded';
      materialResultDigest: string;
    })
  | (Omit<CheckAttemptCore, 'attemptId' | 'startedAt' | 'finishedAt'> & {
      startedAt: Date;
      finishedAt: Date;
      outcome: 'failed';
      failureClass: AttemptFailureClass;
      diagnosticCode: string;
    });

/**
 * A selection decision names an attempt and says whether it is the accepted
 * evidence. `superseded` is deliberately absent: it is never asserted, only
 * derived from a later acceptance, so there is no way to mark an earlier
 * record stale without appending the decision that actually made it stale.
 */
export interface SelectionDecision {
  sequence: number;
  attemptId: string;
  state: 'accepted' | 'rejected';
  /** Section 5.8 allows an operator to resolve what the deterministic rules
   *  cannot. Recorded so a report can tell the two apart. */
  decidedBy: 'deterministic' | 'operator';
  reasonCode: string;
  decidedAt: string;
}

export type SelectionDecisionInput = Omit<SelectionDecision, 'sequence' | 'decidedAt'> & {
  decidedAt: Date;
};

/**
 * One attempt as persisted on a page's scan.json (see evidence-acquisition.ts): the ledger's input shape
 * with instants as ISO strings, since the record has to survive JSON.
 */
export type AcquisitionAttemptRecord =
  | {
      checkId: string;
      target: AttemptTarget;
      surfaceId: string;
      scopeDigest: string;
      evidenceEpoch: number;
      startedAt: string;
      finishedAt: string;
      executionProfile: AttemptExecutionProfile;
      sourceArtifactDigest: string | null;
      outcome: 'succeeded';
      materialResultDigest: string;
    }
  | {
      checkId: string;
      target: AttemptTarget;
      surfaceId: string;
      scopeDigest: string;
      evidenceEpoch: number;
      startedAt: string;
      finishedAt: string;
      executionProfile: AttemptExecutionProfile;
      sourceArtifactDigest: string | null;
      outcome: 'failed';
      failureClass: AttemptFailureClass;
      diagnosticCode: string;
    };

/** `pending` covers an attempt with no decision yet, which section 5.8's
 *  three-value list has no room for but every ledger passes through. */
export type AttemptSelectionState = 'pending' | 'accepted' | 'rejected' | 'superseded';

export interface CheckAttemptLedger {
  readonly version: typeof CHECK_ATTEMPT_LEDGER_VERSION;
  readonly evidenceEpoch: number;
  readonly attempts: readonly CheckAttempt[];
  readonly selections: readonly SelectionDecision[];
}

const DIAGNOSTIC_CODE_PATTERN = /^[a-z][a-z0-9-]{1,47}$/u;

function freezeDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const member of value) freezeDeep(member);
    return Object.freeze(value) as T;
  }
  if (value !== null && typeof value === 'object') {
    for (const member of Object.values(value)) freezeDeep(member);
    return Object.freeze(value);
  }
  return value;
}

export function createCheckAttemptLedger(evidenceEpoch: number): CheckAttemptLedger {
  return freezeDeep({
    version: CHECK_ATTEMPT_LEDGER_VERSION,
    evidenceEpoch,
    attempts: [] as readonly CheckAttempt[],
    selections: [] as readonly SelectionDecision[],
  });
}

/**
 * The identity of one check observation: the same check, against the same
 * target, on the same surface. Two attempts share a key exactly when they are
 * competing answers to one question, which is the only situation where
 * acceptance, supersession and instability apply.
 */
export function attemptSelectionKey(
  attempt: Pick<CheckAttemptCore, 'checkId' | 'target' | 'surfaceId'>,
): string {
  const target = attempt.target;
  const targetKey =
    target.kind === 'site'
      ? `site:${target.origin}`
      : target.kind === 'page'
        ? `page:${target.url}`
        : `performance:${target.url}#${target.performanceProfile}`;
  return `${attempt.checkId}|${targetKey}|${attempt.surfaceId}`;
}

/**
 * Content-addressed attempt identity. Deriving it rather than accepting one
 * from the caller means two ledgers that ran the same work agree on their
 * attempt IDs, and it gives duplicate detection a meaning: an append that
 * matches an existing attempt in every field, including both instants, is the
 * same attempt being recorded twice, not a second run.
 */
function deriveAttemptId(body: DistributiveOmit<CheckAttempt, 'attemptId'>): string {
  return `attempt:${canonicalDigest(body).slice('sha256:'.length, 'sha256:'.length + 16)}`;
}

export function appendCheckAttempt(
  ledger: CheckAttemptLedger,
  input: CheckAttemptInput,
): { ledger: CheckAttemptLedger; attempt: CheckAttempt } {
  if (input.evidenceEpoch !== ledger.evidenceEpoch) {
    throw new Error(
      `check attempt belongs to epoch ${input.evidenceEpoch}, ledger is epoch ${ledger.evidenceEpoch}`,
    );
  }
  if (input.finishedAt.getTime() < input.startedAt.getTime()) {
    throw new Error('check attempt finished before it started');
  }
  // The type already excludes it. Checked again at runtime because the value
  // reaching here comes from a recovery decision, and an attempt claiming to
  // have run under `stop-escalate` would be a record of the policy being
  // overruled rather than of work that was allowed to happen.
  if ((input.executionProfile as ExecutionProfile) === 'stop-escalate') {
    throw new Error('stop-escalate is a decision not to attempt, not an execution profile');
  }
  if (input.outcome === 'failed' && !DIAGNOSTIC_CODE_PATTERN.test(input.diagnosticCode)) {
    throw new Error(
      'diagnosticCode must be a short lower-case code; raw error text and stack traces stay in operator logs',
    );
  }

  const core = {
    evidenceEpoch: input.evidenceEpoch,
    scopeDigest: input.scopeDigest,
    checkId: input.checkId,
    target: input.target,
    surfaceId: input.surfaceId,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    executionProfile: input.executionProfile,
    sourceArtifactDigest: input.sourceArtifactDigest,
  } as const;

  const body: DistributiveOmit<CheckAttempt, 'attemptId'> =
    input.outcome === 'succeeded'
      ? { ...core, outcome: 'succeeded', materialResultDigest: input.materialResultDigest }
      : {
          ...core,
          outcome: 'failed',
          failureClass: input.failureClass,
          diagnosticCode: input.diagnosticCode,
        };

  const attempt = { ...body, attemptId: deriveAttemptId(body) } as CheckAttempt;
  if (ledger.attempts.some((existing) => existing.attemptId === attempt.attemptId)) {
    throw new Error(`check attempt ${attempt.attemptId} is already in the ledger`);
  }

  return {
    ledger: freezeDeep({
      ...ledger,
      attempts: [...ledger.attempts, attempt],
    }),
    attempt: freezeDeep(attempt),
  };
}

export function appendSelectionDecision(
  ledger: CheckAttemptLedger,
  input: SelectionDecisionInput,
): CheckAttemptLedger {
  const attempt = ledger.attempts.find((candidate) => candidate.attemptId === input.attemptId);
  if (attempt === undefined) {
    throw new Error(`cannot decide on unknown attempt ${input.attemptId}`);
  }
  // A failed attempt is a recorded disposition, never accepted evidence. Even
  // the terminal classes such as not-applicable explain an absence rather than
  // supplying an observation, so acceptance stays reserved for a success.
  if (input.state === 'accepted' && attempt.outcome !== 'succeeded') {
    throw new Error(`cannot accept failed attempt ${input.attemptId} as evidence`);
  }

  const decision: SelectionDecision = {
    sequence: ledger.selections.length,
    attemptId: input.attemptId,
    state: input.state,
    decidedBy: input.decidedBy,
    reasonCode: input.reasonCode,
    decidedAt: input.decidedAt.toISOString(),
  };

  return freezeDeep({ ...ledger, selections: [...ledger.selections, decision] });
}

function latestDecisionFor(
  ledger: CheckAttemptLedger,
  attemptId: string,
): SelectionDecision | undefined {
  return ledger.selections.reduce<SelectionDecision | undefined>(
    (latest, decision) =>
      decision.attemptId === attemptId &&
      (latest === undefined || decision.sequence > latest.sequence)
        ? decision
        : latest,
    undefined,
  );
}

/**
 * Folds the decision log down to one attempt's current state. An acceptance is
 * `superseded` when a later acceptance exists for the same selection key, which
 * is how a replacement is recorded without the earlier record ever changing.
 */
export function selectionStateOf(
  ledger: CheckAttemptLedger,
  attemptId: string,
): AttemptSelectionState {
  const attempt = ledger.attempts.find((candidate) => candidate.attemptId === attemptId);
  if (attempt === undefined) throw new Error(`unknown attempt ${attemptId}`);

  const decision = latestDecisionFor(ledger, attemptId);
  if (decision === undefined) return 'pending';
  if (decision.state === 'rejected') return 'rejected';

  const key = attemptSelectionKey(attempt);
  const supersededByLater = ledger.selections.some((later) => {
    if (later.sequence <= decision.sequence) return false;
    if (later.state !== 'accepted') return false;
    if (later.attemptId === attemptId) return false;
    const other = ledger.attempts.find((candidate) => candidate.attemptId === later.attemptId);
    return other !== undefined && attemptSelectionKey(other) === key;
  });
  return supersededByLater ? 'superseded' : 'accepted';
}

export function attemptsForSelectionKey(
  ledger: CheckAttemptLedger,
  key: string,
): readonly CheckAttempt[] {
  return ledger.attempts.filter((attempt) => attemptSelectionKey(attempt) === key);
}

/** The attempt currently accepted for a selection key, or null while none is. */
export function acceptedAttemptFor(ledger: CheckAttemptLedger, key: string): CheckAttempt | null {
  const accepted = attemptsForSelectionKey(ledger, key).filter(
    (attempt) => selectionStateOf(ledger, attempt.attemptId) === 'accepted',
  );
  if (accepted.length > 1) {
    // Unreachable through this API, since supersession is derived from the
    // decision order. Surfaced rather than silently taking the first, because
    // a second accepted attempt for one key would mean the fold is wrong and
    // the evidence graph is no longer explainable.
    throw new Error(`selection key ${key} has ${accepted.length} accepted attempts`);
  }
  return accepted[0] ?? null;
}

/**
 * Which failure best explains an absence of evidence, when every attempt
 * failed for a different reason. Ordered so a policy or definitive-answer
 * refusal outranks an operational one: if robots forbade the page, saying the
 * gap was a timeout would be true of one attempt and misleading about the run.
 */
const FAILURE_CLASS_PRECEDENCE: readonly AttemptFailureClass[] = [
  'operator-excluded',
  'robots-policy',
  'network-safety-block',
  'not-applicable',
  'site-http-state',
  'soft-error-interstitial',
  'anti-bot-rate-limit',
  'dependency-error',
  'browser-environment-error',
  'tool-error',
  'scanner-timeout',
  'unstable-result',
  'unknown',
];

export type AttemptSetResolution =
  | { kind: 'no-attempts' }
  | { kind: 'accepted'; attempt: CheckAttempt; reasonCode: 'sole-success' | 'agreeing-successes' }
  | {
      kind: 'unstable-result';
      attemptIds: readonly string[];
      materialResultDigests: readonly string[];
    }
  | { kind: 'no-evidence'; failureClass: AttemptFailureClass; attemptIds: readonly string[] };

/**
 * Section 3.9's rule, expressed so that cherry-picking is not available rather
 * than merely discouraged. Successes that disagree on their material result
 * return `unstable-result` and no attempt: there is no parameter that makes
 * this function pick one, and the caller gets the whole contradicting set to
 * disclose or investigate.
 *
 * Where the successes do agree the pick is deterministic (earliest start, then
 * attempt ID) so two runs over the same ledger never choose differently.
 */
export function resolveAttemptSet(attempts: readonly CheckAttempt[]): AttemptSetResolution {
  if (attempts.length === 0) return { kind: 'no-attempts' };

  const keys = new Set(attempts.map(attemptSelectionKey));
  if (keys.size > 1) {
    // Resolving across targets would let a caller assemble a "coherent" set out
    // of observations of different pages, which is the cherry-pick this module
    // exists to prevent, wearing a different hat.
    throw new Error(`attempt set spans ${keys.size} selection keys; resolve one key at a time`);
  }

  const succeeded = attempts.filter(
    (attempt): attempt is Extract<CheckAttempt, { outcome: 'succeeded' }> =>
      attempt.outcome === 'succeeded',
  );

  if (succeeded.length === 0) {
    const failed = attempts.filter(
      (attempt): attempt is Extract<CheckAttempt, { outcome: 'failed' }> =>
        attempt.outcome === 'failed',
    );
    const present = new Set(failed.map((attempt) => attempt.failureClass));
    const governing =
      FAILURE_CLASS_PRECEDENCE.find((candidate) => present.has(candidate)) ?? 'unknown';
    return {
      kind: 'no-evidence',
      failureClass: governing,
      attemptIds: failed.map((attempt) => attempt.attemptId),
    };
  }

  const digests = [...new Set(succeeded.map((attempt) => attempt.materialResultDigest))].sort();
  if (digests.length > 1) {
    return {
      kind: 'unstable-result',
      attemptIds: [...succeeded].map((attempt) => attempt.attemptId).sort(),
      materialResultDigests: digests,
    };
  }

  const chosen = [...succeeded].sort((left, right) => {
    const byStart = left.startedAt.localeCompare(right.startedAt);
    return byStart !== 0 ? byStart : left.attemptId.localeCompare(right.attemptId);
  })[0] as CheckAttempt;

  return {
    kind: 'accepted',
    attempt: chosen,
    reasonCode: succeeded.length === 1 ? 'sole-success' : 'agreeing-successes',
  };
}

/**
 * The same rule applied to a live ledger, with attempts an operator already
 * rejected left out. That exclusion is what lets an `unstable-result` be
 * resolved at all: the operator appends a rejection naming the attempt and why,
 * and the remaining set becomes coherent through the record rather than through
 * a silent preference.
 */
export function resolveSelectionForKey(
  ledger: CheckAttemptLedger,
  key: string,
): AttemptSetResolution {
  return resolveAttemptSet(
    attemptsForSelectionKey(ledger, key).filter(
      (attempt) => selectionStateOf(ledger, attempt.attemptId) !== 'rejected',
    ),
  );
}

/**
 * Failure classes that end the work on a target instead of retrying it.
 *
 * `site-http-state` heads the list because of the case section 10 names
 * outright: a 404 is an answer, and retrying it because a generic status said
 * "failed" turns one honest gap into four impolite requests and a coverage
 * record that claims more effort than it made. The three policy refusals are
 * here for a different reason: the only way to change their outcome is to
 * change identity or profile, which the charter forbids. `not-applicable` has
 * nothing to retry, and `anti-bot-rate-limit` is section 10's explicit
 * stop/escalate case.
 */
export const NEVER_RETRIED_FAILURE_CLASSES: readonly AttemptFailureClass[] = [
  'site-http-state',
  'robots-policy',
  'network-safety-block',
  'not-applicable',
  'operator-excluded',
  'anti-bot-rate-limit',
];

export function isRetryableFailureClass(failureClass: AttemptFailureClass): boolean {
  return !NEVER_RETRIED_FAILURE_CLASSES.includes(failureClass);
}

/**
 * The profiles each failure class may escalate through, in order. A class
 * reaches `stop-escalate` when the ladder runs out, so recovery is bounded by
 * the taxonomy itself and not by a retry counter somebody has to remember to
 * pass.
 *
 * A timeout and a browser crash skip `isolated-retry`: neither is fixed by a
 * cleaner context, and both are what section 10's diagnostic profile, a fresh
 * serialized process with a longer bounded settle, was described for. A
 * soft-error interstitial gets exactly one isolated retry because a fresh
 * context is what distinguishes a permanent error page from a consent or
 * bot-check wall, and it gets no more than one because repeating it past that
 * is indistinguishable from retrying a 404.
 */
const RECOVERY_LADDER: Record<AttemptFailureClass, readonly AttemptExecutionProfile[]> = {
  'site-http-state': [],
  'robots-policy': [],
  'network-safety-block': [],
  'not-applicable': [],
  'operator-excluded': [],
  'anti-bot-rate-limit': [],
  // A fresh context fixes nothing about an overloaded origin, so both rungs
  // here are really just "ask again, later". The delay comes from the host
  // scheduler's backoff rather than from this ladder, which is why two rungs
  // are enough: by the second one the scheduler has doubled its spacing twice.
  'origin-transient-error': ['isolated-retry', 'diagnostic-retry'],
  'soft-error-interstitial': ['isolated-retry'],
  'scanner-timeout': ['diagnostic-retry'],
  'browser-environment-error': ['diagnostic-retry'],
  'unstable-result': ['diagnostic-retry'],
  'tool-error': ['isolated-retry', 'diagnostic-retry'],
  'dependency-error': ['isolated-retry', 'diagnostic-retry'],
  unknown: ['isolated-retry'],
};

const PROFILE_RANK: Record<AttemptExecutionProfile, number> = {
  normal: 0,
  'isolated-retry': 1,
  'diagnostic-retry': 2,
};

export interface RecoveryDecision {
  retryable: boolean;
  nextProfile: ExecutionProfile;
  reasonCode:
    | 'terminal-site-answer'
    | 'policy-refusal'
    | 'nothing-to-retry'
    | 'escalate-rate-limit'
    | 'fresh-context'
    | 'fresh-process'
    | 'recovery-exhausted';
}

const NON_RETRY_REASON: Partial<Record<AttemptFailureClass, RecoveryDecision['reasonCode']>> = {
  'site-http-state': 'terminal-site-answer',
  'robots-policy': 'policy-refusal',
  'network-safety-block': 'policy-refusal',
  'operator-excluded': 'policy-refusal',
  'not-applicable': 'nothing-to-retry',
  'anti-bot-rate-limit': 'escalate-rate-limit',
};

/**
 * Which section 10 profile, if any, may run the next attempt after this
 * failure. Total over the taxonomy so that no caller has to decide what an
 * unfamiliar failure deserves, and biased towards stopping: an exhausted
 * ladder escalates rather than falling back to `normal`.
 */
export function nextExecutionProfile(
  failureClass: AttemptFailureClass,
  currentProfile: AttemptExecutionProfile,
): RecoveryDecision {
  const terminalReason = NON_RETRY_REASON[failureClass];
  if (terminalReason !== undefined) {
    return { retryable: false, nextProfile: 'stop-escalate', reasonCode: terminalReason };
  }

  const next = RECOVERY_LADDER[failureClass].find(
    (candidate) => PROFILE_RANK[candidate] > PROFILE_RANK[currentProfile],
  );
  if (next === undefined) {
    return { retryable: false, nextProfile: 'stop-escalate', reasonCode: 'recovery-exhausted' };
  }
  return {
    retryable: true,
    nextProfile: next,
    reasonCode: next === 'isolated-retry' ? 'fresh-context' : 'fresh-process',
  };
}

/**
 * The 5xx statuses that describe the server's momentary condition rather than
 * a settled answer about the request. Listed positively, so that a status not
 * thought about here falls through to the terminal class instead of quietly
 * joining the retry ladder.
 */
const TRANSIENT_ORIGIN_STATUSES = new Set([
  500, // Internal Server Error - usually a crashed request handler.
  502, // Bad Gateway - the reverse proxy outlived its backend.
  503, // Service Unavailable - overload or a maintenance window.
  504, // Gateway Timeout - the backend was too slow, this once.
  507, // Insufficient Storage.
  508, // Loop Detected - server-side, and often configuration being reloaded.
  509, // Bandwidth Limit Exceeded; non-standard but common on shared hosting,
  //     which is what most of the audited estate runs on.
]);

/**
 * Turns an HTTP status the site answered with into a failure class, so that
 * "the request failed" never reaches the retry ladder undifferentiated.
 *
 * Most 5xx statuses mean the origin failed to answer, not that it answered
 * definitively, so they are retryable through `origin-transient-error`. The
 * politeness objection to retrying a struggling site is real and is answered by
 * the host scheduler rather than by refusing: `noteRateLimited` doubles the
 * spacing and sheds a lane, so the second attempt arrives later and alongside
 * less traffic than the first. Refusing outright would instead trade a quieter
 * scan for a page missing from a paid audit, which is the trade plan 059 is
 * written to stop making silently.
 *
 * The exceptions are the 5xx statuses that are genuine statements about the
 * request rather than about the server's health: 501 and 505 will say the same
 * thing however often they are asked.
 *
 * 403 is terminal for the same reason a policy refusal is: we never change
 * identity, so a second request is the same request.
 */
export function failureClassForHttpStatus(status: number): AttemptFailureClass {
  if (status < 400) {
    throw new Error(`status ${status} is not a failure; classify only 4xx and 5xx answers`);
  }
  if (status === 429) return 'anti-bot-rate-limit';
  if (TRANSIENT_ORIGIN_STATUSES.has(status)) return 'origin-transient-error';
  return 'site-http-state';
}

/**
 * Digest over the complete ledger, section 5.11's "including failed, rejected
 * and superseded attempts and acceptance decisions".
 *
 * The decision log is inside the digest, not just the attempts, which is what
 * makes the section's guarantee hold: accepting a different attempt appends a
 * decision, so it necessarily moves this digest and therefore the raw evidence
 * snapshot that quotes it. A ledger that ended up at the same acceptance by a
 * different route stays distinguishable from one that got there directly,
 * because the route is in the record.
 */
export function checkAttemptLedgerDigest(ledger: CheckAttemptLedger): string {
  return canonicalDigest({
    version: ledger.version,
    evidenceEpoch: ledger.evidenceEpoch,
    attempts: ledger.attempts,
    selections: ledger.selections,
  });
}
