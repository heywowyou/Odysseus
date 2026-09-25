# Defect hunt ledger

Active plan: `plans/075-clean-true-audit-data.md` (reopened 2026-09-24 by
sweep 7; Part H deployed in `ec24648c` the same day)

Brief: `docs/agents/audit-data-defect-hunt.md`

## Where the hunt stands

- **Stop rule: 0 of 2.** The last complete sweep (7, 2026-09-24) found 7 new
  material defects. Two consecutive complete sweeps with none are needed, the
  second with a fresh angle.
- **Data state.** Part H is deployed and all 13 stored audits were refreshed
  on 2026-09-24. Their stored findings equal the in-memory replay recorded in
  plan 075, Part H implementation record. No audit was rescanned for Part H.
- **Next: sweep 8**, on the 13 refreshed audits (listed in plan 075, Part H
  intro) plus any full audit completed since. Start with whistlerparis,
  villasfoch, bellevigne-hotels, grand-hotel-opera and hotelpointfrance, then
  work through the start list below.

## Sweep 8 start list

Angle 13 (replay against closed slices) has these named targets. A miss is a
completion defect of the slice, as in sweep 7.

| Slice | Audit | Expected on the refreshed findings |
|---|---|---|
| H1, Q5 | whistlerparis | one site-wide `image-alt` finding; 1 critical in total (was 59) |
| H1, Q5 | villasfoch | `image-alt` at the Q5 shape; 2 critical in total (was 15) |
| H2 | whistlerparis | `aria-prohibited-attr` at most 3 (was 10); no rule gained findings on any audit |
| H3 | bellevigne-hotels | `aria-required-children` 1 (was 6); header logo `link-name` 1 (was 3) |
| H3 | grand-hotel-opera | `button-name` 3, one per real component (dots, arrows, back-to-top) |
| H4 | bellevigne-hotels | `hreflang-no-return-link` 1 (was 22), occurrences preserved |
| H4 | hotelpointfrance | `broken-internal-link` 1 (was 11), occurrences preserved |
| H5 | grandhotelchicago, grandhoteldesalpes, hotelpointfrance, whistlerparis | 0 `structured-data-entity-missing` |
| H5 | whistlerparis | 0 `faq-content-without-schema` |
| G7 | grandhotelbellevue | the four `/book` doorways are `redirect-interstitial`, outside the analysed and measured pages |

Checks that only a new scan can answer (any full audit completed after
`ec24648c`):

- H6: the audit environment records the French locale, not
  `chromium-default`. grandhoteldesalpes's `/fr/` pages are analysed only
  after a rescan, which runs only if that hotel is to be contacted.
- H7: no `structured-data` check fails with the tokenizer's
  `failed to tokenize` error.

Other carried checks:

- Angle 11: hotelpointfrance's report step used to fail in the structure pass
  (more than 20 themes, left outside plan 075). Read whether the 2026-09-24
  refresh stored a report or the same failure.
- Angle 9: the five previews sent on 2026-09-24 keep their pre-H totals by
  decision (republishing would revoke the sent links). Check that every
  preview built after the refresh carries the refreshed findings digest.
  Trade-off 121 (2026-09-25) lets the operator send at their own pace, so more
  previews may exist.
- Angle 8: copy the refreshed FR PDFs this time. Sweep 7 read counts from the
  findings only.

## Sweeps

| Sweep | Date | Audits | Angles (brief numbering) | Complete | New material | Plan part |
|---|---|---|---|---|---|---|
| 1 | 2026-09-22 | 12 | 1, 2, 3 (large rules), 4, 6 partly | before the brief | about 25 | Evidence A to C; Parts A to D |
| 2 | 2026-09-22 | 12 | 5 partly, 6, 7 (frames), 9, preview selection | before the brief | 9 | Part E (E1 to E8; Q1 to Q3) |
| 3 | 2026-09-22 | 12 | 1, 3 (small rules), 5, translation pairing, 9 | before the brief | 8 | A9; E9 to E14; decisions |
| 4 | 2026-09-23 | 8 post-075 rescans (7 full, 1 capped pilot) | 1 to 10; fresh angle became 11 | yes | 7 | Part F (F1 to F7) |
| 5 | 2026-09-23 | same 8 | 1 to 11; fresh angle became 12 | yes | 4 | Part F (F8 to F11, Q4) |
| 6 | 2026-09-23 | hotelchateauroyal and grandhotelchicago rescans, their FR reports, the reference audit, the lacoorniche failure | 1, 2, 4, 8 (legal wording), 9 | no | 7 | Part G (G1 to G7) |
| 7 | 2026-09-24 | latest full audit of all 13 VPS sites, replayed with `5abe9b7a` | 1 to 11 (12 not applicable: no repeated run); fresh angle became 13 | yes | 7 | Part H (H1 to H7, Q5); plan reopened |

Trend of new material defects per sweep: 25, 9, 8, 7, 4, 7, 7. It has not
converged. Sweep 7 read seven audits no earlier sweep had seen, and its new
replay angle found two closed slices that never shipped.

hotelchateauroyal, read in sweeps 4 to 6, was deleted from production on
2026-09-23 under the territory rule (trade-off 112). Its findings stay here as
history. They cannot be checked again.

## Open doubts

| Doubt | Since | Angle | Smallest action that settles it |
|---|---|---|---|
| Cause of the Lighthouse IndexedDB storage warning (E5). Plan 075's closure ledger expects the probe result to be recorded, and it never was. | sweep 2 | 6 | One Lighthouse probe of an already-audited page, with and without storage reset |
| French copy has never had a full per-rule review against the writing style and obligation basis. It was read only for the rules each sweep touched. | sweep 4 | 8 | Read the refreshed FR PDFs rule by rule in sweep 8 |
| `focus-order-mismatch` has never had a finding to sample | sweep 4 | 3 | None until an audit produces one; check again each sweep |
| Why chicago's lab CLS runs are bimodal (whole-`body` shifts in some runs only). The finding side is covered by F9. | sweep 4 | 6 | One Lighthouse probe of the chicago homepage |

Settled or moot:

- hotelchateauroyal's `/en/` pages missing the 30 s `load` event is moot,
  because the site was deleted (trade-off 112).
- The outreach preview never having been read from stored data was settled in
  sweep 7. The five sent previews were read from the database and the preview
  bucket, and none shows a false claim.

## Minor items (not counted toward the stop rule)

| Item | Found | Status |
|---|---|---|
| `measure-audit-data-quality.mjs` does not pass `redirectTargetUrl`, so its after-pass drops `sitemap-lists-redirects` (and `sitemap-stale` on grandhoteldesalpes) by 1 or 2 occurrences | sweep 4 | open; still true on 2026-09-25; plan 075's closure record relies on this entry |
| Stored English descriptions keep « (s) » placeholders. They are not rendered, but they are model input (for example `normalize-sitemap.ts:172`, `:229`, `normalize-accessibility-statement.ts:56`) | sweep 5 | open |
| `skipped-external-redirect` pages store no redirect target, and `sitemap-lists-redirects` reports « 0 off-site » for sitemap entries skipped as external redirects | sweep 4 | not rechecked since G7; the only reproduction (hotelchateauroyal) is deleted |
| A merged `hreflang-target-invalid` keeps one page's `perPage.targetUrl`, which can differ from its description | sweep 4 | not rechecked |
| The Apidae agenda web component, outside a frame, is counted as the site's (`scrollable-region-focusable`) | sweep 4 | open |
| Three « Report issue » job rows keep the failed status of the `occurrence(s)` render lint, which was fixed in `020286ad` | sweep 4 | not rechecked since the 2026-09-24 refresh |
| whistlerparis writes partner links without a scheme, so they resolve under `/fr/page/` and land on the homepage. No rule reports it. | sweep 7 | open, no slice |
| Titles of 61 to 65 characters flagged as « much longer than 60 » | sweep 4 | fixed by F13 |
| villasfoch EN and ES pages carry French titles | sweep 5 | became F12, shipped |
| chicago lab CLS doubt | sweep 4 | explained in sweep 5 as bimodal runs, covered by F9 |

Outside the hunt: outreach threads left in `e1-drafted` after their drafts
were deleted (outreach state, not audit data).

## Sweep 4 notes

Audits: the post-075 rescans that reached `manifest.json` (capdantibes,
atlantichotel, hoteldegarlande, villasfoch, grandhotelchicago,
grandhotelbellevue, hotelchateauroyal, the 5-page haaitza pilot), plus the
grand-hotel-opera refusal for population. Read locally from a scratchpad copy
(JSON and FR PDFs only), with a local core build equal to the deployed
`f09cd305` packages.

- Population: homepage scanned on all 7 full audits (new); 18 navigation
  timeouts on hotelchateauroyal (new, F1); late off-site booking stubs still
  `visited` on chicago and bellevue (new, broader than A3, F2).
- Acquisition: timeouts leave no check-attempt row (F1); per-check budgets
  held on bellevue (clean); chicago spent 22 failed Lighthouse attempts on
  stubs (F2).
- Per-rule: every rule with 3 or fewer findings read, plus samples of the
  large ones. New: noindex evidence from noindex pointers (F3), NAP against
  editorial numbers (F4), robots-txt on a fetch timeout (F5). Clean:
  `jsonld-invalid`, `list`, `input-button-name`, `select-name`,
  `aria-required-children`, Lighthouse `canonical`, `sitemap-missing`.
- Counting: runtime state classes split `image-alt` and in-frame YouTube
  findings (new, F6). Known C splits still present (`link-name`,
  `heading-hierarchy-skip`, `crawlable-anchors`, `layout-shifts`, per-target
  `hreflang-target-invalid` and `broken-internal-link`), and C6 twins and Q2
  diagnostics are not yet folded (known).
- Absence: capped crawl claims absence (new, F7); hotelchateauroyal's failed
  candidates correctly made 6 absence rules manual (clean).
- Measurements: lab LCP 3 to 8 times CrUX p75 on 6 audits (known, E5); 0
  runtime errors in stored runs.
- Attribution: in-frame content labelled and kept out of the grade (clean);
  Apidae agenda web component outside a frame counted as the site's (minor).
- Client surfaces: hotelchateauroyal priority 6 and the robots.txt syntax
  advice are false (F1, F5); villasfoch cover counts 15 critical, 14 of them
  split `image-alt` (F6).
- Stored products: 11 reports, 0 approvals, 0 previews, 0 drafts on the 8
  audits (clean).
- Fresh angle, terminal job state against its artifacts (now angle 11): the
  three « Report issue » rows failed on the `occurrence(s)` render lint
  (minor, dashboard state).

## Sweep 5 notes

Same eight audits and local copy. Samples chosen apart from sweep 4's.

- Population: duplicate titles, odd URLs, key pages, and discovery method
  per audit. New: unlinked sitemap pages are 106 of 143 on
  hotelchateauroyal, mostly theme demo rooms and taxonomy archives (F8,
  operator question Q4). Clean elsewhere: sitemap-only pages are real
  content on chicago, bellevue and hoteldegarlande. atlantichotel's four
  homepage spellings are trade-off-accepted (A6).
- Acquisition: rendered and head titles agree on every page (clean).
- Per-rule: `color-contrast` (all findings), `label`, `target-size`,
  `button-name`, `link-name`, `frame-title`, `reflow-horizontal-scroll`,
  `placeholder-only-label`, `aria-required-attr`, `link-in-text-block` and
  `crawlable-anchors` sampled. New: contrast on unavailable calendar dates
  (F10). Klaro consent buttons in `crawlable-anchors` and `color-contrast`
  are the site's configuration (real).
- Counting: consistency invariants hold on every audit (clean).
- Absence: `jsonld-missing` and `canonical-missing` confirmed by live
  probes of two homepages (clean).
- Measurements: the scanner's stability verdict is computed and ignored,
  with 49 of 197 pages materially contradictory (new, F9).
- Attribution: MotoPress and Klaro are site-configured components (real,
  apart from F10's exemption).
- Client surfaces: page 4 and the priority-coverage sentence count
  frame findings that the stats tile excludes (new, F11). atlantichotel
  priorities 1 to 4 read against the data: correct apart from F11's
  denominator.
- Stored products: unchanged (11 reports, 0 approvals, previews, drafts).
- Fresh angle, run-to-run determinism (now angle 12): two back-to-back
  haaitza runs of the same 5 pages gave identical findings apart from one
  minor Lighthouse diagnostic (clean; noise already covered by F9 and Q2).

## Sweep 6 notes

A targeted sweep after the Part F fixes, not a complete one, so it does not
count toward the stop rule. It read the operator's rescans of
hotelchateauroyal and grandhotelchicago, their regenerated FR reports, the
anonymized reference audit built from chicago, and the lacoorniche coverage
gate failure. F1's goal held (no navigation-timeout errors, no
timeout-driven link or hreflang finding). The evidence and slices are
recorded in plan 075, Part G, rather than repeated here.

## Sweep 7 notes

Audits: the latest full audit of each of the 13 sites under `/data/artifacts`
on the VPS, read over SSH and copied to the scratchpad (JSON only). Trigger:
the operator saw Whistler's 59 critical `image-alt` findings. Every audit was
re-normalized in memory with the current core build: counts equal the stored
ones on 12 of 13 (haaitza 55 → 56), so the defects are live in today's code.

- Population: 0 findings on non-visited pages on all 13 (clean). New:
  grandhoteldesalpes's 43 `/fr/` and 40 `/it/` pages are redirected to their
  English translation by WPML's browser-language script, because our
  Chromium keeps its English default locale; only 39 English pages were
  analysed (H6, live probe of one page). Known: bellevigne's `/?r=0` (A6).
  whistlerparis's scheme-less partner links resolve to redirects (minor).
- Acquisition: `structured-data` fails with `tool-error` on 100% of
  grandhoteldesalpes and 61% of grand-hotel-opera pages; html-validate's
  tokenizer rejects a stray `"=""` attribute (new, H7). haaitza's 57
  `canonical-target` timeouts are check-level and produced no finding.
- Per-rule: every critical finding on the 13 audits read, plus all
  whistlerparis findings and the largest rule per audit. New: GEO rules
  ignore JSON-LD `@graph` (H5): `structured-data-entity-missing` false on 4
  of 13 audits, `faq-content-without-schema` false on whistlerparis. Clean:
  Klaro buttons, `jsonld-missing` on grand-hotel-opera, lacoorniche
  `crawlable-anchors` (11 distinct components).
- Counting: new or broader than recorded: image identity never shipped
  (H1: whistlerparis 59 findings for 7 images, villasfoch 14 still live);
  shape identity reads truncated markup (H2: whistlerparis
  `aria-prohibited-attr` 10 for one component); runtime ids and class order
  (H3: bellevigne 6 critical for one Swiper list, grand-hotel-opera 3
  critical for one button); C5 never shipped (H4: bellevigne 22
  `hreflang-no-return-link`, hotelpointfrance 11 `broken-internal-link`).
  Known: `heading-hierarchy-skip`, `layout-shifts`, `link-name` splits.
- Absence: GEO absence claims read head metadata, which succeeded; the
  false claims are H5, not a failed check.
- Measurements: lab metric criticals on haaitza, hoteldegarlande and
  hotelpointfrance (known, E5 and Q2). Not re-measured.
- Attribution: lacoorniche uMap and atlantichotel YouTube findings stay in
  frames, outside the grade (clean, Q1).
- Client surfaces: grade unchanged by the splits (D on any critical), but
  whistlerparis's cover counts 59 critical where the site has 7 images, and
  its priorities lead with them. PDFs were not copied; counts read from the
  findings the report is built from.
- Stored products: whistlerparis had a generated FR report on the split
  data (`2026-09-24T18-32-45Z`), not sent; the refresh generated a new one. Five
  first emails went out on 2026-09-24 with live v3 previews (read from the
  database and the preview bucket through the app container, read-only):
  villasfoch, capdantibes, atlantichotel, hoteldegarlande, grandhotelbellevue.
  Each preview's `sourceFindingsDigest` equals its audit's. No false claim is
  shown, and all three priority cards describe real defects. Totals are
  inflated where splits exist: villasfoch « Critique 15 » (14 are H1's split
  `image-alt`), grandhotelbellevue « Sérieux 23 » (12 `link-name`, known
  split), capdantibes « Sérieux 17 » (10 `target-size`). hoteldegarlande's
  third card (critical LCP) rests on lab runs only, since CrUX has no LCP for
  it (E5). Republishing would revoke the links already sent, so the previews
  stay; corrections go into the paid report.
- Terminal state: hotelpointfrance's report step failure is the known
  structure-pass limit (recorded at 075 closure).
- Determinism: no audit has two runs of the same pages this sweep.
- Fresh angle, stored findings against a replay with today's code (now
  angle 13): it is how the unshipped F6 and C5 slices surfaced (a closed
  slice whose target site still fails on replay).
