# Plans index

The single index of approved, execution-ready plans. Each row is one sentence
of status plus a link; the plan file itself holds the steps, decisions, and
verification record, and Git holds the narrative. Keep it that way: status
cells stay short, and `pnpm run docs:check` enforces a size ceiling on this
file.

The milestone 9c index this file grew out of (the hotel prescan, versioned
scoring, and cohort pipeline, with its binding decisions, module seams, and
definition of done) was removed from the product by plan 047 and is kept only
as a historical record in
[`archive/9c-plans-index-history.md`](archive/9c-plans-index-history.md). It
is not binding.

## Plan closure standard

Every active/root plan is a quality contract, not merely design prose. A plan
must not be marked implemented/done because an implementation can be
interpreted as satisfying an adjective such as "strongest", "bounded",
"truthful", "clear", "safe", "responsive", "durable", or "accessible".

For every binding requirement, the plan's closure evidence must identify:

1. the concrete implementation owner/seam;
2. the exact persisted/API/type/config artifact that embodies the requirement;
3. a machine-verifiable test, invariant, budget, or fault fixture where the
   requirement is mechanically testable;
4. a named manual acceptance record only for properties that genuinely require
   human judgment;
5. the provenance/version of external models, tools, browsers, renderers, or
   security profiles that materially affect the result.

Each active plan must maintain a requirement-to-proof closure ledger (inline or
in a named canonical document). **No binding row may be blank, mapped only to
"code review", or closed by prose interpretation.** Unknown/unproven means the
plan remains open.

When a requirement says "best/strongest/fast/bounded/complete/safe" or similar,
the plan must also name the comparison set or numeric/structural acceptance
criterion. When a requirement names a role or state, the implementation must
have an exhaustive typed registry/inventory and a test proving there is no
silent default/fallback path.

A later implementation discovery that exposes a missing proof reopens the
owning plan as a completion defect; it is not automatically deferred to a new
plan number.


## Current outcome

Odysseus prospects from one durable, editable prospect hub. The operator adds
a prospect from the imported Atout France directory, and every scan, preview,
mailbox draft, thread, outcome, and status change links to it by `prospectId`.
Two scan intents exist: a Quick check and a Full scan, and a stored scan is
reused rather than rerun when its purpose and coverage qualify. Legal and
safety checks (suppression, opt-out, provenance) are the only blockers; there
is no outreach score, cohort, or wave. Prospects are archived and restored
rather than deleted, and permanent deletion stays a disclosed, counted
exception. Sending remains manual, from reviewed Gmail drafts.

The canonical sources for this behavior are `docs/product/odysseus-project-brief.md`,
`docs/product/dashboard-ia.md`, `docs/rules/outreach-rules.md`, and
`docs/decisions/trade-offs.md`.

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
| [014](archive/014-first-100-hotel-rollout.md) | Run the controlled first-100 hotel rollout | P2 | M | 001-013, 016 | BLOCKED: superseded by plan 047 |
| [015](archive/015-consolidate-work-tracking.md) | Make plans and issue lifecycle unambiguous | P1 | M | none | DONE |
| [018](archive/018-report-executive-readability.md) | Make the paid report readable as an executive decision document | P1 | L | none | DONE |
| [019](archive/019-report-preparation-and-personalization.md) | Prepare and personalize the paid report safely | P1 | L | 018 | DONE |
| [020](archive/020-report-financial-evidence-and-legal-reference.md) | Add defensible financial evidence and the general legal reference | P1 | L | 019 | DONE |
| [021](archive/021-complete-audits-without-template-repetition.md) | Keep full-site audits complete without repeating template work | P1 | L | 018-020 | DONE (2026-09-03) |
| [022](archive/022-dashboard-and-site-design-refactor.md) | Refactor the operator dashboard and public site UI with the Impeccable workflow | P2 | L | none | DONE |
| [023](archive/023-report-visual-design-refactor.md) | Revise the report visual design as a gated, operator-directed redesign | P2 | L | 018-021, operator-approved direction | DONE (2026-09-02) |
| [024](archive/024-report-feedback-followups.md) | Close three small gaps between the report and Conseil papa | P2 | S | 018, 019 | DONE (2026-09-01) |
| [025](archive/025-llm-provider-switch.md) | Switch the LLM provider from Mistral to OpenAI gpt-5.4-mini | P1 | M | none | DONE (2026-09-03) |
| [026](archive/026-faster-audits-without-weaker-measurements.md) | Make a single full audit faster without weakening what it measures | P2 | M | none | DONE (2026-09-05) |
| [027](archive/027-french-report-prose-quality.md) | Make the French report read like consulting prose | P1 | M | 018, 019, 025 | DONE (2026-09-07) |
| [028](archive/028-writing-pass-consistency-guards.md) | Close the writing-pass consistency gaps plan 027 didn't cover | P2 | S | 027 | DONE (2026-09-07) |
| [029](archive/029-writing-pass-open-levers.md) | The two writing-pass levers plan 027 left as operator decisions | P3 | M | 027, 028 | DONE (2026-09-07) |
| [030](archive/030-outreach-dashboard-wiring.md) | Wire outreach draft generation into the operator dashboard | P2 | M | 011-013 | DONE (2026-09-08) |
| [031](archive/031-operator-preview-render.md) | Let the operator view the pre-purchase preview's current content | P3 | S | 008, 009 | DONE |
| [032](archive/032-site-context-from-catalogue.md) | Populate the writing pass's site context from the hotel catalogue | P3 | M | 029 | DONE (2026-09-08) |
| [033](archive/033-report-render-qa-and-copy-review-trial.md) | Gate delivery on deterministic render QA and measure an advisory copy-review pass | P1 | L | none | DONE (2026-09-08) |
| [034](archive/034-hotel-outreach-v2-booking-detection.md) | Port booking detection to prospecting and ship hotel-outreach-v2 | P1 | M | none; gates 014 Step 3 | DONE (2026-09-08) |
| [035](archive/035-full-audit-checkpoint-and-resume.md) | Resume full audits across crashes and redeploys instead of restarting from zero | P1 | L | none | DONE (2026-09-10) |
| [036](archive/036-lcen-publisher-identification-evidence.md) | Publish per-field detection evidence for the LCEN publisher-identification finding | P2 | M | none | DONE (2026-09-10) |
| [037](archive/037-full-scan-outreach-preview.md) | Replace the prescan outreach preview with a full-scan scorecard on the audit page | P1 | L | 034, 035, existing preview lifecycle | DONE (2026-09-11) |
| [038](archive/038-public-site-evidence-dossier.md) | Recast the public site as a clear, evidence-led audit offer | P1 | M | none | DONE (2026-09-11) |
| [039](archive/039-report-and-preview-site-design-language.md) | Carry the public site's design language into the report and the outreach preview | P2 | L | 023, 037, 038 | DONE (2026-09-11) |
| [040](archive/040-dashboard-simplification.md) | Simplify the operator dashboard around the hotel file and carry the site's design language into it | P2 | L | 037, 039; operator approval of the slice 1 IA proposal | DONE (2026-09-12) |
| [041](archive/041-fix-snippets-and-scorecard.md) | Deterministic fix snippets and scorecard (A); an actionable prospects table (B) | P3 (A) / P2 (B) | A: M (Slice 2); B: B1 M, B2 M | 039, 040 | DONE (2026-09-12) |
| [042](archive/042-hub-centred-audit-workspace.md) | Make the prospect hub the one workspace: tabbed stages, the audit inside it, the paid report chain hidden until sold | P2 | L | 040, 041 Part B; operator decisions recorded in the plan | DONE (2026-09-12) |
| [043](archive/043-dashboard-selection-management.md) | The dashboard manages the wave roster (hub + list add/remove) and shows the cohort's record read-only | P2 | M | 041 Part B, 042 | DONE (2026-09-12) |
| [044](archive/044-hub-launched-full-audit.md) | Launch a paid full audit from the hotel hub, linked to the hotel so the picker shows it | P2 | M | 042, 043 | DONE (2026-09-12) |
| [045](archive/045-dashboard-dead-ends-and-gates.md) | Remove dead ends and gates from the operator dashboard | P1 | L | 040-044 | DONE (2026-09-14) |
| [046](archive/046-client-facing-editorial-refactor.md) | Refactor client-facing French and English editorial copy around the technical-diagnostic position | P1 | M | current Plan 045 mainline | DONE (2026-09-13) |
| [047](archive/047-prospect-hub.md) | Make the prospect the durable, editable central hub | P1 | L | none | DONE (2026-09-15) |
| [048](archive/048-dashboard-workflow-consolidation.md) | Reduce the dashboard to one operator workflow | P1 | L | 047 | DONE (2026-09-15) |
| [049](archive/049-simplified-workflow-behaviorally-truthful.md) | Make the simplified workflow behaviorally truthful | P1 | L | 048 | DONE (2026-09-15) |
| [050](050-reusable-scans-durable-prospects.md) | Make scans reusable and prospects durable: two scan intents, advisory data version, archive instead of ordinary deletion | P1 | XL | 049 | IMPLEMENTED; CLOSURE PROOF REOPENED (2026-09-18) |
| [051](051-findings-delta-reaudit.md) | Add the findings delta to the re-audit report | P2 | L | 050 | IMPLEMENTED; CLOSURE PROOF REOPENED (2026-09-18) |
| [052](archive/052-crawler-honours-its-published-identity.md) | Make the crawler obey robots groups for its published bot name and send its user agent on every request | P1 | M | none | DONE (2026-09-17) |
| [053](archive/053-opt-out-reach-survives-prospect-status.md) | Keep a public opt-out from widening into domain-wide suppression through the prospect status | P1 | S | none | DONE (2026-09-17) |
| [054](archive/054-reaudit-delta-pairs-rescoped-findings.md) | Pair re-audit findings whose merged page set changed instead of showing resolved plus new | P1 | M | none; before the 050/051 rehearsal | DONE (2026-09-17) |
| [055](archive/055-scan-launch-and-job-delete-integrity.md) | Refuse scans for archived prospects and close the queued-job delete race | P1 | S | none | DONE (2026-09-17) |
| [056](archive/056-in-flight-work-guards.md) | Share one report production lock and refuse archive or delete while work is still in flight | P2 | M | after 055 (both edit the job delete route) | DONE (2026-09-17) |
| [057](archive/057-prospect-owns-linked-audit-identity.md) | Make the prospect the single source of a linked audit's name and SIREN; edits on the audit save to the prospect | P2 | M | none | DONE (2026-09-17) |
| [058](058-fail-closed-senior-report-quality-pipeline.md) | Make the paid report fail closed on content and PDF quality | P1 | XL | 027, 033, 039, 050, 051; 059 before production promotion | IMPLEMENTED DORMANT; CORRECTIVE REOPENED: model profiles + closure proof |
| [059](059-fail-closed-audit-evidence-quality.md) | Make full-audit evidence fail closed before report generation | P1 | XL | 021, 035, 050, 051; gates 058 promotion | IN PROGRESS: Phase A shipped as dormant contract modules; execution state, operator decisions and blockers in [059-execution-handoff.md](059-execution-handoff.md) |
| [060](060-application-quality-control-room.md) | Make the dashboard a truthful quality control room over evidence, reports and operator attention | P1 | XL | 058, 059; 035, 050-057 semantics | TODO |
| [061](061-durable-work-state-capabilities-and-queue.md) | Make long-running work, action safety, cancellation and scan queue state durable and truthful | P1 | XL | 060; 035, 050, 055, 056; 058/059 run contracts | TODO |
| [062](062-audit-control-room-lineage-and-approval.md) | Make audit detail the evidence/report lineage workspace with explicit exact-bundle approval | P1 | XL | 058, 059, 060, 061; 050, 051/054, 057 | TODO |
| [063](063-dashboard-data-contracts-and-large-audit-performance.md) | Bound dashboard read models and keep global state truthful at Point-France scale | P1 | L | 060, 061; coordinates 062 | TODO |
| [064](064-dashboard-accessibility-and-design-system.md) | Make the operator dashboard exemplary in accessibility and interaction consistency | P1 | L | 060; consumes 061-063 | TODO |
| [065](065-operational-observability-and-recovery.md) | Make routine failures typed, diagnosable and recoverable without log archaeology | P1 | L | 060, 061; integrates 058/059 | TODO |
| [066](066-operator-security-privacy-and-browser-isolation.md) | Harden hostile-input, confidential-artifact and browser-isolation boundaries for the quality pipelines | P1 | XL | 060; early isolation preflight, later 061 + 058/059 ownership | TODO |

Status values: `TODO`, `IN PROGRESS`, `IMPLEMENTED`, `DONE`,
`BLOCKED: <reason>`, or `REJECTED: <reason>`. `IMPLEMENTED` means every done
criterion is met and the suite is green, but a verification step still needs a
person, typically a post-deploy rehearsal or a first read against a live
operator-named site.

Audit of 2026-09-17 (commit `38a516f2`): recommended order 052, 053, 054, 055,
056, 057. Found but not planned: the needs-input first-email hold misses
audit-linked jobs; `POST /api/prospects` accepts `status`, `fieldOrigins` and
`directoryRef`; duplicate directory-to-prospect mapping; unused dashboard i18n
sections; `README.md` says `serve` needs no build. Considered and rejected:
merging the address guards (already delegate); `operator-views` findings (the
directory is untracked and empty).

## Work lifecycle

Each kind of work has exactly one home:

1. GitHub issues (on `heywowyou/Odysseus`, via `gh`) are the intake for a
   newly verified defect, request, or decision. See
   `docs/agents/issue-tracker.md`.
2. A numbered file under `plans/` is an approved, execution-ready plan.
   A raw finding is never stored here as if it were a plan. A finished plan
   moves to `plans/archive/` with its verification record.
3. `docs/report/report-feedback-deferred-items.md` holds only report work
   with a current reproduction or an explicit future trigger. Fixed items
   are removed once verified; Git history retains the evidence.
4. Durable shipped rationale moves to the owning canonical document or
   `docs/decisions/trade-offs.md`. Closed evidence stays in Git and issue
   history.
5. The active session log (`docs/session/current-session.md`, gitignored)
   holds only in-flight recovery state and never becomes a backlog.

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

Never scan a live third-party site without current permission for that named
site. Authorization does not carry between sessions.
