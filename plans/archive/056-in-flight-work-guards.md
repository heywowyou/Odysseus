# Plan 056: Report production is one per audit, and archive or delete waits for in-flight work

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report; do not
> improvise. When done, update this plan's row in `plans/README.md`, unless a
> reviewer dispatched you and said they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 38a516f2..HEAD -- packages/interface/src/pipeline/make-report-ready.ts packages/interface/src/pipeline/make-report-ready.test.ts packages/interface/src/pipeline/regenerate-writing.ts packages/interface/src/routes/report-preparation.ts packages/interface/src/routes/report-preparation.test.ts packages/interface/src/routes/prospect-hub.ts packages/interface/src/routes/prospect-hub.test.ts packages/interface/src/routes/scans.ts packages/interface/src/server.ts packages/store/src/prospect-hub.ts`
> If any of these changed, compare the "Current state" excerpts with the live
> code. A mismatch is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (it only adds refusals)
- **Depends on**: none. If plan 055 has landed, `routes/scans.ts` has changed
  in its delete handler; re-read it before Step 4.
- **Category**: bug (concurrency)
- **Planned at**: commit `38a516f2`, 2026-09-17

## Why this matters

Two in-memory guards protect report production today, and they don't cover
each other.

- **`makeReportReady`** (PDF production, and the identity-confirm follow-up)
  refuses while either its own run or a writing regeneration is in flight.
- **`regenerateWriting`** checks **only its own** set.

So starting a writing regeneration while PDFs are being produced lets both run
on the same audit. They renormalize the same directory, pay for the LLM passes
twice, race on writing candidates (the class of bug #143 fixed), and overwrite
each other's dashboard progress state (#376).

The prospect **archive** and **permanent delete** endpoints refuse only while a
job row is `queued` or `running`. Two kinds of work slip past that check:

- **A stopped job still finishing its stage.** It is marked `cancelled` at
  once, but its pipeline keeps running until the next stage boundary and can
  still persist and link an audit. `DELETE /api/scans/:jobId` already handles
  this with `queue.isJobInFlight`, but the prospect routes aren't given the
  queue.
- **Report production in progress.** PDF or writing production can write
  analyses, reports and bucket objects after the purge.

Either can recreate audit rows and bucket files for an archived or deleted
prospect.

After this plan:

- one per-audit lock covers both producers;
- archive and permanent delete refuse while any job in the prospect's scope is
  still in flight in this process, or while any of its audits is in report
  production;
- the job delete endpoint also refuses while its audits are in production.

## Current state

### Files and roles

- `packages/interface/src/pipeline/regenerate-writing.ts`: writing
  regeneration. Private `inFlight` set at line 54,
  `isWritingRegenerationInFlight` at 56-58, the guard at 109-119, releases at
  136 and 266.
- `packages/interface/src/pipeline/make-report-ready.ts`: PDF production.
  Private `inFlight` at line 112, guard at 196-203, release at 213. It imports
  `isWritingRegenerationInFlight` from `./regenerate-writing.js` (line 42).
- `packages/interface/src/pipeline/make-report-ready.test.ts:16`: mocks
  `./regenerate-writing.js` to supply `isWritingRegenerationInFlight`.
- `packages/interface/src/pipeline/report-production-state.ts`: the
  descriptive stage registry (#376). Its header says "The guards stay the
  concurrency safety net; this registry only describes." **Don't turn it into
  the lock.**
- `packages/interface/src/routes/report-preparation.ts:147`: the async route
  pre-check; `:87` sends `regenerationInFlight` to the dashboard.
- `packages/interface/src/routes/prospect-hub.ts`: `registerProspectHubRoutes(router, connection)`
  at line 162; archive at 717-742; permanent delete at 766-808.
- `packages/interface/src/server.ts:121-124`: registers routes.
  `registerScanRoutes(router, connection, queue)` already receives `queue`.
- `packages/interface/src/queue/job-queue.ts:157-159`:
  `isJobInFlight(jobId: string): boolean`.
- `packages/store/src/prospect-hub.ts:1009-1062`: private
  `prospectDeletionScope(connection, prospectId)` returns `{ auditIds, job, ... }`,
  where `job` is a Mongo filter for every job belonging to the prospect.
  `countActiveProspectDeletionJobs` uses it.
- `packages/interface/src/routes/scans.ts`, `DELETE /api/scans/:jobId`
  (around lines 513-563): collects `auditIds` before deleting.

### Excerpts

`packages/interface/src/pipeline/regenerate-writing.ts:104-120`:

```ts
  const auditId = audit.auditId;
  if (inFlight.has(auditId)) {
    throw new RegenerationConflictError(
      'odysseus: a writing regeneration is already running for this audit',
    );
  }
  // The add must stay adjacent to the has check with no await in between:
  // Node serves requests concurrently, and the previous check-then-await-
  // then-add ordering let two simultaneous submits pass the guard, race on
  // the writing candidate, and insert duplicate analysis versions
  // (issue #143).
  inFlight.add(auditId);
  markReportProductionStage(auditId, 'writing');
```

`packages/interface/src/pipeline/make-report-ready.ts:196-214`:

```ts
  // Checked and taken with no await in between, so two concurrent requests
  // cannot both pass.
  if (inFlight.has(auditId) || isWritingRegenerationInFlight(auditId)) {
    throw new RegenerationConflictError(
      'odysseus: the PDFs or the writing for this audit are already being produced',
    );
  }
  inFlight.add(auditId);
  try {
    ...
  } finally {
    inFlight.delete(auditId);
  }
```

`packages/interface/src/routes/report-preparation.ts:146-150`:

```ts
      if (query.get('async') === 'true') {
        if (isWritingRegenerationInFlight(auditId)) {
          sendError(res, 409, 'odysseus: a writing regeneration is already running for this audit');
          return;
        }
```

`packages/interface/src/routes/prospect-hub.ts:717-726` (archive; delete at
766-775 has the same guard):

```ts
  router.post('/api/prospects/:prospectId/archive', async ({ res, params }) => {
    const prospectId = params['prospectId']!;
    if ((await getProspectHub(connection, prospectId)) === null) {
      sendError(res, 404, 'prospect not found');
      return;
    }
    if ((await countActiveProspectDeletionJobs(connection, prospectId)) > 0) {
      sendError(res, 409, 'prospect has an unfinished job; cancel it or wait for it to end');
      return;
    }
```

### Conventions

- The critical-section rule in both producers: check and take the lock with
  **no `await` in between**. The new lock API must be synchronous.
- `import type { JobQueue } from '../queue/job-queue.js'` is how routes type
  the queue (`routes/scans.ts:31`).
- Route tests mock `@odysseus/store` wholesale. `routes/prospect-hub.test.ts`
  lists every store function it uses in the `vi.mock` factory (lines 10-47)
  and registers with `registerProspectHubRoutes(router, fakeConnection)` at
  line 163. Its archive test is at lines 330-345.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Pipeline and route tests | `pnpm test packages/interface/src/pipeline packages/interface/src/routes` | all pass |
| Test Mongo | `pnpm run test:store:up` / `pnpm run test:store:down` | up / down |
| Store prospect tests | `pnpm test packages/store/src/prospect-hub.test.ts` | all pass, not skipped |
| Format and gate | `pnpm run format && pnpm run check` | exit 0 |

## Scope

**In scope:**

- `packages/interface/src/pipeline/report-production-lock.ts` (create)
- `packages/interface/src/pipeline/report-production-lock.test.ts` (create)
- `packages/interface/src/pipeline/regenerate-writing.ts`
- `packages/interface/src/pipeline/make-report-ready.ts`
- `packages/interface/src/pipeline/make-report-ready.test.ts` (mock path only)
- `packages/interface/src/routes/report-preparation.ts` (the async pre-check only)
- `packages/interface/src/routes/report-preparation.test.ts` (one new test)
- `packages/interface/src/routes/prospect-hub.ts` (signature, archive guard, delete guard)
- `packages/interface/src/routes/prospect-hub.test.ts`
- `packages/interface/src/routes/scans.ts` (delete handler guard only)
- `packages/interface/src/routes/scans-contract.test.ts` (one new test)
- `packages/interface/src/server.ts` (pass `queue`)
- `packages/store/src/prospect-hub.ts` (one new exported function), and
  `packages/store/src/index.ts` (export it)
- `packages/store/src/prospect-hub.test.ts` (one new test)

**Out of scope:**

- `report-production-state.ts` behaviour.
- Moving any lock to the database. Trade-off 62 keeps these in memory on
  purpose.
- `packages/cli/src/commands/artifacts.ts`. The CLI runs in a separate process
  and can't see in-memory locks; see Maintenance notes.
- Multi-site batch job rows in the permanent delete cascade (a separate
  finding).

## Git workflow

- Branch: `advisor/056-in-flight-guards`.
- Commit examples:
  - `Share one report production lock between writing and PDF runs`
  - `Refuse archive and delete while a prospect's work is still in flight`
- No `Co-Authored-By` or "Generated with" trailers.
- Do not push.

## Steps

### Step 1: Create the shared lock

Create `packages/interface/src/pipeline/report-production-lock.ts`:

```ts
/**
 * One in-process lock per audit for report production. Writing regeneration
 * and makeReportReady both renormalize the same audit directory and record
 * writing candidates, so either one running excludes the other. In memory on
 * purpose (trade-off 62): a restart forgets the run instead of stranding a
 * persisted lock. The API is synchronous so a caller can check and take the
 * lock with no await in between (issue #143).
 */
export type ReportProductionRun = 'writing' | 'report-ready';

const runs = new Map<string, ReportProductionRun>();

export function tryAcquireReportProduction(auditId: string, run: ReportProductionRun): boolean
export function releaseReportProduction(auditId: string, run: ReportProductionRun): void // deletes only if the held run matches
export function isReportProductionInFlight(auditId: string): boolean
export function isWritingRegenerationInFlight(auditId: string): boolean // runs.get(auditId) === 'writing'
```

Tests in `report-production-lock.test.ts`:

- acquire, then a second acquire of either kind returns `false`;
- release lets a new acquire succeed;
- releasing with the wrong kind doesn't free the lock;
- `isWritingRegenerationInFlight` is true only for `'writing'`.

Use distinct audit IDs per test so the module-level map doesn't leak between
tests.

**Verify**: `pnpm test packages/interface/src/pipeline/report-production-lock.test.ts` → all pass.

### Step 2: Switch both producers to the lock

`regenerate-writing.ts`:

- Delete `const inFlight = new Set<string>()` and the local
  `isWritingRegenerationInFlight` function. Re-export it instead with
  `export { isWritingRegenerationInFlight } from './report-production-lock.js';`,
  so `routes/report-preparation.ts` and its test keep working.
- Replace the guard (lines 109-119) with
  `if (!tryAcquireReportProduction(auditId, 'writing')) throw new RegenerationConflictError('odysseus: the PDFs or the writing for this audit are already being produced');`.
  Keep the #143 comment.
- Replace both `inFlight.delete(auditId)` calls with
  `releaseReportProduction(auditId, 'writing')`.

`make-report-ready.ts`:

- Delete its `inFlight` set and the `isWritingRegenerationInFlight` import.
- Guard with `if (!tryAcquireReportProduction(auditId, 'report-ready')) throw new RegenerationConflictError(...)`,
  keeping the existing message.
- Release in the `finally` with `releaseReportProduction(auditId, 'report-ready')`.

`make-report-ready.test.ts:16`: remove the `./regenerate-writing.js` mock if
nothing else needs it. The real lock module is fine in tests. If a test relied
on the mock returning `false`, keep behaviour identical.

`routes/report-preparation.ts:147`: import `isReportProductionInFlight` from
`../pipeline/report-production-lock.js` and use it in the async pre-check,
with the same 409 message as the producers.

Add a test to `routes/report-preparation.test.ts`: call
`tryAcquireReportProduction('audit-1', 'report-ready')`, then POST
`/api/audits/audit-1/report-preparation/regenerate-writing?async=true` → 409.
Release the lock in `finally`. Follow the file's existing async tests (around
lines 420-450).

**Verify**: `grep -n "new Set<string>()" packages/interface/src/pipeline/make-report-ready.ts packages/interface/src/pipeline/regenerate-writing.ts` → no output.
`pnpm test packages/interface/src/pipeline packages/interface/src/routes/report-preparation.test.ts` → all pass.

### Step 3: Expose the prospect's job IDs from the store

In `packages/store/src/prospect-hub.ts`, next to
`countActiveProspectDeletionJobs`, add:

```ts
/** Every job in the prospect's deletion scope, any status. The interface
 *  checks these against its in-process queue: a stopped job is already
 *  `cancelled` while its pipeline finishes the current stage. */
export async function listProspectScopeJobIds(connection: Connection, prospectId: string): Promise<string[]>
```

Implement it with `prospectDeletionScope(...).job` and
`.select({ jobId: 1, _id: 0 })`. Export it from `packages/store/src/index.ts`
next to `countActiveProspectDeletionJobs`.

Add a Mongo test in `prospect-hub.test.ts`: a prospect with one job created
with `options.prospectId` set and one job linked through an attached audit's
`auditId` → both IDs are returned. Follow the test next to
`countActiveProspectDeletionJobs` if one exists
(`grep -n "countActiveProspectDeletionJobs" packages/store/src/prospect-hub.test.ts`).

**Verify**: `pnpm run test:store:up`, then
`pnpm test packages/store/src/prospect-hub.test.ts` → all pass, not skipped.

### Step 4: Guard archive, permanent delete and job delete

`routes/prospect-hub.ts`:

- Change the signature to
  `registerProspectHubRoutes(router: Router, connection: Connection, queue: Pick<JobQueue, 'isJobInFlight'>)`.
- Add a local helper:

  ```ts
  /** Work that can still write this prospect's audits although no job row is
   *  queued or running: a stopped job finishing its stage, or report production. */
  async function prospectWorkInFlight(prospectId: string): Promise<boolean>
  ```

  It returns true if any `listProspectScopeJobIds` ID satisfies
  `queue.isJobInFlight`, or if any `listProspectAudits(connection, prospectId)`
  audit satisfies `isReportProductionInFlight(audit.auditId)`.
- In both archive and permanent delete, right after the
  `countActiveProspectDeletionJobs` check, add:
  `if (await prospectWorkInFlight(prospectId)) { sendError(res, 409, 'work for this prospect is still finishing; try again shortly'); return; }`.

`server.ts:124`: `registerProspectHubRoutes(router, connection, queue);`.

`routes/scans.ts`, job delete: after the `isJobInFlight` check and after
`auditIds` is collected, but **before** any artifact deletion, refuse with 409
`'a report is being produced for this job's audit; try again shortly'` when
any `isReportProductionInFlight(auditId)` is true.

Tests:

- `prospect-hub.test.ts`:
  - add `listProspectScopeJobIds: vi.fn()` to the store mock, default
    `mockResolvedValue([])` in `beforeEach`;
  - register with a fake queue `{ isJobInFlight: vi.fn(() => false) }` (make
    it reachable from tests);
  - add two cases:
    - (a) `listProspectScopeJobIds` → `['job-9']` and `isJobInFlight('job-9')`
      → true: archive → 409 and `archiveProspect` not called; permanent delete
      → 409 and `deleteProspectPermanently` not called;
    - (b) `listProspectAudits` → one audit `audit-7`, and the test calls
      `tryAcquireReportProduction('audit-7', 'writing')`: archive → 409.
      Release in `finally`.
- `scans-contract.test.ts`: a cancelled job with `auditId: 'audit-1'` while
  `tryAcquireReportProduction('audit-1', 'report-ready')` is held → 409, with
  `artifactStore.list` and `deleteAuditCascade` not called.

**Verify**: `pnpm run typecheck` → exit 0.
`pnpm test packages/interface/src/routes` → all pass.

### Step 5: Gates

Update the comment above the archive route, and the doc comment in
`artifacts/purge-prospect-audit-storage.ts` ("The caller must refuse first
while a job ... is queued or running"), to mention in-flight stopped jobs and
report production.

**Verify**: `pnpm run format && pnpm run check` → exit 0.
`pnpm test packages/interface packages/store/src/prospect-hub.test.ts` → all
pass. Then `pnpm run test:store:down`.

## Test plan

- Lock unit tests: 4.
- Producer route conflict: 1.
- Store scope listing: 1.
- Archive and delete guards: 2.
- Job delete guard: 1.
- Existing `report-preparation.test.ts` async tests (lines 420-515) must pass
  unchanged. They assert `isWritingRegenerationInFlight` transitions.

## Done criteria

- [ ] `pnpm run check` exits 0
- [ ] All new tests pass; store test not skipped
- [ ] `grep -rn "isReportProductionInFlight" packages/interface/src/routes` → hits in `prospect-hub.ts`, `scans.ts`, `report-preparation.ts`
- [ ] `grep -n "registerProspectHubRoutes(router, connection, queue)" packages/interface/src/server.ts` → one hit
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` row 056 updated

## STOP conditions

- The excerpts don't match the live code.
- `regenerateWriting` or `makeReportReady` turns out to call the other while
  holding its lock (e.g. `makeReportReady` calling `regenerateWriting`). A
  shared non-reentrant lock would deadlock-refuse itself; report instead.
  Check with
  `grep -n "regenerateWriting\|makeReportReady" packages/interface/src/pipeline/*.ts`.
- The existing `report-preparation.test.ts` async tests fail because they
  depend on the old separate sets.
- `pnpm run architecture:check` rejects the new module's imports.

## Maintenance notes

- The CLI `odysseus artifacts archived-prospects --apply` runs in its own
  process and can't see these locks. The operator should run it only when the
  server is idle, and the command's help text could say so (a separate small
  change).
- Any new producer that renormalizes, writes candidates or renders PDFs for an
  audit must take `tryAcquireReportProduction`.
- If the server ever runs more than one worker process, these in-memory guards
  stop being sufficient. Revisit trade-off 62 then.
