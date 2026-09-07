# Plan 032: Populate the writing pass's site context from the hotel catalogue

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MEDIUM (crosses `core`, `interface`, and the intake path; touches
  what is persisted on an analysis)
- **Depends on**: 029 (its Step 2 shipped the receiving `llm`-side schema;
  this plan is the Step 3 follow-up it named)
- **Category**: LLM writing pass / 9c campaign data wiring
- **Planned at**: 2026-09-07, stub only, not started

## Why this matters

Plan 027 called real business facts "probably a larger quality lever than
everything in this plan combined": both audit-rehearsal rounds wrote from
`businessType: 'unknown'`, no city, no property type, no room count.
Plan 029 step 2 shipped the receiving shape, `WritingSiteContext`
(`packages/llm/src/writing-schema.ts`: `propertyType`, `roomCount`, `city`,
`sector`, all optional, prompt byte-identical while absent). Nothing
populates those fields at call time yet, so the writer still works from
`buildFallbackSiteContext()` on every real run.

## Scope (named, not built)

- Find where the catalogue holds each fact for an audited domain:
  the Atout France classification (star rating, establishing property
  type), the qualification candidate record (commune/city), and whatever
  capacity field exists (room count may not be captured anywhere today;
  discovering that honestly is part of this plan, not an assumption).
- A pure resolver with a typed input and an `unknown` reason per missing
  fact (trade-off 38's missing-fact posture), so a partially known
  establishment yields the facts it has and nothing invented.
- Wire the resolver where analysis inputs are built: the CLI `analyze
  --context` path stays as the operator override; the pipeline
  (`packages/interface` analysis stage) resolves facts from the store when
  no context file is given.
- Decide what gets persisted on the analysis document: today `siteContext`
  is persisted only when a context file is provided; catalogue-resolved
  facts should persist the same way so a stored analysis stays honest
  about what produced it (same instinct as plan 029's provenance question
  for `reasoning_effort`).

## Out of scope

- Any financial or estimated fact (trade-off 63 unchanged).
- Any change to `WritingSiteContext`'s shape or the prompt note.
- Outreach/previews: stricter no-statistics rule there is untouched.

## Verify

- Resolver unit tests: full facts, partial facts (missing room count),
  no facts at all (falls back to today's behavior byte-for-byte).
- One real regeneration per language on a stored audit whose catalogue
  row is complete, read end to end as the client would (the plan 027 bar),
  prose naming the city and property type without inventing beyond it.

## STOP conditions

- If the catalogue turns out to hold none of the four facts reliably for
  the campaign population, stop and report rather than wiring a resolver
  over empty data; the plan then collapses to documenting that and closing.
