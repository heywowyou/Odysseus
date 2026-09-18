# Plan 058 execution handoff (2026-09-18)

For the next Plan 058 executor. Read `plans/058-fail-closed-senior-report-quality-pipeline.md`
first — it is the contract. Its section 25 requirement-to-proof ledger and the
"Still required before `DONE`" list are the authoritative remaining-work list;
this file adds the live-run history, cost measurements, mechanics and hazards
that are not recoverable from the repo alone. `pnpm run plans:check` is green;
main is ahead of origin and **unpushed** (operator instruction: push only when
the plan closes or it blocks something).

## 0. One-paragraph state

The full fail-closed pipeline (snapshot → fact registry → dossier → senior
plan → dual writers → dual critics → adjudication → parity → render →
exact-PDF QA → dual+final visual review → arbiter → bundle → operator
approval → content-addressed promotion) is implemented and committed, dormant
behind Plan 059 evidence approval and a benchmark-manifest gate. The §23
closure ledger is written. Eight live pilot runs against one saved audit
drove eight contract fixes; the machinery now runs the whole content stage
reliably and stops, per contract, at a genuine content-quality decision
point. The bottleneck is no longer mechanical.

## 1. Live pilot history — provider-behavior facts you cannot get from tests

Saved audit: `artifacts/grandhotelchicago.paris/2026-09-17T14-28-58Z`
(auditId `4c8af554-db62-4989-8fc9-a6159aaf32f7`), legacy-adapter evidence.
Outcomes in `artifacts/report-quality-benchmark/pilot-N/` (gitignored).

| Attempt | Died at | Root cause → fix (commit) |
| --- | --- | --- |
| 1 | senior plan parse | model emitted explicit `null` for optional plan fields → `absentable()` normalization (`b7d08829`) |
| 2 | plan evidence binding | analyst invented a sha256-shaped evidence ref; no §9 repair existed → bounded plan re-plan (`60d3c02a`) |
| 3 | plan repair exhausted | analyst invented a *different* ref (a page URL) → payload now names the legal ref sets verbatim (`5ed4a117`) |
| 4 | writer binding gate | freehand scalar in prose; no writer repair → bounded writer re-issue (`5ed4a117`) |
| 5 | writer prose guard | scalar fixed on retry, then tripped the unstated performance-taxonomy rule → full prose ruleset in payload (`c534c444`) |
| 6 | writer prose guard | new class (`unsupported-business-causality`) — one rejection per retry was whack-a-mole → 3-attempt loop with cumulative rejection history (`c01491a6`) |
| 7 | **contract-correct stop** | 22 issues (20 accepted, 2 unsure on theme `priorityRank` sparsity) → rank formula fixed: dense 1..N, executive-first, dependencies-before-dependents (`f08215f7`) |
| 8 | **contract-correct stop** | 26 issues; adjudicator went **unsure on 18** → `needs-operator-review` / `content-review-unsure` (`61afd314` record) |

Cost so far: >$3, roughly 30 calls total, dominated by re-paying the
senior-analyst and writer stages on every attempt because §15 DAG resume is
not implemented. Attempt 7: 6 calls / 18 min. Attempt 8: 5 calls / 15 min.

## 2. The two decisions that gate ALL further live progress

1. **Unsure semantics order.** `cleanContentDraft` routes *unsure* to
   operator review *before* repairing *accepted* defects, so 18 unsure
   verdicts blocked repair of 6-20 accepted ones. §8 says material unsure →
   operator; §13 says accepted defects loop through repair. Either order is
   defensible; the current one makes live convergence nearly impossible
   because any unsure issue kills the run before the editor can fix anything
   else. Decide: repair-accepted-first-then-route-unsure, or keep as-is.
2. **Adjudicator decisiveness.** 18/26 unsure is an adjudicator-prompt/profile
   quality question (§6/§8). Options: sharpen the adjudicator role prompt,
   allow the adjudicator to downgrade minor unsure issues, or accept the
   runs as valid recorded benchmark outcomes. This is corpus/quality
   territory — the plan reserves it for evidence, i.e. your call.

Do not start more live runs before deciding these; every run will stop at
the same fence.

## 3. Cost levers (agreed direction with the operator — implement before corpus)

The operator balked at a projected few-hundred-dollar corpus cost and asked
for a cheaper path. These cut ~5-10× without weakening any gate; none are
implemented yet, each needs a focused test:

1. **One-engine model review + deterministic divergence diff.** §11.4's
   dual-renderer requirement is divergence *detection*; review one engine's
   rasters with the models and pixel-diff the other engine locally.
   Halves vision volume.
2. **Raise `VISUAL_REVIEW_PAGE_BATCH`** (currently 1, in
   `report-quality-pipeline.ts`) to ~4 with the coverage manifest proving
   full page/tile review (§11.5 allows batching). ~4× fewer vision calls.
3. **§15 DAG resume.** Content-addressed artifacts already exist
   (`putImmutableJson`); the pipeline always restarts. Reuse matching nodes
   so fix-rerun cycles only pay the failed stage. This is what makes the
   convergence loop affordable.
4. **Model-call budget ceiling** (proposed): runs transition to
   `needs-operator-review` (`budget-exceeded`) past a configured call budget.

Measured for pricing: text-stage calls (xhigh analyst, high writers/critics)
run ~$0.10-0.25 each; vision review never went live (blocked by the unsure
fence) and is the big unknown.

## 4. Remaining work, priority order

1. Decide §2's two questions; implement whichever the operator picks.
2. Implement §3 levers (tests for each: batching coverage manifest,
   divergence diff, DAG reuse, budget ceiling).
3. Re-run the pilot to `quality-approved` or a recorded terminal state —
   rendering, exact-PDF QA, visual review, parity and the arbiter have
   **never executed live**; expect one contract gap each.
4. Corpus benchmark (§19/§23): `odysseus benchmark report-quality run
   --manifest artifacts/report-quality-benchmark/corpus-manifest.json`.
   Only **6 of 14** saved audits load (5 recovered via offline
   `odysseus normalize`; 8 refused by the evidence gate — partial renders,
   sitemap failures). §19's floor is 12; Point France (mandatory) is among
   the refused. Operator must choose: dated amendment accepting 6, rescans,
   or accumulation.
5. On a recorded corpus run: write the committed benchmark artifact (digests
   and counts only, no client prose) and flip
   `REPORT_PROFILE_BENCHMARK_MANIFEST['058-saved-corpus-2026-09']` to
   `current` with `ranAt` + `artifactRef`.
6. OPEN ledger rows: §16 reference registry decision (currently pinned
   empty), §10 bounded layout variants + visual repair loop (currently
   fail-closed straight to operator), §20 dashboard conflict-guard test,
   replica-set run of the 3 gated activation tests, full PDF toolchain
   corpus pass.
7. Operator acceptance items (DoD 30/41): operator approves
   `qualityRunId + bundleDigest` after viewing both PDFs; Point France pair
   review. Never mark DONE without the `Closure evidence:` record being
   complete — `plans:check` enforces the shape, you must supply the truth.

## 5. Mechanics

- Pilot: `pnpm odysseus benchmark report-quality run --manifest
  artifacts/report-quality-benchmark/pilot-manifest.json --store-dir
  artifacts/report-quality-benchmark/pilot-store --out
  artifacts/report-quality-benchmark/pilot-N --concurrency 1` (background;
  pipe stderr to a file, not through `tail`, or you lose progress).
- Dry run (no models, no Mongo): same command + `--dry-run` — use it to
  check corpus/evidence state after any normalization change.
- Env needed for a live run (names only): `MONGODB_URI` (dev Atlas,
  database `odysseus-local`), `OPENAI_API_KEY`, `OPENAI_BASE_URL`;
  the Scaleway bucket vars are absent locally, hence `--store-dir`
  (`LocalDirArtifactStore`, committed `8864e271`).
- Toolchain present and verified: qpdf 11.9.0, mutool 1.23.10, poppler,
  Playwright chromium. `renormalizeAudit`/`odysseus normalize <dir>` is
  offline and free for stale saved audits.
- Focused suites: `pnpm vitest run --project unit
  packages/interface/src/pipeline/report-quality-pipeline.test.ts` (18) and
  the sibling report-quality-* tests; `packages/report/src/quality` (72);
  `packages/llm/src/report-model-profiles.test.ts` (10) +
  `report-quality-schema.test.ts` (3); store `report-quality.test.ts`
  (13 + 3 replica-set-gated). Store tests need `pnpm test:store:up` (docker,
  port 27018).

## 6. Hazards

- **A concurrent executor session is active on this working tree** (Plans
  059/060/063: scanner, queue, `audit-stage.ts`, `jobs*`, dashboard). It
  stashed in-flight files once and landed a store change that broke this
  suite's mock once. Rules: never `git stash/restore/checkout/clean/reset`;
  commit early and often in small scoped commits (`git add` explicit paths
  only); if files vanish, stop and tell the operator; expect transient
  typecheck failures in files you do not own.
- `tsc -b` covers test files with `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess` — indexed access needs guards; optional props
  reject explicit `undefined` assignments.
- `fallow` (audit:code) fails on unused exports — re-export only what tests
  import. `plans:check` fails if `ODYSSEUS_REPORT_QUALITY_MODEL`,
  `OPENAI_MODEL` or `gpt-5.4-mini` appear in
  `report-model-profiles.ts`/`report-quality-client.ts`/
  `report-quality-pipeline.ts`, or if the coverage test name or the
  `satisfies Record<ReportQualityRole, ReportModelProfile>` registry
  disappears.
- Never run repo-wide `pnpm run format`; prettier per changed file.
  Never print `.env` values. `pnpm run check` fails on the other session's
  in-flight files sometimes — verify the failing file is yours before
  fixing anything.
- Pipeline test mock seams live in the big `vi.mock` blocks at the top of
  `report-quality-pipeline.test.ts`; store-function stubs must be added
  there when the pipeline imports new store exports (happened twice).

## 7. Operator decisions owed (ask, do not assume)

1. §2's unsure-semantics order and adjudicator decisiveness.
2. Budget ceiling value for the pipeline and for a session.
3. Corpus scope amendment (6 vs 12) and Point France rescan authorization.
4. Whether to attempt cheaper per-role profiles via the §6.1 amendment path
   after the first quality-approved bundle exists.
5. Final: review the exact FR/EN PDFs and approve `qualityRunId +
   bundleDigest` (DoD 30) — the pipeline never does this itself.
