# pnpm 12 bump and two-document lockfile: verification before commit

Date: 2026-09-09. Base commit: `71da99a1da12b7d03adec8ac4a4c84fb08c3ce45`.
Method and steps: GitHub issue #156 (advisor plan 026). All commands ran in a
throwaway clone at `/tmp/odysseus-pnpm12-check`; the operator's tree was never
installed into and no tracked file was touched.

Files copied into the clone over the committed `71da99a` state, exactly as
they stood in `/home/heywow/code/odysseus` at verification time:

- `package.json` (carries the uncommitted `"packageManager":
  "pnpm@12.3.4+sha512.961aa41fb077da3a04a441d9f8e15ebc0c96da8ef710b2eb67bf9ee7cb0610eabd48f1fd85f51cffe73846785fa0f87c56a3a872a1d893f8446741b5cce45457"`
  at line 10; the suffix is an integrity hash, not a secret)
- `pnpm-lock.yaml` (6803 lines, two YAML documents, uncommitted)

Drift check at start: `git status --short -- package.json pnpm-lock.yaml`
showed both modified; `git diff --stat 71da99a..HEAD -- package.json
pnpm-lock.yaml` was empty; HEAD was `71da99a`.

## Summary

Every deterministic check the plan hunts with held: pnpm 12.3.4 read the
two-document lockfile, installed twice under `--frozen-lockfile` without
changing one byte of it, the security overrides in document 2 are safe
(neither pinned package occurs anywhere in the installed tree), and the
clone typechecks. `pnpm test` needed four attempts to hold: three full-suite
runs under this machine's heavy parallel load (six agents working in the
operator's tree at the same time) each exited 1 on a different roaming set
of timing-sensitive tests, and a fourth run on the same clone once the
machine was idle passed all 3943 tests. The failing tests share tight
5 to 20 second budgets, each passes in isolation, and the same flakiness
class reproduces in the operator's tree; no failure was traced to the pnpm
12 bump or to the lockfile layout. With the quiet-machine run in evidence,
every verify in Steps 2 to 5 has held, so the verdict is GO.

## Step 2 to 5 results

Environment: `pnpm --version` printed `12.3.4`, `node --version` printed
`v22.23.2`, corepack on PATH.

| Step | Command (in `/tmp/odysseus-pnpm12-check`) | Key output | Result |
| --- | --- | --- | --- |
| 1 | `git status --short` (clone) | exactly ` M package.json` and ` M pnpm-lock.yaml`; `grep -n "pnpm@12.3.4" package.json` matched line 10 | PASS |
| 2 | `pnpm --version` | `12.3.4` | PASS |
| 2 | `grep -c "^---$" pnpm-lock.yaml` | `2` (document start at line 1, separator at line 101) | PASS |
| 2 | `sha256sum pnpm-lock.yaml` | `14d5c5ec7e559b779c810608aca2ce837e977ebd69274590ebd9d8e54b9d96b0` | recorded |
| 3 | `pnpm install --frozen-lockfile` (cold) | exit 0; `Packages: +517`, `reused 517, downloaded 0, added 517`; `Done in 24s using pnpm v12.3.4`; `Lockfile passes supply-chain policies (655 entries in 22.2s)` | PASS |
| 3 | `pnpm install --frozen-lockfile` (warm) | exit 0; `Done in 229ms using pnpm v12.3.4` | PASS |
| 3 | `sha256sum pnpm-lock.yaml` after each install | identical to the before hash (triple below) | PASS |
| 4 | `pnpm why nth-check` | no output: no dependency chain resolves nth-check | see note A |
| 4 | `pnpm why validator` | no output: no dependency chain resolves validator | see note A |
| 4 | `pnpm -r ls nth-check validator --depth 10` | exit 0, no matches across all 10 workspace projects | see note A |
| 4 | `find node_modules -name package.json -path "*nth-check*"` and directory sweep of `node_modules/.pnpm` (519 entries) | zero occurrences of nth-check or validator anywhere in the installed tree | see note A |
| 5 | `pnpm run typecheck` | exit 0 (`tsc -b --pretty && tsc -p packages/interface/tsconfig.dashboard.json --noEmit`) | PASS |
| 5 | `pnpm test` (full unit project, attempt 1, machine under heavy parallel load) | exit 1: `2 failed | 3941 passed (3943)`; failures: `lighthouse-isolated.test.ts` (Test timed out in 20000ms) and `reconcile-jobs.test.ts` (Test timed out in 5000ms) | FAIL |
| 5 | `pnpm test` (attempt 2, same load) | exit 1: `3 failed | 3940 passed (3943)`; same two failures plus `outreach-campaign-aggregate.test.ts` (timed out in 5000ms) | FAIL |
| 5 | `pnpm test` (attempt 3, same load) | exit 1: `1 failed | 3942 passed (3943)`; failure: `prescans.test.ts` (Test timed out in 5000ms); the lighthouse test passed this time | FAIL |
| 5 | `pnpm test` (attempt 4, same clone, machine idle) | exit 0: `355 passed (355)`, `3943 passed (3943)`, duration 110.44s | PASS |
| 5 | lighthouse test alone in the clone, warm: `pnpm exec vitest run --project unit packages/scanner/src/lighthouse-isolated.test.ts` | exit 0: `3 passed (3)`, the fork test in 7040ms | PASS |

Note A (overrides): the packages the overrides pin do not occur in this
repository's dependency graph at all, so no version can sit below either
floor and the plan's STOP condition (an override resolving below its floor
anywhere in the clone's `node_modules`) did not fire. The overrides exist
only as lockfile entries, quoted verbatim from document 2, lines 108 to 110:

```yaml
overrides:
  nth-check@<2.0.1: '>=2.0.1'
  validator@<13.15.22: '>=13.15.22'
```

Document 2 parsing is still proven: under `--frozen-lockfile` pnpm must
satisfy the importers' devDependencies and the packages sections, which all
live in document 2 (document 1 holds only the vendored `pnpm` /
`@pnpm/exe` platform entries and `packageManagerDependencies`). Both frozen
installs exited 0, and both runs printed `Lockfile is up to date, resolution
step is skipped`. Had pnpm ignored document 2, the frozen install could not
have completed against this file.

## Lockfile hash triple (Step 3)

| Point in time | sha256 of `pnpm-lock.yaml` |
| --- | --- |
| Before installs | `14d5c5ec7e559b779c810608aca2ce837e977ebd69274590ebd9d8e54b9d96b0` |
| After cold install | `14d5c5ec7e559b779c810608aca2ce837e977ebd69274590ebd9d8e54b9d96b0` |
| After warm install | `14d5c5ec7e559b779c810608aca2ce837e977ebd69274590ebd9d8e54b9d96b0` |

Identical: pnpm 12.3.4 read the two-document lockfile twice without
rewriting it.

## Install warnings worth quoting

No ignored-build-script warnings appeared. The only warnings, on the cold
install, were slow registry timing warnings, seven in total, for example:

```
[WARN] Request took 15491ms: https://registry.npmjs.org/@typescript-eslint%2Feslint-plugin
```

The others were the same shape for `@typescript-eslint` scope-manager,
typescript-estree, visitor-keys, parser, types, and `playwright`. They are
network latency noise, not install defects. The cold install was fast
because packages were hard linked from the local content-addressable store
(`store/v11`, 517 reused, 0 downloaded); a genuinely empty store would take
longer.

## Characterizing the loaded-machine `pnpm test` failures (why they are not a bump defect)

- The failing sets roam: no single test failed in all three full-suite
  attempts. The candidates are the mongo-dependent store suites
  (`describe.skipIf(!mongoAvailable)` in `reconcile-jobs.test.ts:124`,
  `outreach-campaign-aggregate.test.ts:24`, `prescans.test.ts:182`) and the
  lighthouse fork test. The plan expected the store suites to skip; they ran
  because two docker mongo containers are up on this machine
  (`odysseus-mongo` on port 27017, `odysseus-mongo-test-1` on 27018),
  shared with whatever else runs in parallel, and their 5000ms budgets are
  tight under load.
- The lighthouse test is budget-marginal by construction: the worker's own
  budget (`timeoutMs` 5000 plus `WORKER_GRACE_MS` 15000, see
  `packages/scanner/src/lighthouse-isolated.ts:30,120`) exactly equals the
  vitest 20000ms test timeout, so any child boot slower than about 20
  seconds reads as a vitest timeout instead of the designed rejection. In
  the clone it failed in both full runs and one two-file run, then passed
  alone while warm (7040ms).
- A standalone fork probe (replicating the parent's `fork` with a 90 second
  budget, script kept in `/tmp`, nothing written to either tree) showed the
  child's latency is a cold-start effect, not a tree difference: first run
  34.6s in the clone and 18.3s in the operator's tree (both would exceed the
  20s budget), warm run 6.1s in the clone and 5.1s in the operator's tree
  (both comfortably inside it). The dependency versions are identical in
  both trees (`lighthouse@13.4.1`, `tsx@4.23.1` in `node_modules/.pnpm`).
- The operator's tree is not a clean baseline today: its `node_modules` was
  installed by pnpm 11.22.0 (`node_modules/.modules.yaml`), and parallel
  agents have uncommitted work in exactly these packages (the full-suite
  test count differs: 3955 there versus 3943 in the clone pinned to
  `71da99a`). Its own full `pnpm test` run during this verification also
  exited 1, failing `packages/interface/src/pipeline/audit-stage.test.ts`
  twice, a file that is currently modified mid-edit, while the lighthouse
  test passed there. So the STOP condition "fails in the clone while passing
  in the operator's tree" is not literally met: neither tree's full suite
  exits 0 under today's machine load. What the comparison does show is that
  the failure class (tight-timeout tests roaming under load) exists in both
  trees and is not specific to the pnpm 12 install.

## Consumer consistency (read, never edited)

All consumers derive the toolchain from the `packageManager` field, so the
bump is consistent across them:

- `.github/workflows/ci.yml:20`: `pnpm/action-setup@v4` with no explicit
  version, so the action reads `packageManager`; Node 22 at
  `.github/workflows/ci.yml:22-24`; `pnpm install --frozen-lockfile` at
  `.github/workflows/ci.yml:28`; `MONGODB_TEST_URI` provided at
  `.github/workflows/ci.yml:64` (this moved from line 61 since the plan was
  written); the workflow gates on `test:all`.
- `Dockerfile:26`: `RUN corepack enable && pnpm install --frozen-lockfile`
  (corepack reads `packageManager`); `Dockerfile:13` copies
  `pnpm-lock.yaml` into the deps stage.
- `.npmrc`: `engine-strict=true`. `.nvmrc`: `22`.

Local machine during verification: pnpm 12.3.4 and node v22.23.2 both
runnable, so the NO-GO-PENDING path (toolchain not runnable) does not apply.

## Coverage gaps

- `pnpm run test:e2e` and `pnpm run test:all` were not run (e2e needs
  Chromium and the fixture servers; the plan prescribes the unit project
  plus typecheck as the smoke). e2e was not run.
- The clone's `pnpm test` needed four attempts: three under parallel load
  failed on roaming timeouts, the fourth, run on the same clone with the
  machine idle, passed all 3943 tests. A run with the store suites actually
  skipping (docker mongo down) was not achieved; they ran and passed in
  attempt 4.

## Verdict

GO

The bump is fit to commit. The three loaded-machine failures are documented
above for the record; the quiet-machine full-suite pass on the identical
clone, together with the untouched lockfile hash triple and the override
audit, is the basis for the verdict.
