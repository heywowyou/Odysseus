# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The service is sold to French small and mid-size businesses with consumer-facing websites. Primary targets named in the brief: e-commerce and consumer-facing service businesses above the microenterprise exemption threshold; wine estates, hospitality, and tourism businesses (often bilingual, often on modern JavaScript sites built by agencies); real estate agencies, clinics, and professional service firms with lead-generation sites. The first outreach vertical is French hotels rated at least three stars (operator decision, 2026-08-27).

The buyer and report reader is a non-technical decision maker. The report carries a "what to do first" summary aimed at that reader.

Two secondary audiences: web agencies as white-label reselling partners, and accessibility agencies and freelances as a second parallel sales channel (their automated-detection stage is pure cost). Deliberate non-targets: businesses under the EAA microenterprise exemption (for the accessibility angle; they may still buy an SEO audit) and very large enterprises with procurement processes.

The tool itself has exactly one user: the solo operator. The dashboard is private and single-user.

## Product Purpose

Odysseus sells standardized website audits to French SMBs, delivered as a prioritized, plain-language PDF report in French or English. Two audit types share one engine: technical and SPA-SEO audits (why a client-side-rendered site is effectively invisible to search crawlers, plus Core Web Vitals and structured data), and accessibility audits against WCAG 2.2 and EN 301 549. An AI visibility check (AEO/GEO) exists as a hook section inside the main report, deliberately not a standalone product.

Detection is done entirely by deterministic scanners. The LLM is used only at the end, to explain, group, prioritize, and translate findings into business language. The same tool that produces the deliverable also runs unattended across prospect websites, ranks them by severity, and generates the evidence used to open cold outreach. The brief's own phrase: one tool, two jobs, finding the work and doing the work.

Success means (brief section 12): three paid full audits within the first eight weeks of outreach, reply rate above roughly 5 percent on evidence-led cold email, a measurable outreach-preview-to-full-audit conversion rate, and time per audit falling as the pipeline matures.

## Positioning

The offer is positioned as a diagnostic, not an audit RGAA: the automated first step a business runs before commissioning a full audit RGAA, not a substitute for one. This limit is named first, on the offer page, in the proposal, and in the report, because stating the limit first removes the comparison instead of losing it. The full audit does not produce an official taux de conformité and cannot serve as the basis for a déclaration d'accessibilité. It is priced as the earlier product: EUR 1,600 HT flat, published.

The mechanism a neighboring product could not truthfully copy: deterministic scanner findings with render-diff evidence (what the crawler sees versus what a person sees), where every finding names a page and a selector so the client's own developer can verify it in seconds. Reports survive fact-checking. What the diagnostic does that an audit RGAA does not: whole-site inventory with content-sensitive analysis on every successfully crawled page rather than a template sample, render-diff evidence, search and LLM visibility findings alongside accessibility ones, and commercial framing for a non-technical reader.

This is deliberately not a SaaS. The tool is private leverage for a service. The moat is judgment, speed, bilingual delivery, and a client book, not the software.

On legal positioning, the operating rule quoted from the brief binds all output: "we report, we do not conclude". No output states that a specific business is legally bound, cites a deadline, or states what a sanction would be for that client.

## Operating Context

Client workflow stages: deterministic qualification, a free outreach preview document sent before purchase (governed by its own content rules; it never contains selectors, finding IDs, or exact page locations), a written intake questionnaire of 8 to 12 questions, a written proposal page, payment, the audit run, PDF report delivery, and written question rounds included in the price. A re-audit exists at EUR 450 HT flat within 5 business days. No implementation or monitoring upsell step exists; both were dropped deliberately in 2026-08-03.

Prices are displayed HT everywhere. The full audit price is flat, published, and owned by a single code constant that all surfaces share.

Delivery is the PDF report only. No video walkthrough. No manual verification is sold at any tier, full stop.

The operator runs everything through a private single-user dashboard at app.odysseusaudit.com (EU-hosted, password session). The public marketing and bot-information site is odysseusaudit.com, deployed separately; the crawler's user agent resolves to https://odysseusaudit.com/bot.

Crawling is polite and constrained: robots.txt respected, identifiable user agent, politeness delay per origin, and a page cap only when the operator opts in. Prospect data is deleted after 90 days at the database level. Outreach drafts are created in a mailbox and never sent automatically; a human reviews and sends, within a ceiling of 20 to 40 sends per day per warmed mailbox. Telephone is closed as a cold-prospecting channel since 11 August 2026.

All user-facing material is French or English, matching the client's language.

## Capabilities and Constraints

Capabilities, all confirmed in the brief and charter:

- One engine, two scan types: full audit scans and prospecting scans. Prospecting reuses low-level scanner primitives but never calls Lighthouse, the paid-audit orchestration, or the LLM.
- Detection: axe-core configured for WCAG 2.2 level AA, Lighthouse for Core Web Vitals (its accessibility and best-practices categories emit no findings), in-house custom checks, and the raw-versus-rendered diff. An extended accessibility pass adds keyboard traps, focus order, form error handling, video caption presence, and a heuristic red-flag check for low-quality alt text.
- Coverage model: every successfully crawled HTML page is content-checked (render diff, axe, extended pass); Lighthouse is a disclosed deterministic sample stratified by page role, template family, and language. The report states inventoried, content-checked, and performance-measured counts separately.
- LLM layer: strict JSON in and out, Zod-validated, hard rejection of any finding ID absent from its input, never receives raw HTML or whole pages, and is not called at all when a scan produced too little to justify it. A structure pass runs once per audit and a writing pass once per language.
- The report includes a methodology and limitations statement: automated scanning catches a well-documented minority of WCAG issues, commonly cited around 30 to 40 percent, and it never claims a manual pass was performed.

Constraints and terminology that bind future work:

- "Extended accessibility pass", never "manual accessibility verification". "Diagnostic", never "audit RGAA" for the offer itself. Severity levels: critical, serious, moderate, minor. Finding categories: accessibility, seo, performance, rendering, geo.
- The report's legal content is a deterministic splice from a code-owned table; the model never writes legal relevance in its own words.
- Private single-user tool: no client login, no self-serve signup, no billing, no multi-tenancy, no in-app remediation tracking.

Explicitly undecided product facts, held for the operator:

- Which site becomes the first public case study (brief section 11, open question 7).

Resolved since the 2026-09-02 draft (operator-confirmed 2026-09-11 via impeccable init):

- WCAG 2.2 AA binds as the internal accessibility standard on all new surfaces (site, dashboard, future UI), not only the client PDF; see Accessibility & Inclusion.
- The comp-first versus code-first build path does not arise: no agent harness used on this repository has image generation, so new visual work runs code-first by necessity. Revisit only if a harness gains image generation.

## Brand Commitments

- Name: Odysseus, for both the audit service and the tool that powers it. Any earlier reference to "audit-play" refers to this project. Domains: odysseusaudit.com and odysseusaudit.fr.
- Identity constraint recorded in code: wordmark only, no logo mark, per the operator's monochrome direction (`packages/interface/src/dashboard/app/brand.tsx`).
- Voice: plain language over jargon, evidence that holds up when a client checks it, no invented urgency, limits stated before strengths. User-facing strings are French and English from the start. No em dashes or en dashes in generated product copy.
- An incumbent client report design system exists ("Nocturne"), locked and explicitly not open for reinterpretation. Its authoritative spec is `docs/report/report-design-system.md`. New work must not silently replace it.

## Evidence on Hand

- Typeface assets: Inter woff2 in four weights (Regular, Medium, SemiBold, Bold) at `packages/report/src/fonts/`. These are canonical; the dashboard reuses the same files (`packages/interface/src/dashboard/theme.css`). The public site typesets separately, in an operator-licensed Avenir Next self-hosted at `packages/site/app/fonts/` (decided 2026-09-11, impeccable fix plan step 6); it is not part of this canonical Inter set and is not shared with the report or dashboard.
- Incumbent report design: locked CSS (`packages/report/src/styles/nocturne.css`, `paged.css`) and the canonical flat mockups `docs/report/design/report-mockup-standalone.flat.html` and `docs/report/design/report-mockup-preview.flat.html`, speced in `docs/report/report-design-system.md` and `docs/report/report-design-tokens.md`.
- Dashboard theme: monochrome dark tokens in `packages/interface/src/dashboard/theme.css`; the brand is a text wordmark component, `packages/interface/src/dashboard/app/brand.tsx`.
- Public site: `packages/site` (Next.js, deployed separately to Vercel) with pages for the home, the offer, bot information, prospecting privacy, unsubscribe, and the token-based preview route. One favicon exists (`packages/site/app/favicon.ico`). There is no `public/` directory, and no logo file, photography, illustration, OG image, or other imagery exists anywhere in the repository (verified by search). Site metadata still describes the site as under construction.
- No testimonials, case studies, customer logos, certifications, or press exist yet. The first public case study site is not chosen, and the published benchmark study (milestone 10) does not exist yet. Future design work must not fabricate any of these.
- Real scan evidence exists on disk under `artifacts/` for audited sites (including haaitza.com, lacoorniche.com, www.airelles.com, almamia.fr, sas-fernande.fr). This is verification material, not client testimonials, and is not publishable as social proof.
- Citable statistics: `docs/research/business-impact-statistics.md` marks which sources are safe to cite; only those rows are encoded, with verbatim bilingual citation sentences, in `packages/core/src/reference-stats/stats.ts`. Nothing outside those rows may be cited.
- Published price: EUR 1,600 HT, rendered on the offer page from `ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT` in `packages/core/src/offer/pricing.ts`.

## Product Principles

1. Deterministic scanners detect; the LLM only explains, groups, prioritizes, and translates. No finding exists without scanner provenance.
2. Evidence must survive being checked. Every finding names a page and a selector; limits are stated first, not admitted later.
3. One standardized engine, one flat published price. The tenth audit costs almost nothing to deliver and still ships the same fully automated report.
4. Plain bilingual language for a non-technical decision maker.
5. Private leverage for a one-person service, not a product to open up. Success is paid audits, not user growth.

## Accessibility & Inclusion

- WCAG 2.2 AA is the binding internal accessibility standard for every new surface, public site and dashboard alike, not only the client PDF (operator decision, 2026-09-11). Existing enforcement: the report's axe self-test, the site-wide axe sweep shipped with plan 038, and the dashboard v2 render axe e2e shipped with plan 037.
- The client-facing PDF report is required to pass its own axe-core WCAG 2.2 AA self-test with zero violations (shipped in milestone 6.2 and enforced by a test). Report color tokens were lightened specifically to clear 4.5:1 contrast; do not revert them without re-running that test.
- Bilingual French and English delivery is a product requirement, not a nice-to-have.
- Reports are written for readers who are not developers: business impact, effort, and priority in plain language, with code detail confined to the appendix.

<!-- Drafted 2026-09-02 from repository documents (docs/product/odysseus-project-brief.md, docs/rules/offer-positioning.md); operator-confirmed as drafted 2026-09-02 (plan 022 steps 1 and 5). Refreshed 2026-09-11 via impeccable init (schema marker added): WCAG 2.2 AA confirmed binding on all new surfaces, build-path question closed for lack of image generation; the case-study choice stays held for the operator. All other content reconfirmed unchanged on 2026-09-11. -->
