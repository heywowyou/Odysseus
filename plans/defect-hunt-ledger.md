# Defect hunt ledger

Active plan: `plans/075-clean-true-audit-data.md` (reopened 2026-09-28 by
sweep 8 with Part I)

Brief: `docs/agents/audit-data-defect-hunt.md`

## Where the hunt stands

- **Stop rule: 0 of 2.** The last complete sweep (11, 2026-09-29) found 5 new
  material defects. Two consecutive complete sweeps with none are needed, the
  second with a fresh angle.
- **Data state.** Production runs `2d4afdd6` (Part K, fingerprint
  `b8af13c49ae79f87`). The 28 latest audits were refreshed after the deploy,
  and clos-sainte-marie, aflatta, labaignoirelacanau and grand-hotel-opera
  were rescanned on it (operator approved). Part L (L1 to L5) is recorded in
  plan 075, not implemented.
- **Access.** Read-only scripts in the app container, as in sweeps 8 to 10.
  Writes this sweep, approved by the operator on 2026-09-29: the findings
  refresh, the four rescans, and a push of the Part K commits. The
  dashboard API is reached with the operator credentials in the repository
  `.env`, used only for that service. Live probes: one page each on aflatta
  (twice) and clos-sainte-marie, and `/llms.txt` or `/robots.txt` on nine
  already-audited sites.
- **Next: sweep 12**, after Part L ships and the audits are refreshed, and
  after the rescans Part L lists (atlantichotel, whistlerparis,
  grandhotelbellevue, aflatta). Start with the start list below, then every
  angle on every latest full audit.

## Sweep 12 start list

Angle 13 (replay against closed slices) targets:

| Slice | Audit | Expected on the refreshed findings |
|---|---|---|
| L1 | aflatta (rescan) | its 14 offer and voucher pages and `/panier` analysed; `title-announces-error` over 15 pages; the error pages of lacoorniche, haaitza, yonahotel and domaine-d-auriac still soft 404s |
| L2 | aflatta (rescan) | 0 `focus-order-mismatch` |
| L3 | alexanderpark, bellevigne-hotels | no dead URL in `sitemap-orphan-page`; a dead-URL finding naming 7 and 1 URLs |
| L4 | clos-sainte-marie, lacoorniche | 0 `entity-data-incomplete` on clos-sainte-marie; no `telephone` in lacoorniche's |
| L5 | regina-hotel, clos-sainte-marie, lescriquets | one language finding each (67 `/br/` pages; `/?lang=en`; `/boutique`), none elsewhere |
| K1 | domaine-d-auriac, regina-hotel (regenerated or new report) | the per-check sentence states the Tab walk not concluded, never « aucune anomalie » |
| Rescans | atlantichotel, whistlerparis, grandhotelbellevue | no NAP finding from article text on atlantichotel; `llms-txt-missing` on whistlerparis and grandhotelbellevue |
| Ledger | every audit | start from `pnpm measure:audit-data-quality` alerts: each is explained in the notes or recorded |

Other carried checks:

- Angle 8: the French per-rule copy review is still partial. Sweep 11 read
  five more labels (listed in its notes).
- Angle 17 (new): list the scanner changes since each audit's scan date that
  a refresh cannot replay.

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
| 8 | 2026-09-28 | 22 latest full audits (12 refreshed, grandhoteldesalpes rescan, 9 new sites), in place on the VPS | 1 to 13; fresh angle became 14 | yes | 3 | Part I (I1 to I3, Q6); plan reopened |
| 9 | 2026-09-28 | 21 latest full audits, replayed in place with the deployed `fa806424` core | 1 to 14 (12 not applicable; 8 partial); fresh angle became 15 | yes | 3 | Part J (J1 to J3) |
| 10 | 2026-09-29 | 28 latest full audits (21 refreshed on `9ad924f7`, 8 sites new to the hunt) | 1 to 15 (12 not applicable; 8 partial); fresh angle became 16 | yes | 6 | Part K (K1 to K6) |
| 11 | 2026-09-29 | 28 latest full audits (refreshed on `2d4afdd6`; 4 rescans) | 1 to 16 (8 partial); fresh angle became 17 | yes | 5 | Part L (L1 to L5) |

Trend of new material defects per sweep: 25, 9, 8, 7, 4, 7, 7, 3, 3, 6, 5.
It has not converged. Sweeps that read sites no earlier sweep had seen find the
most: sweep 8 (nine new sites) and sweep 10 (eight new sites, four of its six
defects found only on them).

hotelchateauroyal, read in sweeps 4 to 6, was deleted from production on
2026-09-23 under the territory rule (trade-off 112). Its findings stay here as
history. They cannot be checked again.

## Open doubts

| Doubt | Since | Angle | Smallest action that settles it |
|---|---|---|---|
| Cause of the Lighthouse IndexedDB storage warning (E5). Plan 075's closure ledger expects the probe result to be recorded, and it never was. | sweep 2 | 6 | One Lighthouse probe of an already-audited page, with and without storage reset |
| French copy has never had a full per-rule review against the writing style and obligation basis. Sweep 8 read every stored French analysis for legal and absolute wording only (I3); sweep 9 read three rules' labels and remediations. | sweep 4 | 8 | Read the remaining deterministic FR strings rule by rule; sweep 10 read eleven more and one regenerated analysis (heurope) |
| Why chicago's lab CLS runs are bimodal (whole-`body` shifts in some runs only). The finding side is covered by F9. | sweep 4 | 6 | One Lighthouse probe of the chicago homepage |

Settled or moot:

- The K2 cause was settled in sweep 11: on clos-sainte-marie's rescan each
  page records exactly one response whose size never settled, and every
  interactive check completes.
- `focus-order-mismatch` never having had a finding to sample was settled in
  sweep 9: its three findings were read and all are false (J3).
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
| One missing logo alt reported twice, as `image-alt` on the image and `link-name` on its anchor (lescriquets category tiles, villasfoch social icons) | sweep 8 | open; with Q6 (a) it is one site-wide finding of each rule |
| The `keyboard-trap` remediation (« la touche Echap ou un bouton de fermeture ») does not fit a field that blocks Tab with `onkeydown="return false;"` (heurope date field) | sweep 9 | open |
| The haaitza and lacoorniche previews published on 2026-09-28 before the deploy state pre-I2 serious totals (haaitza 16 against 15 after refresh, first email sent) | sweep 9 | kept by the standing decision on sent previews |
| regina-hotel lost the first attempt of every content check on 204 of 412 pages to `check-timeout`; all retries succeeded | sweep 8 | open, cost only |
| hotelmacchi's booking-engine button is two `color-contrast` findings, one under `widgets.secure-hotel-booking.com` (80) and one under an unresolved frame origin (4), same colour pair | sweep 10 | open; outside the grade |
| lacoorniche's TheFork booking frame served the crawler a DataDome captcha (118 frame records); the report does not say the widget was not evaluated | sweep 10 | open |
| The Hijiffy chat greeting in a same-origin `about:blank` frame counts as frame content (yonahotel 1, hotelcapucines 2 `color-contrast`) | sweep 10 | open |
| yonahotel's quote-wrapped `https:` and `mailto:` links land on the site's catch-all page; 3 are analysed as content | sweep 10 | open |
| The evidence-quality verdict is `failed` on all 28 audits (`environment-unapproved` everywhere), so the dashboard verdict does not tell audits apart | sweep 10 | open, outside the data |
| haaitza's live preview states « Critique 6 », one of them the false `noindex-on-public-page` (K5) | sweep 10 | kept by the standing decision on sent previews |
| clos-sainte-marie is one document served under six URLs (sitemap route aliases), so its counts are one document six times; no rule reports duplicate content | sweep 11 | open, no slice |
| grand-hotel-opera's Tarteaucitron button contrast appears on one page in one run and not in the next (consent banner state) | sweep 11 | open |
| grand-hotel-opera's preview (emailed 2026-09-28) was built on the pre-rescan audit: « Sérieux 12 » against 10 now | sweep 11 | kept by the standing decision on sent previews |
| domaine-d-auriac and yonahotel job rows still show the pre-K3 « Report issue »; no report was regenerated after the refresh | sweep 11 | open, operator action |
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

## Sweep 8 notes

Audits: the latest full audit of each of the 22 sites with findings under
`/data/artifacts`, read in place with read-only scripts in the app
container (counts, rule ids and selectors printed; nothing copied). The
production database was read the same way (counts, states, ids). Replay with
the deployed core equals the stored findings apart from the two Lighthouse 13
insights removed by `cf4092dc`.

- Population: grandhoteldesalpes now analyses its 38 French pages (H6) and
  turns its 113 English and Italian pages into `redirect-interstitial`
  (new, I1). fermesdemarie's 912 apex-to-`www` sitemap redirects and the
  other sites' slug and room redirects are real. Clean elsewhere.
- Acquisition: `mentions-legales` and `canonical-target` failures are
  `not-applicable` records. regina-hotel retried 204 pages' checks
  successfully (minor). fermesdemarie's 94 pages without content checks and
  heurope's anti-bot 429s blocked their reports (A9 and trade-off 122
  working).
- Per-rule: every critical finding on the 10 new audits read. New: the
  `link-name` and ARIA role splits (I2). True on inspection: hotelmareuil
  `jsonld-invalid` (live probe), `structured-data-entity-missing` on the five
  sites without JSON-LD, the Webflow `select-name` pair on fermesdemarie.
- Counting: I2. Logo alt twins (minor).
- Absence: JSON-LD absence confirmed by a per-page type count on five
  audits.
- Measurements: lab criticals on fermesdemarie, heurope and
  labaignoirelacanau are E5 and Q2 (known). Not re-measured.
- Attribution: regina-hotel's geo-like frame findings are in a frame (Q1).
- Client surfaces: the model's legal verdict (new, I3). The deterministic
  card wording is neutral.
- Stored products: 0 report approvals; 19 preview rows, 6 live; the only
  preview built since the refresh (grandhotelchicago) matches its audit's
  digest; the five sent on 2026-09-24 keep pre-H digests by decision.
- Terminal state: fermesdemarie, le37bishotel-paris and heurope failed at
  `report-fr` on the blocked-content gates, as designed. hotelpointfrance's
  refresh stored an analysis (angle 11 doubt settled).
- Determinism: no audit has two runs of the same pages yet (heurope's rerun
  was in progress).
- Replay against closed slices: every Part H and G7 target holds; H6's
  language-redirect record never shipped (I1).
- Fresh angle, model prose against the deterministic facts it restates (now
  angle 14): found I3.

## Sweep 9 notes

Audits: the 21 latest full audits with findings (fermesdemarie's latest
directory has no manifest; hotelchateauroyal is deleted), each re-normalized
in memory with the deployed `fa806424` core inside the app container. The
replay equals the local build's on every audit. Production database read the
same way (counts, states, ids).

- Population: heurope's rescan analyses 51 pages, 17 per language, homes
  included, nothing blocked. `language-redirect` appears on
  grandhoteldesalpes only (clean).
- Acquisition: heurope's ledger holds only `not-applicable` legal-page
  records (clean). Unchanged data elsewhere since sweep 8.
- Per-rule: every rule on 3 or fewer audits listed; read
  `focus-order-mismatch` (all false, J3), `keyboard-trap` (true),
  `svg-img-alt`, `listitem`, `label`, `nested-interactive`,
  `aria-tab-name` (true, split: J1).
- Counting: shape grouping of every axe rule outside the allowlist found
  only generated-token and state-class splits (J1).
- Absence: the Tab walk never reached the page on 4 audits, so the absence
  of `keyboard-trap` there says nothing (J3).
- Measurements: lab medians against worst-page findings on 5 audits (J2).
- Attribution: the dialogs holding focus are the sites' own consent banners
  and popups (clean).
- Client surfaces: FR `focus-order-mismatch` label overstates the check
  (goes with J3); heurope's executive summary and stability theme contradict
  its critical CLS finding (J2).
- Stored products: 2 previews published on 2026-09-28 before the deploy
  (minor); heurope's report generated at 11:11 before I3's deploy, and its
  obligation sentence is a description (clean).
- Terminal state: heurope's job completed with a French report (clean).
- Determinism: no audit has two stored runs of the same pages (not
  applicable).
- Replay against closed slices: every I1 and I2 target holds; I3 needs a
  regenerated analysis.
- Model prose against facts: J2.
- Fresh angle, the page state during interaction checks (now angle 15):
  which dialog, banner or popup was open when an interactive check ran. It
  found J3.

## Sweep 10 notes

Audits: the 28 latest full audits with findings on the VPS, 21 of them
refreshed in production before the sweep (each equal to its replay), read in
place with read-only scripts in the app container. Production database read
the same way (counts, states, ids). heurope's French report regenerated once
through the dashboard.

- Ledger alerts (12): clos-sainte-marie's four interactive checks (K2, K1);
  keyboard walks on domaine-d-auriac, grandhoteldesalpes, hotelmacchi and
  regina-hotel (J3 working, disclosure missing: K1); lacoorniche `image-alt`
  97 of 102 dropped (DataDome captcha images in TheFork's frame, correct);
  grand-hotel-opera `structured-data` 106 failed (H7 on a pre-H7 scan).
- Population: homepage visited on all 28. New: 404 pages as `blocked` (K3),
  offer pages dropped as soft 404s by title (K4). labaignoirelacanau's 81
  missing sitemap pages are the pre-`cab00a96` http spelling, not the site's
  own redirects as sweep 8 read them; lodgekerisper and masdelafouque,
  scanned later, lost none.
- Acquisition: resource-profile timeouts abandon pages (K2); yonahotel's
  Lighthouse `ERRORED_DOCUMENT_REQUEST` on 18 real pages, disclosed.
- Per-rule: every critical finding on the eight new audits read, and every
  rule on three audits or fewer that they bring. New: K5. True on
  inspection: yonahotel `document-title` (live probe), clos-sainte-marie
  `lcen-mentions-legales-missing` (live probe), auriac `autocomplete-valid`,
  restaurant-origines `aria-valid-attr-value`.
- Counting: J1 holds (328 axe findings, none split per rule and frame
  origin). hotelmacchi's frame-origin contrast pair (minor).
- Absence: the complementary-check note claims clean results for checks
  that never ran (K1).
- Measurements: lab criticals on masdelafouque and lodgekerisper without
  CrUX are E5 and Q2 (known). Not re-measured.
- Attribution: frames with unresolved origins read on nine audits; regina's
  are the third-party events-quote tool; Hijiffy and TheFork (minor).
- Client surfaces: clos-sainte-marie's and heurope's regenerated PDFs read.
  New: the legal-notice sentence (K6) and the clean-result note (K1). French
  label and remediation read for `noindex-on-public-page`,
  `sitemap-lists-noindex`, `relative-link-nesting`, `crux-lcp-poor`,
  `autocomplete-valid`, `html-has-lang`, `document-title`,
  `aria-valid-attr-value`, `hreflang-target-invalid`,
  `lcen-mentions-legales-missing` and `broken-internal-link`; the noindex
  copy goes with K5, the rest is accurate.
- Stored products: 0 report approvals; 11 live previews; haaitza's sent
  preview counts the false noindex critical (minor, standing decision).
- Terminal state: domaine-d-auriac and yonahotel stopped at `report-fr` on
  blocked pages that are dead links (K3); the other jobs completed.
- Determinism: no site has two complete runs of the same pages on one build
  (not applicable).
- Replay against closed slices: every I and J target holds; J2 and I3 hold
  on heurope's regenerated report; B2's haaitza cookie-policy target still
  fails (K5).
- Model prose against facts: heurope's regenerated summary and performance
  theme, restaurant-origines' summary (establishment type true per Atout
  France); clean.
- Page state during interaction: the Complianz banner held all 152 of
  domaine-d-auriac's walks; set aside correctly, not disclosed (K1).
- Fresh angle, the same component across audits (now angle 16): WooCommerce's
  cart and account pages are a minor finding on lescriquets and a critical
  one on domaine-d-auriac (K5).

## Sweep 11 notes

Audits: the 28 latest full audits with findings on the VPS, refreshed on
`2d4afdd6` before the sweep; four of them are rescans of 2026-09-29
(clos-sainte-marie, aflatta, labaignoirelacanau, grand-hotel-opera), each also
compared with its previous run, which the refresh had put on the same
normalization. Read in place with read-only scripts in the app container.
Production database read the same way (counts, states, ids). The four
rescans' French PDFs were read as text in the scratchpad.

- Ledger alerts (13): all on audits older than the rescans. Held walks and
  unread video audio are now recorded as inconclusive (K1); clos-sainte-marie's
  four failed checks are on its pre-K2 run; lacoorniche `image-alt` and
  grand-hotel-opera's pre-H7 `structured-data` as in sweep 10. None on the
  four rescans.
- Population: homepage visited on all 28. New: aflatta's gift vouchers and
  cart dropped as soft 404s (L1). Known: 148 and 3 dead URLs now
  `http-error-status` (K3). clos-sainte-marie serves one document under six
  URLs (minor).
- Acquisition: no check lost on the four rescans; unrecovered failures
  elsewhere predate K2 (masdelafouque, hotelmacchi) or were recorded before
  (yonahotel Lighthouse, haaitza `canonical-target`). K2's cause measured.
- Per-rule: every critical finding on the four rescans read, and the rules
  they bring that earlier sweeps had not sampled (`focus-order-mismatch`,
  `title-not-translated`, `consent-mechanism-absent`, `hreflang-no-return-link`,
  `entity-data-incomplete`, Lighthouse `canonical`). New: L2 (live probe),
  L4.
- Counting: no split found on the rescans; J1 holds.
- Absence: JSON-LD absence confirmed on grand-hotel-opera; dead sitemap URLs
  counted as orphan pages (L3).
- Measurements: labaignoirelacanau's lab criticals left with CrUX field data
  (as designed); clos-sainte-marie's lab-only criticals are E5 and Q2.
- Attribution: vendor components on the rescans (Swiper, Wix, Tarteaucitron)
  are the sites' own configuration.
- Client surfaces: the four rescan PDFs read (grade, totals, synthesis,
  priorities, methodology, regulatory section). K6 holds; the synthesis
  sentences match CrUX. French labels read for `entity-data-incomplete`,
  `sitemap-orphan-page`, `title-not-translated`,
  `consent-mechanism-absent` and `sitemap-stale`; the orphan label goes with
  L3, the rest is accurate.
- Stored products: 0 report approvals; 3 previews published since sweep 10
  (grand-hotel-opera and whistlerparis emailed, digests match; one for
  hotelpointfrance, whose audit is not among the 28); 11 threads.
- Terminal state: the four rescan jobs completed with a report;
  domaine-d-auriac and yonahotel keep their pre-K3 « Report issue » rows
  (minor).
- Determinism: each rescan against its previous run. Every difference is
  explained by K2, K4, CrUX availability, the labaignoirelacanau sitemap
  spelling or the llms.txt fix, apart from one consent-banner contrast
  finding (minor).
- Replay against closed slices: K1, K2, K3, K5 and K6 hold; K4 holds in
  part (L1).
- Model prose against facts: the rescans' executive summaries and
  performance sentences against CrUX and the findings (clean).
- Page state during interaction: aflatta's walk ran with no dialog open; its
  one inversion came from a moving carousel (L2).
- Same component, same verdict: WooCommerce account and cart pages now
  agree; YouTube and Hijiffy findings agree across audits.
- Fresh angle, stored scan-time results older than their checker's fix (now
  angle 17): whistlerparis and grandhotelbellevue read a redirected
  `/llms.txt` as present (fixed by `a2b99fac`), and atlantichotel's NAP
  findings compare article numbers (fixed by F4). Both need rescans, not
  code. A language check of every page added L5: regina-hotel declares its
  Portuguese pages Breton.
