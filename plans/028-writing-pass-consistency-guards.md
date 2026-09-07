# Plan 028: Close the writing-pass consistency gaps plan 027 didn't cover

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (guard-only additions inside `packages/llm`, no schema or
  contract change, no report-template change)
- **Depends on**: 027 (closed out first, see below)
- **Category**: LLM writing pass
- **Planned and shipped at**: commit following `ad2ef22` on `main`,
  2026-09-07
- **Done when**: this document says so, below

## Why this matters

Plan 027 fixed the repetition and verbatim-copying defects it diagnosed
against two stored French analyses (repetitive action/impact openings, a
copied closing sentence, a hard two-sentence impact cap) and closed with
Step 7's live measurement, already committed. It deliberately left two
bigger levers as open operator decisions (raising `reasoning_effort`,
feeding the writer real business facts - see plan 029) and did not claim
to be exhaustive.

A second pass, grounded in `docs/report/audit-rehearsal-notes.md` (five
independent live rehearsals) and `docs/report/report-feedback-deferred-items.md`,
found three further defects, real and recurring, that 027 never touched:

1. Reports contradicting their own finding counts in prose ("80 findings"
   in one place, "63 critiques et 19 sérieux" elsewhere in the same
   report, recurring across three audits).
2. A theme referenced by page position ("la priorité 1 ci-dessus")
   pointing at content that actually rendered below it, recurring across
   three different hotel reports.
3. The same finding, `alt-text-quality-heuristic`, explained with two
   different meanings across the French and English passes of one audit
   (#67/#68) - a substantive disagreement a client reading both language
   versions side by side would notice, not just a wording difference.

All three are inside the writing pass's own reasoning, none require a
structure-pass or report-template change, and all three follow the exact
pattern the existing guards already use: something the model has no
legitimate way to know or reliably reproduce, closed the same way
`findPageCountViolations` closes invented page counts.

## Scope

In scope, all inside `packages/llm/src`:

- **J. Ban positional references to other report content.** The writing
  pass has no visibility into final page layout.
- **K. A shared meaning for rule IDs with a documented cross-language
  drift history.** Starts with one entry (`alt-text-quality-heuristic`).
- **L. Widen the invented-number ban from page counts to finding
  counts.** Same reasoning as the existing `page-count-guard.ts`,
  generalized to the finding noun and severity words.

Also: close out plan 027 first (already done - see "Step 0" below), since
028 builds directly on 027's prompt structure.

Out of scope, deliberately: everything plan 029 covers (`reasoning_effort`
measurement, business-fact `siteContext` scoping); the structure pass;
`packages/core/src/reference-stats`; any `packages/report` template or CSS
change (the "Preuve de rendu" near-empty-page pattern and the
"reste à traiter" priority-bucket question from rehearsal notes are
structure-pass/template concerns, left open in
`docs/report/report-feedback-deferred-items.md` for a future session);
any locked contract.

## Step 0: Close out plan 027

Already done before this plan started: 027's steps 1-6 landed in commit
`ad2ef22` ("Rewrite the report writing prompt so French prose stops
reading as a template"), and its Step 7 measurement is recorded in that
commit's message (recommended-action opening reuse down from 100/100/100
to 35/19/8, impact-opening reuse from 83 to 14 percent, measured on two
real audits).

## Step 1: Ban positional references (lever J)

New `packages/llm/src/positional-reference-guard.ts`:
`findPositionalReferenceViolations` rejects French "ci-dessus"/
"ci-dessous" outright (document-reference words with no other reading)
and a small set of English referencing phrases ("as noted above", "the
theme below", "the above-mentioned", "see below") - deliberately not a
bare ban on "above"/"below", which have legitimate technical readings
("below the required minimum") this guard must not catch. Scans every
prose field, including theme titles.

Wired into `writing-prompt.ts` as a new note in both language branches
(`positionalReferenceNote`), and into `docs/rules/report-writing-style.md`
section 8 as the French register document's own copy of the rule, and
into `analyze-writing.ts`'s retry loop, positioned right after the new
finding-count guard (same "invented/unverifiable content" family as the
page-count guard).

**Verified**: `positional-reference-guard.test.ts` covers both languages,
the numeric-threshold false-positive case in both languages, and a
title-field violation. `writing-prompt.test.ts` and `analyze-writing.test.ts`
cover the new prompt note and the new retry-then-fail-loud guard path.

## Step 2: A shared rule-meaning table (lever K)

New `packages/llm/src/rule-meaning-notes.ts`: `RULE_MEANING_NOTES`, a
small bilingual table keyed by rule ID, starting with
`alt-text-quality-heuristic` (grounded in that rule's own code comment in
`packages/core/src/normalize/normalize-alt-text.ts`, so the anchor
description matches what the rule actually checks). `buildRuleMeaningNote`
scans the rule IDs the writing pass is actually shown for a given call and
appends only the matching entries, so a report with no
`alt-text-quality-heuristic` finding gets no note about it. Wired into
`buildWritingUserPrompt`, not the system prompt, since it depends on
per-call finding data.

This is not a rejecting guard - there is no mechanical way to check
whether the model's prose matches an intended meaning - only a fixed
anchor both language passes read from, replacing two independent
free-descriptions of the same rule with one shared source. Extend the
table only when a new drift case is actually observed against real
output, same discipline `LIGHTHOUSE_EXCLUDED_AUDITS` uses.

**Verified**: `rule-meaning-notes.test.ts` covers the present/absent
cases and both languages; `writing-prompt.test.ts` covers the wiring
into `buildWritingUserPrompt`, including that an unrelated rule ID adds
nothing.

## Step 3: Widen the invented-number ban to finding counts (lever L)

New `packages/llm/src/finding-count-guard.ts`, structurally identical to
`page-count-guard.ts`: `findFindingCountViolations` matches a digit next
to the finding noun (`constat(s)`/`finding(s)`) or a canonical severity
word, rejects wholesale (no correct number for the model to substitute
in), and scans `executiveSummary`, `notes`, `businessImpact`, and every
`recommendedActions` entry, excluding theme titles. `executiveSummary` is
already covered by `executive-summary-digit-guard.ts`'s total digit ban,
so this guard's marginal coverage is `notes`, `businessImpact`, and
`recommendedActions`, where audit-rehearsal notes recorded the
contradicting counts actually appearing. Wired into `analyze-writing.ts`
right after the existing page-count guard.

**Verified**: `finding-count-guard.test.ts` mirrors
`page-count-guard.test.ts`'s structure (both languages, the "no count"
acceptance case, the "other legitimate numbers" non-match case, a
recommendedActions-specific case). `analyze-writing.test.ts` covers the
retry-then-fail-loud path.

## Test plan

- `packages/llm`: every new guard's own test file, plus updated
  `writing-prompt.test.ts` and `analyze-writing.test.ts`. All pre-existing
  `packages/llm` tests stay green (477 tests, `packages/llm` suite, run
  2026-09-07).
- `pnpm run check` (docs check, Prettier, ESLint, `tsc -b`) clean across
  the workspace.
- Full workspace `vitest run --project unit`: no new failures. Two
  pre-existing failures in `packages/core/src/normalize/fixture-freshness.test.ts`
  are unrelated (this machine has no real-scan artifacts to refresh
  fixtures against, a known, already-documented gap) and untouched by this
  plan's changes, which are scoped entirely to `packages/llm`.
- No test calls a live model API, matching plan 027's own test plan.

## STOP conditions

- None triggered. No change touches `findings.ts`, `severity.ts`,
  `llm-output.ts`, or any locked contract. No guard's meaning weakened to
  let prose through; all three are additive rejections in the same family
  as the existing page-count guard.

## Follow-up

`plans/029-writing-pass-open-levers.md` picks up plan 027's two open
decisions (`reasoning_effort`, real business facts), scoped down per
operator discussion: measure `reasoning_effort` before shipping it, and
scope lever F's `siteContext` shape change to `packages/llm` only, naming
the upstream `core`/`interface`/intake data wiring as a separate
follow-up plan rather than building it there.
