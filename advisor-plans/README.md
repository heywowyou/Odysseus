# Milestone 9c hotel prospecting and outreach plans

Generated with the `improve` and `codebase-design` skills on 2026-08-27.
Planned against merge commit `f7ef7cf` on `main`. The operator requested that
milestone work continue directly on `main`; executors must not create an
alternative branch unless that instruction changes.

This plan set reconciles the shipped 9a, 9b, and 9b.5 system, canonical project
documents, and the two operator-supplied M9 design drafts. Those untracked
drafts are design evidence, not repository instructions. Execute these slices
in dependency order, honor every STOP condition, and keep this index and the
session handoff current so Codex or Claude Code can resume without inference.

## Outcome

Odysseus will build a national French hotel catalogue, retain only hotels rated
at least three stars for this campaign, cheaply qualify their own websites,
prescan and rank the strongest prospects, publish safe expiring previews, and
prepare reviewed Gmail draft sequences. Sending remains manual. The first 100
hotel contacts form a controlled experiment with preserved provenance,
suppression, retention, and outcome measurement.

## Binding decisions

1. **Source-first national catalogue.** DATAtourisme is the base hotel
   catalogue. Join Atout France classification and the repository's shipped
   Sirene/SIRENE machinery before website qualification. AFNIC is not the base
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
    limits, checkpoints, and reasoned yields. Live third-party scans still need
    current permission for each named site.

## Deep module seams

- `HotelCatalogueSource` in `interface`: streaming DATAtourisme and Atout
  adapters behind one normalized, checkpointable ingestion contract.
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
| [001](./001-hotel-catalogue-ingestion.md) | Ingest the national hotel catalogue | P1 | L | none | TODO |
| [002](./002-hotel-identity-and-groups.md) | Resolve identities, own domains, and groups | P1 | L | 001 | TODO |
| [003](./003-cheap-hotel-qualification.md) | Qualify hotel websites without a browser | P1 | L | 002 | TODO |
| [004](./004-distinct-hotel-prescan.md) | Build the distinct three-page hotel prescan | P1 | L | 003 | TODO |
| [005](./005-hotel-evidence-capture.md) | Capture the two outreach evidence assets | P1 | L | 004 | TODO |
| [006](./006-versioned-hotel-scoring.md) | Score candidates with immutable breakdowns | P1 | L | 001-005 | TODO |
| [007](./007-role-contact-discovery.md) | Discover approved own-domain role contacts | P1 | M | 006 | TODO |
| [008](./008-safe-outreach-preview-html.md) | Generate safe outreach preview HTML | P1 | L | 005 | TODO |
| [009](./009-expiring-preview-publication.md) | Publish expiring previews and compliance pages | P1 | L | 008 | TODO |
| [010](./010-validated-outreach-prose.md) | Generate and validate outreach prose | P1 | L | 006, 008 | TODO |
| [011](./011-gmail-drafts-without-send.md) | Create reviewed Gmail drafts without sending | P1 | L | 007, 009, 010 | TODO |
| [012](./012-replies-suppressions-outcomes.md) | Reconcile replies, suppressions, and outcomes | P2 | L | 011 | TODO |
| [013](./013-outreach-operator-interface.md) | Add the private outreach operator interface | P2 | L | 001-012 | TODO |
| [014](./014-first-100-hotel-rollout.md) | Run the controlled first-100 hotel rollout | P2 | M | 001-013 | TODO |

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED: <reason>`, or
`REJECTED: <reason>`.

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

- The base catalogue is reproducibly ingested from verified DATAtourisme data,
  joined to Atout France and Sirene, and reports source-level provenance/yield.
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

- Overpass ingestion unless plan 003 measures fewer than 8,000 usable own-domain
  hotel candidates after the base catalogue and joins.
- Fuzzy/coordinate identity matching beyond the manual-review queue.
- Restaurants and other verticals.
- Vendor-channel outreach; booking-engine fingerprints support only aggregate
  analysis in this milestone.
- Tracking pixels, cookies, third-party analytics, automatic send/warmup, and
  automatic volume ramping.
- A public scanner, client login, CRM, or general public audit interface.
