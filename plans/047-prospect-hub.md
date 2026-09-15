# Plan 047: make the prospect the central hub of the dashboard

> **Executor instructions.** First action: copy this file to
> `plans/047-prospect-hub.md`, add its row to the `plans/README.md` execution
> table (P1, L, depends on none, `IN PROGRESS`), and set plan 014 to
> `BLOCKED: superseded by 047 prospect hub; roster/cohort model removed`.
> Work stage by stage on `main`. Each stage ends green (`pnpm run check` plus
> focused tests). Honor the STOP conditions.

## Status

- **IN PROGRESS** (implementation started 2026-09-15)

- Implementation status (2026-09-15): durable prospect/directory contracts,
  storage, import, central launch/outreach guards, artifact links, status
  automation, the new dashboard surfaces, and the live AFNIC cutover are
  implemented and verified locally. Legacy candidate/cohort modules remain
  in the repository as compatibility code while the final deletion pass is
  pending. Production fresh-start steps are intentionally operator-only and
  have not been run.

- Priority: P1 · Effort: L · Risk: high (cross-package model change, production data reset)
- Depends on: none · Supersedes the selection model of plans 041/043 and the gates cleaned by 045
- Planned: 2026-09-15 at `b9c1d6b`

## Context

The dashboard has no real "prospect". What the hub calls a prospect is a
`hotel_candidates` row: it expires after 90 days, gets a new `candidateId`
when identity resolution is re-run, and cannot be edited. Around it sit about ten
gate functions (`planOutreachFullScan`, `planQuickCheck`, `planFullAudit`,
`computeHubActions`, `addWaveRosterEntry`, qualification, review, cohort
approval, roster). The `no-own-domain` check alone is copied in 7 places.
Scans link back in two different ways: `audit.outreach.candidateId`, and
`audit.hotelLink`, which is matched by domain.

Observed failure (production `test` DB, 2026-09-15): ARK HÔTEL PARIS
BOULOGNE's only website is `arkhotel.octosite.net`. The import classifies
that address as `vendor-hosted`, so the hotel has no `ownRegistrableDomain`.
Accepting the review writes only `review.*`, and a light audit
(`prospecting` job) carries no candidate id and cannot auto-link. The hub
therefore stops at `scan-refused: no-own-domain`, and no dashboard action can
fix it.

Target: the prospect is a durable, fully editable contact record, keyed by
`prospectId`. Every scan, preview, email thread, status change, and outcome
hangs off that id. The Atout France import becomes a filterable
**directory** you add prospects from. To do, Results, and history are all
read from prospects. The model is sector-agnostic, with hotel fields as
extras.

## Operator decisions (2026-09-15, binding)

1. **Only legal and safety checks block an action.** The hard stops are:
   - the do-not-contact list (domain and address);
   - polite crawling: robots.txt, pacing, timeouts, one browser-heavy job per host;
   - fixed approved email templates only, and the tool never sends;
   - a valid URL.

   Everything else becomes an **info badge that never blocks**: stars, own
   site vs agency-hosted, group, qualification facts, and quick-check
   results.
2. **The catalogue becomes a directory.** The ~13k Atout France hotels are
   searchable and filterable in a directory. A record becomes a prospect only
   when the operator adds it, creates one by hand, or creates one from a scan.
   The Prospects page lists only prospects.
3. **Retention: prospects are kept until the operator deletes them.** The
   dashboard flags inactive prospects. Deleting a prospect deletes its scans,
   previews, and emails. The suppression list always survives. The retention
   wording in the legal/rules docs is updated to match.
4. **Fresh start.** No data migration. The pipeline collections are wiped at
   deploy time after a backup. `suppression` is kept.
5. **Scans are linked when they are launched.** The launch form auto-matches
   the domain to a prospect, or lets the operator pick one or create one
   inline. Skipping is allowed. An unattached scan shows "Attach to a
   prospect". Previews and emails only require an attached audit.
6. **One editable status per prospect.** Actions move it forward
   automatically. The operator can correct it on the prospect page or on
   Results. Every change is logged in the prospect history.
7. **Scoring, cohorts, waves, roster, review, and qualification override are
   removed.** Adding someone as a prospect *is* the selection. Quick check
   remains as a scan type, and its results show as info.
8. **Generic core fields plus sector extras.** Directory and Prospects must
   support combined filters: stars AND independent/group AND website kind AND
   location AND rooms, and so on. This is a primary requirement, not polish.

## Binding implementation rules

- The product rules in CLAUDE.md still apply. Scanners detect and the LLM
  explains. The LLM never sees raw HTML. Outreach wording is deterministic
  templates. Stored analyses and reports fail closed on stale provenance
  (trade-off 40).
- **Honesty rule kept as a hard check:** a public preview or first email needs
  an attached audit with complete crawl coverage and current provenance
  (`core/src/crawl-coverage-gate.ts`). This is not a selection gate: it
  prevents presenting a partial scan as a site-wide result.
- Every field that was autofilled records its origin (`atout-france`,
  `site-discovery`, `sirene`, `operator`). The GDPR article 14 disclosure in
  emails reads from these origins. Automated contact discovery still keeps
  role addresses only. A manual contact keeps `addressOrigin` and the
  free-mail attestation (trade-off 39 amendment).
- All guard logic lives in **one module**. No other file re-checks domain,
  qualification, or selection.
- Domain comparisons use the registrable domain via `tldts`. This fixes
  `resolveOutreachAuditForCandidate` comparing a full hostname with a
  registrable domain (`store/src/outreach-scans.ts:386`).
- Write client-facing and operator French copy first, then English
  (`i18n/fr.ts` → `en.ts`).
- Delete dead code with `fallow dead-code --trace` (trade-off 80), not by
  guesswork.

## Stage 1: prospect and directory foundation (de-risk spike first)

The riskiest parts go first: the new model, and fast combined filters over
13k rows.

### 1.1 Core contracts (`packages/core/src/types/prospect.ts`, Zod)

- **`Prospect`:**
  - `prospectId` (uuid, durable), `sector` (`'hotel'` | string), `name`
  - `websites[]`: `{ url, registrableDomain, kind: 'own' | 'vendor-hosted' | 'unknown', primary }`
  - `address`, `postcode`, `commune`, `department` (derived from postcode)
  - `phone?`
  - `emails[]`: `{ address, origin, attestation? }`
  - `siren?`, `siret?`, `notes`, `status`
  - `hotel?`: `{ stars, rooms, capacity, groupStatus, groupDomain }`
  - `fieldOrigins`, `directoryRef?`: `{ source, sourceId }`
  - `createdAt`, `updatedAt`, `lastActivityAt`
- **`ProspectStatus`:** `new → audited → contacted → follow-up → replied → call → quoted → won | lost`, plus `opted-out`. Transitions are free: the operator can correct anything.
- **`ProspectEvent`** (insert-only history): `{ eventId, prospectId, type: status-changed | field-edited | scan-attached | scan-detached | preview-published | draft-created | outcome-recorded | opted-out, payload, actor, at }`.
- **`DirectoryEntry`:**
  - the facets needed for filtering: `stars`, `rooms`, `capacity`, `groupStatus`, `websiteKind`, `department`, `commune`, `postcode`
  - `registrableDomain?`, `sourceRefs`, `prospectId?` (back-reference: "already a prospect")

### 1.2 Store (`packages/store`)

- **New schemas:**
  - `prospect.schema.ts`: replaces the unused AFNIC `prospect.schema.ts`. No TTL. Indexes on `prospectId` (unique), `websites.registrableDomain`, `status`, `lastActivityAt`, and the filter compounds.
  - `prospect-event.schema.ts`.
  - `directory-entry.schema.ts`: no TTL, with compound indexes for the filter combinations.
- **`prospects.ts` repository:** `createProspect`, `updateProspect` (writes a `field-edited` event with a diff), `setProspectStatus`, `deleteProspect` (cascade, see Stage 4), `findProspectsByDomain`, `listProspects(filters)`.
- **`directory.ts`:** `listDirectory(filters, page)`, `addDirectoryEntriesToProspects(ids)` (copies facets into the prospect with origins).
- Reuse the website classification and group detection from `core/src/prospecting/hotel-domain.ts` (`normalizeDeclaredWebsite`, vendor hosts) and `interface/src/prospecting/hotel-identity/resolve-hotels.ts`. Rework resolution so it writes directory facets instead of candidates.

### 1.3 Spike proof

- Run the directory import against the real CSV locally.
- Use `explain` to confirm filter queries (stars + groupStatus + websiteKind + department, sorted by name) use an index and return in <100 ms on 13k rows.
- Add a store test with a fixture directory covering the combined filters.

### Stage 1 verification

Run the focused store and core tests, then `pnpm run check`. Pass criteria:
- ARK HÔTEL appears in the directory with `websiteKind: vendor-hosted`.
- Adding it creates a prospect.

## Stage 2: link everything to `prospectId`

### 2.1 One link field

- Add an indexed `prospectId?` to `audits`, `prescans`, `outreach_previews`, `outreach_threads` (unique when set), `outreach_drafts`, and `jobs.options`.
- Remove `audit.outreach.candidateId`, `audit.hotelLink`, `linkAuditToHotelByDomain`, `pipeline/backfill-audit-hotel-links.ts`, and every `candidateId` field.
- Contacts move into `prospect.emails`, and `hotel_contacts` is removed. Automated role-address discovery becomes a "Find contacts on the site" action that appends addresses with origin `site-discovery`.

### 2.2 One launch endpoint

- `POST /api/scans { type: quick-check | light-audit | prospecting-audit | full-audit, url | urls, prospectId?, options }` handles every scan type.
- Delete `POST /api/prospects/:id/prescan`, `/outreach/full-scan`, `/full-audit`, and `/refresh`.
- Runners stamp `prospectId` on the results and write a `scan-attached` event.
- `GET /api/prospects/match?domain=` returns the candidate prospects for the launch form.
- `POST /api/audits/:id/prospect { prospectId | null }` attaches or detaches a scan, and each change writes an event.

### 2.3 One guard module (`packages/store/src/guards.ts`)

- `checkScanLaunch({ url })`: invalid URL, suppressed domain, browser-heavy job already running on the host. Reuse `findActiveBrowserHeavyHostConflict` from `active-jobs.ts`.
- `checkOutreachAction({ prospect, action })`: suppressed domain or address, no contact email, and for preview or first email, an attached audit that is coverage-complete and has current provenance.
- Replaces `planOutreachFullScan`, `authorizeOutreachFullScan`, `planQuickCheck`, `planFullAudit`, `planProspectJobLaunch`, `computeHubActions`, `resolveOutreachAuditForCandidate`, and the wave roster checks.
- Refusal codes shrink to: `invalid-url`, `suppressed`, `host-busy`, `no-contact`, `no-complete-audit`, `audit-stale`.

### 2.4 Status automation

- Creating a first email draft sets the status to `contacted`.
- An attached complete audit sets `new → audited`.
- A follow-up draft sets `follow-up`.
- Mailbox sync (`interface/src/outreach/reconcile-mailbox.ts`, CLI `prospect outreach sync`) sets `replied` and writes the thread state through `prospectId`.
- Recording an outcome sets `call`, `quoted`, `won`, or `lost`.
- Opt-out sets `opted-out` and adds a suppression (existing flow).
- **Automation only moves the status forward and never overwrites a manual later status.**

### Stage 2 verification

Focused route and store tests:
- launch each scan type with and without `prospectId`;
- attach and detach;
- every guard code, including a vendor-hosted prospect scanning fine;
- the `www.` registrable-domain comparison;
- status automation, including a manual later status staying put.

## Stage 3: dashboard

### 3.1 Prospects (`/prospects`, `routes/prospects.tsx`, `prospects-model.ts`)

- Lists prospects only.
- Filter bar: status, sector, stars, independent/group, website kind, department/commune, rooms range, has a scan, inactive.
- Search, sortable columns, and filters kept in the URL query.
- Buttons: "Nouveau prospect" (form) and "Ajouter depuis l'annuaire".

### 3.2 Directory (`/annuaire`, new)

- Same filter bar over the directory entries, with multi-select "Ajouter aux prospects".
- Rows that are already prospects link to their page.

### 3.3 Prospect page (`/prospects/:prospectId`, rebuild of `prospect-detail.tsx` and the `hub-*` sections)

- **Editable record:** all fields, with an origin badge per field.
- Info badges (agency-hosted site, group, stars).
- Status selector.
- Contact emails editor (reuse `hub-contact-editor.tsx`).
- **History timeline:** events plus every attached scan (quick checks, light, prospecting, and full audits), with open, detach, and delete.
- **Actions:** launch any scan (prefilled URL and prospect), publish preview, emails (keep `hub-emails-section.tsx`), outcome (keep `hub-outcome-section.tsx`), delete prospect (confirmation dialog).
- Disabled actions show the guard reason inline.
- Remove: the `hub-model.ts` action ladder (replaced by `checkOutreachAction` results), `wave-dialog.tsx`, the review, qualification-override, score and score-diff UI, and the selection overview.

### 3.4 Scan launch and audit pages

- `/scans/new` gets a prospect picker: auto-match by domain, search existing, "Créer un prospect" inline, "Ne pas rattacher".
- `audit-hotel-link-panel.tsx` becomes an "Attach to a prospect" panel.
- `/audits` gets an "unattached" filter.

### 3.5 To do (`/a-traiter`, `routes/todo.ts`, `todo-model.ts`)

Rows are derived only from prospects and their attached scans:
- drafts to review;
- replies to handle;
- follow-ups due;
- an attached audit needing input, PDFs, or approval;
- a prospect with a complete audit and no first email.

Every row opens its prospect or audit and is actionable. Unattached scans are not To do items.

### 3.6 Results (`/resultats`)

- One row per prospect with an outreach status, with an inline status and outcome editor.

### 3.7 Vocabulary and IA

- New terms: Annuaire / Directory, Rattacher / Attach.
- Removed terms: "Identité à vérifier", "hôtels sélectionnés", vague ("wave").
- Update the i18n `types.ts`, `fr.ts`, and `en.ts`. Update the SPA route allowlist `interface/src/app-routes.ts`.

### Stage 3 verification

- Dashboard render tests for the prospects filters, the directory add, prospect editing, the launch picker, and To do derivation.
- `pnpm run test:e2e` flow: add ARK HÔTEL from the directory → edit its website → launch a light audit attached to it → the audit appears in history → the status becomes `audited` → To do shows "create first email" once a complete audit exists.

### Stage 3 closeout corrections (reviewed 2026-09-15 while planning 048)

These are Plan 047 completion work, not Plan 048 scope. They enforce this
plan's existing central-guard and single-hub decisions before any later UI
consolidation starts.

1. **Make prospect work one deep store module.** Define a small interface that
   returns the open work and recommended next action for either one prospect or
   a bounded list of prospects. Its implementation must use one bulk loader
   (`$in` queries plus narrow projections) and one pure derivation function.
   The prospect page, `À traiter`, and the sidebar badge consume this same
   result. Do not let any of those callers recalculate crawl coverage,
   provenance, suppression, thread timing, or draft state.
2. **Select the newest qualifying audit, not merely the newest audit.** As
   currently drafted, `checkOutreachAction` calls `findOne(...).sort({
   startedAt: -1 })` and then rejects that one row when it is stale or
   incomplete. Starting a newer quick or incomplete scan would therefore hide
   an older complete/current audit that still authorizes a preview or first
   email. The central module must search newest-first and return the first audit
   that has complete crawl coverage and the current normalization fingerprint;
   refuse only when no qualifying attached audit exists. Preserve enough
   refusal detail to distinguish no audit, incomplete audit, and stale audit.
3. **Check both website and email domains for suppression.** For every contact
   address, call the suppression seam with the address's own domain and exact
   address. A website-domain check remains separate. Never substitute the
   website domain for an email domain when they differ. Add regression coverage
   for a prospect on `example.fr` whose contact is on a domain-wide-suppressed
   `agency.example` address.
4. **Use the shared work count in the shell.** The `À traiter` badge must count
   all open work returned by the same module as the page, not only
   `/api/outreach/drafts`.
5. **Finish the dashboard contract before declaring Stage 3 done.** Move all
   new operator copy through the typed FR-first i18n tables; render real
   preview, first-email, follow-up, detach, and delete actions rather than
   readiness-only cards; add real `#emails` and `#history` targets (or remove
   the hashes); make the launch picker search existing prospects and create one
   inline in addition to domain auto-match; add render/axe tests for Directory,
   Prospects, Results, and prospect detail in both languages.

Focused regressions required before Stage 4:

- newer incomplete audit plus older qualifying audit → preview and first email
  use the older qualifying audit, and `À traiter` agrees;
- no qualifying audit → the hub and `À traiter` agree that no first-email work
  is actionable;
- website domain clear plus email domain suppressed → outreach is refused;
- one draft, one reply, one due follow-up, one audit input, and one first-email
  item → the shell count equals the `À traiter` row count;
- the bulk loader issues a bounded number of queries independent of prospect
  count and does not load unused audit fields;
- every `À traiter` link lands on the intended visible control.

## Stage 4: delete the old pipeline

Remove schemas, repositories, routes, CLI commands, jobs, and tests for:
- **Hotel pipeline collections:** `hotel_candidates`, `hotel_qualifications`, `hotel_scores`, `hotel_score_cohorts`, `hotel_wave_roster`, `hotel_contacts`, `businesses`.
- **Hotel pipeline code:** qualification (`qualify-hotel.ts`, `qualify-hotels.ts`, `qualify-on-demand.ts`), redirect reconciliation, and the Sirene backfill as a gate. Sirene lookup may stay as an optional "fill SIREN" action if it is cheap. Otherwise remove it.
- **The AFNIC funnel:** the `prospect-ingestion` job, `run-prospect-ingestion-job.ts`, the checkpoint schema, and the CLI `prospect ingest` AFNIC path.
- **Store and route code:** `outreach-scans.ts` gate functions, `hub-actions.ts`, `wave-roster.ts`, `operator-views/review-lists.ts` hotel queue, and the `routes/prospects.ts` endpoints listed above.
- **Old dashboard paths:** `/prospects/:id/{prescan,score,evidence,preview,outreach}` redirects.
- **Job types:** keep `full-audit`, `prospecting`, `hotel-prescan` (renamed `quick-check` if cheap), `outreach-full-scan`, and the draft and follow-up batches.

Delete cascade for `deleteProspect`:
- Delete: audits, findings, analyses, reports, report files, approvals, prescans, drafts, threads, and events.
- Revoke: live previews, then delete them.
- **Never delete `suppression`.**

### Stage 4 verification

- `fallow dead-code --trace` is clean.
- `pnpm run test:all` passes.
- `grep -r candidateId packages/` returns only historical plan and doc text.

## Stage 5: documentation and decisions

- **`docs/decisions/trade-offs.md`:** new entry "The prospect is the durable hub". It records operator decisions 1–8 and supersedes:
  - #6 (catalogue vs append-only prospect events), and the rejected "mutable registry" proposal in `plans/README.md`;
  - #33 (identity key becomes a directory facet);
  - #38 (cohort parts);
  - #39 (selected-cohort-only contacts);
  - #75 (approved list → prospect list; the batch-scope protection now means "scan only prospects or explicit URLs").
  - Also amend the supersession notes on the owning entries.
- **`docs/rules/prospect-qualification.md`:** qualification becomes facets, not gates; retention becomes "until deleted plus an inactivity flag"; origin is still mandatory.
- **`docs/rules/operator-obligations.md` and `obligation-basis.md`:** update only if they state the 90-day retention. Record the operator decision, with no new legal claim.
- **`docs/rules/outreach-rules.md`:** fix §6bis (preview controls live on the prospect page), and contact after a complete attached audit.
- **`docs/product/dashboard-ia.md`:** rewrite the navigation (Directory, Prospects, To do, Audits, Results), page destinies, and vocabulary. Also fix the stale stepper and queue text.
- **`docs/product/odysseus-project-brief.md`:** product workflow section.
- **`CLAUDE.md` guardrails list:** only if a bullet now contradicts the new model.
- Run `pnpm run docs:check`.

## Stage 6: production fresh start (operator present, operator deploys)

1. `mongodump` the production `test` database and the report file storage to a dated backup on the VPS.
2. The operator confirms the list of audits and reports being wiped, especially any paid client audit (see STOP).
3. Revoke all live previews.
4. Drop the pipeline collections: `hotel_*`, `businesses`, `prescans`, `audits`, `findings`, `analyses`, `reports`, `reportApprovals`, `outreach_*`, `jobs`. **Keep `suppression`** and `sirene_cache`.
5. Deploy through `deploy/odysseus-deploy.sh`.
6. Run the directory import. Check the ~13k entries and spot-check ARK HÔTEL's facets.
7. Smoke test: add a prospect from the directory, run a quick check attached to it, check history and To do.

## Whole-plan verification

- `pnpm run format && pnpm run check && pnpm run test:all && pnpm run docs:check`
- Manually run the dashboard (`run` skill) against a local DB seeded by the directory import. Walk the Stage 3 e2e flow as the operator would, in French and English.
- Tests use stubs only; no live model API, no live third-party scan.

## STOP conditions

- The Stage 1 spike cannot hit indexed filters under ~100 ms on 13k rows. Rethink the directory storage before Stage 2.
- The production backup is missing or unverified before Stage 6 step 4.
- Stage 6 would delete a paid client audit or report the operator has not explicitly confirmed.
- A legal doc states a retention or contact obligation that the new model would contradict in a way that is more than a wording update. Report it to the operator with evidence before changing it.
- Removing a gate would let a scan bypass robots.txt, pacing, or suppression.
