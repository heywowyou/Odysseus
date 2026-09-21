# Plan 074 — Random independent prospect from the directory

- **Execution status:** DONE (2026-09-21) — repository proof and the production dashboard rehearsal recorded below
- **Priority:** P2
- **Effort:** M
- **Depends on:** Plan 047's durable prospect hub and Plan 050's durable directory/prospect linking.

## Outcome

The Directory page gains one operator shortcut:

**Prospect indépendant aléatoire**

One click selects one eligible independent establishment from the **entire matching directory**, creates it through the existing durable prospect path, and opens its prospect detail page.

The operator no longer has to page through a large alphabetical hotel directory just to choose the next independent prospect to work on.

This is a sourcing shortcut only. It does not scan the site, qualify the prospect, draft outreach, send email, change outreach status, or rank one hotel as better than another.

## Current repository seams

The implementation already contains the right source-of-truth pieces:

- `packages/core/src/types/prospect.ts` defines hotel `groupStatus` as `independent | group-member | vendor-hosted | unknown`.
- `packages/store/src/prospect-hub.ts` owns both `listDirectory()` and `addDirectoryEntriesToProspects()`.
- `listDirectory()` already applies the directory facets and paginates them at 50 rows by default.
- `addDirectoryEntriesToProspects()` already claims a directory row before creating the prospect, so concurrent/repeated adds cannot manufacture duplicate prospects.
- a directory entry carrying `prospectId` is already linked to a prospect, whether that prospect is active or archived; the existing Directory UI opens/restores it instead of adding it again.
- `packages/interface/src/routes/prospect-hub.ts` owns `GET /api/directory` and `POST /api/directory/add`.
- `packages/interface/src/dashboard/routes/directory.tsx` owns the operator Directory page and already has the active filter state.
- `packages/interface/src/dashboard/routes/prospect-filter-model.ts` / `prospect-hub-model.ts` serialize that state into directory API queries.

Plan 074 adds a thin random-selection seam over these contracts. It must not create a second definition of “independent”, a second prospect-creation path, or client-side randomness over the current 50-row page.

## Binding decisions

### 1. Random means the full matching directory, never the visible page

Selection happens on the server/store side.

The browser must not:

- choose from `response.rows`;
- fetch every page and pick locally;
- pick an alphabetical offset;
- derive a pseudo-random page number.

The eligible pool is the complete set of directory entries matching the current directory filters after the rules below are applied, regardless of pagination.

Use MongoDB sampling over the matching set, conceptually:

```js
[
  { $match: eligibleDirectoryQuery },
  { $sample: { size: 1 } },
]
```

This is operational randomness, not a security primitive. No seed, audit lottery, or reproducible draw is required.

### 2. Independent is the stored canonical facet

An eligible row must have:

```
groupStatus = 'independent'
```

Do not infer independence again from the hotel name, domain, chain keywords, website kind, SIRENE data, or an LLM.

Rows marked `group-member`, `vendor-hosted`, or `unknown` are never eligible for this action.

The action is explicitly named “independent”, so it forces the sampling query to `groupStatus=independent`. If the filter bar currently carries a different group-status value, the click updates that filter to `independent` before/with the request so the visible filter state remains truthful about the pool that was sampled.

### 3. Already-used directory entries are excluded

The random action is for finding the **next** prospect.

An eligible directory entry must not already carry `prospectId`.

That excludes entries linked to:

- an active prospect;
- an archived prospect;
- an in-progress directory claim.

Plan 074 does not unlink, recycle, archive, restore, or permanently delete anything to make the pool larger.

A stale interrupted claim remains governed by the existing dangling-claim repair contract in `addDirectoryEntriesToProspects()`; this plan does not add a global cleanup pass merely to make a row sampleable.

### 4. Respect the operator's current directory filters

The random action preserves the current directory filter semantics for:

- free-text `q`;
- sector;
- stars;
- website kind;
- department;
- commune;
- postcode;
- minimum/maximum rooms.

`groupStatus` is forced to `independent` as described above.

Pagination is ignored. The action samples the whole matching pool, not `page` / `pageSize`.

Prospect-only filters such as status, scan state, or inactivity are not part of the directory contract and must not be invented for this endpoint.

Examples:

- no filters → random unlinked independent entry from the full directory;
- `stars=4` → random unlinked independent four-star entry;
- `department=33&stars=4` → random unlinked independent four-star entry in department 33;
- a name search → random unlinked independent entry within that matching name search.

### 5. Directory query construction has one owner

Today `listDirectory()` builds its Mongo query inline.

Extract the filter-to-query mapping into one internal/shared helper, for example:

```ts
function queryForDirectory(filter: DirectoryFilter): Record<string, unknown>
```

Both:

- `listDirectory()`;
- the new random-selection function

must use that helper.

The random function adds only its two extra eligibility clauses:

```ts
groupStatus: 'independent'
prospectId: { $exists: false }
```

Do not copy the directory filter mapping into the route or dashboard.

### 6. Selection and prospect creation are one operator action

Add a store-level operation, conceptually:

```ts
createRandomIndependentProspectFromDirectory(
  connection,
  filter,
  actor = 'operator',
): Promise<ProspectHubDocument | null>
```

Its contract:

1. normalize the filter to `groupStatus: 'independent'` and no pagination;
2. sample one unlinked matching directory entry;
3. pass that `directoryId` through the existing `addDirectoryEntriesToProspects()` path;
4. return the created durable prospect;
5. if another request wins the claim between sample and add, resample with a small bounded retry rather than creating through a bypass path;
6. return `null` when no eligible entry remains.

The existing add function stays the authority for:

- claiming the directory entry;
- copying source fields/facets;
- field origins;
- `directoryRef`;
- prospect-created event;
- duplicate prevention.

No second prospect constructor is allowed in Plan 074.

### 7. One dedicated state-changing route

Add:

```
POST /api/directory/random-independent
```

The request carries the current directory filters using the same query-string vocabulary as `GET /api/directory`; the dashboard sends an ordinary JSON body (`{}`) so the existing state-changing-request/CSRF content-type discipline stays intact.

The route:

- parses filters through the existing `filters(query).directory` path;
- forces `groupStatus=independent`;
- strips/ignores pagination;
- calls the store-level random-create operation;
- returns `201` with the created prospect on success;
- returns a typed `409` when no eligible independent directory entry matches the filters;
- returns `400` for malformed filters.

Suggested no-match code:

```
no-eligible-independent-directory-entry
```

Do not return an arbitrary internal Mongo/store error string as operator copy.

### 8. The Directory page gets one primary shortcut

In `packages/interface/src/dashboard/routes/directory.tsx`, add a button near the existing Directory header actions:

**FR:** `Prospect indépendant aléatoire`  
**EN:** `Random independent prospect`

Interaction:

1. preserve the current directory filters;
2. normalize the visible `groupStatus` filter to independent;
3. disable/show loading while the request is running;
4. POST the current matching-filter query to the new endpoint;
5. on `201`, navigate directly to `/prospects/:prospectId`;
6. on the typed no-match outcome, stay on the Directory page and show a concise persistent/accessible status such as:
   - FR: `Aucun établissement indépendant ne correspond aux filtres actuels.`
   - EN: `No independent establishment matches the current filters.`

Navigation to the new prospect is the success feedback. A transient success toast is optional and must not delay navigation.

Do not add a confirmation dialog. The existing Directory “Add” action already establishes that creating a prospect from a directory entry is an ordinary reversible operator action; the random button changes only how the entry is chosen.

### 9. The selected prospect is ordinary after creation

Once created, the prospect is indistinguishable from one added manually from the Directory.

It must:

- use status `new`;
- retain the same directory/source provenance;
- appear in the normal Prospects list;
- participate in the normal scan/outreach workflow;
- be archivable/restorable under the existing Plan-050 lifecycle;
- remain linked to its directory entry.

Do not add fields such as `selectedRandomly`, `randomRank`, `drawnAt`, or a permanent random-selection history. The source is still the directory; randomness is only an operator navigation mechanism.

### 10. No hidden qualification or ranking

“Random independent” means exactly that.

The selection must not prefer or exclude entries based on:

- prior scan findings;
- accessibility issues;
- expected sale value;
- room count unless the operator set a room filter;
- star rating unless the operator set a star filter;
- presence of an email;
- SIREN/SIRET completeness;
- website quality;
- outreach readiness;
- geographic proximity;
- whether the hotel “looks promising”.

Those can remain explicit operator filters or later product features. Plan 074 is deliberately neutral random sampling from the requested pool.

## Implementation slices

### Slice 1 — shared directory query + store sampler

1. Extract the current `listDirectory()` filter mapping into `queryForDirectory()`.
2. Keep `listDirectory()` behaviour byte-for-behaviour equivalent for existing filters/pagination.
3. Add `createRandomIndependentProspectFromDirectory()`.
4. Use `$match + $sample` over the entire matching unlinked pool.
5. Feed the sampled id into `addDirectoryEntriesToProspects()`.
6. Add a bounded retry only for a lost concurrent claim.

Focused store tests:

- only one eligible row → that row is created;
- independent vs group-member/vendor-hosted/unknown → only independent can be created;
- already-linked active and archived entries are excluded;
- current directory facets are respected;
- an eligible entry that would sort beyond the first 50 rows can still be selected;
- no matching row returns `null`;
- two concurrent random actions never create two prospects from one directory entry;
- `listDirectory()` existing filter/pagination tests remain unchanged.

Do not write a flaky statistical-distribution test.

### Slice 2 — route contract

1. Export the new store function through `@odysseus/store`.
2. Add `POST /api/directory/random-independent` beside the existing Directory routes.
3. Reuse the existing filter parser.
4. Force independent and remove pagination before calling the store.
5. Return the typed 201 / 409 / 400 contract.

Focused route tests in the existing `prospect-hub` route suite:

- valid filtered request calls the store with independent;
- page/pageSize do not constrain the sample;
- malformed facet → 400;
- no eligible entry → typed 409;
- success → 201 with the created prospect;
- the route never calls a scan/outreach producer.

### Slice 3 — dashboard action

1. Add a model helper for the random endpoint path built from the current directory filter state.
2. Add the FR/EN strings under the active `prospectHub.directory` i18n namespace.
3. Add the header action/button and loading state.
4. Keep the group-status filter visibly aligned with the forced independent pool.
5. Navigate to the returned prospect detail on success.
6. Render the no-match message as accessible status text that remains until the next attempt/filter change.

Focused UI proof:

- button is keyboard reachable and has visible text;
- loading prevents double activation;
- current facets are present in the request;
- success navigates to the exact created prospect;
- no-match keeps the operator in the Directory and renders the translated status;
- axe/accessibility test for `DirectoryPage` stays green in FR and EN.

### Slice 4 — docs and workflow acceptance

Update `docs/product/dashboard-ia.md` so Directory explicitly has two sourcing modes:

- browse/filter and add selected entries;
- one-click random independent prospect from the full matching pool.

Run the normal baseline:

```bash
pnpm run format
pnpm run check
pnpm run test
```

Store integration proof:

```bash
pnpm run test:store:up
pnpm run test -- packages/store/src packages/interface/src
pnpm run test:store:down
```

Operator acceptance on the local/VPS dashboard may use the existing directory data, but it must **not** launch a scan, send outreach, or mutate any third-party site.

Acceptance rehearsal:

1. open Directory with no filters;
2. click `Prospect indépendant aléatoire`;
3. verify the opened prospect is `hotel.groupStatus=independent`;
4. verify its directory row is now linked and cannot be selected again;
5. return to Directory, apply one visible facet (for example stars or department), draw again, and verify the created prospect satisfies it;
6. exhaust a tiny test fixture/filter pool and verify the no-match state.

## Definition of done

- One click from Directory creates and opens a random independent prospect.
- The candidate is sampled server-side from the complete matching directory, not the current page.
- The canonical stored `groupStatus=independent` facet is the only independence rule.
- Entries already linked to active or archived prospects are not eligible.
- Existing directory filters constrain the full sampling pool; pagination does not.
- The action creates through `addDirectoryEntriesToProspects()`, preserving provenance and duplicate safety.
- A concurrent claim cannot create a duplicate prospect.
- No eligible candidate produces a translated, accessible no-match state rather than a raw exception.
- The created record behaves exactly like any other directory-created prospect.
- The feature stores no random rank/history and performs no hidden scoring.
- The feature launches no scan, LLM call, email draft, preview publication, or outreach send.
- Existing Directory browsing/add behaviour and tests remain green.
- The requirement-to-proof ledger below is complete before the plan moves to DONE.

## Executable closure contract

| Requirement | Owning seam / artifact | Focused proof required |
| --- | --- | --- |
| whole-pool randomness | store sampler | fixture whose sole eligible row lies beyond page 1 is selected |
| canonical independence | `groupStatus` match | non-independent fixtures never selected |
| no already-used prospect | directory `prospectId` eligibility | active + archived linked rows excluded |
| filter parity | shared `queryForDirectory` | list and sampler use one query builder; facet tests |
| no page bias | sampler input | page/pageSize ignored by random route/store |
| durable creation | `addDirectoryEntriesToProspects` reuse | created prospect carries normal directoryRef/origins/event |
| concurrency safety | claim + bounded resample | concurrent integration test creates no duplicate |
| typed empty pool | route | no candidate → 409 code, no raw store exception |
| truthful UI | DirectoryPage | visible independent filter, loading, no-match status |
| direct workflow | DirectoryPage navigation | 201 opens exact `/prospects/:prospectId` |
| accessibility | dashboard accessibility suite | keyboard/focus/status + axe |
| no hidden ranking | store/route architecture | no scan/outreach/readiness dependency in selection path |
| docs | dashboard IA | random sourcing mode documented |

No binding row closes by code review alone.

## Closure evidence (2026-09-21)

| Requirement | Implementation | Proof |
| --- | --- | --- |
| whole-pool randomness | `createRandomIndependentProspectFromDirectory()` in `packages/store/src/prospect-hub.ts`: `$match` + `$sample` over the matching unlinked pool | `directory-random-prospect.test.ts`: "draws from the whole matching pool, not the first page" (sole eligible row sorts after 60 others, drawn with `pageSize: 1`) |
| canonical independence | sampler forces `groupStatus: 'independent'` through `queryForDirectory()` | "never selects a group-member, vendor-hosted or unknown entry"; "forces independence even when the filter asks for another group status" |
| no already-used prospect | sampler adds `prospectId: { $exists: false }` | "excludes entries already linked to active or archived prospects" |
| filter parity | `queryForDirectory()` is the only facet-to-query mapping; `listDirectory()` and the sampler both call it | "respects the current directory facets" (stars, department, rooms, name search); existing `listDirectory` tests in `prospect-hub-integrity.test.ts` and `prospect-archive.test.ts` unchanged and green |
| no page bias | sampler strips `page`/`pageSize`; route strips them before the store; `buildRandomIndependentPath()` omits them | route test "forces independence, drops pagination, and returns the created prospect"; dashboard test "forces independence, keeps the facets, and drops pagination" |
| durable creation | sampled id goes through `addDirectoryEntriesToProspects()`; no other constructor | "creates the only eligible entry through the normal directory add" (status `new`, `directoryRef`, `atout-france` field origins, `prospect-created` event, directory link) |
| concurrency safety | directory claim in `addDirectoryEntriesToProspects()` plus a resample bounded at 5 draws | "never creates two prospects from one entry under concurrent draws" (6 parallel draws, 1 prospect); "resamples when a concurrent add wins the sampled entry" |
| typed empty pool | `POST /api/directory/random-independent` answers 409 `{ code: 'no-eligible-independent-directory-entry' }`; 400 for malformed facets | route tests "answers a typed 409 when no eligible entry matches" and "rejects malformed facets without drawing"; store test "returns null when nothing matches" |
| truthful UI | `DirectoryPage` sets the visible group filter to independent on click, disables the button while drawing, shows a persistent `role="status"` message bound to the current filters | `directory-random-independent.test.ts`: "sends the current facets, blocks a second click while drawing, and opens the created prospect"; "keeps the operator on the Directory with an accessible no-match status" (FR and EN) |
| direct workflow | `navigate('/prospects/:prospectId')` on 201 | same test asserts the location becomes `/prospects/p-random-1` |
| accessibility | native button with visible text; status region | "is a keyboard-reachable button with visible text in both languages"; axe clean with the no-match status shown (FR and EN); `accessibility.test.ts` Directory FR/EN green |
| no hidden ranking | the sampler's only inputs are the directory facets plus the two eligibility clauses; the route calls no scan, draft or mail code | route test "launches no scan and no outreach work"; store test asserts no random-selection field on the created record |
| docs | `docs/product/dashboard-ia.md` "Prospects and Directory" documents both sourcing modes | `pnpm run docs:check` |

The route is registered under the existing `addFromDirectory` row of the
consequential-action registry (`packages/interface/src/operator/action-registry.ts`).

Repository validation: `pnpm run check` passed; `vitest run packages/store/src
packages/interface/src` passed 1674 tests (3 skipped) against the Mongo test
service.

## Acceptance rehearsal (2026-09-21, production build `97e6e394`)

Run on `https://app.odysseusaudit.com` by a browser script, logged in as the
operator. No scan, draft, preview or email was produced.

1. Directory with no filters (9,480 independent entries listed): the click
   opened `/prospects/ee3e9745-2565-4a15-bdf1-2a802437040d`, GARLANDE HÔTEL
   AVIGNON CENTRE, status `new`, `hotel.groupStatus=independent`,
   `directoryRef` atout-france, no audits, no drafts.
2. Its directory row now lists `prospectId` with state `active`.
3. Directory `stars=4&department=33` (35 independent entries): the click
   opened `/prospects/e579448d-e81d-49e2-849c-2235bcc4706e`, HÔTEL LA
   BAIGNOIRE, 4 stars, department 33, independent, status `new`.
4. Directory filtered to the first prospect's exact name and department (a
   pool of one, already linked): the page stayed on `/annuaire`, the group
   filter became `groupStatus=independent`, and the status read `Aucun
   établissement indépendant ne correspond aux filtres actuels.`

The two rehearsal prospects are ordinary directory prospects; archive them if
they are not wanted.
