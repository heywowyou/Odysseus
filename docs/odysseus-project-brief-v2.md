# Odysseus: Project Brief

**Odysseus** is the name of both the audit service and the tool that powers it. Any earlier reference to "audit-play" refers to this project.

**Purpose of this document.** Full context for a productized web audit service and the custom tool that powers it. A coding agent reading this cold should understand the offer, the technical architecture, the workflow, and the remaining open work, without further background.

**Companion docs, added 2026-08-15, read alongside this brief for anything client-facing or legal.** `docs/obligation-basis.md` is the canonical source of legal facts about the client's position; nothing legal may be stated anywhere in the product unless it appears there with status `primary`. `docs/operator-obligations.md` covers Odysseus's own regulatory position (AI Act, electronic invoicing, the perimeter of legal advice, prospecting channel rules). `docs/offer-positioning.md` holds pricing and the diagnostic-not-audit-RGAA framing, superseding the pricing subsections of section 3 below where they conflict. `docs/prospect-qualification.md` and `docs/outreach-rules.md` govern milestone 9a to 9c. This brief's section 8 and section 9 point into those files rather than restating their contents, to avoid two sources of truth on legal claims.

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
Automated conformance scan plus the shipped extended accessibility pass,
covering keyboard traps, focus order, form error handling, video caption
presence, and a heuristic red-flag check for low-quality alt text. The exact
remaining detection gaps live in `docs/manual-accessibility-checklist.md`.
This is not marketed as a manual verification pass.

**C. AI visibility check (AEO / GEO), used as a hook, not as a core product.**
Whether ChatGPT, Perplexity, and Google's AI answers mention the business or recommend a competitor. This sells hard because the screenshot is visceral. It is deliberately positioned as an add-on section inside the main report rather than a standalone paid product, because the detection is noisy run-to-run and the main lever (off-site brand mentions) is slow and largely outside the client's control. Sharp tip, solid spine.

### 3.2 Packaging and pricing

**Revised 2026-08-16, single-tier model, flat price (`docs/offer-positioning.md`, canonical source for this subsection).** The paid EUR 290 screening tier is dropped entirely, not narrowed. The full audit is now the only paid deliverable, at a flat **EUR 1,600 HT**, published, replacing the risk-banded EUR 1,200 to 1,900 range described below. A new free document, the **outreach preview**, is sent to cold prospects before purchase; it is not a lighter tier of the paid report and has its own content rules in `docs/outreach-rules.md` (it never contains selectors, finding IDs, or exact page locations). Every mention of "two tiers", "both tiers", "screening", or the EUR 1,200 to 1,900 risk-banded range below this note describes the pre-2026-08-16 model and is kept as history, not current pricing.

**Revised 2026-08-03.** Three tiers, reduced to two. Implementation and monitoring are dropped entirely, not deferred. Reasoning below.

**Historical pricing decision from 2026-08-15, superseded 2026-08-16.** Prices were then held at EUR 290 and EUR 1,200 to 1,900 HT. The current single-tier EUR 1,600 HT model is governed by `docs/offer-positioning.md` and the revision note above. The still-current offer-positioning rationale from that review is that this is a diagnostic rather than an audit RGAA: it does not produce an official taux de conformité over the 106 RGAA criteria and cannot serve as the basis for a déclaration d'accessibilité. Naming that limit first is the position, not a hedge; see `docs/offer-positioning.md` section 2 for what the diagnostic offers instead (whole-site crawl versus a sample of gabarits, render diff evidence, combined SEO/AEO and accessibility findings).

The video walkthrough is dropped. The report is rendered from the exact crawl
and scanners against `findings.json` (see 6.2 stage 5).

| Deliverable       | What it is                                                                                                                               | Price                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Outreach preview  | Free, sent to cold prospects before purchase; own content rules, never selectors/finding IDs/exact locations (`docs/outreach-rules.md`) | Free                                                                                                                     |
| Full audit        | Full theme grouping, full finding detail, before/after evidence, extended accessibility pass detail, draft accessibility statement       | EUR 1,600 HT flat, published, no risk band, no freehand quote |

**Flat price, not risk-banded (2026-08-16).** Supersedes the risk-banded EUR 1,200 to 1,900 range described immediately below, kept for the historical reasoning only. The prior design placed the audit at one of a small number of fixed price points inside that range based on the already-computed overall risk level (low, medium, high), rather than a formula that climbed with every additional finding found, on the reasoning that the sites that score worst are usually the best prospecting targets and charging those same sites the most works against volume-based prospecting. That reasoning is no longer load-bearing now that there is one flat price for every full audit regardless of risk level; it is kept here only so the earlier design is not silently reinvented.

**Price band, dropped 2026-08-16 in favor of a flat price.** Do not reopen a
risk-banded or continuous pricing formula without a specific trigger, such as
consistent client pushback that the deliverable is not worth the price. The
current rationale is canonical in `docs/offer-positioning.md`.

**Price published (resolved 2026-08-07, price itself revised 2026-08-16).** A flat, single published price removes the main friction point for a cold prospect deciding whether the service is even in their budget more directly than a published range did. This resolves open question 5 in section 11.

**Implementation and monitoring, dropped.** Both required an ongoing client relationship to deliver well, which competes directly with the operator's primary allocation of time to Aurora. This is a deliberate tradeoff, made with the cost understood: it removes the mechanism that was meant to make revenue compounding rather than purely transactional (see section 10). The accepted alternative is volume, repeated one-off sales across many prospects, on the reasoning that the addressable market of prospect websites is large enough to sustain that. This raises the importance of milestones 9a to 9c (prospect acquisition, prospecting throughput, outreach generation) relative to where prospecting mode sat under the three-tier model, since there is no retained client base to fall back on if outreach volume drops.

Notes on pricing logic, unchanged from the original reasoning:

- Price on business impact and legal exposure, not on hours or page count.

### 3.3 What the client receives

**Revised 2026-08-16.** The paid screening tier described below (report depth split against one shared `findings.json`) is dropped along with the two-tier model in 3.2. The full audit is the only paid deliverable, unchanged in content from before. The free outreach preview replacing screening is not a lighter view of the same report template; it is a separate document with its own content rules in `docs/outreach-rules.md`, described at the end of this section.

PDF report only, no video walkthrough, rendered from `findings.json`.

**Full audit**, all of the following:

1. Prioritized PDF report, in their language, structured by theme rather than as a raw violation list.
2. Each theme: what is wrong, why it matters commercially or legally, effort to fix, impact if fixed, affected pages, code-level detail in an appendix.
3. Before and after evidence for the SPA rendering issue (screenshot of raw HTML view versus rendered view).
4. A short "what to do first" summary aimed at a non-technical decision maker.
5. Full page and selector detail for every finding, including the extended accessibility pass (keyboard traps, focus order, form error handling, video captions, alt text heuristic; see `docs/manual-accessibility-checklist.md` for what remains genuinely outside automated reach). Not marketed as a manual verification layer, see 3.2.

**Resolved 2026-08-16, `docs/offer-positioning.md` sections 1 and 2.** Manual human verification is not part of the product or the offer, full stop. The report is fully automated. The full audit includes no manual verification step of any kind, not even a narrowed one. Its position above the free outreach preview is justified by pre-audit framing instead: it is the automated step a business runs before commissioning a full audit RGAA, priced accordingly. Do not reintroduce any form of "manual checks" as a deliverable here.

**Outreach preview** (added 2026-08-16, replaces the paid screening tier above): a free document sent to cold prospects before purchase, governed by `docs/outreach-rules.md` rather than by this section's report-template rules. Executive summary, overall risk badge, top findings named by category and title (no page-level detail, no selectors, no finding IDs, ever), and a short render-diff excerpt on the single most-affected page. No theme grouping, no full appendix, no "what to do first" summary, no legal-exposure detail beyond a one-line statement that the full audit covers it. Positioned as evidence of a problem worth investigating further, not as a compliance-grade deliverable, and specifically not as a free-form todo list a prospect could hand their own developer without paying for the full audit's detail. See `docs/outreach-rules.md` for the RGPD article 14 disclosures (identity, data origin, purpose, opt-out) this document also carries as a likely first-contact artifact.

---

## 4. Target market

**Primary targets.**

- E-commerce sites and consumer-facing service businesses above the microenterprise exemption threshold (see 8.1 and `docs/obligation-basis.md` section 3), since those are the ones legally exposed under the EAA.
- Wine estates, hospitality, and tourism businesses, often bilingual, often on modern JavaScript sites built by agencies that neglected rendering and accessibility. Hotels and other booking businesses are sold on the same two-argument footing as any other e-commerce prospect, not held back to argument A alone; see `docs/obligation-basis.md` section 3 and `docs/outreach-rules.md` section 3.
- Real estate agencies, clinics, and professional service firms with lead-generation sites.
- Web agencies as white-label partners, reselling audits to their own client base. Higher volume, lower per-unit price.
- Accessibility agencies and freelances, as a second, parallel channel: their automated-detection stage is pure cost, and a tool that compresses it has a buyer who already understands the value. Full reasoning in `docs/offer-positioning.md` section 5. Run five conversations from week one to settle whether the channel is real; do not stop the SMB track for it.

**First vertical for outreach: French hotels rated at least three stars.** The
2026-08-27 operator decision supersedes the earlier e-commerce-first plan.
Atout France's classified-accommodation export is the sole catalogue, joined
to the shipped Sirene machinery. DATAtourisme was evaluated and removed after
measurement. The complete source, qualification, and rollout decisions are in
`plans/README.md`.

**Deliberate non-targets.**

- Businesses under the EAA microenterprise exemption, for the accessibility angle specifically. They may still buy an SEO audit.
- Very large enterprises, which have procurement processes and long sales cycles.

---

## 5. Client workflow

| Stage                  | Mechanism                                                    |
| ---------------------- | ------------------------------------------------------------ |
| Qualification          | Automated mini-scan producing one piece of concrete evidence |
| Scoping                | Written intake questionnaire, 8 to 12 targeted questions     |
| Proposal               | Written proposal page presenting the single paid audit       |
| Delivery               | PDF report only (video walkthrough dropped 2026-08-07)        |
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

Crawl scope: start from the homepage, follow internal links, supplement full
audits with eligible sitemap URLs, respect robots.txt, and apply a page cap only
when the operator opts in. Politeness delay and the identifiable user agent
remain mandatory. `runAuditStage` takes no tier parameter; the paid report and
the separate outreach preview consume scanner evidence through different
render paths.

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
Render the structured result into a branded PDF with the hand-maintained HTML
and CSS system documented in `docs/report-design-system.md`. Paged.js handles
paged media and Playwright's Chromium prints the result. Do not reintroduce
Tailwind or Puppeteer.

Report contents: cover, executive summary, overall risk, prioritized themes
with impact and effort, render-diff comparison bars, Core Web Vitals table,
full findings appendix grouped by category, methodology and tooling statement
(important for credibility and for defensibility of accessibility claims),
and a limitations statement (see 6.6).

**Tier concept dropped 2026-08-16 (originally added 2026-08-07, shipped 2026-08-08).** This stage used to take a `tier: 'screening' | 'full'` argument controlling section inclusion and detail depth, with a lighter screening render and a full render sharing one `findings.json`. The paid screening tier is gone, so is the parameter: `@odysseus/report`'s `renderHtml`/`generateReportPdf` and `runReportStage` no longer take a tier argument, there is exactly one report body (`render-html.ts`'s single `renderBody`), the `odysseus report --tier` CLI flag is removed, and stored report documents (`ReportDocumentFields`) no longer carry a `tier` field (historical documents still have one on disk; it is simply not read). The free outreach preview that replaces screening is not a lighter render of this same template; it has its own render path, its own document, and its own content rules in `docs/outreach-rules.md`, not a tier flag on this one.

**Stage 6: Prospecting pipeline.**
This is a distinct bounded path, not a mode of the paid-audit pipeline. It
starts with cheap HTTP qualification, then prescans at most the homepage, one
same-site booking page, and one room or content page. It reuses low-level
scanner primitives for axe, render diff, direct browser metrics, and booking
fingerprints, but never calls Lighthouse, the paid-audit orchestration, or the
LLM. Immutable prescan facts feed deterministic evidence selection and a
versioned score. Only prospects that pass the explicit gates can proceed to
the separately governed preview and outreach stages. The execution contract
and rollout order live in `plans/README.md`. Prescan v2 reduces its
temporary browser captures to one content-addressed raw/rendered composite,
one content-addressed measured failure crop, and three to five fixed bilingual
summaries. Generic screenshots are deleted, and incomplete evidence cannot
enter scoring selection.

**Personalized outreach email generation (2026-08-03).** For prospects that clear the gate, the tool generates the cold email itself, not just a one-sentence hook, personalized to that site's specific findings. Evidence selection stays deterministic: the LLM does not choose which finding to feature, that choice is already made by the brokenness scoring and evidence selection above. The LLM's role is narrowly to write the email around evidence already selected. Output is a draft into a queue, never sent automatically, both because the manual review step is what keeps EU AI Act exposure low for the LLM layer (see 8.4) and because CNIL B2B email rules require clear identification and an opt-out in every message, which a human should confirm is present before send. The anti-hallucination guard carries over explicitly: state the WCAG criterion, never assert the EAA applies to this specific business. Email language follows the prospect's own site language, not a French default.

### 6.3 System architecture

Scans are long-running and memory-heavy, so the private interface enqueues work
and workers run it outside the request cycle.

```
Private node:http interface -> MongoDB-backed job queue
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
Private dashboard polls -> renders status and report links
```

The public Next.js site is a separately deployed marketing and bot-information
site. It imports no private engine package and has no access to MongoDB or the
job queue.

### 6.4 Data model, top level

- `clients`: name, contacts, language preference, sector, size bracket, notes.
- `audits`: as built in milestone 4. Site URL, timestamps, config snapshot, crawl statistics and page list, per-phase errors, and self-reported tool versions. The same type is written to `manifest.json` on disk, which is what lets normalization re-run offline against any artifacts folder with no database attached.
- `findings`: as specified in 6.2 stage 3, linked to auditId.
- `prospects`: insert-only qualification events with domain, entity evidence,
  qualification facts, and expiry.
- Future 9c catalogue, prescan, evidence, score, preview, draft, and outcome
  records stay separate as defined by `plans/README.md`.
- `reports`: auditId, language, version, file reference, generated timestamp.

Version the findings model from day one. Reports will need regenerating and comparing over time, especially for monitoring clients.

### 6.5 Engineering constraints and gotchas

- **Chromium is heavy.** A full-site render can take minutes and consume
  significant memory. Cap concurrency per worker, reuse browser instances
  across pages within a job, and close contexts cleanly to avoid leaks.
- **Lighthouse and axe both need the page.** Sequence them against one rendered context rather than loading the page repeatedly.
- **LLM cost is negligible, scanning cost is not.** Optimize crawl scope, not prompt length.
- **Flaky performance metrics.** Core Web Vitals from a single lab run are noisy. Run performance passes more than once and report medians, or clearly label lab data as lab data. Consider pulling field data (CrUX) where available for larger sites, and say so in the methodology.
- **Rate limiting and politeness.** Prospect scanning touches sites without permission. Keep it to a single lightweight pass per site, respect robots.txt, identify the crawler, and do not hammer. This matters both ethically and to avoid being blocked.
- **Parallel crawl means concurrency, not a shorter delay (2026-08-03).** When multiple pages of one site, or multiple sites in a queue, run concurrently, the per-request politeness delay stays exactly as configured. Speed comes from running more concurrent browser contexts against different origins, or more concurrent pages within a rate-limit budget still enforced per origin through a shared limiter, never from lowering the delay. The rate limiter is scoped per origin, since two different websites share no politeness budget between them, only machine resources (CPU, Chromium memory) cap how many run at once.
- **Monitoring means diffing.** Future monitoring work needs stored historical findings and a regression detector, so design the findings model to support comparison across runs from the start. This is why every audit records the version of every tool that produced it: a scanner upgrade between two monthly scans otherwise reads as phantom regressions and phantom fixes with no way to attribute them.
- **Not everything a site links to is a page.** A real WordPress site linked four image attachment URLs from its gallery, and each one cost a full render, an axe pass, and a Lighthouse pass before producing findings against binary content. Non-HTML resources are dropped by extension before being enqueued, with a Content-Type check as a fallback. This matters more in prospecting mode, where a brokenness score computed partly from attachment pages is measuring nothing.
- **Screenshots are captured for every page and kept for almost none.** Only the homepage pair and the worst pages by render-diff percentage survive a scan. The reason is data minimisation rather than disk: full-page screenshots of a client site incidentally capture personal data, and not capturing is a stronger position than deleting later. The selection rule has one canonical implementation that report generation must reuse.
- **The fixture cannot find everything.** Both bugs above passed a full green test suite and were visible only in a scan of a real site. A milestone is not finished until its output has been checked against something real.

### 6.6 Honest limits to state in every report

Automated accessibility scanning catches a well-documented minority of WCAG
issues, commonly cited around 30 to 40 percent. Odysseus adds deterministic
keyboard, focus-order, form-error, caption, and alt-text heuristic checks, but
does not turn editorial judgment into detection. The report must state the
remaining limits in `docs/manual-accessibility-checklist.md` and must never
claim a manual pass was performed.

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

**Post-7.1: scan concurrency and report reskin, 2026-08-07 to 2026-08-16.**
Scan phases run in lanes while Lighthouse remains serialized. The shipped
Nocturne report design is derived from the readable flat sources in
`docs/design/`; see trade-offs 9 and 10.

**Milestone 8: custom checks.** Original scope: meta, canonical, JSON-LD, sitemap, hreflang, heading hierarchy, redirect chains. Deferred because axe and Lighthouse already produce enough to sell an audit; these deepen it rather than enable it.

**Original scope shipped 2026-08-08.** Before writing detection code, a real Lighthouse result (haaitza.com) was checked against all 24 rule IDs `severity.ts` had pre-reserved: 8 already duplicate an existing, non-excluded Lighthouse `seo`/`performance` audit under a different rule ID (`meta-title-missing`, `meta-description-missing`, `canonical-missing`, `hreflang-missing`, `hreflang-invalid`, `image-oversized`, `image-legacy-format`, `redirect-chain-excessive`) and were deliberately left unimplemented rather than recreating the axe/Lighthouse-accessibility duplicate-finding mistake this document already records once. The other 16 shipped as genuine custom checks: `meta-title-length`, `meta-description-length`, `canonical-conflicting`, `jsonld-missing`, `jsonld-invalid`, `heading-hierarchy-skip`, `multiple-h1`, `no-h1`, `opengraph-missing` (per-page, one new scanner check reading the rendered page's head/body), `sitemap-missing`, `sitemap-stale` (site-level, reuses robots.txt's own Sitemap: directive), `robots-blocks-indexing`, `broken-internal-link` (crawl-level, judge the crawl's own results rather than any one page's content, since a blocked homepage or a broken target is never successfully scanned), `hreflang-no-return-link` (needs every crawled page's hreflang set at once to check reciprocity, the one thing a single-page Lighthouse audit cannot do), `mixed-content` (reads the Resource Timing API post-load, no new page load), and `noindex-on-public-page` (reuses the shared `LEGAL_PATH_PATTERN` `packages/llm`'s diversion logic already uses, so an intentionally-noindexed legal page is not flagged as a defect). Verified against `fixtures/spa-demo`'s seeded faults and against a live run. Full reasoning in each `packages/core/src/normalize/normalize-*.ts` file's header comment.

**Scope expanded 2026-08-07.** Most former manual-check candidates became
deterministic milestone 8 checks. The current coverage and remaining limits are
maintained in `docs/manual-accessibility-checklist.md`.

**Milestones 9a to 13, replaced 2026-08-15.** The original two-item plan was
superseded by the sequence below and the five focused prospecting, legal, and
offer documents linked at the top of this brief. Monitoring moved to milestone
13.

**Milestone 9a: prospect acquisition and qualification.** Done 2026-08-16. First task, before any code: resolve whether AFNIC's free open data includes SIREN, NAF, and the real-site-versus-parking classification, or whether those sit only in the paid `.FR Performance` or SQUAW products (`docs/prospect-qualification.md` section 2). That answer determines whether this milestone is large or small. Then: AFNIC Fichier A ingestion, plain-HTTP mentions légales fetch, SIREN extraction reusing the entity layer, local Sirene stock join, deterministic qualification predicate, prospect collection with data origin, suppression collection. Blocking prerequisites, both previously horizon items: the real user agent resolving to `https://odysseusaudit.com/bot`, and 90 day deletion enforced at database level. Shipped as specified: `qualifyProspect` in `packages/core`, the AFNIC/mentions-legales/SIREN/Sirene-stock pipeline and the prospect/suppression collections in `packages/store` and `packages/interface`, and `odysseus prospect ingest`/`odysseus prospect suppress` in `packages/cli`.

**Milestone 8.5a: SEO and GEO detection checks.** Done 2026-08-16, inserted ahead of 9b/9c after the single-tier pricing revision made a stronger paid deliverable worth building before scaling outreach. Deterministic detection only, no reference data, no report changes, no LLM prose changes - same "deterministic scanners detect, LLM only explains" rule already enforced for accessibility. Added a new `geo` `FindingCategory` value (locked-contract change, additive only) alongside the existing `seo` one, since AI-answer-engine extractability is a distinct audience from search ranking. New checks, all in the existing single-crawl/single-`findings.json` pipeline, none a parallel scan: `canonical-target-unreachable`/`canonical-target-noindex` (fetches a page's canonical target when it differs from the page itself, flags an unreachable or noindexed target), `sitemap-orphan-page` (a sitemap URL the crawl never reached through any internal link), `robots-disallow-broad` (a Disallow pattern blocking 3 or more discovered pages, via a `findBlockingPattern` refactor of `robots.ts`'s own longest-match-wins logic), `llms-txt-missing` (site-level presence check, same shape as the sitemap.xml check), `structured-data-entity-missing`/`entity-data-incomplete` (site-wide and per-page checks for an Organization/LocalBusiness/WebSite-or-subtype JSON-LD entity and its name/address/telephone fields), and `faq-content-without-schema` (3 or more question-shaped headings on a page with no matching FAQPage/QAPage schema). "Citability of factual statements" was explicitly scoped out after discussion: judging whether a sentence is phrased in a citable way is a semantic judgment, not a pattern match, and building a heuristic for it risked either fake precision or requiring an LLM call, which this milestone's hard rule forbids; revisit once 8.5c's LLM layer exists to explain citability rather than detect it. Milestone 8.5b (reference data, citations, sector/CA selection) and 8.5c (report and LLM-side presentation, including where GEO findings render given they are not yet in the report's `CATEGORY_ORDER`) follow, after a separate research pass on sourced impact statistics.

**Milestone 8.5b: reference data, citations, sector/CA selection.** Done 2026-08-16, after the research pass at `docs/research/Odysseus Business-Impact Statistics Reference Database Accessibility SEO & GEO.md`. Data and pure functions only in `packages/core/src/reference-stats/`, no LLM or report wiring - the same self-scoping 8.5a used. `stats.ts` is a curated, compiled-TS table (12 rows) of business-impact statistics tagged category (accessibility/seo/geo, some rows spanning more than one), sector (general or hospitality), confidence (established or emerging), and scalability (scales-down via a stored ratio, or context-only), each carrying a verbatim bilingual citation sentence rather than paraphrased prose - only the source doc's "SAFE TO CITE BY NAME" rows and, for GEO, its "emerging" tier are encoded; every "directionally useful but not citable" or "not citable" row, and the excluded "Web Standards Commission" source entirely, are left out by omission rather than flagged. `sector.ts` classifies a client's NAF code into `hospitality` (prefixes `55.`/`56.`) or `general` for stat selection, deliberately independent from the prospecting NAF allowlist. `select.ts`'s `selectReferenceStats(category, sector)` filters by category and ranks sector-fit then confidence, never dropping general rows for a hospitality request. `calculator.ts`'s `estimateRevenueImpact` implements the doc's `revenue × uplift% = gain` formula for scalable rows only. Full reasoning in CLAUDE.md trade-off 15. Milestone 8.5c still owns wiring this table into the LLM prompt and the report template.

**Milestone 8.5c: wire reference-stat citations into the audit report.** Done 2026-08-17. Selection stays fully deterministic - the report calls `selectReferenceStats(theme.category, sector)` directly in `packages/report/src/template/sections/themes.ts` at render time, no LLM/prompt involvement and no change to the locked `llm-output.ts` `Theme` schema. Client sector now reaches the report through a new `ObligationAssessment.sector?: StatSector` field (`packages/core/src/types/compliance.ts`, not a locked contract), spliced on by `packages/interface/src/pipeline/obligation-stage.ts` from the same `OperatorProfile.naf` it already resolves via Sirene - no second lookup, and the derived two-value sector is stored rather than the raw NAF code for data minimisation. `geo` was added to `design-tokens.ts`'s `CATEGORY_ORDER`/`CATEGORY` (closing trade-off 14's appendix-rendering gap for ordinary findings too, not only citations), reusing `nocturne.css`'s previously-unused second accent hue scale rather than an invented hex, since geo postdates the canonical mockups. Each accessibility/seo theme citation shows once per category, on that category's highest-priority theme; `'performance'`/`'rendering'` themes get none, since the stat table has no rows for those categories. Geo findings, which can never reach the LLM-synthesized themes section (`Theme.category`'s locked enum has no `'geo'` option), get a citation in the findings-appendix's geo section instead, quarantined with an "emerging" badge. Report-only: the reference-stats module must never be imported by milestone 9c's outreach generation (not yet built), matching `docs/llm-layer-rules.md` section 11's stricter "no statistics" rule for outreach; `estimateRevenueImpact` remains unwired in both paths. Full reasoning in CLAUDE.md trade-off 16.

**Milestone 9b: prospecting throughput.** `computeBrokennessScore`, `isProspectingWorthy`, and `isAuditFallbackEligible` move into `packages/core` per `docs/llm-layer-rules.md` section 10. Three changes in `runProspectingJob`: a bounded worker pool across distinct origins in place of the serial loop, safe because the per-origin lock already exists and the rate limit is per origin; Lighthouse removed from the prospecting config, since it is the serialisation bottleneck through the `perf_hooks` queue and performance score is the weakest outreach signal; prospecting page cap reduced to three (home, one listing page, one transactional page, the last retained because the flow detector needs it). Deterministic evidence screenshot selection.

**Milestone 9b.5: sitemap-supplemented full-site scan coverage.** Done
2026-08-27, after being added ahead of 9c on an operator decision made mid-review of a
real www.airelles.com audit: the crawler reached 100 pages by following
internal links while the site's sitemap declared 516, and the
`sitemap-orphan-page`/`sitemap-stale` checks correctly flagged that only
1 of the 100 crawled pages appears in the sitemap. Confirmed by
redirect-checking the site rather than assumed: `www.airelles.com`
301s to the bare `airelles.com`, same server, so this was not two
different domains - the crawl genuinely never reached most of the site's
declared French-language subtree because nothing in the English pages
it found links there. For a flat EUR 1,600 full audit, the report needs
to do two separate jobs rather than pick one: state discoverability
honestly (an internal-navigation-unreachable page is itself a real
defect, and the existing orphan/stale checks depend on a separate link
set) and scan every eligible declared page for real defects regardless
of whether navigation reaches it.

Shipped with `none`, `inspect`, and `supplement` sitemap modes, recursive
index traversal, exact-host plus www/apex authorization, page discovery
provenance, combined cap accounting, optional historical fields, Mongo
persistence, and bilingual methodology coverage. Full audits and raw
site scans supplement by default; prospecting inspects without expanding
its three-page link crawl; standalone crawl stays link-only. Fixture
tests prove that sitemap-only defects are reported while the page remains
an orphan. The authorized Haaitza validation resolved 5 sitemap documents
and 131 eligible pages during an uncapped 220-attempt audit: 130 sitemap
pages were analyzed, the remaining page retained
`skipped-external-redirect`, and zero pages were filtered or omitted by a
cap. Haaitza currently links to every sitemap page, so the fixture remains
the acceptance evidence for non-zero sitemap-only coverage and orphan
preservation. Full reasoning is in the charter's build-order section and
`docs/decisions/trade-offs.md`.

**Milestone 9c: outreach generation.** Draft assembly per `docs/outreach-rules.md`: deterministic evidence, deterministic facts block, generated connective prose, validator confirming the block survived unmodified and that identity, data origin, and opt-out are present (`docs/llm-layer-rules.md` section 11). Draft queue, follow-up state machine keyed on reply detection, suppression check at draft time. Drafts created in the mailbox through the Gmail API, never sent. Separate sending domain with SPF, DKIM, DMARC.

**9c reconciled into execution plans, 2026-08-27.** The 14 numbered plans in
`plans/README.md` replace the earlier proposal drafts. They cover the
hotel catalogue, exact identity resolution, cheap qualification, distinct
prescan, evidence, versioned scoring, role contacts, safe previews, validated
prose, Gmail drafts without send, reply/suppression handling, operator views,
and the controlled first-100 rollout.

**Milestone 10: benchmark study and percentile.** Batch scan of a bounded
e-commerce cohort, aggregate percentile over stored findings, surface the
percentile in the paid report, and publish the study in French on
`odysseusaudit.com`. Target: before 22 September 2026, the Créteil hearing in
the E.Leclerc matter (`docs/obligation-basis.md` section 5), which will be the
third data point in a contested line and will be covered. Generate the study
with Mistral as with everything else; add the one-line AI-assistance
disclosure from `docs/operator-obligations.md` section 3 near the top of the
published page. No other change to authorship or pipeline.

**Milestone 11: regime 2 documentation generator.** Deterministic template fed by entity data and completed audit results, producing the technical documentation a regime 2 entity actually owes per `docs/obligation-basis.md` section 6. This replaces the déclaration d'accessibilité generator previously specified here, which was aimed at an article 47 obligation Odysseus's prospects do not carry. Hard constraint: nothing is emitted that was not measured on that site.

**Milestone 12: free scope check, conditional.** One URL in, criteria and registry data out, on the public site. Does not start until milestone 10 has produced measurable traffic. Revisits the "no free public scanner" decision in section 11 on the condition recorded there. The differentiator is weaker than first thought, since the output states facts rather than a determination; if it degrades into another free violation counter, do not ship it.

**Milestone 14: other EU countries, not before France is proven.** Noted
2026-08-27 so the idea is not lost, explicitly not scheduled. Does not start
until the tool is running in production and French clients have actually
bought. The technical criteria travel unchanged, since EN 301 549 is EU-wide;
almost nothing client-facing does. Each country needs its own obligation basis
(`docs/obligation-basis.md` is French law and French case law), its own company
registry in place of the Sirene join, its own identification regime in place of
the LCEN block, its own catalogue in place of Atout France, and its own
language throughout. The report's legal content is a deterministic splice
precisely so it cannot be improvised per country, so this is a real milestone
and not a catalogue swap. Sequence it after the French campaign has revenue,
never in parallel with it.

**Milestone 13: monitoring.** Was milestone 10. Scheduled re-scans, regression detection, delta reports. Technical capability only; the subscription tier remains dropped (see 3.2).

### 7.1 Definition of done for the interface

**To be filled in before milestone 7 begins. Building against an undefined scope is the specific way this approach fails.**

The question to answer: what must the interface do before the first outreach email is sent, and what is explicitly a later addition? Anything not on the first list waits, no matter how appealing it looks mid-build.

**Updated 2026-08-03, ahead of milestone 7 starting.** Private single-user tool, so no auth, multi-tenancy, or permissions layer of any kind is needed anywhere in this. That simplifies the scope meaningfully relative to a multi-client dashboard.

- URL input field, scan/search button, and a collapsed-by-default advanced options section (max crawl depth, max pages, delay override).
- A progress indicator with an estimated time to completion. Two segments, since the two phases have different predictability: crawling has a reasonably accurate live estimate from `maxPages` and `effectiveDelayMs`, scanning is looser since Lighthouse's navigation mode adds its own extra page load. One combined number across both phases would be false precision.
- On completion, a severity roll-up only (counts of critical, serious, moderate, minor), not the full findings list, with a click-through to the detailed view. Already supported by existing fields on the locked `Finding` schema.
- A history log tab: date, site URL, risk or severity roll-up, status, linking into the full report. A view over the existing `audits` collection, not new data modeling.
- Two distinct scan types sharing one engine, both feeding the history log but shown distinguishably (a type column, or separate sub-tabs): **full audit scans** (single site, full checks, queued sequentially or a few at a time) and **prospecting scans** (batch of many URLs, lighter checks only, feeding the ranked prospect table from milestone 9a rather than the full findings log).
- Simple FIFO queueing across sites of either type, per-origin rate limiting per the engineering constraints above. No queue-priority system, not needed for a single-user tool yet.

Explicitly not required for the first email: client login, self-serve signup, billing, agency multi-tenancy, in-app remediation tracking, real-time collaboration.

---

## 8. Regulatory context

**Superseded 2026-08-15 by `docs/obligation-basis.md` (client-facing legal facts) and `docs/operator-obligations.md` (Odysseus's own regulatory position).** This section is now a short index into those two files rather than a restatement, because the original version below conflated the two EAA regimes and misattributed the RGAA declaration trio, and having the wrong version live in two places is how that kind of error survives a correction. Read the two linked files before citing anything legal in client-facing material; nothing legal may be stated anywhere in the product unless it appears in `docs/obligation-basis.md` with status `primary`.

### 8.1 European Accessibility Act (EAA), corrected

- Two regimes exist under French law and must never be merged: **article 47 of loi 2005-102** (public bodies and companies above EUR 250M turnover, referential RGAA, the déclaration d'accessibilité trio) and **regime 2, the EAA via art. L412-13 code de la consommation** (consumer-facing sectors above the microenterprise threshold, referential EN 301 549, technical documentation obligations instead of the RGAA trio). Odysseus prospects are almost entirely regime 2. Full detail: `docs/obligation-basis.md` sections 2 and 4.
- **Microenterprise exemption, regime 2:** fewer than 10 employees AND turnover or balance sheet under EUR 2 million. Failing either prong removes the exemption, so headcount of 10 or more establishes scope on the size prong alone; `docs/prospect-qualification.md` qualifies on headcount only, deliberately conservative. Detail: `docs/obligation-basis.md` section 3.
- **RGAA is not the regime 2 referential.** Naming RGAA 4.1.2 to a regime 2 client cites the wrong instrument; name EN 301 549. Detail: `docs/obligation-basis.md` section 4.
- **Enforcement is contested, not settled.** Lille (5 May 2026, Auchan) dismissed an association claim against a sub-EUR 250M e-commerce company; Caen (4 June 2026, Carrefour) went the other way with an injunction and astreinte; Créteil (E.Leclerc) is scheduled for 22 September 2026. An appeal is pending at Douai. Any output stating regime 2 scope as settled is wrong. Full route-by-route detail, including the EUR 50,000 figure that belongs to article 47 and is routinely misquoted for regime 2: `docs/obligation-basis.md` section 5.
- **Operating rule that binds report templates and outreach: we report, we do not conclude.** No output states that a specific business is legally bound, cites a deadline, or states what a sanction would be for that client. `docs/obligation-basis.md` section 7. Underlying reason this is not just a caution but a constraint: articles 54 and 60 of loi 71-1130 restrict who may give a personalised legal conclusion for remuneration. `docs/operator-obligations.md` section 2.

### 8.2 GDPR

- Crawling public pages is low risk, but screenshots and stored DOM snapshots can incidentally capture personal data. Retain no more than needed, set a retention policy, and document it. Prospecting retention is 90 days, published at `odysseusaudit.com/bot`, enforced at database level per `docs/prospect-qualification.md` section 7.
- If implementation work involves access to client systems containing personal data, the auditor acts as a data processor and an Article 28 data processing agreement is required.
- The prospect database contains business contact data. Keep it defensible: legitimate interest basis, clear opt-out in every outreach email, honor unsubscribes, role addresses only, free-mail domains excluded. RGPD article 14 requires disclosing where the data came from at first contact, stored per record as data origin. Full rules: `docs/prospect-qualification.md` sections 6 to 7 and `docs/outreach-rules.md` section 7.

### 8.3 EU AI Act

Article 50 transparency obligations became applicable 2 August 2026. Odysseus is a deployer, not a provider (the model is Mistral's). Client audit reports and outreach emails are private, single-recipient documents and are out of scope for article 50(4) by definition, not because of any mitigation added; no change to either pipeline. The milestone 10 benchmark study is the one document actually published to the public and is the only place 50(4) is plausibly engaged; the fix is a one-line AI-assistance disclosure near the top of the published page, not hand-authorship. Full reasoning, including a corrected earlier overcorrection: `docs/operator-obligations.md` section 3.

### 8.4 Other operator obligations with near-term dates

Two items outside the legal-claims-to-clients scope of 8.1 to 8.3, tracked because they have hard dates: choosing a Plateforme Agréée for electronic invoice reception by **1 September 2026** (applies even to a micro-entreprise in franchise en base), and unsolicited telephone prospecting having been prohibited without prior consent since 11 August 2026, which closes phone as a cold-prospecting channel. Full detail: `docs/operator-obligations.md` sections 4 and 5.

---

## 9. Outreach system

**Superseded 2026-08-15 by `docs/outreach-rules.md` (messaging doctrine), `docs/prospect-qualification.md` (who may be contacted), and `docs/offer-positioning.md` (what is sold). This section is now an index and a sequence summary, not the source of the doctrine.**

**Two arguments, not three.** An earlier framing had three pillars: legal obligation, customers turned away by impairment, and search/LLM invisibility. The second and third are the same claim with different causes. **Argument A, revenue not being seen:** invisibility to search and LLM answer engines, transactional flows that cannot be completed, interfaces that fail for age-typical eyesight and dexterity. **Argument B, a legal landscape the business does not know about:** the EAA criteria, the company's own registry data, and the state of the case law, stated as facts rather than a determination (`docs/obligation-basis.md` section 7). A leads in outreach, since the loss is already happening and is verifiable today; B leads in the paid report, once the buyer has paid and wants to know where they stand. Full reasoning: `docs/outreach-rules.md` sections 1 to 3.

**Sequence.**

1. Milestone 9a qualifies domains deterministically (headcount, sector, resolvable SIREN, not on the suppression list) before any Chromium scan runs. `docs/prospect-qualification.md`.
2. Milestone 9b scans qualified prospects and gates which are worth the LLM cost of outreach generation (`docs/llm-layer-rules.md` section 10).
3. Milestone 9c assembles a draft: deterministic evidence selection, deterministic argument-B facts block spliced from `assessObligations()`, generated connective prose, then a validator confirming the block is byte-identical to what was spliced and that identity, data origin, and opt-out are present. A draft failing either check is discarded, not repaired. `docs/outreach-rules.md` section 5 and `docs/llm-layer-rules.md` section 11.
4. Touch sequence, one new piece of information per touch: (1) render diff evidence, (2) one reproducible transactional failure plus age framing where the sector fits, (3) the argument-B facts block. Follow-ups generate only if no reply is detected. `docs/outreach-rules.md` section 6.
5. Drafts wait in a queue for a human send, never sent automatically. No sequencer tooling (no lemlist, Instantly, Smartlead). Volume ceiling of 20 to 40 sends per day per warmed mailbox, which is the binding constraint on the whole system, not drafting time. Telephone is closed as a prospecting channel since 11 August 2026; it is a follow-up channel only, for people who already replied. `docs/outreach-rules.md` section 8.
6. Interested prospect has already received the free outreach preview as part of the touch sequence above (step 4); no separate paid screening purchase step exists since 2026-08-16 (see 3.2). They complete the intake questionnaire for a full audit.
7. Full audit priced at a flat, published EUR 1,600 HT per 3.2 (no risk band, no freehand quote since 2026-08-16), offer framed explicitly as a diagnostic and not an audit RGAA per `docs/offer-positioning.md` section 2.
8. Payment, ideally partly up front for first-time full-audit clients.
9. Audit runs, PDF report delivered (video walkthrough dropped 2026-08-07, see 3.2).
10. No implementation or monitoring upsell step (dropped 2026-08-03, see 3.2 and 10). The report's closing section instead frames the report as something the client or their own developer can act on directly.

**What to test and measure:** open and reply rates by vertical, which evidence type converts better, which price point closes fastest, and time from first email to payment.

**Prohibited in outreach**, full list in `docs/outreach-rules.md` section 9: any statistic on population or prevalence, the EUR 50,000 figure in any EAA-regime context, any claim the recipient will be fined, inspected, or sued, any conclusion about whether the recipient is legally bound, and any finding not present in that prospect's own scan. **Do not do:** fabricate urgency, misrepresent legal exposure, or send high-volume untargeted email. The whole play depends on the evidence being real and checkable.

---

## 10. Risks and failure modes

- **Report credibility collapse.** One hallucinated or wrong finding in front of a client's developer damages the whole offer. Mitigated by the deterministic-detection rule and schema validation. **Revised 2026-08-07:** this now extends to the marketing claim itself, not just finding accuracy, since most of the accessibility checklist moved from a manual pass to milestone 8's automated extended accessibility pass. Do not claim "manual verification" when the check is automated; see 3.2 and 3.3 for the "extended accessibility pass" replacement language and why it matters here specifically.
- **Automated-scan commoditization.** Free scanners exist and clients know it. The differentiator must be prioritization, business framing, bilingual delivery, and the extended accessibility pass, not the scan itself. Never let the report look like raw tool output.
- **Legal overreach in marketing.** Claiming EAA applicability to an exempt microenterprise is wrong and reputationally risky. Check the size threshold before using the legal angle. **Widened 2026-08-15:** the case law is also genuinely contested (Lille dismissed an association claim against a sub-EUR 250M company five weeks before Caen went the other way), so even a correctly-scoped prospect cannot be told they are settled-law bound. The "we report, we do not conclude" operating rule (`docs/obligation-basis.md` section 7) is the mitigation, and it is also the reason the intended "determination" differentiator was rejected in favor of the two-argument framing in section 9.
- **Scope drift in the build-first approach.** The original brief called overbuilding the predictable failure mode and recommended selling three audits before building the platform. Section 7 revises that deliberately: the tool gets built complete first. The risk does not disappear, it changes shape. It is no longer "building the wrong thing," it is "never declaring the thing finished." The guardrail is section 7.1: interface scope written down before milestone 7 starts, and anything not on that list waits. If the interface milestone runs long past its written scope, that is the signal, not a reason to extend the scope.
- **One-off revenue, accepted deliberately (2026-08-03).** Implementation and monitoring were dropped rather than deferred (see 3.2), which removes the mechanism that would have made revenue compounding rather than purely transactional. This was a conscious choice to protect time for Aurora, not an oversight, but it means the business now depends entirely on outreach volume with no retained base to fall back on. Milestones 9a to 9c (prospect acquisition through outreach generation) carry more weight under this model than prospecting mode did under the three-tier one. Agency white-label partnerships remain a way to add volume without adding retention.
- **Prospect list exhaustion.** A regional market has a finite number of qualifying businesses. Plan for expansion by sector or geography before the list runs dry.

---

## 11. Open questions

### Settled 2026-08-02

- **Both audit types, equal weight.** They share one engine, so this costs nothing in code. **Stale as of 2026-08-16:** this line originally distinguished the two audit types by delivery time, on the reasoning that accessibility required a genuine manual pass and SPA-SEO did not. Accessibility checking is fully automated in this product; no tier includes manual verification of any kind (`docs/offer-positioning.md` sections 1 and 2). Both audit types now share the same fully automated delivery model.
- **No free public scanner.** Private prospecting only. A free scanner is a distribution play and there is no traffic yet to distribute to. Revisit if outreach proves the evidence converts.
- **Vertical choice deferred.** It shapes outreach, not the build. Decide when building the prospect list, informed by which sectors actually scan badly.
- **Build fully, then sell.** See section 7.
- **Severity floor before the LLM.** Critical, serious, and moderate reach the model; minor findings do not, but still appear in the report appendix. The filter shapes the narrative, not the completeness of the document. The rejected alternative (send everything, marked low priority, capped at one or two catch-all themes) is recorded in `docs/llm-layer-rules.md` for when real reports show whether the filter drops anything clients ask about.

### Settled 2026-08-03

- **Pricing structure.** Two tiers, not three. Screening at EUR 290 flat and published. Full audit at EUR 1,200 to 1,900, set by risk band rather than a continuous formula or a freehand quote. Implementation and monitoring dropped entirely. **Superseded 2026-08-16:** screening tier dropped, full audit is a flat published EUR 1,600 HT, no risk band. Full reasoning in 3.2.
- **Cost gating for the LLM layer.** The LLM is not called when a scan has not produced enough to justify it, on both the audit path (static template fallback) and the prospecting path (worthiness gate before outreach generation is attempted). Thresholds in `docs/llm-layer-rules.md`.
- **Personalized outreach email generation.** Built on top of prospecting mode, evidence stays deterministic, output is a reviewed draft, never auto-sent. See 6.2 stage 6 and section 9.
- **Interface scope for milestone 7.** Progress indication with ETA, severity-roll-up-only completion feedback, a history log distinguishing full audit scans from prospecting scans, and per-origin concurrent scanning. Updated 7.1.

### Settled 2026-08-07

- **Divert, don't instruct, for findings the LLM cannot give good advice about.** The v1 report's single most damaging line was SEO advice about indexing a Facebook embed. Rather than prompting the model to be careful around wrapper pages and noindex'd legal pages, those findings are now filtered out of its input entirely (`packages/llm/src/diversion.ts`) and rendered instead by a fixed-copy template section. The model cannot produce bad advice about a finding it never sees. Full reasoning in `docs/report-v2-refactor.md` part 4.1.
- **`legalRelevance` is built in code from a WCAG criterion name table, never written by the model.** Closes the one remaining place the writing pass could describe a legal obligation in its own words. See `docs/report-v2-refactor.md` part 4.3.

### Settled 2026-08-07 (commercial planning session)

The shipped milestone 8 scope and remaining gaps are summarized in section 7
and `docs/manual-accessibility-checklist.md`.

- **No video walkthrough.** Dropped entirely from both tiers, not deferred. Delivery is PDF report only. See 3.2, 3.3, 5, and 9.
- **One crawl, two report views.** Screening and full audit run the identical crawl and scanners; tier only affects what the report template renders from the shared `findings.json`. `runAuditStage` takes no tier parameter. **Superseded 2026-08-16:** no tier concept remains; the one crawl now feeds the full audit report and the separately-templated outreach preview. See 6.2 stage 1 and stage 5.
- **Milestone 8 scope expanded.** Keyboard traps, focus order, form error handling, and video captions move from the manual accessibility checklist to genuinely automated milestone 8 checks. Alt text quality gets a heuristic red-flag check only, deliberately not a full editorial judgment, since that would require the LLM to judge rather than a scanner to detect. See 6.6 and the milestone 8 entry in section 7.
- **"Extended accessibility pass" replaces "manual accessibility verification" in all client-facing copy.** The full audit tier can no longer honestly claim a manual pass once most of the checklist is automated. See 3.1, 3.2, 3.3, and 10.
- **Report tier content split decided.** Screening gets executive summary, risk badge, top critical/serious findings, and milestone 8 checks as counts/categories only. Full audit adds theme grouping, full page/selector detail, render diff evidence, and the "what to do first" summary. **Superseded 2026-08-16:** screening dropped as a paid tier; see 3.3 for what the free outreach preview carries instead. See 3.3 and 6.2 stage 5.
- **Price band (1,200 to 1,900 EUR) unchanged.** The band was never justified by labor cost, so automating most of the manual pass doesn't move it. Not to be reopened without a specific trigger already listed in section 12. **Superseded 2026-08-16:** replaced by a flat EUR 1,600 HT price. See 3.2.
- **Price range published, exact price still risk-banded per client.** Resolves open question 5 below. **Superseded 2026-08-16:** the price itself is now flat, not risk-banded.

### Settled 2026-08-15

Full detail in the five companion docs listed at the top of this brief.

- **Two arguments, not three.** Commercial loss leads in outreach, legal context leads in the report. Prevalence statistics excluded from outreach entirely. See section 9.
- **We report, we do not conclude.** No output states that a specific business is legally bound. Rejected: the determination framing, which was the intended differentiator, on grounds of contested case law and the article 54/60 perimeter on giving personalised legal opinions for remuneration. See `docs/obligation-basis.md` sections 5 and 7, `docs/operator-obligations.md` section 2.
- **Prices held at EUR 290 and EUR 1,200 to 1,900, displayed HT.** Rejected: raising into the EUR 2,400 to 3,600 band, since a cold prospect's reference point is zero, not a comparison. Revisit after a case study and the milestone 10 study exist. **Superseded 2026-08-16:** screening dropped, full audit is a flat EUR 1,600 HT. See 3.2 and `docs/offer-positioning.md`.
- **Positioned explicitly as a diagnostic, not an audit RGAA.** Stated first, on the offer page, in the proposal, and in the report. See 3.2.
- **Qualification precedes scanning.** Chromium never runs on an unqualified domain. See `docs/prospect-qualification.md`.
- **Domain-first list building.** AFNIC open data, SIREN from mentions légales, local Sirene join. Rejected: registry-first with paid website enrichment. See `docs/prospect-qualification.md` section 1.
- **Headcount-only qualification, accepted as conservative.** No false positives, at the cost of missing the small-headcount high-turnover segment. See section 4 and `docs/prospect-qualification.md` section 3.
- **Role addresses only, free-mail domains excluded.** See `docs/prospect-qualification.md` section 6.
- **The send stays manual, and telephone prospecting is closed** by the rules in force since 11 August 2026. No sequencer integration. See `docs/outreach-rules.md` section 8 and `docs/operator-obligations.md` section 5.
- **First vertical was originally e-commerce. Superseded 2026-08-27:** hotels
  rated at least three stars are the first campaign. See section 4 and
  `plans/README.md`.
- **Second channel opened: accessibility agencies and freelances**, run in parallel from week one, five conversations to settle whether it is real. See section 4 and `docs/offer-positioning.md` section 5.
- **Free public scanner, still not now.** Milestone 12 is the conditional revisit, gated on milestone 10 producing traffic. See "No free public scanner" under Settled 2026-08-02 above, now qualified by this later decision.
- **The benchmark study is LLM-generated like everything else**, with a one-line AI-assistance disclosure added for AI Act article 50(4). Client reports and outreach are confirmed out of scope for article 50 entirely, being private single-recipient documents, and need no disclosure and no pipeline change. See `docs/operator-obligations.md` section 3.

### Blocking, with a named dependency

1. ~~**A real domain with a bot-information page.**~~ Partially resolved 2026-08-07: `odysseusaudit.com` (and `.fr`) purchased, `ODYSSEUS_USER_AGENT` and both `.env` files now point at `https://odysseusaudit.com/bot`, and `packages/site` (a standalone Next.js app, not part of the tsc build graph, deployed separately to Vercel) scaffolds that route. Resolved 2026-08-29: the `/bot` page is corrected, the site is deployed, and the preview plus compliance-page path is provisioned and verified end to end (trade-off 43, "Provisioned and verified, 2026-08-29").
2. ~~**The manual accessibility checklist**~~ Resolved 2026-08-08, and superseded 2026-08-16: milestone 8's original scope and its extended accessibility-pass addendum both shipped and were verified against `fixtures/spa-demo` and a real site (`docs/manual-accessibility-checklist.md`). A handful of items on that checklist (placeholder-as-only-label, reading order versus visual order, visible focus indicators) remain outside automated detection, but per `docs/offer-positioning.md` sections 1 and 2, no manual review of them is sold as part of any tier. Where the automated scanner can flag one as a finding it is reported like any other finding; where it cannot, it is simply not covered, and that gap is not filled by a manual add-on.
3. ~~**Interface scope**, section 7.1. Gates milestone 7.~~ Resolved: milestone 7 shipped 2026-08-04 against that scope.
4. **Whether AFNIC's free open data includes SIREN, NAF, and the real-site-versus-parking classification**, or whether those sit only in the paid `.FR Performance` or SQUAW products. Named the first task of milestone 9a, before any code, because the answer determines whether that milestone is large or small. `docs/prospect-qualification.md` section 2.

### Still open, non-blocking

5. ~~Current EAA enforcement status in France, verified against primary sources.~~ Resolved 2026-08-15: `docs/obligation-basis.md` section 5 records the contested three-route enforcement picture (Lille, Caen, Créteil) with source status tagged per claim; several sub-items (astreinte and récidive figures, the transitional-provisions 2030 date, the Caen and Lille ordonnances themselves rather than press summaries, the Créteil outcome) remain individually open per that file's section 9, but the section is no longer a blank "verify this" note.
6. ~~**Whether to publish the full audit price band.**~~ Resolved 2026-08-07, superseded 2026-08-16: the price is no longer a band. A flat EUR 1,600 HT is published on the proposal page and any public pricing page. See 3.2.
7. Which site to use as the first public case study.
8. **How the report handles analysis variance.** Identical findings produced eight quick wins in French and seven in English on the first live run. Expected, since the model groups and ranks rather than computes, but it means monitoring deltas must be derived from the deterministic findings layer with the analysis regenerated, not diffed. Decide the mechanics in milestone 13, not before.
9. **Professional liability insurance (RC Pro).** Not mandatory as far as is known, worth one conversation with a broker before the first paid delivery. `docs/operator-obligations.md` section 7.

---

## 12. Success metrics and kill criteria

**Working:**

- Three paid full audits completed within the first eight weeks (superseded 2026-08-16: "or screenings" removed, screening is no longer a paid product).
- Reply rate above roughly 5 percent on evidence-led cold email.
- Outreach-preview-to-full-audit conversion rate, as the first read on whether the free-preview-to-paid-audit funnel actually converts (superseded 2026-08-16, replaces the screening-to-full-audit upgrade metric, which assumed a paid screening step that no longer exists).
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
