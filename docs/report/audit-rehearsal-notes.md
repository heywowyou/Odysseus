# Audit rehearsal notes

Running log for the `audit-rehearsal` skill (`.claude/skills/audit-rehearsal/SKILL.md`):
one real, previously-unscanned hotel audited and read as its owner/GM would
read it, before it ever reaches a real client. Cumulative across runs so a
nit that keeps recurring across different hotels is visible as a pattern,
not just a one-off complaint.

This is not the system of record for defects — genuine defects found during
a rehearsal are filed as GitHub issues per `docs/agents/issue-tracker.md`
and only referenced here. This file exists for what doesn't rise to an
issue: cosmetic nits, and a short trail of what each rehearsal concluded.

Each entry:

```
## <ISO date> — <hostname>

- URL: <url>
- Audit ID: <auditId>
- Verdict: <one or two sentence summary of the critique's verdict>
- Top concerns: <one or two lines, if any stood out beyond what became an issue>
- Nits: <list, or "none">
- Issues filed: <#N, #N, or "none">
```

## 2026-09-04 — www.villasfoch.fr

- URL: https://www.villasfoch.fr/
- Audit ID: ff95ff97-cb54-41c7-8a33-89c9116985aa
- Artifacts: `artifacts/www.villasfoch.fr/2026-09-03T20-44-46Z/`
- Scope note: **critique-only pass, no new scan.** Steps 1 to 3 of the skill
  (pick, scan, generate) were deliberately skipped at the operator's
  instruction; the artifact read was the already-rendered French PDF at
  `docs/report/feedback/document04092026.pdf` (50 pages, rendered
  2026-09-04 00:19 CEST). All 50 pages were read, both as extracted text and
  as rendered images.
- Coverage gap: **no English PDF was available**, so the language-pair
  comparison the skill requires did not run. A section that renders
  correctly in French and wrongly in English would not have been caught.
- Verdict: a well-designed report undermined by arithmetic and attribution
  errors a careful reader checks first. The owner would accept the substance
  (the site really does have a large alt-text and performance problem) but
  would lose confidence at three specific places: four `back-office/...`
  404 URLs presented as their own analysed pages, a "29 pages sur 28" ratio
  that cannot be true, and a top priority whose cited example page is not a
  page the finding occurs on. The legal section, the part worth the most to
  them, reaches the wrong conclusion because the booking flow was not
  detected.
- Top concerns beyond the filed issues:
  - The headline "236 constats, dont 175 critiques" is 170 instances of one
    rule (`image-alt`), 72 percent of all findings. The number reads as 175
    different problems and is really one problem repeated.
  - Lab LCP median 21 s against a Chrome UX Report field LCP of 2,4 s "bon".
    The disclaimer explains the gap but a 9x divergence still invites the
    reader to disbelieve the lab column outright.
- Nits (not filed as issues):
  - Mixed apostrophes throughout: template copy uses the straight `'`, the
    model-written prose uses the typographic `’`, often in the same
    paragraph (pages 4, 5).
  - Straight double quotes in French copy: `SEUIL "BON"` and `un statut
    "Critique"` (page 19), where the rest of the report uses guillemets.
  - Page 19's note refers to a status `"Critique"` that does not appear in
    the table it annotates (statuses there are insuffisant / à améliorer / bon).
  - `f233et 1 autre` on page 15: missing space, and the finding-id underline
    runs into the following word.
  - Page 22 agreement error: "aucune vidéo sans sous-titres n'a été détecté"
    should be "détectée".
  - Page 5 says "La priorité 1 ci-dessus" when priority 1 is below, on a
    later page.
  - `Fichiers :` and `Fichiers (exemples) :` are used inconsistently for the
    same kind of row in the annex.
  - The `SÉLECTEUR (EXEMPLE)` column shows rule ids such as
    `[html-validate:element-permitted-content]` instead of a selector
    (page 43).
  - The glossary defines "Rendu" as a finding category, but no such category
    exists in the report's own category breakdown.
  - The scope telemetry sentence ("32 URL inventoriées ; ... 0 non
    planifiées") is repeated verbatim on pages 2, 6, 19, 22 and 23.
  - Representative pages quoted in the French report are English URLs
    (`/en/cocktail-bar-wine-spirits` for priorities 2, 3 and 6).
  - The disability-tourism reference stat cites a UK Department for Culture,
    Media and Sport survey about England, in a French report for a Bordeaux
    hotel.
  - Section 08 "Preuve de rendu" spends a full A4 page on two sentences of
    good news; roughly 85 percent of the page is empty.
  - A serious finding (`reflow-horizontal-scroll`, WCAG 1.4.10) sits in
    "Reste à traiter" while minor SEO items carry a whole ranked priority.
  - Three separate findings (f180, f181, f183) are the same untitled header
    logo link in three languages; the translation clustering did not collapse
    them.
- Issues filed 2026-09-04, 23 in total (#39 to #61). Operator-reported items first,
  each traced 1:1 to its own issue:
  - #56 audit stays marked failed after a fix-and-complete without a new scan (item 1)
  - #44 mentions-legales SIREN extraction skips pages not named "mentions-legales" (item 2)
  - #42 booking-engine detection misses non-allowlisted vendors (item 3a)
  - #43 no dashboard control to override transactional flow after a scan (item 3b)
  - #50 cover question says "le site" instead of "votre site" (item 4)
  - #51 remove "Langue du rapport" from the metadata block (item 5)
  - #52 remove the "La question a laquelle ce rapport repond" heading (item 6)
  - #53 rename "Qui utilise ce rapport" to "A qui s'adresse ce rapport" (item 7)
  - #54 section 01's three actions duplicate the "Par ou commencer" page (item 8)
  - #55 executive summary closes on ungrammatical, over-familiar prose (item 9)
  - #57 obligation and the EUR 7,500 reference absent from the executive pages (item 10)
  - #48 checklist COMPLEXITE and IMPACT column headers collide (item 11)
  Found in this pass, on top of the operator's list:
  - #39 crawler records HTTP 404 responses as visited pages
  - #40 priority example page names a URL the representative finding never occurred on
  - #41 priority page ratio can exceed the scanned-page total ("29 pages sur 28")
  - #45 appendix rows split across page breaks, column header never repeats
  - #46 French question mark uses an ASCII space and orphans onto its own line
  - #47 priority card metadata rows wrap between label and value
  - #49 table of contents lists section 10 out of page order
  - #58 "build de rendu unknown, modele 2" placeholders leak to the client
  - #59 privacy and security referentiel claimed but no privacy finding reported
  - #60 report contradicts itself about whether the site takes bookings (p20 vs p21)
  - #61 lab LCP 21 s presented alongside field LCP 2,4 s with no reconciliation
- Dependency worth carrying into triage: #57 cannot be verified fixed until #42 is,
  since the missing transactional flow is the only thing placing this hotel out of
  EAA scope, and the legal block is gated on an in-scope determination.
- Verified 2026-09-04, after the mongodb-readonly server was restored:
  - #56's premise was wrong. The `audits` document carries no status field at all.
    The "failed" lives on the `jobs` document, and the scan fully succeeded
    (crawl 32, contentScan 28/28, lighthouse 28/28). The job failed at report
    generation, on the identity guard refusing to put a detected-guess
    `nomCommercial` ("Bar Le Ferdinand a vins Bordeaux - Villas Foch") on a client
    cover. The guard worked; what is missing is a way back once the operator
    resolves it out of band. Also `auditIds` is `[]` while `auditId` is set.
    Restated on the issue.
  - #58 root cause found, and it is worse than "conditional". `readOdysseusBuildId()`
    shells out to `git rev-parse --short HEAD` and swallows every failure into the
    literal string 'unknown'. `.dockerignore` excludes `.git` from the deployment
    image, so every render in the deployed container prints 'unknown' to the client
    deterministically, and every production artifact records an unidentified build
    via `manifest.tool.odysseusVersion`. The fix is to stamp the build id at image
    build time (the deploy path already tags images by commit) rather than derive it
    from a git checkout at runtime.
  - New defect found while verifying, filed as #62 and then corrected once the
    code was read. The first diagnosis ("a row is written without its file") was
    wrong: `report-stage.ts` writes the PDF and its provenance sidecar before
    persisting the row, and there is one writer for all three callers. The real
    defect is that `fileRef` is `path.relative(auditDir, reportPath)` against a
    per-machine `ODYSSEUS_ARTIFACTS_ROOT`, so a row in the shared Atlas database
    cannot be resolved to a file from any other machine and records nothing about
    which machine rendered it. That is #38's root cause on the render side; the
    two are now cross-linked and should be fixed together.
    Standing consequence: the FR report sent to this client is not reproducible
    here. It survives only as the manual copy in `docs/report/feedback/`, whose
    sha256 matches the stored row exactly. Its EN counterpart has no local copy,
    and the only locally resolvable pair is the earlier 20:56Z one, a different
    document (52pp FR versus 50pp).
    Open question, recorded on the issue rather than guessed: where the 22:19Z
    render actually ran. Local git workspace and a local container are both ruled
    out (`docker ps -a` shows only mongo), and the deployed container matches the
    signature, but the VPS volume was not inspected.
- FR/EN pair coverage gap closed. The EN PDF was located on disk
  (`artifacts/www.villasfoch.fr/2026-09-03T20-44-46Z/reports/...-en.pdf`, 20:56Z
  generation). It pairs with the 20:56Z FR, not the delivered 22:19Z FR, so it is
  one generation behind, but it settles three language questions:
  - #48 collides in English too ("COMPLEXITYIMPACT"), so the accent was never the
    cause and the 70px column is simply too narrow. Title corrected.
  - #47 wraps in English too ("Conformance : Not / applicable"). Title corrected.
  - #41 renders "29 pages of 28" in English, confirming the arithmetic defect is in
    the shared computation rather than either language's rendering.

## 2026-09-04 — www.briketenia.com

- URL: https://www.briketenia.com/fr/
- Audit ID: cb8bad97-1cfb-4897-92bb-bef9d7266780
- Artifacts: `artifacts/www.briketenia.com/2026-09-04T19-06-02Z/`
- Discarded before this pick: **chateaudetilly.fr** (hash rank 1). Its
  uncapped audit ran 5h22 and died of a Node heap OOM at 2,532 pages
  (evidence kept in `artifacts/chateaudetilly.fr/2026-09-04T13-37-21Z/`,
  issue drafted). Hash rank 2, hoteljardinsdemademoiselle.com, discarded:
  no SIREN on candidate or qualification row, so `--siren` could not be
  supplied. Briketenia is hash rank 3.
- Render note: the first render was blocked by the cover identity guard
  (detected guess "⇒ Briketenia"); resolved the way the dashboard would,
  after checking the Sirene registry (SIREN 309585578 = SOCIETE
  D'EXPLOITATION BRIKETENIA). A second render was needed after discovering
  the analyze-time transactional-flow override never reached the report
  (issue drafted); the final PDFs are the 19:44Z pair, which show the
  operator-confirmed in_scope status.
- Verdict: substance a client can act on, undermined by the legal section's
  pipeline (the override it was told about silently not reaching the page)
  and by two places where the report appears not to know its own data: a
  footnote calling real-visitor data simulated, and the same alt-text
  heuristic described as two different problems in the two languages.
- Top concerns beyond the filed issues:
  - The transactional-flow correction path is fragile end to end: the CLI
    flag is lost at render, the dashboard path works, and the resulting
    conflict note misdescribes what detection actually found.
  - The transactional-flow detector's gap (#42's class) is what put this
    hotel's legal status at "à confirmer" in the first place; Reservit and
    CoverManager are exactly the off-domain vendors it misses.
- Nits (not filed as issues):
  - "La priorité 1 ci-dessus" / "Priority 1 above" while the priorities are
    below (recurs from the 2026-09-04 villasfoch pass).
  - Page 22's note discusses a status "Critique" that never appears in the
    table it annotates (statuses are insuffisant / à améliorer / bon), with
    straight quotes in French copy (recurs).
  - "aucune vidéo sans sous-titres n'a été détecté" agreement error (recurs).
  - Section 09 "Preuve de rendu" is two sentences on an otherwise empty page
    (recurs).
  - The driving question ("Quel est l'état actuel de votre site...?") sits
    orphaned mid-page in section 01 (recurs).
  - The summary's "Par où commencer" list splits, orphaning row 3 onto a
    nearly empty page 6, in both languages.
  - The "Conformité WCAG" heading block sits alone at the bottom of page 7.
  - EN: "verify by intent" for "à vérifier selon votre contexte" reads as
    nonsense.
  - EN annex uses French spacing before colons ("Pages :", "Files :").
  - EN mixes "analyzed" and "analysed".
  - Annex tags the alt-text heuristic with "WCAG 1.1.1" while the report
    carefully frames heuristics as non-conformance signals.
  - Annex selector column shows "[html-validate:element-permitted-content]"
    as a selector example (recurs).
  - The imprint line carries the internal "modèle 2" / "template 2" marker
    (the build-id half of villasfoch #58 is fixed; the template marker
    remains and means nothing to a client).
  - "Reste à traiter" entries split across page breaks (title on one page,
    description on the next); in EN an annex group title is orphaned at a
    page bottom.
  - The disability-tourism reference stat cites an England survey in a
    French report for a Basque hotel (recurs).
- Issues filed 2026-09-04, six in total, labelled needs-triage:
  - #64 uncapped audit of a ~2,500-page site exhausts the default Node heap
    and loses the entire run (evidence from the discarded chateaudetilly
    run)
  - #65 render-time obligation recompute discards the analyze-time
    --override-transactional-flow determination
  - #66 transactional-flow conflict note misstates what detection found when
    the manual override asserts presence
  - #67 Chrome UX Report table's footnote labels field data as lab data
    (both languages)
  - #68 alt-text heuristic finding carries two different meanings across the
    FR/EN pair
  - #69 hotel-qualify reasons defaults to qualificationVersion v3 while all
    catalogue rows are at v2

## 2026-09-05 — www.les-flotsbleus.com

- URL: https://www.les-flotsbleus.com/fr/
- Audit ID: e1b32de5-3f74-43db-8143-7ad3e6a894e9
- Environment note: first rehearsal run through the VPS dashboard's job
  queue (`app.odysseusaudit.com`) rather than the local `odysseus` CLI, per
  this session's update to `.claude/skills/audit-rehearsal/SKILL.md`
  (standing rule from here on, local CLI kept only as a documented
  fallback). No local `artifacts/` directory exists for this run; the
  scan, both analyses, and both reports live only in the VPS's MongoDB and
  its report store, reachable via the dashboard API.
- Render note: the first render was blocked by the cover identity guard
  (`nomCommercial: "Site Officiel"`, boilerplate text, not a brand name).
  Verified the correct values externally (Sirene registry for
  `raisonSociale`, live site title/header for the real brand) and
  corrected via `PATCH /api/audits/<auditId>/manual-fields` +
  `POST .../regenerate-report`, the intended operator path. Final PDFs:
  FR 35 pages, EN 33 pages.
- Verdict: a well-organized, useful report undermined by one direct
  self-contradiction in the section a nervous owner reads most carefully.
  The findings themselves are clearly explained and sensibly prioritized
  in both languages; layout and pagination are clean throughout.
- Top concerns beyond the filed issues:
  - The Legal Exposure status card reads "Threshold or flow not observed"
    (implying the EAA does not apply) immediately followed by a paragraph
    naming the exact pages where a transactional flow *was* found —
    identical contradiction in FR and EN, traced to the SME/turnover
    exemption resolving the status before the transactional-flow evidence
    is ever consulted, while the report template renders that evidence
    unconditionally regardless.
  - "Facts verified for this audit: headcount band 00 and turnover of €0"
    reads as alarming/literal to a lay owner without a one-line gloss that
    these are registry size-bracket figures, not actual revenue.
- Nits (not filed as issues):
  - The Sirene-derived turnover/headcount figures are presented with no
    context sentence explaining they are registry brackets rather than the
    business's real financials (see above; judged not to rise to an issue
    on its own, distinct from the contradiction it feeds into).
- Issues filed 2026-09-05, two in total, labelled needs-triage:
  - #71 Legal Exposure section contradicts its own obligation status when
    the SME exemption applies (root cause identified: `checkSmeExemption`
    short-circuits before the transactional-flow branch runs, but
    `renderTransactionalFlowScopeNote` renders off raw evidence regardless)
  - #72 `nomCommercial` detector picks up boilerplate ("Site Officiel")
    instead of the real brand name; caught by the existing identity guard
    before it reached a report, but the underlying detector is still wrong

## 2026-09-06 — hotel-tandem.fr

- URL: https://hotel-tandem.fr/
- Audit ID: dcf21a89-824f-4a07-9c3e-2fb08638fe55
- Environment note: VPS dashboard job queue, uncapped. jobId
  afc43a56-9b3c-49f8-8146-9eae93ae4a92. No local `artifacts/` directory;
  scan, both analyses, and both reports live only in the VPS's MongoDB and
  report store. Crawl: 94 pages visited, 33 content-scanned/lighthouse-
  measured.
- Render note: the first render paused at `needs-input` on a detected
  `raisonSociale: "O2SWITCH"` (the hosting provider, not the hotel).
  Checked the source mentions-légales page directly and confirmed the real
  identity externally (SASU HOTELIFE, SIREN 835138645, via
  annuaire-entreprises.data.gouv.fr). Corrected via the dashboard's
  manual-fields PATCH + regenerate-report. Final PDFs: FR 48 pages, EN 45
  pages.
- Verdict: substance a client can act on and a legal section that hedges
  correctly rather than overclaiming, undermined by two arithmetic/data
  problems sitting on the pages meant to be the report's factual anchor:
  a wrong-company SIREN that had to be caught by eye before the report
  could even render, and a "33/28" stat that looks like broken math to a
  reader who doesn't already know the report silently switches between two
  different page counts.
- Top concerns beyond the filed issues:
  - The wrong SIREN was not a one-off render-time surprise: it had already
    propagated into `hotel_qualifications.siteFacts.siren` at the
    prospecting stage, before this rehearsal ever touched the audit.
  - The "33/28" conflation is not confined to the KPI card; the
    Methodology page's "Coverage detail: 33 pages analyzed" sentence
    directly contradicts "28 pages analyzed" stated one paragraph above it
    on the same page, in both languages.
- Nits (not filed as issues):
  - Methodology states a language (Italian, "it") was published on the
    site but not analyzed, with no one-line reason given — technically
    correct (discovered-not-scanned per trade-off 31) but reads as an
    unexplained gap to a lay reader.
- Issues filed 2026-09-06, two in total, labelled needs-triage:
  - #76 mentions-légales SIREN detector picks the web host's SIRET
    (`firstValidSiren`, first-match-in-document-order, no section-label
    awareness) over the site editor's
  - #77 report reuses "pages analyzed" for two different populations
    (28 content-checked vs 33 Lighthouse-measured), producing a
    self-contradicting "33/28" stat and a contradictory Methodology
    sentence, identical in both languages

## 2026-09-06 — www.le-grand-chalet.fr

- URL: https://www.le-grand-chalet.fr/
- Audit ID: d9d9ec5e-ed0d-471e-9721-c2e4d979cc06
- Hotel: HOTEL LE GRAND CHALET, La Tremblade (17390), 3-star, 25 rooms,
  independent. SIREN 849964887 (raison sociale "LA CEPE"). Picked at random
  with `shuf` from a `$sample` of v2-qualified rows, not hand-picked.
- Environment note: VPS dashboard job queue, uncapped, build `53e0955`.
  jobId 9f0a909c-4665-4b56-9311-f40f5c760e11. No local `artifacts/`
  directory; scan, both analyses, and both reports live only in the VPS's
  MongoDB and report store. Crawl 91 URLs, 86 content-checked, 90
  Lighthouse-measured, 109 distinct findings (12 critical, 62 serious, 7
  moderate, 28 minor). Final PDFs: FR 41 pages, EN 39 pages.
- Start-URL deviation: qualification stored
  `finalUrl: https://www.le-grand-chalet.fr/de`, but bounded read-only curl
  showed that is an `Accept-Language` content-negotiation artifact, not a
  redirect target (no header and `fr-FR` both return 200 at `/`). Scanned
  the site root instead, with operator go-ahead. Worth watching whether
  other catalogue rows carry a `finalUrl` negotiated into a foreign-language
  subtree the same way.
- Render note: the first render paused at `needs-input` on a detected
  `nomCommercial: "Hôtel La Tremblade, quartier Ronce-les-Bains"` — an SEO
  location phrase. Corrected via the dashboard's manual-fields PATCH
  (`nomCommercial: "Hôtel Le Grand Chalet"`, `raisonSociale: "LA CEPE"`) plus
  regenerate-report. Second rehearsal running of the identity guard, second
  time it earned its keep.
- Catalogue/CLI environment fact: `odysseus prospect hotel-qualify reasons`
  returns `[]` locally because the local `.env` points `MONGODB_DB_NAME` at
  `odysseus-local` while the catalogue lives in `test`. Picked through the
  mongodb-readonly MCP server instead. Not a defect; recorded so the next
  run does not rediscover it.
- Verdict: a report worth paying for and acting on, with genuinely useful
  substance — 109 ranked findings, remediation written as instructions the
  owner can forward verbatim, an honest statement of automated testing's
  30-40% coverage limit, and a legal section that declines to conclude — but
  one an owner would send back before using. Four numbers on the summary
  spread are wrong or contradictory, the legal section states a false fact
  about the client's own business, and the English half has a typographic
  tic on every priority card. None are hard problems; together they make a
  reader wonder whether the 109 findings were checked as carelessly as the
  four numbers on page 6.
- Top concerns beyond the filed issues:
  - Three separate arithmetic contradictions land on the same two-page
    spread (89 vs 86 pages, 80 vs 63+19+0, 1 611 vs 1 565 occurrences). Each
    is filed separately, but the pattern is one missing invariant, not three
    bugs: no render-time check asserts that a count shown to a client is
    consistent with the count shown beside it.
  - Page-count denominators are not just inconsistent between two cards —
    the report gives 86, 90, and 91 across different sentences depending on
    which coverage population each was derived from. The vocabulary to
    distinguish them already exists (CLAUDE.md rule 5's coverage terms); it
    has simply never reached the client-facing copy.
- Checked and ruled out (recorded so it is not re-investigated): Lighthouse
  ran 90/90 with 0 `not-planned`, which initially looked like a
  family-stratification failure against trade-off 64. It is not. Trade-off
  64 allows a representative plus a cost outlier **per family and per
  language**, and this site has roughly 18 templates across 5 languages, so
  nearly every family+language pair has a single member and stratification
  legitimately removes almost nothing. The one French family with two
  members (`/` and `/fr`, `v1:623431ea96e420d3`) is within the allowance.
- Nits (not filed as issues):
  - The French side uses ASCII `0x20` before its colons (232 occurrences)
    where French typography wants U+00A0 — the same orphaning risk #46 fixed
    for the cover's question mark, still open for colons. No orphaned colon
    was actually observed in this run, so it is latent, not a current defect.
  - The legal section prints the raw INSEE code "tranche d'effectif 02" to a
    lay reader when the human label ("3 à 5 salariés") is present in the same
    cached payload. Folded into #78 rather than filed separately.
  - "ci-dessus" is used twice for content that appears below the sentence
    referring to it.
  - `raisonSociale` is taken from the registry's `nom_complet`
    (`LA CEPE (HOTEL LE GRAND CHALET- RESTAURANT LE BRISE LAMES)`) rather
    than `nom_raison_sociale` (`LA CEPE`). Checked and judged **by design**:
    `normalizeRegistryDisplayName` collapses `X (Y)` only when Y repeats X,
    and its comment states a genuinely different trading name in parentheses
    is real information and stays.
  - The build line prints "modèle 2" to the client. Checked: it is the
    template version, deliberate and covered by `next-steps.test.ts`, not a
    residue of #58's `unknown` placeholders. Reads as jargon to an owner, but
    it is a wording judgment, not a defect.
- Issues filed 2026-09-06, eight in total, all labelled needs-triage:
  - #78 absent registry turnover (`ca: 0`, the API's missing-value sentinel,
    alongside €64,713 net profit) printed as a verified "0 €" and used to
    claim the SME exemption — bypassing `checkSmeExemption`'s own
    `turnover === null` guard, whose comment forbids claiming an exemption
    without positive evidence. Non-negotiable rule 6 territory.
  - #79 brand-name detector promotes an SEO location phrase when one page's
    title is counted twice (trailing-slash duplicate plus a rendered redirect
    stub clear the `>= 2` frequency gate; the length tie-break then favours
    the terser SEO segment; `og:title` carries the correct name and is never
    consulted). Same field as the closed #72, different mechanism.
  - #80 "89 pages with at least one critical finding" beside "86 pages
    analysed" — the #41 / #77 / `53e0955` family again, with the fraction
    removed but the contradiction intact.
  - #81 WCAG 2.1.3 (level AAA) listed with a blank name inside a "niveau AA"
    conformance line; `isAuditedConformanceLevel` exists and is applied only
    in `conformance-rollup.ts`, never in `buildLegalRelevance`.
  - #82 English report uses French colon spacing ("Complexity : Low") on
    every priority card, 136 occurrences, with "Ownership:" correct two lines
    above it in the same card.
  - #83 "80 findings covered by the priorities" contradicts the 63 + 19 + 0
    breakdown beneath it; findings in two priorities counted once distinctly
    and twice in the sums, with page overlap disclosed but finding overlap
    not.
  - #84 accessibility priority illustrated by a performance metric (CLS),
    sharing its representative finding with the performance priority, and
    reporting 1 611 occurrences against a site-wide accessibility total of
    1 565.
  - #85 a 200-response redirect stub (`/fr`) counted as an analysed page,
    contradicting the report's own methodology sentence, and the mechanism
    that defeated the brand-name heuristic in #79.
