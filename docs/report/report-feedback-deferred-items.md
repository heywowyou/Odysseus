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

### Checklist group header can orphan at an appendix page break

Real rendered reviews (La Coorniche and the large fixture, plan 018 era)
showed a checklist group header starting a page with its rows left on the
previous page. The bounded fix would extend the `.remaining-category-head`
wrapper pattern rather than a generic `break-after: avoid` on headings
(trade-off 32 forbids the generic form).

Trigger: a committed fixture or real report reproduces the orphan. Do not
restructure checklist markup from memory of the review alone.

### LCEN and EAA citation wording needs a legal read at render size

A rendered-output review flagged the LCEN/EAA citation wording on page 21
of the large fixture, but the review was run at 60 DPI and the flag was
uncertain, so the wording may already be correct per
`docs/rules/obligation-basis.md`.

Trigger: the next full-size rendered review of a report carrying the LCEN
block re-reads those sentences against obligation-basis section 7 before
any wording change. Legal copy is deterministic where the charter says it
is; this is a review gate, not a copy suggestion.

### Annex URL row can separate from its finding row

Paged.js may place an appendix URL sub-row at the start of the page after its
own finding row. The existing `break-before: avoid` rule has not reliably
prevented this in fragmented tables.

Trigger: reproduce the split in a committed fixture. Diagnose the engine
behavior before choosing between a row wrapper, a different table structure,
or a Paged.js hook. The accepted limitation that table headers do not repeat
is separate and is not an open backlog item.

### Overlapping Lighthouse legacy and successor audit families

Older reports printed overlapping Lighthouse work families, for example
`legacy-javascript` beside its successor `legacy-javascript-insight`, and
`uses-http2` beside `modern-http-insight`, with overlapping remediation and
page sets, which inflates rows and can produce two tickets for one change.
Normalization reads Lighthouse replacement metadata, but historical artifacts
show metadata alone does not separate every version pair. The 2026-08-29
Haaitza report contains only `legacy-javascript-insight`, so there is no
current reproduction. Provenance keeps both raw records; client roll-ups
should expose only the current actionable family.

Trigger: a current normalized report reproduces an overlapping legacy and
successor family pair. At that point, plan a tested successor map over the
known pairs; do not change normalization from historical artifacts alone.

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
