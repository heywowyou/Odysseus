# Plan 057: The prospect is the single source of a linked audit's identity

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report; do not
> improvise. When done, update this plan's row in `plans/README.md`, unless a
> reviewer dispatched you and said they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 38a516f2..HEAD -- packages/store/src/audits.ts packages/store/src/prospect-identity.ts packages/store/src/prospect-hub.ts packages/store/src/prospect-hub.test.ts packages/interface/src/routes/audits.ts packages/interface/src/routes/audits-manual-fields-confirm.test.ts packages/interface/src/dashboard/routes/audit-hotel-fields-form.tsx packages/interface/src/dashboard/routes/report-details-form.tsx packages/interface/src/dashboard/routes/audit-report-panel.tsx`
> If any of these changed, compare the "Current state" excerpts with the live
> code. A mismatch is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (it changes where identity edits are stored, with no schema
  change)
- **Depends on**: none
- **Category**: bug (data integrity)
- **Planned at**: commit `38a516f2`, 2026-09-17

## Operator decision (2026-09-17)

For an audit linked to a prospect, **the prospect always wins**. The trading
name (`nomCommercial`), legal name (`raisonSociale`) and SIREN have one source
of truth, the prospect:

- the audit copies the prospect's operator-confirmed values every time they
  are synced;
- editing those three fields on a linked audit saves them **on the prospect**,
  so they apply to every audit of that prospect;
- when an audit moves to another prospect or is detached, it drops the old
  prospect's values.

Rejected: tracking "copied" versus "typed on the audit" with a per-field
marker. It keeps a name that differs from the prospect, but it needs a stored
marker, a run-once migration command, and it has a failure mode if that command
runs late. Unlinked audits keep editing identity on the audit, exactly as
today.

## Why this matters

Issue #379 copies the identity the operator typed on a prospect onto each
linked audit with `provenance: 'operator'`, so the report's cover-identity
gate accepts it. The sync never overwrites a field that is already
`'operator'`, so its own earlier copy blocks every later update:

1. **Prospect corrections never reach the audit.** The operator fixes a typo
   in the prospect's trading name, and the paid report still prints the old
   name.
2. **Reattaching leaks identity between prospects.** When an audit moves from
   prospect A to prospect B:
   - `attachAuditToProspect` first seeds B from the audit's "confirmed" names,
     which are A's copied names;
   - it then syncs B, which is skipped because the fields already say
     `'operator'`.

   The audit keeps A's name, and B can inherit it.

## Current state

### Files and roles

- `packages/store/src/audits.ts`:
  - `attachAuditToProspect`, lines 57-120;
  - `getAuditRuntimeFields`, 138-152. Its projection does **not** include
    `prospectId` today;
  - `setAuditManualFields`, 218-243;
  - `applyConfirmedProspectIdentity`, 347-363;
  - `syncProspectIdentityIntoAudit`, ~373-393.
- `packages/store/src/prospect-identity.ts`:
  - `confirmedIdentityFromManualFields`, 92-101;
  - `AuditIdentityValues`, 104-108;
  - `auditIdentityFromProspect`, 118-138. It splits the prospect's identity
    into `confirmed` (field origin `'operator'`) and `suggested`.
- `packages/store/src/prospect-hub.ts:452`:
  `updateProspect(connection, prospectId, rawPatch, actor = 'operator', options)`.
  It normalizes and validates `siren`, and stamps `fieldOrigins[key] = 'operator'`
  for every patched key (lines 494-497).
- `packages/interface/src/routes/audits.ts`:
  - `PATCH /api/audits/:auditId/manual-fields`, 584-635. The SIREN is
    confirmed against Sirene at 608-628, then `setAuditManualFields` runs;
  - `POST /api/audits/:auditId/manual-fields/confirm`, 717-~790. It confirms
    `nomCommercial` or `raisonSociale`, then calls `makeReportReady`.
- `packages/interface/src/routes/audits-manual-fields-confirm.test.ts`: route
  tests for the confirm flow.
- Dashboard:
  - `dashboard/routes/audit-hotel-fields-form.tsx` renders `raisonSociale`
    and `nomCommercial` (lines 41-45) and the SIREN field;
  - `report-details-form.tsx` renders it;
  - `audit-report-panel.tsx:296` renders that, and has `detail.prospect`
    (`AuditProspectResponse | null`, `{ prospectId, name }`, in
    `audit-detail-types.ts:171-174`).
- `dashboard/i18n/sections/audit-detail.ts`: form labels (fr at ~333, en at
  ~598).
- Tests: `packages/store/src/prospect-hub.test.ts:127-257`, describe block
  `operator identity reaches linked audits (issue #379)`.

### Excerpts

`packages/store/src/audits.ts:347-363`:

```ts
export async function applyConfirmedProspectIdentity(
  connection: Connection,
  auditId: string,
  confirmed: AuditIdentityValues,
): Promise<AuditIdentityValues> {
  const existing = await getAuditManualFields(connection, auditId);
  const toWrite: Partial<Omit<AuditManualFields, 'updatedAt'>> = {};
  const written: AuditIdentityValues = {};
  for (const field of ['nomCommercial', 'raisonSociale', 'siren'] as const) {
    const value = confirmed[field];
    if (value === undefined) continue;
    if (existing?.[field]?.provenance === 'operator') continue;
    toWrite[field] = { value, provenance: 'operator' };
    written[field] = value;
  }
  if (Object.keys(toWrite).length > 0) await setAuditManualFields(connection, auditId, toWrite);
  return written;
}
```

`packages/store/src/audits.ts:70-73, 101-118` (inside `attachAuditToProspect`;
`current` is read before the link changes):

```ts
  const now = new Date();
  const update = prospectId === null ? { $unset: { prospectId: '' } } : { $set: { prospectId } };
  await AuditModel.updateOne({ auditId }, update);
  ...
    await fillMissingProspectIdentity(
      connection,
      prospectId,
      {
        siren: current.siteSignals?.siren,
        ...confirmedIdentityFromManualFields(current.manualFields),
      },
      actor,
    );
    // Issue #379: and the other direction - identity the operator typed on
    // the prospect is confirmed identity for the attached audit.
    await syncProspectIdentityIntoAudit(connection, auditId, prospectId);
```

`packages/interface/src/routes/audits.ts:745-748` (confirm route):

```ts
    const manualFields = await setAuditManualFields(connection, auditId, {
      [field]: { value: value.trim(), provenance: 'operator' },
    });
```

### Conventions

- Store functions take `connection: Connection` first. Comments explain *why*
  and cite the issue (`Issue #379:`). Don't reference audit finding IDs.
- Mongo tests use `describe.skipIf(!mongoAvailable)` and the `seedAudit`
  helper already in the #379 block.
- Dashboard copy is written in formal French first, then English. Every string
  goes through `i18n/sections/*`.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Test Mongo up / down | `pnpm run test:store:up` / `pnpm run test:store:down` | container up / down |
| Store identity tests | `pnpm test packages/store/src/prospect-hub.test.ts` | all pass, **not skipped** |
| Route tests | `pnpm test packages/interface/src/routes/audits-manual-fields-confirm.test.ts packages/interface/src/routes/audits.integration.test.ts` | all pass |
| Pipeline tests | `pnpm test packages/interface/src/pipeline` | all pass |
| Format and gate | `pnpm run format && pnpm run check` | exit 0 |

## Scope

**In scope:**

- `packages/store/src/audits.ts` (`attachAuditToProspect`,
  `getAuditRuntimeFields` and its type, `applyConfirmedProspectIdentity`, one
  new exported function)
- `packages/store/src/index.ts` (export the new function)
- `packages/store/src/prospect-hub.test.ts` (the #379 describe block)
- `packages/interface/src/routes/audits.ts` (the manual-fields PATCH and the
  confirm route only)
- `packages/interface/src/routes/audits-manual-fields-confirm.test.ts`
- `packages/interface/src/dashboard/routes/audit-hotel-fields-form.tsx`,
  `report-details-form.tsx`, `audit-report-panel.tsx` (one prop and one hint)
- `packages/interface/src/dashboard/i18n/sections/audit-detail.ts` (one new
  string)

**Out of scope:**

- `packages/core/**` and `packages/store/src/schemas/**`: no type or schema
  change.
- `packages/report/**`: the identity gate stays as is.
- `fillMissingProspectIdentity`, `confirmedIdentityFromManualFields`,
  `prefillAuditManualFields` and `replaceDetectedManualFields`.
- Every manual field other than `nomCommercial`, `raisonSociale` and `siren`.
  `sirenSourceUrl`, sector and the rest stay audit-level.
- Unlinked audits: behaviour unchanged.

## Git workflow

- Branch: `advisor/057-prospect-identity-source`.
- Commit examples: `Make the prospect the single source of a linked audit's identity`,
  `Save identity edits on a linked audit to its prospect`.
- No `Co-Authored-By` or "Generated with" trailers.
- Do not push.

## Steps

### Step 1: Characterize the store behaviour (failing tests first)

In the #379 describe block of `packages/store/src/prospect-hub.test.ts`, add:

1. **`a prospect correction replaces the linked audit's identity`**:
   - create a prospect with `tradingName: 'Hotel Typo'`, `seedAudit(prospectId)`,
     then `syncProspectIdentityIntoAudit`;
   - `updateProspect(connection!, prospectId, { tradingName: 'Hôtel Juste' })`;
   - sync again, and expect `nomCommercial` to be
     `{ value: 'Hôtel Juste', provenance: 'operator' }`.
2. **`the prospect wins over a name set on the linked audit`**:
   - `setAuditManualFields(..., { nomCommercial: { value: 'Audit Choice', provenance: 'operator' } })`
     on a linked audit whose prospect has `tradingName: 'Prospect Name'`;
   - sync, and expect `'Prospect Name'`.
3. **`reattaching drops the previous prospect's identity instead of copying it`**:
   - prospect A with `tradingName: 'Hôtel A'`, prospect B with no trading
     name;
   - `seedAudit()`, attach to A, then attach to B;
   - expect the audit's `nomCommercial` to be `undefined`, and B's
     `tradingName` to be `undefined` (`getProspectHub`).
4. **`detaching drops the prospect's identity but keeps other audit names`**:
   - attach to A (which syncs `nomCommercial: 'Hôtel A'`);
   - `setAuditManualFields(..., { raisonSociale: { value: 'AUDIT SAS', provenance: 'operator' } })`.
     A has no legal name, so this value is not A's;
   - `attachAuditToProspect(audit, null)`;
   - expect `nomCommercial` to be `undefined` and `raisonSociale` to be
     unchanged.
5. **`saving identity on a linked audit writes the prospect and syncs back`**,
   for the new function from Step 3:
   - `saveLinkedAuditIdentity(connection!, auditId, prospectId, { nomCommercial: 'Nouveau Nom' })`;
   - expect the prospect's `tradingName` to be `'Nouveau Nom'` with
     `fieldOrigins.tradingName === 'operator'`, and the audit's `nomCommercial`
     to be `{ value: 'Nouveau Nom', provenance: 'operator' }`.

**Update** the existing test `leaves site-discovered prospect identity unconfirmed and protects audit-level operator edits`
(line ~218). Its prospect has `legalName: 'PROSPECT LEGAL SAS'` with origin
`'operator'`, so under the new rule that value replaces the audit-level
`'AUDIT CONFIRMED SAS'`. Change the expectation to `{ value: 'PROSPECT LEGAL SAS', provenance: 'operator' }` and
rename the test to
`leaves site-discovered prospect identity unconfirmed and lets confirmed prospect identity win`.
Keep the `suggested` and `nomCommercial` assertions.

**Verify**: `pnpm run test:store:up`, then
`pnpm test packages/store/src/prospect-hub.test.ts`. Tests 1-5 and the
updated test fail (test 5 fails on the missing import). Nothing is skipped.

### Step 2: The sync always applies confirmed prospect identity

In `applyConfirmedProspectIdentity`:

- replace the `provenance === 'operator'` skip with a skip only when
  `existing?.[field]?.provenance === 'operator' && existing[field]?.value === value`,
  which avoids a pointless write;
- rewrite the doc comment: for a linked audit the prospect is the single
  source of these three fields (operator decision 2026-09-17, plan 057), so a
  confirmed prospect value replaces whatever the audit holds. Fields the
  prospect has not confirmed are left alone.

### Step 3: Save identity edits on a linked audit to the prospect

Add to `audits.ts`, next to `syncProspectIdentityIntoAudit`:

```ts
/** Plan 057: for an audit linked to a prospect, the prospect owns the
 *  trading name, legal name and SIREN. An edit made on the audit is saved
 *  on the prospect (origin 'operator', so it applies to every audit of that
 *  prospect) and then synced back onto this audit. */
export async function saveLinkedAuditIdentity(
  connection: Connection,
  auditId: string,
  prospectId: string,
  values: AuditIdentityValues,
  actor = 'operator',
): Promise<AuditManualFields | undefined>
```

Implementation:

- map `nomCommercial` to `tradingName`, `raisonSociale` to `legalName`, and
  `siren` to `siren`, keeping only defined values;
- call `updateProspect(connection, prospectId, patch, actor)`. It stamps the
  origins and validates the SIREN. If it returns `null` (prospect gone), throw
  `new Error('odysseus: the linked prospect no longer exists')`;
- call `syncProspectIdentityIntoAudit(connection, auditId, prospectId)`;
- return `getAuditManualFields(connection, auditId)`.

Export it from `packages/store/src/index.ts` next to
`syncProspectIdentityIntoAudit`.

Add `prospectId` to `AuditRuntimeFields` (the `Pick` at line 138) and to the
projection in `getAuditRuntimeFields`. Check the other callers still compile
with `pnpm run typecheck`.

### Step 4: Clear the previous prospect's identity on reattach and detach

In `attachAuditToProspect`, **before** the `updateOne` that changes the link
(line 73), when `current.prospectId !== undefined`:

- load the previous prospect with `getProspectHub(connection, current.prospectId)`;
- if it exists, compute `auditIdentityFromProspect(previous).confirmed`;
- for each of `nomCommercial`, `raisonSociale` and `siren` where
  `current.manualFields?.[field]?.value` equals that confirmed value, `$unset`
  `manualFields.<field>`, in one `updateOne`. Also `$set`
  `manualFields.updatedAt`;
- build a `manualFieldsAfterClear` object: `current.manualFields` without the
  cleared keys;
- add the comment
  `// Plan 057: the previous prospect owned these values; they must neither stay on the audit nor seed the new prospect.`

Then pass `manualFieldsAfterClear` instead of `current.manualFields` to
`confirmedIdentityFromManualFields` in the `fillMissingProspectIdentity` call.
Leave `siren: current.siteSignals?.siren` unchanged: the scan's own SIREN is
evidence about the site, not the old prospect's identity.

Values that differ from the previous prospect's confirmed identity (typed on
the audit while it was unlinked, or detected) stay. That's intended.

**Verify**: `pnpm test packages/store/src/prospect-hub.test.ts` → all pass,
not skipped.

### Step 5: Routes forward identity edits on linked audits

In `routes/audits.ts`, `PATCH /api/audits/:auditId/manual-fields`, after
`partial` is complete (after the SIREN confirmation block):

- if `audit.prospectId` is set, move `nomCommercial`, `raisonSociale` and
  `siren` out of `partial` into an `AuditIdentityValues` object (values only);
- if that object is non-empty, call
  `saveLinkedAuditIdentity(connection, auditId, audit.prospectId, identity)`;
- if `partial` still has keys, call `setAuditManualFields` as today;
- respond with the latest `getAuditManualFields(connection, auditId)` in the
  same `{ manualFields }` shape;
- keep the existing 400 error handling around both calls. An invalid SIREN
  error thrown by `updateProspect` must still become a 400.

In `POST /manual-fields/confirm`: when `audit.prospectId` is set, replace the
`setAuditManualFields` call with
`saveLinkedAuditIdentity(connection, auditId, audit.prospectId, { [field]: value.trim() })`
and use its return value as `manualFields`. The rest of the route is
unchanged.

Tests in `audits-manual-fields-confirm.test.ts`, following its existing
structure (read how it seeds audits first):

- **linked audit**: confirming `nomCommercial` updates the prospect's
  `tradingName` with origin `'operator'`, and the response's
  `manualFields.nomCommercial.value` equals the new value;
- **unlinked audit**: behaviour unchanged, and no prospect is touched.

If that file mocks the store instead of using Mongo, mock
`saveLinkedAuditIdentity` and assert it was called with
`(connection, auditId, prospectId, { nomCommercial: '...' })` for the linked
case and not called for the unlinked one.

**Verify**: `pnpm test packages/interface/src/routes/audits-manual-fields-confirm.test.ts packages/interface/src/routes/audits.integration.test.ts` → all pass.

### Step 6: Tell the operator where the value is saved

- `audit-report-panel.tsx:296`: pass `linkedProspectName={detail.prospect?.name ?? null}`
  to `ReportDetailsForm`. Add that prop to `ReportDetailsFormProps`, then pass
  it on to `HotelFieldsForm` and add it to `HotelFieldsFormProps`.
- In `audit-hotel-fields-form.tsx`, when `linkedProspectName` is not null,
  render one line of help text above the `raisonSociale` field. Use the same
  small text style as `DetectedHint` but the muted ink colour used elsewhere in
  the form (`grep -n "text-ink-muted\|text-muted" packages/interface/src/dashboard/routes/audit-hotel-fields-form.tsx`).
- New string `identitySavedOnProspect: (name: string) => string` in
  `i18n/sections/audit-detail.ts`, beside `nomCommercialLabel`. Check how
  other parameterized strings are typed in that file and match it.
  - fr: ``(name) => `La raison sociale, le nom commercial et le SIREN sont enregistrés sur le prospect « ${name} » et s'appliquent à tous ses audits.` ``
  - en: ``(name) => `Legal name, trading name and SIREN are saved on the prospect "${name}" and apply to all its audits.` ``

**Verify**: `pnpm run typecheck` → exit 0. If a dashboard unit test renders
`HotelFieldsForm` or `ReportDetailsForm`
(`grep -rln "HotelFieldsForm\|ReportDetailsForm" packages/interface/src/dashboard --include=*.test.tsx`),
run it → passes.

### Step 7: Gates

Add one paragraph to the identity or #379 section of the owning doc
(`grep -rn "379" docs/` to find it; if none, use `docs/product/dashboard-ia.md`)
stating the rule from "Operator decision" above.

**Verify**: `pnpm run format && pnpm run check` → exit 0.
`pnpm test packages/store packages/interface/src/pipeline packages/interface/src/routes` → all
pass. Then `pnpm run test:store:down`.

## Test plan

- Five new store tests and one updated store test (Step 1).
- Two route tests (Step 5).
- Existing `report-stage.test.ts` and `make-report-ready.test.ts` mock
  `syncProspectIdentityIntoAudit` and must pass unchanged.

## Done criteria

- [ ] `pnpm run check` exits 0
- [ ] `pnpm test packages/store/src/prospect-hub.test.ts` passes with Mongo up (not skipped)
- [ ] `grep -n "saveLinkedAuditIdentity" packages/interface/src/routes/audits.ts` → at least two hits
- [ ] `git diff --stat 38a516f2 -- packages/core packages/store/src/schemas` → no output
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` row 057 updated

## STOP conditions

- The excerpts don't match the live code.
- `updateProspect` doesn't stamp `fieldOrigins.<field> = 'operator'` for a
  patched identity field. Report it; don't change prospect origin logic.
- The confirm route or PATCH route turns out to be called by the dashboard for
  unlinked and linked audits through different components than described.
- Changing `applyConfirmedProspectIdentity` breaks a test outside the #379
  block. That means another flow relied on the old skip; report which one.

## Maintenance notes

- **Existing data needs no migration.** At the next sync (audit stage, report
  stage, `makeReportReady`, or attach), every linked audit takes its
  prospect's confirmed identity. A name typed directly on a linked audit that
  differs from a confirmed prospect value is replaced then. That was accepted
  with the decision.
- A future screen that edits audit identity must go through
  `saveLinkedAuditIdentity` for linked audits, or its edit is overwritten at
  the next sync.
- If audits for a group ever need a per-hotel brand name distinct from the
  prospect, revisit this decision; the rejected per-field marker is the
  documented alternative.
