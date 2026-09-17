# Plan 060: Application quality control-room architecture

> **Executor instructions**: this is the entry point for application-wide quality convergence after Plans 058 and 059. Implement the application as a truthful control room over those domain authorities, not as a second workflow engine. The dashboard may summarize, guide and command; it may not invent evidence state, report readiness, approval state or action safety. Preserve already-good work and the simplified product model. If a screen cannot explain what exists, what is running, what needs attention and what action is safe next, the application contract is not complete.

## Status

- **Priority**: P1
- **Effort**: XL across the 060-066 family; this plan is the application-level foundation and integration contract.
- **Depends on**: implemented Plans 035, 050, 051/054, 055, 056 and 057; the domain contracts defined by Plans 058 and 059.
- **Coordinates with**: Plans 061-066.
- **Production promotion**: the 060-066 family must not weaken or bypass any Plan-058/059 gate. Where this family and older dashboard behavior disagree, 058/059 plus current canonical product decisions win.
- **Category**: operator workflow, application architecture, dashboard information architecture, cross-domain state contracts.
- **Final review state**: repository-wide design review plus repeated convergence passes; the final fresh pass produced no additional substantive architectural change. Freeze speculative design and let implementation/evaluation evidence drive later amendments.

---

# 1. Purpose

Plans 059 and 058 deliberately raise the quality bar on the two expensive outputs:

```text
website
→ trustworthy ApprovedAuditEvidence
→ trustworthy atomic ReportBundleCandidate
→ operator-approved active deliverable
```

The application around them must become equally trustworthy.

The goal is not to add more controls. It is to make the existing three-destination dashboard — **À traiter**, **Prospects**, **Audits** — a calm control room where the operator can answer, without knowing implementation details:

```text
What do we know?
How trustworthy/current is it for this action?
What is running?
What completed work has been preserved?
What needs my attention?
What is the next safe action?
What will that action do?
Is the client deliverable ready?
If not, exactly why not?
```

---

# 2. Current-state findings from the live repository

These are implementation facts observed on the current `main`, not generic SaaS assumptions.

## 2.1 The application has multiple partial truths for one operator question

- `packages/store/src/schemas/job.schema.ts` has the coarse job states
  `queued/running/complete/failed/cancelled/needs-input`.
- `packages/interface/src/dashboard/routes/scan-progress-model.ts` reconstructs richer meaning from phase and error strings.
- `packages/interface/src/dashboard/routes/audits-model.ts` can reinterpret a failed job as a report issue when an audit survived.
- `packages/store/src/outreach-report-readiness.ts` correctly treats report artifacts, not job success, as the readiness authority.
- `packages/interface/src/pipeline/report-production-state.ts` and
  `report-production-lock.ts` hold report-production truth in process memory.

Plans 058/059 add durable evidence epochs, quality runs, immutable candidates,
leases, exact approval and supersession. Extending the current pattern would make every page invent a different answer.

## 2.2 Browser-facing contracts are deliberately local, but semantic duplication is already costly

The dashboard imports no workspace package. `dashboard/lib/api-types.ts`,
`api-schemas.ts`, `lib/phase-order.ts` and
`fixtures/full-audit-phase-order.ts` therefore mirror server concepts and use tests to catch drift.

That boundary is acceptable. What is not acceptable is asking the browser to reconstruct domain truth from a growing collection of raw store fields. The server must serialize an operator-facing read model whose semantics are authoritative before the browser receives it.

## 2.3 Run state and usable-artifact state are different dimensions

Current code already proves why:

- a scan job can fail after an audit has been persisted;
- report regeneration can fail while scan evidence remains reusable;
- report readiness in `outreach-report-readiness.ts` is based on actual report artifacts, not a job row;
- Plan 059 can preserve good evidence while repairing one missing unit;
- Plan 058 can preserve an approved language candidate while repairing the other.

A single badge such as “Complete” or “Failed” cannot faithfully describe an audit.

## 2.4 The current report interaction conflicts with Plan 058

`packages/interface/src/dashboard/routes/audit-reports-section.tsx` currently
supports an approve-and-download shortcut. Plan 058 requires an explicit review of the exact bilingual quality-approved bundle followed by approval of that exact digest. Downloading a language is not approval.

## 2.5 Action safety is spread across route guards and page conditionals

Good server guards exist:

- `checkScanLaunch` / active-job protection;
- outreach `checkOutreachAction`;
- queued-job delete race handling;
- archive/delete in-flight guards;
- report-production locks.

But the UI mostly discovers many conflicts after the click, while local helpers such as `canStop` and `canDelete` know only a small subset of server truth.

## 2.6 The three-destination information architecture is still the right base

`docs/product/dashboard-ia.md` and the live `AppShell` already converge on:

- À traiter;
- Prospects;
- Audits.

Do not add a fourth “Quality”, “Jobs”, “Notifications” or “Reports” primary destination merely because 058/059 add more state. Those concerns belong inside the existing operator journey.

## 2.7 Existing simplifications are valuable and must survive

Current canonical decisions already establish:

- Quick Check and Full scan only;
- one stored Full scan can feed outreach and client-report work;
- scanner/code age is advisory rather than automatic invalidation;
- report recovery uses stored evidence rather than gratuitous recrawling;
- the prospect owns linked identity fields;
- archive preserves the prospect relationship record but intentionally purges audit/report storage;
- manual sending remains separate from the audit pipeline.

The quality work must not recreate old modes, tiers or duplicate scan paths.

---

# 3. Binding product decisions

1. **There is no single global “audit status”.** The operator view composes independent authorities for work execution, evidence readiness, report readiness/approval and prospect lifecycle.
2. **Domain truth stays where it belongs.** Plan 059 owns evidence approval. Plan 058 owns report-candidate quality, operator approval and promotion. The application projects those contracts; it never re-derives them from loose files or job success.
3. **One next-action contract, many domain owners.** Safe-action policy is evaluated server-side by the domain that owns the state, then serialized through one common capability shape. Do not build a giant global capability manager.
4. **UI prevention is convenience; server refusal is authority.** An unavailable action is disabled/explained before click, but every mutation still rechecks its preconditions atomically enough to defeat stale tabs and races.
5. **À traiter becomes the application-wide human-attention inbox.** It contains only work that truly requires a human decision or intervention. Normal running, waiting, automatic retry and successful completion do not create noisy attention rows. A quality-approved private bundle for an unsold/prospecting Full scan is likewise not an inbox item merely because Plan 058 would require explicit approval before eventual client delivery.
6. **Audits becomes the quality workspace.** The list answers what is running/recent/blocked; an audit detail answers evidence quality, report quality, lineage and the next safe action.
7. **Prospects remains the durable commercial/identity workspace.** Do not move campaign/contact state into audit quality models.
8. **History is human-readable first, cryptographic second.** Show date, purpose, usability, limitation, current/superseded state and relationship. Digests and version IDs live in a technical-details disclosure with copy support.
9. **No blanket staleness from code age.** Historical work is usable when the requested action's evidence contract says it is. “Newer scanner exists” is an advisory, not a fabricated failure.
10. **No fake progress.** Show determinate progress only for a bounded metric the producer actually knows. Otherwise show stage, activity and truthful indeterminate state.
11. **No automatic notification channel is added.** The initial attention model is in-product. A successful overnight batch is recent activity, not an attention item. External notifications require later evidence of a real need.
12. **No new workflow engine.** 058/059's own durable run/lease/epoch state remains authoritative. The application adds projections and command safety, not another orchestration layer.
13. **The dashboard itself must meet an exemplary accessibility bar.** Accessibility is an invariant, not a visual-polish follow-up.
14. **Scanned content is hostile input.** It is text/evidence to display safely, never trusted markup or an instruction source.
15. **Quality beats cost, but simplicity still beats unnecessary abstraction.**
16. **Keep advanced scan controls only where they have a real operator purpose.** Preserve the current ability to tune supported scan pacing/scope when a site needs it, but group the controls by consequence: scope controls (such as exclusions/depth/page bounds) alter what “full” observed and therefore feed Plan-059 scope/limitation truth; execution controls (such as delay/concurrency) affect how work runs and stay within safe server bounds. If a chosen scope bound would make Plan 059 unable to approve the result as client-report evidence, the launch UI says that before submission and the completed run stays explicitly non-reportable rather than pretending to be a complete Full scan. Do not expose internal millisecond units, hidden worker knobs or options that have no effect for the selected Quick Check/Full scan intent.

---

# 4. Canonical operator vocabulary

Operator-facing words must have one meaning. Internal legacy codes may remain behind adapters.

| Operator concept | Meaning |
| --- | --- |
| Prospect | Durable business/contact record. |
| Quick Check | One-page triage scan; never sufficient for a client report. |
| Full scan | Full audit acquisition intent. One qualifying scan can feed all downstream uses. |
| Evidence | Measured/observed website data governed by Plan 059. |
| Evidence approved | A current `ApprovedAuditEvidence` exists for the requested use. |
| Limitation | Known, explicit boundary on what was observed; not synonymous with failure. |
| Finding | Deterministic normalized issue. |
| Occurrence | One evidence-backed instance of a finding. |
| Re-audit | A new Full scan compared with an earlier eligible baseline. |
| Report candidate | Private, immutable report iteration; not client-active merely because it rendered. |
| Quality approved | Automated Plan-058 gates passed; still awaiting human approval when applicable. |
| Approved report | Exact bilingual bundle explicitly approved by the operator. |
| Active report | Approved bilingual bundle currently promoted for client use/download. |
| Retry | Repeat the smallest failed/missing unit while preserving valid work. |
| Rescan | Start a new scan/evidence epoch when the evidence contract requires it or the operator chooses new observation. |
| Regenerate | Re-enter report production from reusable approved evidence; never implies a crawl. |
| Blocked | Work cannot proceed automatically until an external or policy condition changes. |
| Needs attention | A human decision/intervention is required now. |
| Failed | The run cannot continue automatically. It does not imply that all prior artifacts are unusable. |
| Superseded | A newer authoritative run/candidate replaced this one; history remains read-only. |
| Cancel requested | Stop requested but the worker has not yet reached a safe terminal boundary. |
| Cancelled | The owning run acknowledged cancellation and cannot continue writing as current work. |

Remove operator-facing references to retired scan modes as 061/062 migrate their adapters.

---

# 5. The application truth model

## 5.1 Four independent authorities

Every audit control view composes these axes:

```text
Prospect lifecycle
  active / archived / campaign state / identity provenance

Work execution
  queued / running / waiting / retrying / blocked /
  needs-attention / cancel-requested / failed / completed /
  cancelled / superseded

Evidence readiness (Plan 059)
  absent / legacy-unknown / building / needs-attention /
  approved-with-limitations / approved-complete / superseded

Report readiness (Plan 058)
  absent / producing / needs-attention / quality-approved /
  awaiting-operator-approval / operator-approved / active /
  failed / superseded
```

Do not flatten these into one enum.

## 5.2 Operator snapshot

Introduce one **server-produced operator snapshot contract** for control-room
surfaces. The exact module/file name may follow existing interface conventions;
the contract itself is binding.

At minimum it contains:

```text
subject
  prospectId?
  auditId?
  site/display identity

work[]
  durable run reference
  purpose
  state
  stage
  truthful progress metrics
  started/updated timestamps
  wait/retry metadata when applicable
  typed blocking/failure reason
  preserved-work summary

evidence
  approval/readiness
  evidence epoch/digest reference
  human limitations summary
  legacy/age advisory
  re-audit comparability summary

report
  current quality run
  current candidate bundle
  quality gate summary
  operator approval state
  active bundle reference
  prior iteration summary

capabilities
  closed action map from section 6

attention[]
  typed human-attention items

stateVersion
  command precondition token/revision appropriate to the subject
```

This is a read model, not a new database aggregate. Build it from authoritative
domain rows with bounded queries/projections. Persist only state that the owning
domain actually needs to recover or enforce.

## 5.3 Server is the semantic boundary

The browser may:

- translate stable codes;
- format dates and counts;
- group/display already-declared state;
- choose responsive presentation.

The browser may not:

- infer report readiness from a job being complete;
- parse an error sentence to choose a recovery action;
- infer evidence approval from presence of findings;
- infer action safety from absent optional fields;
- guess which historical scan is usable;
- guess whether an approval remains current;
- reconstruct a 058/059 phase from low-level internals.

---

# 6. Capability/action-availability contract

061 implements the command mechanics. This plan fixes the product contract.

## 6.1 Common shape

Every consequential action exposed by the control room has a server-derived
capability:

```text
action
state: available | blocked
reasonCode?
blockingRef?
consequenceCode?
stateToken
```

The response uses stable codes, not localized prose. The dashboard owns FR/EN
copy and must have an exhaustive mapping for every code.

Examples include:

```text
startFullScan
startQuickCheck
reorderQueuedScan
requestCancel
retryFailedUnit
startNewEvidenceEpoch
generateReport
requestReportCorrection
approveReportBundle
downloadActiveReport
editProspectIdentity
editAuditInputs
archiveProspect
deleteAudit
deleteProspect
restoreProspect
launchReaudit
```

The list is illustrative; implementation derives the exact closed set from
real routes before migration.

## 6.2 No giant policy object

Keep ownership bounded:

- prospect lifecycle/identity actions use prospect/store policy;
- scan/queue actions use scan/job policy;
- evidence repair/approval actions use Plan-059 policy;
- report candidate/approval/promotion actions use Plan-058 policy;
- outreach actions continue to use the existing outreach policy.

The common contract normalizes how policy is serialized; it does not move all
rules into one module.

## 6.3 Stale-state protection

For every mutation whose safety can change after the screen renders:

1. the read response includes the relevant `stateToken`;
2. the command sends that token;
3. the server re-loads/re-evaluates authoritative state;
4. a stale or changed precondition yields a typed `state-changed` conflict;
5. the client refreshes the snapshot and explains what changed.

Do not use one coarse global revision that makes an unrelated contact edit
invalidate a scan command. The token must commit only to the authoritative
inputs relevant to the command, or use the owning aggregate's monotonic
revision where one already exists.

---

# 7. Information architecture

## 7.1 À traiter

Keep it as the landing page and extend the existing durable prospect-work
precedent to cross-application human attention.

Eligible classes include:

- evidence requires an operator resolution;
- identity required for a quality run cannot be confirmed automatically;
- quality run reached `needs-operator-review`;
- a paid-report delivery has been explicitly brought to operator review and its quality-approved bundle awaits approval;
- a fatal/non-automatic failure needs a recovery choice;
- existing draft/reply/follow-up/outcome work.

Do not include:

- ordinary queued/running work;
- automatic retry/backoff;
- host pacing;
- successful queue completion;
- an informational legacy/version advisory with no required decision.

Rows must name the subject, what decision is needed, since when, and one safe
destination/action. 063 replaces the current unbounded all-prospect poll with
a bounded server attention projection.

## 7.2 Prospects

Keep commercial identity/contact/campaign workflow here.

Add only quality information needed to choose the next commercial action:

- active scan/run link;
- newest usable Full scan;
- report active/not-ready summary;
- concise reason when outreach waits.

Do not duplicate the full evidence/report control room.

## 7.3 Audits list

Becomes a truthful work/history index, not a job table disguised as audits:

- active work is prominent;
- queued work has persistent order;
- history is server-paged/searchable/filterable;
- evidence and report attention states are separately visible;
- scan job success never masks a report failure;
- report failure never makes preserved evidence look lost.

## 7.4 Audit detail

062 owns the full control-room design. At a glance it must expose:

```text
Identity / scope
Current work
Evidence readiness + limitations
Findings summary
Report bundle readiness / approval
History / lineage / re-audit relationship
Next safe action
```

Large findings, attempts, diagnostics and candidate histories load on demand.

---

# 8. Attention and notification model

Use one durable **attention projection**, not a new notification store unless a
domain event must itself persist for correctness.

Each attention item has:

```text
attentionId (stable for the underlying condition)
kind
subjectRef
createdAt / updatedAt
severity: action-required | blocking
action
reasonCode
href
```

It disappears when authoritative state proves the condition resolved or
superseded. Do not require “mark read” for work that is no longer real.

The sidebar badge is the server-provided attention count, not the length of a
client-side unpaged array.

No email, push, Slack or desktop notification is part of this plan.

---

# 9. Historical and legacy behavior

1. Old audits stay readable through explicit adapters.
2. Missing historical evidence-quality facts render as `unknown-legacy`, never as a guessed pass.
3. A historical scan may still be usable for a requested action when the relevant adapter/contract approves it.
4. “Generated with an older scanner version” is advisory unless a required capability is actually absent.
5. Superseded jobs/runs/candidates remain read-only history.
6. Re-audit comparison names its baseline and comparability state; scanner improvements cannot masquerade as site regressions/resolutions.
7. Archive semantics remain current canonical behavior: archive preserves the prospect record and intentionally purges attached audit/report storage. Do not promise audit-history retention across archive.
8. Restore never claims to restore purged scans.
9. Legacy raw job types are mapped to current human vocabulary; they are not offered as new launch choices.

---

# 10. Error and recovery UX contract

Every operator-visible failure must answer:

```text
What failed?
At what stage?
What completed work is preserved?
Will Odysseus retry automatically?
Does a human need to act?
What is the smallest safe recovery action?
Does recovery require a new scan/evidence epoch?
```

Primary UI uses typed reason/recovery codes. Raw stack traces, provider bodies
and arbitrary exception strings are developer diagnostics, never primary copy.

A failed downstream stage must never suggest a rescan when approved evidence
is still valid.

065 owns durable diagnostics and routine recovery tooling.

---

# 11. Accessibility and design contract

064 implements the details. Application-wide invariants are:

- one `main` landmark per page;
- every operation available to a pointer has a keyboard path;
- focus is visible and dialogs/drawers trap/restore focus correctly;
- status is text/icon/structure, never colour alone;
- disabled/unavailable actions have an accessible explanation;
- meaningful state changes are announced without announcing every polling tick;
- reduced motion remains respected;
- responsive layouts work at mobile widths and 200-400% zoom;
- dense tables have real headers and usable row links;
- no nested interactive controls;
- touch targets are adequate for primary actions;
- FR/EN copy has complete closed-code coverage.

The existing dark theme, Avenir design language, focus treatment and reduced-motion support are retained unless testing proves a defect. This is hardening, not a cosmetic redesign.

---

# 12. Security and privacy contract

066 owns implementation detail. Cross-plan requirements are:

- scanned website/model text renders as escaped, inert content;
- untrusted URLs never become privileged navigation/network targets without validation;
- report candidates and evidence artifacts stay private/authenticated;
- no candidate/report content is copied into telemetry to improve observability;
- operator commands remain same-origin authenticated and gain stale-state preconditions;
- destructive/approval/retry/override actions are auditable;
- browser execution must satisfy Plan-059/058 isolation before those pipelines are production-promoted;
- current single-operator authentication remains sufficient; do not invent RBAC until the product has multiple users.

---

# 13. Performance contract

063 owns implementation detail. The application must remain truthful and
responsive at both a small clean site and Point-France scale.

Required direction:

- server-side paging/search/filtering/aggregation for growing histories;
- small active-work/attention polling payloads;
- lazy/paged finding occurrence data;
- no full report-byte/object-store read merely to paint a list/detail badge;
- no unbounded “load every active prospect and all work” poll;
- no “latest 200 jobs” window used to claim global KPI/queue/history totals;
- payload/query budgets covered by tests.

Prefer pagination and bounded read models over frontend virtualization until
measured evidence requires virtualization; it is simpler and more accessible.

---

# 14. Implementation sequence across the plan family

## Phase A — platform safety + domain truth

1. Land Plan 066's production-equivalent browser-isolation/network preflight early. 058/059 domain work may be implemented privately behind the old production path, but their browser-dependent path is not promoted until the isolation gate is green.
2. Implement Plan 059's evidence authorities, epochs/leases, snapshots and approval envelope.
3. Implement Plan 058's durable quality-run/candidate/bundle/approval/promotion contracts against ApprovedAuditEvidence.
4. Keep legacy adapters explicit while those roll out.

## Phase B — control contract

5. Implement Plan 061's shared operator work-state vocabulary, typed capability response, stale-state command protocol and persistent queue semantics.
6. Replace browser error-string/state inference with server-declared codes/projections.
7. Extend À traiter to the human-attention contract without adding a new primary destination.

## Phase C — audit control room

8. Implement Plan 062's evidence/report/history/approval workspace.
9. Remove approve-on-download and every path that can expose an unapproved candidate as the active client report.
10. Bind paid client delivery to Plan 058 active-bundle semantics while keeping prospecting/outreach readiness on the strongest non-human gate it actually needs: current approved evidence plus a current automated quality-approved private report bundle/derived artifacts. Outreach must not require operator approval of every prospect's paid-report bundle.

## Phase D — scale and interface quality

11. Implement Plan 063 bounded APIs, server aggregates and large-audit data loading.
12. Implement Plan 064 accessibility/design-system hardening and browser regression coverage.

## Phase E — operations and security

13. Implement Plan 065 durable diagnostics, routine recovery and operator system-health surfaces.
14. Complete the remaining Plan 066 security/privacy/isolation hardening; the browser-isolation gate from Phase A remains mandatory for 058/059 production promotion.
15. Run the integrated verification corpus and deployment/rollback rehearsal.

A slice may land earlier when backwards-compatible, but no UI may claim a
new guarantee before its owning backend contract is authoritative.

---

# 15. Adversarial matrix

| Scenario | Required application behavior |
| --- | --- |
| Scan worker fails after preserving valid evidence | Work shows failed; preserved evidence remains separately usable. |
| One evidence unit fails and is retryable | Offer smallest-unit retry; no reflexive full rescan. |
| Site rate-limits the crawler | Show waiting/backoff or blocked-site reason truthfully; do not call it operator work unless a decision is needed. |
| Report writer/provider fails | Evidence remains approved; report work names recovery. |
| FR candidate passes while EN needs repair | Preserve FR candidate; bundle is not approvable yet. |
| Automated bundle QA passes | Attention asks for explicit operator approval of exact bundle; no auto promotion/download approval. |
| Operator requests an edit after approval | New quality iteration; prior approval does not apply to changed digest. |
| Two tabs issue conflicting commands | Stale token loses safely; fresh snapshot explains new state. |
| Deploy interrupts a recoverable run | Durable owner resumes/requeues from valid checkpoints; stale worker cannot promote. |
| Historical scan lacks new capability | Show explicit legacy/limitation state; allow only actions the adapter can prove safe. |
| Scanner version changed but evidence remains sufficient | Advisory only; no mandatory rescan. |
| Point-France-sized audit | Control summary remains small; findings/history load in bounded pages. |
| Tiny clean site | UI does not drown the operator in empty quality machinery. |
| Prospect is archived | No scan/report command; audit storage semantics match canonical purge behavior. |
| Scanned text contains HTML/script/bidi tricks | Display stays inert and understandable. |

---

# 16. Verification matrix

| Invariant | Proof |
| --- | --- |
| Browser never derives evidence/report readiness from raw jobs | Contract/unit tests over operator snapshots + code search removing old derivations. |
| Run state and artifact readiness stay independent | Table/property tests covering failed-run + preserved-artifact combinations. |
| Every consequential action has server capability + server recheck | Route inventory test and stale-token race tests. |
| Every capability/recovery code has FR/EN copy | Exhaustive type/schema parity test. |
| À traiter contains only genuine human work | Pure projection tests for running/waiting/retrying/success vs action-required cases. |
| Old scans are not gratuitously invalidated | Legacy/age fixtures and Plan-050 reuse tests. |
| Explicit report approval survives exactly one unchanged bundle | 058 integration test over digest mutation/supersession. |
| Primary IA stays three destinations | shell/navigation regression test. |
| Point-France scale stays bounded | 063 query-count, response-size and browser interaction budgets. |
| Dashboard accessibility bar holds | 064 axe + keyboard/focus/zoom/mobile tests. |
| Confidential content stays out of diagnostics | 065/066 redaction canary tests. |

---

# 17. Fail-closed conditions

The control room must not present an action as available when:

- its owning domain cannot prove the required current state;
- a conflicting active lease/run makes the mutation unsafe;
- the state token is stale at command time;
- the requested report does not reference current ApprovedAuditEvidence;
- an operator approval does not match the exact current bundle;
- artifact readiness is unknown but the action requires it;
- a legacy adapter cannot prove the required capability;
- destructive cleanup cannot preserve the repository's current failure-order guarantees.

The UI may display an unavailable/unknown state, but it may not guess “ready”.

---

# 18. Explicitly rejected alternatives

- A new top-level “Quality” or “Jobs” destination.
- One enormous global audit-status enum.
- Treating job `complete` as evidence/report readiness.
- A generic workflow engine layered over 058/059's durable run state.
- Event sourcing merely to power the dashboard.
- A giant global capability manager.
- Client-side parsing of exception text to choose recovery.
- A global revision token that makes unrelated edits conflict.
- Re-scanning whenever scanner/report code changes.
- Re-running a whole report to repair one language/section.
- Automatically approving on download.
- Email/push notifications before in-product attention proves insufficient.
- Server-sent events/WebSockets merely to avoid small bounded polling; revisit only if measured latency/load justifies them.
- Frontend virtualization before server paging proves insufficient.
- Exposing raw schema versions/digests as the primary user explanation.
- Rebuilding the existing visual language without evidence of a usability/accessibility defect.

---

# 19. Definition of done

Plan 060 is implemented when:

1. the application uses one documented operator vocabulary for work, evidence, report and attention state;
2. run execution and artifact readiness are independent in both API contracts and UI;
3. the browser consumes server-owned semantic projections rather than reconstructing 058/059 truth from raw persistence fields;
4. every consequential action used by the control room has a typed server capability and stale-state-safe command check;
5. À traiter is the single bounded human-attention inbox without becoming a generic notification feed;
6. Prospects remains the identity/commercial owner and Audits becomes the audit-quality workspace;
7. current Quick Check / Full scan simplification and reusable-scan semantics remain intact;
8. legacy history is honest (`unknown-legacy` where necessary) and code age stays advisory;
9. report approval is explicitly separated from report download;
10. the 061-066 contracts are implemented without contradictory duplicate authorities;
11. integrated regression tests cover the adversarial matrix above;
12. the final cross-plan review finds no screen or command that can claim a stronger state than 058/059/store truth proves.

---

# 20. Plan-family map

- **061 — Durable work state, capabilities and queue**: execution/progress states, command safety, queue ordering/cancellation, crash/race behavior.
- **062 — Audit control room, lineage and approval**: evidence/report review UX, history, re-audit, identity inputs, exact bilingual approval.
- **063 — Dashboard data contracts and large-audit performance**: bounded read models, paging/filtering/aggregates, Point-France scale.
- **064 — Dashboard accessibility and design-system hardening**: exemplary keyboard/focus/semantics/live-state/mobile/zoom behavior and shared UI patterns.
- **065 — Operational observability and recovery**: typed diagnostics, operator/developer separation, stuck-work detection and routine recovery.
- **066 — Operator security, privacy and browser isolation**: hostile input, confidential artifacts, command/audit trail boundaries and production browser isolation.

The family is deliberately split by ownership and failure mode. None of the
follow-on plans may invent a competing evidence, report or orchestration truth.
