# Plan 023: Revise the report visual design as a gated, operator-directed redesign

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update this plan's status row in
> `plans/README.md`, unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat ee64918..HEAD -- packages/report docs/report docs/decisions/trade-offs.md plans/README.md .impeccable`
> Plans 018 through 021 are expected to have changed report files before this
> plan starts; that is the point of the gate in "Preconditions". Stop if the
> `.impeccable/config.json` exclusion of `packages/report/**` was removed
> (except by this plan's own step 3 instructions), or if a stored analysis or
> approval contract moved without its trade-off entry.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 018, 019, 020, and 021 all `DONE`, plus an
  operator-approved direction from step 4
- **Category**: design, report
- **Planned at**: commit `ee64918`, 2026-09-01
- **Issue**: none; operator-requested 2026-09-01 after
  `docs/research/design-skill-alternatives.md`

## Preconditions (all must hold before any step)

1. Plans 018 through 021 are `DONE` in `plans/README.md`, including 018's
   French report gate (issue #21) and the review-driven Complexity vocabulary
   work. The report's information architecture is settled; this plan changes
   how it looks, not what it says.
2. The working tree has no uncommitted report files.
3. The operator has scheduled the direction round of step 4 and will attend
   it. This plan cannot be executed unattended past that point.

## Why this matters

The report design was authored by an agent (Claude Design) against a mock
dataset, as `docs/report/report-design-system.md` section 1 records. What
failed then was not the taste but the method: a flattened export that encoded
no rule for real data. The repo replaced it with a real paged-media engine, an
explicit data contract, and a locked stylesheet, and plans 018 through 021
reshape the content on top of that foundation. The visual layer itself,
`nocturne.css`, has never been revised by anyone since.

This plan is the front door for that revision. It uses the Impeccable skill as
a source of evidence only, puts the direction decision with the operator, and
revises the canonical design documents, the stylesheet, and the template
together, with the report's own invariant suites as the acceptance gate. The
report is a EUR 1,600 HT client deliverable with insert-only approvals over
verified render digests (trade-off 44), so a visual change is a contract event,
not a CSS edit.

## Binding decisions

1. **Impeccable is read-only evidence here.** No refine, enhance, or fix
   command of the skill edits report files. Evidence comes from two sources:
   a design-director assessment of rendered pages, and the deterministic
   detector run as
   `node .agents/skills/impeccable/scripts/detect.mjs --json --no-config packages/report/src/template/report.reference.html`
   (and the same command against one rendered page's HTML). `--no-config`
   bypasses the standing ignore for this evidence run only; the hook ignore
   protecting report files stays in place for every other session. Every
   detector finding is then classified in a table as
   `applicable-to-print` or `not-applicable` with a one-line reason. Screen
   -web rules with no print meaning (hover transforms, animation, broken
   -image, marquee, viewport overflow) are expected to fall in the
   not-applicable column; that is the filter working, not evidence to fix.
2. **The operator owns the direction.** The executor presents the evidence
   plus two or three candidate directions. The skill's decision-page tooling
   (`serve-question.mjs`) may present the candidates; its direction-contract
   format (thesis, own-world, story, first viewport, form) is how the chosen
   direction is recorded. No code changes before the operator's pick is
   recorded. The skill's font bans are input, not law: if the operator keeps
   Inter or the dark ground, that decision wins and is recorded.
3. **One coherent front-door slice.** The revision updates
   `docs/report/report-design-system.md`, `docs/report/report-design-tokens.md`,
   the flat sources under `docs/report/design/`, and
   `packages/report/src/styles/nocturne.css` and `paged.css` together, in that
   order, docs first. The design system document's "not open for
   reinterpretation" clause is re-stamped with the new baseline and date. A
   trade-off entry records what changed and why the old look is retired.
   Trade-off 9 stands: the CSS stays hand-maintained from the flat sources;
   no Tailwind build step.
4. **Print determinism is the acceptance gate, not taste.** The paged
   invariants (one numbered section start per page, no blank or duplicated
   pages, no overflow, footers and counters, tagged PDF and outline), the
   glyph-hinting suite, `pdf-text-integrity`, `print-inversion`, and
   `render-html.axe` all pass unchanged in meaning. Any font change
   re-validates glyph hinting under `REPORT_PDF_CHROMIUM_ARGS` and keeps
   `font-display: block` with self-hosted files, because a swap during
   pagination changes page breaks. Guillemets stay U+00A0. The 60-page
   warning path still works. Visual-regression baselines are updated
   deliberately in the same commit as the CSS that changes them, never by
   regenerating on a red suite.
5. **Approval machinery is respected.** Render identity is created before PDF
   generation and approvals are insert-only over verified digests (trade-off
   44). This plan changes render identity, so it states the operational
   consequence explicitly: previously approved reports keep their stored
   digests, and any newly rendered deliverable needs a fresh approval round.
   The plan lists which stored artifacts (if any) the operator must
   re-approve, and does not silently migrate anything.
6. **Bilingual, page by page.** French and English are revised together and
   reviewed together. Strings keep the single-Edit-per-file discipline in
   `strings/fr.ts`, `en.ts`, and `types.ts` if any copy moves at all; the
   default is that wording does not move in this plan.
7. **Fixtures stay honest.** De-identified fixture reports are re-rendered
   through the normal CLI paths, never hand-edited; the committed
   fixture analyses are unchanged because this plan does not touch
   normalization or analysis.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Evidence detector run | `node .agents/skills/impeccable/scripts/detect.mjs --json --no-config <target>` | exit 0 clean, exit 2 findings |
| Render a PDF pair | `pnpm exec tsx packages/cli/src/index.ts report <audit-dir> --language fr` (then `--language en`) | PDFs under `<audit-dir>/reports/`, page count printed |
| Render fixtures | `pnpm exec tsx packages/cli/src/index.ts report fixtures/test-audits/small-site --all` (and `large-rule-families`) | PDFs for both languages |
| Report unit loop | `pnpm exec vitest run --project unit packages/report/src` | all suites pass |
| Report invariant loop | `pnpm exec vitest run --project e2e packages/report/src/template/paged-invariants.e2e.test.ts packages/report/src/template/glyph-hinting.e2e.test.ts packages/report/src/template/pdf-text-integrity.e2e.test.ts packages/report/src/template/checklist-visual-regression.e2e.test.ts packages/report/src/template/print-inversion.e2e.test.ts` | all pass |
| Axe loop | `pnpm exec vitest run --project e2e packages/report/src/template/render-html.axe.e2e.test.ts` | passes |
| Format and check | `pnpm run format && pnpm run docs:check && pnpm run check` | exit 0 |
| Full suite | `pnpm run test:all` | unit and e2e projects pass |

Do not use `pnpm --filter @odysseus/report test`; the report package has no
test script. Run root Vitest with exact paths.

## Steps

### Step 1: Verify the preconditions

Confirm every item in "Preconditions" against `plans/README.md` and
`git status`. Re-run the drift check from the header.

**Verify**: all four report plans `DONE`; clean report tree; the
`.impeccable` exclusion still in place.

### Step 2: Build the evidence pack

Render the current French and English PDFs for one real stored audit (the
standing-authorized La Coorniche directory is the reference) and both
de-identified fixture audits. Convert pages to PNG. Run the detector with
`--no-config` against the reference template HTML and one rendered page, then
classify every finding applicable or not applicable to print. Write a
design-director assessment over the rendered pages: hierarchy, typography,
spacing, cover and metadata sheet impression, checklist usability, appendix
density. Collect the open review residuals already recorded for the report
(issue #21's French gate notes, the plan 018 residual list in
`plans/README.md`, and anything queued in
`docs/report/report-feedback-deferred-items.md`).

**Verify**: the evidence pack exists with page PNGs, the classified detector
table, the assessment, and the collected residuals. No report file changed.

### Step 3: Operator direction round

Present the evidence pack with two or three candidate directions (for
example: refine the incumbent nocturne world; a quieter, lighter print-first
world; a distinct third direction). The operator picks one, or defers the
plan. Record the chosen direction as a direction contract (thesis, own-world,
story, first viewport, form) in the session log and, after step 4, at the top
of the revised design-system document. Record explicitly any skill ban the
direction consciously keeps (for example Inter as a deliberate print face),
so the detector's expected findings on report HTML are known noise.

**Verify**: a written direction pick by the operator, with kept-bans noted.
Without it, the plan stops here.

### Step 4: Revise the canonical design documents

Update the design-system document, the tokens document, and the flat design
sources to describe the chosen direction: color roles, type ramp, spacing,
sheet and margin decisions, cover and metadata sheet treatment, footer and
counter treatment, checklist presentation. Re-stamp the reinterpretation
clause with the new baseline. Draft the trade-off entry (next step commits
it). Everything the CSS will encode exists in words first.

**Verify**: `pnpm run docs:check` exits 0; the flat sources and the two
canonical documents describe the same system; the direction contract appears
in the design-system document.

### Step 5: Implement the visual revision

Apply the direction to `nocturne.css` and `paged.css` from the revised flat
sources, then adjust template files only where the visual system requires it
(class names, structure for new sheet treatments), listing every such file in
the commit. Update the checklist and glyph/visual-regression baselines in the
same commits as the changes they mirror. Do not touch section order, section
registry, pagination invariants' meaning, strings, or any locked contract.

**Verify**: report unit suites pass; the invariant e2e suites pass with the
deliberately updated baselines; `git diff --stat` shows no file outside this
plan's scope.

### Step 6: Full bilingual validation

Render the French and English pair for the reference audit and both fixture
audits. Check page counts against the previous baselines and explain any
movement (a visual redesign legitimately changes page counts; the 60-page
warning must still behave). Run the full gate. Then review the PDFs page by
page with the operator against the revised design-system document, in both
languages.

**Verify**:

```bash
pnpm run format
pnpm run docs:check
pnpm run check
pnpm run test:all
```

All exit 0, and the operator's page-by-page bilingual review is recorded with
paths, page counts, and any accepted residuals.

### Step 7: Record and close

Land the trade-off entry describing the revision, the retired look, and the
approval consequence from binding decision 5. Update `plans/README.md` to
`IMPLEMENTED`. Resolve or re-queue any feedback items the revision closes.
`DONE` waits for the operator's written acceptance of the recorded review.

## Scope

**In scope**:

- `docs/report/report-design-system.md`, `docs/report/report-design-tokens.md`,
  `docs/report/design/**`
- `packages/report/src/styles/nocturne.css`, `paged.css`
- `packages/report/src/template/**` files the visual system requires,
  each listed in a commit message
- report e2e baselines (checklist visual regression and any glyph fixtures)
  updated deliberately
- `docs/decisions/trade-offs.md` (one new entry)
- `.impeccable/config.json` only if the evidence step needs a narrower
  ignore; the report exclusion itself stays
- `plans/README.md`

**Out of scope**:

- locked contracts (`findings.ts`, `severity.ts`, `llm-output.ts`)
- normalization, analysis, scanner, store, llm, cli, interface behavior
- section order, the section registry, pagination contract meaning, or the
  60-page warning threshold
- report wording (strings) except where a visual element is removed outright,
  and then via the single-Edit strings discipline in both languages
- pricing, legal, or offer copy (governed by their rule documents)
- stored approval migration or any silent digest rewrite
- live third-party scans of any kind

## STOP conditions

Stop and report instead of improvising if:

- any precondition fails, including the operator's attendance at step 3;
- the operator defers or rejects a direction at step 3 (that is a legitimate
  plan outcome; record it and stop);
- a glyph-hinting, text-integrity, or pagination failure survives one
  deliberate correction attempt;
- the revision would require touching a locked contract, the approval
  machinery's semantics, or a stored artifact's schema;
- page-count movement cannot be explained by the visual change;
- the detector's report-scope exclusion would have to be widened to let the
  hook run on report files;
- verification exceeds one fix batch per failure class across two rounds;
- a fresh authorization would be needed for any live site action (none is
  expected; everything here is offline).

## Done criteria

- [ ] All four report plans are `DONE` before this plan's implementation.
- [ ] The evidence pack (page PNGs, classified detector table, assessment,
      residuals) exists and drove the direction choice.
- [ ] The operator's direction pick and any consciously kept skill bans are
      recorded.
- [ ] The canonical design documents, flat sources, tokens, and stylesheet
      describe and implement one system, with the reinterpretation clause
      re-stamped.
- [ ] All report unit suites, invariant e2e suites, axe suite, format, check,
      and `test:all` pass.
- [ ] French and English PDFs re-rendered for the reference audit and both
      fixtures; page counts explained; operator page-by-page review recorded.
- [ ] The trade-off entry records the revision and the fresh-approval
      consequence.
- [ ] `IMPLEMENTED` until the operator accepts the recorded review; then
      `DONE` in `plans/README.md`.
