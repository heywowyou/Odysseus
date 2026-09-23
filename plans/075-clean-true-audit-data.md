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
| **The homepage is never scanned** | grandhoteldesalpes and villasfoch: `/`, `/fr`, `/en` (and `/it`, `/es`) are all `discovered-not-scanned`, with zero check attempts. `/` redirects in the browser to a language root, and `crawl.ts:1034` tests the landed path with `isLanguageHomepagePath`, so the root is treated as a duplicate language home. The language homes are discovery-only as well unless they declare hreflang, which neither site does. The page a client cares most about has no accessibility, head-metadata or Lighthouse data. Site-level findings then anchor on `/en/rl_gallery` and on a bar page (issue #101's fallback). |
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

Execution order: 0, then A1, A9, A2–A8, then B, then C, then E, then D. Part E's operator questions were decided on 2026-09-22.

### 0. Measurement harness (first; every other slice is proved against it)

Add `scripts/measure-audit-data-quality.mjs`. It runs today's `normalizeAudit` in memory over stored audit directories and writes nothing. It reports:
- findings, occurrences and top-rule share, per audit and per rule;
- findings on non-`visited` pages;
- pages whose render status or title is an error or challenge;
- Lighthouse runs whose final URL differs from the page's identity;
- cross-source duplicate pairs;
- split candidates (same rule and same failure statement over several findings).

It runs read-only in the VPS container over `/data/artifacts`. After this plan it stays as a standing gate: the dashboard runs its per-audit checks (blocked pages, homepage scanned, findings on non-content pages, top-rule share, lab-versus-field gap) before a report can be generated, so data this bad can no longer reach a report unseen. The baseline for the 12 audits is recorded in this plan. Client data never enters the repo.

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
- **A9. The homepage is always scanned** (first slice of Part A after A1).
  - The page the start URL lands on is the homepage and is always scanned, whatever its path. Only language homes *other than* the landed one can be discovery-only, and only when a scanned page already covers the same template.
  - The decision uses the requested URL and the landed URL together, not the landed path alone.
  - A dashboard diagnostic (plan 068) blocks report generation when the homepage has no content check that succeeded, which also covers A5's hoteldegarlande case.
  - Tests: a crawl e2e where `/` redirects to `/fr/` with no hreflang, asserting `/fr/` is scanned. A normalize test asserts site-level findings anchor on the homepage.
  - Stored audits: needs a rescan. grandhoteldesalpes and villasfoch are added to the rescan list.
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
| Lab runs of doubtful validity | Lighthouse warns "stored data (IndexedDB) may affect loading performance" on 199 of 201 lacoorniche runs and 175 of 176 grand-hotel-opera runs. Lighthouse runs over the shared Chromium's debug port (`lighthouse.ts`, `browser.ts`) after our own Playwright visits to the same origin. Runs with `NO_FCP` and `PROTOCOL_TIMEOUT` exist. LCP medians of 27 s (lacoorniche) and 21 s (villasfoch), with a p90 of 55 s, have no plausibility check against CrUX. The same audits' CrUX LCP p75 is 3.06 s (lacoorniche) and 2.15 s (villasfoch): the lab median is 9 to 10 times what real visitors experience. |
| Outreach proof cards can show a false positive | `keyboard-trap` has proof-card copy (`proof-card-copy.ts:591`), so B1's false trap on atlantichotel (332 pages, critical) is a candidate headline card in a cold email. A proof screenshot can also come from a rate-limit or challenge page (A1). |
| Reports already built on contaminated data | grand-hotel-opera: FR and EN PDFs from 2026-09-17 and a FR PDF from 2026-09-19, over 127 rate-limit pages. lacoorniche: PDFs from 2026-09-17 and 2026-09-19, plus a finalized FR PDF (and its light variant) from 2026-09-21, over 10 challenge pages. |
| Minor Lighthouse diagnostics as findings | 20 to 29 performance findings per audit. Most are minor diagnostics that explain a metric rather than being defects of their own: `bootup-time`, `mainthread-work-breakdown`, `unused-javascript`, `unused-css-rules`, `image-delivery-insight`, `forced-reflow-insight`, `network-dependency-tree-insight`, `lcp-discovery-insight`, `legacy-javascript-insight`, `total-byte-weight`. They are counted in totals and the minor-severity chart. |
| Low-value archive pages | WordPress date, author, category and type archives: pointfrance 141 pages; chateauroyal about 110 of its 112 `no-h1` pages ("avril 2024", "16 avril 2024", "Types de logement Archive"). The findings on them are template-identical to each other. |

| Challenge pages also feed the lab metrics | lacoorniche `/es/room/ferret` (a « Test de sécurité » page) carries critical LCP, TBT, FCP and Speed Index entries. A Lighthouse run of a challenge page enters the metric findings. |
| WordPress plugin objects scanned as content | grandhoteldesalpes: 37 of 98 visited pages are Responsive Lightbox gallery objects (`/en/rl_gallery/hotel-slider`, `blog1`, `breakfast-slider-2`), reached only through the sitemap, with 1,097 finding page entries. They were scanned while the homepage was not (A9). |
| `structured-data-invalid` (moderate), false | pointfrance: 337 pages; haaitza: 16. Yoast writes one `@graph` in which `Article.publisher` is `{"@id": "…/#organization"}`, a reference to the Organization node on the same page. `structured-data-extract.ts` does not resolve `@id` references, so publisher `@type`, `name` and `logo` read as missing. The required-field table (`structured-data.ts:44`) also comes from the retired preset: Google's current Article documentation lists no required property (author, dates, headline and image are recommended), and publisher logo was an AMP-era requirement. |
| Lighthouse `robots-txt` on a WAF answer | lacoorniche: 20 pages, "Request for robots.txt returned HTTP status: 503". Our own crawler read `robots.txt` for the same audit. A pushback answer is reported as an invalid robots file. |
| Absence claims over incomplete coverage | `accessibility-statement-missing` on grand-hotel-opera searched 176 pages, of which 127 were 429 pages, including `/en/privacy-policy` and `/es/aviso-legal`. lacoorniche's `/it` and `/pt-pt` privacy pages were challenge pages. `sitemap-orphan-page` on grand-hotel-opera lists 53 sitemap URLs as unlinked, from a link graph that lacks the 127 blocked pages. On lacoorniche, 20 of its 36 "orphans" are redirecting sitemap entries and 3 leave the site: a different defect (the sitemap lists redirects), reported under the wrong name. |
| Translations not paired without hreflang | atlantichotel, pointfrance, grandhoteldesalpes and villasfoch have `/fr` and `/en` trees, but every translation cluster has one member, because pairing relies on hreflang alone. The annex then lists each FR/EN twin as a separate page, and `aggregateSharedScopeOccurrences` cannot merge a template defect whose FR and EN page sets differ. |
| Alt-text heuristic on lazy-load placeholders | lacoorniche: 13 of 37 listed images in `empty-alt-non-decorative` are `data:` placeholders (1×1 GIF, inline SVG), and some appear in the other heuristic groups too. The real image behind a placeholder is what should be judged. Minor severity, but it appears in the annex. |

Checked and not noise in this pass: `label` on atlantichotel's `#AVP_arrivalDate` (a real unlabelled field, unlike the trap), `meta-viewport` (one finding per audit), `nested-interactive`, `select-name`, `frame-title` on site-authored iframes, and the pointfrance axe failures (the A5 watchdog, not a separate defect). `/data/artifacts/prescans` (525 runs) predates plan 047. The code that wrote those runs is gone and nothing reads them, so they are not in scope.

#### Operator decisions (2026-09-22: the recommended option on all three)

- **Q1, content inside third-party frames: excluded from the grade, kept in the report.** Findings inside a third-party frame stay in the annex, labelled with the vendor, each with its real fix (change the embed setting, ask the vendor, or replace the widget). The grade, cover totals, severity chart and preview totals count first-party findings only. The cover carries the line « dont N relèvent de contenus tiers intégrés (fournisseur) ». The conformance wording never calls these findings out of scope: EN 301 549 judges the page as served, embeds included.
- **Q2, minor Lighthouse diagnostics: folded into evidence.** The five metrics (LCP, CLS, TBT, FCP, Speed Index) stay findings. Each diagnostic becomes a ranked cause, with its files, under the metric it explains. A diagnostic that stands on its own even when the metrics pass (for example `unsized-images`, which causes layout shift) stays a finding. The folding table is explicit, lives in `normalize-lighthouse.ts`, and is measured with slice 0.
- **Q3, archive pages: still scanned, grouped, and counted apart.** Archives stay crawled and disclosed (no page cap; trade-off 64). E3 runs first, which removes the SEO findings on noindex archives. For the rest, archives are identified structurally (WordPress body classes `date`, `author`, `category`, `tag`, `post-type-archive`, or `CollectionPage` markup). A defect common to every archive of one kind becomes one finding (« présent sur les 141 pages d'archives mensuelles »). Coverage shows archive pages as their own line. No sampling.

#### Production state checked (read-only, 2026-09-22, operator approved)

- All 10 outreach previews (villasfoch, haaitza, grandhoteldesalpes, pointfrance) are revoked. Both outreach drafts were deleted before sending, and neither thread records a sent touch. Nothing built on this data reached a prospect.
- **The pointfrance FR report (audit `cc1d2bd3`) was approved on 2026-09-21.** It carries B2's 111 false critical noindex pages, E10's 337 false structured-data pages and the A5 watchdog losses. E7 treats it like the grand-hotel-opera and lacoorniche reports: the approval is shown as invalidated and the report cannot be sent until a rescan and a new approval.
- The two outreach threads stay in `e1-drafted` although their drafts were deleted. That is a small state inconsistency to check in the outreach code, not a data-quality defect.

#### Slices

- **E1. Challenges detected by content, at check time and in frames.**
  - A1's markers become a vendor table confirmed against real data: the o2switch challenge (`o2swit.ch/assets/tiger.svg`), DataDome (`captcha-delivery.com`), and the lacoorniche WAF « Test de sécurité ». This follows the confirmed-not-guessed rule of `third-party-attribution.ts`.
  - The document is tested when axe and head metadata run, not only at render. A challenge body turns the page into A1's blocked page.
  - A challenge inside a frame drops that frame's findings and records the widget as undetermined. It also counts as an A8 pushback event.
  - Stored audits: normalization drops findings whose element snippet matches a marker.
  - Tests: marker unit tests, a normalize test on a stored-shape page, and an e2e fixture whose iframe serves a challenge.
- **E2. Third-party frame content (Q1 decided).**
  - Apply Q1 in `statistics.ts`, `grade.ts`, the cover line and the preview totals.
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
  - Check that the `NORMALIZATION_FINGERPRINT` bump (D) makes the existing provenance fail-closed path refuse the grand-hotel-opera and lacoorniche PDFs (the finalized 2026-09-21 one included) and the approved pointfrance report. If it does not, add that refusal. An approval (`reportApprovals`) whose report is refused is shown as invalidated, not silently kept.
  - The dashboard shows those reports as « À régénérer après nouvelle analyse ». Nothing is deleted.
  - Tests: a provenance test with a stale-fingerprint report.
- **E8. B6 and B7 made decidable.**
  - B6: a merged `text-missing-from-raw-html` finding takes its severity from the median missing share of its pages, using the existing per-page bands in `severity.ts`. The worst page is listed in its evidence. Recorded in trade-off 3.
  - B7: if `obligation-basis.md` has no entry for New Caledonia and the other overseas collectivities, `lcen-mentions-legales-missing` on those domains becomes a manual check (« vérifier le régime applicable ») and the finding is not emitted. The decision is recorded in the basis document. No legal fact is guessed.

- **E9. Plugin objects are not content.**
  - A sitemap-only page with no inbound link from any scanned page, whose WordPress body class names a plugin post type confirmed non-public against real data (`rl_gallery` first), is inventoried and disclosed but not analysed. The evidence is structural (body class, discovery method, no inbound link), per trade-off 64, not URL shape.
  - The confirmed list lives next to `NON_PUBLIC_WP_POST_TYPES` in `links.ts` and follows the same rule: add a type only when confirmed against a real site.
  - Tests: a crawl unit test on the classification and a normalize test.
- **E10. `structured-data-invalid` judges what Google judges.**
  - Resolve `@id` references inside the same page's `@graph` (and across blocks on the page) before testing fields.
  - Re-derive the required-field table from Google's current structured-data documentation. Fields that are only recommended become a separate minor rule, or are dropped. A plain `publisher` reference to a same-page Organization is valid.
  - Stored audits: the stored `failedTests` came from the old logic. Normalization re-tests stored `jsonLdBlocks` when present, so re-normalization fixes them.
  - Tests: structured-data unit tests with a Yoast `@graph` fixture.
- **E11. Lighthouse `robots-txt` defers to our own fetch.** A `robots-txt` failure whose text shows a 429 or 5xx status is dropped when the crawler read `robots.txt` successfully. It counts as a pushback event (A8). Tests: a normalize-lighthouse unit test.
- **E12. Absence is only claimed over complete coverage.**
  - Every rule that states something is missing site-wide (`accessibility-statement-missing`, `lcen-mentions-legales-missing`, `consent-mechanism-absent`, `hreflang-missing`, `structured-data-entity-missing`, `sitemap-orphan-page`, `llms-txt-missing`) records how many candidate pages were blocked or failed.
  - When a candidate page (a legal, privacy or accessibility page by link text or path, or any page for the orphan graph) was blocked, the rule becomes undetermined and goes to the manual checklist. It never emits a confident finding.
  - `sitemap-orphan-page` drops sitemap entries that redirect or leave the site. Those feed a separate `sitemap-lists-redirects` finding (minor, French-first copy, rule coverage).
  - Tests: one normalize test per rule with a blocked candidate page.
- **E14. Translations paired from the page's own language switcher.** When hreflang is absent, a page's own language-switcher link (an anchor inside a language menu, with `hreflang` or `lang` on the link, or a link to the same path under another language prefix) that resolves to a scanned page is structural evidence of a translation pair (trade-off 64). Clusters built this way are marked with how they were derived. Measure on the four audits first. Tests: a translation-cluster unit test without hreflang.
- **E13. The alt-text heuristic judges the loaded image.** A `data:` placeholder is replaced by the element's `currentSrc` once the image has loaded, or recorded as undetermined. It is never listed as a defect. Tests: an alt-text e2e with a lazy-loaded image.

### Part F: fourth sweep, on the post-075 rescans (2026-09-23)

Sweep 4 of the defect hunt read the eight post-075 full audits that reached `manifest.json`: capdantibes (`2026-09-22T06-29-34Z`), atlantichotel (`06-48-32Z`), hoteldegarlande (`08-15-54Z`), villasfoch (`10-24-41Z`), grandhotelchicago and grandhotelbellevue (`20-14-57Z`), hotelchateauroyal (`21-03-54Z`), and the 5-page haaitza pilot (`18-47-53Z`). grand-hotel-opera (`06-02-16Z`) was read for population only. The stored FR PDFs built from them on 2026-09-22 and 2026-09-23 were read as a client would read them.

#### Evidence F

| Defect | Measured |
|---|---|
| A navigation timeout is reported as a broken page | hotelchateauroyal: 18 pages ended `error` with `page.goto: Timeout 30000ms exceeded … waiting until "load"`, including `/en/dining`, `/en/privacy-policy`, `/en/activities` and six `/ja/` pages (9 of the 24 `/en/` URLs). `crawl.ts:1512` records `status: 'error'` with no retry, no pushback signal and no check-attempt row. Normalization then treats `error` as a broken target: 7 serious `broken-internal-link` findings (15 occurrences) and 13 serious `hreflang-target-invalid` findings (18 occurrences). That is 20 of the report's 51 serious findings. The whole of the report's priority 6, « Versions linguistiques et liens internes », rests on them. A live probe on 2026-09-23 with the crawler's user agent got `/en/dining/` as a 200 page with real content (« Restaurants & Bars - Château Royal ») in 3.2 s. |
| Late off-site redirect stubs are still analysed after A3 | grandhotelchicago and grandhotelbellevue: `/fr/book`, `/fr/book.html`, `/en/book`, `/en/book.html` stay `visited` (HTTP 200, title « Grand Hôtel Chicago »). Their Lighthouse `finalDisplayedUrl` is `be.synxis.com`. Only the Lighthouse run is discarded (4 off-identity runs per audit); the page keeps every other check. chicago: 6 findings exist only on these stubs (`noindex-on-public-page` critical, two `hreflang-no-return-link` serious, `meta-description-missing` serious, `meta-viewport`, `opengraph-missing`), and 22 failed Lighthouse attempts spent about 17 minutes on them. bellevue: the stubs make 4 of the 6 pages of the **critical** `text-missing-from-raw-html` finding and all pages of `no-h1`, `meta-viewport` and `noindex-on-public-page`. The crawl tests the landed host only right after `goto` (`crawl.ts:1072`), before the late JavaScript redirect. |
| Noindex public evidence comes from pages that are noindex themselves | hoteldegarlande: critical `noindex-on-public-page` on `/2023/07`, `/en/2023/07` and the FR and EN author pages. The only evidence is `isHreflangTarget`, and the pages that point to them are each other: WordPress writes hreflang between the FR and EN archive twins, both `follow, noindex`. chicago and bellevue: the evidence for `/fr/book.html` comes from `/fr/book`, another off-site stub. `publicEvidenceForPage` (`normalize.ts:519`) counts every page with head metadata as a pointer, whatever its own robots directive or status. |
| NAP checks compare the business with any number in an article | atlantichotel: `nap-phone-mismatch` on 4 news articles (`actu_10_journees-europeennes-du-patrimoine…`: structured `0251953771`, "visible" `0251231646`, a number quoted in the article) and `nap-postal-code-mismatch` on 1 (`12800` in an article about a rally). The check found a visible phone on only 4 of 114 pages, all 4 in editorial text. `buildNapConsistency` reads every phone in `document.body.innerText` (`nap-consistency.ts:119`, `:157`), so the copy « the number a visitor reads is … » names someone else's number. |
| Lighthouse `robots-txt` on a fetch timeout | hotelchateauroyal: 3 of 81 runs report `robots-txt` with the explanation « Fetch of robots.txt failed: Timed out fetching resource ». Our own crawler read `robots.txt` for the same audit. The report tells the client « Corrigez la syntaxe du fichier robots.txt : telle quelle, une partie de son contenu est ignorée ». E11 only drops 429 and 5xx texts, so it does not catch this. |
| Identity carries runtime state classes | villasfoch: 14 critical `image-alt` findings, and the cover reads « 15 constats critiques ». The footer logo is split over 4 findings and the Instagram and Facebook icons over 4, because axe's selector picks up animation classes that change with scroll state (`animated`, `fadeIn`, `slower`, `go`). atlantichotel: one YouTube player inside a frame is split over 3 `aria-prohibited-attr` findings by its size classes (`ytp-small-mode`, `ytp-large-width-mode`). |
| Absence claimed over an operator-capped crawl | haaitza pilot (`maxPages` 5, origin operator; 121 of 126 sitemap URLs cap-omitted): serious `lcen-mentions-legales-missing` (« No SIREN, RCS, or VAT number found ») and `accessibility-statement-missing`, both over 5 pages. E12 limits absence rules by blocked or failed candidates only, and a cap-omitted page is neither. No report was built from this run. |

Checked and clean in this sweep: the homepage is scanned on all seven full audits (villasfoch lands on `/fr`, scanned; `/en` and `/es` are discovery-only while their subpages are scanned). No findings sit on non-visited pages. There are no challenge or error pages, apart from the grand-hotel-opera refusal. The per-check budgets held: bellevue's axe timeouts on 6 pages all succeeded on retry. `sitemap-missing` is a real 404 on capdantibes, atlantichotel and villasfoch. atlantichotel's FR/EN pages stay unpaired because its language switcher links only to the homepages (`/fr/en/index.html`, itself a 404), so E14 had no evidence to pair them. Also clean: `third-party-data-transfer` copy (« Il s'agit d'un inventaire, pas d'un jugement »), `jsonld-invalid` on chicago (a real parse error), `list`, `input-button-name`, `aria-required-children`, `select-name`, and garlande's Lighthouse `canonical` (the EN home canonicalises to the FR home). Production state (read-only, 2026-09-23): the eight audits have 11 stored reports, no approval, no preview and no draft.

#### Slices

- **F1. A navigation timeout is an acquisition failure, never a broken target.**
  - A `goto` timeout on the `load` event is retried once, paced by the same scheduler, and waits on `domcontentloaded` plus the render settle budget. If it still fails, the page is inventoried as blocked (A1's population), disclosed in coverage, and gets a check-attempt row with a `navigation-timeout` failure class.
  - `broken-internal-link` and `hreflang-target-invalid` require a definite HTTP error status or an error page from the target. A timeout, a transient status or a blocked target makes the link undetermined, never broken.
  - Stored audits: normalization drops both rules for targets whose stored status is `error` with a timeout `crawlError`, and discloses those targets as not reached.
  - Tests: a crawl e2e with a fixture page that never fires `load`; normalize-links and normalize-hreflang unit tests with a timed-out target.
- **F2. A late off-site redirect removes the page from the content population.**
  - After the render settles, the landed host is tested again. A page that ended off-site is recorded as `skipped-external-redirect` with its target, and no content check runs on it.
  - Stored audits: a page whose stored Lighthouse `finalDisplayedUrl` is on another site is excluded from the content population by the same rule as A2, so every extractor ignores it.
  - Tests: a crawl e2e whose page redirects off-site by script after `load`; a normalize test on the stored shape.
- **F3. Only an indexable content page is public evidence.** A page counts as a pointer for `noindex-on-public-page` only when it is `visited`, not excluded, and not noindex itself. Tests: normalize-head-metadata unit tests with mutual hreflang between two noindex archives and with a stub pointer.
- **F4. NAP checks read the business's own contact details.**
  - The visible phone and postal code come from contact regions: `tel:` links, `address` elements, the header and footer, and the contact and legal pages. Numbers in editorial body text are ignored.
  - When no contact-region value is found, the check stays silent.
  - Tests: nap-consistency unit tests with a third-party number in an article and the business number in the footer.
- **F5. Lighthouse `robots-txt` defers to our fetch on any fetch failure.** E11 widens to every « Fetch of robots.txt failed » explanation (timeout, network error, 429, 5xx) when the crawler read `robots.txt` successfully. The finding copy states the Lighthouse explanation instead of assuming bad syntax. Tests: a normalize-lighthouse unit test with the timeout explanation.
- **F6. Identity ignores runtime state (Part C).**
  - For image rules (`image-alt`, `role-img-alt`, the alt-text heuristic), identity is the image resource URL, or the resource set when an element group has one.
  - For every selector-shape identity, classes that animation and player libraries toggle at runtime are removed before hashing. The removed set is explicit and measured, starting with `animated`, `go` and the `fadeIn*` family, `slower` and `slowest`, and `ytp-*-mode`.
  - Measure with slice 0 on villasfoch and atlantichotel, and keep the change only if occurrences are preserved.
  - Tests: normalize-axe unit tests with the villasfoch and YouTube shapes.
- **F7. A capped crawl cannot claim absence.** When the crawl omitted pages because of a page cap (`capOmittedPageCount > 0`, or an operator `maxPages`), every rule in E12's absence list is undetermined and goes to the manual checklist. Tests: a normalize test with a capped crawl.

#### Evidence F, fifth sweep (same eight audits, 2026-09-23)

| Defect | Measured |
|---|---|
| Unlinked sitemap pages dominate an audit | hotelchateauroyal: 106 of 143 analysed pages are `sitemap-only` with no inbound link. They are 35 theme demo rooms (`/accommodation/tokyo-junior-suite`, `amsterdam-luxury-suite-room`, `bali-beach-retreat`), 30 `accommodation-facility` archives, 14 `services`, 8 `hf_template_cat` and 7 `accommodation-category` archives, all `index, follow`. 15 findings exist only on these pages (9 serious), and they carry 3,791 of 11,723 occurrences. The report names demo rooms 66 times. The one finding that would say so, `sitemap-orphan-page`, was made manual by E12 because F1's timeouts left the link graph incomplete. On chicago, bellevue and hoteldegarlande the sitemap-only pages are real content (welcome booklet, news, services), so a blanket exclusion would be wrong. E9's type list does not fit either: the real suites live under the same `accommodation` type. |
| The scanner's stability verdict is ignored | Every one of the 197 measured pages carries a `performanceMeasurement.confidence`. 49 are `materially-contradictory-runs` (contradictory `cls` on 10 pages, `tbt` 17, `speedIndex` 15, `lcp` 4) and 106 more exceed the spread tolerance. The tolerances are marked `tolerances-uncalibrated` on all 197. Nothing in `core` reads the verdict, so every Lighthouse finding on these audits rests on a run the scanner itself called noisy. Examples: chicago `/` CLS runs 0.03, 0.81 and 0.81; `/en/page/faq-questions…` 0.03 and 0.79 (the stored run is 0.03); `/en/page/gallery…` 0.00 and 0.81 (stored 0.00). The 4 chicago `layout-shifts` findings (whole-`body` shifts) come from these runs, against a CrUX CLS p75 of 0.02. |
| Contrast on inactive calendar dates | hotelchateauroyal: the largest `color-contrast` finding (serious, 3,040 occurrences on 75 pages, 26% of the audit's occurrences) is entirely MotoPress Hotel Booking date cells marked unavailable (`mphb-not-available-date mphb-out-of-season-date`, title « Indisponible »), #777777 on white at 4.47:1. WCAG 1.4.3 sets no contrast requirement for text in an inactive user interface component. The identity also rests on a per-date class (`.dp1824984000000`). |
| Report totals mix two counts | On every report whose audit has embedded-frame findings, page 4 says « L'analyse a relevé 81 constats distincts, dont 38 de gravité critique ou sérieuse » (atlantichotel), and page 5 says « Le diagnostic a relevé 76 constats distincts, dont 33 critiques ou sérieux », then « en couvrent 26 sur 81 ». Same on bellevue (67/34 against 65/32), hotelchateauroyal (120/60 against 116/56) and chicago (61/16 against 60/15). `computeIntroFacts` (`report-intro.ts`) and `renderCoveredByPrioritiesNote` (`executive-summary.ts:195`) count `findings.length`; the counts sentence and the stats tile use `computeStatistics`, which applies Q1. |

Checked and clean in the fifth sweep: no rendered-title and head-title disagreement on any page. `jsonld-missing` and `canonical-missing` were confirmed by live probes of the villasfoch and capdantibes homepages (no `ld+json`, no canonical). The contrast samples are real apart from the calendar cells (Klaro consent buttons and site accent colours included). Findings pass the consistency invariants (no duplicate keys, element pages inside `pageUrls`, `perPage` matching `pageUrls`). Two back-to-back haaitza runs of the same 5 pages gave identical findings, apart from one minor Lighthouse diagnostic. Production state is unchanged (11 reports, no approval, preview or draft).

#### Operator question

- **Q4. Unlinked sitemap pages (decided 2026-09-23: the recommended option).** Recommended: keep analysing them, but when unlinked sitemap-only pages are a large share of the analysed population (a threshold measured on the stored audits), report them as one site-level finding (« le plan du site publie N pages qu'aucune page ne relie », with examples) and keep the findings that exist only on them in their own annex group, outside the grade and cover totals, as Q1 does for frames. Alternatives: (b) keep today's behaviour, where they count like linked pages; (c) inventory them without analysis. (c) loses real content on chicago, bellevue and hoteldegarlande.

#### Slices

- **F8. Unlinked sitemap pages (Q4 decided).** Implement the recommended option in `normalize.ts` and the statistics, and keep `sitemap-orphan-page` emitting once F1 has removed the timeouts that made it manual. Tests: a normalize test with a majority of unlinked sitemap pages; statistics and coverage tests.
- **F9. The stability verdict governs the lab findings.**
  - Calibrate `PROVISIONAL_STABILITY_TOLERANCES` on the 197 stored measurement sets, and record the tolerances and their source in trade-off 111.
  - A metric listed in `contradictoryMetrics` gives no metric finding and no element diagnostic (`layout-shifts`, `cls-culprits-insight`) for that page. It stays in the evidence as « mesure instable ».
  - The representative run is chosen per metric, never as one whole run whose other metrics disagree with the set.
  - Tests: normalize-lighthouse unit tests with a contradictory CLS set; a scanner unit test on calibrated tolerances.
- **F10. Inactive components are exempt from contrast.** A `color-contrast` node whose element is disabled, `aria-disabled`, or a date-picker cell marked unavailable or past (a confirmed vendor-class table, starting with MotoPress `mphb-not-available-date` and `mphb-past-date`) is dropped with a recorded count. Identity never uses per-date generated classes. Tests: normalize-axe unit tests on the stored cell shape.
- **F11. One count everywhere.** The intro, the priority-coverage sentence, the preview totals and any other « N constats » or « X sur Y » read from `computeStatistics` (first-party findings after Q1). Tests: a render test on an audit with frame findings, asserting that every count sentence agrees with the stats tile.

- **F10 reading confirmed by the operator (2026-09-23):** unavailable calendar dates are inactive components under WCAG 1.4.3 and are exempt.
- **F12. Untranslated page titles (operator request, 2026-09-23).** villasfoch: all 16 EN and ES pages keep their French titles (« Chambres & suites Bordeaux - Villas Foch » on `/en/rooms-and-suites` and `/es/habitaciones-y-suites`), and no rule detects it. Add a minor SEO rule for a page whose declared language (`htmlLang`, or its translation-cluster language) differs from its title's language, when a translation of the same page has a different title. The evidence is the page pair, not a language guess on one short string. It needs severity, French-first copy and rule coverage. Tests: a normalize unit test on the villasfoch pair shape.
- **F13. Title length up to 65 characters (operator decision, 2026-09-23).** 64 of the 123 flagged titles on the eight audits are 61 to 65 characters. Raise `TITLE_MAX_LENGTH` (`normalize-head-metadata.ts:179`) to 65, and replace the English copy « much shorter than 30 or longer than 60 » with the actual bounds. Check the French rule translation and remediation text (`rule-translations.ts`, `remediation/fr.ts`) for the same numbers. Tests: normalize-head-metadata unit tests at 65 and 66 characters.

#### Execution order for Part F (operator decision, 2026-09-23)

The hunt pauses here. Fix, rescan, then sweep again:

1. Client-visible falsehoods first: F1, F2, F3, F5, F11, then F4 and F6.
2. Rescan hotelchateauroyal and grandhotelchicago (an external operation, run on the operator's request), then run defect-hunt sweep 6 on the fresh data.
3. Then F9, F10, F8, F7, F12 and F13.

Each slice gets its focused tests and its own commit on main, not pushed. Bump `NORMALIZATION_FINGERPRINT` once for the normalization slices of a batch, before the rescan.

State (2026-09-23): F1 to F13 are committed and deployed. F1 `5b23f031`, F2 `719c7c73` (findings side; population side completed by G7), F3 `5b9be175`, F4 `1ed1f7aa`, F5 `14730eae`, F6 `5f41c5e2`, F7 `054f452c`, F8 `eed25234`, F9 `9b04a654` `d6188180` `e2ce6439`, F10 `99f0d533`, F11 `f1b4f9d2`, F12 `7ba6a5d4`, F13 `a1198440` `3d189671`, fingerprint `093fca00`.

### Part G: sixth sweep, on the post-F rescans (2026-09-23)

Sweep 6 read the operator's rescans of hotelchateauroyal (`2026-09-23T07-38-23Z`, then `2026-09-23T15-20-37Z` after G5) and grandhotelchicago (`2026-09-23T07-38-38Z`), their regenerated FR reports, and the anonymized reference audit built from chicago. It also covers the lacoorniche failure of the same evening. F1's goal held: hotelchateauroyal's first rescan visited 164 pages (143 before), with no navigation-timeout errors and no timeout-driven broken-link or hreflang finding.

#### Evidence G

| Defect | Measured |
|---|---|
| One booking button split by snippet truncation | chicago: one uncrawlable booking button produced 13 `crawlable-anchors` findings. The identity hashed the last attribute of a snippet axe had cut mid-attribute, and anchors were grouped by selector path rather than by tag and classes. |
| Overseas domain given metropolitan obligations | hotelchateauroyal (`.nc`): serious `accessibility-statement-missing` and `consent-mechanism-absent`, and a regulatory section claiming the EAA applies « probablement » with its fine, although the LCEN rule already treated overseas domains as a manual regime check. |
| Report regeneration read leftover page folders | hotelchateauroyal: re-normalizing read every folder under `pages/`, including 68 the manifest does not list, turning 106 findings into 136 (17 of them false `hreflang-no-return-link`). The change did not move the fingerprint, which covered only `core`, so stored findings were never marked stale. |
| Discovery-wave pages scanned, then dropped | hotelchateauroyal: the 68 folders were pages admitted by the discovery waves (links exposed only after hydration). They were fully scanned, about an hour of the run, but the manifest is written from the crawl's page list, so they were never analysed or disclosed. |
| Sitemap coverage ignored same-site redirects | lacoorniche (`2026-09-23T19-15-47Z`): the coverage gate stopped the audit (« the site appears to be rejecting the crawl ») with only 6 of 218 URLs failed. Since `570f340c`, a sitemap URL that redirects within the site is recorded as `redirect-interstitial` and its target is scanned, but the sitemap count only accepted the URL as listed: 94 of 195 counted, against 186 on the 17 September run. |
| Booking doorways counted as analysed pages | chicago: `/fr/book`, `/fr/book.html`, `/en/book`, `/en/book.html` carry no findings since F2, but stay `visited`. They count among the « 38 pages analysées » and the 17 Lighthouse-measured pages, although their runs measured `be.synxis.com`, so the medians covered 13 pages. |
| Reference audit counted a frame finding as first-party | The anonymized showcase replaced every element selector, which erased the frame boundary: 49 findings (12 critical or serious) against the source report's 48 (11). Its dates, lab-run wording and page paths were also inconsistent. |

#### Slices (all committed and deployed)

- **G1. Identity survives snippet truncation** (`26a84e0c`). The last attribute of a truncated snippet and quoted names are ignored; uncrawlable anchors are identified by tag and classes.
- **G2. Overseas domains** (`eb635516`, `42404adc`, `b111219c`). Statement and consent absence become the manual regime check; the obligation stage reports `overseas-jurisdiction-unverified` as undetermined; the report renders « Régime applicable à vérifier » with no obligation, deadline or fine, and the intro names none.
- **G3. Re-normalize only listed pages** (`b111219c`) and **fingerprint the page selection** (`d5f9335d`, adds `renormalize-audit.ts` to the fingerprinted paths).
- **G4. Wave pages join the manifest** (`fb7642d1`). Verified on the `15-20-37Z` rescan: 232 page folders, 232 listed, 0 unlisted; 209 visited, 122 findings.
- **G5. Sitemap coverage through a redirect** (`39f8d6e5`). A redirecting sitemap URL counts as reached when its target was visited. Crawl e2e fails without the fix. lacoorniche relaunched (`83d9bd44`).
- **G6. Reference audit** (`91c7b248`, `9a1cff30`, `41c7a147`). Imagery is checked on the published projection, frame boundaries, language segments and the release date are kept, and the build takes prose overrides bound to the example. Published `db0f228ddf92` (39 pages, 48 findings).
- **G7. Off-site Lighthouse landing is a redirect** (`a3f17ab8`, fingerprint `76977b1849cd203c`). In new scans and on refresh, a page whose Lighthouse run ended on another site is recorded as `redirect-interstitial` with that target. Committed, not yet deployed (held while haaitza and lacoorniche run; deploy with G8 and G9).

- **G8. Château Royal report read (`4a763782`, 209 pages)** (`35ee5c86`). The third-party note matches Q1 (frame-only findings are not counted; mixed sections say which are), « Autres constats » lists the headline population only (66, not 79), language coverage compares primary subtags (French was reported as never analysed beside a `/fr` redirect), and an overseas report no longer defines EAA, DGCCRF, Sirene or the transactional flow, nor mentions a SIREN « pour cette détermination ». Verified by re-rendering the fetched bundle locally: 55 pages. Committed, not yet deployed.
- **Territory rule** (trade-off 112). Operator decision 2026-09-23: France and the EU only. Hotels in French territories outside the EU are left out of the directory import and refused at scan launch. Château Royal (Nouméa) therefore leaves the Part D before/after set; its prospect, 2 audits, 224 findings, 5 analyses, 5 reports and directory entry were deleted from production on 2026-09-23 at the operator's request (one 12 KB orphan artifact folder, `2026-09-22T13-41-08Z`, remains).
- **G10. Merged findings show every element** (`f73d28ec`, fingerprint `6ac12a5f713d2d62`). The 1,881-occurrence `link-name` finding was verified on the server: four links on all 209 pages (menu trigger 209, TripAdvisor and Kayak badges 1,254 including carousel clones, back-to-top 209, footer logo 209), no double counting. Its 20 examples now alternate between them. Committed, not yet deployed.
- **G9. Full audits hold their server** (`e62a768d`). The queue lock takes the origin plus every resolved address, so haaitza and lacoorniche (same address) no longer run together. Committed, not yet deployed.

Still open from the Château Royal read: the model-written summary sentence « Les informations disponibles ne permettent pas de déterminer l'applicabilité de l'obligation » sits after the cookie sentence; Japanese URLs print percent-encoded; about half the analysed pages are theme demo content (Amsterdam, Bali, Tokyo rooms, `hf_template_cat`), which the report never says; the operator-entered SIREN question is moot under the territory rule.

Deterministic report copy fixed alongside (`9a1cff30`): the lab note no longer claims one run per page, « trackers » became « traceurs », critical rule names are quoted, the unstable-metric list uses short names, and the mixed-theme intro no longer reads « mélange plusieurs sujets urgents ».

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
- The homepage is scanned on every audit, and a homepage without a successful content check blocks the report (A9).
- Plugin objects, the `@id` false positive, robots pushback and lazy-load placeholders no longer produce findings, and absence rules never claim absence over blocked pages (E9 to E13).
- The Q1 to Q3 decisions are applied: third-party frame content, minor Lighthouse diagnostics, archive pages.
- Noindex pages carry no SEO content findings, and the coverage discloses them (E3).
- A metric is reported once, with field data ahead of lab when both exist, and no invalid lab run enters a median (E4, E5).
- The outreach preview cannot pick a proof from a blocked page or from a rule under correction (E6).
- Reports built before this plan on the contaminated audits cannot be sent (E7).
- A navigation timeout never yields a broken-link or hreflang-target finding, a late off-site redirect is never analysed, and noindex, NAP, robots-txt, state-class identity and capped-absence false results are gone (F1 to F7).
- Unlinked sitemap pages are handled per Q4, no lab finding rests on runs the scanner calls contradictory, inactive calendar cells are not contrast defects, every count in a report agrees with the stats tile, untranslated titles are reported, and titles up to 65 characters pass (F8 to F13).
- Truncated snippets, overseas domains, report refreshes, discovery-wave pages, redirecting sitemap URLs and booking doorways are handled as in Part G, and the reference audit mirrors its source report (G1 to G7).
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
| Third-party frame content handled per Q1 | `statistics.ts`, `grade.ts`, preview totals, `normalize-axe.ts` identity | Code, operator decision | Statistics, grade and collapse unit tests | Operator reads one report with an embed |
| Minor Lighthouse diagnostics handled per Q2 | `normalize-lighthouse.ts`, report performance section | Code, operator decision | Normalize and report unit tests | Operator reads one performance section |
| Archive pages handled per Q3 | `normalize.ts`, coverage disclosure | Code, trade-off 64 note | Collapse unit test | Operator reads pointfrance coverage |
| No SEO content finding on noindex pages | `normalize-head-metadata.ts`, `normalize-links.ts`, coverage | Code, copy | Unit and coverage tests; harness shows 0 SEO entries on noindex pages | none |
| One finding per metric; valid lab runs only | `normalize-lighthouse.ts`, CrUX normalizer, `lighthouse.ts` | Code, trade-off 111 | Unit tests; harness plausibility table | IndexedDB probe result recorded here |
| Preview never shows a false or blocked proof | preview evidence selection | Code | Selection unit tests | none |
| Contaminated reports refused | provenance fail-closed path, dashboard report list | Code or confirmed existing behaviour | Stale-fingerprint provenance test | Operator sees « À régénérer » on grand-hotel-opera and lacoorniche |
| B6 and B7 decided | `normalize-renderdiff.ts`, `obligation-basis.md` | Code, trade-off 3, basis entry | Unit tests | Operator reads the B7 basis entry |
| Homepage always scanned | `crawl.ts` language-home rule, dashboard diagnostics | Code | Redirect-to-language-root crawl e2e; anchor normalize test | grandhoteldesalpes and villasfoch rescans show homepage findings |
| Plugin objects not analysed | `links.ts`, `crawl.ts`, `normalize.ts` | Code, confirmed type list | Classification and normalize tests | none |
| Structured data judged like Google | `structured-data-extract.ts`, `structured-data.ts`, normalization re-test | Code | Yoast `@graph` unit test | Harness: pointfrance `structured-data-invalid` drops to real defects only |
| robots-txt pushback, absence over blocked pages, lazy placeholders | `normalize-lighthouse.ts`, site-level normalizers, `alt-text.ts` | Code, copy for `sitemap-lists-redirects` | Unit and e2e tests per rule | none |
| Translations paired without hreflang | `scanner/src/artifacts/manifest.ts` cluster builder | Code | Cluster unit test; harness shows multi-member clusters on the four audits | none |
| Timeouts are acquisition failures, not broken targets | `crawl.ts`, `normalize-links.ts`, `normalize-hreflang.ts` | Code | Never-loading fixture e2e; timed-out-target normalize tests | hotelchateauroyal rescan shows no timeout-driven link or hreflang findings |
| Late off-site redirects leave the population | `crawl.ts`, `normalize.ts` excluded set | Code | Late script redirect e2e; stored-shape normalize test | Harness: 0 off-identity Lighthouse runs on chicago and bellevue |
| Noindex evidence only from indexable content pages | `normalize.ts` `publicEvidenceForPage` | Code | Mutual-noindex and stub-pointer unit tests | none |
| NAP read from contact regions | `nap-consistency.ts` | Code | Third-party-number unit test | none |
| robots-txt fetch failures dropped | `normalize-lighthouse.ts` | Code, copy | Timeout-explanation unit test | none |
| Identity ignores runtime state classes | `normalize-axe.ts` identity | Code, explicit class list | Unit tests on villasfoch and YouTube shapes; slice 0 occurrences preserved | Harness per-rule table on villasfoch |
| Capped crawls claim no absence | `normalize.ts` absence gate | Code | Capped-crawl normalize test | none |
| Unlinked sitemap pages handled per Q4 | `normalize.ts`, statistics, coverage | Code, operator decision | Majority-unlinked normalize test; statistics test | Operator reads hotelchateauroyal coverage |
| Stability verdict governs lab findings | `normalize-lighthouse.ts`, scanner tolerances | Code, calibrated tolerances in trade-off 111 | Contradictory-set unit test | Harness: no lab finding on a contradictory metric |
| Inactive components exempt from contrast | `normalize-axe.ts` | Code, vendor-class table | Stored-cell unit test | none |
| One count everywhere | `report-intro.ts`, `executive-summary.ts`, preview totals | Code | Count-agreement render test | Operator reads one report with frame findings |
| Untranslated titles detected | `normalize-head-metadata.ts`, new minor rule | Code, copy, rule coverage | Page-pair unit test | none |
| Title length bound 65 | `normalize-head-metadata.ts`, rule copy | Code, copy | 65/66 boundary tests | none |
| Truncated snippets do not split one defect | `normalize-axe.ts`, `normalize-links.ts` | Code | Truncated-snippet and anchor-shape unit tests | chicago rescan: one uncrawlable-link finding per component (3 distinct) |
| Overseas domains get no metropolitan obligation | obligation stage, `legal-exposure.ts`, report intro, `obligation-basis.md` | Code, basis entry | `overseas-legal-exposure.test.ts`, intro test | Operator read the hotelchateauroyal regulatory section (2026-09-23) |
| A refresh reads only listed pages and is fingerprinted | `renormalize-audit.ts`, `scripts/fixture-fingerprint.mjs` | Code | Leftover-folder renormalize test | hotelchateauroyal report back to the listed population |
| Discovery-wave pages listed and analysed | `scan-site.ts` | Code | Wave-cascade unit test asserting crawl pages | hotelchateauroyal `15-20-37Z`: 0 unlisted page folders |
| Sitemap coverage counts redirects reached through their target | `crawl.ts` sitemap coverage | Code | Same-site-redirect crawl e2e | lacoorniche `83d9bd44` passes the coverage gate |
| Off-site Lighthouse landing leaves the population | `write-audit.ts`, `renormalize-audit.ts` | Code, fingerprint | Booking-doorway renormalize test | chicago refresh shows 34 analysed pages, 13 measured |
| Reference audit mirrors its source | `reference-audit.ts`, reference build CLI | Code, published release | Projection and override tests | Published `db0f228ddf92`, read page by page |
| Provenance consistent | `normalization-fingerprint.ts` | Fingerprint bump | `pnpm run check`, findings-provenance test | none |

## Verification

- Per slice: typecheck plus the slice's own tests, then a commit on main (not pushed).
- Before pushing: `pnpm run format`, `pnpm run check`, `pnpm run test:all`.
- End to end: rerun slice 0 on the 12 VPS audits and compare. Occurrences must be unchanged except for the listed false-positive removals, and there must be zero findings on non-content pages, zero off-identity Lighthouse runs, and no rule above 30%.
- Re-normalize one stored audit locally, render the PDF against a stubbed analysis, and read the statistics and annex as a client would.

### Recorded local verification (2026-09-22)

- `pnpm run check` passed on the current tree. Documentation, plan quality,
  formatting, ESLint, typecheck, architecture, and dead-code checks passed;
  dependency-cruiser retained nine known warnings and reported zero errors.
- Standalone `pnpm run test:all` passed: 526 test files passed and 28 were
  skipped; 5,462 tests passed and 245 were skipped. The expected 33 store
  integration files were skipped because local MongoDB at
  `mongodb://localhost:27018/odysseus_test` was unavailable.
- The local PDF acceptance artifact is
  `/tmp/plan075-report-workbench-fixed/report.pdf`: 39 pages, tagged A4,
  1,156,855 bytes. Pages 16 and 17 were inspected after the checklist table
  repair; `pdftotext -layout` contained no undefined, `NaN`, `Error`,
  replacement-character, `TODO`, or `TBD` tokens.
- Local dashboard A8 browser acceptance showed the French pushback warning and
  a `Relancer plus lentement` link prefilled with `delaySeconds=8` and
  `scanConcurrency=1`. This is local UI acceptance; it is not claimed as a
  production La Corniche rehearsal.
- Production harness closure remains open until every required target has a
  terminal artifact or an explicit evidence-backed refusal/coverage
  disposition. The execution ledger below is authoritative for that state.

## Rescan after deploy (operator decision, 2026-09-22)

Once this plan is deployed, rescan all 12 stored full audits instead of only re-normalizing them. That puts every audit on the same code and gives clean Lighthouse measurements.
1. One small site first, as an end-to-end check.
2. Then grand-hotel-opera, atlantichotel, hoteldegarlande, grandhoteldesalpes and villasfoch (the last two never had their homepage scanned).
3. Then lacoorniche on its own, slowed down (A8).
4. Then the rest, spaced out.

Reports are regenerated only when needed, because regeneration runs the paid AI passes.

Until then, the stored grand-hotel-opera and lacoorniche PDFs (including the finalized lacoorniche PDF from 2026-09-21) and the approved pointfrance report are not sent to anyone (E7).

## Production rescan execution ledger

This ledger is updated during the operator-authorized post-deploy rescans. A
diagnostic pilot with `--max-pages` is explicitly not a full-audit result and
is never used as closure evidence. Production audits are serialized on the
single VPS; local tests and report inspection may run in parallel.

| Site | Artifact / state | Coverage and quality result | Closure state |
|---|---|---|---|
| Cap d’Antibes | `/data/artifacts/capdantibes-beachhotel.com/2026-09-22T06-29-34Z` | 21 inventoried / 21 content-complete; 48 findings / 1,326 occurrences; 0 non-visited findings; 0 challenge/error pages; 0 off-identity Lighthouse; 2 valid / 0 invalid lab runs; concentration guard green; occurrences preserved | Evidence complete |
| Grand Hôtel Opéra | `/data/artifacts/www.grand-hotel-opera.com/2026-09-22T06-02-16Z` | 1 inventoried challenge-only page; 0 findings; 1 challenge/error page; no analyzed hotel content; correctly refused rather than counted as a clean defect scan | Evidence complete as refusal, not a passing analyzed audit |
| Atlantic Hotel | `/data/artifacts/www.atlantichotel.fr/2026-09-22T06-48-32Z` | 124 inventoried / 114 visited; 80 findings / 4,943 occurrences; 10 redirects/errors disclosed; 0 non-visited findings; 0 off-identity Lighthouse; 13 valid / 0 invalid lab runs; concentration guard green; CLI remains blocked by environment-unapproved and two partial pages | Evidence complete with coverage blocker |
| Hôtel de Garlande | `/data/artifacts/www.hoteldegarlande.com/2026-09-22T08-15-54Z` | 61 inventoried / 48 content-complete; 58 findings / 2,299 occurrences; 13 redirects/errors disclosed; 0 non-visited findings; 0 off-identity Lighthouse; 34 valid / 0 invalid lab runs; concentration guard green; CLI remains blocked by environment-unapproved and unresolved-material-gap | Evidence complete with coverage blocker |
| Grand Hôtel des Alpes | First `/data/artifacts/grandhoteldesalpes.com/2026-09-22T09-07-46Z`; retry `/data/artifacts/grandhoteldesalpes.com/2026-09-22T09-33-12Z` | Both attempts reached 150 visited pages with 40 sitemap-only pages left and were rejected by the coverage gate; the retry used an explicit 250-page diagnostic cap and is not closure evidence | Rejected; no further identical retry |
| Villas Foch | `/data/artifacts/www.villasfoch.fr/2026-09-22T10-24-41Z` | 32 inventoried / 25 content-complete; 56 findings / 1,689 occurrences; 7 non-content pages disclosed; 0 non-visited findings; 0 challenge/error pages; 0 off-identity Lighthouse; 16 valid / 0 invalid lab runs; concentration guard green; CLI blocked by environment-unapproved, temporal-drift, unresolved-material-gap | Evidence complete with coverage blocker |
| La Corniche | 2026-09-23: `2026-09-23T19-15-47Z` stopped by the coverage gate through the G5 regression, not by the site (2 transient 503s, 6 of 218 failed); relaunched as `83d9bd44` at 10 s after G5. Earlier: full attempts at `2026-09-22T10-58-50Z` and `2026-09-22T11-39-50Z`; pilots at `2026-09-22T11-42-41Z` and `2026-09-22T11-50-07Z` | The uncapped attempts and 2/10-page and 2-page 40-second pilots produced only scope evidence before the diagnostic watchdog. One pilot ended during Docker container replacement; the replacement was verified healthy and `OOMKilled=false`. No challenge conclusion is claimed and no pilot is closure evidence | Operator-approved coverage blocker pending a materially different run |
| Haaitza | 2026-09-23: full audit `a80110ab` running at 10 s, concurrency 1, with Plan 076 pacing (periodic 503s, recovered each time). Earlier: full audit session 34523; pilot `/data/artifacts/haaitza.com/2026-09-22T11-59-07Z` | The 2-page 40-second pilot acquired the root with HTTP 200, no rendered challenge markers, axe and head metadata. The full uncapped pass uses 40,000 ms delay and concurrency 1; final artifact and harness result pending | In progress |
| Grand Hotel Chicago | Rescan `/data/artifacts/grandhotelchicago.paris/2026-09-23T07-38-38Z` (the 22 September artifacts below were deleted as superseded on 2026-09-23): 38 visited, report 48 findings / 11 critical or serious; the 4 booking doorways still count as pages until G7 is deployed. Earlier: complete `/data/artifacts/grandhotelchicago.paris/2026-09-22T20-14-57Z` | 38 inventoried / 38 visited; 61 findings / 1,155 occurrences; 0 non-visited findings; 0 challenge/error pages; 4 off-identity Lighthouse runs (booking stubs, F2); 13 valid / 4 invalid lab runs; concentration guard green. Report step failed on the `occurrence(s)` render lint, since fixed; report regenerated 2026-09-23 | Evidence complete with F1 to F7 defects open |
| Grand Hôtel Bellevue | Interrupted `2026-09-22T13-40-59Z`; complete `/data/artifacts/www.grandhotelbellevue.com/2026-09-22T20-14-57Z` | 84 inventoried / 72 visited; 67 findings / 1,898 occurrences; 12 redirects disclosed; 0 non-visited findings; 0 challenge/error pages; 4 off-identity Lighthouse runs (booking stubs, F2); 25 valid / 4 invalid lab runs; concentration guard green. Report step failed on the same render lint; report regenerated 2026-09-23 | Evidence complete with F1 to F7 defects open |
| Château Royal | Rescans `2026-09-23T07-38-23Z` (164 visited, 0 navigation timeouts, report 83 findings after G3) and `/data/artifacts/www.hotelchateauroyal.nc/2026-09-23T15-20-37Z` (209 visited, 122 findings, 0 unlisted folders after G4; report not yet read). The 22 September artifacts were deleted as superseded. Earlier: complete `/data/artifacts/www.hotelchateauroyal.nc/2026-09-22T21-03-54Z` | 181 inventoried / 143 visited; 120 findings / 11,723 occurrences; 18 navigation timeouts (F1), 15 redirects, 5 external redirects disclosed; 0 non-visited findings; 1 off-identity Lighthouse run; 80 valid / 1 invalid lab runs; concentration guard green. Report step failed on the same render lint; report regenerated 2026-09-23 | Evidence complete with F1 to F7 defects open |
| Point France | Partial `/data/artifacts/www.hotelpointfrance.com/2026-09-22T13-41-28Z` | Accidental runner child was interrupted before `manifest.json`; directory contains only `audit-scope.json` and 0 `scan.json` files. Pre-075 baseline remains diagnostic only | Interrupted; rerun required, no closure evidence |

### Consolidated harness comparison (working closure table)

This is the live before/after matrix for the twelve stored audits. The
pre-075 column is the representative stored scan; a pending or rejected
post-075 entry is intentionally not treated as a passing audit. The matrix is
complete only when every target has either a verified post-075 artifact or an
explicit, evidence-backed refusal/coverage disposition recorded above.

| Site | Pre-075 stored findings / occurrences | Post-075 artifact or state | Post-075 findings / occurrences | Integrity and coverage state |
|---|---:|---|---:|---|
| Cap d’Antibes | 93 / 1,763 | `/data/artifacts/capdantibes-beachhotel.com/2026-09-22T06-29-34Z` | 48 / 1,326 | Guard green; 0 non-visited, 0 challenge/error, 0 off-identity lab; occurrences preserved |
| Grand Hôtel Opéra | 78 / 4,549 | `/data/artifacts/www.grand-hotel-opera.com/2026-09-22T06-02-16Z` | 0 / 0 | Challenge-only refusal; no analyzed hotel content, so not a passing analyzed audit |
| Atlantic Hotel | 197 / 21,441 | `/data/artifacts/www.atlantichotel.fr/2026-09-22T06-48-32Z` | 80 / 4,943 | Guard green; 10 redirects/errors disclosed; 0 non-visited, 0 off-identity lab |
| Hôtel de Garlande | 77 / 2,562 | `/data/artifacts/www.hoteldegarlande.com/2026-09-22T08-15-54Z` | 58 / 2,299 | Guard green; 13 redirects/errors disclosed; 0 non-visited, 0 off-identity lab |
| Grand Hôtel des Alpes | 76 / 6,787 | Two post-075 attempts rejected by coverage gate | — | No closure artifact; both attempts stopped with 40 sitemap-only pages remaining |
| Villas Foch | 61 / 2,083 | `/data/artifacts/www.villasfoch.fr/2026-09-22T10-24-41Z` | 56 / 1,689 | Guard green; 7 non-content pages disclosed; 0 non-visited, 0 off-identity lab |
| La Corniche | 110 / 7,638 | Full runs and pilots did not reach a closure artifact | — | Coverage/challenge disposition unresolved; no pilot used as closure evidence |
| Haaitza | 73 / 4,496 | Full uncapped audit session 34523 active | — | 40,000 ms delay, concurrency 1; final artifact and harness result pending |
| Grand Hotel Chicago | 74 / 1,427 | `/data/artifacts/grandhotelchicago.paris/2026-09-22T20-14-57Z` | 61 / 1,155 | Guard green; 0 non-visited; 4 off-identity lab runs from late off-site stubs (F2) |
| Grand Hôtel Bellevue | 88 / 2,034 | `/data/artifacts/www.grandhotelbellevue.com/2026-09-22T20-14-57Z` | 67 / 1,898 | Guard green; 0 non-visited; 4 off-identity lab runs from late off-site stubs (F2) |
| Château Royal | 157 / 15,862 | `/data/artifacts/www.hotelchateauroyal.nc/2026-09-22T21-03-54Z` | 120 / 11,723 | Guard green; 0 non-visited; 18 timed-out pages reported as broken targets (F1) |
| Point France | 315 / 35,281 | Full post-075 rescan pending | — | Pre-075 baseline only |
