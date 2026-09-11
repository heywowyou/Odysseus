# Plan 041: Deterministic fix snippets and a visual scorecard summary

> **Executor instructions**: Follow this plan slice by slice. Run every
> verification command and confirm the expected result before moving to the
> next slice. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When a slice lands, update this plan's status row
> in `plans/README.md`.

## Status

- **Priority**: P3
- **Effort**: TBD, set at the end of Slice 1
- **Risk**: LOW at Slice 1 (research and a written proposal only, no code
  change); revisit once Slice 1 picks a shape
- **Depends on**: 039 (design tokens, if the scorecard renders inside the
  report or preview) and possibly 040 (dashboard IA, if it renders there
  instead); Slice 1 resolves which
- **Category**: report, findings, sales asset
- **Planned at**: commit `dafc5ba`, 2026-09-12
- **Issue**: none; operator-requested during a competitive-positioning
  conversation 2026-09-11/12

## Why this matters

Comparing Odysseus against the existing accessibility/SEO audit tooling
market surfaced two feature ideas the operator wants to pursue:

1. **Deterministic fix snippets.** Today the report gives remediation
   copy per rule ID (trade-off 71: every reachable rule carries reviewed
   FR/EN remediation prose). For structural findings whose fix is a fixed
   shape for a given rule ID (`missing lang attribute`, `missing canonical`,
   malformed JSON-LD, wrong heading order, and similar), a templated
   code snippet next to the prose would close a real gap against tools that
   already show a copy-paste fix, without violating non-negotiable rule 1:
   the snippet is derived from the rule ID and the finding's normalized
   evidence, never generated or invented by the model.
2. **A visual scorecard / letter-grade summary.** A single at-a-glance
   score presentation, for the sales motion and the top of the report,
   distinct from the existing detailed findings breakdown. Presentation
   work primarily; where it draws its underlying numbers from (existing
   severity counts, `computeBrokennessScore`, something else) is a Slice 1
   question, not a Slice 1 decision.

Neither idea has been designed yet. This plan exists to hold the intent so
it is not lost, and to make the first executor's job explicit: ask the open
questions and brainstorm the shape, in writing, before any binding decision
locks a schema, a rendering surface, or a locked-contract change.

## Slice 1: Questions and brainstorm (do this first, nothing else)

Produce a short written brainstorm document (`docs/product/fix-snippets-and-scorecard-brainstorm.md`)
covering both features. Do not write implementation code in this slice. At
minimum, work through:

**Fix snippets**
- Which reachable rule IDs (axe, Lighthouse, and the milestone 8 custom
  checks) actually have a fixed-shape fix versus one that depends on the
  page's own content and cannot be templated safely? Produce the split,
  not a guess.
- Where does a snippet live: as a new field on the existing remediation-copy
  source, a parallel table keyed by rule ID, or something else? Note this
  touches reviewed FR/EN content per rule ID (trade-off 71's mechanism), not
  a locked contract, but confirm that before proposing a shape.
- Does a snippet ever need the finding's own evidence (a selector, an
  attribute value) interpolated in, or is it always generic per rule ID? If
  evidence is interpolated, how is that done deterministically and safely
  (never through the LLM, per non-negotiable rule 1 and rule 4 - the model
  never receives or produces this).
- Where does it render: the PDF report, the dashboard, both?

**Scorecard**
- What does the score aggregate: existing severity-ordered finding counts,
  `computeBrokennessScore` (trade-off 23, not currently wired into the
  pipeline), or a new deterministic computation? Note `computeBrokennessScore`
  and the cost-gate scores are documented as not to be changed in place
  (trade-off 38) - reusing a number is fine, redefining one is not.
- Where does it render: report cover, outreach preview, dashboard, the
  public site as a sales asset, some combination? Each surface has its own
  locked contract or contract-adjacent rules (trade-off 42 for the preview,
  trade-off 62 for report preparation) that a placement choice must respect.
- Is a letter grade ever shown to the client, or only used internally for
  triage/sales framing? This interacts with non-negotiable rule 6 (never
  overstate legal exposure) only if the grade is ever presented as implying
  compliance status rather than a technical/business-impact summary - flag
  this explicitly rather than assuming either answer.

List every open question found beyond these, with a recommendation and the
main tradeoff for each, and stop. Bring the document to the operator for a
direction pick before Slice 2 is written. Slice 2 onward, including binding
decisions, effort/risk sizing, and STOP conditions, are written after that
pick, not before.

## STOP conditions

- Slice 1 proposes touching a locked contract
  (`packages/core/src/types/findings.ts`, `severity.ts`, or
  `llm-output.ts`) to carry a snippet or score. Stop and ask; do not modify
  these files under this plan without explicit operator sign-off per
  CLAUDE.md's locked-contracts section.
- Slice 1 finds the scorecard would need a new commercial tier or pricing
  surface. Stop; trade-off 12 (single-tier commercial model) is a business
  decision, not an engineering one.
