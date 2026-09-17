# Plan 053: An opt-out's suppression reach is not widened when the prospect is opted out

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report; do not
> improvise. When done, update this plan's row in `plans/README.md`, unless a
> reviewer dispatched you and said they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 38a516f2..HEAD -- packages/store/src/prospect-hub.ts packages/store/src/suppression.ts packages/interface/src/outreach/opt-out-requests.ts packages/interface/src/outreach/opt-out-requests.test.ts packages/store/src/prospect-hub.test.ts`
> If any of these changed, compare the "Current state" excerpts with the live
> code. A mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED (it changes what an opt-out suppresses)
- **Depends on**: none
- **Category**: bug (suppression correctness and abuse)
- **Planned at**: commit `38a516f2`, 2026-09-17

## Why this matters

Issue #341 (trade-off 89 amendment, `docs/decisions/trade-offs.md` around line
4731) decided the following about public opt-outs:

> An opt-out still suppresses the submitted address every time, with no proof
> of identity. The domain is suppressed as well only when the request carries a
> token for a link we emailed to an address on that same domain, and the domain
> is not a free-mail provider (`isFreeMailDomain`). A matching prospect is still
> opted out, its previews revoked and its threads closed.

`applyOptOut` implements that correctly, then calls `recordProspectOutcome(..., 'opt-out')`
for every prospect carrying the address. That moves the prospect to
`opted-out`, and the status change runs `suppressProspect`, which:

1. writes a **domain-wide** row for the website domain and for **every** email
   domain on the prospect, with no free-mail check; and
2. rewrites each prospect address **without** `addressOnly`. The store's upsert
   then `$unset`s `scope`, which widens the address-only row `applyOptOut` just
   wrote into a domain-wide row.

Two consequences follow:

- An anonymous form post with a hotel's public contact address suppresses the
  hotel's whole domain.
- If a prospect's contact is `someone@gmail.com`, `gmail.com` becomes
  suppressed for every prospect.

Either one reverses #341.

After this plan:

- the public opt-out keeps the reach it decided;
- an operator-recorded opt-out still suppresses the prospect's business
  domains;
- no path ever suppresses a free-mail domain wholesale.

## Current state

### Files and roles

- `packages/interface/src/outreach/opt-out-requests.ts`: processes public
  opt-out requests from the bucket. `applyOptOut` sits at lines 72-114.
- `packages/store/src/prospect-hub.ts`: `suppressProspect` (lines 676-709),
  `applyAutomaticProspectStatus` (lines 715-728), `recordProspectOutcome`
  (lines 1247-1275).
- `packages/store/src/suppression.ts`: `addSuppressionEntry` (lines 42-80).
  `addressOnly` sets `scope: 'address'` on insert. Omitting it `$unset`s
  `scope`, which widens the row.
- `packages/store/src/outreach-outcomes.ts:106`: another caller of
  `applyAutomaticProspectStatus` (operator-reconciled thread outcomes). Keep
  its behaviour apart from the free-mail guard.
- `isFreeMailDomain(domain: string): boolean` is exported from `@odysseus/core`
  (`packages/core/src/prospecting/free-mail-domains.ts:35`). `@odysseus/store`
  already depends on `@odysseus/core`.

### Excerpts

`packages/interface/src/outreach/opt-out-requests.ts:78-100`:

```ts
  const address = rawAddress.trim().toLowerCase();
  const domain = emailDomain(address);
  const domainWide =
    domain !== undefined &&
    linkedAddress !== undefined &&
    emailDomain(linkedAddress) === domain &&
    !isFreeMailDomain(domain);
  await addSuppressionEntry(connection, {
    domain: domain ?? '',
    address,
    addressOnly: !domainWide,
    reasonCode: 'objection',
    reason: OPT_OUT_REASON,
  });

  for (const prospect of await findProspectsByEmail(connection, address)) {
    try {
      await recordProspectOutcome(connection, prospect.prospectId, 'opt-out', ACTOR);
    } catch (error) {
      // A won or lost prospect keeps its result; the suppression above
      // already stops any further contact.
      if (!(error instanceof AutomaticStatusTransitionError)) throw error;
    }
```

`packages/store/src/prospect-hub.ts:676-728`:

```ts
async function suppressProspect(
  connection: Connection,
  prospect: ProspectHubDocument,
): Promise<void> {
  const website = primaryWebsite(prospect.websites);
  const domains = new Set<string>();
  if (website?.registrableDomain !== undefined) {
    domains.add(website.registrableDomain);
  }
  for (const email of prospect.emails) {
    const domain = emailDomain(email.address);
    if (domain !== undefined) domains.add(domain);
  }
  await Promise.all(
    [...domains].map((domain) =>
      addSuppressionEntry(connection, {
        domain,
        reasonCode: 'objection',
        reason: 'opt-out recorded on the prospect',
      }),
    ),
  );
  await Promise.all(
    prospect.emails.map((email) => {
      const domain = emailDomain(email.address);
      if (domain === undefined) return Promise.resolve();
      return addSuppressionEntry(connection, {
        domain,
        address: email.address,
        reasonCode: 'objection',
        reason: 'opt-out recorded on the prospect',
      });
    }),
  );
}

export async function applyAutomaticProspectStatus(
  connection: Connection,
  prospectId: string,
  status: Exclude<ProspectStatus, 'new'>,
  actor = 'automation',
): Promise<ProspectHubDocument | null> {
  const current = await getProspectHub(connection, prospectId);
  if (current === null) return null;
  const decision = decideAutomaticStatus(current.status, status);
  if (!decision.allowed) throw new AutomaticStatusTransitionError(current.status, status);
  if (!decision.changed) return current;
  if (status === 'opted-out') await suppressProspect(connection, current);
  return setProspectStatus(connection, prospectId, status, actor);
}
```

`packages/store/src/prospect-hub.ts:1247-1268`:

```ts
export async function recordProspectOutcome(
  connection: Connection,
  prospectId: string,
  outcome: string,
  actor = 'operator',
): Promise<ProspectHubDocument | null> {
  ...
      : await applyAutomaticProspectStatus(connection, prospectId, status, actor);
```

### Conventions

- Store functions take `connection` first and return plain documents.
- Optional trailing option objects are the established way to extend a store
  function; see `listProspectEvents(connection, prospectId, limit = 200)` and
  the `options` object on `withdrawOutreachForProspect`.
- Comments explain *why* and cite the issue or trade-off (`// Issue #341: ...`).
- Mongo integration tests use
  `probeMongoAvailability(scopedMongoTestUri('<name>'))` and
  `describe.skipIf(!mongoAvailable)`. In CI they fail rather than skip when
  Mongo is unreachable (#343). The pattern to follow is
  `packages/interface/src/outreach/opt-out-requests.test.ts:21-30,53`, and its
  `submit(address, token?)` helper at lines 121-137.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Start test Mongo | `pnpm run test:store:up` | container `mongo-test` up |
| Focused tests | `pnpm test packages/interface/src/outreach/opt-out-requests.test.ts packages/store/src/prospect-hub.test.ts` | all pass, none skipped |
| Store tier | `pnpm test packages/store/src` | all pass |
| Format and gate | `pnpm run format && pnpm run check` | exit 0 |
| Stop Mongo | `pnpm run test:store:down` | exit 0 |

## Scope

**In scope:**

- `packages/store/src/prospect-hub.ts` (`suppressProspect`,
  `applyAutomaticProspectStatus`, `recordProspectOutcome` only)
- `packages/store/src/prospect-hub.test.ts`
- `packages/interface/src/outreach/opt-out-requests.ts` (the
  `recordProspectOutcome` call and the file's header comment)
- `packages/interface/src/outreach/opt-out-requests.test.ts`
- `docs/decisions/trade-offs.md`: one sentence appended to the trade-off 89
  amendment

**Out of scope:**

- `packages/store/src/suppression.ts`. The widen/narrow rule there is a
  deliberate contract ("an address-only write never narrows an existing
  domain-wide row").
- `packages/store/src/outreach-outcomes.ts` beyond what it inherits from the
  shared free-mail guard.
- The public site's opt-out route (`packages/site/**`).
- Any cleanup of existing suppression rows. Outreach has not started, so no
  opt-out rows exist in production (operator, 2026-09-17).

## Git workflow

- Branch: `advisor/053-opt-out-reach`.
- Imperative behavioural commit message, e.g.
  `Keep a public opt-out's address-only reach when its prospect is opted out`.
- No `Co-Authored-By` or "Generated with" trailers; the commit-msg hook
  rejects them.
- Do not push.

## Steps

### Step 1: Write the failing tests first

In `opt-out-requests.test.ts`, inside the existing
`describe.skipIf(!mongoAvailable)('processing opt-out requests', ...)` block,
add:

1. **"keeps an anonymous opt-out for a known prospect's address to that
   address"**
   - Create a prospect with website domain `anon-prospect.fr` and email
     `contact@anon-prospect.fr`.
   - `await submit('contact@anon-prospect.fr')` (no token).
   - Expect the prospect status to be `'opted-out'`.
   - Expect `isSuppressed(connection!, 'anon-prospect.fr', 'contact@anon-prospect.fr')` → `true`.
   - Expect `isSuppressed(connection!, 'anon-prospect.fr')` → `false`.
   - Expect `isSuppressed(connection!, 'anon-prospect.fr', 'direction@anon-prospect.fr')` → `false`.
2. **"never suppresses a free-mail provider when a prospect's contact uses it"**
   - Create a prospect with website domain `gite-freemail.fr` and email
     `gite.owner@gmail.com`.
   - `await submit('gite.owner@gmail.com', createOptOutLink('https://www.odysseusaudit.com').token)`.
   - Expect `isSuppressed(connection!, 'gmail.com', 'another.person@gmail.com')` → `false`.
   - Expect `isSuppressed(connection!, 'gmail.com', 'gite.owner@gmail.com')` → `true`.

In `prospect-hub.test.ts`, add a Mongo test named **"an operator-recorded
opt-out suppresses the business domains but never a free-mail domain"**:

- Create a prospect with website `hotel-op.fr` and emails
  `contact@hotel-op.fr` and `owner@orange.fr`. Check that `orange.fr` is in the
  free-mail list with
  `grep -n "orange.fr" packages/core/src/prospecting/free-mail-domains.ts`;
  if it isn't, use `gmail.com`.
- `await recordProspectOutcome(connection, prospectId, 'opt-out')`.
- Expect `isSuppressed(connection, 'hotel-op.fr')` → `true`.
- Expect `isSuppressed(connection, 'orange.fr', 'owner@orange.fr')` → `true`.
- Expect `isSuppressed(connection, 'orange.fr', 'someone@orange.fr')` → `false`.

Use the file's existing connection setup and import `isSuppressed` from
`./suppression.js`.

**Verify**: `pnpm run test:store:up`, then run the focused tests. The two new
opt-out tests and the new store test **fail** on the domain assertions. All
pre-existing tests pass.

### Step 2: Guard free-mail domains in `suppressProspect`

- Import `isFreeMailDomain` from `@odysseus/core` and add it to the existing
  import block.
- When building `domains`, skip any domain for which `isFreeMailDomain` is
  true. Apply the check to the website domain too; it costs nothing.
- In the per-address loop, pass `addressOnly: isFreeMailDomain(domain)`. A
  free-mail address row then stays address-scoped. A business-domain address
  row still widens, which is harmless because its domain row is written anyway.
- Add a one-line `// Issue #341: ...` comment explaining why.

**Verify**: the new `prospect-hub.test.ts` test passes.

### Step 3: Let the public path keep the reach it already decided

- Add an optional last parameter to both functions:
  - `applyAutomaticProspectStatus(connection, prospectId, status, actor = 'automation', options: { suppression?: 'apply' | 'already-applied' } = {})`;
  - `recordProspectOutcome(connection, prospectId, outcome, actor = 'operator', options: { suppression?: 'apply' | 'already-applied' } = {})`.
- In `applyAutomaticProspectStatus`, only run `suppressProspect` when
  `status === 'opted-out' && options.suppression !== 'already-applied'`.
- Have `recordProspectOutcome` forward `options` to it.
- Doc-comment the option: the caller has already written the suppression reach
  the rules allow (the public opt-out, trade-off 89), so the status change must
  not widen it.
- In `opt-out-requests.ts`, call
  `recordProspectOutcome(connection, prospect.prospectId, 'opt-out', ACTOR, { suppression: 'already-applied' })`.
- Update that file's header comment: a matching prospect is opted out without
  widening suppression beyond the reach decided above.
- Do not change `outreach-outcomes.ts`. It keeps the default `'apply'`.

**Verify**: the focused tests all pass, including the two new opt-out tests.
`pnpm test packages/store/src` → all pass.

### Step 4: Record the decision and run the gates

Append one sentence to the trade-off 89 amendment paragraph in
`docs/decisions/trade-offs.md`, for example:

> Opting the matching prospect out does not widen that reach (issue #341
> follow-up, 2026-09-17), and no path suppresses a free-mail domain wholesale.

**Verify**: `pnpm run format && pnpm run check` → exit 0.
`pnpm test packages/interface/src/outreach packages/store/src` → all pass.
Then run `pnpm run test:store:down`.

## Test plan

The three new tests in Step 1 cover:

- an anonymous opt-out on a known business prospect (address only);
- a free-mail prospect contact through our link (never the provider domain);
- an operator-recorded opt-out (business domain yes, free-mail no).

All existing opt-out tests must still pass unchanged, in particular "suppresses
the domain when our link was issued to an address on that domain".

## Done criteria

- [ ] New tests exist and pass against the local Mongo test service (not skipped)
- [ ] `pnpm run check` exits 0
- [ ] `grep -n "already-applied" packages/interface/src/outreach/opt-out-requests.ts` → one hit
- [ ] `grep -n "isFreeMailDomain" packages/store/src/prospect-hub.ts` → at least two hits
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` row 053 updated

## STOP conditions

- The excerpts don't match the live code.
- Mongo integration tests are skipped because Mongo can't be started. Don't
  claim done without them running.
- `isFreeMailDomain` isn't exported from `@odysseus/core`'s entry point, or
  importing it into the store fails `pnpm run architecture:check`.
- Another caller of `recordProspectOutcome` or `applyAutomaticProspectStatus`
  turns up (run
  `grep -rn "recordProspectOutcome\|applyAutomaticProspectStatus" packages --include=*.ts | grep -v dist/`)
  that also writes its own suppression. Report it rather than guessing its
  intended reach.

## Maintenance notes

- **Production data:** none to clean. Outreach had not started when this plan
  was written, so no opt-out or suppression rows existed (operator,
  2026-09-17). If this plan lands after outreach begins, check for widened
  rows before closing it.
- Any future automated path that opts a prospect out after writing its own
  suppression should pass `{ suppression: 'already-applied' }`.
- Reviewers should check that the operator path (the dashboard outcome and
  thread reconciliation) still suppresses the business website domain.
