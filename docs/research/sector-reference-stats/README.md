# Sector reference-stat research

Raw research inputs for `packages/core/src/reference-stats/stats.ts`,
one file per sector. This directory is the place new sector research
lands *before* it becomes a `ReferenceStat` row - keep it separate from
`stats.ts` itself for the same reason `docs/research/Odysseus
Business-Impact Statistics Reference Database Accessibility SEO &
GEO.md` already exists: the vetting work (is this source real, does the
number mean what it claims to mean, does it generalise) is expensive and
worth keeping even for the entries that don't make it into the compiled
table, so a future session does not repeat the same search and land on
the same excluded sources again.

## Why hospitality has its own file

`docs/research/Odysseus Business-Impact Statistics Reference Database
Accessibility SEO & GEO.md` is the original, general-purpose research
pass (milestone 8.5b). It already noted, honestly, that hospitality-
specific *quantified* data was thin for both accessibility and SEO. This
directory exists to hold the deeper, sector-targeted follow-up research
that fills gaps like that one, sector by sector, as Odysseus takes on
clients outside hospitality. `hospitality.md` is the first entry.

## Adding a new sector

1. Research it against the same bar the existing files use - **named,
   checkable primary source**; state the sample size and methodology in
   one line; say explicitly whether a figure is `SCALABLE` (a ratio
   that can be multiplied against a client's own revenue/bookings) or
   `CONTEXT-ONLY` (a fixed aggregate or case study, quote as-is, never
   scaled). A number with no traceable methodology does not belong in
   this table, however good it would look in a report.
2. Use the same entry template as `hospitality.md` (Source, Figures,
   Methodology, Credibility tier, Scalable, Relevance), ordered roughly
   strongest-to-weakest.
3. Keep a **"confirmed no citable data" section** at the end for
   categories you searched and came up empty on. That negative result
   is worth as much as a positive one - it is what stops a future
   session from re-running the same search on "hospitality booking
   abandonment rate" and landing on the same vendor-blog-citing-itself
   loop.
4. Only promote entries tiered **HIGH, MEDIUM-HIGH, or MEDIUM**
   credibility into `stats.ts`, and only into a `StatCategory` the row
   genuinely belongs to - see `stats.ts`'s own doc comment for the
   category list and CLAUDE.md trade-off 16 for why forcing a stat into
   a category it doesn't fit (the Pew AI-overview CTR stat landing on a
   missing-SIREN legal finding, a real incident) is exactly the mistake
   to avoid. A LOW-tier source, or a genuinely strong source with no
   matching category (see hospitality.md's Coach Omnium entry), stays
   in the research file rather than getting force-fit into the table.
5. Map credibility tier to `StatConfidence`: HIGH and MEDIUM-HIGH ->
   `established`; MEDIUM -> `emerging` (self-selected samples, a single
   automated tool, an undisclosed sample size, or a scope narrower than
   the report's own claim - the same reasoning that keeps the
   peer-reviewed Princeton GEO paper at `emerging` in the general table,
   despite being a strong source, because it measures visibility, not
   revenue). LOW-tier sources are excluded outright, never encoded as a
   third confidence tier.
6. Never invent a `ratio` for a context-only figure to make it look
   scalable. If the research doesn't provide a real, disclosed
   conversion or revenue percentage tied to the specific defect
   category, the honest report answer is a citation with no multiplier
   attached - not an invented one. `hospitality.md`'s own "confirmed no
   citable data" section found exactly this for
   accessibility-to-booking conversion in hospitality: no study
   anywhere ties a WCAG fix to a measured booking delta on a hotel or
   restaurant site. Say so in the report rather than approximate it.
