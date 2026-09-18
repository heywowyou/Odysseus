# Plan 051: findings delta in the re-audit report

Status: DONE (2026-09-18). Implemented 2026-09-16 (issue #371); the closure proof reopened on 2026-09-18 is now complete. See the requirement-to-proof ledger and Closure evidence below.

Source design: [`docs/product/findings-delta-reaudit-design.md`](../../docs/product/findings-delta-reaudit-design.md),
approved 2026-09-10 with all six defaults. This plan fixes the questions that
design left to the build and records the slices.

## Outcome

When the operator runs a new full audit of a site that already has a delivered
audit, both report languages gain a deterministic "Changes since the previous
audit" section. It compares the two runs finding by finding. No model writes
or ranks any of it, and no new scan mode, job type or price copy is added.

## Build-time decisions

The design left these open. They are settled here.

| Question | Decision | Why |
| --- | --- | --- |
| What counts as "delivered" | The audit has at least one report approval (`reportApprovals`), which is the operator's record that the report pair went out | It is the only delivery record the store keeps. An unapproved rerun never becomes a baseline |
| Baseline query | Same exact `siteUrl`, `startedAt` strictly earlier than the re-audit, the most recent one with an approval and a findings provenance stamp | Design decision 4. Candidates without provenance are skipped, so the delta never reads an unstamped findings set |
| Is a report a re-audit | Yes whenever a baseline exists. No flag to set | A new full audit of an already delivered site is, by definition, the re-audit. Every other report has no baseline and renders unchanged |
| Persisted or computed | Computed at render time from the two stored findings sets and audit rows. Nothing new is persisted | The function is pure and cheap, and re-rendering picks up a later approval without a migration |
| Baseline findings source | The `findings` collection and the `audits` row, not the baseline's disk artifacts | Artifacts are per machine and the database is shared |
| Different crawl config | Never disqualifies. A different `maxPages` or `maxDepth` is disclosed next to the delta | A narrower run can make findings look resolved. Saying so is honest, while refusing the delta would hide real fixes |
| Duplicate dedupe key inside one run | The core function throws | Normalization emits one finding per key. A duplicate means corrupted input, and the report must fail rather than guess |
| Where the section sits | Right after the executive summary, as a conditional numbered section (`section-16`) | The re-audit reader's first question is what changed. The section only exists when a delta is passed |
| Persistent findings | Counted, not listed. The appendix already lists every current finding | Keeps the section short. New, resolved and changed-severity rows are listed |

## Slices

1. **Core spike: pairing by dedupe key.** `computeFindingsDelta` in
   `packages/core/src/delta/findings-delta.ts` pairs the two sets on
   `dedupeKey` and returns the four classes. It records version differences
   (odysseus, findings schema, axe, Lighthouse gate suppression; Playwright
   and Chromium are disclosed only), normalization fingerprint changes and
   crawl config differences. When suppression applies, rows whose severity
   moved count as persistent. Unit tests cover every class, suppression and
   the duplicate-key guard.
2. **Store baseline lookup.** `findDeltaBaseline(connection, { siteUrl,
   startedBefore })` returns the baseline audit row and its findings, or
   `null`. It is tested against the Mongo test service.
3. **Report section.** An optional `delta` field on `GenerateReportInput` and
   `RenderHtmlInput`, the `section-16` renderer, and FR and EN strings
   (French written first). Tests cover the absent field (report unchanged),
   the class tables, the suppression note and the version disclosure.
4. **Orchestration.** `runReportStage` resolves the baseline and computes the
   delta once per render, then passes it in. A missing baseline passes
   nothing.
5. **Docs.** Mark the design as built, add this plan to the index and record
   the build decisions in trade-offs.

## Out of scope

As the design states: scheduled re-scans, deltas across more than two runs,
dashboard surfacing, a standalone delta document, pricing or marketing copy,
and baselines across a site URL change.

## Executable closure contract

This deterministic feature must have proof that matches its claim. Before `DONE`:

- a dependency/static test proves the delta computation/render path has no import or call edge into `@odysseus/llm` or any model client;
- tests prove the baseline query uses the exact delivered/provenance contract described above rather than “latest audit” heuristics;
- every delta class, suppression rule, changed-scope pairing rule and duplicate-key failure has a named focused test;
- a report regression test proves “no baseline” is byte/structure neutral apart from already accepted nondeterminism;
- FR/EN section parity is exhaustive over the closed delta states;
- a requirement-to-proof table maps each Build-time decision and Slice to its owning code and test.

A prose statement that the feature is deterministic is not closure evidence.

---

## Verification

Focused unit tests per slice, then `pnpm run check` and the report and
interface test suites.


## Closure-proof amendment (2026-09-18)

The outcome says the delta is deterministic and that no model writes or ranks
it. That is a binding architecture property, not descriptive prose. Keep these
proofs green:

- dependency-cruiser/static architecture rules prevent the delta core,
  baseline lookup, delta renderer, and report-stage delta orchestration from
  importing `@odysseus/llm` or any model client;
- an integration test installs a failing/spying LLM client and proves rendering
  a re-audit delta makes **zero** model calls for delta classification,
  ordering, wording, or severity;
- committed golden fixtures cover FR/EN output for new/resolved/persistent/
  severity-changed plus suppression/comparability disclosures;
- the baseline query has a store test proving "most recent eligible approved
  earlier audit" over multiple misleading candidates;
- a requirement-to-proof ledger maps every build-time decision above to the
  named implementation and test.

The plan remains open as a completion defect if any of these properties can
only be established by reading the code and agreeing with its intent.


## Definition of done

Plan 051 may move from `IMPLEMENTED` to `DONE` only when:

- every Build-time decision and Slice has a requirement-to-proof row;
- the delta computation/render path has no LLM/model dependency;
- baseline selection, all delta classes, changed-scope pairing, suppression and duplicate-key failure are covered by focused tests;
- no-baseline rendering preserves the ordinary report contract;
- FR/EN delta-state parity is exhaustive;
- focused suites, `pnpm run plans:check`, `pnpm run check` and relevant report/interface tests are green;
- any human acceptance required by the source design is recorded as `Closure evidence:`.


## Requirement-to-proof ledger

Every row names the owning code and a machine-checked proof. No row relies on
reading the code and agreeing with its intent.

| Requirement | Owning code | Proof |
| --- | --- | --- |
| "Delivered" means at least one report approval | `findDeltaBaseline` in `packages/store/src/findings-delta-baseline.ts` | `packages/store/src/findings-delta-baseline.test.ts`: "picks the most recent earlier approved and stamped audit of the same site" (an unapproved later candidate is skipped) and "returns null when no earlier audit was delivered" |
| Baseline query: exact `siteUrl`, strictly earlier, most recent approved, provenance-stamped | `findDeltaBaseline` | `packages/store/src/findings-delta-baseline.test.ts`: the same multi-candidate test. It sets up older, unapproved, unstamped, render-diff, other-site, current and later candidates, and asserts that exactly `delta-delivered` is chosen |
| Any report with a baseline is a re-audit; no flag | `runReportStage` in `packages/interface/src/pipeline/report-stage.ts` | `packages/interface/src/pipeline/report-stage.test.ts`: "passes the findings delta against the delivered baseline audit" and "passes no delta when the site has no delivered earlier audit" |
| Computed at render time, nothing persisted | `computeFindingsDelta` (pure core; `core` has no I/O dependency under the `.dependency-cruiser.cjs` package rules) called from `runReportStage` | `packages/interface/src/pipeline/report-stage.test.ts`: the two tests above assert that the computed delta is passed straight to `generateReportPdf` |
| Baseline findings come from the `findings` collection and `audits` row, not disk artifacts | `findDeltaBaseline` | `packages/store/src/findings-delta-baseline.test.ts`: the baseline test builds the audit and finding rows only (no artifacts on disk) and asserts the exact returned findings |
| A different crawl config never disqualifies and is disclosed | `computeFindingsDelta` `configDifferences`; `renderFindingsDelta` | `packages/core/src/delta/findings-delta.test.ts`: "discloses a different page or depth limit". `packages/report/src/template/sections/findings-delta.contract.test.ts`: golden `crawl-scope-disclosure` (FR and EN) |
| A duplicate dedupe key inside one run throws | `computeFindingsDelta` | `packages/core/src/delta/findings-delta.test.ts`: "refuses runs of different sites, the same audit twice, or a duplicated dedupe key" |
| Conditional `section-16` right after the executive summary | `packages/report/src/template/sections/findings-delta.ts`, `section-registry.ts` | `packages/report/src/template/sections/findings-delta.test.ts`: "adds section-16 after the executive summary only when a delta is passed" |
| Persistent findings are counted, not listed | `renderFindingsDelta` | `packages/report/src/template/sections/findings-delta.test.ts`: the French rendering test asserts the persistent note. `packages/report/src/template/sections/findings-delta.contract.test.ts`: golden `all-classes` |
| Slice 1: every delta class | `computeFindingsDelta` | `packages/core/src/delta/findings-delta.test.ts`: "classifies findings as new, resolved, persistent and changed-severity by dedupe key" and "orders rows within a class by severity, then rule". `packages/report/src/template/sections/findings-delta.contract.test.ts`: "covers every delta class and both suppression causes" |
| Slice 1: suppression when a gating tool version or the normalization changes | `computeFindingsDelta` | `packages/core/src/delta/findings-delta.test.ts`: "suppresses changed-severity and discloses the version when a gating tool changed", "discloses a render-context version change without suppressing severity changes" and "suppresses changed-severity when the normalization fingerprint differs". `packages/report/src/template/sections/findings-delta.contract.test.ts`: goldens `tool-version-suppression` and `normalization-suppression` |
| Slice 1 / Plan 054: changed-scope pairing | `computeFindingsDelta` rescoped pairing | `packages/core/src/delta/findings-delta.test.ts`: the "rescoped findings" block (seven tests). `packages/core/src/delta/findings-delta.normalize.test.ts`: "keeps a shared-scope merged finding persistent when the re-audit reaches one more page" |
| Slice 2: store baseline lookup | `findDeltaBaseline` | `packages/store/src/findings-delta-baseline.test.ts` (Mongo test service) |
| Slice 3: optional `delta` and a report unchanged without it | `RenderHtmlInput.delta`, `renderHtml` | `packages/report/src/template/sections/findings-delta.contract.test.ts`: "keeps the no-baseline report structure identical to the report minus the delta section". It checks the same section order without `section-16`, no delta copy, and byte-identical repeat renders |
| Slice 3: FR/EN parity over the closed delta states | `ReportStrings.findingsDelta` (a compile-time exhaustive interface both languages satisfy) | `packages/report/src/template/sections/findings-delta.contract.test.ts`: "renders %s with the same structure in both languages" for all five states, and ten committed goldens in `packages/report/src/template/sections/__golden__/` |
| Slice 4: orchestration resolves the baseline once per render | `runReportStage` | `packages/interface/src/pipeline/report-stage.test.ts`: "passes no delta when the site has no delivered earlier audit" asserts the `findDeltaBaseline` arguments; "passes the findings delta against the delivered baseline audit" asserts exactly one call |
| Slice 5: docs | `docs/product/findings-delta-reaudit-design.md` (marked built 2026-09-16); trade-off 93 in `docs/decisions/trade-offs.md` | `pnpm run docs:check` |
| No import or call edge from the delta path into `@odysseus/llm` or a model client | `.dependency-cruiser.cjs` rule `findings-delta-has-no-model-path` (transitive `reachable` check from the core delta, the baseline lookup and the delta section to `packages/llm/`, `openai` and `@langfuse`). `report-stage.ts` itself imports no `@odysseus/llm` symbol, and its delta block calls only the store and core functions covered by that rule | `pnpm run architecture:check`. The rule was also checked against a deliberately planted `@odysseus/llm` import in the section renderer, and it failed that check as intended |
| Zero model calls while a re-audit report renders | `renderHtml` with a delta | `packages/report/src/template/sections/findings-delta.contract.test.ts`: "renders the %s re-audit report without calling a model entry point or the network" (FR and EN). Every provider-reaching `@odysseus/llm` export is replaced by a throwing spy, and `fetch` is stubbed. The companion test "spies on the model entry points, so the empty call list below is not vacuous" proves the spy is live |

Closure evidence: closed 2026-09-18 by the ledger above. `pnpm run check`, the
unit suite, the store suite against the Mongo test service, and the e2e suite
all passed at the closing commit. The source design requires no human
acceptance step. The live re-audit of a real delivered site is covered by
Plan 050's post-deploy acceptance rehearsal, not by this plan.
