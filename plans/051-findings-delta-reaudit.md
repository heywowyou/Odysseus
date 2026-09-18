# Plan 051: findings delta in the re-audit report

Status: IMPLEMENTED (2026-09-16, issue #371); **closure proof reopened 2026-09-18** for deterministic/no-model architecture evidence.

Source design: [`docs/product/findings-delta-reaudit-design.md`](../docs/product/findings-delta-reaudit-design.md),
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
