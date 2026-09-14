# Report design tokens

Source of truth: `docs/report/design/report-mockup-standalone.flat.html`, the
plain-CSS mockup (tokens in a real `:root` block, real class names, the
typeface's woff2 already inlined as data URIs). Read it
directly as source, not from rendered pixels. The earlier generated PDFs and
opaque bundled exports were removed after the flat sources became canonical.
Where a section below still cites a page number, it has not yet been
re-derived from the flat file and should be treated as the older, less
reliable pass. The companion
`docs/report/design/report-mockup-preview.flat.html` (outreach preview) reuses
the same tokens rather than getting its own pass, since it is the same
design system applied to a shorter document.

Since plan 039 (2026-09-11) the flat sources carry the site-derived
baseline: the palette is transcribed by hand from
`packages/site/app/globals.css`'s dark scheme and the `DESIGN.md` "Site"
sections (each value commented with its site origin in the flat file and
in `nocturne.css`), not invented. The mockup remains the structural
source (section skeletons, class names, composition); the colour, type,
and card values come from the site.

Applied to `packages/report/src/styles/nocturne.css` (tokens and the
generic component layer) and `packages/report/src/styles/paged.css` (the
paged-media layer) on the A4 print pipeline (mm-based page geometry,
page-break rules, print margins) - the
mockup's own proportions come from a slide/deck export (`<doc-page>`,
originally sized for Letter, not A4) and are not a layout to copy
directly; CSS values are converted with the standard 1px = 0.75pt =
0.2646mm ratio and then rounded to whatever precision this stylesheet
already uses (mm for spacing, pt for type), not re-eyeballed.

## Port status

Re-verified in full against the flat file on 2026-09-02 (plan 023 evidence
step): every section below now reflects a source-to-source comparison, not
sampled pixels. Re-derived again on 2026-09-11 (plan 039): the palette,
typeface, and card values were transcribed from the public site's dark
scheme into the flat sources first, then into `nocturne.css`, so the
source-to-source discipline now reads "flat file matches site tokens" for
colour and type and "flat file matches mockup structure" for layout.
What the plan 039 pass records:

- **Match.** Tokens, generic component layer, cover skeleton, TOC rows,
  executive summary and its start-here list, stat/severity/category
  tiles, legal exposure tiles, glossary, and the severity/category color
  maps match the flat source within the documented conversion rules.
- **Documented intentional deviations, not drift** (each recorded in code
  and listed here once): 0.02em uppercase tracking everywhere (item 6,
  Chromium text-run fix); severity/category text hexes kept from the plan
  023 baseline where they clear 4.5:1 on the new tints (see the contrast
  note); missing unicode-range font subsets; zero-count tile filtering
  (D7); theme-card labelled boxes and meta grid (plan 018); checklist
  7-column layout (items 35/2.7); appendix real table, merged rule
  summaries, removed minor-groups sub-table, per-finding URL rows (items
  26/25/2.4/2.6); next-steps prose synthesis (plan 018 step 7); TOC
  target-counter page numbers (B8); relabelled jump links (item 5; their
  added underline was dropped on operator direction 2026-09-03, so the
  labels now match the flat source's non-underlined form); page numbers
  in `@page` margin boxes instead of markup; mm-based page geometry.
- **Deliberate departures from the flat source, recorded where they
  live:** the cover uses the accepted 2026-09-13 typographic-hierarchy polish
  (faint bordered kicker, 62px client identity, and short hairlines attached to
  the report-type line) instead of the flat's detached accent rule; the
  metadata sheet's centered letter-grade signal and the
  qualitative scale below it replace the flat's single risk pill and severity
  legend (item 42, plan 018 step 4, then the operator's accepted Impeccable
  direction on 2026-09-13); section 03 uses an editorial scoreboard with the
  distinct-finding total as its lead measure and the other three figures as
  supporting evidence (accepted Impeccable direction, 2026-09-13); the flat's TOC
  footnote is dropped (page numbers print since B8, making it stale) and
  the flat's conditional revenue-opportunity card is not ported (financial
  wording moved to theme-card citations, plan 020). Plan 023's cover
  recomposition and per-section heading rhythm remain; its metadata closing
  band was superseded by the accepted centered grade-first composition above.
- **Print-medium decision with no flat basis:** the checklist's light
  `@media print` inversion (`#f7f7f5`, paged.css). The flat mockup's
  checklist is dark; the inversion is guarded by the item 36 and item 0.1
  suites and documented in the design-system document, section 2. The
  inversion keeps its reason under plan 039: the document stays dark, so
  the one light print page stays a deliberate exception, and its
  `#f7f7f5`/`#161826` pairs and severity-level print colours are
  unchanged.

## Color

All values are the ones actually shipped in `nocturne.css`'s `:root`
block. Since plan 039 the ground, ink ladder, accent, and hairline are
transcribed from `packages/site/app/globals.css`'s dark scheme (each
carrying a site-origin comment in the CSS); the severity and category
tile fills are the documented 0.12-alpha tints of each pair's text colour
over the new ground. The old Nocturne values (`#161826` ground, violet
`#9184d9` accent, `#232532` surface) are retired.

| Token | Value | Site origin (dark scheme unless noted) |
| --- | --- | --- |
| `--bg` | `#0e141c` | site `--paper` |
| `--panel` | `#16202c` | site `--paper-raised` |
| `--panel-2` | `#1a2530` | one step above the site's raised on the same hue (site-family neutral-900) |
| `--line` | `rgb(233 238 245 / 0.13)` | site `--line` |
| `--ink` | `#e9eef5` | site `--ink` |
| `--body` | `#b6c1ce` | site `--ink-soft` |
| `--mute` | `#909cab` | site `--ink-muted` |
| `--accent` | `#38bdf8` (sky-400) | site `--accent` (dark mode); links, eyebrow labels, rank numbers |
| `--accent-tint` | `rgb(56 189 248 / 0.16)` | site `--accent-soft` |
| grade A | `#4cc98a` on `#152a29` | established Odysseus success green on its 0.12 dark tint; distinct from the dossier signal token |
| grade B | `#7dd3fc` on `#1b2b37` | site/report sky-300 on the accessibility tint |
| grade C | `#d6c96e` on `#262a26` | report moderate yellow pair |
| grade D | `#d97b82` on `#262028` | report critical red pair |
| `--crit` | `#d97b82` | plan 023 severity hue, re-verified (5.38:1 on its new tint) |
| `--crit-tint` | `#262028` | 0.12 alpha of `--crit` over `--bg` |
| `--maj` | `#dba36c` | plan 023 severity hue, re-verified (6.87:1) |
| `--maj-tint` | `#272526` | 0.12 alpha over `--bg` |
| `--mod` | `#d6c96e` | plan 023 severity hue, re-verified (8.63:1) |
| `--mod-tint` | `#262a26` | 0.12 alpha over `--bg` |
| `--min` | `#b2b6ca` | plan 023 severity hue, re-verified (7.44:1) |
| `--min-tint` | `#222731` | 0.12 alpha over `--bg` |
| `--good` | `#7cd9a0` | plan 023 positive green, re-verified (10.8:1 on `--bg`); quick-win fill `#1b2c2c` |
| `--mark-finding` | `#dc2626` | site `--mark-finding`: the dossier problem-row dash only; never text |
| `--mark-evidence` | `var(--accent)` | site `--mark-evidence`: the dossier evidence-row dash only |
| `--signal` | `#43aa8b` | site `--signal`: the dossier action-row dash only; never text, never a severity |
| `--accent-200` | `#cdeafd` | sky-200 (the accent's Tailwind family): cover-only kicker on the radial-gradient ground |
| `--section` | `#0d1926` | sky-hued navy step on the site ground: cover gradient, outer stop |
| `--section-glow` | `#14293e` | sky-hued navy step: cover gradient, inner stop |
| `--section-ghost` | `#2a4666` | lighter ghost of the same family (mock content only) |

The neutral ramp is re-derived on the site ink's cool blue-grey hue
(`--color-neutral-100` `#f0f4f9` through `--color-neutral-900` `#1a2530`),
and the accent ramp is the accent's own Tailwind sky family
(`--color-accent-100` `#eaf6fe` through `--color-accent-900` `#0c4a6e`),
so tag and tile pairs read as one system. The violet second ramp
(`--color-accent-2-*`) is kept unchanged: it now serves only the `geo`
category (its former role as the accent's sibling is retired with the
violet accent), and its text/fill pair still clears contrast on the new
ground.

**Contrast note.** Every severity and category pair is computed, not
eyed: text on its own 0.12 tint must clear 4.5:1, and the worst pair in
the shipped palette is critical at 5.38:1. The four severity text hexes
are deliberately the plan 023 hues rather than the dashboard's severity
shades; the divergence predates this baseline and is recorded in the
trade-off entry rather than silently harmonized. The checklist's print
block pairs are unchanged (their ground `#f7f7f5` did not move).
`render-html.axe.e2e.test.ts` and `render-html-v2.axe.e2e.test.ts` remain
the gates: do not move any pair without re-running them.

## Typography

Font: **Avenir Next** (the public site's typeface), self-hosted in
`packages/report/src/fonts` as woff2 files copied from the operator's
licensed kit (Avenir Next Cyr cut, the same files the site ships: Regular
400, Medium 500, Demi 600, Bold 700, plus Italic 400) and inlined as
base64 data URIs at render time by `readStylesInlined()` - never imported
from `packages/site`, and used only after the operator confirmed the
licence covers PDF embedding and bucket-served web embedding (plan 039
binding decision 9). `font-display: block`; no CDN, no `swap`. With
Inter retired, the `overused-font` ignore for `packages/report/**` in
`.impeccable/config.json` is dead and is removed by plan 039.

| Weight | Style | Used for |
| --- | --- | --- |
| 400 | normal | body copy, table cells |
| 400 | italic | `.cross` (diverted-finding strike-through note); a real italic face, replacing the synthesized italic the Inter kit needed |
| 500 | normal | medium emphasis inside prose (`.theme-meta .v`, strong-in-muted contexts that read better below 700) |
| 600 | normal | `h1`-`h6` (`--font-heading-weight`, matching the site's heading weight), eyebrow labels, badges/chips (`.toc .n`, `.obs h3`, `.rule-title`, `.gloss-item dt`) |
| 700 | normal | numeric emphasis only: `.rank`, `.tile b` (big stat numbers), `.theme-meta .v`, `.miss` |

Heading weight moves from Inter's 500 to Avenir Next's 600 because 600 is
the site's heading weight (DESIGN.md, "Site" typography); the print-tuned
size ramp (42/32/25/20/16/13px) and heading line-height are unchanged
from the plan 023 baseline. Badges/tags stay 500-600, not bold, per the
same baseline. The uppercase tracking values stay at the documented
0.02em print fix.

Font sizes and line-heights are **unchanged** from the pre-existing
print-tuned pt scale everywhere except the cover (see "Port status"
above) - the mockup's sizes belong to a different (deck) medium and
don't map 1:1 onto print points for sections that haven't had their own
pass yet. The cover's sizes are the one exception: converted directly
from the mockup's literal px values via the ratio noted at the top of
this document.

## Shape

- `--radius: 8px` - cards, tiles, panels (mockup `--radius-md`; the site
  ladder's own schematic-panel step, so no conversion was needed).
- `--radius-sm: 6px` - badges, chips, pills (mockup `--radius-sm`; the
  site's dossier-card step). The
  previous `--radius-pill` (999px, full stadium shape) is gone: the
  mockup's badges are rounded rectangles, not pills, on every page
  checked (severity badges, quick-win, legal-tag, risk badge, `.chip`,
  `.obs-tag`).
- `--radius-lg: 12px` (was 14px) - the few large containers that used it,
  snapped to the site's raised-card corner (`site-card-lg`).

**Finding cards carry the dossier motif** (operator pick, plan 039 step
3): the section 04 priority/theme cards adopt the site's dossier card
treatment - raised `--panel` surface, hairline separators between the
evidence rows, and a short round-capped dash (18px by 3px, `border-radius:
2px`) set above each evidence row's label: `--mark-finding` red on the
problem row (`POURQUOI C'EST UN PROBLÈME`), `--mark-evidence` (the
accent) on the observed-evidence row, `--signal` green on the action row.
The dashes are decoration in the site's own idiom: the row labels carry
the meaning, the dashes never encode severity, and the three colours
appear nowhere else in the document. The v2 preview's three proof cards
adopt the raised-card treatment with the single finding-red mark above
the card title. No draw animation anywhere: print is designed from its
finished frame.

## Spacing

The ladder is a role assignment, decided 2026-09-02 (plan 023) so no
single value dominates the document's vertical rhythm (the detector's
monotonous-spacing finding). The two upper steps are 2x steps of the base
unit, matching the mockup's own arithmetic:

| Token | Value | Role |
| --- | --- | --- |
| `--space-1` | 2.8px | tight: micro gaps inside one group |
| `--space-2` | 5.6px | tight: row-density tier, table cells, card interiors |
| `--space-3` | 8.4px | medium: label-to-value, sibling gaps inside a component |
| `--space-4` | 11.2px | medium: tile-to-tile gaps, prose-lead section h2 gap |
| `--space-6` | 16.8px | generous: card-to-card, airy section h2 gap |
| `--space-8` | 22.4px | generous: block separations, grid row gaps |
| `--space-12` | 33.6px | sheet-level: section-head cushion, appendix category blocks, cover rule gap (added by plan 023; not in the mockup) |

Two conventions outside the token ladder stay as designed: the 4px/6px
bare micro-literals inside cards and badges, and the mm-based page
geometry in `paged.css` (`@page` margins, the 18mm sheet padding). The
per-section h2 gap assignment (which section gets which step) is in the
design-system document, section 2; the flat source is the origin of the
per-section values.

## Components confirmed against the mockup source

Placement below is determined by section order, not by fixed PDF page
numbers: since plan 018 every numbered section starts its own physical page,
so the page a section lands on depends on which sections are included.

- **Cover**: the radial-gradient ground (`ellipse 900px 560px at 50% 0%`,
  `--section-glow` → `--section` → `--bg`) is painted by `.sheet-cover`
  in `paged.css`, which also gives the sheet its flex column and 279mm
  min-height (`@page cover` carries the single 18mm bottom margin, so the
  gradient bleeds to the top edge). No wordmark: a small uppercase kicker
  "Odysseus · Audit numérique" stands in for one. Kicker, the
  commercial-name `h1`, and the generic decision question sit centered in
  the hero block (`flex: 1.4`, `--space-6` gap); the closing group, a
  centered 160px symmetric-fade accent rule (`--space-12` below it), the
  concise report type line, and an audit date plus Odysseus signature
  line, follows at roughly two-thirds page height and is closed by a
  `flex: 1` quiet spacer (plan 023 recomposition: the closing group is
  deliberately not pinned to the sheet bottom, and the rule is centered
  above centered text). Minimal by contract: no fact fields return here.
  The mockup's "Page 1 / N" corner label is deck-viewer chrome and was
  not ported; page numbers live in `@page` margin boxes and the cover
  suppresses its own counter.
- **Metadata sheet** (second physical page, added 2026-09-01, plan 018;
  recomposed 2026-09-02, plan 023): the audit identity fact grid (site
  audited, audit date, pages scanned, report language, audited standard,
  plus the legal name when the operator supplied one) as a two-column
  grid, 10px uppercase labels (`opacity: 0.5`, `--space-3` below) over
  18px values, `--space-8` row and column gaps. The sheet renders as a
  flex column (`min-height: 261mm`): the risk scale, the full three-level
  scale with the current level highlighted plus its two basis notes
  (item 42), is the sheet's closing band, full width under a fading
  hairline, pulled to roughly two-thirds page height by
  `margin-top: auto` with a fixed quiet spacer after it, so the page
  reads as composed rather than ending where the grid ran out. The flat
  source's single risk pill and four-row severity legend were
  deliberately replaced by this scale (item 42, plan 018 step 4).
- **TOC**: eyebrow `SOMMAIRE`, numbered rows with a hairline
  divider under each, accent-colored index numbers, grouped under six
  narrative group labels.
- **Section header pattern** (every content page): eyebrow reads
  `NN · SECTION NAME`, immediately followed by a large `h1`/`h2`-style
  title and a one-line intro paragraph. Confirmed on every page checked
  (Résumé, Exposition légale, Priorités, Check-list, Annexe, Glossaire,
  Prochaines étapes).
- **"Par où commencer" list** (Résumé section): a `--panel`-toned
  box with numbered accent-outlined circles, item text, right-aligned
  "Voir →" links, hairline dividers between rows.
- **Legal exposure tiles**: two side-by-side bordered tiles,
  small label + large value + short description each.
- **Stat tiles + severity/category tiles**: a plain 4-up tile
  row (big number + label, `--panel` fill, no border color), then a
  4-up severity row (colored dot + label, big number, description, tile
  fill = that severity's own tint), then a 4-up category row (label +
  count, `--panel` fill).
- **Priority/theme cards**: `--panel-2` rounded card, accent-
  outlined rank circle, category chip + optional green "Quick win" chip,
  bold title, body paragraph, legal-relevance line in muted text, then a
  meta row (`Effort`/`Impact`/`Pages affectées`/`Conformité`/`Réf.`).
- **Checklist table**: plain table, uppercase small header row,
  hairline row dividers, no zebra striping, generous row padding. Under
  print media this one page inverts to `#f7f7f5` ground with `#161826`
  ink (a print-medium decision with no flat-source basis; rationale and
  guard tests in the design-system document, section 2). The severity
  level colors get their own print-safe dark pairings in the
  `@media print` block of `paged.css`, each re-derived against
  `#f7f7f5` at 4.5:1+; those pairings are the values of record for
  print, not the dark-ground `LEVEL_COLOR` values.
- **Findings appendix**: category heading in accent color,
  then per-rule blocks - severity badge, rule title, monospace rule-id
  tag, summary line (`N constats · N occurrences · jusqu'à N pages ·
  WCAG X.X.X`), then a sub-table (`ID`/`PAGES`/`OCCURRENCES`/`SÉLECTEUR`).
  Every finding appears individually or in a per-rule aggregate - the
  mockup's own intro line says so explicitly ("aucun n'est renvoyé "sur
  demande""), matching this template's existing behavior.
- **Glossary**: accent-colored bold term + plain-text
  definition pairs, generously spaced.
- **Next steps / footer**: three bordered cards in a row
  (title + short paragraph each) - "Une question ?", "Ré-audits",
  "Vérification post-correctifs".

## What was intentionally not changed

- Page geometry, margins, and pagination (mm units, `@page` rule,
  page-break placement) - the mockup is not A4-proportioned, so its
  spacing isn't a valid source for this. The cover's own font sizes and
  spacing are the one exception: they are converted directly from the
  flat file's literal px values (see the ratio above), not left at their
  pre-existing print-tuned numbers, per the "lift the actual CSS" brief
  for this pass.
- For every section other than the cover: exact pt font sizes and
  line-heights are still the pre-existing print-tuned values, not yet
  re-derived from the flat file's px scale. Do this per-section as each
  one gets its own port, the same way the cover did.
- Anything not visually confirmed against the actual mockup source (this
  document only records what was checked, not what was assumed).
