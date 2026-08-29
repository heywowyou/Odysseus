# Trade-offs and decision history

This doc holds the full write-ups behind Odysseus's "do not silently
reverse" guardrails. `CLAUDE.md` holds only the compact index and the one
governing sentence per entry; the incident narrative, root-cause evidence,
and rejected alternatives for each one live here. Numbering matches
CLAUDE.md's index exactly, so a cross-reference like "per trade-off 24"
resolves to the same entry in both places.

## Non-negotiable rule 5 amendment (2026-08-24)

**Amended 2026-08-24, explicit operator decision.** This rule used to
also require a hard page cap, and `DEFAULT_MAX_PAGES` was 20. A real
Domaine Lagnonu audit showed the cost: a 65-page site was reported as
a 43-page one, with the entire English and Spanish sites missing and
nothing in the report disclosing it, on a deliverable sold as covering
the client's site. A page limit is now opt-in (`--max-pages`,
`MAX_PAGES`) and off by default.

Politeness is unchanged and is carried where it always actually was:
the per-request delay, the per-origin pacing in every scan lane, the
robots.txt `Crawl-delay` that still wins when stricter, and the
per-page timeout. A page cap limited total work, not request rate.

The risk this knowingly accepts is an effectively unbounded URL space
(calendars, faceted filters, session ids), which nothing currently
detects. Crawl a site of unknown shape with an explicit `--max-pages`
until a trap detector exists. Do not silently reintroduce a default
cap instead; that decision is the operator's.

## Known trade-offs, do not silently reverse

1. **Lighthouse's `accessibility` and `best-practices` categories emit no
   findings**, decided in Milestone 4. `accessibility` is axe-core
   underneath, and axe already scans WCAG 2.2 AA directly against the same
   page, so emitting both produced duplicate findings with two different
   severity mappings for the same rule. `best-practices` bundles unrelated
   concerns (HTTPS usage, deprecated APIs, console errors, image aspect
   ratio) that have no correct home among the four locked
   `FindingCategory` values; forcing one onto a client-facing report
   section mislabels it. Both category scores are still recorded per page
   in the audit manifest (`ManifestPageEntry.lighthouseExcludedCategoryScores`),
   so the numbers are not lost, only unused for findings.

   Category-level exclusion is not sufficient on its own. Lighthouse files
   some accessibility audits under `seo` as well, so `image-alt` arrived
   through the allowlisted path and duplicated axe's own `image-alt` with
   a different severity. `LIGHTHOUSE_EXCLUDED_AUDITS` in `constants.ts`
   suppresses individual audit IDs that axe already reports, regardless of
   which category surfaces them. Add to that list only rules whose overlap
   has been confirmed against real scanner output, not assumed.

   This is why `heading-order` (documented in
   `docs/manual-accessibility-checklist.md` as a confirmed axe detection
   gap, tagged best-practice rather than WCAG) remains a real gap rather
   than something a future session should "fix" by re-adding Lighthouse's
   accessibility category. `best-practices` gets a deliberate per-audit-id
   mapping table in Milestone 8, alongside the custom checks. Do not
   re-enable either category for finding emission without that argued
   change.

2. **Screenshot pruning has one canonical implementation.**
   `packages/scanner/src/artifacts/prune-screenshots.ts`'s
   `selectPageDirsToKeep` / `pruneScreenshots` is the single place that
   decides which page screenshots survive a scan (always the homepage,
   plus the top N pages by render-diff `missingPercent`). Report
   generation (Milestone 6) must import and call these functions rather
   than reimplementing the selection logic, or the report will eventually
   ask for a screenshot the scan already deleted.

   The rationale is data minimisation, not disk space. Full-page
   screenshots of a client site incidentally capture personal data, and
   not capturing is a stronger position than deleting later.

3. **Dedupe and aggregation are two separate passes, deliberately.**
   `computeDedupeKey` (`source|ruleId|selector`) collapses the _same
   selector across pages_, so a footer contrast failure appearing on
   eleven pages becomes one finding with a count.
   `aggregateSamePageOccurrences` collapses _different selectors within a
   single page_ for the same source and rule, because axe emits distinct
   positional selectors for rules like `link-in-text-block`, and sixty
   nine instances of one defect on one page otherwise become sixty nine
   separate findings each with `occurrences: 1`.

   Aggregation runs only on fine groups confined to exactly one page.
   Multi-page groups pass through untouched with their original
   `dedupeKey`. Do not merge the two passes: they use different keys for
   different reasons, and cross-run identity for the monitoring tier is
   `dedupeKey`, so it matters which pass produced it.

   Selector normalization was considered and rejected. Stripping
   `:nth-child()` would merge genuinely distinct elements, and a real
   scan confirmed that stable selectors dedupe correctly without it.

4. **Non-HTML resources are never crawled as pages.** A real WordPress
   site linked four `wp-content/uploads/*.jpg` attachment URLs from its
   gallery, and each one cost a full render, an axe pass, and a Lighthouse
   pass, producing findings against binary content. Links are dropped by
   extension before being enqueued (`links.ts`), with a Content-Type check
   in `crawl.ts` as a fallback for URLs whose extension reveals nothing.
   Extension-dropped URLs never appear in the manifest at all; only the
   Content-Type path records `skipped-non-html`.

5. **Analyses are inserted, never upserted.** `persistAudit` upserts by
   `auditId` because an audit re-run under the same ID is a retry of the
   same work. `persistAnalysis` inserts, because an analysis re-run is
   not: one per language, and again after a prompt change, are all
   legitimately distinct documents. Each records its model identifier and
   temperature, for the same provenance reason the manifest records
   scanner versions.

6. **The LLM is not called when a scan has not produced enough to justify
   it**, decided 2026-08-03. Two gates: a conservative audit fallback
   (falls back to a static template only when there is no critical or
   serious finding and fewer than 5 moderate findings) and a stricter
   prospecting worthiness gate before spending a call on outreach
   generation (at least one critical finding, or two serious, or a page
   with render diff missing 50 percent or more). Full thresholds and
   reasoning in `docs/llm-layer-rules.md` section 10. Both gates score
   findings using the existing `SEVERITY_ORDER` weights rather than a new
   scale, and count distinct findings rather than occurrences. Do not
   remove either gate to "always get a full analysis" without revisiting
   the reasoning there first.

7. **`packages/llm/src/structure-output-schema.ts` and
   `writing-output-schema.ts` are hand-mirrored copies of their
   respective non-locked Zod schemas**, needed because the SDK's
   `responseFormatFromZodObject` helper requires zod v4 and this
   workspace is zod v3. Each is an API shape hint, never the validation
   authority: `structurePassOutputSchema.parse()` /
   `writingPassOutputSchema.parse()` run explicitly on every response.
   A test asserts each mirror and its Zod schema describe the same
   shape so drift fails loudly. If `core` ever moves to zod v4, delete
   the mirrors and use the helper.

8. **Findings the LLM cannot give good advice about are diverted before
   the structure pass, not passed in with a prompt instruction to be
   careful**, decided during the report v2 refactor (2026-08-07) after a
   real second-client scan (haaitza.com) put SEO advice about indexing a
   third-party Facebook embed at rank 1 of the whole report.
   `packages/llm/src/diversion.ts`'s `partitionFindings` removes findings
   confined entirely to wrapper pages (`missingPercent >= 95`) or to a
   `noindex`-legal-page URL pattern before they ever reach
   `buildStructureInput`. Diverted findings are not dropped: they render
   in a fixed-copy "Observations" section in the report template, built
   from the same `partitionFindings` call against the same
   `findings.json` and `manifest.json`, so the report's account of what
   was diverted can never drift from what the model actually saw.
   `packages/report` depends on `packages/llm` specifically for this
   function; that dependency edge exists so there is exactly one
   implementation of the diversion rule, not two hand-synced ones. Do not
   revert to explaining these findings to the model instead of filtering
   them, and do not duplicate the predicate in `packages/report` instead
   of importing it. Similarly, `legalRelevance` on an accessibility theme
   is built by `packages/llm/src/legal-relevance.ts` from a code-owned
   WCAG criterion name table, never written by the writing pass (which
   has no field for it at all) — the model choosing zero words of a legal
   claim is the point. Full defect list and reasoning in
   `docs/report-v2-refactor.md`.

9. **`packages/report`'s template is hand-maintained CSS, not Tailwind**,
   since the 2026-08-07 refactor. The compiled-Tailwind approach from
   milestone 6 is gone: no `tailwind-input.css`, no `build:css` script, no
   `tailwindcss`/`@tailwindcss/cli` dependency. `report.css` is written
   directly. It went through two dark-theme generations: a
   GlassWire-inspired reskin on 2026-08-07 (`docs/odysseus-project-brief-v2.md`,
   "Post-7.1: scan concurrency and reskin"), then a full retokening on
   2026-08-16 to match the full-audit and outreach-preview designs. The
   readable flattened sources now live at
   `docs/design/report-mockup-standalone.flat.html` and
   `docs/design/report-mockup-preview.flat.html`; they supersede the opaque
   self-decoding bundles and generated PDFs that were removed in the docs
   consolidation. If the designs are revised, re-derive tokens from their
   literal source CSS, not from pixel sampling or assumption. Do not reintroduce a
   Tailwind build step for this package without first checking whether
   `report.css`'s existing design system (color tokens, badge/scale/tile
   components, print rules) still covers the need; it was chosen
   specifically because re-deriving that design in a utility
   framework risked drifting from the one version that was actually
   print-tested.

10. **Scan-phase concurrency runs pages in lanes, not the crawl.** Shipped
    2026-08-07. The crawl stays sequential; render-diff, axe, and Lighthouse
    now run across `SCAN_CONCURRENCY` lanes (default 3) instead of one page
    at a time, with the per-origin politeness delay unchanged in every lane,
    per the "concurrency, not a shorter delay" rule already in the project
    brief. Lighthouse calls are additionally serialized behind a small
    in-process queue even though the lanes themselves run in parallel:
    concurrent `lighthouse()` calls collide on Node's process-global
    `perf_hooks` marks, confirmed 100% reproducible against the spa-demo
    fixture, and unrelated to the CDP debug port each lane already gets its
    own connection to. Do not remove that serialization queue to "let
    Lighthouse run in the lanes too" without re-confirming the collision is
    gone; `scanConcurrency` is recorded on `AuditConfigSnapshot` for the
    same provenance reason other scan config fields are.

11. **Argument B (the legal content) is a deterministic splice, in both
    the report and outreach, never model prose**, decided 2026-08-15
    alongside `docs/obligation-basis.md`, `docs/operator-obligations.md`,
    and `docs/outreach-rules.md`. `assessObligations()` produces the
    criteria, the company's registry data, and the case-law position as
    fixed text; the compliance section of the report and milestone 9c's
    outreach draft both splice that text in unmodified rather than asking
    the model to write around it carefully. A validator confirms the
    spliced block is byte-identical to what `assessObligations()`
    produced before a report renders or a draft is created; a mismatch is
    discarded, not repaired, on the same reasoning as the
    language-compliance guard elsewhere in the LLM layer. Do not revert
    to a prompt instruction telling the model to "be careful" with legal
    claims instead of withholding the pen entirely; that was tried once
    already for wrapper-page and noindex findings (trade-off 8) and
    failed for the same reason it would fail here.

12. **Single-tier commercial model: no paid screening tier, flat full-audit
    price, free outreach preview instead**, decided 2026-08-16
    (`docs/offer-positioning.md`). The paid EUR 290 screening tier from
    milestone 8 is dropped entirely, not narrowed or renamed. The full
    audit is now the only paid deliverable, at a flat, published price
    (EUR 1,600 HT as of trade-off 13 below; originally EUR 300 HT on
    2026-08-16), replacing the risk-banded EUR 1,200 to 1,900 range. `ReportTier`
    is gone from `packages/report` (`renderHtml`/`generateReportPdf` take
    no tier argument, there is exactly one report body), from
    `packages/store` (`ReportDocumentFields` has no `tier` field; historical
    documents still carry one on disk, simply unread), from
    `packages/interface` (no `?tier=` query param, no tier-labeled download
    links), and from `packages/cli` (no `--tier` flag).

    In its place, a free, pre-purchase **outreach preview** document is
    sent to cold prospects (milestone 9c, `docs/outreach-rules.md`). It is
    not a lighter tier of the full report and must not be built as one: it
    has its own content rules, and in particular never contains selectors,
    finding IDs, or exact page locations, the way the old screening tier
    did. Give it its own render path rather than a new branch on
    `renderHtml`. It is also a likely first-contact artifact under RGPD
    article 14, so it must carry the same identity/data-origin/purpose/
    opt-out disclosures `docs/outreach-rules.md` section 7 requires of any
    first-contact message, not assume an accompanying email carries them.

13. **Full audit price raised from EUR 300 HT to EUR 1,600 HT**, decided
    2026-08-16, same day as trade-off 12 (`docs/offer-positioning.md`,
    canonical pricing source). Pricing decision only, not a scope change:
    the product and deliverables are unchanged; milestone 8.5 will add
    substance to justify the tier separately. Reasoning: EUR 300 HT read
    as a comparison-shopping price rather than a considered one and
    undercut every published market floor by enough to raise doubt about
    quality instead of removing it. The free outreach preview introduced
    by trade-off 12 now carries the trust-building, low-risk
    first-contact job the low flat price was originally covering, so the
    paid tier no longer needs to be priced as an entry point; market-rate
    credibility is the goal instead. The Stripe payment link amount is
    updated separately by hand, not by code or by this change. Current-
    price mentions in `docs/odysseus-project-brief-v2.md` were updated to
    EUR 1,600 HT along with the canonical source; only the "why the
    prices are not being raised" reasoning in `docs/offer-positioning.md`
    section 1 is deliberately left describing the superseded EUR 300 HT
    figure, kept as history of how that number was reached, not the
    current price.

14. **Milestone 8.5a's SEO/GEO checks add a new `geo` `FindingCategory`
    value rather than folding those checks under `seo`**, decided
    2026-08-16 alongside the milestone itself. AI-answer-engine
    extractability (schema/entity completeness, llms.txt, FAQ markup) is
    a distinct audience from search-ranking signals, and a future report
    session should be able to give GEO its own section without first
    having to split rule IDs back out of `seo` by hand. Purely additive
    to the locked `findings.ts` contract; nothing existing was removed or
    renamed. As of this milestone, `geo` findings exist in
    `findings.json` but are not yet in `packages/report`'s
    `CATEGORY_ORDER` (`findings-appendix.ts`), so they do not render in
    the PDF appendix - deliberate for this detection-only milestone, but
    milestone 8.5b/8.5c must decide how they are actually presented
    rather than leave them silently unrendered. `categoryLabels.geo`
    exists in both language string files only so the type stays total
    over `FindingCategory`; it is unused until `CATEGORY_ORDER` changes.

    "Citability of factual statements" (is a sentence phrased in a way
    an AI engine would cite) was explicitly scoped out of this milestone
    rather than approximated with an invented heuristic: judging phrasing
    is a semantic judgment, not a pattern match, and this milestone's
    hard rule (deterministic scanners detect, LLM only explains) forbids
    reaching for an LLM call to decide it. Do not add a "citability
    score" or similar heuristic without revisiting this; the intended
    path is 8.5c's LLM layer explaining citability from already-detected
    facts, not a new scanner check inventing a proxy for it.

    `robots.ts`'s `isAllowedByRobots` was refactored to be built on a new
    exported `findBlockingPattern`, which returns *which* Disallow
    pattern wins for a path rather than only whether the path is allowed
    - needed so `robots-disallow-broad` (packages/scanner/src/crawl.ts)
    can tally how many discovered pages each pattern actually blocks.
    Behavior of `isAllowedByRobots` itself is unchanged; the existing
    test suite for it passes unmodified against the refactor.

15. **Milestone 8.5b's business-impact reference-stat table lives in
    `packages/core/src/reference-stats/` as compiled TS constants
    (`stats.ts`), not JSON**, decided 2026-08-16. This mirrors
    `compliance/regimes.ts` (narrative, editor-curated content reviewed
    in a diff) rather than `prospecting/config/naf-sector-allowlist.json`
    (operator-editable, versioned config read via `readFileSync` at
    runtime) - a citation's exact wording is content someone edits
    deliberately, not a knob an operator flips. The table encodes only
    the rows `docs/research/Odysseus Business-Impact Statistics
    Reference Database Accessibility SEO & GEO.md` tags "SAFE TO CITE BY
    NAME," plus, for GEO only, its "emerging / cite only as early data
    suggests" tier; every row that doc marks "directionally useful but
    not citable" or "not citable" is skipped entirely, not encoded
    behind a flag. "Web Standards Commission" (wsc.us.org) and its
    $13-18bn figure are excluded by omission - there is no row anywhere
    in the table referencing it, and `stats.test.ts` asserts no citation
    or source text contains its name, as a regression trip-wire against
    a future well-meaning re-add. Princeton's GEO visibility paper
    (Aggarwal et al., ACM KDD 2024) is tagged `confidence: 'emerging'`
    here despite the source doc itself calling it "well-established,"
    because it measures visibility within a controlled benchmark, not
    revenue, and the doc's own recommendation is to quarantine every
    GEO-adjacent number as "Emerging Research" until GEO acquires a
    peer-reviewed revenue study; that is the only condition under which
    this tag should change. Sector detection for stat selection
    (`reference-stats/sector.ts`, NAF prefixes `55.`/`56.` to
    `hospitality`) is a small table deliberately independent from
    `prospecting/config/naf-sector-allowlist.json`, which
    `docs/prospect-qualification.md` section 4 forbids citing to a
    prospect as evidence of anything - conflating the two would let an
    edit made for prospecting recall silently change what a paid report
    cites, or vice versa. Several source-doc years are left unset
    (`year?: number`, not guessed) for sources the doc itself calls
    archived or undated, such as the W3C-documented Legal & General case
    study - inventing a year would be exactly the kind of unchecked fact
    rule 1 forbids.

    This milestone is data and pure functions only: `selectReferenceStats`
    and `estimateRevenueImpact` are not called from anywhere yet.
    `packages/llm`'s prompts and `build-input.ts`, `packages/report`'s
    templates, and `packages/interface`'s pipeline are all untouched;
    `geo` findings still do not render in the PDF appendix (unchanged
    from trade-off 14). Wiring this table into the LLM/report layer,
    including deciding whether the model may select which stats appear
    per theme or whether selection stays fully deterministic the way
    `legalRelevance` already is, is milestone 8.5c's job, kept separate
    on purpose the same way 8.5a stayed detection-only.

16. **Milestone 8.5c wires 8.5b's reference-stat table into the paid audit
    report with fully deterministic selection**, decided 2026-08-17: the
    report calls `selectReferenceStats(theme.category, sector)` directly
    at render time (`packages/report/src/template/sections/themes.ts`),
    the same way `legalRelevance` is built in code rather than by the
    model - no change to the locked `llm-output.ts` `Theme` schema, no
    prompt change, no new invented-reference guard. `Theme.category`'s
    schema has no `'geo'` option at all, so LLM-synthesized themes can
    never be geo; a geo citation only ever appears in the findings-
    appendix's geo section (`findings-appendix.ts`), never in the themes
    section. `'rendering'` themes get no citation: the stat table has no
    rows for that category, an absence, not a bug. Each citation is shown
    exactly once per category, attached to that category's
    highest-priority theme (`themes.ts`'s `citationByRank`), not repeated
    on every theme of the same category.

    **Revised 2026-08-17** (report-feedback-haaitza.md B1, same-day
    follow-up): this paragraph originally also said `'performance'`
    themes get no citation, same reasoning. That was true only because
    three Deloitte page-speed/conversion stats were miscategorised as
    `['accessibility', 'seo']` in `stats.ts` to give them a category slot
    to attach to at all - which is exactly why a real report cited a
    page-speed statistic under a "Vidéos sans sous-titres" priority and
    a "Liens non explorables" priority, twice, and never under the actual
    performance priority. Fixed by retagging those three rows to a new
    `'performance'` `StatCategory` and extending `themes.ts`'s
    eligibility to match; `'rendering'` remains uncited, genuinely absent
    from the table. Citation selection also gained a document-wide
    `citedStatIds` Set (`render-html.ts`, threaded into both `renderThemes`
    and `renderFindingsAppendix`), since the original per-section dedupe
    could not catch the same statistic being independently selected by
    two different sections.

    Client sector reaches the report through a new
    `ObligationAssessment.sector?: StatSector` field
    (`packages/core/src/types/compliance.ts`, not a locked contract),
    spliced on by `packages/interface/src/pipeline/obligation-stage.ts`'s
    `withSector` from the same `OperatorProfile.naf` it already resolves
    via Sirene - no second lookup. Storing the derived two-value sector
    rather than the raw NAF code is a deliberate data-minimisation
    choice. `geo` was added to `design-tokens.ts`'s `CATEGORY_ORDER`/
    `CATEGORY` (closing trade-off 14's "not yet rendered in the PDF
    appendix" gap for the ordinary per-finding listing too, not only
    citations), using `nocturne.css`'s existing, previously-unused second
    accent hue scale (`--color-accent-2-*`) rather than an invented hex,
    since geo postdates the canonical mockups and there is no mockup
    entry to re-derive a color from; `render-html.axe.test.ts` passing
    against the real sas-fernande.fr fixture after this change is the
    same WCAG 1.4.3 confirmation the original accessibility-tag color
    swap relied on, not an assumption that the parallel scale is
    automatically compliant.

    The reference-stats module remains report-only. Milestone 9c's
    outreach generation (not yet built) must never import
    `@odysseus/core`'s `selectReferenceStats`/`REFERENCE_STAT_TABLE` -
    `docs/llm-layer-rules.md` section 11's "No statistics" rule for
    outreach is deliberately stricter than the report path (a report has
    a methodology section and a paying client, an email has neither).
    `estimateRevenueImpact` remains unwired in both paths; a numeric
    client-facing revenue figure was deliberately deferred rather than
    riding along with citation wiring, since turnover is only
    inconsistently available from `ObligationAssessment`'s basis facts.

17. **No annex group in the PDF report is ever forced onto one page with
    `break-inside: avoid`, regardless of how few findings it has**,
    decided 2026-08-19 during the La Corniche feedback-fix session
    (the 2026-08-19 La Corniche review, retained in Git history, item 1.6's
    follow-up write-up). `packages/report/src/template/sections/findings-
    appendix.ts` used to apply the `.appendix-group` CSS class (paged.css,
    `break-inside: avoid`) to any rule group at or under
    `APPENDIX_GROUP_KEEP_THRESHOLD` (6) findings, on the reasoning that
    forcing a *large* group atomic would blank most of a page - true, but
    it never checked *rendered height*, only finding count. A small group
    can still be taller than a full page's remaining space once long
    selectors and multi-page URL lists are accounted for, and
    `break-inside: avoid` on a fragment taller than a page gives Paged.js's
    layout algorithm no valid break point at all. Confirmed the hard way:
    item 1.6's own fix (more accurate page-union counts) made one real
    rule group (`heading-hierarchy-skip`, sas-fernande.fr) just tall
    enough to cross that line, and `pdf.ts`'s existing Paged.js
    "Layout repeated" guard (added earlier the same session for items
    0.2/0.7, see the `packages/report` entry below) correctly refused to
    generate rather than silently shipping a truncated PDF. Root-caused by
    bisecting each session commit against the real fixture, not guessed.
    Fixed by removing `.appendix-group` and `APPENDIX_GROUP_KEEP_THRESHOLD`
    entirely: every annex group now flows freely across a page break,
    exactly like large groups already did. The per-row
    `table tbody tr { break-inside: avoid }` rule (paged.css) is the only
    atomicity guarantee left for the annex, and it is safe because a
    single finding's own row is always small. Do not reintroduce
    group-level `break-inside: avoid` in the annex, keyed on finding count
    or otherwise, without a real mechanism for bounding rendered height
    first - CLAUDE.md's own testing section already requires regenerating
    all three reference sites before considering a report-layer change
    done, specifically because this class of bug does not show up against
    the two-page `fixtures/spa-demo` fixture.

18. **Milestone 8.6 added four detections from a tool survey session
    (2026-08-22): security response headers, a named-AI-crawler
    robots.txt check, structured-data validation, and CrUX real-user
    field data.** All four use `source: 'custom'` and slot into the
    existing dedupe/severity machinery rather than inventing a second
    path, the same "detect, don't grade" posture every other custom
    check in this codebase holds to.

    Security headers (`checks/security-headers.ts`) and CrUX
    (`crux.ts`) are both site-level, fetched once per audit and
    attributed to the homepage - the same "attribute a site-level fact
    to the one page every site has" pattern `llms-txt.ts`/`sitemap.ts`
    already established, chosen because response headers and real-user
    field data are near-always the same answer across a site's pages, so
    a per-page fetch would just repeat it at the cost of the politeness
    budget. Structured-data validation
    (`checks/structured-data.ts`, the `structured-data-testing-tool`
    npm package) runs per page inside the existing `onRenderedPage` hook
    against `page.content()`, no extra page load; it uses the package's
    built-in Google preset rather than its "auto-detect" mode, since
    auto-detected tests are all marked optional by the library itself
    (presence-only, no correctness judgment) - relying on those would
    report nothing head-metadata.ts's own JSON-LD presence check doesn't
    already cover. The AI-crawler check extends `robots.ts` rather than
    adding a new fetch: `fetchRobotsRules` was refactored to route
    through a new `fetchRobotsText`, so the crawl's own robots.txt fetch
    can also be parsed against each named AI user-agent
    (`AI_CRAWLER_USER_AGENTS`: GPTBot, ChatGPT-User, ClaudeBot,
    Google-Extended, PerplexityBot) with zero extra network calls;
    `isAllowedByRobots`/`findBlockingPattern`'s existing behavior is
    unchanged.

    CrUX has a minimum-traffic threshold before an origin gets a public
    record at all, confirmed by reading the CrUX API's own documentation
    - most audited sites (French SMBs) are expected to have none. This
    is why `CruxFieldDataResult` (`packages/core/src/types/manifest.ts`,
    not the locked findings contract) is a top-level, optional
    `AuditManifest` field recording the raw values (or
    `available: false`) regardless of severity, the same reasoning
    `lighthouseExcludedCategoryScores` already established for Lighthouse's
    excluded categories: absence of real-user data is a fact worth
    keeping, not a Finding, and must never render as a pass. Poor CrUX
    values (Google's own published LCP/CLS/INP "poor" thresholds) still
    produce real `performance`-category findings from
    `normalize-crux.ts`, derived from that same recorded data. CRUX_API_KEY
    is optional; scan-site.ts skips the CrUX fetch entirely (not
    attempted and failed) when it is unset, so a site is never charged a
    doomed auth round trip.

    One real bug caught during this session, not by the test suite:
    `crux-api`'s default fetch resolution is `createOptions.fetch ||
    window.fetch`, which throws `ReferenceError: window is not defined`
    in Node when no explicit `fetch` is passed - found by reading the
    library's source before wiring it in, not by a failing test. Fixed
    by passing `globalThis.fetch` explicitly in `crux.ts`; do not remove
    that explicit option on the assumption the library works standalone
    in Node.

    This closes out the tool-survey research from the same session (the
    plan considered, and explicitly rejected for now: Pa11y as a second
    accessibility engine, since it drives Puppeteer internally and would
    mean a second headless-browser stack next to Playwright; AI-answer-
    visibility SaaS trackers like Otterly/Profound, since they monitor
    live third-party LLM answers on a recurring subscription rather than
    scanning the client's own site, which breaks both the one-time-audit
    pricing model and the "deterministic scanners detect" rule; the W3C
    HTML validator, a rate-limited public service not meant for
    per-audit automation). Detection only at first, matching how 8.5a was
    scoped: `packages/llm` and `packages/interface`'s report path are
    untouched, and the security-headers/AI-crawler/structured-data
    findings need no report change of their own since they land in
    existing categories (`seo`, `geo`) the appendix and themes sections
    already render generically.

    CrUX field data is the one exception, added the same day
    (2026-08-22): `AuditManifest.cruxFieldData` is not a Finding (see
    above), so nothing would have rendered it without an explicit reader.
    `packages/report/src/template/sections/core-web-vitals-table.ts`
    gained a second block under the existing Lighthouse lab-data table,
    not a new numbered section - lab and field data are one performance
    story, not two competing sections, and this avoids touching
    `section-registry.ts`'s ordinal list, the TOC, or the reference
    mockups over what is additive content inside an existing sheet. The
    block renders in both branches (measurement fully failed, and
    measurement succeeded), independently of whether Lighthouse's own lab
    run succeeded, since CrUX and Lighthouse can each work or fail on
    their own. INP's good/needsImprovement thresholds are hardcoded
    locally in that file rather than added to `@odysseus/core`'s shared
    `CoreWebVitalMetricKey` union, since INP has no lab equivalent
    (Lighthouse's TBT is a lab-only proxy for it) and that shared type is
    also consumed by `normalize-lighthouse.ts`'s severity capping, which
    never handles INP. `render-html.axe.test.ts` (zero WCAG 2.2 AA
    violations) and `paged-invariants.test.ts` (post-pagination axe audit
    plus layout invariants) both pass unmodified against the added
    markup, confirmed rather than assumed.

19. **The long-deferred "letter-spacing" glyph-gap defect was root-caused
    to Chromium's print-to-PDF font hinting, not a CSS value**, closed
    2026-08-22 during a La Corniche report review session. A real report
    showed words splitting into separate glyph runs in the extracted PDF
    text - "Vot re prest at aire", "conf ormit e", "chiff res" - which
    `docs/report/report-feedback-deferred-items.md` had tracked since
    2026-08-19 under the wrong hypothesis (a stray `letter-spacing`,
    `word-spacing`, or `justify` rule; none exist in `nocturne.css` or
    `paged.css`, confirmed by grep both then and again this session).

    A standalone probe rendered the same test string through the real
    `renderPdfFromHtml` path, varying font-weight (400-700) and font-size
    (11-20px) independently across 18+ combinations. The defect has no
    clean weight or size threshold - it hit weight 400 at several sizes
    too - so this is not the same class of bug as the earlier
    letter-spacing correctness fix (a source value reduced to a safe
    numeric threshold, `letter-spacing.test.ts`). It is a Chromium
    glyph-hinting/positioning artifact in the PDF text layer itself.
    Passing `--font-render-hinting=none` to the Chromium launch used for
    the PDF render eliminated it across every tested combination with
    zero misses.

    Scoped narrowly: `packages/scanner/src/browser.ts`'s `launchBrowser`
    gained an optional `extraArgs` parameter (additive, defaults to
    today's args), and only `packages/report/src/index.ts`'s
    `generateReportPdf` passes the hinting flag, via an exported
    `REPORT_PDF_CHROMIUM_ARGS` constant. Scanner's own crawl/axe/
    Lighthouse browser is unaffected - it never renders to PDF and has no
    reason to change. `pdf-text-integrity.test.ts` was updated to launch
    with the same production args so it tests what actually ships.

    That existing test could not have caught this class of bug on its
    own: it strips all whitespace before comparing extracted text, which
    erases an inserted mid-word gap along with legitimate line-wrap
    whitespace, a limitation its own docblock already disclosed. A new
    `glyph-hinting.test.ts` reproduces the weight/size probe matrix
    directly against the production Chromium args and asserts every
    known word extracts as one contiguous token, closing the actual gap
    in coverage rather than only re-asserting the fix once.

20. **A full read-through of a real La Corniche report against its four
    intended audiences (director, IT/agency, legal, annex reader) turned
    up five more fixes, closed the same session as trade-off 19**,
    2026-08-22.

    **Section 01's cramped spacing** was `var(--space-5)`, referenced
    five times across `report-intro.ts` and `core-web-vitals-table.ts`,
    never defined anywhere in the repo including the approved mockup - it
    silently computed to `0`, killing four of section 01's group
    separators. The mockup (loaded via the playwright MCP, computed
    styles read directly, per trade-off 9's own instruction to re-derive
    rather than invent) uses `--space-6` for exactly this "separate a
    content block from the next heading" role, achieved via the
    *preceding* element's margin-bottom - headings never carry a top
    margin in the design, and 1.55 line-height is deliberate even for
    small body text, not a bug. Fixed by substituting the five broken
    references with the token the design actually uses; no new token was
    added and `nocturne.css` was not touched. A `spacing-tokens.test.ts`
    guard now scans every `.ts`/`.css` file under `packages/report/src`
    for a `var(--space-*)` reference with no matching declaration, closing
    the exact blind spot that let this live undetected for months
    (`letter-spacing.test.ts`'s own hardcoded file list, by contrast, is
    documented as incomplete).

    **Impact commercial and Conformité had no colour**, both rendering as
    flat grey text inside a blanket `opacity:0.75` wrapper alongside
    Effort. `cover.ts` already had the exact mechanism needed
    (`RISK_COLOR`, mapping the identical three French words
    low/medium/high onto the severity ramp for the cover's risk badge) -
    promoted to `design-tokens.ts` as `LEVEL_COLOR`, referencing
    `SEVERITY` directly rather than duplicating its hex values. Applied to
    Impact in `themes.ts` and `checklist.ts`, and to "Non conforme" in
    both `themes.ts` and `accessibility-statement.ts` (the latter
    previously used the neutral lavender accent, not red). Effort
    deliberately stays uncoloured everywhere: high effort means expensive,
    not urgent, and painting it on the same red/amber/green ramp would
    tell the reader the opposite of the truth. The blanket `opacity:0.75`
    on the metadata row was removed (it would have washed out the new
    colours) in favour of the existing `.text-muted` idiom on label text
    only, values at full strength - and a real axe contrast failure this
    surfaced (a nested `opacity:0.85` on the conformity gloss, doubly
    dimming an already-muted parent, 3.92:1) was root-caused and fixed,
    not worked around. The checklist's Impact column needed a second,
    print-safe colour pairing: `paged.css`'s `#section-05` print override
    forces every `div`'s colour with `!important` for its light-background
    inversion, so the coloured value is a `<span data-level="...">`
    instead (spans are outside that selector list), with three dedicated
    dark-on-light hex pairs (confirmed 4.5:1+ against `#f7f7f5`) added to
    the same print block - `LEVEL_COLOR`'s dark-mode hexes would have
    failed contrast if reused there directly.

    **Manual fields (nom commercial, dénomination sociale) were never
    auto-filled**, despite usable signals already existing in two places
    the pipeline already touches. Checked directly against the live
    Sirene API for a real client, not assumed: `siege.nom_commercial`,
    `enseigne_1/2/3`, and `liste_enseignes` were all `null` - Sirene
    genuinely has no commercial/brand name on file for many companies, so
    `nomCommercial` cannot come from there. It is, however, already in the
    scan: the homepage's `headMetadata.openGraphTags['og:site_name']`
    (falling back to the `<title>` tag's last `|`- or em-dash-delimited
    segment, or a short separator-free title, per `deriveSiteName` in
    `write-audit.ts`) - a new `siteSignals.siteName` manifest field,
    following the exact precedent `siteSignals.siren` already set.
    `raisonSociale` needed no new plumbing at all: `nom_complet` (what
    `OperatorProfile.denomination` already maps to) is the same value as
    `nom_raison_sociale`, already resolved once by `obligation-stage.ts`
    and exposed on `ObligationAssessment.registrySnapshot.denomination` -
    reused rather than adding a second Sirene field to fetch and parse.

    A new `prefillAuditManualFields` (`packages/store/src/audits.ts`) is
    deliberately not `setAuditManualFields` with different inputs: it
    reads the current document first and writes only keys currently
    absent, so a detected value can never overwrite an operator's own
    entry regardless of write order - `setAuditManualFields` always
    overwrites, the correct behaviour for its own explicit-edit call site
    but the wrong one here. Every written field gets
    `provenance: 'detected'`, which was already a live enum value in the
    schema and type but had no writer anywhere in the codebase before this
    - `accessibility-statement.ts`'s "to confirm" branch on that
    provenance was dead code waiting for exactly this. Wired into
    `audit-stage.ts` right after `persistAudit` (the audit document must
    exist first) using `obligationAssessment`'s already-resolved
    `registrySnapshot` and `manifest.siteSignals`, no second Sirene
    lookup. The dashboard form now shows a "détecté, à confirmer" hint
    next to a prefilled field (`app-audit.ts`'s `toggleDetectedHint`,
    driven by the same `provenance` field), so an operator can tell a
    guess from a confirmed value at a glance; the hint disappears once the
    operator saves that field themselves; `recipientName` continues to
    have no automatic source and is not attempted here (P2.7's precedent:
    it is operator-only by design, never rendered anyway).

    **Section 10 contradicted itself**: lab-measured LCP median 33.2s
    directly above real-user CrUX LCP 4.1s, an 8x gap with no explanation,
    on the single most credibility-sensitive page in the report for an
    IT-literate reader. A concurrency-inflation hypothesis (whether
    running Lighthouse across `SCAN_CONCURRENCY` lanes, per trade-off 10,
    somehow still contends for host CPU against the throttled simulation
    despite the existing serialization queue) was considered but not
    tested: confirming it would need two full scans of the same live site
    at different concurrency settings, and only one `lacoorniche.com` scan
    was authorized in this session - re-scanning a live third-party site
    an extra time purely for a diagnostic, beyond what was actually asked
    for, is exactly the kind of scope creep the crawling-politeness rule
    exists to prevent. Left as a genuinely open question for a session
    that can budget two authorized scans specifically for it. Fixed
    unconditionally instead: `core-web-vitals-table.ts` now renders a
    fixed-copy reconciliation note between the two blocks (`realUserGapNote`
    in both language files) explaining that lab data is a deliberately
    harsh single-run simulation while CrUX is real visitors on real
    devices, shown only when both a real lab number and a real CrUX table
    are on the page together - there is nothing to reconcile when either
    side is the "not measured" branch, so the note is suppressed there. The
    same section separately stated "aggregated across 27 pages" while only
    25 of 27 visited pages had returned a Lighthouse measurement (2 timed
    out, correctly disclosed in section 11 but silently contradicted here)
    - `pagesScanned` now counts pages with an actual `coreWebVitals` value,
    matching what the medians below it actually average over, not every
    visited page.

    **The annex repeated identical URL lists across findings that share a
    page set.** Many findings in the same rule group hit the exact same
    pages (the same booking widget missing an alt attribute, present on
    every page it appears on) - a real report repeated the identical five
    URLs plus "et 21 autres" under nearly every finding in some groups,
    the bulk of the annex's length for zero new information.
    `findings-appendix.ts`'s `pageUrlSetSignature` computes the same
    sorted-URL signature `renderPageUrlList` already sorts by;
    `renderRuleGroup` walks its findings in the same `findingId` order the
    rows are rendered in and remembers the first finding to carry each
    signature, so every later finding sharing that exact signature prints
    "Mêmes pages que fXXX" instead of the list. Deliberately narrow:
    scoped to one rule group only (never across groups, where a shared
    page set is a coincidence, not the same underlying cause), and skipped
    for single-page findings (nothing to save by deduping one URL). Each
    finding's own numeric page/occurrence-count columns are entirely
    unaffected - only the detail sub-row's URL text is deduped, so nothing
    downstream that reads `finding.pageUrls.length` needed to change.
    Respects trade-off 17: no group or row atomicity was added or changed,
    the fix is purely which text a sub-row prints.

21. **Business-impact reference stats now have a sector-targeted research
    layer, `docs/research/sector-reference-stats/`, one file per sector,
    separate from the original general-purpose pass**, added 2026-08-22
    after Jules flagged that a euro figure in the report has to be
    conservative and genuinely sector-specific or it destroys the
    report's credibility rather than adding to it - the working example
    given was "buttons with no label text reduce reservations by 75%,"
    which nobody would believe and which was never actually claimed by
    any source in the table. `docs/research/sector-reference-stats/
    hospitality.md` is the first file, `README.md` in the same directory
    is the template and promotion criteria for adding the next sector.

    Five new hospitality-tagged, `context-only` accessibility rows were
    added to `stats.ts` (`accessable-avoidance-2023`,
    `dcms-holiday-participation-gap-2024`,
    `dge-accesmetrie-booking-rare-2019`,
    `teixeira-hotel-accessibility-portugal-2022`,
    `singh-hotel-accessibility-top100-2025`), closing a real gap:
    `selectReferenceStats('accessibility', 'hospitality', { strictSector:
    true })` returned nothing before this pass (asserted by a since-
    updated test in `select.test.ts`), so a hospitality client's
    accessibility themes got no citation at all. All five are
    `context-only`, never `scales-down`: the research explicitly checked
    six countries and confirmed no study anywhere ties a WCAG remediation
    to a measured booking-conversion delta for a hotel or restaurant.
    That absence is the correct, conservative answer, not a gap to
    paper over with an invented ratio - see trade-off 15's same
    "report, don't fabricate" reasoning for the removed Legal & General
    citation. A sixth row, `siteminder-digital-experience-abandonment-
    2025`, was added under `performance` (52% of travelers self-report
    having abandoned a booking over a bad digital experience) with the
    self-reported-recall caveat written into the citation text itself,
    not left implicit - it is the one figure in the "no citable data"
    section of the research with real disclosed methodology, and stating
    its limitation inline is what makes it safe to use at all.

    Several strong findings from the same research pass were
    deliberately NOT wired into `stats.ts`: Coach Omnium's French hotel-
    guest survey (booking-form friction, direct-vs-OTA booking share) has
    no `StatCategory` home yet, the same "no home yet" situation
    `performance`/`rendering` themes were already in per trade-off 16 -
    kept in `hospitality.md` for future exec-summary or next-steps copy
    rather than force-fit into a category it doesn't belong to. The EC/
    GfK Belgium 2014 accessible-tourism economic study (783 million
    trips, 394bn EUR) was excluded as an aggregate market-size figure in
    the same family as the Click-Away Pound billions trade-off 15 already
    excludes - never a per-client multiplier. QualiBooth's 2026
    hospitality report was excluded as a *statistic* (proprietary 0-100
    score, sample skewed to large international chains) but its failure-
    pattern list independently corroborates what the scanner's own
    hospitality-relevant checks already detect, which is useful context
    for a future session, not a citation. Full promotion table and
    reasoning for every entry, including the negative results (no
    hospitality booking-abandonment rate exists anywhere with real
    methodology; no accessibility-to-conversion study exists for
    hospitality; Google Business Profile completeness claims are
    universally asserted and never studied; restaurant-specific data is
    thin across the board), is in `hospitality.md` itself - read it
    before re-researching any of those questions.

    Nothing in `packages/report`'s rendering path changed: the existing
    `selectReferenceStats`/`citationByRank` mechanism in `themes.ts`
    already renders a context-only stat's citation text generically, the
    same way it already did for the Nestlé/Rotten Tomatoes case studies.
    This pass is data-only, matching how 8.5b and the earlier hospitality
    scoping work were both data-only passes before their own wiring
    milestones.

22. **`estimateRevenueImpact` (trade-off 15/16) is now actually wired into
    the report**, 2026-08-22, same session as trade-off 21, closing the
    "unwired in both paths" gap those trade-offs left open. A theme's
    priority card gets a euro estimate (`themes.ts`'s
    `renderRevenueImpactNote`) only when both hold: the theme's citation
    is `scales-down` (never a context-only case study or aggregate -
    `estimateRevenueImpact` itself refuses those), and the client's own
    turnover is known from a reliable Sirene lookup. Turnover now reaches
    the report through a new `ObligationAssessment.registrySnapshot.
    turnoverEur?: number` field (`packages/core/src/types/compliance.ts`,
    not a locked contract), spliced on by `obligation-stage.ts`'s
    `withRegistrySnapshot` from the same `OperatorProfile.turnover` value
    already resolved via Sirene - present only when Sirene's own
    `SIRENE_TURNOVER_RELIABLE_EFFECTIF_CODES` gate passed, which happens
    to cover exactly the 0-9-employee band Odysseus actually sells to.
    No second lookup, no guessed figure: absent whenever the source
    lookup itself marked turnover unreliable, the common case is simply
    no euro figure rendered, same as an unmatched sector already renders
    no citation at all.

    The ratio is applied exactly once against the client's full reported
    turnover - never scaled by a measured gap, a page count, or a finding
    count. This was a deliberate design constraint from the discussion
    that preceded the build, prompted directly by a "buttons with no
    label text could reduce reservations by 75%" hypothetical Jules gave
    as the failure mode to avoid: a per-0.1s speed-conversion ratio
    naively multiplied by a client's actual multi-second LCP gap is
    exactly the mechanism that manufactures a number like that from a
    real, modest study. `measuredLcpGapNote` (existing, item 14) already
    states the real gap as separate prose; the euro figure never touches
    it. The raw result is additionally floored (never rounded up, never
    to nearest) to 2 significant figures by `roundConservativeEurEstimate`
    before display, so "up to 50 000 EUR" is shown rather than a
    false-precision "50 500 EUR" - the "never overstate" posture already
    governing legal-exposure copy, extended to money. The rendered
    sentence itself (`themes.revenueImpactTemplate`, both languages) is
    written as a hedged association ("if this association held for your
    business... an indicative estimate... not a guaranteed forecast"),
    never a forecast.

    Because the trade-off 21 research confirmed no scalable hospitality
    accessibility stat exists, accessibility themes for hospitality
    clients get no euro figure regardless of turnover - only
    `performance` themes currently can, via the Deloitte travel-sector
    stat. That asymmetry is the correct, evidence-driven outcome, not a
    bug to fix by relaxing `scales-down` eligibility for a context-only
    row.

23. **Milestone 9b (prospecting throughput), 2026-08-22.** Two findings
    worth recording before the implementation itself.

    First: `computeBrokennessScore`, `isAuditFallbackEligible`, and
    `isProspectingWorthy` (`docs/llm-layer-rules.md` section 10, CLAUDE.md
    rule 6) were documented as decided, shipped policy - "do not remove
    either gate" - but did not exist anywhere in the codebase before this
    milestone; `git log -S` on each symbol name only ever turns up the
    doc-patch commits. Neither gate was ever actually enforced: every
    audit has always called the LLM regardless of findings volume, and
    prospecting has never called it at all (9c, which would need
    `isProspectingWorthy`, isn't built yet). This milestone adds the real
    implementation, `packages/core/src/cost-gating/brokenness.ts`, matching
    section 10's spec exactly (SEVERITY_ORDER-weighted score, the two
    threshold predicates) and tested against it - but does not wire
    `isAuditFallbackEligible` into the real audit pipeline. That wiring
    (a static "no significant issues" report template, replacing an LLM
    call) is new report-template scope the 9b brief description never
    asked for, not a trivial call-site change, and stays a documented gap
    rather than something silently built or silently left claimed-but-
    missing.

    Second: enabling hospitality NAF codes for prospecting (an explicit
    ask this session, alongside the throughput work) surfaced that
    `docs/prospect-qualification.md` section 4 had gone stale relative to
    `docs/obligation-basis.md`. Section 4 originally excluded hotels from
    the first wave because "accommodation booking is a reading rather than
    a settled position" - true when written, but `docs/obligation-basis.md`'s
    own "Hotels and accommodation" entry was later upgraded from
    `disputed` to `secondary` and now states hotels are "on comparable
    legal footing to a standard online shop" for outreach purposes, with
    the first-wave exclusion being about volume and framing sequencing,
    not legal weakness. `naf-sector-allowlist.json` now enables 55.10Z
    (hôtels) and 55.20Z (hébergement touristique de courte durée,
    covering chambres d'hôtes) at `definitional` confidence on that basis;
    `docs/prospect-qualification.md` section 4 was updated to match rather
    than left contradicting the doc it defers to. Restaurants (56.10A) are
    listed but deliberately left disabled: the accommodation-specific
    legal reading does not automatically transfer to a table reservation,
    and extending it by analogy without the same kind of review hotels
    got would be exactly the unchecked-claim mistake rule 1 forbids. This
    is a general lesson, not just a prospecting one - a cross-referenced
    doc's conclusion can silently outlive the doc that cites it, and nothing
    currently checks for that drift automatically.

    The throughput changes themselves, scoped exactly to the 9b brief
    description: `runProspectingJob`'s serial for-loop became a bounded
    worker pool (`PROSPECTING_JOB_CONCURRENCY`, a shared-cursor scheme so
    a worker that finishes early immediately claims more work rather than
    owning a fixed slice), safe without grouping by origin because the
    existing per-origin lock already serializes same-origin URLs
    regardless of which worker reaches them - the pool's throughput gain
    comes from distinct origins running in parallel, exactly as the brief
    describes. `ScanPageOptions.skipLighthouse` (threaded through
    `scan-site.ts` and `RunAuditStageOptions`, set only by
    `runProspectingJob`) skips both the Lighthouse pass and its dedicated
    pre-pass politeness delay; full audits never set it, since the paid
    report needs real Core Web Vitals. `PROSPECTING_MAX_PAGES` raised from
    1 to 3 and `PROSPECTING_MAX_DEPTH` from 0 to 1, per the brief's "home,
    one listing page, one transactional page" description - documented
    explicitly in `config.ts` as a page-count ceiling, not a page-role
    classifier: the crawl still reaches pages in ordinary link order, so
    there is no guarantee the second and third pages scanned are actually
    a listing and a transactional page. Building that classifier is a
    real, separate gap, flagged rather than silently assumed solved.
    "Deterministic evidence screenshot selection" (the brief's fourth
    bullet) is already satisfied by the existing
    `pruneScreenshots`/`selectPageDirsToKeep` mechanism (trade-off 2)
    that `runAuditStage` already calls unconditionally for every job type,
    prospecting included - no new code needed there; which single
    screenshot becomes an outreach email's hero image is a 9c decision,
    not this milestone's.

24. **Language variants of one page are collapsed into a single finding,
    using the site's own hreflang declarations and nothing else**, added
    2026-08-24 during a three-site client-eye report review. A real
    haaitza.com audit reported the same missing gallery link text five
    times, once per language variant of one page; 182 of its 265
    `link-name` findings had exactly that shape, and the reader had no way
    to tell one defect on one template from five separate defects.
    `packages/core/src/normalize/translation-clusters.ts` builds clusters
    with a disjoint set over each page's `hreflangLinks`, and
    `aggregateSamePageOccurrences` (trade-off 3's second pass) then takes
    a `canonicalPageUrl` mapper so the existing same-page collapse does
    the actual work. No selector rewriting, no third dedupe pass, no
    change to `computeDedupeKey`: trade-off 3's two passes stay two
    passes, and cross-run identity for the monitoring tier is unaffected.

    Two gates exist because the naive transitive union was catastrophically
    wrong on real data, not theoretically wrong. The first implementation
    produced one 55-member La Corniche "cluster" holding ten genuinely
    different room pages. Root cause, found by reading raw `scan.json`
    rather than by reasoning about it: every `/en/room/*` page on that site
    copies the rooms *listing* page's hreflang block verbatim, so each room
    declares that its English version is some other room's URL. Gate one
    (self-inclusion) only counts a declaration when one of its own
    hreflang hrefs resolves back to the declaring page; gate two (one URL
    per language) rejects an entire declared set that claims two URLs for
    one language. Cluster sizes then capped at exactly 5, the real number
    of languages the site publishes. URL-prefix guessing (`/en/x` matches
    `/x`) was considered as a fallback for sites with no hreflang at all
    and deliberately rejected: it invents a relationship the site never
    declared, which is the same class of unchecked claim rule 1 forbids.
    A site with no hreflang simply gets no clustering, and every page
    stays its own singleton cluster - a no-op, proven by a real
    monolingual scan (Palais Gallien) whose findings came back
    byte-identical.

    Clusters are computed once in `write-audit.ts` and recorded on the
    manifest rather than recomputed by each consumer, since `packages/
    report` needs the same grouping to print
    `url (fr, en, es, it, pt-pt)` instead of five near-identical URLs.
    `normalize <dir>` rebuilds them from stored head metadata when a
    manifest predates the field and writes them back, so a stored audit
    gets today's rules offline without being re-scanned - the whole
    promise of that command. Measured effect on the three review scans:
    haaitza 572 to 305 findings and 81 to 60 report pages, La Corniche
    929 to 650, Palais Gallien unchanged.

25. **`FindingCategory` gained a `privacy` value**, 2026-08-24, an
    explicitly approved change to the locked `findings.ts` contract, not
    a silent one. Milestone 8.6's security response headers had been
    filed under `seo` for want of a better home (trade-off 18), which
    mislabels them to a client reading the report by section. The new
    cookie/tracker consent checks below needed the same home. One value
    covers both rather than separate `security` and `privacy` values: to
    the SMB reading the report they are one concern ("what leaves my site
    and who sees it"), and splitting them would put a missing
    `Referrer-Policy` in a different section from a tracker firing before
    consent when they are the same story. Purely additive; nothing was
    removed or renamed. `design-tokens.ts` gained a matching
    `CATEGORY.privacy` and a `CATEGORY_ORDER` slot, so it renders rather
    than repeating trade-off 14's "detected but silently unrendered" gap.

    The new axe fixture this added immediately surfaced a real,
    pre-existing WCAG 1.4.3 failure at 3.2:1 in
    `reference-stat-note.ts`: an "emerging research" badge nested inside
    a `opacity:0.6` wrapper, which composites the whole subtree including
    the badge's own background, so no child rule can undo it. Same defect
    class as trade-off 20's nested-opacity contrast bug. Fixed by
    replacing the wrapper opacity with the existing `.text-muted` idiom on
    label text only; the rest of the template was swept for the same
    pattern and every other site clears 4.5:1.

26. **Six detection checks added from the same three-site review (C1,
    C3-C7), 2026-08-24.** Cookie and tracker consent
    (`checks/cookie-consent.ts`, a fresh `browser.newContext()` so no
    stored state carries over), WCAG 1.4.10 reflow at a 320 CSS px
    viewport (`checks/reflow.ts`), accessibility-statement presence
    (`checks/accessibility-statement.ts`), a third-party origin inventory
    (folded into the cookie check's own network recording rather than a
    second page load), NAP consistency between JSON-LD and visible text
    (`checks/nap-consistency.ts`), and HTML structural validity
    (`checks/html-validity.ts`, the newly approved `html-validate`
    dependency). All six use `source: 'custom'` and the existing
    dedupe/severity machinery, same posture as trade-off 18.

    Three scoping decisions worth not re-litigating. `html-validate` runs
    an explicit `ALLOWED_RULES` allowlist (structural rules only: dup ids,
    close order, permitted content/parent/occurrences, void content) and
    excludes every `wcag/*` rule, because axe already scans those against
    the same page and enabling both would recreate exactly the duplicate-
    finding problem trade-off 1 documents for Lighthouse. NAP consistency
    deliberately compares only phone numbers and postal codes, never
    street names: street-name variation ("av." vs "avenue") is a
    formatting difference, not an inconsistency, and reporting it would
    train a client to ignore the check. The accessibility-statement path
    pattern was narrowed after a real match on `/chambres-accessibles/` -
    a hotel's accessible-rooms page is not a WCAG conformance statement.

    Verified against a live authorized re-scan (Palais Gallien, 20 pages)
    rather than the fixture alone, per this file's own build-order rule.
    The most useful result was a negative one: the site runs a real CMP
    and the check correctly found zero non-essential cookies and zero
    tracker requests before consent, with Cloudflare's `_cfuvid`
    correctly classed as essential. A consent check that fires on every
    site is worthless; that true negative is the evidence it does not.

27. **The structure pass sees dense alias finding IDs, not real ones**,
    2026-08-24. A real La Corniche audit failed all six structure attempts
    by inventing exactly `f320`. That finding exists, but `partitionFindings`
    (trade-off 8) had diverted it, and every neighbour the model was shown -
    f316 to f319 and f321 to f324 - was the same rule, so the model closed
    the run. `structure-prompt.ts` already carried an explicit paragraph
    telling it that numeric gaps are normal and never to complete a
    sequence; that instruction failed six times out of six, which is the
    argument for removing the gap rather than restating the rule louder.

    `packages/llm/src/finding-alias.ts` assigns a gapless `x1..xN` alias over
    exactly the findings the model is shown, `analyzeStructure` runs the
    invented-ID guard in alias space, and resolves back to real IDs before
    it returns. Nothing outside that function ever sees an alias:
    `structure.json` on disk, the staleness check that reads it, and
    `buildWritingInput` are untouched. The prefix is deliberately not `f` so
    a leaked alias would be obvious in a stored artifact rather than
    plausible.

    The safety property is unchanged in substance and worth stating exactly.
    Rule 1 forbids the model introducing a finding absent from its input.
    Under dense aliases every ID in range denotes a finding it genuinely saw,
    so completing a run can no longer surface a withheld finding - at worst
    it pulls in a neighbour it did see, which is a grouping-quality question,
    not a rule-1 breach. Out-of-range IDs are still a hard rejection, and a
    real finding ID appearing in a response is now itself rejected, since the
    model was never shown one. The superseded prompt paragraph was deleted,
    not weakened. Do not reintroduce a prompt instruction about ID gaps: there
    are no gaps left to explain, and the instruction is what already failed.

28. **The LCEN identification obligation is stated to the client, and its
    citation was wrong**, 2026-08-24. Two separate defects, found together.

    First, governance. `packages/core/src/compliance/regimes.ts` has held a
    complete, client-facing-quality LCEN regime since it was written, and
    nothing anywhere read it - `grep` for `LCEN_MENTIONS_LEGALES_REGIME_ID`
    returned the definition site and nothing else. `assessObligations()`
    emits only EAA and article 47. Meanwhile `docs/obligation-basis.md`, the
    file that governs every legal claim in the product, had no LCEN entry at
    all, so the regime was simultaneously unauthorised to state and unread.
    The scanner has detected the breach since milestone 8
    (`lcen-mentions-legales-missing`), but it surfaced only as one annex row
    under `seo`, while section 03 "Exposition légale" - the page a client or
    their lawyer reads for what the law asks of them - was entirely EAA, and
    mentioned the missing SIREN only as an obstacle to determining EAA scope.

    Second, the citation. Checked against Légifrance rather than trusted:
    loi n. 2024-449 du 21 mai 2024 (SREN) restructured the LCEN and moved the
    identification obligation to **article 1-1, I, 2**, in force since
    23 May 2024. `regimes.ts` cited the pre-SREN `article 6-III et 6-VI-2`,
    as most commercial sources online still do. It was saved from reaching a
    client only by never having had a render path. Both the citation and the
    criterion text are now the verbatim Légifrance wording.

    Why this may be stated where EAA scope may not: rule 6 exists because EAA
    scope turns on headcount, turnover and sector and the courts are split.
    LCEN has no size threshold, no sector list and no contested case law, so
    stating the criterion and what the scan observed is a report, not a
    conclusion. `docs/obligation-basis.md` section 8bis carries the verified
    text and this reasoning at status `primary`.

    Implementation follows trade-off 11: `renderLcenBlock`
    (`packages/report/src/template/sections/legal-exposure.ts`) splices the
    name, criterion, authority and citation straight from `regimes.ts` and
    otherwise renders fixed strings; no model prose, no new LLM field.
    Deliberately **not** routed through `assessObligations()` - that function
    resolves a scope question from registry facts and LCEN has no scope test,
    so folding it in would mean inventing a status for a regime that has none
    and would move `status`, which drives the cover badge. It renders only
    when the finding is present, reading the post-`resolveLcenFinding` array
    so an operator's manual confirmation still suppresses it through the one
    existing decision point; a compliant client gets silence, never a passing
    grade, because a bounded scan cannot certify an absence of breach.
    **No sanction amount is rendered**, guarded by a test: rule 6 forbids it
    for a specific client, and where the pre-SREN 75 000 EUR penalty now sits
    was not verified, so `sanctionCeiling` for this regime is explicitly
    marked uncitable and has no render path.

29. **Three client-visible report defects from the same review, fixed
    2026-08-24.** The executive summary's note under priority 1 asserted the
    top priority "est un enjeu commercial, pas un enjeu de conformité légale"
    whenever the theme had no `legalRelevance`. But `legalRelevance` is built
    only for accessibility themes with WCAG criteria
    (`packages/llm/src/legal-relevance.ts`), so the note was claiming no legal
    weight for privacy, LCEN and security themes it knows nothing about - and
    in a real report it said exactly that on the same page a section-03 LCEN
    breach now appears. Reworded in both languages to say what the code
    actually knows: the priority is not tied to an accessibility criterion,
    and other obligations may apply separately.

    Every French guillemet pair in the report enclosed an ordinary U+0020,
    which is both wrong in French and a real layout defect, since an ordinary
    space is a legal line-break opportunity. Replaced with U+00A0 across 23
    pairs in three files, and `guillemet-spacing.test.ts` scans every source
    file so it cannot regress. U+00A0 rather than the finer U+202F
    deliberately: U+202F is not in every fallback font Chromium may reach for
    during print-to-PDF, and a missing glyph in the PDF text layer is worse
    than a slightly wide space - the same caution that produced
    `REPORT_PDF_CHROMIUM_ARGS` (trade-off 19).

    `render-diff-evidence.ts`'s docblock said screenshots "stay in the
    technical export". There is no export route and no section renders them;
    they are simply not shown to the client, which is the intended behaviour
    on trade-off 2's data-minimisation reasoning. The comment was corrected
    rather than the behaviour, per the decision recorded before the work
    started.

30. **Lighthouse's resource audits collapse to one site-wide finding each,
    with the affected files as evidence**, 2026-08-24 (B4). A real
    haaitza.com report printed "Serve images in next-gen formats" 65 times
    and "Efficiently encode images" 49 times: 102 of 305 findings, a third
    of the annex, every row restating one instruction with a different
    filename. The governing rule, stated by the operator: every finding in
    the report must be unique and relevant to the client, and a duplicate is
    a bug that costs the report its credibility, exactly as trade-off 24
    already established for language variants of one page.

    Cause: the fine dedupe pass keys on `source|ruleId|selector`, and a DOM
    selector is the wrong identity for a defect that belongs to a file. The
    same image referenced from twenty pages got twenty selectors. Sites whose
    slider generates its wrapper id at runtime
    (`swiper-wrapper-3bd6608a838df14e`) were worse still: the same image on
    the same page keyed differently on every scan, which also defeated
    trade-off 24's translation clustering, since the five language variants
    landed in five separate groups instead of one.

    **Selector normalization stays rejected**, and trade-off 3's warning was
    confirmed rather than overturned. Real counter-examples: a naive "strip
    hex-looking ids" rule would merge `#popmake-12288` with `#popmake-13138`
    (two different WordPress popups) and distinct Webflow `w-node-*` ids
    (build-stable, one per element). The fix gives these rules a better
    identity instead of a damaged version of the wrong one.

    **Keying on the file URL was tried first and measured, then rejected on
    the numbers**: 99 findings became 127, 305 became 381, 650 became 871,
    because splitting one container selector into its several images
    outweighed merging one image across pages. That is the right identity for
    a defect and the wrong granularity for a report. "Serve your images in a
    modern format" is one instruction a client carries out once. The file
    list is evidence for one finding, not sixty five findings.

    Shipped shape: `FindingCandidate.dedupeIdentity` (new, optional)
    overrides `element.selector` in the fine key without changing what is
    displayed; `normalize-lighthouse.ts`'s
    `RESOURCE_IDENTIFIED_LIGHTHOUSE_AUDITS` allowlist sets it to `''` so an
    audit's items collapse into one site-wide finding (`ruleId` is already
    part of the key); `mergeGroup` lifts each item's file URL into
    `rawEvidence.resourceUrls`, because `perPage` is last-write-wins and
    would otherwise discard the list; the annex prints a file count in the
    selector column and the files in a sub-row, since `elements[0].selector`
    for such a finding is whichever DOM node sorted first and is misleading
    as the row's only detail. An allowlisted audit whose items carry no
    `url` falls back to selector identity rather than collapsing everything
    onto the identity `''`, so a merge is never made on the strength of
    absent data.

    Measured on all three reference audits, offline via `normalize <dir>`:
    99 to 61 findings, 305 to 177, 650 to 525. Total occurrences were
    byte-identical before and after on all three (1192, 10415, 20921) and no
    rule id disappeared, which is the check that the collapse regrouped
    rather than dropped.

    Only add an audit to the allowlist when its items genuinely describe one
    action over a set of files. Collapsing an audit whose items are
    independent problems needing separate decisions would hide real findings,
    which is a worse failure than a long annex. Note also that `dedupeKey`
    changes for these rules, and cross-run identity for the monitoring tier
    (milestone 13, not built) is `dedupeKey`, so stored audits predating this
    need `normalize <dir>` before they can be diffed against new ones.

31. **A fourth review site (Domaine Lagnonu, lagnonu.fr) found a P0 the
    1345-test suite passed over, plus nine report defects**, 2026-08-24.
    Recorded because the finding pattern matters more than any one fix:
    the three reference sites were being re-scanned repeatedly, and
    rotating in a site nobody had scanned before immediately produced a
    defect none of them could express.

    **The P0.** `render-diff.ts` navigated the rendered pass with
    `waitUntil: 'networkidle'`. On lagnonu.fr that condition is not slow,
    it is unreachable: measured directly, idle never arrived in 120s,
    while the page's visible text was complete and byte-identical in
    length at 4.3s under `load`. Because axe and every `onRenderedPage`
    custom check hang off that single navigation, one unreachable
    condition failed three scanners at once. The first scan produced zero
    axe findings and one accessibility finding across 20 pages; the fixed
    scan produced 44 and 95 across 43. A report would have gone to a
    client titled "audit accessibilite" containing one accessibility
    finding. Raising `PAGE_TIMEOUT_MS` would not have helped, which is
    worth knowing because it is the intuitive first guess.

    Fixed with `load` plus a bounded, best-effort
    `waitForLoadState('networkidle')` whose timeout is a normal outcome,
    not a page error - a page that never falls idle is still fully
    rendered and worth scanning. `DEFAULT_RENDER_SETTLE_TIMEOUT_MS`
    (8000, `RENDER_SETTLE_TIMEOUT_MS` overridable), recorded on
    `AuditConfigSnapshot.renderSettleTimeoutMs` for the same provenance
    reason as the other scan config fields.

    **Language subtrees were being severed by the fix for a different
    bug.** `links.ts`'s `LANGUAGE_HOMEPAGE_PATH_PATTERN` dropped any URL
    whose entire path is a language code, added for La Corniche where
    five language homepages inflated every homepage defect fivefold. On
    lagnonu.fr `/en` and `/es` are the only links from the French
    homepage into those subtrees, so dropping them left 22 declared pages
    unvisited - the exact outcome the rule was written to prevent. The
    URL is no longer dropped; `crawl.ts` records it
    `discovered-not-scanned` (new `ManifestPageStatus`), crawled for its
    links and never scanned, so neither site loses. The general lesson:
    a filter justified by one site's shape can invert on another's, and
    "narrow enough to be safe" was argued rather than tested against a
    second multilingual site.

    **The cover named the client "Mariages et evenements prives".** The
    business is Domaine Lagnonu, and both halves were in one string:
    `deriveSiteName` took the last `|`-delimited segment of "Domaine
    Lagnonu | Mariages et evenements prives". The `Page | Site`
    convention is real, so is its mirror, and one title cannot say which
    a site follows - but the rest of the site can, since a brand repeats
    across pages and a page topic does not. `deriveSiteNameFromTitleFrequency`
    picks the segment recurring in the most titles (measured: "Domaine
    Lagnonu" in 6, every topic in 1), requires at least two titles to
    agree, and returns undefined otherwise so an absent prefill is still
    never a guessed one. `og:site_name` still wins outright.

    **`hreflang-missing` had a severity mapping and remediation copy and
    no emitter**, so a trilingual site publishing zero hreflang got no
    finding. Same class as trade-off 28's unread LCEN regime and
    trade-off 23's never-implemented gates: a rule id can be fully
    dressed and entirely dead. Now emitted from `normalize-hreflang.ts`
    on total absence across a site whose own URL structure shows two or
    more language prefixes - never inferred from content, and never by
    guessing that `/en/x` translates `/x`, which trade-off 24 already
    rejected for clustering. Worth a periodic sweep for other rule ids
    with a severity and no emitter.

    **The model wrote legal consequences into a client report.**
    "L'absence de numero SIREN ou RCS expose a une amende" rendered on
    page 8, plus two "risques juridiques" claims. Checked rather than
    assumed: `writing-prompt.ts` had never forbidden this, so it was a
    missing control, not an ignored instruction. Both added -
    `legal-consequence-guard.ts` rejects and retries (discard, never
    repair, per trade-off 11), and the prompt now says so explicitly.

    **Four further guards and template fixes**, all from the same read:
    reference-stat citations are now keyed off the findings' own category
    rather than the model's label (a security-headers theme was labelled
    `performance`, which is trade-off 16's B1 defect arriving through the
    other input); `themeSchema.category` gained `'privacy'` so that theme
    has a correct answer available at all (approved locked-contract
    change, `'geo'` deliberately still excluded per trade-off 16);
    typography is normalized on model output rather than only on source
    strings, closing the door trade-off 29 left open; page counts in
    model prose are rejected outright, since `build-input.ts` shows the
    model at most 3 page URLs per finding and the template renders the
    real count beside its text; and a category holding critical findings
    is guaranteed a rendered priority, after a report told the director
    "43/43 pages with a critical finding" while none of its six
    priorities was performance, which held four of the five criticals.

32. **Three more defects closed regenerating the Lagnonu English report,
    2026-08-25 session continuation**, none visible against the fixture
    alone - all three needed the real 65-page scan.

    **A generic CSS rule can put Paged.js into its own infinite-loop
    guard on one language's copy and not the other.** English's report
    generation failed outright on trade-off 17's "Layout repeated" class
    (pdf.ts's own guard, not a crash: it aborts rather than ship a
    silently truncated PDF). French generated cleanly from the same scan.
    Root-caused by bisecting the actual generated HTML (binary search on
    section slices, then on `.remaining-category` blocks) rather than
    guessing from the CSS: the generic `h1, h2, h3, h4, h5, h6 { break-
    after: avoid }` rule (P4.6) glues every `remaining-work.ts` category
    heading (also an `h5`) to whatever follows it via Paged.js's iterative
    break-after solver, and on English's longer remediation copy one
    category heading landed at a page boundary the solver could not
    resolve. `paged.css` now overrides `break-after` back to `auto` for
    `.remaining-category h5` specifically (higher specificity than the
    bare `h5` rule) and replaces it with a bounded `.remaining-category-
    head` wrapper (`break-inside: avoid` around the heading plus its
    first rule block only) - "bounded by construction," the same
    reasoning trade-off 20's `.stat-tile-row` rule already relies on, and
    exactly why that one heading/row pairing never hit this failure.
    Confirmed against the full report end to end, both languages, after
    the fix; do not revert to a bare `h5` rule for this section without
    re-confirming the loop is gone.

    **`measuredCoreWebVitalGapNote`'s tie-break silently favoured LCP.**
    D7 (trade-off 31) fixed the case where a theme's findings named one
    dominant Core Web Vital metric other than LCP. It did not cover a
    genuine tie: a real Lagnonu theme titled "Blocage du navigateur par
    des scripts JavaScript" (TBT) bundled one finding each for TBT, FCP,
    LCP and Speed Index, and the preference-order tie-break
    (`themes.ts`'s `CWV_METRIC_PREFERENCE`) picked LCP purely because it
    came first in that list, reproducing D7's exact wrong-anchor defect
    under a title about blocking scripts. Fixed by returning no metric at
    all on a genuine tie for the top count, per D7's own stated principle
    ("saying nothing is correct there; quoting an unrelated metric is
    not") - that principle does not stop applying just because the wrong
    metric happens to be the most-cited one rather than an arbitrary one.

    **axe-core and a Lighthouse SEO audit share the literal rule id
    `document-title`.** Confirmed against real scanner output (only
    Lagnonu of the four reference audits triggers it): axe emits
    `document-title` (WCAG 2.4.2, accessibility, serious) and Lighthouse's
    SEO category emits its own audit of the same name (seo, moderate) for
    the same missing `<title>` element on the same 14 pages -
    `normalize-head-metadata.ts`'s own milestone-8 comment had already
    reasoned that its custom SEO check must not duplicate Lighthouse's
    `document-title` audit, but never checked whether axe also reports a
    rule of that name. Same failure family as trade-off 1, arriving
    through a different door. Fixed the same way trade-off 1 fixes its
    own duplicates: added `document-title` to `LIGHTHOUSE_EXCLUDED_AUDITS`
    (`packages/core/src/normalize/constants.ts`), keeping axe's side (WCAG-
    referenced, more severity-accurate). `scripts/generate-reachable-rule-
    ids.mjs` had to be re-run afterward - `reachable-rule-ids.test.ts`
    computes the Lighthouse-reachable set from the same exclusion list, so
    its committed fixture needed regenerating, not just the code fix.

    **A normalize-layer change that removes one mid-list finding
    renumbers every finding ID after it, and nothing before this session
    surfaced how much that matters.** Finding IDs (`f001`, `f002`, ...)
    are assigned positionally; removing the `document-title` duplicate on
    Lagnonu shifted every later id back by one; `f035` stopped meaning
    "missing title tag" and started meaning `no-h1`. `odysseus report`
    still rendered the priority correctly, because Zod validation
    (`llm-output.ts`) and the finding-id guard only check that a cited id
    *exists* in `findings.json`, not that it still denotes the same
    defect the model was shown. `odysseus analyze` does catch a stale
    *structure* cache for exactly this reason (an existing `--regenerate-
    structure` prompt, not newly added this session), which is what
    surfaced the mismatch here - but a stored full analysis with no
    structure-cache mismatch would have rendered silently wrong, citing a
    real, current, wrong finding under an unrelated priority. Whenever a
    normalize-layer change to a stored audit's `findings.json` can drop or
    reorder findings (a new dedupe rule, a new exclusion like the one
    above, `normalize <dir>` after such a change), any analysis already
    generated against the old file must be treated as invalid and
    regenerated (`analyze --regenerate-structure`), not reused - this is
    not yet an automated guard the way the structure-cache check is, and
    should probably become one.

    All three closed with the full 1477-test suite green and all four
    curated reference fixtures (`fixtures/audits.json`) refreshed and
    passing `fixture-freshness.test.ts` at fingerprint `b8afddb24f9b743c`.

33. **Hotel identity, own domains, and group routing, milestone 9c plan 002,
    2026-08-27.** Four decisions, each of which was measured against the real
    13,301-hotel Atout France export rather than argued from the plan document.

    **`tldts` was added as a direct dependency of `@odysseus/core`, with
    operator approval, because no existing dependency does eTLD+1 against the
    public suffix list's private section.** `tldts-icann` was already in the
    tree as a Lighthouse transitive dependency, and is exactly the wrong half:
    ICANN-only resolution turns `hotelhavane.wixsite.com` into `wixsite.com`,
    fabricating a chain out of eighteen unrelated independent hotels. Measured
    before deciding: a naive last-two-labels registrable domain is wrong on
    eleven hosts in the export, and only one of those eleven (`inghams.co.uk`)
    is the multi-label ICANN case a hand-rolled fix would have targeted. The
    other ten are site-builder hosts. Do not replace this with a hand-rolled
    parser, and do not downgrade to the ICANN-only package.

    **A curated vendor-host list is required in addition to the public suffix
    list, not instead of it.** The private section covers only two of the ten
    measured builder hosts (`wixsite.com`, `github.io`). The rest, plus booking
    engines and federations, live in `hotel-vendor-hosts.ts` as compiled
    TypeScript, the same posture as `free-mail-domains.ts`: edited content, not
    operator config. Lookup is exact, never suffix matching. A host the list
    misses but the suffix list marks private still fails safe, synthesized as a
    `shared-platform` vendor - which correctly caught two uncurated platforms
    (`webflow.io`, `webadorsite.com`) on the real run.

    **A shared domain is not evidence of a chain, and the difference is
    decided by the curated list rather than by group size.** Forty-five hotels
    on `logishotels.com` are forty-five independent businesses sharing a
    marketing federation's site, and they go to review. Twelve hotels on a
    corporate domain are one chain, and they are excluded from the SMB
    campaign. Both look identical to a counter. Getting this backwards sends an
    independent-hotel pitch to a chain's head office, or drops a real prospect.

    **Grouping is a two-pass computation over the whole run, and the order is
    load bearing.** Whether a domain identifies one hotel or 1,196 Accor
    properties is a property of the run, not of the row in front of you. A
    single streaming pass would write the first Accor property as an
    independent hotel holding `accor.com` and discover the truth 1,195 rows
    later, after it was already persisted. Relatedly, only a domain held by
    exactly one establishment is ever used as an identity key: keying a chain
    property on its domain would merge 1,196 establishments into one candidate,
    which is a deletion rather than a deduplication.

    **Two defects found by re-resolving the real export, both invisible against
    the fixture.** First, a second resolve reported 3,820 `needs-review`
    identity links, every one of them a source row matching itself through the
    candidate the first resolve had created from it. The fix computes the
    identity key before the identity search and short-circuits on a key already
    in the catalogue; the genuine collisions in the whole export number nine.
    Second, `review` was written only via `$setOnInsert`, so a candidate that
    became reviewable on a later run could never reach the queue. It is now
    promoted in a second bulk write filtered on `review.state: 'not-required'`,
    which moves the state in one direction only and never reopens a human
    accept or reject. Both have tests; the first also has a companion test
    asserting a real name-and-postcode collision between two different hotels
    is still queued.

    **The Sirene join is built and reports matching nothing, deliberately.**
    Atout France carries no SIRET or SIREN column, and the company identifier
    arrives in plan 003 from the hotel's own published identification. The seam
    exists now so plan 003 is a drop-in, it distinguishes `no-identifier` from
    `siren-not-in-qualifying-sirene-set`, and a missing stock file is an
    explicit counter rather than a throw. Reported plainly rather than hidden.

34. **Real-scan test fixtures are committed with the client removed, not
    gitignored and not committed as-is (2026-08-27).** Twelve tests read
    artifacts of real audited sites. Those directories were gitignored, so the
    tests described data no other machine had: a fresh clone throws rather than
    skips, and a green suite on CI meant nothing. Committing them as they stood
    was worse - it would have put a named third party's full defect list in
    public Git history permanently, which is not ours to publish and would
    survive any later deletion.

    Hostnames were never the secret: `fixtures/audits.json` already commits
    them. What must not enter history is the *link* between a named site and
    its measured defects. That is what makes a third option work.
    `scripts/deidentify-audit.mjs` builds `fixtures/test-audits/` from stored
    audits, named for what each exercises (`small-site`, `multi-page`,
    `large-rule-families`), never for a client. Only `manifest.json`,
    `findings.json`, and `analyses/` are read; `pages/*/scan.json` is never
    touched because it carries base64 screenshots. The script verifies itself
    by reading back every written byte and exiting non-zero on any surviving
    token.

    Two failure modes are worth knowing before touching that script, because
    neither is obvious and one is silent:

    - **Token matching from the hostname is not sufficient.** A second brand
      name absent from the domain, four place names in SEO slugs, and one
      hotel's name inside another's fixture (the sites cross-link) all
      survived the first pass. The script prints the surviving path vocabulary
      for a person to read. That reading step is the control, not the token
      list.
    - **Collapsing several tokens onto one replacement merges distinct
      pages.** Two different page paths became the same path, silently turning
      20 pages into a manifest that no longer matched its own findings.
      Replacements are therefore injective pseudonyms with separate prose and
      URL forms, and the script asserts no two originally-distinct pages
      collided. Only the explicit collision check catches this; no test does.

    Real hostnames stay wherever they point at local gitignored `artifacts/`
    directories - `fixtures/audits.json`, `rule-translations.test.ts`, and
    historical comments citing real scans are all correct as they are. A
    repo-wide rename overreached into exactly those places and had to be
    reverted twice.

    The normalization recall ratchet needs the union of rules observed across
    the larger curated local audit set, not only the three full committed
    snapshots. `pnpm fixtures:rules` writes that union to
    `fixtures/test-audits/observed-rule-ids.json`. The file contains sorted rule
    IDs only and deliberately preserves no audit-to-rule mapping, so CI keeps
    the measured coverage floor without publishing a named site's defects.

35. **The hotel prescan is a distinct path over shared scanner primitives, not
    a smaller call into the audit pipeline (2026-08-27).** Plan 004's brief was
    a 60-to-90-second, three-page, no-Lighthouse pass whose output feeds
    evidence capture and scoring. The obvious implementation was to reuse
    `runProspectingJob`, which already crawls three pages - but it does so by
    calling `runAuditStage`, which persists paid-audit shapes (`AuditManifest`,
    findings, obligation assessment) and would let a prescan drift back into
    multi-minute work one option at a time. `prescanSite`
    (`packages/scanner/src/prescan/`) therefore orchestrates `renderDiff`,
    `runAxe`, and direct metrics itself, and never calls `runAuditStage`,
    `scanSite`, `scanPage`, or Lighthouse. Politeness is unchanged and comes
    from the same primitives: `fetchRobotsRules`, the crawl delay taken as the
    maximum of the configured value and any robots `Crawl-delay`, the
    identifiable user agent, and the per-page timeout. Artifacts live under a
    separate `prescans/` root so a prescan directory can never be mistaken for
    an audit one.

    **Direct metrics were proved before anything was built on them,** because
    nothing in `packages/scanner/src` measured performance and the slice had a
    STOP condition if they proved unreliable. Buffered `PerformanceObserver`s
    read after load give CLS, long tasks, and LCP without a second navigation;
    bytes and request counts come from Playwright `response` events rather than
    Resource Timing, which reports `transferSize: 0` for cross-origin responses
    without Timing-Allow-Origin and would undercount exactly the third-party
    weight worth reporting. That listener must be attached before navigation,
    which is why `renderDiff` gained one additive `onRenderedPageCreated` hook.
    Two results are worth keeping: the long-task observer was verified against
    a deliberate 500ms block and reported 400ms (500 minus two 50ms
    thresholds), so its zero on a fast page is a real zero and not a broken
    observer; and **on a static fixture LCP is the only metric that
    varies** (140-260ms), every other metric being deterministic given the same
    observation window - which makes the window part of the measurement and is
    why it is recorded alongside the numbers.

    **That determinism does not survive contact with a real site, and the first
    live prescan measured how far.** Two runs of lacoorniche.com minutes apart
    agreed exactly on the axe facts (5 violations over 27 elements on the
    content page, identical rule IDs) and to within 0.003 percent on transfer
    bytes, but differed on request count (194 vs 196), third-party requests (58
    vs 60), main-thread blocking (1483 vs 1527ms), CLS (0.0050 vs 0.0070), and
    LCP (11060 vs 11244ms). A page pulling 60 third-party requests through a
    consent manager, a captcha, two booking widgets, and an analytics stack has
    no fixed byte count. Scoring must therefore treat every *metric* as
    approximate and band it, not just LCP; only the axe facts are exactly
    reproducible. Bands, not thresholds a re-run can cross.

    **Page-role selection orders candidates by path depth first, lexicographic
    second.** A plain lexicographic tie-break picked `/en/book.html` over
    `/reservation.html` on a French fixture, which would have measured the
    English translation of a French hotel's site and shown a French hotelier
    evidence about pages their guests do not use. A translated subtree is
    always deeper than the page it translates, so depth-first lands on the
    primary-language page without guessing language from URL shape, which
    trade-off 24 already forbids. The order stays total and deterministic,
    which is what makes two prescans of an unchanged site comparable. Off-site
    booking links are recorded as evidence and never scanned.

    **A prescan is inserted, never upserted** - a re-run is a new observation
    with new measurements, the `persistAnalysis` side of trade-off 5.
    Idempotency comes from the job's default skip at the current
    `prescanVersion`, not from a key.

    **No `prospects` event is emitted, reversing the expectation
    `hotel-qualification.schema.ts` recorded.** `prospects` is the milestone 9a
    AFNIC funnel's event log and its shape says so: `dataOrigin.domainSource`
    is enumerated to `afnic-fichier-a`, `companyDataSource` to `sirene-stock`,
    and `siren`, `denomination`, and `naf` are required. Atout France carries
    no SIREN, and 2,437 hotels publish no identification on their own site
    either. Emitting anyway means either relaxing those required fields - one
    collection meaning two things depending on which fields happen to be
    present - or fabricating provenance no source supplied. The hotel funnel
    keeps its own collections and `prescans` is the third; joining the two
    funnels is a real design question left to whoever needs a view across both.
    Reasoning is repeated in `packages/store/src/prescans.ts`'s header, where
    the next person to reach for the shortcut will be.

    `--limit` is required for a real `prospect prescan run` and is checked
    before any connection is opened, so an unbounded batch is refused on its
    arguments alone. A dry run is exempt because it contacts nobody: it plans,
    it does not decide.

36. **Hotel outreach evidence is a strict prescan-v2 contract over two logical
    assets, not a public view of scanner output (2026-08-27).** Stored v1
    prescans remain readable without evidence; every v2 scanner and job result
    requires it. The evidence object can represent only a raw/rendered composite
    and a measured specific-failure crop. Captured assets carry verified PNG
    dimensions, byte count, SHA-256 content address, coarse page role, an opaque
    fact reference, fixed bilingual alt text, and a closed selection reason.
    Omitted assets carry one closed reason code. Three to five public summaries
    are selected from a fixed bilingual allowlist. Their schema has no place for
    selectors, exact URLs, rule IDs, finding IDs, arbitrary prose, legal
    conclusions, or statistics.

    **Amended 2026-08-28, evidence schema version 2, prescan version v3.**
    `complete` originally required *both* assets plus at least three summaries.
    The first batch of 25 real hotels measured that rule at 7 complete and 18
    incomplete, and the stored records named the cause precisely: 17 of the 18
    had a captured failure crop and three or more summaries, and were rejected
    only because their `renderComparison` was omitted with reason
    `no-material-render-gap`. Exactly one hotel had nothing to show at all.

    The rule was wrong in a way that only a real population could reveal. A
    render composite is proof of a *render* problem; it is produced only above
    `HOTEL_RENDER_GAP_THRESHOLD_PERCENT` (20 percent), and an ordinary
    server-rendered hotel site cannot produce one because it does not have that
    defect. Requiring it of every hotel meant demanding evidence of a fault the
    site does not have, and discarding the measured accessibility failures we
    did photograph. The campaign was silently limited to the JavaScript-heavy
    minority of its own qualified population, about 28 percent.

    `complete` now requires the measured failure crop and at least three
    summaries; the render composite is a bonus asset when a genuine gap exists.
    Nothing else widens: `selectHotelRenderEvidence` and the 20 percent
    threshold are unchanged, so the composite still means what it always meant,
    the summary allowlist and the three-summary minimum are unchanged, and the
    prohibition on selectors, URLs, rule IDs, prose, legal conclusions and
    statistics is untouched. Anything short of the crop and three summaries is
    still explicitly `incomplete` and unavailable to plan 006 selection.

    Measured effect, 2026-08-29: a 120-hotel batch at prescan v3 produced 106
    evidence-complete against 13 incomplete and 1 failed, an 89 percent
    completeness rate against the old rule's 28 percent on the same kind of
    population. 5 of the 120 were `homepage-unreachable`, a 4 percent catalogue
    attrition rate the 25-hotel batch was too small to show. The 13 remaining
    incomplete are the honest case the rule still excludes: no qualifying
    failure could be photographed.

    Two process notes worth keeping. First, the two-asset requirement had **no
    test asserting it**: every existing case omitted the crop, never the
    composite, so both suites passed unchanged after the rule was widened. The
    replacement tests were confirmed to fail against the old rule before being
    kept. Second, v2 records are not rewritten. A prescan is inserted, never
    upserted (trade-off 35), and a stored status must have been produced by the
    code whose rule it claims to follow, so the version bump is what separates
    the two definitions rather than an in-place recompute.

    `prescanSite` remains the one scanner operation. Core owns only the strict
    contract and pure ordering policy; browser geometry, annotation, Chromium
    composition, downscaling, content promotion, and failure seams stay inside
    the prescan deep module. This keeps the scanner interface smaller than the
    implementation and avoids a new image dependency. Axe counts retain every
    reported rule, but only deliberately allowlisted rules can become public
    summaries or crops. Interactive keyboard and form checks run only when a
    distinct booking page is selected, and structured-data facts come from the
    already-rendered pages.

    Final bytes are each capped at 1 MiB and together at 2 MiB. Atomic promotion
    writes `evidence/<sha256>.png` only after hashing and verifies the stored
    bytes before returning a reference. All raw/rendered page captures and
    temporary candidates are then deleted. Artifact expiry is prescan start plus
    90 days; each batch performs a bounded root-validated sweep, and
    `prospect prescan cleanup --limit <n>` exposes the same operation as a dry
    run unless `--apply` is explicit. Failed database insertion removes the
    now-unreferenced prescan directory; a missed candidate pointer after a
    successful insert retains it.

    The authorized lacoorniche.com acceptance run loaded two pages and produced
    a complete contract with a 253,693-byte composite, a 6,124-byte crop, and
    five summaries. Visual review accepted the composite and rejected the crop:
    a target at the viewport edge reduced the frame to 104 by 104 pixels and
    clipped its label. Clamping now shifts a minimum contextual frame inside the
    viewport instead of shrinking it at the edge. The measured annotation uses
    an integer-aligned temporary border and waits two animation frames before
    capture, avoiding native rounded-border and repaint races without image
    quantization. Local visual and concurrent deterministic browser tests pass,
    and the one live-run authorization was deliberately not stretched to cover
    the fix.

    **Closed 2026-08-28.** A separately authorized rerun, routed through the
    queue so the per-origin lock and crawl delay applied, retained a
    490,365-byte composite and a 44,505-byte crop against the rejected run's
    6,124. The crop is the full 240 by 160 contextual frame with its criterion
    label completely legible, and it proves its paired observation rather than
    merely showing a location: the outlined region is visually empty precisely
    because the finding is a button with no accessible name. Plan 005 is `DONE`.

    That read also found the public summary list stating one claim twice: the
    dedupe was keyed on rule-and-role, while the observation text is a function
    of the rule alone, so one rule firing on two roles printed the same sentence
    twice and spent two of five slots on it. The key is now the rule. A site
    whose third summary was only a duplicate is now correctly `incomplete`
    rather than complete on a repetition, which is the conservative direction:
    three distinct things worth saying is what the contract is asserting.

37. **A redirect off the declared domain is classified by counting
    establishments, not by comparing names (2026-08-28).** Qualification v1
    rejected every off-domain landing as `redirect-offsite`. Measured against
    the real catalogue, that was wrong for the large majority: of 341 distinct
    redirect targets behind 383 rows, 18 are shared by several establishments -
    the chains the rule was written for - and 323 are hit exactly once,
    overwhelmingly a hotel that renamed itself. `lacoorniche-pyla.com`
    redirecting to `lacoorniche.com` is one hotel, one owner, one new name, and
    v1 discarded it.

    The evidence that separates the two cases is the one trade-off 33 already
    uses for group routing: a domain several establishments share is a chain's,
    a domain exactly one establishment holds is that establishment's own.
    `classifyRedirectTarget` in `core` applies it to redirect targets and takes
    a count rather than a name, because no string comparison can tell
    `accor.com` from `lacoorniche.com`. The curated vendor-host list still
    outranks the count, so a vendor host reached by one hotel is still a vendor
    host - it decided nothing on today's data, where no redirect target is on
    the list, and it stays because the list is the authority the moment one is.

    **The count spans the whole catalogue, not only the redirect rows.** Eleven
    of the 323 single-hit targets are a domain another candidate already
    declares as its own - `mandarinoriental.com`, `tribehotels.com`,
    `fontenille-collection.com` among them. Those are acquisitions, and counting
    redirects alone would read each as a rename and put two establishments on
    one domain, which trade-off 33 rules out as an identity key. A declared
    owner therefore counts as an establishment exactly as a redirect does,
    which is what takes the recoverable population from 323 to 312.

    The classification is a second pass (`reconcile-redirects.ts`), not a fix
    inside `qualify-hotels.ts`, because that pass is streamed in pages of 200
    across concurrent lanes and never holds the run. It reads the stored
    verdicts, counts every target before classifying any row, routes shared and
    vendor targets to the group queue with the group size as evidence, and for
    a single-establishment target adopts the domain and re-runs the same cheap
    checks against it. It never concludes that an adopted domain is a live
    hotel site: a single-hit target can still be parked or for sale, and the
    existing parked-page detection answers that from the page. The adopted
    domain is recorded with `domainProvenance: 'redirect-adopted'`, the
    declared one is kept beside it, `identityKey` is never rewritten, and every
    verdict on an adopted domain carries the note
    `domain-adopted-after-redirect` whatever its outcome.

    Because the run-wide count now decides, v1's per-candidate same-name
    heuristic had nothing left to do: `redirectedToRelatedDomain` and the
    `domain-moved` parked reason are both removed rather than left dressed and
    dead, the sweep trade-off 31 asks for. The probe records where a redirect
    landed and stops there.

    **Copy-forward is what makes the version true, not bookkeeping.**
    `listCandidatesToPrescan` filters on `qualification.qualificationVersion`,
    so a v2 generation holding only the reconciled rows would silently shrink
    the prescan population from thousands to a few hundred and look like a
    correct filter while doing it. The pass writes one v2 row per v1 row, and
    the CLI fails the run when those two counts differ. A v2 generation is
    therefore produced by two commands, `hotel-qualify run` then
    `reconcile-redirects`; an unreconciled v2 still carries v1's redirect
    verdicts and must not be read as final.

    The re-probe is bounded by `--limit` like every other batch, while the
    classification and the copy-forward describe the whole population - a plan
    that reported only what a limit happened to reach would be the same
    confident-and-wrong number `qualify-hotels.ts` already records avoiding.

    **Run of record, 2026-08-28.** The real pass read 13,301 rows, classified
    384 redirect rows (383 with a landing URL), re-probed the 312 adopted
    domains under non-negotiable rule 5 with no browser, and wrote 13,301 v2
    rows of which 12,918 were copied forward untouched. The adopted domains
    became 275 qualified, 35 rejected on their own merits, and 2 already
    engaged, taking the qualified population from 5,720 to 5,995. Neither
    generation was destroyed: `hotel_qualifications` is keyed on
    (`qualificationVersion`, `candidateId`), so the v1 table remains queryable.
    The pointer on the candidate is single and current, so a prescan dry run
    against v1 now plans zero pages - the pointer working, not a lost
    generation. This does not reopen binding decision 3: the operator declined
    Overpass on reasoning independent of the shortfall's size.

38. **Outreach scores are immutable and versioned; the cohort is a
    separate generation, not a field on the score (2026-08-28).** Plan 006
    needed a score that can be recomputed and compared without corrupting what
    an earlier run concluded, and a selection that can be re-run without
    rewriting scores. Both are insert-only: `hotel_scores` keyed on
    (`scoringVersion`, `candidateId`, `computedAt`) with a deliberately
    non-unique index, and `hotel_score_cohorts` holding one document per
    selection run. Writing `selected` onto the score would have made the
    selection destroy its own history the second time it ran, which is the same
    reason prescans are inserted rather than upserted (trade-off 35).

    **Worthiness is a new prescan-side predicate, not a reuse of the cost
    gates.** `isProspectingWorthy` and `computeBrokennessScore` read `Finding`
    objects, and a prescan deliberately produces none - it is a distinct path
    that never calls the normalizer. Reusing them would have meant either
    manufacturing findings from prescan pages or widening the gates' input,
    and trade-offs 6 and 23 exist to keep those gates stable. `packages/core/
    src/prospecting/hotel-outreach-score.ts` therefore holds its own pure
    `isHotelOutreachWorthy`, and `cost-gating/brokenness.ts` is byte-for-byte
    unchanged. Two predicates that look similar are the correct answer when
    they read two different kinds of evidence.

    **The `hotel-outreach-v1` weights are operator-approved**, which is what
    lets the selector emit `selected` rather than `calibration` only. The
    configuration carries `approved` explicitly, so an unapproved future
    version still ranks and reports but writes no cohort. Every nonzero weight
    maps to one stored fact, a missing fact scores zero and records an
    `unknown` reason rather than being read as false, and metrics are banded
    rather than compared exactly, because trade-off 35 measured that every
    prescan metric drifts between runs while the axe facts do not.

    **No `prospectId` on a score.** The hotel funnel emits no `prospects`
    events for the reasons `prescans.ts` records at length, and a pointer into
    a collection this funnel never writes would be the same ambiguity plan 003
    declined to create.

    **The market aggregate is an operator signal, not a campaign.**
    `getPrescanVendorAggregate` counts booking hosts, booking mechanisms, and
    recurring failure rules per hotel, and drops anything below a minimum group
    size, because a fingerprint seen once is a fact about one identifiable
    business rather than a fact about the market.

    **Run of record, 2026-08-28.** The database holds one v2 prescan, so the
    scorable population is one. Reported as such. Ability's heaviest component,
    `direct-booking` at 30 points, is read from the cheap qualification pass's
    `siteFacts.reservationUrl`, which is undetected across much of the
    population, while the prescan does record `bookingEvidenceKinds` from a
    booking-role page. Widening the fact source would change what an approved
    weight means, so it belongs to a `hotel-outreach-v2` and an operator
    decision, not to an in-place edit.

39. **A contact is discovered for the selected cohort only, and a missing one
    is a typed absence rather than a null (2026-08-28).** Plan 007 needed one
    professional address per hotel the campaign has actually selected, and
    needed the hotels it cannot write to to say why.

    **The prohibition is structural, not a filter.** `discoverRoleContact` in
    `packages/core/src/prospecting/discover-role-contact.ts` can only ever
    return a local part from `role-address.ts`'s allowlist, so a named address
    such as `prenom.nom@` has no code path to a return value at all. That is a
    stronger reading of docs/prospect-qualification.md section 6's "not
    collected, stored or used" than capturing an address and discarding it
    later, and it is why the function returns an allowlisted local part rather
    than an arbitrary string. `hotel_contacts` correspondingly has no field a
    named contact, a phone number, or a verification vendor's verdict could
    occupy.

    **Four absences, not one null.** `no-address-published`,
    `named-local-parts-only`, `free-mail-only` and `off-domain-only` mean
    completely different things about a hotel: one publishes nothing readable
    without JavaScript, one publishes only people, one has no professional
    mailbox, and one is reachable only through an intermediary. Collapsing them
    into `null` would throw away the only information that tells them apart,
    and the campaign would have no way to know whether looking again could ever
    help. The same reasoning as `DeclaredWebsiteResolution`'s union in
    `hotel-domain.ts`.

    **The allowlist is ordered, and the order is the decision.** A hotel
    routinely publishes several role addresses on one page, and which one is
    picked decides who reads the email. `direction@` is a decision maker;
    `reservation@` is frequently an automated booking-engine inbox and
    `accueil@` reaches a front desk. `direction`, `reception`, `accueil`,
    `reservation` and `reservations` were added for this campaign on operator
    approval, ranked below every address that reaches somebody who can act on
    an audit, and the run report breaks found contacts down by local part so
    that mix is readable before plan 011 drafts against it. Widening the
    allowlist again is a new `contactVersion`, never an in-place edit, for the
    reason `CURRENT_QUALIFICATION_VERSION` records.

    **One implementation, both funnels.** The shipped 9a
    `extractContactAddress` became a thin adapter over the same core function
    rather than a second predicate alongside it. Two consequences were accepted
    deliberately: the AFNIC funnel now returns the best-ranked address on a page
    rather than the first printed, and an address on a subdomain of the
    company's own registrable domain is now accepted where exact host equality
    used to reject it. Both are the honest reading of the canonical rule, and
    one implementation cannot drift from itself.

    **MX is a fact about the domain, never about the mailbox.** `resolveMx`
    through the system resolver reads a public record and sends nothing to the
    hotel's mail server; SMTP probing, catch-all classification and
    verification vendors stay forbidden. A domain with no MX parks the row and
    *keeps* the address, because the hotel did publish one and an operator
    reading a parked row needs to see what was found. A resolver failure is
    `unknown` and never parks: a timeout is not evidence about a hotel.

    **Suppression is asked twice, and they are different questions.** Once
    before fetching, so a suppressed hotel receives no request at all, and once
    immediately before persisting, against the discovered address as well as the
    domain - an address-level opt-out cannot be tested before there is an
    address, and a batch over thousands of sites runs long enough for an opt-out
    to arrive mid-run. A suppressed row keeps no address.

    **Three requests, and the population is a cohort.** Homepage, mentions
    legales, contact page, behind the shared `OriginLock` and the crawl delay
    that non-negotiable rule 5 requires, with the mentions legales URL reused
    from the stored plan 003 qualification so it is not rediscovered - the
    request itself cannot be saved, because `HotelSiteFacts` stores derived
    facts and prescans store no page text. `listCohortMembersToContact` is
    deliberately the only reader, and there is no "every qualified hotel" entry
    point beside it, because plan 007's own scope line is that no contact
    happens before scoring selection.

40. **A derived document fails closed on provenance, and five legal-copy rules
    the paid report had been breaking (2026-08-29).** A report read-through
    against a real Haaitza scan produced fifteen findings in
    `plans/report-findings.md`; the five marked P0 are resolved here, and until
    they were, the ledger's own instruction was that no report generated from
    current code could be sent to a client.

    **The provenance problem, plainly.** Findings are renumbered whenever the
    normalization layer changes what it emits or in what order (numbered entry
    32). An analysis and a PDF are both derived from a particular findings file,
    but nothing recorded which one. So a PDF rendered last month could be handed
    to a client this month describing finding 14 as a missing page title when
    finding 14 had since become something else entirely, and nothing in the
    document or the database would say so. It is the same hazard as quoting a
    page number from an edition of a book that has been reset.

    The fix is a stamp, not a check at read time: `findingsProvenance` on the
    manifest, on every analysis, and on every stored report, carrying the
    findings schema version, the normalization fingerprint, and a digest of the
    findings themselves. `packages/core/src/normalize/findings-provenance.ts` is
    the single place that computes and compares one; the interface's analysis and
    report stages assert through it rather than reimplementing the comparison.
    **Fail closed, not fail quiet:** an artifact carrying no provenance at all is
    refused with an instruction to renormalize and regenerate, rather than
    trusted because it is old. Refusing a legacy artifact is cheap; shipping a
    stale one to a paying client is not.

    **Five copy rules.** Each was observed in a rendered document, not inferred.
    None of them is a wording preference: all five are non-negotiable rule 6, "we
    report, we do not conclude", failing in a specific place.

    - No client-specific criteria verdict. The report printed "Criteres reunis"
      against a named business, which is a conclusion that a law binds it.
    - No exemption filing route. Naming Demarches Simplifiees tells the reader
      what procedure to start, which is advice about their own legal position.
    - No client-specific sanction figure. A euro amount beside a client's name
      reads as their exposure, whatever the surrounding hedge says.
    - No superseded citation. LCEN article 6-III was replaced by article 1-1, I,
      2 post-SREN; recommendation copy still cited the old one.
    - Accessibility-statement publication is conditional. "Publish a statement"
      became an unconditional action even where the Article 47 regime had not
      been independently established.

    The CrUX label fix belongs to the same read-through: field data reports the
    75th percentile, and calling it a median misstates what the number is.

    **Two things this exposed that were not in the ledger.**

    *All three committed de-identified fixtures were stale, not one.* The
    expected staleness was superseded LCEN copy, which only
    `large-rule-families` carried. The real gap was that `small-site` and
    `multi-page` carried no `findingsProvenance` at all, so the new fail-closed
    check refused them, and `packages/cli/src/report-env-loading.e2e.test.ts` -
    which copies `small-site` and runs the real CLI - went red. Committed
    fixtures do reach the pipeline's assertions; the earlier belief that they
    could not was wrong. `scripts/deidentify-audit.mjs` was itself the root
    cause: it rewrote findings while copying the source's provenance stamp
    verbatim, producing a fixture that failed its own digest check. It now
    derives the stamp through `buildFindingsProvenance` and synthesizes an
    `analysisId` the same deterministic way it already synthesized an `auditId`,
    so a fixture's provenance always describes its own findings.

    Numbered entry 34 says never hand-edit a fixture, and the source-to-fixture
    mapping is deliberately unrecorded. Both held: each source was recovered by
    a unique `finishedAt` match and each redaction token by aligning source
    strings against the committed pseudonyms, then every rebuild was proved
    equivalent to what it replaced rather than assumed to be. `multi-page`
    reproduced with zero content differences under a pure renaming of the
    pseudonym ordinals; `small-site` with one, and that one is a repair - the
    previous build had redacted the place name "pilat" inside the English word
    "Compilation", corrupting a Lighthouse group label to name nobody. Ordinal
    renumbering is safe only because nothing in the tree references a numbered
    fixture slug, which was checked rather than assumed.

    *The Lighthouse failure line printed the tool's own error text.* Where
    Lighthouse fails on a page, the methodology section summarized the cause by
    quoting the internal message, so a client document could read "worker exited
    before returning a result (code 1, signal null)" - naming a private function
    and a process exit signal, and printing a stringified null that the render
    lint exists to catch. Grouping now happens on a translated cause rather than
    on the raw string, so the two spellings of a stopped worker collapse into one
    line instead of two. Four causes cover the 420 real failures observed in
    stored scans: browser unreachable (301), worker stopped (112), timeout (7),
    and an explicit unknown for anything else. The unknown branch is the point:
    a message shape nobody has seen yet must degrade to plain language, not leak.


### 41. The Sirene join belongs to the qualification pass, not to identity resolution

**Context.** The hotel funnel has a rule that parks an establishment too small
to plausibly be in scope: fewer than ten employees *and* a small capacity. The
employee half comes from INSEE, and INSEE is asked by SIREN. Identity resolution
was the pass calling the joiner, and identity resolution runs before anything has
visited the hotel's website. The Atout France export carries no SIREN column, so
that call could only ever be made with `undefined`.

**Measured 2026-08-29 against the live catalogue.** Every one of the 13,301
candidates carried `sireneJoin.status = 'stock-file-unavailable'`, and 3,482 of
them - 3,472 of the 5,995 qualified, 58 percent - already had a SIREN sitting on
their qualification row, read off their own published identification by the site
probe. So the identifier existed for well over half the population, and nothing
had ever been asked about any of it. The effectif rule had never fired for a
single hotel, and the `effectif` scoring component had been zero for the whole
cohort. Two separate defects, not one: the join was called with nothing to look
with, and there is no INSEE stock file on this machine to look in.

**Decision.** The join moves onto the qualification generation, and the
qualification version bumps to `v3`.

- `qualify-hotels.ts` asks INSEE only when its own probe recovered an
  identifier, and writes the answer onto the qualification record. It does not
  call the joiner with `undefined`: "we never had anything to look with" is said
  better by an absent join than by a join reporting an absence.
- The join is *not* written back onto the candidate. A candidate is a
  resolution-generation document; a fact discovered by a later pass does not
  belong to an earlier generation, and writing it there would leave two
  generations disagreeing about one hotel. `HotelSireneJoin` and its Mixed
  schema field moved from the candidate to the qualification accordingly, and
  `sireneJoin` left `REFRESHABLE_FIELDS`.
- `score-hotels.ts` reads `effectifBandCode` from the qualification through
  `getQualificationFacts`, which now returns the site facts and the join
  together.
- The joiner is built once in the CLI rather than per candidate, so a missing
  stock file is reported at startup with what its absence costs, not silently.

**Not a new scoring version.** The `hotel-outreach-v1` `effectif` weight always
read `effectifBandCode`; it was specified correctly and starved of input.
Supplying the input it was written to read is not the "broadening what a weight
reads" that trade-off 38 forbids. Scores are insert-only, so a re-score is a new
generation under the same approved weights.

**Parked, deliberately.** `data/sirene/` is empty on this machine, so the v3
backfill and the re-score cannot run yet. The code is wired and tested with an
injected joiner; the run waits on the operator placing
`data/sirene/stock-unite-legale.csv` (or setting `ODYSSEUS_SIRENE_STOCK_PATH`).
Until then every join reports `stock-file-unavailable`, which is a fact about the
operator's inputs and must never be read as a fact about a hotel - which is
exactly why that status stays distinct from a miss.


### 42. The outreach preview is a separate document kind, and its safety is structural

**Context.** Cold outreach needs one credible place to send a prospect that
shows their own evidence without giving away the paid report and without making
a legal conclusion. The tempting implementation is to render `GenerateReportInput`
with things removed.

**Decision: start from nothing.** `OutreachPreviewInput`
(`packages/core/src/types/outreach-preview.ts`) shares no type with the paid
report and admits only what `docs/outreach-rules.md` permits. Every object is
`.strict()`, and that is what actually rejects a finding ID, a selector, an
exact URL or a statistic: they have nowhere to be put, so no scrubbing pass has
to be correct. A preview built by projecting the report input would be one
careless spread away from publishing all of it. **Do not spread a paid report
object into a preview input.**

**Five layers, each separately tested.** Strict objects; closed vocabularies
(observations validate against the *exported* allowlist in
`hotel-prescan-evidence.ts`, never a copy, so one document cannot print a
sentence the other already rejects); an https-plus-host-allowlist URL policy,
which is what makes "no remote asset, no tracker" enforceable rather than
aspirational; image bounds reusing the evidence contract's own caps; and
`containsProhibitedPreviewContent` over free text. `generateOutreachPreviewHtml`
validates before rendering and runs the same guard over its own finished output,
throwing on any hit, because a template can compose two safe strings into an
unsafe sentence and a bad public document is worse than no document.

**The contract lives in `core`, not `report`.** `packages/report` has no `zod`
dependency and adding one is a package-seam change. More decisively, plan 010's
prose validator lives in `llm`, which depends on `core` and nothing else in the
workspace: a contract held in `report` would be unreachable there and would get
re-typed as a literal. Rendering stays in `report`; the public surface is
unchanged because `@odysseus/report` re-exports both.

**The offer price is a constant, not a field.**
`ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT` with `formatFullAuditPrice()`, in
`packages/core/src/offer/pricing.ts`. Because the schema is strict, a caller
passing a price is *rejected*, which is what "sourced from one code-owned
constant" has to mean to be worth stating. The formatter does not use
`Intl.NumberFormat` output directly: French ICU emits U+202F, which trade-off 29
records as a missing-glyph risk and which ICU has changed before, so a price
whose bytes track the host's ICU version could not be asserted exactly.
`ODYSSEUS_REAUDIT_PRICE_EUR_HT` deliberately stays in `report` - it is only ever
rendered by the paid report.

**PNG only, narrower than the plan text.** Plan 008 permitted
`data:image/webp`. The shipped evidence contract is PNG end to end, so nothing
in this repository can produce a webp; accepting one would create a code path
with no producer and widen a contract trade-off 36 says not to widen.

**Argument B is enabled for hotels, as a general reading.**
`docs/obligation-basis.md` carries hotels at `secondary` and states the facts
block may be used with them on the same terms as any other online shop, which
supersedes plan 008's older "argument A only" text. It stays behind
`OutreachSourceCapabilities.argumentB` so a sector whose sources have not been
reviewed is one boolean away from a preview with no legal section. The block
never reads `Regime.sanctionCeiling`, never prints turnover, and never states a
verdict whatever status `assessObligations` reached - only the registry facts
vary with it.

**Two measured corrections worth keeping.** The currency guard compares
whitespace-normalized strings on both sides: the French price and the regime
thresholds carry no-break spaces, and any renderer that collapses whitespace
turns them into ordinary ones, so the un-normalized comparison rejected the very
amounts it had approved - a bug that looks like a safety win. And alt text is
rejected at the input rather than escaped through: escaping makes `onerror=`
inert, but an escaped handler still reads as one to the document lint, and
keeping that lint strict is worth more than accepting the string.

**Scope extension, argued.** `embedOutreachEvidenceAsset`
(`packages/report/src/outreach-preview/evidence-input.ts`) is a third public
symbol the plan's file list had no home for. The input carries base64 and the
evidence record carries a `ref` to a file; without it plan 009's publisher must
reimplement the read, the caps and the PNG check. It re-verifies the recorded
sha256, because a file replaced between prescan and send means a preview showing
the wrong hotel's screenshot.


## Build order milestone notes (8.5a through 9c)

Full narrative detail behind the compact "Build order" table in CLAUDE.md.

**8.5a.** Deterministic SEO and GEO (generative-engine-optimization)
detection checks, a new `geo` finding category alongside `seo` — done
2026-08-16. Detection only: no reference data, no report changes, no LLM
prose. See trade-off 14.

**8.5b.** Reference-stat table, sector detection, and per-client revenue
calculator (`packages/core/src/reference-stats/`) — done 2026-08-16. Data
and pure functions only, no LLM/report wiring yet. See trade-off 15.

**8.5c.** Wired the reference-stat table into the paid audit report:
`ObligationAssessment.sector`, deterministic per-theme and geo-section
citations, `geo` added to `CATEGORY_ORDER` — done 2026-08-17. Report-only;
outreach and the numeric revenue calculator remain unwired. See
trade-off 16.

**8.6.** Four detection additions surveyed against third-party audit
tooling (security response headers, a named-AI-crawler robots.txt check,
structured-data validation via `structured-data-testing-tool`, and CrUX
real-user field data via `crux-api`) — done 2026-08-22. Detection only,
scanner/core, no report/LLM wiring; see trade-off 18.

Milestone 9 (originally "prospecting mode") was split 2026-08-15 into 9a
(prospect acquisition and qualification), 9b (prospecting throughput), and
9c (outreach generation); milestones 10 through 13 (benchmark study,
regime 2 documentation generator, free scope check, monitoring) follow. 9a
is done 2026-08-16. 9b is done 2026-08-22: see trade-off 23.

**9b.5: sitemap-supplemented full-site scan coverage.** Done 2026-08-27,
after being queued ahead of 9c on an explicit operator decision made during a real
www.airelles.com audit. That audit's crawler reached 100 pages by
following internal links; the site's sitemap declared 516, and
`sitemap-orphan-page`/`sitemap-stale` correctly flagged that only 1 of the
100 crawled pages appears in the sitemap at all. Checked rather than
assumed: `www.airelles.com` 301-redirects to the bare `airelles.com`, same
server, so this is not a cross-domain split - the crawl genuinely never
reached roughly 80 percent of the site's declared content, mostly the
French-language subtree, because nothing links to it from the English
pages the crawler found.

The operator's call: for a flat EUR 1,600 full audit, the report must do
both jobs, not pick one. State discoverability honestly (a page a site's
own navigation cannot reach is a real defect, and folding sitemap URLs
into the crawl queue would destroy the signal that currently detects it)
and scan every declared page for real defects regardless of whether
internal navigation reaches it (a client is not better served by an audit
that silently skips 80 percent of their site because it happens to be
poorly linked). These are two independent questions computed from the same
two inputs (crawl-reachable set, sitemap set) and must stay decoupled:
reachability is a link-graph fact, scan coverage is a scheduling decision,
and this milestone's whole point is to stop conflating them.

The crawler now owns that separation behind `none`, `inspect`, and
`supplement` modes. It recursively resolves sitemap indexes, records each
fetched document and partial error, admits only the authorized hostname or
its exact www/apex counterpart, and appends eligible sitemap-only pages only
after the link and operator-seed frontier. A configured cap covers combined
attempts and reports omitted sitemap coverage. Page discovery provenance is
stored in manifest JSON and MongoDB, but remains optional for historical
artifacts. `sitemap-orphan-page` and `sitemap-stale` receive only the
link-discovered set, so scanning an orphan cannot erase its reachability
finding. Full audits supplement by default, prospecting uses inspect mode
with its existing three-page link limit, and standalone crawl uses none.

Acceptance used both layers deliberately. The fixture contains a
sitemap-only page with deterministic accessibility defects; those defects
normalize normally while `sitemap-orphan-page` remains present, and cap and
operator-seed tests prove reachability isolation. With explicit operator
permission, an uncapped full audit of haaitza.com then resolved 5 sitemap
documents and 131 eligible page URLs across a recursive index. The crawler
attempted 220 URLs total, analyzed 209, analyzed 130 of the sitemap URLs,
and retained the last sitemap URL as `skipped-external-redirect`; the
coverage summary recorded zero filtered pages, cap omissions, and document
failures. Haaitza currently exposes every sitemap URL through its link
graph, so it correctly produced zero sitemap-only pages and no orphan
finding. Both French and English methodology renders were checked against
that manifest. The larger scan time is accepted deliberately for paid
full-site coverage.

**9c: hotel prospecting and outreach.** The operator's two 2026-08-25
proposal drafts were reconciled against shipped 9a/9b/9b.5 code, canonical
legal and outreach rules, and three operator decisions made 2026-08-27. The
result is the 14-slice execution queue in `advisor-plans/README.md`; the drafts
were removed after consolidation so their superseded choices cannot look
active.

The binding decisions are: hotels first; Atout France's classified-
accommodation export as the sole catalogue, joined to the shipped Sirene
machinery; a hard three-star campaign threshold; and OpenStreetMap Overpass
only if measured usable-domain yield after plan 003 is below 8,000.
DATAtourisme was implemented, measured, then removed because it cannot add an
eligible hotel outside the classification register and Atout France already
provides a website for 99.6 percent of eligible rows. Exact SIRET, SIREN, or
registrable-domain evidence may auto-resolve identity; name plus postcode is
manual-review evidence only.
Prescanning is a distinct three-page, no-Lighthouse path over shared scanner
primitives. Scores are immutable and versioned, and plan 006 shipped them that
way on 2026-08-28 with operator-approved `hotel-outreach-v1` weights and a
separate cohort generation; see trade-off 38. Contacts are role addresses on
the hotel's own domain only. Operational prospect data expires after 90 days;
permanent suppression stores hashes only.

Two proposed packages, a mutable prospect registry, fuzzy auto-merge, named
contacts, three-year retention, phone outreach, automatic SMTP/IMAP sequences,
and Atlas/VPS/Tailscale migration were rejected. Logic stays within the eight
existing package roles. Gmail integration may create and inspect drafts but
has no send method; every send remains manual. Public previews have their own
minimal HTML contract, expire, disclose collection and opt-out facts, and
contain no raw audit detail or legal conclusion.

**Screenshot retention was resolved by plan 005.** The first live prescan wrote
18 MB of generic screenshots for two pages. Prescan v2 retains none of them:
finalization keeps only one content-addressed raw/rendered composite, one
content-addressed measured failure crop, and a minimal expiry manifest. The
paid-audit `prune-screenshots.ts` rule remains the sole owner of audit screenshot
retention. Reusing it here would be wrong because it deliberately retains a
homepage screenshot pair, while the public prescan contract forbids generic
screenshots entirely.

**Resolved 2026-08-28, as qualification v2.** Qualification v1 rejected every
redirect that left the declared registrable domain, conflating "this domain now
belongs to an OTA, a vendor, or a group" with "this hotel renamed itself". The
distinguishing evidence was the one trade-off 33 already uses for group routing,
and the fix applies it: a redirect target several establishments reach is a
chain's, a target exactly one establishment holds is that hotel's own. Measured
over the stored v1 verdicts, 384 rows carried a redirect verdict, 383 of them
with a usable landing URL, across 341 distinct targets: 71 shared and 312 held
once. The remaining row recorded no landing URL and keeps its v1 rejection. The operator-named verification site was among the 312, where Atout
France's declared `lacoorniche-pyla.com` redirects to the same hotel's
`lacoorniche.com`. The rule, the reason the count spans the whole catalogue
rather than the redirect rows alone, and why the parked `domain-moved` state was
removed rather than relabelled are all in numbered entry 37.

Legal copy remains source-gated: hotel-specific material in
`docs/obligation-basis.md` cannot enter a real draft until it reaches primary
status. Source schemas/licences, score weights, preview storage, Gmail OAuth,
mailbox setup, live deployment, and every named-site scan remain explicit STOP
gates in the relevant numbered plans. The first real wave cannot land before
2026-09-15. Paid full-audit sitemap coverage from 9b.5 remains independent of
this prospecting path.
