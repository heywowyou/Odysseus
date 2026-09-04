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
