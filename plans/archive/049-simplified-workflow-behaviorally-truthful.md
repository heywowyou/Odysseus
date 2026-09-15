# Plan 049: make the simplified workflow behaviorally truthful

> **Executor instructions.** Execute only after Plan 048 is fully complete on the actual working tree. Rebaseline against the real post-048 HEAD before editing; do not use the pre-048 planning commit as the implementation baseline.
>
> This is a correctness plan, not another dashboard redesign. Preserve Plan 048's three-intent UI, task-first prospect page, shared filters, navigation, and progressive disclosure. The purpose of this plan is to make the underlying runtime behavior match those abstractions exactly.
>
> Work directly on `main` unless the operator changes that instruction. One focused commit per step. Run the stated verification before moving on. Do not push, deploy, or perform a live third-party scan without explicit operator authorization.

## Status

- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH — scan orchestration, job compatibility, audit qualification, status automation
- **Depends on:** Plan 048 fully DONE
- **Category:** correctness / workflow integrity / tech debt
- **Planned:** 2026-09-15, after review of the complete Plan 048 contract
- **Execution status:** DONE (implementation and local verification complete; post-deploy acceptance rehearsal pending operator authorization)
- **Archived:** 2026-09-15 (implementation and local verification complete; post-deploy acceptance rehearsal remains an operator-authorized follow-up)
- **Baseline:** Post-048 HEAD `4576679` on 2026-09-15. `pnpm run check` passed. `pnpm run test:all` completed with one pre-existing `crawl-pacing.e2e.test.ts` timing failure (`141ms` observed against a `200ms` floor) and skipped Mongo integration tests because Docker Mongo was unavailable. `pnpm run test:e2e` completed with one pre-existing `write-audit.e2e.test.ts` timeout at 180 seconds.
- **Verification closeout:** The implementation was verified locally on 2026-09-15. `pnpm run check` passed; the focused semantic suites passed (12 files, 79 tests, with the expected Mongo integration skip); `pnpm run test:e2e` passed (38 files, 145 tests); `pnpm run test:all` passed (369 files, 3,623 tests, 13 Mongo-backed files skipped because Docker Mongo was unavailable); and `pnpm run docs:check` passed as part of `check`. `pnpm exec fallow dead-code --trace-file packages/store/src/active-jobs.ts` and an intent-symbol trace confirmed the new launch/mapping seams are consumed. `pnpm run fixtures:refresh` could not refresh the configured real artifacts because all 15 listed scan artifact directories are absent on this machine; the required normalization-fingerprint ratchet was applied to the committed test fixtures and no live scan was run. The post-deploy rehearsal remains an operator-authorized external step.
- **Supersedes:** no plan; corrects semantic gaps between Plans 047/048 and their runtime implementation

## Why this matters

Plans 047 and 048 deliberately changed the product from a collection of implementation-shaped scan types into three operator intents:

```text
Quick check
Prepare outreach
Prepare client report
```

Plan 048 defines the ordinary outreach journey as:

```text
Find or add prospect
        ↓
Prepare outreach
(complete prospecting audit)
        ↓
Create/review first email
        ↓
Handle reply/follow-up
        ↓
Record outcome
```

The current architecture does not reliably guarantee those semantics.

The most serious mismatch is that `prospecting-audit` can still travel through the lightweight prospecting runner: a bounded scan designed around a small page budget, no Lighthouse, and no model/report stages. Renaming that path “Prepare outreach” does not make it the complete audit that the Plan 048 workflow requires.

There are four adjacent correctness gaps:

1. scan purpose is not authoritative when deciding whether an audit is outreach-grade, so a complete one-page Quick Check can potentially satisfy the generic complete-coverage test;
2. generic audit persistence advances an attached prospect to `audited` from coverage alone, even when the audit came from an informational Quick Check;
3. the unified launch guard does not reliably preserve same-kind duplicate protection and the single-host scan policy across all three intents;
4. the shared work/status model does not exactly implement Plan 048's final workflow states: a reply recommends review rather than outcome recording, and automatic status advancement still treats terminal branches as if they were one linear sequence.

The UI abstraction is only valid if all of these layers agree.

## Binding product contract

### 1. The three scan intents are behavioral contracts

The operator-facing intents mean exactly:

| Intent | Crawl | Lighthouse | LLM analysis | Client reports | May qualify outreach? |
| --- | --- | --- | --- | --- | --- |
| **Quick check** | one-page bounded probe | no | no | no | **never** |
| **Prepare outreach** | normal complete audit crawl | normal audit-stage policy | no | no | **yes**, when coverage/provenance qualify |
| **Prepare client report** | normal complete audit crawl | normal audit-stage policy | FR + EN | FR + EN | **yes**, when coverage/provenance qualify |

“Prepare outreach” is therefore the scan/persist portion of a Full Audit, stopped before analysis and reports.

It is **not** a renamed three-page prospecting batch.

“Prepare client report” includes the same underlying complete audit and then continues through analysis and report generation.

Quick Check remains optional information. It must never silently replace Prepare outreach merely because the target website happens to contain one page.

### 2. Batch prospecting is not a fourth operator scan

The generic bounded `prospecting` batch may remain for a proven CLI/batch caller.

It is not exposed in the ordinary dashboard and its audits are not automatically outreach-grade.

Do not route a single-site Prepare outreach action through the batch runner merely to avoid creating the correct orchestration path.

### 3. Scan purpose must survive persistence

Every newly created single-site audit records enough provenance to answer:

```text
Why was this audit run?
```

At minimum distinguish:

- `quick-check`
- `prospecting-audit`
- `full-audit`

The value must be available to the store/work module after the producing job has completed; qualification may not depend on UI labels or reconstruct intent from a route name.

Prefer an explicit optional audit-level `scanIntent`/`purpose` contract carried through `runAuditStage` and persisted with the audit.

If adding the field changes a fingerprinted core contract, follow the repository's normal fingerprint bump/restamp procedure. Do not bypass the ratchet.

### 4. Outreach qualification is purpose + coverage + provenance

An attached audit qualifies for first-email/preview readiness only when:

```text
eligible scan purpose
AND complete crawl coverage
AND current findings provenance
```

Eligible purposes:

```text
prospecting-audit
full-audit
```

Ineligible:

```text
quick-check
bounded batch prospecting
known legacy light-audit
```

An old audit whose purpose cannot be established must fail closed rather than being guessed outreach-grade. The remedy is to run Prepare outreach.

A historical audit may be classified deterministically from its producing job where that relation is unambiguous. Do not write speculative migration rules.

### 5. Workflow status follows the same rule

Quick Check never automatically moves:

```text
new → audited
```

A qualifying Prepare outreach or Full Audit may advance `new → audited`.

The generic `runAuditStage` must not independently decide business workflow progression from coverage alone. Scan persistence and prospect workflow advancement are separate responsibilities.

### 6. Launch protection is centralized and complete

All operator scan creation goes through one launch decision.

It must prevent:

- invalid URLs;
- suppression violations according to the existing Plan 047 policy;
- duplicate active runs of the same intent for the same prospect;
- conflicting simultaneous browser-heavy work against the same real site according to the repository's politeness policy.

Known shared/vendor hosts may retain their cross-prospect exception, but that exception must never allow the same prospect to launch duplicate copies of the same scan.

Unattached scans on a shared host have no prospect identity with which to prove separate tenancy, so use the conservative host-level rule.

Quick Check still launches the scanner/Chromium stack. Explicitly decide its host-slot behavior here rather than inheriting the old “light probe” assumption accidentally:

**Plan 049 decision:** an active Quick Check conflicts with another active browser scan against the same non-shared host. Favor politeness and predictable operator behavior over saving a few seconds.

### 7. Plan 048's recommendation table is authoritative

For a non-terminal prospect:

| Stored facts | Recommended action |
| --- | --- |
| no qualifying outreach audit | Prepare outreach |
| qualifying audit, no first-email draft/thread | Create first email |
| draft waiting for review | Review draft |
| sent touch with follow-up due | Create follow-up |
| follow-up draft waiting for review | Review draft |
| reply waiting for disposition | **Record outcome** |

Do not substitute `Review reply` as the terminal workflow action if an outcome is what actually clears the work.

### 8. Automatic status progression is a graph, not a fake linear array

The workflow is:

```text
new
 ↓
audited
 ↓
contacted
 ↓
follow-up
 ↓
replied
 ↓
call
 ↓
quoted
 ├─ won
 └─ lost
```

`opted-out` is terminal from any appropriate outreach state.

`won`, `lost`, and `opted-out` are terminal siblings, not later positions in one ordered array.

Automatic actions may advance progress but must never:

- regress a later manual status;
- turn `won` into `lost`;
- turn `lost` into `won`;
- move an opted-out prospect;
- reinterpret one terminal state as “later” than another.

Changing a terminal status after the fact belongs to the explicit **Correct status** operator control.

## Step 0: rebaseline the completed Plan 048 tree

1. Confirm Plan 048 is marked DONE in the actual working tree.
2. Record current HEAD in this plan when implementation starts.
3. Run:

```bash
git status --short
pnpm run check
pnpm run test:all
pnpm run test:e2e
```

4. Inspect the actual post-048 versions of:
   - scan route/model;
   - job schema and queue runner map;
   - active-job/launch guards;
   - `runProspectingJob`;
   - `runFullAuditJob`;
   - any retained outreach/full-scan compatibility runner;
   - `runAuditStage`;
   - `prospect-work`;
   - prospect outcome/status functions;
   - New Scan and prospect-detail actions.
5. Record which defects in this plan are already resolved by the completed 048 implementation. Do not reintroduce deleted aliases or obsolete files just to match filenames below.

**Verify:** baseline commands are green before changing behavior.

**STOP** if the actual completed 048 tree materially changed the architecture assumed by this plan in a way that already provides equivalent guarantees. Amend 049 to the real names/interfaces before editing.

## Step 1: give the three intents distinct runtime semantics

Stop overloading single-site operator scans onto the generic batch runner.

Preferred final queue vocabulary for newly created work:

```text
quick-check
prospecting-audit
full-audit
prospecting              # internal bounded batch only
```

Historical persisted job types may remain readable for compatibility.

### Quick Check runner

Create or retain one explicit single-site orchestration path that:

- takes one URL;
- carries optional `prospectId`;
- runs `runAuditStage`;
- forces `maxPages: 1`;
- skips Lighthouse;
- uses the lightweight sitemap policy;
- stamps `scanIntent: quick-check`;
- never runs analysis;
- never generates reports;
- completes with one `auditId`.

Do not route new Quick Checks through a multi-URL batch abstraction if removing that overloading is reasonably scoped.

### Prepare outreach runner

Create `runProspectingAuditJob` or the post-048 equivalent.

It:

1. acquires the normal origin lock;
2. obtains a stable run identity/checkpoint identity;
3. calls the shared `runAuditStage` using the **normal complete-audit crawl behavior**;
4. stamps `scanIntent: prospecting-audit`;
5. retains normal audit-stage Lighthouse/crawl planning rather than forcing the old prospecting shortcuts;
6. persists findings and the attached prospect;
7. stops immediately after the audit stage;
8. runs **no** LLM analysis;
9. runs **no** report generation;
10. completes the job with the produced `auditId`;
11. cleans the checkpoint only after job completion, matching the existing full-audit lifecycle.

The correct architecture is:

```text
Prepare outreach
    ↓
runAuditStage
    ↓
persist complete audit
    ↓
STOP
```

### Prepare client report

Keep `runFullAuditJob` as:

```text
runAuditStage
    ↓
analysis FR
    ↓
analysis EN
    ↓
reports FR + EN
```

Pass `scanIntent: full-audit` into the audit stage.

Do not fork scanner behavior between Prepare outreach and the audit portion of Prepare client report.

### Legacy compatibility

If `outreach-full-scan`, `prospecting + scanType`, or other pre-049 rows can still exist:

- readers must continue to display them;
- queued/running historical jobs must remain executable;
- no ordinary dashboard route creates new legacy rows;
- map old rows to canonical display intents in one compatibility adapter.

Do not perform a broad production migration merely to make names prettier.

**Verify:** focused runner tests mock the expensive stages and prove exact composition:

```text
Quick check:
audit once
analysis 0
report 0

Prepare outreach:
audit once
analysis 0
report 0

Prepare client report:
audit once
analysis 2 languages
reports generated
```

Also assert the Quick Check options are bounded while Prepare outreach does not inherit `PROSPECTING_MAX_PAGES`, `PROSPECTING_MAX_DEPTH`, `skipLighthouse: true`, or the old batch-only sitemap mode.

## Step 2: persist scan intent and make qualification honest

Add explicit scan intent to the persisted audit contract or an equivalently durable audit-level source field.

Thread it:

```text
route
→ job
→ runner
→ runAuditStage
→ persisted audit
→ prospect-work qualification
```

Do not derive intent in React.

Update the qualifying-audit selector so it first rejects ineligible purposes and then evaluates current provenance and complete coverage.

A complete Quick Check fixture must result in:

```text
qualifyingAudit = undefined
recommended action = Prepare outreach
status != audited solely because of that scan
```

A complete/current Prepare outreach fixture must result in:

```text
qualifyingAudit = that audit
status advances to audited if appropriate
Create first email becomes available when contact requirements are met
```

A complete/current Full Audit may satisfy the same outreach audit requirement; do not force a redundant Prepare outreach scan after a more complete audit already exists.

### Existing audits

Implement a bounded compatibility classifier for pre-049 records:

- known Quick Check → ineligible;
- known old Light/bounded prospecting → ineligible;
- known old outreach full scan → prospecting-audit semantics;
- known Full Audit → full-audit semantics;
- unknown/ambiguous → fail closed with Prepare outreach as remedy.

If useful, provide a read-only/dry-run diagnostic command showing how existing attached audits classify. Do not mutate production rows automatically in this plan.

## Step 3: move prospect workflow effects out of generic audit persistence

`runAuditStage` is a scanning/persistence stage. It must not decide that every complete attached scan means the prospect has been meaningfully audited for outreach.

Extract one orchestration helper, for example:

```text
finalizeProspectScan(...)
```

or equivalent, owned outside the scanner stage.

For an attached scan it handles:

- `scan-attached` event;
- purpose-aware status advancement;
- any canonical post-scan prospect bookkeeping.

Rules:

```text
quick-check
  → attach/history event
  → NO automatic audited status

prospecting-audit + qualifying coverage
  → attach/history event
  → advance to audited

full-audit + qualifying coverage
  → attach/history event
  → advance to audited
```

Do not duplicate this decision independently in all three runners.

The pure/store helper is the single test seam.

## Step 4: repair launch deduplication and host politeness

Replace the partially split conflict logic with one canonical launch decision.

Its input contains at least:

```ts
{
  url,
  intent,
  prospectId?
}
```

Resolve explicit/auto-attached prospect identity before the final duplicate check whenever possible.

The guard must cover:

### Same prospect, same intent

Always refuse while an equivalent job is queued/running/needs-input.

This includes Quick Check.

### Same non-shared host, different browser intent

Refuse while another scanner job owns the host slot.

Examples that must refuse:

```text
Prepare outreach + Prepare outreach
Prepare outreach + Full Audit
Full Audit + Quick Check
Quick Check + Prepare outreach
Quick Check + Quick Check
```

### Shared/vendor host

Different prospects may run independently where the existing shared-host exception is justified.

The **same prospect** may still not start duplicate work.

### Completed work

Completed, failed, and cancelled jobs do not conflict.

Keep the existing refusal vocabulary unless a genuinely new operator remedy requires another code.

Delete the old unused launch-planning function only after `fallow dead-code --trace` proves it has no caller.

**Verify:** matrix tests cover same-kind, cross-kind, attached, unattached, normal host, vendor/shared host, and terminal historical jobs.

## Step 5: make the recommendation machine match Plan 048

Update the shared prospect-work model, not React.

Add/rename the action needed to express:

```text
record-outcome
```

When a thread is in the replied state and needs operator disposition, derive a To-do/recommendation whose primary action is Record outcome.

Give the prospect page's outcome section a stable deep-link target such as:

```text
#outcome
```

or use the existing stable target if 048 already established one.

The same derived item must feed:

- À traiter;
- sidebar work count;
- prospect detail recommended action.

Do not make three adapters reinterpret `review-reply` differently.

A reply stops being an open work item once the relevant outcome/disposition has been recorded.

**Verify:** shared work tests prove the complete recommendation table from Plan 048, including terminal prospects returning no recommendation.

## Step 6: replace linear status ordering with explicit progression semantics

Remove any implementation where this:

```text
won
lost
```

means that `lost` is automatically “later” than `won`.

Define the automatic transition policy explicitly.

For non-terminal progression, a rank is acceptable:

```text
new < audited < contacted < follow-up < replied < call < quoted
```

Terminal values are a separate branch:

```text
won
lost
opted-out
```

Rules:

- automatic progress never moves backwards;
- automatic progress never changes an existing terminal state;
- recording a normal outcome advances only when that transition is valid;
- a conflicting terminal correction uses the explicit manual Correct status path;
- opt-out continues to write suppression before setting the terminal status;
- manual status correction remains freely editable and event-logged, as established in 047.

Update `recordProspectOutcome` to use the transition policy rather than unconstrained `setProspectStatus` for automatic side effects.

Return a clear refusal/409 if an API caller attempts to use ordinary outcome recording to overwrite an incompatible terminal state.

**Verify:** tests include:

```text
quoted → won       allowed
quoted → lost      allowed
won → lost         refused by normal outcome path
lost → won         refused by normal outcome path
opted-out → *      refused by automation
quoted → replied   no regression
manual correction  still allowed
```

## Step 7: align the dashboard defaults and labels with the real semantics

Keep exactly the three Plan 048 operator labels.

No queue/internal vocabulary leaks into operator copy.

On the generic New Scan page, make **Prepare outreach** the default ordinary intent unless the navigation source explicitly requested another intent.

A prospect's main recommended scan action launches Prepare outreach directly, already attached to that prospect.

Quick Check and Prepare client report remain secondary actions unless reached from a context that explicitly requested them.

The client-report action must clearly indicate that it continues through analysis/report generation; Prepare outreach must clearly indicate that it stops before the client deliverable.

Do not add another “level”, mode, wizard, or advanced workflow selector.

## Step 8: add semantic contract tests so this cannot regress behind correct labels

Plan 048's stubbed E2E proves the operator journey, but a UI fixture can pass while the real job is still wired to the wrong runner.

Add a second layer of tests that proves runtime composition without scanning a live site.

### Route contract

For each public intent, assert the created canonical job shape and attached prospect identity.

### Runner contract

Mock stage boundaries and assert exactly which stages execute.

### Audit qualification contract

Cover:

- complete Quick Check;
- incomplete Quick Check;
- complete Prepare outreach;
- stale Prepare outreach;
- incomplete Prepare outreach;
- complete Full Audit;
- ambiguous legacy audit.

### Workflow contract

Cover:

```text
Prepare outreach
→ complete qualifying audit
→ audited status
→ first-email item
→ draft review
→ reply
→ Record outcome
→ results/status update
```

### Guard contract

Cover the full concurrency matrix from Step 4.

### Regression assertion

Add a focused architectural test or pure mapping test proving that:

```text
prospecting-audit
```

does not resolve to the bounded generic prospecting runner.

Do not test this only by checking labels.

## Step 9: update canonical documentation and record the correction

Update:

- `docs/product/dashboard-ia.md`
- the maintained workflow portion of the project brief if it describes scan semantics;
- `docs/decisions/trade-offs.md`
- `docs/product/dashboard-ux-audit.md`
- `plans/README.md`

Add a trade-off/decision stating:

> Operator scan intents are behavioral contracts. Quick Check is informational; Prepare outreach is a complete scan-only audit; Prepare client report is that audit plus analysis and reports. UI labels may never be changed independently of those runtime compositions.

Document the status graph as branching at terminal outcomes rather than a single total order.

Record that Plan 049 corrects a Plan 048 planning contradiction: 048 required a complete prospecting audit while simultaneously placing scanner behavior out of scope.

Do not rewrite Plan 048's historical text to pretend the contradiction never existed.

## Verification

Run focused suites throughout, then at plan close:

```bash
pnpm run format
pnpm run check
pnpm run test:e2e
pnpm run test:all
pnpm run docs:check
```

Also run dead-code tracing before deleting any legacy:

```bash
fallow dead-code --trace
```

and inspect:

```bash
rg -n "light-audit|outreach-full-scan|scanType|PROSPECTING_MAX_PAGES|PROSPECTING_MAX_DEPTH" packages
```

Matches are not automatically failures: historical compatibility and the internal bounded batch may legitimately remain. Every remaining match must have a documented current purpose.

## Acceptance rehearsal

After deployment, only with operator authorization, use one disposable/test prospect or an explicitly authorized site.

Verify:

### Quick Check

- launches as Quick Check;
- scans only the bounded probe;
- appears in prospect history;
- does not set the prospect to audited;
- does not make first-email/preview readiness true;
- leaves Prepare outreach as the recommended action.

### Prepare outreach

- runs the normal complete scan;
- creates no LLM analysis;
- creates no client PDF/report;
- persists an explicitly prospecting-audit-purpose audit;
- becomes qualifying only with complete coverage/current provenance;
- advances the prospect to audited;
- enables the next outreach action.

### Prepare client report

- runs a complete scan;
- continues through both analysis languages;
- generates the client reports;
- attaches to the prospect;
- satisfies the audit requirement without asking for a redundant Prepare outreach scan.

### Reply/outcome

- a replied thread appears in À traiter as Record outcome;
- opening it lands on the outcome control;
- recording the outcome clears that work item;
- status advances correctly;
- terminal statuses do not mutate automatically afterward.

Record the results in the existing UX ledger.

## Done criteria

- [x] The three dashboard scan intents have distinct, tested runtime compositions.
- [x] Prepare outreach uses the complete audit stage and never the bounded batch prospecting configuration.
- [x] Prepare outreach stops before LLM analysis and report generation.
- [x] Quick Check is permanently ineligible as an outreach-qualifying audit.
- [x] Quick Check never automatically advances a prospect to `audited`.
- [x] Complete/current Prepare outreach and Full Audit records may qualify outreach.
- [x] Scan intent/purpose survives job completion and is available to prospect-work qualification.
- [x] Ambiguous legacy audit purpose fails closed.
- [x] Same-kind duplicate scans are refused.
- [x] Cross-kind host conflicts obey one centralized politeness policy.
- [x] Shared-host exceptions cannot create duplicate work for the same prospect.
- [x] À traiter, sidebar count, and prospect detail all recommend Record outcome for a reply awaiting disposition.
- [x] Automatic status advancement cannot regress a prospect or move between terminal sibling states.
- [x] Manual Correct status remains available and event-logged.
- [x] The generic New Scan surface defaults to Prepare outreach unless another intent was explicitly requested.
- [x] No ordinary dashboard exposes the internal bounded `prospecting` batch.
- [x] Runtime composition tests exist in addition to UI/E2E tests.
- [x] FR/EN copy parity and axe coverage remain green.
- [x] `pnpm run check`, `pnpm run test:e2e`, `pnpm run test:all`, and `pnpm run docs:check` exit 0.
- [ ] The post-deploy rehearsal verifies all three scan intents against their actual produced artifacts/state.

The final item is intentionally pending: this execution did not deploy, mutate a
mailbox, or run a live third-party scan without explicit operator authorization.

## STOP conditions

Stop and report instead of improvising if:

- the actual completed Plan 048 tree already replaced the runner architecture and one of this plan's proposed structural changes would reintroduce an older abstraction;
- making Prepare outreach complete would require duplicating scanner code rather than calling the shared audit stage;
- a change would weaken robots.txt handling, crawl pacing, timeouts, suppression, complete-coverage checks, current-provenance checks, deterministic outreach copy, or manual sending;
- historical compatibility requires silently treating an ambiguous old audit as outreach-grade;
- an audit-purpose change requires rewriting findings or changing their substantive meaning;
- a production migration cannot be deterministic and dry-run-verifiable;
- a normal outcome action would need to overwrite an existing terminal status rather than use manual correction;
- any test would need a live model or unauthorized third-party scan;
- a verification command fails twice after a reasonable scoped correction.

## Out of scope

- another navigation redesign;
- new prospect selection/scoring/cohorts/waves;
- changing accessibility detectors or normalization behavior;
- changing report prose/content except metadata needed to describe scan purpose;
- new outreach templates;
- automatic email sending;
- Kanban/funnel/KPI UI;
- generic workflow configuration;
- changing Plan 048's filter consolidation;
- broad migration of historical audits when a fail-closed compatibility rule is sufficient.

## Maintenance rules after 049

1. **Intent names are contracts, not copy.** Changing Quick Check, Prepare outreach, or Prepare client report semantics requires runner/qualification tests in the same change.
2. **One source of qualification truth.** UI components never decide whether an audit is outreach-grade.
3. **One source of scan-launch truth.** Routes never recreate duplicate/politeness guards.
4. **One source of next-action truth.** À traiter, sidebar count, and prospect detail consume the same prospect-work state.
5. **Terminal status is branching state.** Never restore a single total-order array containing both `won` and `lost`.
6. **Batch internals stay internal.** The existence of a fast bounded batch runner is not a reason to route an operator-facing single-site intent through it.
7. **Tests must prove composition.** A button labelled “Prepare outreach” is not evidence that Prepare outreach actually happened.
