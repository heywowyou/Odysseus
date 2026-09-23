# Defect hunt ledger

Active plan: `plans/075-clean-true-audit-data.md`

Brief: `docs/agents/audit-data-defect-hunt.md`

| Sweep | Date | Audits | Angles covered | New material defects | Plan sections touched |
|---|---|---|---|---|---|
| 1 | 2026-09-22 | 12 | Population, acquisition, per-rule (large rules), counting, measurements (partial) | About 25 | Evidence A, B, C; Parts A to D |
| 2 | 2026-09-22 | 12 | Measurements, attribution (frames), absence (partial), stored products, preview selection | 9 | Evidence E; E1 to E8; Q1 to Q3 |
| 3 | 2026-09-22 | 12 | Population (homepages, plugin objects), per-rule (small rules), absence, translations, production state | 8 | A9; E9 to E14; decisions; production state |
| 4 | 2026-09-23 | 8 post-075 rescans (7 full, 1 capped pilot) | All 10 (fresh angle: terminal job state against its artifacts) | 7 | Part F (F1 to F7); rescan execution ledger |
| 5 | 2026-09-23 | Same 8 | All 11 (fresh angle: run-to-run determinism) | 4 | Part F (F8 to F11, Q4) |
| 6 | 2026-09-23 | hotelchateauroyal and grandhotelchicago rescans, their FR reports, the reference audit, the lacoorniche failure | Population, acquisition, counting, legal, stored products (partial: not all 11 angles) | 7 | Part G (G1 to G7) |

These first three sweeps predate the brief and did not each cover every
angle, so they do not count toward the stop rule. The next run starts at
sweep 4, with all angles.

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
  Apidae agenda web component outside a frame counted as the site's
  (`scrollable-region-focusable`, minor).
- Client surfaces: hotelchateauroyal priority 6 and the robots.txt syntax
  advice are false (F1, F5); villasfoch cover counts 15 critical, 14 of them
  split `image-alt` (F6).
- Stored products: 11 reports, 0 approvals, 0 previews, 0 drafts on the 8
  audits (clean).
- Fresh angle, terminal job state against its artifacts: the three
  « Report issue » rows failed on the `occurrence(s)` render lint (fixed in
  `020286ad`) and keep that status after the 2026-09-23 regeneration (minor,
  dashboard state).

Minor, not counted:

- `skipped-external-redirect` pages store no redirect target, and
  `sitemap-lists-redirects` reports « 0 off-site » for sitemap entries the
  crawl skipped as external redirects (hotelchateauroyal).
- `meta-title-length`: 64 of 123 flagged titles are 61 to 65 characters,
  while the copy says « much longer than 60 ».
- A merged `hreflang-target-invalid` keeps one page's `perPage.targetUrl`,
  which can differ from its description.
- `measure-audit-data-quality.mjs` does not pass `redirectTargetUrl`, so its
  after-pass drops `sitemap-lists-redirects` (hotelchateauroyal 120 → 119).

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
- Fresh angle, run-to-run determinism: two back-to-back haaitza runs of the
  same 5 pages gave identical findings apart from one minor Lighthouse
  diagnostic (clean; noise already covered by F9 and Q2).

Minor, not counted:

- Stored English descriptions keep « (s) » placeholders
  (`cookie-non-essential-before-consent`, `tracker-request-before-consent`,
  `accessibility-statement-missing`, `link-text`, `html-structural-validity`,
  `sitemap-orphan-page`, `sitemap-lists-redirects`). They are not rendered,
  but they are model input.
- villasfoch's EN and ES pages carry French titles (« Chambres & suites
  Bordeaux ») on all 16 translated pages. It is a real SEO defect that no
  rule detects (a scope question, not a data error).
- The chicago lab CLS doubt from sweep 4 is explained: the runs are
  bimodal (0.00 against 0.8), which F9 now covers.

## Where the hunt stands

Sweep 6 ran on the hotelchateauroyal and grandhotelchicago rescans
(2026-09-23). F1's target held (no timeout-driven link or hreflang
findings), but the sweep found 7 new defects, recorded as plan 075 Part G.
All are fixed; G7 is committed and waits for a deploy. Sweep 6 did not cover
every angle, so it does not count as a clean sweep and the stop rule is not
met. The next full sweep should run on the lacoorniche (`83d9bd44`) and
haaitza (`a80110ab`) results and on hotelchateauroyal `15-20-37Z`, after G7 is
deployed.

## Open doubts carried forward

- Why hotelchateauroyal's `/en/` pages miss the 30 s `load` event while the
  HTML answers in 3.2 s (probably a hanging third-party resource). Settled
  only by a short browser probe of one page.
- What makes chicago's lab runs bimodal (whole-`body` shifts in some runs
  only); the finding side is covered by F9. Settled only by a Lighthouse
  probe of the homepage.
- Not yet covered by a post-075 full audit: grandhoteldesalpes, pointfrance,
  and grand-hotel-opera (refusal only). lacoorniche and haaitza full audits
  are running (2026-09-23).
- French copy was read in the stored PDFs for the rules touched by this
  sweep only; a full per-rule review against the writing style and
  obligation basis is still open (angle 8).
- The outreach preview was not rendered from stored data: none of the eight
  audits has a preview (angle 8).
- `focus-order-mismatch` has no finding on the post-075 audits, so it has
  still not been sampled.
- The Lighthouse IndexedDB warning cause is unconfirmed (E5 probe).
- The outreach threads left in `e1-drafted` after their drafts were deleted
  (outreach state, outside data quality).
