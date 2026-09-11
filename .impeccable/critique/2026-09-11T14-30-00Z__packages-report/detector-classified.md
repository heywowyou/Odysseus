# Detector run, `--no-config`, classified (plan 039 step 2, item 3)

Runs at commit `9d5383e`, 2026-09-11. Command equivalent: the plan's literal
`node .agents/skills/impeccable/scripts/detect.mjs` path is stale after the
2026-09-11 binary reinstall; the same detector runs as
`.agents/skills/impeccable/scripts/impeccable detect --json --no-config <file>`.
Raw JSON under `detector/*.no-config.json` beside this file.

## Counts

| Target | Exit | Findings | By rule |
| --- | --- | --- | --- |
| `packages/report/src/template/report.reference.html` | 2 | 58 | undersized-ui-text 24, skipped-heading 19, tiny-text 11, all-caps-body 3, overused-font 1 |
| rendered report HTML (small-site FR) | 2 | 461 | undersized-ui-text 224, tiny-text 172, low-contrast 41, skipped-heading 18, tight-leading 4, all-caps-body 1, overused-font 1 |
| rendered v2 preview FR | 2 | 1 | kicker-above-heading 1 |
| rendered v2 preview EN | 2 | 1 | kicker-above-heading 1 |

The reference file and the rendered report share one design system, so the
table below classifies by rule, once, for both report targets (the rendered
copy additionally surfaces the dark-ground values the reference carries as
tokens). Preview findings are per-file because there is one each.

## Classification

| Rule (count) | Class | Reason, one line |
| --- | --- | --- |
| `undersized-ui-text` (24 / 224) | applicable-to-print | 10px and 10.5px hits are the documented metadata-sheet uppercase labels (opacity 0.5) and `@page` margin-box counters; a print document reads at 30cm, not 50cm from a screen; a light restyle should re-derive the smallest steps against the site's 11px label floor rather than keep 10px |
| `tiny-text` (11 / 172) | applicable-to-print | 10-11.5px caption/tag/meta scale, recorded as "unchanged from the pre-existing print-tuned pt scale"; same restyle note as above |
| `skipped-heading` (19 / 18) | not-applicable (this plan) | h1→h6 / h2→h5 skips are the deliberate numbered-eyebrow convention (`h6` as section label); heading-order is best-practice, not WCAG 2.2 AA, so the report's own zero-violation axe self-test passes; a markup-level fix is out of this plan's scope (class hooks only) and is recorded, not acted on |
| `all-caps-body` (3 / 1) | not-applicable | uppercase applies to eyebrow labels and table header cells, not body prose; 0.02em tracking is the documented Chromium print text-run fix |
| `overused-font` (1 / 1) | applicable-to-print (deliberate) | Inter is the locked print face per plan 023; the committed config ignores it for `packages/report/**`; step 3 question 2 re-opens exactly this |
| `low-contrast` (41) | not-applicable | all 41 are one false-positive class: the checklist's `@media print` ink `#161826` measured against the `@media screen` body ground `#0e0f18`; the two values never co-occur in any rendered medium (print pairs it with `#f7f7f5`) and the real pairing is guarded by the print-inversion and paged-invariant suites |
| `tight-leading` (4) | not-applicable | 1.20x line-heights are heading/tile-number display type; body is 1.55; display leading is a typographic choice, not a defect |
| `kicker-above-heading` (1 FR, 1 EN) | applicable-to-preview-screen | the preview's `.label` hero eyebrow ("Aperçu gratuit" / "Free preview") is exactly the pattern the site deleted 24 of on 2026-09-11; the string is locked content, but its treatment (uppercase, tracked, own block above the h1) is style and can be de-kickered in the restyle |

## With-config delta (Assessment B cross-check)

- The committed config suppresses nothing on the rendered files (they sit in
  /tmp, outside every path-scoped ignore); only the reference file's single
  Inter hit is suppressed in-repo.
- With config, the reference gains `design-system-color` 8,
  `design-system-radius` 2, `design-system-font-size` 3: DESIGN.md-context
  cross-checks that score documented Nocturne tokens against the dashboard/
  site system of record. All eight/rule verified as documented tokens, i.e.
  false positives for a report whose design system is intentionally its own.
- Browser evidence (first-hand, both previews, WCAG 2.2 AA tags): zero axe
  violations at 320x640 and 1280x900, both languages; no horizontal overflow
  at 320px. Consistent with the repo's own passing v2 axe e2e.
