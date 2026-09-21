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
- **Execution status:** DONE (2026-09-21): slices A and B shipped; the
  post-`3df2fad7` calibration re-run was performed and labeled; one report
  still regressed, so `WRITING_CRITIC_ENABLED` stays `false` and slice A ships
  alone, exactly as the acceptance thresholds require
- **Closure evidence:** B7 and B8 below; `plan067-writing-contract.test.ts`
  suppressed-action case; registers under
  `artifacts/writing-critic-calibration/2026-09-20T23-53-*`
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

## Execution record

### A0.1 Baseline cost (2026-09-19)

Fresh Luna xhigh calls on saved hotel audits through
`packages/interface/src/pipeline/measure-writing-critic.ts` (the stage's own
`buildStageWritingInput`, telemetry token counts, $0.20/$1.20 per million
input/output tokens). Production writing calls do reach `gpt-5.6-luna`.

| Pass | Audits | Avg input | Avg output | Avg cost | Max cost | Avg latency |
| --- | --- | --- | --- | --- | --- | --- |
| structure | 4 | 9.3k | 9.6k | $0.013 | $0.020 | 57 s |
| French writing | 7 | 15.7k | 23.4k | $0.031 | $0.036 | 123 s |

The current 2-call French path therefore costs about $0.03-0.06 per report
and 3 minutes. On `lacoorniche.com` (110 findings) the fresh structure pass
failed all three attempts: Luna returned more than the schema's 20 themes each
time. That audit's stored structure is still reusable, but a fresh audit of
that size would fail its structure pass. It is outside this plan's scope
(structure is out of scope) and is recorded as a follow-up.

### A0.2 Stored-analysis lint (2026-09-19)

`pnpm exec tsx packages/llm/src/lint-stored-analyses.ts` over `artifacts/`:
111 stored analyses (all `gpt-5.4-mini`, written before the Luna switch).
WCAG citation violations: 0. Business-claim matches: 391, all in analyses
written before Plan 067's sentence-level sanitation, which now removes that
class at claim level. Nothing new for slice A there.

### A1 Measured guard gaps (2026-09-19)

- **Numeric values with units: no gap, nothing built.** A scan of every
  prose field in the 111 stored analyses for numbers followed by ms, s,
  %, KB/MB/Ko/Mo, or px found two matches: "320 pixels" (the WCAG reflow
  width, correct) and a false match on "t3 s’appuie". Page counts, finding
  counts, and executive-summary digits are already owned by
  `page-count-guard.ts`, `finding-count-guard.ts`, and
  `executive-summary-digit-guard.ts`; the performance guard owns suppressed
  metrics. There is no recorded case of an unmatched unit value.
- **Internal theme-key references: gap found, closed.** One stored French
  report (`www.grandhotelbellevue.com`, 2026-09-17) says "Le thème t3
  s’appuie sur…" and "Le thème t8 est dominé par…" in `notes`. The theme key
  is a code-assigned correlation handle that never reaches the report, and
  no guard caught it. `internal-reference-guard.ts` detects a standalone
  lowercase `t<digits>` token; `sanitizeWritingOutput` removes the sentence
  at claim level with the new `internal-reference-removed` warning (067
  decision 13), so no whole-writing retry is spent. It is not added to
  `buildWritingGuards`: sanitation runs first, so a table entry could never
  fire. The lint now logs it: 1 flagged field in 111 analyses, the real
  leak, and zero false positives. Uppercase `T2` (a French apartment type)
  is deliberately not matched.
- **Axe rule IDs in prose (`color-contrast`): left to the critic.** Two
  stored French `notes` fields name the rule ID. Whether that is jargon or a
  useful anchor is judgment, and the bare-word rule IDs (`label`, `list`)
  make a deterministic check false-positive prone; `unexplained-jargon`
  covers it.

### B Slice build (2026-09-19)

- **Deviation from step 3:** the stage calls `analyzeWriting` then
  `critiqueAndRepairWriting` as two steps instead of one wrapper, so the Plan
  067 stage test that mocks `analyzeWriting` keeps its call budget unchanged.
  With the switch off the second step returns the writer result object itself.
- Step 1 reused nothing from the `reviewer-*` files; they were deleted with
  `analyze-review.ts`, and the critic has its own `critic-*` modules.
- The English on-demand path shares the stage code, so decision 9 holds.

### B5 Calibration (2026-09-19)

Seven saved French hotel audits (each input rebuilt from stored findings,
structure and obligation assessment, fallback site context where none was
stored). Two further audits were skipped: `lacoorniche.com` (fresh structure
failure above) and `www.hotel-palais-gallien-bordeaux.com` (stored structure
is stale against the current normalization fingerprint).

| Audit | Themes | Raised | Accepted | Repair | Critic + repair cost | Critic + repair time | Total report cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| haaitza.com | 15 | 11 | 11 | applied | $0.062 | 4.5 min | $0.092 |
| www.grand-hotel-opera.com | 12 | 11 | 11 | applied | $0.059 | 4.3 min | $0.082 |
| www.grandhotelbellevue.com | 12 | 9 | 9 | applied | $0.059 | 4.1 min | $0.112 (with structure) |
| www.villasfoch.fr | 6 | 10 | 9 | applied | $0.054 | 4.1 min | $0.094 (with structure) |
| capdantibes-beachhotel.com | 7 | 2 | 2 | applied | $0.054 | 3.9 min | $0.100 (with structure) |
| grandhotelchicago.paris | 9 | 4 | 4 | applied | $0.038 | 2.8 min | $0.083 (with structure) |
| grandhoteldesalpes.com | 11 | 11 | 11 | applied | $0.055 | 3.8 min | $0.090 |

- **Cost: met.** The critic plus repair adds at most $0.062 (ceiling $0.15);
  the highest total is $0.112 (ceiling $0.35).
- **Latency: met.** At most 4.5 minutes added (ceiling 15).
- **Blocking guards: met.** All 7 repairs passed every blocking guard and were
  applied; none was discarded, no `critic-unresolved` warning arose.
- **Validation:** 58 raised, 57 accepted, 1 dropped (`invalid-shape`).
- **Categories:** `unexplained-jargon` 42, `cross-theme-redundancy` 9,
  `unsupported-inference` 5, `remedy-mismatch` 1, `contradicts-evidence` 0.
  By field: 40 recommended actions, 12 business impacts, 3 notes, 1 executive
  summary, 1 title.
- **Precision and regressions: pending operator labels.** The register, with
  every issue's original and repaired text and a `label` slot, is under
  `artifacts/writing-critic-calibration/2026-09-19T11-*` (gitignored).
- **Risk the labels must settle:** the jargon category dominates, and its
  repairs can remove the exact technical anchor the client's provider needs.
  Example: an action naming `user-scalable=no` and `maximum-scale` in the
  viewport tag became "remove the settings that limit zoom". The rewrite reads
  better to an owner but is less directly actionable. If the operator labels
  these false positives, the one allowed tightening (acceptance thresholds)
  is to keep the technical term and add a plain gloss, or to limit
  `unexplained-jargon` to business impact, summary and notes.

The switch stays `false` until the labels meet the thresholds.

### B6 Labels (2026-09-19)

The operator delegated labeling to Claude Opus 5 (high effort). Each register
issue now carries `label`, `repairVerdict` and `labelNote`, and each register a
`reportVerdict`. The judging standard is `report-writing-style.md`: no
unexplained jargon, but an attribute name the provider will search for (such as
hreflang) stays as written.

- **Precision: met.** 54 of 57 accepted issues are real (95%). The three false
  positives are one generic layout-shift consequence and two "redundancy"
  flags between an accessibility link-name theme and an SEO link-text theme,
  which address different audiences.
- **Usefulness: met.** One genuine remedy error was caught (an `alt` placed on
  the link instead of the image), plus three notes claiming a severity-only
  ranking that the theme order contradicts.
- **No regressions: failed.** Per-field repair verdicts: 18 better, 10 equal,
  26 worse, 3 not comparable. Per report: capdantibes better; grandhotelchicago
  and grandhoteldesalpes equal; haaitza, grand-hotel-opera, grandhotelbellevue
  and villasfoch worse.

Causes of the regressions, in order of weight:

1. **Jargon repairs delete the technical term instead of glossing it** (about
   20 fields): `hreflang`, `balise a` / `href`, `user-scalable=no`,
   `aria-label`, `robots.txt`, `rendu côté serveur`. This contradicts the style
   rule. The repairs that kept the term and added a gloss (hreflang at
   bellevue and grandhoteldesalpes, `sitemap.xml`, `aria-label`, JavaScript)
   were uniformly better.
2. **A flagged summary is rewritten from a subset of the themes.**
   `attemptRepair` sends only the flagged themes, so a flagged
   `executiveSummary` is regenerated without the rest of the report. At
   grandhotelbellevue this turned a specific summary into a generic one to fix
   a single unexplained "JavaScript".
3. **Whole-theme rewrites change unflagged fields.** The repair regenerates
   every field of a flagged theme, so recommended actions reorder or disappear:
   villasfoch lost the decorative-image instruction, and three register rows
   (haaitza t9, grand-hotel-opera t11, grandhotelbellevue t2) compare against
   an unrelated action at the same index. The byte-identity guarantee holds
   for unflagged themes only, and the register's index-based comparison cannot
   show these changes.
4. **Minor drift introduced by the repair:** removed hedges ("peut déposer"
   became "dépose"), and an unsupported "module de réservation" example.

The allowed tightening, before one re-run:

- the critic prompt and the repair feedback require keeping the technical term
  and adding a short plain gloss for `unexplained-jargon`;
- a flagged summary or notes is repaired with every theme as context;
- the repair returns only the flagged fields, which are merged by field path
  so unflagged sentences stay byte-identical;
- the register records every field of a flagged theme before and after,
  matched by field path.

If the re-run still regresses any report, the switch stays off and slice A
ships alone, as the acceptance thresholds require.

### B7 Post-tightening re-run (2026-09-20/21)

The field-path repair, full-context repair input, technical-term glossing and
unflagged-text preservation tightening landed in `3df2fad7`. The same seven
saved French audits were re-run through
`packages/interface/src/pipeline/measure-writing-critic.ts`. Registers:
`artifacts/writing-critic-calibration/2026-09-20T23-53-*` (gitignored).

| Audit | Themes | Raised | Accepted | Repair | Critic + repair cost | Report cost | Report verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| grandhoteldesalpes.com | 19 | 5 | 4 | applied | $0.037 | $0.071 | better |
| www.grandhotelbellevue.com | 16 | 3 | 3 | applied | $0.032 | $0.065 | better |
| www.villasfoch.fr | 15 | 4 | 4 | applied | $0.033 | $0.073 | **worse** |
| haaitza.com | 18 | 9 | 8 | applied | $0.042 | $0.073 | better |
| www.grand-hotel-opera.com | 19 | 1 | 1 | discarded | $0.023 | $0.060 | equal |
| capdantibes-beachhotel.com | 14 | 3 | 3 | applied | $0.033 | $0.067 | better |
| grandhotelchicago.paris | 12 | 4 | 4 | applied | $0.036 | $0.063 | better |

- **Tightening held.** `unflaggedFieldsChanged` is empty on all seven: the
  repair now returns only the flagged fields and they are merged by field
  path, so the B6 regression causes 2 and 3 (summary rewritten from a subset,
  whole-theme rewrites losing unflagged actions) did not recur.
- **Cost: met.** Critic plus repair adds at most $0.042 (ceiling $0.15); the
  highest total report cost is $0.073 (ceiling $0.35).
- **Latency: met.** Critic plus repair adds at most 3.4 minutes (ceiling 15).
- **Validation:** 29 raised, 27 accepted, 2 dropped (1 `invalid-shape`,
  1 `out-of-theme-finding`).
- **Categories:** `unexplained-jargon` 19, `contradicts-evidence` 5,
  `remedy-mismatch` 2, `cross-theme-redundancy` 1,
  `unsupported-inference` 0. By field: 20 recommended actions, 7 business
  impacts, no summary, notes or title.
- **Fail-open observed in the wild:** grand-hotel-opera's single repair failed
  a blocking check and was discarded whole; the pre-critic text stands and the
  defect surfaced as one `critic-unresolved` warning on the field. The
  register records the discard but not its reason, which is logged only —
  worth capturing in the register the next time this script is touched.

### B8 Labels (2026-09-21)

The operator delegated labeling to Claude Opus 5 (high effort), judging
against `docs/rules/report-writing-style.md`. Each register issue carries
`label`, `repairVerdict` and `labelNote`; each register carries
`reportVerdict`.

- **Precision: met.** 27 of 27 accepted issues are real (100%, ceiling 70%).
  The jargon flags now keep the provider-searchable term and add a gloss, the
  behavior B6's tightening asked for. Four `contradicts-evidence` flags were
  checked against the stored evidence and all four were right: lab CLS 0 at
  bellevue and grandhotelchicago, lab LCP 2408 ms (good) at capdantibes, and
  a reversed hreflang return-link direction at haaitza that `f016` and `f028`
  settle.
- **Usefulness: met.** Besides those four factual corrections, the critic
  caught a remedy restricted to image-wrapped links where the findings cover
  every link without discernible text, and a generic 320-pixel action
  duplicating another theme's.
- **No regressions: failed, on one report.** Per field: 20 better, 5 equal,
  1 worse, 1 not applicable (repair discarded). Per report: five better, one
  equal, one worse.

The single regression is villasfoch `t9.recommendedActions[0]`. The flag was
right — the original "action" was a ranking statement, not a remedy — but the
repair told the client to split long JavaScript tasks, and TBT is a
*suppressed* lab recommendation for that audit (field INP 195 ms good, lab
TBT 878 ms poor). The report would then have recommended fixing a signal it
declares non-representative elsewhere.

### A2 Guard gap the re-run exposed, and closed (2026-09-21)

The suppression check only recognized `TBT`, `Total Blocking Time` and
`scripts bloquants`. Plain-language phrasings of the same signal passed
through both `sanitizeWritingOutput` and `findPerformanceEvidenceViolations`.
This is not a critic defect: grand-hotel-opera's *writer* produced the same
violation and no guard caught it either.

`SUPPRESSED_ACTION_PATTERNS` now adds the plain-language phrasings, applied to
recommended actions only, and both seams read the one exported table instead
of the two copies that had drifted apart. Measured log-only over the 125
stored analyses: 13 French and 6 English recommended actions match, every one
a genuine "fix the suppressed signal" instruction, so zero false positives.
The same words appear in 5 titles and business impacts, which are deliberately
left alone: a theme may describe the laboratory observation and say why it is
not the priority. Sanitation removes the offending action at claim level (067
decision 13), so no whole-writing retry is spent, and the guard stays as the
backstop.

### Closure decision — 2026-09-21

The thresholds require *every* calibration report to be equal or better, and
one is worse. This was the one allowed re-run after the one allowed
tightening, so the plan's own rule applies: **the switch stays `false` and
slice A ships alone.**

That is also the right call on the evidence. The critic's judgment is good —
100% precision, four real factual corrections — but a repair that lands in a
client report without the operator reading it can still introduce a contract
violation the deterministic guards did not own. A2 closed the one such gap
this run found. Plan 072's finalization workflow remains the delivery safety
net for any report that needs correction, and the critic can be reconsidered
with a fresh calibration if that workflow shows a class of defect it would
catch.

## Requirement-to-proof ledger

| Requirement | Proof |
| --- | --- |
| baseline cost measured | A0.1 above (4 structure and 7 writing calls) |
| measured guard gaps only | A1 above; `internal-reference-guard.test.ts`, `sanitize-writing-output.test.ts`; lint record 1 of 111, zero false positives |
| fail-open | `writing-critic.test.ts`: critic provider error, invalid critic response, blocking-guard repair, repair provider error |
| kill switch | `writing-critic.test.ts` switch-off case; `analysis-stage.plan067.test.ts` unchanged budget |
| call budget | `writing-critic.test.ts`: 1+1 on no issue, 2+1 with issues, never more |
| closed categories | `critic-schema.test.ts`, `critic-issues.test.ts` |
| targeted repair | `writing-critic.test.ts` byte-identity and summary-only cases |
| operator warnings | `writing-critic.test.ts` field-path-only case; `analysis-stage.plan070.test.ts` sidecar and persistence; `audit-report-panel-model.test.ts` |
| stored compatibility | `writing-critic-compat.test.ts` legacy analysis renders identically |
| measured guard gaps only (second pass) | A2 above; `plan067-writing-contract.test.ts` suppressed-action case; 19 of 125 stored analyses flagged, zero false positives |
| precision / regressions / cost / latency | B7/B8 above: precision 100%, usefulness, cost and latency met; no-regression failed on 1 of 7 reports, so the switch stays off |
| documented decision | trade-off 105; `llm-layer-rules.md` section 15 |

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
