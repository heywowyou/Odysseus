# Plan 048: reduce the dashboard to one operator workflow

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Dependency and drift check (run first)**: this plan was written while Plan
> 047 was still an uncommitted worktree at commit `ade9bfb`, so drift from that
> commit is expected. First confirm that Plan 047 is `DONE` in
> `plans/README.md`, its production fresh start and post-deploy operator
> rehearsal are recorded, and `git status --short` contains no unfinished Plan
> 047 source changes. Then run:
>
> ```bash
> git diff --stat ade9bfb..HEAD -- \
>   packages/interface/src/dashboard \
>   packages/interface/src/routes \
>   packages/store/src \
>   docs/product/dashboard-ia.md \
>   docs/product/dashboard-ux-audit.md
> ```
>
> Compare the post-047 tree with the "Required Plan 047 baseline" below. File
> renames made by Plan 047 are expected; a missing baseline behavior or a live
> rehearsal that contradicts a product assumption is a STOP condition. Do not
> restore a deleted candidate/cohort/wave module to match a provisional path in
> this plan.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/047-prospect-hub.md` fully DONE, including Stage 4
  deletion, Stage 6 production fresh start, and a recorded post-deploy operator
  rehearsal
- **Category**: direction / tech-debt
- **Planned at**: commit `ade9bfb`, 2026-09-15, with Plan 047 in progress in the
  working tree
- **Execution status**: BLOCKED until the dependency above is complete

## Why this matters

Plan 047 fixes the data model: one durable prospect owns scans, previews,
emails, status, outcomes, and history. Its provisional dashboard still exposes
the old system's shape: five campaign/navigation destinations, a separate
Results table over the same prospects, five scan types, two large duplicated
filter forms, and a prospect page where editing, scanning, outreach, outcome,
history, and deletion compete at the same visual level.

This plan removes those remaining choices without restoring selection gates.
The final dashboard has three primary navigation items, one recommended next
action per prospect, three operator-facing scan intents, one shared filter
module, and one Prospects surface that includes the campaign-results view.
Directory remains a distinct page and Prospects continues to list prospects
only. Legal/safety checks remain the only blockers, sending remains manual, and
all other actions stay available as secondary actions.

## Required Plan 047 baseline

Do not execute this plan until all of the following are true:

- `prospectId` is the durable link for every scan, preview, draft, thread,
  outcome, job, and event. Candidate/cohort/wave/score selection code is gone.
- The old hotel-pipeline schemas, repositories, routes, dashboard pages, and
  job gates listed in Plan 047 Stage 4 have been deleted. At planning time, 107
  non-test files still referenced `candidateId`; that is unfinished Plan 047
  work, not scope for this plan.
- One deep prospect-work module owns crawl/provenance qualification,
  suppression, draft/reply/follow-up state, open-work derivation, and the
  recommended next action. It has a bulk-loading interface for lists and a
  single-prospect interface for the hub. `À traiter`, the prospect page, and
  the sidebar badge all consume it.
- That module selects the newest *qualifying* attached audit, checks the email
  domain independently from the website domain for suppression, and uses
  narrow audit projections.
- Directory, Prospects, Results, prospect detail, launch attachment, and
  `À traiter` have centralized FR/EN copy, render/axe coverage, working action
  targets, and the Plan 047 end-to-end test.
- The production fresh start preserved suppression, the new directory was
  imported, and the post-deploy operator rehearsal is recorded in
  `docs/product/dashboard-ux-audit.md`.

If any item is false, finish Plan 047 instead of compensating here.

## Current state at planning time

These excerpts describe the provisional Plan 047 implementation and explain
the simplification target. Re-read their post-047 equivalents before editing.

- `packages/interface/src/dashboard/app/shell.tsx:39-59` exposes Audits,
  À traiter, Annuaire, Prospects, and Résultats as primary navigation items:

  ```tsx
  const navGroups = [
    { items: [{ to: '/audits', ... }] },
    {
      items: [
        { to: '/a-traiter', ... },
        { to: '/annuaire', ... },
        { to: '/prospects', ... },
        { to: '/resultats', ... },
      ],
    },
  ];
  ```

- `packages/interface/src/routes/prospect-hub.ts:111-125` serves Results and
  Prospects through the same `listProspects` repository function. The separate
  route adds no domain behavior:

  ```ts
  router.get('/api/prospect-hub/results', ... listProspects(...));
  router.get('/api/prospects', ... listProspects(...));
  ```

- `packages/interface/src/dashboard/routes/new-scan.tsx:137-146` exposes five
  implementation-shaped choices, including a UI explicitly labeled as a legacy
  batch:

  ```tsx
  full-audit
  quick-check
  light-audit
  prospecting-audit
  prospecting
  ```

- `packages/interface/src/dashboard/routes/prospect-hub-detail.tsx:421-483`
  presents three scan buttons, three outreach-readiness cards, an outcome
  selector, and deletion together. The editable record above it renders seven
  always-open inputs at lines 305-419.
- `packages/interface/src/dashboard/routes/prospect-hub-list.tsx:201-307` and
  `packages/interface/src/dashboard/routes/directory.tsx:101-177` duplicate the
  same search, sector, stars, group, website-kind, department, and room filters.
- `packages/interface/src/dashboard/routes/prospect-hub-results.tsx:43-128`
  duplicates the prospect list and exposes both status and outcome controls,
  even though recording an outcome already advances status.

## Design contract

### Primary navigation

The sidebar contains exactly three operational destinations:

1. `À traiter` / `To do` — default landing page and complete work queue.
2. `Prospects` — portfolio, discovery entry point, and results views.
3. `Audits` — scan history and technical/report work.

`Annuaire` remains `/annuaire`, but is reached from the prominent “Ajouter
depuis l'annuaire” / “Add from directory” action on Prospects, not the sidebar.
`Résultats` becomes the `results` view of Prospects. `/resultats` remains as a
compatibility redirect to `/prospects?view=results`.

The suppression lookup and Tools remain footer utilities and do not count as
primary destinations.

### Operator process

```text
Find or add prospect
        ↓
Prepare outreach (complete prospecting audit)
        ↓
Review deterministic first-email draft in À traiter
        ↓
Handle reply or due follow-up in À traiter
        ↓
Record outcome; status advances automatically
```

The quick check is optional information. A paid client report remains a
separate secondary action. Neither is inserted as a required outreach step.
The tool still never sends email.

### Prospect page hierarchy

The page has at most one prominent recommended action from the Plan 047
prospect-work module. It is guidance, not a new gate. Terminal prospects
(`won`, `lost`, or `opted-out`) show a plain completed state and no invented
next action. Non-terminal recommendations follow the stored work facts:

| Facts | Recommended action |
| --- | --- |
| No qualifying outreach audit | Prepare outreach |
| Qualifying audit, no first-email draft/thread | Create first email |
| Draft waiting for review | Review draft |
| Sent touch with follow-up due | Create follow-up |
| Follow-up draft waiting for review | Review draft |
| Reply waiting for an outcome | Record outcome |

The page also exposes:

1. a read-only summary (name, site, location, status, email, sector badges);
2. the recommended action and its plain-language refusal/remedy when blocked;
3. outreach controls and the newest relevant audit/draft/thread state;
4. the three most recent activity items;
5. “All actions”, “Edit details”, and “Full history” as secondary disclosures.

All actions allowed by the central guards remain reachable under “All
actions”. Informational facts such as stars, group, website kind, and quick
check never block them. Manual status correction moves under a clearly named
secondary control; recording an outcome remains the normal path and updates
status automatically.

### Scan vocabulary

The dashboard exposes exactly three scan intents:

- `quick-check` → “Contrôle rapide” / “Quick check”;
- `prospecting-audit` → “Préparer la prospection” / “Prepare outreach”;
- `full-audit` → “Préparer le rapport client” / “Prepare client report”.

Remove the operator-facing single-site `light-audit` alias. At planning time it
only mapped to the generic `prospecting` job runner, skipped the model/report,
and had no stated post-047 outcome. Keep the internal/batch `prospecting`
`JobType` only if a post-047 CLI or bounded batch workflow still calls it; do
not expose that batch in the ordinary New scan form. Use `fallow dead-code
--trace` before deleting each alias/export.

### Filters and views

Combined filters remain fully supported and URL-addressable. Simplification is
progressive disclosure, not capability removal:

- Prospects initially shows search, view/status, and a “Filtres (n)” button.
- Directory initially shows search, stars, department, and “Filtres (n)”.
- The advanced panel holds sector, group, website kind, commune/postcode, room
  range, has-scan, and inactivity where applicable.
- Active advanced filters remain visible as removable chips; “Tout effacer” /
  “Clear all” resets them and page number.
- One pure filter model parses and serializes URL state, counts active filters,
  and supplies the request query for both pages. One shared filter-bar module
  renders common controls with small source-specific slots.

`view=results` shows statuses `contacted`, `follow-up`, `replied`, `call`,
`quoted`, `won`, `lost`, and `opted-out`; `new` and `audited` remain in the
ordinary portfolio view. It preserves a campaign-level count for each results
status above the table and allows recording an outcome. It shows status as a
badge, not a second inline mutation control. Manual status correction remains
on the prospect page.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused unit tests | `pnpm test packages/interface/src/dashboard/routes packages/interface/src/routes packages/store/src` | exit 0; selected suites pass |
| Dashboard typecheck | `pnpm --filter @odysseus/interface typecheck` | exit 0, no errors |
| Dashboard e2e | `pnpm run test:e2e` | exit 0; browser/CLI suites pass |
| Repository check | `pnpm run check` | exit 0, including docs, format, lint, types, architecture, and dead-code checks |
| Full suite | `pnpm run test:all` | exit 0 |
| Docs | `pnpm run docs:check` | exit 0 |

Tests must use fixtures/stubs and must not call a live model or scan a live
third-party site. A production rehearsal is allowed only when the operator has
explicitly authorized that real-site operation.

## Suggested executor toolkit

- Use the `frontend-design` skill, if available, for the task-first hierarchy
  and progressive-disclosure treatment. Preserve the existing dashboard's
  visual language and UI primitives; this is a structural simplification, not
  a new aesthetic direction.
- Use the `dashboard-ux-audit` skill, if available, only for the explicitly
  required operator rehearsals and follow its external-action boundaries.
- Use `fallow dead-code --trace` before every deletion of a route, component,
  scan alias, or i18n key.

## Scope

The exact post-047 filenames must be confirmed in Step 0. Expected in-scope
files are:

**Dashboard navigation and routes**

- `packages/interface/src/dashboard/App.tsx`
- `packages/interface/src/dashboard/app/shell.tsx`
- `packages/interface/src/app-routes.ts`
- `packages/interface/src/dashboard/accessibility.test.ts`

**Prospect, directory, and results surfaces**

- `packages/interface/src/dashboard/routes/prospect-hub-list.tsx`
- `packages/interface/src/dashboard/routes/prospect-hub-detail.tsx`
- `packages/interface/src/dashboard/routes/prospect-hub-results.tsx` (delete)
- `packages/interface/src/dashboard/routes/prospect-hub-model.ts`
- `packages/interface/src/dashboard/routes/directory.tsx`
- `packages/interface/src/dashboard/routes/prospect-filter-model.ts` (create)
- `packages/interface/src/dashboard/routes/prospect-filter-model.test.ts` (create)
- `packages/interface/src/dashboard/routes/prospect-filter-bar.tsx` (create)
- focused render tests beside the affected routes (create or update)

**Scan intent surface**

- `packages/interface/src/dashboard/routes/new-scan.tsx`
- `packages/interface/src/dashboard/routes/new-scan-model.ts`
- `packages/interface/src/dashboard/routes/new-scan-model.test.ts`
- `packages/interface/src/dashboard/routes/scan-progress.tsx`
- `packages/interface/src/dashboard/routes/audits.tsx`
- `packages/interface/src/dashboard/lib/api-schemas.ts`
- `packages/interface/src/routes/scans.ts`
- `packages/interface/src/routes/scans.test.ts`
- post-047 store job/active-job schema files only where `light-audit` remains a
  live alias

**Prospect list adapter and copy**

- post-047 prospect route/store modules that implement `GET /api/prospects`
  and its status-count projection
- `packages/interface/src/dashboard/lib/api-types.ts`
- `packages/interface/src/dashboard/i18n/types.ts`
- `packages/interface/src/dashboard/i18n/fr.ts`
- `packages/interface/src/dashboard/i18n/en.ts`

**Documentation**

- `docs/product/dashboard-ia.md`
- `docs/product/dashboard-ux-audit.md`
- `docs/decisions/trade-offs.md` only to amend decision 87 with the final
  navigation/view outcome
- `plans/README.md`

**Out of scope**

- Any Plan 047 completion work, including guard correctness, bulk work loading,
  sidebar work-count correctness, candidate/cohort/wave deletion, prospect
  attachment, or the production fresh start.
- Scanner behavior, normalization, LLM prompts, report contents, preview
  contents, or outreach templates.
- New selection scores, cohorts, waves, qualification gates, Kanban boards,
  generic workflow builders, KPI dashboards, or automatic sending.
- A new persistence collection or migration. Status counts are a read
  projection over prospects.
- Public-site changes.

## Git workflow

- Work directly on `main`, matching Plans 045 and 047, unless the operator
  explicitly changes that instruction.
- Make one commit per step after its focused verification passes, then a small
  `plans/README.md` changelog update. Use past-tense, concrete messages matching
  recent history, for example `Collapse campaign results into prospects`.
- Never include model credit or `Co-Authored-By` lines.
- Do not push or publish anything unless the operator explicitly asks.

## Steps

### Step 0: rebaseline after Plan 047 and rehearse before changing UX

1. Confirm every item in “Required Plan 047 baseline”. Run `git status
   --short`; stop if Plan 047 source work remains uncommitted or the tree has
   overlapping unknown edits.
2. Run `pnpm run check` and the focused Plan 047 tests. Both must be green.
3. Read the latest post-deploy run in `docs/product/dashboard-ux-audit.md`.
   Rehearse these journeys on the authorized environment:
   - add one directory entry as a prospect;
   - prepare outreach and reach a reviewable first-email draft;
   - open that work from `À traiter`;
   - handle a due follow-up or reply fixture and record an outcome;
   - start a paid client audit from the same prospect without sending anything.
4. Record navigation count, visible decision count on the prospect page, scan
   choices, clicks/pages per journey, and every wrong or dead-end action. Add
   the run to the existing ledger without deleting history.

**Verify**: `pnpm run docs:check` → exit 0; the ledger contains a post-047 run
covering all five journeys in both French and English.

**STOP** if the rehearsal shows that operators routinely enter Directory
independently rather than from Prospects, that Results has a distinct job not
captured by the results view below, or that `light-audit` produces an output
needed by a real post-047 journey. Return this plan for revision with the
recorded evidence.

### Step 1: collapse navigation and Results into Prospects

1. In the post-047 prospect list model, add a typed view parameter with at
   least `all` and `results`. Parse unknown values as `all`; preserve the view
   in the URL when paging or changing filters.
2. Extend the existing prospect list read to accept `view=results`. Implement
   it as a status `$in` filter over exactly `contacted`, `follow-up`, `replied`,
   `call`, `quoted`, `won`, `lost`, and `opted-out`, not as a new persisted
   boolean. Return counts for those statuses in the same response.
3. Render the results view inside the Prospects page. Keep the campaign-level
   status counts, show one status badge per row, and keep only the outcome
   action inline. Link every row to its prospect.
4. Change `/resultats` and the historical `/outreach/outcomes` route to redirect
   to `/prospects?view=results`. Delete the dedicated results component and its
   now-dead endpoint, types, and strings after `fallow dead-code --trace`.
5. Remove Annuaire and Résultats from the sidebar. Keep the Annuaire route and
   the Prospects-page action that opens it. The sidebar badge continues to use
   the Plan 047 shared work count.

**Verify**:

```bash
pnpm test packages/interface/src/dashboard packages/interface/src/routes
pnpm --filter @odysseus/interface typecheck
```

Both commands exit 0. Tests prove the redirects, exactly three operational
sidebar links, results filtering/counts, outcome recording, and manual status
correction remaining reachable on prospect detail.

### Step 2: reduce the dashboard to three scan intents

1. Change New scan and prospect-detail copy to the three intent labels in the
   Design contract. Keep underlying persisted `JobType` vocabulary internal.
2. Remove the legacy batch option from the ordinary New scan form. Preserve a
   bounded CLI/batch adapter only if a post-047 caller remains.
3. Run `fallow dead-code --trace` for `light-audit`. If it confirms the
   single-site alias has no distinct post-047 consumer, delete it from the
   dashboard model, route input union, active-job kind, persisted optional
   `scanType` enum, response schemas, labels, and tests. Do not delete the
   generic `prospecting` job runner merely because the alias is removed.
4. From a prospect page, make “Prepare outreach” the ordinary scan action. Put
   Quick check and Prepare client report in All actions unless the shared work
   module recommends one of them for the current state.
5. A prospect-started scan is already attached and never asks the operator to
   pick the same prospect again. The generic New scan form retains domain
   auto-match, search existing, create inline, and do-not-attach choices from
   Plan 047.

**Verify**:

```bash
pnpm test packages/interface/src/dashboard/routes/new-scan-model.test.ts packages/interface/src/routes/scans.test.ts packages/store/src/active-jobs.test.ts
rg -n "['\"]light-audit['\"]" packages --glob '*.{ts,tsx}'
```

Tests pass. The `rg` command returns no matches. The dashboard renders exactly
three scan intents in French and English, and no ordinary form contains the
legacy batch option.

### Step 3: make prospect detail task-first

1. Consume the single-prospect interface of the Plan 047 prospect-work module.
   Do not derive actionability or guards in React.
2. Replace the always-editing first card with a read-only summary. Put field
   editing, field origins, multiple websites/emails, and technical identifiers
   in an accessible disclosure or dialog labeled “Modifier la fiche” / “Edit
   record”. Preserve every field and its origin; this is presentation-only.
3. Render at most one prominent recommended action, following the table in the
   Design contract. Terminal prospects render the completed state instead. If
   the recommended action is blocked, keep it visible and show the central
   refusal's translated reason and remedy inline. Render all other valid
   actions in an “Toutes les actions” / “All actions” disclosure, preserving
   disabled-with-reason behavior.
4. Show the latest relevant audit/draft/thread state and the three newest
   activity events. Move the complete event/scan history behind “Historique
   complet” / “Full history”; preserve direct `#emails` and `#history` targets.
5. Remove the ordinary status dropdown from the header. Show status as a badge;
   put manual correction behind “Corriger le statut” / “Correct status”. Keep
   outcome recording in the active outreach section so it remains the normal
   state-transition path.
6. Preserve preview, first-email, follow-up, attach/detach, scan deletion, and
   prospect deletion capabilities. No action may disappear solely because it
   is not recommended.

**Verify**: focused prospect-detail model/render/axe tests pass. Tests cover
every recommended-action state, a blocked action with a translated remedy,
secondary-action reachability, manual status correction, hash targets, and
FR/EN parity.

### Step 4: share and progressively disclose prospect filters

1. Create `prospect-filter-model.ts` with one `ProspectFilterState` interface,
   `parseProspectFilters`, `serializeProspectFilters`, `activeFilterCount`, and
   page-reset behavior. It is the test surface; callers do not manipulate
   `URLSearchParams` field by field.
2. Create `prospect-filter-bar.tsx`. Its interface accepts the state, source
   (`prospects` or `directory`), and one change callback. Keep source-specific
   controls inside the implementation rather than exposing a callback per
   field.
3. Switch Prospects and Directory to the shared model and bar. Preserve all
   combined server filters and URL deep links. Render the initially visible
   controls and advanced controls exactly as specified in the Design contract.
4. Render active advanced filters as removable localized chips and add a clear
   action. Returning from a prospect to either list must preserve the query.
5. Delete duplicated builders, filter constants, and local update functions
   only after both callers and tests cross the new interface.

**Verify**:

```bash
pnpm test packages/interface/src/dashboard/routes/prospect-filter-model.test.ts packages/interface/src/dashboard/routes
pnpm --filter @odysseus/interface typecheck
```

Both commands exit 0. Tests round-trip every supported filter, preserve unknown
unrelated query parameters, reset page on a filter change, and prove equivalent
requests from Prospects and Directory.

### Step 5: update the canonical IA and prove the complete workflow

1. Rewrite the maintained portions of `docs/product/dashboard-ia.md` so its
   target navigation, page destinies, prospect hierarchy, scan vocabulary, and
   step counts describe the shipped post-048 interface rather than Plan 040's
   candidate hub.
2. Amend trade-off 87 with the final navigation outcome: Directory remains a
   distinct page outside the sidebar; Results is a prospect view with campaign
   status counts; the recommended action is guidance, never a selection gate.
3. Update typed FR-first copy, then English. Run the parity test before broader
   checks.
4. Add or update one dashboard e2e flow using local/stubbed data:
   directory → add prospect → Prepare outreach → audit attached → first-email
   work appears in À traiter and its badge → review draft → record outcome →
   results view count/status update. Assert the manual-send note remains.
5. Repeat the Step 0 operator rehearsal after deployment when authorized and
   append the evidence to the UX ledger. Compare the recorded clicks/pages and
   visible decision count with the pre-change run; do not claim improvement
   without the comparison.

**Verify**:

```bash
pnpm run format
pnpm run check
pnpm run test:e2e
pnpm run test:all
pnpm run docs:check
```

Every command exits 0. The post-deploy rehearsal has no dead end, the three
workflow surfaces agree on the next action/count, and FR/EN complete the same
journeys.

## Test plan

Use adjacent post-047 tests as structural patterns; keep pure decisions out of
render tests.

- `prospect-filter-model.test.ts`: URL round trips, active counts, clear-all,
  page reset, results view, and all combined filter fields.
- Prospect list route/store tests: all/results population, pagination, status
  counts, and no duplicate Results endpoint.
- Shell/accessibility tests: exactly three operational links, shared work badge,
  mobile navigation, and axe in both languages.
- New scan model/route tests: three public intents, attached prospect launch,
  generic picker options, refusal handling, and no `light-audit` alias.
- Prospect detail model/render tests: one recommended action, all secondary
  actions reachable, translated refusal/remedy, status correction, outcome
  advancement, activity limit, and hash navigation.
- E2E: the complete deterministic workflow in Step 5. No live model and no
  unauthorized third-party scan.

## Done criteria

- [ ] Plan 047 is DONE, its production reset is recorded, and its post-deploy
      rehearsal predates Plan 048 implementation.
- [ ] Sidebar operational links are exactly À traiter, Prospects, and Audits;
      Annuaire remains reachable from Prospects.
- [ ] `/resultats` redirects to `/prospects?view=results`; no dedicated Results
      component or endpoint remains.
- [ ] Results view preserves campaign-level status counts and outcome entry;
      it does not duplicate manual status editing.
- [ ] The dashboard exposes exactly Quick check, Prepare outreach, and Prepare
      client report; no TypeScript runtime file contains the `light-audit`
      alias, and the legacy batch is absent from New scan.
- [ ] Prospect detail renders at most one recommended action (none for terminal
      states), keeps every other valid action reachable, and moves
      edit/history/status correction to secondary controls.
- [ ] Prospects and Directory share one filter model and filter-bar interface;
      all combined filters and URL deep links still work.
- [ ] `À traiter`, its sidebar badge, and prospect detail agree because all use
      the Plan 047 prospect-work module.
- [ ] Typed FR/EN parity, render tests, axe tests, and the complete e2e workflow
      pass.
- [ ] `pnpm run check`, `pnpm run test:e2e`, `pnpm run test:all`, and
      `pnpm run docs:check` exit 0.
- [ ] `git diff --name-only` contains only the reconciled in-scope files and the
      Plan 048 index/changelog update.

## STOP conditions

Stop and report back instead of improvising if:

- Plan 047 is not fully DONE, its old candidate/cohort/wave implementation is
  still live, or its production fresh start/rehearsal is unrecorded.
- The post-047 rehearsal shows Directory is a frequent independent destination
  that needs permanent primary navigation, or Results has a distinct operator
  job that cannot fit a prospect view with summary counts.
- `light-audit` has a distinct post-047 consumer or output required by a real
  operator journey. Keep it unchanged and return evidence; do not merely hide
  it or delete its behavior.
- The Plan 047 prospect-work module cannot express the recommended action
  without adding client-side guard logic. Deepen that module in Plan 047 or
  return this plan for revision.
- Preserving result counts requires a new persistence collection or a data
  migration.
- Any change would weaken suppression, crawl politeness, complete-coverage or
  current-provenance checks, deterministic outreach copy, or manual sending.
- An in-scope step requires scanner, report-content, LLM, public-site, or
  production-data changes.
- A verification command fails twice after a reasonable scoped correction.

## Maintenance notes

- The prospect-work module's interface is the shared test seam. Future work
  states must be added there once, then consumed by the shell, queue, and detail
  adapters; do not recreate action ladders in React.
- Directory and Prospects remain distinct data sets even though they share a
  filter module. Never let Directory rows silently become prospects.
- `view=results` is a projection, not a second status model. Outcome events and
  the single prospect status remain authoritative.
- Keep queue/job implementation names out of operator copy. Persisted job types
  may remain for migration or CLI compatibility after their dashboard aliases
  disappear.
- Reviewers should scrutinize action reachability, URL-state preservation,
  translated refusal remedies, and the claim that `light-audit` is dead before
  accepting deletion.
- Do not add Kanban, funnel charts, cohort/scoring UI, or configurable workflows
  without measured operator evidence; they would reverse this plan's purpose.
