# Plan 007: Discover and validate role contacts for selected hotels

> **Executor instructions**: Complete plan 006. Contacts are own-domain role
> addresses only. Named, guessed, free-mail, and telephone data are prohibited.
>
> **Drift check**: `git diff --stat f7ef7cf..HEAD -- packages/core/src/prospecting packages/interface/src/prospecting packages/store/src/prospects.ts packages/store/src/suppression.ts docs/prospect-qualification.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: plan 006
- **Category**: direction
- **Planned at**: `f7ef7cf`, 2026-08-27

## Why this matters

Source-first hotels may not have passed through the existing AFNIC contact
path. This stage finds only defensible professional role addresses and parks
records rather than guessing when none exists.

## Current state

- Existing `extractContactAddress` and `qualifyProspect` enforce the canonical
  own-domain role-address rule. Reuse/deepen them.
- Supplied drafts propose nominative contacts, MX/catch-all verification, and
  phone fields. Canonical rules supersede nominative/phone collection. Network
  verification must not become SMTP probing.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Contact tests | `pnpm exec vitest run packages/interface/src/prospecting/extract-contact-address.test.ts packages/interface/src/prospecting/discover-hotel-contact.test.ts` | all pass |
| Suppression tests | `pnpm exec vitest run packages/store/src/suppression.test.ts` | all pass |
| Validation | `pnpm run check` | exit 0 |

## Scope

**In scope**: mentions legales/contact/footer/mailto discovery; existing role
allowlist; syntax and DNS MX existence if approved; per-source provenance;
suppression; selected-prospect contact state; dry-run/limit CLI.

**Out of scope**: named addresses, DATAtourisme named contacts, pattern guessing,
SMTP/catch-all probing, verification vendors, free-mail, phone, contact forms,
or contact before scoring selection.

## Git workflow

- Work directly on `main`; do not create another branch.
- Commit with `Discover safe hotel role contacts`.

## Steps

### Step 1: Deepen the role-contact interface

`discoverRoleContact(texts, ownDomain)` returns a validated address or typed
absence/rejection with source. Prefer `direction@`, `commercial@`, `contact@`,
`info@` according to the canonical allowlist, never a person's name.

**Verify**: FR/EN fixtures cover multiple mailtos, obfuscation, subdomains,
free-mail, named local parts, and false positives.

### Step 2: Fetch only allowed pages politely

Reuse plan-003 cached homepage/mentions legales/contact/footer facts when fresh;
otherwise use the same no-browser robots/pacing/origin-lock path. Do not fetch
unrelated pages or use Chromium.

**Verify**: local fixtures prove bounded fetches, caching, robots, and cleanup.

### Step 3: Validate without probing a mailbox

Apply syntax/domain ownership and suppression. DNS MX existence may be checked
only through an approved resolver and is a domain fact, not proof the address
exists. Do not SMTP-verify or classify catch-all.

**Verify**: tests cover no MX, transient DNS error, suppressed domain/address,
and no network in unit tests.

### Step 4: Persist operational contact provenance

Attach the role contact only to a 90-day selected prospect/contact record with
source and validation date. No contact means `parked: no-role-address`.
Recheck suppression immediately before later generation/drafting.

**Verify**: store tests prove retention, no prohibited addresses, and parking.

### Step 5: Add bounded discovery command

`prospect contacts --dry-run --limit N` processes selected records only and
reports found/absent/rejected/suppressed reasons.

**Verify**: CLI zero-write dry-run, bounds, and reconciled counts pass.

## Test plan

Parser tables, local HTTP fixtures, optional stub DNS, store/suppression, CLI.

## Done criteria

- [ ] Only own-domain role addresses are retained for 90 days.
- [ ] No address guessing/SMTP probing/free-mail/named/phone data exists.
- [ ] Missing contact parks the record with a reason.
- [ ] Tests/check pass; plan 007 is `DONE`.

## STOP conditions

Stop if campaign coverage requires named contacts or a verification vendor,
because either changes canonical qualification and needs operator/legal review.

## Maintenance notes

Role allowlist changes belong in canonical prospect qualification and require
focused regression tests across ingestion and draft creation.
