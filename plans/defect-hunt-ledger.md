# Defect hunt ledger

Active plan: `plans/075-clean-true-audit-data.md`

Brief: `docs/agents/audit-data-defect-hunt.md`

| Sweep | Date | Audits | Angles covered | New material defects | Plan sections touched |
|---|---|---|---|---|---|
| 1 | 2026-09-22 | 12 | Population, acquisition, per-rule (large rules), counting, measurements (partial) | About 25 | Evidence A, B, C; Parts A to D |
| 2 | 2026-09-22 | 12 | Measurements, attribution (frames), absence (partial), stored products, preview selection | 9 | Evidence E; E1 to E8; Q1 to Q3 |
| 3 | 2026-09-22 | 12 | Population (homepages, plugin objects), per-rule (small rules), absence, translations, production state | 8 | A9; E9 to E14; decisions; production state |

These first three sweeps predate the brief and did not each cover every
angle, so they do not count toward the stop rule. The next run starts at
sweep 4, with all angles.

## Open doubts carried forward

- French copy per rule was not reviewed against the writing style and
  obligation basis (angle 8).
- The outreach preview was not rendered from stored data and read as a client
  would read it (angle 8).
- Rules whose samples were not read in any sweep: `meta-title-length`
  thresholds, `third-party-data-transfer` (CDN origins counted as transfers),
  `focus-order-mismatch`, `aria-*` rules with 1 to 3 findings, and
  `html-structural-validity`.
- The Lighthouse IndexedDB warning cause is unconfirmed (E5 probe).
- The outreach threads left in `e1-drafted` after their drafts were deleted
  (outreach state, outside data quality).
