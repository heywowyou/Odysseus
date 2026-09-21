# Plan 075: Make the audit data clean and true before it reaches a report

Status: IN PROGRESS (2026-09-22). Priority P1. Effort XL. Depends on: none (builds on trade-offs 3, 24, 30, 64, 109, 110 and issue #301/#302 work).

## Context

Report generation and the visual layer are close to final. The remaining weakness is the data itself.

A full read-only pass on the VPS read the 12 stored full audits with findings (1,761 analysed pages, 1,387 findings) in memory, using today's normalization. It found four kinds of defect:

1. **Pages that are not the site's content get analysed as if they were.**
2. **Checks report defects that are not there** (false positives, several of them critical).
3. **One defect is counted many times.**
4. **Lighthouse measures something other than the page it is attributed to.**

The finalize-report skill does not catch any of these. It regroups only when a reviewer notices a split, does so through a code fix plus a paid regeneration, allows one regroup per run, and cannot touch the crawl or the page population.

Why it matters to the client: the grade counts findings (`report/src/template/grade.ts:79`: two serious findings give a D). So do the cover totals, the severity chart, the "X of Y" note, and the outreach preview's totals and proof cards. A false critical finding, or one defect split into five, moves the grade and the headline.

## Evidence (from the 2026-09-22 pass; site names as stored)

### A. Non-content pages analysed as content

| Defect | Measured |
|---|---|
| Rate-limit pages scanned as content | grand-hotel-opera: **127 of 173** analysed pages are "429 Too Many Requests" pages. The crawl fetch got 200; the browser render got 429 (`renderDiff.httpStatus` 429), and every check still ran. This produced `html-has-lang` on 127 pages and 7 findings that exist only on those pages. It also happens on haaitza and lacoorniche (1 page each). Lacoorniche answered 429 to a single browser visit on 2026-09-22. |
| Bot-challenge (WAF) pages scanned as content | lacoorniche: 10 "Test de sécurité / Security check" pages analysed. Their meta refresh produced **critical `meta-refresh`** findings (14 pages). A 503 from the WAF produced `canonical-target-unreachable` (serious). |
| Cross-page checks ignore the excluded-page rule | Findings attached to `redirect-interstitial` pages: `hreflang-no-return-link` on 581 page entries across 6 audits, plus `faq-content-without-schema`, `entity-data-incomplete`, `structured-data-entity-missing`, and `broken-internal-link` sources. The page loop honours `contentExcludedUrls` (`normalize.ts:263`); the cross-page extractors after it do not (`normalize.ts:338`). |
| Server redirects fully scanned, then discarded | `redirect-interstitial` pages: grandhoteldesalpes 88 of 190, lacoorniche 81, haaitza 66, pointfrance 49. Each one got a full render, axe and **Lighthouse** run (grandhoteldesalpes: 186 Lighthouse runs for 98 content pages) before being excluded. The crawl records a redirected fetch under the requested URL (`crawl.ts:1067`). |
| Off-site redirect stubs scanned | `/fr/book.html`, `/en/book` and `/en/book?` (grandhotelchicago, grandhotelbellevue) redirect late to the booking engine (`be.synxis.com`). They stayed `visited`, Lighthouse measured the booking engine (30 of 30 files in chicago's `unsized-images` finding come from synxis and CMS hosts), and their 100% "missing text" made a 24-page `text-missing-from-raw-html` finding **critical** while its other pages sit at 21–31%. |
| One check hanging loses the whole page | A 420 s page watchdog abandoned **every** content check on hoteldegarlande `/` and `/en/home` (homepage: no axe, no head metadata, three attempts ~21 min, while its screenshots and Lighthouse succeeded), 26 of 98 content pages on grandhoteldesalpes, 5 on atlantichotel, and 2 on pointfrance. |
| Crawl loops and URL-spelling duplicates | atlantichotel: 227 of 341 pages are `/fr/fr/…` and `/en/en/en/…` loops from relative links, with 19 `broken-internal-link` findings on loop URLs. chateauroyal: 5 pages crawled twice, as `%E3…` and `%e3…` percent-encoding. bellevue: `/fr/book?` (an empty query) crawled apart from `/fr/book`. |

### B. False positives (confirmed on stored data, some by a live probe of an already-audited site)

| Rule (severity) | Measured |
|---|---|
| `keyboard-trap` (critical) | atlantichotel: 332 pages. A live probe shows `#AVP_arrivalDate` is a native `<input type="date">`: Tab walks its day/month/year parts, so the element keeps focus for three presses and then moves on. chicago and bellevue flag a map `<iframe>`, where `document.activeElement` stays the iframe while focus moves inside it. The stored selector (`iframe:nth-of-type(12)`) is also wrong, because the index counts every tabbable element (`keyboard-navigation.ts:74`). |
| `noindex-on-public-page` (critical) and `is-crawlable` (serious), together | pointfrance: 111 pages, all WordPress date archives. hoteldegarlande and chateauroyal: date and author archives. haaitza: category pages, cookie policy, 404 page. These are deliberate noindex pages. The same pages are also reported a second time by Lighthouse `is-crawlable` on 7 audits. |
| `video-missing-captions` (serious) | haaitza (26 pages), lacoorniche. A live probe shows `<video muted controls>` with no loaded source: audio cannot be measured, and the check defaults to "has audio". |
| `nap-phone-mismatch` | lacoorniche: structured `+33 (0)5 56 22 72 11` (digits `330556227211`) is the visible `05 56 22 72 11`. `normalizePhone` does not strip the `(0)` trunk digit. |
| `hreflang-no-return-link` (serious) | chateauroyal: percent-encoding case mismatch. garlande and bellevue: source or target is a redirect stub. lacoorniche: targets are `/xx/erreur-404/`. That is a real defect, but it is misnamed and split into 5 findings, one per language. |
| Lighthouse `redirects` | Nearly every Lighthouse run warns "test URL … was redirected to …/" (pointfrance 568 of 571). The crawler strips the trailing slash (issue #102), and WordPress 301s back to the slashed URL. The `redirects` finding on 8 audits is self-inflicted, and every lab metric carries the extra hop. |

### C. One defect counted many times

| Pattern | Measured |
|---|---|
| axe colour rules | `color-contrast`: 290 findings over 10 audits (capdantibes: 34 findings for one colour pair; atlantichotel: 105 findings for 9 pairs). `link-in-text-block`: 145 (pointfrance: 139 = 44%). |
| Positional or generated selectors | `heading-hierarchy-skip`: 95 (pointfrance 40 findings, 4 shapes; the selector's index is also wrong, `head-metadata.ts:153`). `reflow-horizontal-scroll`: 27. `aria-prohibited-attr`: 16 (`#grid_cell-…`). Remaining `link-name`: 70. `jsonld-invalid`: chicago 4 findings for one parse error (split by `script:nth-of-type`). |
| Element-level Lighthouse and custom rules | `layout-shifts`: 52 (up to 13 per audit). `crawlable-anchors`: 37, including calendar prev/next arrows on every page. The custom `crawlable-anchors` from trade-off 110 also uses page-specific `nth-child` paths. |
| Per-target and per-language splits | `broken-internal-link`: 34 (atlantichotel 19). `hreflang-no-return-link`: one finding per language. |
| Lighthouse insight/legacy twins | An insight with no items of its own is not allowed to supersede (`auditHasActionableDetail`), so both sides emit. This gives `cls-culprits-insight` with `layout-shifts` and `unsized-images`, and `document-latency-insight` with `redirects` and `server-response-time`: 33 duplicate pairs over 12 audits. `bootup-time` and `mainthread-work-breakdown` co-occur on every audit. |

Checked and **not** noise:
- third-party-owned elements outside frames (about 10 findings, mostly site-authored social links). Content inside third-party frames is a separate defect, see Part E;
- `tracker-request-before-consent` and `cookie-non-essential-before-consent` evidence;
- `accessibility-statement-missing`;
- dedupe-key collisions, occurrence-count consistency, and findings with no page.

## Invariants every slice keeps

- **Regrouping never drops anything.** Total occurrences stay identical before and after on every measured audit, and no rule id disappears unless the slice removes a false positive on purpose; those removals are listed per slice in the measurement output.
- **A merge only joins findings that say the same thing:** same rule, same failure statement, same fix. The printed selectors and element samples do not change, only `dedupeIdentity` and `coarseGroupIdentity` (trade-offs 3 and 30).
- **The population rules hold.** No global page cap (rule 5 amendment). No propagation of a Lighthouse measurement to a page that was not measured. The single-rule concentration guard stays at 30%.
- **Uncertain means undetermined.** A check that cannot establish the fact it reports records the check as undetermined and never emits a confident finding.

## Slices

Execution order: 0, then A1–A8, then B, then C, then E, then D. The operator questions in Part E are asked before their slices start.

### 0. Measurement harness (first; every other slice is proved against it)

Add `scripts/measure-audit-data-quality.mjs`. It runs today's `normalizeAudit` in memory over stored audit directories and writes nothing. It reports:
- findings, occurrences and top-rule share, per audit and per rule;
- findings on non-`visited` pages;
- pages whose render status or title is an error or challenge;
- Lighthouse runs whose final URL differs from the page's identity;
- cross-source duplicate pairs;
- split candidates (same rule and same failure statement over several findings).

It runs read-only in the VPS container over `/data/artifacts`. The baseline for the 12 audits is recorded in this plan. Client data never enters the repo.

### Part A: only the site's own content is analysed

- **A1. Rate-limit and challenge answers are never content.**
  - A render whose status is 429, 503, or another transient status, or whose document carries challenge markers (a known challenge title, or a meta refresh on a near-empty document), is an acquisition failure. It is not a page.
  - It feeds the existing ledger (`failureClassForHttpStatus` gives `anti-bot-rate-limit` and `origin-transient-error`), `noteRateLimited` backoff, and one later retry.
  - If it still fails, the page is inventoried as blocked, disclosed in coverage, and yields no findings.
  - The same rule applies to Lighthouse runs and to canonical-target fetches (a 503 means undetermined, not unreachable).
  - Stored audits: `normalize.ts` excludes pages whose stored `renderDiff.httpStatus` is ≥400 or whose title matches the challenge patterns, so a regenerated report drops them.
  - Tests: scanner unit tests on the classification, the e2e fixture server answering 429 then 200, and a normalize test on stored-shape input.
- **A2. One content population for every extractor.**
  - Build the set of excluded URLs once: `redirect-interstitial`, `soft-error-page`, and blocked pages from A1.
  - Pass it to every cross-page and site-level extractor: hreflang (as source and as target), FAQ, entity data, structured-data entity, `broken-internal-link` sources, and the site-level anchor choice.
  - Tests: one normalize test per extractor.
- **A3. Redirects are followed, not scanned twice.**
  - A same-site server redirect records the requested URL as a redirect with its target, and enqueues the target's identity. Only the target is scanned.
  - A client-side or late redirect that leaves the site, detected from the render's landed URL or Lighthouse's `finalDisplayedUrl`, marks the page `skipped-external-redirect`.
  - A Lighthouse run whose final URL is not the page's identity is discarded and never attributed.
  - Tests: crawl e2e with a 301 chain and a JS redirect off-site; a normalize test that drops an off-identity Lighthouse run.
- **A4. Fetch the spelling the site serves.**
  - Page identity stays slash-free (issue #102). Navigation, axe and Lighthouse use the served spelling, learned from the crawl fetch's same-identity redirect.
  - Normalization drops Lighthouse `redirects` when its only hop is a same-identity slash variant. That fixes stored audits too.
  - Tests: links and crawl unit tests, and a normalize-lighthouse test.
- **A5. One slow check never costs the whole page.**
  - First reproduce the hang on hoteldegarlande `/` with a short probe (an already-audited site) and the stored pages from grandhoteldesalpes and atlantichotel, then fix the check at fault.
  - Give each content check its own time budget under the page watchdog, so a timeout fails that check alone. The ledger already records outcomes per check.
  - A homepage content failure is shown as a blocking diagnostic on the audit page (plan 068's scoped diagnostics).
  - Tests: a scan-page e2e with a deliberately hanging check.
- **A6. URL identity gaps.**
  - Upper-case percent-escapes, and drop an empty query string, in `normalizePageIdentityUrl`.
  - Add a pre-enqueue guard for self-nesting relative links. Evidence comes from the anchor itself: a relative raw href on a page inside a directory that resolves to a repeated leading segment.
  - Omitted loop URLs are disclosed like the continuation guard's. A new site-level `relative-link-nesting` finding reports the cause once, with severity, French-first copy, and a rule-coverage entry.
  - `/index.html` aliases are left alone, because they can be real pages.
  - Tests: links and crawl unit tests, plus an e2e crawl on a local fixture site.
- **A8. The dashboard says when a site pushes back** (operator request, 2026-09-22).
  - The operator should learn during the scan, not from the report, that a site is rate-limiting or challenging the crawler, so they can stop it and relaunch with a longer delay.
  - `HostRequestScheduler.noteRateLimited` (`host-request-scheduler.ts:91`) exists but nothing calls it. Wire it to every pushback signal:
    - HTTP 429 or 503 on a crawl fetch, a browser render, a Lighthouse run or a canonical fetch;
    - a `Retry-After` header;
    - a challenge page detected by A1.
  - Record each event on the job: the page, the kind (rate limit, bot challenge, 503), the time, and which fetcher hit it.
  - **During the scan**, the job card and the audit page show a warning with the count so far. The warning is French-first, with no em dashes, for example: « Le site limite nos requêtes : 12 pages ont reçu une réponse 429 ou une page de vérification anti-robot. »
  - **At the end**, a scoped diagnostic (plan 068) blocks report generation while any content page stayed blocked after A1's retry.
  - **Relaunch**: "Relancer plus lentement" opens the existing queue-scans dialog (`queue-scans-dialog.tsx`; `delayMs` and `scanConcurrency` are already offered) prefilled with:
    - scan concurrency 1;
    - a delay of max(current delay × 4, the largest `Retry-After` seen, 5 s).
  - Stopping stays manual. Nothing restarts or deletes a scan on its own.
  - Tests:
    - a scheduler unit test (every signal reaches `noteRateLimited`);
    - an interface route test (events appear on the job read model);
    - a dashboard component test (warning copy and prefilled relaunch);
    - the 429 fixture e2e from A1 asserts the event is recorded.
- **A7. Stored-audit consequences.**
  - A1 (the stored-status part), A2 and A4 (redirect suppression) apply through re-normalization.
  - A1 (retry), A3, A5 and A6 need a new scan.
  - grand-hotel-opera and lacoorniche are recorded as needing a rescan before any report is sent.

### Part B: remove false positives

- **B1. `keyboard-trap`.**
  - A repeat focus on a native `date`, `time`, `datetime-local`, `month` or `week` input, or on an `iframe`, `object`, `embed` or shadow host, is not a trap. Continue the walk (bounded) and flag a trap only if focus never leaves after the element's own sub-stops.
  - Fix the selector to a real path (the same helper as `link-facts.ts`).
  - Tests: an e2e fixture with a date input, an iframe, and a real trap.
- **B2. `noindex-on-public-page`.**
  - Fire only when there is evidence the page is meant to be found: it is in the XML sitemap, is the homepage or a language home, is a hreflang or canonical target of another page, or is linked from the primary navigation.
  - WordPress archives, error pages, and legal and utility pages with noindex and no such evidence are deliberate and are not reported.
  - Always drop Lighthouse `is-crawlable` where head metadata ran, stored audits included; the custom rule now owns the fact.
  - Tests: normalize-head-metadata unit tests.
- **B3. `video-missing-captions`.** Record audio as present, absent or undetermined (for example, no source loaded or a failed probe). Only "present" with no caption track is a finding; undetermined goes to the manual checklist. Tests: normalize-video-captions unit tests and a scanner e2e with an unloaded muted video.
- **B4. `nap-phone-mismatch`.** Normalize `+33 (0)X` and `0033 (0)X` to the national form. Tests: nap-consistency unit tests.
- **B5. `hreflang-no-return-link`.**
  - Compare normalized identities (percent-case, slash).
  - Skip excluded pages on both sides (A2).
  - A hreflang target that is an error or redirect page becomes one `hreflang-target-invalid` finding. It needs severity, French-first copy and rule coverage.
  - Group by source page set, not by language (see C).
  - Tests: normalize-hreflang unit tests.
- **B6. `text-missing-from-raw-html`.**
  - A1 and A3 remove the booking stubs.
  - A merged finding's severity comes from its pages' distribution, not the single worst page. Measure first, then decide the rule (median or band split) and record it in trade-off 3.
  - Tests: normalize-renderdiff unit tests.
- **B7. `lcen-mentions-legales-missing` outside metropolitan France.** chateauroyal (`.nc`) is judged against SIREN, RCS and VAT fields. Check `docs/rules/obligation-basis.md` for overseas collectivities, and record the decision rather than guessing. If the basis is unclear, the finding becomes a manual check for that jurisdiction.

### Part C: one defect counts once

This is identity, not selector normalization (trade-offs 3 and 30). Each change is measured with slice 0 before it is kept.

- **C1. `color-contrast` and `link-in-text-block`.**
  - Identity is axe's own check data (`fgColor|bgColor|expectedContrastRatio`; `nodeColor|parentColor|requiredContrastRatio`), read from `any[].data`, which `scan.json` already stores. This requires extending `AxeNodeInput`.
  - Fall back to today's identity when the data is absent.
- **C2. Generated-id axe rules** (`aria-prohibited-attr`, remaining `link-name`): the element shape plus the failure statement. Add a rule to the allowlist only after measuring it.
- **C3. Custom positional rules.**
  - `heading-hierarchy-skip`: identity is the skipped pair plus the heading shape, and the selector bug is fixed.
  - `reflow-horizontal-scroll`: identity is the widest element's shape, excluding digit-bearing ids and classes.
  - `jsonld-invalid`: identity is the parse error.
- **C4. Element-level Lighthouse and custom rules.**
  - `crawlable-anchors` (custom): identity is the failure reason plus the opening-tag shape.
  - `layout-shifts`: a Lighthouse-specific identity from the node snippet shape.
  - This closes the deferred item in `report-feedback-deferred-items.md`.
- **C5. List-shaped rules.** `broken-internal-link` becomes one site-wide finding with the targets and their source pages as `resourceUrls` evidence, the same shape as trade-off 30. `hreflang-no-return-link` gets one finding per source page set.
- **C6. Lighthouse twins.**
  - An insight with no actionable item is dropped when a legacy audit it replaces emits with items (the reverse of `computeSupersededAudits`).
  - Measure `bootup-time` against `mainthread-work-breakdown`, and fold one into the other only if the fix and the files are the same.
- Tests for Part C: unit tests per extractor, plus `finding-collapse.test.ts` invariants and `rule-coverage.test.ts`.

### Part E: second pass (2026-09-22)

A second read-only pass covered the areas the first one left open: Lighthouse run validity, challenges that return 200, third-party frames, SEO checks on noindex pages, field versus lab data, the outreach preview, and reports already built on the contaminated audits.

#### Evidence E

| Defect | Measured |
|---|---|
| Challenge bodies that return 200 | The o2switch anti-bot challenge (`<img id="img" src="https://o2swit.ch/assets/tiger.svg">`) was audited by axe on 4 haaitza pages and in 3 lacoorniche findings (14, 15 and 15 pages), and gave a **critical `image-alt`** finding. The stored title is the real page title and the h1 is empty, so the challenge replaced the body after the head was read. A render-status check (A1) does not catch it. |
| Challenges inside a vendor frame | lacoorniche's table-booking iframe served a DataDome captcha (`static.captcha-delivery.com`) to the crawler. The result is 3 **critical `image-alt`** findings on 14, 12 and 25 pages, split by the iframe's translated `title`. A widget that blocked the crawler is not a defect of the site. |
| Third-party frame content drives the grade | 31 findings sit inside a frame (`>>>` selectors): 18 critical and 13 serious over 5 audits (YouTube player, uMap, a Vapor widget, the captcha above). The annex attributes them as third-party (`third-party-attribution.ts`), but `computeStatistics` still counts them in the critical and serious totals, so one YouTube embed forces a D (`grade.ts`). The same video is also split in two by iframe attributes (`iframe[width="560"]`, `iframe[frameborder="0"]`). |
| SEO content checks on noindex pages | SEO-category page entries on pages that declare noindex: pointfrance 362 of 2,038, lacoorniche 158 of 706, haaitza 53 of 291, plus garlande, grand-hotel-opera, chateauroyal and chicago. The rules involved are `meta-description-*`, `canonical-missing`, `crawlable-anchors`, `jsonld-missing`, `opengraph-missing`, `meta-title-length`, `link-text` and `faq-content-without-schema`. A page kept out of search on purpose has no search snippet to improve. The heading rules are accessibility (WCAG 1.3.1) and stay. |
| One metric reported twice, field and lab | capdantibes and villasfoch: `crux-cls-poor` (serious) and lab `cumulative-layout-shift` (critical). chicago: `crux-lcp-poor` (serious) and lab `largest-contentful-paint` (critical). Real-user data and a throttled lab run give two findings, with two different severities, for one metric. |
| Lab runs of doubtful validity | Lighthouse warns "stored data (IndexedDB) may affect loading performance" on 199 of 201 lacoorniche runs and 175 of 176 grand-hotel-opera runs. Lighthouse runs over the shared Chromium's debug port (`lighthouse.ts`, `browser.ts`) after our own Playwright visits to the same origin. Runs with `NO_FCP` and `PROTOCOL_TIMEOUT` exist. LCP medians of 27 s (lacoorniche) and 21 s (villasfoch), with a p90 of 55 s, have no plausibility check against CrUX. |
| Outreach proof cards can show a false positive | `keyboard-trap` has proof-card copy (`proof-card-copy.ts:591`), so B1's false trap on atlantichotel (332 pages, critical) is a candidate headline card in a cold email. A proof screenshot can also come from a rate-limit or challenge page (A1). |
| Reports already built on contaminated data | grand-hotel-opera: FR and EN PDFs from 2026-09-17 and a FR PDF from 2026-09-19, over 127 rate-limit pages. lacoorniche: PDFs from 2026-09-17 and 2026-09-19, plus a finalized FR PDF (and its light variant) from 2026-09-21, over 10 challenge pages. |
| Minor Lighthouse diagnostics as findings | 20 to 29 performance findings per audit. Most are minor diagnostics that explain a metric rather than being defects of their own: `bootup-time`, `mainthread-work-breakdown`, `unused-javascript`, `unused-css-rules`, `image-delivery-insight`, `forced-reflow-insight`, `network-dependency-tree-insight`, `lcp-discovery-insight`, `legacy-javascript-insight`, `total-byte-weight`. They are counted in totals and the minor-severity chart. |
| Low-value archive pages | WordPress date, author, category and type archives: pointfrance 141 pages; chateauroyal about 110 of its 112 `no-h1` pages ("avril 2024", "16 avril 2024", "Types de logement Archive"). The findings on them are template-identical to each other. |

Checked and not noise in this pass: `label` on atlantichotel's `#AVP_arrivalDate` (a real unlabelled field, unlike the trap), `meta-viewport` (one finding per audit), `nested-interactive`, `select-name`, `frame-title` on site-authored iframes, and the pointfrance axe failures (the A5 watchdog, not a separate defect). `/data/artifacts/prescans` (525 runs) predates plan 047. The code that wrote those runs is gone and nothing reads them, so they are not in scope.

#### Operator questions (asked before the slice that needs them)

- **Q1, third-party frame content in the grade (E2).** Recommended: findings inside a third-party frame stay in the annex, attributed to the vendor. The grade, cover totals, severity chart and preview totals count first-party findings only, with the line « dont N relèvent de contenus tiers intégrés ». The conformance wording does not call them out of scope: EN 301 549 judges the page as served, embeds included. The alternative is to keep counting them and only label them.
- **Q2, minor Lighthouse diagnostics.** Recommended: the five metrics (LCP, CLS, TBT, FCP, Speed Index) stay findings, and each diagnostic becomes evidence under the metric it explains, as ranked causes. That removes about 15 findings per audit without losing any evidence. The alternative is to keep them as findings and exclude minor ones from the counts.
- **Q3, archive pages.** Decide after E3, because many archives are noindex. Recommended: keep crawling and disclosing them (no page cap; trade-off 64 requires structural evidence), and group template-identical archive findings into one finding. Stop there, and do not sample.

#### Slices

- **E1. Challenges detected by content, at check time and in frames.**
  - A1's markers become a vendor table confirmed against real data: the o2switch challenge (`o2swit.ch/assets/tiger.svg`), DataDome (`captcha-delivery.com`), and the lacoorniche WAF « Test de sécurité ». This follows the confirmed-not-guessed rule of `third-party-attribution.ts`.
  - The document is tested when axe and head metadata run, not only at render. A challenge body turns the page into A1's blocked page.
  - A challenge inside a frame drops that frame's findings and records the widget as undetermined. It also counts as an A8 pushback event.
  - Stored audits: normalization drops findings whose element snippet matches a marker.
  - Tests: marker unit tests, a normalize test on a stored-shape page, and an e2e fixture whose iframe serves a challenge.
- **E2. Third-party frame content (after Q1).**
  - Apply Q1's decision in `statistics.ts`, `grade.ts` and the preview totals.
  - The identity of an in-frame finding becomes the frame's `src` origin plus the inner element shape, not the iframe's own attributes, so one embed counts once (C).
  - Tests: statistics and grade unit tests, and a collapse test.
- **E3. Noindex pages skip SEO content rules.**
  - A page that declares noindex (meta robots or `X-Robots-Tag`) keeps every accessibility, privacy and legal check. It gets no SEO-category content finding.
  - Coverage discloses « N pages marquées noindex, exclues de l'analyse SEO ».
  - This applies in normalization, so stored audits benefit.
  - Tests: normalize-head-metadata and normalize-links unit tests, and a coverage test.
- **E4. One finding per metric when field data exists.**
  - When CrUX gives a verdict for a metric, the CrUX finding owns the metric and the lab result becomes its evidence. The lab result alone decides only when field data is absent.
  - Measure on the 12 audits first, then record the rule in trade-off 111.
  - Tests: normalize-lighthouse and CrUX unit tests.
- **E5. Only valid lab runs are measured.**
  - First diagnose the IndexedDB warning with one short probe of an already-audited site. With storage reset on, Lighthouse clears the origin before loading, so the warning probably reports residue from our own Playwright visits rather than a warm run. If that holds, record the warning as benign. If not, run Lighthouse in a clean browser context.
  - A run with `NO_FCP`, `PROTOCOL_TIMEOUT` or any `runtimeError` is discarded and retried once. It never enters a median.
  - The harness flags a lab median above 20 s, or above three times the CrUX p75 when field data exists. The report's metric copy says lab versus field.
  - Tests: normalize-lighthouse unit tests, and a scanner unit test for the retry.
- **E6. The outreach preview never shows a false or blocked proof.**
  - Preview evidence selection skips the page classes A1 and E1 mark as blocked. It also skips any rule listed in a small "under correction" set until that rule's fix is merged: `keyboard-trap` until B1 lands, then the set is emptied.
  - Tests: preview selection unit tests.
- **E7. Reports built on invalidated audits cannot go out.**
  - Check that the `NORMALIZATION_FINGERPRINT` bump (D) makes the existing provenance fail-closed path refuse the grand-hotel-opera and lacoorniche PDFs, the finalized 2026-09-21 one included. If it does not, add that refusal.
  - The dashboard shows those reports as « À régénérer après nouvelle analyse ». Nothing is deleted.
  - Tests: a provenance test with a stale-fingerprint report.
- **E8. B6 and B7 made decidable.**
  - B6: a merged `text-missing-from-raw-html` finding takes its severity from the median missing share of its pages, using the existing per-page bands in `severity.ts`. The worst page is listed in its evidence. Recorded in trade-off 3.
  - B7: if `obligation-basis.md` has no entry for New Caledonia and the other overseas collectivities, `lcen-mentions-legales-missing` on those domains becomes a manual check (« vérifier le régime applicable ») and the finding is not emitted. The decision is recorded in the basis document. No legal fact is guessed.

### D. Docs, fixtures, rollout

- **Trade-offs.**
  - Amend 3: identities, and the severity of a merged finding.
  - Amend 30: `broken-internal-link`.
  - Amend 64 and the rule 5 amendment: the nesting guard.
  - Amend 110: `is-crawlable` always dropped.
  - Add 111: the non-content page population (A1–A3, E1), served spelling (A4), per-check budgets (A5), noindex pages and SEO rules (E3), field ahead of lab and lab-run validity (E4, E5), and the answers to Q1 to Q3.
- **Rules docs.** Update normalization-rules §1, §2, §5 and §5a. Add undetermined outcomes to the manual accessibility checklist.
- **Fingerprint and fixtures.** Bump `NORMALIZATION_FINGERPRINT` and re-stamp the committed test audits. `pnpm fixtures:refresh` runs where the source artifacts exist; otherwise the known fixture-freshness failure is recorded, as today.
- **Stored audits.** Nothing is regenerated automatically: `regenerate-report` re-runs the paid AI passes. Before a report goes out, re-normalize (Parts B and C, and the stored-data parts of A) or rescan (the scan-time parts of A).
- **Proof on the VPS.** Rerun slice 0 on all 12 audits and record the before/after table in this plan. Optionally rescan grand-hotel-opera and lacoorniche; that is an external operation, run only on operator request.

## Definition of done

- The data-quality harness shows the before and after tables for all 12 stored audits, and the invariants hold.
- No finding is attached to a non-content page: no rate-limit or challenge page, redirect stub, soft-error page or off-site redirect.
- No Lighthouse run is attributed to a URL other than the page it measured, and no `redirects` finding comes from our own trailing-slash handling.
- One slow check fails only itself. A homepage whose content checks fail is visible on the dashboard.
- Loop URLs are never queued. Their cause is reported once and the omitted URLs are disclosed.
- Each false positive in section B is fixed, or recorded as an undetermined or manual check, with a test.
- Each split in section C collapses to one finding per real defect, with occurrences preserved and the concentration guard green.
- The dashboard warns during a scan when a site rate-limits or challenges the crawler, and offers a prefilled slower relaunch.
- Challenges that return 200, including those inside vendor frames, yield no findings (E1).
- Q1 to Q3 are answered and applied: third-party frame content, minor Lighthouse diagnostics, archive pages.
- Noindex pages carry no SEO content findings, and the coverage discloses them (E3).
- A metric is reported once, with field data ahead of lab when both exist, and no invalid lab run enters a median (E4, E5).
- The outreach preview cannot pick a proof from a blocked page or from a rule under correction (E6).
- Reports built before this plan on the contaminated audits cannot be sent (E7).
- The requirement-to-proof ledger below is complete before the plan moves to DONE.

## Executable closure contract

The closure artifact is the requirement-to-proof ledger below. Every row names its owning seam, the artifact that closes it, a machine-verifiable test, and manual acceptance only where a person must look. No binding row may be blank when the plan moves to DONE.

## Closure ledger

| Requirement | Owner seam | Artifact | Machine-verifiable proof | Manual acceptance |
|---|---|---|---|---|
| Baseline and after-numbers | `scripts/measure-audit-data-quality.mjs` | Tables in this plan | Script over 12 VPS audits; invariants hold | Operator reads before/after |
| Rate-limit and challenge pages excluded and retried | `scanner` acquisition, `normalize.ts` | Code, trade-off 111 | Classification unit tests, 429 fixture e2e, normalize test | grand-hotel-opera rescan shows 0 error-page findings |
| Dashboard warns on rate limits and bot checks; one-click slower relaunch | `host-request-scheduler.ts`, job read model, dashboard job and audit views | Code, copy | Scheduler, route and component tests; 429 fixture e2e | Operator sees the warning on the lacoorniche rescan |
| One content population | `normalize.ts` cross-page extractors | Code | Normalize test per extractor; harness shows 0 findings on non-visited pages | none |
| Redirects followed; off-site stubs skipped; off-identity Lighthouse discarded | `crawl.ts`, `write-audit.ts`, `normalize-lighthouse.ts` | Code | Crawl e2e, normalize test | Harness: 0 off-identity Lighthouse runs in a new scan |
| Served spelling, no self-inflicted redirect | `links.ts`, scan navigation, `normalize-lighthouse.ts` | Code | Unit tests; harness shows no slash-only `redirects` | none |
| Per-check budgets; homepage failure visible | `scan-page.ts`, dashboard diagnostics | Code | Hanging-check e2e | hoteldegarlande `/` probe completes |
| URL identity gaps and nesting guard | `links.ts`, `crawl.ts`, new site-level rule | Code, copy, trade-off | Unit and e2e, rule-coverage | none |
| keyboard-trap, noindex, video, NAP, hreflang, render-diff false positives | Named normalizers and checks | Code | Unit and e2e per rule | Operator spot-checks one report |
| LCEN outside metropolitan France | `obligation-basis.md` owner | Recorded decision | Unit test for the chosen behaviour | Operator decision if the basis is unclear |
| One defect counts once | `normalize-axe.ts`, `normalize-head-metadata.ts`, `normalize-reflow.ts`, `normalize-links.ts`, `normalize-lighthouse.ts`, `normalize-crawl.ts`, `normalize-hreflang.ts` | Code, deferred item closed | Unit tests, collapse invariants, concentration guard | Harness per-rule table |
| Challenges returning 200, in page or frame, excluded | scanner acquisition, `normalize-axe.ts`, `normalize.ts` | Code, vendor marker table | Marker unit tests, normalize test, challenge-iframe e2e | Harness: 0 findings with a challenge marker snippet |
| Third-party frame content handled per Q1 | `statistics.ts`, `grade.ts`, preview totals, `normalize-axe.ts` identity | Code, operator decision | Statistics, grade and collapse unit tests | Operator answers Q1 |
| Minor Lighthouse diagnostics handled per Q2 | `normalize-lighthouse.ts`, report performance section | Code, operator decision | Normalize and report unit tests | Operator answers Q2 |
| Archive pages handled per Q3 | `normalize.ts`, coverage disclosure | Code, trade-off 64 note | Collapse unit test | Operator answers Q3 |
| No SEO content finding on noindex pages | `normalize-head-metadata.ts`, `normalize-links.ts`, coverage | Code, copy | Unit and coverage tests; harness shows 0 SEO entries on noindex pages | none |
| One finding per metric; valid lab runs only | `normalize-lighthouse.ts`, CrUX normalizer, `lighthouse.ts` | Code, trade-off 111 | Unit tests; harness plausibility table | IndexedDB probe result recorded here |
| Preview never shows a false or blocked proof | preview evidence selection | Code | Selection unit tests | none |
| Contaminated reports refused | provenance fail-closed path, dashboard report list | Code or confirmed existing behaviour | Stale-fingerprint provenance test | Operator sees « À régénérer » on grand-hotel-opera and lacoorniche |
| B6 and B7 decided | `normalize-renderdiff.ts`, `obligation-basis.md` | Code, trade-off 3, basis entry | Unit tests | Operator reads the B7 basis entry |
| Provenance consistent | `normalization-fingerprint.ts` | Fingerprint bump | `pnpm run check`, findings-provenance test | none |

## Verification

- Per slice: typecheck plus the slice's own tests, then a commit on main (not pushed).
- Before pushing: `pnpm run format`, `pnpm run check`, `pnpm run test:all`.
- End to end: rerun slice 0 on the 12 VPS audits and compare. Occurrences must be unchanged except for the listed false-positive removals, and there must be zero findings on non-content pages, zero off-identity Lighthouse runs, and no rule above 30%.
- Re-normalize one stored audit locally, render the PDF against a stubbed analysis, and read the statistics and annex as a client would.

## Rescan after deploy (operator decision, 2026-09-22)

Once this plan is deployed, rescan all 12 stored full audits instead of only re-normalizing them. That puts every audit on the same code and gives clean Lighthouse measurements.
1. One small site first, as an end-to-end check.
2. Then grand-hotel-opera, atlantichotel, hoteldegarlande and grandhoteldesalpes.
3. Then lacoorniche on its own, slowed down (A8).
4. Then the rest, spaced out.

Reports are regenerated only when needed, because regeneration runs the paid AI passes.

Until then, the stored grand-hotel-opera and lacoorniche PDFs, including the finalized lacoorniche PDF from 2026-09-21, are not sent to anyone (E7).
