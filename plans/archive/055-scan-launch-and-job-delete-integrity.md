# Plan 055: Scans never attach to an archived or unknown prospect, and a job the worker just claimed is never deleted

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report; do not
> improvise. When done, update this plan's row in `plans/README.md`, unless a
> reviewer dispatched you and said they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 38a516f2..HEAD -- packages/interface/src/routes/scans.ts packages/interface/src/routes/scans-contract.test.ts packages/store/src/jobs.ts packages/store/src/jobs.test.ts packages/interface/src/dashboard/routes/new-scan-model.ts packages/interface/src/dashboard/routes/queue-scans-dialog.tsx packages/interface/src/dashboard/i18n/sections/scan-queue.ts packages/interface/src/dashboard/i18n/sections/prospect-hub.ts`
> If any of these changed, compare the "Current state" excerpts with the live
> code. A mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (data integrity)
- **Planned at**: commit `38a516f2`, 2026-09-17

## Why this matters

**1. Scans attach to archived prospects.** Plan 050 and issue #381 made
archive the ordinary way to take a prospect out of active work. Archive purges
the prospect's audits, and a reconciliation command
(`odysseus artifacts archived-prospects --apply`) purges any audit still linked
to an archived prospect, because such a link means "cleanup incomplete".

Scan launch doesn't know about archive:

- a new Full scan of an archived prospect's website auto-attaches to the
  archived record, so the next reconciliation deletes that fresh, paid-for
  audit;
- when an active and an archived prospect share a domain, the match count is 2
  and the scan attaches to neither;
- an explicit `prospectId` that doesn't exist is stored on the job and audit as
  a dangling link.

**2. Deleting a queued job can race the worker.** `DELETE /api/scans/:jobId`
reads the job as `queued`, then calls `deleteJob`, which deletes by `jobId`
alone. If the worker claims the job in between, a running pipeline loses its
job row. Its progress and completion writes then do nothing, and the finished
audit has no job linked to it.

## Current state

### Files and roles

- `packages/interface/src/routes/scans.ts`: scan launch (`autoAttachProspect`
  at lines 143-151, `launchScan` at 159-191), the batch endpoint (around lines
  303-390), and job delete (around lines 513-563). It already imports
  `getProspectHub` from `@odysseus/store`.
- `packages/interface/src/routes/scans-contract.test.ts`: route tests with
  `@odysseus/store` mocked (`vi.mock` at lines 5-14; `post` helper and
  `beforeEach` at lines 68-95; the delete `remove` helper at lines 163-180).
- `packages/store/src/jobs.ts:324-331`: `deleteJob`.
- `packages/store/src/jobs.test.ts`: Mongo tests. Pattern at lines 1-40.
- `packages/store/src/prospect-hub.ts:306-316`: `findProspectsByDomain`
  returns archived prospects too. **Don't change it**: the dashboard's domain
  lookup (`routes/prospect-hub.ts:205`) uses it as well.
- Dashboard: `dashboard/routes/new-scan-model.ts:375-386` (the batch result
  type), `dashboard/routes/queue-scans-dialog.tsx:91-97` (outcome text),
  `dashboard/i18n/sections/scan-queue.ts:31-32,74-75,114-115` (outcome
  strings), and `dashboard/i18n/sections/prospect-hub.ts:750-753,1243-1246`
  (`refusalLabels`, typed `Record<string, string>`, rendered through
  `prospect-hub-detail-model.ts:103`).

### Excerpts

`packages/interface/src/routes/scans.ts:143-191`:

```ts
async function autoAttachProspect(
  connection: Connection,
  options: JobOptionsSnapshot,
  registrableDomain: string,
): Promise<JobOptionsSnapshot> {
  if (options.prospectId !== undefined) return options;
  const matches = await findProspectsByDomain(connection, registrableDomain);
  return matches.length === 1 ? { ...options, prospectId: matches[0]!.prospectId } : options;
}

type LaunchableScanType = 'quick-check' | 'full-audit';

type ScanLaunchOutcome =
  | { started: true; job: JobDocument }
  | { started: false; refusal: 'invalid-url' | 'suppressed' | 'host-busy' };

async function launchScan(
  connection: Connection,
  type: LaunchableScanType,
  url: string,
  requested: JobOptionsSnapshot,
): Promise<ScanLaunchOutcome> {
  const domain = registrableDomainForScan(url);
  if (domain === null) return { started: false, refusal: 'invalid-url' };
  const options = await autoAttachProspect(connection, requested, domain);
  const check = await checkScanLaunch(connection, {
```

Batch result mapping in `scans.ts` (around lines 370-378):

```ts
      const outcome = await launchScan(connection, type, site.url, requested);
      if (outcome.started) {
        ...
      } else if (outcome.refusal === 'host-busy') {
        results.push({ ...identity, outcome: 'skipped', reason: 'already-active' });
      } else {
        results.push({ ...identity, outcome: 'rejected', reason: outcome.refusal });
      }
```

The `BatchItemResult` rejected variant (around lines 222-229) has
`reason: 'invalid-url' | 'suppressed'`.

Job delete in `scans.ts` (around lines 520-561):

```ts
    const job = await getJob(connection, jobId);
    if (!job) { sendError(res, 404, 'job not found'); return; }
    if (job.status === 'running') {
      sendError(res, 409, 'a running job must be stopped before it can be deleted');
      return;
    }
    if (queue.isJobInFlight(jobId)) { ... 409 ... }
    ... audit artifact + cascade loop ...
    const deleted = await deleteJob(connection, jobId);
    sendJson(res, 200, { jobId, deleted, auditsDeleted: auditIds.size });
```

`packages/store/src/jobs.ts:324-331`:

```ts
export async function deleteJob(connection: Connection, jobId: string): Promise<boolean> {
  const JobModel = createJobModel(connection);
  const result = await JobModel.deleteOne({ jobId });
  return result.deletedCount > 0;
}
```

`packages/interface/src/dashboard/routes/queue-scans-dialog.tsx:91-97`:

```tsx
  const outcomeText = (entry: BatchScanResult): string => {
    if (entry.outcome === 'queued') return copy.outcomeQueued;
    if (entry.outcome === 'skipped') return copy.outcomeSkippedActive;
    return entry.reason === 'suppressed'
      ? copy.outcomeRejectedSuppressed
      : copy.outcomeRejectedInvalidUrl;
  };
```

### Conventions

- Refusals are answered as `200 { started: false, refusal }`, not as HTTP
  errors (see the "launch race" test at `scans-contract.test.ts:222-231`).
- Dashboard copy is colocated per section with one `fr` and one `en` object,
  French written first (formal "vous" register; see the existing strings).
- A `strings-parity` test enforces matching keys:
  `grep -rln "parity" packages/interface/src/dashboard/i18n`.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `pnpm test packages/interface/src/routes/scans-contract.test.ts` | all pass |
| Dashboard tests | `pnpm test packages/interface/src/dashboard` | all pass |
| Test Mongo | `pnpm run test:store:up` / `pnpm run test:store:down` | up / down |
| Store job tests | `pnpm test packages/store/src/jobs.test.ts` | all pass, not skipped |
| Format and gate | `pnpm run format && pnpm run check` | exit 0 |

## Scope

**In scope:**

- `packages/interface/src/routes/scans.ts`
- `packages/interface/src/routes/scans-contract.test.ts`
- `packages/store/src/jobs.ts` (`deleteJob` only)
- `packages/store/src/jobs.test.ts`
- `packages/interface/src/dashboard/routes/new-scan-model.ts` (the result type only)
- `packages/interface/src/dashboard/routes/queue-scans-dialog.tsx` (`outcomeText` only)
- `packages/interface/src/dashboard/i18n/sections/scan-queue.ts` (one new key, fr and en)
- `packages/interface/src/dashboard/i18n/sections/prospect-hub.ts` (one new `refusalLabels` entry, fr and en)

**Out of scope:**

- `packages/store/src/prospect-hub.ts` and `findProspectsByDomain`.
- `packages/store/src/guards.ts`: keep `ScanLaunchRefusal` as it is. The new
  refusal is route-level.
- Archive and delete endpoints in `routes/prospect-hub.ts` (plan 056).
- Restoring a prospect. A restored prospect has no `archivedAt`, so it works
  automatically.

## Git workflow

- Branch: `advisor/055-scan-launch-integrity`.
- Commit examples:
  - `Refuse scans for archived or unknown prospects and skip archived ones when auto-attaching`
  - `Delete a queued job only while it is still queued`
- No `Co-Authored-By` or "Generated with" trailers.
- Do not push.

## Steps

### Step 1: Refuse archived or unknown prospects at launch (tests first)

In `scans-contract.test.ts`:

- Add `getProspectHub: vi.fn()` to the `vi.mock('@odysseus/store', ...)`
  factory and import it.
- In `beforeEach`, default it to
  `vi.mocked(getProspectHub).mockResolvedValue({ prospectId: 'prospect-1' } as never)`.

Add tests:

1. `POST /api/scans` with `prospectId: 'p-archived'`, where `getProspectHub`
   resolves `{ prospectId: 'p-archived', archivedAt: new Date() }` → response
   `{ started: false, refusal: 'prospect-unavailable' }`, and `createJob` not
   called.
2. The same with `getProspectHub` resolving `null` → the same refusal.
3. Auto-attach: no `prospectId`, and `findProspectsByDomain` resolves
   `[{ prospectId: 'p-active' }, { prospectId: 'p-old', archivedAt: new Date() }]`
   → `createJob` is called with `options.prospectId === 'p-active'`.
4. Auto-attach where the only match is archived → `createJob` is called with
   **no** `prospectId`.
5. A batch with one item whose prospect is archived → that result is
   `{ outcome: 'rejected', reason: 'prospect-unavailable' }`, and the other
   items are still queued.

Implement in `scans.ts`:

- `autoAttachProspect`: filter `matches` to those with `archivedAt === undefined`
  before the `length === 1` check.
- `launchScan`: after `autoAttachProspect` and before `checkScanLaunch`, if
  `options.prospectId !== undefined`, load
  `await getProspectHub(connection, options.prospectId)`. When the result is
  `null` or has `archivedAt !== undefined`, return
  `{ started: false, refusal: 'prospect-unavailable' }`. Add a short comment:
  archive retention purges any audit linked to an archived prospect (issue
  #381), so a scan must never link to one.
- Widen the `ScanLaunchOutcome` refusal union and the `BatchItemResult`
  rejected `reason` union with `'prospect-unavailable'`.

**Verify**: `pnpm test packages/interface/src/routes/scans-contract.test.ts` →
all pass, including the 5 new tests.

### Step 2: Show the new refusal in the dashboard

- `new-scan-model.ts`: add `'prospect-unavailable'` to the rejected `reason`
  union.
- `scan-queue.ts`: add `outcomeRejectedProspectUnavailable` to the interface.
  - fr: `'Refusé : ce prospect est archivé ou introuvable ; restaurez-le avant de lancer un scan.'`
  - en: `'Rejected: this prospect is archived or missing; restore it before scanning.'`
- `queue-scans-dialog.tsx`: map `'prospect-unavailable'` to the new string.
  Keep the other mappings, and use a `switch` or an explicit comparison so
  `'invalid-url'` still maps to `outcomeRejectedInvalidUrl`.
- `prospect-hub.ts` i18n section: add `'prospect-unavailable'` to both
  `refusalLabels` objects.
  - fr: `'ce prospect est archivé ; restaurez-le pour lancer un scan'`
  - en: `'this prospect is archived; restore it to start a scan'`

**Verify**: `pnpm run typecheck` → exit 0.
`pnpm test packages/interface/src/dashboard` → all pass.

### Step 3: Delete a queued job only while it is still queued

`jobs.ts`: change the signature to
`deleteJob(connection, jobId, options: { onlyIfStatusNot?: readonly JobStatus[] } = {})`,
using the existing job status type from the job schema (confirm its exported
name). When `onlyIfStatusNot` is given, add
`status: { $nin: [...options.onlyIfStatusNot] }` to the filter. Without it,
behaviour is unchanged.

Add a Mongo test in `jobs.test.ts`: create a job, claim it with
`claimNextQueuedJob` (it becomes `running`), then call
`deleteJob(connection, jobId, { onlyIfStatusNot: ['running'] })` → returns
`false`, and `getJob` still returns the job.

In the route (`scans.ts`), after the `isJobInFlight` check:

- If `job.status === 'queued'`, call
  `deleteJob(connection, jobId, { onlyIfStatusNot: ['running'] })` **first**.
  A queued job has produced no audits, so nothing else needs deleting. If it
  returns `false`, answer
  `409 'the job has just started; stop it before deleting it'`. Otherwise
  answer `200 { jobId, deleted: true, auditsDeleted: 0 }` and return.
- For every other status, keep the existing flow, but pass
  `{ onlyIfStatusNot: ['queued', 'running'] }` to the final `deleteJob`.

Route tests in `scans-contract.test.ts`:

- a queued job where `deleteJob` resolves `false` → 409, and
  `deleteAuditCascade` not called;
- a queued job where `deleteJob` resolves `true` → 200 with `auditsDeleted: 0`.

The existing `remove` helper hard-codes `status: 'cancelled'`; add a status
parameter.

**Verify**: `pnpm run test:store:up`, then
`pnpm test packages/store/src/jobs.test.ts packages/interface/src/routes/scans-contract.test.ts`
→ all pass, none skipped.

### Step 4: Gates

**Verify**: `pnpm run format && pnpm run check` → exit 0. `pnpm test` → all
pass (pre-existing fixture-freshness failures excepted; confirm they also fail
on `38a516f2`). Then `pnpm run test:store:down`.

## Test plan

- Route tests: the 5 launch and attach cases, plus 2 delete cases.
- Store test: 1 conditional delete.
- Existing tests must keep passing unchanged, apart from the `remove` helper
  signature.

## Done criteria

- [ ] `pnpm run check` exits 0
- [ ] New route and store tests exist and pass (the store test is not skipped)
- [ ] `grep -n "prospect-unavailable" packages/interface/src/routes/scans.ts packages/interface/src/dashboard/i18n/sections/scan-queue.ts packages/interface/src/dashboard/i18n/sections/prospect-hub.ts packages/interface/src/dashboard/routes/queue-scans-dialog.tsx` → hits in all four
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` row 055 updated

## STOP conditions

- The excerpts don't match the live code.
- A dashboard flow deliberately launches scans for archived prospects. Check
  with `grep -rn "archivedAt" packages/interface/src/dashboard --include=*.tsx`
  and read any launch button near a hit. If there is one, report back.
- Some other code path launches scans without `launchScan`, e.g. an outreach
  runner creating `full-audit` jobs directly. Check with
  `grep -rn "createJob(" packages --include=*.ts | grep -v dist/ | grep -v test`.
  List those paths in your report; don't change them.
- The job status type isn't exported from the store in a way `jobs.ts` can use
  without a new import cycle.

## Maintenance notes

- Any new launch path must go through `launchScan` or repeat the archived
  check.
- If the dashboard later shows archived prospects in the domain lookup, the
  launch refusal is the backstop.
- Reviewers should check the queued-delete branch never runs the audit cascade.
