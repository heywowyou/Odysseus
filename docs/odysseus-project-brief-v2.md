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

Three tiers, priced flat, never hourly.

| Tier | What it is | Indicative price |
|---|---|---|
| Audit | Full scan, prioritized report, PDF in FR or EN, recorded video walkthrough | EUR 1,500 to 3,000 depending on site size |
| Implementation | Fixing the prioritized issues | EUR 2,000 to 6,000, scoped per project |
| Monitoring | Monthly re-scan, regression alerts, short delta report | EUR 150 to 500 per month |

Notes on pricing logic:
- The audit is the wedge. Implementation and monitoring are where revenue compounds.
- Price on business impact and legal exposure, not on hours or page count.
- Small sites (under roughly 20 pages) can take a lighter fixed offer around EUR 900 to 1,200 to lower the entry barrier.

### 3.3 What the client receives

1. Prioritized PDF report, in their language, structured by theme rather than as a raw violation list.
2. Each theme: what is wrong, why it matters commercially or legally, effort to fix, impact if fixed, affected pages, code-level detail in an appendix.
3. Before and after evidence for the SPA rendering issue (screenshot of raw HTML view versus rendered view).
4. A recorded video walkthrough, 5 to 10 minutes, covering the priorities and the reasoning.
5. A short "what to do first" summary aimed at a non-technical decision maker.

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

| Stage | Mechanism |
|---|---|
| Qualification | Automated mini-scan producing one piece of concrete evidence |
| Scoping | Written intake questionnaire, 8 to 12 targeted questions |
| Proposal | Written proposal page presenting the three tiers |
| Delivery | PDF report plus recorded video walkthrough |
| Follow-up | Written question rounds, scoped and included in the price |
| Implementation kickoff | Written scope document plus a shared task board |

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
Input: the normalized findings array plus site context from the intake questionnaire (business type, goals, languages, audience). Never the raw HTML, never the full page. This keeps token cost trivial (a few cents per report) and keeps the model on rails.

Tasks:
- Group 200 raw findings into roughly 8 to 15 themes a human can act on.
- Write a plain-language business impact statement per theme.
- Estimate implementation effort per theme (low / medium / high) and flag which require design decisions versus pure code changes.
- Rank by impact against effort, informed by the client's stated business goal.
- Draft the executive summary.
- Produce output in French or English as specified.

Interface: strict JSON in, strict JSON out. System prompt instructs the model to return only JSON matching a fixed schema, no prose, no markdown fences. Validate the response against the schema (Zod) and retry on failure. Reject and log any output containing a finding ID not present in the input, as a hard guard against invented findings.

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

This mode must be cheap and fast per site, since it runs against hundreds. Skip the LLM layer entirely here, or use one very short call to generate a single-sentence hook per prospect.

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

**Milestone 5: LLM prioritization.** Next. Structured input, Zod-validated output, hard rejection of any finding ID absent from the input, retry then fail loudly. First decision to make, before building: whether to floor severity before the model sees the findings. See open item 7.

**Milestone 6: report generation.** HTML and Tailwind template printed to PDF by Chromium. Bilingual. This is the client-facing artifact and the thing the whole business is actually selling.

**Milestone 7: interface.** Queue, API, and web UI. Scope defined in 7.1 below, and not started before that section is filled in.

**Milestone 8: custom checks.** Meta, canonical, JSON-LD, sitemap, hreflang, heading hierarchy, redirect chains. Deferred because axe and Lighthouse already produce enough to sell an audit; these deepen it rather than enable it.

**Milestone 9: prospecting mode.** Batch scanning, brokenness scoring, evidence screenshots, prospect database.

**Milestone 10: monitoring.** Scheduled re-scans, regression detection, delta reports. What makes the monthly tier real.

### 7.1 Definition of done for the interface

**To be filled in before milestone 7 begins. Building against an undefined scope is the specific way this approach fails.**

The question to answer: what must the interface do before the first outreach email is sent, and what is explicitly a later addition? Anything not on the first list waits, no matter how appealing it looks mid-build.

A reasonable starting position, to be confirmed or replaced:
- Trigger an audit against a URL and watch it progress
- View findings for a completed audit, grouped and prioritized
- Trigger report generation and download the PDF
- List past audits per client

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

1. Prospecting mode scans a batch of candidate sites and ranks them.
2. For the top prospects, generate one piece of evidence: the raw-versus-rendered screenshot, or the top accessibility violations with counts.
3. Cold email: short, specific, evidence-led. Lead with the finding, not with credentials. One clear ask, linking to a proposal page or a short intake form.
4. Follow-up sequence: two or three emails, spaced, each adding one new piece of information rather than repeating the ask.
5. Interested prospect completes the intake questionnaire.
6. Written proposal with three tiers.
7. Payment, ideally partly up front for first-time clients.
8. Audit runs, report and video walkthrough delivered.
9. Upsell to implementation or monitoring in the report's closing section, and in a follow-up email a week later.

**What to test and measure:** open and reply rates by vertical, which evidence type converts better (SEO invisibility versus accessibility exposure versus AI visibility), which price point closes fastest, and time from first email to payment.

**Do not do:** fabricate urgency, misrepresent legal exposure, or send high-volume untargeted email. The whole play depends on the evidence being real and checkable.

---

## 10. Risks and failure modes

- **Report credibility collapse.** One hallucinated or wrong finding in front of a client's developer damages the whole offer. Mitigated by the deterministic-detection rule and schema validation, but the manual review step must be genuinely performed.
- **Automated-scan commoditization.** Free scanners exist and clients know it. The differentiator must be prioritization, business framing, bilingual delivery, and the manual layer, not the scan itself. Never let the report look like raw tool output.
- **Legal overreach in marketing.** Claiming EAA applicability to an exempt microenterprise is wrong and reputationally risky. Check the size threshold before using the legal angle.
- **Scope drift in the build-first approach.** The original brief called overbuilding the predictable failure mode and recommended selling three audits before building the platform. Section 7 revises that deliberately: the tool gets built complete first. The risk does not disappear, it changes shape. It is no longer "building the wrong thing," it is "never declaring the thing finished." The guardrail is section 7.1: interface scope written down before milestone 7 starts, and anything not on that list waits. If the interface milestone runs long past its written scope, that is the signal, not a reason to extend the scope.
- **One-off revenue.** Audits do not repeat. Without the monitoring tier and agency partnerships, this is a treadmill. Build the recurring layer early.
- **Prospect list exhaustion.** A regional market has a finite number of qualifying businesses. Plan for expansion by sector or geography before the list runs dry.

---

## 11. Open questions

### Settled 2026-08-02

- **Both audit types, equal weight.** They share one engine, so this costs nothing in code. The cost is in delivery time: accessibility requires a genuine manual pass, SPA-SEO does not.
- **No free public scanner.** Private prospecting only. A free scanner is a distribution play and there is no traffic yet to distribute to. Revisit if outreach proves the evidence converts.
- **Vertical choice deferred.** It shapes outreach, not the build. Decide when building the prospect list, informed by which sectors actually scan badly.
- **Build fully, then sell.** See section 7.

### Blocking, with a named dependency

1. **A real domain with a bot-information page.** The crawler user agent still points at `https://your-domain.example/bot`, which can never resolve, so any site owner checking their logs sees a bot they cannot identify. Two real scans have now gone out under that placeholder. It does not block the build, but it blocks every scan of a site not owned by the operator, which is all of prospecting. Roughly twenty minutes of work and increasingly overdue.
2. **The manual accessibility checklist** (`docs/manual-accessibility-checklist.md`). Two confirmed entries so far, both discovered by testing rather than assumed: placeholder-as-only-label passes axe because the placeholder supplies an accessible name, and heading-order is excluded twice over, once by axe's tag set (tagged best-practice rather than WCAG) and again by the milestone 4 decision to emit nothing from Lighthouse's accessibility category. This checklist determines how long an accessibility audit takes, which determines whether the pricing holds. It gates selling accessibility audits, not the build.
3. **Interface scope**, section 7.1. Gates milestone 7.

### Still open, non-blocking

4. Current EAA enforcement status in France, verified against primary sources.
5. Whether to publish prices on a proposal page or quote per prospect.
6. Which site to use as the first public case study.
7. **Whether to floor severity before the LLM sees findings.** On sas-fernande, 61 of 78 findings were minor, almost all low-weight Lighthouse audits a client report should probably not carry. Sending everything spends most of the model's attention on trivia and risks themes built around it. Flooring risks silently dropping something a client cares about, and the coverage check in `llm-output.ts` would stop meaning what it currently means. Decide at the start of milestone 5 and record the reasoning.

---

## 12. Success metrics and kill criteria

**Working:**
- Three paid audits completed manually within the first eight weeks.
- Reply rate above roughly 5 percent on evidence-led cold email.
- At least one audit converting to implementation or monitoring.
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