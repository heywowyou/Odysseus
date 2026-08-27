# Report feedback: deferred items

This is the current report-maintenance queue. It contains only work that is
still open or has an explicit future trigger. Closed review documents are
deleted after their durable decisions are promoted to
`docs/decisions/trade-offs.md`; Git history retains the original evidence.

Do not add shipped work, accepted limitations, rejected product ideas, or
observations that no longer reproduce. Record those in the relevant decision,
test, or commit instead.

## Needs a new estimation model

### Remediation cost and page-value weighting

Clients may want a cost estimate that is more concrete than the existing
low, medium, or high effort bands. Finding counts also treat a legal-notice
page and a booking-path page equally even though their commercial relevance
differs.

This needs two explicit domain models:

1. Developer-day ranges derived from rule family, fix scope, and occurrence
   concentration.
2. Page relevance derived from verified page roles such as booking, room, or
   checkout, without inventing business impact.

Do not add numeric estimates until both models have evidence, conservative
bounds, and tests. This is product work, not a report-copy adjustment.

## Reproduce before changing

### Section opener can separate from its first content unit

The current print CSS keeps a heading, kicker, and introductory paragraph
together. It does not guarantee that the first card or table row stays with
that opener. No current fixture reproduces an opener stranded from its first
content unit.

Trigger: a real or committed stress report demonstrates the narrower failure.
The likely fix is a section-level wrapper around the opener and first content
unit, followed by pagination regression tests. Do not make the structural
change based only on the hypothetical case.

### Annex URL row can separate from its finding row

Paged.js may place an appendix URL sub-row at the start of the page after its
own finding row. The existing `break-before: avoid` rule has not reliably
prevented this in fragmented tables.

Trigger: reproduce the split in a committed fixture. Diagnose the engine
behavior before choosing between a row wrapper, a different table structure,
or a Paged.js hook. The accepted limitation that table headers do not repeat
is separate and is not an open backlog item.

## Below the duplication threshold

### Lighthouse element-shaped findings lack stable shape identity

`crawlable-anchors` once represented 23 percent of findings in a measured
La Corniche audit. Its repeated template shape resembled the axe findings
handled by `shapeIdentity`, but it remained below the 30 percent concentration
alarm and Lighthouse findings have no equivalent identity path.

Trigger: the concentration guard reaches 30 percent for this or another
element-scoped Lighthouse rule. At that point, measure the duplicates and
design a Lighthouse-specific identity before changing normalization. Do not
extend the axe identity by analogy alone.
