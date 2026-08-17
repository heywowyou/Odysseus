# Sourced Statistics: Web Performance, Accessibility & GEO → Business Outcomes, by Sector
### Reference research pass for the Odysseus audit tool (`packages/reference`)

## TL;DR
- **The strongest, best-sourced evidence is cross-sector, not sector-specific.** Landmark studies (Deloitte/Google "Milliseconds Make Millions" 2020; Portent 2022; Baymard Institute; WebAIM Million 2026; Princeton "GEO" KDD 2024) give defensible numbers for speed→conversion, form-friction→completion, structured-data→CTR, and AI-citation factors — but they pool verticals or study only retail/travel/large enterprises. None sample French SMBs.
- **True sector-specific, dated, attributable data is thin.** Only three sectors have it with acceptable provenance: healthcare (peer-reviewed no-show study), hospitality (booking-abandonment benchmarks, one named 12,000-respondent survey), and professional booking/salons (named Zenoti survey + benchmark). For the other five sectors, most sector × metric cells must be flagged **"no sector-specific data found — cross-sector proxy only."**
- **GEO is largely a "null-result" area for llms.txt but proven for content tactics and structured data.** Multiple 2026 studies show llms.txt produces no measurable AI-citation lift; the Princeton study shows citations/quotations/statistics lift AI visibility by 40%+. Separately, automated accessibility tools catch only ~30–57% of WCAG issues (Deque/axe-core) — essential context for Odysseus's manual-review positioning.

## Key Findings
1. **Anchor the database on cross-sector performance data, explicitly flagged as such.** Deloitte/Google analyzed 37 brand sites and 30.5M sessions; a 0.1s mobile-speed improvement lifted retail conversions 8.4% and travel conversions 10.1%.
2. **Sector-specific gaps are the norm, not the exception.** For six of eight sectors there is no traceable, dated, sector-specific study for most performance/accessibility metrics — only cross-sector proxies or vendor case studies of unverifiable rigor.
3. **Accessibility business-case numbers are mostly old or vendor-driven.** The cleanest attributable ROI figures (Legal & General, Tesco, CNET) date to 2004–2009. The strongest abandonment stat is the Click-Away Pound Survey (69% of disabled users abandon inaccessible sites, 2019).
4. **Automated accessibility testing catches only a minority of issues** — Deque's own axe-core documentation states ~57% by issue volume; the older/common benchmark is 20–30% of success criteria (30–40% commonly cited). This directly supports Odysseus's manual-review value proposition.
5. **GEO/llms.txt is unproven; structured data and content tactics are proven.** Use Princeton GEO (up to 40% visibility lift) and Google's structured-data case studies; explicitly report the llms.txt null results so the tool does not overpromise.

---

## Details — organized by sector, then metric
*(Each entry maps to the JSON schema: sector · metric · statistic · unit · source · date · URL · applicability/methodology notes.)*

### CROSS-SECTOR / GENERAL — flag clearly: **NOT sector-specific**

**Performance → conversion / bounce**
- **0.1s mobile speed improvement →** retail conversions **+8.4%**, average order value **+9.2%**; travel conversions **+10.1%**, AOV +1.9%; luxury page views/session **+8.6%**; lead-generation information-page bounce rate **improved 8.3%**. Source: **Deloitte Digital & Google, "Milliseconds Make Millions," 2020** (study conducted by 55 and Deloitte). Verbatim: *"Retail conversions increased by 8.4% and average order value increased by 9.2%. Travel conversions increased by 10.1%…"* Sample: 37 brand sites, 30.5M sessions, hourly over 30 days (Oct–Nov 2019, EMEA & US), 90% confidence. URL: thinkwithgoogle.com / web.dev/case-studies/milliseconds-make-millions. Note: retail/travel/luxury/lead-gen only; predates Core Web Vitals metrics; large-enterprise sample.
- **Ecommerce pages loading in 1s convert ~2.5–3x higher than pages loading in 5s;** ideal window 0–4s. Source: **Portent, "Site Speed is (Still) Impacting Your Conversion Rate," updated April 2022.** Sample: ~100M page views, 5.6M sessions, 20 B2B/B2C sites, 27,000+ landing pages (14 B2B lead-gen + 6 B2C ecommerce). URL: portent.com/blog/analytics/research-site-speed-hurting-everyones-revenue.htm. Note: cross-sector.
- **Probability of mobile bounce rises 32% (1→3s), 90% (1→5s), 123% (1→10s).** Source: **Google/SOASTA Research, 2017** (Think with Google). Methodology: ML model on large mobile-ecommerce dataset, 90% prediction accuracy. Note: mobile ecommerce; cross-sector.
- **As page elements go 400→6,000, probability of conversion drops 95%.** Source: Google/SOASTA, 2017. Note: same study.

**Form field count / friction → completion**
- **Average checkout has 11.3 form fields (2024)**, down from 11.8 (2021)/12.7 (2019); most sites need only **~8**. Average checkout = **5.1 steps** (stable since 2012). Source: **Baymard Institute, "Checkout Optimization: Minimize Form Fields," 2024.** URL: baymard.com/blog/checkout-flow-average-form-fields. Note: large-retailer ecommerce benchmark; field count matters more than step count.
- **Fixing documented checkout UX issues can lift conversion by ~35% (up to 35.26%);** average site has ~39 improvement areas. Source: Baymard Institute checkout research, 2024. Note: large ecommerce sites.
- **70.19% average cart abandonment** (49-study aggregate, 2006–2023); ~70.22% (50 studies, updated Sept 2025). Source: Baymard Institute. Note: ecommerce cross-sector benchmark.

**Accessibility → business outcomes / bounce / abandonment**
- **69% of disabled users with access needs abandon ("click away from") sites they find hard to use;** UK retailers lost an estimated **£17.1 billion** in 2019 (up from £11.75B in 2016, when the figure was 71%). Source: **Click-Away Pound Survey 2019 (Freeney Williams / Rick Williams & Steve Brownlow), published Feb 2020.** URL: clickawaypound.com/downloads/cap19final0502.pdf. Note: UK; self-selecting (non-representative) survey; revenue figures are extrapolations — the strongest single abandonment stat available but flag methodology.
- **86% of disabled users would spend more on accessible sites; 90% of screen-reader users say they are held back from spending online.** Source: same Click-Away Pound 2019.
- **Legal & General:** online sales doubled within 3 months, **+50% organic search traffic**, **100% ROI in year one** after an accessibility overhaul. Source: Legal & General case study via W3C WAI business case, ~2007. Note: single-company, dated; UK financial services.
- **Tesco:** ~£13M/year revenue from a £35k accessible-site build. Source: W3C WAI (Tesco case study, 2004). Note: dated single-company.
- **CNET:** +30% Google traffic after adding video transcripts. Source: W3C WAI (CNET case study, 2009). Note: dated single-company.
- **Nucleus Research (commissioned by Deque, Aug 2019):** ~two-thirds of transactions initiated by vision-impaired users end in abandonment; estimated $6.9B missed market. Note: vendor-commissioned, small qualitative sample (n=73) — low weight.
- **WebAIM Screen Reader User Survey #10** (Feb 22, 2024; n=1,539): JAWS 40.5% / NVDA 37.7% / VoiceOver 9.7% primary desktop; 91.3% use a screen reader on mobile; only 34.6% felt web accessibility improved in the past year. URL: webaim.org/projects/screenreadersurvey10/. Note: authoritative on usage/perception; does **not** publish a bounce/abandonment rate — pair with Click-Away Pound for abandonment.

**Automated-testing coverage (background context for Odysseus)**
- **Automated tools catch on average ~57% of WCAG issues by volume;** prior/common consensus was **20–30% of WCAG success criteria (30–40% commonly cited).** Source: **Deque Systems — axe-core documentation and "Automated Accessibility Coverage Report" (Business Wire release, March 2021).** Verbatim (axe-core repo): *"With axe-core, you can find on average 57% of WCAG issues automatically."* Coverage report figure: **57.38%** of total issues, from 2,000+ audits, 13,000+ pages, ~300,000 issues. URLs: github.com/dequelabs/axe-core; deque.com/automated-accessibility-coverage-report. Note: the 57% (volume) vs 20–40% (success-criteria) distinction matters — cite both framings.
- **WebAIM Million 2026:** **95.9%** of top 1M home pages had detectable WCAG 2 A/AA failures (up from 94.8% in 2025); avg **56.1 errors/page** (errors up 10.1% YoY); avg 1,437 elements/page (+22.5% YoY). Source: WebAIM, Feb 2026. URL: webaim.org/projects/million/. Note: automated WAVE scan; homepages only; cross-sector.

**SEO / structured data / GEO**
- **Structured data → CTR: Rotten Tomatoes +25% CTR** (100,000 pages), **Nestlé +82% CTR** for pages shown as rich results, **Food Network +35% visits**, Rakuten 1.5x time on page / 3.6x AMP interaction. Source: **Google Search Central, "Intro to How Structured Data Markup Works."** Verbatim: *"Rotten Tomatoes added structured data to 100,000 unique pages and measured a 25% higher click-through rate… Nestlé has measured pages that show as rich results in search have an 82% higher click through rate…"* URL: developers.google.com/search/docs/appearance/structured-data/intro-structured-data. Note: named-company case studies; cross-sector; structured data is not itself a ranking factor.
- **Core Web Vitals ↔ ranking (correlational):** ~82% of first-page results have LCP <2.5s (SupportHost study); Advanced Web Ranking (3M pages) found positions 1–3 have measurably lower LCP than positions 8–10. Note: correlation ≠ causation; Google evaluates page experience holistically; CWV is a "gate, not a growth lever."
- **GEO content tactics → AI visibility up to 40%.** Source: **Aggarwal et al., "GEO: Generative Engine Optimization," KDD 2024 (arXiv 2311.09735), Princeton/IIT Delhi/Georgia Tech/Allen Institute.** Verbatim: *"Including citations, quotations from relevant sources, and statistics can significantly boost source visibility, with an increase of over 40% across various queries."* Sample: GEO-bench, 10,000 queries, 8 domains, tested on a Bing-Chat-like engine + validated on Perplexity. Note: "40%" is a maximum, not an average (Cite Sources / Quotation / Statistics Addition ≈ 30–40% on position-adjusted word count); efficacy varies by domain; engine is simulated.
- **llms.txt → AI citation: NO demonstrated lift.** Ahrefs (June 2026, 137,000 domains): **97% of llms.txt files received zero requests** in May 2026; AI-retrieval bots = **1.1%** of requests. SE Ranking (300,000 domains): **10.13% adoption, no correlation** with AI citations. ALLMO.ai: 1 of 94,614 cited URLs referenced an llms.txt page. Note: Google states its AI search does not use llms.txt — report as a null result.
- **Title/meta → CTR: SearchPilot controlled A/B tests show +9% to +25% organic traffic** from title-tag rewrites (e.g., +15% adding brand name first; +11% shortening truncated titles; +10% adding "the best"). **Backlinko (Aug 2019, updated Apr 2025):** pages with a meta description get **5.8% more clicks** than pages without (correlational, ~4–5M results). Note: SearchPilot = causal split-tests (single-client, context-dependent); Backlinko = correlational. Flag the widely-circulated "13.9% meta-description uplift" and "20% CTA" claims as **untraceable/misattributed** — do not include.

---

### 1. HOSPITALITY (hôtels, chambres d'hôtes, gîtes)
- **52% of travelers abandon a booking after a bad digital experience (not price).** Source: **SiteMinder Changing Traveller Report 2025** (12,000 travelers, 14 markets). Verbatim: *"More than half of travelers — 52% — reported they have abandoned an online booking after a bad experience"*; top reasons: security concerns 22%, complex processes 18%, long load times 18%; Gen Z highest at 70%. Note: named large survey — the best-provenance hospitality-specific stat.
- **Travel conversions +10.1% per 0.1s speed gain** — Deloitte/Google 2020 (travel vertical; closest rigorous proxy to hospitality).
- Travel/hospitality cart abandonment **~81.7%** (highest of any ecommerce sector); hotel-specific **~80%** (Revinate via Hotel Online); mobile 85.6% vs desktop 73.1% (Revfine). Note: aggregator/vendor provenance — flag as travel-sector aggregate, weaker weight.
- **Accessibility, screen-reader, structured-data, form-friction specific to hospitality: NO sector-specific data found.**

### 2. RESTAURANTS / RESERVATION-DRIVEN DINING
- Allergen/menu transparency: 92% of food-allergic guests return frequently after a positive experience; accommodating allergies can lift profit margin up to 24%. Source: Olo blog citing food-allergy research. Note: vendor blog; original research attribution unclear — **flag as weak provenance / anecdotal**.
- **Booking-widget conversion, page-speed→completion, structured data, accessibility for restaurants: NO sector-specific, dated, attributable data found.** (Digital-menu vendor claims — "+22% sales with professional images," Austria decision-stress study — lack traceable original sources; exclude or flag anecdotal.)

### 3. REAL ESTATE AGENCIES
- **Matterport: listings with 3D virtual tours receive 49% more qualified leads** than photos-only. Source: Matterport, 2024 (via Lionelz). Note: vendor-origin; verify before publishing.
- **97% of homebuyers use the internet during property search.** Source: National Association of Realtors, 2023. Note: named source; behavioral context, not a conversion metric.
- Average real-estate site converts <2–2.9%; top performers 5.6%+. Source: practitioner aggregation (adjetmarketing). Note: weak provenance.
- **Page-speed→lead-conversion, accessibility, structured data specific to real estate: NO rigorous sector-specific study found** — only cross-sector proxies (Portent, Google/SOASTA) reapplied by vendors.

### 4. HEALTHCARE & WELLNESS BOOKING
- **Online-booked appointments no-show 1.8% vs 5.9% phone-booked (~70% reduction);** online booking cut unused slots **22.7%→10.3%** and never-booked slots **8.6%→1.6%.** Source: **Frontiers in Digital Health / PMC (PMC12081397), 2025.** Sample: ophthalmology private practice (16,894 appts) + university hospital (81,173 appts), 20 months. Methodology: peer-reviewed retrospective — the strongest sector-specific dataset in this entire pass. Note: in the *hospital* setting the effect reversed (14.3% online vs 11.2% offline) — context-dependent; strongest for private-practice/appointment SMBs.
- **53% relative reduction in no-shows** for patient-portal scheduling users vs non-users. Source: survey study cited in healthcare literature (secondary citation — verify original).
- **Accessibility, structured data, GEO, page-speed→conversion specific to healthcare SMBs: NO sector-specific data found.**

### 5. RETAIL & LOCAL E-COMMERCE (own checkout, non-marketplace)
- ClearVision Optics (eyewear, $420k/mo): accessibility fixes → +26% conversion (2.3%→2.9%), +19% revenue in 90 days. Source: Build Grow Scale case study. Note: single-company vendor case study, unverifiable sample — **low weight**.
- All Baymard/Portent/Deloitte **retail** figures apply most directly to this sector — but remain cross-sector/large-enterprise samples, not French SMB.
- **French-SMB-specific retail data: NO data found.**

### 6. CAR RENTAL & MOBILITY (local/regional)
- Mid-size car-rental case study: **>68% abandoned during vehicle selection/payment;** conversion below the 2.5–4% industry benchmark; reducing steps/simplifying forms can lift conversion up to 50%. Source: Zigpoll case study. Note: single-company, vendor tool — **low weight / unverifiable**.
- **Rigorous, dated, sector-specific car-rental data: NO data found** — only vendor case studies and cross-sector speed proxies.

### 7. EVENT & ACTIVITY BOOKING (tourism activities, escape games, attractions)
- Tour/activity abandonment **~70–85%** (travel-sector aggregate). Source: Xola citing Baymard aggregation. Note: vendor; travel aggregate not activity-specific.
- 62%+ of online booking activity was mobile in 2022. Source: Xola. Note: vendor.
- **Rigorous, dated, activity-booking-specific performance/accessibility/GEO data: NO data found.**

### 8. PROFESSIONAL SERVICES WITH ONLINE BOOKING (hairdressers, beauty salons, fitness)
- **Online booking rates — salons 61% (top) vs 26% (median); nail studios 74% vs 44%; medical spas 32% vs 13%.** Source: **Zenoti 2026 Beauty & Wellness Benchmark Report.** Note: platform data; named report — best-provenance stat for this sector.
- **71% of salon/spa regulars (79% medspa) have abandoned a booking because it was too hard/slow.** Source: **Zenoti 2025 Salon & Spa Consumer Survey** (1,500+ customers). Note: named survey.
- 63% of online bookings completed on mobile; non-mobile-optimized pages convert ~25% lower; SMS reminders reduce no-shows 29–39%. Source: SimplyBook.me, 2026 (aggregating "multiple studies"). Note: vendor aggregation — weaker provenance; verify.
- **Accessibility, structured data, GEO specific to this sector: NO data found.**

---

## Recommendations
1. **Add an explicit `scope` field** (`sector-specific` vs `cross-sector-proxy`) and hard-block any cross-sector stat from rendering as sector-specific, per Odysseus's rule. Today, only **healthcare** (no-show study), **hospitality** (SiteMinder + abandonment benchmarks), and **professional booking** (Zenoti) qualify as genuinely sector-specific with acceptable provenance.
2. **Anchor performance claims on Deloitte/Google 2020 and Portent 2022**, always labeled cross-sector, and use them as the default proxy where a sector lacks data — never relabeled as the sector's own.
3. **Use the Deque 57% (by volume) / 20–40% (by success criteria) figures verbatim** as the background justification for Odysseus's manual-review layer, and pair with WebAIM Million 2026 (95.9% failing) for market context.
4. **Treat GEO carefully:** promote structured data (Google case studies) and Princeton GEO content tactics (citations, quotations, statistics); explicitly de-prioritize llms.txt and cite the 2026 null-result studies (Ahrefs 97%, SE Ranking) so the tool does not overpromise.
5. **Commission or source French/EU SMB data.** The entire evidence base is US/UK/large-enterprise-skewed; flag every cell as needing French-context validation before it drives client recommendations.
6. **Thresholds that would change these recommendations:** publication of a controlled WCAG-compliance→bounce/session-duration study; a French SMB analytics dataset; any AI answer engine confirming it consumes llms.txt; a rigorous sector-specific study for any of the five currently-empty sectors.

## Caveats
- **Provenance grading is essential.** Many "sector" figures are vendor/aggregator content lacking traceable original sources (Revfine, SimplyBook.me, Zigpoll, Build Grow Scale, adjetmarketing) — flagged low weight; do not treat as equivalent to Baymard/Deloitte/peer-reviewed data.
- **Recency vs relevance trade-off.** The most rigorous performance studies (Deloitte 2020, Google/SOASTA 2017, Portent 2022) predate the current Core Web Vitals metric set (LCP/INP/CLS) and sample large enterprises, not SMBs.
- **Accessibility ROI case studies (Legal & General, Tesco, CNET) are 2004–2009 and single-company** — usable as illustrative, not as current benchmarks.
- **GEO is fast-moving and largely correlational;** the one rigorous academic study (Princeton) uses a simulated engine, and its 40% figure is a maximum, not a typical result.
- **Several widely-circulated claims are misattributed** (e.g., "13.9% meta-description CTR uplift," "20% CTA uplift," various digital-menu stats) — these were checked and found to lack traceable primary sources; they are deliberately excluded.
- **No traceable original source exists for a clean "WCAG-compliance-level → bounce-rate" or "→ session-duration" study, or for a "screen-reader-compatibility → abandonment-rate" controlled study** in any sector; report these metric cells as gaps rather than substituting Click-Away Pound (which measures self-reported abandonment, not a controlled bounce/session metric).