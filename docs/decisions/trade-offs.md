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
   `docs/rules/manual-accessibility-checklist.md` as a confirmed axe detection
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
   reasoning in `docs/rules/llm-layer-rules.md` section 10. Both gates score
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

   **Amended 2026-09-03, issue #36.** `writing-output-schema.ts` is now
   built per call (`buildWritingOutputJsonSchema`) rather than declared,
   so the theme keys that call shows become the response's own required
   properties. It stops being a literal mirror; it does not stop being a
   shape hint, and `writingPassOutputSchema.parse()` is still the
   authority. Full reasoning and the incident: entry 70 below.

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
   `docs/archive/report-v2-refactor.md`.

9. **`packages/report`'s template is hand-maintained CSS, not Tailwind**,
   since the 2026-08-07 refactor. The compiled-Tailwind approach from
   milestone 6 is gone: no `tailwind-input.css`, no `build:css` script, no
   `tailwindcss`/`@tailwindcss/cli` dependency. `report.css` is written
   directly. It went through two dark-theme generations: a
   GlassWire-inspired reskin on 2026-08-07 (`docs/product/odysseus-project-brief.md`,
   "Post-7.1: scan concurrency and reskin"), then a full retokening on
   2026-08-16 to match the full-audit and outreach-preview designs. The
   readable flattened sources now live at
   `docs/report/design/report-mockup-standalone.flat.html` and
   `docs/report/design/report-mockup-preview.flat.html`; they supersede the opaque
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
    in-process queue even though the lanes themselves run in parallel.
    `scanConcurrency` is recorded on `AuditConfigSnapshot` for the same
    provenance reason other scan config fields are.

    **Why the queue exists, restated 2026-09-07 (plan 026 Step 7).** The
    original reason is gone and this entry used to still cite it. Concurrent
    `lighthouse()` calls did collide on Node's process-global `perf_hooks`
    marks, 100% reproducible against the spa-demo fixture and unrelated to the
    CDP debug port each lane connects to separately. That collision was
    structurally removed when the call moved into a forked child process
    (`lighthouse-isolated.ts`, for an unrelated OOM-crash reason): each fork
    gets its own fresh globals, so two forks cannot step on each other's
    marks. "Re-confirm the collision is gone" is therefore a bar that is
    trivially met, and anyone who met it would have been pointed at the wrong
    risk.

    Two real justifications remain, and they are what a future removal has to
    answer:

    - **Memory.** Removing the queue means N Lighthouse children at once, each
      holding a Chromium page load's worth of memory, instead of one. The
      existing 1024 MB per-child heap cap is the unit that gets multiplied.
    - **Measurement validity, the stronger one.** Lighthouse is the only pass
      in the audit that measures time. Its throttling observes how long real
      work takes and scales it up to model a slower device, so sibling runs
      competing for the same cores do not scatter noise around a true value,
      they bias every number in the same direction. The numbers we would be
      biasing are Core Web Vitals figures shown to a paying client.

    Plan 026 resolved neither: its Step 6 was dropped without being attempted,
    because Step 0 measured that the audit is slow for a different reason
    (every page is a Lighthouse page, see entry 74's classification finding),
    so unqueueing would only process a needlessly large workload faster. Do
    not remove the queue to "let Lighthouse run in the lanes too" without a
    measured drift budget on the metrics the client is shown, compared serially
    against concurrently on the target machine, and a peak-RSS figure.

11. **Argument B (the legal content) is a deterministic splice, in both
    the report and outreach, never model prose**, decided 2026-08-15
    alongside `docs/rules/obligation-basis.md`, `docs/rules/operator-obligations.md`,
    and `docs/rules/outreach-rules.md`. `assessObligations()` produces the
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
    (`docs/rules/offer-positioning.md`). The paid EUR 290 screening tier from
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
    sent to cold prospects (milestone 9c, `docs/rules/outreach-rules.md`). It is
    not a lighter tier of the full report and must not be built as one: it
    has its own content rules, and in particular never contains selectors,
    finding IDs, or exact page locations, the way the old screening tier
    did. Give it its own render path rather than a new branch on
    `renderHtml`. It is also a likely first-contact artifact under RGPD
    article 14, so it must carry the same identity/data-origin/purpose/
    opt-out disclosures `docs/rules/outreach-rules.md` section 7 requires of any
    first-contact message, not assume an accompanying email carries them.

13. **Full audit price raised from EUR 300 HT to EUR 1,600 HT**, decided
    2026-08-16, same day as trade-off 12 (`docs/rules/offer-positioning.md`,
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
    price mentions in `docs/product/odysseus-project-brief.md` were updated to
    EUR 1,600 HT along with the canonical source; only the "why the
    prices are not being raised" reasoning in `docs/rules/offer-positioning.md`
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
    the rows `docs/research/business-impact-statistics.md` tags "SAFE TO CITE BY
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
    `docs/rules/prospect-qualification.md` section 4 forbids citing to a
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
    `docs/rules/llm-layer-rules.md` section 11's "No statistics" rule for
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
    `isProspectingWorthy` (`docs/rules/llm-layer-rules.md` section 10, CLAUDE.md
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

    **Amended 2026-09-09, issue #162.** The documented gap in the first
    finding above is now closed explicitly: the analysis stage
    (`packages/interface/src/pipeline/analysis-stage.ts`) evaluates
    `isAuditFallbackEligible` on the audit's full findings and, when it
    holds, skips the structure, writing, correction-review, and
    shadow-review passes, persists the analysis with a
    `generationMode: 'static-fallback'` marker, and the report renders a
    static bilingual note instead of the model-written prose. The
    predicate and its thresholds are unchanged.

    Second: enabling hospitality NAF codes for prospecting (an explicit
    ask this session, alongside the throughput work) surfaced that
    `docs/rules/prospect-qualification.md` section 4 had gone stale relative to
    `docs/rules/obligation-basis.md`. Section 4 originally excluded hotels from
    the first wave because "accommodation booking is a reading rather than
    a settled position" - true when written, but `docs/rules/obligation-basis.md`'s
    own "Hotels and accommodation" entry was later upgraded from
    `disputed` to `secondary` and now states hotels are "on comparable
    legal footing to a standard online shop" for outreach purposes, with
    the first-wave exclusion being about volume and framing sequencing,
    not legal weakness. `naf-sector-allowlist.json` now enables 55.10Z
    (hôtels) and 55.20Z (hébergement touristique de courte durée,
    covering chambres d'hôtes) at `definitional` confidence on that basis;
    `docs/rules/prospect-qualification.md` section 4 was updated to match rather
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
    emits only EAA and article 47. Meanwhile `docs/rules/obligation-basis.md`, the
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
    conclusion. `docs/rules/obligation-basis.md` section 8bis carries the verified
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

    **A pipeline run aimed at a fixture directory writes into it, and only half
    of that is visible (2026-09-02, issue #24).** Four timestamped analysis
    JSONs appeared under `large-rule-families/analyses/` during a session and
    were first read as something a vitest run had done. It was not: instrumenting
    every `fs` write path during a full `vitest run` (355 files, 3502 tests)
    recorded no write into `fixtures/test-audits` at all, only `cp` and
    `copyFile` taking the fixture as a *source* - `report-env-loading.e2e.test.ts`
    copying it to a `mkdtemp` before running the CLI against the copy, which is
    the correct pattern already in place. What actually ran was an ordinary
    analyze-then-report pass pointed at the fixture: the same directory's
    `reports/` folder holds the French and English PDFs rendered ninety seconds
    after those analyses, stamped with the same commit. `reports/` is gitignored
    and `analyses/` is not, so the PDFs left no trace and the analyses looked
    like an unexplained test artifact.

    The cost is not the `git status` noise. Both loaders resolve an analysis by
    suffix and take the newest filename (`.sort().at(-1)` in report's
    `latestAnalysisPath` and llm's `loadLargeRuleFamiliesRawThemes`),
    deliberately, so a regenerated fixture needs no pinned filename edited into
    a test. A stray analysis therefore sorts last and silently becomes the
    fixture under test on one machine - measured: planting one empty-themes file
    turns `structure-ranking.test.ts` red while nothing in the tree changed.
    That is the same failure this entry refuses to accept when it declines to
    gitignore these directories. `fixture-hygiene.test.ts` now fails on any
    untracked file under `fixtures/test-audits`, so a rebake is a decision -
    commit it or delete it - rather than a surprise a later session has to
    re-derive. The 2026-09-01 batch stays: its `-fr.json` is the newest committed
    one, which makes it what the tests actually read.

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

    **Amended 2026-08-29: captured evidence bytes are the same kind of
    approximate.** The prescan e2e test asserted that two consecutive runs
    produce byte-identical evidence, and it failed on the annotated failure
    crop while the render composite happened to match. The crop is a timed
    screenshot of a live page that the fixture itself seeds with a post-load
    layout shift, so its pixels legitimately differ between browser launches;
    the assertion was claiming a guarantee the code never made. Nothing
    downstream needs those bytes stable, because the ref is content-addressed:
    a different capture is a different filename, and `embedOutreachEvidenceAsset`
    re-verifies the hash it is handed. What the product depends on is choosing
    the *same failure* to photograph each time, so the test now asserts
    selection identity (state, page role, fact ref, selection reason) plus
    ref-matches-hash, and keeps the two-loads-per-page assertion strict, since
    that one is the politeness guarantee and is genuinely deterministic.

    The same amendment relaxed two metric assertions in that file that demanded
    a positive main-thread blocking time and a positive CLS. On a two-page
    fixture served from disk on an idle machine, zero is the honest measurement,
    so the test failed precisely when the machine was fast - a signal pointing
    the wrong way. They now assert the observer collected a finite number, which
    is what distinguishes a broken collector from a well-behaved page, and is
    what this entry's own banding rule already required.

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

    **Amended 2026-09-11, plan 037.** The evidence contract itself is
    unchanged: prescans still capture the crop and composite, completeness
    still gates what it always gated, and the fixed bilingual allowlist still
    feeds touch 2's observation selection. What changed is the consumer: the
    outreach preview is no longer built from prescan evidence, so the assets
    and summaries no longer reach the prospect at all. They are operator-side
    scoring and selection evidence. The preview's replacement contract is the
    v2 full-scan scorecard (trade-off 42's amendment below).

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
    stronger reading of docs/rules/prospect-qualification.md section 6's "not
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
    `plans/report-findings.md` (that ledger is since deleted; its review
    evidence remains in Git history); the five marked P0 are resolved here, and until
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

**Amended 2026-08-29: the backfill is offline, and re-running the qualification
pass to apply the stock file would be a mistake.** `qualifyHotels` probes every
candidate's live site, so applying a newly downloaded stock file through it
would spend hours of third-party requests on 13,301 hotels. None of that traffic
buys anything: INSEE's answer depends only on the SIREN, the SIREN is already
stored on every row as `siteFacts.siren`, the candidate carries the rest of the
decision, and both `joinSireneFor` and `qualifyHotelCandidate` are pure. So the
join is applied by `backfillSirene`, which contacts nobody and is a sibling of
`reconcileRedirects` rather than a mode of it or a flag on the qualification
pass.

Three rules it inherits or adds, each of which was a way to get this wrong:

- **Re-decide only rows whose join returned an `effectifBandCode`**, and copy
  everything else forward verbatim, exactly as the reconciliation does. This is
  not an optimization. `domainAdoptedAfterRedirect` is passed into
  `qualifyHotelCandidate` by the reconciliation and is never stored as a field;
  it only adds a note and can never move an outcome, but re-deciding blindly
  would erase, for every adopted hotel, the record that the campaign is about to
  contact them at an address their catalogue never published. Rows that are
  re-decided recover it from their own stored notes.
- **Refuse to run without the stock file**, unlike `qualifyHotels`, whose joiner
  degrades to `stock-file-unavailable` on purpose because that run has site
  verdicts to protect. This pass has no other output: without the file it would
  write a complete generation answering "we asked and got nothing" for every
  hotel, indistinguishable in shape from a real one. The CLI checks before
  opening a database connection so the operator is told immediately.
- **No `--limit`.** The reconciliation has one because it bounds the only part
  that contacts anybody. Nothing here does, and a partial generation silently
  shrinks the prescan population, which is the failure `listCandidatesToPrescan`
  filtering on the version already makes look like a correct filter.

Its dry run reports real projected outcomes, which `qualifyHotels` deliberately
refuses to do. That rule exists because that pass once reported 9,545 rejections
computed from a synthetic "not attempted" site fact - it is a rule against
inventing observations. This pass observes nothing at all: every input is stored,
the decision is pure, and dry versus wet differs only in whether rows are
persisted. Seeing how many hotels the effectif rule newly rejects before
committing a generation is the entire point of dry-running it.


### 42. The outreach preview is a separate document kind, and its safety is structural

**Context.** Cold outreach needs one credible place to send a prospect that
shows their own evidence without giving away the paid report and without making
a legal conclusion. The tempting implementation is to render `GenerateReportInput`
with things removed.

**Decision: start from nothing.** `OutreachPreviewInput`
(`packages/core/src/types/outreach-preview.ts`) shares no type with the paid
report and admits only what `docs/rules/outreach-rules.md` permits. Every object is
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
`docs/rules/obligation-basis.md` carries hotels at `secondary` and states the facts
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

**Amended 2026-09-11, plan 037: the v2 preview replaces the prescan-backed
input for new outreach; the invariants stand.** The v1 input was structurally
safe but evidence-poor: three to five allowlisted sentences and up to two
screenshots drawn from a three-page prescan cannot show that a whole-site
measurement found a pattern. The replacement (`OutreachPreviewSummary` and the
v2 input, same file family, still in `core`, still sharing no type with
`GenerateReportInput`) is a projection of one candidate-linked outreach full
scan: coverage counts reported separately, distinct-finding and
unique-affected-page totals, four severity totals, and exactly three text
proof cards selected deterministically in code from an operator-approved
bilingual copy catalog. Everything the five layers enforced still holds, and
two prohibitions get stricter: no images at all, and the proof-card catalog is
reviewed static copy, so no model ever writes card text. Fail-closed is
retained and widened: fewer than three eligible, public-safe cards means the
audit is not publishable as outreach evidence, and a failed coverage gate
means no preview. The publication record is discriminated by source
(`prescan` | `full-audit`) so v1 rows keep their required fields and stay
listable and revocable until natural expiry; no new v1 preview or first-touch
draft can be created. Touch-one assembly now consumes an already published v2
preview instead of publishing as a side effect, which closes the old
publish-per-draft behaviour. A preview built by subtracting fields from a
paid-report input remains forbidden, now in both directions.


### 43. A preview is served by hashing the visitor's own token, and the public site never learns anything else

Plan 008 could render a preview and nothing could put one in front of a hotel.
Plan 009 gives it a home, and the shape of that home is forced by a constraint
this repository already accepted: the marketing site is deliberately walled off
from Mongo and from the audit engine. So publication cannot be a database read
from the public side, and the link cannot be a lookup of anything the site
knows. What the private side stores is a hash; what the recipient holds is the
only copy of the token; and the site turns one into the other with a hash
function and a single object read.

**Provider: Scaleway Object Storage, `fr-par`.** Named on the privacy page as a
recipient, with a "hosted in France" sentence that is true. It is
S3-compatible, so the adapter moves to another S3 provider unchanged if that
ever matters. **Dependency: `aws4fetch`**, one small dependency with no
transitive tree, in both `@odysseus/interface` and `@odysseus/site`. The public
half runs in a serverless function where the AWS SDK would outweigh the
previews it serves, and the whole surface used is GET, PUT and DELETE on one
key. Both adapters call `sign()` and hand the signed request to an injected
`fetch`, so the production adapter is tested with no credentials and no network.

**A pre-signed URL cannot do this job.** It was the obvious design and it does
not survive contact with the requirement: a SigV4 query signature's lifetime is
capped well below the thirty days a preview is meant to stay readable. So the
site signs its own read on each visit, which is why the public side has a
signing dependency at all.

**Two expiries, deliberately different.** `publicExpiresAt` at thirty days is
how long the link serves; `expiresAt` at ninety days is the retention the
privacy page and `/bot` both publish, enforced by a precomputed field and an
`expireAfterSeconds: 0` index, never a raw TTL on `createdAt`. The public one
also rides on the object as `x-amz-meta-public-expires-at`, because the site
cannot read Mongo and must still answer 410 for an expired preview and 404 for
an unknown one. Mongo stays the private record of truth.

**Two deviations from the plan text.** The route is a Route Handler, not a
`page.tsx`: a page nests a complete self-contained document inside the app
layout's own `<html>` and cannot set the response headers. And the token is
validated for syntax before it is hashed, returning `null` rather than throwing,
so malformed, unknown and revoked are one indistinguishable 404.

**The key derivation is duplicated on purpose.** The site cannot import
`@odysseus/interface`, so it carries its own copy of validate/hash/derive. The
duplication is guarded by `fixtures/outreach-preview-keys.json`, a table of
token/hash/key triples asserted from both packages, so drift is a red test
rather than a preview that 404s for a token that was correctly issued.

**Found by the end-to-end check, not by the suite.** A prescan stores
`artifactsDir` relative to the prescans root, and the store adapter passed it
through unresolved, so every real publication failed with an `ENOENT` on a path
fragment - which reads exactly like a swept prescan. The adapter now resolves it,
and `buildPreviewInput` refuses a relative directory with a message naming the
cause. This is the same lesson as the two post-milestone-4 bugs: a green suite
described a pipeline nobody had run against real stored data.

**One contact address, chosen for containment.** Every prospect-facing surface
now names `contact@odysseusaudit.com`. The already-warmed personal address was
the tempting choice and is the wrong one to spend: cold outreach earns
complaints, reputation damage lands on the sending domain, and that domain must
not be the one carrying mail to real clients. It also aligns with the preview
links, the crawler user agent and the privacy notice, which are all
`odysseusaudit.com`, and the volume is warmable, since drafts have no send
method and the first wave is a controlled hundred. This made a monitored mailbox
at that address a precondition of deploying the site - an article 14 notice
pointing at an address nobody reads is worse than the two-address inconsistency
it replaced - and the operator confirmed on 2026-08-29 that the mailbox is being
provisioned. Send it a message from outside the domain and read it there before
the first outreach send, which is the only check that distinguishes a configured
address from a delivering one.

**The published price is guarded from the side that owns it.** `/offre` states
`1 600 EUR HT`, matching what a preview quotes. The site imports nothing from
the workspace, so the figure is literal text; `packages/core/src/offer/
pricing.test.ts` reads the page and compares it with `formatFullAuditPrice`, so
a price change cannot go stale on the one page a prospect is sent to. The
separators are U+00A0 written as `&#160;`, because the lint rule forbids a
literal one in source.

**Provisioned and verified, 2026-08-29.** Plan 009's step 6 is complete. A
Scaleway Object Storage bucket (`odysseus-previews`, region `fr-par`, private,
no static-website hosting) and a project-scoped API key were created by the
operator and recorded only as the five `ODYSSEUS_PREVIEW_BUCKET_*` values in the
untracked root `.env` (private CLI) and the equivalent unprefixed
`PREVIEW_BUCKET_*` values as Vercel project environment variables for
`odysseus-site` (public route), the secret marked Sensitive there. The existing
`odysseus-site` Vercel project (root directory `packages/site`, production
domain `www.odysseusaudit.com`) was redeployed to pick them up.

The end-to-end check used a synthetic object (a short "this is a test" HTML
string, no candidate, no hotel, no third-party data) written directly through
`createConfiguredPreviewPublisher()` to the real bucket, never through Mongo or
a fabricated candidate record. Fetching `/apercu/<token>` on the live site
returned 200 with `X-Robots-Tag: noindex, nofollow, noarchive`,
`Cache-Control: private, no-store, max-age=0, must-revalidate`,
`Referrer-Policy: no-referrer`, and the expected `Content-Security-Policy`; a
bogus token returned 404; `robots.txt` disallows `/apercu/`. Deleting the object
through the same publisher made the live URL 404 immediately, confirming revoke
behaviour end to end. No secret, access key, or token appeared in any command
output recorded here or elsewhere.

Rollback: to withdraw a real, live preview, `odysseus prospect preview revoke
<domain>` deletes the bucket object first and marks the Mongo record revoked
second (`revokePreviewsForDomain`), so a failed delete never leaves a record
falsely marked safe. To roll back the deployment itself, remove the five
`PREVIEW_BUCKET_*` variables from the Vercel project (the route then fails
closed with a 500 rather than serving stale content, since `read-preview.ts`
throws on a missing required var) or revert the Scaleway API key from the IAM
console, which invalidates both the CLI and the site's signing at once.
Credential ownership is the operator's personal Scaleway and Vercel accounts;
no CI system or shared secret store holds a copy of either key. Both facts the
operator owed the privacy page were already settled before this step: the
outreach mailbox is being provisioned, and the database region is named as AWS
Paris (eu-west-3) alongside Scaleway's Paris region.

### 44. A deliverable is an approved bilingual report pair, and the same PDF serves both audiences

**Decision:** keep one complete PDF per language, put the glossary last with
the technical appendix immediately before it, and approve an exact French and
English pair before delivery. The report remains a single evidence-bearing
artifact: finding IDs, URLs, selectors, occurrences, and provenance are not
split into a second export. The table of contents groups the reading order
into seven narrative groups: executive context, decisions and actions,
detailed evidence, legal reference, method and vocabulary, the technical
appendix, and the glossary. The cover, the metadata and severity-scale sheet,
the contents, the printable checklist, and the appendix opening are
standalone; every numbered section starts a fresh page, and the appendix flows
continuously after its opening page while the glossary stays final.

**Amended 2026-09-01, plan 024.** The operator confirmed the glossary goes
last and the technical appendix second to last, reversing this entry's
original appendix-last call from the 2026-08-30 review: a glossary is a
reference the reader reaches for last, after the technical detail. The
traceability and single-artifact reasoning below is unchanged; only the
stated physical order moved.

**Why:** splitting the appendix would make the director's document shorter but
would create a second deliverable whose identity, approval, and retention could
drift. Keeping the evidence-bearing appendix at the document's tail, with only
the glossary reference after it, preserves traceability while putting
decisions first.
After the 2026-08-30 executive review the operator deliberately replaced
compact flow with new-page section starts: sparse numbered pages are an
accepted cost of executive readability, not a defect, and there is no
page-count failure range (a report above 60 pages renders and returns a
warning instead of failing).

**Approval and provenance:** reports receive their report ID, render timestamp,
renderer build, and template version before Chromium starts. Those same values
are used in the PDF, filename, sidecar, and stored report. Scan completion and
scan build remain separate manifest facts. An insert-only approval references
the exact digest-verified current French and English report IDs. Lifecycle is
derived as scanned, analysed, rendered, or approved; generating a later
analysis or report automatically makes an older approval non-current without
mutating history. Preview downloads require a fresh verified report, while
deliverable downloads additionally require the current pair approval.

**Priority interpretation:** raw severity totals and model overall risk remain
unchanged. One report-owned priority view assigns contiguous display ranks,
adds first-party, third-party, and verify-intent ownership counts, and requires
reviewed code-owned remediation for every rendered rule family. Model ranks
remain attached as provenance. LCEN and other regime-dependent findings stay
out of model themes; a legacy mixed analysis must be regenerated.

**Deferred boundaries:** numeric development-day estimates still require the
evidence-based model in `docs/report/report-feedback-deferred-items.md`.
Lighthouse successor-family deduplication remains monitor-only until a current
scan reproduces it.


### 45. Argument B ships for hotels under the general e-commerce rule

Plan 010 inherited an obsolete hotel-specific hold on the deterministic legal
facts block. The source review in `docs/rules/obligation-basis.md` now permits hotels
on the same terms as any other e-commerce prospect, and the preview path already
sets `argumentB: true`. Outreach draft assembly follows that current doctrine.

This does not let the model write legal prose or let the product decide that a
named hotel is bound. The block still comes from `buildOutreachFactsBlock`,
states criteria and verified registry facts only, and remains subject to the
same source-capability gate for any future sector.


### 46. The deterministic facts block belongs to touch 3 only

Plan 010's generic assembly order could be read as inserting the legal facts
block into every email. That would contradict the canonical sequence: argument
A establishes credibility first, and argument B arrives only when the sequence
closes. Touches 1 and 2 therefore cannot carry a facts block; touch 3 requires a
rendered one and refuses when it is absent.

The restriction is structural in `assembleOutreachDraft`, not a prompt request.
The model receives no legal block at any touch and has no field in which to
return one.


### 47. Touch 1 prefers a render comparison but falls back to the measured failure crop

Evidence schema v2 made the render composite optional because a server-rendered
site can have no material raw-versus-rendered gap. In the measured set, 17 of 25
hotels with genuine photographed failures had no composite. Requiring one would
discard useful, reproducible evidence for most of that set.

`selectOutreachEvidence` therefore prefers the render comparison for touch 1 and
uses the measured failure crop when the composite is absent. Touch 2 takes the
highest-ranked different allowlisted observation. Selection refuses when none
exists, rather than repeating one claim across two touches. The selection
version is `render-then-failure-v1`, so a later policy cannot silently rewrite
what earlier drafts used.


### 48. Facts-block identity protects against caller drift, not model rewriting

The outreach model never receives the deterministic facts block, so it cannot
alter it. The actual integrity risk lies between two deterministic stages: a
caller can retain, mutate, or rebuild a stale block after preview publication
and then hand it to draft assembly.

Touch 3 assembly rebuilds the block from the current inputs, compares that value
with the caller's expected block, and splices only the fresh rebuild. It then
confirms that the exact rendered text occurs once in the body. A mismatch or a
failed splice discards the draft. This preserves byte identity without inventing
a model threat that does not exist.


### 49. The approved regime threshold may appear only through the facts-block path

The general outreach prohibition still rejects every figure whose source status
is not `primary`. The regime threshold used by `buildOutreachFactsBlock` is an
already approved exception in form, not in provenance: it already ships through
the guarded preview path with argument B enabled and is generated from the same
deterministic source.

No free-form outreach prose may quote the threshold. The approval applies only
to the existing deterministic block, with its criteria framing and without a
client-specific legal conclusion.


### 50. Touch-shape doctrine and enforcement land together

Plan 010 originally deferred its word, sentence, and link limits to the final
documentation commit while an earlier test was designed to read those limits
from the canonical document. That ordering would have made the contract test
fail for several otherwise complete commits.

The touch-shape table therefore landed with the schemas and
`outreach-limits.ts`, while the remaining doctrine amendments stayed in the
final documentation slice. `outreach-limits.test.ts` reads the table, so a
future limit change must update doctrine and enforcement in the same commit.


### 51. Two distinct outreach observations are available in the current usable evidence

A read-only measurement ran `selectOutreachEvidence` over all 144 stored
prescans carrying an evidence field. It selected two distinct observations for
106, or 73.6 percent. The other 38 refusals were all old or incomplete evidence:
25 `evidence-schema-outdated` and 13 `evidence-incomplete`. Neither
`no-distinct-second-observation` nor `observation-not-in-allowlist` fired.

The selected pairs were 82 measured-failure then summary, 23 render-comparison
then summary, and one render-comparison then measured-failure. The campaign can
keep the three-touch doctrine for current usable evidence. This measurement is
not permission to weaken the typed refusal if later evidence has only one
observation.


### 52. The strict outreach schema keeps its exact array bounds

A live API probe against `mistral-medium-latest` used the exact touch 2 JSON
schema with `strict: true`, `minItems: 2`, and `maxItems: 2`. The model returned
two strings and the response was accepted on the first call. The schema needs no
loosening or post-parse substitute for those bounds.

The outreach mirrors contain no `maxLength`; character bounds remain in the
authoritative Zod schemas, matching the existing writing-pass posture. Zod parse
remains authoritative even where the provider accepts the JSON-schema hint.


### 53. All Mistral passes use Medium until the account can call Large

The configured account returned HTTP 403 `tier_not_allowed` for
`mistral-large-latest` before and after billing was added, while Medium and Small
were available. `MISTRAL_MODEL` therefore points to `mistral-medium-latest`, and
the structure, writing, and outreach calls all inherit that one constant.

This was an operational compatibility choice, not an outreach-specific model
fork or a provider evaluation. Plan 025 supplied the required provider
comparison and operator approval; entry 67 supersedes this choice.


### 54. Outreach generation and deterministic assembly remain separate deep interfaces

`generateOutreachProse` owns model calls, parsing, guards, retries, and discard
inside `llm`. `assembleOutreachDraft` accepts only already validated prose and
owns code-written links, identity, disclosures, facts, opt-out text, and final
body lint inside `interface`. The assembler never calls the generator, and the
public generation interface accepts no injectable client that could invert the
package dependency.

Touch 3 requires the caller's expected facts block because integrity can only be
checked against a value produced alongside the published preview. The assembler
always splices its own fresh rebuild. Follow-ups reuse the first subject with one
idempotent `Re:` prefix; touch 1 carries URL-based privacy and opt-out links,
while touches 2 and 3 use a reply-based opt-out so they introduce no new URL.
Sender identity and data-origin wording are owned locally and checked for parity
with the preview rather than imported across the report boundary. A composition
lint failure throws and stops the batch because it signals a product bug; an
expected missing per-prospect input returns a typed refusal.


### 55. Writing-pass prose quality is enforced by pattern guards plus a not-yet-promotable shadow reviewer

Two deterministic guards joined `analyzeWriting`'s retry loop on
2026-08-29, each sourced from a real stored fault and measured against
every stored analysis before promotion: `wcag-citation-guard.ts` (the
first live run mixed WCAG 2.1 into a 2.2 audit; patterns exclude
criterion numbers and contrast ratios, measured to match exactly the 10
fault strings and nothing legitimate) and `business-claim-guard.ts`
("la page la plus rentable du site"; bans profitability and revenue
superlatives only, because traffic superlatives are legitimate generic
advice in real output; a hedge in the same sentence permits the claim,
matching the doctrine's inference escape hatch). Both first ran
log-only over stored analyses (`packages/llm/src/lint-stored-analyses.ts`)
and were promoted with zero false positives; do not add a prose guard to
the retry loop without the same measured promotion step, and do not
widen the business-claim patterns to traffic vocabulary.

The shadow reviewer (`analyze-review.ts`, one extra model call per
analysis, always on by operator decision) checks the writer's prose
against exactly the writer's input and returns evidence-bound verdicts.
It is not a gate and must not become one on the current model: the
2026-08-29 campaign measured `mistral-medium-latest` flagging every
businessImpact field unsupported for stating the generic commercial
consequences the writing prompt itself requires, immune to both an
explicit carve-out rule and few-shot examples. The prompt keeps the
correct specification for re-measurement when Large access or a provider
decision lands. Do not retry on reviewer failure (it skips, by design),
do not per-field-log its verdicts to the console (single summary line
only), and read `unsupported` on businessImpact fields as "states
consequences" until the bias is re-measured as gone.

**Issue #115 amendment, 2026-09-09.** The deterministic legal-consequence
guard now also rejects direct client-specific obligation claims and worded
deadlines in French and English. The outreach path already uses this guard as
a retry gate, so the additional patterns block unsafe generated prose without
promoting the shadow reviewer or changing the deterministic facts splice.

**Plan 033 addendum, 2026-09-08.** A separate correction-review artifact now
measures bounded editorial proposals without changing the historical reviewer
stream, accepted analysis, or report input. It has its own schema, prompt,
correlation guard, and one-shot skip behavior. The campaign has not run: it
requires current operator authorization naming the stored audits. No promotion
decision follows from implementation alone.


### 56. The tool cannot send, and the only thing making that true is the shape of the port

Milestone 9c plan 011 creates outreach drafts in a real mailbox. Binding
decision 14 says automation stops at the draft and the human keeps the review
and the send. The natural way to enforce that would be to request a permission
that allows drafting and forbids sending, and there is no such permission:
`gmail.compose` is the narrowest scope that can create a draft at all, and
Google documents it as "Manage drafts and send emails". `gmail.modify` is
broader still. So the no-send guarantee has no permission backstop anywhere
behind it. It is entirely a property of code we wrote.

That is why the design is shaped the way it is, and why each of these is
load-bearing rather than tidiness:

`MailboxDraftAdapter` has exactly four methods (`createDraft`, `getDraft`,
`deleteDraft`, `getThreadMetadata`), no generic request method, and no
caller-supplied URL or path. The Gmail adapter constructs URLs in exactly one
place, a frozen `GMAIL_ENDPOINTS` table of four entries. A static capability
test asserts the method set exactly, asserts no forbidden verb appears in a
method name or an endpoint path, asserts the adapter source contains no
`drafts/send`, `messages/send` or `sendAs` string, and asserts the transport
contacts no path outside the allowlist. Built-in `fetch` was chosen over
`googleapis` for this reason and no other: that package hands us a client
carrying `users.messages.send` and `users.drafts.send`, so the guarantee would
rest on not calling a method that exists rather than on no such method
existing. If the capability test is ever weakened, nothing else catches a send
path. Do not weaken it, and do not add a fifth method without asking.

The port carries no sender field. A caller names a recipient, a subject and a
body; who the message is from is adapter configuration
(`ODYSSEUS_MAILBOX_SENDER_ADDRESS`). An earlier draft of the port did accept a
`from`, which meant any caller could forge one, and the orchestrator was
passing an empty string into it. Removed, with a test that a caller supplying a
sender is ignored.

Two suppression checks, not one. `createOutreachDraft` checks suppression
immediately before the model call and again immediately before the provider
call. The first protects the spend, the second protects the prospect: an
objection arriving during generation must still stop the draft. Tests assert no
model call after the first gate refuses and no provider draft after the second.

The orchestrator publishes the preview itself rather than looking one up.
Plan 009 deliberately stores only a token hash and returns the raw URL exactly
once, so an existing preview's link is unrecoverable by design. A draft that
needs a link therefore has to make one.

Drafts are insert-only and a partial unique index over (`threadId`, `touch`)
among `created` rows is what makes "one live draft per touch" a database fact
rather than a checked condition. Both new collections use the precomputed
`expiresAt` 90-day TTL pattern already used by previews and contacts, not a raw
TTL on `createdAt`. A provider draft that is created but cannot be recorded is
withdrawn from the mailbox rather than left orphaned, and the failure is
recorded with empty subject and body (a conditional Mongoose validator, since
`required: true` rejects an empty string).

An objection now closes threads as well as revoking previews and writing
suppression, in the one `prospect object` command. A suppressed domain with an
open thread is a conversation the next batch would try to continue.

**Deferred with reasons, not silently.** `List-Unsubscribe` headers: the opt-out
page is live (trade-off 43), but a draft sent by hand from a mail client is not
guaranteed to preserve custom headers, and RFC 8058 one-click needs a `POST`
handler the site does not have. The in-body opt-out line section 7 requires is
unaffected and ships. Plan 011's live synthetic draft was completed and deleted
without sending on 2026-08-30, so plan 011 is `DONE`; issue #14 separately
tracks the measured touch-1 generation reliability gap.

**Provisioning is an operator step with one load-bearing setting.** A Google
Workspace OAuth client of user type **Internal**. External clients left in
Testing are issued refresh tokens that expire after seven days, and moving out
of Testing means Google verification, which a restricted scope makes expensive.
Full preflight list, without secret values, is `docs/rules/outreach-rules.md`
section 10.


### 57. Structured-data reading is owned in the scanner, not delegated to an unmaintained preset

The structured-data check called `structured-data-testing-tool@4.5.0`, whose
reading half was `web-auto-extractor@1.0.17` on `cheerio@0.22.0`, from 2016,
dragging in the lodash micro-package long tail (`lodash.pick` among them,
which is what an advisory surfaced). None of that chain has an upstream
maintainer, so nothing found in it was ever going to be fixed there.

Pinning or ignoring the advisory was the cheap option and was rejected: the
problem is not one flagged package, it is that the code reading a client's
markup is abandoned, and the quality of what this check can say was capped by
a nine-year-old parser.

What made replacement small was reading the preset instead of assuming it was
large. Of everything the Google preset declares - fourteen files - only the
Article family, `BlogPosting` and `ClaimReview` carry any required field.
`WebPage` and `Organization` mark every field optional, and the "simple
article" types test only that the type is present. So the entire failure
surface of a 4.5.0 dependency is two lists of field paths, now written out in
`packages/scanner/src/checks/structured-data.ts` where they can be read.

Extraction moved to `packages/scanner/src/checks/structured-data-extract.ts`,
covering JSON-LD, microdata and RDFa, using `html-validate`'s public `Parser`
and `Config` - already a scanner dependency for the HTML structural-validity
check, so nothing new was installed. Microdata is not optional coverage here:
the only occurrence of this rule in the repository's own saved real-site
audits (haaitza.com, 21 pages) was microdata, and a JSON-LD-only replacement
would have silently deleted the rule's only demonstrated real-world hit.

One deliberate output change. The old library resolved each test against
whichever markup form answered it first, which let one page report the same
missing field under two markup types and count it twice in the client-facing
"missing N fields" sentence - visible in the stored haaitza evidence, where
`publisher.logo` and `publisher.logo.url` appear once as `jsonld` and once as
`microdata`. Each markup form a schema is declared in is now validated in its
own right, so a field is reported once per form that is genuinely missing it.
This changes what a new scan produces, not how a stored scan is re-normalized:
`normalize <dir>` reads the recorded check result out of `scan.json`, so no
stored audit, fixture stamp or finding ID moves.

Not verified against a live re-scan. No saved audit stores page HTML, so the
real-site evidence available offline is the recorded failure list, which the
microdata test reproduces. A live re-scan of a site declaring Article-family
markup is the remaining confirmation.

### 58. Manual outreach reconciliation is metadata-only, suppression-first, and operator-scored

The outreach thread uses one explicit state machine in `core`, with provider
facts (confirmed sends, replies, bounces and review flags) kept separate from
operator-set outcome events. Follow-up spacing and the final reply window are
snapshotted when the thread opens. A later configuration change therefore
cannot make an existing conversation due earlier or later.

Mailbox reconciliation reads message identifiers, dates, sender addresses,
labels and the minimum headers needed for classification. It stores no message
body and infers no sentiment. The existing `getThreadMetadata` result was
widened to carry per-message metadata; `MailboxDraftAdapter` still has exactly
the four methods protected by trade-off 56, so plan 012 added neither a fifth
method nor a broader Gmail capability. Ambiguous disappearance and automated
responses block follow-ups with a review flag.

A metadata-detected bounce closes its thread but does not create a permanent
suppression. Under `gmail.metadata`, the detail that distinguishes a dead
address from a temporary mailbox failure lives in content the tool deliberately
does not read. Permanent hard-bounce suppression therefore requires the
operator's separate `bounce-confirm` action. Completed three-touch sequences
are different: after the thread's 14-day reply window, reconciliation writes
the hash-only `sequence-complete` suppression first and then makes the thread
terminal. No fourth touch exists.

Campaign outcomes are insert-only operator events with a closed vocabulary,
actor and date, retained for 90 days. The thread points at the current event;
earlier events remain auditable. Aggregate reads expose counts by score band,
touch-1 evidence slot and categorical outcome only. They expose no address,
subject or body.

The preview-load metric is unavailable. The public preview route deliberately
logs no visitor behavior, stores no raw token, IP address or user agent, and the
standalone site has no database access. Producing an open signal would require
building tracking that the approved design omits. Plan 014 therefore drops its
preview-load gate and evaluates replies, bounces, objections and operator-set
outcomes instead.

### 59. The operator dashboard is a Vite React app on hand-written report CSS, and the two stacks stay separate

Plan 017 rebuilt the dashboard (previously four server-static HTML pages with
`innerHTML` template strings) as a React 19 + Vite + Tailwind CSS 4 single-page
app inside `packages/interface`, with Radix primitives owned as in-repo
component source and no UI framework beyond that: still no Next.js dashboard
and no Express API, the `node:http` router and its CSRF posture are untouched,
and the SPA ships as static files from the same `dist/public` the old pages
used.

This is the recorded boundary against trade-off 9, which bans a Tailwind build
step for `packages/report`. That ban stands: the report's print-tested CSS is
hand-maintained and untouched. The dashboard keeps its own token layer
(`src/dashboard/theme.css`): a monochrome dark theme (near-black neutral
surfaces, white accent with dark text on primary buttons, per the operator's
2026-08-30 direction away from the initial report-inspired violet and then
from a Linear-indigo accent), plus the severity palette carried over from the
report so a severity reads as the same shade in both surfaces. The only
shared assets are the Inter woff2 files, copied at build time from the report
package's canonical source so font versions cannot drift.

The browser bundle imports no workspace package: response shapes are declared
in dashboard-local type files, and small pure validators (URL, SIREN checksum)
are duplicated by value with why-comments rather than pulling `@odysseus/core`
into client code. API field names remain the server's persisted contract. FR/EN
parity for dashboard copy is enforced by a key-parity test over the string
tables, mirroring the report's strings-parity test.

### 60. The operator dashboard is hosted on a public EU VPS behind a built-in password session, and nothing else about the public posture changes

Plan 016 (operator-approved 2026-08-30) moved the one process that still
lived on the operator's home PC onto a Scaleway VPS: `odysseus serve` runs in
Docker behind Caddy at `app.odysseusaudit.com` with automatic HTTPS, so the
first-100 rollout can be run from anywhere. Mongo stays on Atlas, the public
site stays on Vercel, and the client-facing boundary is unchanged: previews
remain hash-token gated on the standalone site, and there is still no public
client surface to the engine. This is the superseding decision for the
charter's "no public web interface to the audit engine itself" line and the
brief's 2026-08-03 "no auth needed anywhere" note, both of which described
the deliberate localhost-only posture of milestone 7 through 9c plan 013.

Auth is a built-in password session in `packages/interface`. Reverse-proxy
basic auth was rejected (no lockout, no logout, weakest posture),
Cloudflare Access because it puts Cloudflare in the data path and moves DNS,
and Tailscale-only because it needs an app on every device, which fails the
"any browser anywhere" requirement. One very strong password is verified
with `node:crypto` scrypt and `timingSafeEqual`; it is configured only as a
`salt:hash` string in `ODYSSEUS_DASHBOARD_PASSWORD_HASH`, generated by
`scripts/hash-dashboard-password.mjs`, which reads the password on stdin so
it never lands in shell history or a process list. Sessions are random
256-bit tokens in an in-memory store with a 24-hour sliding expiry, carried
in an HttpOnly, SameSite=Lax, host-only cookie. `Secure` is set when the
request arrived over HTTPS (`X-Forwarded-Proto`, as Caddy sets it), so the
local plain-HTTP compose smoke exercises the same code as production. A
restart logs the operator in again, which is accepted for a single user.

Fail-closed: without a configured hash the server keeps the unauthenticated
localhost behaviour, and binding any non-loopback host without a hash
refuses to start. The session routes are registered either way, so a
dev-mode login attempt answers 400 `auth-not-configured` instead of a 404,
and the guard itself is simply not installed. Login failures are rate
limited per client IP with an exponential lockout capped at 15 minutes; the
client IP is the first `X-Forwarded-For` entry when present, which is safe
because the app port is never published and only Caddy's 80 and 443 are
exposed. The origin check is unchanged and is what the proxy deployment was
verified against: Caddy passes Host through, the app compares Origin to
Host, and the public site's host fails the match, which is the desired
same-site cross-origin protection.

Packaging is Docker Compose (`Dockerfile` and `deploy/`): a Node 22 slim
image with Playwright Chromium installed into a world-readable
`PLAYWRIGHT_BROWSERS_PATH`, a non-root runtime user, and artifacts on a
named volume backed up nightly to the existing Scaleway previews bucket
under `backups/` with 30-day retention (rclone plus a systemd timer, no npm
dependency). Container-only Chromium flags arrive through
`ODYSSEUS_CHROMIUM_EXTRA_ARGS` (`packages/scanner/src/browser.ts`), so the
image stays neutral and the report's `--font-render-hinting=none`
(trade-off 19) remains applied only to the report's own launch.

Credentials that deliberately did not move: the Gmail mailbox OAuth refresh
token stays on the operator's machine, because drafting stays a local CLI
act in this plan; only a future plan that makes drafting server-side may
move them, with the operator present. The provisioning steps, the Atlas
allowlist caution, and the restore drill live in `deploy/runbook.md`.

### 61. Production releases are CI-verified, operator-triggered, immutable, and driven by a shell-restricted VPS key

Superseded as the production path by trade-off 77 (operator decision,
2026-09-09): production is deployed locally through `odysseus-deploy` and the
GitHub workflow is deliberately disabled. This entry is kept for its mechanics
and threat model in case that decision is ever reversed.

Routine updates to `app.odysseusaudit.com` now start only when the operator
manually dispatches the production workflow on `main`. The workflow refuses to
deploy unless that exact commit has a successful `CI` push run, then streams
its Git archive to the VPS. It never asks the server to pull a moving branch.
Documentation-only pushes need no production action.

The VPS extracts each archive into
`/srv/odysseus/releases/<full-commit-sha>`, builds an
`odysseus-app:<full-commit-sha>` image, and changes the `current` pointer only
after the public unauthenticated request returns the expected 302 redirect to
`/login`. A failed live check restores the previous Compose release
automatically. Manual rollback is the same dispatched workflow and swaps the
current and previous pointers. Compose is pinned to project name `deploy`, so
release directories cannot create replacement artifact or Caddy volumes.

The repository is private on a GitHub plan that does not support required
environment reviewers for private repositories. Manual workflow dispatch is
therefore the approval gate, and no push or `workflow_run` event can start the
deployment job. A future plan upgrade may add a reviewer as a second gate.

The Actions credential is a dedicated Ed25519 key with OpenSSH `restrict` and
a forced command. It can stream one deployment archive or request one rollback;
it cannot get a shell, forward a port, or read the production `.env`. The
repository's `PRODUCTION_DEPLOY_ENABLED` variable is the final enable switch,
added only after the secrets, host trust, and forced key exist.

Rejected: deploy directly on every push, because a documentation change or an
accidental merge would restart a live queue with no operator decision; run
`git pull` on the VPS, because the provisioned server is intentionally a source
sync without Git metadata and a moving branch is not a release identity; use a
general-purpose SSH key, because compromise would expose production secrets;
and rebuild only one mutable working tree, because rollback would require
reconstructing the prior source and image during an incident.

### 62. Report preparation is one bounded aggregate with typed vocabularies, evidence-bound journeys, and candidate-before-selection writing (plan 019)

Personalizing the paid report is owned by one deep module,
`packages/core/src/report-preparation/`, reached through one operator
workflow, the **Prepare report** card. It owns the vocabularies, validation,
fallback rules, evidence resolution, warning digest, preview view models, and
writing selection. HTTP handlers and report rendering consume its bounded
outputs; neither reimplements preparation policy.

The operator's context is typed, not free: fixed situation, trigger, and
stakeholder-role vocabularies with bilingual copy tables, plus bounded
localized optional text. Free prompt fragments are rejected at the boundary.
Stored operator text is data only: trimmed, length-bounded, escaped at render
time, and never routed into a model or system instruction. Trigger `other`
notes exist per language; a missing language falls back to safe generic copy
independently, never machine translated and never copied from the other
language.

Journeys are evidence-bound with tri-state steps. A displayed step is exactly
one of **issue observed**, **no issue detected**, or **not evaluated**.
`no-issue-detected` requires positive evidence that the relevant deterministic
check ran successfully against the applicable captured page; absence of a
finding is never a pass. The catalogue is closed (initially
discovery/navigation and transaction/booking), suggestions are computed from
captured evidence with typed exclusion reasons, and the operator may only
confirm or remove suggestions. Journey evidence reads the on-disk
`manifest.json` and findings artifacts, not the Mongo audit document, because
the Mongoose audit schema deliberately does not persist `siteSignals`,
`translationClusters`, or `cruxFieldData` even though the TS manifest type
carries them.

Writing versions are candidate-before-selection. Regeneration reuses the
existing structural analysis, creates immutable analyses, and records the
exact pair as a candidate; only explicit operator approval atomically changes
selection, and the old pair stays persisted. Selection refers to a complete
French/English pair of the same audit sharing one `findingsProvenance`
(compatible structural run); the store service enforces this before an atomic
selection update. Legacy audits without selection resolve deterministically
to the latest complete pre-feature pair from one centralized selector, and
callers must not recover the old latest-record behaviour ad hoc.

Validation at the interface boundary uses the preparation module's Zod
schemas, exported as parse functions from `core` (where Zod is already a
dependency) rather than adding Zod to the `interface` package, which keeps
its existing hand-rolled handler convention and acquires no new dependency.

Rejected: extending `AuditManualFields` with every preparation decision, a
shallow grab bag with no policy boundary; free-text prompt input, which
reopens the door to unreviewed model-facing text and unreviewed report copy;
custom operator-drawn journeys and free-form stakeholder roles, which cannot
be bound to deterministic evidence; treating a missing finding as a passed
check, which turns untested pages into claimed passes; auto-selecting a
finished candidate, which makes regeneration effective before the operator
has read it; and a persisted `generating` candidate state, which a server
restart could strand, so in-flight generation is tracked in memory and a
failed or interrupted run simply leaves the selected pair unchanged with no
candidate record.

### 63. Financial opportunity is deny-by-default, singular, and separate from the general EAA reference (plan 020)

The broad `ReferenceStat.scalability` field remains an editorial property, not
permission to calculate client money. Canonical policy (this trade-off,
CLAUDE.md, `docs/rules/offer-positioning.md`) describes a single opportunity
module: an explicit opt-in policy returning either one conservative
`RevenueOpportunity` or a typed omission, requiring a traceable effective
turnover plus an exact match on sector, measured metric and unit, successful
deterministic measurement, qualifying performance condition, stat ID, and
citation ID, with every statistic ineligible by default even when marked
`scales-down`.

**Amended 2026-09-02: this module is not implemented.** The only candidate
allowlist entry, the structured Deloitte conversion-uplift-per-0.1-second
rows, reports a lift per 0.1-second improvement in "mobile site speed," a
term its methodology never decomposes into one of the tool's five measured
Core Web Vital metrics (LCP, TBT, FCP, Speed Index, CLS). Picking one as a
stand-in would be an interpretive choice the primary source does not make,
exactly the case plan 020 requires stopping for rather than resolving from
prose. Given that gate, the operator chose to defer the entire
financial-opportunity feature rather than approve a specific metric
substitution. No eligibility catalogue extension, resolver, or report
rendering exists; the policy above states what a future implementation would
be bound by, not what currently runs. Turnover input (below) shipped anyway
as approved groundwork, with no client-facing financial consumer yet.

Turnover extends plan 019's preparation aggregate. The detected official value
stays the default; a replacement becomes effective only through an explicit
choice and carries exact or range shape, year, and typed source. A range uses
its lower bound. The private operator preview explains typed absence or
rejection reasons, while the client report renders no empty financial block.
The opportunity appears once in the executive summary with its citation, and
the former per-theme euro notes are removed. It is never described as loss,
cost, exposure, guaranteed gain, return on investment, or a comparison with an
Odysseus price.

The legal amount is a separate view and section. When deterministic legal
context includes the EAA, the detailed legal section reproduces
`eaaSanctionFigureSentence(...)` unchanged once under a general-reference
heading. It is never adjacent to client findings, arithmetic, opportunity
money, or prices and never states this client's exposure. LCEN-only and other
contexts omit it; the EUR 50,000 article 47 figure and unverified procedure
claims remain prohibited.

Rejected: treating `scales-down` as estimate permission, because Baymard, Pew,
average-order-value, visibility, and accessibility ratios do not prove a
client-specific annual opportunity; rendering money per theme, because one
study then looks like several independent impacts; using model output for
eligibility or wording; and applying the legal amount to the client rather than
presenting the narrow primary-sourced general fact.

### 64. A full audit's tool coverage is pass-specific, decided by a staged deterministic planner, not uniform per URL (plan 021)

An uncapped audit of `hotelpointfrance.com` (issue #20) explored 672 URLs and
prepared roughly 670 for the full render-diff/axe/extended/Lighthouse
pipeline. The count was real: the public sitemap declared 521 eligible URLs,
including 375 canonical blog posts sharing one template and 69 taxonomy or
listing pages, and the link graph exposed further author, date, and category
pagination. The defect was never the inventory being large; a client is not
better served by an audit that silently caps or samples the pages it lists as
covered (the same instinct behind entry 9b.5 below). The defect was treating
every successfully loaded HTML URL as requiring the same expensive, serialized
Lighthouse work, which is what turned a real site into a multi-hour scan.

**The correction is narrow and asymmetric across passes.** Render diff, axe,
and the extended accessibility pass stay on every successfully crawled HTML
page in v1, including every reached listing and archive page, because
template equality does not prove content equality: titles, canonicals,
headings, alt text, structured data, embeds, and forms can all differ inside
one template. Only Lighthouse is family-stratified, because it is the
repeated, serialized, re-navigating cost, and a rendered-page cost profile
(DOM node count, image count, resource count, transfer bytes) can pick a real
outlier instead of an arbitrary first member.

Planning is deterministic and staged in two parts, because a cost-based
outlier cannot be chosen before rendered analysis produces the cost facts.
`buildContentAuditPlan` runs first, before any rendered work, and schedules
render diff, axe, and extended checks on every eligible page; role, family,
seed, and confidence facts are recorded on the decision but cannot remove any
of those three passes. `finalizeLighthousePlan` runs after rendered results
exist and adds the homepage, every transactional page, every operator seed,
every unknown/fallback page, every unique-family page, and two representatives
per repeated non-listing family and language: the stable first URL and the
measured cost outlier, using the descending tuple `(resourceCount,
imageCount, domNodeCount, knownTransferBytes, unknownTransferSizeCount)` then
URL ascending. Resource count is compared before known bytes so an unreported
transfer size is never read as evidence a resource was free. Classification
itself never decides whether render diff, axe, or extended checks run in v1;
a `listing` role requires at least two independent structural signals, never
URL text alone, and an unknown or contradictory page profile falls back to
fuller Lighthouse coverage rather than reduced coverage. Repeated
high-confidence listing families are content-checked on every member but do
not run Lighthouse unless another mandatory-selection rule also selects a
given member.

Page profiles are extracted from the crawler's existing post-`load` snapshot
(canonical/robots signals, declared language, CMS page-type classes, JSON-LD
top-level types, pagination relations, form/transactional markers, and a
versioned structural-token hash for template-family grouping) with no
additional navigation and no raw HTML, body text, or full link list retained;
only a normalized structural token stream is hashed, dropping volatile IDs,
inline styles, text, URLs, dates, and attribute values.

A separate, disclosed continuation-family guard protects the link frontier
from an unbounded generated calendar, filter, or pagination family, since a
page-family planner alone does not do that. It classifies a continuation only
from structural facts on the source page (`rel=next`, a numbered pagination
control, a repeated query-key family inside a confirmed listing), never from a
date-looking or numeric path alone, and it is immune by construction for the
homepage, every operator seed, and every eligible sitemap-declared URL
including taxonomy/listing pages: the guard bounds link-discovered
continuation depth, not declared site inventory. When it binds, it persists
bounded family/count summaries (at most 100 sorted families, three sorted
examples each) rather than the full omitted-URL list, and omitted URLs are
counted separately from the inventoried-URL total, never silently folded into
it.

Coverage is persisted per pass and by outcome, because the existing `visited`
manifest status is a crawl fact that report code had started reading as an
analysis fact. Each planned pass (`rendered`, `axe`, `extended`, `lighthouse`)
records `completed`, `partial` (composite pass produced usable results but a
registered subcheck failed), `failed` (no usable result), or `not-planned`
(valid only for Lighthouse); a zero-finding result is still `completed`. A
compiled check-scope registry assigns every existing detector result and
companion error field to exactly one pass and scope, so a future check added
without an explicit scope decision fails a coverage test rather than silently
inheriting ambiguous provenance. Historical manifests without these optional
fields remain valid, rendering with an explicit legacy/unknown coverage state
rather than an invented pass count.

Reach and work stay separate in the report. A shared-template correction
affecting many pages remains high leverage and is still reported as one
distinct finding under the existing two-pass dedupe design (entry 2 above and
`docs/rules/normalization-rules.md` section 2), but its reach is disclosed
separately from that count, and no sampled finding is ever propagated onto a
page no scanner actually ran on. `enforceSiteWideAccessibilityFloor`'s
denominator changes from every inventoried/visited URL to pages with a
completed axe pass, since axe now runs on every content-checked page rather
than a Lighthouse-style sample; the existing 80 percent threshold and
occurrence-weighting behavior are otherwise unchanged.

`docs/rules/offer-positioning.md` section 3 and
`docs/product/odysseus-project-brief.md`'s milestone 9b.5 write-up (below) are
amended alongside this entry, since the "whole-site crawl" claim that sells
the diagnostic now means content-sensitive analysis covers every successfully
crawled HTML page while performance measurement is a disclosed deterministic
sample, not that every tool runs on every URL. The 9b.5 decision that sitemap
reachability and scan coverage are different facts is preserved and extended,
not reversed: coverage is now further split by pass rather than treated as a
single scanned/not-scanned fact.

Locked contracts are unchanged: `Finding` v1, the two-pass dedupe design,
translation clusters, resource identities, and the allowlisted axe
element-shape identities. No selector normalization or universal remediation
key was added. Template family IDs are scheduling provenance for the planner
and continuation guard, not finding identity and not a client-facing claim
that family members are byte-identical.

Rejected: sampling render diff, axe, or the extended pass in v1, because their
DOM-level findings mix shared-template defects with content-specific ones that
existing normalization is already equipped to tell apart, and doing so would
require a second high-risk identity seam on top of an already large scanner
change; a URL-path allowlist for listing classification, because it cannot
generalize past the motivating CMS and silently breaks on an unfamiliar one;
and restoring a global page cap, which entry "Non-negotiable rule 5
amendment" above already rejected for a different, still-valid reason (silent
under-reporting).

### 65. The report's visual design is the 2026-09-02 Nocturne refinement, and a render-identity change re-keys approvals (plan 023)

The report's visual layer had never been revised by anyone since the Nocturne
mockup was ported; plans 018 through 021 reshaped its content on top of it.
Plan 023 built an evidence pack over rendered fixtures (page images, a
degraded-mode Impeccable detector run classified per finding, a
design-director review, and the collected residuals) and the operator picked
the direction from it: **refine the incumbent Nocturne world**, with the two
skill bans the plan allows keeping recorded consciously - Inter stays as the
print face (so the detector's `overused-font` findings on Inter are known
noise for report HTML) and the dark ground stays. The retired look's defects
were specific, not a failed world: the cover's closing group sat pinned to
the sheet bottom behind a dead band, the metadata sheet ended where its grid
ran out (about two-thirds void), the per-section heading rhythm had been
flattened to one uniform medium gap (the single undocumented drift a full
flat-source re-verification found, now the per-section map in the
design-system document), and the checklist's light print page was
undocumented. The refinement recomposes the front matter as two-act pages
(cover closing act and metadata risk band at roughly two-thirds page height),
adds the `--space-12` sheet-level step to the spacing ladder, moves the
section-head cushion onto it, documents the checklist's `@media print`
inversion as the deliberate print-medium decision it always was, and
re-stamps the design documents' reinterpretation clause on this baseline.
Canonical documents, flat sources, and the stylesheets moved in one slice,
docs first.

Section order, the section registry, pagination contract meaning, strings,
and every locked contract are unchanged; page counts are unchanged
(34/33/33/33 across both fixtures and languages). Trade-off 44's
appendix-last reading order stands until plan 024 lands its recorded,
operator-confirmed glossary-last reversal.

**Approval consequence (deliberate, not silent).** This plan changes render
identity, because the stylesheet is part of what a render digest verifies.
Previously approved reports keep their stored digests untouched; any
deliverable rendered after this change needs a fresh approval round over its
new digest. Nothing is migrated. At landing time no stored client artifact
was identified for re-approval (the reference audit's render is still pending
its `raisonSociale` confirmation); the operator confirms per deliverable at
render time.

### 66. `CLAUDE.md` and `AGENTS.md` hold only load-bearing content; a byte ceiling enforces it

A dangling Markdown link (issue closed 2026-09-02, `plans/025-llm-provider-switch.md`
authored but never committed) failed CI on three consecutive pushes before
anyone ran `pnpm run check` locally, which prompted adding a
`.githooks/pre-push` hook. Auditing `CLAUDE.md` for the same session
surfaced a second, slower problem: several numbered trade-off entries had
drifted from the section's own stated discipline (CLAUDE.md's trade-offs
intro: each line is "the one governing imperative," full detail lives
here) into re-narrating measured evidence and amendment history this file
already owns in full. Entries 35, 36, 41, and 63 were the clearest cases -
each had grown to 11-17 lines restating root-cause detail word-for-word
close to its `trade-offs.md` counterpart, rather than staying a pointer to
it. They were trimmed back to the imperative core; nothing was removed
from this file, since it already held the complete version of each.

**Why this matters beyond one cleanup.** `CLAUDE.md` and `AGENTS.md` are
not read on demand like this file - they are loaded into every agent
session automatically, so their size is a per-turn cost paid by every
session, not just the one editing them. Nothing stopped `CLAUDE.md`
specifically from regrowing the same way `AGENTS.md` was already guarded
against (trade-off precedent: `AGENTS.md`'s 24 KiB lean-entry-point limit,
enforced in `scripts/check-agent-docs.mjs`). `CLAUDE.md` gets the same
mechanism, ratcheted rather than arbitrarily chosen: the ceiling is set
just above its post-cleanup size, so it can still grow when a genuinely
new non-negotiable rule, locked contract, or trade-off earns a place there,
but a future session cannot silently let narrative drift back in the way
these four entries did. The rule itself - what belongs at this altitude
versus what belongs in a linked focused document - is written once in
`docs/agents/documentation-map.md`'s "Keeping entry-point documents lean"
section, not duplicated into `CLAUDE.md`, in keeping with the rule's own
content.

Do not raise the `CLAUDE.md` ceiling in `check-agent-docs.mjs` as a side
effect of an unrelated change; raising it is only ever a deliberate choice
made because new content earned its place at this altitude, the same
standard the file already applies to its own trade-off entries.

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

**Amended 2026-09-02, plan 021 (entry 64 above).** "Analyzed" here described
one undifferentiated scan fact; it now needs to be read as "inventoried."
Reachability and scan coverage remain the two decoupled facts this milestone
established, but coverage itself is no longer a single scanned/not-scanned
bit: every successfully crawled HTML page, sitemap-supplemented or
link-discovered, still receives render diff, axe, and the extended pass, while
only Lighthouse is family-stratified. That split is the correction, not a
reversal; a sitemap-only page still gets full content-sensitive analysis, and
`sitemap-orphan-page`/`sitemap-stale` still receive only the link-discovered
set exactly as decided above.

**9c: hotel prospecting and outreach.** The operator's two 2026-08-25
proposal drafts were reconciled against shipped 9a/9b/9b.5 code, canonical
legal and outreach rules, and three operator decisions made 2026-08-27. The
result is the execution queue in `plans/README.md` (14 slices at the time;
the index owns the current list); the drafts
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
`docs/rules/obligation-basis.md` cannot enter a real draft until it reaches primary
status. This requirement was superseded for the first hotel wave on 2026-09-08:
the deterministic argument B facts block may be used from the first send under
the rule in `docs/rules/obligation-basis.md`, "First-wave application". Source schemas/licences, score weights, preview storage, Gmail OAuth,
mailbox setup, live deployment, and every named-site scan remain explicit STOP
gates in the relevant numbered plans. The first real wave cannot land before
2026-09-15. Paid full-audit sitemap coverage from 9b.5 remains independent of
this prospecting path.


### 67. OpenAI GPT-5.4 Mini replaces Mistral for every model pass (plan 025)

The Mistral account's persistent rate limits and inability to call its larger
model blocked a full French analysis. Plan 025 replaces the SDK and routes the
structure, writing, shadow-review, and outreach passes through OpenAI's Chat
Completions API. The strict JSON Schema hints, explicit Zod validation, guards,
retry budgets, and fail-loud behavior are unchanged. Every call uses
`temperature: 0.2` and `reasoning_effort: 'none'` so hidden reasoning does not
compete with the bounded JSON completion.

The plan originally selected dated `gpt-4.1-mini-2025-04-14` at $0.40 input
and $1.60 output per million tokens. On 2026-09-03 the operator requested a
second pass over the current OpenAI catalog, prioritized report quality over
the lowest price, and explicitly preferred a generic alias. The resulting
choice is `gpt-5.4-mini`: OpenAI describes it as its strongest Mini model; it
supports Chat Completions and Structured Outputs, defaults to no reasoning,
and costs $0.75 input and $4.50 output per million tokens. It remains cheaper
than the displaced Mistral Medium baseline ($1.50/$7.50). A maximum 16k output
costs $0.072 plus input rather than $0.12 output alone.

Rejected for this combined workload: GPT-5.4 nano and the older Nano models,
which OpenAI positions for simple high-volume classification, extraction, and
ranking rather than client-facing bilingual prose; GPT-4o Mini and GPT-4.1
Mini, which are cheaper but lower-quality starting points; GPT-5.6 Terra,
which is the current balanced family but costs $2/$12 and defaults to medium
reasoning; and GPT-5.6 Sol, whose $4/$20 flagship price is disproportionate to
bounded report generation. A per-pass model split was also rejected because it
would complicate provenance and make a reused structure pass impossible to
describe with the locked single model field.

Using a generic alias deliberately weakens reproducibility: two analyses that
both record `gpt-5.4-mini` can reflect different provider snapshots after an
alias repoint. The operator accepts that risk in exchange for automatic minor
upgrades. Re-run the saved-audit French/English quality check after a repoint or
if guard/retry behavior changes materially. API customer content is not used
for training by default; EU regional storage and processing remain an
organization/project-level opt-in with eligibility and retention-control
requirements, a regional base URL, and a 10 percent uplift for this model.

Live acceptance on 2026-09-03 resolved the generic alias to
`gpt-5.4-mini-2026-03-17`. All six API-facing schema mirrors (structure,
writing, reviewer, and outreach touches 1 through 3) returned `finish_reason:
stop`, no refusal, and passed their explicit Zod parsers. The plan's earlier
reference to seven schemas was an arithmetic error; there are six real mirrors
and all six were exercised. Their 1,100 combined tokens cost approximately
$0.0021 and completed in 1.7 to 5.4 seconds each.

The representative saved audit then completed one structure, two writing, and
two reviewer calls with no refusal, truncation, retry exhaustion, or guard
failure. It used 174,707 input and 7,536 output tokens, approximately $0.1649,
and persisted one shared 10-theme structure plus French and English analyses
with `model: 'gpt-5.4-mini'`. Both reviewer artifacts marked all 42 reviewed
fields supported. Compared with Mistral's stored 11-theme English output, the
new structure more usefully places the reservation page's keyboard, button,
and contrast barriers together at priority one and avoids some unnecessarily
prescriptive prose. Its main weakness is repetition: the 179 touch-target
findings are divided into three page-family themes with similar actions,
whereas Mistral grouped them once. The French is clear, cautious, and
client-readable overall, with occasional slightly mechanical wording such as
"assistants de réponse". This is acceptable evidence for retaining GPT-5.4
Mini, subject to the operator's required French report read.

PDF generation reached the existing cover-identity safety gate and stopped as
designed: the synthetic fixture's `nomCommercial`, "Hôtel du Bassin", remains
detected rather than operator-confirmed. Do not falsify that provenance. Once
the operator confirms or corrects this fixture name, generate both reports and
perform the final French read before accepting the provider for production.

The operator confirmed that fixture identity later in the same session. The
large fixture then exposed a separate deterministic catalog gap: a valid
`keyboard-trap` finding has no reviewed report remediation, logged as issue
#27 rather than weakened or silently omitted. A second saved run of the same
synthetic fixture contains 16 findings without that rule and was therefore used
for the rendered acceptance path. Its shared three-theme structure and paired
FR/EN writing and review passes added 12,045 input and 2,427 output tokens,
approximately $0.0200. Both PDFs rendered successfully: 25 French pages and 24
English pages. The generated priorities are concise, correctly grounded, and
natural in both languages; the French priority prose passes the client read.
The deterministic surrounding template has repeated singular-agreement defects
such as "1 pages", logged separately as issue #28 and not attributed to the
model migration. Total measured OpenAI spend for schema smoke, the large
comparison, and the rendered acceptance pair was approximately $0.1870.

The operator read the rendered French and English reports on 2026-09-03 and
accepted the prose for production. The single objection was the deterministic
template's underlined jump-link labels, not the model output; it was removed
the same day and recorded in the report design tokens document.

**Addendum, 2026-09-07, plan 027.** The writing pass alone now runs at
`temperature: 1.0` (`WRITING_OPENAI_TEMPERATURE`, raised same-day from an
initial 0.7 by operator decision), while the structure and reviewer passes
stay at this entry's `temperature: 0.2`. This is distinct from the per-pass
**model** split already rejected above: that rejection was about the single
`model` provenance field becoming ambiguous when a structure pass is reused
across a later `--language` run, and still holds - all three passes share
one `OPENAI_MODEL`. Temperature has no such reuse ambiguity: the persisted
`temperature` field already records specifically the writing pass's own
call (`docs/rules/llm-layer-rules.md` section 3), so giving that pass its
own value costs nothing new. The change was made because 0.2 measured
near-verbatim reproduction of the prompt's own worked examples across all
18 stored French themes (plan 027's diagnosis); 1.0 pushes further past
that pattern while strict JSON output remained reliable in testing at 0.7.

### 68. Real-scan fixtures go stale silently; a freshness ratchet catches it instead of a changelog

Discovered 2026-08-25: the whole suite was green while
`artifacts/sas-fernande.fr/2026-08-02T17-31-56Z` still reported 78 findings,
months after normalization changes had taken it to 42. `artifacts/` is
gitignored, so nothing versioned these directories, and nothing checked
whether the code that produced them was still the code in the tree. Every
test asserting "78 findings, 61 minor" was describing a pipeline that no
longer existed, and would have handed the next person eight unexplained
failures with no way to tell a real regression from accumulated staleness.

`fixtures/audits.json` is now the single curated list of real-scan
directories the test suite depends on, each with a one-line reason it is
kept, since the list had grown to thirteen directories with three
timestamps for one site and no record of why. `pnpm fixtures:refresh`
re-derives every one of them with `normalize <dir>` and stamps each with a
fingerprint of the normalization source that produced it
(`scripts/fixture-fingerprint.mjs`); `fixture-freshness.test.ts` fails the
build the moment a listed fixture's stamp does not match the code in the
tree, so staleness is a red test, not a fact discovered by reading `git log`
months later.

Amended 2026-09-05 (issue #75, third recurrence): the committed,
de-identified copies under `fixtures/test-audits/` are a separate derived
artifact `fixtures:refresh` never touches, so three fingerprint bumps
(af8054d, 3b79441, 5095a29) shipped while those copies still carried the
old stamp, and the report command failed closed on any machine with a live
`MONGODB_URI`. `fixture-freshness.test.ts` now also ratchets the committed
copies: every stamped manifest and analysis must carry the current
fingerprint and the digest current code computes over the committed
`findings.json`, which makes the re-stamp a required part of the
fingerprint-bump commit itself. That ratchet proves stamps against content;
it cannot prove the content is what today's code would re-derive from the
original raw scans, which only a real `fixtures:refresh` on the machine
holding `artifacts/` can do. Re-stamping without a refresh is legitimate
only when the bump is established output-neutral, as 3b79441 did; where it
is not, the content delta must be folded in with the stamp, as #75 did for
the alt-text title unification.

`rule-coverage.test.ts` adds two more measured ratchets distinguishing
recall (the scanner finding a real issue at all, bounded by what automated
detection can reach and never moved by fixture work alone) from precision
(every printed finding being real, correctly described, and singly
counted, held to a near-perfect bar). Its recall ratchet fails when fewer of
the tool's emittable rules are exercised by any curated fixture than were
measured last time; a rule with severity mapping, remediation copy, and
report wiring but no fixture behind it has never been observed firing,
which is exactly how `hreflang-missing` (trade-off 31), the LCEN regime
(trade-off 28), and both cost gates (trade-off 23) went unnoticed for
months. Its single-rule concentration check is a precision smell: no rule
may account for more than 30 percent of one audit's findings, and has
caught the same underlying defect three times under three different names
(trade-off 31, 219 of 282 Lagnonu findings in five rules; trade-off 30, 102
of 305 haaitza findings in two Lighthouse image audits; trade-off 24, 182 of
265 language variants of one page) — each time the wrong identity was
chosen for a defect, so one instruction printed dozens of times. A rule can
legitimately sit above the line (`image-alt` on a picture-heavy site, where
each image is genuinely a separate editorial decision); the threshold
exists to make crossing it a question asked, not a pattern that ships
unnoticed a fourth time.

### 69. Per-host prompting guidance is a focused document, and CLAUDE.md's trade-off index is trimmed to one line each

Claude Opus 5, Claude Sonnet 5, GPT-5.6, and GLM-5.3/5.3-Flash each shipped
current, primary-sourced prompting guidance after this repo's agent documents
were written, and none of the three agent hosts had any per-model guidance at
all. `docs/agents/model-prompting.md` collects it: model identity, effort
defaults, and the behavioral deltas from each vendor's own guidance, one
section per host, dated and linked to its primary source. It governs
agent-host behavior only; the product's own model layer stays trade-off 67.
Two findings from that research are load-bearing enough to promote into
`CLAUDE.md` itself rather than leave in the focused document alone: Opus 5
over-delegates to subagents relative to prior models, so the charter now caps
delegation to large, genuinely independent, parallelizable tracks and never to
self-verification; and Opus 5 writes longer files by default, which matters
here specifically because `AGENTS.md` and `CLAUDE.md` carry enforced byte
ceilings (trade-off 66), so the charter now states the length-calibration rule
directly rather than relying on a linked document a session may not open.

The same research (GPT-5.6's own guidance measures 41 to 66 percent token
savings and 10 to 15 percent score gains from removing redundant or no-op
system-prompt instructions) motivated re-reading `CLAUDE.md` end to end for
content that no longer earned its altitude under trade-off 66's own standard.
Ten trade-off index entries (33, 37, 39, 40, 41, 42, 44, 62, 63, 64) had grown
past one governing imperative into argued detail already present in full in
this file; each is now trimmed to its "do not X" line plus its pointer. The
Skill Usage Policy catalogue's one-line trigger descriptions duplicated what
every agent host already lists for its own installed skills each session;
only the two entries carrying repo-specific facts no host listing has
(`impeccable`'s exclusions and hook wiring, `audit-rehearsal`'s scope) kept
their full text. The fixture-staleness incident narrative that used to sit
under Testing moved to trade-off 68 above, in the same pass. The Session-log
rationale paragraph moved to `docs/agents/handoff.md`, and the "Pausing
before the usage limit" section was compressed to remove its overlap with the
session-log section directly above it. Combined, these cuts took `CLAUDE.md`
from 55,739 to 47,870 bytes, restoring real headroom under the 56 KiB
ceiling without lowering it. No content was deleted outright: everything
trimmed already existed in full in a linked document, or was moved to one
that did not yet have it.

### 70. The writing pass asks the provider for a theme-keyed object, so a duplicate theme key is unrepresentable rather than merely detected

A full audit of `www.villasfoch.fr` (job f678c11d, 2026-09-03) crawled, ran
every content check, ran Lighthouse, and produced a valid French analysis.
It was then destroyed at the English writing pass, because the model returned
a theme map containing the key `t8` twice:

    attempt 1/3 rejected - theme key mismatch - missing: [], extra: [], duplicate: [t8]
    attempt 2/3 rejected - theme key mismatch - missing: [], extra: [], duplicate: [t8]
    attempt 3/3 rejected - theme key mismatch - missing: [], extra: [], duplicate: [t8]

The retry loop was not the weak part. Since issue #21 it carries each
rejection into the next call as an explicit correction, and it did so here:
the model was told about the duplicate twice and reproduced it twice, at
temperature 0.2 with reasoning effort `none`. That is the same
low-temperature reproducibility already measured for the severity-vocabulary
rejections, and it is the reason a correction loop cannot be the last line of
defense on its own.

The weak part was that the response could express the failure at all. The
pass knew the expected theme keys before it made the call, but the provider
schema admitted an array of theme objects each carrying its own `themeKey`
string, so nothing checked the key set until the response had already been
paid for and parsed.

`buildWritingOutputJsonSchema(themeKeys)` now builds the schema per call:
`themes` is an object whose properties are exactly the expected keys, every
one of them in `required`, with `additionalProperties: false`. A JSON object
cannot carry a key twice, so the duplicate is unrepresentable; `required`
makes an omission a provider-side violation; `additionalProperties` makes an
invented key one. Under OpenAI's strict structured output every declared
property must be required anyway, which is exactly the constraint wanted.

The obvious smaller change, keeping the array and constraining `themeKey` to
an enum, was rejected on what strict mode actually supports: `uniqueItems`,
`minItems` and `maxItems` are all unsupported keywords there, so an enum
would have blocked only the invented key and left the duplicate that caused
this incident. It would have looked like a fix and changed nothing.

Costs accepted. `writing-output-schema.ts` stops being a literal mirror of
`writingPassOutputSchema`, which is why trade-off 7 above carries an
amendment; the shape-sync test now compares field by field with `themeKey`
excluded, since the property name carries it. `client.ts` gains a small
transform back to the array shape before the Zod authority parses, which is
the one place the two shapes are bridged. Nothing downstream of that parse
changed. Theme order in the output is now the input's order rather than
whatever order the model emitted, which is a small determinism gain, not a
behavior change anyone depended on.

**Verified live, 2026-09-03.** Confirmed against the audit this incident
destroyed. `analyze --language en` was re-run on
`artifacts/www.villasfoch.fr/2026-09-03T18-51-57Z`, whose stored structure
document has 9 themes including the `t8` that was duplicated, reusing that
structure so only the writing pass ran. It succeeded on the first attempt with
no rejection logged, returned all 9 themes, and wrote
`analyses/2026-09-03T20-12-12Z-en.json`, which carries no `themeKey` into the
locked shape. The provider accepts a theme-keyed strict schema, and the audit
that was lost to this defect now has its English analysis.

`findThemeKeyMismatches` stays, as defense in depth, and should now never
fire. Kept because a provider that quietly stops honouring strict mode, or a
defect in the schema builder, would otherwise pass unnoticed. Issue #36 also
suggested a deterministic local repair, merging or dropping a duplicate
before burning the audit. Not implemented, deliberately: under this schema a
duplicate cannot arrive, so the repair path would be dead code, and adding
one would weaken the reject-rather-than-patch posture the whole LLM layer
rests on. If this guard ever fires again, that is a signal worth reading, not
a case for patching model output.

### 71. Remediation copy is coverage-tested against every rule the scanners can emit, not only the rules a fixture happens to contain

Report generation aborts when a priority finding names a rule with no
reviewed remediation copy (`rendered-priorities.ts`, "Missing reviewed report
remediation for rule IDs"). That fail-loud boundary is right: a wrong
remediation instruction is worse than none, so the report refuses rather than
guessing.

The problem was what guarded it. `remediation.test.ts` only asserted coverage
for rule ids that some committed fixture happened to emit, so a rule the
scanners can produce but no fixture contains had no copy and no test. Issue
#27 is what that costs: a valid audit containing a detected `keyboard-trap`
could be scanned and analyzed but could never produce a client report, and
the failure landed at the last stage, after the crawl and both model passes
had already been paid for.

Adding the missing `keyboard-trap` copy (0555cc9) fixed that one rule and
left seventeen others in exactly the same position. This entry is the
mechanism: `remediation.test.ts` now also derives coverage from
`CUSTOM_CHECK_SEVERITY`, so every custom rule with a severity mapping must
have reviewed French and English copy before it can reach a report. The
eighteen gaps that check exposed are filled, each written against what the
rule actually detects, using the reviewed gloss already agreed for it in
`rule-translations.ts` rather than a paraphrase of its title.

This is the same three-layer mechanism `rule-translations.test.ts` has used
since 2026-08-24, adopted for the same reason: that table was extended
reactively four times, each time after English text had already shipped
inside a French report, and the source-derived check ended it.

That first pass was scoped to custom rules and left 66 of the 113 reachable
axe and Lighthouse rules uncovered, on the argument that those universes are
not this repo's and that writing copy for rules it has never observed would
produce exactly the guessed remediation the table exists to prevent.

**Amended the same day, after checking the premise.** That argument was too
strong, and the evidence against it was already in the repo: all 66 of those
rules carry a reviewed French label and gloss in `rule-translations.ts`, from
the 2026-08-24 decision to translate the full reachable set. The substance of
what each rule detects was therefore already reviewed content here, so a
remediation line is written from it rather than invented, and the axe rules in
question are mostly mechanical single-fix rules (`aria-*`, `td-headers-attr`,
`list`/`listitem`) where the fix is well defined. All 66 now have reviewed
copy in both languages, and coverage is ratcheted over the whole reachable
set, matching what `rule-translations.test.ts` does.

The accepted cost is that an axe-core or Lighthouse upgrade introducing a new
rule now fails the build until copy exists for it. That is the intended
behavior, not a side effect: `packages/scanner/src/reachable-rule-ids.test.ts`
already forces regenerating the committed list on such an upgrade, so the
upgrade path gains one step rather than a new kind of work. The alternative,
filling the copy without the ratchet, was rejected on this repo's own history:
the translations table was extended reactively four times, each time after a
client-facing report had already shipped English text inside a French
document, and only the source-derived check ended it.

### 72. The build identity is stamped into the deployment image, never derived from a git checkout at runtime, and client-facing copy refuses the sentinel

`readOdysseusBuildId()` existed to keep a semver number that never gets
bumped out of a paying client's footer (item 0.6): a git short SHA ties a
report to an exact commit instead. It got that SHA by shelling out to
`git rev-parse --short HEAD` at runtime, and swallowed every failure into
the literal string `unknown`.

Production has no git checkout. `.dockerignore` excludes `.git` from the
build context, which is correct for image size and for keeping repository
metadata out of a deployed artifact, but it means the fallback was not an
edge case there: it was the only path. Every report rendered from the hosted
dashboard printed "build de rendu unknown" to the client, and every artifact
produced there recorded `manifest.tool.odysseusVersion: "unknown"`, which is
precisely the provenance the manifest exists to carry.

It looked intermittent, which is how it survived. On audit
`ff95ff97-cb54-41c7-8a33-89c9116985aa` one render resolved commit `2b7eec6`
and a later one resolved `unknown`; the difference was not flakiness but
which machine rendered it.

Two decisions, and both matter:

**The commit is stamped at image build time.** `release.sh` already passes
the verified commit as `ODYSSEUS_IMAGE_TAG` for both the build and the up,
so `deploy/compose.yaml` forwards it as an `ODYSSEUS_BUILD_ID` build
argument and the Dockerfile bakes it into the image. `readOdysseusBuildId()`
reads the environment first and keeps the git call as the development path.
The environment is deliberately not cached: reading it costs nothing, and
caching it would make the precedence untestable without a reset hook that
only tests would ever call. A full 40-character SHA is abbreviated to git's
short form so a stamped build reads identically to a local one and lands in
report filenames at the same length; anything that is not a full SHA passes
through untouched, since truncating a tag would corrupt it.

**The report refuses to print the sentinel even so.** The provenance line
now composes its build clauses through separate qualifier templates that the
caller selects or omits (`renderQualifierTemplate`,
`renderQualifierWithoutBuildTemplate`, `scanQualifierTemplate`), gated on
`isKnownBuildId` from `packages/core/src/build-identity.ts`. Stamping alone
would have been enough for the deployed path and would have left the defect
one misconfiguration away from returning. A provenance line that quietly
says less is honest; one that says "unknown" reads to a client as a defect
in the document and tells them nothing.

The sentinel and its predicate live in `core` rather than in whichever
package resolves the value, because the two ends must agree: the scanner
stamps it onto every manifest and the report decides whether it is fit to
print. They disagreed, and that is the whole bug.

Do not reintroduce a runtime `git` call as the primary source, and do not
interpolate a build identity straight into client copy without gating it.
Found by the audit-rehearsal pass on the Villas Foch report, filed as issue
#58.

### 73. A connection with no named database refuses to run, and production's database is pinned in compose (issue #38)

`connectToMongo()` passed the URI to Mongoose untouched. The operator's
`.env` and the server's `/srv/odysseus/.env` both name the same Atlas
cluster with no database in the URI path, so records from either machine
landed in whichever database the driver falls back to (`test`), and the
dashboard read all of it. A full audit run from the laptop therefore
produced a real production job row while the screenshots, manifest, and
per-page JSON stayed in the laptop's `artifacts/` directory: the dashboard
showed scans whose evidence did not exist where the server could serve it.
Observed 2026-09-03 on four villasfoch jobs; a read-only Atlas inspection
on 2026-09-05 confirmed all 5 jobs and 7 audits live in database `test`
and that no other non-system database exists on the cluster.

Two decisions, and both matter:

**Naming a database is fail-closed.** `connectToMongo()` resolves the
database from the URI path first, then `MONGODB_DB_NAME`, and throws when
neither names one. It never completes the name with a driver default, the
same posture `getMongoUri()` already takes toward the URI itself. A
database named in the URI always wins so the store suite's
`MONGODB_TEST_URI` per-worker test databases stay exact even when `.env`
sets `MONGODB_DB_NAME`.

**Production's database is pinned where the repository controls it.** The
production `.env` is hand-maintained outside the repository (runbook
section 4), so a fix that relied on editing it would not deploy.
`deploy/compose.yaml` sets `MONGODB_DB_NAME: test` in the app environment,
which overrides any `env_file` value; the name is historical, being where
the records have always landed. The server `.env`'s URI must keep carrying
no database in its path, because a path database would override the pin
and silently empty the dashboard.

Do not soften the refusal into a default database, and do not remove the
compose pin: the first re-opens the accident, the second makes production
depend on a hand-edited file outside the repository. Local prospecting
runs now write into the local database and are invisible to the server
dashboard; that separation is the point of the fix, not a regression to
revisit. It leaves the deeper issue open: artifacts still live only on the
machine that ran the scan, so cross-machine recovery still means copying
directories by hand until issue #38's option 2 (uploadable artifacts) is
built.

### 74. Screenshot capture is gated on the same predicate that governs retention, and Lighthouse is asked only for the categories that can become findings (plan 026)

Plan 026 asked a narrow question: make a single full audit finish sooner
without weakening anything it measures. The answer turned out to be mostly
about work the scan was doing and then discarding.

**Capture is gated on retention now, and the two predicates must never
drift.** Every page used to write two full-page PNGs, raw and rendered. At
the end of the audit `selectPageDirsToKeep` keeps the homepage plus at most
three pages, ranked by render-diff percentage above a 20 percent threshold,
and deletes the rest. Measured on real audits, that is nearly all waste: an
unfinished 2,532-page run left 5,050 PNGs and 12 GB on disk, while the two
finished hotel audits kept two files and zero files respectively. Full-page
capture of a long page is not cheap, and the cost was paid inside the
rendered stage, on every lane, for output provably deleted a stage later.

Capture is now gated on the same predicate that governs retention. Trade-off
2 already forbids a second implementation of the keep decision for pruning;
that prohibition now extends to capture. If the two ever diverge, the scan
either throws away a screenshot the pruner wanted or keeps paying for one it
does not, and the failure is silent in both directions. The change was
accepted only because it can be made provably invisible: the before-and-after
artifact directories must be identical, which was the shipping gate.

**Lighthouse is asked only for the categories that can become findings.**
`accessibility` and `best-practices` were already excluded from finding
emission (trade-off 1) but were still being computed and then discarded.
They are no longer requested. The excluded categories' scores are recorded as
explicit nulls on the manifest rather than dropped, so a stored audit still
says what was not measured instead of looking like a run that never had them.

**Measured effect**, same site both runs (`www.les-flotsbleus.com`, 29 pages,
through the dashboard queue): 570 s to 498 s total, minus 12.6 percent, with
the Lighthouse segment falling 439 s to 366 s, minus 16.6 percent. The two
analysis stages were untouched and did not move, which is the control:
essentially the whole saving is where the changes were aimed. Coverage was
29 of 29 on both runs with no failed passes, and the distinct finding count
moved 55 to 58 (critical 18 to 19), which is ordinary run-to-run variation on
a live site plus Lighthouse's own metric variance, not a loss.

**Two levers were considered and dropped rather than deferred.** Raising
rendered-lane concurrency was declined on measurement: the content-scan phase
was about 40 s of a 500 s run, so the lever cannot move the total meaningfully
and would spend the render-settle-timeout risk to buy nothing. Unqueueing
Lighthouse and putting the sequential crawl to the operator as a rule 5
question were both dropped for the reason in the next paragraph.

**The real finding was classification, not serialization.** On a real 33-page
hotel audit, all 32 pages carrying coverage came back `role: unknown` and
`confidence: fallback`, so the mandatory arm of Lighthouse selection fired
site-wide and plan 021's family stratification removed nothing at all;
`unique-template-family` at 30 of 32 shows template grouping collapsed too.
The paid audit is paying for a Lighthouse run on every single page, which is
exactly the behaviour trade-off 64 was written to avoid. That reorders
everything: the audit is slow because every page is a Lighthouse page, so
fixing classification changes how much work exists, while unqueueing
Lighthouse only changes how fast a needlessly large workload is processed.
Do not reach for concurrency here before classification is fixed. The defect
is filed separately; narrowing coverage to compensate is not an option, per
plan 026's own binding decision and trade-off 64.

### 75. Plan 034's v4 prescan batch scanned 110 hotels the operator never approved, via a job restart that does not resume the original candidate list (incident, 2026-09-08)

Job `dfcc1deb-8218-42d1-a322-2fb968f4df9a` was enqueued as
`prospect prescan run --limit 120` against the exact 120-domain list the
operator approved (`docs/session/plan-034-v4-prescan-selection.txt`). It was
reported complete with `"120 hotels prescanned, ... 2 evidence-incomplete, 1
failed"`. Read-only inspection of the `prescans` collection in Atlas `test`
before any further plan 034 work found that untrue: the job's `prescanVersion:
'v4'` records cover **229 distinct candidates**, not 120, and **110 of them
are domains that never appeared on the approved list** - live Chromium visits
to real third-party hotel sites nobody authorized. 35 of the approved 120
were also prescanned twice. The job's own progress message reflects only its
last internal pass, not the batch's cumulative reality: restricted to just
the 120 approved domains and taking each one's latest prescan, the true split
is 110 evidence-complete, 9 evidence-incomplete (not 2), and 1 true failure
with no record at all (`hotel-victoria.fr`) - matching the "1 failed" but not
the "2 evidence-incomplete."

**Root cause, in two parts, only one of which was already fixed.** The job
was reclaimed by a new worker mid-run: pre-`24d7ac0` code unconditionally
reset any `status: running` job to `queued` at server startup with no
heartbeat check, so a job that was still genuinely in progress could be
stolen and restarted, exactly as this one's `orphaned: true` flag records.
`24d7ac0` and `b6461ab`, both landing chronologically after this job finished
(15:48 and 16:09 against a 13:54 finish), fix that false-positive reclaim
with a heartbeat. They do not fix the second part: `prescanHotels`
(`packages/interface/src/prospecting/hotel-prescan/prescan-hotels.ts`) never
persists the actual candidate IDs a `--limit`-bound batch plans to visit,
only the count (`options.maxPages` on the job document). Every fresh
invocation starts its own paging cursor at the beginning and asks
`listCandidatesToPrescan` for "the next N qualified candidates in
`candidateId` order without a prescan yet" - a different set every time part
of the previous set already has one. A restart therefore re-visits whatever
of the original list wasn't yet recorded (the 35 duplicates) and then walks
straight past the end of the approved list into whatever qualifies next (the
110 unapproved domains), with nothing to stop at the operator's actual
boundary. `--domain`-bound single-site batches are immune, since the domain
is fixed regardless of restarts.

**Resolved 2026-09-08, issue #114.** A new limit-bound job snapshots its
ordered candidate IDs when it is enqueued. Every run and recovery filters the
candidate listing to that snapshot before applying the normal already-prescanned
skip, so it can finish only approved candidates, never replace them with the
next eligible rows. A pre-fix limit-bound job lacks the information needed to
recover its approved scope, so it fails closed and must be recreated from the
approved list. This is deliberately stricter than continuing a job whose
boundary cannot be proved.

**What is usable, decided with the operator 2026-09-08.** The 119 approved
domains that actually received a v4 prescan (all but `hotel-victoria.fr`) are
the batch of record for plan 034: legitimately authorized, and their
evidence-incomplete count is 9, not the reported 2. The 110 unapproved
prescans stay in the store rather than being deleted - they are real
measurements and deleting them would erase the incident's own evidence - but
are excluded from `hotel-outreach-v2` scoring, the v1-to-v2 diff, and any
wave-1 cohort selection. Politeness mechanics (robots.txt, identified user
agent, per-host delay, timeout) were still enforced by the scanner
regardless of which candidates were selected, since they do not depend on
authorization scope; this is a scope/authorization incident, not a
politeness one, as far as verified from the stored `robotsTxtFound` and
`effectiveDelayMs` fields on the affected records.

Limit-bound prescan jobs are restart-safe only when their persisted candidate
snapshot is present. A legacy job without it must be recreated rather than
recovered.

### 76. A full audit checkpoints its stages and resumes across re-claims; the release flow refuses to deploy over running jobs (plan 035, issue #124)

Every release recreates the app container, and the queue's SIGTERM drain can
only mark the interruption, not preserve progress: a redeploy or crash
silently forfeited the whole run. The 2026-09-08 incident lost a five-hour
audit at content-scan 79 of 202 to a routine deploy, and issue #111's slow
pacing makes 10-plus-hour audits a routine operating mode, so the exposure
window was no longer rare. Per-page results already streamed to disk
(`writePagesAsScanned`, trade-off 64 / issue #64), but the audit directory
was keyed by that attempt's `startedAt`, which a re-claim re-mints, so
nothing ever read them back.

**The run's identity lives on the job, not in the directory name's
mutability.** A full-audit job stamps `runIdentity: { startedAt, auditId }`
once (atomic create-or-return, so racing re-claims converge) and every
attempt reuses it: `buildAuditDir` resolves to the same directory,
`writeAuditArtifacts` persists under the same auditId (an upsert, so
trade-off 5's "a re-run is a retry" semantics hold unchanged), and the
per-claim `startedAt` keeps its existing orphan-detection meaning. Deriving
the directory from the jobId instead was rejected: the timestamp directory
name is a de facto contract (`parseAuditTimestampDir` throws on deviations,
bucket keys mirror it, `normalize <dir>` depends on it), and compatibly
reusing the existing layout needs no migration of any stored audit.

**The crawl inventory is checkpointed once, as a file in the audit
directory.** The moment the coverage gate passes and before any content
work, the complete `CrawlResult` plus the effective `AuditConfigSnapshot`
plus a tool-identity block are written atomically to
`crawl-checkpoint.json`, deleted only after the audit stage fully succeeds.
Storing it in the Mongo job document was rejected: it grows with page count
and every job read would carry it. A post-crawl crash therefore resumes with
zero re-crawling, which also stops re-hammering a site that may have been
rejecting the crawl in the first place.

**Amended 2026-09-09, issue #132.** The checkpoint is no longer deleted when
the audit stage succeeds: it now lives until the whole job reaches its
terminal state, deleted by the job runner after `completeJob` (and by the
`odysseus audit` CLI command after its audit stage), because a crash in the
analysis or report stages re-runs the audit stage and needs the checkpoint
to avoid re-crawling. Every resume validation, the coverage gate re-run,
and the mismatch cleanup are unchanged.

**Resume validation fails closed toward a fresh crawl, and a fresh crawl
under the same directory starts clean.** A checkpoint is reused only when
the recomputed effective config (job options plus environment-derived
clamps, which a redeploy can change), the tool identity (scanner package
version, planner version, checkpoint format), and the run's `startedAt` all
match exactly. On any mismatch the checkpoint, the frontier snapshot, and
that run's partial `pages/` directory are deleted before crawling fresh, so
stale artifacts can never leak into a new configuration's manifest, and the
skip-existing rule is structurally unreachable outside a validated resume.
The coverage gate re-runs on the checkpointed inventory, so a resume can
never launder a crawl the gate would reject today. Version fields catch
known shape changes but do not claim deep semantic equivalence across a
scanner upgrade; the fresh-start-on-mismatch posture is what keeps that
honest.

**The planner replay is deterministic because its inputs are persisted.**
`scan.json` gained two additive fields, `checkOutcomes` and
`renderedCostProfile`: `finalizeLighthousePlan` needs every page's rendered
cost to reproduce the interrupted run's Lighthouse selection, and those were
previously memory-only. A page whose `scan.json` exists is done, including a
page whose recorded Lighthouse outcome is a failure: a recorded failure is a
fact about the run, not something a resume retries. A pre-plan-035
`scan.json` without a cost profile is treated as pending rather than
trusted.

**A crash during the crawl itself resumes from a persisted frontier.**
Periodic atomic snapshots (`crawl-state.json`, throttled by page count and
time) carry the queue, visited set, inventory, discovered-URL bookkeeping,
continuation-guard family state, robots text, and sitemap result. The
restored crawl re-parses the persisted robots text instead of re-fetching,
never exempts its first fetch from the politeness delay, and restores the
guard's family counters exactly, so a resumed crawl cannot re-admit URLs a
family had already bounded.

**Startup resets every running job, not only stale-hearted ones.** The
10-minute heartbeat window left a fast container bounce wedging a job as
`running` forever: no worker owned it, and nothing would ever look again
until a later restart past the window. Production is one app container, so
at `JobQueue.start()` every `running` job is by definition unowned; startup
resets all of them (createdAt untouched, FIFO position preserved). The
stale-only default remains for any future multi-worker caller.

**The release flow refuses to recreate the container over running jobs.**
Immediately before `compose up -d`, `release.sh` asks the currently running
app container how many jobs are running. Any running job aborts the release
naming them; a probe failure or unreadable answer aborts as unknown; a
container that is not running at all has nothing live to protect and
proceeds. The override is one explicit token on the deploy command
(`force-running`, or the environment variable for manual SSH runs), keeping
trade-off 61's posture intact: still CI-verified, operator-triggered,
immutable releases. Fail-closed was chosen over warn-and-proceed because
the deploy's whole purpose here is to not guess about hours of third-party
site load.

### 77. Production deploys run locally through odysseus-deploy; the GitHub release workflow is retired unless the local path becomes a roadblock (operator decision, 2026-09-09)

The Hostinger box serving `app.odysseusaudit.com` is updated by the local
sequence `deploy/odysseus-deploy.sh` performs: sync the tree to
`/srv/odysseus`, render `deploy/compose.yaml` to
`/docker/odysseus/docker-compose.yml`, build `odysseus-app:latest` with the
short commit stamped as `ODYSSEUS_BUILD_ID`, `up -d`, then verify the running
container reports that build id. The operator chose this over the
GitHub-dispatched release controller of trade-off 61: one script from the
working machine is simpler for a one-operator product, and issue #127 showed
the cost of keeping a second, unused deploy path pointing at production
(a stale path hid a stale production behind a green health check).

Consequences, binding on every agent:

- Do not propose dispatching the `Deploy production` workflow, and do not
  propose migrating the box to the release-controller layout (`deploy` user,
  `releases/` tree, `deploy_*` volumes), unless the local path is genuinely
  blocked and the operator asks for an alternative.
- `PRODUCTION_DEPLOY_ENABLED` is `false`, so the workflow is deliberately
  skipped. `PRODUCTION_HOST` stays pointed at the real box so a stray
  re-enable fails closed on the missing deploy key instead of reaching the
  abandoned box (issue #127).
- Trade-off 61's mechanics and its 2026-09-09 hardening stay merged and
  accurate for if this decision is ever reversed. What is retired is the
  suggestion, not the code.

### 78. LCEN publisher-identification evidence: checked pages live in the finding, not in prose (plan 036, operator decision, 2026-09-10)

The `lcen-mentions-legales-missing` finding's `rawEvidenceForPage` now
carries the full article 1-1 field-presence table (one entry per row of
`docs/research/lcen-identification-finding-design.md`'s detector-status
table, extracted value or null) plus the checked-page list: the resolved
mentions-legales URL, whether scan-site.ts's homepage fallback picked it,
and every URL `findMentionsLegalesUrl` searched. The report's methodology
section and the finding's own description both state this coverage,
reading it from the payload rather than restating it by hand, per the
design's approved wording.

Durable rules, binding on every agent:

- Checked pages are evidence, not prose. A future report sentence about
  what this check covered must read the checked-page list from
  `rawEvidenceForPage`/`Finding.rawEvidence`, never hand-write a page
  reference that can drift from what the scan actually did.
- A detector-status row moves from `absent-not-proven` to `detectably
  present` only when a reviewed deterministic extractor for that exact
  field lands in the tree. Rewording, severity, or copy changes never move
  a row; SIREN and RCS/RNE registration number stay the only populated
  rows until a widening decision adds its own extractor.
- This finding's client-facing disclosure renders only in full audits
  (prospecting and hotel prescans emit no findings at all, trade-off 35);
  do not surface it in a prospecting or preview surface.

### 79. Impeccable reinstalled persistently, not as a one-off run (operator decision, 2026-09-11)

Plans 022 and 023 each ran the Impeccable design skill (pbakaus/impeccable,
https://impeccable.style) as a deliberate one-off: installed, used as
read-only or advisory input, then removed (2026-09-09), per
`docs/research/design-skill-alternatives.md`. The operator asked for a
persistent, full install this time, answering that research doc's open
questions directly: the native installer (`npx impeccable install`), not the
skills CLI route; the `claude` and `codex` providers, project scope; hooks
enabled; and every surface including the report, with a documented per-rule
exclusion rather than a whole-surface ban.

Footprint: `.claude/skills/impeccable/` and `.agents/skills/impeccable/`
(each roughly 18 MB, including a compiled per-platform detector binary,
duplicated because the native installer compiles separate provider payloads
rather than using skills-lock.json's shared-file-plus-symlink convention
every other skill here follows), `.claude/agents/impeccable-*.md` (four
subagent prompts), `.codex/hooks.json`. None of this is tracked in
skills-lock.json; that file's provenance model does not cover per-provider
compiled payloads.

Report exclusion: the locked Nocturne design system directly conflicts with
the detector's `overused-font` ban, since self-hosted Inter is the report's
deliberately kept print face (`docs/report/report-design-system.md`). Rather
than excluding packages/report wholesale, a shared, committed
`.impeccable/config.json` scopes an ignore-value to exactly that rule/value
pair on `packages/report/**`, with a recorded reason. Running the detector
against the current `nocturne.css`/`paged.css` found no dark-ground or
pure-black rule firing statically in the installed engine version (v0.1.5);
do not add an ignore for a rule that has not actually been observed to fire.

Hook wiring: the installer's default lands the Claude Code
PostToolUse/Stop hook in `.claude/settings.local.json` (gitignored,
session-local). Since the operator asked for the hook enabled as part of a
repo-wide, not session-local, install, it was moved into tracked
`.claude/settings.json` and removed from the local file to avoid double
firing.

Durable rules, binding on every agent:

- This is a live install, not documentation. Do not remove it as a side
  effect of an unrelated change.
- Do not widen the `packages/report/**` ignore beyond the one rule/value
  pair it currently holds without checking
  `docs/report/report-design-system.md` first; the report's design stays
  locked regardless of what the detector would otherwise flag there.
- `/impeccable init` (the `PRODUCT.md`/`DESIGN.md` interview) was
  deliberately not run in this session. It is an interactive interview with
  the operator, not something an agent fabricates on their behalf.
