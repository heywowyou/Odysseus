# Audit: v2 outreach preview (plan 039 step 2, item 2b)

Read-only technical audit of the preview as a screen document served to
prospects, run as its own isolated pass at commit `9d5383e`, 2026-09-11.
Targets: the rendered FR/EN baseline documents, `styles-v2.ts`,
`render-html-v2.ts`, `pdf-v2.ts`.

## Audit health score

| # | Dimension | Score | Key finding |
| --- | --- | --- | --- |
| 1 | Accessibility | 3.5 | every measured pair passes AA (screen floor 5.0:1, print floor 5.6:1); no `color-scheme` declared |
| 2 | Performance | 4 | ~10KB self-contained, zero requests, no JS, system fonts |
| 3 | Theming | 3 | tokens traceable hex-by-hex to the locked Nocturne sources; invented 10px radius; two hard-coded CTA literals; no light-OS accommodation (by design, but `color-scheme` missing) |
| 4 | Responsive | 3.5 | zero overflow at 320/768/1280 both languages; footer links 25px tall, AA by 1px |
| 5 | Implementation integrity | 3 | derivation claim verified true; drift is structural (renderer emits `.mt`, `.tag`, `.disclosure`, stylesheet defines none of them) |
| **Total** | | **17/20** | **Good/Strong: ship-worthy as-is, all findings P2/P3** |

## Measured contrast (screen)

body `#e9e9ed`/`#161826` 14.54; muted `#b2b6ca` 8.75; faint `#9397ab` 6.08;
links `#d2cefd` 11.73; severity tiles 5.00-7.58 (keys on tile bg 7.35); CTA
11.73. Print block: text 16.41, muted 6.10-6.55, accent 9.57, severity pairs
5.61-7.03. Nothing relies on colour alone.

## Findings

- **P2** `.mt` emitted by render-html-v2.ts:54, never styled: the severity
  heading renders flush under the totals tiles. CSS-only fix.
- **P2** footer links (`Privacy...`/`opt-out`) ~25px tall, 11.2px apart:
  passes WCAG 2.5.8 by 1px, misses comfort guidance on a phone-read document.
- **P2** no `color-scheme: dark`: light-OS visitors get light UA scrollbars/
  overscroll against the fixed dark canvas (flip to `light` in the print
  block under the new scheme).
- **P2** detector finding `kicker-above-heading` ("Apercu gratuit" / "Free
  preview" above the h1): real pattern, deliberate content; the string is
  locked but its treatment is style. The site banned this pattern outright
  (24 removed, 2026-09-11).
- **P3** `.cta` hard-codes `#161826`/`#ffffff` instead of tokens; `--radius:
  10px` invented (Nocturne scale is 4/8); `--space-8` defined, unused; dead
  classes `.tag`/`.disclosure`.
- **P3 (deliberate)** system font stack abandons identity under the
  zero-network constraint; the font question is open at step 3 (a restyled
  preview may inline a licensed face if the licence answer allows).

## Positive findings

Minimum contrast 5.0:1, nothing near the AA cliff; print pairs re-measured
rather than assumed; custom focus-visible with a CTA variant that flips
outline colour on the accent fill; verb-first descriptive links in both
languages; single h1; real `ul`; tagged PDF output; renders identically with
JS disabled, offline, in mail webviews; `@page` and Playwright PDF margins
agree at 14mm.
