# Plan 013: Add the hotel prospecting operator interface

> **Executor instructions**: Complete plans 001 through 012. This is a private
> operator surface in the existing interface, not a public CRM or site feature.
>
> **Drift check**: `git diff --stat f7ef7cf..HEAD -- packages/interface/src/public packages/interface/src/router.ts packages/interface/src/routes packages/store/src docs/report-design-tokens.md`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans 001-012
- **Category**: direction
- **Planned at**: `f7ef7cf`, 2026-08-27

## Why this matters

The supplied technical design correctly identifies the missing human review
surface: source conflicts, qualification reasons, score breakdowns, evidence,
drafts, replies, suppressions, and outcomes must be inspectable without raw
Mongo queries. The interface remains private and server-rendered.

## Current state

- `packages/interface` uses the existing `node:http` router, server-rendered
  templates, bilingual strings, and Nocturne tokens.
- Plans 001-012 expose store helpers/deep interfaces; routes must call them
  rather than query Mongoose models directly.
- The public Next.js `site` remains separate and is not the operator UI.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Route tests | `pnpm exec vitest run packages/interface/src/routes/prospects.test.ts packages/interface/src/routes/outreach.test.ts` | all pass |
| UI tests | `pnpm exec vitest run packages/interface/src/public/prospecting` | all pass |
| Validation | `pnpm run check` | exit 0 |

## Scope

**In scope**: `/prospects`, detail, join-review, parked/rejected queues,
prescan/evidence/score breakdown, preview inspection, pending Gmail drafts,
replies needing review, suppression lookup-by-entered-value, scoring-version
diff, vendor fingerprint aggregate, outcome summary; FR/EN; pagination/filter;
private POST actions with validation.

**Out of scope**: public access, new framework/package, raw Mongo in routes,
automatic send, exposing contact lists, Atlas/Tailscale/VPS migration, or CRM
sync.

## Git workflow

- Work directly on `main`; do not create another branch.
- Commit with `Add the hotel outreach operator interface`.

## Steps

### Step 1: Define view models behind store helpers

Create bounded projections for catalogue status, source conflicts, qualification
reason, latest prescan, current score plus breakdown/version, evidence status,
contact state, preview, thread/draft/reply, and outcome. Pagination and filters
are mandatory; never load 15,000 records into one response.

**Verify**: store tests prove stable pagination, indexes/query shape, and no
message body/contact export in aggregate views.

### Step 2: Add list and review routes

Implement filterable `/prospects` plus detail, source-join review, parked/
rejected/already-engaged/groups queues, and manual accept/reject actions.
Validate all IDs/actions and display provenance/reasons prominently.

**Verify**: route tests cover auth/network assumptions, invalid IDs, paging,
filters, CSRF/current route pattern, and review idempotency.

### Step 3: Add prescan, score, preview, and vendor views

Show exact page roles/metrics, the two evidence assets, score component why,
version diff, selection reason, and recurring vendor/failure aggregates. The
preview inspection uses the same safe renderer as the prospect sees.

**Verify**: tests prove displayed totals match store projections and escape all
source/site/model strings.

### Step 4: Add draft, reply, suppression, and outcome views

List pending review Gmail drafts with approve/skip meaning "reviewed" only,
never send. Show metadata-only reply ambiguity, allow operator categorical
outcome/opt-out actions, and suppression search by hashing an entered address in
memory. Never list/reveal suppression hashes as contact data.

**Verify**: tests prove no send route, terminal reply/suppression behavior, and
no raw permanent address storage.

### Step 5: Add bilingual accessibility and mobile checks

Use typed FR/EN strings and Nocturne tokens. Test keyboard operation, focus,
tables at narrow width, empty/loading/error states, and axe on representative
pages. Mobile is responsive web only; do not add Tailscale provisioning.

**Verify**: language parity/leak tests and axe report zero violations.

## Test plan

Store projections, route validation/actions, HTML escaping, FR/EN, axe,
pagination/empty/error states, and static absence of send/provider endpoints.

## Done criteria

- [ ] Operator can review the whole source-to-outcome funnel and every reason.
- [ ] Score why/version and source provenance are visible.
- [ ] Interface is bounded, bilingual, accessible, private, and cannot send.
- [ ] Tests/check pass; plan 013 is `DONE`.

## STOP conditions

Stop if the interface needs public exposure, new package/framework, raw model
access, automatic send, or infrastructure migration.

## Maintenance notes

Views follow deep store interfaces. New lifecycle states require projection,
filter, empty-state, and transition tests in the same change.
