/usa# Report feedback, haaitza run of 17 August 2026

Source: full 21 page PDF generated for `https://haaitza.com/`, reviewed from the point of view of the paying client (hotel direction, non technical, will forward the document to a web agency and possibly to a lawyer).

This document is the input for one or more Claude Code sessions. Work through it in priority order. Do not attempt all tiers in a single session.

---

## 0. How to use this document

Suggested session split:

| Session | Scope | Tier |
|---|---|---|
| A | Template and generation bugs, no data contract change | P0 |
| B | Data contract additions, scanner and report plumbing | P1 |
| C | New content sections and copy | P2 |
| D | Section reordering and print variant | P3, P4 |

Each item below has the same shape: **Symptom**, **Probable cause**, **Fix**, **Acceptance check**. The symptom is what the client sees, quoted from the generated PDF. Do not change the symptom wording when writing tests, it is the observable.

### Read first

- `CLAUDE.md`
- `docs/report-design-system.md`
- `packages/report/` template and section files
- `packages/core/src/findings.ts`, `severity.ts`, `llm-output.ts`
- The Handlebars reference template and the Paged.js layer
- The prompt files for the structure pass and the writing pass in `packages/llm/`

If any file path in this document does not match the repo, locate the real file before editing. Do not create a parallel implementation.

### Hard rules for every item

1. No em dashes and no en dashes anywhere, in code, comments, docs, or generated French copy.
2. Locked contract files (`findings.ts`, `severity.ts`, `llm-output.ts`, `CLAUDE.md`): stop and ask before editing. Several items below need new fields. Propose the diff, do not apply it unilaterally.
3. No LLM call may assert legal scope. `assessObligations()` stays pure and deterministic. Every item in section C6 is deterministic template copy, not generated prose.
4. Deterministic scanners detect, the LLM only explains, prioritises, and translates. Any new number appearing in the report must come from `findings.json` or from the reference database, never from the writing pass.
5. No UI control writes obligation status directly. Overrides feed `siteSignals` as evidence only.
6. Report copy is French. Internal identifiers, rule ids, and code stay English.

---

## P0. Generation bugs. These are the ones that cost the sale.

### B1. The "Repère chiffré" statistic is attached to the wrong findings, and duplicated

**Symptom.** Page 6, priority 2 "Vidéos sans sous-titres", carries: `Repère chiffré : Une amélioration de 0,1 seconde de la vitesse mobile a été associée à une hausse de 8,4 % des conversions [...] (Deloitte & Google, Milliseconds Make Millions, 2020).` The same paragraph appears verbatim on page 7 under priority 4 "Liens non explorables par les moteurs de recherche". Neither priority is about page speed. Priority 1, "Contenu principal lent à s'afficher", which is the actual speed item, carries no statistic at all.

Reading the identical paragraph twice under two unrelated headings is the single fastest way for a client to conclude the document was assembled without a human reading it.

**Probable cause.** Statistic selection is keyed on priority ordinal or on a loose category match, not on the finding rule ids inside the priority. No dedupe pass across the rendered document.

**Fix.**
- Key statistic selection on the rule ids or the finding category of the priority it decorates. A statistic must declare which categories and which rule families it may attach to.
- One statistic per report per source at most. Add a dedupe pass at render time keyed on statistic id.
- If no statistic matches a priority, render nothing. An absent statistic is correct output, an irrelevant one is not.
- Prefer attaching the speed statistic to the performance priority. If the matching logic naturally selects it there, do not special case it.

**Acceptance check.** Regenerate the haaitza report. No statistic id appears twice in the rendered HTML. Every rendered statistic shares a category with the priority it sits under. A unit test asserts that a report with two performance priorities renders the speed statistic at most once.

---

### B2. Unfilled template variable in the render evidence section

**Symptom.** Page 11, twice: `Manquant : 100% du texte visible absent du HTML brut, sur -.` The sentence ends on a bare hyphen where a page or element count should be.

**Fix.**
- Guard the clause. If the denominator is absent, render the sentence without the trailing clause rather than with an empty placeholder.
- Add a render lint step that fails the build when the rendered HTML contains any of: `{{`, `}}`, `undefined`, `NaN`, `null`, ` -.`, ` - .`, `[object Object]`. Run it on the post Paged.js DOM, not on the template.

**Acceptance check.** The lint step exists, runs in `pnpm test`, and fails on a fixture with a missing field. The haaitza regeneration passes it.

---

### B3. Severity label mismatch between the summary prose and the rest of the report

**Symptom.** Page 3: `87 problèmes, dont 6 critiques, 11 majeurs, 8 modérés et 62 mineurs`. Page 5 and the glossary on page 20 both use `Sérieux` for the same tier. The spec already corrected `Majeur` to `Sérieux`, so the summary prose is not respecting it.

**Probable cause.** The writing pass generates the severity words freely instead of receiving the canonical labels.

**Fix.**
- Inject the canonical French severity labels into the writing pass prompt as a fixed lexicon, and instruct that no other severity word may be used.
- Add a post generation validator over the LLM output that rejects banned tokens: `majeur`, `majeurs`, `majeure`, `majeures`, case insensitive. On rejection, retry once, then fail loudly rather than shipping the wrong label.
- Better if feasible: do not let the model write the counts at all. Render the count sentence deterministically from `findings.json` and let the model write only the surrounding analysis.

**Acceptance check.** Grep the generated HTML for `majeur` case insensitive: zero hits. Validator unit test covers the rejection path.

---

### B4. Section number padding is inconsistent

**Symptom.** Page 5 header reads `3 · L'AUDIT EN CHIFFRES`. Every other section uses two digits: `01`, `02`, `04`, `05`. Page 13 reads `10 · DÉCLARATION` and page 21 reads `14 · SUITE`, which are correct by accident since they are already two digits.

**Fix.** Derive the eyebrow number from a single source with zero padding applied in one place. Remove any hardcoded section numbers in section templates.

**Acceptance check.** All fourteen section eyebrows match `^\d{2} · `.

---

### B5. Dead cross reference in the accessibility declaration

**Symptom.** Page 13, "Plan de remédiation": `Voir la section « Priorités classées » ci-dessus pour le plan et les échéances associées.` There are no dates or deadlines anywhere in the priorities section, or anywhere in the report.

**Fix.** Either the report gains an action plan with dates (see C2, preferred) and this reference becomes true, or the sentence drops the mention of échéances. Do not ship the reference pointing at content that does not exist.

**Acceptance check.** If C2 ships, the sentence stays and the target section contains dates. If not, the word `échéances` does not appear in the declaration section.

---

### B6. The render evidence section illustrates the two pages that matter least

**Symptom.** Page 11, the render proof section, shows `https://haaitza.com/social/facebook/` and `https://haaitza.com/social/instagram/`. Page 9, Observations, has already told the client that third party wrapper pages are not to be fixed by normal means. So the flagship evidence section of the report demonstrates a problem on pages the report itself declares out of play, and says nothing about the homepage, rooms, restaurant, or booking pages.

This is the section that is supposed to carry argument A (revenue not being seen). It currently carries nothing.

**Probable cause.** Render evidence picks the worst pages by raw diff ratio, and wrapper pages trivially score 100 percent because their HTML is empty. The Observations filter that removes wrapper pages from `buildLlmInput` is not applied to the render evidence candidate pool.

**Fix.**
- Exclude pages classified as third party wrappers or legal noindex from the render evidence candidate pool, using the same classification that feeds the Observations section. Single source of truth, do not duplicate the predicate.
- Rank the remaining pages by absolute characters missing, not by ratio, so a commercial page missing 4 000 characters outranks a thin page missing 300.
- If, after filtering, no page has a meaningful diff, render a positive deterministic statement instead of an empty section: the commercial pages are served with their text present in the raw HTML, and name the wrapper pages as the exception with a pointer to Observations.

**Acceptance check.** The haaitza regeneration shows no `/social/` URL in the render evidence section. A fixture where all diff pages are wrappers renders the positive statement, not an empty box.

---

### B7. The cover risk badge contradicts the obligation status two pages later

**Symptom.** Cover: `NIVEAU DE RISQUE GLOBAL: Élevé`. Page 4: `STATUT D'OBLIGATION: Indéterminé`, because the SIREN or RCS identifier is absent from the site. The client reads: you cannot tell whether the law applies to me, but you have already scored my legal risk as high.

This also sits badly against "report, don't conclude".

**Fix.** Pick one, in this order of preference.

1. Resolve the input. The obligation assessment is blocked on an identifier the client can supply in ten seconds. Add a dashboard field for SIREN before generation, feeding `siteSignals` as evidence, never writing obligation status directly. If the field is filled, `assessObligations()` runs on real data and the contradiction disappears.
2. If unresolved, relabel the cover badge so it is unambiguously technical, not legal. For example `NIVEAU DE SÉVÉRITÉ TECHNIQUE` or `NIVEAU DE CRITICITÉ DES CONSTATS`, with the same computed value. The word `risque` next to `Indéterminé` is what creates the contradiction.
3. When obligation status is `Indéterminé`, the legal exposure card should state the single action that would resolve it, in one sentence, without asserting what the answer would be.

**Acceptance check.** No report can render a legal sounding global risk level while obligation status is `Indéterminé`. Assert this as a test over the render input, not over the string.

---

### B8. Table of contents has no page numbers

**Symptom.** Page 2 lists fourteen sections with no page numbers, plus a footnote explaining that numbers are in the footer and in the PDF bookmarks. In a 21 page document that reads as a limitation, not a choice.

**Probable cause.** The old `doc-page` runtime could not resolve cross page references. Paged.js can, via `target-counter`.

**Fix.** Implement TOC page numbers with Paged.js `target-counter(attr(href url), page)`. Remove the explanatory footnote. Keep the bookmark outline requirement (`Tagged: yes` with full outline) unchanged.

**Acceptance check.** Each TOC row shows a page number matching the actual page. Bookmarks still present. Run axe-core on the post pagination DOM after this change, since it touches generated content.

---

### B9. Minor consistency defects

- Page 6, priority 1: `Constats : f002-f005` uses range notation. Every other priority uses comma separated ids. Normalise to comma separated everywhere.
- Page 5, category tiles are not sorted. Performance is the largest bucket at 56 and renders fourth. Sort descending by count.
- Page 5, the line `9 critères WCAG 2.2 AA en échec sur 13 pages` sits unlabelled at the bottom of the section. Give it a label or move it into the criteria section.
- The legal disclaimer paragraph (`Ce rapport cite les critères techniques concernés [...]`) appears verbatim on page 4 and again on page 14. Keep it once, in the legal exposure section, and reference it from methodology if needed.
- Priority ordering. The section is titled `classés par effort et par impact`, yet priority 4 (impact Faible, 1 page) ranks above priority 5 (impact Moyen, 15 pages) and above priority 6, which is explicitly badged `Gain rapide` with faible effort and impact élevé. Review the ranking function: quick wins should surface near the top, and the rendered order must match the stated criteria.

---

## P1. Data contract gaps. The report is not actionable without these.

### D1. Findings never say which pages they affect

**Symptom.** Throughout the annexe and the priorities, findings are reported as `9 pages sur 20` or `jusqu'à 9 pages` with a CSS selector, and never as a list of URLs. The developer who receives this document cannot begin work: he knows a selector and a count, not where to look.

This is the largest practical gap in the document.

**Fix.**
- Carry the affected page URLs per finding through to the report data contract. This likely needs a field on the finding shape, which is a locked contract file: propose the diff and stop.
- Render up to N URLs inline (suggest N = 3) with `et X autres pages` beyond that, and the full mapping in the périmètre annexe (D2).
- Apply the same in the priorities section: `9 pages sur 20` becomes a count plus the top named pages.

**Acceptance check.** Every finding row in the annexe resolves to at least one URL. No finding renders a page count without a page reference.

---

### D2. There is no scope section listing the pages that were scanned

**Symptom.** Nowhere in 21 pages does the client learn which 20 URLs were analysed. The cover says `20 pages scannées`, methodology says `20 pages explorées le 17 août 2026 à partir de la page d'accueil`. That is it.

**Fix.** Add a périmètre section (see the reordering in P3 for placement) containing:
- The full list of scanned URLs, with per page finding counts if cheap.
- How the 20 were selected: crawl depth, whether 20 is a configured cap, how many URLs were discovered in total.
- Pages excluded and why (wrappers, noindex legal pages, off domain).
- Explicit statement of what was not tested.

**Acceptance check.** The section renders the same page count as the cover and the methodology section, from the same source value.

---

### D3. The headline count of 87 is inflated by the report's own admissions

**Symptom.** Page 3 and page 5 lead with 87 problems. But 62 of those are minor, and the Observations section on page 9 lists 17 finding ids for which the report explicitly recommends no corrective action. The number that scares the client is walked back over the following fifteen pages, which reads as inflation whether or not it is.

**Fix.**
- Add a derived, deterministic metric alongside the total: `constats actionnables`, defined as total findings minus findings classified into Observations. Define the formula in one sentence directly under the metric so it is auditable.
- Show both on page 5: total detected, and actionable. Lead the summary prose with the actionable figure.
- Do not remove the total. The total is honest, it just needs its companion.

**Acceptance check.** Actionable count is computed from the same classification predicate that drives the Observations section. Sum reconciles: actionable plus observation classified equals total.

---

### D4. Occurrence counts are dominated by a single repeated component

**Symptom.** Page 10 shows criteria 2.4.4 and 4.1.2 at 181 occurrences each. The annexe reveals that 180 of those come from one selector, `a[data-slide="12034"]`, on one page. The client reads 181 problems where there is one component rendered 181 times.

**Fix.** Where a single selector accounts for a large share of a finding's occurrences, render it as instances of one component rather than as independent problems. Suggested phrasing: `1 composant, 180 instances sur 1 page`. Keep the raw occurrence number available in the annexe.

**Acceptance check.** No criteria row can render a three digit occurrence count without an accompanying instances or component qualifier when concentration exceeds a threshold.

---

### D5. The booking flow is never mentioned

**Symptom.** The client is a hotel. The reservation tunnel is the only surface that directly generates revenue, and the one that matters most under an EAA discussion, since a booking flow concluding a consumer contract is treated on par with an online shop. The report never says whether it was tested, whether it is on this domain, or whether it is out of scope.

The transactional flow detector already exists and uses a behavioural destination page check. Its output is not surfacing in the report.

**Fix.**
- Surface the transactional flow detection result on the cover or in the périmètre section: detected or not detected, on domain or delegated to an external booking engine, and whether it was in scope.
- If the booking engine is off domain, state it plainly as a scope boundary rather than leaving the client to discover it. This is also a natural upsell surface, but do not write sales copy into the report, state the fact.

**Acceptance check.** The report always renders a transactional flow scope statement, including the negative case.

---

### D6. Third party embed markup is reported as the client's own defects

**Symptom.** Page 16, finding f016 under contrast: `.xp48ta0 > .x14ayic.xwyz465.x1e0frkt > .xsqbvy7.xb9jzoj[role="none"] > ...`. That is Facebook's obfuscated class markup. Finding f013 similarly targets a `javascript:void(0);` anchor inside an embed.

An agency will use exactly this to dismiss the whole report: you charged him to tell him Facebook's widget has a contrast problem.

**Fix.**
- Detect findings whose selectors resolve inside a known third party embed container (iframe boundary, known widget root class families, or the wrapper page classification already in place).
- Either exclude them from the client facing count, or label them explicitly as third party embedded content with a one line note that they are not correctable in the client's own codebase.
- Whichever is chosen, do it deterministically and document the rule in `docs/report-design-system.md`.

**Acceptance check.** No finding renders raw third party obfuscated selectors without a third party label.

---

### D7. Severity composition is misleading

**Symptom.** Page 5 shows 6 critiques. The annexe reveals that four of them are Lighthouse timing metrics: LCP, Speed Index, FCP, TBT. Meanwhile the priorities section marks the performance priority as `Conformité : Sans objet`. So the critical count is dominated by items the report itself says carry no compliance consequence.

**Fix.** Either split the severity distribution by axis (accessibilité, performance, SEO, GEO, rendu), or add one deterministic sentence under the severity block stating the composition, for example how many of the critical findings are performance timing measurements rather than conformity gaps. The first option is better.

**Acceptance check.** A reader can determine, from page 5 alone, how many critical findings are conformity related.

---

## P2. Content the client expected for the price.

### C1. No remediation guidance anywhere

**Symptom.** Every priority states what is wrong, how severe, how many pages, and `Effort : Moyen`. None states what to do. `Effort : Moyen` is not an instruction. The client cannot challenge his agency's quote because he has no idea what the work is.

**Fix.**
- Add a remediation block to each priority: two or three lines, concrete, at the level of "add a `<track kind='captions'>` to the videos identified below, or host them on a platform that generates captions".
- This is an explain task, so the LLM may write it, bounded by the rule family. It must not invent findings, page counts, or legal claims.
- Add an effort estimate in developer day bands, derived deterministically from rule family and occurrence concentration, not generated. Bands, not point estimates.

**Acceptance check.** Every priority renders a remediation block. No remediation block introduces a number that is not in `findings.json`.

---

### C2. No action plan, and the check-list is not usable as a check-list

**Symptom.** Page 8 is titled `Check-list des priorités` and described as printable, but it has no checkbox, no owner column, no due date, no status. It is a summary table wearing a check-list label. And there is no 30 / 60 / 90 view anywhere.

**Fix.**
- Add columns to the check-list: checkbox glyph, responsable (blank), échéance (blank or derived), fait (blank). It is a printable working document, blanks are correct.
- Add a short phased plan grouping the priorities into immediate, 30 days, 90 days, derived deterministically from effort band and impact. This also makes B5 true.

**Acceptance check.** Page prints legibly in a light variant (see P4) and every row has writable blank cells.

---

### C3. The contact section contains no contact details

**Symptom.** Page 21 is titled `Prochaines étapes & contact`. It contains no email, no phone, no name, no URL, no re-audit price. It instructs the client to write to `l'équipe Odysseus` without saying where. This is the final page of a paid deliverable and the natural conversion point.

**Fix.** Pull real contact details from config into the section: email, site, and the identifier format to quote. Add re-audit and post correction verification as named offers with a stated way to request them.

**Acceptance check.** The section renders a mailto and a URL from config, not from hardcoded template strings.

---

### C4. Nothing that passed is ever shown

**Symptom.** The document is a wall of failures. There is no statement of what was checked and found clean.

**Fix.** Add a short conformity positives block: criteria checked with no violation detected, stated as a deterministic list from axe results. Keep it modest and factually bounded, since automated passes are not proof of conformity. One qualifying sentence, then the list.

**Acceptance check.** List is derived from actual passed rules, never hardcoded.

---

### C5. The glossary defines the easy terms and skips the hard ones

**Symptom.** Page 20 defines WCAG, EAA, RGAA, EN 301 549 and the four severity tiers. It does not define LCP, FCP, CLS, TBT, Speed Index (all used on page 12), GEO, JSON-LD, hreflang, noindex, SIREN, RCS.

**Fix.**
- Add the missing entries.
- Add a build check: every acronym in a maintained list that appears in the rendered report must have a glossary entry. Fail the build otherwise.
- Note: RGAA is defined in the glossary but belongs to the art. 47 regime, not the EAA route this report is about. Either cut it or add the one line that says which regime it belongs to. Cutting is cleaner.

**Acceptance check.** The acronym check runs in `pnpm test`.

---

### C6. The legal exposure section leaves the client with less than he arrived with

**Symptom.** Page 4 gives a deadline that passed fourteen months ago, an undetermined status, and a disclaimer. The client's actual question, "and so what happens now, in practice", is unanswered.

**Fix.** Deterministic template copy only, no generated prose, no personalised legal determination. Add, as neutral registry facts:
- The mechanics: who may complain, what the procedure looks like, which authority.
- The sanction regime with the correct figure: EUR 7 500 per infraction under the EAA route. Do not use the EUR 50 000 figure, it belongs to the art. 47 regime for public bodies and large private companies.
- The state of case law as fact, not as prediction: Lille, May 2026, dismissed. Caen, June 2026, injunction granted.
- Keep the existing framing: criteria and registry facts are stated, applicability is for the client's lawyer to confirm.

Do not add RGAA or déclaration d'accessibilité obligations here, they belong to art. 47.

**Acceptance check.** Every sentence in the section is template text with no LLM involvement. A test asserts the string `50 000` does not appear in EAA route copy.

---

### C7. The annexe is in English inside a French report

**Symptom.** `Images must have alternative text`, `Links must have discernible text`, `Video has no captions track`, and so on. French report, English finding titles.

**Fix.** Translate finding titles to French, keep the machine rule id (`image-alt`, `link-name`) rendered next to the title as it already is. The rule id is what the developer greps for, the title is what the client reads.

**Acceptance check.** No English sentence in the client facing annexe. Rule ids unchanged.

---

### C8. The performance page undercuts itself and explains nothing

**Symptom.** Page 12 caption: `Valeurs médianes agrégées sur les 20 pages (Lighthouse), à titre illustratif.` A median LCP of 12,8 s against a 2,5 s threshold is the worst number in the document, and it is presented as illustrative, with no cause and no link to the twenty Lighthouse rules in the annexe that explain it.

**Fix.**
- Drop `à titre illustratif`. Replace with a precise statement: lab measurements, simulated mobile profile, Lighthouse version, median across N pages. This is the honest framing and it survives an agency pushback that cites field data from Search Console.
- Link or cross reference the three or four annexe rules that account for the worst metric.

**Acceptance check.** The phrase `à titre illustratif` is gone. The measurement conditions render from the same config as the methodology section.

---

### C9. The draft accessibility declaration needs an applicability note

**Symptom.** Page 13 hands the client a ready to publish public statement declaring his own non conformity, with no note on whether publishing it is required in his situation, advisable now, or premature. Every row reads `Non conforme (partiellement)`, which also makes the table look like a placeholder.

**Fix.**
- Add one deterministic sentence: what this document is, who it is for, and that whether and when to publish is a decision to confirm with counsel. No conclusion either way.
- Consider moving the section to the annexes (see P3). It is a deliverable artefact, not part of the argument.

**Acceptance check.** The section never implies publication is required.

---

### C10. Criteria table needs level and reference

**Symptom.** Page 10 gives criterion number, French label, and counts. A developer needs the conformance level and the W3C reference.

**Fix.** Add the A / AA level column and the W3C understanding URL per criterion. Add a footnote defining `Pages (max)`, which is currently unexplained.

---

### C11. GEO is advertised as a top level category and then never appears

**Symptom.** Page 5 lists `VISIBILITÉ DANS LES MOTEURS D'IA (GEO)` as one of five categories with 2 findings. GEO then appears only on page 19, buried in the annexe, as two condensed minor rules plus a Pew statistic.

**Fix.** Either give GEO a real body section with its findings and what they mean commercially, or drop it from the category tiles until 8.5c gives it real content. Advertising a category the report does not deliver on is worse than not mentioning it.

---

### C12. Needs a decision from Jules, do not implement blind

- **Global score.** A single tracked number would help across re-audits, but inventing a score is a product decision with real downside (clients optimise the score, agencies attack the methodology). Flag, do not build.
- **Sector benchmark.** "87 findings" means nothing without a reference point. This depends on `packages/reference` (8.5b). Do not fabricate comparative figures before that database exists.
- **Lighthouse rule tables.** Pages 18 and 19 are two full pages of raw audit ids with near zero value for the client and real value for a developer. Options: move to a separate technical export with a one line pointer in the report, or keep and add a short explanatory intro. Decide before implementing.

---

## P3. Section order

Current order buries the actionable material and interrupts the argument with the Observations section, which is a "these do not count" section placed in the middle of the case.

Proposed order:

1. Couverture
2. Sommaire, with page numbers
3. Résumé, leading with the actionable count, one render evidence figure pulled forward
4. L'audit en chiffres
5. Exposition légale, placed after the numbers so it lands on established facts
6. Priorités, each with remediation and effort band
7. Plan d'action and check-list, with owner and date columns
8. Preuve de rendu, on commercial pages
9. Mesures de performance
10. Conformité WCAG 2.2 AA
11. Observations hors classement, moved down
12. Périmètre: URLs scanned, what was and was not tested, booking flow status
13. Méthodologie et limites
14. Prochaines étapes et contact, with real contact details
15. Annexe: liste complète des constats
16. Annexe: détail Lighthouse, or removed per C12
17. Glossaire
18. Annexe: projet de déclaration d'accessibilité

Cover changes: add client entity name, report reference id, and generation identifier. Drop `LANGUE DU RAPPORT`, it occupies a slot that should hold the client name. Apply B7 to the risk badge label.

---

## P4. Design and print

### X1. The accessibility report is not comfortable to print

**Symptom.** A 21 page near black document with light grey letterspaced small caps. Page 8 is explicitly labelled `imprimable`. Printed, it consumes toner heavily and several of the grey on dark micro labels are at risk on the contrast ratio.

**Fix.**
- Add a light print variant, or at minimum a light stylesheet for the check-list and action plan pages, which are the pages a client actually prints.
- Run a contrast audit on the report's own tokens. The letterspaced small caps labels (`SITE AUDITÉ`, `CONSTAT`, `PAGES`, and so on) are the risk, they are small, low weight, and low contrast.
- Nocturne tokens are locked. If a token fails, propose the change, do not apply it.

### X2. Paged.js accessibility check

Any item in this document that touches generated content, TOC target counters, new sections, table changes, must be followed by an axe-core run against the post pagination DOM. Paged.js DOM cloning and splitting can break the accessibility tree even when pre pagination markup is clean. The PDF must still report `Tagged: yes` with a full bookmark outline.

### X3. Known layout hazards, do not reintroduce

- No `position: fixed` CSS footers, they collide with repeated `thead` rows in Chromium.
- No `break-inside: avoid` on large rule groups, it blanks half a page.
- Real data volumes differ significantly from mock data. Every new section needs overflow rules before real data is poured in.

---

## Out of scope for these sessions

- Do not touch `assessObligations()` logic. B7 changes inputs and labels, not the assessment.
- Do not add any LLM call that produces a legal statement.
- Do not modify the Nocturne colour tokens or the spacing scale. Propose and stop.
- Do not build the sector benchmark or the global score (C12).
- Do not restructure `findings.json` beyond the additive fields required by D1 and D6, and propose those before applying.
- Do not touch the free outreach preview template in these sessions. Differences between paid report and preview are expressed at generation time only, so verify the preview still renders after each change, but do not redesign it.

---

## Verification before commit

1. `git status`, review every changed file.
2. Diff against the locked contract files. Any change there must have been explicitly approved.
3. `pnpm typecheck`
4. `pnpm test`
5. Regenerate the haaitza report end to end and open the PDF. Check: no duplicated statistic, no `sur -.`, no `majeur`, all eyebrows two digits, TOC page numbers correct, render evidence on commercial pages, contact block populated.
6. Regenerate a second real site (`hotelpointfrance.com` or `sas-fernande.fr`) to confirm the fixes generalise and are not haaitza specific.
7. Verify PDF reports `Tagged: yes` with full bookmark outline.
8. axe-core against the post pagination DOM.
9. `pgrep -af vite`, kill orphans.
