# Plan 050: make scans reusable and prospects durable

> **Executor instructions.** Rebaseline this plan against the actual working tree before implementation. Plan 049 is complete and this plan intentionally changes several product contracts established by Plans 047–049.
>
> This is a product-architecture and lifecycle correction, not a cosmetic dashboard pass. The goal is to stop expensive website evidence from being treated as disposable, stop software-version changes from forcing unnecessary rescans, and stop ordinary prospect removal from destroying operator enrichment and history.
>
> Work directly on `main` unless the operator changes that instruction. Use focused commits by step. Run the stated verification before moving forward. Do not push, deploy, publish outreach, send mail, or launch a live third-party scan without explicit operator authorization.

## Status

- **Priority:** P1
- **Effort:** XL
- **Risk:** HIGH — scan orchestration, audit qualification, report compatibility, prospect lifecycle, directory linkage
- **Depends on:** Plan 049 DONE
- **Category:** product architecture / workflow simplification / data durability
- **Planned:** 2026-09-16
- **Execution status:** IMPLEMENTED (2026-09-16), post-deploy acceptance rehearsal pending operator authorization.
  - Steps 1–7 (`1c7636a`): New scan and the prospect page offer only Quick check and Full scan; the scans API refuses `prospecting-audit`/`outreach-full-scan` as new work while stored rows and queued jobs stay readable and drain through the compatibility runner; outreach qualification is purpose plus complete coverage, with the normalization fingerprint reported as advisory `current`/`older`/`unknown`; report delivery depends only on matching findings provenance, template age is a neutral badge; `makeReportReady` is proven never to call the audit stage. Step 3 needed no runtime change: an identity-unconfirmed Full scan already persists and advances the prospect.
  - Steps 8–12 (`2597b4d`): `archivedAt` lifecycle with idempotent `archiveProspect`/`restoreProspect` and events; archived prospects leave lists, counts, and To-do; archived view; directory rows show Open/Restore, adds claim the entry atomically, source refresh never writes the link; `deleteProspectPermanently` behind a counted impact confirmation. Mongo-backed regression tests cover every archive/directory case the plan lists.
  - Step 13: copy and docs (`dashboard-ia.md`, project brief, outreach rules, trade-off 91, trade-off 88 note). Remaining `prospecting-audit`/"prospecting audit" matches are historical-compatibility code, tests of the retirement, legacy display labels, archived plans/UX-ledger history, and the unreferenced legacy `prospects`/`prospectDetail`/`hub` i18n namespaces.
  - No rescan, destructive migration, deploy, send, or live third-party scan was performed.
- **Supersedes / amends:**
  - Plan 048's three operator-facing scan intents;
  - Plan 049's requirement that outreach qualification requires the current normalization fingerprint;
  - any workflow assumption that `prospecting-audit` must remain a newly launchable operator scan;
  - the current destructive meaning of ordinary prospect deletion.
- **Preserves:**
  - Quick Check as a lightweight informational probe;
  - suppression/legal safety blockers;
  - manual sending;
  - complete crawl/coverage requirements for outreach-grade evidence;
  - historical scan/job compatibility;
  - the directory as external/source data rather than an operator-edited CRM record.

---

# Why this matters

Three lifecycle problems now compound each other.

## 1. The product performs the expensive crawl twice for no useful reason

The current operator model exposes:

```text
Quick check
Prepare outreach
Prepare client report
```

After Plan 049, Prepare outreach performs the normal complete audit crawl and persists its findings, then stops before LLM analysis and report generation.

Prepare client report performs the same complete audit crawl and then continues through analysis and reporting.

For a large site, the crawl can take hours while the additional analysis/report work is comparatively cheap.

The expensive resource is therefore:

```text
website evidence capture
```

not:

```text
LLM analysis / PDF generation
```

The product should model that truth.

A complete scan must be reusable for every downstream operation. Generating a report, preview, email, or refreshed writing layer must never imply another website crawl.

## 2. Software evolution currently makes valid evidence operationally unusable

Outreach qualification currently combines:

```text
eligible scan purpose
AND complete crawl coverage
AND current normalization provenance
```

That turns a normalization fingerprint mismatch into an operational refusal.

The result is that changing normalization/report logic can make a multi-hour scan appear unusable even though the captured website evidence still exists.

These are different questions:

```text
Was enough website evidence captured?
```

and:

```text
Was the derived representation produced by today's exact code?
```

The first determines whether a scan is complete.

The second is provenance metadata and may determine whether some derived output needs an offline refresh.

A software-version mismatch alone must not imply another network crawl.

## 3. Ordinary prospect deletion currently destroys valuable business data

The durable prospect contains data that may have taken significant operator effort to assemble:

- corrected website;
- SIREN/SIRET;
- trading name;
- legal name;
- email addresses;
- stakeholders;
- notes;
- audit history;
- reports;
- outreach previews;
- drafts;
- threads;
- outcomes;
- prospect events.

The directory is intentionally only a source catalogue.

Deleting the prospect currently removes the enriched prospect and its attached operational history, then unlinks the directory row. Adding that directory hotel again therefore creates a fresh prospect from the source data.

That makes the prospect insufficiently durable for its role as the operator's long-lived business record.

---

# Binding product contract

## 1. The dashboard exposes exactly two scan choices

The ordinary operator-facing scan vocabulary becomes:

| Scan | Purpose | Crawl | Lighthouse | Analysis | Client reports | Outreach-grade |
| --- | --- | --- | --- | --- | --- | --- |
| **Quick check** | Fast informational inspection | bounded one-page probe | no | no | no | never |
| **Full scan** | Capture complete reusable evidence | normal complete crawl | normal audit policy | FR + EN | FR + EN when inputs permit | yes when coverage qualifies |

The internal canonical type for Full scan should remain:

```text
full-audit
```

unless implementation evidence demonstrates a compelling reason to rename it.

Do **not** create a repository-wide rename merely to make the internal type match the UI label.

### Historical compatibility

Existing:

```text
prospecting-audit
outreach-full-scan
```

rows remain readable.

A historically complete `prospecting-audit` remains eligible evidence according to the compatibility rules below.

No migration may relaunch a website scan or rewrite historical scan purpose merely to make old records look like new Full scans.

New ordinary dashboard actions must stop creating `prospecting-audit` jobs.

The internal bounded `prospecting` batch may remain where a real CLI/batch caller still needs it. It is not an operator scan choice.

---

## 2. One Full scan is the reusable evidence source for all later actions

The target workflow becomes:

```text
Prospect
   │
   ├── Quick check ────── optional informational snapshot
   │
   └── Full scan
          │
          ├── captured pages / measurements
          ├── normalized findings
          ├── FR analysis
          ├── EN analysis
          ├── FR client report
          └── EN client report
                 │
                 ├── outreach preview
                 ├── first email
                 ├── later email work
                 ├── report regeneration
                 └── future derived outputs
```

The Full scan captures website evidence once.

Every downstream artifact works from that stored audit.

### Full scan should eagerly create cheap non-side-effect outputs

When inputs permit, a Full scan should continue automatically through:

```text
audit
→ analysis FR
→ analysis EN
→ report FR
→ report EN
```

This preserves the current Full Audit composition.

### Do not automatically perform operator side effects

A Full scan must **not** automatically:

- publish a public outreach preview;
- create a mailbox draft;
- send anything;
- mark an outcome.

Those remain explicit operator actions because they create public or communication state.

They must, however, reuse the existing Full scan.

---

## 3. Missing report inputs do not make the Full scan fail

Identity confirmation or another report-specific requirement may prevent a report from being produced immediately.

That must not reinterpret the underlying scan as unsuccessful.

Model the distinction explicitly:

```text
Full scan evidence: complete
Derived client report: needs input
```

Once the missing input is supplied:

```text
stored Full scan
→ resume/rebuild derived stages
→ reports
```

Never:

```text
missing report field
→ rescan website
```

A report-stage failure after the crawl likewise leaves the completed audit reachable and reusable.

---

# Audit qualification and version policy

## 4. Outreach qualification becomes purpose + coverage

For current and compatible historical audits:

```text
eligible scan purpose
AND complete crawl coverage
```

is sufficient to make an audit outreach-grade.

Eligible purposes:

```text
full-audit
historical complete prospecting-audit
historical outreach-full-scan classified as complete prospecting evidence
```

Ineligible purposes remain:

```text
quick-check
bounded batch prospecting
known historical lightweight scans
unknown legacy scans whose purpose/completeness cannot be established safely
```

Remove the current normalization fingerprint from the binary outreach-qualification decision.

In particular:

```text
normalizationFingerprint !== current fingerprint
```

must **not** produce:

```text
allowed: false
refusal: audit-stale
```

on its own.

Coverage and purpose remain real blockers. Version age does not.

---

## 5. Replace global `stale` with advisory provenance state

The current `stale` concept conflates two unrelated conditions:

1. evidence is insufficient;
2. derived data was produced under older code.

Split them.

Recommended audit provenance model:

```text
dataVersionState:
  current
  older
  unknown
```

or an equivalent typed representation.

This state is advisory.

For a complete Full scan produced under an older normalization fingerprint:

```text
qualification: qualifying
dataVersionState: older
```

not:

```text
qualification: stale
```

The work model should therefore stop recommending another audit solely because the fingerprint changed.

The `audit-stale` refusal/recommendation path should disappear from ordinary outreach gating once all callers have migrated.

Do not leave a second hidden exact-fingerprint gate in preview publishing, first-email generation, or another downstream route.

---

## 6. Show provenance and age instead of blocking

The prospect/audit UI should make the state understandable.

For example:

```text
Full scan
12 September 2026

This scan was produced with an older Odysseus data version.
The stored results remain usable.
```

Actions remain available:

```text
Create outreach
Use report
Regenerate derived outputs
Run new full scan
```

Also expose the scan date clearly.

Age is informational:

```text
Scanned 47 days ago
```

Do not invent a fixed time threshold that silently makes a scan unusable.

The operator chooses when website freshness warrants another scan.

---

# Reusing older scans

## 7. Existing artifacts remain usable regardless of current software fingerprint

An existing historical artifact must not disappear merely because current code changed.

Subject to actual file integrity and existing safety rules:

- an existing report remains viewable/downloadable;
- an existing qualifying audit remains usable for outreach;
- an existing outreach preview remains governed by its own lifecycle;
- historical analyses remain inspectable.

A newer software release must not retroactively pretend those outputs never existed.

---

## 8. Distinguish offline derived-data refresh from a rescan

There are two fundamentally different operations:

### Recompute from stored evidence

```text
existing audit artifacts
→ renormalize/rebuild derived findings
→ analysis
→ report
```

No requests to the prospect website.

### Rescan

```text
prospect website
→ Chromium/network crawl
→ new evidence
```

These must never be conflated in UI, API naming, job state, or operator recommendations.

Existing `makeReportReady`/renormalization infrastructure may be reused for the first operation.

A derived-data refresh may happen when the current renderer genuinely cannot consume an older representation, but it must:

- reuse stored scan evidence;
- never launch `runAuditStage`;
- never make external website requests;
- preserve the audit's original scan date;
- make clear that derived data was refreshed from previously captured evidence.

### Outreach specifically

A complete historical Full/Prepare-outreach scan should be usable directly for outreach despite an older normalization fingerprint.

Do not require an offline normalization refresh merely to clear the outreach gate unless the particular outreach renderer truly cannot parse the stored data.

---

## 9. Action-specific incompatibility is allowed; global invalidation is not

Some future feature may require data that an old scan never captured.

Handle that narrowly.

Example:

```text
Full scan from September:
✓ complete enough for outreach
✓ existing report remains available
✗ new feature X has no measurement
```

Do not convert that into:

```text
entire audit unusable
```

If a specific new output genuinely cannot be generated from stored evidence, state exactly that:

```text
This scan does not contain the measurement required for X.
Run a new Full scan to include it.
```

Other actions remain available.

---

# Durable prospect lifecycle

## 10. Archiving is not a sales status

Do **not** add:

```text
status: archived
```

to the current business-status graph.

Statuses such as:

```text
new
audited
contacted
follow-up
replied
call
quoted
won
lost
opted-out
```

describe the commercial/outreach state.

Archiving describes whether the operator wants the record in active working views.

Add a separate lifecycle field, preferably:

```text
archivedAt?: Date
```

Optionally add narrowly justified metadata such as:

```text
archiveReason?
```

only if there is an actual UI/use case for it.

The event actor already records who performed an action, so do not duplicate `archivedBy` unless implementation requires it.

No migration is necessary for current prospects:

```text
archivedAt absent = active
```

---

## 11. Archive preserves the prospect and everything attached to it

Normal removal from the active prospect workflow becomes:

```text
Archive prospect
```

Archiving must preserve:

- prospectId;
- every manually edited/enriched field;
- field origins;
- notes;
- stakeholders;
- audits;
- findings;
- analyses;
- reports;
- report approvals;
- previews;
- drafts;
- outreach threads;
- outcomes;
- event history;
- jobs/history needed to explain those records;
- directory linkage.

Archive must **not** call the current destructive prospect cascade.

Restoring sets the same durable record active again.

It does not create a new `prospectId`.

---

## 12. Archive/restore gets explicit history

Add prospect lifecycle events equivalent to:

```text
prospect-archived
prospect-restored
```

Use repository naming conventions if another event shape fits better, but preserve the distinction from normal field edits and status changes.

Archive and restore update `updatedAt` / `lastActivityAt` consistently with the rest of the prospect model.

---

## 13. Archived prospects leave active work without losing history

By default:

```text
Prospects
To do
Results/work recommendations
```

should not include archived prospects.

Add an explicit archived view/filter.

An archived prospect detail remains reachable directly and clearly indicates:

```text
Archived
Restore prospect
```

The store/work layer must exclude archived prospects from generated To-do items and recommended active work.

Do not accomplish this by deleting drafts, audits, or history.

---

## 14. Archive does not silently rewrite outreach history

Archiving is a record-management action, not an outreach outcome.

Therefore archiving must not automatically:

- mark the prospect `lost`;
- mark the prospect `opted-out`;
- add suppression;
- erase sent history;
- revoke a preview that may already have been sent;
- destroy mailbox drafts;
- invent an outcome.

If active outreach needs to be withdrawn, use the existing explicit withdrawal/status mechanisms.

The archived record is merely removed from active operator work until restored.

---

# Directory relationship

## 15. The directory remains source data

Do **not** solve enrichment durability by writing operator changes back into the Atout France directory record.

Keep the data model conceptually:

```text
Directory entry
external/source representation
        │
        │ prospectId
        ▼
Prospect
durable enriched operator representation
```

Examples of prospect-only/operator enrichment include:

- corrected/preferred website;
- SIREN;
- SIRET;
- legal name;
- trading name;
- contacts;
- stakeholders;
- notes;
- outreach language;
- workflow status;
- scans;
- outreach history.

The directory may display linked prospect state but should not become a second mutable copy of these fields.

---

## 16. Preserve the directory pointer when archiving

Archiving a directory-derived prospect must leave:

```text
directoryEntry.prospectId
```

intact.

The directory can then distinguish:

```text
not yet a prospect
active prospect
archived prospect
```

Expected actions:

| Directory state | Primary action |
| --- | --- |
| no linked prospect | Add to prospects |
| linked active prospect | Open prospect |
| linked archived prospect | Restore prospect |

Do not create a second prospect for an entry that already links to an archived prospect.

---

## 17. Directory re-import must preserve prospect linkage

Verify the directory ingestion/upsert path.

Refreshing Atout France/source data must not erase an existing:

```text
prospectId
```

link.

If the current upsert implementation replaces source rows in a way that can remove linkage, change it so source-owned fields update while the local relationship survives.

Add regression coverage explicitly.

---

# Permanent deletion

## 18. Keep hard deletion, but make it exceptional

The current destructive cascade remains useful for:

- accidental duplicate prospects;
- test records;
- bad imports;
- records the operator intentionally wants removed permanently.

Rename service/API concepts where useful so the semantics are unmistakable:

```text
deleteProspectPermanently
```

rather than allowing normal UI language to imply that deletion is equivalent to removing something from the active list.

The ordinary visible action is:

```text
Archive prospect
```

Permanent deletion belongs under a secondary destructive action/menu.

---

## 19. Permanent deletion must disclose its scope

Before hard deletion, tell the operator that it permanently removes the prospect and attached data.

Where practical, show counts or categories such as:

```text
1 prospect
2 audits
4 reports
1 outreach thread
3 drafts
...
```

Require explicit confirmation.

After confirmation, the existing cascade semantics may remain:

- delete audits and derivatives;
- delete outreach material/history according to the current permanent-deletion contract;
- delete events/jobs attached to the prospect;
- remove the prospect;
- unlink directory rows;
- retain independent suppression safety facts.

Archive must never execute this cascade.

---

# Implementation steps

## Step 0 — rebaseline the post-049 repository

Before editing:

```bash
git status --short
git rev-parse HEAD
pnpm run check
pnpm run test:all
pnpm run test:e2e
```

Inspect the actual current implementations of at least:

```text
packages/core/src/types/prospect.ts
packages/store/src/scan-intents.ts
packages/store/src/prospect-audit-qualification.ts
packages/store/src/prospect-work.ts
packages/store/src/guards.ts
packages/store/src/active-jobs.ts
packages/store/src/prospect-hub.ts
packages/store/src/schemas/job.schema.ts
packages/store/src/schemas/prospect-hub.schema.ts
packages/interface/src/routes/scans.ts
packages/interface/src/routes/prospect-hub.ts
packages/interface/src/queue/pipeline/run-prospecting-audit-job.ts
packages/interface/src/queue/pipeline/run-full-audit-job.ts
packages/interface/src/pipeline/make-report-ready.ts
packages/interface/src/pipeline/analysis-stage.ts
packages/interface/src/pipeline/report-stage.ts
packages/interface/src/dashboard/routes/new-scan-model.ts
packages/interface/src/dashboard/routes/new-scan.tsx
packages/interface/src/dashboard/routes/prospect-hub-detail.tsx
packages/interface/src/dashboard/routes/prospect-hub-list.tsx
packages/interface/src/dashboard/routes/directory.tsx
packages/interface/src/dashboard/i18n/fr.ts
packages/interface/src/dashboard/i18n/en.ts
```

Search all references to:

```text
prospecting-audit
Prepare outreach
Préparer la prospection
audit-stale
NORMALIZATION_FINGERPRINT
hasCurrentFindingsProvenance
deleteProspect
prospectId
```

Record any additional consumers before changing shared contracts.

**STOP** if post-049 work already changed these seams materially. Amend this plan to the actual interfaces rather than rebuilding deleted architecture.

---

## Step 1 — reduce newly launchable operator scans to two

Change current operator scan types from:

```text
quick-check
prospecting-audit
full-audit
```

to:

```text
quick-check
full-audit
```

for all newly created dashboard scans.

Update:

- new-scan model;
- scan form;
- prospect actions;
- launch route validation;
- scan-type labels;
- default scan selection;
- tests;
- documentation.

Operator labels:

```text
FR:
Contrôle rapide
Scan complet

EN:
Quick check
Full scan
```

The exact French wording may be polished during implementation, but it must no longer present outreach/report preparation as two different website crawls.

Do not remove historical job/schema compatibility yet.

**Verify:**

- dashboard exposes two types;
- API refuses newly submitted `prospecting-audit` as a current operator intent;
- historical `prospecting-audit` rows still render correctly;
- Quick Check still uses its dedicated lightweight runner;
- Full scan uses `runFullAuditJob`.

---

## Step 2 — retire `prospecting-audit` as new work without breaking history

Separate:

```text
current launch intents
```

from:

```text
historically readable audit/job intents
```

Do not force one union to serve both responsibilities if that keeps `prospecting-audit` accidentally launchable.

Preferred shape conceptually:

```text
CurrentScanIntent =
  quick-check
  full-audit

HistoricalScanIntent =
  quick-check
  prospecting-audit
  full-audit
```

Names may differ to suit the existing type architecture.

Keep compatibility handling for:

```text
prospecting-audit
outreach-full-scan
historical options.scanType
```

Delete the dedicated `runProspectingAuditJob` only after:

1. no current launch path can create that job;
2. historical queued rows no longer require that runner in production, or the runner is deliberately retained as a compatibility executor;
3. dead-code tracing proves removal is safe.

If old queued rows can still exist, retain a clearly marked compatibility runner.

Do not rewrite old job documents.

---

## Step 3 — make Full scan the sole complete current scan

Ensure `full-audit` carries every scan option the canonical complete crawl needs.

The single current complete path must preserve:

- prospect linkage;
- crawl limits/depth options;
- pacing;
- concurrency;
- seeds;
- exclusions;
- booking-engine overrides;
- SIREN/manual identity input;
- transaction-flow override;
- progress reporting;
- resumability/checkpoints;
- cancellation;
- host politeness;
- final prospect attachment/status behavior.

Do not lose advanced controls merely because the operator vocabulary was simplified.

A Full scan attached to a prospect may advance:

```text
new → audited
```

when coverage qualifies.

A Quick Check may not.

---

## Step 4 — remove software-version freshness from outreach qualification

Refactor `prospect-audit-qualification`.

The canonical qualifying predicate becomes conceptually:

```ts
hasOutreachEligiblePurpose(audit)
&& hasCompleteCoverage(audit)
```

Do not include exact normalization fingerprint equality.

Keep a separate function/state for provenance comparison.

Refactor `selectNewestQualifyingAudit` so an older-version but complete eligible audit returns:

```text
audit: <that audit>
state: qualifying
```

with separate provenance metadata.

Remove `stale` from `ProspectAuditQualificationState` if no legitimate qualification meaning remains.

Update all downstream callers rather than keeping compatibility branches that silently recreate the old refusal.

---

## Step 5 — make outreach guards return warnings, not refusals, for old provenance

Update `checkOutreachAction`.

This:

```text
older normalization fingerprint
```

must no longer return:

```text
allowed: false
refusal: audit-stale
```

Return the qualifying audit normally.

Where useful, include advisory metadata such as:

```text
warnings: ['older-data-version']
```

or a typed provenance state.

Real refusals continue to include things such as:

- suppression;
- no contact;
- no complete eligible audit;
- active/live state conflicts;
- closed thread;
- other existing safety/workflow conflicts.

Update preview and drafting routes to make sure they do not independently reintroduce the old fingerprint gate.

---

## Step 6 — update the shared work/recommendation model

A prospect with:

```text
complete eligible audit
+
older provenance
```

must progress to the same operational recommendation as one with current provenance.

For example:

```text
qualifying audit + contact + no thread
→ Create first email
```

not:

```text
→ Run Full scan again
```

Remove `audit-stale` from current recommendation copy and reason unions where it no longer has meaning.

The prospect page may separately display:

```text
Older data version
```

beside the audit.

No warning state may masquerade as open work.

---

## Step 7 — preserve and expose offline report recovery

Audit every place where analysis/report generation rejects old findings provenance.

Preserve the useful part of `makeReportReady`:

```text
stored website evidence
→ offline derived-data refresh
→ report
```

but make the distinction explicit.

Requirements:

1. no report-generation path may silently launch a network rescan;
2. existing reports remain reachable regardless of today's fingerprint;
3. if current rendering requires newer derived data, rebuild it from stored artifacts when possible;
4. if stored artifacts genuinely lack required information, report that specific limitation;
5. only an explicit **Run Full scan again** action performs a new crawl.

Tests must prove that report recovery from older provenance does not call `runAuditStage` or scanner/network orchestration.

---

## Step 8 — add prospect archive/restore to the domain and store

Extend the prospect schema with:

```text
archivedAt?: Date
```

Add lifecycle events for archive and restore.

Implement store operations equivalent to:

```text
archiveProspect(connection, prospectId, actor)
restoreProspect(connection, prospectId, actor)
```

Archive:

- preserves the prospect document;
- preserves attached collections;
- preserves the directory pointer;
- updates timestamps;
- records an event.

Restore:

- clears `archivedAt`;
- preserves the same prospectId;
- updates timestamps;
- records an event.

Do not call `deleteAuditCascade`, `deleteMany`, directory unlinking, or outreach destruction from archive/restore.

Add idempotence:

```text
archive archived prospect → unchanged
restore active prospect → unchanged
```

---

## Step 9 — exclude archived records from ordinary active work

Default prospect listing:

```text
archivedAt absent
```

Add an explicit archived view/filter.

Update:

- prospect list;
- counts;
- To-do loading;
- work derivation;
- result/work views;
- relevant search endpoints.

Archived prospects must produce no ordinary To-do work until restored.

Direct detail access remains available.

Do not abuse the existing `inactive` age filter for this purpose. Archive is explicit lifecycle state, not lack of recent activity.

---

## Step 10 — integrate archive state into the directory

Keep `directoryEntry.prospectId` when archiving.

Change directory response/view modeling so a linked entry can distinguish:

```text
active
archived
```

without copying the full prospect into the directory data model.

Actions:

```text
no prospect
→ Add to prospects

active prospect
→ Open prospect

archived prospect
→ Restore prospect
```

Restoring must open/reuse the original prospect.

Test concurrent/double actions so two clicks cannot manufacture duplicate prospects.

Verify directory source refresh/upsert preserves an existing prospect link.

---

## Step 11 — replace ordinary Delete with Archive in the dashboard

On prospect detail, make:

```text
Archive prospect
```

the normal removal action.

Archived detail gets:

```text
Restore prospect
```

Move:

```text
Permanently delete prospect
```

into a secondary destructive area/menu.

Permanent deletion confirmation must clearly describe that it removes enriched data and attached operational history.

Do not label Archive as Delete.

Do not label permanent Delete as Archive.

---

## Step 12 — retain and harden permanent deletion

Keep a separately named destructive service.

Prefer:

```text
deleteProspectPermanently
```

for new code.

It may retain the existing cascade contract.

Add regression tests proving:

```text
archive:
  audits survive
  reports survive
  notes survive
  contacts survive
  thread survives
  directory link survives

permanent delete:
  cascade executes
  directory link is removed
  suppression remains according to existing policy
```

If feasible, expose a pre-delete impact summary to the confirmation UI using counts from the relevant collections.

---

## Step 13 — update copy and operator information architecture

Remove operator-facing assumptions that a complete scan is specifically for either outreach or client reporting.

Replace copy such as:

```text
Prepare outreach
Prepare client report
Run Prepare outreach again
```

with context-appropriate actions such as:

```text
Run full scan
Run full scan again
Create outreach
Create first email
Open client report
Regenerate report
```

The scan is the evidence-producing action.

The artifact/action verbs describe what happens afterward.

### Older-version warning

French and English copy should communicate:

```text
This scan uses an older data version.
Its stored results remain usable.
```

Avoid alarming/error styling unless a real operation is unavailable.

### Scan age

Show the actual scan date prominently enough that the operator can decide whether the website may have changed.

Do not impose an automatic expiration rule in this plan.

---

# Compatibility and migration rules

## 20. No rescans as migration

Implementation of Plan 050 must not launch scans to migrate data.

Existing audits remain where they are.

Existing `prospecting-audit` rows remain historically readable and potentially outreach-eligible when their coverage proves they were complete audits.

Existing Quick Checks remain Quick Checks.

Existing bounded/unknown light scans remain ineligible.

---

## 21. No destructive prospect migration

Current prospect documents without `archivedAt` are simply active.

Do not rewrite all prospects merely to add:

```text
archivedAt: null
```

Prefer absence as the backward-compatible active state unless Mongoose/schema constraints require otherwise.

The five already enriched operator prospects must continue to load unchanged after deployment.

---

## 22. Do not rewrite directory source facts with operator enrichment

No backfill should copy prospect:

- legal name;
- trading name;
- SIREN;
- contacts;
- notes;
- corrected website;

into the Atout France source document merely to implement archive/restore.

The durable relationship solves the data-loss problem.

---

# Required tests

## Scan intent tests

Cover at minimum:

```text
New Scan exposes Quick check + Full scan only
prospecting-audit cannot be newly launched from dashboard
historical prospecting-audit displays correctly
Quick Check remains non-outreach-grade
Full scan qualifies when complete
historical complete prospecting-audit qualifies
bounded prospecting does not qualify
unknown light legacy scan does not qualify
```

## Version/provenance tests

Cover:

```text
current fingerprint + complete Full scan → qualifying
older fingerprint + complete Full scan → qualifying + warning
older fingerprint does not produce audit-stale refusal
old qualifying scan can create preview
old qualifying scan can create first email
work model does not recommend rescan solely for fingerprint mismatch
existing report remains reachable
offline report refresh does not launch a scan
```

## Archive tests

Cover:

```text
archive preserves prospect fields
archive preserves manual field origins
archive preserves audit
archive preserves findings/analysis/report
archive preserves outreach history
archive preserves directory prospectId
archive disappears from active list
archive disappears from To-do
archived detail remains reachable
restore returns same prospectId
restore returns same enrichment
directory offers Restore rather than Add
double add/restore cannot create duplicate
permanent delete still cascades
```

## Directory refresh tests

Cover:

```text
source upsert updates source fields
existing prospectId survives source refresh
archived prospectId survives source refresh
```

---

# Verification

Run focused tests while implementing each step, then the complete repository verification:

```bash
pnpm run check
pnpm run test:all
pnpm run test:e2e
pnpm run docs:check
```

Run dead-code/reference tracing for retired scan-intent surfaces before deleting compatibility code.

Verify no new `prospecting-audit` launch producer remains outside explicitly documented historical/internal compatibility paths.

Search final tree for:

```text
Prepare outreach
Préparer la prospection
audit-stale
prospecting-audit
hasCurrentFindingsProvenance
deleteProspect(
```

Classify every remaining match as:

```text
historical compatibility
internal batch behavior
test fixture/history
intentionally retained documentation
```

or remove/update it.

---

# Acceptance rehearsal

After deployment, and only with explicit operator authorization for any external scan:

## A. Existing older scan

Use a real existing prospect whose audit has an older normalization fingerprint.

Confirm:

1. prospect opens normally;
2. audit shows an older-version warning;
3. no forced Full scan appears;
4. outreach actions remain available if coverage qualifies;
5. first-email/preview workflow accepts the audit;
6. report/history remains accessible;
7. no website request occurs merely because the data version is older.

## B. New Full scan

On an authorized test prospect:

1. launch **Full scan**;
2. confirm one complete crawl occurs;
3. confirm the audit attaches to the prospect;
4. confirm analysis/report stages operate from that same audit;
5. create outreach from the same audit;
6. verify no second crawl occurs.

## C. Archive/restore

Using a prospect containing operator enrichment:

1. record prospectId, SIREN, legal/trading name, contacts, notes, scan count and history;
2. archive the prospect;
3. confirm it leaves the active list/To-do;
4. locate the hotel in Directory;
5. confirm Directory offers **Restore prospect**, not **Add to prospects**;
6. restore it;
7. confirm the exact same prospectId and enrichment return;
8. confirm audits/reports/outreach history are unchanged.

No permanent deletion is required during the rehearsal.

---

# Final architecture after Plan 050

```text
                  DIRECTORY
             source/catalogue data
                     │
                     │ stable link
                     ▼
                 PROSPECT
       durable enriched operator record
          │                     │
          │                     └── archive / restore
          │                         without data loss
          │
          ├── QUICK CHECK
          │    informational only
          │
          └── FULL SCAN
               expensive website evidence
                       │
                stored once
                       │
          ┌────────────┼───────────────┐
          ▼            ▼               ▼
       Outreach     Analysis        Reports
          │            │               │
          └────────────┴───────────────┘
                regenerate/reuse
                without recrawling
```

The durable rules are:

```text
A scan is evidence, not a temporary prerequisite.

A software version change does not invalidate captured evidence.

Derived data can be rebuilt without recrawling.

Only the operator decides when website freshness warrants a new scan.

A prospect is the durable enriched business record.

The directory is source data, not the CRM.

Removing a prospect from active work archives it.

Permanent deletion is explicit and exceptional.
```

## Definition of done

Plan 050 is complete only when all of the following are true:

- the dashboard offers only Quick Check and Full scan for new work;
- new outreach preparation never requires a separate prospecting crawl;
- one Full scan supplies both outreach and client-report workflows;
- historical compatible scans remain usable;
- normalization/data-version mismatch is advisory rather than an outreach blocker;
- no derived-output path silently performs a website rescan;
- archived prospects retain all enrichment/history;
- directory-derived archived prospects restore rather than duplicate;
- permanent deletion remains available but is no longer the normal removal action;
- full tests and documentation checks pass;
- the post-deploy acceptance rehearsal confirms the behavior against real existing data.