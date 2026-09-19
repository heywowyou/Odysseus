# Plan 070: Close measured guard gaps and add one grounded critic with targeted repair

> **Executor instructions:** implement this plan against the latest `main` after
> Plan 067. Rebaseline the named seams before editing. The goal is a measurable
> quality gain on the paid French report without making the pipeline fragile:
> every addition either improves the report or steps aside. Do not revive Plan
> 058/059 roles, adjudicators, vision review, DAG resume, or approval gates.

## Status

- **Priority:** P1
- **Effort:** M
- **Depends on:** 067
- **Execution status:** PLANNED (2026-09-19)
- **Planning rebaseline:** `a95f4d65`
- **Estimated build time (Claude Opus 5, high effort):** about one working day of
  wall-clock time. Slice A: 1-2 hours. Slice B code: 3-5 hours. Calibration:
  1-2 hours of live Luna calls on saved audits plus about 45 minutes of
  operator labeling.

## Objective

Plan 067 made the report grounded and cheap: structure plus one French writing
call, with about twenty deterministic guards and local sanitation. Two gaps
remain:

1. **Measured guard gaps (slice A).** Some fact classes may still reach prose
   without a deterministic check. Close only the gaps that saved hotel analyses
   show exist, and only with checks that have zero false positives on them.
2. **Judgment (slice B).** No check today catches prose that is factually
   bound but wrong in substance: a recommendation that contradicts its own
   theme evidence, a remedy that does not match the finding, an unsupported
   inference the regex guards miss, two themes saying the same thing, unexplained
   jargon. Plan 058's live pilot showed a critic finds these (20 of 22 issues
   accepted in attempt 7). Its pipeline failed on convergence and cost, not on
   the critic's usefulness.

The operating principle:

> **Deterministic checks own facts. One grounded critic flags judgment
> defects. One targeted repair fixes them or the original stands. Anything
> the critic cannot get done becomes an operator warning, never a failed
> report.**

## Why the removed reviewer is not being restored

The advisory reviewer that Plan 067 removed (commit `e5764e3c`) wrote a
`-review.json` file that nothing read, and the 2026-08-29 validation campaign
measured it flagging every `businessImpact` field for stating the generic
consequences the writing prompt required. This plan's critic differs on the
three points that made it useless:

| Removed reviewer | Plan 070 critic |
| --- | --- |
| Free-form verdict per prose field | Closed issue categories, each issue bound to a field path and finding IDs from that theme's packet |
| Output never acted on | Accepted issues drive one targeted repair |
| Never calibrated | Enabled only after a recorded precision measurement on saved audits |

## Binding decisions

### 1. Fail-open, never fail-closed

The critic and the repair are improvements, not gates. On provider error,
schema failure, timeout, an empty issue list, or a repair that fails any
existing guard, the report proceeds exactly as today with the pre-critic
writing output. A critic defect can never fail a full-audit job or block report
rendering. A test proves each fail-open path.

### 2. One kill switch

A single constant `WRITING_CRITIC_ENABLED` in `packages/llm/src/constants.ts`
turns the critic and repair off entirely. With it off, the call graph and output
are identical to Plan 067's path (proved by the existing call-budget test
passing unchanged). No environment variable, no per-job option.

### 3. Call budget

Successful default path per language:

| Situation | Calls |
| --- | --- |
| Critic disabled | 2 fresh / 1 reused structure (Plan 067, unchanged) |
| Critic finds no actionable issue | 3 fresh / 2 reused |
| Critic finds issues | 4 fresh / 3 reused |

The critic gets exactly one attempt; an invalid response is skipped, not
retried. The repair gets exactly one attempt; a rejected repair is discarded,
not retried. So the critic path adds at most two provider calls and no retry
loop.

### 4. Cost ceiling

Measured on the calibration set, the critic plus repair adds at most **$0.15**
per French report at current Luna pricing, and total per-report LLM cost stays
at or below **$0.35**. Both figures come from the existing `call-succeeded`
telemetry token counts, not estimates. Exceeding either blocks enabling until
the prompt or packet is trimmed.

### 5. The critic's scope is prose only

The critic reviews the writing output against the same grounded `WritingInput`
the writer received. It never sees raw HTML, never sees findings from outside
each theme's packet, and never changes:

- theme grouping, membership or count (structure pass, 067 decision 6);
- priority ranking (deterministic backbone, 067 decision 7);
- any deterministic fact, count, legal statement, performance value, appendix or
  representative example (067 decision 1).

### 6. Closed issue categories

The critic output schema allows only these categories:

| Category | Meaning |
| --- | --- |
| `contradicts-evidence` | Prose states something the theme's findings or `performanceEvidence` contradict |
| `unsupported-inference` | A conclusion not established by the cited findings (beyond what the business-claim guard catches) |
| `remedy-mismatch` | The recommended action does not fix the cited findings, or departs from trusted remediation |
| `cross-theme-redundancy` | Two themes make the same point in substance |
| `unexplained-jargon` | A technical term a non-technical owner cannot follow, left unexplained |

Explicitly **not** categories: stating the generic consequence of a real finding
(the known false positive), tone or style preferences, length, anything a
deterministic guard already owns. The prompt names these exclusions.

Each issue carries: `field` (a path from `prose-fields.ts`), `category`,
`findingIds` (non-empty, all from that field's theme packet, executive summary
may cite any), and a short `problem` statement. An issue that names an unknown
field, an unknown or out-of-theme finding ID, or an out-of-scope category is
dropped deterministically (not retried) and counted. The issue list is capped at
12.

### 7. Targeted repair

When at least one issue survives validation:

- One writer call regenerates only the flagged fields' themes (and the executive
  summary if flagged), with the surviving issues passed as correction feedback
  through the existing `previousRejection` style mechanism.
- The repaired output runs through the same `sanitizeWritingOutput` and the full
  `buildWritingGuards` table. If any blocking guard fails, the repair is
  discarded whole and the pre-critic output stands.
- On success, repaired themes replace their originals; every unflagged theme is
  byte-identical to the pre-critic output (tested).
- There is no second critic call on the repaired output.

### 8. Residual issues become operator warnings

Issues the repair did not address (repair discarded, or skipped) are recorded
as `WritingSanitizationWarning` entries with a new code (for example
`critic-unresolved`) and the field path only, following that type's existing
"field path only, never client prose" rule. They surface in the same dashboard
place as today's sanitation warnings. The full critic issue list, with its
`problem` text, is persisted beside the analysis as an operator-only sidecar in
the analyses directory; it is never rendered into a client document.

### 9. English on demand uses the same path

The on-demand English writing call goes through the same writer + critic +
repair function, so there is one code path, not a French special case.

### 10. Model and provenance

Critic and repair use `OPENAI_MODEL` and `OPENAI_REASONING_EFFORT` (trade-off
102). The persisted analysis records whether the critic ran, how many issues it
raised and accepted, and whether the repair was applied, as optional fields so
stored analyses without them stay readable. Critic telemetry uses the existing
`review` pass value; the repair uses `writing`.

## Slice A: measured guard gaps

### A0. Baseline cost and guard behavior (no code change)

1. From telemetry or a saved-audit rerun, record the real token counts and cost
   of the current 2-call path on three saved hotel audits under `artifacts/`.
   This also answers whether production writing calls reach Luna as expected.
2. Run `packages/llm/src/lint-stored-analyses.ts` over every stored analysis in
   `artifacts/` and record what the existing guards would flag.

### A1. Add only the gaps A0 or a known defect shows

Candidate gap (confirm before building): numeric values with units (seconds,
milliseconds, percentages, KB/MB, page counts) in theme prose that do not match
any value present in that theme's writing packet or `performanceEvidence`.
Check first whether `page-count-guard.ts`, `finding-count-guard.ts` and
`performance-evidence-guard.ts` already cover it; if they do, record that and
build nothing.

Any new guard:

- is first added to `lint-stored-analyses.ts` log-only;
- must produce zero false positives across all stored French analyses before it
  joins `buildWritingGuards`;
- repairs at claim level through the sanitation boundary where possible (067
  decision 13) rather than forcing a whole-writing retry.

Not in slice A: text painting past a fixed-width card. `pdf.ts` documents that
`paged.css` overflow-wrap and paged-invariants invariant 6 already own it.

## Slice B: grounded critic and targeted repair

1. **Schema and prompt** (`packages/llm`): critic input (the writer's
   `WritingInput` plus the sanitized writing output), strict Zod output schema
   with the closed categories, JSON schema for structured output, system prompt
   with the exclusions. Reuse `reviewer-*` files where that is simpler than new
   ones; delete what becomes dead.
2. **Issue validation**: a pure function drops invalid issues (decision 6) and
   returns accepted issues plus drop counts.
3. **Orchestration**: one function wrapping `analyzeWriting` that runs critic
   then repair per decisions 1, 3, 7, and 8 behind `WRITING_CRITIC_ENABLED`.
   `analysis-stage.ts` calls it instead of `analyzeWriting` directly.
4. **Persistence**: optional analysis fields (decision 10), the operator-only
   sidecar file, and the new warning code through
   `recordReadyWritingCandidate`. Inspect the stored-analysis reader and the
   dashboard warning display for compatibility.
5. **Calibration (before enabling in production)**: run critic plus repair on
   at least 5 saved French hotel analyses under `artifacts/`, rebuilding each
   `WritingInput` deterministically from stored findings and structure. The
   operator labels every accepted issue real or false, and compares each
   repaired report against the original.
6. **Docs**: new trade-off entry recording this as a deliberate revision of 067
   decision 13's "do not launch another reviewer model"; update
   `docs/rules/llm-layer-rules.md` (call budget, critic contract) and
   `docs/rules/telemetry-rules.md` if the event shape changes.

## Acceptance thresholds

The critic ships enabled only if the calibration record shows all of:

- **precision**: at least 70% of accepted issues labeled real by the operator;
- **no regressions**: on every calibration report the operator judges the
  repaired version equal or better, and every repaired output passes all
  blocking guards;
- **usefulness**: at least one real issue found across the set (otherwise the
  critic is not worth its cost; leave `WRITING_CRITIC_ENABLED` off and record
  why);
- **cost**: within decision 4's ceilings;
- **latency**: critic plus repair adds at most 15 minutes per report.

If precision fails, tighten the prompt or categories once and re-run. If it
fails twice, leave the switch off and record the result; slice A still ships.

## Focused tests

- critic schema: rejects unknown category, empty `findingIds`, over-cap lists;
- issue validation: out-of-theme finding ID, unknown field, and excluded
  category are dropped and counted;
- fail-open: provider error, invalid critic response, repair failing a blocking
  guard, repair provider error each yield the pre-critic output and correct
  warnings;
- targeted repair: unflagged themes byte-identical, flagged theme replaced;
- call budget: 2/1 with the switch off (existing test unchanged), 3/2 on no
  issues, 4/3 with issues, never more;
- residual warnings: field path only, no prose;
- stored analysis without the new optional fields still loads and renders;
- any slice-A guard: positive and negative fixtures, plus the stored-analysis
  zero-false-positive record.

Tests use stubbed providers only.

## Out of scope

- vision or PDF-raster review (revisit only on evidence of visual defects the
  deterministic gates miss);
- adjudicators, second critics, multi-round repair loops, Sol profiles;
- changes to structure, grouping, ranking, report design, appendix;
- blocking a report on critic output;
- new environment variables or per-job critic options.

## Definition of done

1. Slice A baseline cost and stored-analysis lint are recorded; each added guard
   has zero false positives on stored French analyses, or the record states no
   gap was found.
2. The critic and targeted repair exist behind `WRITING_CRITIC_ENABLED`, with
   every fail-open path tested.
3. The call budget and byte-identity guarantees are tested.
4. Residual issues reach the operator as field-path warnings; the sidecar never
   reaches a client document.
5. The calibration record meets the acceptance thresholds and the switch is on,
   or it does not and the switch stays off with the reason recorded.
6. Trade-off entry and `llm-layer-rules.md` match runtime behavior.
7. Typecheck, focused tests and `pnpm run plans:check` are green.

## Executable closure contract

This plan moves to DONE only with a committed requirement-to-proof ledger below
and a `Closure evidence:` record.

| Requirement | Owning seam / artifact | Focused proof required |
| --- | --- | --- |
| baseline cost measured | A0 record in this plan | token counts and cost for three saved audits |
| measured guard gaps only | `lint-stored-analyses.ts`, `writing-guards.ts` | zero false positives on stored French analyses; fixtures per new guard |
| fail-open | critic orchestration | one test per failure path in decision 1 |
| kill switch | `constants.ts` | Plan 067 call-budget test unchanged with switch off |
| call budget | critic orchestration | exact call-count tests for 3/2 and 4/3 |
| closed categories | critic schema + validation | schema and drop-count tests |
| targeted repair | critic orchestration | byte-identity test for unflagged themes; guard-failure discard test |
| operator warnings | report-preparation warnings + sidecar | field-path-only test; sidecar absent from rendered report |
| stored compatibility | analysis reader | legacy analysis fixture loads and renders |
| precision / regressions / cost / latency | calibration record in this plan | operator labels on at least 5 saved audits; telemetry cost figures |
| documented decision | `docs/decisions/trade-offs.md`, `docs/rules/llm-layer-rules.md` | entries present and matching code |
