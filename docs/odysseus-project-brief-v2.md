# Odysseus: Project Brief

**Odysseus** is the name of both the audit service and the tool that powers it. Any earlier reference to "audit-play" refers to this project.

**Purpose of this document.** Full context for a productized web audit service and the custom tool that powers it. A Claude instance reading this cold should understand the offer, the technical architecture, the workflow, and the remaining open work, without further background.

---

## 1. The concept in one paragraph

Sell standardized website audits to French small and mid-size businesses, delivered as a prioritized, plain-language report in French or English. Two audit types share one engine: technical / SPA-SEO audits (why a React or Next.js site is effectively invisible to search crawlers, plus Core Web Vitals and structured data), and accessibility audits against WCAG 2.2 and EN 301 549 (which carry legal exposure in France under the European Accessibility Act). Detection is done entirely by deterministic scanners. An LLM is used only at the end, to explain, group, prioritize, and translate findings into business language. The same tool that produces the deliverable also runs unattended across prospect websites, ranks them by severity, and generates the evidence used to open cold outreach. One tool, two jobs: finding the work and doing the work.

---

## 2. Why this shape of business

Reasoning, so it can be re-evaluated rather than assumed:

- **Detection is deterministic.** The valuable findings come from axe-core, Lighthouse, and a raw-versus-rendered diff, not from a model guessing. The tool has a defensible core that is not just an LLM wrapper. Reports survive being fact-checked by a client's own developer.
- **The work is standardized.** Every audit produces the same shape of data and runs the same checklist. Build the pipeline once and the tenth audit costs almost nothing in time while still selling at full price. Bespoke automation work does not have this property.
- **The tool doubles as the prospecting engine.** Scan many sites unattended, rank by brokenness, and open every cold email with a screenshot of the prospect's own broken thing. Sales and delivery run off one codebase.
- **The deliverable is document-based.** Nothing in the process requires live interaction, which keeps overhead low and the process repeatable.

**The counter-position, held deliberately.** This is not a SaaS to defend. The tool is now cheap for anyone to build, so there is no moat in the software itself. The moat is judgment, speed, bilingual delivery, and a client book. Build it as private leverage for a service, not as a product to open up. If self-serve access later makes sense for agency partners, that is a bonus, not the plan.

---

## 3. The offer

### 3.1 Audit types

**A. Technical / SPA-SEO audit.**
The core finding most React and Next.js marketing sites are exposed to: content renders client-side only, so the raw HTML a crawler receives is close to empty. The business has flat organic traffic and no idea why. Also covers Core Web Vitals, meta and canonical tags, structured data (JSON-LD), sitemap and robots.txt, internal linking, and hreflang (relevant for bilingual FR/EN sites, common in the wine and tourism markets).

**B. Accessibility audit (EAA / WCAG 2.2 / EN 301 549).**
Automated conformance scan plus manual verification of the criteria automation cannot cover (keyboard traps, focus order, meaningful alt text, form labelling, video captions). Delivered as a compliance-oriented report with prioritized remediation. This is the audit type with externally generated urgency, see section 8.

**C. AI visibility check (AEO / GEO), used as a hook, not as a core product.**
Whether ChatGPT, Perplexity, and Google's AI answers mention the business or recommend a competitor. This sells hard because the screenshot is visceral. It is deliberately positioned as an add-on section inside the main report rather than a standalone paid product, because the detection is noisy run-to-run and the main lever (off-site brand mentions) is slow and largely outside the client's control. Sharp tip, solid spine.

### 3.2 Packaging and pricing

**Revised 2026-08-03.** Three tiers, reduced to two. Implementation and monitoring are dropped entirely, not deferred. Reasoning below.

| Tier       | What it is                                                                               | Price                                                                 |
| ---------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Screening  | Automated scan only, no manual verification layer, generated framing                     | EUR 290 flat, published                                               |
| Full audit | Full scan plus manual accessibility verification, PDF report, recorded video walkthrough | EUR 1,200 to 1,900, set by risk band (see below), not quoted freehand |

**Screening is the outreach offer.** Fast, cheap, published, card payment, 48 hour turnaround, no calls. It exists to be a low-friction decision for a cold prospect, closer to an impulse purchase than a considered one. If a screening client upgrades to a full audit within 30 days, the screening fee is deducted from the audit price.

**Full audit pricing is risk-banded, not continuous.** The already-computed overall risk level (low, medium, high) places the audit at one of a small number of fixed price points inside the 1,200 to 1,900 range, rather than a formula that climbs with every additional finding found. A continuous per-finding price was considered and rejected: the sites that score worst are usually the best prospecting targets, since a badly broken site is the most convincing outreach evidence, and charging those same sites the most works against volume-based prospecting. It also does not track real effort, since the manual accessibility checklist runs once per site regardless of whether it turns up 15 violations or 60. The risk band keeps the justification power, the report's risk badge and its reasoning already lead the document, without the incentive problem or the pricing unpredictability of a continuous formula.

**Implementation and monitoring, dropped.** Both required an ongoing client relationship to deliver well, which competes directly with the operator's primary allocation of time to Aurora. This is a deliberate tradeoff, made with the cost understood: it removes the mechanism that was meant to make revenue compounding rather than purely transactional (see section 10). The accepted alternative is volume, repeated one-off sales across many prospects, on the reasoning that the addressable market of prospect websites is large enough to sustain that. This raises the importance of milestone 9 (prospecting mode) relative to where it sat under the three-tier model, since there is no retained client base to fall back on if outreach volume drops.

Notes on pricing logic, unchanged from the original reasoning:

- Price on business impact and legal exposure, not on hours or page count.

### 3.3 What the client receives

**Full audit**, all of the following:

1. Prioritized PDF report, in their language, structured by theme rather than as a raw violation list.
2. Each theme: what is wrong, why it matters commercially or legally, effort to fix, impact if fixed, affected pages, code-level detail in an appendix.
3. Before and after evidence for the SPA rendering issue (screenshot of raw HTML view versus rendered view).
4. A recorded video walkthrough, 5 to 10 minutes, covering the priorities and the reasoning.
5. A short "what to do first" summary aimed at a non-technical decision maker.
6. The manual accessibility verification layer (see `docs/manual-accessibility-checklist.md`), covering what automated scanning provably cannot catch.

**Screening**, a lighter subset: automated findings only, no manual verification pass, generated executive framing, no video walkthrough. Positioned as evidence of a problem worth investigating further, not as a compliance-grade deliverable.

---

## 4. Target market

**Primary targets.**

- E-commerce sites and consumer-facing service businesses above the microenterprise exemption threshold (see 8.1), since those are the ones legally exposed under the EAA.
- Wine estates, hospitality, and tourism businesses, often bilingual, often on modern JavaScript sites built by agencies that neglected rendering and accessibility.
- Real estate agencies, clinics, and professional service firms with lead-generation sites.
- Web agencies as white-label partners, reselling audits to their own client base. Higher volume, lower per-unit price.

**Deliberate non-targets.**

- Businesses under the EAA microenterprise exemption, for the accessibility angle specifically. They may still buy an SEO audit.
- Very large enterprises, which have procurement processes and long sales cycles.

---

## 5. Client workflow

| Stage                  | Mechanism                                                    |
| ---------------------- | ------------------------------------------------------------ |
| Qualification          | Automated mini-scan producing one piece of concrete evidence |
| Scoping                | Written intake questionnaire, 8 to 12 targeted questions     |
| Proposal               | Written proposal page presenting the two tiers               |
| Delivery               | PDF report plus recorded video walkthrough                   |
| Follow-up              | Written question rounds, scoped and included in the price    |
| Implementation kickoff | Written scope document plus a shared task board              |

**Intake questionnaire must capture:**

- Site URL, CMS or framework, hosting.
- Whether there is a staging environment, and access if implementation is likely.
- Primary business goal for the site (leads, sales, bookings).
- Languages served and target markets.
- Which browsers and devices matter to their customers.
- Whether there has been any accessibility complaint, formal notice, or legal contact.
- Company size and turnover bracket, which determines EAA applicability. Ask it neutrally as a scoping question.
- Who will implement the fixes: internal developer, agency, or the auditor.
- Any known issues they already care about.
- Deadline pressure, if any.

---

## 6. The tool: architecture

### 6.1 The governing rule

**The LLM does not detect. Deterministic scanners detect. The LLM explains, groups, prioritizes, and writes.**

This single rule is the credibility of the entire business. An LLM asked to audit a page directly will hallucinate violations and miss real ones. Every finding in every report must trace back to a scanner output with a rule ID and an affected element. The LLM may never introduce a finding that is not present in the structured input it received.

### 6.2 Pipeline stages

**Stage 1: Crawl and render.**
Fetch each target page twice:

- Raw HTTP fetch, no JavaScript execution. This is the naive crawler view.
- Full render via headless Chromium (Playwright). Capture the final DOM, a full-page screenshot, and console errors.

Diff the two. Text content present in the rendered version but absent from the raw version is the SPA-SEO finding. Quantify it (percentage of visible text missing from raw HTML) and screenshot both. This diff is the single most sellable artifact the tool produces.

Crawl scope: start from the homepage, follow internal links, respect robots.txt, cap depth and page count (default 20 pages, configurable). Politeness delay between requests. Identifiable user agent.

**Stage 2: Run the scanners.**
Against the rendered page:

- **axe-core**, via `@axe-core/playwright`. Industry-standard accessibility engine. Maps findings to WCAG success criteria, which is what EN 301 549 references, so reports cite real criteria rather than opinions. Configure the rule set for WCAG 2.2 level AA.
- **Lighthouse**, run programmatically as a Node module against the same Chromium instance. Provides Core Web Vitals (LCP, CLS, INP), performance diagnostics, and SEO basics. Its accessibility category is collected but emits no findings, because it is axe-core underneath and duplicates the direct axe pass with a different severity mapping. Its best-practices category emits none either, for the reasons in stage 3. Both category scores are recorded per page in the audit manifest.
- **Custom checks**, written in-house for what the above miss or report poorly: meta title and description presence and length, canonical tags, Open Graph, JSON-LD structured data presence and validity, sitemap.xml and robots.txt, hreflang correctness for bilingual sites, heading hierarchy, HTTP status and redirect chains, mixed content, image formats and sizes.

**Stage 3: Normalize and deduplicate.**
Scanners overlap and are noisy. Collapse everything into one findings model. This layer is what makes the service productizable, because everything downstream depends on a single stable shape.

Built in milestone 4. Full behaviour and reasoning: `docs/normalization-rules.md`. The finding document below is the shape it produces, and the locked contract in `packages/core/src/types/findings.ts` survived contact with real multi-scanner data unchanged.

Finding document:

```
{
  auditId,
  source: 'axe' | 'lighthouse' | 'custom' | 'renderdiff',
  ruleId,
  category: 'accessibility' | 'seo' | 'performance' | 'rendering',
  wcagCriteria: [ '1.4.3', ... ],
  severity: 'critical' | 'serious' | 'moderate' | 'minor',
  pageUrls: [ ... ],
  occurrences: Number,
  elements: [ { selector, snippet, screenshotRef } ],
  rawEvidence: { ... }
}
```

Deduplication runs in two passes, and the distinction matters enough that both are documented in `CLAUDE.md` as a trade-off not to reverse.

The fine pass keys on a hash of `source|ruleId|selector` and collapses the same selector appearing across many pages into one finding with a count, so a site-wide issue appears once rather than 400 times. The coarse pass then collapses different selectors for the same rule within a single page, because axe emits distinct positional selectors for some rules: on a real site, 69 instances of one body-text link defect on one page produced 69 separate findings, each with a count of one. Aggregation touches only groups confined to a single page; multi-page groups pass through untouched.

Selector normalization was considered and rejected. Stripping positional components would merge genuinely distinct elements, and a real scan confirmed that stable selectors (IDs, classes) dedupe correctly without it.

Cross-run identity for the monitoring tier is the dedupe key, so which pass produced a given key is a fact the monitoring layer will need to handle.

**Stage 4: The LLM layer.**
Built in milestone 5. Full behaviour and reasoning: `docs/llm-layer-rules.md`.

Input: the normalized findings array plus site context from the intake questionnaire (business type, goals, languages, audience). Never the raw HTML, never the full page. This keeps token cost trivial (a few cents per report) and keeps the model on rails.

Findings are filtered before they reach the model: critical, serious, and moderate only. On the first real site that was 17 of 78, since the remaining 61 were low-weight Lighthouse audits that would have consumed most of the model's attention on trivia. Minor findings still appear in the report appendix, which reads the unfiltered findings file. The guard functions receive exactly the filtered array the model received, never the full set, or a response could reference a finding it never saw and still validate.

Tasks:

- Group 200 raw findings into roughly 8 to 15 themes a human can act on.
- Write a plain-language business impact statement per theme.
- Estimate implementation effort per theme (low / medium / high) and flag which require design decisions versus pure code changes.
- Rank by impact against effort, informed by the client's stated business goal.
- Draft the executive summary.
- Produce output in French or English as specified.

Interface: strict JSON in, strict JSON out. System prompt instructs the model to return only JSON matching a fixed schema, no prose, no markdown fences. Validate the response against the schema (Zod) and retry on failure. Reject and log any output containing a finding ID not present in the input, as a hard guard against invented findings.

**The LLM is not called at all when a scan has not produced enough to justify it (2026-08-03).** Applies before this stage runs, on the full audit path: when findings are limited enough that a static "no significant issues found" template is more honest than spending a call on it. Full thresholds and reasoning in `docs/llm-layer-rules.md`.

Proposed output schema:

```
{
  executiveSummary: String,
  overallRisk: 'low' | 'medium' | 'high',
  themes: [
    {
      title,
      category,
      businessImpact,
      legalRelevance,          // for accessibility themes
      effort: 'low'|'medium'|'high',
      impact: 'low'|'medium'|'high',
      priorityRank: Number,
      findingIds: [ ... ],
      recommendedActions: [ String ]
    }
  ],
  quickWins: [ findingId ],
  notes: String
}
```

**Stage 5: Report generation.**
Render the structured result into a branded PDF. Printing a styled HTML template from Chromium is the pragmatic choice, since the template can be built in React and Tailwind and the same HTML can be served as a web version. Use Playwright's Chromium, which the scanner already depends on, rather than adding Puppeteer as a second browser dependency.

Report contents: cover, executive summary, overall risk, prioritized themes with impact and effort, render diff evidence with screenshots, Core Web Vitals table, full findings appendix grouped by category, methodology and tooling statement (important for credibility and for defensibility of accessibility claims), and a limitations statement (see 6.6).

**Stage 6: Prospecting mode.**
The same pipeline in a stripped-down configuration:

- Input: a list of candidate URLs.
- Run only the fast, high-signal checks: render diff, axe critical and serious violations, Lighthouse performance score, missing meta and structured data.
- Output: a ranked table of prospects by a composite "brokenness score", plus one auto-generated evidence screenshot each.
- Feeds directly into the outreach system in section 9.

This mode must be cheap and fast per site, since it runs against hundreds. The LLM is called only for prospects that clear a worthiness gate (defined in `docs/llm-layer-rules.md`, based on the severity mix of findings), never for every scanned site. Below that gate, a site is still scored and stored, it simply never reaches the LLM.

**Personalized outreach email generation (2026-08-03).** For prospects that clear the gate, the tool generates the cold email itself, not just a one-sentence hook, personalized to that site's specific findings. Evidence selection stays deterministic: the LLM does not choose which finding to feature, that choice is already made by the brokenness scoring and evidence selection above. The LLM's role is narrowly to write the email around evidence already selected. Output is a draft into a queue, never sent automatically, both because the manual review step is what keeps EU AI Act exposure low for the LLM layer (see 8.4) and because CNIL B2B email rules require clear identification and an opt-out in every message, which a human should confirm is present before send. The anti-hallucination guard carries over explicitly: state the WCAG criterion, never assert the EAA applies to this specific business. Email language follows the prospect's own site language, not a French default.

### 6.3 System architecture

Scans are long-running and memory-heavy, so nothing runs inside a request cycle.

```
Next.js dashboard
    |
    v
Express API  ->  MongoDB (audits, findings, clients, prospects)
    |
    v
BullMQ queue (Redis)
    |
    v
Worker process:
    crawl (raw + rendered, Playwright)
    scanners (axe-core, Lighthouse, custom)
    normalize + dedupe -> MongoDB
    LLM prioritization call -> validate schema
    PDF generation (Playwright Chromium)
    mark complete
    |
    v
Dashboard polls / subscribes -> renders result, download link
```

### 6.4 Data model, top level

- `clients`: name, contacts, language preference, sector, size bracket, notes.
- `audits`: as built in milestone 4. Site URL, timestamps, config snapshot, crawl statistics and page list, per-phase errors, and self-reported tool versions. The same type is written to `manifest.json` on disk, which is what lets normalization re-run offline against any artifacts folder with no database attached.
- `findings`: as specified in 6.2 stage 3, linked to auditId.
- `prospects`: url, sector, brokennessScore, evidenceRefs, outreach status, last scanned.
- `outreach`: prospectId, sequence step, sent timestamps, replies, outcome.
- `reports`: auditId, language, version, file reference, generated timestamp.

Version the findings model from day one. Reports will need regenerating and comparing over time, especially for monitoring clients.

### 6.5 Engineering constraints and gotchas

- **Chromium is heavy.** Full render of 20 pages takes minutes and consumes significant memory. Cap concurrency per worker. Provision a machine that can actually host Chromium, not a minimal serverless function. Reuse browser instances across pages within a job, and close contexts cleanly to avoid leaks.
- **Lighthouse and axe both need the page.** Sequence them against one rendered context rather than loading the page repeatedly.
- **LLM cost is negligible, scanning cost is not.** Optimize crawl scope, not prompt length.
- **Flaky performance metrics.** Core Web Vitals from a single lab run are noisy. Run performance passes more than once and report medians, or clearly label lab data as lab data. Consider pulling field data (CrUX) where available for larger sites, and say so in the methodology.
- **Rate limiting and politeness.** Prospect scanning touches sites without permission. Keep it to a single lightweight pass per site, respect robots.txt, identify the crawler, and do not hammer. This matters both ethically and to avoid being blocked.
- **Parallel crawl means concurrency, not a shorter delay (2026-08-03).** When multiple pages of one site, or multiple sites in a queue, run concurrently, the per-request politeness delay stays exactly as configured. Speed comes from running more concurrent browser contexts against different origins, or more concurrent pages within a rate-limit budget still enforced per origin through a shared limiter, never from lowering the delay. The rate limiter is scoped per origin, since two different websites share no politeness budget between them, only machine resources (CPU, Chromium memory) cap how many run at once.
- **Monitoring means diffing.** The monitoring tier needs stored historical findings and a regression detector, so design the findings model to support comparison across runs from the start. This is why every audit records the version of every tool that produced it: a scanner upgrade between two monthly scans otherwise reads as phantom regressions and phantom fixes with no way to attribute them.
- **Not everything a site links to is a page.** A real WordPress site linked four image attachment URLs from its gallery, and each one cost a full render, an axe pass, and a Lighthouse pass before producing findings against binary content. Non-HTML resources are dropped by extension before being enqueued, with a Content-Type check as a fallback. This matters more in prospecting mode, where a brokenness score computed partly from attachment pages is measuring nothing.
- **Screenshots are captured for every page and kept for almost none.** Only the homepage pair and the worst pages by render-diff percentage survive a scan. The reason is data minimisation rather than disk: full-page screenshots of a client site incidentally capture personal data, and not capturing is a stronger position than deleting later. The selection rule has one canonical implementation that report generation must reuse.
- **The fixture cannot find everything.** Both bugs above passed a full green test suite and were visible only in a scan of a real site. A milestone is not finished until its output has been checked against something real.

### 6.6 Honest limits to state in every report

Automated accessibility scanning catches a well-documented minority of WCAG issues, commonly cited around 30 to 40 percent. Keyboard navigation, focus order, alt text quality, form error handling, and media captions require manual checking. The report must say this explicitly, and the manual verification pass must actually be performed for accessibility audits. Overstating automated coverage is both a credibility risk and, in a compliance context, a liability risk. It is also a pricing argument: the manual layer is what a client cannot get from a free scanner.

---

## 7. Build sequence

**Revised 2026-08-02.** The original sequence deferred the interface until volume justified it, on the reasoning that a dashboard saves nothing at three clients. That reasoning is sound in the abstract and wrong for how this operator works. Building the tool complete, then selling, is the chosen approach. The tradeoff is accepted explicitly: slower to first revenue, in exchange for a deliverable and a workflow the operator is willing to put his name on.

Two constraints survive the change, because they are dependency facts rather than philosophy:

1. **Normalization before interface.** The dashboard is a view onto the findings model. That model does not meet real multi-scanner data until milestone 4. Building UI before that guarantees rebuilding it after.
2. **Scope must be written down before the interface is started**, or "fully functional" recedes indefinitely. See 7.1.

### Milestones

**Milestone 0: contracts and scaffold.** Done 2026-08-02. Findings schema v1, severity mapping, LLM output schema with hallucination guards, all locked before any code. pnpm workspace, strict TypeScript, client-rendered fixture with seeded faults.

**Milestone 1: render diff.** Done 2026-08-02. Raw pass with JavaScript disabled versus fully rendered pass, both text extractions scoped to body, screenshots, console errors, HTTP status. Verified returning 0 on a server-rendered site, confirming no extraction bias.

**Milestone 2: crawler.** Done 2026-08-02. BFS with robots.txt enforcement, exact-origin internal links, depth and page caps, politeness delay taking the stricter of local config and the site's own stated delay.

**Milestone 3: scanners.** Done 2026-08-02. axe-core against WCAG 2.2 AA reusing the rendered navigation, Lighthouse across four categories via a CDP port on the same Chromium instance. Per-phase error isolation. Validated on a real 10-page site in roughly five minutes with zero errors.

**Milestone 4: normalization and persistence.** Done 2026-08-02. Three scanners collapsed into the Finding model, two-pass dedupe, MongoDB persistence, and a restructured artifacts layout with a manifest recording self-reported tool versions. The locked contracts survived unchanged, which was the open question going in. Full rules and reasoning in `docs/normalization-rules.md`.

Two decisions reduced scope rather than adding it. Lighthouse's accessibility category emits no findings, because axe already covers it directly and running both produced duplicates with conflicting severities. Its best-practices category emits none either, because the four locked category values have no correct home for it, and filing "uses a deprecated API" under an SEO heading in a client report is the kind of thing a client's developer notices first. Both are revisited in milestone 8.

Two bugs were found only by scanning a real site after the full test suite passed: the crawler followed WordPress attachment URLs as pages, and axe's positional selectors defeated per-selector dedupe. Both fixed, and the lesson recorded in `CLAUDE.md`.

Verified on sas-fernande.fr: 11 pages, 78 findings, render diff 0 on every page as expected for a server-rendered site.

**Milestone 5: LLM prioritization.** Done 2026-08-02. New `packages/llm`, the only package that talks to the Mistral API. Structured output plus explicit Zod validation on every response, hard rejection of any finding ID absent from the input, two retries then a thrown error rather than a partial analysis. Analyses are stored insert-only, one per language and again after a prompt change, each recording the model identifier and temperature.

Verified live in both languages against the real capture: 11 themes from 17 findings, plain-language French that reads as French, and legal relevance lines naming the WCAG criterion and EN 301 549 without asserting the EAA applies to the business. The top-ranked theme was traced by hand to a single `is-crawlable` finding, and `curl` confirmed the quote request page carries `noindex, follow`. A client can check that claim in ten seconds, which is the whole proposition working end to end for the first time.

**Milestone 6: report generation.** Done. HTML template printed to PDF by Chromium. Bilingual. This is the client-facing artifact and the thing the whole business is actually selling. Originally a Tailwind template; replaced in milestone 6.2.

**Milestone 6.1: two-pass LLM split.** Done. Split the single prioritization call into a structure pass (grouping, ranking, language-independent, run once per audit) and a writing pass (prose, run once per language, constrained by the structure pass's fixed grouping). Fixed two real failures found on the first live run: theme and quick-win counts differing between French and English analyses of the same findings, and English prose surviving inside a French analysis despite an explicit instruction not to. Full mechanics in `docs/llm-layer-rules.md` section 9.

**Milestone 6.2: report v2 refactor.** Done 2026-08-07. A second real-client scan (haaitza.com) surfaced 40 defects across credibility, structure, legal framing, layout, the report's own accessibility, and content, recorded in `docs/report-v2-refactor.md` alongside a hand-verified prototype. Fixed: wrapper and noindex-legal pages are now diverted from the LLM entirely rather than trusted to be explained correctly (the v1 top-ranked theme was SEO advice on a Facebook embed); a deterministic site-wide accessibility floor and occurrence-volume weighting keep a defect present on 18 of 20 pages from ranking below a single-occurrence minor; `legalRelevance` is now built from a code-owned WCAG criterion table instead of model prose, closing off the one place the model could invent a legal claim; evidence screenshots are downscaled through a canvas pass instead of embedded at full resolution (30.7MB to under 600KB on the real haaitza report, verified); the PDF is now tagged with a bookmark outline and passes its own axe-core WCAG 2.2 AA audit with zero violations; the template moved off Tailwind onto the prototype's own hand-maintained CSS. `packages/report` gained a dependency on `packages/llm` so both the analysis and the report's Observations section always agree on which findings were diverted. None of the three locked contracts changed.

**Milestone 7: interface.** Done 2026-08-04. Queue and a private single-user dashboard (`odysseus serve`). Scope defined in 7.1 below.

**Post-7.1: scan concurrency and reskin, 2026-08-07.** Not a milestone, three same-day increments on top of shipped work. Scan-phase concurrency (render-diff, axe, Lighthouse in `SCAN_CONCURRENCY` lanes, Lighthouse itself serialized behind an in-process queue to avoid a confirmed `perf_hooks` collision; full mechanics in `CLAUDE.md` trade-off 10) implements the "concurrency, not a shorter delay" decision from 6.5 that had been written down but not yet built. The dashboard and the PDF report were both restyled in a GlassWire-inspired dark theme, pure CSS on the dashboard (no markup or script changes), CSS plus the removal of two decorative print artifacts on the report, re-verified against the report's own axe-core WCAG 2.2 AA self-test after a first-pass contrast failure was caught and fixed.

**Milestone 8: custom checks.** Meta, canonical, JSON-LD, sitemap, hreflang, heading hierarchy, redirect chains. Deferred because axe and Lighthouse already produce enough to sell an audit; these deepen it rather than enable it.

**Milestone 9: prospecting mode.** Batch scanning, brokenness scoring, evidence screenshots, prospect database.

**Milestone 10: monitoring.** Scheduled re-scans, regression detection, delta reports. What makes the monthly tier real.

### 7.1 Definition of done for the interface

**To be filled in before milestone 7 begins. Building against an undefined scope is the specific way this approach fails.**

The question to answer: what must the interface do before the first outreach email is sent, and what is explicitly a later addition? Anything not on the first list waits, no matter how appealing it looks mid-build.

**Updated 2026-08-03, ahead of milestone 7 starting.** Private single-user tool, so no auth, multi-tenancy, or permissions layer of any kind is needed anywhere in this. That simplifies the scope meaningfully relative to a multi-client dashboard.

- URL input field, scan/search button, and a collapsed-by-default advanced options section (max crawl depth, max pages, delay override).
- A progress indicator with an estimated time to completion. Two segments, since the two phases have different predictability: crawling has a reasonably accurate live estimate from `maxPages` and `effectiveDelayMs`, scanning is looser since Lighthouse's navigation mode adds its own extra page load. One combined number across both phases would be false precision.
- On completion, a severity roll-up only (counts of critical, serious, moderate, minor), not the full findings list, with a click-through to the detailed view. Already supported by existing fields on the locked `Finding` schema.
- A history log tab: date, site URL, risk or severity roll-up, status, linking into the full report. A view over the existing `audits` collection, not new data modeling.
- Two distinct scan types sharing one engine, both feeding the history log but shown distinguishably (a type column, or separate sub-tabs): **full audit scans** (single site, full checks, queued sequentially or a few at a time) and **prospecting scans** (batch of many URLs, lighter checks only, feeding the ranked prospect table from milestone 9 rather than the full findings log).
- Simple FIFO queueing across sites of either type, per-origin rate limiting per the engineering constraints above. No queue-priority system, not needed for a single-user tool yet.

Explicitly not required for the first email: client login, self-serve signup, billing, agency multi-tenancy, in-app remediation tracking, real-time collaboration.

---

## 8. Regulatory context

**All time-sensitive items in this section must be verified before being used in client-facing material.** The enforcement landscape has been moving, and the claims below were current as of the research behind this brief, not necessarily as of today.

### 8.1 European Accessibility Act (EAA)

- Applies to a defined set of products and services offered to consumers, including e-commerce, banking, transport, and electronic communications.
- Became enforceable on 28 June 2025.
- References EN 301 549, which in turn references WCAG. Audit against 2.2 level AA.
- **Microenterprise exemption:** service providers with fewer than 10 employees and annual turnover or balance sheet total not exceeding EUR 2 million are generally exempt from the service obligations. Verify the exact French transposition wording. This materially shapes the target list, since below that threshold the legal urgency argument does not apply.
- France moved early on enforcement, with formal notices issued to large retailers in 2025 and escalation thereafter. Verify current status before citing specifics in outreach. Never overstate legal risk to a prospect: it is both wrong and counterproductive if they check.

### 8.2 Related French frameworks

- **RGAA** is the French accessibility framework, primarily binding on public sector bodies and certain large private entities. Distinct from the EAA obligations. Know the difference, because prospects will conflate them.
- Existing French law (loi du 11 fevrier 2005 and subsequent decrees) already imposed accessibility obligations on parts of the private sector. Check which apply to a given prospect.

### 8.3 GDPR

- Crawling public pages is low risk, but screenshots and stored DOM snapshots can incidentally capture personal data. Retain no more than needed, set a retention policy, and document it.
- If implementation work involves access to client systems containing personal data, the auditor acts as a data processor and an Article 28 data processing agreement is required.
- The prospect database contains business contact data. Keep it defensible: legitimate interest basis, clear opt-out in every outreach email, honor unsubscribes, do not scrape personal addresses indiscriminately.
- French rules on B2B prospecting email (CNIL guidance) permit contacting professional addresses about their professional activity, with clear identification and opt-out. Follow that.

### 8.4 EU AI Act

Relevant if the tool's LLM layer is ever exposed directly to clients as an automated decision system. As designed here, with internal drafting and prioritization plus human review before delivery, exposure is low. Keep the human review step real, not nominal.

---

## 9. Outreach system

**Sequence.**

1. Prospecting mode scans a batch of candidate sites and ranks them, and gates which prospects are worth the LLM cost of outreach generation (see 6.2 stage 6 and `docs/llm-layer-rules.md`).
2. For prospects clearing the gate, generate one piece of evidence, the raw-versus-rendered screenshot or the top accessibility violations with counts, plus a personalized cold email draft built around that evidence.
3. Cold email drafts wait in a queue for a human send, never sent automatically. Short, specific, evidence-led. Lead with the finding, not with credentials. One clear ask, linking to the screening offer or a short intake form.
4. Follow-up sequence: two or three emails, spaced, each adding one new piece of information rather than repeating the ask.
5. Interested prospect either pays for screening directly (published, self-serve) or completes the intake questionnaire for a full audit.
6. Written proposal for the full audit tier, price set by risk band per 3.2.
7. Payment, ideally partly up front for first-time full-audit clients.
8. Audit runs, report and video walkthrough delivered.
9. No implementation or monitoring upsell step (dropped 2026-08-03, see 3.2 and 10). The report's closing section instead frames the report as something the client or their own developer can act on directly.

**What to test and measure:** open and reply rates by vertical, which evidence type converts better (SEO invisibility versus accessibility exposure versus AI visibility), which price point closes fastest, and time from first email to payment.

**Do not do:** fabricate urgency, misrepresent legal exposure, or send high-volume untargeted email. The whole play depends on the evidence being real and checkable.

---

## 10. Risks and failure modes

- **Report credibility collapse.** One hallucinated or wrong finding in front of a client's developer damages the whole offer. Mitigated by the deterministic-detection rule and schema validation, but the manual review step must be genuinely performed.
- **Automated-scan commoditization.** Free scanners exist and clients know it. The differentiator must be prioritization, business framing, bilingual delivery, and the manual layer, not the scan itself. Never let the report look like raw tool output.
- **Legal overreach in marketing.** Claiming EAA applicability to an exempt microenterprise is wrong and reputationally risky. Check the size threshold before using the legal angle.
- **Scope drift in the build-first approach.** The original brief called overbuilding the predictable failure mode and recommended selling three audits before building the platform. Section 7 revises that deliberately: the tool gets built complete first. The risk does not disappear, it changes shape. It is no longer "building the wrong thing," it is "never declaring the thing finished." The guardrail is section 7.1: interface scope written down before milestone 7 starts, and anything not on that list waits. If the interface milestone runs long past its written scope, that is the signal, not a reason to extend the scope.
- **One-off revenue, accepted deliberately (2026-08-03).** Implementation and monitoring were dropped rather than deferred (see 3.2), which removes the mechanism that would have made revenue compounding rather than purely transactional. This was a conscious choice to protect time for Aurora, not an oversight, but it means the business now depends entirely on outreach volume with no retained base to fall back on. Milestone 9 (prospecting mode) carries more weight under this model than it did under the three-tier one. Agency white-label partnerships remain a way to add volume without adding retention.
- **Prospect list exhaustion.** A regional market has a finite number of qualifying businesses. Plan for expansion by sector or geography before the list runs dry.

---

## 11. Open questions

### Settled 2026-08-02

- **Both audit types, equal weight.** They share one engine, so this costs nothing in code. The cost is in delivery time: accessibility requires a genuine manual pass, SPA-SEO does not.
- **No free public scanner.** Private prospecting only. A free scanner is a distribution play and there is no traffic yet to distribute to. Revisit if outreach proves the evidence converts.
- **Vertical choice deferred.** It shapes outreach, not the build. Decide when building the prospect list, informed by which sectors actually scan badly.
- **Build fully, then sell.** See section 7.
- **Severity floor before the LLM.** Critical, serious, and moderate reach the model; minor findings do not, but still appear in the report appendix. The filter shapes the narrative, not the completeness of the document. The rejected alternative (send everything, marked low priority, capped at one or two catch-all themes) is recorded in `docs/llm-layer-rules.md` for when real reports show whether the filter drops anything clients ask about.

### Settled 2026-08-03

- **Pricing structure.** Two tiers, not three. Screening at EUR 290 flat and published. Full audit at EUR 1,200 to 1,900, set by risk band rather than a continuous formula or a freehand quote. Implementation and monitoring dropped entirely. Full reasoning in 3.2.
- **Cost gating for the LLM layer.** The LLM is not called when a scan has not produced enough to justify it, on both the audit path (static template fallback) and the prospecting path (worthiness gate before outreach generation is attempted). Thresholds in `docs/llm-layer-rules.md`.
- **Personalized outreach email generation.** Built on top of prospecting mode, evidence stays deterministic, output is a reviewed draft, never auto-sent. See 6.2 stage 6 and section 9.
- **Interface scope for milestone 7.** Progress indication with ETA, severity-roll-up-only completion feedback, a history log distinguishing full audit scans from prospecting scans, and per-origin concurrent scanning. Updated 7.1.

### Settled 2026-08-07

- **Divert, don't instruct, for findings the LLM cannot give good advice about.** The v1 report's single most damaging line was SEO advice about indexing a Facebook embed. Rather than prompting the model to be careful around wrapper pages and noindex'd legal pages, those findings are now filtered out of its input entirely (`packages/llm/src/diversion.ts`) and rendered instead by a fixed-copy template section. The model cannot produce bad advice about a finding it never sees. Full reasoning in `docs/report-v2-refactor.md` part 4.1.
- **`legalRelevance` is built in code from a WCAG criterion name table, never written by the model.** Closes the one remaining place the writing pass could describe a legal obligation in its own words. See `docs/report-v2-refactor.md` part 4.3.

### Blocking, with a named dependency

1. ~~**A real domain with a bot-information page.**~~ Partially resolved 2026-08-07: `odysseusaudit.com` (and `.fr`) purchased, `ODYSSEUS_USER_AGENT` and both `.env` files now point at `https://odysseusaudit.com/bot`, and `packages/site` (a standalone Next.js app, not part of the tsc build graph, deployed separately to Vercel) scaffolds that route. Still blocking until the `/bot` page actually has content (placeholder component only, next turn) and the site is deployed, so a site owner checking their logs still finds nothing live yet.
2. **The manual accessibility checklist** (`docs/manual-accessibility-checklist.md`). Two confirmed entries so far, both discovered by testing rather than assumed: placeholder-as-only-label passes axe because the placeholder supplies an accessible name, and heading-order is excluded twice over, once by axe's tag set (tagged best-practice rather than WCAG) and again by the milestone 4 decision to emit nothing from Lighthouse's accessibility category. This checklist determines how long an accessibility audit takes, which determines whether the pricing holds. It gates selling accessibility audits, not the build.
3. ~~**Interface scope**, section 7.1. Gates milestone 7.~~ Resolved: milestone 7 shipped 2026-08-04 against that scope.

### Still open, non-blocking

4. Current EAA enforcement status in France, verified against primary sources.
5. **Partially resolved 2026-08-03.** Screening is published at a flat EUR 290. The full audit price is not published as a single number, since it is set by risk band, but the bands themselves (1,200 to 1,900) could still be published on a proposal page rather than quoted freehand. Whether to publish the bands or reveal the specific price only after a screening result is still open.
6. Which site to use as the first public case study.
7. **How the report handles analysis variance.** Identical findings produced eight quick wins in French and seven in English on the first live run. Expected, since the model groups and ranks rather than computes, but it means monitoring deltas must be derived from the deterministic findings layer with the analysis regenerated, not diffed. Decide the mechanics in milestone 10, not before.

---

## 12. Success metrics and kill criteria

**Working:**

- Three paid audits or screenings completed manually within the first eight weeks.
- Reply rate above roughly 5 percent on evidence-led cold email.
- Screening-to-full-audit upgrade rate within the 30 day window, as the first read on whether the two-tier structure actually converts.
- Time per audit falling measurably as the pipeline is built.

**Not working, reassess:**

- No paid audit after 60 days of consistent outreach with real evidence attached.
- Consistent pushback that the deliverable is not worth the price, after testing lower tiers.
- Milestone 7 running substantially past the scope written in section 7.1. Under the revised build-first sequence, this is the specific measurable form of the overbuilding risk. The response is to ship against the original scope, not to extend it.

---

## 13. How to use this project

Good things to ask for inside the Odysseus project:

- Building specific modules: the Playwright render-diff scanner, axe-core integration, the normalization and dedupe layer, the LLM prioritization prompt and schema, the PDF template, the prospecting scorer.
- Drafting client-facing material: intake questionnaire, proposal page copy, cold email sequences, report templates, in French and English.
- Verifying time-sensitive regulatory facts before they go into client material.
- Stress-testing pricing, positioning, and vertical choice.

Ground rules to carry into that work: deterministic detection only, no invented findings, plain language over jargon, and evidence that holds up when a client checks it.
