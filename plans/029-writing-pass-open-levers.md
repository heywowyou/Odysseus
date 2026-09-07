# Plan 029: The two writing-pass levers plan 027 left as operator decisions

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MEDIUM (E raises per-report cost; F, done narrowly, is low
  risk, but its natural continuation crosses package boundaries)
- **Depends on**: 027 (closed), 028 (closed)
- **Category**: LLM writing pass
- **Planned at**: 2026-09-07, not yet started

## Why this matters

Plan 027 named two further levers and explicitly left them out of its own
scope, as operator decisions rather than engineering calls:

- **E. Raise `reasoning_effort` for the writing pass.** All three model
  passes (structure, writing, review) run at `reasoning_effort: 'none'`
  (`packages/llm/src/client.ts`). The writing pass is the only genuinely
  generative one of the three - structure and review both mostly echo or
  check the writing pass's own input - and it is the one running with
  zero deliberation. 027 called this "the single highest-leverage knob
  left."
- **F. Give the writer real business facts.** `siteContext` today is four
  thin fields (`businessType`, `primaryGoal`, `languagesServed`,
  `targetMarkets`), and on both audit-rehearsal runs it was absent
  entirely, so the model wrote from `businessType: 'unknown'`. It does
  not know it is describing a three-star, twenty-five-room hotel in a
  named town, even though the catalogue holds every one of those facts
  deterministically. 027 called this "probably a larger quality lever
  than everything in this plan combined."

Operator discussion on 2026-09-07 settled how to carry both forward: E
is not to be shipped on a hunch - measure it first, same doctrine that
killed the shadow-reviewer-as-gate idea (trade-off 55, "measure before
promoting a guard"). F should have its `llm`-side shape defined now, so
the writing pass is ready to consume real facts the moment they exist,
without this plan itself reaching into `core`, `interface`, or the intake
path - that data-wiring work is real, but it is a different plan, with a
different risk profile and a different owner.

## Scope

In scope:

- **E, measurement only.** A non-gating script, same shape as
  `lint-stored-analyses.ts`, that re-runs the writing pass at a raised
  `reasoning_effort` against the stored structure documents plan 027
  already used as its evidence base, and reports a before/after
  comparison: the same repetition metrics `lint-stored-analyses.ts`
  already tracks, plus cost and latency per report. No production code
  path changes as part of this plan.
- **F, `llm`-side schema only.** Widen `WritingInput['siteContext']`'s
  type inside `packages/llm` to accept the concrete, non-financial facts
  plan 027 named (hotel type, room count, city, sector), update
  `writing-prompt.ts` to use them when present, and preserve exactly
  today's `fallbackNote` behavior when they are absent. No caller
  outside `packages/llm`'s own tests populates these fields as part of
  this plan.

Out of scope, deliberately:

- Actually shipping a raised `reasoning_effort` in production. That is a
  follow-up decision, made after this plan's measurement step, not a
  step of this plan.
- Any change to `core`, `interface`, or the intake path. Wiring real
  catalogue facts (hotel type, room count, city, sector) into
  `siteContext` at call time is real work spanning those packages and
  deserves its own plan once this one's schema exists to receive it.
- Any financial or estimated fact (revenue, traffic, conversion). Trade-off
  63 already denies client-specific financial estimates by default; this
  plan does not touch that boundary and does not need to.
- Any structure-pass or `packages/report` change.

## Open decision needed before Step 1

**A provenance field for `reasoning_effort`.** Persisted analyses today
record only `model` and `temperature` (trade-off 67 - one model field,
never split per pass). Raising `reasoning_effort` for the writing pass
alone, if E's measurement recommends shipping it, needs its own recorded
field so a stored analysis stays honest about what actually produced it.
This plan's Step 1 does not need the field (the measurement script does
not persist analyses), but Step 2's eventual "ship it" follow-up would.
Flagging now so it is not rediscovered as a surprise later.

## Steps

### Step 1: Build the `reasoning_effort` measurement script (E)

Add a script under `packages/llm/src` (naming and exact CLI surface to be
decided at implementation time, following `lint-stored-analyses.ts`'s
precedent of a `pnpm exec tsx` entry point) that:

1. Loads the same stored structure documents plan 027's Step 7 measured
   against.
2. Re-runs the writing pass twice per document: once at
   `reasoning_effort: 'none'` (today's baseline) and once at a raised
   setting.
3. Reports, for both runs: the repetition metrics
   `lint-stored-analyses.ts` already computes (shared action/impact
   openings, verbatim-example matches), plus token usage and wall-clock
   latency per call.

**Verify**: the script runs against the two stored documents and
produces a readable side-by-side report. This step calls the live model
API - standing-authorized per CLAUDE.md's "Analysis and PDF authorization"
- and is a manual operator step, same as plan 027's own Step 7.

**Done when**: the operator has read both the metrics and a manual
register comparison of the raised-effort output, and made an explicit
ship/defer call. Record that call and its reasoning back into this
document before closing it out.

### Step 2: Define the `llm`-side `siteContext` shape (F)

Widen `WritingInput['siteContext']` (currently `LlmInput['siteContext']`,
shared with the structure pass) to accept optional concrete facts:
property, room count, city, and sector, at minimum. Update
`buildWritingSystemPrompt`/`buildWritingUserPrompt` in `writing-prompt.ts`
to weave present facts into the prose instructions (for example, a
performance note or a business-impact instruction that can name the
actual business type instead of writing generically) while leaving
`fallbackNote`'s existing behavior untouched when they are absent.

**Verify**: a new test proves the writing pass behaves identically to
today (same prompt text, same `fallbackNote` trigger) when the new fields
are absent - this is the regression safety net, since most audits will
not have this data populated until the follow-up plan wires it in. A
second test proves the prompt actually changes when the fields are
present, with a real fact reflected in the output text.

### Step 3: Name the follow-up plan

Write a short new plan stub (or a `docs/report/report-feedback-deferred-items.md`
entry, whichever this repo's convention favors at the time) naming the
`core`/`interface`/intake work needed to actually populate the new
`siteContext` fields from the hotel catalogue for the 9c campaign. Do not
build that wiring here.

## Test plan

- `packages/llm`: schema/prompt tests for the new `siteContext` fields,
  both present and absent.
- No test calls a live model API except the measurement script itself,
  which is a manual, explicitly authorized step, never part of the
  automated suite.
- `pnpm run check` clean.

## STOP conditions

- Step 1's measurement shows raised `reasoning_effort` moving priorities
  or theme groupings. It should not be able to: the writing pass never
  touches priorities, which come from the structure pass this plan does
  not call at a different setting. If it happens anyway, stop and report
  rather than shipping.
- Step 2's regression test cannot be made to pass (the schema change
  changes behavior when the new fields are absent). Fix before proceeding,
  do not ship a silent behavior change to the common case.
