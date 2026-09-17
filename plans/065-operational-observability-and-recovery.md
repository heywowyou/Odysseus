# Plan 065: Operational observability, diagnostics and recovery

> **Executor instructions**: make routine failures diagnosable and recoverable from the application without turning telemetry into a confidential-content store. Persist the minimum typed operational facts required for correctness, recovery and operator understanding; keep raw stacks/provider internals in protected logs. Do not make Sentry or any external tracing service load-bearing.

## Status

- **Priority**: P1
- **Effort**: L
- **Depends on**: Plans 060 and 061; integrates Plan-059 evidence attempts and Plan-058 quality runs.
- **Coordinates with**: 062, 063 and 066.
- **Category**: observability, error handling, recovery, health, deployment operations, fault injection.
- **Final review state**: repository-wide design review plus repeated convergence passes; the final fresh pass produced no additional substantive architectural change. Freeze speculative design and let implementation/evaluation evidence drive later amendments.

---

# 1. Purpose

The operator/developer must be able to diagnose and recover:

- stuck scan;
- hung browser;
- exhausted retry;
- model outage/rate limit;
- model schema failure;
- normalization/consistency mismatch;
- PDF render failure;
- deterministic PDF QA failure;
- multimodal visual rejection;
- artifact-store read/write/read-back failure;
- queue/lease deadlock;
- stale lease;
- worker crash;
- site deployment/temporal incoherence;
- rate limiting;
- external provider failure.

Today the app has Pino logs, a metadata-only telemetry pilot, request IDs,
coarse job error strings and useful UI error boundaries. That is not enough for
the 058/059 recovery model, and raw log archaeology should not be required for
routine failures.

---

# 2. Binding decisions

1. **Operational state required to recover is first-party durable state.** External telemetry is optional.
2. **Operator explanation and developer diagnostics are separate views of the same typed issue.**
3. **No prompts, model output, raw page text, report prose, contact data or arbitrary website snippets are added to telemetry by default.**
4. **Failures use closed reason codes plus diagnostic references; raw exception strings do not drive UI behavior.**
5. **Known automatic retry/wait is not surfaced as an error requiring human action.**
6. **Every terminal/nonautomatic failure records what work was preserved and the smallest safe recovery class.**
7. **Stuck-work detection is based on durable heartbeat/lease/progress timestamps, not elapsed wall time guesses in React.**
8. **Health checks distinguish service readiness from a particular job's health.**
9. **Do not automatically probe expensive/external providers merely to paint a green dashboard.** Use configuration/preflight and recent actual-call state where appropriate.
10. **The existing metadata-only telemetry policy remains the privacy ceiling unless explicitly revised.**
11. **No SSH/log archaeology for normal retry, lease recovery or artifact-repair choices.**
12. **Developer detail remains available when routine recovery is insufficient.**
13. **Diagnostics are not a readiness authority.** An OperationalIssue explains/indexes a condition owned by a Job, Plan-059 evidence run, Plan-058 quality run, artifact operation or outreach state. Its presence/absence never by itself makes evidence/report work ready, failed or current.

---

# 3. Current-state findings

## 3.1 Health is too coarse for quality operations

`packages/interface/src/routes/health.ts` currently reflects database/queue
readiness. It does not tell the operator whether a particular evidence/report
run is stuck, whether artifact storage is failing, or whether production
browser isolation/preflight is valid.

Keep liveness/readiness small; add a separate authenticated operator system
status rather than bloating public health.

## 3.2 Errors are still mostly free-form strings

Job `error`, report in-memory failure state and route `sendError` strings
carry useful detail but create:

- brittle browser classification;
- untranslated/raw messages;
- no stable recovery taxonomy;
- no durable attempt-level diagnostic identity.

061 introduces typed command/problem responses; this plan extends that to
background work.

## 3.3 Current telemetry correctly avoids confidential content

`docs/rules/telemetry-rules.md` deliberately exports coarse metadata only and
defaults to a null sink. Preserve this. Do not solve the new quality pipelines
by shipping prompts, report text or scanned snippets to a hosted trace product.

---

# 4. Durable operational issue contract

Each owning run/attempt may emit a typed issue record or equivalent durable
embedded issue. Do not create an append-only global event log merely for
fashion. A dedicated issue collection, if used, is a repairable diagnostic
index: owner state remains authoritative, and losing/rebuilding the index must
not change workflow correctness.

Minimum contract:

```ts
type OperationalIssue = {
  issueId: string;
  owner: 'legacy-job' | 'audit-evidence' | 'report-quality' | 'artifact' | 'outreach';
  subject: {
    prospectId?: string;
    auditId?: string;
    workId?: string;
    evidenceEpoch?: string;
    qualityRunId?: string;
    attemptId?: string;
  };
  stage: string;                 // closed owner-specific code
  code: string;                  // closed diagnostic/recovery code
  category:
    | 'site'
    | 'network-policy'
    | 'scanner'
    | 'normalization'
    | 'provider'
    | 'report-quality'
    | 'storage'
    | 'deployment'
    | 'operator-input'
    | 'internal';
  state: 'active' | 'resolved' | 'superseded';
  severity: 'info' | 'warning' | 'error' | 'fatal';
  retryability: 'automatic' | 'operator' | 'not-retryable' | 'new-epoch-required';
  attentionRequired: boolean;
  occurredAt: string;
  lastObservedAt: string;
  nextRetryAt?: string;
  preserved: PreservedWorkSummary;
  diagnosticId: string;
  safeMetadata?: Record<string, primitive>;
};
```

Exact persistence may be an owning-run subdocument or dedicated bounded
collection depending cardinality/query needs. The product invariant is typed,
queryable and durable.

Never put arbitrary exception objects in `safeMetadata`.

---

# 5. Reason-code taxonomy

Create closed codes at the owner that knows the failure.

Examples:

## Acquisition/evidence

```text
dns-resolution-failed
unsafe-network-target
robots-fetch-unavailable
robots-disallowed
navigation-timeout
browser-crash
browser-isolation-preflight-failed
rate-limited
anti-bot-response
readiness-timeout
check-timeout
performance-provider-unavailable
inventory-gap
coverage-incomplete
temporal-incoherence
normalization-consistency-failed
evidence-readback-mismatch
operator-scope-decision-required
```

## Report

```text
model-provider-rate-limited
model-provider-unavailable
model-schema-invalid
content-review-rejected
deterministic-content-gate-failed
render-failed
render-lint-failed
pdf-readback-mismatch
pdf-qa-failed
visual-qa-rejected
bilingual-parity-failed
final-arbitration-rejected
quality-iteration-limit
promotion-readback-failed
active-pointer-conflict
```

The final implementation must derive its exact list from 058/059 code; this
plan forbids collapsing unrelated failures into one `generation-failed`.

---

# 6. Preserved-work summary

Every nonautomatic stop exposes what remains safe to reuse.

Examples:

```text
scan checkpoint: 317 pages preserved
evidence: 9,812/9,814 required checks accepted
ApprovedAuditEvidence: available
FR candidate: quality-clean and immutable
EN candidate: requires repair
active client bundle: unchanged
```

The summary is derived from authoritative artifact/run state, not handwritten
error text.

It drives recovery guidance but never changes the underlying readiness state.

---

# 7. Recovery classes

Each typed issue maps deterministically to one recovery class:

```text
automatic-retry
retry-attempt
retry-stage
resume-run
resolve-operator-input
start-new-evidence-epoch
retry-promotion
configuration/deployment-fix
no-safe-retry
```

Examples:

- provider 429 → automatic retry/backoff until policy exhaustion;
- one check timeout → retry that attempt;
- stale report promotion pointer → re-read state/retry promotion, not rerender;
- evidence temporal incoherence → new epoch if 059 requires it;
- PDF render-lint defect → targeted report repair/rerender, never rescan;
- artifact read-back mismatch → repair/rewrite exact artifact if source exists;
- unsafe network target → no bypass; operator may correct target/scope.

The UI never invents a recovery class.

---

# 8. Operator-facing diagnostics

## 8.1 Failure card

Primary content:

```text
What failed
What is still safe/preserved
Whether Odysseus will retry
What Jules needs to do, if anything
One primary safe action
```

Secondary “Technical details”:

- diagnostic ID;
- run/attempt/stage;
- typed code/category;
- timestamps;
- retry count/next retry;
- build/tool/provider identifiers that are safe;
- relevant object digest IDs where useful.

No stack trace/page text/prompt/report body in primary or copyable default
diagnostics.

## 8.2 Attention integration

Only issues with `attentionRequired=true` create an À traiter item.

Automatic retry, expected host pacing and transient provider waiting remain on
the run detail, not the inbox.

If a condition resolves automatically before the operator opens it, the
attention projection disappears; no stale “notification cleanup” ceremony.

---

# 9. Developer diagnostics and logs

Use structured Pino fields consistently:

```text
requestId
diagnosticId
workId/jobId
auditId
prospectId where needed and policy-safe
evidenceEpoch
qualityRunId
attemptId
stage
issueCode
buildId
provider/model metadata allowed by LLM rules
duration/retry count
```

Do not log:

- session/auth secrets;
- signed/public artifact URLs with credentials;
- prompts/responses;
- report prose;
- arbitrary raw website text/HTML;
- contact email/phone unless an existing explicitly approved log requires it;
- scanner storage/session secrets.

Stack traces remain server logs for internal exceptions, correlated by
`diagnosticId`.

Sentry, when enabled, receives only fields allowed by telemetry rules. A Sentry
outage never changes job/recovery behavior.

---

# 10. Request/command correlation

Keep existing request IDs and propagate them into:

- command audit record;
- newly created work/run reference;
- operational issue when the command immediately fails.

Background work gets its own diagnostic/work IDs and preserves parent command
correlation where useful.

The dashboard error boundary's incident ID remains useful for render failures;
when a server request caused the failure, display both client incident and
server diagnostic ID without pretending they are the same thing.

---

# 11. Stuck-work detection

A run is not “stuck” because it has run longer than average.

Use owner-specific durable liveness:

- current lease expiry/renewal;
- last heartbeat/progress timestamp;
- expected backoff window;
- current external wait;
- worker ownership token/epoch.

States:

```text
healthy-active
healthy-waiting
lease-expired-recoverable
ownership-ambiguous
terminal
```

If a lease expires:

- owning state machine decides whether it can reacquire/resume/retry;
- stale worker is unable to promote/write current state;
- operator sees intervention only if automatic recovery fails or ambiguity
  remains.

No manual “mark complete” button.

---

# 12. Authenticated operator system status

Add a small authenticated status surface, reachable from Tools or technical
details, not a new primary nav item.

It may show:

- deployed build ID/time;
- database readiness;
- queue worker readiness/concurrency;
- count of active/expired leases;
- artifact store configuration + recent read/write/read-back health from real
  work or a safe lightweight check;
- browser isolation preflight status/fingerprint;
- configured model/provider aliases (not secrets) + most recent successful/error
  timestamp from real calls;
- last mailbox/opt-out reconciliation where relevant;
- current backup/restore-check metadata only if already produced by deployment
  tooling.

Do not send live third-party requests merely to turn this page green.

The public `/health` remains minimal and non-sensitive.

---

# 13. Routine recovery commands

Expose only recovery actions proven safe by 058/059/061 capability rules.

Examples:

- retry failed evidence unit;
- resume evidence repair;
- resolve operator scope/input;
- retry report stage/targeted repair;
- retry artifact promotion;
- cancel/supersede abandoned run;
- reclaim expired lease if the owning domain explicitly supports it.

No generic “Retry everything” control.

No “force success”.

No “ignore QA and publish”.

---

# 14. Deployment/restart observability

Current deployment intentionally blocks active running jobs by default.
Preserve that conservative default.

Before deploy, tooling should report:

- active queue jobs;
- active evidence leases;
- active report-quality leases;
- cancel-requested work;
- operator-attention blockers.

A forced deploy records a deployment event/build boundary so resumed work can
be correlated.

After restart:

- startup recovery logs and operator status identify what was requeued/resumed;
- expired/stale leases are reconciled;
- no active run is silently lost;
- no historical `needs-input` is reclassified as success.

The control room should not require SSH to learn that a run was recovered after
a deploy.

---

# 15. Artifact-store diagnostics

For content-addressed 058/059 artifacts:

- distinguish object write failure;
- object read failure;
- digest/read-back mismatch;
- pointer/CAS conflict;
- missing historical object;
- deletion/cleanup failure.

A missing optional diagnostic artifact is not treated like a missing approved
evidence root.

Archive/delete retains current failure ordering: if storage cleanup fails,
records needed to retry are preserved and the operator gets a typed cleanup
issue.

---

# 16. Privacy/redaction tests

Create canary fixtures containing:

- email addresses;
- phone numbers;
- session-token-like strings;
- query-string secrets;
- prompt-injection text;
- HTML/script;
- report prose marker;
- non-ASCII/bidi control characters.

Force failures at each layer and assert these markers do not appear in:

- telemetry events;
- operator problem envelopes unless the value is an explicitly required safe
  display field;
- default copied diagnostics;
- system status;
- structured log metadata where policy forbids them.

Raw protected logs may contain stack function/file names, not the secret canary
values.

---

# 17. Fault-injection matrix

| Fault | Expected recovery/diagnostic behavior |
| --- | --- |
| DNS timeout | typed network issue; retry policy; no raw resolver dump to UI |
| robots fetch unavailable | policy-specific 059 state; no silent bypass beyond declared rule |
| Chromium crash | attempt failed; browser context replaced; accepted evidence preserved |
| worker SIGKILL | lease/checkpoint recovery; stale writer blocked |
| model 429 | backoff/retry state; no attention until exhausted |
| model malformed schema | typed schema issue; targeted retry according to 058 |
| normalization invariant mismatch | evidence cannot approve; diagnostic names invariant code |
| PDF `[object Object]` render lint | report candidate blocked; offending semantic address when known |
| visual QA reject | candidate private; issue summary; targeted repair |
| object-store timeout | source artifact preserved; retry store step |
| read-back digest mismatch | fail closed; no promotion |
| active-pointer CAS conflict | refresh/reconcile; no partial language activation |
| database transient failure during command | typed retryable request failure; no client-assumed mutation |
| queue lease expiry | automatic safe recovery or needs-attention, never duplicate current owner |
| deploy during forced active work | build boundary visible; durable owner resumes/reconciles |

---

# 18. Verification matrix

## Unit

- every issue code maps to category/retryability/attention/recovery;
- no issue with automatic recovery creates attention;
- preserved-work derivation for mixed success/failure states;
- stuck-state derivation respects backoff windows/leases.

## Store

- active/resolved/superseded issue lifecycle;
- issue deduplication/coalescing where repeated retries would otherwise spam;
- diagnostic IDs unique;
- query active issues by subject/work efficiently.

## API

- safe problem envelope;
- authenticated system-status only;
- public health omits internal details;
- technical diagnostics never require raw stack for routine recovery.

## Integration/fault injection

Cover every row in section 17 across:

- restart;
- retry;
- cancellation;
- supersession;
- promotion;
- artifact corruption.

## Privacy

Canary redaction tests from section 16.

## Operator E2E

From À traiter, open a simulated stuck/failing run, understand preserved work,
take the one safe recovery action, and see the issue resolve without opening a
terminal.

---

# 19. Fail-closed conditions

Do not allow recovery/promotion when:

- issue code/recovery class is unknown for a correctness-critical state;
- lease ownership is ambiguous;
- preserved artifact digest cannot be verified;
- diagnostic state says storage read-back mismatch;
- a retry would violate 059 politeness/network policy;
- a report retry would bypass 058's dependency DAG;
- an operator action would need raw hidden state not represented by a capability.

When diagnostics themselves fail to persist, the owning operation still fails
according to its correctness rules; missing observability must never turn a
failure into success.

---

# 20. Explicitly rejected alternatives

- Shipping prompts/report text to hosted tracing for convenience.
- Making Sentry required for recovery.
- A giant global event-sourcing platform.
- One free-form `error: string` taxonomy.
- “Retry everything”.
- Manual “mark job complete”.
- Treating long runtime as proof a job is hung.
- Constant active probes of model/external providers for a status page.
- Adding a primary “Operations” nav destination.
- Forcing Jules to SSH for expired lease/retryable routine failures.
- Logging secrets/PII to make diagnostics easier.

---

# 21. Definition of done

Plan 065 is implemented when:

1. every 058/059/legacy nonautomatic failure surfaced to the operator has a typed durable issue/reason;
2. operator UI can state what failed, what was preserved, retry behavior and next safe action without parsing exception text;
3. automatic waiting/retry does not pollute À traiter;
4. stuck/expired ownership is detected from durable leases/heartbeats rather than guessed runtime;
5. routine retry/resume/promotion recovery is executable from the app when domain policy permits it;
6. request/work/diagnostic IDs correlate UI, logs and runs;
7. authenticated system status exposes useful safe operational state while public health stays minimal;
8. telemetry remains metadata-only and optional;
9. fault injection covers scanner, provider, normalization, renderer, visual QA, storage, DB, lease and deployment failures;
10. privacy canaries prove confidential content does not leak into telemetry/default diagnostics;
11. forced restart/deploy leaves a comprehensible recovery trail;
12. a routine overnight failure can be understood and recovered without SSH/log archaeology.
