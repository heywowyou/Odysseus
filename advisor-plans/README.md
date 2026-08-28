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

**Cheap qualification facts, measured 2026-08-27 by a full live run over the
13,301 candidates** (read-only DNS/TLS/bounded-HTTP checks, no browser, under
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

Non-blocking notes: `redirected-within-site` 4,141, `no-booking-path-detected`
3,463, `no-identification-published` 2,437, `booking-path-offsite-only` 487.

Three facts worth carrying forward:

- **The declared websites are mostly alive.** Of the 7,069 campaign-ready
  candidates, 5,720 qualified. Hard site failures (DNS, TLS, HTTP, timeout,
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
yield is 5,720 against the 8,000 floor, a shortfall of 2,280, so
`decideOverpassNeed` returns `propose`. The run stopped at that and ingested
nothing. Adding an OpenStreetMap Overpass source is an operator decision that
has not been taken; do not treat the shortfall as authorization.

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
| [001](./001-hotel-catalogue-ingestion.md) | Ingest the national hotel catalogue | P1 | L | none | DONE |
| [002](./002-hotel-identity-and-groups.md) | Resolve identities, own domains, and groups | P1 | L | 001 | DONE |
| [003](./003-cheap-hotel-qualification.md) | Qualify hotel websites without a browser | P1 | L | 002 | DONE |
| [004](./004-distinct-hotel-prescan.md) | Build the distinct three-page hotel prescan | P1 | L | 003 | DONE |
| [005](./005-hotel-evidence-capture.md) | Capture the two outreach evidence assets | P1 | L | 004 | IMPLEMENTED |
| [006](./006-versioned-hotel-scoring.md) | Score candidates with immutable breakdowns | P1 | L | 001-005 | TODO |
| [007](./007-role-contact-discovery.md) | Discover approved own-domain role contacts | P1 | M | 006 | TODO |
| [008](./008-safe-outreach-preview-html.md) | Generate safe outreach preview HTML | P1 | L | 005 | TODO |
| [009](./009-expiring-preview-publication.md) | Publish expiring previews and compliance pages | P1 | L | 008 | TODO |
| [010](./010-validated-outreach-prose.md) | Generate and validate outreach prose | P1 | L | 006, 008 | TODO |
| [011](./011-gmail-drafts-without-send.md) | Create reviewed Gmail drafts without sending | P1 | L | 007, 009, 010 | TODO |
| [012](./012-replies-suppressions-outcomes.md) | Reconcile replies, suppressions, and outcomes | P2 | L | 011 | TODO |
| [013](./013-outreach-operator-interface.md) | Add the private outreach operator interface | P2 | L | 001-012 | TODO |
| [014](./014-first-100-hotel-rollout.md) | Run the controlled first-100 hotel rollout | P2 | M | 001-013 | TODO |

Status values: `TODO`, `IN PROGRESS`, `IMPLEMENTED`, `DONE`,
`BLOCKED: <reason>`, or `REJECTED: <reason>`. `IMPLEMENTED` means every done
criterion is met and the suite is green, but a verification step still needs a
person - typically reading the first run against a live operator-named site.

## Dependency notes

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

The full suite currently depends on local curated real-scan artifacts. If a
clean checkout lacks them, do not weaken or skip fixture-backed tests. Report
the existing fixture-baseline issue recorded in `plans/findings.md`.

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
