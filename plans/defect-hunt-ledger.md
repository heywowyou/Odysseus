# Defect hunt ledger

Active plan: `plans/075-clean-true-audit-data.md` (reopened 2026-09-28 by
sweep 8 with Part I)

Brief: `docs/agents/audit-data-defect-hunt.md`

## Where the hunt stands

- **Mode: occasional sweeps (operator decision, 2026-09-30).** The two-sweep
  stop rule is retired: twelve sweeps never converged by count, because each
  batch of new sites brings about one blocking defect per two sites (see the
  trend below). What gates a preview or a report is now the `audit-finalizer`
  skill, whose Stage 1 checks that one audit's scan data before it goes out,
  starting from the data-quality measure's page-population alerts
  (`scripts/lib/audit-population-alerts.mjs`). The next sweep runs after a
  batch of about ten new sites, after a large crawler change, or when a
  finalizer run finds a systemic blocking defect.
- **Data state.** Production runs `0b03686f` (Part M, fingerprint
  `4b655a31fc2aea1e`). On 2026-09-30 the 34 latest audits not being rescanned
  were refreshed on it and their analyses and French reports regenerated
  (domaine-d-auriac and chateaudecodignat included, for M5); atrium-hotel,
  leprieuredeboulogne, yonahotel and aflatta were rescanned with default
  pacing (no pushback on any earlier run, no `Crawl-delay`).
- **Access.** As in sweeps 8 to 12.
- **Stored products.** Each audit goes through `/audit-finalizer preview` or
  `/audit-finalizer report` before it goes out; the finalizer runs table
  below records them.
- **Next sweep** (not scheduled): start with the start list below, which also
  serves the first finalizer runs of these audits.

## Next sweep start list

Angle 13 (replay against closed slices) targets:

| Slice | Audit | Expected on the refreshed findings |
|---|---|---|
| M1 | atrium-hotel (rescan) | room, contact and legal pages analysed; the legal-notice finding decided on its legal notice page |
| M2 | leplacidehotel, regina-hotel | no `html-lang-content-mismatch` on the `/ja/` pages; regina keeps its 67 `/br/` pages |
| M3 | coin-savoyard, yonahotel (rescan) | the 31 canonical copies set aside and 16 duplicated `hreflang-no-return-link` findings gone; yonahotel's 11 parameter copies gone |
| M4 | leprieuredeboulogne (rescan), domaine-d-auriac, yonahotel | no `/feed` page; the methodology's two HTTP-error counts agree |
| M5 | any regenerated analysis citing CrUX | field data described as the site's, never the homepage's |
| M6 | domaine-d-auriac, leprieuredeboulogne, regina-hotel, yonahotel (re-render) | no note on auriac; 2, 7 and 18 failed pages stated |
| M7 | yonahotel (rescan) | none of the 11 « Elsewhere starts Here » shells analysed |
| #562 | aflatta (rescan) | no `focus-order-mismatch` on `/chambres-et-suites` |
| Ledger | every audit | start from `pnpm measure:audit-data-quality` alerts: each is explained in the notes or recorded |

Other carried checks:

- Angle 8: the French per-rule copy review is still partial.
- Angle 18 (new): every fact a report states twice (page counts, measured
  pages, HTTP errors, occurrence totals) says the same thing both times.

## Sweeps

Sweeps 1 to 10 were counted under the old rule (every material defect), so
their column holds that count; from sweep 11 the columns split blocking and
backlog.

| Sweep | Date | Audits | Angles (brief numbering) | Complete | New (blocking / backlog) | Plan part and issues |
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
| 11 | 2026-09-29 | 28 latest full audits (refreshed on `2d4afdd6`; 4 rescans) | 1 to 16 (8 partial); fresh angle became 17 | yes | 2 / 3 | Part L (L1, L5); #562 to #564 |
| 12 | 2026-09-30 | 38 latest full audits (refreshed on `d971a983`; 3 rescans, 10 sites new) | 1 to 17 (8 partial); fresh angle became 18 | yes | 7 / 0 | Part M (M1 to M7) |

Trend of new material defects per sweep: 25, 9, 8, 7, 4, 7, 7, 3, 3, 6, 5, 7.
It never converged by count, which retired the stop rule on 2026-09-30; sweep 11's five are two blocking and three
backlog, and none changes a grade or a legal statement. Sweep 12's seven are
all blocking; four were found only on the ten new sites, and three (M5, M6,
M4's count split) are report sentences that no earlier sweep compared with
each other. Sweeps that read sites no earlier sweep had seen find the
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
| atlantichotel analyses `/`, `/index.html` and `/index.php` as three pages with one raw document and title (the first run of the population alerts, 2026-09-30). Plan 075 keeps `/index.html` aliases on purpose because they can be real pages; here they are the homepage three times. | 2026-09-30 | 1 | Settle it in atlantichotel's finalizer run: if the aliases repeat the homepage's findings, set aside an alias that serves the homepage's raw document, as M3 does for query copies |
| yonahotel's rescan (`fac1633b`) still analyses 5 menu-state copies (`?menu-booking=spa`, `?menu=open`): no canonical, and the raw text signature differs from the page's only because Next.js streams the `<title>` into another place in the body (same 1,719 characters, other order; live probe 2026-09-30). They carry findings their page does not (an open booking menu: `button-name` critical once, `target-size` and `link-name` serious). | 2026-09-30 | 1 | Settle it in yonahotel's finalizer run: an order-insensitive raw text signature at scan time would let M3's rule set them aside (needs a rescan) |
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

## Minor items

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
| yonahotel's quote-wrapped `https:` and `mailto:` links land on the site's catch-all page; 3 are analysed as content | sweep 10 | became part of M7 (11 shells) |
| The evidence-quality verdict is `failed` on all 28 audits (`environment-unapproved` everywhere), so the dashboard verdict does not tell audits apart | sweep 10 | open, outside the data |
| haaitza's live preview states « Critique 6 », one of them the false `noindex-on-public-page` (K5) | sweep 10 | kept by the standing decision on sent previews |
| clos-sainte-marie is one document served under six URLs (sitemap route aliases), so its counts are one document six times; no rule reports duplicate content | sweep 11 | open, no slice |
| grand-hotel-opera's Tarteaucitron button contrast appears on one page in one run and not in the next (consent banner state); its jQuery UI tab labels (1.74:1) are a violation in one run and `bgOverlap` in the next, because the site animates the tab's opacity (live 0.62) | sweep 11 | open, widened in sweep 12 |
| grand-hotel-opera's preview (emailed 2026-09-28) was built on the pre-rescan audit: « Sérieux 12 » against 10 now | sweep 11 | kept by the standing decision on sent previews |
| domaine-d-auriac and yonahotel job rows still show the pre-K3 « Report issue »; no report was regenerated after the refresh | sweep 11 | open, operator action |
| chateaudecodignat's resumed run reused Lighthouse data for `/chambres-deluxe` after the replan stopped selecting it: « agrégées sur 61 pages » beside « 60 mesurées », and that page is the worst page for TBT and FCP | sweep 12 | open |
| `llms-txt-missing` is emitted on coin-savoyard although its check recorded a 403; the site answers 403 to every unknown path, so the absence is true | sweep 12 | open |
| A job keeps `failedPhase: report-fr` and its error after the operator acknowledged the blocked pages and the report was produced | sweep 12 | open |
| `measure-audit-data-quality.mjs` counts Cloudflare's `challenge-platform` script as a challenge marker (chateaudecodignat) | sweep 12 | open, tooling |
| The legal-notice extractor returns null name and address on leprieuredeboulogne, though both are on the page; the report sentence (identifiers only) is accurate | sweep 12 | open |
| closdesarts serves its menu PDFs from extensionless URLs (« Download is starting »); 8 are recorded as `error` | sweep 12 | open |
| The critical lab CLS finding bundles a page at 0.102 (bellesrives `/br/seminarios`) | sweep 12 | open |
| labaignoirelacanau's wave-only pages include Wix member profiles and shop products | sweep 12 | open |
| chateaudecodignat's homepage inlines 14.6 MB of SVG (the largest drawings twice); the report says so only through the minor, generic `total-byte-weight`, while its lab FCP median is 15.6 s. Product gap for the operator: name the dominant payload in the performance priority | sweep 12 | open, operator question |
| The prepare-prospects skill missed that atrium-hotel is a Best Western: the chain is in the site title, not the directory name | sweep 12 | open, tooling |
| Titles of 61 to 65 characters flagged as « much longer than 60 » | sweep 4 | fixed by F13 |
| villasfoch EN and ES pages carry French titles | sweep 5 | became F12, shipped |
| chicago lab CLS doubt | sweep 4 | explained in sweep 5 as bimodal runs, covered by F9 |

Outside the hunt: outreach threads left in `e1-drafted` after their drafts
were deleted (outreach state, not audit data).


## Finalizer runs

One row per `audit-finalizer` run (`.agents/skills/audit-finalizer/SKILL.md`),
and one per audit for a batch quick check. Backlog and HOLD rows are the
input of the next batch fix.

| Date | Audit | Target | Status | Defects (blocking / backlog) | Fixes | Rescan |
|---|---|---|---|---|---|---|
| 2026-09-30 | grandhoteldesalpes 390e56b9 | preview (full run, stopped by the operator) | SEND under the quick-check rule (the old preview stands) | Blocking: none under Q6. Backlog: card order led by a moderate heading priority because the ranking summed severity over findings (ranking); the homepage's Lighthouse run landed on /en/ because Chromium on Linux ignores --lang, so 20 pages counted as speed-measured against 19 valid runs (acquisition); the measure's replay dropped the sitemap redirect input (tooling); the sitemap redirect count includes 39 client-side language moves (acquisition, #573) | 3c21c60d, 1b2b986a, 1690f38e, deployed as build 1690f38e | Launched 995685a4, cancelled by the operator |
| 2026-09-30 | Hôtel A Flatta f05b08ad | preview quick check | SEND | Blocking: -. Backlog: gift-voucher pages titled "Page introuvable" (site's own); registry sentence understated (schema) | - | - |
| 2026-09-30 | Hôtel Le Prieuré de Boulogne 0309ce97 | preview quick check | SEND | Blocking: -. Backlog: card 2 moderate ahead of a critical card (pre-fix ranking); registry sentence understated although 20-49 employees on file (schema) | - | - |
| 2026-09-30 | Atrium Hôtel 28f7e2c0 | preview quick check | HOLD (1) | Blocking: card 2 crawlable-anchors rests only on the footer cookie-panel opener (<a> with no href, 38/38): no page behind it, SEO claim false. Backlog: registry sentence understated (schema); keyboard walks 0/38 evaluated | - | - |
| 2026-09-30 | Hôtel Le Clos des Arts b5882b49 | preview quick check | SEND | Blocking: -. Backlog: registry sentence understated (schema); crawlable-anchors also counts the menu toggle control | - | - |
| 2026-09-30 | Château de Codignat 6edfec5c | preview quick check | HOLD (3) | Blocking: out_of_scope (SME exemption) yet the block shows the regime and says no registry data was found. Backlog: registry snapshot dropped by the analysis schema | - | - |
| 2026-09-30 | L'Hôtel Particulier 332b720b | preview quick check | HOLD (3) | Blocking: out_of_scope (1-2 employees, 815k turnover) yet the block shows the regime and says no registry data was found. Backlog: card 1 is a moderate priority ahead of serious ones (pre-fix ranking) | - | - |
| 2026-09-30 | Hôtel Belles Rives 9ec96630 | preview quick check | SEND | Blocking: -. Backlog: registry sentence understated although 50-99 employees on file (schema) | - | - |
| 2026-09-30 | Hôtel Le Coin Savoyard 864786c2 | preview quick check | SEND | Blocking: -. Backlog: legal-notice identifier claim read the homepage because /fr/mentions-legales redirected (serious, unverified); /fr/chambres, /fr/chambres.fr and ?id= copies analysed as 3 pages; card 2 moderate ahead of serious (pre-fix ranking) | - | - |
| 2026-09-30 | Hôtel Le Placide 2d17eb74 | preview quick check | HOLD (1) | Blocking: card 1 crawlable-anchors: every sampled element is a UI control (Axeptio cookie opener, booking opener, filter buttons, off-canvas toggles), no page behind any. Backlog: registry sentence understated (schema) | - | - |
| 2026-09-30 | Clarance Hôtel 6c52ca1f | preview quick check | HOLD (1) | Blocking: card 1 crawlable-anchors: tile overlays, panel toggles, consent buttons and "nolink" menu parents, no page behind any. Backlog: card 3 moderate; registry sentence understated (schema) | - | - |
| 2026-09-30 | Hôtel Le Cheval Blanc 26db9bc0 | preview quick check | SEND | Blocking: -. Backlog: card 1 moderate ahead of serious and critical (pre-fix ranking); registry sentence understated (schema) | - | - |
| 2026-09-30 | Hôtel La Baignoire f2db07c4 | preview quick check | HOLD (1) | Blocking: card 3 reflow says "sur un écran étroit", but this Wix site serves phones a mobile view (audit limitation mobile-ua-negotiated-variant-untested); the overflow is the desktop layout under zoom. Backlog: registry sentence understated (schema) | - | - |
| 2026-09-30 | Hôtel Clos Sainte Marie d2038dbf | preview quick check | HOLD (3) | Blocking: out_of_scope (1-2 employees, 258k turnover) yet the block shows the regime and says no registry data was found. Backlog: legal-notice identifier absence alert not verified | - | - |
| 2026-09-30 | Hôtel Origines c6b7330a | preview quick check | SEND | Blocking: -. Backlog: card 1 contrast sample is the cookie banner's accept button (real, first-party banner); registry sentence understated (schema) | - | - |
| 2026-09-30 | Hôtel Le Domaine d'Auriac d6b78fcc | preview quick check | SEND | Blocking: -. Backlog: 148 inventoried URLs are real 404s (email written as a relative link on every page); keyboard walks 0/151 evaluated; cards 2 and 3 moderate (pre-fix ranking); registry sentence understated (schema) | - | - |
| 2026-09-30 | Hôtel Capucines 4b8beedf | preview quick check | HOLD (1) | Blocking: card 1 form-error-not-associated: the newsletter field is native required (no novalidate), so the browser's own validation message is announced; the "not announced" claim does not hold. Backlog: registry sentence understated (schema) | - | - |
| 2026-09-30 | Hôtel d'Europe f741feb5 | preview quick check | SEND | Blocking: -. Backlog: card 1 FCP rests on simulated-mobile lab runs (3.6-5.9 s, no field data), consistent with PageSpeed; registry sentence understated (schema) | - | - |
| 2026-09-30 | Hôtel Le Mareuil 396b4405 | preview quick check | SEND | Blocking: -. Backlog: registry sentence understated (schema) | - | - |
| 2026-09-30 | Hôtel Macchi 939e3eea | preview quick check | SEND | Blocking: -. Backlog: operator SIREN resolves to a closed establishment (obligation undetermined); keyboard walks 0/42 evaluated; card 2 moderate (pre-fix ranking) | - | - |
| 2026-09-30 | Hôtel Régina 1d377ee1 | preview quick check | SEND | Blocking: -. Backlog: book.html in 7 languages and a published test page (page-test-namastay, 4 languages) analysed as separate pages; registry sentence understated (schema) | - | - |
| 2026-09-30 | Hôtel le 37 Bis 44c2c823 | preview quick check | HOLD (1) | Blocking: card 1 crawlable-anchors: consent buttons, "nolink" menu parents and panel toggles (javascript:void(0)), no page behind them. Backlog: /fr/book, /fr/book.html, /en/book.html copies analysed separately; registry sentence understated (schema) | - | - |
| 2026-10-01 | Auberge du Bon Laboureur 2df53312 | preview quick check | SEND | Blocking: -. Backlog: 3 language copies each of 3 pages (zh, de) analysed (5%) | - | - |
| 2026-10-01 | Domaine Ribiera 184f204d | preview quick check | SEND | Blocking: - (earlier HOLD (3): block shown to an out-of-scope business; fixed by the omission, b5135f68). Backlog: legal-notice absence alert, not on a card | - | - |
| 2026-10-01 | Hôtel Le Castel d'Alti c00a0e1b | preview quick check | SEND | Blocking: -. Backlog: 13 of 114 analysed pages are booking-engine offer pages with query strings; 45 soft-error pages | - | - |
| 2026-10-01 | Maison Lameloise f18335d7 | preview quick check | SEND | Blocking: -. Backlog: card 1 contrast sample is the tarteaucitron banner (first-party configuration) | - | - |
| 2026-10-01 | Hôtel Le Christina c472e0ee | preview quick check | SEND | Blocking: -. Backlog: 3-5 employees with unknown turnover resolves in_scope (no exemption without turnover evidence); block stays neutral; keyboard walks 0/33 evaluated; 14 RoomTypeCode query pages analysed | - | - |
| 2026-10-01 | Villa Motel 944c09fd | preview quick check | SEND | Blocking: -. Backlog: registry name LES MARMOTTES differs from the brand; confirmed active hotel company in Stenay | - | - |
| 2026-10-01 | Hôtel Le Relais du Louvre 2ab871dc | preview quick check | SEND | Blocking: -. Backlog: keyboard walks 1/315 evaluated | - | - |
| 2026-10-01 | Hôtel Napoléon 992d2729 | preview quick check | SEND | Blocking: -. Backlog: FECIT confirmed on the legal notice | - | - |
| 2026-10-01 | Hôtel Le Kaila 28e942e3 | preview quick check | SEND | Blocking: -. Backlog: 8 language copies of 2 pages analysed (5%) | - | - |
| 2026-10-01 | Hôtel Le Mouillage e2d7416c | preview quick check | SEND | Blocking: - (earlier HOLD (3): block shown to an out-of-scope business; fixed by the omission). Backlog: - | - | - |
| 2026-10-01 | Hôtel A Flatta f05b08ad | preview quick check | SEND | Blocking: -. Backlog: 0 employees with unknown turnover resolves likely_in_scope; block neutral | - | - |
| 2026-10-01 | Hôtel Le Prieuré de Boulogne 0309ce97 | preview quick check | SEND | Blocking: -. Backlog: legal-notice absence alert, not on a card | - | - |
| 2026-10-01 | Atrium Hôtel 28f7e2c0 | preview quick check | SEND | Blocking: - (earlier HOLD (1) crawlable-anchors on the cookie-panel opener; fixed by the script-control exclusion). Backlog: keyboard walks 0/38 evaluated | - | - |
| 2026-10-01 | Hôtel Le Clos des Arts b5882b49 | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-01 | Château de Codignat 6edfec5c | preview quick check | SEND | Blocking: - (earlier HOLD (3); fixed by the omission). Backlog: quick check expected content-completed only; the preview counts completed plus partial (checker fixed) | - | - |
| 2026-10-01 | L'Hôtel Particulier 332b720b | preview quick check | SEND | Blocking: - (earlier HOLD (3); fixed by the omission). Backlog: card 1 shows the theme's dominant moderate placeholder rule while the theme also holds a critical unnamed select on 86 pages | - | - |
| 2026-10-01 | Hôtel Belles Rives 9ec96630 | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-01 | Hôtel Le Coin Savoyard 864786c2 | preview quick check | SEND | Blocking: -. Backlog: 2 copy pages of 24 (chambres.fr, ?id=); legal-notice absence alert, not on a card | - | - |
| 2026-10-01 | Hôtel Le Placide 2d17eb74 | preview quick check | SEND | Blocking: - (earlier HOLD (1) crawlable-anchors; fixed by the script-control exclusion). Backlog: - | - | - |
| 2026-10-01 | Clarance Hôtel 6c52ca1f | preview quick check | SEND | Blocking: - (earlier HOLD (1) crawlable-anchors; fixed by the script-control exclusion). Backlog: card 3 contrast sample is the consent banner's buttons | - | - |
| 2026-10-01 | Hôtel La Baignoire f2db07c4 | preview quick check | SEND | Blocking: - (earlier HOLD (1) reflow wording; fixed by the zoom wording). Backlog: 1-2 employees with unknown turnover resolves in_scope; block neutral | - | - |
| 2026-10-01 | Hôtel Clos Sainte Marie d2038dbf | preview quick check | SEND | Blocking: - (earlier HOLD (3); fixed by the omission). Backlog: card 2 hreflang: ?lang=en renders French, verified live | - | - |
| 2026-10-01 | Hôtel Capucines 9e4e1744 | preview quick check | SEND | Blocking: - (rescan of 4b8beedf; earlier HOLD (1) form-error on a natively validated field; fixed by recording native validity). Backlog: - | - | - |
| 2026-10-01 | Hôtel le 37 Bis 44c2c823 | preview quick check | SEND | Blocking: - (earlier HOLD (1) crawlable-anchors; fixed by the script-control exclusion). Backlog: 3 copies of the booking page analysed (4%) | - | - |
| 2026-10-03 | Hôtel La Signoria f0364380 | preview quick check | SEND | Blocking: -. Backlog: contrast samples partly on the consent widget; 4 tracking-query pages of 359 | - | - |
| 2026-10-03 | Hôtel Côté Sud Léman 71cf1cb9 | preview quick check | SEND | Blocking: -. Backlog: legal-notice absence alert, not on a card | - | - |
| 2026-10-03 | Hôtel Club Port la Galère 171b1e63 | preview quick check | SEND | Blocking: -. Backlog: out of scope, block omitted | - | - |
| 2026-10-03 | Domaine du Colombier 35a19d8c | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-03 | Big Sky Hôtel & Spa 2a4c2324 | preview quick check | SEND | Blocking: -. Backlog: card 1 ARIA list is the Mapbox attribution control; 2 copy pages of 102 | - | - |
| 2026-10-03 | Le Petit Beaumarchais 3371de59 | preview quick check | SEND | Blocking: - (earlier HOLD (1): crawlable-anchors on the CMS's hidden admin loader and read-more expanders; fixed by the hidden-anchor exemption). Backlog: canonical card verified live (x-default page canonicalises to /en/, /en to the root) | - | - |
| 2026-10-03 | Hôtel Le Yaca 52cf3ec2 | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-03 | Hôtel Le Burgundy 96bd58b2 | preview quick check | SEND | Blocking: - (earlier HOLD (1): same hidden CMS anchors; fixed). Backlog: 45 inventoried URLs answer HTTP errors | - | - |
| 2026-10-03 | Hôtel Le Pré Fillet f57766ba | preview quick check | SEND | Blocking: -. Backlog: 14 RoomTypeCode pages are distinct room pages (verified live) | - | - |
| 2026-10-03 | Hôtel Le Maquis eda8acde | preview quick check | SEND | Blocking: -. Backlog: registry unreachable at scan time; the regeneration looked it up again (20 to 49 employees) | - | - |
| 2026-10-03 | Hôtel L'Abbaye 21f28d20 | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-03 | Hôtel Henri IV 6527421e | preview quick check | SEND | Blocking: -. Backlog: out of scope, block omitted; 27 ?langue=en pages are the English version | - | - |
| 2026-10-03 | Hôtel Atlas db556905 | preview quick check | SEND | Blocking: - (earlier HOLD (5): block printed "un effectif de Effectif non renseigné"; fixed in the facts block). Backlog: phone mismatch verified live; 4 language copy pages of 32 | - | - |
| 2026-10-03 | Hôtel Capucines 9e4e1744 | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-03 | Auberge du Bon Laboureur 2df53312 | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-03 | Domaine Ribiera 184f204d | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-03 | Hôtel Le Castel d'Alti c00a0e1b | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-03 | Maison Lameloise f18335d7 | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-03 | Hôtel Le Christina c472e0ee | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-03 | Villa Motel 944c09fd | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-03 | Hôtel Le Relais du Louvre 2ab871dc | preview quick check | SEND | Blocking: -. Backlog: card 3 label critical over a moderate placeholder example (theme's worst finding) | - | - |
| 2026-10-03 | Hôtel Napoléon 992d2729 | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-03 | Hôtel Le Prieuré de Boulogne 0309ce97 | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-03 | Le Card Hôtel a6e7554e | preview quick check | SEND | Blocking: - (earlier scan stopped at one page: lecardhotel.fr 301 to lecardhotel.com; website corrected, rescanned). Backlog: 19 inventoried URLs answer HTTP errors | - | - |
| 2026-10-03 | Hôtel de la Couronne 81f22dfd | preview quick check | SEND | Blocking: - (earlier scans analysed one blank page: /fr answers an empty 200 while the site serves /fr/; crawler fixed, rescanned). Backlog: 1-2 employees, turnover unknown, block neutral | - | - |
| 2026-10-06 | L'Embarcadère e86bb299 | preview quick check | SEND | Blocking: -. Backlog: 11 inventoried URLs answer HTTP errors | - | - |
| 2026-10-06 | Hôtel Le Vert Bois a5f9e4dd | preview quick check | SEND | Blocking: -. Backlog: 16 inventoried URLs answer HTTP errors | - | - |
| 2026-10-06 | Hôtel Les Rives Sauvages 18b09d4c | preview quick check | SEND | Blocking: - (registry API unreachable at scan time; a fresh writing run looked it up again). Backlog: - | - | - |
| 2026-10-06 | Hôtel Le Valois 0ed7c58d | preview quick check | SEND | Blocking: -. Backlog: out of scope, block omitted; 34 inventoried URLs answer HTTP errors | - | - |
| 2026-10-06 | Hôtel Le 16 | 150 fdb88451 | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-06 | Hôtel L'Ormaie 3a43ecc5 | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-06 | Hôtel America 3cf49c94 | preview quick check | SEND | Blocking: -. Backlog: one-page site plus /legal, so 2 analysed pages is the real population; the legal-notice absence finding (report only, not on a card) is false since /legal exists | - | - |
| 2026-10-06 | Maison Souquet e576d494 | preview quick check | SEND | Blocking: -. Backlog: 18 query-variant pages set aside | - | - |
| 2026-10-06 | Hôtel de Montaulbain a47d0027 | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-06 | Hôtel Les Hirondelles e3e94bf9 | preview quick check | SEND | Blocking: -. Backlog: 123 query-variant pages set aside; keyboard walks 1/126 evaluated | - | - |
| 2026-10-06 | Royal Hainaut Spa & Resort Hôtel 84928b03 | preview quick check | SEND | Blocking: - (report blocked by 4 blocked pages, all malformed relative links the server refuses with 403; accepted as a disclosed limit). Backlog: - | - | - |
| 2026-10-06 | Maison Doucet d73235bb | preview quick check | SEND | Blocking: - (report blocked by 11 pages the site blocked during the scan and serves normally now; accepted as a disclosed limit). Backlog: a rescan could recover the 11 gallery, video and table-booking pages | - | - |
| 2026-10-06 | La Bastide Bourrelly 333151cb | preview quick check | SEND | Blocking: - (report blocked by the 2 recruitment pages; accepted as a disclosed limit). Backlog: - | - | - |
| 2026-10-06 | Hôtel de Toiras f0f2dcd5 | preview quick check | SEND | Blocking: - (report blocked by 36 pages that answer 403 to every visitor; accepted as a disclosed limit). Backlog: 45 pages ended in error | - | - |
| 2026-10-09 | Hôtel Habituel 38a3755c | preview quick check | SEND | Blocking: -. Backlog: out of scope, block omitted | - | - |
| 2026-10-09 | Hôtel L'Orée du Bois 255f8dd7 | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-09 | Hôtel La Mare aux Oiseaux 1a14b182 | preview quick check | SEND | Blocking: -. Backlog: two of three cards are performance | - | - |
| 2026-10-09 | Hôtel Legend 3a0596b5 | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-09 | Hôtel Les Peupliers 909c78f0 | preview quick check | SEND | Blocking: - (preview printed one finding fewer than its audit: the site-wide robots.txt finding sat on the redirecting start URL; site-level findings now anchor on the resolved homepage, regenerated). Backlog: - | - | - |
| 2026-10-09 | Motel L'Enclos 82d5d857 | preview quick check | SEND | Blocking: -. Backlog: - | - | - |
| 2026-10-09 | Sporting House Hôtel d60020b2 | preview quick check | SEND | Blocking: -. Backlog: out of scope, block omitted | - | - |
| 2026-10-09 | Petit Hôtel Confidentiel 412a5e66 | preview quick check | SEND | Blocking: - (report blocked by 4 pages that answer normally now; accepted as a disclosed limit). Backlog: out of scope, block omitted | - | - |
| 2026-10-09 | Hôtel Jardins Secrets 2cd26f47 | preview quick check | SEND | Blocking: - (report blocked by 2 pages that answer normally now; accepted as a disclosed limit). Backlog: 40 of 77 analysed pages are PDF viewer pages for press articles, real site pages with the same template defects | - | - |
| 2026-10-09 | Château de Valmer 7a7580f8 | preview quick check | SEND | Blocking: - (report blocked by 2 slow pages that answer normally now; accepted as a disclosed limit). Backlog: 21 pages ended in error | - | - |
| 2026-10-09 | Maison Doucet d73235bb | preview quick check | SEND | Blocking: -. Rechecked after regeneration. Backlog: a rescan could recover the 11 blocked pages | - | - |
| 2026-10-09 | La Bastide Bourrelly 333151cb | preview quick check | SEND | Blocking: -. Rechecked after regeneration. Backlog: - | - | - |
| 2026-10-09 | L'Embarcadère e86bb299 | preview quick check | SEND | Blocking: -. Rechecked after regeneration. Backlog: 11 inventoried URLs answer HTTP errors | - | - |
| 2026-10-09 | Hôtel de Toiras f0f2dcd5 | preview quick check | SEND | Blocking: -. Rechecked after regeneration. Backlog: 45 pages ended in error | - | - |
| 2026-10-09 | Hôtel Le Vert Bois a5f9e4dd | preview quick check | SEND | Blocking: -. Rechecked after regeneration; the earlier published preview predates it and is republished at drafting. Backlog: 16 inventoried URLs answer HTTP errors | - | - |
| 2026-10-09 | Hôtel Les Rives Sauvages 18b09d4c | preview quick check | SEND | Blocking: -. Rechecked after regeneration. Backlog: - | - | - |
| 2026-10-10 | Oz'Inn Hôtel & Spa 13244856 | preview quick check | SEND | Blocking: -. Backlog: 95 of 140 analysed pages are ?lang= translations (kept as hreflang alternates); keyboard walks 3/140 evaluated | - | - |
| 2026-10-10 | Hôtel Bowmann 0efa15b3 | preview quick check | SEND | Blocking: -. Backlog: about 350 of 752 analysed pages are empty untranslated article and collection shells in it/es/de/pt (200, self-canonical, listed as hreflang alternates), so the counts are true but no finding names the empty translations | - | - |
| 2026-10-10 | Hôtel Mylos 98183093 | preview quick check | SEND | Blocking: -. Backlog: in scope from a 3 to 5 employee band with no turnover (documented conservative rule; client text stays at criteria to verify) | - | - |
| 2026-10-10 | Hôtel Don César 4d3d7f89 | preview quick check | SEND | Blocking: -. Backlog: two of three cards are performance | - | - |
| 2026-10-10 | Hôtel Lutetia 379d2b09 | preview quick check | SEND | Blocking: - (report blocked by 2 room pages that answer normally now; accepted as a disclosed limit). Backlog: weak lead card (zoom disabled) | - | - |
| 2026-10-10 | Hôtel Le Belvédère 589c149f | preview quick check | SEND | Blocking: - (report blocked by 2 pages that answer normally now; accepted as a disclosed limit). Backlog: - | - | - |
| 2026-10-10 | Hôtel Argi Eder 467d4b84 | preview quick check | SEND | Blocking: - (earlier scan stopped at the homepage: argi-eder.com 301 to argi-eder.fr; website corrected, rescanned). Backlog: - | - | - |
| 2026-10-10 | Château de Valmer 7a7580f8 | preview quick check | SEND | Blocking: -. Rechecked, unchanged since 9 October. Backlog: as recorded 9 October | - | - |
| 2026-10-10 | Hôtel Habituel 38a3755c | preview quick check | SEND | Blocking: -. Rechecked, unchanged since 9 October. Backlog: as recorded 9 October | - | - |
| 2026-10-10 | Hôtel Jardins Secrets 2cd26f47 | preview quick check | SEND | Blocking: -. Rechecked, unchanged since 9 October. Backlog: as recorded 9 October | - | - |
| 2026-10-10 | Hôtel L'Orée du Bois 255f8dd7 | preview quick check | SEND | Blocking: -. Rechecked, unchanged since 9 October. Backlog: as recorded 9 October | - | - |
| 2026-10-10 | Petit Hôtel Confidentiel 412a5e66 | preview quick check | SEND | Blocking: -. Rechecked, unchanged since 9 October. Backlog: as recorded 9 October | - | - |
| 2026-10-10 | Hôtel La Mare aux Oiseaux 1a14b182 | preview quick check | SEND | Blocking: -. Rechecked, unchanged since 9 October. Backlog: as recorded 9 October | - | - |
| 2026-10-10 | Hôtel Legend 3a0596b5 | preview quick check | SEND | Blocking: -. Rechecked, unchanged since 9 October. Backlog: as recorded 9 October | - | - |
| 2026-10-10 | Hôtel Les Peupliers 909c78f0 | preview quick check | SEND | Blocking: -. Rechecked, unchanged since 9 October. Backlog: as recorded 9 October | - | - |
| 2026-10-10 | Motel L'Enclos 82d5d857 | preview quick check | SEND | Blocking: -. Rechecked, unchanged since 9 October. Backlog: as recorded 9 October | - | - |
| 2026-10-10 | Plessis Grand Hôtel ccc48b79 | preview quick check | SEND | Blocking: - (earlier scan stopped at the homepage: grandhotel-plessis92.com 301 to plessisgrandhotel.com; website corrected, rescanned). Backlog: the site rate-limited the crawl (429), so the scan took about 3 hours | - | - |
| 2026-10-14 | Keystone Hôtel d76b8979 | preview --fix | SEND | Blocking: card 3 keyboard-trap false (Complianz banner shown after load took the walk; Tab passes every flagged link live, nine critical findings); then card 3 crawlable-anchors on a spa booking opener and booking-widget tabs (controls). Backlog: /en/404-2 analysed as a page; two performance cards | fourth batch fix (d9f8df49, 29ea634f, 6089b050) | - |
| 2026-10-14 | Hôtel 64 752b206d | preview --fix | SEND | Blocking: card 3 crawlable-anchors rested only on Klaro's preferences link (seen before: consent opener). Backlog: - | fourth batch fix (d9f8df49, 29ea634f, 6089b050) | - |
| 2026-10-14 | Hôtel Les Roches Blanches 766f979e -> 15c18cf2 | preview --fix | SEND | Blocking: card 2 reflow measured an Instagram feed 150 ms after resizing (fits at 320 live; body clips overflow). Backlog: - | fourth batch fix (d9f8df49, 29ea634f, 6089b050) | 1 |
| 2026-10-14 | Hôtel Acostel bb279d6b -> 0e1f8261 | preview --fix | SEND | Blocking: -. Backlog fixed: no-SIRET claim false, legal notice /mentions.php not recognised | fourth batch fix (d9f8df49, 29ea634f, 6089b050) | 1 |
| 2026-10-14 | Auberge de Cassagne 2cbac7d7 -> e90b3623 | preview --fix | SEND | Blocking: report blocked, start URL /fr/ fetched as /fr (404; /fr/ 301 to /). Backlog: robots.txt Crawl-delay: 10 outside any group is ignored by the parser (rescan run at 10 s by hand) | fourth batch fix (d9f8df49, 29ea634f, 6089b050) | 1 |
| 2026-10-14 | La Caserne Chanzy 6070b6dd -> e224f043 | preview --fix | SEND | Blocking: report blocked by a link writing the site's address as a path (403, the site's answer to any unknown path); then card 3 reflow false (body hides overflow); no-identifier claim false (RCS/VAT on /fr/conditions-d-utilisation.html). Backlog: - | fourth batch fix (d9f8df49, 29ea634f, 6089b050) | 1 |
| 2026-10-14 | Hôtel Villa Navarre bc20a3b9 -> 7749ccaf | preview --fix | SEND | Blocking: report blocked by 2 pages answering 503 (pushback). Backlog: - | - | 1 (5 s) |
| 2026-10-14 | Hôtel Villa Louise c1b6e5f7 -> 9c2f3a08 | preview --fix | BLOCKED-NEW-SCAN-REQUIRED | Blocking: first scan rate-limited (429) from the first request; rescan at 5 s: homepage answered 502 (answers 200 now). Backlog: - | - | 1 (5 s) |
| 2026-10-14 | Hôtel Saint Gothard (no audit) | preview --fix | BLOCKED-NEW-SCAN-REQUIRED | Blocking: 51 of 51 URLs answered 403 from the server, twice (second run at 5 s); one request answers 200. Allowlist or skip | - | 1 (5 s) |
| 2026-10-14 | Hôtel Padoue 1c073d93 | preview --fix | rescan running | Blocking: report blocked by 4 pages answering 503 (answer 200 now) | - | 1 (5 s) |
| 2026-10-14 | Hôtel Jehan de Beauce 772da536 | preview quick check | SEND | Blocking: -. Backlog: keyboard pause on a Wix menu entry was reported as a trap (fixed, 29ea634f); reflow card true (980 px Wix desktop layout at 320) | fourth batch fix (d9f8df49, 29ea634f, 6089b050) | - |
| 2026-10-14 | Abbaye de la Bussière 839db9f2 | preview quick check | SEND | Blocking: -. Backlog: crawlable-anchors card on a booking-nav entry with no href (true, page exists elsewhere) | - | - |
| 2026-10-14 | Hôtel Les Chalets fc8f083b | preview quick check | SEND | Blocking: -. Backlog: no-identifier (LCEN) absence claim not verified | - | - |
| 2026-10-14 | Plessis Grand Hôtel ccc48b79 | preview quick check | SEND | Blocking: -. Rechecked after regeneration; the live preview predates it and is reissued at drafting | - | - |
| 2026-10-14 | Manoir de Montesquiou 2c3bddc2 | preview quick check | SEND | Blocking: -. Backlog: theme placeholder posts (lorem ipsum) analysed as pages | - | - |
| 2026-10-14 | Alba Opéra 75445f72, Moulin des Oliviers 739a620c, Adray Télébar 560e7107, Argi Eder 467d4b84, Bowmann 0efa15b3, Don César 4d3d7f89, La Réserve 861e55ed, La Villa K 9c76a226, Le Belvédère 589c149f, Le Bout du Monde 2cfd2778, Villa Kerasy 0ceefbb9, Hôtel de la Marine 60bdd5eb, Hôtel de la Poste f09feb35 (one-page Carrd site), Maison Maubreuil 9f6ac6f9, Oz'Inn 13244856, Mylos 98183093, Lutetia 379d2b09, Le Nautica 4a275782, Ritter'Hoft b87641db, San Carlu 085fd2cd, Villa C e63a869d | preview quick check | SEND | Blocking: -. Rechecked after the regeneration that followed the fingerprint change | - | - |
| 2026-10-24 | Hôtel Oldegar 702d5cc2 | preview --fix | HOLD (1), rescan pending deploy | Blocking: card 2 reflow names a transparent off-canvas menu fixed to the viewport (510 px) as the cause; a fixed box never widens the page; /bar fits at 320 live, /actualites overflows by 5 px. Backlog: - | fifth batch fix (reflow attribution) | - |
| 2026-10-24 | Château de Vault de Lugny 20dc9f62 | preview --fix | HOLD (2), rescan pending deploy | Blocking: 9 of 66 analysed pages are UiCore templates, UiCore dashboard objects and a MetForm form from the Yoast sitemap (http spelling redirected, so the plugin-object rule never applied); card 3 sample on a dashboard object. Backlog: no-identifier claim false, the legal notice is a linked PDF printing RCS, SIRET and VAT (not fixed) | fifth batch fix (plugin objects behind a sitemap redirect) | - |
| 2026-10-24 | Le Petit Hôtel ea82fc35 | preview --fix | SEND under Q6, rescan pending deploy | Blocking: -. Backlog: no-identifier claim false, SIRET on /fr/m-legales beside an empty /mentions-legales (8-page site, so the serious total is one too high) | fifth batch fix (m-legales candidate) | - |
| 2026-10-24 | Hôtel Le Blizzard 64dfd1c6 | preview --fix | HOLD (1), refresh pending deploy | Blocking: card 3 crawlable-anchors rests only on Axeptio consent openers (footer menu item without href, privacy-policy text links), seen before; fixed in 869ae6e0, never deployed (VPS on 6089b050). Backlog: - | 869ae6e0 (deploy pending) | - |
| 2026-10-24 | Château de Montcaud 4c7ab5dd | preview --fix | SEND | Blocking: -. Backlog: 112 of 454 analysed pages are ?category= filter views and their pagination (real, server-rendered, indexable) | - | - |
| 2026-10-24 | Hôtel Les Hayes en Sologne b8870ea0 | preview --fix | SEND | Blocking: -. Backlog: a WordPress author archive analysed as a page (card 3 samples) | - | - |
| 2026-10-24 | Hôtel Les Autanes 7346e1ab, Hôtel Madeloc 34252155, Hôtel Misíncu 37dc2979, Hôtel de Montesquieu 637adef4, Château de la Rozelle 935465e3 | preview --fix | SEND | Blocking: -. Backlog: keyboard walk inconclusive on almost every page (Autanes 45 of 46, Misíncu 145 of 145); Montesquieu card 3 is a moderate X-Frame-Options header | - | - |
| 2026-10-24 | Hôtel Altapura ee5c942a, Hôtel Au Lion d'Or a4a38848, Hôtel Bayard Bellecour 5c88173b, Hôtel Ivan Vautier fc185845, Hôtel C Suites 4ca941c2, Hôtel La Réserve 50964c0e, Hôtel Padoue b3e21f29, La Caserne Chanzy e224f043, Auberge de Cassagne e90b3623, Hôtel Les Roches Blanches 15c18cf2 | preview --fix | SEND | Blocking: -. Figures reconcile, cards hold. Backlog: Lion d'Or keyboard walk inconclusive on 42 of 42 pages | - | - |
| 2026-10-24 | Hôtel Le Blizzard 64dfd1c6 | preview --fix | SEND | Blocking: - after deploy 6867d0f0 and refresh (36 -> 34 findings, consent openers gone); new card 3 jsonld-missing confirmed live (no JSON-LD on the homepage). Backlog: - | 869ae6e0 deployed | - |
| 2026-10-24 | the other 17 audits of the earlier 24 October rows (Autanes to Roches Blanches) | preview --fix | SEND | Blocking: -. Rechecked after deploy 6867d0f0, refresh and regeneration; figures reconcile, findings unchanged | - | - |
| 2026-10-24 | Hôtel Oldegar 702d5cc2 -> 90fcab0c | preview --fix | SEND | Blocking: - after rescan on 6867d0f0; card 2 reflow now rests on real overflow (privacy policy 463 px wide at 320 live). Backlog: - | fifth batch fix | 1 |
| 2026-10-24 | Château de Vault de Lugny 20dc9f62 -> 9af8cef0 | preview --fix | SEND | Blocking: - after rescan; 57 pages analysed, the 9 theme and form objects recorded discovered-not-scanned. Backlog: no-identifier claim still false (legal notice only as a linked PDF), seen before | fifth batch fix | 1 |
| 2026-10-24 | Le Petit Hôtel ea82fc35 -> d20f109f | preview --fix | SEND | Blocking: -. No-identifier claim gone after rescan (SIRET read on /m-legales) | fifth batch fix | 1 |
| 2026-10-24 | Hôtel Madame Rêve (failed job deleted) -> 89b679c2 | preview --fix | SEND | Blocking: report blocked by an email address linked without mailto: (403 challenge on the resolved path), fixed; rescan clean. Backlog: card 2 contrast samples sit in the Axeptio consent banner | fifth batch fix (6867d0f0) | 1 |
| 2026-10-24 | Private Hôtel (no audit) | preview --fix | archived | Blocking: crawl rejected twice (403 bot challenges at default pacing, 33% of URLs failed at 5 s and concurrency 1) | - | 1 (5 s) |
| 2026-10-24 | Hôtel Saint Gothard, Hôtel Villa Louise (no audit) | cleanup | archived | Blocking: Saint Gothard 403 on every URL over four runs; Villa Louise rate-limited (429) and failed twice | - | - |
| 2026-10-25 | Hôtel Le Ballu 7ef8848e, Hôtel Hiro bc3c81dc, Grand Hôtel de Cala Rossa 5597e5d1, Château de Maubreuil 0d798ea7 | preview --fix | SEND | Blocking: -. Figures reconcile, cards hold. Backlog: - | - | - |
| 2026-10-25 | Auberge du Camp Romain f6d38041 | preview --fix | SEND | Blocking: -. Backlog: 4 room pages (?RoomTypeCode=) share one raw document, the booking widget fills them in script; all three cards are moderate SEO and structure findings | - | - |
| 2026-10-25 | Atlantic Hôtel 2081645d | preview --fix | HOLD (2), rescan pending deploy | Blocking: 4 of 34 analysed pages are not pages (two The7 slideshow objects, an orphan draft, an author archive); card 2 and card 3 samples on them | sixth batch fix (dt_slideshow plugin object) | - |
| 2026-10-25 | Hôtel La Chaize, Au Palmyre Hôtel (failed jobs deleted) | preview --fix | rescan running | Blocking: report blocked by 2 pages answering 503 each (origin pushback) | - | 1 (5 s) |
| 2026-10-25 | Belle Hôtel (failed job deleted) | preview --fix | rescan running | Blocking: crawl failed, the apex robots.txt redirects to a malformed host (www.<domain>robots.txt); rescanned from the www host, whose robots.txt answers 404 | - | 1 |
| 2026-10-25 | Au Palmyre Hôtel -> 929e3dae | preview --fix | SEND | Blocking: - after rescan at 5 s; card 3 jsonld-invalid confirmed live (third block has an extra closing brace); no-identifier claim true (SIREN only in the register). Backlog: keyboard walk inconclusive on 30 of 30 pages | - | 1 (5 s) |
| 2026-10-25 | Belle Hôtel (no audit) | preview --fix | archived | Blocking: rescan from the www host stopped after 13 pages, the server closed every later request without a response (IP block) | - | 1 |
| 2026-10-27 | Snow Lodge 1986e536, Maison Bréguet 3b5cccaa, Les Regalia 6d37c60a, Le 6VH 6923fa92, Royal Saint-Michel 5580c934, Montholon 90e20487, Monsieur Helder c0de786a, Villa Saint-Germain 7eaff9c2, La Suite Villa d8b41578, La Comtesse 365f268a, La Cachette 06f20a44, Aéroport Hôtel ec16419b, La Tomette edd8d963, Atlantic 6de6249e, La Chaize 0616e32d | preview quick check | SEND (15) | Blocking: -. Spot-checked live: no JSON-LD on Snow Lodge's homepage, Maison Bréguet's French homepage declares lang="en"; the Wix reflow cards (6VH, Montholon) describe zoom, true for the 980 px desktop layout. Atlantic rescan analyses 31 pages, no slideshow objects. Backlog: Royal Saint-Michel analyses 218 of 603 pages as Webflow pagination query pages | sixth batch fix | - |
| 2026-10-27 | Posidonia 9a73df63 | preview quick check | HOLD (1), rescan pending deploy | Blocking: no-identifier claim false, the site has no legal notice but prints its RCS and VAT numbers on the privacy policy, which the check never read | privacy policy read as the last legal-notice candidate (a3dd0dd9) | - |
| 2026-10-27 | Bastide Saint Georges, Flocons de Sel, Auberge de Nicey, Caron de Beaumarchais | preview --fix | rescan running | Blocking: earlier scans failed or were held; Caron rescanned from the domain the directory domain redirects to, the others at 5 s after pushback | - | 1 (5 s; Caron default) |
| 2026-10-29 | Splendid 2078c74b, Solly 5e4bd395, Victoria 90968625, Santateresa 9ee00733, Philéas Lazare d0051af9, Notre Dame de France b0783d14, Maison Proust a6161c42, Mistral 7709bbb8, Maison Nova 2416fd43, Les Feuillantines f4a1af3a, Le Kastelberg b4e5a8c2, Le Cep 844c59b4, L'Hélios a81d2bb2, Château Brachet ed335936, Auberge Ostapé 9304020d, Auberge de Nicey 4bcbc762, Posidonia 1acfe38d, Bastide Saint Georges aacbf05e, Caron de Beaumarchais b3049eec | preview --fix | SEND (19) | Blocking: -. Figures reconcile on all; in-scope blocks for 1 to 9 staff state the registry headcount only and send the reader to counsel. Spot-checked: Bastide's unlabelled field is a newsletter honeypot exposed to assistive technology (live); Kastelberg's no-identifier claim true (SIREN only in the register); Posidonia's rescan no longer claims a missing identifier. Backlog: Maison Nova analyses 10 of 126 pages that are external hostnames written as relative links (`www.ter-sncf.com/languedoc`) answered by a catch-all (acquisition); L'Hélios analyses share.html and three room template pages from one document (population); Caron analyses 3 WordPress category and author archives (population); keyboard walks mostly inconclusive on Brachet, Caron, Feuillantines (tooling) | - | - |
| 2026-10-29 | Le Grand Hôtel des Bains 23072128 | preview --fix | SEND | Blocking: card 3 crawlable-anchors rested only on the booking-engine opener `<a class="book" href="javascript:void(0);">`, no page behind it (seen before: Le Placide's booking opener) | seventh batch fix (58bed651), deployed, refreshed, one writing pass; card 3 now aria-prohibited-attr | - |
| 2026-10-29 | Hôtel Flocons de Sel c9a6205b | preview --fix | SEND | Blocking: card 3 jsonld-invalid (serious) rested on empty `application/ld+json` containers the CMS writes on every page (live) | seventh batch fix (58bed651), deployed, refreshed, one writing pass; card 3 now meta-viewport | - |
| 2026-10-29 | Nice Pam Hôtel, Hôtel Peyris Opéra (failed jobs deleted) | preview --fix | rescan not launched | Blocking: Nice Pam's directory domain answers 301 to nice-pam-hotel.com, so the crawl stopped at an external redirect after one page (the second domain was added to the prospect); Peyris answered 403 on 77 of 117 URLs at default pacing | - | - |
| 2026-11-13 | Terre Blanche b20a7bfa, La Ferme Saint Siméon 50dc004a, Hôtel des Marais Salants d51e8bad, Hôtel des Congrès et Festivals a4b61335, Hôtel de Nell aae89881, Hôtel Maison Borreze 38c3c8eb, Hôtel Parc du Landreau 40a907ac, Hôtel Les Vikings 9b0f5b66, Hôtel Le Meurice b653fa43, Hôtel Casimir 046e2480, Hôtel Le Lodge c8dda5fa, Hôtel Amérique 0ac5c393 | preview --fix | SEND (12) | Blocking: -. Figures reconcile; blocks with no usable headcount say so and send the reader to counsel. Maison Borreze's jsonld-invalid is a real trailing comma in a filled block. Backlog: Terre Blanche analyses a CMS `/preview/` page (population); Parc du Landreau and Amérique analyse WordPress date, author and category archives (population, seen before: Caron); Le Meurice's contrast card samples its own cookie banner | - | - |
| 2026-11-13 | Hôtel Le Strato 4d44dfc9 | preview --fix | SEND, rescan running | Blocking: -. Backlog: lcen-mentions-legales-missing (serious) false, the legal notice `/fr/page/mentions-hotel-spa-savoie.4383.html` prints the SIREN but no legal-page family matched it, so only the terms of sale were read (acquisition) | eighth batch fix (33e37e6b), deployed | 1 |
| 2026-11-13 | Hôtel de France d537e3a6 | preview --fix | HOLD (2), rescan running | Blocking: content checks timed out (30 s load) on 22 of 25 pages, so the preview prints 3 pages analysed; the HTML answers in under 2 s live. The job completed with a report instead of failing its coverage gate (tooling) | - | 1 (5 s) |
| 2026-11-13 | Manoir de Surville, Le Mas des Sables, Hôtel des Berges, Hôtel Belaroïa, Hôtel Peyris Opéra, Nice Pam Hôtel (failed jobs deleted) | preview --fix | rescans running | Blocking: Surville, Mas des Sables and Berges blocked by origin pushback (9, 22 and 61 events); Belaroïa's domain redirects to belaroiahotel.fr (added to the prospect, seen before: Nice Pam); Peyris answered 403 on 77 of 117 URLs a second time at default pacing; Nice Pam's rescan from its redirect domain had not been launched | - | 1 each (5 s for the first three and Peyris) |
| 2026-11-13 | 18 audits of 27-29 October | preview --fix | HOLD (4), refresh not run | Blocking: findings stale after the seventh batch fix changed the normalization fingerprint; the refresh was not permitted in this session | - | - |

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

## Sweep 12 notes

Audits: the 38 latest full audits with findings on the VPS, refreshed on
`d971a983` before the sweep. Ten are new to the hunt (atrium-hotel,
bellesrives, chateaudecodignat, clarancehotel, closdesarts, coin-savoyard,
hotel-langres, hotel-particulier, leplacidehotel, leprieuredeboulogne); three
are rescans (atlantichotel, whistlerparis, grandhotelbellevue), each compared
with its previous run. Read in place with read-only scripts in the app
container, and the database read the same way. chateaudecodignat's,
bellesrives' and leprieuredeboulogne's French PDFs were read as text in the
scratchpad.

- Ledger alerts: the 7 carried ones are explained as before (held walks on
  auriac, alpes, macchi, regina and villasfoch; lacoorniche `image-alt`;
  grand-hotel-opera's old `structured-data`). New: atrium-hotel's keyboard
  check evaluated 0 of 1 pages, explained by M1. chateaudecodignat's
  challenge markers are Cloudflare's `challenge-platform` script (minor,
  tooling).
- Population: M1 (atrium-hotel, 1 of 39 pages analysed), M3 (coin-savoyard 31
  canonical copies, yonahotel 11 parameter copies), M4 (prieuré feeds) and
  M7 (yonahotel's 11 catch-all shells). No nested-trap page remains.
- Acquisition: no new failure class. Every stored `bot-challenge` marker on
  the new sites is a Cloudflare script on a page that rendered.
- Per-rule: every critical and serious rule on the ten new sites sampled.
  True: hotel-langres `keyboard-trap` (live), broken links on three sites
  (live 404s), closdesarts `hreflang-target-invalid` and security headers,
  leplacidehotel `jsonld-invalid`, bellesrives `text-missing-from-raw-html`,
  the entity findings of codignat, hotel-particulier and lacoorniche `/en`,
  prieuré's and coin-savoyard's legal-notice findings (coin-savoyard's link
  redirects to `/fr`). yonahotel's `document-title` on its room pages is
  true (live: no `<title>` in the head). New: M2.
- Counting: `hreflang-target-invalid` stays per target (closdesarts 5, the
  existing doubt); M3's copies split one hreflang defect into 16.
- Absence: coin-savoyard answers 403 to every unknown path, so its sitemap
  and `llms.txt` absences are true.
- Measurements: bellesrives' lab figures plausible without CrUX;
  chateaudecodignat's lab FCP median of 15.6 s is real (14.6 MB of inline
  SVG, live). Its lab count mismatch comes from a resumed run (minor).
- Attribution: Complianz is filed as a third party by the report's vendor
  table, as decided; its colours are the site's configuration on all three
  audits that show it.
- Client surfaces: chateaudecodignat's cover, severity totals, category
  totals, priority counts (287 occurrences over 5 findings) and WCAG table
  match its findings; its « Seuil ou parcours non observé » card with an NN
  headcount uses the approved generic line. New: M6, and M4's HTTP-error
  count split.
- Stored products: atrium-hotel, coin-savoyard, leplacidehotel and
  leprieuredeboulogne have reports and no preview or draft; hold them.
  The blocked-pages gate held on five audits, each acknowledged by the
  operator.
- Terminal state: a job keeps `failedPhase: report-fr` after the
  acknowledgment and the report (minor).
- Determinism: the three rescans and grand-hotel-opera against their
  previous runs. Every difference is lab variance, CrUX, F4, `a2b99fac`,
  #497, or whistlerparis's `/en/book.html` now classified with its
  booking-redirect siblings (the old `visited` was the error). The one
  unexplained flip, grand-hotel-opera's tab labels, is the site's opacity
  animation (live probe; minor, merged with the Tarteaucitron item).
- Replay against closed slices: L1, L5, #563 and #564 hold; aflatta's
  `focus-order-mismatch` stays until it is rescanned (#562).
- Model prose against facts: M5. The other obligation and count sentences
  read on the new sites match.
- Page state during interaction: only atrium-hotel's and villasfoch's walks
  are confined to trailing overlays, and both are recorded inconclusive.
- Same component, same verdict: Complianz on three audits, YouTube and
  Hijiffy as in sweep 11.
- Scan-time results older than their checker (angle 17): the nine audits
  scanned before `a2b99fac` and `ec3c8837` were checked; haaitza,
  lacoorniche and hoteldegarlande do serve an `llms.txt` (live), and
  alexanderpark's legal-notice finding is the known K6 target.
- Fresh angle, one fact stated twice in one report (now angle 18): the
  methodology page states its measured-page and HTTP-error counts twice, in
  different sentences built from different sources. It found M6 and the M4
  count split, and the minor 60 against 61 on chateaudecodignat.
