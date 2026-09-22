import { describe, expect, it } from 'vitest';
import {
  acceptedAttemptFor,
  appendCheckAttempt,
  appendSelectionDecision,
  attemptSelectionKey,
  checkAttemptLedgerDigest,
  createCheckAttemptLedger,
  failureClassForHttpStatus,
  isRetryableFailureClass,
  nextExecutionProfile,
  resolveAttemptSet,
  resolveSelectionForKey,
  selectionStateOf,
  type AttemptExecutionProfile,
  type AttemptFailureClass,
  type CheckAttempt,
  type CheckAttemptInput,
  type CheckAttemptLedger,
} from './check-attempt-ledger.js';

const EPOCH = 7;
const SCOPE_DIGEST = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

const EVERY_FAILURE_CLASS: readonly AttemptFailureClass[] = [
  'site-http-state',
  'origin-transient-error',
  'robots-policy',
  'network-safety-block',
  'soft-error-interstitial',
  'not-applicable',
  'operator-excluded',
  'scanner-timeout',
  'tool-error',
  'browser-environment-error',
  'dependency-error',
  'anti-bot-rate-limit',
  'unstable-result',
  'unknown',
];

interface AttemptOverrides {
  checkId?: string;
  surfaceId?: string;
  startedAt?: string;
  executionProfile?: AttemptExecutionProfile;
  target?: CheckAttemptInput['target'];
  sourceArtifactDigest?: string;
}

function success(
  materialResultDigest: string,
  overrides: AttemptOverrides = {},
): CheckAttemptInput {
  const startedAt = new Date(overrides.startedAt ?? '2026-09-18T09:00:00.000Z');
  return {
    evidenceEpoch: EPOCH,
    scopeDigest: SCOPE_DIGEST,
    checkId: overrides.checkId ?? 'a11y.color-contrast',
    target: overrides.target ?? { kind: 'page', url: 'https://hotel-exemple.fr/chambres' },
    surfaceId: overrides.surfaceId ?? 'surface:desktop-baseline',
    startedAt,
    finishedAt: new Date(startedAt.getTime() + 1_000),
    executionProfile: overrides.executionProfile ?? 'normal',
    sourceArtifactDigest:
      overrides.sourceArtifactDigest ?? `sha256:artifact-${materialResultDigest}`,
    outcome: 'succeeded',
    materialResultDigest,
  };
}

function failure(
  failureClass: AttemptFailureClass,
  diagnosticCode: string,
  overrides: AttemptOverrides = {},
): CheckAttemptInput {
  const startedAt = new Date(overrides.startedAt ?? '2026-09-18T09:00:00.000Z');
  return {
    evidenceEpoch: EPOCH,
    scopeDigest: SCOPE_DIGEST,
    checkId: overrides.checkId ?? 'a11y.color-contrast',
    target: overrides.target ?? { kind: 'page', url: 'https://hotel-exemple.fr/chambres' },
    surfaceId: overrides.surfaceId ?? 'surface:desktop-baseline',
    startedAt,
    finishedAt: new Date(startedAt.getTime() + 1_000),
    executionProfile: overrides.executionProfile ?? 'normal',
    sourceArtifactDigest: null,
    outcome: 'failed',
    failureClass,
    diagnosticCode,
  };
}

/** Appends a run of attempts and hands back the ledger plus the records, so a
 *  test can name an attempt without knowing its derived ID. */
function ledgerOf(...inputs: readonly CheckAttemptInput[]): {
  ledger: CheckAttemptLedger;
  attempts: CheckAttempt[];
} {
  let ledger = createCheckAttemptLedger(EPOCH);
  const attempts: CheckAttempt[] = [];
  for (const input of inputs) {
    const appended = appendCheckAttempt(ledger, input);
    ledger = appended.ledger;
    attempts.push(appended.attempt);
  }
  return { ledger, attempts };
}

function accept(
  ledger: CheckAttemptLedger,
  attempt: CheckAttempt,
  reasonCode = 'sole-success',
): CheckAttemptLedger {
  return appendSelectionDecision(ledger, {
    attemptId: attempt.attemptId,
    state: 'accepted',
    decidedBy: 'deterministic',
    reasonCode,
    decidedAt: new Date('2026-09-18T10:00:00.000Z'),
  });
}

describe('recording an attempt', () => {
  it('derives the same identity for the same work on any machine', () => {
    const first = ledgerOf(success('result-a')).attempts[0];
    const second = ledgerOf(success('result-a')).attempts[0];

    expect(first?.attemptId).toMatch(/^attempt:[0-9a-f]{16}$/u);
    expect(first?.attemptId).toBe(second?.attemptId);
  });

  it('refuses the same attempt twice, so the decision fold stays unambiguous', () => {
    const { ledger } = ledgerOf(success('result-a'));
    expect(() => appendCheckAttempt(ledger, success('result-a'))).toThrow(/already in the ledger/u);
  });

  it('refuses an attempt from another evidence epoch', () => {
    const ledger = createCheckAttemptLedger(EPOCH);
    expect(() =>
      appendCheckAttempt(ledger, { ...success('result-a'), evidenceEpoch: EPOCH + 1 }),
    ).toThrow(/epoch/u);
  });

  it('refuses an attempt that finished before it started', () => {
    const ledger = createCheckAttemptLedger(EPOCH);
    const input = success('result-a');
    expect(() =>
      appendCheckAttempt(ledger, { ...input, finishedAt: new Date('2026-09-18T08:00:00.000Z') }),
    ).toThrow(/finished before it started/u);
  });

  it('keeps a stack trace out of the evidence graph', () => {
    const ledger = createCheckAttemptLedger(EPOCH);
    const trace = 'TypeError: cannot read x\n    at scanPage (/srv/odysseus/packages/scanner/x.ts)';

    expect(() => appendCheckAttempt(ledger, failure('tool-error', trace))).toThrow(
      /short lower-case code/u,
    );
    expect(() =>
      appendCheckAttempt(ledger, failure('tool-error', 'axe-worker-exit')),
    ).not.toThrow();
  });

  it('refuses to record an attempt the recovery policy said must not run', () => {
    const ledger = createCheckAttemptLedger(EPOCH);
    const overruled = {
      ...success('result-a'),
      executionProfile: 'stop-escalate' as unknown as AttemptExecutionProfile,
    };

    expect(() => appendCheckAttempt(ledger, overruled)).toThrow(/not an execution profile/u);
  });
});

describe('the ledger is append-only', () => {
  it('leaves the previous ledger untouched when an attempt is appended', () => {
    const empty = createCheckAttemptLedger(EPOCH);
    const { ledger } = ledgerOf(success('result-a'));

    expect(empty.attempts).toHaveLength(0);
    expect(ledger.attempts).toHaveLength(1);
  });

  it('cannot have an attempt pushed, removed, or rewritten through a cast', () => {
    const { ledger, attempts } = ledgerOf(success('result-a'));
    const attempt = attempts[0] as CheckAttempt;

    expect(() => (ledger.attempts as CheckAttempt[]).push(attempt)).toThrow(TypeError);
    expect(() => (ledger.attempts as CheckAttempt[]).pop()).toThrow(TypeError);
    expect(() => {
      (attempt as { checkId: string }).checkId = 'something-else';
    }).toThrow(TypeError);
  });

  it('starts an attempt as pending, because appending it is not accepting it', () => {
    const { ledger, attempts } = ledgerOf(success('result-a'));
    expect(selectionStateOf(ledger, attempts[0]?.attemptId ?? '')).toBe('pending');
  });

  it('supersedes an earlier acceptance by appending, leaving its record intact', () => {
    const { ledger, attempts } = ledgerOf(
      success('result-a'),
      success('result-b', { startedAt: '2026-09-18T09:05:00.000Z' }),
    );
    const [first, second] = attempts as [CheckAttempt, CheckAttempt];

    const accepted = accept(ledger, first);
    const replaced = accept(accepted, second, 'operator-resolved');

    expect(selectionStateOf(replaced, first.attemptId)).toBe('superseded');
    expect(selectionStateOf(replaced, second.attemptId)).toBe('accepted');
    // The original acceptance is still in the record: supersession explains
    // what changed rather than erasing that it was ever decided.
    expect(replaced.selections).toHaveLength(2);
    expect(replaced.selections[0]).toMatchObject({ attemptId: first.attemptId, state: 'accepted' });
    expect(acceptedAttemptFor(replaced, attemptSelectionKey(second))?.attemptId).toBe(
      second.attemptId,
    );
  });

  it('does not supersede an acceptance made for a different surface', () => {
    const { ledger, attempts } = ledgerOf(
      success('result-desktop'),
      success('result-mobile', { surfaceId: 'surface:mobile-baseline' }),
    );
    const [desktop, mobile] = attempts as [CheckAttempt, CheckAttempt];

    const both = accept(accept(ledger, desktop), mobile);

    expect(selectionStateOf(both, desktop.attemptId)).toBe('accepted');
    expect(selectionStateOf(both, mobile.attemptId)).toBe('accepted');
  });

  it('keeps a rejected attempt in the ledger as evidence that it happened', () => {
    const { ledger, attempts } = ledgerOf(success('result-a'));
    const attempt = attempts[0] as CheckAttempt;

    const rejected = appendSelectionDecision(ledger, {
      attemptId: attempt.attemptId,
      state: 'rejected',
      decidedBy: 'operator',
      reasonCode: 'stale-consent-state',
      decidedAt: new Date('2026-09-18T10:00:00.000Z'),
    });

    expect(selectionStateOf(rejected, attempt.attemptId)).toBe('rejected');
    expect(rejected.attempts).toHaveLength(1);
  });

  it('refuses a decision about an attempt that was never recorded', () => {
    const ledger = createCheckAttemptLedger(EPOCH);
    expect(() =>
      appendSelectionDecision(ledger, {
        attemptId: 'attempt:deadbeefdeadbeef',
        state: 'rejected',
        decidedBy: 'operator',
        reasonCode: 'invented',
        decidedAt: new Date(),
      }),
    ).toThrow(/unknown attempt/u);
  });

  it('refuses to accept a failed attempt as evidence', () => {
    const { ledger, attempts } = ledgerOf(failure('scanner-timeout', 'nav-timeout'));
    expect(() => accept(ledger, attempts[0] as CheckAttempt)).toThrow(/cannot accept failed/u);
  });
});

describe('what a failure justifies next', () => {
  it('never retries a definitive site answer, whatever a generic status says', () => {
    expect(isRetryableFailureClass('site-http-state')).toBe(false);
    expect(nextExecutionProfile('site-http-state', 'normal')).toEqual({
      retryable: false,
      nextProfile: 'stop-escalate',
      reasonCode: 'terminal-site-answer',
    });
  });

  it('never retries a robots or network-safety refusal, which no retry could change', () => {
    for (const refusal of ['robots-policy', 'network-safety-block', 'operator-excluded'] as const) {
      expect(nextExecutionProfile(refusal, 'normal')).toMatchObject({
        retryable: false,
        nextProfile: 'stop-escalate',
        reasonCode: 'policy-refusal',
      });
    }
  });

  it('allows one isolated retry for a rate limit or bot wall before escalating', () => {
    expect(nextExecutionProfile('anti-bot-rate-limit', 'normal')).toMatchObject({
      retryable: true,
      nextProfile: 'isolated-retry',
      reasonCode: 'fresh-context',
    });
  });

  it('sends a timeout straight to a fresh process, since a clean context would not help', () => {
    expect(nextExecutionProfile('scanner-timeout', 'normal')).toEqual({
      retryable: true,
      nextProfile: 'diagnostic-retry',
      reasonCode: 'fresh-process',
    });
  });

  it('gives a tool error a fresh context before a fresh process', () => {
    expect(nextExecutionProfile('tool-error', 'normal').nextProfile).toBe('isolated-retry');
    expect(nextExecutionProfile('tool-error', 'isolated-retry').nextProfile).toBe(
      'diagnostic-retry',
    );
  });

  it('sends a contradiction to the diagnostic profile, then stops', () => {
    expect(nextExecutionProfile('unstable-result', 'isolated-retry').nextProfile).toBe(
      'diagnostic-retry',
    );
    expect(nextExecutionProfile('unstable-result', 'diagnostic-retry')).toMatchObject({
      retryable: false,
      reasonCode: 'recovery-exhausted',
    });
  });

  it('gives a soft-error interstitial exactly one fresh context and no more', () => {
    expect(nextExecutionProfile('soft-error-interstitial', 'normal').nextProfile).toBe(
      'isolated-retry',
    );
    expect(nextExecutionProfile('soft-error-interstitial', 'isolated-retry').retryable).toBe(false);
  });

  it('escalates an exhausted ladder rather than dropping back to the normal profile', () => {
    for (const failureClass of EVERY_FAILURE_CLASS) {
      const decision = nextExecutionProfile(failureClass, 'diagnostic-retry');
      expect(decision.nextProfile).toBe('stop-escalate');
      expect(decision.retryable).toBe(false);
    }
  });

  it('answers for every failure class, so no caller has to invent a rule', () => {
    for (const failureClass of EVERY_FAILURE_CLASS) {
      const decision = nextExecutionProfile(failureClass, 'normal');
      expect(decision.retryable).toBe(decision.nextProfile !== 'stop-escalate');
    }
  });

  it('tells a missing page apart from a throttled one before either reaches the ladder', () => {
    expect(failureClassForHttpStatus(404)).toBe('site-http-state');
    expect(failureClassForHttpStatus(403)).toBe('site-http-state');
    expect(failureClassForHttpStatus(429)).toBe('anti-bot-rate-limit');
    expect(nextExecutionProfile(failureClassForHttpStatus(404), 'normal').retryable).toBe(false);
  });

  it('retries a momentarily broken origin rather than recording the page as absent', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(failureClassForHttpStatus(status)).toBe('origin-transient-error');
      expect(nextExecutionProfile(failureClassForHttpStatus(status), 'normal').retryable).toBe(
        true,
      );
    }
  });

  it('keeps the 5xx statuses that are settled answers terminal', () => {
    // 501 and 505 describe the request, not the server's health, so asking
    // again gets the same answer and costs the site another request.
    expect(failureClassForHttpStatus(501)).toBe('site-http-state');
    expect(failureClassForHttpStatus(505)).toBe('site-http-state');
    expect(nextExecutionProfile(failureClassForHttpStatus(501), 'normal').retryable).toBe(false);
  });

  it('bounds the transient-origin ladder so a permanently broken host still ends', () => {
    expect(nextExecutionProfile('origin-transient-error', 'diagnostic-retry')).toEqual({
      retryable: false,
      nextProfile: 'stop-escalate',
      reasonCode: 'recovery-exhausted',
    });
  });

  it('refuses to classify a status the site answered successfully', () => {
    expect(() => failureClassForHttpStatus(200)).toThrow(/not a failure/u);
  });
});

describe('resolving one check against one target', () => {
  it('accepts a sole success', () => {
    const { attempts } = ledgerOf(success('result-a'));
    expect(resolveAttemptSet(attempts)).toMatchObject({
      kind: 'accepted',
      reasonCode: 'sole-success',
    });
  });

  it('picks the same agreeing success whatever order the attempts arrive in', () => {
    const { attempts } = ledgerOf(
      success('agreed', { startedAt: '2026-09-18T09:00:00.000Z' }),
      success('agreed', { startedAt: '2026-09-18T09:05:00.000Z' }),
    );
    const [first] = attempts as [CheckAttempt, CheckAttempt];

    const forwards = resolveAttemptSet(attempts);
    const backwards = resolveAttemptSet([...attempts].reverse());

    expect(forwards).toEqual(backwards);
    expect(forwards).toMatchObject({
      kind: 'accepted',
      attempt: { attemptId: first.attemptId },
      reasonCode: 'agreeing-successes',
    });
  });

  it('refuses to pick when two successes materially disagree', () => {
    const { attempts } = ledgerOf(
      success('with-consent-banner'),
      success('without-consent-banner', { startedAt: '2026-09-18T09:05:00.000Z' }),
    );

    const resolution = resolveAttemptSet(attempts);

    expect(resolution.kind).toBe('unstable-result');
    // No attempt is offered at all: the caller has nothing convenient to take.
    expect(resolution).not.toHaveProperty('attempt');
    if (resolution.kind === 'unstable-result') {
      expect(resolution.attemptIds).toHaveLength(2);
      expect(resolution.materialResultDigests).toEqual([
        'with-consent-banner',
        'without-consent-banner',
      ]);
    }
  });

  it('does not call a re-capture unstable when the result is the same', () => {
    // Two attempts read different acquisition artifacts, as any honest retry
    // does, and reach the same material result.
    const { attempts } = ledgerOf(
      success('agreed', { sourceArtifactDigest: 'sha256:capture-one' }),
      success('agreed', {
        startedAt: '2026-09-18T09:05:00.000Z',
        sourceArtifactDigest: 'sha256:capture-two',
      }),
    );
    const [first, second] = attempts as [CheckAttempt, CheckAttempt];

    expect(first.sourceArtifactDigest).not.toBe(second.sourceArtifactDigest);
    expect(resolveAttemptSet(attempts).kind).toBe('accepted');
  });

  it('names the governing failure rather than the last one when all attempts failed', () => {
    const { attempts } = ledgerOf(
      failure('scanner-timeout', 'nav-timeout'),
      failure('robots-policy', 'disallowed-path', { startedAt: '2026-09-18T09:05:00.000Z' }),
    );

    expect(resolveAttemptSet(attempts)).toMatchObject({
      kind: 'no-evidence',
      failureClass: 'robots-policy',
    });
  });

  it('tells never attempted apart from attempted and failed', () => {
    expect(resolveAttemptSet([]).kind).toBe('no-attempts');
    expect(resolveAttemptSet(ledgerOf(failure('unknown', 'unclassified')).attempts).kind).toBe(
      'no-evidence',
    );
  });

  it('refuses to resolve a set that spans more than one target', () => {
    const { attempts } = ledgerOf(
      success('result-a'),
      success('result-b', { target: { kind: 'page', url: 'https://hotel-exemple.fr/tarifs' } }),
    );

    expect(() => resolveAttemptSet(attempts)).toThrow(/spans 2 selection keys/u);
  });

  it('lets an operator rejection make a contradictory set coherent again, on the record', () => {
    const { ledger, attempts } = ledgerOf(
      success('with-consent-banner'),
      success('without-consent-banner', { startedAt: '2026-09-18T09:05:00.000Z' }),
    );
    const [stale, current] = attempts as [CheckAttempt, CheckAttempt];
    const key = attemptSelectionKey(current);

    expect(resolveSelectionForKey(ledger, key).kind).toBe('unstable-result');

    const resolved = appendSelectionDecision(ledger, {
      attemptId: stale.attemptId,
      state: 'rejected',
      decidedBy: 'operator',
      reasonCode: 'pre-consent-state',
      decidedAt: new Date('2026-09-18T10:00:00.000Z'),
    });

    expect(resolveSelectionForKey(resolved, key)).toMatchObject({
      kind: 'accepted',
      attempt: { attemptId: current.attemptId },
    });
  });

  it('reports no accepted evidence until a decision says so', () => {
    const { ledger, attempts } = ledgerOf(success('result-a'));
    const key = attemptSelectionKey(attempts[0] as CheckAttempt);

    expect(acceptedAttemptFor(ledger, key)).toBeNull();
    expect(acceptedAttemptFor(accept(ledger, attempts[0] as CheckAttempt), key)).not.toBeNull();
  });
});

describe('the ledger digest', () => {
  it('changes when a different attempt is accepted, so a raw snapshot cannot reuse a digest', () => {
    const { ledger, attempts } = ledgerOf(
      success('result-a'),
      success('result-b', { startedAt: '2026-09-18T09:05:00.000Z' }),
    );
    const [first, second] = attempts as [CheckAttempt, CheckAttempt];

    const acceptFirst = checkAttemptLedgerDigest(accept(ledger, first));
    const acceptSecond = checkAttemptLedgerDigest(accept(ledger, second));

    expect(acceptFirst).not.toBe(acceptSecond);
    expect(acceptFirst).not.toBe(checkAttemptLedgerDigest(ledger));
  });

  it('distinguishes an acceptance reached by supersession from the same acceptance made directly', () => {
    const { ledger, attempts } = ledgerOf(
      success('result-a'),
      success('result-b', { startedAt: '2026-09-18T09:05:00.000Z' }),
    );
    const [first, second] = attempts as [CheckAttempt, CheckAttempt];

    const directly = accept(ledger, second);
    const afterSupersession = accept(accept(ledger, first), second);

    expect(acceptedAttemptFor(directly, attemptSelectionKey(second))?.attemptId).toBe(
      acceptedAttemptFor(afterSupersession, attemptSelectionKey(second))?.attemptId,
    );
    expect(checkAttemptLedgerDigest(directly)).not.toBe(
      checkAttemptLedgerDigest(afterSupersession),
    );
  });

  it('covers failed attempts that were never accepted', () => {
    const withoutFailure = ledgerOf(success('result-a')).ledger;
    const withFailure = ledgerOf(
      success('result-a'),
      failure('scanner-timeout', 'nav-timeout', { startedAt: '2026-09-18T09:05:00.000Z' }),
    ).ledger;

    expect(checkAttemptLedgerDigest(withFailure)).not.toBe(
      checkAttemptLedgerDigest(withoutFailure),
    );
  });

  it('is stable for the same content, so two machines agree on one evidence identity', () => {
    const left = ledgerOf(success('result-a'), failure('tool-error', 'axe-worker-exit')).ledger;
    const right = ledgerOf(success('result-a'), failure('tool-error', 'axe-worker-exit')).ledger;

    expect(checkAttemptLedgerDigest(left)).toBe(checkAttemptLedgerDigest(right));
  });
});
