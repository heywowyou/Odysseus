# Plan 058: Make the paid report fail closed on content and PDF quality

> **Executor instructions**: Follow this plan in order. The objective is not
> "better on average". A client-facing paid report is deliverable only when the
> exact PDF bytes that will be persisted have passed every deterministic,
> editorial, visual, and final-approval gate below. Cost and model-call count
> are explicitly not optimization targets. If the pipeline cannot converge to
> a clean candidate, stop in `needs-operator-review`; never ship the least-bad
> attempt. Run every verification command named by the affected step. Preserve
> unrelated work. When complete, move this file to `plans/archive/`, update its
> row in `plans/README.md`, and record the durable decisions in the owning
> canonical docs.
>
> **Drift check (run first)**:
> `git diff --stat 1899499c2f3d14c19cc350b248008e971d62bb16..HEAD -- CLAUDE.md docs/rules/llm-layer-rules.md docs/rules/report-writing-style.md docs/report/report-design-system.md docs/report/report-design-tokens.md docs/report/report-workbench.md packages/core/src packages/llm/src packages/report/src packages/interface/src/pipeline packages/interface/src/queue packages/interface/src/dashboard packages/store/src/schemas/job.schema.ts scripts/report-workbench.ts deploy`
> If any in-scope file changed, compare this plan's "Current state" with the
> live code before editing. Preserve the outcome and contracts below; adjust
> stale line numbers or seams rather than blindly applying an old excerpt.

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH (paid-report production, model contracts, pagination, job
  phases, and final persistence all change; every failure mode must fail
  closed)
- **Depends on**: plans 027, 033, 039, 050, 051 (all already delivered)
- **Category**: paid-report quality, LLM architecture, PDF render QA
- **Planned at**: commit `1899499c2f3d14c19cc350b248008e971d62bb16`,
  2026-09-17

## Operator decisions (binding)

1. **Quality is the objective. Cost is not.** Do not choose a smaller model,
   fewer review passes, page sampling, or a lower raster resolution merely to
   save API or compute cost. Optimize cost only after the quality contract is
   met and measured unchanged.
2. **Both content and the final visual PDF must be excellent.** Correct prose
   over a broken layout is a failed report. A beautiful PDF containing a bad
   interpretation or wrong count is also a failed report.
3. **The exact emitted PDF is the review artifact.** Reviewing the JSON, HTML,
   or pre-print DOM is necessary but never sufficient. Every physical PDF page
   is rasterized from the candidate PDF and reviewed before that candidate can
   become a stored report.
4. **The model may detect bad data presentation, but scanner evidence remains
   authoritative.** A reasoning model may say that two counts conflict, that a
   noindex conclusion is over-broad, or that 598 findings mostly reflect four
   repeated patterns. It may not silently rewrite `findings.json`, scanner
   evidence, Lighthouse measurements, legal facts, or a canonical count because
   a different value looks more plausible.
5. **No full-document reroll after the first accepted draft.** Corrections are
   targeted patches to the affected structure/prose/layout fields. Rewriting a
   clean section to fix an unrelated defect creates quality roulette and is
   prohibited.
6. **No arbitrary auto-ship limit.** An operational repair-loop ceiling may
   stop an infinite cycle, but reaching it means `needs-operator-review`, never
   "good enough" and never delivery.
7. **Report-page images are allowed model input only for report QA.** This is a
   narrow exception to the current model-input rule: the model still never
   receives raw website HTML or full website page content and never audits a
   website screenshot for new findings. It may receive PNG renders of
   Odysseus's own candidate PDF, plus a bounded page manifest, solely to judge
   the report artifact.
8. **A final operator approval remains.** Automated quality approval means the
   PDF is safe to present for approval; it does not remove the operator's
   existing final review/send decision.

## Why the revised Hôtel Point France PDF changes the plan

The revised PDF produced during the 2026-09-17 review improved the audit's
interpretation and prose substantially, but later inspection still found text
collision/overlap and other formatting defects. That artifact was produced
outside the repository's canonical Paged.js source/edit loop, so its specific
layout failure is **not evidence that the current production renderer always
produces the same defect**. It is nevertheless direct evidence that the prior
architecture proposal was incomplete:

- a strong reasoning model can materially improve the content and still miss a
  visual defect;
- a text/JSON reviewer cannot see a collision in the emitted PDF;
- the current deterministic renderer gates intentionally cover objective
  structural failures but do not prove that no two visible text blocks collide
  or that a page is compositionally clean;
- visual review must operate on the **post-PDF raster**, because a pre-PDF DOM
  can be correct while font embedding, print layout, or PDF emission still
  changes the final appearance.

The new contract is therefore **content review + deterministic layout preflight
+ exact-PDF visual review + final independent approval**, all bound to the same
PDF digest.

## Definition of "perfect" for this product

No software process can prove that every future human will have no aesthetic
preference. This plan uses the strongest operational definition that can be
implemented and audited: **zero known material defects in the exact deliverable
at the moment it is approved**.

A candidate can reach `quality-approved` only when all of the following are
true:

- every scanner-derived finding and count used by the report traces to the
  current findings provenance;
- no major numeric statement conflicts with the canonical fact registry;
- no unsupported site-specific factual claim remains;
- no priority mixes materially different remediation jobs;
- repeated/systemic findings are synthesized rather than presented as hundreds
  of unrelated interventions when the data shows concentration;
- conditional evidence stays conditional (`verify`, `confirm`, `if intended`)
  rather than becoming an unconditional defect or instruction;
- French reads as native, restrained consulting prose; English carries the same
  meaning without translation drift;
- all existing schema, language, WCAG, legal, provenance, render-lint,
  accessibility, pagination, and overflow gates pass;
- no visible text is clipped, overlapped, hidden, duplicated, stranded, or
  rendered outside its intended semantic block;
- numbers, labels, headings, badges, tables, selectors, URLs, and code samples
  remain legible at the final physical page size;
- every physical page of the emitted PDF has been reviewed visually at least
  once by each configured independent visual reviewer, not sampled;
- a holistic document review sees no blocking or major visual/editorial issue;
- an independent final arbiter returns `approve` with zero unresolved blocking
  or major issues;
- the digest reviewed by all final gates is the digest persisted as the client
  report. No render, metadata splice, manual-field edit, or prose mutation may
  happen after approval without invalidating it.

A minor aesthetic suggestion may be recorded without blocking only when both
final reviewers classify it as non-material and the deterministic design
contract is satisfied. Any overlap, clipping, unreadable density, data error,
unsupported claim, misleading synthesis, or incoherent remediation grouping is
never minor.

## Current state

### LLM layer

- `packages/llm/src/constants.ts` has one global `OPENAI_MODEL =
  'gpt-5.4-mini'`. Production structure/reviewer calls use
  `reasoning_effort: 'none'`; writing can accept a reasoning-effort argument
  but production keeps the low-cost/non-reasoning path.
- `packages/llm/src/client.ts` centralizes OpenAI Chat Completions, strict JSON
  schemas, local Zod validation, rate-limit hints, and usage capture.
- `packages/interface/src/pipeline/analysis-stage.ts` runs structure + writing,
  then starts `analyzeReview` and `analyzeCorrectionReview` as advisory
  promises. They do not block selection or mutate the accepted writing.
- `packages/llm/src/correction-review-prompt.ts` deliberately forbids changing
  theme titles, priorities, deterministic facts, or PDF layout. That was the
  correct boundary for plan 033's measurement trial; it is no longer the paid
  report's final quality architecture.
- `docs/rules/llm-layer-rules.md` still correctly states the business rule that
  deterministic scanners detect and the LLM explains/groups/prioritizes. It
  also records the current narrow model-input boundary.

### Report rendering

- `packages/interface/src/pipeline/report-stage.ts` renders a report and then
  immediately writes it to `reports/`, persists the report row, syncs the PDF
  and provenance sidecar, and returns it as a deliverable. There is no
  unpublished candidate/approval boundary.
- `packages/report/src/pdf.ts` already fails closed on important Paged.js
  signatures: `Layout repeated`, blank interior pages, duplicate unique
  fragments, declared bounded units split across pages, and painted element
  boxes leaving the printable content rectangle.
- The current overflow collector deliberately inspects element boxes, not glyph
  paint. Its own comment records that text which paints outside its element box
  is out of scope. Two separate semantic blocks can also collide while both
  boxes remain inside the page rectangle. These are exactly the classes this
  plan adds.
- `docs/report/report-design-system.md` is the visual source of truth and
  `docs/report/report-workbench.md` already establishes the right manual
  principle: inspect PNG pages rasterized from the **production PDF**, not a
  browser approximation.
- `scripts/report-workbench.ts` already invokes `pdftoppm` to rasterize the
  production PDF at 144 DPI. This is a proven seam to factor into production
  quality review rather than inventing a second rendering stack.

### Job/UI layer

- The full-audit phase order ends `normalize -> analyze-fr -> analyze-en ->
  report-fr -> report-en -> complete`.
- Dashboard progress labels currently collapse all model work into report
  writing and all PDF work into generation. The new pipeline needs explicit
  quality stages so the operator can see that a report is being reviewed rather
  than assume generation is stuck and trigger a conflicting action.

## Target pipeline

```text
crawl / scan / Lighthouse / normalize
                │
                ▼
      canonical findings + manifest
                │
                ▼
  1. deterministic Evidence Dossier
     + Fact Registry + concentration map
                │
                ▼
  2. senior remediation planning
                │
                ▼
  3. FR + EN first drafts
                │
                ▼
  4. independent content critics
                │
        issues ─┴─ clean
          │         │
          ▼         │
  5. targeted patches
          │         │
          └────┬────┘
               ▼
  6. deterministic content verification
               │
               ▼
  7. unpublished candidate PDF render
               │
               ▼
  8. deterministic PDF/layout preflight
               │
               ▼
  9. rasterize exact candidate PDF
     + build per-page visual manifest
               │
               ▼
 10. independent visual reviews of EVERY page
               │
        issues ─┴─ clean
          │         │
          ▼         │
 11. bounded content/layout repair
          │         │
          └────┬────┘
               ▼
       rerender exact candidate
               │
               └── repeat 8-11 until clean
               ▼
 12. bilingual parity + holistic document review
               │
               ▼
 13. independent final arbiter on exact digest
               │
        reject ┴ approve
          │         │
          ▼         ▼
 needs-operator   persist EXACT
    -review       approved bytes
```

The scan is still run once. Review and correction operate on saved canonical
artifacts; a report-quality retry never rescans the hotel.

## New canonical quality artifacts

Add serializable schemas/types under a new
`packages/core/src/types/report-quality.ts` (new file; do **not** casually widen
`types/llm-output.ts`) and the corresponding LLM/report helpers. At minimum:

### `AuditEvidenceDossier`

Deterministically produced, never model-authored:

- audit id, findings provenance, scanner/build versions;
- precise scope facts with distinct names: URLs inventoried, pages crawled,
  pages with content analysis, pages with axe results, pages with Lighthouse
  results, complete/partial/failed render counts;
- severity/category totals;
- every normalized finding (all severities) in bounded untrusted-evidence
  form;
- `FindingFamily` aggregates by rule/category/severity/remediation-relevant
  signature: distinct findings, occurrences, affected pages, coverage ratio,
  WCAG criteria, representative finding IDs/selectors/URLs;
- deterministic concentration measures, including the smallest set of families
  accounting for 50%, 80%, and 90% of distinct findings and occurrences;
- Lighthouse medians/quantiles/worst pages from the actual measured set;
- deterministic page-role classification where available (`commercial`,
  `room`, `contact`, `booking`, `editorial`, `archive`, `taxonomy`, `legal`,
  `wrapper`, `unknown`), with source/reason so noindex interpretation can be
  conditional;
- diverted/heuristic findings clearly labelled as such;
- verified site context and legal facts already allowed by current rules.

### `FactRegistry`

A flat stable-ID view over dossier facts. Example IDs:

```text
scope.contentPagesAnalysed
scope.lighthousePagesMeasured
findings.total
findings.accessibility.total
family.colorContrast.findings
family.colorContrast.occurrences
family.colorContrast.pages
performance.lcp.medianMs
performance.tbt.medianMs
```

Every numeric statement generated by a model must either:

- reference a registry fact ID in the structured output; or
- be rejected by the numeric-claim verifier.

The renderer continues to own deterministic template numbers directly. The
model never becomes an arithmetic source of truth.

### `SeniorReportPlan`

Language-neutral planning artifact:

- exhaustive `remediationProjects[]` (no target count);
- each project has `projectKey`, `findingIds`, category, supporting fact IDs,
  likely shared root cause **as an inference**, `rootCauseConfidence`,
  `conditionality`, effort, impact, and rationale;
- `executivePriorityKeys[]` contains only the 3-6 projects that deserve the
  front-of-report priority treatment;
- a project is valid only when all of its findings are plausibly repaired by
  the same work;
- small coherent projects are allowed; unrelated findings are never merged to
  hit an arbitrary theme count.

The current "roughly 8 to 15 themes" target is removed. That target conflicts
with the already-correct rule "one theme = one remediation job" and pressures
large audits into mixed cards.

### `ReviewIssue`

Closed schema shared by content and visual review:

- stable `issueId`;
- `severity: blocking | major | minor`;
- `domain: evidence-integrity | structure | priority | unsupported-claim |
  conditionality | language | repetition | translation-parity | layout |
  overlap | clipping | typography | density | pagination | table | code |
  template`;
- exact field/page/node target;
- evidence/fact references;
- English operator reason;
- `repairRoute` from the closed router below;
- reviewer model, effort, prompt/schema versions and source artifact digest.

### `ReportPatch`

Never a whole-document replacement. Carries only changed addresses and the
review issue IDs that justify each change. A patch can change model-owned
structure/prose or select a bounded layout hint; it cannot mutate findings,
legal facts, scanner metrics, client identity, or report design tokens.

### `ReportQualityRun`

Append-only lineage for one paid-report production run:

- findings provenance and dossier digest;
- source structure/writing artifact IDs;
- every model role + model id + reasoning effort + prompt/schema version;
- every review and patch artifact;
- candidate PDF digest per iteration/language;
- deterministic gate results;
- raster page hashes;
- final reviewer verdicts;
- terminal state: `quality-approved | needs-operator-review | failed`.

No full report prose or page PNG is duplicated into telemetry. Client content
stays in the audit's private artifacts; telemetry remains metadata-only.

## Model-role policy

Replace the single production model constant with role-specific profiles. The
architecture must not depend on one vendor/model name; roles are explicit and
persisted. At implementation time:

- **minimum quality floor for analyst/writer/editor**: `gpt-5.6-sol` with
  `reasoning_effort: high`;
- **independent critic and final/visual arbiter**: use the strongest configured
  current model at `xhigh`/`max` when supported (at plan time the configured
  OpenAI account can use a stronger frontier model than the old Mini path);
- use two independent review contexts. Do not give the critic the writer's
  hidden rationale or earlier conversation;
- where two capable model families are configured, prefer model diversity for
  the second critic/visual review so shared blind spots are less likely;
- if only one high-end model is configured, use separate stateless calls with
  different reviewer prompts. Never fake diversity with temperature alone.

Extend the local `ReasoningEffort` type to every effort supported by the
selected role profiles. Keep all API output schema-constrained and locally Zod
validated. Model/provider failures in a **required** quality stage are blocking;
there is no advisory skip on a paid-report quality run.

The live-model defaults are configuration, not a permanent product contract.
Before promotion, the evaluation in Step 17 chooses the best observed role
assignment on the benchmark corpus; changing a future role model does not
change the pipeline architecture.

## LLM guidance after this plan

### Senior analyst

Instruction priority:

1. explain the actual evidence rather than paraphrasing scanner titles;
2. identify concentration/systemic repetition;
3. distinguish scanner fact from root-cause inference;
4. make one remediation project equal one real repair job;
5. keep conditional evidence conditional;
6. prioritize by severity, breadth, user/business consequence, and realistic
   remediation leverage;
7. never create a finding or mutate scanner evidence.

### Writer

Simplify the current generation prompt. Keep hard safety/terminology rules but
move many anti-slop heuristics from generation into review. The core register:

> Write as a senior French digital consultant preparing a document read first
> by the company director and then handed to the technical provider. Do not
> repeat scanner output. Explain what the evidence means, distinguish systemic
> defects from isolated defects, describe one coherent remediation job at a
> time, and state only what the evidence supports.

Requirements:

- native, restrained French; no alarmism, filler, empty consultant rhetoric, or
  AI-sounding repetition;
- synthesis before enumeration;
- no fixed sentence-count target when a shorter answer is complete;
- no worked prose examples in the runtime prompt that can be copied back;
- facts beyond generic reasoning require fact/finding references;
- clear fact-versus-inference language (`montre`, `suggère`, `semble`) based on
  evidence confidence;
- director-readable significance first, technical action second;
- exact approved terminology for severity/WCAG/legal boundaries remains
  enforced by deterministic guards.

### Content critic

Receives the complete dossier, fact registry, plan, and draft but not the
writer's rationale. It looks for defects, not praise. It must explicitly check:

- all counts/scope labels against the fact registry;
- finding concentration and whether the draft misleadingly equates occurrences
  or repeated findings with separate interventions;
- one-project/one-remediation coherence;
- priority order and missing high-leverage systemic work;
- unsupported causality or site-specific business claims;
- conditional noindex, legal, third-party, heuristic, and wrapper findings;
- contradictory WCAG/severity terminology;
- native-language quality, repetition, canned phrasing and unnecessary length;
- actionability for a real technical provider;
- FR/EN semantic parity when reviewing the pair.

It returns only structured issues; it never rewrites the report directly.

## Closed repair router

Every accepted review issue is routed to exactly one mechanism:

| Route | Used for | Allowed action |
| --- | --- | --- |
| `recompute-fact` | derived count/scope mismatch | deterministic recomputation from canonical artifacts; model cannot supply replacement number |
| `patch-plan` | mixed remediation project, priority, conditionality | targeted `SeniorReportPlan` patch; rewrite only affected language fields afterward |
| `patch-prose` | unsupported claim, weak French/English, repetition, excess length | targeted prose replacement with the same project/fact references |
| `layout-hint` | known content-shape problem | select one predeclared, deterministic layout hint |
| `rerender` | transient render repair after an accepted patch | exact same renderer, no content mutation |
| `template-defect` | no safe bounded repair exists | stop `needs-operator-review`; fix template/source globally, add regression, then resume |

The model never writes arbitrary per-client CSS, JavaScript, HTML, or source
patches during report production. That would make output irreproducible. New
layout behavior enters production only through reviewed source and tests.

## Bounded layout repair system

Add an explicit `ReportLayoutHints` schema keyed by stable report node IDs. It
may express only documented safe transformations, initially:

- `breakBefore`: move a semantic block to a fresh page;
- `keepWithNext`: keep a bounded heading/lead with its first content item;
- `density: normal | compact` for tables/components whose compact variant is
  predesigned and tested;
- `statValue: normal | compact` for unusually long numeric KPI values;
- `titleMeasure: normal | compact` for headings with an approved alternate
  measure/size;
- `disableFlow`: prevent the short-section flow optimization for a specific
  candidate block;
- safe split point selection for long model-owned lists/priority cards where
  the template already exposes bounded split markers.

Every variant lives in canonical CSS/template source and has fixture coverage.
A visual model may **select** a variant; it may not invent one. If a defect
cannot be repaired by prose or a listed variant, delivery stops until the
source template is fixed.

## Exact-PDF visual contract

### Semantic page/node manifest

Before `page.pdf()`, annotate meaningful report components with stable
`data-report-node` IDs (for example `stats.accessibilityOccurrences`,
`priority.p3.header`, `priority.p3.action.2`, `appendix.f123.row.4`). After the
final Paged.js layout/repair pass, collect for each physical page:

- page number and dimensions;
- section id/title;
- each visible report node id, kind, DOM rectangle and short text excerpt;
- each leaf text line rectangle from `Range.getClientRects()`;
- computed font size/line height for text nodes;
- any declared visual invariant (`single-line-number`, `no-split`,
  `table-header`, etc.).

This `ReportPageManifest` is passed to deterministic geometry checks and sent
alongside the raster image to visual reviewers. It is not client-facing.

### Deterministic geometry/text gates

Extend `packages/report/src/pdf.ts` or a focused `packages/report/src/quality/`
module. Keep existing gates and add:

1. **Cross-node text overlap**: visible text-line rectangles belonging to
   disjoint semantic report nodes must not materially intersect. Ignore
   ancestor/descendant pairs and explicitly declared intentional overlays. Use
   a documented pixel/area tolerance for antialiasing/subpixel rounding.
2. **Clipped text**: for any element with non-visible overflow or a bounded
   semantic container, visible text-line rectangles must remain within the
   paintable container with tolerance. Also reject `scrollWidth/clientWidth` or
   `scrollHeight/clientHeight` clipping where the component contract says text
   must fit.
3. **Single-line invariants**: KPI numbers, page counters and other marked
   values must have exactly one line rectangle unless the component explicitly
   permits wrapping. The Point France-style split number becomes an objective
   gate, not a visual preference.
4. **Foreign-node collision**: semantic sibling blocks whose paint/text boxes
   overlap beyond an explicit component allowance are rejected even when both
   are inside the page rectangle.
5. **Heading/lead integrity**: marked heading groups cannot strand their title
   without the required first item.
6. **PDF text sanity**: after PDF emission, run text extraction against the
   emitted bytes and verify expected section titles/key deterministic strings
   remain extractable without the known split-glyph corruption class. This is
   a post-PDF check, not a substitute for visual review.

Pure reduction functions receive collected geometry so unit tests do not need a
browser. DOM collection stays in the report renderer. False positives are
serious because they block paid reports: add narrow semantic markers rather
than broad "all element boxes may not overlap" rules.

### Rasterize the emitted PDF, not the DOM

Factor the proven `pdftoppm` logic out of `scripts/report-workbench.ts` into a
reusable report-quality helper. Production requirements:

- rasterize **every physical page** of each candidate from the actual PDF bytes
  after deterministic PDF preflight;
- 180 DPI minimum for the full-page review corpus;
- automatically re-rasterize any flagged/dense page at 300 DPI for the repair
  verification pass;
- preserve original aspect ratio; no image recomposition or browser
  screenshot substitute;
- compute a hash per raster and bind visual-review artifacts to both page hash
  and candidate PDF digest;
- candidate page PNGs are private temporary quality artifacts. Remove them
  after final approval unless a failed run needs them for operator diagnosis;
  never expose them through public report routes.

`pdftoppm`, `pdftotext`, and `pdfinfo` come from Poppler. Add an explicit
production dependency/preflight in `deploy/`; if it is unavailable, the report
quality stage fails before delivery. Do not silently fall back to reviewing a
pre-PDF screenshot.

## Visual-review strategy

Every candidate page is reviewed; **no sampling**.

For each language/candidate:

1. Build a low-resolution contact-sheet/thumbnail set covering the entire
   document so a reviewer can see rhythm, repeated density, odd sparse pages,
   section transitions and inconsistent component treatment globally.
2. Send full 180-DPI pages in bounded batches sized by input limits. Each batch
   includes the corresponding `ReportPageManifest` records and the condensed
   `ReportVisualContract` derived from the canonical design system.
3. Run **two independent visual reviews**. At least one uses the strongest
   configured visual reasoning model. They must both see every page.
4. Union the blocking/major issue sets after deterministic correlation. A
   blocking/major issue from either reviewer prevents approval until repaired
   or explicitly disproved by a deterministic check plus final arbiter.
5. Re-review every changed/neighboring page at 300 DPI after a visual repair,
   and rerun a holistic contact-sheet review because moving one block can alter
   downstream pagination.

The visual prompt checks concrete failure classes:

- text-on-text overlap/collision;
- clipped or hidden text;
- broken number formatting;
- headers/labels touching content;
- illegible code/selectors/URLs;
- awkward card/table fragmentation;
- orphaned headings or isolated continuation fragments;
- excessively dense prose or tables for the physical page;
- unintended huge voids that read as a broken layout rather than deliberate
  composition;
- inconsistent hierarchy, alignment, margins, spacing or typography versus the
  design contract;
- broken checklist inversion/print treatment;
- appendix continuation/header failures;
- any visual that would make a paying client think the PDF was auto-generated
  without human-quality review.

It does not judge whether the website itself is accessible from an image and
must not invent a new website finding.

## Content/layout repair loop

A quality iteration is:

```text
review issues
   -> correlate/deduplicate
   -> route
   -> apply targeted content/plan/layout patch
   -> re-run ALL deterministic content guards
   -> render a new complete candidate PDF
   -> run ALL deterministic PDF/layout gates
   -> rasterize ALL pages
   -> visual review ALL pages again when pagination changed;
      otherwise changed + neighbor pages at 300 DPI plus whole-document
      contact-sheet review
```

Because pagination can cascade, any patch that changes measured block height or
page breaks triggers a full-page visual re-review. A patch proven not to alter
pagination may use the narrower changed-page rule, but the final acceptance
pass always reviews every page again.

Set an operational ceiling such as `MAX_REPORT_QUALITY_ITERATIONS = 8` only to
prevent a runaway job. Hitting it writes diagnostics and ends
`needs-operator-review`; it never approves the eighth attempt merely because it
is last.

## Exact-digest approval rule

This is non-negotiable:

1. candidate render produces PDF bytes + `pdfDigest`;
2. deterministic PDF gates reference that digest;
3. raster page hashes reference that digest;
4. visual reviews reference that digest;
5. final arbiter references that digest;
6. `persistReport` writes **those exact bytes** and the same digest.

If a manual field, grade override, obligation assessment, analysis, template
version, renderer build, layout hint, or any client-facing input changes after
Step 1, the approval is stale. Regenerate/review. Never approve candidate A and
then persist freshly rendered candidate B.

## Implementation steps

### Step 1: Freeze the quality contract and reproduce the missed visual class

Update the canonical docs first:

- `CLAUDE.md`: retain "scanner detects, model explains" and raw website-content
  prohibition; add the narrow generated-report-image exception from the
  operator decisions above.
- `docs/rules/llm-layer-rules.md`: define required senior/content/visual/final
  passes and the fact-authority boundary.
- `docs/report/report-design-system.md`: add the exact-PDF quality contract,
  semantic node markers, geometry gates, and candidate/approved distinction.
- `docs/report/report-workbench.md`: note that the production pipeline now uses
  the same PDF-native raster principle; the workbench remains the manual
  diagnosis surface.

Add a de-identified synthetic stress fixture that reproduces the classes seen
in the Point France review without committing client content:

- five/six-digit KPI numbers;
- very long French and English headings;
- dense priority prose/actions;
- long URLs/selectors/code samples;
- hundreds of repeated finding rows and 100+ physical pages;
- archive/noindex-heavy evidence;
- a deliberately injected cross-node text collision and clipped single-line
  number for negative tests.

The old gates should demonstrably miss the collision fixture before the new
geometry gate is implemented. Do not commit an intentionally failing default;
encode the negative case through a test helper/variant.

### Step 2: Add role-based model profiles and high-reasoning support

Replace the one global production role assumption with explicit model profiles
in `packages/llm/src/model-profiles.ts` (or a similarly focused module):

```text
senior-analyst
writer-fr
writer-en
content-critic-a
content-critic-b
editor
visual-reviewer-a
visual-reviewer-b
parity-reviewer
final-arbiter
```

Each profile records model id, reasoning effort, temperature (when supported),
output budget and prompt/schema version. Extend `ReasoningEffort` for the
configured frontier models (`xhigh`/`max` where supported). Keep API parsing and
Zod validation visible in `client.ts`.

Production quality roles must never silently fall back to Mini/non-reasoning
because of rate limits. Respect `Retry-After`, wait, and continue. A missing
required model capability fails the quality run.

Add unit tests that every required role resolves to an allowed high-quality
profile and that persisted lineage records the actual model/effort used.

### Step 3: Build `AuditEvidenceDossier` and `FactRegistry` deterministically

Add pure builders under `packages/core`/`packages/llm` from the existing
manifest/findings/performance/render-diff inputs. No model call.

Tests must cover:

- the three different page-count semantics that were conflated in the Point
  France report;
- family concentration arithmetic;
- all-findings inclusion while preserving heuristic/diverted labels;
- representative evidence selection without changing totals;
- noindex page-role grouping (archive/legal/commercial remain distinguishable);
- performance medians/quantiles computed from exactly the measured rows;
- stable fact IDs and provenance digest.

### Step 4: Replace target-count theming with `SeniorReportPlan`

Create a high-reasoning structure call that sees the dossier, all normalized
findings, and verified site context. Remove the "8 to 15" target. Require one
remediation project per coherent repair job and 3-6 executive priorities chosen
from that complete project set.

Hard guards:

- every finding/project ID exists in model input;
- every project has evidence refs;
- no finding can appear in two projects unless the schema explicitly records a
  justified shared dependency (default: reject duplicates);
- project category is compatible with its findings;
- executive priorities are project keys from the same plan;
- root-cause text is labelled hypothesis/confidence, never scanner fact;
- ungrouped critical/serious/moderate findings are surfaced to the critic as a
  major issue rather than silently disappearing.

Persist the plan with findings provenance and model profile.

### Step 5: Rewrite FR/EN writing around the senior plan

The writer receives dossier + fact registry + senior plan; it does not decide
finding membership or priority. Keep the current hard guards that encode
business/legal truth. Simplify style constraints per the LLM guidance above and
remove runtime prose examples that can be copied.

Extend structured writing output with per-field supporting finding/fact refs
for review/validation, but compile approved prose back into the current
`StoredAnalysis` shape consumed by the renderer so the protected core
`llm-output.ts` contract does not need to change in this plan.

Generate French and English from the same language-neutral plan. Persist each
successful language independently as today so a failure never throws away the
other language.

### Step 6: Promote content review from advisory to required

Keep the historical shadow-review artifacts for measurement only if useful,
but paid-report quality uses new required critic schemas.

Run two stateless content critics over dossier + plan + accepted draft. Union
issues, correlate them to exact field/project IDs, and route through the closed
router. `blocking`/`major` issues require a patch. `minor` issues may remain only
under the final definition-of-perfect rule.

Provider/schema failure in a required critic is not `skipped`; pace/retry and
fail the quality stage if unavailable.

### Step 7: Implement targeted plan/prose patching

Add patch calls that receive only:

- the issue(s) being fixed;
- the affected plan/project/field;
- necessary dossier/fact context;
- immutable neighboring context needed to preserve consistency.

They return a `ReportPatch`, never a complete new document. Apply patches to a
copy, validate the whole result, and persist lineage. A structure patch
invalidates/re-writes only the language fields attached to affected projects;
a prose patch cannot change finding membership or priority.

### Step 8: Add deterministic content reconciliation

Before rendering, run a complete non-model verifier:

- findings provenance;
- all referenced finding IDs/project keys;
- numeric claims vs fact registry;
- page-count terminology (`inventoried`, `analysed`, `Lighthouse measured`,
  etc.);
- WCAG version/criterion references;
- severity vocabulary;
- client identity/manual fields;
- legal deterministic splices;
- duplicate/missing priority projects;
- conditional findings language where the plan marks conditional;
- FR/EN structural parity.

Any objective mismatch is blocking. Prefer deterministic insertion of important
counts into template copy where practical; the less free-form arithmetic a
model writes, the better.

### Step 9: Split candidate rendering from final persistence

Refactor `packages/interface/src/pipeline/report-stage.ts`:

- `renderReportCandidate(...)` resolves the same fresh manual/legal inputs and
  renders the complete PDF but writes under a private candidate quality
  directory and creates no client-visible `reports` DB row;
- it returns candidate path/buffer, digest, page count, provenance and page
  manifest;
- `persistApprovedReport(candidate, approval, ...)` verifies the digest and
  then persists/syncs exactly the approved bytes;
- public/report download routes only read approved report rows, never candidate
  artifacts.

Candidates can be synced privately to the artifact bucket for crash recovery,
but they remain unreachable through client/report routes.

### Step 10: Add stable report-node/page manifests

Mark meaningful template components with `data-report-node`. Build a pure,
versioned `ReportPageManifest` collector from the final post-Paged.js DOM.
Ensure Paged.js clones/continuations retain distinguishable physical fragment
IDs while preserving one stable logical node ID.

Add invariants/tests so every executive component, priority row, KPI, table,
appendix rule header/row and glossary item relevant to visual review can be
traced to a stable node or section.

### Step 11: Add deterministic text-overlap/clipping gates

Implement the six deterministic visual gates in the Exact-PDF contract.
Create pure analyzers with fixtures for:

- genuine cross-node overlap;
- 1px rounding/contact that should pass;
- nested text that should not self-collide;
- intentional decorative overlays that contain no competing text;
- clipped overflow-hidden text;
- KPI value split to two lines;
- normal multi-line paragraph;
- long URL wrapping safely;
- header/first-item integrity.

Run the collector on the large stress fixture through real Paged.js. A
synthetic collision must be refused before PDF delivery; the normal stress
fixture must pass.

### Step 12: Add post-PDF preflight and production rasterization

Factor Poppler calls into a focused report-quality utility with explicit
process-error handling and timeouts. Use:

- `pdfinfo` to confirm physical page count/size;
- `pdftotext` (and bbox/layout output where useful) to verify extractability of
  key text and catch text-layer corruption;
- `pdftoppm` for exact page PNGs.

Update VPS deployment/runbook to install/preflight `poppler-utils`. Add a
startup/report-quality capability check that produces a clear blocking error,
not a fallback.

Tests stub process calls at unit level; one e2e test runs the real binaries in
CI/approved environment and proves a candidate's page count/raster count match.

### Step 13: Implement full-page visual-review calls

Add image-capable structured calls in `packages/llm` for the two visual
reviewers. Inputs per batch:

- exact candidate `pdfDigest`;
- page PNGs;
- matching page manifest entries;
- concise `ReportVisualContract` generated from the canonical report design
  docs/tokens;
- explicit rule that these images are the report, not evidence about the hotel
  site.

Output is `ReviewIssue[]` plus per-page `pass` records so missing pages are
machine-detectable. Correlation rejects duplicate/unknown page numbers or node
IDs. A visual run is invalid unless every physical page has exactly one
review-result record from each reviewer.

Add a holistic contact-sheet call after per-page batches. It checks cross-page
rhythm and consistency but cannot override a per-page blocking issue.

### Step 14: Add bounded visual repair + rerender loop

Correlate visual issues and route them:

- text too long/dense -> `patch-prose`;
- known composition variant -> `layout-hint`;
- objective count/data issue -> `recompute-fact`;
- unknown overlap/template weakness -> `template-defect` and operator review.

After every repair, regenerate the **whole** candidate from canonical content +
layout hints. Never patch PDF bytes. Rerun deterministic gates. If pagination
changes, reraster/review every page. If it does not, review changed + adjacent
pages at 300 DPI immediately; final acceptance still reruns all pages at 180
DPI through both reviewers.

Implement the operational iteration cap only as a runaway guard. On exhaustion:
`needs-operator-review`, candidate retained privately, no report row.

### Step 15: Add bilingual parity and final holistic review

Once both language candidates independently pass content + visual gates:

- parity reviewer compares plan/fact references and FR/EN approved prose for
  missing/extra claims, priorities or actions;
- repair language drift by targeted prose patch, rerender/revisual-review the
  changed language;
- run one final holistic review per language over the complete approved-content
  summary plus full-document contact sheet/page manifests.

No language may become deliverable while its pair is stale against a changed
shared plan.

### Step 16: Add independent final arbiter and exact-byte approval

The final arbiter gets fresh context:

- dossier/fact registry digest and high-level facts;
- final plan;
- final prose document;
- deterministic gate results;
- all unresolved/minor review records;
- final PDF digest;
- final all-page visual-review summaries + contact sheet (and any page images
  it requests through the bounded review input builder).

It returns only:

```text
approve
```

or structured blocking/major issues. It does not edit. A rejection routes back
through the same repair system and invalidates the previous visual approval.

On `approve`, persist exactly the candidate bytes whose digest was reviewed.
Store the `ReportQualityRun` sidecar and mark the job ready for operator
approval.

### Step 17: Build the quality evaluation harness before production promotion

Add a read-only command/script that runs the new quality pipeline against saved
audit artifacts without rescanning or publishing. It must record per-role model
usage, elapsed time, iterations and issue categories.

Acceptance corpus:

1. **Hôtel Point France saved audit is mandatory**. The final report must
   preserve the improved interpretation (concentration/systemic defects,
   coherent priorities, conditional noindex handling, reconciled scope) and
   contain zero visible overlap/clipping.
2. Every currently available heterogeneous saved audit up to at least 12
   reports: small/clean, very large, long French names, multilingual, dense
   accessibility, performance-heavy, archive-heavy SEO, long appendix.
3. The adversarial synthetic layout matrix from Step 1.

Promotion rule:

- every corpus report passes deterministic gates;
- both visual reviewers examine every page;
- zero unresolved blocking/major issue;
- operator reads at least the full Point France pair and representative complete
  reports from the other extremes;
- every new real defect discovered during evaluation is converted into a
  deterministic regression, synthetic fixture, prompt/schema rule, or bounded
  layout variant **before rerunning the corpus**;
- the corpus is rerun clean after the last fix.

Use the harness to choose the best role model assignment. Quality wins; no
promotion decision is made from token price.

### Step 18: Extend job phases, progress UI and in-flight guards

Update `JobPhase`, the full-audit phase order, job-outcome classification,
fixtures/tests and dashboard i18n. Keep existing scan phases, then expose at
least:

```text
dossier
plan-report
analyze-fr
review-fr
analyze-en
review-en
parity-review
report-fr
visual-fr
report-en
visual-en
final-review
complete
```

During any of these phases the shared report-production lock remains held.
Regenerate/archive/delete actions that conflict with production stay disabled
and explain the live stage. The operator should never see a generic "already
being produced" error when the UI can say "Visual review · page 47/103" or
"Applying 2 report corrections".

Progress detail may include iteration and pages reviewed, but never client
prose or model chain-of-thought.

### Step 19: Crash/resume and stale-input invalidation

A multi-pass quality run can take minutes and must survive deploys/crashes.
Checkpoint every artifact with its source digests. On resume:

- reuse only artifacts whose findings provenance, plan/draft digest, template
  version, renderer build and relevant manual/legal inputs still match;
- reuse already-approved unchanged pages/reviews only inside the same candidate
  digest; a new PDF digest invalidates page visual approval unless the narrow
  no-pagination-change rule explicitly re-verifies the affected subset;
- never reuse an approval across a changed template/model prompt version unless
  the version contract explicitly says compatibility is safe;
- successful French work is not rerolled because English failed, preserving
  issue #410's current behavior.

### Step 20: Update durable documentation and retire obsolete advisory semantics

After implementation/evaluation:

- update `docs/rules/llm-layer-rules.md` with the production senior pipeline;
- update `docs/rules/report-writing-style.md` with the simplified high-quality
  writer contract and reviewer-owned style checks;
- update `docs/report/report-design-system.md` with exact-PDF visual approval;
- update `docs/report/report-workbench.md` so manual diagnosis uses the same
  node/page terminology;
- update `docs/decisions/trade-offs.md` with why quality review is fail-closed,
  why report screenshots are allowed but website screenshots remain forbidden,
  why arbitrary runtime CSS is rejected, and why exact-digest persistence is
  required;
- mark the old correction/shadow review as historical/advisory only or delete
  dead production wiring after migration, keeping measurement history in Git;
- update the project brief/dashboard IA only where user-visible stages changed.

## Verification matrix

Focused commands are chosen by the slice, then the full gate runs before
promotion.

| Area | Minimum verification |
| --- | --- |
| Core dossier/facts | unit tests for aggregates, concentration, scope semantics, stable IDs |
| LLM schemas/guards | Zod/schema-mirror, prompt, correlation, patch-router and numeric-claim tests; provider calls stubbed |
| Report geometry | `pdf.test.ts`, paged invariants, overflow gate, new overlap/clipping e2e |
| Report accessibility | existing rendered-HTML axe suites |
| PDF-native output | real Paged.js render + Poppler page/text/raster checks |
| Visual regressions | existing checklist baseline plus focused new stable fixture baselines only where DOM geometry cannot prove the defect |
| Pipeline | candidate never creates report row; approved digest persists exact bytes; rejection stays private |
| Job/dashboard | phase order, in-flight lock, progress labels, failure classification, resume |
| Store | Mongo integration for any job/report-quality persistence changes |
| Full repo | `pnpm run format && pnpm run check && pnpm run test` plus relevant `pnpm run test:e2e`/`pnpm run test:all` |

Tests must not call live model APIs. The Step 17 evaluation harness is the
explicit live-model exercise over saved audits.

## Required adversarial layout matrix

The fixture suite must render and pass at least these shapes in both languages:

- short hotel name / extremely long hotel name;
- 1, 4, 5 and 7 digit KPI values;
- zero, few, and hundreds of findings;
- 3, 6, 12 and 20 remediation projects, including one long project;
- long unbroken URL and selector;
- long code snippet;
- long French words/accents and English equivalents;
- one-page and multi-page priority card;
- table split at every plausible page boundary;
- 100+ page appendix;
- near-empty section eligible for flow and same section with flow disabled;
- checklist exactly at its one-page capacity boundary;
- glossary continuation;
- print inversion;
- deliberate collision, clipping, duplicate fragment, blank page and oversized
  box negative cases, each rejected for the correct reason.

Any production visual bug found later becomes a new matrix case before the
source fix is considered complete.

## STOP / fail-closed conditions

Do not approve or persist a client report when any of these occurs:

- stale/missing findings provenance;
- conflicting canonical fact sources that code cannot reconcile;
- required high-quality model role unavailable after paced retries;
- malformed/unvalidated model output;
- unresolved blocking/major content issue;
- deterministic pagination/overflow/overlap/clipping/text sanity failure;
- missing Poppler exact-PDF raster capability;
- any physical page missing either required visual review result;
- unresolved blocking/major visual issue from either reviewer;
- bilingual plan/prose parity failure;
- final arbiter rejection;
- candidate digest changed after visual/final approval;
- quality iteration ceiling reached.

Terminal outcome in these cases is `needs-operator-review` or `failed`, with
private diagnostics. Never degrade to the old unreviewed report path.

## Explicitly rejected alternatives

- **Only use Sol High once at the end.** Better than Mini, but one self-review
  still misses content and visual blind spots.
- **Review HTML/screenshots before PDF only.** The client receives PDF bytes;
  font/print/Paged.js output after that point can differ.
- **Visual-model sampling of executive pages only.** The appendix is part of the
  paid deliverable and can overlap or fragment too. Every page is reviewed.
- **Ask the visual model to write CSS per audit.** Irreproducible and dangerous;
  use bounded layout variants or fix the template globally.
- **Let the model correct scanner data directly.** It may diagnose a
  contradiction, never become evidence authority.
- **Reroll the whole report until a model says it likes it.** That destroys
  already-good work and can oscillate. Patch exact defects and revalidate.
- **Ship after N iterations because cost/time was spent.** The iteration cap is
  an escalation guard, not an acceptance criterion.
- **Keep candidate render and persistence as one function.** It makes exact
  visual approval impossible to bind to the bytes the client receives.
- **Use a smaller/cheaper model for routine pages by default.** Cost is not the
  objective. Prove quality equivalence first, later, before any optimization.

## Definition of done

Plan 058 is implemented only when all are true:

1. paid-report model roles are explicit, high-reasoning and versioned;
2. deterministic dossier/fact registry and senior remediation plan exist;
3. required content critics + targeted patching replace advisory-only quality
   review for paid reports;
4. objective numeric/content reconciliation runs before render;
5. candidate render is private and distinct from approved report persistence;
6. semantic page/node manifests exist;
7. deterministic text overlap, clipping, single-line and existing render gates
   all block bad candidates;
8. exact candidate PDF bytes are rasterized page-for-page in production;
9. every physical page is reviewed by both configured visual reviewers;
10. bounded repair/rerender converges or fails closed;
11. bilingual parity and final independent arbiter are required;
12. persisted report bytes match the exact approved digest;
13. job/dashboard stages expose the review pipeline and prevent conflicting
    actions;
14. crash/resume never reuses stale quality approval;
15. the adversarial layout matrix is green;
16. the full saved-audit evaluation corpus, including Hôtel Point France, is
    rerun clean after the final discovered defect;
17. the operator reads the final Point France PDF and accepts both its content
    and visuals before production promotion;
18. canonical docs/trade-offs describe the shipped contract;
19. full repository validation is green.

The intended end state is simple from the client's perspective: **the only PDF
that can appear as a paid Odysseus report is a report whose evidence, writing,
structure, pagination, typography and every physical page have already been
checked against the exact bytes being delivered.**
