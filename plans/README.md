# Milestone 9c hotel prospecting and outreach plans

Generated with the `improve` and `codebase-design` skills on 2026-08-27.
Planned against merge commit `f7ef7cf` on `main`. The operator requested that
milestone work continue directly on `main`; executors must not create an
alternative branch unless that instruction changes.

This plan set reconciles the shipped 9a, 9b, and 9b.5 system, canonical project
documents, and the operator-supplied M9 proposal drafts. The drafts were
consolidated into these plans and removed; Git and session history retain their
provenance. Execute these slices in dependency order, honor every STOP
condition, and keep this index and the session handoff current so Codex or
Claude Code can resume without inference.

## Outcome

Odysseus will build a national French hotel catalogue, retain only hotels rated
at least three stars for this campaign, cheaply qualify their own websites,
prescan and rank the strongest prospects, publish safe expiring previews, and
prepare reviewed Gmail draft sequences. Sending remains manual. The first 100
hotel contacts form a controlled experiment with preserved provenance,
suppression, retention, and outcome measurement.

## Binding decisions

1. **Single-source national catalogue.** Atout France's classified-accommodation
   export is the hotel catalogue. Amended twice on 2026-08-27, both times on
   measurement rather than preference (see "Measured source facts" below).
   First, DATAtourisme was demoted from base to supplementary: Atout France is
   the authoritative register of the official star rating that binding decision
   2 makes a hard gate, and it already carries the declared website, room
   count, and commune in a single 3.6 MB file. Then DATAtourisme was dropped
   entirely, for a structural reason rather than a coverage one: it is not the
   classification register, so a hotel found only there can never be rated, and
   therefore can never become campaign-eligible. It cannot grow the eligible
   population at all. Its one residual use, an alternate website for a hotel
   already in the register, needs a name-plus-postcode join that binding
   decision 4 makes manual-review only, and the register already supplies a
   website for 99.6 percent of eligible hotels. Join the repository's shipped
   Sirene machinery before website qualification. AFNIC is not the base
   discovery source for this campaign.
2. **Hard three-star campaign gate.** A verified rating of three, four, or five
   stars is eligible. Lower-rated hotels are retained as
   `parked: below-three-stars`, never silently discarded or selected. Unknown
   or conflicting ratings are parked for review, not assumed eligible.
3. **Measured Overpass fallback.** After joining, resolving own domains, and
   running cheap qualification, report usable-domain yield. Add an OpenStreetMap
   Overpass source adapter only if yield is below 8,000, the lower bound of the
   8,000 to 15,000 target. Do not add it speculatively.
4. **Conservative identity resolution.** Exact SIRET, SIREN, and normalized
   registrable-domain evidence may auto-resolve. Name plus postcode creates a
   manual-review candidate only. Use an approved public-suffix implementation;
   do not hand-roll eTLD parsing.
5. **Hotel groups stay visible.** Preserve chain/group evidence and route it to
   a separate review queue so a single decision does not accidentally fan out
   across many properties.
6. **Separate catalogue and prospect events.** Add a canonical hotel-candidate
   catalogue for source joins and qualification state. Keep the shipped
   append-only `prospects` collection as immutable qualification events rather
   than migrating it to a mutable registry.
7. **Cheap qualification precedes browsers.** DNS, TLS, bounded HTTP, own-domain
   checks, parked/aggregator detection, booking path, accessibility declaration,
   group status, and minimum-establishment facts run before browser capacity is
   spent.
8. **Prescan is a distinct scanner path.** Reuse scanner primitives, but do not
   call `runAuditStage` or reshape the full-audit contract. The prescan owns its
   three-page budget, no-Lighthouse policy, measurements, persistence, and CLI.
9. **Evidence is its own slice.** Deterministically produce at most one render
   comparison and one measured annotated crop plus three to five safe summaries.
   Missing reproducible evidence makes a candidate evidence-incomplete.
10. **Scoring is pure, immutable, and versioned.** Store score runs separately
    from prescans. Do not change `computeBrokennessScore` or
    `isProspectingWorthy`; the existing cost gate remains intact.
11. **Role contacts only.** Discover only approved role addresses on the
    hotel's own domain. No named contacts, free-mail addresses, email guessing,
    SMTP probing, catch-all testing, or phone collection.
12. **Ninety-day operational retention.** Source snapshots, candidates,
    prescans, previews, contacts, drafts, and outcomes expire by policy.
    Permanent suppression remains a separate hash-only collection.
13. **No new prospecting package.** Pure types/decisions stay in `core`, model
    calls in `llm`, persistence in `store`, orchestration/adapters in
    `interface`, commands and private operator views in `cli`, preview rendering
    in `report`, and public preview routes in the standalone `site`.
14. **Manual Gmail workflow only.** The mailbox adapter may create drafts and
    read limited metadata but has no send method. No sequencer, SMTP/IMAP
    replacement, automatic follow-ups, VPS migration, Atlas migration, or
    Tailscale setup belongs to this milestone.
15. **Public previews minimize disclosure.** They contain vetted summaries and
    at most two evidence assets, not finding IDs, selectors, exact affected
    URLs, raw audit data, population claims, or legal conclusions.
16. **Legal text and disclosures are deterministic.** The model writes only
    guarded connective prose. Hotel-sector wording remains source-gated and
    all user-facing output is French and English from the start.
17. **Telephone prospecting remains closed.** Phone numbers are neither
    collected nor used in this milestone.
18. **Every operational batch is bounded.** Source, qualification, prescan,
    scoring, evidence, contact, and drafting commands support dry-run, explicit
    limits, checkpoints, and reasoned yields. Amended 2026-08-27: the
    per-named-site permission requirement is withdrawn, since it was being
    re-asked for every batch of a campaign defined by checking thousands of
    declared domains. Boundedness and crawling politeness are what keep a batch
    safe and both stand; see CLAUDE.md, "Testing".

## Measured source facts

Measured 2026-08-27 by read-only fetches of the published open-data files,
before and during implementation. Recorded here so a later executor inherits
the evidence rather than re-deriving it. The source is regenerated daily, so
these figures should be re-measured, not assumed, whenever the campaign
population is quoted. `prospect hotel-ingest --dry-run` reproduces them.

**Atout France**, `hebergements_classes.csv`, data.gouv.fr dataset
`hebergements-touristiques-classes-en-france`, licence `fr-lo`. Semicolon
delimited, UTF-8, header row present, missing values written as the literal
string `-` rather than left empty. Columns: `DATE DE CLASSEMENT`,
`TYPOLOGIE ÉTABLISSEMENT`, `CLASSEMENT`, `CATÉGORIE`,
`MENTION (villages de vacances)`, `NOM COMMERCIAL`, `ADRESSE`, `CODE POSTAL`,
`COMMUNE`, `SITE INTERNET`, `TYPE DE SÉJOUR`,
`CAPACITÉ D'ACCUEIL (PERSONNES)`, `NOMBRE DE CHAMBRES`,
`NOMBRE D'EMPLACEMENTS`,
`NOMBRE D'UNITES D'HABITATION (résidences de tourisme)`,
`NOMBRE DE LOGEMENTS (villages de vacances)`, `classement prorogé`.

| Measure | Count |
| --- | --- |
| Rows, all accommodation typologies | 21,428 |
| `HÔTEL DE TOURISME` rows | 13,301 |
| Hotels rated 3, 4, or 5 stars | 9,765 |
| Of those, carrying a `SITE INTERNET` value | 9,730 |
| Hotels rated 1 or 2 stars (parked) | 3,536 |

The export does not quote fields but does contain literal quote characters
inside them (`RN 6 - Lieu dit "Le Chaumois"`). A CSV parser at its usual
defaults rejects the whole file on the first such row. It also publishes
scheme-less websites (`www.example.fr`) alongside absolute ones; those are
stored verbatim, since deciding what a declared string resolves to belongs to
qualification.

**DATAtourisme**, flat CSV export, data.gouv.fr dataset
`datatourisme-la-base-nationale-des-donnees-publiques-dinformation-touristique-en-open-data`,
Licence Ouverte 2.0. Evaluated and rejected as a second source, 2026-08-27.
Nineteen regional files totalling roughly 430 MB plus a 275 MB national file,
comma delimited, UTF-8, hotels identified by the ontology URI
`https://www.datatourisme.fr/ontology/core#Hotel`. It carries a
contributor-supplied `Classements_du_POI` that is not the classification
register, which is what makes it structurally unable to contribute: an
establishment found only here can never be rated, so it can never clear the
campaign gate. Measured coverage on the one region checked, Corsica: 85 hotels
against Atout France's 391, a 4.6x gap in the wrong direction. An adapter for
it was built and tested against the real regional export before being removed;
recover it from Git history if the bad-URL measurement in plan 003 ever makes
the alternate-website path worth a manual-review join.

**Neither source carries SIRET or SIREN.** The company identifier comes from the hotel's own published identification during cheap qualification,
reusing the shipped mentions-légales extraction path, not from a catalogue
column. Plan 002's exact-identifier auto-resolution is fed by the site, not by
the source.

**Identity and group facts, measured 2026-08-27 by resolving the full 13,301
hotel export into a throwaway database.** Reproduce with
`prospect hotel-resolve --dry-run`.

| Measure | Count |
| --- | --- |
| Source rows resolved into candidates | 13,301 |
| Independent hotels | 9,480 |
| Chain or group members, retained but excluded from the campaign | 3,643 |
| Hotels on a third-party vendor platform, routed to review | 113 |
| No usable declared website | 65 |
| Distinct domains held by more than one establishment | 207, covering 3,729 hotels |
| Largest single group | `accor.com`, 1,196 properties |
| Queued for manual review | 187 |
| Campaign-ready: eligible, independent, own domain | 7,069 |

Three facts worth carrying forward:

- **Within-source identity dedupe is a no-op today.** Every source row has a
  distinct `sourceId` and the catalogue carries no SIRET or SIREN, so the
  registrable domain is the only axis that merges anything. Group detection,
  not identity dedupe, is the load-bearing step in plan 002.
- **Only nine name-plus-postcode collisions exist in the whole export.** Manual
  review is therefore a real queue a person can clear, not a bottleneck. The
  other 178 queued items are vendor-hosted or website-unusable, not identity
  doubt.
- **7,069 campaign-ready candidates**, against 7,094 hotels holding a unique
  domain measured before implementation. The operator's position on this figure
  stands: it is reported, not acted on, and binding decision 3 measures usable
  yield only after plan 003's cheap qualification.

**Cheap qualification facts (qualification v1), measured 2026-08-27 by a full
live run over the 13,301 candidates** (read-only DNS/TLS/bounded-HTTP checks, no browser, under
non-negotiable rule 5). The run took 81 minutes at concurrency 3 and reconciles:
every candidate carries exactly one outcome. Reproduce the planning counts with
`prospect hotel-qualify --dry-run`, the table with
`prospect hotel-qualify report`.

| Outcome | Count |
| --- | --- |
| Qualified | 5,720 |
| Parked | 2,456 |
| Rejected | 1,341 |
| Already engaged (accessibility statement published) | 28 |
| Group-routed | 3,756 |

Loss reasons, largest first: `no-own-domain` 3,821, `group-member` 3,643,
`below-three-stars` 3,536, `dns-unresolved` 401, `redirect-offsite` 340,
`tls-invalid` 214, `awaiting-review` 187, `http-error` 151, `fetch-timeout` 127,
`vendor-hosted` 113, `domain-moved` 44, `accessibility-statement-published` 28,
`parked-domain-page` 25, `robots-denied` 16, `redirect-loop` 3,
`non-html-response` 2. A candidate accumulates reasons rather than
short-circuiting, so these sum above the candidate count by design.
`redirect-offsite` and `domain-moved` are the two the v2 pass below revisits;
`domain-moved` no longer exists as an outcome after it.

Non-blocking notes: `redirected-within-site` 4,141, `no-booking-path-detected`
3,463, `no-identification-published` 2,437, `booking-path-offsite-only` 487.

Three facts worth carrying forward:

- **The declared websites are mostly alive.** Of the 7,069 campaign-ready
  candidates, 5,720 qualified under v1 and 5,995 under v2. Hard site failures
  (DNS, TLS, HTTP, timeout,
  redirect, parked page, robots) account for roughly 1,300 - about 19 percent
  of declared websites unusable, which is the "large unusable-website rate"
  test the DATAtourisme alternate-website path was deferred against. It is not
  large enough to reopen that decision.
- **The booking gate must stay soft.** `no-booking-path-detected` fires on
  3,463 candidates - over a quarter of the whole export. Binding decision 3 of
  plan 003 (record, do not gate) is confirmed by measurement: hardening the gate
  on today's no-browser detection would park thousands of hotels on a detection
  weakness. `booking-path-offsite-only` at 487 is the fraction where a vendor
  booking engine was the only funnel found.
- **Identification is published less than half the time.** 2,437
  `no-identification-published` means the mentions-legales SIREN recovery that
  plan 002's exact-key resolution depends on is available for the majority but
  far from all. Sirene-derived facts must stay optional downstream, never
  assumed present.

**Binding decision 3 is triggered and unresolved.** Qualified usable own-domain
yield is 5,720 against the 8,000 floor (5,995 after the v2 reconciliation
below), a shortfall of 2,280, so
`decideOverpassNeed` returns `propose`. The run stopped at that and ingested
nothing. Adding an OpenStreetMap Overpass source is an operator decision that
has not been taken; do not treat the shortfall as authorization. The v2
reconciliation below moves this number, and does not move the decision: the
operator declined Overpass on reasoning independent of the shortfall's size.

**Qualification v2, measured 2026-08-28.** The v1 rule rejected every
off-domain redirect. Measured over the stored v1 verdicts, 384 rows carry a
redirect verdict, 383 of them with a usable landing URL, across 341 distinct
registrable targets: 71 land on a target several establishments reach or already
declare, and 312 land on one exactly one establishment holds, which is a hotel
that renamed itself rather than a chain. The remaining row recorded no landing
URL at all and keeps its v1 rejection. See
trade-off 37 for the rule and why the count spans the whole catalogue rather
than the redirect rows alone.

Reproduce the classification with
`prospect hotel-qualify reconcile-redirects --from-version v1 --dry-run`, which
contacts nobody. The real pass re-probed the 312 adopted domains with the same
read-only checks and wrote a complete v2 generation, one row per v1 row.

| Outcome | v1 | v2 |
| --- | --- | --- |
| Qualified | 5,720 | 5,995 |
| Parked | 2,456 | 2,412 |
| Rejected | 1,341 | 1,037 |
| Already engaged (accessibility statement published) | 28 | 30 |
| Group-routed | 3,756 | 3,827 |

Of the 312 adopted domains, 275 qualified, 35 were rejected on their own merits
(the new domain was dead, or redirected off-site again, which is not chased),
and 2 already publish an accessibility statement. `redirect-offsite` falls from
340 to 87 and `domain-moved` disappears entirely; `domain-adopted-after-redirect`
records 312 as a note, so an adopted domain is never mistaken downstream for a
catalogue fact.

The pass wrote one v2 row for every v1 row - 13,301 read, 13,301 written, 12,918
copied forward unchanged. Completeness is load-bearing rather than tidy:
`listCandidatesToPrescan` filters on the candidate's qualification pointer, so a
v2 generation holding only the reconciled rows would have shrunk the prescan
population to 312 while looking like a correct filter.

Both generations are retained: `hotel_qualifications` is keyed on
(`qualificationVersion`, `candidateId`), so
`prospect hotel-qualify report --qualification-version v1` still returns the
table above. The pointer on the candidate is single and current, which is why a
prescan dry run against v1 now plans zero pages. That is the pointer behaving as
designed, not a lost generation.

**Population caveat for later analysis.** Atout France lists only *classified*
accommodation. A hotel that never sought classification, or whose classification
lapsed, is absent from the base catalogue entirely. The campaign population is
therefore definitionally "classified French hotels", which must be stated
plainly wherever plan 014's results are interpreted rather than described as
"French hotels".

## Deep module seams

- `HotelCatalogueSource` in `interface`: the streaming Atout France adapter
  behind one normalized, checkpointable ingestion contract. One source today;
  the seam exists so the ingest orchestration, the yield report, and the CLI do
  not each grow their own knowledge of a file format.
- Hotel identity resolver in `core`: pure exact-resolution decision returning
  resolved, manual-review, or unresolved with provenance and reason codes.
- Hotel-candidate helpers in `store`: catalogue state and joins remain separate
  from append-only qualification events.
- `qualifyHotelWebsite(...)` in `interface`: bounded no-browser qualification
  that emits structured facts and a deterministic disposition.
- `prescanSite(...)` in `interface`: one narrow three-page orchestration seam
  over shared crawler/scanner primitives, independent of the full audit.
- Evidence builder in `core`/`interface`: deterministic summaries and measured
  asset selection without model choice.
- `computeHotelOutreachScore(...)` in `core`: pure versioned score plus complete
  breakdown, persisted as an immutable score run.
- Role-contact discovery in `interface`: one own-domain, allowlist-enforcing
  interface whose output cannot represent a named or free-mail contact.
- `generateOutreachPreviewHtml(...)` in `report`: escaped HTML over a minimal
  public input, independent of the paid report.
- `PreviewPublisher` in `interface`: approved production adapter plus local test
  adapter; the standalone site keeps its own narrow read-only provider seam.
- `MailboxDraftAdapter` in `interface`: create/read/delete draft and limited
  thread metadata only, with no send or generic-request capability.
- Store helpers own state transitions; callers never issue raw Mongoose updates.
- The private operator interface is server-rendered through the existing CLI
  HTTP surface and consumes bounded view models rather than collection objects.

## Execution order and status

| Plan | Title | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| [001](archive/001-hotel-catalogue-ingestion.md) | Ingest the national hotel catalogue | P1 | L | none | DONE |
| [002](archive/002-hotel-identity-and-groups.md) | Resolve identities, own domains, and groups | P1 | L | 001 | DONE |
| [003](archive/003-cheap-hotel-qualification.md) | Qualify hotel websites without a browser | P1 | L | 002 | DONE |
| [004](archive/004-distinct-hotel-prescan.md) | Build the distinct three-page hotel prescan | P1 | L | 003 | DONE |
| [005](archive/005-hotel-evidence-capture.md) | Capture the two outreach evidence assets | P1 | L | 004 | DONE |
| [006](archive/006-versioned-hotel-scoring.md) | Score candidates with immutable breakdowns | P1 | L | 001-005 | DONE |
| [007](archive/007-role-contact-discovery.md) | Discover approved own-domain role contacts | P1 | M | 006 | DONE |
| [008](archive/008-safe-outreach-preview-html.md) | Generate safe outreach preview HTML | P1 | L | 005 | DONE |
| [009](archive/009-expiring-preview-publication.md) | Publish expiring previews and compliance pages | P1 | L | 008 | DONE |
| [010](archive/010-validated-outreach-prose.md) | Generate and validate outreach prose | P1 | L | 006, 008 | DONE |
| [011](archive/011-gmail-drafts-without-send.md) | Create reviewed Gmail drafts without sending | P1 | L | 007, 009, 010 | DONE |
| [012](archive/012-replies-suppressions-outcomes.md) | Reconcile replies, suppressions, and outcomes | P2 | L | 011 | DONE |
| [017](archive/017-dashboard-ui-overhaul.md) | Overhaul the operator dashboard UI to shippable quality | P2 | L | 001-012 | DONE |
| [013](archive/013-outreach-operator-interface.md) | Add the private outreach operator interface | P2 | L | 001-012 | DONE |
| [016](archive/016-hosted-operator-dashboard.md) | Host the operator dashboard on a public EU server | P2 | M | 001-013 | DONE |
| [014](./014-first-100-hotel-rollout.md) | Run the controlled first-100 hotel rollout | P2 | M | 001-013, 016 | IN PROGRESS (Step 1 gates recorded 2026-09-08; runbook at [docs/product/first-100-rollout-runbook.md](../docs/product/first-100-rollout-runbook.md)) |
| [015](archive/015-consolidate-work-tracking.md) | Make plans and issue lifecycle unambiguous | P1 | M | none | DONE |
| [018](archive/018-report-executive-readability.md) | Make the paid report readable as an executive decision document | P1 | L | none | DONE |
| [019](archive/019-report-preparation-and-personalization.md) | Prepare and personalize the paid report safely | P1 | L | 018 | DONE |
| [020](archive/020-report-financial-evidence-and-legal-reference.md) | Add defensible financial evidence and the general legal reference | P1 | L | 019 | DONE (financial-opportunity feature explicitly deferred) |
| [021](archive/021-complete-audits-without-template-repetition.md) | Keep full-site audits complete without repeating template work | P1 | L | 018-020 | DONE (2026-09-03: the operator's local-fixture ground-truth validator replaced the live-site review and passes; issue #20 closed) |
| [022](archive/022-dashboard-and-site-design-refactor.md) | Refactor the operator dashboard and public site UI with the Impeccable workflow | P2 | L | none | DONE (og:image and 4 unproposed inventory rows deferred) |
| [023](archive/023-report-visual-design-refactor.md) | Revise the report visual design as a gated, operator-directed redesign | P2 | L | 018-021, operator-approved direction | DONE (review accepted 2026-09-02; the glossary ordering change deliberately left to plan 024) |
| [024](archive/024-report-feedback-followups.md) | Close three small gaps between the report and Conseil papa | P2 | S | 018, 019 | DONE (trade-off 44 order amended to glossary-last 2026-09-01; the reference HTML's stale remaining-work region moved to issue #25) |
| [025](archive/025-llm-provider-switch.md) | Switch the LLM provider from Mistral to OpenAI gpt-5.4-mini | P1 | M | none | DONE (operator accepted the rendered French and English reports 2026-09-03) |
| [026](archive/026-faster-audits-without-weaker-measurements.md) | Make a single full audit faster without weakening what it measures | P2 | M | none | DONE (Steps 1-3 shipped and measured on the VPS 2026-09-05: 570 s to 498 s on a 29-page site, Lighthouse segment -16.6 %, coverage and findings unaffected. Step 4 declined on measurement; Steps 5 and 6 dropped 2026-09-07 because Step 0 showed the cost is page classification, not serialization; Step 7 done, trade-off 74 added) |
| [027](archive/027-french-report-prose-quality.md) | Make the French report read like consulting prose | P1 | M | 018, 019, 025 | DONE (operator read and accepted both stored French PDFs 2026-09-07; three residual copy defects fixed in follow-up commits) |
| [028](archive/028-writing-pass-consistency-guards.md) | Close the writing-pass consistency gaps plan 027 didn't cover | P2 | S | 027 | DONE (three additive guards shipped, `packages/llm` suite green, `pnpm run check` clean, 2026-09-07) |
| [029](archive/029-writing-pass-open-levers.md) | The two writing-pass levers plan 027 left as operator decisions | P3 | M | 027, 028 | DONE (Steps 2-3 shipped 2026-09-07; Step 1 measured and deferred 2026-09-08 - production stays at `reasoning_effort: 'none'`, no measured gain and one regression at `low`, a guard trip at `medium`) |
| [030](archive/030-outreach-dashboard-wiring.md) | Wire outreach draft generation into the operator dashboard | P2 | M | 011-013 | DONE (shipped in d5ce20b 2026-09-08; the manual real-hotel pass from the plan's Verification section remains an operator step) |
| [031](archive/031-operator-preview-render.md) | Let the operator view the pre-purchase preview's current content | P3 | S | 008, 009 | DONE |
| [032](archive/032-site-context-from-catalogue.md) | Populate the writing pass's site context from the hotel catalogue | P3 | M | 029 | DONE (2026-09-08; catalogue facts now enrich the writing pass and are persisted as analysis provenance) |
| [033](archive/033-report-render-qa-and-copy-review-trial.md) | Gate delivery on deterministic render QA and measure an advisory copy-review pass | P1 | L | none | DONE (2026-09-08; operator closure: atomic render gate and correction artifact shipped; overflow and permissioned campaign work deferred) |
| [034](archive/034-hotel-outreach-v2-booking-detection.md) | Port booking detection to prospecting and ship hotel-outreach-v2 | P1 | M | none; gates 014 Step 3 | DONE (2026-09-08; incident during the bounded batch documented in trade-offs.md#75/issue #114; v2 approved, scored, diffed, and wave-1 cohort selected under it) |
| [035](archive/035-full-audit-checkpoint-and-resume.md) | Resume full audits across crashes and redeploys instead of restarting from zero | P1 | L | none | DONE (2026-09-10; live acceptance on production: the operator-authorized forced redeploy during the Belleval full audit re-claimed the job from its crawl checkpoint with 30 reused pages and the audit completed without restarting from zero; resolves issue #124) |
| [036](archive/036-lcen-publisher-identification-evidence.md) | Publish per-field detection evidence for the LCEN publisher-identification finding | P2 | M | none | DONE (2026-09-10; the authorized lescorderies.com full audit correctly left the finding silent, the site publishes SIREN 487901282 and TVA, the checked-page evidence payload is live in the scan artifact, and both language reports were reviewed with the approved copy and no legal conclusion; resolves issue #161) |
| [037](037-full-scan-outreach-preview.md) | Replace the prescan outreach preview with a full-scan scorecard on the audit page | P1 | L | 034, 035, existing preview lifecycle | READY (operator-approved design, 2026-09-11) |
| [038](038-public-site-evidence-dossier.md) | Recast the public site as a clear, evidence-led audit offer | P1 | M | none | READY (operator-approved design, 2026-09-11) |

Plan 016 (added 2026-08-30, operator-approved) lands between 013 and 014:
the hosted operator dashboard goes live before the rollout campaign so the
operator can run drafts, replies, and suppressions from anywhere. It was
planned against `dbba6ba` with the decisions recorded in its own header.
`DONE` 2026-08-31: steps 1, 2, and 5's code half landed that morning, and
the live operator walkthrough completed steps 3 and 4 the same day (VPS at
`app.odysseusaudit.com`, login and wrong-password lockout verified in the
browser, reboot proof, nightly backups with a passed restore drill, and the
in-container PDF glyph check confirmed by the operator). One defect found
during the live run is filed as issue #18 (crawl progress bar on uncapped
full audits); it does not gate the deployment.

Routine dashboard releases were automated 2026-09-01 without changing plan
016's hosting boundary: an operator-triggered workflow verifies successful CI
for the exact main commit, then deploys it immutably with a live check and
rollback. See `deploy/runbook.md` section 7A and trade-off 61.

Plan 019 `DONE` 2026-09-01: all eight steps landed in five commits
(`b219e43` the canonical contract, trade-off 62, and the core
report-preparation module, `0310e26` store persistence and the one
selected-pair selector, `a9878df` the Prepare report endpoints and
candidate-first regeneration plus the outcome-oriented title instruction,
`836f561` selector-bound rendering, the bilingual personalization in the
cover and opening, and the persistless candidate preview, `ffc1632` the
Prepare report dashboard card). The suite is green: the plan's five-package
validation sweep passes at the unit tier (2863 tests) with the report e2e
tier green in isolation, and typecheck, formatting, and `pnpm run check`
pass. `DONE` 2026-09-01: the operator's manual review completed on the La
Coorniche audit (form, bilingual fallbacks, journey tri-state wording, live
regeneration, candidate preview without persistence, approval, and re-render
of the paid report). The review surfaced and fixed four live-found defects,
each with its own commit and regression tests: the selector crashing on
provenance-less legacy analyses (`1e87b24`), the analyses collection typing
the provenance stamp as String so strict comparisons against the audit row
never matched (`6b7fb51`, plus a one-time data migration and an audit-row
backfill; the durable backfill gap for other legacy rows is issue #22),
provider rate limits burning all retry attempts with no pacing (`f9cbca5`),
and the legacy fallback adopting a ready candidate's or a failed run's
partial analyses as the current pair (`6600749`).

Plan 018 `DONE` 2026-09-01: all nine steps landed in six commits
(`cc6e39f` canonical design and pagination, `82326f1` section order and the
minimal cover plus metadata sheet, `4e70093` outcomes-first cards and the
synthesis ending, `c2442c5` the page-count warning, `efada91` the completed
pagination-invariant rewrite, `7a41759` the Complexity vocabulary the
rendered-output review caught). Trade-off 44 records the compact-flow
retirement. The suite is green and rendered PDFs were reviewed page by page
against the plan's checklist: the English La Coorniche report (34 pages,
from the current 2026-09-01 analysis), both de-identified fixture pairs
(33-34 pages), and the stress fixture through the invariant suite. The French
La Coorniche gate passed during plan 019's operator review after the
severity-vocabulary retry defect was fixed. Residuals from the review for a
later pass include minor group-header orphans in the La Coorniche and fixture
checklists at
appendix page breaks, the FR cover question wraps its "?" onto its own
line, and the small-site stored EN analysis still carries pre-plan model
prose (WCAG 2.1 wording, priority order and Complexity ratings that differ
from its FR twin) until its analyses are regenerated under plan 019.

Plans 018 through 020 (rewritten 2026-08-31, operator-approved) are **not 9c
slices**. They are report-deliverable work arising from a consulting review of
a real client report, recorded in
`docs/report/feedback/2026-08-30-conseil-papa.md`. Execute them in order: 018
first makes the report readable with safe generic copy; 019 adds the preparation
workflow, personalization, evidence-bound journeys, and candidate writing; 020
adds strictly eligible financial evidence and the bounded general legal
reference. Plan 018 depends on nothing in this roadmap and may run in parallel
with 014 or the remaining 016 operator work, but 019 depends on 018 and 020
depends on 019. They are listed here because `plans/` is the single home for
approved execution-ready plans.

Plan 021 (added 2026-09-01, operator-approved direction) resolves issue #20
without restoring a silent page cap or turning the paid audit into a small
sample. It inventories the full site, keeps content-sensitive checks on every
successfully crawled HTML page (including listings), selects only the serialized
Lighthouse work by deterministic page family and measured outliers, records
pass-specific outcomes, and reports one distinct finding separately from its
affected pages and occurrences. It follows plans 018 through 020 because it
changes their final report coverage language and must not be layered over their
in-flight files.

Plan 022 (added 2026-09-01, operator-approved, DONE) ran the Impeccable
workflow (skill 4.1.2, removed from the repository on 2026-09-09; decision
record in `docs/research/design-skill-alternatives.md`) over the two
surfaces it is scoped to: the operator dashboard in Operate mode and the
public site in Persuade mode. It has no file overlap with the report
sequence and may be scheduled between 019 and 021 sessions, but never
concurrently with another active plan in the same tree. The report and its
docs were excluded through the skill's project config while it was
installed. Alongside the visual pass, it ran a dedicated
naming and information-architecture audit of the dashboard, since the
operator has found its section names, labels, and buttons unclear: every
proposed rename is recorded in an inventory the operator approves, rejects,
or reworks before it ships bilingually.

Plan 023 (added 2026-09-01, operator-approved direction) is the only plan
allowed to revise the report's visual design, and only as a gated,
operator-directed redesign: plans 018 through 021 must be `DONE`, the
operator picks the direction from an evidence pack in which the Impeccable
skill is read-only input, and the canonical design documents, flat sources,
and `nocturne.css` move together with the report's own invariant suites as
the acceptance gate. It must not start while 019 through 021 have
uncommitted report files.
`DONE` 2026-09-02: the operator picked direction A (refine Nocturne, with
Inter and the dark ground kept as recorded bans) from the evidence pack,
then authorized execution past 021's `DONE` gate and accepted the recorded
review, ruling the glossary-ordering item to plan 024 where it already
lives. Steps landed as `6cc9172` (design documents and flat sources) and
`1188c86` (stylesheets, templates, reference refresh, checklist pixel
baseline regenerated deliberately); trade-off 65 records the revision and
its fresh-approval consequence. Page counts were unchanged at 34/33/33/33
across both fixtures and languages. Leftovers: `report.reference.html`'s
remaining-work region still shows a pre-plan-018 structure (now tracked as
issue #25; plan 024 closed without taking it on), and the reference audit
render still waits on the `raisonSociale` dashboard confirmation.

Status values: `TODO`, `IN PROGRESS`, `IMPLEMENTED`, `DONE`,
`BLOCKED: <reason>`, or `REJECTED: <reason>`. `IMPLEMENTED` means every done
criterion is met and the suite is green, but a verification step still needs a
person - typically reading the first run against a live operator-named site.

## Work lifecycle

Each kind of work has exactly one home:

1. GitHub issues (on `heywowyou/Odysseus`, via `gh`) are the intake for a
   newly verified defect, request, or decision. See
   `docs/agents/issue-tracker.md`.
2. A numbered file under `plans/` is an approved, execution-ready plan.
   A raw finding is never stored here as if it were a plan.
3. `docs/report/report-feedback-deferred-items.md` holds only report work
   with a current reproduction or an explicit future trigger. Fixed items
   are removed once verified; Git history retains the evidence.
4. Durable shipped rationale moves to the owning canonical document or
   `docs/decisions/trade-offs.md`. Closed evidence stays in Git and issue
   history.
5. The active session log (`docs/session/current-session.md`, gitignored)
   holds only in-flight recovery state and never becomes a backlog.

## Dependency notes

- Plan 034 (operator-directed 2026-09-08) gated plan 014's Step 3 freeze via
  the rollout runbook's gate E; closed the same day once the v2 weight
  table was operator-approved, the v1-to-v2 score diff reviewed, and the
  wave-1 cohort selected under it. Its bounded prescan batch surfaced a
  scope incident (`docs/decisions/trade-offs.md#75`, issue #114 open);
  scoring and selection ran only over the operator-approved subset.

- Plan 025 is independent of the 018 through 021 report sequence and of 022
  through 024, and may run as a separate session. Its `CLAUDE.md`,
  llm-layer-rules, trade-offs, and operator-obligations edits are part of the
  plan itself, not drift, and its live-call step is standing-authorized only
  after its own `CLAUDE.md` amendment lands in the same plan. The operator
  must supply `OPENAI_API_KEY` before its live smoke and A/B calls. It must
  not fold or revert the plan 020 session's uncommitted changes.

- Plans 018 through 020 form a strict report sequence. Do not begin 019 until
  018's section order and pagination contract are verified, and do not begin
  020 until 019's single preparation aggregate and interface are verified.
- Plan 022 needed no report-sequence file and ran in parallel with 019
  through 021 as separate sessions. Its scope was exactly the two surfaces in
  its briefs; its report exclusion lived in the Impeccable skill's project
  config, removed with the skill.
- Plan 023 follows plan 021 and adds its own operator gate: no design work
  before the evidence pack and the recorded direction pick. It is the only
  instrument that may revise the report visual design, and it moves the
  canonical documents and the stylesheet in one slice.
- Plan 021 follows plan 020. Its scanner work and report coverage semantics are
  one corrective slice; do not start its report half against an unfinished
  report sequence or split it into a scanner behavior that the PDF cannot yet
  disclose truthfully.
- Plans 001 through 007 establish the candidate funnel in order. Plan 003 is
  also the mandatory coverage checkpoint for deciding whether an Overpass
  adapter becomes a new, separately planned ingestion task.
- Plan 008 can begin after plan 005. Plan 006 can proceed once plans 001 through
  005 are stable. Plan 010 needs plan 006 selection facts and the plan 008
  facts-block contract.
- Plan 009 follows plan 008 and retains its provider-approval gate.
- Sending-domain, mailbox, and warmup work may run manually in calendar time,
  but plan 011 cannot create a real draft until plan 007 has a valid contact,
  plan 009 has live compliance surfaces, plan 010 is validated, and SPF, DKIM,
  DMARC, monitored replies, identity, and opt-out checks pass.
- No real send belongs to an implementation plan. Plan 014 is the
  operator-controlled rollout, and every send remains manual.
- The canonical blackout means the first hotel wave cannot land before
  2026-09-15, regardless of engineering completion.
- Plan 007 closed `DONE` on 2026-08-29 against a real cohort. 120 hotels
  prescanned at prescan v3, 119 scored, 107 eligible, cohort
  `edac3750-e799-43a7-b428-afe20e115cb2` of 6 selected at ability cutoff 52 and
  brokenness cutoff 88. Contact discovery over those 6: 2 found, 3 rejected
  (2 free-mail-only, 1 named-local-parts-only), 1 parked
  (no-address-published), 14 requests against an 18-request budget, reconciled.
  Operator read passed: both stored addresses are on the hotel's own
  registrable domain, both in the allowlist, both MX-confirmed, and every
  rejected or parked row stores no address field at all.
- Funnel fact for plan 011 to size against: only 2 of 6 selected hotels are
  contactable at all, and one of those two is `reservation@`, an inbox the
  plan-007 caution flags as often automated. Reach is a third of the cohort,
  not the cohort.
- Plan 011 is `IMPLEMENTED` rather than `DONE`, on purpose. Steps 1 through 5
  are built and tested against an in-memory mailbox: the capability-limited
  port, the Gmail adapter over built-in `fetch`, thread and draft collections
  with 90-day TTL and a one-live-draft-per-touch index, suppression-gated
  orchestration, and the `prospect draft` commands. Step 6, a live synthetic
  draft, needs a provisioned Google Workspace mailbox and a person to read the
  result, and neither existed when the work was done. Preflight list is
  `docs/rules/outreach-rules.md` section 10; the reasoning behind the no-send design
  is trade-off 56.
  **Update 2026-08-30.** The mailbox is now provisioned: Google Workspace
  account `contact@odysseusaudit.com`, a Cloud project with an Internal OAuth
  consent screen scoped to exactly `gmail.compose` and `gmail.metadata`, a
  refresh token, and SPF/DKIM/DMARC all verified. All four
  `ODYSSEUS_MAILBOX_*` variables are set. Step 6 itself was attempted against
  a synthetic candidate seeded directly into an isolated database (never a
  real prospect) and failed before reaching the mailbox: the writing pass's
  touch-1 word-count guard rejected all 3 retries on the live Mistral API,
  twice, six generations landing at 31 to 38 words against a required 60 to
  90. Filed as issue #12 rather than worked around, since relaxing that
  guard would silently reverse the shape stated in `docs/rules/outreach-rules.md`
  section 6. Plan 011 stays `IMPLEMENTED` until #12 is resolved and Step 6 is
  re-run to completion.
  **Update 2026-08-30 (second).** #12 was fixed in commit `b5410e3` and
  Step 6 was re-run to completion against the live mailbox. One synthetic
  candidate (domain and contact both the operator-owned
  `odysseusaudit.com` mailbox, evidence a copied measurement image) was
  seeded into the isolated database `odysseus_011_smoke` on the test Mongo
  service, never a real prospect. `prospect draft create` produced one live
  Gmail draft (`providerDraftId` `r6748644109893378026`), verified plain
  text, one preview link, and full disclosures via `draft show` and
  `getDraft`; it was then deleted at the provider and in the store, and the
  preview object was revoked. Nothing was sent; no send capability exists on
  the adapter. One residual defect was measured and filed as issue #14: the
  first live run still exhausted all three retries at 56 to 58 words against
  the 60 floor, and the second succeeded only via the retry feedback path,
  so run-level failure remains possible. Plan 011 is `DONE`; #14 tracks the
  reliability gap for the real campaign.

## Verification baseline

Each implementation slice runs its focused tests, then:

```bash
pnpm run format
pnpm run check
pnpm run test
```

Store integration tests use the repository's Mongo test service:

```bash
pnpm run test:store:up
pnpm run test -- packages/store/src
pnpm run test:store:down
```

The expected baseline is simply that `pnpm run test` passes. A future failure
is reproduced, then recorded as a new GitHub issue rather than pre-excused by
deleted history.

Never scan a live third-party hotel without current permission for that named
site. Milestone acceptance needs an authorized real-hotel output review, but
authorization does not carry between sessions.

## Milestone definition of done

- The catalogue is reproducibly ingested from the verified Atout France
  classified-accommodation export, joined to Sirene, and reports source-level
  provenance and yield.
- Only verified three-to-five-star hotels enter this campaign; lower or unknown
  ratings remain queryable with explicit parked reasons.
- The measured qualified own-domain population reaches 8,000 to 15,000, or an
  approved Overpass adapter plan is executed and the yield is remeasured.
- A qualified hotel can be prescanned, evidenced, scored, contact-validated,
  previewed, and drafted without a model selecting evidence or inventing facts.
- Public previews are bilingual, expiring, unindexable, revocable, and contain
  none of the prohibited technical or legal fields.
- Every model response is Zod-validated and guarded; failed output is discarded
  after retries, never repaired into plausible copy.
- Suppression is checked immediately before every provider draft operation.
- Gmail integration exposes no send capability and reconciles only the minimum
  metadata needed for manual follow-up decisions.
- The private interface exposes source joins, parking, prescan/evidence/score
  provenance, previews, drafts, replies, suppressions, vendors, and outcomes.
- The first-100 analysis can test whether score predicts replies and whether
  render-diff or accessibility evidence is the better opener.
- Focused tests, `pnpm run check`, the full local suite, and an authorized real
  hotel output review are recorded in the shared handoff.

## Supplied proposals intentionally rejected or superseded

- New `packages/prospecting` and `packages/outreach` packages: keep shipped
  package roles and add deep interfaces within them.
- A mutable one-row prospect registry: preserve the append-only qualification
  event contract and add a separate hotel catalogue.
- Fuzzy name/postcode auto-merge: review candidate only; exact identifiers and
  domains are the automatic path.
- Reusing `runAuditStage` for the prescan: use a distinct orchestration path
  over shared scanner primitives.
- Persisting one mutable score on a prescan: scores are immutable, separately
  versioned records.
- Three-year prospect retention: operational data expires after 90 days;
  permanent suppression stores hashes only.
- Named contacts, free-mail fallback, email patterns, SMTP probing, and phone:
  prohibited for this milestone.
- Automatic sending, automatic follow-ups, or an SMTP/IMAP sequencer: manual
  Gmail sending remains a locked safety boundary.
- Atlas, VPS, Tailscale, or broader deployment migration: unnecessary for the
  first campaign and outside this milestone.

## Explicitly deferred

- Overpass ingestion. **Declined by the operator, 2026-08-27, with the
  measurement in hand.** Plan 003 measured 5,720 usable own-domain candidates
  against the 8,000 floor, so `decideOverpassNeed` returned `propose` and the
  run ingested nothing. The operator's reasoning: the 8,000 floor was set
  against a national-campaign target, not against what the pipeline needs to
  start earning, and 5,720 supports the first-100 experiment and the campaign
  behind it many times over. Population growth is expected to come from new
  verticals and other EU countries rather than from a denser source for French
  hotels. Do not re-propose Overpass on the strength of the shortfall alone;
  re-propose only if French hotel supply itself becomes the binding constraint
  on revenue.
- DATAtourisme as a second source: evaluated and rejected 2026-08-27, see
  "Measured source facts". Reconsider only if plan 003 measures a large
  unusable-website rate among the 9,730 declared websites.
- Fuzzy/coordinate identity matching beyond the manual-review queue.
- Restaurants and other verticals.
- Vendor-channel outreach; booking-engine fingerprints support only aggregate
  analysis in this milestone.
- Tracking pixels, cookies, third-party analytics, automatic send/warmup, and
  automatic volume ramping.
- A public scanner, client login, CRM, or general public audit interface.
