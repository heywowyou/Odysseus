# Before/after: plan 039 restyle (baseline 9d5383e Nocturne vs site-language restyle)

Re-critique run 2026-09-11, same method as the baseline pack: dual-agent
(A: design review on the new renders, B: detector + browser evidence) plus
the main-thread synthesis. After-evidence: `new-pdf/` (small-site FR all 38
pages; briketenia FR key pages), `new-preview/` (fresh captures + final
HTML), `detector-after/` (final no-config JSONs).

## Scores and hard gates

| Measure | Before (Nocturne) | After (site language) |
| --- | --- | --- |
| Heuristic review (baseline rubric 23/32 = 72%; after-run rubric 69/90 = 77%; different rubric, direction only) | 72% | 77% |
| Detector, rendered report FR (`--no-config`) | 461 (224 undersized, 172 tiny-text, 41 low-contrast FP class, 18 skipped-heading, 4 tight-leading, 1 all-caps, 1 overused-font) | 460 (same classes minus overused-font) |
| Detector, reference HTML (`--no-config`) | 58 | 57 (overused-font closed) |
| Detector, preview FR/EN (`--no-config`) | 1 each (kicker-above-heading) | **0 each, exit 0** |
| axe WCAG 2.2 AA (report HTML; preview FR+EN at 320/1280) | 0 violations | 0 violations (first-hand re-run) |
| Preview 320px horizontal overflow | none | none |
| Preview inlined fonts | system stack | Avenir Next 400/600/700, all report `loaded` |
| Report unit loop | 743 passed | 743 passed |
| Report invariant + axe e2e loops | 24 + 5 passed | 29 passed (incl. regenerated checklist pixel baseline) |
| Preview unit loop | 69 passed | 69 passed |

## Findings closed

- **P0 identity discontinuity** (assessment A baseline): closed. "Report
  and preview now open as unmistakably Odysseus" (re-critique verdict);
  the violet/Inter world and the system-font preview are gone.
- `overused-font`/Inter: closed at the source (face retired; the committed
  config ignore is now inert and is removed by step 8).
- `kicker-above-heading` on both previews: closed by the de-kickered hero
  label treatment (string untouched, sentence case, body size, muted).
- Preview audit P2s: `.mt` unstyled (styled), disclosure flush-boundary
  (`cramped-padding` introduced then closed by decoupling the disclosure
  from card chrome entirely), missing `color-scheme` declarations (screen
  dark / print light), footer-link touch targets (padded, bordered),
  invented 10px radius (snapped to the site ladder: 12/4/3), hard-coded
  CTA literals (tokenized).

## Findings introduced / still open (recorded, not silently dropped)

- **Severity/dossier colour collision (design tension, not a defect):** a
  finding card now carries the red problem dash AND red severity text
  (e.g. impact "Élevé") in one card; the green action dash coexists with
  the green quick-win pill. The dossier marks are decoration with their
  meaning in the row labels (per binding decision 5 and "The Dossier Rule
  Set"); severity keeps its plan 023 hues. Resolving the tension means
  re-colouring severity or the quick-win pill - an operator decision
  beyond this plan's direction round, recorded here.
- The report's numbered sky eyebrows read as the kicker pattern the site
  banned; consciously kept (locked section-header text, navigation
  device) and recorded in the direction contract.
- `skipped-heading` (18/19), `undersized-ui-text` (224/24), `tiny-text`
  (172/11), `tight-leading` (4), `all-caps-body` (1/3), and the single
  false-positive `low-contrast` class (41x: checklist print ink measured
  against the screen body ground, confirmed one pair `#161826` on
  `#0e0f18`): unchanged, classified as before (deliberate print-tuned
  conventions or media-query cross-product false positives).
- With-config `design-system-*` cross-checks on the reference (7 + 3 + 1):
  advisory DESIGN.md-context checks; the report keeps its own
  print-proportioned type scale and radius values inside the shared
  system, as the tokens document records.

## Re-critique claims checked and dismissed

- "Inverted checklist chrome nearly disappears": dismissed with a
  high-resolution crop - the page counter and the confidential footer are
  `#161826` on the light page (the print block's `!important` margin
  overrides work as before); the impression came from the 96dpi full-page
  raster.
- "Metadata sheet dead middle": the plan 023 two-act composition
  (risk band pulled to two-thirds by `margin-top: auto`), unchanged from
  the baseline behaviour, not a regression of this restyle.

## Page counts (explained)

| Render | Before | After | Why |
| --- | --- | --- | --- |
| small-site FR | 37 | 38 | Avenir Next sets slightly wider at body sizes; one section's tail flowed onto an extra sheet (one-section-start-per-page amplifies single-line moves) |
| small-site EN | 34 | 34 | no boundary crossed |
| large-rule-families FR | 37 | 37 | no boundary crossed |
| large-rule-families EN | 35 | 36 | same mechanism as small-site FR |
| multi-page FR | 42 | 41 | metrics slightly tighter in the appendix tables; one continuation page reclaimed |
| briketenia FR | 40 | 40 | unchanged |
| briketenia EN | 40 | 39 | same mechanism as multi-page FR |

All movements are one page, in both directions, consistent with a
typeface metrics change; the paged invariants (no blank interior pages, no
duplicated fragments, one section start per page) and the 60-page warning
behaviour are green.

## Addendum: preview cover (operator request at the step 7 review)

The operator accepted the restyle and asked for one addition: the preview
should open on a cover rather than the hotel name sitting on top. Built
from the document's own opening elements (label, business name, lede,
scan date, same order, no new wording) wrapped in a `<header
class="cover">` hook:

- Screen: a full-viewport opening with the report cover's sky-navy glow,
  centered type in the display register, and the centered symmetric-fade
  accent rule before the date line. The glow is painted on the body
  canvas at document top, so it bleeds edge to edge with no
  overflow-prone negative margins and fades before the first card.
- Operator PDF: the cover fills the first A4 page (min-height 268mm) in a
  light sky wash consistent with the document's light print scheme -
  caught by the detector mid-implementation as a real defect (the dark
  screen gradient under print ink measured 1.0:1), fixed by applying the
  print wash on the element that paints the gradient.
- Verification: preview unit 69/69, v2 axe e2e green, detector
  `--no-config` exit 0 both languages, no horizontal overflow at 320px,
  printed PDF is cover page + content pages (4 pages total, no blank).
