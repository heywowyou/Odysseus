# Open report residuals a visual change would close (plan 039 step 2, item 5)

From `docs/report/report-feedback-deferred-items.md` and
`docs/report/audit-rehearsal-notes.md` (inventoried 2026-09-11). Neither
document ties any open item to the Nocturne palette specifically; the
residuals are pagination and typographic mechanics. What a palette/typography
restyle genuinely touches:

## Directly touched by this restyle

- **Checklist print inversion losing its reason.** If the whole report goes
  light (step 3 question 1), section 05's light `@media print` inversion
  (`#f7f7f5`) no longer contrasts with a dark document - its documented
  reason disappears. Binding decision 7: the test is rewritten to assert the
  new documented behaviour and the change recorded, never deleted silently.
  The four severity level pairs currently re-derived against `#f7f7f5` move
  to the new ground (question 3).
- **The 10px/10.5px smallest-type steps** (metadata labels, margin-box
  counters, tags): the site's own label floor is 11px; adopting it lifts the
  detector's biggest finding class and Sam-persona legibility in one move.
- **Severity shade divergence from the dashboard**, if shades are re-tuned
  for a light ground: recorded in the trade-off entry per binding decision 5.

## Recorded, not closable here (content/structure/pagination locks)

- Orphaned appendix group/section headings; missing repeated table header on
  two continuation pages; section-opener separation; checklist group-header
  orphans; annex URL row separation (all Paged.js pagination mechanics,
  trade-offs 17/32 territory).
- "f233 et 1 autre" underline-gap; checklist COMPLEXITE/IMPACT column
  collision (#48); #47 metadata row wraps; #130 page-7 heading clip; #45.
- French colon spacing (ASCII space, #82 EN annex French spacing): strings/
  copy layer, not CSS.
- Priority-card label duplication ("CE QUE VOUS POUVEZ FAIRE" over
  "ACTIONS RECOMMANDEES"), the confident-stamp-on-checklist contradiction,
  the checkbox column, cover domain-vs-business: content contracts, locked
  in this plan.
