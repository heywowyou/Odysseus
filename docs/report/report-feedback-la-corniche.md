# Report feedback: La Co(o)rniche (FR, full tier, 2026-08-19)

Client-perspective pass on `2026-08-19T03-03-33Z-fr.pdf`, 21 pages, 93 findings
claimed, `https://lacoorniche.com/`.

Reading posture: hotel direction of a 5-star property with a restaurant, a bar, a
spa and an online booking widget, non technical, paid EUR 1 600 HT, will forward
the PDF to their web agency and possibly to a lawyer.

This document is the input for one or more Claude Code sessions. Work through it
in priority order. Do not attempt all tiers in a single session.

---

## 0. How to use this document

Suggested session split:

| Session | Scope | Tier |
|---|---|---|
| A | Aggregate binding and annex completeness, template only, no contract change | P0 items 0.2, 0.4, 0.5, 0.7, 0.9 |
| B | Obligation assessment: booking-flow detection and Sirene evidence | P0 items 0.1, 0.6, plus 1.11. Needs Jules approval before any edit |
| C | Performance pipeline: why Lighthouse produced nothing, and what the section does when it does | P0 item 0.3 |
| D | Prioritisation, benchmark attachment, third-party attribution | P0 item 0.8, P1 items 1.1, 1.4, 1.5, 1.9 |
| E | Annex, layout, copy | P2, P3, P4 |

Each item has the same shape: **Symptom**, **Probable cause**, **Fix**,
**Acceptance check**. The symptom is what the client sees, quoted or measured from
the generated PDF. Do not change the symptom wording when writing tests, it is the
observable.

Items marked **REGRESSION** were reported and closed in the haaitza or Palais
Gallien passes and are visible again in this run. Treat them as test gaps first,
not as new bugs: the fix landed without a test that would have caught the
recurrence.

### Read first

- `CLAUDE.md`
- `docs/report-design-system.md`, `docs/obligation-basis.md`, `docs/offer-positioning.md`
- `report-feedback-deferred-items.md` (do not re-triage anything already listed there)
- `packages/report/` template and section files, `packages/report/src/template/html-utils.ts`
- `packages/core/src/types/findings.ts`, `severity.ts`, `llm-output.ts`
- The structure-pass and writing-pass prompt files in `packages/llm/`

If any file path here does not match the repo, locate the real file before
editing. Do not create a parallel implementation.

### Hard rules for every item

1. No em dashes and no en dashes anywhere, in code, comments, docs, or generated
   French copy.
2. Locked contract files (`findings.ts`, `severity.ts`, `llm-output.ts`,
   `CLAUDE.md`): stop and ask before editing. Propose the diff, do not apply it
   unilaterally.
3. No LLM call may assert legal scope. `assessObligations()` stays pure and
   deterministic.
4. Deterministic scanners detect, the LLM only explains, prioritises and
   translates. Any number in the report comes from `findings.json` or the
   reference layer, never from the writing pass.
5. No quantitative business-impact claim fires without a sourced, dated,
   sector-matched benchmark.
6. Report copy is French. Internal identifiers, rule ids and code stay English.

---

## Arithmetic audit

Unlike the Palais Gallien v2 run, this one does not reconcile. Recorded here once
so the individual items below can reference it.

| Figure | Where | Value |
|---|---|---|
| Distinct findings | cover severity basis (33 + 32) | 65 |
| Distinct findings | stats tile "constats distincts" | 93 |
| Distinct findings | severity chart (33 + 32 + 3 + 25) | 93 |
| Distinct findings | category chart (85 + 5 + 2 + 1) | 93 |
| Distinct findings | annex rows, counted | **89** |
| Distinct findings | section 1 prose "un total de 94 constats" | **94** |
| Priority problems | section 1 prose "66 problèmes prioritaires (33 critiques et 33 sérieux)" | **66 / 33 / 33** |
| Serious findings | cover and severity chart | **32** |

Findings counted in every aggregate but absent from the annex: `f035`, `f058`,
`f071`, `f088`. Reconstructing by severity: `f058` is the missing Sérieux (SEO,
mentions légales), `f035` and `f071` are the two GEO Mineurs, `f088` is the Rendu
Mineur. That accounts exactly for the 89 versus 93 gap, for SEO showing 5 in the
chart and 4 in the annex, and for GEO (2) and Rendu (1) having no annex section at
all.

Accessibility occurrences: annex rule groups sum to 703, matching the tile. The
WCAG criteria table on page 9 sums to 911 because `link-name` (282 occurrences) is
counted in both the 2.4.4 row and the 4.1.2 row. 911 - 282 = 629, plus the 74
heuristic occurrences held out of that table = 703. The double count is
defensible but invisible to the reader.

---

## P0. Blocks sending this file to a client

### 0.1 The legal section declares the hotel out of scope, on a basis the scan itself contradicts

**Symptom.** Page 3, section 2, "STATUT D'OBLIGATION: Hors champ", then:

> Sur la base des éléments disponibles (taille de l'entreprise et absence de
> parcours de réservation, panier ou paiement en ligne), ce site ne relève pas de
> l'obligation d'accessibilité numérique prévue par la loi n° 2023-171.

The same report contains, as scanner output:

- `f001` / `f011`, selectors `.coorniche_reservation_1` and
  `.coorniche_reservation_2`, present on all 18 pages
- `f036`, `#diadao-qs-availabilities-snippet-close`, an availability widget on all
  18 pages
- `f043`, `f047`, `f051`, `f055`, `f063`: booking iframes
  (`.bloc-resa[align="center"] > iframe`, inside `#popmake-1398`, `#popmake-13138`,
  `#popmake-12288`) on up to 14 pages
- shadow-piercing selectors ending in `.captcha__header__logo`, that is, a
  third-party booking engine loaded in a nested iframe
- priority 1 body copy that itself says the broken buttons stop users
  "réserver une chambre"

So the report tells a 5-star hotel that it has no online booking path, on a page
where it also lists the booking widget's own accessibility defects, and on the
strength of that concludes no obligation applies. This is the section the client
paid for and the one most likely to be read by a lawyer. It is the single most
damaging item in the document.

Second problem in the same paragraph: "taille de l'entreprise" is asserted with no
evidence printed. No effectifs bracket, no Sirene record date, nothing the client
or their lawyer can check. Per "report, don't conclude", the report may state
registry facts and criteria; "ce site ne relève pas de l'obligation" is a
conclusion presented without its inputs.

Third: the card body and the paragraph below it print the same sentence twice, the
second time with the parenthetical basis appended.

**Probable cause.** Transactional-path detection looks for same-origin cart,
checkout or booking routes and does not resolve booking engines embedded as
cross-origin iframes or opened in modal overlays. The Sirene effectifs field is
either unread, empty, or defaulting to a small bracket for an establishment record
rather than the legal unit.

**Fix.**
- Add an iframe-origin signal to the crawler: for every page, record third-party
  iframe origins and whether any matches a known booking-engine domain family.
  Feed it into `siteSignals` as evidence, not as a status write.
- Treat the presence of a booking or availability widget, on-site or embedded, as
  a transactional-path signal for hotels, consistent with the existing rule that
  hotels with booking flows are electronic commerce services under the EAA.
- Never emit "Hors champ" while a transactional-path signal is present. If signals
  conflict, emit an explicit "à confirmer" state that says which signals point
  which way and stops there.
- Print the Sirene inputs verbatim: denomination, SIREN, effectifs bracket, date
  of the record, source. If effectifs is unavailable, say so instead of using it.
- Delete the duplicated sentence, keep one instance with the basis.

**Acceptance check.** Regenerate La Corniche. The obligation status is not "Hors
champ". The legal section prints every input it relies on with its date. A unit
test asserts that `assessObligations()` cannot return an out-of-scope status when
any transactional-path signal is true. A second test covers the cross-origin
booking iframe case using the La Corniche `.bloc-resa > iframe` markup as fixture.

### 0.2 Sections 12 and 13 do not exist. Page 21 is blank.

**Symptom.** The table of contents lists:

```
12   Glossaire     0
13   Suite         0
```

Both render page number 0. Neither section exists anywhere in the document:
`pdftotext` returns zero characters for page 21, and no glossary or next-steps
content appears on any page. Meanwhile section 1 tells the client:

> Les termes techniques utilisés dans ce rapport sont définis dans la section
> « Glossaire ».

So the report points at a section that is not there, promises a next-steps section
that is not there, and ships with a blank final page. Consequences: no glossary,
no re-audit offer, no price, no lead time, no contact details, no issuer identity,
no SIRET. The one page of the document with commercial upside is missing entirely.

**Probable cause.** These two sections render empty (upstream data missing, or a
template guard suppressing them), the TOC is built from the section manifest
rather than from what actually rendered, and the page-number resolver returns 0
for a section with no page break of its own. The blank page 21 is the Paged.js
page created for the suppressed content.

**Fix.**
- Find why sections 12 and 13 produce no content and fix the root cause. If the
  next-steps content depends on `ODYSSEUS_REAUDIT_PRICE_EUR_HT` and
  `ODYSSEUS_CONTACT_EMAIL` placeholders (see the deferred-items doc), it should
  still render with the clearly-marked placeholders, not vanish.
- Make the TOC a projection of rendered sections, not of the manifest. A section
  that produces no pages does not get a TOC row.
- Add a paged invariant: no rendered page is empty, and no TOC row has page 0.

**Acceptance check.** Regenerate. `pdftotext` returns non-empty text for every
page. The TOC contains no zero page number. A `paged-invariants.test.ts` case
asserts both, and fails if a section is added to the manifest without content.

### 0.3 The performance section delivers nothing, and the cover sells it

**Symptom.** Page 10, section 9, five rows, all identical:

| Métrique | Valeur médiane | Pire page | Seuil | Statut |
|---|---|---|---|---|
| LCP | Non mesuré | - | 2,5 s | - |
| TBT | Non mesuré | - | 200 ms | - |
| FCP | Non mesuré | - | 1,8 s | - |
| Speed Index | Non mesuré | - | 3,4 s | - |
| CLS | Non mesuré | - | 0,1 | - |

Above the table: "Valeurs médianes agrégées sur les 18 pages", which is false when
nothing was measured. Below it, a footnote explaining how a Critique status can
coexist with a médiane "à améliorer", which is irrelevant when no status exists.
The cover states "RÉFÉRENTIEL AUDITÉ: WCAG 2.2 AA · Performance · SEO · GEO" and
the methodology states "moteur de performance Lighthouse - sur profil mobile
simulé". One of the four pillars sold on the cover produced zero data and the
report does not acknowledge it.

**Probable cause.** Lighthouse failed or timed out for every page and the failure
was swallowed. Candidates: the pinned Lighthouse 12.8.2 against the booking
iframes and the popmake overlays, a navigation timeout on a heavy 5-star hotel
homepage, or a Chromium lifecycle collision with the render-diff double load.

**Fix.**
- Find the actual failure. Do not paper over it in the template.
- The report must never present an all-unmeasured table as if it were measured
  data. When zero metrics resolved, replace the section with one sentence stating
  that performance measurement did not complete for this run and that no
  performance finding is reported, and drop the thresholds table and the
  median-versus-worst-page footnote.
- Add a generation-time guard: if a category advertised on the cover produced no
  data, the cover référentiel line reflects it.

**Acceptance check.** Regenerate. Either the table contains real numbers, or the
section states plainly that performance was not measured and the cover does not
claim Performance. A test asserts the template never renders a metrics table where
every row is the unmeasured fallback.

### 0.4 The summary prose contradicts every count in the document

**Symptom.** Page 3, section 1:

> L'audit a identifié 66 problèmes prioritaires (33 critiques et 33 sérieux) sur un
> total de 94 constats.

The cover says 33 critiques and 32 sérieux. The severity chart says 33 / 32 / 3 /
25. The stats tile says 93 constats distincts. So the first paragraph of the
report is wrong three times in one sentence: 33 sérieux instead of 32, 66 instead
of 65, 94 instead of 93. A client who reads only page 3 and the cover sees the
inconsistency without looking for it.

**Probable cause.** The writing pass is producing counts as prose rather than
receiving them as bound values, or the structure pass hands it rounded or stale
figures. This is the exact class the architecture rule forbids: no number in the
report originates in the writing pass.

**Fix.**
- Remove counts from the writing pass entirely. The summary template receives
  `criticalCount`, `seriousCount`, `totalFindings` as bound values and interpolates
  them; the LLM writes only the connecting prose.
- If the prompt currently permits the model to restate counts, forbid it in the
  prompt and validate the output: reject any structure-pass or writing-pass output
  containing a digit sequence that does not match a bound value.

**Acceptance check.** Regenerate. Every numeral in section 1 matches the cover and
the severity chart. A unit test renders the summary from a fixture and asserts the
rendered counts equal the fixture counts.

### 0.5 The "Rendu" category says 1, its own footnote says 0, and section 8 shows 75 percent

**Symptom.** Page 4, three statements within 40 mm of each other and a fourth six
pages later:

- Category card: `RENDU: 1`
- Footnote directly beneath: "La catégorie « Rendu » affiche 0 constat, mais un
  écart de rendu réel a été mesuré sur au moins une page, en dessous du seuil de
  20 % à partir duquel un constat est généré"
- Section 8, page 10: three pages listed at 75 %, 62 % and 67 % of visible text
  missing from the raw HTML
- The annex has no Rendu section, so the counted finding (`f088`) is nowhere

So the card, the footnote, and the evidence page disagree, and the footnote asserts
a measurement below 20 percent while the report prints three measurements between
62 and 75 percent. REGRESSION of Palais Gallien v2 item 1.12, which was about a
genuinely sub-threshold gap; here the same footnote fires against data three times
over the threshold.

**Probable cause.** The footnote renders on a static condition (category present,
render-diff evidence present) rather than on the actual comparison of measured gap
against threshold, and the category card count and the annex section are fed from
different collections.

**Fix.**
- The footnote fires only when `maxRenderGap < threshold`. Otherwise it does not
  render.
- Category card counts and annex sections read from the same collection (see 0.7).
- Given the measured gaps, the render-diff result should be surfacing as a
  finding, not as a footnote about a finding that was not generated. Verify the
  threshold logic against `renderDiffEvidence` for this site specifically.

**Acceptance check.** Regenerate. The Rendu card, the footnote and section 8 agree.
A unit test with a 62 percent gap fixture asserts the sub-threshold footnote does
not render.

### 0.6 Priority 2 says the SIREN is missing. Two other sections say it was found.

**Symptom.** Page 5, priority 2, "Mentions légales incomplètes":

> L'absence de numéro SIREN ou RCS expose le site à des risques juridiques

Page 3: "SIREN 381749191, tel que constaté lors de cet audit (19 août 2026)."
Page 11: "Le numéro SIREN a été confirmé comme affiché sur cette page du site:
https://lacoorniche.com/conditions-generales-dutilisation/."

The same document says the SIREN is absent and that it was found on the site, at a
named URL. The priority also carries "Pages affectées: 0 pages sur 18" and
"Conformité: Sans objet", so it is ranked second out of six while affecting zero
pages, and it is one of the three items in the "PAR OÙ COMMENCER" box on page 3.
Its finding id `f058` appears nowhere in the annex.

**Probable cause.** The mentions-légales rule looks for a `/mentions-legales` route
and fires when it is absent. This site puts its legal notices in
`/conditions-generales-dutilisation/`, where the deterministic SIREN regex found
the number. Two detectors reaching opposite conclusions with no reconciliation
step, and the finding then bypassing the annex renderer entirely.

**Fix.**
- The mentions-légales finding must not fire when the SIREN detector has already
  confirmed a SIREN on the site. Gate it on the `siteSignals` boolean that already
  exists.
- Broaden the legal-notice route detection beyond `/mentions-legales` to the CGU,
  CGV and conditions-generales families.
- A priority with `pagesAffected === 0` must not be eligible for the priorities
  section at all. Add that as a filter, not a special case.

**Acceptance check.** Regenerate. Priority 2 is gone, replaced by the next
eligible chantier. No priority in the report has 0 pages affected. A unit test
asserts the mentions-légales rule does not fire when `sirenConfirmed` is true.

### 0.7 Four counted findings never appear in the "liste complète des constats"

**Symptom.** The annex is titled "Liste complète des constats" and subtitled
"Chaque constat détecté par les outils automatisés, y compris ceux jugés mineurs".
It contains 89 findings. Every aggregate in the report says 93. Missing: `f035`,
`f058`, `f071`, `f088`. The annex contains an Accessibilité section (85 findings,
matching the category card exactly) and a Référencement (SEO) section (4 findings
against a card that says 5). It contains no GEO section and no Rendu section,
although the category chart shows GEO 2 and Rendu 1, and the annex legend lists
all four categories with colour swatches.

Two of those ids are also cited elsewhere in the report as if they were annex rows
(`f058` in the priorities and the printable checklist, `f088` in Observations), so
a client following a cross-reference lands nowhere.

Also visible to a careful reader: the id sequence has holes at `f035` and `f071`,
so the annex reads as if rows were deleted.

**Probable cause.** The annex renderer iterates over category groups that have a
registered rule-group template. GEO and Rendu have no group template, so their
findings are counted upstream and dropped at render. `f058` is dropped for the
same reason or because its rule has no annex entry.

**Fix.**
- The annex renderer iterates over all findings, not over known groups. Any
  finding whose rule has no group template renders in a generic group keyed on the
  rule id, rather than being silently skipped.
- Add a render-time invariant: the number of annex rows equals the stats tile
  count. Fail generation, do not warn.
- Do not renumber findings to close the id holes; the invariant above makes them
  impossible.

**Acceptance check.** Regenerate. Annex row count equals 93 and equals the tile.
Every id cited anywhere in the document resolves to an annex row. A test asserts
`annexRowCount === distinctFindingCount` and fails the build otherwise.

### 0.8 The two largest rule families are missing from the priorities, and section 1 names one of them as the most urgent

**Symptom.** Section 1 says:

> Les corrections les plus urgentes portent sur les images sans texte alternatif,
> les boutons et liens non identifiables, ainsi que les mentions légales manquantes.

The six priorities are: button-name, mentions légales, frame-title, meta-viewport,
heading-hierarchy-skip, jsonld-invalid. So of the three things the summary calls
most urgent, one is absent (`image-alt`: 25 findings, 166 occurrences, Critique, on
all 18 pages), one is absent (`link-name`: 15 findings, 282 occurrences, Sérieux,
on all 18 pages) and one is a false positive (0.6). The largest critical family and
the largest occurrence family in the entire report receive no guidance at all.

Also absent from the priorities: `color-contrast` (4 findings, Sérieux) and
`video-missing-captions` (2 findings, Sérieux), and the render gap of 62 to 75
percent, which is the strongest commercial argument the report has.

The heading claims "6 chantiers, classés par effort et par impact"; see 1.5.

**Probable cause.** Priority selection is picking one representative per WCAG
criterion or per rule id rather than ranking rule families by severity times
reach, and `image-alt` and `link-name` are being lost in that collapse. Combined
with 0.6, the selector is producing a list whose top item affects zero pages while
the 395-occurrence family is omitted.

**Fix.**
- Rank rule families by a deterministic score built from severity, distinct
  findings, occurrences and pages reached. Take the top N families. No LLM input
  into selection; the LLM only writes the copy for the families it is handed.
- The summary's "most urgent" list is generated from the selected priorities, not
  written independently. It cannot name something the priorities section omits.
- Render-diff belongs in the priorities when the gap exceeds the threshold.

**Acceptance check.** Regenerate. `image-alt` and `link-name` appear in the
priorities. Every item named in the section 1 urgent list has a corresponding
priority card. A test asserts the set named in the summary equals the set of
rendered priority titles.

### 0.9 Dead and mismatched cross references in Observations

**Symptom.** Page 8, section 6, the whole content of the page:

> Ces pages [...] portent une directive noindex. [...] Constats concernés: f039,
> f088.

In the annex, `f039` is a `nested-interactive` accessibility finding, WCAG 4.1.2,
Sérieux, on `https://lacoorniche.com/cookies/`, selector
`#cmplz-manage-consent-container > .cmplz-categories > ...`. It has nothing to do
with noindex. `f088` does not exist in the annex at all. Separately, the annex row
for `nested-interactive` carries the pointer "voir Observations", which sends the
reader to a paragraph about noindex pages.

So the two references point at the wrong finding and at no finding, and the
back-reference points at unrelated content. REGRESSION of haaitza item B5.

**Probable cause.** The Observations block is built from a different id space than
the annex, or ids are assigned per category and then flattened, producing
collisions. The `voir Observations` pointer is attached by rule id without checking
that the Observations block actually discusses that rule.

**Fix.**
- Single id space, assigned once, before any section renders.
- Cross references resolve at render time. An unresolvable id fails generation.
- The "voir Observations" pointer renders only when the Observations block contains
  a note keyed to that rule id.

**Acceptance check.** Regenerate. Every id in Observations resolves to an annex row
of the matching rule. A test asserts no cross-reference in the document points at a
finding of a different rule than the one it describes.

---

## P1. Credibility with a technical or skeptical reader

### 1.1 The Pew statistic is attached to the mentions-légales priority

**Symptom.** Page 5, priority 2 ("Mentions légales incomplètes", i.e. a missing
SIREN):

> Repère chiffré: Les utilisateurs de Google ayant vu un résumé généré par IA ont
> cliqué sur un résultat de recherche traditionnel dans 8 % des visites, contre
> près de deux fois plus souvent (15 %) pour ceux qui n'en ont pas vu (Pew Research
> Center, juillet 2025, sur la base de 68 879 recherches Google effectuées par 900
> adultes américains).

Four problems: the statistic is about AI overviews and has no relationship to a
missing company registration number; it is US consumer data shown to a French
hotel, which breaks the sector-matched benchmark rule; the report tells the reader
its sample is 900 American adults, which invites the objection; and the phrasing
"dans 8 % des visites, contre près de deux fois plus souvent (15 %)" states the
ratio twice. REGRESSION of haaitza item B1, which was closed by keying statistic
selection on rule ids. Selection here has fallen back to a category match (SEO)
that lets a GEO statistic decorate a legal-mentions finding.

**Fix.** Restore rule-id keying and make category-level fallback impossible: a
statistic declares the rule families it may attach to, and renders nowhere else.
Retire this statistic for the hospitality sector until a sector-matched equivalent
exists. Absent is correct output.

**Acceptance check.** Regenerate. No statistic renders on a priority whose rule
ids are not in the statistic's declared attachment list. A test asserts a
GEO-keyed statistic cannot attach to an SEO priority.

### 1.2 The WCAG criteria table does not reconcile with the occurrences tile

**Symptom.** Page 9, the criteria table's occurrence column sums to 911. Page 3's
tile says 703 occurrences d'accessibilité. The difference is exactly 282, the
`link-name` occurrence count, which is counted in both the 2.4.4 row and the 4.1.2
row. An agency reconciling the two numbers finds a 208-occurrence discrepancy and
has to work out that a criteria table is not a partition.

**Fix.** One line under the table stating that a finding mapped to two criteria is
counted in both rows, so the column does not sum to the total. Or split
`link-name` occurrences across the rows. The footnote is cheaper and more honest.

**Acceptance check.** Regenerate. The note renders whenever any rule maps to more
than one criterion.

### 1.3 Five of the 18 pages are the same homepage in five languages

**Symptom.** The scanned page list contains `/`, `/en/`, `/es/`, `/it/` and
`/pt-pt/`. Twenty-three of the annex findings show exactly "5 pages" with exactly
that list. The crawl cap is 20; five slots went to language variants of one page,
and the reported occurrence counts are inflated roughly fivefold for every
homepage defect. "18/18 pages avec au moins un constat critique" is partly an
artefact of this. Meanwhile whole page families of a 5-star hotel site are unvisited.

**Fix.**
- Detect `hreflang` and common language-prefix routes at crawl time. Either
  restrict the crawl to the primary language, or keep the variants and group them
  in the annex as one page family with a note.
- State the choice in the methodology section.

**Acceptance check.** Regenerate. Either the page list contains no language
duplicates, or the annex groups them and the methodology explains it.

### 1.4 Third-party embed markup is reported as the client's own defects

**Symptom.** A large share of the annex is not the client's code:

- `#popmake-*`, `.pum-content` (Popup Maker plugin)
- `#gform_submit_button_*`, `.gform_wrapper` (Gravity Forms)
- `.smartpreview-*`, `.smartpreview__toolbar-*`, `a[data-tracking-label="sp_panel_close--*"]`
  (a preview widget, present on all 18 pages, roughly 8 findings and 140+ occurrences)
- `#diadao-qs-availabilities-snippet-close` (booking engine)
- `#cmplz-*` (Complianz cookie banner)
- `.captcha__header__logo` reached through `iframe >>> iframe`, i.e. inside a
  nested cross-origin frame

The client's agency cannot fix markup inside a third-party iframe, and will say so
in the first meeting. Presenting these as the client's non-conformities without
attribution invites the response that the whole report is naive. REGRESSION of
haaitza item D6.

**Fix.**
- Flag findings whose selector path crosses a frame boundary or matches a known
  vendor prefix, and group them in the annex under a "à traiter avec vos
  prestataires tiers" heading, with the vendor named where identifiable.
- Keep them counted, but state that resolution requires the vendor. This is a
  selling point, not a weakness: it tells the client something their agency has
  not.

**Acceptance check.** Regenerate. Every finding whose selector contains `>>>` is
attributed to a third-party frame. A test asserts frame-crossing selectors are
never grouped with first-party findings.

### 1.5 "Classés par effort et par impact" against six identical efforts

**Symptom.** Page 4 heading: "6 chantiers, classés par effort et par impact". All
six cards read "Effort: Faible". All six carry the green "Gain rapide" badge.
Impacts run Élevé, Élevé, Moyen, Moyen, Moyen, Moyen. So the stated sort has one
degree of freedom, the badge distinguishes nothing, and the ordering of the four
Moyen items is unexplained. REGRESSION of Palais Gallien v2 item 1.4 in a
different form: there the sort contradicted itself, here it is vacuous.

**Fix.** Either the effort model produces real variation (see the deferred
remediation-cost item, still open) or the heading stops claiming a two-axis sort
and the badge renders only when it is not universal.

**Acceptance check.** Regenerate. The badge does not render on every card, or the
heading does not claim a sort the data cannot support.

### 1.6 Two page counts for the same fact, again

**Symptom.** Priority 1 says "Pages affectées: 18 pages sur 18". The annex group
for the same rule says "jusqu'à 17 pages". Priority 3 says 17 pages sur 18, its
annex group says "jusqu'à 14 pages". Both are defensible (union versus largest
single finding) and the client sees two numbers for one thing. REGRESSION of
Palais Gallien v2 item 1.11, where the fix was to use the union consistently.

**Fix.** Print the union in both places, or label the annex figure explicitly as
the largest single constat rather than "jusqu'à".

### 1.7 The extended accessibility pass is claimed and only partly evidenced

**Symptom.** Methodology, page 11, claims keyboard navigation, focus order, form
error handling, video captions and the alt-text heuristic. Video captions and the
heuristic produce findings. Keyboard traps, focus order and form error handling
produce nothing, and nothing says whether they passed or did not run. On a site
with a nested-interactive violation and a booking modal, a clean keyboard result is
implausible enough that the client's agency will ask. REGRESSION of Palais Gallien
v2 item 1.10; the `extendedPassNoneFoundNote` string still is not rendering in the
full tier.

**Fix.** Render the note. State per check whether it ran and what it found. A clean
result stated is worth more than a clean result implied.

### 1.8 The 703 occurrences tile includes 74 heuristic occurrences

**Symptom.** The tile "703 occurrences d'accessibilité" sits beside three hard
counts and carries no caveat. 74 of the 703 come from
`alt-text-quality-heuristic`, which the report itself says on page 9 is not a
conformance test. Milder than the Palais Gallien case (10 percent rather than 89)
but the same defect.

**Fix.** Exclude heuristic occurrences from the tile, or split into two figures.

### 1.9 The booking path is never distinguished from the sitemap page

**Symptom.** `f001` and `f011`, on all 18 pages, are the reservation elements. They
sit in the annex between a footer image and a gallery image with no indication that
they are on the revenue path. Section 8 leads its render-diff evidence with
`/plan-de-site-hotel-luxe-arcachon/`, the least commercially relevant page on the
site, above the homepage and the rooms page. REGRESSION of haaitza item B6 for the
evidence ordering; the page-weighting half is the open deferred item.

**Fix.** For evidence selection, order by commercial relevance, not by gap size.
Homepage and rooms first. The sitemap page should not appear as example one.

### 1.10 Every critical is one of two rules, and "18/18" reads as alarmist

**Symptom.** All 33 Critique findings are `image-alt` (25) or `button-name` (8).
Since both hit every page, "18/18 pages avec au moins un constat critique" is
mechanically guaranteed and the cover risk badge "Élevé" follows from two rules.
The statement is true and the reader will discount it once they see the annex.

**Fix.** Either state the driver next to the tile, or derive the risk badge from
rule-family breadth rather than page coverage.

### 1.11 The Sirene evidence is not printed

Covered in 0.1. Listed here so it is not lost if 0.1 is split: whatever the
obligation outcome, the report must print the registry inputs it used, with dates
and source, per "report, don't conclude".

---

## P2. Layout and pagination

### 2.1 Orphan section headers, again

- Page 9 bottom: "08 · PREUVE DE RENDU" plus its intro paragraph, evidence cards
  start on page 10.
- Page 10 bottom: "10 · MÉTHODOLOGIE ET LIMITES" plus one paragraph, content
  continues on page 11.
- Page 3 stacks sections 01, 02 and 03; section 03 then continues on page 4.

REGRESSION of Palais Gallien v2 item 2.1. The fix landed for h2/h3 but the eyebrow
span and section wrapper are still not held together.

### 2.2 Dead space

Measured text volume per page: page 8 carries 540 characters (roughly 15 percent of
the page), page 11 carries 1317, page 7 fills about 40 percent, page 21 is empty.
In a 21-page document the client counts pages. Page 8 in particular is a section
header plus one four-line paragraph on an otherwise blank sheet.

### 2.3 `frame-title` renders its English axe-core title

**Symptom.** Page 16: "Frames must have an accessible name". It is the only
untranslated rule title in the annex, and the same rule appears in the priorities
section correctly translated as "Cadres sans titre accessible". REGRESSION of
haaitza item C7 for this one rule.

**Fix.** Add the `frame-title` entry to the annex title map. Add a test that fails
generation when any rendered rule title is absent from the French map, so the next
missing entry is caught before a client sees it.

### 2.4 Long rule titles break the annex group header

**Symptom.** Page 18: the "Sérieux" badge for `target-size` sits alone on one line
with the title beneath it and the rule id pushed to the following line, unlike
every other group where badge, title and rule id are inline. Same on
`alt-text-quality-heuristic`.

**Fix.** Fix the wrap so the badge stays with the first line of the title.

### 2.5 Cover layout

The upper 40 percent of the cover is empty. The référentiel value wraps to
"WCAG 2.2 AA · Performance · SEO ·" / "GEO", breaking after the separator.

### 2.6 Selector column overflow

Shadow-piercing selectors (`iframe >>> iframe >>> .captcha__header__logo`) and
three-line descendant chains dominate the column width. Consider truncating with a
visible ellipsis and putting the full selector in the technical export, once that
export exists (see 3.3).

---

## P3. Content and client experience

### 3.1 The legal denomination prints an unbalanced parenthesis

Cover: "Dénomination sociale: (O! DE LA DUNE". Raw Sirene string passed through
without normalisation. The client's first visual impression is a broken field.
Strip or balance leading punctuation, or print the registry string in a way that
makes clear it is verbatim.

### 3.2 Plural agreement bugs

- Page 10: "1 autres pages présentent le même écart" should be "1 autre page
  présente".
- Page 11: "2 page(s) ont été exclues" leaks the pluralisation placeholder.

REGRESSION of Palais Gallien v2 item 0.5 in a different template. Worth a shared
pluralisation helper and a test that greps the rendered HTML for `(s)`.

### 3.3 "détail dans l'export technique" promises a deliverable that is not in the package

Page 10. Nothing in the offer or the delivery includes a technical export. Either
ship one or change the copy. Same class as the previously flagged "available on
request" inside a section titled "complete list".

### 3.4 No glossary, though the report points at one

Consequence of 0.2. Terms actually used and undefined: constat, occurrence,
Critique, Sérieux, Modéré, Mineur, Sans objet, Signaux à vérifier, Rendu, GEO,
Effort, Impact commercial, Sirene, EN 301 549.

### 3.5 No next steps, no price, no contact, no issuer identity

Consequence of 0.2. For a EUR 1 600 HT French deliverable there is no SIRET, no
legal entity, no signatory and no way to order the re-audit. The placeholders
listed in the deferred-items doc still need Jules's real values before this ships
outside internal testing.

### 3.6 Addressee drift

"Confier à votre prestataire technique" (priorities 1, 3), "Demander à votre
agence" (priorities 5, 6). Pick one and use it. Related: priority 1 asks the client
to "Tester la navigation avec un clavier", which is exactly the manual testing the
methodology says is out of scope.

### 3.7 Vocabulary and scale drift

- "problèmes" (section 1) versus "constats" (everywhere else).
- Three scales, two of them sharing labels: cover criticité Faible / Moyen / Élevé,
  internal severity Critique / Sérieux / Modéré / Mineur, effort and impact Faible
  / Moyen / Élevé. A client reading "Effort: Faible" next to a cover badge reading
  "Élevé" has to work out these are unrelated axes.

### 3.8 "Conformité: Sans objet" is never defined

Appears on two priority cards and in the checklist. The client cannot tell whether
it means compliant, not applicable, or not assessed.

### 3.9 SEO priority cards have a different shape

Priorities 2 and 6 carry no "Exigence de conformité" line, so they look truncated
next to the accessibility cards. Give SEO items an equivalent line (the applicable
rule or standard) or restructure so the absence is not visible as a missing row.

### 3.10 Section 6 is a section header for one note

"06 · OBSERVATIONS / Constats hors classement" occupies a full page to carry four
lines about noindex on legal pages. Merge it into the annex or into section 7
unless it has more content in other runs.

---

## P4. Minor

- Methodology sentence starts with a numeral: "20 pages est un plafond configuré
  pour cet audit".
- Footer prints the URL uppercased: "HTTPS://LACOORNICHE.COM/".
- The cover risk scale Faible / Moyen / Élevé still has no stated thresholds.
  Third pass this has been raised.
- `f042`: 1 page, 77 occurrences, on the photo gallery. `f084`: 1 page, 22
  occurrences, same page. Plausible for a gallery, but these two dominate the
  `link-name` and heuristic totals and are worth a spot check against the DOM.
- Positional selectors (`img:nth-of-type(163)`) remain unactionable. Already logged
  as deferred; not re-triaged here.
- Section 13 is titled "Suite", which is vague even before it goes missing.
  "Prochaines étapes" reads better.

---

## Already deferred, do not re-triage

Per `report-feedback-deferred-items.md`: remediation cost and effort-in-days,
page-commercial-relevance weighting, the "reste à traiter" grouped guidance block
and its `packages/reference` prerequisite, screenshots and visual evidence, image
filename instead of positional selectors, and the three placeholder values
awaiting Jules's answer. Items 1.9 and 0.8 above touch the same territory and are
scoped deliberately narrowly to stay inside deterministic data.

---

## Out of scope for these sessions

- Do not add any LLM call that produces a legal statement. Item 0.1 changes
  detection inputs and labels, not the assessment's authority.
- Do not modify the Nocturne colour tokens or the spacing scale. Propose and stop.
- Do not build the sector benchmark layer. Item 1.1 is a removal and a gating fix,
  not an authoring project.
- Do not restructure `findings.json` beyond additive fields, and propose those
  before applying. Items 0.7 and 1.4 may need one additive field each
  (`renderGroup` fallback, third-party origin flag); propose the diff.
- Do not touch the free outreach preview template. Verify it still renders after
  each change.

---

## Verification before commit

1. `git status`, review every changed file.
2. Diff against the locked contract files. Any change there must have been
   explicitly approved.
3. `pnpm typecheck`
4. `pnpm test` with no exclusions. If a test fails, root-cause it; do not
   re-exclude it as flaky.
5. Regenerate La Corniche end to end and open the PDF. Check: no page 0 in the TOC,
   no blank page, annex row count equals the stats tile, every cited id resolves,
   section 1 numerals match the cover, no obligation status of "Hors champ" while a
   booking widget is present, no priority with 0 pages affected, no English rule
   title.
6. Regenerate `haaitza.com` and `sas-fernande.fr` to confirm the fixes generalise
   and are not La Corniche specific. Confirm the Palais Gallien fixes did not
   regress.
7. Verify the PDF reports `Tagged: yes` with a full bookmark outline.
8. axe-core against the post-pagination DOM.
9. `pgrep -af vite`, kill orphans.

---

## Paste-ready Claude Code prompt

Session A only. Run the others as separate sessions.

```
Read report-feedback-la-corniche.md, CLAUDE.md, docs/report-design-system.md and
report-feedback-deferred-items.md before proposing anything.

Scope for this session: P0 items 0.2, 0.4, 0.5, 0.7 and 0.9 only. Template,
aggregation and cross-reference layers. Do not touch assessObligations, the
Lighthouse pipeline, priority selection, or any locked contract file. If an item
turns out to need a locked-contract change, stop and report rather than editing.

Work in plan mode. Produce the plan first, covering for each item: the file you
will change, the change, and the test that will catch the regression. I will
approve before you edit.

The five items:
- 0.2 Sections 12 and 13 render nothing, the TOC shows them at page 0, and page 21
  is blank. Root-cause the empty render, make the TOC a projection of rendered
  sections, add a paged invariant that no page is empty and no TOC row is 0.
- 0.4 Section 1 prose says 94 constats, 66 prioritaires, 33 sérieux, against 93,
  65 and 32 everywhere else. Remove counts from the writing pass, bind them in the
  template, validate that no writing-pass digit is unbound.
- 0.5 The Rendu category card says 1, its footnote says 0, section 8 shows 62 to
  75 percent gaps, and the footnote claims the gap is below the 20 percent
  threshold. Fire the footnote only on the real comparison, and feed card counts
  and annex sections from one collection.
- 0.7 The annex lists 89 findings against 93 everywhere else. f035, f058, f071 and
  f088 never render, and GEO and Rendu have no annex section. Make the annex
  iterate all findings with a generic fallback group, and add a render-time
  invariant that annex rows equal the distinct finding count, failing generation
  when it does not hold.
- 0.9 Observations cites f039 and f088. f039 is a nested-interactive accessibility
  finding, f088 does not exist, and the annex nested-interactive row points back to
  Observations. Single id space assigned before render, cross references resolved
  at render time, unresolvable id fails generation.

After the edits: pnpm typecheck, pnpm test with no exclusions, regenerate La
Corniche, then regenerate haaitza and sas-fernande to confirm nothing regressed.
Report what changed and what you did not touch.
```
