# Plan 024: Close three small gaps between the report and Conseil papa

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 018, 019
- **Category**: report copy and template
- **Planned at**: commit `HEAD` at plan authoring time, 2026-09-01

## Why this matters

A line-by-line audit of `docs/report/feedback/Conseil papa.txt` against plans
018-020 found three items the plans dropped or left ambiguous:

1. The "Vos trois prochaines actions" heading is the exact phrase papa
   objected to ("le lecteur est le chef d'entreprise, le VOS n'a aucun sens
   puisque ce n'est pas lui qui va exécuter ça"), and plan 018 step 5
   explicitly told the executor to keep it. This is a plan-authoring error,
   not a coding oversight.
2. Papa's all-caps stylistic rule ("TOUJOURS AVOIR DES PHRASES AVEC VERBES
   SUJET COMPLEMENTS ET DES VIRGULES") was never encoded anywhere: not in
   `docs/agents/coding-conventions.md`, not in `docs/rules/llm-layer-rules.md`,
   not in `packages/llm/src/writing-prompt.ts`.
3. Papa wrote "Glossaire doit toujours être en dernier." Trade-off 44 instead
   made the technical appendix final, glossary second-to-last. The operator
   has now confirmed (2026-09-01): glossary goes last, appendix moves to
   second-to-last. This reverses trade-off 44's ordering decision; its
   traceability/single-artifact reasoning is otherwise unaffected and does
   not need to change, only its stated order does.

None of these touch a locked contract (`findings.ts`, `severity.ts`,
`llm-output.ts`), Paged.js pagination mechanics, or any finding/severity
semantics. All three are copy, prompt-instruction, and section-order changes.

## Current state

- `packages/report/src/template/strings/fr.ts:43` /
  `packages/report/src/template/strings/en.ts:42`: `nextActionsHeading` is
  `'Vos trois prochaines actions'` / `'Your three next actions'`. Used in
  exactly one place, `packages/report/src/template/sections/report-intro.ts:210`,
  as a plain `<h5>`. `report-intro.test.ts:177,194` assert against the
  string constant, not hardcoded text, so a value change needs no test
  rewrite.
- `packages/llm/src/writing-prompt.ts` already injects several targeted
  style/content guardrails as appended prompt notes (`findingNounNote`,
  `businessClaimNote`, the `title`/`businessImpact` field instructions around
  lines 82-88). There is no sentence-structure instruction among them.
- Section order is `SECTION_IDS` in
  `packages/report/src/template/section-registry.ts:8-37`, currently
  `... 'section-11', 'section-13', 'section-12'` (methodology, glossary,
  appendix). `renderBody()` in
  `packages/report/src/template/render-html.ts` calls `renderMethodology`,
  then `renderGlossary(ord('section-13'), ...)`, then
  `renderFindingsAppendix(ord('section-12'), ...)` last, matching that order.
  `computeSectionNumbers()` derives display numbers live from this array, so
  reordering it is sufficient to renumber both the TOC and every section's own
  "NN ·" eyebrow; no numbers are hardcoded.
- Six places state or assert "technical appendix last" and must move together:
  `CLAUDE.md:359-364` (trade-off 44 summary), `docs/decisions/trade-offs.md:2247-2267`
  (trade-off 44 full write-up), `docs/report/report-design-system.md:66,88`,
  `packages/report/src/template/section-registry.ts:34` (comment) and its
  ordering array, `packages/report/src/template/render-html.ts:120` (comment)
  and the two render calls, and two test files:
  `packages/report/src/template/section-registry.test.ts:41-76` and
  `packages/report/src/template/paged-invariants.e2e.test.ts:274,303,305`.
- `packages/report/src/template/sections/toc.ts:22-40` groups the TOC into six
  narrative groups; `methodVocabularyGroupLabel` currently holds `['section-11',
  'section-13']` and `technicalAppendixGroupLabel` holds `['section-12']`. With
  glossary moved after the appendix, `section-13` cannot stay inside the
  "method and vocabulary" group and read as one coherent block ahead of
  "technical appendix" — pick one of: (a) keep the group but reorder so
  `technicalAppendixGroupLabel` comes before `methodVocabularyGroupLabel` in
  the `groups` array with `methodVocabularyGroupLabel` trimmed to `['section-11']`
  and a new bottom-of-list placement for `section-13`, or (b) give glossary its
  own trailing TOC group. Decide during step 3 by checking which reads better
  in the rendered TOC; either is acceptable, but the six-group narrative
  ordering documented in trade-off 44 must stay internally consistent with
  whatever is chosen.
- `packages/report/src/template/sections/glossary.ts:112` and
  `packages/report/src/template/sections/findings-appendix.ts:755` each pass
  their own section ID to `renderSheetHeader`/`sheet()` already; they do not
  hardcode "last" anywhere, so no change needed inside either file beyond the
  registry/render-order swap.
- `packages/report/src/template/sections/report-intro.ts:140` cross-references
  `['section-04', 'section-05', 'section-12']` in `scopeNote`'s prose
  (`sections` list of "read next" pointers); confirm this list does not encode
  an assumption that section-12 is the literal last section before touching
  it, and update only if it does.

## Scope

**In scope**:

- `packages/report/src/template/strings/fr.ts`, `en.ts` (heading string only)
- `packages/llm/src/writing-prompt.ts` and its focused tests
- `packages/report/src/template/section-registry.ts` and
  `section-registry.test.ts`
- `packages/report/src/template/render-html.ts` (render-call order and
  comment)
- `packages/report/src/template/sections/toc.ts` and its test
- `packages/report/src/template/paged-invariants.e2e.test.ts`
- `packages/report/src/template/sections/report-intro.ts` (cross-reference
  list only, if it needs it)
- `CLAUDE.md` (trade-off 44 line)
- `docs/decisions/trade-offs.md` (trade-off 44 entry)
- `docs/report/report-design-system.md`
- `plans/README.md`

**Out of scope**:

- any locked contract (`findings.ts`, `severity.ts`, `llm-output.ts`)
- pagination CSS, Paged.js mechanics, or the appendix's internal continuous
  flow (trade-off 17 stays as-is; only which physical position the appendix
  and glossary sheets occupy changes)
- the book-style title brainstorm (separate, still in progress, not part of
  this plan)
- item 7/8 from the audit (SCQ opening tone, closed-form remediation
  phrasing) — flagged as needing a live-PDF read, not yet scoped as work

## Steps

### Step 1: Reword the next-actions heading

Change `nextActionsHeading` in `fr.ts`/`en.ts` from `'Vos trois prochaines
actions'` / `'Your three next actions'` to a phrasing that does not imply the
reader personally executes the work — for example `'Les trois actions à
lancer en priorité'` / `'The three actions to launch first'`. Keep it short
enough to sit comfortably as an `<h5>` above the three-item list. Do not
change `nextActionItemTemplate` or `contactAgency`/`contactAgencyAndVendor`/
`contactUnknownVendor`; those already correctly delegate execution ("à
transmettre à : votre agence").

**Verify**: `pnpm exec vitest run packages/report/src/template/sections/report-intro.test.ts`
passes unchanged (it asserts against the string constant, not literal text).

### Step 2: Add the sentence-structure instruction to the writing prompt

Add one guardrail note to `packages/llm/src/writing-prompt.ts`, in the same
style as `businessClaimNote`/`findingNounNote`, requiring every prose field
(`executiveSummary`, `businessImpact`, `notes`, `title`, recommended-action
text) to be written as complete sentences with an explicit subject, verb, and
complement, using commas to separate clauses rather than terse noun-phrase
fragments. State it as a positive instruction with a French and English
example pair (a fragment versus the same content as a full sentence), matching
how `title`'s existing French/English example pair is written at
`writing-prompt.ts:82`. Do not change the locked output schema; this is prompt
text only.

**Verify**: existing `packages/llm/src/__tests__/` prompt/schema tests still
pass (schema unchanged). If a stubbed-client test asserts the full prompt
string, update it to include the new note; do not add a new live-API test
(tests never call the live Mistral API, per CLAUDE.md's Testing section).

### Step 3: Move the glossary after the appendix

1. In `section-registry.ts`, reorder `SECTION_IDS`'s tail from
   `['section-02', 'section-11', 'section-13', 'section-12']` to
   `['section-02', 'section-11', 'section-12', 'section-13']`. Update the
   comment above it (currently claims the appendix is "always the final
   section (trade-off 44)").
2. In `render-html.ts`, swap the `renderFindingsAppendix` and `renderGlossary`
   call order to match, and update the file-level comment at line 120.
3. In `toc.ts`, resolve the grouping question from "Current state" above
   (reorder the two trailing groups, or give glossary its own final group) so
   the TOC visually reads appendix-then-glossary, in that order, top to
   bottom.
4. Update `section-registry.test.ts:41-76` to assert `section-13` is last and
   `section-12` immediately precedes it (the mirror image of the current
   assertions), and update the two `paged-invariants.e2e.test.ts` assertions
   at lines 274/303/305 the same way.
5. Update the two canonical-order statements in
   `docs/report/report-design-system.md` (lines 66 and 88) to read
   "...technical appendix; glossary, always last" (or equivalent), and add a
   short dated note that this reverses the 2026-08-30 appendix-last call.
6. Amend trade-off 44 in `docs/decisions/trade-offs.md`: keep its
   traceability/single-artifact reasoning, change the stated order, and add a
   dated amendment note recording that the operator confirmed on 2026-09-01
   that glossary-last is more logical for the reader (a glossary is a
   reference the reader reaches for last, after the technical detail) and
   reverses the original appendix-last call from the same 2026-08-30 review.
   Update `CLAUDE.md`'s trade-off 44 line (359-364) to match.
7. Confirm `report-intro.ts:140`'s `scopeNote` cross-reference list does not
   assume section-12 is literally final; adjust only if it does.

**Verify**: `pnpm exec vitest run packages/report/src/template/section-registry.test.ts packages/report/src/template/paged-invariants.e2e.test.ts packages/report/src/template/sections/toc.test.ts packages/report/src/template/render-html.test.ts packages/report/src/template/render-html.axe.e2e.test.ts`
passes. `pnpm run docs:check` exits 0.

### Step 4: Full verification

Run the focused suites above, then `pnpm run check` and the full report test
loop. Generate French and English PDFs from a current stored analysis (no new
scan) and visually confirm: the next-actions heading reads correctly, the
appendix now sits second-to-last, and the glossary is the true final section
in both languages.

**Verify**: `pnpm run check` exits 0. Record both PDF paths and page order in
the session log.

## Test plan

- `report-intro.test.ts` (unchanged, string-constant assertions).
- Writing-prompt test(s) updated only if they assert the full prompt string.
- `section-registry.test.ts` and `paged-invariants.e2e.test.ts` updated to the
  mirrored order.
- `toc.test.ts` covers whichever grouping resolution step 3 picks.
- Manual FR/EN PDF review for reading order and heading wording.

## Done criteria

- [ ] `nextActionsHeading` no longer implies the reader personally executes
      the listed actions, in both languages.
- [ ] The writing prompt instructs full subject-verb-complement sentences
      with comma-separated clauses, without changing the locked schema.
- [ ] Glossary is the true final section in the rendered PDF; the technical
      appendix is second-to-last. TOC, section eyebrows, and cross-references
      all agree.
- [ ] `CLAUDE.md`, `docs/decisions/trade-offs.md` (44), and
      `docs/report/report-design-system.md` all state the new order
      consistently, with the reversal dated and reasoned.
- [ ] Focused tests, `pnpm run docs:check`, and `pnpm run check` pass.
- [ ] French and English PDFs reviewed for the three changes.
- [ ] `plans/README.md` marks Plan 024 DONE.

## Stop conditions

Stop and report if:

- reordering `SECTION_IDS` requires renaming a stable section ID (it should
  not — only array position changes);
- the TOC grouping resolution in step 3 cannot preserve trade-off 44's
  six-narrative-group readability without a larger toc.ts rewrite than a
  group reorder;
- any test asserts appendix continuity (trade-off 17) in a way that reordering
  would break — that invariant must survive unchanged, only which sheet is
  physically last changes;
- a locked contract would need modification.

## Maintenance notes

- The book-style title brainstorm (round 3+) is tracked separately and is not
  part of this plan's done criteria.
- Items 7 and 8 from the Conseil papa audit (SCQ opening tone still reading
  method-first; closed-form remediation phrasing) remain unscoped pending a
  live-PDF read against the exact wording papa flagged.
