# Plan 054: The re-audit delta keeps one ongoing defect as persistent when its page set changes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report; do not
> improvise. When done, update this plan's row in `plans/README.md`, unless a
> reviewer dispatched you and said they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 38a516f2..HEAD -- packages/core/src/delta packages/report/src/template/sections/findings-delta.ts packages/report/src/template/sections/findings-delta.test.ts docs/product/findings-delta-reaudit-design.md`
> If any of these changed, compare the "Current state" excerpts with the live
> code. A mismatch is a STOP condition.

## Status

- **Priority**: P1 (must land before the plan 050/051 acceptance rehearsal renders a real re-audit)
- **Effort**: M
- **Risk**: MED (it changes the delta counts in a paid deliverable)
- **Depends on**: none
- **Category**: bug (client-facing correctness)
- **Planned at**: commit `38a516f2`, 2026-09-17

## Why this matters

A re-audit report includes a deterministic "changes since the previous audit"
section. It pairs baseline and re-audit findings on the stored `dedupeKey`.

For the most common real findings (header contrast, gallery alt text, target
size on every page), normalization merges several selectors of one rule that
cover the **same set of pages** into a single finding. That finding's
`dedupeKey` is hashed from the **sorted page list**. The key therefore changes
whenever the page set changes, even though the defect has not:

- the re-audit reaches one more or one fewer page;
- the client fixed the defect on one page but not the others;
- the finding drops from several selectors to one, and the key switches back
  to selector-based.

The delta then prints the same defect twice: once under "Constats plus
détectés", which the report says "a le plus souvent été corrigé", and once
under "Nouveaux constats". That overstates fixes and invents regressions in a
document the client pays for.

The stored `dedupeKey` is a protected contract. It lives in
`packages/core/src/types/findings.ts`, and normalization files feed a fixture
fingerprint that cannot be refreshed on this machine. So the fix belongs
**only in the delta**: after exact-key pairing, a second deterministic pass
pairs a leftover "resolved" finding with a leftover "new" finding when they are
the same rule with the same title on overlapping pages.

## Current state

### Files and roles

- `packages/core/src/delta/findings-delta.ts`: the pure delta. **This is where
  the change goes.**
- `packages/core/src/delta/findings-delta.test.ts`: its unit tests, with
  `finding(key, severity, pages)` and `run(auditId, findings, overrides)`
  builders at lines 1-50.
- `packages/core/src/normalize/normalize.ts`: explains why keys move
  (`aggregateSharedScopeOccurrences`, around lines 511-584). **Read only; do
  not edit.**
- `packages/report/src/template/sections/findings-delta.ts`: renders the delta.
  It reads `delta.rows`, `row.class`, `delta.counts`, `row.current` and
  `row.baseline`. It needs no change unless a new field is rendered; this plan
  doesn't render one.
- `packages/interface/src/pipeline/report-stage.ts:171-186`: calls
  `computeFindingsDelta`. No change needed.
- `docs/product/findings-delta-reaudit-design.md`: the design record. Its
  "Pass provenance caveat" (around lines 108-125) covers keys moving when
  normalization changes, but not when the site's page set changes. Add a
  paragraph.

### Excerpts

`packages/core/src/normalize/normalize.ts:521` and `:568-573`, showing why the
key follows the page set (read only):

```ts
    const scope = [...new Set(group.map((c) => canonicalPageUrl(c.pageUrl)))].sort().join(' ');
...
    const dedupeKey = computeDedupeKey(
      first.source,
      first.ruleId,
      scopeByCoarseKey.get(coarseKey) ?? '',
    );
    result.set(dedupeKey, combined);
```

`packages/core/src/delta/findings-delta.ts:19-22`, the finding shape the delta
receives:

```ts
export type DeltaFinding = Pick<
  Finding,
  'findingId' | 'ruleId' | 'category' | 'severity' | 'title' | 'pageUrls' | 'dedupeKey'
>;
```

`packages/core/src/delta/findings-delta.ts:41-51`, the row shape:

```ts
export interface FindingsDeltaRow {
  class: FindingsDeltaClass;
  dedupeKey: string;
  ruleId: string;
  category: Finding['category'];
  /** Scanner title from the re-audit, or from the baseline for a resolved
   *  finding. */
  title: string;
  baseline?: FindingsDeltaSide;
  current?: FindingsDeltaSide;
}
```

`packages/core/src/delta/findings-delta.ts:171-202`, the pairing to extend:

```ts
  const before = indexByKey(baseline, 'baseline');
  const after = indexByKey(current, 're-audit');
  const rows: FindingsDeltaRow[] = [];

  for (const [key, finding] of after) {
    const prior = before.get(key);
    const base = {
      dedupeKey: key,
      ruleId: finding.ruleId,
      category: finding.category,
      title: finding.title,
      current: side(finding),
    };
    if (prior === undefined) {
      rows.push({ class: 'new', ...base });
      continue;
    }
    const moved = prior.severity !== finding.severity && !changedSeveritySuppressed;
    rows.push({ class: moved ? 'changed-severity' : 'persistent', ...base, baseline: side(prior) });
  }
  for (const [key, prior] of before) {
    if (after.has(key)) continue;
    rows.push({
      class: 'resolved',
      ...
```

`packages/report/src/template/strings/fr.ts:593`, the client-facing note on
resolved findings:

```
"Un constat qui n'est plus détecté a le plus souvent été corrigé. Il peut aussi avoir disparu parce que la page concernée n'a pas été analysée lors de cet audit."
```

### Conventions

- `core` is pure, with no I/O. Exported functions have explicit return types.
- The module doc comment at the top of `findings-delta.ts` says: "Findings are
  paired on `dedupeKey` ... so a key present in both runs is the same rule on
  the same identity." Update it to describe both passes.
- Determinism matters. Sort candidates explicitly and never rely on `Map`
  insertion order for tie-breaking.
- The existing test builder gives every finding `ruleId: rule-${key}` and
  `title: Title ${key}`. New tests must set `ruleId` and `title` explicitly to
  create same-rule pairs, e.g. with
  `{ ...finding('a', 'serious', pages), ruleId: 'color-contrast', title: 'Contrast' }`.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Delta unit tests | `pnpm test packages/core/src/delta` | all pass |
| Report section tests | `pnpm test packages/report/src/template/sections/findings-delta.test.ts` | all pass |
| Format and gate | `pnpm run format && pnpm run check` | exit 0 |
| Unit suite | `pnpm test` | all pass apart from pre-existing fixture-freshness failures (confirm they also fail on `38a516f2`) |

## Scope

**In scope:**

- `packages/core/src/delta/findings-delta.ts`
- `packages/core/src/delta/findings-delta.test.ts`
- `packages/core/src/delta/findings-delta.normalize.test.ts` (create; see Step 3)
- `docs/product/findings-delta-reaudit-design.md` (one added paragraph)

**Out of scope** (do not touch):

- Anything under `packages/core/src/normalize/`. Editing it changes the
  normalization fingerprint and breaks fixture-freshness tests that can't be
  refreshed without real scan data.
- `packages/core/src/types/findings.ts` (protected contract) and how
  `dedupeKey` is computed.
- Report copy in `packages/report/src/template/strings/*`.
- The latent collision where two coarse groups that differ only by title or
  `coarseGroupIdentity` hash to the same merged key (`normalize.ts:568-573`).
  It can't happen today and needs a normalization change. It is recorded in
  Maintenance notes.

## Git workflow

- Branch: `advisor/054-delta-rescoped-pairing`.
- Commit message example:
  `Pair a re-audit finding whose page set changed with its baseline finding`.
- No `Co-Authored-By` or "Generated with" trailers.
- Do not push.

## Steps

### Step 1: Write failing tests for the rescoped case

In `findings-delta.test.ts`, add a `describe('rescoped findings', ...)` block
with these cases:

1. **Same rule and title on overlapping pages, different keys → one persistent row.**
   - Baseline: key `b1`, `ruleId: 'color-contrast'`, `title: 'Contrast'`,
     severity `serious`, pages `['https://hotel.fr/', 'https://hotel.fr/a']`.
   - Re-audit: key `c1`, same rule and title, severity `serious`, pages
     `['https://hotel.fr/', 'https://hotel.fr/a', 'https://hotel.fr/b']`.
   - Expect `counts` `{ new: 0, resolved: 0, persistent: 1, 'changed-severity': 0 }`.
   - Expect exactly one row, with `dedupeKey: 'c1'`, `baseline.findingId: 'f-b1'`,
     `baseline.pageCount: 2` and `current.pageCount: 3`.
2. **Severity moved on a rescoped pair → `changed-severity`** (when not
   suppressed).
3. **Severity moved but `changedSeveritySuppressed` → `persistent`.** Pass a
   different `findingsProvenance.normalizationFingerprint` via `overrides`.
4. **Same rule, different title → no pairing** (still one `new` plus one
   `resolved`).
5. **Same rule and title, disjoint pages → no pairing.**
6. **Deterministic greedy choice.** One baseline finding (pages `/`, `/a`,
   `/b`) and two re-audit findings of the same rule and title (pages `/`, `/a`
   and `/b`). It pairs with the re-audit finding with the larger overlap
   (`/`, `/a`), and the other stays `new`. Also run the test with the re-audit
   findings array reversed and assert the same result.
7. **Exact-key pairs take priority.** A finding already paired by
   `dedupeKey` is never reused by the second pass.

**Verify**: `pnpm test packages/core/src/delta` → the new cases 1, 2, 3, 6
and 7 **fail**; 4, 5 and all existing tests pass.

### Step 2: Implement the second pairing pass

In `computeFindingsDelta`:

1. Keep the exact-key loop, but collect the unpaired re-audit findings
   (`unpairedCurrent`) and unpaired baseline findings (`unpairedBaseline`)
   instead of pushing `new` and `resolved` rows straight away. Push the paired
   rows as today.
2. Add a pure helper
   `function pairRescopedFindings(unpairedBaseline: DeltaFinding[], unpairedCurrent: DeltaFinding[]): Array<[DeltaFinding, DeltaFinding]>`
   that:
   - builds every candidate pair with equal `ruleId`, equal `category`, equal
     `title`, and a page intersection (compare `pageUrls` as sets) of size at
     least 1;
   - sorts candidates by intersection size descending, then baseline
     `dedupeKey` ascending, then current `dedupeKey` ascending;
   - greedily accepts a candidate when neither side has been used yet;
   - returns the accepted pairs.
3. For each accepted pair, push a row exactly like an exact-key pair: `class`
   is `changed-severity` or `persistent` by the same `moved` rule,
   `dedupeKey` is the **current** finding's key, `ruleId`, `category` and
   `title` come from the current finding, and it carries both `baseline` and
   `current` sides.
4. Push `new` rows for the unused current findings and `resolved` rows for the
   unused baseline findings, in the existing row shapes.
5. Leave the final sort and the counts unchanged.
6. Update the module doc comment and the `FindingsDeltaRow` doc to say a
   persistent or changed-severity row can come from rule/title/page-overlap
   pairing, and that `dedupeKey` is then the re-audit's key. Explain why in
   two or three sentences: shared-scope merging hashes the page list, so a
   change in page scope moves the key without the site's defect changing.

**Verify**: `pnpm test packages/core/src/delta` → all pass.

### Step 3: Characterize with real normalization

Create `packages/core/src/delta/findings-delta.normalize.test.ts`. It uses
`normalizeAudit` and the builders from `../normalize/fixtures.js`
(`buildAxeResultsInput`, `buildAxeViolation`, `buildAxeNode`,
`buildNormalizePageInput`), following
`packages/core/src/normalize/normalize.test.ts:13-35` as the pattern.

- Baseline: two pages (`/`, `/a`), each with axe `color-contrast` on two
  selectors `#nav a` and `#footer a`. This produces one merged finding keyed
  on the page list.
- Re-audit: the same, plus a third page `/b` with the same two selectors.
- Map each `Finding` to a `DeltaFinding` (pick the seven fields), build the
  runs with the same provenance, and call `computeFindingsDelta`.
- First assert the precondition, that the two merged findings' `dedupeKey`
  values **differ**. If they are equal, STOP: the premise of this plan no
  longer holds.
- Then assert `counts.persistent === 1`, `counts.new === 0` and
  `counts.resolved === 0`.

**Verify**: `pnpm test packages/core/src/delta` → all pass, including the new
file.

### Step 4: Record the rule and run the gates

- In `docs/product/findings-delta-reaudit-design.md`, after the "Pass
  provenance caveat" paragraph, add a short paragraph headed
  **Rescoped findings (2026-09-17).** It should say:
  - shared-scope merged findings are keyed on their page list, so the key moves
    whenever the page set changes;
  - the delta therefore pairs leftover resolved and new findings of the same
    rule, category and title on overlapping pages, greedily by overlap, before
    classifying;
  - this can in rare cases merge a fixed defect and a new one of the same rule
    on the same pages. That was accepted because normalization already treats
    same-rule, same-scope selectors as one problem.
- Run `pnpm run format && pnpm run check` and
  `pnpm test packages/core packages/report/src/template/sections/findings-delta.test.ts`.

**Verify**: both exit 0.

## Test plan

- Step 1 adds 7 unit cases covering pairing, severity handling, non-pairing
  guards, determinism and exact-key priority.
- Step 3 adds 1 characterization test through real normalization that proves
  the production scenario.
- The existing report-section tests must pass unchanged.

## Done criteria

- [ ] `pnpm test packages/core/src/delta` passes with at least 8 new tests
- [ ] `pnpm test packages/report/src/template/sections/findings-delta.test.ts` passes
- [ ] `pnpm run check` exits 0
- [ ] `git diff --stat 38a516f2 -- packages/core/src/normalize packages/core/src/types` shows no changes
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` row 054 updated

## STOP conditions

- The Step 3 precondition fails: the two merged findings already share a key.
- Implementing this seems to need any change under `packages/core/src/normalize/`
  or to `Finding`'s type.
- The report section tests fail in a way that means the renderer depends on
  `row.dedupeKey` matching a baseline key (check with
  `grep -n "dedupeKey" packages/report/src/template/sections/findings-delta.ts`).
- The excerpts don't match the live code.

## Maintenance notes

- Latent normalization collision, deferred: in
  `normalize.ts` `aggregateSharedScopeOccurrences`, the merged key hashes only
  `source|ruleId|scope`, while grouping also uses `title` and
  `coarseGroupIdentity`. Two coarse groups that differ only by title or
  identity, each with two or more fine groups on identical pages, would
  collide, and the second would overwrite the first. That can't happen today
  (alt-text also sets `dedupeIdentity`). Any future rule that uses
  `coarseGroupIdentity` must fix it first, together with a fixture refresh on
  a machine that has real scan data.
- If milestone 13 (monitoring over many runs) is built, it needs this same
  rescoped identity. Extract `pairRescopedFindings` rather than re-deriving it.
- Reviewers should check that the greedy sort is fully deterministic and that
  a finding can appear in at most one row.
