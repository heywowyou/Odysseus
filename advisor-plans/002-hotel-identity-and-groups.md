# Plan 002: Resolve hotel identities, own domains, and group routing

> **Executor instructions**: Complete plan 001 first. Automatic merges require
> exact identifiers; uncertain matches become review work, never silent joins.
>
> **Drift check**: `git diff --stat f7ef7cf..HEAD -- packages/core/src/prospecting packages/interface/src/prospecting packages/store/src/hotel* packages/store/src/prospects.ts packages/cli/src/commands/prospect.ts`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plan 001
- **Category**: direction
- **Planned at**: `f7ef7cf`, 2026-08-27

## Why this matters

National sources overlap and disagree. This plan turns immutable source rows
into canonical hotel candidates without merging two establishments or sending
an independent-hotel pitch to a chain. It preserves the shipped append-only
`prospects` events by introducing a separate sourcing catalogue.

## Current state

- Shipped `prospects` is insert-only and domain is non-unique. Do not convert it
  into the older technical draft's mutable registry.
- The supplied draft proposes registrable-domain dedupe, exact SIRET, fuzzy
  name/postcode fallback, and a group queue. The safe reconciliation is exact
  auto-resolution plus manual review for name/postcode candidates.
- The project has no general public-suffix dependency. Do not hand-roll eTLD+1.
- Measured 2026-08-27: **neither** Atout France nor DATAtourisme carries a SIRET
  or SIREN column (`advisor-plans/README.md`, "Measured source facts"). Do not
  look for one. The exact-identifier auto-resolution path is fed by the SIREN
  the hotel publishes on its own site, extracted during plan 003 by the shipped
  mentions-legales path, so for most candidates the identifier arrives *after*
  this plan's first join rather than before it. Plan for that ordering: a
  candidate may legitimately sit in manual-review on name plus postcode until
  plan 003 supplies an exact identifier that promotes it.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Core match tests | `pnpm exec vitest run packages/core/src/prospecting/hotel-identity.test.ts` | all pass |
| Store tests | `pnpm exec vitest run packages/store/src/hotel-candidates.test.ts` | all pass |
| Interface tests | `pnpm exec vitest run packages/interface/src/prospecting/resolve-hotels.test.ts` | all pass |
| Validation | `pnpm run check` | exit 0 |

## Scope

**In scope**: Atout-France-to-DATAtourisme/Sirene joins; pure identity contract;
exact SIRET/SIREN/domain matching; manual-review candidates; canonical
`hotel_candidates` catalogue; group/chain queue; provenance conflicts; CLI
resolve/review commands with dry-run/limit.

**Out of scope**: fuzzy auto-merge, coordinate auto-merge, custom public-suffix
parser, website health, outreach qualification, mutation of source rows or
`prospects`, and a generic CRM.

## Git workflow

- Work directly on `main`; do not create another branch.
- Commit with an imperative message such as `Resolve hotel identities safely`.

## Steps

### Step 1: Join the base catalogue to classification and company facts

Start from each normalized DATAtourisme hotel record. Join Atout France rows
using exact source identifiers or SIRET, retaining Atout classification and
capacity with source/version provenance. Feed exact SIRET/SIREN candidates into
the already-shipped Sirene index/helpers to obtain only the company facts
permitted by canonical qualification. Missing or conflicting joins remain
explicit; neither source may create an establishment by itself in this base
catalogue projection.

**Verify**: fixtures cover exact three-source agreement, missing Atout/Sirene,
conflicting SIRET/classification, multiple establishments under one SIREN, and
stable source-version provenance.

### Step 2: Define the pure identity module

`resolveHotelIdentity(...)` returns `resolved | needs-review | ambiguous |
unmatched`, contributing source IDs, exact key, conflicts, and candidate IDs.
Auto-resolve only valid exact SIRET, consistent SIREN plus establishment fact,
or exact normalized own-domain agreement. Normalized name plus postcode may
create `needs-review` candidates but never selects one.

**Verify**: table tests cover exact agreement, conflicting keys, shared names,
malformed IDs, missing postcode, and stable ordering.

### Step 3: Create the canonical sourcing catalogue

Add `hotel_candidates`, one current projection per resolved establishment with
links to immutable source records, best verified identity facts, website
candidates, rating/capacity, resolution status, group status, and 90-day
expiry. Store helpers own compare-and-set refreshes and never erase provenance.

**Verify**: store tests cover refresh, conflict preservation, one candidate per
identity, and expiry.

### Step 4: Normalize domains through an approved implementation

Validate URL syntax, HTTP(S), IDNA, leading `www`, and registrable domain. If an
approved existing dependency cannot do eTLD+1 correctly, stop for dependency
approval. Classify OTA/aggregator hosts separately from own-domain candidates.

**Verify**: tests cover multi-level suffixes, IDNs, subdomains, malformed URLs,
OTA hosts, and source disagreement.

### Step 5: Detect group/chain routing

Multiple establishments/SIRETs sharing one registrable domain become
`group-member`/`chain` and enter a separate groups queue. Keep them for future
analysis but exclude them from the SMB hotel campaign. A manually verified
independent hotel on a shared booking vendor domain must not be mislabeled as a
chain.

**Verify**: fixtures cover 12 SIRETs on one group domain, independent domains,
shared OTA/vendor domains, and later source refresh.

### Step 6: Add review and yield surfaces

CLI commands list ambiguous/needs-review joins, accept/reject one candidate with
actor/reason, and report unique establishments, own-domain candidates, groups,
unmatched, and conflicts. Every command supports dry-run and limit.

**Verify**: review actions are auditable/idempotent and report totals reconcile
to source inputs.

## Test plan

Use synthetic hard cases from both supplied specs. Test only the deep identity
interface plus store/CLI behavior; no live lookup.

## Done criteria

- [ ] Exact identifiers/domains are the only automatic merge paths.
- [ ] DATAtourisme candidates retain exact Atout France and Sirene join
      provenance, including missing/conflicting results.
- [ ] Name/postcode candidates require explicit review.
- [ ] Chains/groups are retained but excluded from SMB selection.
- [ ] Catalogue yield and ambiguity are measurable.
- [ ] Tests/check pass; plan 002 is `DONE`.

## STOP conditions

Stop for dependency approval, material exact-key collisions, inability to
distinguish own/group/vendor domains, or any proposal to fuzzy-auto-merge.

## Maintenance notes

Never change an existing resolution rule in place. Version it and re-resolve so
later yield/conversion comparisons remain interpretable.
