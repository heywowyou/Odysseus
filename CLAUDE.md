# Odysseus

Internal tooling for a productized web audit service sold to French small
and mid-size businesses. Two audit types share one engine: technical /
SPA-SEO, and accessibility against WCAG 2.2 AA and EN 301 549.

Full context: `docs/odysseus-project-brief-v2.md`. Read it before
proposing any architecture. Normalization behaviour and the reasoning
behind it: `docs/normalization-rules.md`. What the model may see, must
return, and how failures are handled: `docs/llm-layer-rules.md`.

Client-facing legal claims are governed by `docs/obligation-basis.md`;
nothing legal may be stated anywhere in the product unless it appears
there with status `primary`. Odysseus's own regulatory position (AI Act,
electronic invoicing, the perimeter of legal advice, prospecting channel
rules) is `docs/operator-obligations.md`. Prospecting is governed by
`docs/prospect-qualification.md` (who may be scanned and contacted) and
`docs/outreach-rules.md` (what may be said). Pricing and offer framing:
`docs/offer-positioning.md`.

## Non-negotiable rules

1. **Deterministic scanners detect. The LLM explains, groups, prioritizes,
   and translates.** The model may never introduce a finding absent from
   its structured input. This single rule is the credibility of the whole
   business.
2. Every finding traces back to a scanner rule ID and an affected element.
3. All LLM output is validated with Zod. Any response referencing a
   finding ID not present in the input is rejected, logged, and retried.
   See `packages/core/src/types/llm-output.ts`.
4. The LLM never receives raw HTML or full page content. Normalized
   findings plus site context only.
5. Crawling is polite: respect robots.txt, identifiable user agent,
   delay between requests, hard page cap, hard per-page timeout. The
   delay is enforced between scanner passes on a page as well, not only
   between crawl requests.
6. Never overstate legal exposure in any generated text. Accessibility
   obligations depend on company size and sector. State the criterion,
   not a verdict on whether a law applies to a given client. This is the
   "we report, we do not conclude" rule: reproduce the criteria, state
   the company's own registry data, describe where the case law stands
   including the current split between courts, and recommend confirming
   scope with a lawyer. Never state that a specific business is bound,
   never give a deadline, never state a sanction amount for that client,
   never present scope as settled. Binds report templates and the
   outreach LLM prompt equally. Full rule and legal basis:
   `docs/obligation-basis.md` section 7 and `docs/operator-obligations.md`
   section 2.

## Locked contracts, do not modify without asking

- `packages/core/src/types/findings.ts` — findings model v1
- `packages/core/src/normalize/severity.ts` — severity mapping
- `packages/core/src/types/llm-output.ts` — LLM schema and guards

Every downstream layer reads these shapes. Changing them invalidates
stored audits and breaks monitoring diffs. If a change is genuinely
needed, say so and stop. Do not change them and continue.

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
   2026-08-16 to actually match `docs/mockups/Ody Audit Report -
   Standalone - Final 16082026.html` (full audit) and `... - Preview -
   Final 16082026.html` (outreach preview) - the design system now has
   exactly one canonical source, those two mockups, not GlassWire. Both
   the original light-theme prototype and `docs/GlassWire/` were deleted
   2026-08-16 as a result; `report.css` is the only design artifact left
   in the repo, since the mockups themselves are opaque self-decoding
   bundles, not plain CSS. If the mockups are ever revised, re-derive
   `report.css`'s tokens the same way this pass did: load the mockup
   locally and read colors/radii/spacing off computed styles via the
   `playwright` MCP tools, not off assumption. Do not reintroduce a
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
    (`docs/report/archive/report-feedback-la-corniche.md` item 1.6's follow-up
    write-up). `packages/report/src/template/sections/findings-
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


## Stack

Node 22, TypeScript strict, pnpm workspace, ESM.
Playwright (Chromium), `@axe-core/playwright`, Lighthouse as a Node
module, Mongoose 9, Zod, Commander, Vitest, pino, `@mistralai/mistralai`.

No Redis, no BullMQ, no Express API, no Next.js dashboard, no public web
interface to the audit engine itself. Those are later phases and are
deliberately not being built. `packages/site` (added 2026-08-07) is not
an exception to this: it is a standalone Next.js marketing/bot-info site
with no access to the queue, the database, or any other package, not a
public front end for the tool.

PDF generation uses Playwright's Chromium, not Puppeteer. One browser
dependency, not two.

Lighthouse cannot accept a Playwright `Page`. Launch Chromium with a
remote debugging port and pass that port to Lighthouse, reusing the same
browser instance used for rendering and the axe pass. Playwright makes
at most two explicit loads per page (once raw, once rendered). Lighthouse
adds its own internal navigation on top of that when run in navigation
mode. That extra load is unavoidable and required to produce trace based
Core Web Vitals (LCP, CLS, INP). Snapshot mode was considered and
rejected because it cannot produce those metrics.

## Packages

- `core` — locked contracts plus pure normalization. No I/O, no database
  driver. This package is defined by the contracts it holds; keep live
  infrastructure out of it.
- `scanner` — owns the Chromium lifecycle, render diff, crawler, axe,
  Lighthouse, config, and the artifacts layout.
- `store` — Mongoose models and connection handling. Nothing else.
- `llm` — the only package that talks to the Mistral API. Peer of
  scanner, not a consumer: it depends on `core` and nothing else in the
  workspace.
- `report` — renders a stored analysis and the findings appendix into a
  branded, bilingual PDF via Playwright's Chromium, reusing `scanner`'s
  browser lifecycle rather than adding Puppeteer as a second dependency.
- `interface` — runs the job queue and a small private HTTP server that
  serves the single-user dashboard. The only package that binds a
  network port.
- `cli` — Commander entry points, thin. Real logic lives in the packages
  above.
- `site` — the public marketing site and bot-information page at
  odysseusaudit.com, added 2026-08-07. A standalone Next.js app deployed
  separately to Vercel, not part of the `tsc -b` build graph the other
  packages share, and does not import from and is not imported by any of
  them. Exists so `ODYSSEUS_USER_AGENT` points at a domain that actually
  resolves, per the crawling-politeness rule.

Eight packages for a tool one person runs is close to the ceiling. If a
ninth is proposed, check that its one-sentence description does not
overlap an existing package before agreeing.

## Artifacts layout

```
artifacts/<hostname>/<ISO-8601-UTC-timestamp>/
  manifest.json
  findings.json
  pages/<slug>-<6-char-url-hash>/
    raw.png
    rendered.png
    scan.json
  analyses/<ISO-timestamp>-<language>.json
```

One `analyses/` file per run rather than one per audit, since multiple
analyses per audit are expected and must not overwrite each other.

Screenshot references are relative to the audit directory, never absolute
paths, so stored findings survive the artifacts root moving or the
database being read from another machine. The manifest and the `audits`
collection share one type, which is what lets `normalize <dir>` re-run
offline against any artifacts folder with no database attached.

Tool versions in the manifest are self-reported by the tools themselves
(`testEngine.version`, `lighthouseVersion`) rather than read from
installed `package.json` files, so they record what actually ran. Not
retrofittable onto stored audits, and the monitoring tier depends on them
to tell a real regression from a scanner upgrade.

## Scope discipline

This is a command-line tool. Do not scaffold an API, a queue, a UI, or a
public-facing scanner unless explicitly asked. Do not add dependencies
without asking first. Prefer standard library and existing dependencies.

When a task is ambiguous, ask rather than assuming. Inventing structure
is worse than pausing.

## Testing

Run against `fixtures/spa-demo`, a local client-rendered React app with
deliberately seeded faults. Do not run a development scan against a live
third-party site on your own initiative. A scan against a specific live
site is allowed only when the user has explicitly given the go-ahead for
that site in the current conversation; that authorization covers the
site named, not sites in general, and does not carry over to a future
session. Vitest for unit tests, with scanner output fixtures committed
so tests do not require a browser.

The fixture is two pages and cannot exercise everything. Both bugs found
after Milestone 4 (attachment URLs crawled as pages, positional selectors
defeating dedupe) passed the entire test suite and were visible only in a
real-site scan. Saved artifacts under `artifacts/sas-fernande.fr/` are
real-site reference data; `normalize <dir>` re-runs against them offline
without touching the site.

Tests never call the live Mistral API. The LLM package is tested with
a stubbed client, including the path where retries are exhausted and the
call throws rather than returning a partial analysis. Live verification
is a manual step, and for anything client-facing it means reading the
output as the client would, not just checking that it validated.

Any fixture dev server started during a session must be stopped before the
session ends. Verify it is stopped with `pgrep` before reporting
completion.

## MCP servers

Start Claude Code sessions in this repo with `codysseus` (alias for
`./scripts/dev.sh`), not a bare `claude`, so `.env` is sourced and the
MCP servers below authenticate correctly.

Three MCP servers are available during development:

- **context7** — current documentation for any library in the stack.
- **mongodb-readonly** — a read-only view into the Atlas cluster, through
  a dedicated read-only database user separate from the app's own
  pro_db_user, for inspecting real findings and audit data while
  debugging.
- **playwright** — a separate Playwright instance for ad hoc, local page
  inspection during development: the dashboard UI, the spa-demo fixture,
  or a real page while writing a milestone 8 custom check. Not wired
  into the scanner package's own Playwright dependency.

Both mongodb-readonly and playwright are set to ask before every call,
not auto-allow. mongodb-readonly can read real audit and prospect data;
playwright can navigate to arbitrary URLs, including live client or
prospect sites. Each call is approved before it runs.

## Style

- TypeScript strict, no `any`, explicit return types on exported functions.
- Plain language in every user-facing string. No jargon, no acronyms
  without expansion on first use.
- All user-facing strings must support French and English from the start.
  Structure them accordingly, do not hardcode English and retrofit.
- No em dashes or en dashes in generated text, code comments, or report
  copy.
- Comments explain why, not what.

## Build order

Milestones 0 through 8 are complete, as are milestones 8.5a, 8.5b, 8.5c,
and 9a. Milestone 9b is next. Work in vertical slices, one milestone per
session.

1. Render diff only, CLI invocable — done
2. Crawler: internal link discovery, robots.txt, depth and page caps — done
3. Scanners: axe-core and Lighthouse against one shared Chromium instance — done
4. Normalize and dedupe into MongoDB — done
5. LLM prioritization layer with schema validation — done
6. PDF report generation, bilingual — done
7. Interface: queue and a private single-user dashboard (`odysseus serve`) — done
8. Custom checks: meta/canonical/JSON-LD/sitemap/hreflang/heading-hierarchy plus the extended accessibility pass (keyboard traps, focus order, form error handling, video captions, alt-text heuristic) — done
8.5a. Deterministic SEO and GEO (generative-engine-optimization) detection checks, a new `geo` finding category alongside `seo` — done 2026-08-16. Detection only: no reference data, no report changes, no LLM prose. See the milestone entry in the brief, section 7, and trade-off 14 below.

8.5b. Reference-stat table, sector detection, and per-client revenue calculator (`packages/core/src/reference-stats/`) — done 2026-08-16. Data and pure functions only, no LLM/report wiring yet. See trade-off 15.

8.5c. Wired the reference-stat table into the paid audit report: `ObligationAssessment.sector`, deterministic per-theme and geo-section citations, `geo` added to `CATEGORY_ORDER` — done 2026-08-17. Report-only; outreach and the numeric revenue calculator remain unwired. See trade-off 16.

8.6. Four detection additions surveyed against third-party audit tooling (security response headers, a named-AI-crawler robots.txt check, structured-data validation via `structured-data-testing-tool`, and CrUX real-user field data via `crux-api`) — done 2026-08-22. Detection only, scanner/core, no report/LLM wiring; see trade-off 18.

Milestone 9 (originally "prospecting mode") was split 2026-08-15 into
9a (prospect acquisition and qualification), 9b (prospecting
throughput), and 9c (outreach generation); milestones 10 through 13
(benchmark study, regime 2 documentation generator, free scope check,
monitoring) follow. 9a is done 2026-08-16. 9b is done 2026-08-22: see
trade-off 23. Full milestone list, including the phases beyond 8, is in
the brief, section 7.

Do not start a milestone before the previous one has tests passing, and
do not consider a milestone finished until its output has been checked
against a real site rather than the fixture alone.
