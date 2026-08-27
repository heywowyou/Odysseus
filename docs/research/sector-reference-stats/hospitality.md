# Hospitality sector reference statistics

### Accessibility and SEO business-impact data for hotel and restaurant audit reports

Compiled for sector-matched statistics covering hospitality (hotels, restaurants, chambres d'hotes). Each entry meets the bar of a named, checkable primary source. Entries are ordered roughly by strength, strongest first.

Legend for Scalable field:
- SCALABLE = a ratio that can be multiplied against a client's own revenue or booking volume
- CONTEXT-ONLY = a fixed aggregate or descriptive figure, quote as-is, never scaled

**Promotion status** (added by the Odysseus team after this research
landed, 2026-08-22 - see `packages/core/src/reference-stats/stats.ts`
for the encoded rows and their exact `id`s):

| # | Entry | Promoted to `stats.ts`? | Why / why not |
|---|---|---|---|
| 1 | AccessAble survey | Yes - `accessable-avoidance-2023` | Direct fit: missing accessibility info on the venue's own site causes avoidance |
| 2 | Coach Omnium | No | Best French-market data available, but no `StatCategory` fits booking-form friction / direct-booking positioning - same "no home yet" situation as the `rendering` category. Kept here for future exec-summary or next-steps copy, not a per-finding citation |
| 3 | UK Participation Survey (DCMS) | Yes - `dcms-holiday-participation-gap-2024` | Hospitality-specific (overnight stays), current, disclosed comparison group |
| 4 | UK Disability Unit / RiDC | No | Cross-sector by the research's own admission - use for framing, not as a headline hospitality stat |
| 5 | DGE / Accesmetrie 2019 | Yes - `dge-accesmetrie-booking-rare-2019`, TRAVELSAT figure dropped | French, exact client segment (5th-category hotels/restaurants); TRAVELSAT figure excluded as instructed (secondhand, unverified) |
| 6 | DREES | No | Not hospitality-specific (population prevalence); belongs in a future `general`-sector accessibility row, out of scope this pass |
| 7 | QualiBooth 2026 | No | Proprietary 0-100 score, sample skews to large international chains; the failure-pattern list is useful scanner-rule corroboration, not a citable report statistic |
| 8 | Teixeira et al. (Portugal) | Yes - `teixeira-hotel-accessibility-portugal-2022` | Peer-reviewed, disclosed sample/tools, EU hotel population |
| 9 | Singh, Sibi and Bashir | Yes - `singh-hotel-accessibility-top100-2025` | Peer-reviewed venue; corroborates entry 8 independently |
| 10 | EC / GfK Belgium 2014 | No | Aggregate market-size figure (783M trips, 394bn EUR) - same excluded family as Click-Away Pound's UK aggregate, already out of the general table for the same reason |
| 11 | VisitEngland / XV Insight checklist | No | Not a statistic - a content checklist. Potential future source for recommended-action template copy, not `stats.ts` |
| - | SiteMinder Changing Traveller Report 2025 | Yes - `siteminder-digital-experience-abandonment-2025` | Only figure in the "no citable data" section with real disclosed methodology; wired as `performance`, labeled self-reported recall in the citation text itself |

The **"Categories confirmed to have no citable data"** section at the
end of this file is load-bearing, not filler: it is the reason
`packages/core/src/reference-stats/stats.ts` has no hospitality-tagged,
scalable ratio for accessibility at all. Do not re-research
"hospitality booking abandonment rate" or "accessibility fix to booking
conversion, hospitality" without reading that section first - the
answer, checked across six countries, is that no such study exists, and
the correct report behaviour is to say so rather than approximate it.

---

## 1. AccessAble, "Accessibility and You" Survey 2023/24 (UK)

**Source:** AccessAble, https://www.accessable.co.uk/articles/accessibility-and-you-survey-results-2023-2024. Relied upon and cited directly by VisitEngland (the UK national tourism board) on its own business advice pages.

**Figures:**
- 95% of respondents check accessibility information before visiting a new place
- Typical research time before a visit ranges from 20 minutes to 1 hour
- 87% expect the venue's website to signpost detailed access information and photos
- 95% feel anxious about visiting new places due to accessibility concerns
- 77% reported avoiding venues because they could not find accessibility information
- 96% said having accessibility information available in advance would make them more likely to visit (as cited by VisitEngland)

**Methodology:** Online survey of AccessAble's disabled user community, run 2023 to 2024, multiple-choice and open-ended questions, follow-up to a 2018 wave. Respondents are self-selecting, recruited through AccessAble's own channels. Sample size is not published in the results article.

**Credibility tier:** MEDIUM. Self-selecting sample from an accessibility-information provider's own user base, so not a representative panel. Weighed against that: the organisation is named and long-established, a national tourism board treats the figures as its reference source, and the results are internally consistent with independent UK government data (see entry 3).

**Scalable:** CONTEXT-ONLY. The 77% is a share of disabled respondents who report avoiding venues, not a measured booking-loss rate. Never multiply it against a client's revenue.

**Relevance:** This is the strongest available evidence anywhere for the core claim your reports need to make: that missing accessibility information on a venue's own website causes lost visits, not just discomfort. The 87% expecting information on the venue's own site (not the OTA listing) is the direct argument for auditing the hotel's own domain. The 20 minutes to 1 hour research window explains why a page that hides or omits this information loses the visitor before any booking form is reached.

---

## 2. Coach Omnium, 7e enquete clientele hoteliere (June 2022, France)

**Source:** Coach Omnium, French tourism and hospitality market research firm operating since 1991, self-funded and independent. Published via coachomnium.com and TendanceHotellerie.

**Figures:**
- 47% of hotel guests are annoyed when hotel sites impose a long booking form, versus simpler OTA flows
- 26% are annoyed by abusive cancellation conditions
- 18% no longer tolerate the volume of post-booking emails
- 70% now finalise bookings direct with the hotel, up from 30% in 2017, versus 65% via an OTA (multiple answers allowed)
- Only 16% book via a chain platform
- 58% visit the hotel's own site after finding the property elsewhere (OTA, tourist office, Google); 37% do so before
- 82% book online overall

**Methodology:** 621 face-to-face interviews with French and European guests of French hotels, conducted June 2022, quali-quantitative, representative by price segment, socio-professional category, stay frequency and origin. Face-to-face rather than panel or phone, which the firm states deliberately as its methodological strength.

**Credibility tier:** MEDIUM-HIGH. Commercial but independent and self-funded, named founder (Mark Watkins), disclosed sample and method. Unusually rigorous for this space.

**Scalable:** CONTEXT-ONLY.

**Relevance:** This is the best French-language, French-market finding available on booking-form friction, measured on actual guests of French hotels rather than generic e-commerce shoppers. The 47% figure is the closest available anchor for "your booking form is costing you direct bookings." The 58%-after-OTA figure supports positioning the hotel's own site as the conversion surface, not the discovery surface, which matters for how you frame SEO recommendations.

---

## 3. UK Participation Survey 2024/25 (DCMS)

**Source:** UK Department for Culture, Media and Sport, national statistics, cited by VisitEngland.

**Figure:** 45% of adults in England who identify as disabled did not take a holiday in England in the last 12 months involving at least one night away, compared with 34% of non-disabled people.

**Methodology:** DCMS national statistics survey, 2024/25 wave, government-run.

**Credibility tier:** HIGH. National statistics, current, and the comparison group is stated, which is what makes the gap meaningful rather than a standalone scare figure.

**Scalable:** CONTEXT-ONLY.

**Relevance:** This is the accommodation-sector equivalent of the French DREES prevalence figure (entry 6), but more directly about the product your clients sell: overnight stays. An 11-point participation gap in holidays involving a hotel stay is a clean, defensible way to size the addressable market without inventing a conversion multiplier.

---

## 4. UK Disability Unit / Research Institute for Disabled Consumers, "Accessibility of private sector products and services for disabled people in the UK" (July 2025)

**Source:** UK government, Cabinet Office Disability Unit, research conducted by RiDC. https://www.gov.uk/government/publications/accessibility-of-private-sector-products-and-services-for-disabled-people-in-the-uk

**Figures:** Sector-by-sector and customer-journey-stage barrier data across UK private-sector services (hospitality among the sectors covered).

**Methodology:** Commissioned by the Disability Unit under the National Disability Strategy. Survey designed by RiDC with an advisory group of 12 experts by experience, plus two focus groups. Ran 12 September to 19 October 2023. 1,545 valid, fully completed responses. Respondents self-selecting, recruited via RiDC's network and social media, and the report states this limitation openly.

**Credibility tier:** HIGH on provenance and transparency (government-commissioned, named research institute, disclosed dates and sample, explicit about self-selection). MEDIUM on generalisability because of that same self-selection.

**Scalable:** CONTEXT-ONLY.

**Relevance:** Cross-sector rather than hospitality-only, so use for customer-journey framing rather than as a headline hospitality statistic. Worth reading the full sector breakdown directly before citing anything specific from it; only the methodology has been verified here, not every hospitality-specific figure inside.

---

## 5. DGE / Accesmetrie, "Retombees economiques pour les professionnels du tourisme (hoteliers et restaurateurs) de la mise aux normes accessibilite des ERP de 5e categorie" (Nov 2019, France)

**Source:** Commissioned by the Direction Generale des Entreprises (French state), executed by Accesmetrie. PDF hosted at tourisme-handicaps.org.

**Figures:** The study finds that hoteliers and restaurateurs still perceive accessibility narrowly, focused on motor disability. On the digital side it states plainly that the ability to reserve an adapted room directly on the hotel's own website is rare, and that a third party usually operates the hotel's site. It also relays a TCI Research TRAVELSAT 2014 competitiveness figure: revisit intention among tourists with a disability who particularly enjoyed their stay reaches 78%, versus 67% for the average visitor.

**Methodology:** Online questionnaire plus interviews with disability associations and ERP (Etablissement Recevant du Public) managers. Sample size not disclosed in the recommendations volume (Tome 2) reviewed here.

**Credibility tier:** MEDIUM for the DGE study itself (French state-commissioned, named executor, but sample undisclosed in the volume reviewed). LOW for the TRAVELSAT 78/67 figure specifically, since it is a secondhand citation of a 2014 source, not verified directly. Use the DGE findings; drop the TRAVELSAT figure unless sourced directly.

**Scalable:** CONTEXT-ONLY, both figures.

**Relevance:** Scoped exactly to French 5th-category hotels and restaurants, which is your precise client segment. The "reserving an adapted room online is rare" finding is a state-commissioned observation that maps directly onto a defect your scanner can detect, letting you make the point with an official citation rather than an assertion of your own.

---

## 6. DREES, "Le handicap en chiffres", edition 2024 (France)

**Source:** Direction de la recherche, des etudes, de l'evaluation et des statistiques, published 28 November 2024. https://drees.solidarites-sante.gouv.fr/

**Figure:** In 2022, in metropolitan France, 14.5 million people aged 15 or over living at home (28%) report at least one severe functional limitation (sight or hearing problems despite correction, difficulty climbing stairs, frequent memory lapses). 5.4 million (10%) report being strongly restricted in essential daily activities. A further 9% (4.6 million) report a significant health-related restriction lasting more than six months.

**Methodology:** DREES enquete Autonomie 2022, metropolitan France, people 15 and over in ordinary housing, around 22,000 people surveyed. DREES explicitly declines to give a single headline figure and presents a range depending on definition used (between 4.6 and 16 million).

**Credibility tier:** HIGH. French official statistics service, disclosed survey instrument, large sample.

**Scalable:** CONTEXT-ONLY for revenue. It is a population prevalence rate, useful to size an addressable audience but not to be multiplied against bookings, since there is no evidence for what share of that population would have booked absent a barrier.

**Relevance:** Not hospitality-specific by itself, which is why it belongs in market-sizing rather than impact framing. Its value is that it is French, official and current, replacing vague "1 billion people worldwide" filler with a number a French hotel director recognises as describing their own market.

---

## 7. QualiBooth, "2026 Accessibility Report: The State of Hospitality Sector Accessibility in Europe" (Jan 2026)

**Source:** https://www.qualibooth.com/resources/2026-hospitality-accessibility-report/

**Figures (use the failure-pattern list, not the proprietary scores):** Recurring critical failures on hospitality booking interfaces: low contrast on prices and dates; missing form labels on date and guest selectors; keyboard traps in modals, filters and calendars; improper heading structure; unannounced dynamic updates; tiny touch targets; property cards announced by screen readers as "button, button, button"; date pickers that cannot be operated by keyboard. Property listing pages score worst of all page types (desktop ~68, mobile ~70 on QualiBooth's own 0 to 100 scale), versus contact pages (~82/~83).

**Methodology:** Automated scans (proprietary scoring engine), November to December 2025, home, listing and contact pages, desktop and mobile, across 139 European hospitality websites, predominantly international chains and booking providers, not French independent SMBs. The report itself states a score of 100 does not imply full accessibility or compliance.

**Credibility tier:** MEDIUM at best for the numeric scores, since the 0-100 scale is proprietary and not independently reproducible, and the sample skews to large international chains rather than your client segment. Use the qualitative failure-pattern list, which is corroborated by the peer-reviewed studies below, rather than the numeric scores.

**Scalable:** CONTEXT-ONLY.

**Relevance:** The specific list of recurring failure types (unlabelled date pickers, keyboard traps in calendars, unlabelled guest selectors) matches almost exactly what your own scanner's custom checks are built to detect, giving you independent corroboration that these are the real-world failure modes in hospitality booking engines specifically, not a generic e-commerce artifact.

---

## 8. Teixeira, Eusebio and Teixeira, "How diverse is hotel website accessibility? A study in the central region of Portugal using web diagnostic tools", Tourism and Hospitality Research (2022)

**Source:** Peer-reviewed journal. https://doi.org/10.1177/14673584211022797

**Figure:** A sample of 306 hotel and Pousada websites analysed against WCAG 2.0 at levels A, AA and AAA using AccessMonitor and TAW. Web accessibility levels found to be low overall, with "Perceivable" and "Robust" the most critical guideline categories. Contrary to expectation, higher-category (more expensive) hotels showed the lowest accessibility scores.

**Methodology:** 306 websites, automated diagnostic tools (AccessMonitor, TAW), central region of Portugal.

**Credibility tier:** HIGH. Peer-reviewed, disclosed sample size, disclosed tools, EU member state. Caveats: tests WCAG 2.0 rather than 2.2, automated-only (no manual verification), and Portugal rather than France.

**Scalable:** CONTEXT-ONLY.

**Relevance:** The closest peer-reviewed analogue to what your product does, on a comparable EU hotel population. The finding that higher-category hotels score worse is genuinely useful when addressing an upmarket French client who assumes an expensive site is automatically compliant.

---

## 9. Singh, Sibi and Bashir, "Inclusion or exclusion: Evaluation of hotel websites from an accessibility perspective", Tourism and Hospitality Research (2025)

**Source:** Peer-reviewed journal. https://doi.org/10.1177/14673584231206912

**Figure:** Top 100 hotel websites evaluated against WCAG 2.0 level AA using TAW. Barriers found especially under guidelines 1.1 (text alternatives), 2.4 (navigable), 4.1 (compatible), 1.3 (adaptable) and 1.4 (distinguishable).

**Methodology:** 100 websites, single automated tool (TAW). The defining population for "top 100" is not specified in the abstract reviewed.

**Credibility tier:** HIGH on venue (peer-reviewed), MEDIUM on strength (single automated tool, undefined sample frame, WCAG 2.0 rather than 2.2).

**Scalable:** CONTEXT-ONLY.

**Relevance:** Useful as corroboration that failure clusters are consistent across independent hotel-website studies, strengthening whatever your own scanner finds rather than standing alone as a citation.

---

## 10. European Commission (DG ENTR) / GfK Belgium, University of Surrey, NeumannConsult, ProAsolutions, "Economic Impact and Travel Patterns of Accessible Tourism in Europe" (2014)

**Source:** Service Contract SI2.ACPROCE052481700. Final report at ec.europa.eu and accessibletourism.org.

**Figure:** EU travellers requiring special access (through disability or age) made 783 million trips within the region in 2012, contributing 394 billion euros and 8.7 million jobs.

**Methodology:** Four research tasks: cluster analysis and forecasting of demand; website and brochure analysis plus online survey and senior focus groups; case studies and desk research on barriers; stakeholder consultation and scenario impact assessment. Budget 250,000 euros, 12-month study, commissioned by the European Commission's tourism directorate.

**Credibility tier:** HIGH on methodology and independence, but now twelve years old. Use only the trip-volume and contribution figures. Do not cite the study's projected "+44% demand if fully accessible" scenario figure; it is a modelled hypothetical and reads as exactly the kind of inflated claim you already exclude for other sources.

**Scalable:** CONTEXT-ONLY, and this is an aggregate figure in the same family as the Click-Away Pound billions already excluded from your table. Present as background market context only, never as a per-client multiplier.

**Relevance:** The only EU-institutional economic evidence base on accessible tourism that exists. Its "website and brochure analysis" task is the EU's own precedent for treating inaccessible online information as a genuine barrier, which is useful positioning language even without a precise figure to lean on.

---

## 11. VisitEngland / XV Insight, key accessibility features research (2024, UK)

**Source:** VisitEngland, facilitated by Access and Inclusion UK. https://www.visitbritain.org/research-insights/accessible-and-inclusive-tourism

**Output:** Not a statistic but a defined, research-backed list of the specific accessibility features disabled travellers actually search for when choosing places to stay, published as free downloadable questionnaires by business type, including serviced accommodation, self-catering, and food and drink businesses.

**Methodology:** Consumer research by XV Insight with 800 disabled travellers in Britain, plus a focus group in Ireland. UK and Ireland-wide project with a steering group including VisitScotland, Visit Wales, Tourism Northern Ireland, Failte Ireland, Tourism for All, Simpleview and AccessAble. An earlier 2022 wave of VisitEngland research found that most holidaymakers think in terms of concrete accessibility features rather than access for a specific named impairment type.

**Credibility tier:** HIGH. National tourism board, named research supplier, disclosed sample size, multi-agency steering group.

**Scalable:** Not a statistic, not applicable.

**Relevance:** Ready-made, authority-backed content checklist material for the
"what should actually be on your accessibility page" recommendation in SEO
and content sections, with versions already built for hotels, self-catering
properties, and food and drink businesses. The LLM must not generate advice
from this source directly. If promoted, the guidance belongs in reviewed,
deterministic remediation copy.

---

## Categories confirmed to have no citable data, after searching France, UK, Spain, Portugal, Italy and Germany

**Hospitality-specific booking abandonment rate.** No traceable primary source exists in any country checked. The circulating 80%, 81.7%, 84.63% and 89% figures all resolve to vendor blogs citing each other in a loop, structurally identical to the Web Standards Commission pattern already excluded from your table. There is no hospitality equivalent of Baymard. SiteMinder's Changing Traveller Report 2025 (52% report having abandoned a booking due to a bad digital experience, 12,000+ respondents across 14 countries, self-reported recall rather than a measured funnel rate) is the only figure with real disclosed methodology behind it, and it measures something different from a funnel abandonment rate. Use it labeled clearly as self-reported recall, context-only.

**Accessibility fix to booking or conversion percentage, in hospitality specifically.** Does not exist anywhere. No study anywhere ties a WCAG remediation to a measured booking delta on a hotel or restaurant site. Every claim of this shape found in vendor material asserts the link with no study behind it. The combination of entries 1, 3 and 4 above (avoidance behaviour, participation gap, customer-journey barriers) is the honest substitute: recommend stating this limitation directly in the report rather than inventing a multiplier, since no competitor in this space does so and it strengthens credibility with a skeptical reader.

**Google Business Profile completeness to visibility or bookings.** Universally asserted across every hospitality SEO source checked, never studied, in any country. No named methodology exists anywhere behind this claim.

**"Near me" search growth, refreshed.** Every UK and US source recycles the same unsourced vendor roundup figures (99% YoY, 875% YoY, 900% hyperlocal growth) with no disclosed denominator or absolute volume. None are usable as impact evidence. The Skift 2019 figure you already have remains, unfortunately, the most defensible one available, dated as such.

**Restaurant-specific data, across every category.** The weakest segment throughout. No reservation-abandonment research anywhere, no accessibility-to-covers research anywhere. The VisitEngland food and drink questionnaire (entry 11) is the only restaurant-specific artifact of any value, and it is a content checklist rather than a statistic. The DGE/Accesmetrie French study (entry 5) is the only source that covers restaurants with any depth, but its findings are qualitative and equipment-focused rather than digital-impact-focused.

**Spain.** Fundacion ONCE / ILUNION's Observatorio de Accesibilidad Universal al Turismo en Espana (2017 and 2020 editions) is oriented to physical accessibility of tourism resources and environments, not web or booking-flow accessibility. Discapnet's Observatorio has a travel and transport portals web accessibility study, but it dates to July 2006 and is unusable at that age. A Spanish academic study on hotel accessibility (Suria and Escalona, PASOS 2013) had only 41 participants, too small to cite.
