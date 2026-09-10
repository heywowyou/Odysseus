# Milestone 10 benchmark cohort: source evaluation and candidate list

Written 2026-09-10. Working document for the first build slice of the
milestone 10 benchmark study
(`docs/product/milestone-10-benchmark-study-design.md`, cohort definition and
schedule sections). It executes the approved defaults: the e-commerce vertical
with a fresh bounded list, about 30 sites with a hard floor of 20 scored
sites, qualification before any scan, a 15-page cap per site when scanning
happens, and one explicit operator permission record before the first request.

**No candidate site was fetched, probed, or resolved.** The only network reads
behind this document are the FEVAD publications listed in section 10 and
search-engine queries about which French e-commerce lists exist. The SIRENE
evidence in section 6 is a local read of
`data/sirene/stock-unite-legale.csv` (INSEE stock of legal units, columns
`denominationUniteLegale`, `activitePrincipaleUniteLegale`,
`trancheEffectifsUniteLegale`, `etatAdministratifUniteLegale`).

Status: source list assembled and pre-verified. Qualification and the freeze
have not run; they need the operator decision recorded in the draft permission
record (`docs/product/milestone-10-benchmark-permission-record.md`).

## 1. What the cohort has to survive

From the design and the qualification rules:

- Fixed, ordered list of domains written to the job before the first request
  (trade-off 75 discipline).
- Deterministic, recorded, rerunnable selection rule.
- Eligibility per site: reachable over HTTPS, French market, a
  vertical-identifying check passes, robots respected by the existing engine.
- The 110 incident domains stay excluded from anything cohort-shaped.
- Cheap qualification before any crawl, following
  `docs/rules/prospect-qualification.md`: Chromium never runs on an
  unqualified domain, and the cheap stage is plain HTTP on at most two URLs
  per site.

## 2. Source evaluation

Three sources are used. Each is a named, dated, public publication of the
same professional measurement ecosystem around the FEVAD (Federation du
e-commerce et de la vente a distance). Sources that were evaluated and
rejected follow.

### S1. FEVAD x Mediametrie//NetRatings quarterly audience barometer. Used, primary

- What it is: the quarterly ranking of the 20 most visited French e-commerce
  sites and applications, all sectors combined, measured by
  Mediametrie//NetRatings and published by the FEVAD every quarter since
  2005. The public communiques and the fevad.com homepage classement block
  name the leaders with exact figures; the full top 20 table is
  members-only.
- Why defensible: professional audience measurement with a stable published
  methodology, the industry reference instrument, published continuously and
  dated. A rerun of the selection rule against the same pinned publications
  is reproducible.
- Bias: audience-skewed to the largest sites; coverage of ranks outside the
  named few depends on what each communique chooses to name; it mixes
  retail, travel, classifieds, and marketplaces, so a category filter is
  applied (section 4); the homepage top 10 block rotates every quarter, so
  this document pins the figures as read on 2026-09-10.

Read for this document: the T3 2025, T4 2025, T1 2026 and T2 2026 communiques
plus the homepage top 10 block (T1 2026 figures), all read 2026-09-10. URLs in
section 10.

### S2. FEVAD Favor'i 2026, Prix des Internautes podiums. Used

- What it is: the FEVAD's annual e-commerce awards (19th edition, ceremony
  2026-02-19, co-produced with BFM Business). The Prix des Internautes is
  decided by a Harris Interactive survey of internet users; each retail
  product category has a published podium (gold, silver, bronze).
- Why defensible: organized and published by the same industry federation,
  per-category, dated, public, and rerunnable against the pinned palmares
  pages.
- Bias: award-level brands, so it over-represents popular, well-resourced
  mid-to-large sites and under-represents the long tail; survey-based
  popularity, not measurement.

Read for this document: the palmares pages for the six product categories
(mode, maison, alimentation, beaute-sante, produits techniques, produits
culturels). The hebergement (travel) and banque en ligne categories were not
taken (section 4).

### S3. FEVAD classement 2025 des sites e-commerce en nombre de clients, public sector extracts. Used

- What it is: the FEVAD's annual client-count survey (fieldwork early
  November 2025, results published early 2026, panel survey run with Toluna
  Harris Interactive). The full tables are members-only; the public page
  names the top 5 sites per product sector with penetration figures.
- Why defensible: same publisher as S1 and S2, dated, public text pins the
  named top 5 per sector, rerunnable against the pinned page.
- Bias: survey self-report rather than measurement; the public extract
  exposes only the head of each sector; sector top 5s pull in brand sites
  (Nike, Samsung, Dyson) whose French webshop entity may be a non-retail
  support company, which the qualification stage resolves from each site's
  mentions legales.

### Evaluated and rejected

- FEVAD full revenue top 100 ("classement des 100 premiers sites"): no longer
  published in full on the public site; members-only. Not rerunnable by an
  outside reader.
- FEVAD client-count full tables: members-only. Only the public sector
  extracts (S3) are usable.
- Similarweb or Semrush "top sites" lists: proprietary panels with partly
  undisclosed methodology, mixed content beyond e-commerce, rankings that
  change silently. Cannot carry a published cohort.
- Statista rankings: paywalled, derivations of other sources.
- Vendor and SEO blog lists (marketplace vendors, ecommerceguide and
  similar): no stated methodology, not dated in a stable way, commercial
  intent.
- AFNIC Fichier A (`opendata.afnic.fr`, Licence Ouverte): fully defensible
  registry data, but it carries no sector, no SIREN, and no vertical signal,
  so a bounded selection inside 4.2 million domains would be arbitrary
  before qualification and the qualification yield would be unknown. It
  remains the repo's qualification substrate for prospecting
  (`docs/rules/prospect-qualification.md` section 2) but is rejected as the
  selection source for a bounded benchmark cohort.
- SIRENE stock alone: no website field; registry-first selection was
  evaluated and rejected by `docs/rules/prospect-qualification.md` section 1.
  Used here only as local pre-verification evidence (section 6).
- Press reproductions of the barometer (LSA, La Revue du Digital): used only
  to corroborate ceremony dates and mover facts; not used as a list source,
  because the FEVAD's own pages carry the same names.

## 3. Selection rule

Deterministic, recorded, rerunnable against the pinned publications:

1. Pool A: every distinct site named as inside, entering, or moving within
   the top 20 of the FEVAD x Mediametrie//NetRatings barometer in the T3
   2025, T4 2025, T1 2026 and T2 2026 public communiques, plus the fevad.com
   homepage top 10 block as read 2026-09-10.
2. Pool B: the three podium sites of each Prix des Internautes category of
   the Favor'i 2026 in the six retail product categories (hebergement and
   banque en ligne excluded).
3. Pool C: the named top 5 of each product sector in the public text of the
   FEVAD classement 2025 by client count (e-tourisme, banque, and streaming
   sectors excluded).
4. Deduplicate by brand, keeping the first occurrence in the order
   A (audience order, figures pinned), then B (category order, then podium
   order), then C (sector order in the page's own sequence, then named rank
   order).
5. Apply the category exclusions in section 4.
6. Order the remainder: A entries by best measured audience rank, then B
   entries in published category and podium order, then C entries in
   published sector and rank order. Number the result; that number is the
   candidate order used everywhere, including the permission record.

The result is 46 named candidates (section 5). Reserves: names that appear in
the S3 public page outside the top 5 rule are listed in section 7 and are
used only if the frozen list would otherwise fall below the floor, without
new sourcing.

## 4. Category exclusions

The study vertical is consumer retail with an online checkout, the same
vertical the qualification rules call unambiguous electronic commerce
(`docs/rules/prospect-qualification.md` section 4). Applied exclusions:

- Travel and accommodation booking: booking.com, airbnb.fr. A booking flow
  is legally on comparable footing for outreach, but it is not consumer
  retail, and the study page is titled as an e-commerce study. Mixed
  coverage would blur the cohort claim.
- Classifieds: leboncoin.fr. An advertising and classifieds platform, not a
  retail checkout site.
- Restaurant meal delivery and food-waste marketplaces: Uber Eats and
  Too Good To Go are named in S3's alimentation sector but fall under the
  deliberately disabled restaurant reading
  (`packages/core/src/prospecting/config/naf-sector-allowlist.json`, 56.10A
  entry). Not taken.
- Banking and streaming: S2's banque en ligne category and S3's streaming
  sector are not retail. Not taken.

Kept deliberately, decided by qualification rather than by hand-waving:
Vinted (C2C goods marketplace with checkout) and Etsy (marketplace of
independent sellers with checkout). Section 6 records their expected
qualification verdicts.

## 5. The ordered candidate list, 46 names

Order per section 3 rule 6. Figures are unique visitors per month as
published. "Mover" means the communiqué names the site as gaining or holding
a top 20 position without printing its figure.

| # | Candidate site | Brand | Source attribution | Evidence noted |
| --- | --- | --- | --- | --- |
| 1 | amazon.fr | Amazon | S1 homepage top 10 #1, 40,706,000 (T1 2026); S1 T2 2026 #1, 41,200,000 | also S3 top 5 in nine sectors |
| 2 | leboncoin.fr | Leboncoin | S1 homepage top 10 #2, 31,149,000; S1 T2 2026 #2, 32,100,000 | excluded: classifieds |
| 3 | temu.com | Temu | S1 homepage top 10 #3, 24,406,000; S1 T2 2026 #4, 21,300,000 | S3 bricolage #5 |
| 4 | booking.com | Booking.com | S1 homepage top 10 #4, 20,126,000; S1 T2 2026 #3, 22,500,000 | excluded: travel |
| 5 | e.leclerc | E.Leclerc | S1 homepage top 10 #5, 20,061,000 | S1 T3 2025 top 5; S3 sectors |
| 6 | vinted.fr | Vinted | S1 homepage top 10 #6, 19,842,000; S1 T2 2026 #5, 20,100,000 | S3 top 5 in four sectors |
| 7 | carrefour.fr | Carrefour | S1 homepage top 10 #7, 19,236,000 | S1 T4 2025 top 10; S3 alimentation #3 |
| 8 | lidl.fr | Lidl | S1 homepage top 10 #8, 18,071,000 | S1 T3 2025 and T2 2026 mobile mentions |
| 9 | cdiscount.com | Cdiscount | S1 homepage top 10 #9, 16,843,000 | S3 electronique #3 |
| 10 | fr.aliexpress.com | AliExpress | S1 homepage top 10 #10, 15,884,000; S1 T2 2026 #11, 15,100,000 | mover |
| 11 | fnac.com | Fnac | S1 T4 2025 #7, 19,500,000 | S3 top 5 in three sectors |
| 12 | shein.fr | Shein | S1 T2 2026 #9, 15,500,000 (from #12) | S1 T4 2025 #8, T3 2025 #6; S3 mode #3 |
| 13 | boulanger.com | Boulanger | S1 T4 2025 communiqué (top 20 progression) | S3 electronique #2, 15.9 percent |
| 14 | darty.com | Darty | S1 T3 2025 #18 (return to top 20) | S3 electronique #5 |
| 15 | leroymerlin.fr | Leroy Merlin | S1 T1 2026 and T2 2026 (desktop share mentions, top 20) | S3 meuble #4, bricolage #2 |
| 16 | airbnb.fr | Airbnb | S1 T1 2026 and T2 2026 communiqués (mover, +3 places then +1,600,000 visitors) | excluded: travel |
| 17 | veepee.fr | Veepee | S1 T2 2025 #18, movers in T1 2026 and T2 2026 (+3 places) | |
| 18 | intermarche.com | Intermarche | S1 T2 2026 #17 (from #19) | S1 T2 2025 #20; S3 alimentation #5 |
| 19 | fr.shopping.rakuten.com | Rakuten | S1 T1 2026 communiqué (mover, +2 places) | |
| 20 | manomano.fr | ManoMano | S1 T2 2026 #19 (return to top 20) | |
| 21 | undiz.com | Undiz | S2 mode gold | site of the year podium context |
| 22 | damart.fr | Damart | S2 mode silver | |
| 23 | decathlon.fr | Decathlon | S2 mode bronze | S3 mode #4, sport #1, 32.3 percent |
| 24 | ikea.com (fr) | IKEA | S2 maison gold | S3 meuble #2, 17.3 percent |
| 25 | becquet.fr | Becquet | S2 maison silver | |
| 26 | etsy.com (fr) | Etsy | S2 maison bronze | |
| 27 | nespresso.com (fr) | Nespresso | S2 alimentation gold | |
| 28 | picard.fr | Picard | S2 alimentation silver | |
| 29 | yvesrocher.fr | Yves Rocher | S2 beaute-sante gold; S2 grand prix bronze | S3 beaute #3, 20.2 percent |
| 30 | adopt.com (fr) | Adopt | S2 beaute-sante silver | |
| 31 | rituals.com (fr) | Rituals | S2 beaute-sante bronze | |
| 32 | dyson.fr | Dyson | S2 produits techniques gold; S2 grand prix silver | |
| 33 | bosch-home.fr | Bosch Home | S2 produits techniques silver | |
| 34 | samsung.com (fr) | Samsung | S2 produits techniques bronze | |
| 35 | vertbaudet.fr | Vertbaudet | S2 produits culturels gold; S2 grand prix gold (site of the year, 16.53 of 20) | |
| 36 | cultura.com | Cultura | S2 produits culturels bronze | S3 culturels #3 |
| 37 | zalando.fr | Zalando | S3 mode #5 | |
| 38 | king-jouet.com | King Jouet | S3 jeux et jouets #4, 14.8 percent | |
| 39 | intersport.fr | Intersport | S3 sport #3, 18.7 percent | |
| 40 | nike.com (fr) | Nike | S3 sport #4, 18.5 percent | S3 mode mover |
| 41 | sephora.fr | Sephora | S3 beaute #2, 22.9 percent | |
| 42 | nocibe.fr | Nocibe | S3 beaute #4 | |
| 43 | aroma-zone.com | Aroma-Zone | S3 beaute #5, 12.9 percent | S2 2025 site of the year (prior edition, context only) |
| 44 | conforama.fr | Conforama | S3 meuble #5, 11.2 percent | |
| 45 | castorama.fr | Castorama | S3 bricolage #3, 11.6 percent | |
| 46 | bricodepot.fr | Brico Depot | S3 bricolage #4, 10.8 percent | |

Sites marked "(fr)" are the French storefront of an international site; the
exact host is pinned at freeze time and recorded before the first request.

## 6. Local SIRENE pre-join, evidence and expected verdicts

Method: one case-insensitive scan of `data/sirene/stock-unite-legale.csv`
(INSEE stock of legal units, read 2026-09-10, latest traitement timestamps in
the file 2026-09-05) for brand denominations, then a filter to administratively
active units with a populated headcount band of 10 salaried persons or more.
Headcount bands are INSEE `trancheEffectifs` codes: 11 is 10 to 19, 12 is 20
to 49, 21 is 50 to 99, 22 is 100 to 199, 31 is 200 to 249, 32 is 250 to 499,
41 is 500 to 999, 42 is 1000 to 1999, 51 is 2000 to 4999, 52 is 5000 to 9999,
53 is 10000 and more.

This is a recall filter, not the qualification join. It cannot prove which
entity operates which domain; that comes from the SIREN published in each
site's mentions legales at qualification. Verdicts below are expectations,
not conclusions.

| Brand | Example active entity found (denomination, SIREN) | NAF | Band | Verdict vs current sector set (47.91A or B) | Verdict vs division 47 extension |
| --- | --- | --- | --- | --- | --- |
| Amazon | AMAZON EU SARL, 487773327 | 47.91A | 41 | pass | pass |
| Carrefour | CARREFOUR DRIVE, 519514574 | 47.91A | 12 | weak: a drive entity matches, the carrefour.fr operator needs confirmation | pass |
| E.Leclerc | DISTRIFIOUL NORMANDIE (independent member), 484310180 | 47.91B | 12 | weak: a member entity matches, the cooperative's own entity needs confirmation | pass |
| Cdiscount | CDISCOUNT, 424059822 | 47.91A | 41 | pass | pass |
| Veepee | VENTE PRIVEE.COM, 434317293 (denomination predates the rename) | 47.91A | 42 | pass | pass |
| Fnac | FNAC DARTY (holding), 055800296, 70.10Z, band 11; no clean retail-NAF entity surfaced | 70.10Z | 11 | unknown | unknown |
| Boulanger | BOULANGER, 347384570 | 47.54Z | 52 | fail | pass |
| Darty | DARTY, 303376586 | 47.54Z | 51 | fail | pass |
| Leroy Merlin | LEROY MERLIN FRANCE, 384560942 | 47.52B | 53 | fail | pass |
| Lidl | LIDL, 343262622 | 47.11D | 53 | fail | pass |
| Intermarche | ITM DIGITAL, 300286853, 47.91A, band empty; member stores 47.11F | 47.91A | empty | headcount band empty, fails the band test on this stock | same headcount issue |
| Rakuten | RAKUTEN FRANCE, 432647584 | 47.91A | 32 | pass | pass |
| ManoMano | no denomination match and no row under the checked SIREN | n/a | n/a | unknown | unknown |
| Temu | WHALECO FRANCE, 930657887 | 70.22Z | empty | fail | fail |
| Shein | no SHEIN-named French operating entity; two foreign SHEIN entities hold French SIRENs with 47.91A and empty bands | 47.91A | empty | fail on band today | fail on band today |
| Vinted | VINTED, SASU, 921456380 | 70.22Z | 11 | fail | fail |
| AliExpress | ALIBABA FRANCE, 812604106 | 70.22Z | 12 | fail | fail |
| Zalando | ZALANDO SE (France), 533522710 | 47.91B | empty | passes NAF, fails the empty band | same headcount issue |
| Etsy | ETSY FRANCE, 510843006, 62.01Z, band 00; ETSY IRELAND UC, 63.11Z | 62.01Z | 00 | fail | fail |
| Undiz | UNDIZ, 478356116 | 47.71Z | 41 | fail | pass |
| Damart | DAMART, 333202083 | 47.91B | 41 | pass | pass |
| Decathlon | DECATHLON FRANCE, 500569405 | 47.64Z | 53 | fail | pass |
| IKEA | MEUBLES IKEA FRANCE, 351745724 | 47.59A | 53 | fail | pass |
| Becquet | BECQUET, 466500683 | 47.91B | 22 | pass | pass |
| Nespresso | NESPRESSO FRANCE, 382597821 | 47.91B | 42 | pass | pass |
| Picard | PICARD SURGELES, 784939688 | 47.11A | 52 | fail | pass |
| Yves Rocher | LABORATOIRES DE BIOLOGIE VEGETALE YVES ROCHER, 876580077 | 47.75Z | 42 | fail | pass |
| Adopt | ADOPT PARFUMS, 351837406 | 47.75Z | 41 | fail | pass |
| Rituals | RITUALS COSMETICS FRANCE, 804544674 | 47.75Z | 42 | fail | pass |
| Dyson | DYSON, 410191589 | 46.43Z | 22 | fail | fail |
| Bosch Home | ROBERT BOSCH FRANCE, 572067684 | 29.32Z | 51 | fail | fail |
| Samsung | SAMSUNG ELECTRONICS FRANCE, 334367497 | 46.52Z | 41 | fail | fail |
| Vertbaudet | VERTBAUDET, 397555327 | 47.91B | 41 | pass | pass |
| Cultura | 877948901, 47.61Z, band 12 | 47.61Z | 12 | fail | pass |
| King Jouet | KING JOUET, 347926719 | 47.65Z | 42 | fail | pass |
| Intersport | KINGSPORT (Intersport store entity), 352401913 | 47.64Z | 21 | fail | pass, national entity to confirm |
| Nike | NIKE RETAIL BV (French registration), 405395518 | 47.64Z | 42 | fail | pass |
| Sephora | SEPHORA, 393712286 | 47.75Z | 52 | fail | pass |
| Nocibe | GROUPE NOCIBE, 451489017 | 47.75Z | 51 | fail | pass |
| Aroma-Zone | AROMA-ZONE STORE (store entity), 813023843 | 47.78C | 22 | fail | pass, online operator to confirm |
| Conforama | CONFORAMA FRANCE, 414819409 | 47.59A | 52 | fail | pass |
| Castorama | CASTORAMA FRANCE, 451678973 | 47.52B | 53 | fail | pass |
| Brico Depot | BRICO DEPOT, 451647903 | 47.52B | 52 | fail | pass |

Counts over the 43 retail candidates (46 minus the three category
exclusions):

- Under the current sector set (47.91A or B plus headcount band 10 plus):
  8 clean passes (Amazon, Cdiscount, Veepee, Rakuten, Damart, Becquet,
  Vertbaudet, Nespresso) and 2 weak ones (Carrefour, E.Leclerc, both via
  entities that may not be the site operator). Roughly 8 to 10. Far below
  the floor of 20 scored sites.
- Under a benchmark-scoped extension of the sector set to division 47
  (retail): 31 of the 43 (the 10 above plus 21 division 47 passes) before
  qualification losses. Meets the 30 target with the 20 floor safe.
- Not saved by either option (platform or brand-support NAFs, or empty
  headcount bands): Temu, Shein, Vinted, AliExpress, Etsy, Zalando, Dyson,
  Samsung, Bosch Home, Intermarche, plus unknowns Fnac and ManoMano. The
  qualification stage decides them from each site's published SIREN.

## 7. Reserves, named in the same sources, not in the top 5 rule

Used only if the frozen list would otherwise fall below 30, in this order,
without new sourcing. Each is named in the S3 public page outside its sector
top 5: kiabi.com (mode mover), zara.com fr storefront (mode mover),
etam.com (lingerie joint lead), apple.com fr storefront (electronics, 15 to
24 sub-universe top 5), gifi.fr (meuble mover), jd-sports.fr (sport top 10
entrant), momox.fr (culturels, 65 plus sub-universe #4), auchan.fr
(bricolage, 15 to 24 sub-universe mention). Same category exclusions apply.
No local SIRENE pre-join has been run for reserves.

## 8. The sector-set decision this evidence forces

`packages/core/src/prospecting/config/naf-sector-allowlist.json` enables
47.91A and 47.91B for e-commerce and is explicit that the operator reviews
and extends the list before enabling more. The file also states the code list
is a recall filter for Sirene stock rows, never a qualification verdict by
itself.

For the benchmark the current set cannot carry the cohort: 8 to 10 expected
passes against a floor of 20. The permission record therefore carries this as
an operator decision with two options:

- Option A, keep the current sector set: the cohort becomes the pure
  distance sellers that pass, honestly labeled, but lands far below the
  design's target and risks the floor. Not recommended.
- Option B, record a benchmark-scoped extension of the sector set to the
  retail division 47 classes for qualification of this cohort only: expected
  yield 31 before qualification losses, target met. The rationale to record:
  the benchmark scans and never contacts anyone, so the filter's original
  outreach-purpose protections are untouched, and the vertical itself is
  still confirmed by the scan stage's checkout detection on top of the NAF
  evidence.

Recommended: Option B, recorded in the permission record with its rationale,
leaving the outreach sector set untouched.

## 9. Exclusions honored and what happens next

- The 10 plan 014 pilot domains (hotel domains) appear nowhere in this list.
  The 110 incident domains are hotel-catalogue domains; an e-commerce retail
  list cannot overlap them, and the recorded exclusion stands regardless of
  that.
- Next stage, only after the operator approves the permission record: the
  cheap qualification stage (plain HTTP homepage plus mentions legales per
  candidate, bot user agent, robots respected, two requests at most per
  site), the SIREN extraction, the local Sirene join, the suppression list
  check, then the freeze of the fixed ordered list, recorded in the
  permission record before the first scan request. Qualification drops
  replace nothing silently: if the frozen list falls below the target, the
  reserves in section 7 are the only sanctioned additions.
- Scan stage (separate slice): existing audit pipeline, 15-page cap passed
  explicitly on every invocation, checkpoints per completed site, dry-run
  mode printing the exact cohort, on or after 2026-09-15, never concurrent
  with pilot scanning.

## 10. Limits and sources

Limits of this cohort: audience-weighted to the largest French sites, so the
study's percentile claim is a claim against France's most visited e-commerce
sites, not against the long tail; marketplace leaders declare support-office
NAF codes in France, so a strict sector filter would silently remove exactly
the fastest-growing platforms, which is the force behind section 8; the
SIRENE stock is a snapshot, so headcount bands move.

Sources, all read 2026-09-10:

- FEVAD homepage classement block, T1 2026 top 10 figures:
  https://www.fevad.com/
- Barometre communiques: T3 2025
  https://www.fevad.com/barometre-de-laudience-du-e-commerce-3e-trimestre-2025/ ;
  T4 2025 (published 2026-03-24)
  https://www.fevad.com/barometre-de-laudience-du-e-commerce-4e-trimestre-2025/ ;
  T1 2026
  https://www.fevad.com/barometre-de-laudience-du-e-commerce-au-1er-trimestre-2026/ ;
  T2 2026 (published 2026-09-01)
  https://www.fevad.com/barometre-de-laudience-du-e-commerce-au-2eme-trimestre-2026/
- Barometre index and methodology (Mediametrie//NetRatings x FEVAD, quarterly
  since 2005):
  https://www.fevad.com/barometre-de-laudience-sites-e-commerce-francais/
- Favor'i 2026 Prix des Internautes palmares and category pages:
  https://favori.fevad.com/prix-internautes/ and the per-category pages it
  links (categorie-mode, equipement-de-la-maison,
  categorie-alimentation-et-produits-grande-consommation, beaute-sante,
  categorie-produits-techniques-et-electromenager, produits-culturels)
- Favor'i 2026 ceremony date corroboration:
  https://fr.fashionnetwork.com/news/Les-sites-vertbaudet-undiz-et-yves-rocher-recompenses-lors-des-favor-i-2026,1809295.html
- FEVAD classement 2025 by client count, public sector extracts (fieldwork
  early November 2025):
  https://www.fevad.com/classement-fevad-2025-des-sites-e-commerce-en-nombre-de-clients/
- Local: data/sirene/stock-unite-legale.csv (INSEE), read 2026-09-10;
  packages/core/src/prospecting/config/naf-sector-allowlist.json.
