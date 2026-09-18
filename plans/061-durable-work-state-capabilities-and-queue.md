# Plan 061: Durable work state, action capabilities and scan queue

> **Executor instructions**: make long-running work and command safety truthful across scans, Plan-059 evidence recovery, Plan-058 report quality runs, cancellation, restart and stale browser tabs. Do not replace the durable state machines defined by 058/059. This plan creates a common operator projection and command protocol over them, and upgrades the legacy job queue where it is still the authority.

## Status

- **Priority**: P1
- **Effort**: XL
- **Depends on**: Plan 060; implemented Plans 035, 050, 055 and 056; Plan-059 evidence run/epoch semantics; Plan-058 quality-run/lease semantics.
- **Coordinates with**: 062, 063 and 065.
- **Category**: jobs, queue, progress, capabilities, concurrency, cancellation, crash/restart.
- **Final review state**: repository-wide design review plus repeated convergence passes; the final fresh pass produced no additional substantive architectural change. Freeze speculative design and let implementation/evaluation evidence drive later amendments.

---

# 1. Purpose

The operator must be able to distinguish:

```text
queued
running normally
waiting on a known condition
retrying automatically
blocked
needs operator action
cancel requested
failed
completed
cancelled
superseded
```

and must see only actions that are safe in the current authoritative state.

Today the legacy queue provides durable `queued/running/complete/failed/cancelled/needs-input` rows and useful checkpoint/restart behavior, but richer meaning is reconstructed in pages, report production is partly in-memory, queue order is implicit `createdAt`, and a cancelled job can be marked terminal before its runner has actually let go.

This plan closes those gaps without creating a generic workflow engine.

---

# 2. Current implementation seams

## 2.1 Legacy job authority

`packages/store/src/schemas/job.schema.ts` and `packages/store/src/jobs.ts`
own the persistent legacy job row and FIFO claim.

`packages/interface/src/queue/job-queue.ts` owns:

- process-local worker concurrency;
- cancellation tokens;
- the in-flight set;
- startup recovery of orphaned `running` jobs;
- dispatch to scan/outreach runners.

Plan 035 already makes Full-scan checkpoints resumable. Preserve that.

## 2.2 Existing safety guards

- scan launch has persisted active-slot/host/prospect guards;
- queued-job deletion has a conditional race-safe path;
- archive/delete consult persisted unfinished work plus process-local in-flight state;
- report production has a shared in-memory lock.

These are good invariants but not one operator-readable contract.

## 2.3 Existing progress is useful but not authoritative enough

The current scan job stores phase/progress, and the dashboard correctly uses an
indeterminate bar for phases with no real denominator. Keep that principle.

Do not preserve:

- browser parsing of raw error messages to choose recovery;
- a phase tuple duplicated into UI semantics;
- a generic “running” label while the producer knows it is waiting/retrying;
- marking cancellation complete before the writer has reached a safe boundary.

---

# 3. Binding decisions

1. **058/059 runs remain their own durable authorities.** Do not copy their leases, epochs, attempts or candidate state into legacy `Job` rows merely to make the dashboard easier.
2. **One operator work-state vocabulary projects all run types.** A projector maps each owning domain to the common state; it does not mutate domain truth.
3. **Legacy `Job` continues to own Quick Check and existing queue-backed work until deliberately migrated.**
4. **Full-scan acquisition may keep a queue entry as its scheduling envelope, but Plan 059 owns evidence-stage correctness once the evidence epoch exists.**
5. **Report production becomes durable through Plan 058; the current detached Promise + in-memory report state/lock is retired after the Plan-058 quality-run path is promoted.**
6. **Queue order is explicit and durable.** Reboot/deploy must not silently reorder an overnight batch.
7. **Use one simple ordered queue, not priority classes.** The operator may reorder waiting scans; active work is not reorderable.
8. **Cancellation is two-step when work may still be writing.** “Cancel requested” is distinct from “Cancelled”.
9. **Automatic waiting/retrying does not create human attention.**
10. **Action availability is server-derived and command-time revalidated.**
11. **A failed run never decides whether preserved artifacts are usable.**
12. **No estimate is displayed unless the producer has a defensible basis.**

---

# 4. Common operator work projection

Define a closed serialized projection for any long-running work:

```ts
type OperatorWorkState =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'retrying'
  | 'blocked'
  | 'needs-attention'
  | 'cancel-requested'
  | 'failed'
  | 'completed'
  | 'cancelled'
  | 'superseded';

type OperatorWorkView = {
  workId: string;
  owner:
    | 'legacy-job'
    | 'audit-evidence'
    | 'report-quality'
    | 'outreach';
  purpose: string;             // closed code
  state: OperatorWorkState;
  stage?: string;              // closed owner-specific code
  subject: { prospectId?: string; auditId?: string };
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  progress?: OperatorProgress;
  wait?: OperatorWait;
  issue?: OperatorIssueSummary;
  preserved?: PreservedWorkSummary;
  attempt?: { current: number; max?: number };
};
```

The actual TypeScript location follows the interface/store boundary selected
during implementation. The shape and semantics are binding.

## 4.1 Progress

`OperatorProgress` is one of:

```text
bounded-count(current, total, unit)
bounded-percent(value)              # only if the producer owns a real %
indeterminate(activityCode)
none
```

A pipeline-wide fake percent is forbidden.

Examples of defensible metrics:

- queue position;
- discovered pages;
- content pages checked / known target;
- attempts complete / bounded set;
- PDF pages visually reviewed / candidate page count.

Examples that remain indeterminate:

- an uncapped discovery frontier before fixed point;
- model reasoning time;
- provider backoff with no reliable completion prediction.

## 4.2 Wait/retry

Use typed reasons:

```text
host-pacing
rate-limit-backoff
provider-backoff
lease-reacquire
scheduled-retry
resource-capacity
external-dependency
```

A known retry time may be displayed. Do not invent an ETA from elapsed time.

## 4.3 Blocking category

`blocked` means automatic continuation is currently impossible but may not
require the operator. `needs-attention` is reserved for a human decision.

Reason categories include:

```text
site
network-policy
scanner
provider
storage
evidence-policy
report-quality
operator-input
deployment
unknown
```

The closed reason code, not category alone, drives recovery copy.

---

# 5. Mapping existing and new owners

## 5.1 Legacy jobs

Compatibility mapping:

| Legacy state | Operator projection |
| --- | --- |
| `queued` | `queued` |
| `running` | `running`, unless durable stage metadata proves waiting/retrying/cancel-requested |
| `complete` | `completed` |
| `failed` | `failed` |
| `needs-input` | `needs-attention` |
| `cancelled` | `cancelled` for historical rows; new runners use acknowledged cancellation |

Do not rewrite historical rows to pretend they had richer states.

## 5.2 Plan-059 evidence work

Project from its evidence epoch/attempt/repair authority:

- discovery/check execution → running;
- scheduled retry/backoff → waiting/retrying;
- operator resolution required → needs-attention;
- approved evidence → completed for the evidence work item;
- superseded evidence epoch → superseded.

Evidence readiness itself stays a separate Plan-059 projection.

## 5.3 Plan-058 report work

Project from `ReportQualityRun`:

- planning/writing/review/render/parity/final arbitration → running;
- provider backoff → waiting/retrying;
- iteration ceiling or human resolution → needs-attention;
- quality-approved and awaiting possible operator approval → **work completed**. It becomes a human-attention item only when client delivery/review has actually been requested or another current workflow condition genuinely requires the decision; prospecting scans must not flood À traiter merely because their private bundle is ready;
- cancelled/failed/superseded map directly.

Do not keep a report worker “running” merely because the human approval is pending.

---

# 6. Durable queue order

## 6.1 Replace implicit `createdAt` ordering

Add an explicit sortable order for waiting queue-backed jobs.

Requirements:

- total deterministic order;
- stable across process restart/deploy;
- unique enough for concurrent inserts;
- reordering does not rewrite every historical job;
- only `queued` jobs participate;
- claim uses the explicit order, then deterministic ID tie-break.

A monotonic queue sequence plus bounded re-ranking is acceptable. A fractional
rank is also acceptable if implementation proves deterministic collision
handling. Do not add “P0/P1/P2” priority semantics.

## 6.2 Queue revision

Maintain a queue-level revision/token for reorder commands.

```text
GET queue → rows + queueRevision
POST reorder(expected queueRevision, ordered queued job ids or move command)
```

The server:

1. reloads current queued set;
2. refuses if membership/order-relevant state changed;
3. applies the reorder atomically enough that two tabs cannot silently overwrite each other;
4. returns the new revision/order.

A stale reorder returns typed `state-changed`; the client refreshes.

## 6.3 Batch enqueue

Keep the existing batch-review flow and shared advanced options.

On submission:

- each accepted site gets an ordinary queue item;
- result returns queued/skipped/rejected with typed reason codes;
- accepted rows receive explicit queue order in the reviewed order;
- an active duplicate remains skipped/refused, never silently duplicated;
- a partial batch result is success-with-results, not all-or-nothing fiction.

Maximum batch size may stay bounded. This plan does not add recurring schedules.


## 6.4 Separate scanner capacity from downstream report quality

A Full scan is one product intent, but it does not mean one worker slot must remain occupied through every downstream report-quality step.

The scheduling boundary is:

```text
scan queue / scanner capacity
  scope → inventory → browser/check attempts → evidence repair
  → ApprovedAuditEvidence or evidence terminal attention/failure
        │
        └─ when ApprovedAuditEvidence exists
             → durable Plan-058 report-quality work
                on its own bounded execution lane
```

Rules:

- the scan queue owns scarce website-acquisition/browser capacity through the end of the Plan-059 evidence run;
- once evidence reaches a terminal approved/attention/failure state, scanner capacity can be released; for an approved result with report inputs available, **first persist a restart-safe downstream handoff** (an actual Plan-058 quality run or a narrow durable pending-execution envelope that owns scheduling only) so a crash cannot lose report production between evidence approval and worker pickup;
- preserving Plan 050's current Full-scan behavior, that durable handoff **automatically starts/queues the Plan-058 quality run when its report inputs are available**, without keeping the scan queue item active; automated quality approval may satisfy internal/outreach derivative readiness, but operator bundle approval remains the separate paid-client delivery gate;
- if a required report-only input is missing, the evidence work still completes and releases scanner capacity, the missing input becomes human attention, and supplying it starts/resumes Plan 058 from the stored ApprovedAuditEvidence — never a website rescan;
- report-quality execution has its own bounded concurrency/resource policy because model calls, PDF rendering and visual QA have different bottlenecks from crawling; any pending-execution envelope is only a restart-safe scheduler record and may not copy or decide Plan-058 quality state;
- the operator still sees one linked end-to-end audit story: “Evidence approved · report quality running” is truthful, while the scan queue can already advance;
- a report-quality failure never requeues the scan unless Plan 059 independently requires a new evidence epoch;
- if production topology initially has only one safe browser capacity for scanner and PDF rendering, the scheduler may serialize those browser tasks behind a shared resource semaphore, but it must not conflate their domain states or queue histories;
- restart/redeploy recovery treats the evidence owner and quality owner independently through their durable leases/epochs.

Do not create a second user-visible queue merely because there are two execution lanes. Audits shows the scan queue plus linked active work; audit detail shows the complete chain.

---

# 7. Cancellation contract

Current cancellation persists terminal `cancelled` before the runner is
necessarily finished. New work must become truthful.

## 7.1 States

```text
queued --cancel--> cancelled

running --request cancel--> cancel-requested
cancel-requested --safe boundary acknowledged--> cancelled
cancel-requested --terminal producer result wins safely--> completed/failed
```

For 058/059, revoking the current lease/epoch is part of cancellation authority;
late workers cannot promote/write as current.

## 7.2 Preservation

Cancellation response/UI states what remains:

- checkpoint/evidence attempts already persisted;
- ApprovedAuditEvidence if already created;
- quality candidates already immutable;
- active approved report unchanged.

Cancellation never deletes preserved work as a side effect.

Deletion/archive remains a separate command with its own capability.

## 7.3 Queue removal

Cancelling a queued job is immediate because no worker owns it. UI language may
say “Remove from queue”, but server semantics remain a cancellation of that job.

---

# 8. Action capability protocol

Plan 060 fixes the product shape. This plan implements command safety.

## 8.1 Capability response

```ts
type ActionCapability =
  | {
      state: 'available';
      stateToken: string;
      consequenceCode?: string;
    }
  | {
      state: 'blocked';
      stateToken: string;
      reasonCode: string;
      blockingRef?: { workId?: string; auditId?: string; prospectId?: string };
    };
```

Do not include localized prose.

## 8.2 Command protocol

Every state-sensitive command:

1. accepts the current `stateToken`;
2. validates syntax/auth/origin first;
3. reloads authoritative state;
4. recomputes capability;
5. verifies the token still commits to relevant state;
6. performs the conditional write/acquire;
7. returns the new snapshot/capability or a typed conflict.

A button being disabled is never a substitute for step 3-6.

## 8.3 Typed conflict

New/migrated command endpoints return a stable problem envelope:

```ts
{
  error: {
    code: 'state-changed' | 'action-blocked' | 'not-found' | ...;
    message: string;       // safe fallback, not UI authority
    diagnosticId?: string;
    retryable?: boolean;
    blockingRef?: {...};
  }
}
```

Migrate `dashboard/lib/api.ts` to parse both this envelope and the legacy
`{error:string}` during transition.

The dashboard maps `code` to exhaustive FR/EN copy.

---

# 9. Capability ownership and existing guard migration

Do not centralize all rules.

## 9.1 Scan launch / retry / cancel / reorder

Build on the existing scan launch guard and persistent active slot.

Capabilities must cover:

- archived/missing prospect;
- no valid public target;
- same-prospect active scan;
- host conflict/shared-vendor exception;
- current queue membership;
- active evidence repair/new epoch;
- cancellation ownership;
- 059 network/scope preconditions where applicable.

## 9.2 Archive/delete

Preserve Plan-055/056 safety:

- persisted unfinished jobs;
- process-local finishing work during the migration period;
- 058/059 durable leases once available;
- artifact cleanup order;
- storage failure keeps records retryable.

The capability says why blocked before click. The mutation rechecks.

## 9.3 Report commands

After 058 promotion:

- `generateReport` requires usable/current ApprovedAuditEvidence or approved legacy adapter;
- `requestReportCorrection` targets the current candidate/run;
- `approveReportBundle` requires exact current quality-approved bundle;
- `downloadActiveReport` requires an active promoted bundle;
- no command consults the old in-memory report lock as its final authority.

## 9.4 Prospect identity/manual audit inputs

Edits remain owned by their current domain. Do **not** globally lock mutable
prospect/report inputs merely because a quality run is active. For an edit that
changes a Plan-058 input, the domain writer accepts the correction and the
dependent quality run/candidate is atomically invalidated or superseded so a
stale worker cannot promote; the UI explains that consequence before save.
Block only an edit to an actually immutable historical artifact, or a mutation
whose owning domain cannot safely supersede current work. Evidence-scope edits
follow Plan 059's repair/new-epoch rules rather than mutating an evidence
snapshot in place.

---

# 10. Progress and stage contracts

## 10.1 Producer-owned stage codes

058/059 own their stage sets. Legacy scan phases remain for historical jobs.

The operator API returns:

- owner;
- stage code;
- display category;
- progress structure.

The dashboard may group stages visually, but must not maintain a second
authoritative phase order used for correctness.

## 10.2 Replace duplicated phase semantics

The current dashboard fixture that mirrors `FULL_AUDIT_PHASE_ORDER` is a
warning sign. During migration:

- one server schema defines the serialized stage vocabulary;
- the dashboard validates the response at runtime;
- a contract/parity test proves every stage/reason has FR/EN copy;
- old phase-order duplication is retained only for legacy rendering and then removed when no current route depends on it.

This does not require the browser bundle to import scanner packages.

## 10.3 Live update policy

Keep polling unless measured evidence justifies another transport.

Suggested behavior:

- active detail/control view: short bounded poll (current 3-5s class is acceptable);
- queue/attention list: 5-10s class;
- static history pages: no continuous full-history poll; refresh active summary separately;
- hidden tabs pause polls;
- failed polls retain last good data but show its age/error.

State transitions that require attention should refresh the sidebar count.

---

# 11. Queue UX

The Audits page owns the visible queue.

It shows:

## Running

- subject/site;
- Quick Check vs Full scan;
- current stage;
- truthful bounded progress when available;
- waiting/retrying state and next retry when known;
- Cancel action when available.

## Up next

- explicit position;
- subject/site;
- scan type;
- important non-default options summarized, with details on demand;
- move up/down or keyboard-accessible reorder control;
- remove/cancel.

## Blocked / needs attention

Do not leave these pretending to be queued.

- automatic block with no operator remedy belongs in active work/status;
- human-decision work appears in À traiter and links to the exact audit/run.

## Completed

Completed jobs leave the active queue and appear in paged audit/history views.
Do not keep an ever-growing “completed queue” in memory.

## No whole-queue ETA

Do not estimate an overnight completion time from old scan durations unless
evaluation establishes a trustworthy estimator and confidence interval. Queue
position and actual stage are sufficient initially.

---

# 12. Crash, restart and deployment behavior

1. Preserve Plan-035 checkpoint reuse.
2. Legacy `running` rows from an unclean old worker keep the existing startup recovery until migrated.
3. 058/059 runs use their own lease expiry/epoch recovery; do not reset them by blindly rewriting a Job row.
4. A restart cannot turn `cancel-requested` into a writable current run without reacquiring valid ownership.
5. Queue order survives restart.
6. A deploy remains blocked by active work by default. Crash safety is defense-in-depth, not permission to restart expensive work casually.
7. Forced deployment remains an explicit operator override. After restart, the control room must show what resumed, retried, failed or needs attention.
8. A stale pre-deploy worker/process cannot promote a report/evidence object after its lease/epoch is invalid.

---

# 13. Migration and backward compatibility

## Phase 1 — additive read contract

- add operator projection/capability serializers;
- map legacy jobs without rewriting them;
- add typed problem envelopes on new routes while the API client accepts legacy errors;
- expose capability alongside existing controls before making the UI depend on it.

## Phase 2 — durable queue order and cancellation

- backfill an order only for currently queued jobs in current claim order;
- new jobs get durable order at enqueue;
- introduce cancel-requested for new running jobs;
- historical terminal `cancelled` remains valid history.

## Phase 3 — 059/058 integration

- project durable evidence/quality runs;
- retire report-production in-memory state/lock as final authority;
- use domain leases for conflicts.

## Phase 4 — remove browser inference

- delete error-string recovery classifiers after every migrated failure is typed;
- remove page-local action safety that duplicates server capabilities;
- retain presentation-only helpers.

No migration fabricates a richer historical state than the stored facts support.

---

# 14. Observability handoff

061 stores only correctness-critical work state.

065 adds richer diagnostics. This plan requires every failure/wait/retry to have:

- stable reason code;
- owner/run/attempt reference;
- timestamps;
- retryability/attention classification;
- preserved-work summary or reference.

Do not put raw page text, prompts, model outputs or stack traces in the
operator projection.

---

# 15. Accessibility requirements for queue/actions

- reorder controls work with keyboard and announce resulting position;
- live stage announcements are throttled to meaningful transitions, not page counters;
- `aria-disabled`/explanatory patterns allow keyboard users to learn why a command is unavailable;
- cancellation confirmation names preserved work/consequence;
- progress bars use determinate ARIA only when a denominator is real;
- status never relies on colour alone.

064 supplies shared components/tests.

---

# 16. Adversarial matrix

| Scenario | Required result |
| --- | --- |
| Two batch requests target same prospect concurrently | One active slot wins; loser gets typed blocking ref. |
| Two tabs reorder same queue | One revision wins; stale tab refreshes. |
| Worker claims a queued item while operator deletes/removes it | Existing conditional race safety preserved; no orphan write. |
| Operator cancels during page scan | State becomes cancel-requested until safe acknowledgement; checkpoint preserved. |
| Process dies after cancel request | Restart cannot silently resume as current unless owning cancellation/lease rules allow it. |
| Provider returns 429 | Retry/backoff state, no human attention unless retry policy exhausts. |
| Site rate-limit persists beyond policy | Block/fail with site reason and smallest safe next action; no UA bypass. |
| Evidence repair fails after prior evidence units passed | Failed/retry state while good units remain preserved. |
| Report quality run fails after evidence approval | Report work failed; evidence readiness unaffected. |
| Old failed job has a saved audit | Work history says failed; artifact/evidence projection independently says what is usable. |
| Approval state changes between render and click | State token rejects stale approval command. |
| Forced deployment interrupts run | Lease/checkpoint recovery prevents double promotion/write. |

---

# 17. Verification matrix

## Pure/state tests

- exhaustive owner-state → `OperatorWorkState` mapping;
- no impossible terminal/current combinations;
- cancel-requested transition table;
- wait/retry vs attention distinction;
- property tests for capability token changes on relevant inputs and stability on irrelevant inputs.

## Store/concurrency tests

- durable queue order/claim;
- reorder races;
- enqueue/reorder/claim interleavings;
- cancel request + completion race;
- restart recovery;
- stale lease/epoch cannot write current;
- archive/delete against queued, running, cancel-requested and finishing work.

## Route tests

- every command returns typed blocked/state-changed cases;
- blocking refs identify the existing work where safe;
- legacy error envelope remains readable during migration;
- no raw exception message is required for UI recovery.

## Browser tests

- queue reorder;
- cancel-requested rendering;
- active block links;
- stale-tab conflict refresh;
- retry/wait UI;
- no duplicate launch after double click.

## Integrated fault tests

- worker crash;
- provider 429/5xx;
- artifact-store outage;
- model schema failure;
- evidence retry exhaustion;
- quality-run supersession;
- forced deploy and resume.

---

# 17.1 Closure-proof contract

The "every active long-running process" and "every consequential action"
requirements require exhaustive inventories, not a best-effort migration.

Commit a typed `WorkOwnerRegistry` whose entry for every long-running producer
names its owner, durable state store, lease/epoch authority, cancellation
policy, resume policy, progress projector and capability namespace. Commit a
typed `CommandCapabilityRegistry` for every consequential migrated mutation.

CI must prove:

- all registered producers have durable ownership and restart tests;
- no promoted 058/059/report/scan correctness decision depends on a
  process-local lock/map/boolean;
- every command route is represented in the capability registry and performs a
  command-time token/state recheck;
- adding a queueable producer or consequential route without registration
  fails an inventory test;
- crash/restart tests cover every owner class, not only representative jobs;
- the requirement-to-proof ledger has no unowned binding requirement.

The registries are architecture artifacts, not dashboard convenience maps.


# 18. Fail-closed conditions

Do not execute a state-sensitive command when:

- capability inputs cannot be loaded consistently;
- its state token is stale;
- a conflicting authoritative lease/active slot exists;
- queue revision changed under a reorder;
- cancellation ownership is ambiguous;
- legacy state cannot prove deletion/archive safety;
- a report/evidence command would bypass 058/059 authority.

Unknown becomes blocked with a typed reason; it never becomes “probably safe”.

---

# 19. Explicitly rejected alternatives

- Replacing all work with one generic `WorkflowRun`.
- Copying 058/059 states into legacy Job as a second authority.
- A priority-class scheduler before a real need exists.
- In-memory queue reorder.
- Treating cancel request as instant terminal cancellation.
- Parsing English error strings in the browser.
- Client-only action guards.
- One global state revision for the whole prospect/audit.
- Fake global percentage or whole-queue ETA.
- WebSockets/SSE solely because work is long-running.
- Deleting checkpoints/partial evidence on cancel.
- Restarting a whole Full scan because one evidence repair failed.

---

# 20. Definition of done

Plan 061 is implemented when:

1. every active long-running process visible to the operator projects to the common truthful state vocabulary;
2. 058/059 remain the authorities for their own runs and leases;
3. report production no longer relies on in-memory state/lock for correctness after Plan-058 promotion;
4. queue order is explicit, persistent, reorderable and restart-safe;
5. running cancellation has a truthful request/acknowledgement lifecycle;
6. automatic wait/retry is distinguishable from human attention;
7. every consequential migrated action has a typed capability, state token and command-time recheck;
8. stale multi-tab commands fail safely with a refreshable typed conflict;
9. browser recovery logic no longer depends on parsing raw exception strings for migrated work;
10. old jobs remain readable without fabricated history;
11. crash/deploy/concurrency tests prove stale workers cannot become current;
12. queue and progress UX remains usable with both one job and an overnight batch;
13. every long-running producer and consequential command is present in the
    exhaustive owner/capability registries and the closure ledger is complete.
