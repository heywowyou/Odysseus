# Plan 067: Lean grounded report generation

> **Executor instructions:** implement this plan against the latest `main`. Start by
> comparing the live code with the "Current state" section below. If a newer commit has
> already changed one of the named report-generation contracts, rebaseline this plan to
> the real seam before editing. Do not revive Plans 058/059, add reviewer agents, or
> redesign the report template to satisfy this plan.

## Status

- **Priority:** P1
- **Effort:** L
- **Risk:** MED - the client-facing report path and bilingual selection contract change,
  but the scanner, findings, report design system, and deterministic appendix stay intact.
- **Depends on:** none; Plans 058-066 remain archived/frozen.
- **Category:** report quality / product simplification
- **Planned at:** `6fc6c03f3a1cedcddb29263bfb46e329ea45f9a5`, 2026-09-19
- **Execution status:** IN PROGRESS (2026-09-19) — implementation and focused proof fixtures landed on `main`; repository-wide command execution is blocked because GitHub Actions fails before any step on both the pre-plan baseline and current `main`, and the saved Villas Foch runtime artifact is not accessible from this session.

## Objective

Improve the normal paid-report path by making it harder for the model to say anything
unsupported, while making the default workflow cheaper and simpler.

The operating principle is:

> **Deterministic truth + tightly grounded Luna writing + no extra reviewer pipeline.**

The scanner/normalizer and deterministic report code own facts. GPT-5.6 Luna explains,
groups and writes from those facts. The normal product path generates French only.
English is an explicit on-demand action that reuses the same structure and evidence.

This is deliberately **not** a successor to Plan 058. No critics, arbiters, multi-agent
repair loop, Sol quality pipeline, corpus-wide quality infrastructure, or new report
design system belongs here.

## Why now - Villas Foch live baseline

The regenerated Villas Foch report after commit `6fc6c03f` is the acceptance baseline.
It validates the parts we should preserve:

- the existing visual design is strong and internally consistent;
- the stable report structure is useful;
- six main priorities plus `Autres constats` and the exhaustive technical appendix
  already create the right executive-to-technical reading order;
- the appendix is detailed enough to preserve finding IDs, URLs, selectors and files.

It also exposes the concrete gaps this plan fixes:

1. priority titles are full imperative sentences rather than short labels;
2. the executive summary repeats formulaic openings and makes commercial inferences
   not established by the audit;
3. one performance priority tells the client to lead with LCP even though the report's
   own deterministic performance section says real-user LCP is good and CLS is the weak
   field metric;
4. the default pipeline still pays for English plus two advisory reviewer calls per
   language even though those reviewer artifacts do not change the report;
5. the writing schema's minimum prose/action counts can force padding;
6. the current selection contract requires a French/English pair even when the client
   only needs French.

The plan fixes those seams and leaves the design system alone.

## Binding product decisions

### 1. The deterministic layer owns facts

The model must not originate or override:

- finding identity, category or severity;
- occurrence/page counts;
- WCAG criteria or conformance mappings;
- legal status, legal citations or obligation facts;
- crawl scope, coverage, provenance or limitations;
- measured performance values or the interpretation of field-versus-lab validity;
- page/component examples;
- trusted technical remediation facts.

When model prose conflicts with deterministic data, deterministic data wins.

### 2. French is canonical; English is optional

A normal full audit/report run produces:

1. structure, when no compatible structure exists;
2. French writing;
3. French PDF.

It does **not** automatically generate English.

Once a French report exists, the dashboard exposes **Generate English version**. That
action reuses the same structure document and exact findings provenance. It must not
modify or replace the selected French analysis.

### 3. Provider-call budget

On the successful default path:

- fresh structure + French writing: **2 provider calls**;
- compatible structure already present + French writing: **1 provider call**;
- Generate English version: **1 additional writing call**.

Schema/provider failures may use the existing bounded retry mechanism. No advisory
review/correction provider call is part of the normal path.

### 4. One writer call, internally self-reviewed

Keep one writing call per requested language.

The writing prompt instructs Luna to draft, check every returned field against the
provided evidence/style rules, revise internally, then return only the final structured
JSON. There is no second self-review call.

### 5. Evidence is partitioned, not dumped

The single writer call may contain all report themes, but each theme receives only:

- that theme's own normalized findings;
- its deterministic category/context;
- trusted remediation guidance for the rule IDs it contains;
- any explicit uncertainty relevant to those findings.

The executive summary receives a separate fixed summary evidence packet: scope/counts,
ranked themes, explicit limitations, reconciled performance evidence and deterministic
obligation status. It must not infer new site facts from raw audit material.

### 6. Theme grouping is model-assisted but bounded

The structure pass still groups findings because semantic remediation grouping is useful.

Change the prompt from "roughly 8 to 15 themes" to:

- aim for **5-8 coherent themes**;
- fewer or more are allowed when required to avoid mixing unrelated remediation jobs;
- coherence always beats the target count.

Keep the defensive schema maximum; do not introduce a hard 8-theme rejection.

### 7. Prioritization keeps the existing deterministic backbone

Do **not** build a new scoring engine.

`applyStructureRankingRules` already gives the product the bounded-hybrid shape decided
in the brainstorm: severity/reach is the primary deterministic order, occurrence
weighting and critical-visibility floors are deterministic, impact/effort is secondary,
and the model rank only survives as a later tie-break.

Preserve that architecture. Any change in this plan may make the ordering inputs more
truthful, but must not return final priority ownership to free-form model judgment.

### 8. Theme titles are short noun phrases

Theme titles are labels, not prose paragraphs.

For French generated titles:

- maximum 80 characters;
- maximum 10 whitespace-delimited words;
- no terminal sentence punctuation;
- reject obligation-sentence scaffolds such as `doit`, `doivent`, `devrait`,
  `devraient`, `il faut`.

Examples of the intended shape:

- `Textes alternatifs des images`
- `Libellés des liens`
- `Hiérarchie des titres`
- `Stabilité visuelle au chargement`

Update the canonical writing-style document and runtime prompt together. Add a focused
title guard; do not rely on prompt wording alone.

### 9. Prose length follows the evidence, not a page target

There is no main-report page target.

Replace the current forced minima with bounded flexibility:

- `businessImpact`: 1-4 sentences;
- `recommendedActions`: 1-4 items.

The prompt explicitly says not to fill the allowance when one sentence or one action is
enough.

### 10. No new unsupported business conclusions

The model may explain the user consequence directly supported by a finding. It may not
turn that into an unmeasured commercial outcome.

Without explicit trusted evidence, do not claim or imply changes to:

- bookings, sales, revenue or conversion;
- demand;
- abandonment;
- trust or reputation;
- relative commercial value of a page/journey.

Remove the current doctrine that a hedge makes an unsupported commercial claim
acceptable. "May reduce bookings" is still unsupported when the audit has no booking
outcome data.

Trusted external benchmark/statistic copy already owned by deterministic report code is
unchanged.

### 11. Trusted remediation first

The report package already owns reviewed per-rule remediation copy and fix snippets.

Expose a bounded remediation-evidence shape to the writing input from that existing
registry. Luna may contextualize or combine the supplied guidance for a theme, but it
must not invent a different technical remedy.

If a rule has no trusted remediation entry, do not manufacture one in the model prompt.
The deterministic report surfaces remain the fallback and the missing registry entry is
visible to tests/maintenance.

### 12. Performance prose uses one reconciled evidence contract

Retire the writer's single `dominantPerformanceMetric` signal as the basis for
recommendations.

Build one deterministic `performanceEvidence` view model from the same measurements
and comparison rules used by the Performance section. At minimum it carries:

- field-data value/status when available;
- laboratory aggregate/status;
- material field-versus-lab discordance;
- whether a lab value is considered non-representative for decision-making;
- the metric(s) the report may legitimately name as the current priority.

The writer receives that packet. It must never recommend a metric as the primary problem
when the deterministic Performance section says that measurement should not guide the
decision.

### 13. Claim-level repair, not report-level punishment

Known semantic guard failures should affect the smallest safe unit.

For unsupported business claims or deterministic contradictions:

- remove the offending sentence/action when removal leaves a valid field;
- otherwise replace only that field with an existing deterministic safe fallback;
- record a compact operator-visible writing warning describing which field was sanitized.

Do not launch another reviewer model. Do not invalidate the other themes because one
sentence was unsafe.

Malformed JSON, wrong language, missing required keys and other output-shape failures may
continue through the existing bounded writer retry path.

### 14. Three simple action levels

Expose one deterministic action-level view for the client report:

- **priority** - the themes selected into the existing main priorities section;
- **important** - remaining work whose worst finding severity is critical or serious;
- **improvement** - remaining moderate/minor work.

Use this only to make the existing report easier to scan. Do not create a numeric score,
a fourth tier, or a new card system. Keep the current severity labels and underlying
technical facts.

### 15. Uncertainty is shown only when it matters

Do not invent a new confidence score.

When an existing structured signal is explicitly inconclusive/partial/unknown and it
changes how the client should interpret or act on the result, render a short qualifier.
Otherwise do not add confidence badges to every finding.

### 16. Representative examples and exhaustive findings stay deterministic

Keep the existing deterministic priority evidence selection for representative
finding/page/count.

Keep one PDF with the exhaustive technical appendix after the executive material. Do not
move finding IDs/URLs/selectors into the model-written prose and do not split the appendix
into another deliverable.

### 17. Preserve the report design system and stable structure

Out of scope by default:

- visual redesign;
- new typography, colours, spacing or card system;
- changing the canonical section order;
- arbitrary page-count targets.

If the new content leaves an otherwise near-empty page like the current Foch page 27,
first remove/rephrase the redundant content or adjust the binding that caused the spill.
Do not redesign the report to hide it.

## Current state at the planning commit

### Generation path

`packages/interface/src/queue/pipeline/run-full-audit-job.ts` currently runs:

1. French analysis;
2. a quota pause;
3. English analysis;
4. both report languages;
5. both languages' advisory passes.

`packages/interface/src/pipeline/regenerate-writing.ts` likewise regenerates French,
then English, records a mandatory pair, approves it, and renders both.

### Analysis path

`packages/interface/src/pipeline/analysis-stage.ts` runs the structure/writer path and
then starts two advisory provider calls for every newly generated language:

- `analyzeCorrectionReview`;
- `analyzeReview`.

They write advisory artifacts but do not alter the selected analysis/report.

### Selection contract

`packages/core/src/report-preparation/preparation.ts`,
`packages/core/src/report-preparation/selection.ts`, and
`packages/store/src/report-preparations.ts` model the selected writing as a mandatory
`AnalysisPairRef { frAnalysisId, enAnalysisId, findingsProvenance }`.

That contract must become French-required / English-optional while remaining able to
read legacy bilingual selections.

### Writer inputs

`packages/llm/src/build-input.ts` already gives each theme only its own findings, which
is the right foundation. It currently passes one coarse
`dominantPerformanceMetric` and no trusted remediation registry data.

### Existing deterministic ranking

`packages/llm/src/structure-ranking.ts` already enforces severity x reach, occurrence
weighting, site-wide accessibility floors and critical visibility. Preserve it.

### Existing report view models

`packages/report/src/template/rendered-priorities.ts` already owns deterministic
representative examples/counts and caps the client-facing priority set at six.

`packages/report/src/template/remediation/**` already owns trusted reviewed fixes.

`packages/report/src/template/sections/findings-appendix.ts` already owns the exhaustive
technical evidence.

## Implementation steps

### Step 0 - rebaseline and characterize

Before changing code:

1. record current HEAD;
2. run `pnpm run check`;
3. run the focused LLM/report/interface tests;
4. capture the existing normal-path provider-call count with mocked provider calls;
5. keep Villas Foch's saved audit as the manual acceptance corpus; no rescan is required.

If HEAD materially changed the seams above, update this plan before implementation.

### Step 1 - make selection French-first and English-optional

Replace the mandatory pair assumption with one typed selection contract whose current
selection contains:

- required French analysis reference;
- findings provenance;
- optional English analysis reference.

Requirements:

- legacy stored bilingual pairs still resolve;
- a French-only selection can be selected/rendered;
- adding English later cannot change the French analysis ID;
- English must match the selected French findings provenance and structure provenance;
- failed English generation leaves the French report untouched.

Update core, store, interface response types and focused migration/compatibility tests.
Avoid a data migration if a read-compatible shape can safely normalize old records at
the store boundary.

### Step 2 - make the normal pipeline French-only

Update full-audit and writing-regeneration orchestration:

- remove automatic English generation;
- remove the FR->EN quota pause from the normal path;
- render/select French as soon as French succeeds;
- do not create placeholder/fake English analyses;
- remove the normal-path call edges to both advisory reviewer passes.

The advisory review code may remain as offline/measurement tooling if still useful, but
normal report generation must not import/call it.

Add a provider-call-count test that proves the successful fresh French path uses exactly
structure + writer, and structure reuse uses only writer.

### Step 3 - add explicit on-demand English

Add one dashboard action and route/service: **Generate English version**.

Preconditions:

- selected French analysis exists;
- current audit evidence/provenance matches that selection;
- no conflicting report-production work is active.

Behavior:

- reuse the selected structure document;
- call only the English writer;
- attach the compatible English analysis to the existing selection;
- generate/update the English PDF;
- leave French analysis/PDF selection unchanged on success or failure.

Use the existing report-production state/lock rather than creating another concurrency
system.

### Step 4 - tighten structure and title behavior

Update:

- `structure-prompt.ts` to the soft 5-8 theme target;
- `writing-prompt.ts` and `report-writing-style.md` so theme titles are short labels,
  not sentences;
- `writing-schema.ts` to remove prose/action padding minima;
- a new or existing focused title guard with the measurable constraints above.

Do not change the six-priority presentation cap in this step.

### Step 5 - build grounded writing packets

Extend `WritingInput` with:

1. per-theme trusted remediation evidence assembled outside `@odysseus/llm` from the
   report remediation registry;
2. a fixed executive-summary evidence packet;
3. reconciled deterministic performance evidence.

Keep scanner text bounded and untrusted exactly as today.

Update the writer prompt:

- use only the supplied evidence;
- no new factual inference;
- business impact means supported user/task consequence, not invented commercial effect;
- recommendations adapt trusted guidance rather than replacing it;
- internally self-review every section before emitting final JSON;
- return final JSON only.

### Step 6 - sanitize unsupported claims locally

Tighten the existing business-claim guard and contradiction checks.

Create one post-parse sanitation boundary that can remove a violating sentence/action or
substitute a deterministic safe fallback for that one field. Persist/report a warning
for operator review.

Tests must prove:

- a bad executive-summary sentence does not discard good themes;
- a bad theme action does not regenerate the whole report;
- a deterministic count/performance/legal contradiction never survives into the selected
  report;
- sanitization cannot silently erase an entire required section without a warning.

### Step 7 - expose simple action levels in the existing template

At the report view-model boundary, derive `priority | important | improvement` from
existing selected-priority membership and worst remaining severity.

Use the current section/card hierarchy. No new visual language.

Keep deterministic representative examples and the exhaustive appendix unchanged.

### Step 8 - canonical docs and acceptance

Update the owning docs, not a new parallel style guide:

- `docs/rules/report-writing-style.md`;
- `docs/rules/llm-layer-rules.md`;
- `docs/decisions/trade-offs.md` only where a durable product trade-off changes.

Then regenerate Villas Foch from its stored scan.

Acceptance review:

- French report is produced without English generation;
- no normal-path advisory provider calls occur;
- priority titles are short noun phrases;
- the executive summary is concise, varied and contains no unsupported commercial
  inference;
- performance priority prose agrees with the deterministic Performance section;
- main report remains a concise decision layer;
- all 61 Villas Foch findings remain represented in deterministic report sections /
  appendix;
- existing PDF file checks pass, including embedded-font checks;
- the existing visual design is preserved;
- if the near-empty methodology spill page still exists, fix the content-level cause,
  not the design system;
- explicitly generating English later uses the same structure/provenance and does not
  change French.

No new scan is needed for this acceptance run.

## Out of scope

- scanner discovery, normalization or finding coverage improvements;
- Plan 059 evidence-approval architecture;
- Plan 058 report-quality pipeline or any Sol/critic/arbiter role;
- new LLM models or a model bake-off;
- report visual redesign;
- replacing the exhaustive appendix;
- legal-regime redesign;
- numeric developer-hour/cost estimates;
- page-count targets;
- general corpus/evaluation infrastructure before there is evidence it is needed.

## Verification commands

Run the focused tests introduced/changed by each step, then at minimum:

```bash
pnpm run plans:check
pnpm run typecheck
pnpm run test
pnpm run check
```

Also run the repository's existing report/PDF e2e or fixture commands that cover:

- French report generation;
- report file integrity/font embedding;
- writing selection compatibility;
- dashboard report actions.

Do not mark DONE from broad suite names alone; the closure ledger below requires focused
proof for every invariant.

## Definition of done

Plan 067 is implemented when all of the following are true:

1. normal report generation is French-only and has the stated 2-call fresh / 1-call
   reused-structure successful-path budget;
2. no normal-path advisory reviewer/correction call remains;
3. English is generated only by explicit operator action and cannot mutate French;
4. current and legacy writing selections resolve safely with English optional;
5. writer inputs contain only theme-relevant findings plus deterministic summary,
   remediation and performance evidence;
6. the Foch LCP/CLS contradiction class is mechanically impossible;
7. theme prompt target is 5-8 without a hard count gate;
8. title constraints are mechanically enforced and the old full-sentence title rule is
   removed;
9. prose/action schema minima no longer force padding;
10. unsupported commercial inference is rejected/sanitized even when hedged;
11. semantic defects are repaired/removed at field/sentence granularity with an operator
    warning rather than triggering a reviewer pipeline;
12. the deterministic ranking backbone remains in force;
13. the three action levels are deterministic and use the existing report structure;
14. the exhaustive appendix and representative-example behavior remain intact;
15. the canonical docs match runtime behavior;
16. focused tests, `pnpm run plans:check`, and repository validation are green;
17. the saved Villas Foch audit passes the manual acceptance checklist above without a
    rescan.

## Executable closure contract

Implementation must maintain a **requirement-to-proof** closure artifact before this plan
can move to DONE. Each row below must name the committed implementation and focused proof
that actually closes it.

| Requirement | Owning seam / artifact | Focused proof required |
| --- | --- | --- |
| French-only default | full-audit + regenerate-writing orchestration | mocked-provider test: no EN call/artifact on default path |
| 2/1 call budget | analysis/orchestration provider boundary | exact call-count test for fresh and reused structure |
| no advisory calls | analysis-stage / normal call graph | focused test or static call-edge proof that normal generation cannot invoke reviewer/correction review |
| on-demand English | route/service + dashboard action | success/failure tests; FR ID unchanged; exactly one writer call |
| optional EN selection | core selection + store normalization | legacy pair, FR-only, later EN attachment, stale provenance negative tests |
| grounded theme packets | WritingInput/build-input boundary | fixture proves theme A cannot see theme B findings; trusted remediation only from registry |
| grounded summary | summary evidence packet | fixture proves counts/limitations/performance are deterministic inputs, not model-derived |
| performance coherence | performanceEvidence builder | Foch-shaped fixture: good field LCP + poor CLS + anomalous lab LCP cannot recommend LCP as primary |
| 5-8 soft grouping | structure prompt/schema | prompt test removes 8-15 instruction; schema still permits justified exceptions |
| noun-phrase titles | style doc + prompt + title guard | positive/negative FR fixtures including current Foch sentence titles |
| no padding minima | writing schema | 1-sentence impact + 1-action theme parses; overlong outputs still fail |
| no unsupported commerce | business-claim guard/sanitizer | bookings/conversion/trust/abandonment/demand fixtures fail even with hedges |
| local sanitation | writing output sanitation | one bad sentence/action removed while unrelated fields remain byte-identical; warning recorded |
| deterministic priority backbone | structure-ranking | existing ranking suite stays green plus regression fixture proving model rank cannot overrule severity/reach |
| action levels | report view model | priority membership + serious/critical + moderate/minor mapping test |
| appendix preserved | report rendering | fixture count/IDs/URLs/selectors remain represented; no model dependency introduced |
| design preserved | report design system + render | Foch manual acceptance; no new visual tokens/layout system without explicit operator amendment |
| font/file integrity | PDF file gate | existing embedded-font e2e stays green on regenerated Foch |

### Closure evidence

**Implementation state, 2026-09-19.** The Plan 067 implementation is on `main` from
the French-first selection/orchestration work beginning at `673ca409` through the
current implementation/proof amendments at `ad0abc58`. The mechanical requirements have
focused proof fixtures committed, but this session cannot claim them green because the
repository validation runner never starts a workflow step. The plan therefore remains
`IN PROGRESS`, not `IMPLEMENTED` or `DONE`.

| Requirement | Committed implementation / focused proof | Session result |
| --- | --- | --- |
| French-only default | `run-full-audit-job.ts`, `regenerate-writing.ts`; `run-full-audit-job.test.ts` (`e118a436`) plus report-preparation/make-report-ready French-only fixtures, including stale legacy-pair refresh proof (`ad0abc58`) | proof committed; normal and stale-refresh paths contain no automatic English analysis/report expectation; not executed in this session |
| 2/1 call budget | `analysis-stage.plan067.test.ts` (`15919cdf`): fresh = structure + writer, reuse = writer only | proof committed; exact mocked call assertions present |
| no advisory calls | production call edges removed from `analysis-stage.ts`; same provider-budget test asserts reviewer/correction-review zero calls | proof committed; static call-graph sweep found reviewer calls only in offline tooling/tests |
| on-demand English | `generate-english-version.ts`, route + dashboard action; `generate-english-version.test.ts` (`1acb5e90`, `b1fe9db9`) | proof committed; provider and render failure both leave selected French untouched; attach occurs only after EN PDF succeeds |
| optional EN selection | French-required `AnalysisSelectionRef`; `selection.test.ts` (`ecab1784`), `report-preparations.test.ts` (`c8a4ce25`), French-only server approval/delivery (`b18c29a2`), audit-detail selected-language API proof (`0e8fc340`) and French-only dashboard approval proof (`98ec9d5a`, `63ac213a`) | proof committed; legacy bilingual reads remain supported and the dashboard now requires English only when it is attached to the selected writing |
| grounded theme packets | `build-input.ts` + report `writing-evidence.ts`; `build-input.test.ts` (`ef6fd316`) and `writing-evidence.test.ts` (`62ca4732`) | proof committed; theme isolation and registry-only remediation asserted |
| grounded summary | `WritingSummaryEvidence` carries site stats, ranked themes, categories, reconciled performance, obligation status and limitations; production threads the obligation-engine status; `build-input.test.ts` (`d96720bd`, `e4a438a4`) | proof committed; summary packet fields are deterministic inputs rather than model-derived facts |
| performance coherence | field/lab reconciliation in `writing-evidence.ts`; `WritingPerformanceEvidence.discordances` explicitly records the authoritative field observation, contradictory lab observation and `labNonRepresentativeForRecommendations`; Villas-Foch-shaped regression in `writing-evidence.test.ts` (`62ca4732`, `80ec01bb`) | proof committed; good field LCP + anomalous poor lab LCP is explicitly marked non-representative and weak field CLS becomes the concern |
| 5-8 soft grouping | `structure-prompt.ts`; `structure-prompt.test.ts` (`a8c73660`) | proof committed; target is soft and defensive schema ceiling remains unchanged |
| noun-phrase titles | style doc + writer prompt + `theme-title-guard.ts`; `plan067-writing-contract.test.ts` (`7eaded92`) | proof committed; <=80 chars, <=10 words, no terminal punctuation or obligation scaffolds |
| no padding minima | writing Zod/output schema now 1-4 impact sentences and 1-4 actions; concise parse proof in `plan067-writing-contract.test.ts` (`808287e7`) | proof committed |
| no unsupported commerce | broadened `business-claim-guard.ts`, no hedge escape; `business-claim-guard.test.ts` (`759dfb58`, `e14271ba`, `c8e1ad45`) | proof committed for bookings, sales, revenue, conversion, demand, abandonment, trust, reputation and relative commercial importance, including hedged forms |
| local sanitation | `sanitize-writing-output.ts` plus persisted dashboard warnings; `plan067-writing-contract.test.ts` (`808287e7`, `fe50f4d1`) | proof committed; business/legal/count/performance defects are removed at sentence/action scope with deterministic fallback when a required field would empty |
| deterministic priority backbone | existing `structure-ranking.ts` retained; existing ranking regression suite including Villas-Foch-shaped severity/reach fixture unchanged | implementation deliberately preserved |
| action levels | main selected priorities => `priority`; remaining critical/serious => `important`; remaining moderate/minor => `improvement`; `rendered-priorities.test.ts` (`6d2d4f01`) and `remaining-work.test.ts` (`b9175166`) | proof committed; report design contract updated to the same mapping |
| appendix preserved | no LLM dependency added to appendix; exhaustive fixture proof in `findings-appendix.test.ts` (`8196e130`) | proof committed |
| design preserved | existing report sections/tokens retained; only existing tag treatment used for action levels | code/design-doc proof committed; subjective Foch render read still pending |
| font/file integrity | existing report/PDF file and embedded-font gates were not weakened | broad/e2e execution pending because validation runner never starts |

**Provider-call before/after characterization.** Before Plan 067, the normal fresh
bilingual model path was structure + French writer + two French advisory calls + English
writer + two English advisory calls: **7 provider calls** on the successful fresh path
(**6** when structure was reused). Plan 067's successful normal model path is **2**
(structure + French writer), or **1** with compatible structure reuse. Explicit English
adds **1** English writer call against the exact selected French structure.

**Validation blocker recorded, not waived.** The required commands
`pnpm run plans:check`, `pnpm run typecheck`, `pnpm run test`, `pnpm run check`
and the report/PDF e2e gates could not be executed from this session. The connected
GitHub Actions workflow is configured for pushes to `main`, but code/proof run
`35413532694` on `ad0abc58` terminated the test, Semgrep and Trivy jobs with
`steps: null` before any workflow step ran. A manual **re-run failed jobs** request was
accepted as attempt 2 and failed identically: all three primary jobs again completed with
`steps: null`, and GitHub's job-log endpoint returned `BlobNotFound` for each failed
job. This is the same pre-step failure shape as baseline run `35406908849` on
pre-implementation commit `741d9849`. The local container also cannot resolve
`github.com`, so it cannot clone the checkout as a substitute. These are
execution-environment failures, not green or red repository test results.

**Villas Foch acceptance blocker recorded, not waived.** The named saved corpus is
`artifacts/www.villasfoch.fr/2026-09-03T20-44-46Z/`; repository docs confirm it
exists on runtime/bucket storage, but the artifact itself is gitignored/not committed and
this session has no VPS/object-store/SSH connector. A direct repository fetch of that
saved-artifact directory returned GitHub 404, while `docs/report/audit-rehearsal-notes.md`
still records the same runtime path. No rescan was attempted. The deterministic
Foch LCP/CLS failure class is covered by the committed regression fixture, but the saved
audit regeneration, 61-finding appendix count, PDF/font gates and subjective final read
remain pending until that existing artifact is reachable.

Do not move this plan to `IMPLEMENTED` until the repository commands above actually run
green. Once they do, the saved-data Villas Foch regeneration/manual read is the remaining
acceptance step; no new website scan is required.
