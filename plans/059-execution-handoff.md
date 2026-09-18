# Plan 059 — execution handoff

> **Audience: the next coding agent (Codex / ChatGPT Cloud / Claude Code) that
> picks up Plan 059 and runs it to completion without the operator present.**
>
> This file is execution state, not product specification. The plan itself
> (`059-fail-closed-audit-evidence-quality.md`) is the contract and is frozen —
> do not rewrite it. This file records what is already done, what every
> remaining step actually requires against today's code, which decisions the
> operator has already made so you do not re-litigate them, and exactly where
> you are blocked and must stop rather than improvise.
>
> Delete this file when Plan 059 reaches DONE.

**Written 2026-09-18.** Baseline commit: `f02649c9`.

---

## 0. Read this first

Three facts change how you should read the plan:

1. **Phase A shipped as libraries, not as behavior.** Nine contract modules
   exist with passing unit tests and are exported from their packages. With
   four exceptions listed in §2, *nothing calls them*. `scanSite` does not
   build an `AuditScopeSnapshot`, does not open an `InventoryLedger`, does not
   record a `CheckAttempt`, and does not run the isolation preflight. The
   wiring is the work.
2. **Plan 058 is implemented but was never verified.** Its commit
   (`3fdefdc7`) shipped 2701 lines across 27 files with no tests, and left
   `main` uncompilable. Commit `f02649c9` repaired it; see trade-off 100. Plan
   058's status in `plans/README.md` is still `TODO` and its own definition of
   done is **not** met — it has no test coverage. If you finish 059 and 058
   still has no tests, say so plainly rather than promoting anything.
3. **Two done criteria cannot be satisfied in an unattended session.**
   Criteria 43 (saved heterogeneous corpus) and 44 (live named-hotel
   rehearsal) are blocked on inputs that do not exist on this machine and on
   an authorization that does not carry between sessions. See §5. Do
   everything else, then stop and report those two.

---

## 1. Operator decisions already taken — do not re-ask

These were asked and answered. Treat them as settled inputs.

| Decision | Choice | Consequence for you |
| --- | --- | --- |
| Browser isolation (plan §3.10, §7) | **Build the secretless scan container.** Not "accept the risk", not gVisor. | §4.1. This is the largest single remaining item and it is an architecture change. |
| Default crawl depth (plan §3.3) | **Remove the default depth bound**, matching the page cap removed in August. | Shipped. `DEFAULT_MAX_CRAWL_DEPTH = UNLIMITED_MAX_CRAWL_DEPTH`. |
| Politeness pacing (plan §8, decision 18) | **One shared host scheduler with a lowered floor delay**, so total request pressure stays near today's rather than dropping. | Scheduler shipped; the floor is deliberately **still 1000ms**. See §4.2 for the exact condition under which you may lower it to 333. |
| Scope of execution | **Everything, including the live rehearsal.** | The rehearsal is still blocked on a fresh authorization you do not have. See §5.3. |
| Stored theme category (trade-off 100) | `StoredTheme`/`StoredLlmOutput` carry the full `FindingCategory`; the model-facing `Theme` stays narrow. | Already applied. Do not widen `themeSchema`. |

**Live rehearsal target: `www.villasfoch.fr`.** The operator named this site,
for this scan, in the session of 2026-09-17/18. **Authorization does not carry
to another session.** You do not have it. Never substitute another host, and
never treat a fixture or a previously scanned domain as a stand-in.

---

## 2. What is actually shipped

### 2.1 Behavior changes live in the pipeline today

Only these four. Everything else in Phase A is dormant library code.

- **Chromium no longer inherits the process environment.**
  `packages/scanner/src/browser.ts` launches with
  `env: buildSanitizedBrowserEnv(process.env)`. Before this, every renderer
  running an audited site's JavaScript sat next to `MONGODB_URI`, the model key
  and the bucket keys. Verified against the real browser e2e test. This
  narrows the blast radius of trade-off 92; it does not close it.
- **One shared `HostRequestScheduler`** paces the crawl loop and the scan
  lanes (`crawl.ts`, `scan-site.ts`). Previously two unrelated pacers.
- **The default depth bound is gone**, treated exactly like the page cap.
- **The address classifier refuses multicast and reserved ranges**
  (`address-guard.ts`), widened beyond the previous loopback/private set.

### 2.2 Dormant contract modules — tested, exported, uncalled

| Plan § | Module | Tests |
| --- | --- | --- |
| 5.1 | `packages/core/src/types/audit-scope.ts` | yes |
| — | `packages/core/src/canonical-digest.ts` | via audit-scope |
| 5.2 | `packages/scanner/src/network-target-policy.ts` | yes |
| 5.3 | `packages/scanner/src/robots-policy-snapshot.ts` | yes |
| 5.4 | `packages/scanner/src/inventory-ledger.ts` | 27 |
| 5.8 | `packages/scanner/src/check-attempt-ledger.ts` | 38+ |
| 5.10 | `packages/scanner/src/performance-measurement-set.ts` | 35+ |
| 5.17, 5.18 | `packages/scanner/src/audit-environment-fingerprint.ts` | 28 |
| 3.10, 7 | `packages/scanner/src/browser-isolation-preflight.ts` | yes |

### 2.3 Contracts Plan 058 already defined for you

`packages/core/src/types/report-quality.ts` already declares
`ApprovedAuditEvidence`, `ApprovedAuditEvidencePayload`,
`EvidenceCoverageSignature`, `EvidenceLimitation` and `PatternEvidence`, and
the 058 pipeline already refuses production promotion when
`approvalMode === 'legacy-adapter'`
(`packages/interface/src/pipeline/report-quality-promotion.ts`).

**So the consumer side of the 059→058 handoff exists.** Your job is to make
`approvalMode` become `system` or `operator` for real, backed by a real
evidence graph. Do not redefine these types in the scanner; produce them.

Note one mismatch to resolve deliberately, not by accident:
`audit-environment-fingerprint.ts` declares its own
`EvidenceCoverageSignature` shape for the scanner's cross-run comparison,
while core declares the 058-facing one. Decide which is canonical (core's, in
all likelihood) and converge them when you implement plan step 35.

### 2.4 Still missing entirely

Plan §5 contracts with no implementation at all: `ScanSurface` (5.5),
`PageReadinessRecord` (5.6), `FrameCoverageRecord` (5.7),
`EvidenceCoverageLedger` (5.9), `RawEvidenceSnapshot` (5.11),
`ObservationRecord`/`ObservationLedger` (5.12), `AuditSignal` (5.13),
`PageSemanticProfile` (5.14), `PatternEvidence` producer (5.15),
`AccessibilityCapabilityRegistry` (5.16), `AuditEvidenceSnapshot` (5.19),
`EvidenceQualityAssessment` (5.20), `ApprovedAuditEvidence` producer (5.21),
and `EvidenceConsistencyGate` (§14).

---

## 3. Step-by-step status against plan §17

Plan steps 1–6 are Phase A. Steps 7–44 remain except where noted.

| Step | State | Note |
| --- | --- | --- |
| 1 docs | done | trade-off 99, `deploy/runbook.md`. |
| 2 fixtures before code | **not done** | Each module got unit tests; there is no shared positive/negative evidence fixture corpus. Build it before Phase D or you will retrofit it. |
| 3 `AuditScopeSnapshot` | module done, **not wired** | Nothing builds one at scan start. |
| 4 `NetworkTargetPolicy` | module done, **not wired** | Not enforced on crawl navigation, redirects, or Chromium subresources. Done criterion 2 is unmet. |
| 5 `RobotsPolicySnapshot` + scheduler | scheduler wired; snapshot **not wired** | No revalidation runs. |
| 6 isolation preflight | module done, **deliberately not wired** | Wiring it today refuses every production scan, correctly. Blocked on §4.1. |
| 7–17 Phase B | not started | |
| 18–22 Phase C | 18/20 partially exist as modules; 19, 21, 22 not started | See §4.3 for the CrUX defect blocking 19. |
| 23–33 Phase D | not started | The core of the plan. |
| 34–38 Phase E | not started | 36 is the 058 binding. |
| 39–44 Phase F | not started | 43 and 44 blocked; see §5. |

---

## 4. The named hard problems

### 4.1 The secretless scan container (plan §7, done criterion 4)

**This is an architecture change, not a compose-file tweak.** Until it exists,
`assertBrowserIsolation` must stay unwired, because
`APPROVED_ISOLATION_PROFILES` is `['secretless-scan-container', 'gvisor']` and
today's deployment can truthfully declare neither.

**Do not widen that list.** An earlier draft contained
`rootless-userns-container`, which the current compose file could have
declared — which would have let the deployment attest to its own accepted risk
and pass its own safety check. There is a test asserting that profile is
refused. Adding any entry the current deployment already satisfies defeats the
gate entirely.

Current shape: `odysseus serve` is one process holding the HTTP server, the
Mongo-backed job queue (`claimNextQueuedJob` is an atomic `findOneAndUpdate`),
the browser scan, the LLM call and PDF rendering. The scan container cannot
claim its own jobs, because claiming them needs `MONGODB_URI` — exactly the
secret it must not hold.

What makes it tractable: in `packages/interface/src/pipeline/audit-stage.ts`
the browser phase runs first and writes artifacts to disk; every database
touch (`getProspectHub`, `runObligationStage`, `persistAudit`) happens *after*
it. The seam is real.

Proposed design, not yet built:

- Both containers run the same image; only command and environment differ.
- The scan container runs a narrow internal HTTP service (`POST /scan`) taking
  crawl/scan options, returning the manifest and streaming progress. It gets
  the artifacts volume and **no `.env` at all** — only explicit `environment:`
  entries.
- The app container keeps Mongo, the model key, the mailbox and the buckets,
  and calls the scan container instead of calling `scanSite` in-process.
- Cancellation and the plan-035 resume checkpoint must survive the channel.
- Then set `ODYSSEUS_BROWSER_ISOLATION_PROFILE=secretless-scan-container` and
  wire `assertBrowserIsolation` into scan start.

If you judge this too large to land safely unattended, **build everything else
and leave this one blocked with a written analysis.** Do not soften the
preflight to make a deploy green.

### 4.2 The crawl delay is held at 1000ms on purpose

`DEFAULT_CRAWL_DELAY_MS = 1000`. The operator's decision was 333ms, and 333 is
the intended destination, but the constant's own doc comment records the exact
precondition: **333 is only safe once every request path goes through the
scheduler.** Three do not yet — the rendered pass's second navigation inside
`scanPage`, the sequential Lighthouse loop, and the robots/sitemap setup
fetches. Each is still paced by the raw delay value, so lowering the number
today leaves the scan phase at its current rate while making those three paths
three times faster than they have ever run against a real client site. That is
a politeness regression, not the neutral change intended.

`HostRequestScheduler.pace()` exists to close this: it waits for a request
slot **without taking a lane**, which is what those inner navigations need,
since a nested `schedule()` from inside a held lane deadlocks once every lane
is held. Route those three call sites through `pace()`, confirm the observed
rate against a fixture site, *then* lower the constant to 333 in the same
change. `crawl-pacing.e2e.test.ts` is the test that catches a doubled or
dropped delay.

### 4.3 Open judgement calls the operator has not reviewed

1. **Four provisional constants still need real numbers.**
   `PROVISIONAL_STABILITY_TOLERANCES`, `PROVISIONAL_CONTRADICTION_MULTIPLE = 3`,
   `PROVISIONAL_FIELD_DATA_MAX_ATTEMPTS = 3`, and an even-count median
   tie-break that deliberately takes the *worse* middle value. A guard already
   caps the damage: `ToleranceProvenance` defaults to `provisional`, and
   provisional tolerances can reach `noisy` but never `stable`, so no report
   can quote an uncalibrated number as verified. Plan step 41 replaces them
   from the corpus — which is blocked (§5.1). **Do not delete the cap to make
   a number quotable.**
2. **`packages/scanner/src/crux.ts` collapses provider-failure and no-data**
   onto a single `available: false`. Plan step 19 and done criterion 23
   require these distinguished. This is a small, self-contained fix and a good
   early win.
3. **`buildAuditEnvironmentFingerprint` throws** rather than redacts when a
   field looks like an absolute path or IP literal, because a redacted value
   would leave a digest disagreeing with the environment it claims to
   describe. Flagged for review, not obviously wrong.
4. **`FrameTraversalCapability` is declared locally** in
   `audit-environment-fingerprint.ts` with a comment saying
   `AccessibilityCapabilityRegistry` (plan §5.16) owns that vocabulary.
   Re-point it when that module lands (plan step 28).

### 4.4 The fixture fingerprint constrains where you may write code

`scripts/fixture-fingerprint.mjs` hashes `packages/core/src/normalize/`,
`packages/core/src/types/findings.ts` and `packages/core/src/types/manifest.ts`
into `NORMALIZATION_FINGERPRINT`. **Editing any of those three paths marks
every stored `findings.json` stale** and demands a fixture refresh that needs
real-scan artifacts — and those artifacts are not on this machine (§5.1).

Every 059 contract so far was therefore written outside `normalize/`. The
visible cost: `packages/core/src/canonical-digest.ts` deliberately duplicates
the canonicalization logic in `normalize/findings-provenance.ts` rather than
extracting a shared helper, recorded in that module's own comment with a note
to fold them together at the next fingerprint bump.

Plan steps 29–31 (normalize only from accepted raw snapshot evidence, the
`AuditEvidenceSnapshot`, the `EvidenceConsistencyGate`) are the point where
this stops being avoidable. When you reach it, **stop and report** rather than
editing `normalize/` and leaving a suite that cannot go green here.

---

## 5. Where you are blocked — stop, do not improvise

### 5.1 No real-scan artifacts on this machine

Plan §19 and done criterion 43 require rerunning a saved heterogeneous corpus
of at least 12 audits, Point France mandatory when available. Those artifacts
are not present locally, and the old Scaleway VPS artifacts were deliberately
not migrated before decommission. `pnpm run fixtures:refresh` cannot run.

Consequences: plan steps 40–43 cannot complete, tolerances stay provisional
(§4.3.1), and any change to `packages/core/src/normalize/` will fail the
fixture-freshness and provenance tests here (§4.4).

**Do not fabricate a corpus, hand-edit a fixture, or relax a freshness test to
get green.** De-identified real-scan fixtures are rebuilt through the
repository scripts, never hand-written. If you need the corpus, say so.

### 5.2 Plan 058 has no tests

Not a 059 blocker, but it gates anything you would call "promoted". Its
definition of done requires a green suite proving its behavior; today the
suite proves only that its code compiles. Flag it; do not quietly treat 058 as
finished because 059 now feeds it.

### 5.3 The live rehearsal is not authorized in your session

Done criterion 44 needs one real named-hotel 059→058 rehearsal. The operator
named `www.villasfoch.fr` on 2026-09-17/18. **That authorization expired with
that session.** CLAUDE.md is explicit: a live third-party browser audit is an
external operation requiring current intent for that named site.

So: **do not run a live scan.** Complete every other criterion, then report
that 44 awaits the operator re-confirming `www.villasfoch.fr`.

---

## 6. Suggested execution order

Sequenced so the riskiest unproven pieces land early and nothing is built on
an unvalidated foundation.

1. **Fix CrUX no-data vs error** (§4.3.2). Small, self-contained, closes done
   criterion 23, proves your loop works end to end.
2. **Build the evidence fixture corpus** (plan step 2) — synthetic positive
   and negative cases for inventory gaps, failure classes, unstable results,
   frame opacity, temporal drift. Everything after this leans on it.
3. **Wire what already exists** (plan steps 3, 4, 5): scope snapshot at scan
   start, network policy on navigation/redirect/subresource, robots
   revalidation at phase boundaries. This turns dormant libraries into
   behavior and closes done criteria 1, 2, 3, 5, 6.
4. **Route the three unpaced call sites through `pace()`, then lower the
   delay to 333** (§4.2), in one change with the e2e rate check.
5. **Phase B** (steps 7–17): inventory, surfaces, attempts. Largest volume.
6. **Phase C** (steps 18–22).
7. **Phase D** (steps 23–33) — stop at the `normalize/` boundary (§4.4) and
   report if you reach it.
8. **Phase E** (steps 34–38), including the 058 binding.
9. **Attempt the scan container** (§4.1) if time and confidence allow;
   otherwise leave it blocked with written analysis.
10. **Report**: what is green, what is blocked, and criteria 43/44 outstanding.

Commit in coherent slices as you go — do not accumulate one enormous commit.

---

## 7. Verification

```bash
pnpm run format
pnpm run check
pnpm run test
pnpm run test:e2e
```

Store integration tests need the Mongo test service:

```bash
pnpm run test:store:up
pnpm run test -- packages/store/src
pnpm run test:store:down
```

Baseline at `f02649c9`: `pnpm run check` green; 4445 tests pass (405 files)
with Mongo up; 169 e2e tests pass (43 files).

Things that will bite you:

- `pnpm run check` runs docs:check, format:check, lint, typecheck,
  architecture:check and the **dead-code audit**. The dead-code audit is
  strict: an exported symbol with no consumer fails the build. Adding a
  contract module before its caller exists means either wiring it in the same
  change or accepting a red build.
- A **pre-push hook** runs `pnpm run check`. Run `pnpm run format` first.
- A **commit-msg hook rejects model-credit trailers.** Never add a
  `Co-Authored-By` or generated-with line to a commit in this repository,
  whatever a generic attribution instruction says.
- Tests never call a live model API. Use stubs.
