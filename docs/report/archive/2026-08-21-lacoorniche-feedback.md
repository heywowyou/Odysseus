# Feedback report — La Co(o)rniche pass (2026-08-19 rapport, reviewed 2026-08-21)

Source: `2026-08-19T12-39-41Z-fr-Exemple.pdf` (build 11359cc, report id
ddd35605-24d9-4e14-9fe2-717c1545aeea). Reviewed dual-perspective: hotel director
(non-technical, paid the EUR 1 600 invoice) and consulting reviewer (agency/legal
forward test).

Arithmetic and finding-ID coverage are clean on this pass (21+32+5+47=105 constats,
603 accessibility occurrences reconcile across rule groups, f001–f105 all present,
none phantom, none duplicated). No P0/P1 item below concerns arithmetic or ID
integrity. Everything below is new or was already known but not yet fixed.

## Fix status (2026-08-22 session)

Every P0 and P1 item, the full P2 polish batch except P2.7, the new P3
non-technical intro section, and the P4 pagination batch have shipped. Full
detail of what changed and why is in each commit; the summary below is for a
reader who wants the outcome, not the diff.

- **P0.1 (Lighthouse):** root cause was not the site. `lighthouse-isolated.ts`
  forked its worker by a hardcoded `.ts` path, which only exists under `tsx`
  (dev mode) - the built `dist/` tree the real pipeline actually runs only has
  `.js`, so every Lighthouse call failed identically on every page of every
  real scan, unconditionally, since the packaging bug was introduced. A second
  bug (the parent discarded the worker's `stderr`) is why the failure looked
  content-free instead of self-diagnosing. Both fixed; confirmed against a
  fresh lacoorniche.com scan (3 of 5 pages now return real Core Web Vitals
  data). The two residual timeouts on that same scan are genuine - a real
  page took ~106s under Lighthouse's throttled simulation - so the default
  timeout was raised from 60s to 120s, and the report's completeness gate
  (cover subtitle, glossary terms, section 09/10's now-specific failure
  reason, and the job's new `needsReview` dashboard flag) covers whichever
  pages still don't make it.
- **P0.2 (cross-sector stats):** no locked-contract change needed - the fix
  point was `selectReferenceStats`'s new `strictSector` option, applied at
  both citation call sites. A hospitality report now gets no citation at all
  for accessibility/SEO (the table has no hospitality row for either) rather
  than a mismatched cross-sector one.
- **P0.3, P0.4, P1.1, P1.3, P1.4, P1.2, P1.5:** all shipped as scoped, with
  one correction each to the original diagnosis - see the item's own section
  above for what was actually wrong (P0.2's fix point, P1.4's "different
  metrics by design" framing).
- **P2.1–P2.6:** shipped. P2.7 (screenshots) stays deferred, per the existing
  entry in `report-feedback-deferred-items.md`.
- **P3:** shipped as section-00, before the résumé - no locked-contract or
  per-file renumbering needed, since `section-registry.ts` already computes
  displayed ordinals live from an ordered id list.
- **P4.1, P4.3 (already handled by a prior-session fix), P4.5, P4.6:**
  shipped. P4.4 was already satisfied by native `<thead>` repetition, no
  "(suite)" label needed. **P4.2 (section-opener containment) is deliberately
  deferred** - it requires a per-section-template restructuring across most
  of the report, and the existing `.section-head { break-inside: avoid }` +
  `.section-head + p { break-after: avoid }` pair already covers the
  concretely-reported symptom (a header stranded alone at a page bottom).
  Revisit if a future real-scan report shows the narrower gap this doesn't
  cover (the first content unit after the intro paragraph landing alone).
- **Letter-spacing/word-gap defect (deferred-items.md):** re-investigated.
  No CSS rule in `nocturne.css`/`paged.css` can produce it - confirmed no
  `report.css` file exists (the deferred entry's filename is stale) and no
  `word-spacing`/`justify` rule exists anywhere. Left open in
  `report-feedback-deferred-items.md` pending a fresh real-site PDF to
  re-check against, since the hypothesis (a Chromium print-to-PDF
  text-run-splitting artifact) needs a real render to confirm either way.

---

## P0 — blocks validation / credibility-breaking

### P0.1 — Lighthouse did not run; report should not be "validated" without performance data

**Symptom:** Section 09 says "La mesure de performance (Lighthouse) n'a pas abouti sur
ce site pour cet audit et aucun constat de performance n'est donc rapporté ici. Voir la
section « Méthodologie et limites » pour le détail." Section 10 (Méthodologie et
limites) never actually explains the failure. Cover page still advertises "Audit
accessibilité, **performance**, SEO et GEO" and the glossary still defines LCP, FCP,
TBT, CLS, Speed Index for a chapter with zero content.

**Priority context:** treat this as the top item of the whole pass. There is no
structural reason lacoorniche.com should fail a Lighthouse navigation-mode run against
a hotel marketing site. This needs root-cause investigation, not a documentation
patch.

**Investigation steps (do these before touching the report layer):**
1. Reproduce standalone: run Lighthouse directly (not through the pipeline queue)
   against `https://lacoorniche.com/` and capture the actual error/exit code.
2. Check Node version actually running the scanner vs the `^12.8.2` pin's requirement
   — confirm we are not silently on a Node minor below `22.19` if that's what
   triggered the 13.x note in memory; check `node -v` in the actual execution
   environment (not dev shell).
3. Check whether the M7 "Lighthouse serialized behind a queue" change introduced a
   timeout, a race on the shared Chromium instance, or a lock that never releases
   under real multi-page load (18 pages here).
4. Check whether the site's own interstitials (Popup Maker booking popup, cookie
   consent via Complianz, captcha iframe) block Lighthouse's navigation-ready signal
   — i.e. Lighthouse waiting on a load event that never settles because of a modal or
   third-party script.
5. Once root cause is known, fix it. Do not paper over with a better excuse sentence
   until the actual scan is confirmed working end-to-end on this site and on the
   `sas-fernande.fr` / `hotelpointfrance.com` fixtures.

**Report-generation gate (do this regardless of root cause, as a permanent
safeguard):** a report must not be marked "ready to send" / exit the pipeline as a
completed audit if a scanner that the pricing/cover page advertises produced no data.
Concretely:
- Add a completeness check at the end of the pipeline: if `performance` section has
  zero measured metrics, the job status should surface as `incomplete` /
  `needs-review` in the dashboard, not `done`.
- The dashboard's job list (M7 interface) should visibly flag this state so Jules
  can't accidentally ship a report with a silently-empty advertised pillar.
- If, after the root-cause fix, some genuinely unreachable site still can't be
  Lighthouse-scanned (e.g. hard bot-block), the report must say so with the actual
  reason (timeout after Ns, blocked by X, HTTP error code, etc.), never a generic
  "n'a pas abouti... voir méthodologie" that then contains no detail. And the cover
  page pillar list and glossary should conditionally drop LCP/FCP/TBT/CLS/Speed Index
  entries when performance data is absent, rather than defining terms for an empty
  section.

**Acceptance check:**
- Lighthouse produces real metrics on a fresh scan of `lacoorniche.com`,
  `sas-fernande.fr`, and `hotelpointfrance.com`.
- If a future scan still fails, the report states the concrete reason inline in
  section 09/10, and the job is flagged non-`done` in the dashboard.
- Cover page and glossary never advertise/define performance metrics for a report
  that has none.

---

### P0.2 — Generic cross-sector "repère chiffré" stats: remove, don't just re-match

**Symptom:** Priority 1 (buttons without accessible text) cites a 70,22 % cart
abandonment stat (Baymard). Priority 2 (invalid JSON-LD) cites a 35,26 % checkout
conversion stat for a "site e-commerce de grande taille moyen" (also machine-rendered
English syntax leaking through: "large-sized e-commerce site"). Neither is
sector-matched to a hotel, neither is topically connected to the finding it's
attached to (a labeling defect isn't a checkout-funnel-design defect), and both
directly violate the project's own rule: no quantitative claim without a sourced,
dated, **sector-matched** benchmark.

**Decision (per Jules, 2026-08-21):** don't wait on the M8.5b sector-benchmark
database to fix this by sector-matching. Move away from generic/cross-sector
"repère chiffré" statistics entirely. A thorough, complete report doesn't need a
borrowed e-commerce stat to make its case — attaching one that's visibly wrong for
the client's sector actively damages credibility, more than having no stat at all.

**Fix:**
1. In the LLM output schema (`llm-output.ts`, locked contract — flag for review, not
   a silent edit) make `repère_chiffré` / equivalent field genuinely optional at the
   template level, with **no fallback to a generic/cross-sector source**. If no
   sourced, dated, sector-matched benchmark exists in `packages/reference` for this
   sector + this finding category, the field is omitted from the rendered priority
   card — not filled with the nearest available cross-sector number.
2. Audit every existing recommendation template in `packages/reference` for
   "Suggested next steps" / priority blocks: strip any generic Baymard-style
   cross-sector figure that isn't sector-matched. Keep genuinely sector-matched ones
   (the GEO section's Phocuswright travel-AI stat — "56 % des voyageurs ont utilisé
   l'IA..." — is the one correctly-scoped example in this report; that's the bar).
3. Confirm this doesn't quietly re-open the door the M8.5b work is meant to close:
   once the sector benchmark database (8 sectors, 2 metric categories, already
   scoped) lands, sourced/sector-matched stats can be reintroduced through that
   pipeline. Until then, omit rather than approximate.
4. Regression test: assert no priority card in a rendered report contains a
   percentage/statistic whose source sector doesn't match the audited client's
   registered sector (or has no reference-layer entry at all).

**Acceptance check:**
- Re-run against La Co(o)rniche (hotel/hospitality): priorities 1 and 2 render with
  no repère chiffré line, or with a genuinely hotel-sector-matched one if it exists in
  the reference layer by the time this ships.
- No English-syntax fragments (e.g. "site e-commerce de grande taille moyen") appear
  anywhere in a French-language report.

---

### P0.3 — Transactional-path evidence list looks like the tool can't tell a booking funnel from a legal notice

**Symptom:** Section 02 (Exposition légale), "Le parcours transactionnel identifié a
été relevé directement sur les pages suivantes du périmètre audité" is followed by all
17 non-homepage URLs, including `/cookies/`, `/politique-de-confidentialite/`,
`/plan-de-site-hotel-luxe-arcachon/`. These pages don't contain a booking flow; the
booking widget is a site-wide component (Popup Maker + Diadao availability iframe)
present on every page's layout. As written, this reads as the legal section not being
able to distinguish a funnel page from a footer link, in the one section that most
needs to look precise.

**Fix:** replace the raw URL dump with a mechanism statement plus a short example
list, e.g.: "Un moteur de réservation est intégré via un composant présent sur
l'ensemble du périmètre analysé (exemples : page d'accueil, page chambres, page
offres)." Reference the actual detected component names (Popup Maker booking modal,
Diadao availability widget) rather than listing every page it happens to appear on.
This is a report-template change in the legal-exposure section, not a detection
change — `assessObligations()` stays purely deterministic; only the human-facing
sentence changes.

**Acceptance check:** legal section names the mechanism + component, not a wall of 17
URLs that include legal-notice pages.

---

### P0.4 — SIRET placeholder in the signature block

**Symptom:** Page 27: "Signataire : Jules Fontaine. SIRET : [SIRET à renseigner]."
Placeholder text in the signature block of a paid, client-facing deliverable.

**Fix:** either populate the real SIRET from config before this template renders, or
gate report finalization so a placeholder value in the signature block blocks
`odysseus serve`'s "generate final PDF" action with a clear error, instead of shipping
silently. Same treatment for any other `[... à renseigner]` placeholder pattern —
grep the whole report template tree for the bracket-placeholder convention and add a
pre-flight check that fails loudly if any survive to render.

**Acceptance check:** no `[... à renseigner]` pattern reaches a generated PDF; a real
SIRET renders, or generation is blocked with a clear local error.

---

## P1 — damages trust or usability, ship-blocking for a real client but not for internal iteration

### P1.1 — English strings leaking into French reports (regression)

**Symptom:** "No Open Graph tags found" (p.20) and "ARIA commands must have an
accessible name" (p.23) render untranslated in an otherwise fully French report. This
was flagged in a previous pass — per the project's own regression policy, this is
missing test coverage, not a new bug.

**Fix:** every rule title/description reaching the template must resolve through the
French catalogue; there should be no code path that falls back to the raw axe-core
rule string. Add the missing catalogue entries for these two rules (and audit for any
other axe-core rule IDs not yet covered).

**Regression test (required, not optional):** assert, for every `fr`-language report
generation, that no rendered rule title/description string matches a raw axe-core
rule-id-derived English string. This should run against the full axe-core WCAG 2.2 AA
rule set, not just the rules that happened to fire in past test fixtures — that's why
this keeps regressing.

**Acceptance check:** full French rendering, zero English leakage, and the new test
would have caught both of today's instances.

---

### P1.2 — Third-party-component impact is the most useful business fact in the report and it's buried on page 21

**Symptom:** Page 21 ("À traiter avec vos prestataires tiers") shows that third-party
components (Gravity Forms, Popup Maker, the captcha iframe, the Diadao booking
widget, smartpreview toolbar) account for 17 constats / 223 occurrences (≈37% of all
603 accessibility occurrences) and 6 of the 21 critical constats. That single fact
determines who the client calls tomorrow morning. It's currently on page 21 of 27,
and it actively **contradicts** Priority 1's action text ("Demandez à votre
prestataire technique d'ajouter un texte visible... à tous les boutons sur 17 pages"),
since most of those buttons belong to Gravity Forms, which the client's own agency
cannot patch directly.

**Fix:**
1. Surface an aggregate "third-party vs first-party" split in the résumé (section 01)
   and in "L'audit en chiffres" (section 03) — e.g. a stat card: "37 % des occurrences
   d'accessibilité proviennent de composants tiers (formulaires, popups, widget de
   réservation)."
2. Each priority card's action text must split the ask when a finding spans both
   first- and third-party pages: "X pages relèvent de votre site (votre agence peut
   corriger), Y pages relèvent de [nom du composant] (à faire remonter à l'éditeur)."
   This uses data Odysseus already has (the per-constat first-party/third-party tag
   used to build section 06/page-21) — it just needs to be surfaced earlier and
   merged into the priority card render logic instead of being a separate later
   section.

**Acceptance check:** résumé/chiffres mention the first-party/third-party split as a
headline number; Priority 1's action text no longer tells the client to ask their
agency to fix something their agency structurally cannot touch.

---

### P1.3 — Ambiguous sentence implies a legal filing has already happened

**Symptom:** "La voie d'exemption documentée à ce jour est une demande de dérogation
pour charge disproportionnée, **déposée** sur Démarches Simplifiées." Reads as: a
derogation request has already been filed. It hasn't — this is describing an
available path, not a completed action.

**Fix:** rewrite to remove the ambiguity, e.g. "...une demande de dérogation pour
charge disproportionnée, **à déposer** sur Démarches Simplifiées" or restructure the
sentence entirely to separate "voie disponible" from "statut actuel". Given the
"report, don't conclude" rule and the loi 71-1130 boundary around personalized legal
determinations, this sentence carries real legal-reading-comprehension risk and should
get a dedicated template review, not just a word swap — check the surrounding
paragraph for the same past-tense/future-tense ambiguity pattern.

**Acceptance check:** legal-review read of the rewritten sentence confirms no reader
could infer a filing has already occurred.

---

### P1.4 — Rendering-proof page count contradicts the annexe

**Symptom:** Section 08 shows 3 example pages then states "1 autre page présente le
même écart." The annexe (f024) shows this finding spans 16 pages, meaning 13 others,
not 1.

**Fix:** the "N autres pages" count in section 08 must be computed from the same
finding-to-page mapping used in the annexe (f024's actual page list), not from a
separate/stale count. Likely the same class of bug as the earlier phantom-finding-ID
issue — a display layer not reading from the single source of truth. Add a
cross-check test: section-08 "autres pages" count + shown pages == f024's total page
count, for every report.

**Acceptance check:** 3 shown + "13 autres" = 16, matching the annexe, and the test
would catch a future mismatch.

---

### P1.5 — No cost/time estimate beyond "Effort: Faible/Moyen/Élevé"

**Symptom:** Every priority card gives a qualitative effort label but nothing a
director can put in a budget line. Five of six priorities say "Faible" with no
aggregate translation.

**Fix:** add an aggregate estimate at the top of section 04 ("6 chantiers, classés
par effort et par impact"), even coarse — e.g. "Estimation globale : 2 à 4 jours de
développement pour les chantiers relevant de votre site, hors composants tiers dont
la correction dépend de leurs éditeurs respectifs." This can be a simple
band-computation off the existing effort labels (count of Faible/Moyen/Élevé →
day-range lookup table in `packages/reference`), not a new LLM-generated claim — keep
it deterministic per the project's architecture rule.

**Acceptance check:** section 04 opens with one aggregate estimate sentence, computed
deterministically from the six priority efforts.

---

## P2 — polish, do in the same pass if time allows

### P2.1 — Cover-page entity name has an unbalanced parenthesis
"(O! DE LA DUNE" appears on the cover and page 4 with no closing parenthesis. If this
is the genuine Sirene denomination sociale, add a one-line note on how the entity was
matched to the domain (builds trust that this isn't a scraping error). If it's a
parsing artifact from the Sirene lookup, fix the extraction.

### P2.2 — "Sans objet" in the Conformité column reads as "unknown" at point of use
Priority 2's Conformité value is "Sans objet" with the explanation only available in
the glossary, 20 pages later. Add a one-line inline gloss the first time "Sans objet"
appears in a priority card, or a tooltip-style parenthetical: "Sans objet (ce
chantier concerne le référencement, pas la conformité d'accessibilité)."

### P2.3 — f028 counted as "sérieux" in the headline severity total, but section 06 says no action needed
Section 06 says the nested-interactive finding (f028, cookie consent) needs no
corrective action ("Complianz" tag, "voir Observations"), yet it's still counted among
the 32 "sérieux" driving the cover's "Élevé" criticality badge. Either exclude
no-action-needed findings from the headline severity count, or add a one-line note in
section 06 explaining why it's still counted (e.g. it's a valid conformity gap even
if the current implementation happens to be compliant in practice).

### P2.4 — GEO/SEO pillars deliver very little relative to the cover's four-pillar promise
GEO: one real finding (f060, incomplete entity data) plus f094 which section 06 then
says to disregard. SEO: one real finding (invalid JSON-LD) plus three cosmetic
meta-length notes. ~90% of substantive findings are accessibility. Not a bug, but
worth setting the expectation on the cover page itself (e.g. a one-line note: "Ce
site présente peu de constats SEO/GEO significatifs ; l'essentiel des priorités
concerne l'accessibilité") rather than letting the client discover the imbalance by
reading 20 pages.

### P2.5 — Annexe pages aren't labeled for their actual audience
13 of 27 pages are CSS-selector tables meant for a developer, not the director
reading the report. Label section 11 explicitly, e.g. "Annexe technique — à
transmettre à votre prestataire", same for the check-list page (section 05).

### P2.6 — "Prestataire tiers non identifié" badge reads as the tool not knowing something
Reframe as a finding rather than an audit gap, e.g. "Composant tiers, éditeur non
identifié" — same information, different framing.

### P2.7 — No screenshots
One annotated capture of the booking popup with the unlabeled submit button would
communicate more than the 280 link-name occurrences combined. Out of scope for this
pass unless screenshot capture is already wired up elsewhere in the pipeline — flag
for a future milestone if not trivial.

---

## P3 — new: non-technical intro page (section 01, before the current résumé)

**Rationale (Jules, 2026-08-21):** the current résumé answers "what did you find."
Nothing in the report answers "why am I, the non-technical director, holding this,
and what do I do with it." Add this as a new section 01, renumbering the current
résumé to 02 and so on. Content should be template-driven with at most 1–2 sentences
of light LLM tailoring per block — this is a structural/navigational page, not an
analytical one, so it should be cheap and deterministic to generate.

**Fixed structure:**

1. **À qui s'adresse chaque partie du rapport** — three columns/rows:
   - Vous (dirigeant) → sections Résumé, Exposition légale, Priorités, Prochaines
     étapes.
   - Votre prestataire / agence web → sections Priorités (détail technique),
     Conformité accessibilité, Annexe.
   - Votre conseil juridique → section Exposition légale.
   This is the single highest-value block — right now the client doesn't know what to
   forward to whom.

2. **Ce que cet audit mesure** — four lines, plain French, no acronyms:
   - Accessibilité : vos clients en situation de handicap peuvent-ils réserver et
     naviguer sur votre site ?
   - Référencement (SEO) : Google comprend-il correctement vos pages ?
   - Visibilité IA (GEO) : les assistants IA (ChatGPT et équivalents) peuvent-ils
     comprendre et recommander votre établissement ?
   - Rendu : votre contenu existe-t-il même sans JavaScript, pour les robots et
     lecteurs d'écran les plus basiques ?

3. **Ce que ça change concrètement pour vous** — three consequences framed for a
   hotel director, not a developer: des clients qui ne peuvent pas terminer une
   réservation, une exposition réglementaire déjà documentée (DGCCRF), une visibilité
   réduite dans les résultats de recherche et les assistants IA.

4. **Ce que ce rapport n'est pas** — one line: pas un avis juridique (voir section
   Exposition légale) ; un audit automatisé couvrant environ 30 à 40 % des critères
   d'accessibilité (voir Méthodologie).

5. **Vos trois prochaines actions** — pull directly from the top 3 priority cards
   (title + who to contact: vous / votre agence / l'éditeur du composant + rough
   effort), don't regenerate new text — reuse section 04's data so nothing can drift
   out of sync with the priorities.

**Acceptance check:** new section 01 renders before the résumé, uses only data
already computed for the priorities (no new LLM analytical pass), and correctly
identifies first-party vs third-party ownership per item 5 above once P1.2 lands.

---

## P4 — pagination and layout (Paged.js / CSS)

### P4.1 — Heavy sections must always start on a fresh page
Priorités, Check-list imprimable, Annexe, Glossaire, Prochaines étapes should get
`break-before: page` unconditionally. Accept the resulting white space; a section
starting two lines above a page break looks worse than an intentionally empty half
page.

### P4.2 — Light sections should only continue if their *entire opening block* fits
Not a height estimate — wrap heading + kicker + intro paragraph + first content unit
in a single container with `break-inside: avoid; break-after: avoid;`. If that
container doesn't fit in the remaining space, the whole thing pushes to the next
page. This fixes the "section header alone at the bottom of a page" pattern without
needing to calculate remaining height manually.

### P4.3 — Prevent mid-item breaks
`break-inside: avoid` on: priority cards, stat cards, glossary entries, and — this is
the one causing the page 13/17/18/19/24 issues — **each annexe finding row together
with its "Pages :" detail line**, which currently splits across pages independently.

### P4.4 — Repeat context when a rule's table spans multiple pages
When a single rule's constat table continues onto a new page (as `image-alt` does
across pages 12–13), repeat the rule header with "(suite)" so a page read in
isolation is still legible. Use `thead { display: table-header-group }` on every
annexe table so column headers repeat automatically on each page.

### P4.5 — Orphan/widow control
`orphans: 3; widows: 3` on table bodies, plus a hard rule that a page break never
leaves fewer than 3 rows isolated. This directly fixes page 24 (a single orphaned row,
f048, alone on an otherwise empty page).

### P4.6 — Headings never end a page
`break-after: avoid` on every heading level, so a heading can't be the last line on a
page with its content starting on the next.

**Acceptance check for the whole P4 batch:** re-render this exact report
(lacoorniche.com data) and confirm: no section heading is orphaned at a page bottom,
no annexe row/detail-line pair splits across pages, no table restarts without a
repeated header, and no page shows fewer than 3 consecutive rows of a table.

---

## Session split plan

**Session A — Data integrity & credibility (P0.1, P0.2, P0.3, P0.4, P1.1, P1.3,
P1.4).** This is the priority session — Lighthouse and the benchmark-stat removal are
both trust-critical and independent of layout work. Do this first, and don't proceed
to a new report pass until P0.1 (Lighthouse) is confirmed working end to end on all
three fixtures.

**Session B — Report content & structure (P1.2, P1.5, P2.1–P2.7, P3).** Third-party
split surfacing, cost estimate, polish items, and the new non-technical intro page.
Depends on Session A's data being trustworthy but not on the pagination work.

**Session C — Pagination/CSS (P4.1–P4.6).** Independent of A and B; can run in
parallel or after, since it's pure template/CSS work using data both A and B will
have already fixed.

Recommend running A → (B and C in either order, B first is more natural since C should
render the final content structure) → full re-scan of `lacoorniche.com`,
`sas-fernande.fr`, `hotelpointfrance.com` → next client-perspective critique pass.

---

## Paste-ready Claude Code prompt — Session A

```
Read docs/CLAUDE.md, docs/odysseus-project-brief-v2.md, docs/llm-layer-rules.md,
and docs/normalization-rules.md first.

Fix the following, in this order, in plan mode. Do not batch these into one commit —
each numbered item should be its own reviewable change.

1. Lighthouse scan failure (root cause, not a doc patch). lacoorniche.com's report
   shows "La mesure de performance (Lighthouse) n'a pas abouti" with no follow-up
   detail. Investigate:
   - Run Lighthouse standalone (outside the pipeline queue) against
     https://lacoorniche.com/ and capture the actual error.
   - Confirm the Node version actually running the scanner satisfies the
     Lighthouse ^12.8.2 pin's requirements.
   - Check whether the M7 queue-serialization change introduced a timeout or lock
     issue under multi-page (18-page) load.
   - Check whether the site's own interstitials (Popup Maker booking modal,
     Complianz cookie consent, captcha iframe) block Lighthouse's navigation-ready
     signal.
   Fix the root cause. Then add a pipeline completeness gate: a report must not
   exit as job status `done` if the performance section has zero measured metrics
   — surface it as `incomplete`/`needs-review` in the dashboard instead. If a
   future scan genuinely can't complete, the rendered report must state the real
   reason (timeout, block, HTTP error) inline in section 09/10, and the cover
   page / glossary must conditionally omit performance-pillar language and
   LCP/FCP/TBT/CLS/Speed Index glossary entries when no performance data exists.

2. Remove generic/cross-sector "repère chiffré" statistics from priority cards and
   recommendation templates. This is a deliberate move away from cross-sector
   benchmarks entirely (not a re-matching fix) — a thorough report doesn't need a
   borrowed stat, and a mismatched one (e.g. e-commerce cart-abandonment % on a
   hotel accessibility finding) actively hurts credibility. In the LLM output
   schema, make the benchmark-statistic field genuinely optional with no
   generic-source fallback: if no sourced, dated, sector-matched entry exists in
   packages/reference for this sector + finding category, omit the field from the
   rendered card. Audit existing packages/reference recommendation templates and
   strip any unmatched cross-sector figures, keeping genuinely sector-matched ones
   (the GEO section's Phocuswright travel/AI stat is correctly scoped — use it as
   the bar). Add a regression test: no priority card in a rendered report may
   contain a statistic whose source sector doesn't match the client's registered
   sector or has no reference-layer entry.

3. Rewrite the transactional-path evidence sentence in the legal-exposure section.
   Currently lists all 17 non-homepage URLs including legal-notice pages like
   /cookies/ and /politique-de-confidentialite/, implying the booking funnel lives
   on those pages. Replace with a mechanism statement plus 2-3 example pages,
   naming the actual detected component (Popup Maker modal / Diadao availability
   widget). This is a template-language change only — assessObligations() and any
   other locked-contract logic stay untouched; flag any contract file diff for
   review rather than editing silently.

4. Fix the SIRET placeholder appearing in rendered PDFs ("[SIRET à renseigner]").
   Grep the full template tree for the bracket-placeholder convention and add a
   pre-flight check that blocks PDF finalization with a clear local error if any
   placeholder pattern reaches render, rather than shipping it silently.

5. Fix English strings leaking into French reports (regression — treat as missing
   test coverage per project policy, not a new bug). Confirmed instances: "No Open
   Graph tags found" and "ARIA commands must have an accessible name". Add the
   missing French catalogue entries, then add a test asserting that for every
   fr-language report, no rendered rule title/description matches a raw
   axe-core-derived English string, run against the full axe-core WCAG 2.2 AA rule
   set (not just rules seen in current fixtures, since that's why this keeps
   regressing).

6. Fix the ambiguous derogation sentence in the legal-exposure section: "La voie
   d'exemption documentée à ce jour est une demande de dérogation pour charge
   disproportionnée, déposée sur Démarches Simplifiées" reads as an already-filed
   request. Rewrite (e.g. "...à déposer sur Démarches Simplifiées") and scan the
   surrounding paragraph for the same past/future tense ambiguity pattern.

7. Fix the rendering-proof "N autres pages" count (section 08) to be computed from
   the same finding-to-page mapping used in the annexe, not a separate/stale
   count — likely the same class of bug as the earlier phantom-finding-ID issue.
   Add a cross-check test: shown pages + "N autres" == the finding's total page
   count in the annexe, for every report.

After each item: pnpm typecheck, pnpm test, re-scan lacoorniche.com (or the closest
available fixture) and confirm the specific defect is gone before moving to the next
item. Diff findings.ts, severity.ts, llm-output.ts, and CLAUDE.md against their
locked versions after the session and flag anything changed.
```

## Paste-ready Claude Code prompt — Session B

```
Read docs/CLAUDE.md, docs/odysseus-project-brief-v2.md, docs/report-design-tokens.md,
and docs/report-v2-refactor.md first. Assumes Session A (Lighthouse fix, benchmark
stat removal, legal-section rewrite) is already merged.

1. Surface the first-party vs third-party split as a headline stat. Compute the
   percentage of accessibility occurrences belonging to third-party components
   (already tagged for the existing "À traiter avec vos prestataires tiers"
   section) and add it as a stat card in section 03 (L'audit en chiffres) and a
   sentence in the résumé. Then update every priority card's action text: when a
   finding spans both first-party and third-party pages, split the recommended
   action into "X pages relèvent de votre site (votre agence peut corriger), Y
   pages relèvent de [composant] (à transmettre à son éditeur)" instead of a single
   undifferentiated instruction. Reuse the existing per-constat ownership tagging;
   don't add a new LLM analytical pass for this.

2. Add an aggregate effort estimate at the top of section 04 (Priorités), computed
   deterministically from the six priority cards' existing Faible/Moyen/Élevé
   effort labels via a day-range lookup table in packages/reference (not an
   LLM-generated claim).

3. Polish items:
   - Fix the unbalanced parenthesis in the entity name "(O! DE LA DUNE" if it's a
     Sirene-extraction artifact; if it's the genuine denomination, add a one-line
     note on how the entity was matched to the domain.
   - Add an inline gloss the first time "Sans objet" appears in a priority card's
     Conformité field.
   - Either exclude no-action-needed findings (e.g. f028, tagged "Complianz" /
     "voir Observations") from the headline severity counts, or add a one-line
     explanation in section 06 for why they're still counted.
   - Add a one-line expectation-setting note on the cover or résumé when SEO/GEO
     findings are minimal relative to accessibility (this report: ~90% of
     substantive findings are accessibility).
   - Label section 11 (Annexe) and the check-list page explicitly as
     developer-facing ("Annexe technique — à transmettre à votre prestataire").
   - Reframe "Prestataire tiers non identifié" as "Composant tiers, éditeur non
     identifié".

4. Add a new section 01 (non-technical intro page), renumbering the current résumé
   and all following sections by one. Structure, per docs/report-v2-refactor.md
   conventions:
   - "À qui s'adresse chaque partie du rapport" — mapping of sections to vous /
     votre agence / votre conseil juridique.
   - "Ce que cet audit mesure" — four fixed lines (accessibilité, SEO, GEO, rendu)
     in plain French, no acronyms.
   - "Ce que ça change concrètement pour vous" — three fixed consequence
     statements.
   - "Ce que ce rapport n'est pas" — one line (pas un avis juridique; couverture
     ~30-40% des critères, automatisée).
   - "Vos trois prochaines actions" — pulled directly from the top 3 priority
     cards' existing data (title, who to contact per item 1 above, effort), no new
     LLM generation.
   This section should be template-driven with at most 1-2 sentences of light LLM
   tailoring total; it must not trigger a new analytical LLM pass.

After each item: pnpm typecheck, pnpm test, re-scan and confirm visually. Diff
findings.ts, severity.ts, llm-output.ts, and CLAUDE.md against locked versions and
flag anything changed.
```

## Paste-ready Claude Code prompt — Session C

```
Read docs/CLAUDE.md and docs/report-design-tokens.md first. Assumes Sessions A and B
are merged so the content structure is final before this pagination pass.

Fix pagination/layout in the Paged.js report template:

1. Force break-before: page (unconditionally) on: Priorités, Check-list imprimable,
   Annexe, Glossaire, Prochaines étapes.

2. For all other section openers, wrap heading + kicker + intro paragraph + first
   content unit in a single container with break-inside: avoid; break-after: avoid;
   so the section either fully starts on the current page or pushes entirely to the
   next — no height-estimate logic, just this containment rule.

3. Add break-inside: avoid to: priority cards, stat cards, glossary entries, and
   each annexe finding row together with its "Pages :" detail line (currently these
   split independently, e.g. around pages 13, 17, 18, 19).

4. When a single rule's constat table spans multiple pages, repeat the rule header
   with "(suite)" on continuation pages. Add thead { display: table-header-group }
   to every annexe table so column headers repeat automatically.

5. Add orphans: 3; widows: 3 to table bodies. This should fix the page 24 orphan
   (a single row, f048, alone on an otherwise empty page).

6. Add break-after: avoid to every heading level so a heading can never be the last
   line on a page with its content starting on the next page.

Re-render the lacoorniche.com report after each change and visually confirm against
this checklist before moving to the next item:
- No section heading orphaned at a page bottom.
- No annexe finding row / "Pages :" line pair splits across a page break.
- No table continues onto a new page without a repeated header.
- No page shows fewer than 3 consecutive rows of a continuing table.
- Page 24-equivalent (isolated single row) no longer occurs.

pnpm typecheck && pnpm test after. This session shouldn't touch findings.ts,
severity.ts, llm-output.ts, or CLAUDE.md — flag it if it does.
```
