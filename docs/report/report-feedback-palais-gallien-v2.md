# Report feedback: Le Palais Gallien Hôtel & Spa (FR, full tier, 2026-08-17)

Client-perspective pass on `2026-08-18T15-12-33Z-fr.pdf`, 37 pages, 98 findings.
Reading posture: hotel owner or GM, non-technical, paid EUR 1 600 HT, will forward
the PDF to their web agency and possibly to a lawyer.

Arithmetic checks out: 6 + 1 + 0 + 91 = 98 severity total, 72 + 22 + 3 + 1 + 0 = 98
category total, and the annex rule groups sum to 98. Accessibility occurrences
(10 + 9 + 157 = 176) match the stats tile. No internal counting bug found.

---

## P0: blocks sending this file to a client

### 0.1 Page 7 renders blank

The "Check-list des priorités" page shows nothing but three faint horizontal rules.
The text layer is present (the table content extracts fine), so the content is
rendered with a colour that matches the page background. Most likely cause: this
section was styled as a light-background "printable" panel and lost its background
fill when the print stylesheet was removed, leaving dark ink on the dark page.

This is the single page the report explicitly tells the client to print or screenshot
on its own. It is also listed in the TOC. A client who prints page 7 gets an empty
sheet.

### 0.2 English debug text inside the French legal section

Page 3, legal exposure:

> Le parcours transactionnel identifié est délégué à un prestataire tiers
> (https://www.planity.com/... → https://www.planity.com/...: Destination page shares
> the distinctive term "palais" with the origin page and shows no multi-property
> search UI.)

Three separate defects in one parenthetical:
1. Raw English heuristic reasoning leaking into a French client deliverable.
2. The same URL printed twice with an arrow between them, which exposes the redirect
   resolution internals.
3. It sits in the most legally sensitive paragraph of the whole report.

This alone would end a sale. It reads as unfinished software.

### 0.3 Literal `?` placeholders in "Preuve de rendu"

Page 8: "HTML brut - ? caractères" and "Page rendue - ? caractères", with two bars
drawn underneath at near-identical widths while the caption claims 13 percent
missing. The strings file has a dedicated
`visibleTextCountsNotAvailable` fallback for exactly this case and it is not being
used. Either wire the fallback or suppress the bar pair when counts are unmeasured.
Drawing bars from unknown data is worse than drawing nothing.

### 0.4 Wrapped URLs and selectors are wrong when copied

Every long URL in the annex breaks mid-token without a visible break marker:

- `https://www.hotel-palais-gallienbordeaux.com/...` (hyphen swallowed by the break)
- `div#w-node-ed0608f8-...` becomes `wnode-ed0608f8`
- `div.c-chamber_equipement` becomes `cchamber_equipement`
- `div.c-icon_size` becomes `cicon_size`
- `div.calendar-modal-js` becomes `calendarmodal-js`

`word-break: break-all` on `.url` and `.sel` is producing this. A developer copying
a selector out of the annex gets an invalid selector, and a client copying a URL gets
a non-existent domain. The annex is 25 of 37 pages and this affects nearly every row
in it.

Fix direction: `overflow-wrap: anywhere` with `hyphens: none`, or insert
zero-width breaks after `/`, `-` and `_` at render time, or drop the full URL lists
entirely (see 3.1).

### 0.5 Plural agreement bug on the cover

"Basé sur 6 constats critiques et **1 constats sérieux**". First page, largest
credibility cost per character in the document. The singular/plural branch is missing
on the second half of that template.

### 0.6 "outil version 0.1.0" printed in the footer

Page 37. Never show a paying client a 0.x version number. It says "you are running my
pre-release software". Replace with a build hash, a date, or nothing.

### 0.7 The legal argument contradicts itself within four sentences

Page 3 says, as the basis for the confirmed obligation:

> Le site propose un parcours de réservation directement en ligne.

Then immediately:

> Le parcours transactionnel identifié est délégué à un prestataire tiers [...].
> Ce domaine n'a pas été exploré dans le cadre de cet audit.

A client, or worse their lawyer, reads: you asserted a confirmed obligation on the
basis of an online booking path, then said the booking path is somewhere you did not
look. That is the crux of the entire legal section and it is self-undermining.

The site evidence suggests two distinct journeys: an on-site room booking widget
(`div#calendar-modal`, `div.calendar-hotel-section`, `div.datepicker`, present on all
20 pages) and an off-site spa booking on Planity. The report conflates them.
Distinguish them explicitly: the obligation basis is the on-site room booking widget;
the Planity spa flow is a separate, out-of-scope third-party journey.

---

## P1: credibility with a technical or skeptical reader

### 1.1 Duplicate Lighthouse audits inflate the findings count

Legacy audits and the newer "insight" audits are both firing and both counted:

| Legacy | Insight twin | Same pages | Same description |
|---|---|---|---|
| `font-display` (f008) | `font-display-insight` (f019) | 20 | identical string |
| `render-blocking-resources` (f045) | `render-blocking-insight` (f083) | 20 | identical string |
| `uses-long-cache-ttl` (f024) | `cache-insight` (f093) | 20 | near identical |
| `largest-contentful-paint` (f004) | `largest-contentful-paint-element` (f082) | 20 | related |
| `uses-optimized-images` (f075) | `image-delivery-insight` (f097) | 1 vs 18 | overlapping |

That is roughly 5 findings and 98 occurrences of pure duplication in a 98-finding
report. Any agency reading the annex will spot the identical description strings
sitting two pages apart. Deduplicate at the normalizer, keep one of each pair.

### 1.2 Deprecated metrics in a 2026 report

`max-potential-fid` (FID was replaced by INP in March 2024) and `interactive` (TTI,
removed from the Lighthouse report UI) both appear as findings, while INP appears
nowhere. A technical reader dates the tooling immediately.

### 1.3 Seven separate rule groups all say "your images are heavy"

`unsized-images`, `modern-image-formats`, `offscreen-images`, `uses-responsive-images`,
`uses-optimized-images`, `image-delivery-insight`, `prioritize-lcp-image`. Combined:
around 60 findings and 550 occurrences, all one remediation job. To the client this is
seven problems. It is one. Group them under a single annex theme.

### 1.4 The priority ranking contradicts its own stated rule

The heading says "3 chantiers, classés par effort et par impact" and the summary note
says priority 1 was ranked first "sur la base de son rapport effort/impact". But:

| Rank | Effort | Impact | Badge |
|---|---|---|---|
| 1 | Élevé | Élevé | none |
| 2 | Moyen | Élevé | none |
| 3 | Faible | Élevé | **Gain rapide** |

By the stated rule, rank 3 should be rank 1. The "PAR OÙ COMMENCER" box therefore
tells the client to start with the most expensive item and finish with the quick win.
Either fix the sort, or stop claiming the sort is effort/impact based.

### 1.5 The Legal & General benchmark breaks the sector-matched benchmark rule

Priority 2 cites a doubled quote volume, 100 percent ROI in 12 months, GBP 200 000
annual savings, 75 percent faster pages, attributed to "W3C Web Accessibility
Initiative, étude de cas documentée". Problems, in order of severity:

- No date. It is the only benchmark in the report without one, and the underlying
  case study is from the early 2000s.
- Wrong sector. UK insurance, shown to a French hotel. The reference layer rule is
  sector-matched benchmarks only.
- Wrong currency for the audience (GBP).
- The numbers are implausibly good, which makes them read as marketing rather than
  evidence.

Drop it. If nothing sector-matched exists for accessibility-to-conversion in
hospitality, run priority 2 with no benchmark, which the rule already allows.

### 1.6 The Deloitte disclaimer draws attention to the mismatch it is trying to fix

> Une amélioration de 0,1 seconde [...] hausse de 10,1 % des conversions [...]
> Écart mesuré sur ce site : LCP médian à 5,9 s [...] à ne pas confondre avec les
> 0,1 s de la statistique ci-dessus.

Honest, but the client reads a warning against your own number. Also, a 2020 study in
a 2026 report. Reframe so the confusion cannot arise in the first place: state the
site's gap first, then the benchmark, and drop the "à ne pas confondre" line.

### 1.7 The severity model does not survive contact with the glossary

The glossary defines Critique as "bloque une tâche essentielle pour une partie des
utilisateurs". Four of the six criticals are `total-blocking-time`,
`first-contentful-paint`, `largest-contentful-paint` and `speed-index`. A 5,9 s LCP
does not block a task. Consequences visible to the client:

- The "20/20 pages avec au moins un constat critique" tile is mechanically true and
  reads as alarmist.
- The cover risk badge "Élevé" is driven by four Lighthouse threshold breaches, in a
  report where 91 of 98 findings are minor.

Either cap Lighthouse metric findings at Sérieux, or rewrite the Critique definition
to cover measured performance thresholds.

### 1.8 "176 occurrences d'accessibilité" is 89 percent heuristic

157 of the 176 come from `alt-text-quality-heuristic`, which the report itself says
is not a conformance test. The tile carries no such caveat, sits next to three hard
counts, and is the number a client will quote. Either exclude heuristic signals from
the tile or split it into two figures.

### 1.9 "Signaux à vérifier" looks identical to the failures table

Page 8. Same table styling, same column headers, same WCAG criterion column, sitting
directly under the real failures table. The caveat paragraph above it is grey 8.5pt
prose that nobody reads. Nineteen findings on 20 pages presented that way will be
treated as 19 more WCAG failures by the client's agency. Differentiate visually:
remove the WCAG column, change the table treatment, or move the whole block to the
annex.

### 1.10 The extended accessibility pass is claimed but never evidenced

Methodology, page 9:

> Cet audit inclut une passe d'accessibilité étendue couvrant la navigation au
> clavier, l'ordre de focus, la gestion des erreurs de formulaire, la présence de
> sous-titres vidéo [...]

Zero findings from keyboard traps, focus order, form error handling or video captions
appear anywhere in the 37 pages. The client cannot tell whether those checks passed
or never ran. The strings file already has `extendedPassNoneFoundNote` for this. In
the full tier it is not being rendered. A clean result is a selling point and it is
currently invisible.

### 1.11 Two different page counts for the same fact

- Section 3: "2 critères WCAG 2.2 AA en échec sur 10 pages"
- Section 6: criterion 1.3.1, colonne "Pages (max)": 9

Both are defensible (union of pages is 10, largest single finding is 9) but the client
sees two numbers for one thing. Also "Pages (max)" is undefined jargon and understates
reach. Use "pages concernées" with the union count, consistently.

### 1.12 "Rendu: 0 constat" versus "13 % du texte manquant"

The stats card footnote already tries to explain this away, and the explanation makes
it worse: you are telling the client a real gap was measured but you decided not to
count it. State the threshold numerically ("seuil de déclenchement : 20 %") or remove
the empty category from the chart and keep only the section 7 measurement.

### 1.13 Single Lighthouse run

"passage unique" is honest and correct to disclose, but it invites "so these numbers
might be noise". Three runs with a median would remove the objection and costs one
sentence of copy instead of a caveat.

### 1.14 Unverifiable citations in the legal and GEO sections

- Two 2026 référé decisions (Lille 5 May, Caen 4 June) with no docket numbers.
- Phocuswright "The AI Surge, 2026" with no locator.

For a document that will be handed to a lawyer, court decisions need references.
Add case numbers or state plainly that these are reported decisions without published
references.

### 1.15 No visual evidence anywhere

Thirty-seven pages, 98 findings, zero screenshots. For contrast failures in
particular, a cropped screenshot of `.c-chamber_span` on a room page would be worth
more than the entire annex to a hotel owner. The `renderDiffEvidence` strings already
reference raw versus rendered screenshots. Currently the client has to take every
finding on faith.

---

## P2: layout and pagination

### 2.1 Orphaned section headers at page bottoms, systematically

- p4 bottom: "04 · PRIORITÉS / 3 chantiers, classés par effort et par impact", content
  starts p5
- p8: "07 · PREUVE DE RENDU" lands immediately under the "Signaux à vérifier" table
- p9: "09 · MÉTHODOLOGIE ET LIMITES" lands immediately under the performance table
- p13 bottom: "Référencement (SEO)" heading, content starts p14
- p14 bottom: "Performance" heading, content starts p15
- p36 bottom: "12 · SUITE", content starts p37

`h2, h3 { break-after: avoid }` is in the print block but the eyebrow `span` is a
separate element and the section wrapper is not marked `.keep`. Every major section
should either start on a new page or carry its first paragraph with it.

### 2.2 The performance table splits without repeating its header

LCP row on p8, the other four rows on p9. A reader landing on p9 sees
"560 ms / ≤ 200 ms / à améliorer" with no column labels. `thead { display:
table-header-group }` is present in the CSS, so either this table is not using
`<thead>` or the rule is not reaching it.

### 2.3 Large dead space

- p6: priority 3 card ends at one third of the page, two thirds empty
- p21: one annex row then three quarters empty
- p37: content ends at one third

Not fatal, but in a 37-page document the client counts pages. Tightening this
plausibly removes 3 to 4 pages.

### 2.4 "SÉLECTEUR TYPE" is a merged header with an empty column

Every annex table has this header, and the "TYPE" column is empty in all 98 rows.
Also many rows have no selector at all (all Lighthouse page-level findings, plus
f037, f091, f098), so the column header promises content that is absent on a majority
of rows.

### 2.5 Priority card metadata wraps inconsistently

Card 1: Effort, Impact, Pages, Conformité all on one line. Cards 2 and 3: the line
breaks and pushes Conformité and Constats to a second line. Fix the widths so all
three cards break the same way, or force a two-line grid on all of them.

### 2.6 Page 37 cards are misaligned

"Vérification post-correctifs" wraps to two lines while the other two titles are one
line, so the three card bodies start at different heights and the title hyphenates
across the break. Set a min-height on the card title or shorten it to "Vérification
après correction".

### 2.7 Checklist column "STATUT / DATE" has one stray `-`

Row 1 contains `-`, rows 2 and 3 are empty. Either fill all three or none. Given the
decision to remove blank writable cells, this column probably should not exist at all.

---

## P3: content and client experience

### 3.1 The annex reprints the same 20 URLs about 25 times

Roughly 18 of the 37 pages are repeated URL lists. Every finding that hits all 20
pages prints the full list again. Replace with "Toutes les pages analysées (20)" when
`pages === totalPages`, and cap the list at 5 URLs plus "et N autres" otherwise. This
alone probably removes 8 to 10 pages from the document and makes the annex readable.

### 3.2 91 of 98 findings receive no guidance at all

The priorities section covers f001 to f007. The other 91 appear only as annex rows.
For EUR 1 600 the client will ask what to do about the rest. A short "reste à traiter,
groupé par thème" block, with the fixed recommendation templates already in
`packages/reference`, would close this without adding LLM risk.

### 3.3 Finding IDs are dead references

"Constats : f002, f003, f004, f006" with no page number and no link. The client has to
scan 25 annex pages to find f006. Add the annex page number next to each ID, or make
them internal PDF links.

### 3.4 The "Voir priorité N" links repeat the title verbatim

The summary box shows the priority title on the left and, on the right, a link whose
text is the same title again, wrapping across the row. Replace with a short "Voir
priorité 1" or a page number.

### 3.5 The glossary arrives on page 35

Terms the client needs on page 3 (constat, occurrence, critique, LCP, GEO, parcours
transactionnel) are defined 32 pages later, after the annex. Add a forward pointer in
section 1, or move a 6-term mini-glossary to page 3 and keep the full one at the back.

Missing glossary entries for terms actually used: "Sans objet", "Recherche émergente",
"Signaux à vérifier", "Pages (max)", "Rendu", "Sirene", "Effort", "Impact commercial".

### 3.6 Vocabulary drift

- "problèmes" (summary) versus "constats" (everywhere else) versus "écarts"
  (section 6). The glossary defines "constat". Pick it and use it.
- "20 pages scannées" (cover), "20 pages analysées" (stats), "20 pages explorées"
  (methodology).
- "20/20" (checklist) versus "20 pages sur 20" (priority cards).
- The category order differs between the stats chart (Performance, Accessibilité, SEO,
  GEO) and the annex (Accessibilité, SEO, Performance, GEO).

### 3.7 The recommendations assume the client employs developers

> Former les développeurs aux bonnes pratiques ARIA
> Tester les composants interactifs avec des outils de lecture d'écran

This is a hotel. There are no developers, and nobody there owns a screen reader. Also,
the second line asks the client to perform exactly the manual testing the methodology
says is out of scope. Rewrite the templates to address "votre agence ou votre
prestataire technique".

### 3.8 The cover understates the scope you are selling

"RÉFÉRENTIEL AUDITÉ : WCAG 2.2 AA", yet 76 of 98 findings are performance, SEO and
GEO. A client reading the cover expects an accessibility audit and gets four
categories. Say so on the cover.

### 3.9 The cover prints the client's name three times

H1, "Dénomination sociale", and "Préparé pour". Keep the H1 and the legal denomination,
drop "Préparé pour" or use it for a contact name.

### 3.10 No remediation cost, no effort in days, no page-value weighting

The client's first question after "what is broken" is "what will this cost me". Effort
Faible/Moyen/Élevé does not answer it. Second: all 20 pages are weighted equally, so
`/mentions-legales` counts the same as the room pages and the booking widget. For a
hotel, the booking funnel is the only page group that matters commercially. Consider
flagging booking-path pages explicitly.

### 3.11 The crawl limit is never explained

"20 pages" appears everywhere with no statement that this is a configured cap and not
the whole site. The client may reasonably believe the whole site was covered. One
sentence in methodology fixes it.

### 3.12 "Prochaines étapes" has no price, no delay, no way to order

Ré-audits and post-fix verification are described and then left hanging. No cost, no
lead time, no "répondez à cet email". This is the one page in the report with
commercial upside and it currently converts nothing.

### 3.13 No issuer identity

For a EUR 1 600 HT French deliverable there is no SIRET, no legal entity, no named
signatory. Only a generic contact email. Consider a short issuer block on the last page.

### 3.14 Internal language leaking into client prose

- "Généré à partir de l'évaluation d'obligations existante ; aucune interprétation
  juridique supplémentaire n'a été ajoutée." This is pipeline vocabulary and means
  nothing to a hotelier.
- "(estimation générale, sans source unique attribuable, à la différence des chiffres
  cités ailleurs dans ce rapport)". This is your sourcing policy explained to someone
  who has never heard of it. Cut to "estimation généralement admise, sans source
  unique".
- Section 6 note: "ne contredit pas le statut d'obligation établi section 2". The
  report is arguing with itself in front of the client. Rephrase as a positive
  statement of what the table is.

### 3.15 Two French language errors in the legal section

- "sous le contrôle de Direction générale de la concurrence" is missing "la". Template
  concatenation, appears in the highest-stakes paragraph.
- "déposée sur Démarche Simplifiée" should be "Démarches Simplifiées" (the platform
  name is plural).

### 3.16 "La seule voie documentée pour s'exempter" edges past "report, don't conclude"

Asserting that a single exemption route exists is a legal conclusion. Soften to "la
voie d'exemption documentée à ce jour est [...]".

---

## P4: minor

- Empty cards are displayed: "Modéré 0" and "Rendu 0" each get a full tile plus, in the
  Rendu case, a footnote explaining the emptiness. Hide zero categories.
- Annex category headings use four different colours with no legend.
- `img:nth-of-type(32)` as a selector is not actionable: positional, changes on any
  content edit, and cannot be searched for in a CMS. For alt-text findings, the image
  filename or src would be far more useful.
- f087: 1 page, 20 occurrences, on the homepage only. Compare f036: 1 page, 2
  occurrences. Worth verifying the occurrence counter on that rule.
- The cover risk scale Faible / Moyen / Élevé has no stated thresholds. A client asks
  "élevé compared to what".
- Section 1 asserts causation: "Les lenteurs d'affichage, causées par des scripts
  bloquants". The scanner measured correlation between blocking-script audits and slow
  metrics. "liées à" is safer and costs nothing.
- The cover subtitle "Rapport d'audit" is generic given the four-category scope.
- Page 7's standalone checklist carries no company name and no date, so once printed
  alone it is unidentifiable apart from the footer URL.

---

## Suggested order of work

1. P0 items 0.1 through 0.7. None of them are large. 0.1, 0.3 and 0.5 are likely
   one-line fixes.
2. 1.1 and 1.3 (duplicate and image-cluster findings): biggest single credibility win
   per unit of effort, and it shrinks the annex.
3. 3.1 (URL list collapsing) plus 2.1 to 2.3: takes the document from 37 pages to
   roughly 25 and fixes the amateur-layout impression.
4. 1.4, 1.5, 1.7: the three places where the report's own stated logic does not hold.
5. Everything else.
