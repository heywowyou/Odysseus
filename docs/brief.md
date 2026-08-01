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
- **Lighthouse**, run programmatically as a Node module against the same Chromium instance. Provides Core Web Vitals (LCP, CLS, INP), performance diagnostics, SEO basics, and an independent accessibility pass.
- **Custom checks**, written in-house for what the above miss or report poorly: meta title and description presence and length, canonical tags, Open Graph, JSON-LD structured data presence and validity, sitemap.xml and robots.txt, hreflang correctness for bilingual sites, heading hierarchy, HTTP status and redirect chains, mixed content, image formats and sizes.

**Stage 3: Normalize and deduplicate.**
Scanners overlap and are noisy. axe and Lighthouse will both report the same contrast failure. Collapse everything into one findings model. This layer is what makes the service productizable, because everything downstream depends on a single stable shape.

Proposed finding document:

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

Deduplication key: `ruleId + selector` across pages, aggregating page URLs and occurrence counts so a site-wide issue appears once with a count rather than 400 times.

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
Render the structured result into a branded PDF. Puppeteer printing a styled HTML template is the pragmatic choice, since the template can be built in React and Tailwind and the same HTML can be served as a web version.

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
    PDF generation (Puppeteer)
    mark complete
    |
    v
Dashboard polls / subscribes -> renders result, download link
```

### 6.4 Data model, top level

- `clients`: name, contacts, language preference, sector, size bracket, notes.
- `audits`: clientId, targetUrl, type, config, status, timestamps, cost metrics, reportRef.
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
- **Monitoring means diffing.** The monitoring tier needs stored historical findings and a regression detector, so design the findings model to support comparison across runs from the start.

### 6.6 Honest limits to state in every report

Automated accessibility scanning catches a well-documented minority of WCAG issues, commonly cited around 30 to 40 percent. Keyboard navigation, focus order, alt text quality, form error handling, and media captions require manual checking. The report must say this explicitly, and the manual verification pass must actually be performed for accessibility audits. Overstating automated coverage is both a credibility risk and, in a compliance context, a liability risk. It is also a pricing argument: the manual layer is what a client cannot get from a free scanner.

---

## 7. Build sequence

Deliberately staged so the tool is shaped by real demand rather than assumptions.

**Phase 0: Manual audits, first 3 paying clients.**
Run axe-core and Lighthouse from the command line. Write a quick Playwright script for the render diff, since that is the differentiating artifact and worth having early. Paste structured output into an LLM by hand for prioritization. Format the PDF manually from a template. The goal is learning what clients actually ask about, argue with, and pay for. Do not build the platform yet.

**Phase 1: Core engine.**
Playwright crawl with raw versus rendered diff, axe-core integration, Lighthouse integration, normalization and dedupe into MongoDB. Command-line driven.

**Phase 2: Report pipeline.**
LLM prioritization layer with schema validation and the anti-hallucination guard, plus PDF generation from an HTML template. Bilingual output.

**Phase 3: Prospecting mode.**
Batch scanning, brokenness scoring, evidence screenshot generation, prospect database.

**Phase 4: Queue and dashboard.**
BullMQ, Express API, Next.js interface. Only worth building once volume justifies it. Before that, command-line invocation is sufficient and faster to iterate on.

**Phase 5: Monitoring.**
Scheduled re-scans, regression detection, delta reports. This is what makes the monthly tier real.

**Phase 6, optional:** self-serve access for agency partners, only if demand appears.

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
- **Overbuilding the tool.** Building phases 4 and 5 before selling three audits manually is the predictable failure mode. The tool is leverage for a service, not a product to perfect.
- **One-off revenue.** Audits do not repeat. Without the monitoring tier and agency partnerships, this is a treadmill. Build the recurring layer early.
- **Prospect list exhaustion.** A regional market has a finite number of qualifying businesses. Plan for expansion by sector or geography before the list runs dry.

---

## 11. Open questions to resolve

1. Which vertical to attack first: wine and tourism, e-commerce, or web agencies as white-label resellers.
2. Whether to lead with accessibility (legal urgency, clearer buyer) or SPA-SEO (clearer technical differentiation, easier evidence).
3. Current EAA enforcement status in France, verified against primary sources.
4. Whether to publish prices on a proposal page or quote per prospect.
5. Whether to offer a free automated mini-report as a lead magnet, and how much to give away without cannibalizing the paid audit.
6. Which site to use as the first end-to-end test case for the engine, ideally one that can double as a public case study.

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
- Tool build time expanding while sales stall, which is the classic failure mode here.

---

## 13. How to use this project

Good things to ask for inside the Odysseus project:

- Building specific modules: the Playwright render-diff scanner, axe-core integration, the normalization and dedupe layer, the LLM prioritization prompt and schema, the PDF template, the prospecting scorer.
- Drafting client-facing material: intake questionnaire, proposal page copy, cold email sequences, report templates, in French and English.
- Verifying time-sensitive regulatory facts before they go into client material.
- Stress-testing pricing, positioning, and vertical choice.

Ground rules to carry into that work: deterministic detection only, no invented findings, plain language over jargon, and evidence that holds up when a client checks it.
