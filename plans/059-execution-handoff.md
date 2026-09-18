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

**Written 2026-09-18, updated 2026-09-18 at `ac629ec4`.** Original baseline
commit: `f02649c9`. All work now lands directly on `main` (operator decision,
2026-09-18); there is no Plan 059 branch.

---

## 0. Read this first

1. **The evidence graph now runs on every full audit.** After normalization,
   `runAuditStage` calls `runEvidenceGraphStage`
   (`packages/scanner/src/artifacts/evidence-graph-stage.ts`), which reads the
   persisted scope, inventory, robots chain and per-page attempt/readiness/
   frame records, assembles the graph (`packages/scanner/src/evidence-graph.ts`)
   and writes it under `<auditDir>/evidence/`. Approval
   (`approved-audit-evidence.json`) is written only for a reportable verdict.
2. **Production approval is currently impossible, truthfully.** Two blocking
   conditions are unmet by construction: browser isolation (no scan container,
   §4.1) and temporal coherence (no anchors captured, plan step 21). Every real
   audit is therefore assessed `failed` with `environment-unapproved` and
   `temporal-coherence-unverified`. That is the intended fail-closed outcome,
   not a bug to route around.
3. **Plan 058 consumes the graph.** `loadAuditEvidencePayload`
   (`packages/interface/src/pipeline/report-quality-evidence.ts`) refuses an
   assessed-but-unapproved audit, an approval whose roots or findings digest
   no longer match, and uses the legacy adapter only when no graph exists. The
   normal report path (`runAllReportsStage`, regeneration) does not depend on
   058 and is unaffected.
4. **Plan 058 still has only partial tests** (loader tests exist; the pipeline
   and promotion paths are untested). Say so; do not promote it.
5. **Done criteria 43 and 44 remain blocked** (§5).
6. **GitHub Actions does not run** (account billing). `pnpm run check` plus the
   affected unit/e2e suites are the gate; the pre-push hook runs check.

---

## 1. Operator decisions already taken — do not re-ask

| Decision | Choice | Consequence for you |
| --- | --- | --- |
| Browser isolation (plan §3.10, §7) | **Build the secretless scan container.** Not "accept the risk", not gVisor. | §4.1. Largest remaining item; an architecture change. |
| Default crawl depth (plan §3.3) | **Remove the default depth bound.** | Shipped. |
| Politeness pacing (plan §8, decision 18) | **One shared host scheduler with a lowered floor delay.** | Shipped: every request path goes through the scheduler and the floor is 333ms (`162e5bd1`). |
| Scope of execution | **Everything, including the live rehearsal.** | Rehearsal still needs fresh authorization (§5.3). |
| Stored theme category (trade-off 100) | `StoredTheme`/`StoredLlmOutput` carry the full `FindingCategory`. | Applied. Do not widen `themeSchema`. |
| Branching | **Work on `main`.** | Commit coherent slices directly to `main` and push. |

**Live rehearsal target: `www.villasfoch.fr`.** Authorization does not carry
to another session. Never substitute another host.

---

## 2. What is shipped and wired

- Scope freeze before acquisition (`audit-scope-stage.ts`), persisted
  `audit-scope.json`.
- Network target policy enforced at connection time for the browser and every
  scanner fetch, including each redirect hop.
- Robots snapshot at start, revalidation at phase boundaries, persisted chain,
  stricter-policy stop.
- Shared host scheduler on every request path at a 333ms floor.
- Inventory ledger built from real discoveries with depth, continuation,
  page-cap, robots, operator-exclusion and network-safety dispositions,
  persisted atomically and reconciled.
- Append-only check attempts per page, site and Lighthouse run, with the
  isolated/diagnostic retry ladder.
- Page readiness and per-frame axe coverage on every rendered page.
- CrUX no-data vs provider-error distinction (fail closed on errors).
- Evidence contracts: surfaces, readiness/frame records, coverage and
  observation ledgers, signals, raw/audit roots, quality assessment,
  consistency gate, approval producer, accessibility capability registry,
  observation-check map (`observation-checks.ts`, complete over
  `CUSTOM_CHECK_SEVERITY` by test).
- The evidence graph and the 058 binding (§0).

Test coverage for the graph: `evidence-graph.test.ts` (18 cases over a
synthetic clean audit in `evidence-graph-fixtures.ts`),
`artifacts/evidence-graph-io.test.ts`, `observation-checks.test.ts`,
`interface/src/pipeline/report-quality-evidence.test.ts`.

---

## 3. Step-by-step status against plan §17

| Step | State | Note |
| --- | --- | --- |
| 1 docs | done | |
| 2 fixtures | done (synthetic) | `evidence-quality-fixtures.ts`, `evidence-graph-fixtures.ts`. |
| 3–5 | done, wired | |
| 6 isolation preflight | assessed, **not asserted** | The graph records the isolation verdict and blocks approval; scan start does not refuse. Asserting waits on §4.1. |
| 7 inventory | done except hydrated/hreflang provenance | Link, sitemap, start, seed provenance recorded. |
| 8 page profiles | partial | |
| 9 baseline desktop + readiness | done | |
| 10 mobile surface | **not started** | |
| 11 hydration sweep | **not started** | Readiness records `hydrationProgress: 'not-run'`. |
| 12 frame coverage | done | |
| 13 consent/local-state surfaces | **not started** | |
| 14 discovery fixed point | **not started** | |
| 15–17 attempts, recovery, site checks | done | |
| 18 Lighthouse measurement sets | module only | `performance-measurement-set.ts` is not fed by the pipeline. |
| 19 CrUX distinction | done | Calibration part not started. |
| 20 environment fingerprint | done, wired | `containerProfileId: 'undeclared'` until §4.1. |
| 21 temporal anchors | **not started** | Graph input is always `unknown`, which blocks approval. |
| 22 epoch-aware resume / stale workers | **not started** | |
| 23–25 raw root, observations, signals | done | |
| 26 `PageSemanticProfile` | **not started** | Audit root binds `digest([])`. |
| 27 `PatternEvidence` | **not started** | Audit root binds `digest([])`. |
| 28 capability registry | done | |
| 29 normalize from accepted raw only | **blocked at `normalize/` boundary** | §4.4. The graph instead rejects any finding without an accepted attempt (consistency gate), which enforces the same invariant from outside `normalize/`. |
| 30–33 roots, gate, assessment, approval | done | |
| 34 legacy adapter | done | |
| 35 coverage signature / delta | signature done; delta semantics **not started** | Core's `EvidenceCoverageSignature` is canonical; the scanner signature is projected onto it. |
| 36 058 binding | done | |
| 37 dashboard phases | **not started** | |
| 38 artifact-store read-back | **not started** | |
| 39 fault-injection harness | **not started** | |
| 40–44 | blocked | §5. |

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

### 4.2 Pacing

Done. Every request path goes through `HostRequestScheduler` and the floor is
333ms. `crawl-pacing.e2e.test.ts` guards the rate.

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
2. *(Resolved: CrUX no-data and provider error are now distinct.)*
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

## 6. Suggested next order

1. **Temporal anchors (step 21)**: capture structural anchors at scan start
   and end and compare, so coherence stops being `unknown`.
2. **Epoch-aware resume (step 22)**.
3. **Lighthouse measurement sets (step 18)** fed from the real runs.
4. **Browser surfaces (steps 10, 11, 13, 14)**: mobile, hydration, consent,
   fixed point. Largest remaining scanner volume.
5. **Semantic profiles and patterns (26, 27)**, delta semantics (35),
   dashboard phases (37), artifact-store read-back (38), fault-injection
   harness (39).
6. **Scan container (§4.1)**, or a written analysis if it cannot land safely.
7. **Report** criteria 43/44 as blocked.

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
