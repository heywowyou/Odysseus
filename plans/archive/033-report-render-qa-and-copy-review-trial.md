# Plan 033: Gate delivery on deterministic render QA and measure an advisory copy-review pass

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If a STOP condition occurs, stop and report. Do not improvise or
> widen the scope. This plan has two deliberately separate tracks: a
> deterministic report-render gate that may block a broken PDF, and an
> evidence-bound LLM copy-review trial that must remain advisory.
>
> **Drift check (run first)**: `git diff --stat e986196..HEAD -- packages/report packages/llm packages/cli/src/commands/analyze.ts docs/rules/llm-layer-rules.md docs/decisions/trade-offs.md`
> If an in-scope file changed, compare the current-state excerpts and named
> contracts below with the live code. A material mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MEDIUM
- **Depends on**: none
- **Category**: report quality and LLM writing
- **Planned at**: commit `e986196`, 2026-09-07

**Archived 2026-09-08 by operator direction.** Delivered: the declared atomic
render-split gate and the advisory correction-review artifact. Deferred: the
generic geometry-overflow gate after its false positive on normal Paged.js
fragments ([#118](https://github.com/heywowyou/Odysseus/issues/118)), the
read-only measurement command because historical artifacts do
not retain the exact writer input, and the 20-pair provider campaign pending
current named-audit authorisation.

## Why this matters

A fresh Villas Foch report exposed a real Paged.js failure: the bounded
executive-summary jump panel left its heading at the foot of page 5 and placed
its three rows at the top of page 6. The immediate template regression is
fixed, but a paid report needs a general delivery gate that detects comparable
render defects before a PDF is returned.

A second model pass can improve prose, but it cannot inspect layout under the
current data boundary. The current reviewer is evidence-bound and shadow-only
because its earlier validation campaign produced systematic false positives.
This plan therefore measures structured correction proposals before any model
output can alter a report, while deterministic code remains the authority for
findings, legal text, pagination, and all exact checks.

## Binding decisions

1. **PDF layout is deterministic QA, not an LLM judgment.** Do not send raw
   HTML, whole pages, report PDFs, or page screenshots to a model. `CLAUDE.md`
   rule 4 and `docs/rules/llm-layer-rules.md` restrict model input to
   normalized findings and site context.
2. **The production render gate may fail closed only on objective signatures.**
   Paged.js layout-repeated errors, blank interior pages, duplicate atomic
   fragments, overflow outside a page content box, and a declared bounded
   panel spanning physical pages are objective. Sparse pages, a page count,
   or aesthetic preference are not failures.
3. **Never make unbounded document groups atomic.** The report design system
   permits bounded cards and rows to use `break-inside: avoid`; an appendix
   group, theme, or other potentially page-tall block must remain splittable.
4. **The correction pass is advisory in this plan.** It may persist a
   structured checklist result and proposed replacements, but must not mutate
   `WritingPassOutput`, retry writing, change selected analyses, or change a
   generated PDF. A later promotion requires measured precision and an
   explicit operator decision.
5. **The model may not introduce or reinterpret a finding.** A proposal can
   only replace an existing guarded prose field and must be checked against
   exactly the `WritingInput` shown to the writer. It must not edit theme
   keys, titles, priorities, finding IDs, categories, severities, evidence,
   page counts, deterministic legal splices, or report-template strings.

## Current state

- `packages/report/src/pdf.ts:53-155` already detects Paged.js's
  `Layout repeated` console failure, blank interior pages, and duplicate text
  from a small atomic-block selector. `renderPdfWithPageCountFromHtml` calls
  this post-pagination check before `page.pdf()`, so those signatures already
  fail delivery.
- `packages/report/src/pdf.ts:298-404` is the one real Paged.js render path.
  It re-runs layout after its bounded appendix-header repair, then emits a
  tagged PDF with an outline. Extend this path rather than creating a second
  renderer or parsing an already emitted PDF to make the decision.
- `packages/report/src/template/paged-invariants.e2e.test.ts` runs the same
  Paged.js pipeline against `buildStressFixture()`. It now has a Villas Foch
  boundary-pressure regression: `[data-start-here]` must remain on one
  physical `.pagedjs_page`, and its computed `breakInside` is `avoid`.
- `packages/report/src/template/checklist-visual-regression.e2e.test.ts`
  demonstrates the approved pixel-baseline pattern. It compares one stable
  synthetic page against a checked-in PNG with a bounded `pixelmatch`
  tolerance. A baseline is evidence, not a button to update until a failure
  disappears.
- `packages/report/src/template/sections/executive-summary.ts` gives the
  bounded three-row jump panel `class="start-here" data-start-here`; and
  `packages/report/src/styles/paged.css` applies `break-inside: avoid` to
  `.start-here`. This is the immediate regression fix and must remain covered.
- `packages/llm/src/analyze-review.ts` calls the current reviewer once and
  converts provider, parsing, or theme-key failures to `{ status: 'skipped' }`.
  It never throws or retries. Its input is exactly `{ writingInput, written }`.
- `packages/llm/src/reviewer-schema.ts` has verdicts only:
  `supported | unsupported | unsure`, plus an English reason. It reviews
  executive summary, notes, each theme business impact, and recommended
  actions. It intentionally excludes titles.
- `packages/llm/src/reviewer-prompt.ts` explicitly says not to judge style,
  tone, language, legal correctness, or deterministic rules. The reviewer is
  therefore not a correction pass today.
- `docs/rules/llm-layer-rules.md` section 12 and trade-off 55 record the
  blocking evidence: the old reviewer systematically marked required generic
  commercial consequences in `businessImpact` as unsupported. It is not
  promotable on that evidence.
- `packages/llm/src/lint-stored-analyses.ts` is the precedent for a
  read-only, log-only measurement command over stored analyses. It exits zero
  and leaves the promotion decision to a human.

## Commands you will need

| Purpose | Command | Expected result |
| --- | --- | --- |
| Report unit checks | `pnpm exec vitest run --project unit packages/report/src/pdf.test.ts packages/report/src/template/sections/executive-summary.test.ts` | all tests pass |
| Report browser checks | `pnpm exec vitest run --project e2e packages/report/src/template/paged-invariants.e2e.test.ts packages/report/src/template/checklist-visual-regression.e2e.test.ts` | all tests pass |
| LLM unit checks | `pnpm exec vitest run --project unit packages/llm/src/analyze-review.test.ts packages/llm/src/reviewer-prompt.test.ts packages/llm/src/reviewer-output-schema.test.ts` | all tests pass |
| Formatting | `pnpm run format` | exit 0 |
| Full static validation | `pnpm run check` | exit 0 |
| Full suite after e2e changes | `pnpm run test:all` | exit 0, except documented pre-existing fixture failures only if separately reproduced and recorded |

The browser checks require Chromium and a local server port. Use the
repository's approved execution path; do not weaken, skip, or rename the e2e
tests to make them run in the unit tier.

## Scope

**In scope**

- `packages/report/src/pdf.ts` and `packages/report/src/pdf.test.ts`
- `packages/report/src/template/paged-invariants.e2e.test.ts`
- A narrowly named report template e2e test and, only if needed, one checked-in
  fixture image under its existing `__fixtures__` convention
- `packages/report/src/template/sections/executive-summary.ts` and
  `packages/report/src/styles/paged.css` only if a new bounded element needs an
  explicit marker or keep-together declaration
- `packages/llm/src/reviewer-*`, `packages/llm/src/analyze-review*`,
  `packages/llm/src/client.ts`, `packages/llm/src/index.ts`, and tests needed
  for an advisory correction-proposal artifact
- The existing CLI analysis orchestration and artifact-writing path, only to
  write a separate insert-only correction-review artifact next to the analysis
- `packages/llm/src/lint-stored-analyses.ts`, or a sibling read-only command,
  for the measurement register
- This plan, `plans/README.md`, `docs/rules/llm-layer-rules.md`, and
  `docs/decisions/trade-offs.md` for verified decisions and evidence

**Out of scope**

- Locked contracts in `packages/core/src/types/findings.ts`,
  `packages/core/src/normalize/severity.ts`, and
  `packages/core/src/types/llm-output.ts`
- A model receiving screenshots, PDF bytes, raw HTML, full page text, or a live
  site fetch
- Automatic rewriting, automatic acceptance, report regeneration, or any
  production retry based on a correction proposal
- Changing scanner findings, priority ranking, legal assessment, legal splice,
  PDF content wording owned by deterministic templates, or client identity
- A maximum report page count, a minimum page-fill percentage, or a generic
  `break-inside: avoid` rule applied to all report containers
- New dependencies, package boundaries, a visual AI service, or a dashboard UI

## Git workflow

- Work on the current operator-directed branch. Do not create, push, or merge a
  branch unless the operator asks.
- Keep the render-gate and LLM-trial changes as separate logical commits if
  they are both implemented.
- Do not add agent or vendor attribution to commits.

## Steps

### Step 1: Write the render-QA contract and characterize current behavior

Before changing production code, write the exact checklist in
`docs/rules/llm-layer-rules.md` only for the model boundary and in the report
design documentation or a focused report test doc for render behavior. The
checklist must classify every candidate check as one of:

- **delivery blocker**: Paged.js layout-repeated bailout; blank non-cover
  physical page; duplicated declared atomic block; declared bounded block split
  across physical pages; or measured overflow outside the printable content
  rectangle;
- **regression fixture only**: stable synthetic screenshot baselines and
  section-specific layout pressure tests;
- **operator observation only**: sparse pages, visual taste, copy density, and
  any issue that cannot be described without subjective judgment.

Use the real Villas Foch defect as the characterization fixture, not as a
client-specific hard-coded page number. The condition is structural: a
bounded start-here panel begins on one physical page and all of its rows remain
on that page.

**Verify**: the focused e2e test fails if `.start-here` loses
`break-inside: avoid`, then passes when the current CSS is restored. Do not
commit an intentionally failing state.

### Step 2: Make the deterministic render checklist a production gate

Extend `packages/report/src/pdf.ts` after the final Paged.js preview and any
appendix repair, before `page.pdf()`:

1. Keep the existing `Layout repeated`, blank-interior-page, and duplicate
   atomic-block failures intact.
2. Define one explicit data attribute for a **bounded** no-split unit, for
   example `data-render-atomic`. Mark only components whose maximum content is
   structurally bounded by the template. Migrate `data-start-here` only if the
   final name and scope make this clearer. Do not infer atomicity from every
   CSS class with `break-inside: avoid`.
3. Inspect the final `.pagedjs_page` DOM and fail when one marked unit appears
   in more than one physical page. Use identity/marker semantics that tolerate
   Paged.js cloning without treating repeated headers or table continuation
   infrastructure as failures.
4. Add an element-box boundary calculation against the printable content box.
   It must identify horizontal or vertical painted content outside its own page
   with a small documented tolerance for subpixel rounding. Exempt Paged.js
   margin boxes, intentional page backgrounds, and the expected repeated
   appendix headers. If a reliable selector and geometry rule cannot be defined
   without false positives, STOP rather than installing a broad overflow gate.
5. Return a diagnostic error naming the structural rule and physical page
   numbers, never client prose. The existing failure form, `Report generation
   aborted: ... Never shipped to a client.`, is the pattern to retain.

Extract pure reduction functions from DOM collection where possible, following
`analyzePagedjsPages` and `describePagedjsStructuralFailure`. Keep DOM access
inside `pdf.ts`; the report renderer remains the sole authority that decides
whether a PDF is deliverable.

**Verify**:

- Add pure unit cases for a normal multi-page document, each blocker, and every
  exemption.
- Extend the real Paged.js test to prove the boundary-pressure fixture contains
  `[data-render-atomic]` on exactly one physical page.
- Add a purpose-built overflowing element fixture that is rejected by the
  production helper and a normal footer/margin fixture that passes.
- Run the report unit and browser commands from the table.

### Step 3: Add limited pixel regressions for stable visual failure classes

Use `checklist-visual-regression.e2e.test.ts` as the exact pattern. Add a
pixel baseline only for a stable, synthetic section where DOM assertions cannot
see the defect, such as a page surface, clipped footer, or text/background
contrast regression. It must:

1. render only the deterministic stress fixture;
2. capture a named physical page or bounded section after Paged.js resolves;
3. use a documented mismatch tolerance justified by rendering variance;
4. retain the baseline in version control; and
5. require visual human inspection before any baseline replacement.

Do not take a baseline of a real client report and do not add a baseline for
every page. Pixel matching is a narrow regression tool, not a claim that it
can judge document quality.

**Verify**: deliberately perturb the synthetic CSS in a local uncommitted
experiment and confirm the pixel test fails, then restore it. The checked-in
test must pass normally.

### Step 4: Specify a distinct advisory correction-review schema

Do not overload `ReviewerPassOutput`: it records whether a claim is supported,
whereas the new pass proposes bounded editorial changes. Create a separate
schema and JSON-schema mirror in `packages/llm` with this minimum shape:

- one record per field address that is eligible for review;
- `field`: an exact, non-free-form address for `executiveSummary`, `notes`,
  `themes(<themeKey>).businessImpact`, or
  `themes(<themeKey>).recommendedActions[<index>]`;
- `checks`: a closed list of zero or more observed concerns, restricted to
  `unsupported-specific-claim`, `unhedged-causality`, `language-quality`,
  `repetition`, and `translation-parity`;
- `verdict`: `keep | propose-change | unsure`;
- `reason`: required English operator-facing rationale that names the input
  evidence or the exact observed wording; and
- `replacement`: required only for `propose-change`, in the report language,
  and otherwise absent.

The prompt must say, explicitly, that generic commercial consequences are not
unsupported. It must never ask for legal correctness or sanction analysis,
never offer a change to an excluded field, and never allow a replacement that
adds a site-specific fact absent from the supplied `WritingInput`.

Use the same OpenAI structured-output posture as `callOpenAiForReview`:
separate max token constant, hand-built API JSON Schema as a hint, and local
Zod parse as the validation authority. Define a strict correlation validator:
the returned set must be exactly the eligible source-field set, with no
duplicate or invented theme key/action index. A malformed, missing, refused,
or mismatched result becomes `skipped`, once, without retry.

**Verify**:

- Schema and schema-mirror tests cover every valid field address, all five
  checklist labels, invalid extra keys, invalid replacement combinations, and
  a foreign theme key/action index.
- Prompt tests pin the generic-consequences carve-out and the prohibition on
  findings, legal text, and layout judgment.
- `analyze-review`-style tests prove a provider failure and correlation failure
  resolve to `skipped`, never throw and never cause a writing retry.

### Step 5: Persist the advisory artifact without changing delivered analysis

Wire the new call only after the normal writing result is accepted. The input
is exactly the same `WritingInput` plus the accepted `WritingPassOutput`; it
must not see the final PDF or a newly fetched site. Persist an insert-only,
timestamped correction-review JSON artifact alongside the existing analysis
and reviewer artifacts, containing:

- model, temperature, and review schema/prompt version;
- source analysis filename or immutable digest;
- outcome (`ok` or `skipped`), including the skip reason when relevant; and
- unmodified structured proposals when `ok`.

The console may print one summary count only. It must not dump client prose,
reasons, or proposed replacements. The report command must continue selecting
the original analysis unchanged, so re-rendering before and after this step
produces equivalent report input.

**Verify**:

- Add CLI-orchestration tests proving the artifact path, insert-only behavior,
  one-line summary, and unchanged analysis/report selection.
- Add a test asserting the correction call is given no HTML, PDF, screenshot,
  URL fetch result, or fields beyond the writer's structured input and output.
- Generate a report from a fixture before and after a successful advisory
  artifact and compare the normalized report input or PDF text as appropriate;
  it must be unchanged.

### Step 6: Run a permissioned measurement campaign and record the decision

Build a read-only measurement command beside `lint-stored-analyses.ts`. It
must take explicit analysis paths and `--language`, print a per-field proposal
register plus totals, and write no analysis, report, database, or selected-pair
state. It may call the provider only after the operator gives current,
audit-specific authorization for the named stored data.

Measure a minimum of 20 paired French/English analysis outputs, chosen to
include high-finding-count audits, low-finding-count audits, and both report
languages. The operator must adjudicate every proposed change as:

- **true useful catch**;
- **valid but not useful editorial suggestion**;
- **false positive**; or
- **unsafe** (unsupported fact, changed finding meaning, legal overreach, or
  translation drift).

Record by checklist category: proposals, useful catches, false positives,
unsafe proposals, skipped calls, input/output tokens, and latency. Compare it
with the existing shadow-reviewer's `unsupported` stream rather than replacing
that stream. Store only aggregate metrics and locally authorized review notes;
do not add client prose to source control.

**Promotion threshold**: this plan does **not** promote the pass. It is eligible
for a separate operator decision only when the sample has zero unsafe proposals
and a documented useful-catch rate that outweighs its false-positive review
burden. A correction pass that merely prefers different prose is not enough.

**Verify**: run the command on an explicitly authorized sample, preserve its
redacted aggregate output in the plan or trade-off record, and have the
operator make an explicit defer, continue-shadow, or promote-to-new-plan call.

### Step 7: Document the result and keep the boundary durable

Update `docs/rules/llm-layer-rules.md` section 12 and trade-off 55 with the
measured correction-review result, including the sample size, error categories,
cost/latency range, and the operator's call. Do not alter the current
shadow-reviewer promotion rule unless measured evidence justifies it.

Update this plan's status in `plans/README.md` after the concurrent outreach
plan that currently owns that file has been committed. Until then, do not
overwrite or merge unrelated index changes; add the row in the next clean-tree
handoff.

## Test plan

- Production render unit tests: page-model reduction, declared-atomic split,
  overflow boundaries, rounding tolerance, and allowed margin/footer elements.
- Paged.js e2e tests: Villas Foch-style boundary pressure, normal bounded panel,
  no false-positive appendix continuation, and no layout-repeated console error.
- Pixel e2e test only where a stable synthetic raster assertion adds coverage
  beyond DOM geometry.
- Correction schema, API-schema mirror, prompt, client, and orchestration tests:
  valid output, malformed output, provider refusal, correlation mismatch,
  generic-commercial-consequence handling, excluded fields, and unchanged
  report selection.
- Measurement command test: explicit input paths, no artifact/database writes,
  accurate category totals, and no client prose in the summary.

## Done criteria

- [ ] Production report generation fails before PDF emission for every objective
  render-QA blocker, with no false-positive fixture failures.
- [ ] The Villas Foch panel regression remains green in the actual Paged.js
  pipeline.
- [ ] Existing tagged-PDF, bookmark, axe, appendix-header, and text-integrity
  report tests remain green.
- [ ] The correction-review output is separately Zod-validated, correlated,
  insert-only, and advisory; it has no code path that edits analysis or report
  output.
- [ ] The correction pass sees only `WritingInput` and `WritingPassOutput`, not
  HTML, PDF, screenshots, or live pages.
- [ ] A permissioned 20-pair minimum measurement register and explicit operator
  decision are recorded before any promotion is proposed.
- [ ] `pnpm run format`, `pnpm run check`, and `pnpm run test:all` pass, with
  any independently reproduced pre-existing exception documented in the
  handoff.
- [ ] `git diff --check` passes and no out-of-scope file is modified.

## STOP conditions

Stop and report rather than improvising if:

- the implementation needs to change a locked `core` contract, add a
  dependency, or move package responsibility;
- a candidate render check needs a subjective threshold such as minimum page
  fill, perceived balance, or “looks good”;
- the only way to assess a proposed layout issue is to send a PDF, screenshot,
  raw HTML, or page content to a model;
- a correction proposal cannot be tied to one allowed existing prose field and
  the exact writer input;
- a correction proposal needs to alter a deterministic legal splice, finding,
  severity, category, priority, theme title, or evidence;
- browser geometry reports ordinary Paged.js fragments or repeated appendix
  headers as broken;
- the measurement sample produces any unsafe proposal; or
- provider calls would use stored client data without current, explicit
  authorization naming the audits to be used.

## Maintenance notes

- Any future bounded visual component should opt in with the explicit
  data attribute and receive a pressure fixture before it is marked atomic.
  Do not make atomicity implicit from a CSS selector.
- The existing reviewer and the advisory correction reviewer answer different
  questions. Keep their schemas, metrics, and promotion evidence separate.
- If the provider/model changes, re-run both reviewer measurement campaigns.
  A model upgrade is not evidence that historical false positives disappeared.
- A vision-based PDF review would be a separate architecture and authorization
  decision. It is intentionally not a shortcut inside this plan.
