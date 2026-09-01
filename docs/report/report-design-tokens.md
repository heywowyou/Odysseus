# Report design tokens

Source of truth: `docs/report/design/report-mockup-standalone.flat.html`, the
"Nocturne" design system's plain-CSS mockup (tokens in a real `:root`
block, real class names, Inter woff2 already inlined as data URIs). Read it
directly as source, not from rendered pixels. The earlier generated PDFs and
opaque bundled exports were removed after the flat sources became canonical.
Where a section below still cites a page number, it has not yet been
re-derived from the flat file and should be treated as the older, less
reliable pass. The companion
`docs/report/design/report-mockup-preview.flat.html` (outreach preview) reuses
the same tokens rather than getting its own pass, since it is the same
design system applied to a shorter document.

Applied to `packages/report/src/template/report.css` on the existing A4
print pipeline (mm-based spacing, page-break rules, print margins) - the
mockup's own proportions come from a slide/deck export (`<doc-page>`,
originally sized for Letter, not A4) and are not a layout to copy
directly; CSS values are converted with the standard 1px = 0.75pt =
0.2646mm ratio and then rounded to whatever precision this stylesheet
already uses (mm for spacing, pt for type), not re-eyeballed.

## Port status

- **Cover**: ported directly from the flat file's own markup and CSS
  (2026-08-16, second pass), then restructured on 2026-09-01 (plan 018,
  executive-readability slice): the cover sheet is now minimal (kicker,
  commercial-name headline, generic decision question, report type, audit
  date, Odysseus signature) and the former six-field cover grid and risk
  pill moved to a new second metadata sheet. That restructure changed
  structure only; every visual token below is unchanged, and classes,
  structure, and tokens for these two sheets are current.
- **Everything else** (TOC, executive summary, legal exposure, stat
  tiles, priority cards, checklist, appendix, glossary, next steps):
  still reflects the original PDF-pixel-sampling pass and has not been
  re-verified against the flat file. Do this the same way the cover was
  done - pull markup/CSS straight from the flat file's own source for
  each section, not by reading rendered pixels - before trusting those
  bullet points as current.

## Color

All values are the ones actually shipped in `report.css`'s `:root`
block. Two (`--accent`, `--crit`) are deliberately lightened a few
percent from the literal mockup pixel values - see "Contrast note" below.

| Token | Value | Mockup source |
| --- | --- | --- |
| `--bg` | `#161826` | page background |
| `--panel` | `#232532` | card/tile fill |
| `--panel-2` | `#2b2e40` | interpolated, one step lighter than `--panel` |
| `--line` | `rgba(233, 233, 237, 0.16)` | divider/border |
| `--ink` | `#e9e9ed` | primary text |
| `--body` | `#cfd3e5` | secondary body text |
| `--mute` | `#9397ab` | tertiary/meta labels |
| `--accent` | `#9f94de` (mockup: `#9184d9`) | links, eyebrow labels, rank numbers |
| `--accent-tint` | `rgba(145, 132, 217, 0.12)` | accent tile/badge fill |
| `--crit` | `#dc848b` (mockup: `#d97b82`) | critical severity |
| `--crit-tint` | `rgba(217, 123, 130, 0.12)` | |
| `--maj` | `#dba36c` | serious/major severity |
| `--maj-tint` | `rgba(219, 163, 108, 0.12)` | |
| `--mod` | `#d6c96e` | moderate severity |
| `--mod-tint` | `rgba(214, 201, 110, 0.12)` | |
| `--min` | `#b2b6ca` | minor severity |
| `--min-tint` | `rgba(178, 182, 202, 0.12)` | |
| `--good` | `#7cd9a0` | quick-win / positive |
| `--good-tint` | `rgba(124, 217, 160, 0.12)` | |
| `--accent-200` | `#e7e5fe` | cover-only: kicker label on the radial-gradient ground (mockup `--color-accent-200`) |
| `--section` | `#262a60` | cover-only: radial-gradient ground, outer stop (mockup `--color-section`) |
| `--section-glow` | `#353b80` | cover-only: radial-gradient ground, inner stop (mockup `--color-section-glow`) |

Tint fills are a flat 0.12 alpha of the solid color over the surrounding
background, matching the mockup's own approach (confirmed against the
flat file's literal `rgba()`/`color-mix()` values, not just sampled
pixels, now that the source is plain CSS).

**Contrast note.** The mockup's literal `--accent` (`#9184d9`) and
`--crit` (`#d97b82`) clear 4.5:1 against plain `--bg` but drop to
3.97:1 / 4.31:1 respectively when used as badge/tag text on a tinted
`--panel` background (e.g. `.legal-tag`, `.sev-critical`) - a real
combination this template renders. Caught by `render-html.axe.e2e.test.ts`,
the report's own axe-core self-test against WCAG 2.2 AA. Both tokens are
lightened just enough to clear 4.5:1 against that worst case with a
small margin (visually indistinguishable from the mockup at normal
viewing size). Do not revert to the literal mockup hex values without
re-running that test.

## Typography

Font: **Inter**, self-hosted as base64-embedded woff2, taken byte-for-byte
from the flat mockup's own "latin" unicode-range `@font-face` blocks
(weights 400/500/600/700) rather than re-sourced from `@fontsource/inter`
separately - see the `@font-face` comment at the top of `report.css`.
The mockup ships six other unicode-range subsets per weight (cyrillic,
greek, vietnamese, etc.) that were left out: neither French nor English
(this template's only two supported languages) needs them, and embedding
all of it would nearly 7x the file's size on every report render. The
mockup has no italic face at all; 400-italic (`.cross`, the
diverted-finding strike-through note) is kept from the prior Inter
embedding rather than dropped, so `.cross` keeps a real italic face
instead of falling back to browser-synthesized fake italic.

| Weight | Style | Used for |
| --- | --- | --- |
| 400 | normal | body copy, table cells |
| 400 | italic | `.cross` (diverted-finding strike-through note; not in the mockup, kept from the prior embedding) |
| 500 | normal | `h1`/`h2`/`h3` (mockup's own `--font-heading-weight` token) |
| 600 | normal | eyebrow labels, badges/chips read as headings (`.toc .n`, `.obs h3`, `.rule-title`, `.gloss-item dt`) |
| 700 | normal | numeric emphasis only: `.rank`, `.tile b` (big stat numbers), `.theme-meta .v`, `.miss` |

The mockup's badges/tags (severity pills, quick-win, legal-tag, chips)
render at 400-500 weight in the source, not bold - `report.css` matches
this (`.badge`, `.risk`, `.legal-tag`, `.qwin`, `.chip` all moved from
700 to 500). This was the biggest single legibility difference from the
old Roboto/GlassWire version, which set nearly everything to 700.

Font sizes and line-heights are **unchanged** from the pre-existing
print-tuned pt scale everywhere except the cover (see "Port status"
above) - the mockup's sizes belong to a different (deck) medium and
don't map 1:1 onto print points for sections that haven't had their own
pass yet. The cover's sizes are the one exception: converted directly
from the mockup's literal px values via the ratio noted at the top of
this document.

## Shape

- `--radius: 8px` - cards, tiles, panels (mockup `--radius-md`).
- `--radius-sm: 6px` - badges, chips, pills (mockup `--radius-sm`). The
  previous `--radius-pill` (999px, full stadium shape) is gone: the
  mockup's badges are rounded rectangles, not pills, on every page
  checked (severity badges, quick-win, legal-tag, risk badge, `.chip`,
  `.obs-tag`).

## Components confirmed against the mockup source

Placement below is determined by section order, not by fixed PDF page
numbers: since plan 018 every numbered section starts its own physical page,
so the page a section lands on depends on which sections are included.

- **Cover**: ported structurally from the flat file's own COVER section.
  A `radial-gradient(ellipse 238mm 148mm at 50% 0%, ...)` ground
  (`--section-glow` → `--section` → `--bg`) behind the whole `.cover`
  box, no wordmark (the mockup has none - a small uppercase kicker
  "Odysseus · Audit numérique" stands in for it). Kicker, the
  commercial-name `h1`, and a generic decision question line sit centered
  in the flex-1 upper block; a short accent rule (`.cover-rule`), then
  the concise report type line and an audit date plus Odysseus signature
  line, close the flex-bottom block. Restructured on 2026-09-01
  (plan 018): the six-field grid and risk pill described below moved to
  the metadata sheet, leaving the cover minimal by contract. The
  mockup's own "Page 1 / N" corner label is deck-viewer chrome with no
  equivalent here and was not ported. The 18mm section padding *was*
  ported: `.cover` cancels this template's shared Playwright print
  margin on itself (negative margin) and fills exactly one physical A4
  page, so the radial gradient bleeds to every page edge the way the
  mockup's own `margin="0"` doc-page does, while the 18mm comes back as
  `.cover`'s own padding so the content sits exactly where it would have
  under the old margin-only layout - see the `.cover` comment in
  `report.css`.
- **Metadata sheet** (second physical page, added 2026-09-01, plan 018):
  carries the cover's former six-field two-column grid (`.cover-grid`,
  `.cover-field`): site audited (this template has no separate "client
  name" field, so the mockup's `CLIENT` slot is `SITE AUDITÉ` / the
  audit's own `siteUrl`), audit date, pages scanned, report language, and
  standard audited, plus a legal-name field and the overall risk as a
  `.risk-badge` pill (solid fill, no border, no glyph - the previous
  bordered-outline treatment and severity glyph were mockup-mismatched
  and dropped). Below the grid sits the severity scale (dot, label, and
  meaning rows) with its basis note. It reuses the existing cover-grid
  and tile vocabulary; no new tokens were introduced.
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
  hairline row dividers, no zebra striping, generous row padding.
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
