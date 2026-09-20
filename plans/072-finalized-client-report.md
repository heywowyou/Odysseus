# Plan 072 — Finalized client report

## Context

`.agents/skills/client-report-finalizer/SKILL.md` was rewritten (uncommitted) from a
QA pass that *reports* defects into a workflow that *delivers* the corrected PDF
itself. The rewrite is the workflow the operator wants, but it references a system
that does not exist: two scripts, a render-bundle route, an upload route, an
override-file format, and a stored finalized artifact. Today the finalization loop
ends at "fixed in source, pending deploy", and the client is sent a PDF the operator
patched by hand with no record of what changed.

The outcome: an operator-finalized PDF becomes a first-class stored report artifact.
It is rendered locally from the exact hosted inputs with current code plus a bound
override file, uploaded back to the dashboard, distinguished from the pipeline render
everywhere it is shown, and kept with its full working set in a local `reports/` tree.

Three findings from exploration shrink this a lot:

- **`POST /api/audits/:auditId/regenerate-report` already is the skill's `renormalize`.**
  [make-report-ready.ts](packages/interface/src/pipeline/make-report-ready.ts) refreshes
  stale findings, re-runs one writing pass and re-renders. No new route.
- **`listWritingProseFields`** ([prose-fields.ts](packages/llm/src/prose-fields.ts), landed
  today with Plan 070) is the exhaustive prose-field registry the override allowlist needs,
  so deterministic fields are unreachable by construction.
- **Applying an override is the same operation as the critic's targeted repair** — splice
  replacement texts by field path, re-sanitize, re-run the guard table. The difference is
  only where the text comes from. [writing-critic.ts](packages/llm/src/writing-critic.ts)
  already has that splice.

And the render itself is cheap to relocate: [generateReportPdf](packages/report/src/index.ts#L114)
reads nothing off disk. `auditDir` is a dead field and
[screenshots.ts](packages/report/src/screenshots.ts#L1-L16) deliberately stopped embedding
page images. A JSON bundle is sufficient — **slice 0 proves this before anything is built on it.**

## Decisions taken

- A finalized PDF **supersedes** the pipeline render for Preview/Download. The pipeline
  render stays stored and reachable behind its own link. A later regeneration supersedes
  the finalization, shown as a warning badge — visible, never silent.
- `reports/` holds the **full working set** per audit, so a finalization is resumable and
  auditable later.
- Finalization is **per language**. Finalizing FR leaves EN pipeline-generated.
- The run **includes the deploy** via `deploy/odysseus-deploy.sh`.

## Slices

Each slice is one commit on `main`, not pushed. Verification per slice: `pnpm run typecheck`
plus that slice's own tests.

### Slice 0 — spike: render a real hosted report from a JSON bundle

De-risk the one unproven assumption before building on it. Take a real audit from
`artifacts/` (39 hotel audits are on this machine), assemble the bundle object by hand,
render through `generateReportPdf` with no `auditDir`, and compare page count and extracted
text against the pipeline-rendered PDF for the same audit.

Throwaway script in the scratchpad. If the outputs diverge, stop and report — slices 1–6
all assume bundle-render fidelity.

### Slice 1 — `buildRenderBundle` + read-only route

Extract the assembly block in
[report-stage.ts](packages/interface/src/pipeline/report-stage.ts#L140-L200) — manualFields,
gradeOverride, obligationAssessment, preparation preview, delta, evidence diagnostics — into
`packages/interface/src/pipeline/build-render-bundle.ts`. Both `runReportStage` and the new
route call it, so the two can never drift.

Add `lineage`: auditId, language, analysisId, `findingsProvenance`, `rendererBuild`
(`readOdysseusBuildId()`), `REPORT_TEMPLATE_VERSION`, and a bundle digest.

`GET /api/audits/:auditId/render-bundle/:language` in
[routes/audits.ts](packages/interface/src/routes/audits.ts), beside the existing
`report/:language/preview` handler and reusing its 400/404/409 shape.

Tests: the route's bundle renders byte-comparable to what the report stage renders; language
validation; missing audit; no selected analysis.

### Slice 2 — override file, bound to lineage

`packages/llm/src/writing-overrides.ts`. Format is the one SKILL.md already specifies
(`auditId`, `language`, `analysisDigest`, `findingsDigest`, `overrides[{path, from, to, reason}]`).

Rules, each its own test:
- digest mismatch against `lineage.json` → refuse;
- a `path` not returned by `listWritingProseFields` → refuse (this is what makes finding ids,
  ranking, counts and severities unreachable);
- `from` not matching the current text exactly → refuse as stale;
- after splicing: `sanitizeWritingOutput`, then `buildWritingGuards`/`runWritingGuards`
  ([writing-guards.ts](packages/llm/src/writing-guards.ts)). A blocking failure, or a style
  failure the original did not already have, refuses the render — the same rule the critic
  repair uses.

Extract the splice helper out of `writing-critic.ts` so override-apply and critic-repair share
one implementation rather than two that drift.

### Slice 3 — `odysseus report:finalize` CLI

`packages/cli/src/commands/finalize-report.ts`, registered in
[cli/src/index.ts](packages/cli/src/index.ts); root script `report:finalize-render`.

```
pnpm report:finalize-render -- --bundle <dir> --overrides <file> --out <pdf>
```

Loads the bundle, applies overrides, renders via `generateReportPdf`, writes the PDF.
No Mongo connection and no provider client — asserted by a test, and `pnpm run architecture:check`
(dependency-cruiser) keeps the import graph honest.

### Slice 4 — local `reports/` tree

`getReportsRoot()` in [scanner/src/config.ts](packages/scanner/src/config.ts) mirroring
`getArtifactsRoot()` (env `ODYSSEUS_REPORTS_ROOT`, default `<workspace>/reports`).

```
reports/<hostname>/<audit-started-at>/
  lineage-fr.json
  bundle-fr/{manifest,findings,analysis,…}.json
  fr-hosted.pdf        ← baseline as currently delivered
  overrides-fr.json
  fr-final.pdf         ← what gets uploaded
```

Client data: files written `0600`, matching
[fetch-client-report.mjs](scripts/fetch-client-report.mjs). `reports/` and `*.pdf` are already
in `.gitignore` — verify, do not re-add.

### Slice 5 — upload, storage, supersession

`POST /api/audits/:auditId/report/:language/finalized`, **JSON body with the PDF base64-encoded**,
not multipart: [router.ts](packages/interface/src/router.ts#L35-L40) requires an exact
`application/json` content type on state-changing routes as its CSRF guard, and that guard stays intact.

- 409 when the posted lineage no longer matches the audit's current selected analysis and
  `findingsProvenance`.
- Writes `reports/<ts>-final-<lang>.pdf` into the audit dir, syncs to the artifact store via
  the existing `syncAuditDirToBucket` path.
- Inserts a `reports` row through [persistReport](packages/store/src/persist-report.ts) — the
  collection is insert-only by design, so this needs no migration — with two new fields on
  [report.schema.ts](packages/store/src/schemas/report.schema.ts):
  `origin: 'pipeline' | 'finalized'` (optional, absent on every legacy row and read as
  `'pipeline'`) and `finalization: { overridesDigest, overrideCount, uploadedAt, renderedBuild }`.

Supersession needs no route change: `getLatestReport` sorts by `generatedAt`, so the finalized
row becomes what preview and download serve. A later regeneration inserts a newer pipeline row
that takes over — correct, because the overrides no longer apply to it.

Add `GET /api/audits/:auditId/report/:language/generated` to keep the superseded pipeline render
reachable.

Store tests need `pnpm test:store:up` (Docker Mongo is currently down; that is why 7 tests skip today).

### Slice 6 — dashboard distinction

`origin` and `finalization` onto `ReportStatusResponse` in
[audit-detail-types.ts](packages/interface/src/dashboard/routes/audit-detail-types.ts#L120),
populated in `audit-detail-model.ts`, rendered as badges in
[audit-reports-section.tsx](packages/interface/src/dashboard/routes/audit-reports-section.tsx#L256-L300)
beside the existing freshness / older-template / page-count badges.

```
Rapport  FR  [À jour] [Finalisé · 6 corrections · 20/09 18:12]
             Aperçu   Télécharger   Voir l'original généré

after a later regeneration:
Rapport  FR  [À jour] [Finalisation remplacée par une régénération]
             Aperçu   Télécharger   Voir le PDF finalisé
```

Strings in [i18n/sections/audit-detail.ts](packages/interface/src/dashboard/i18n/sections/audit-detail.ts)
written natively in French, following the existing advisory-badge vocabulary (`À jour`,
`Modèle de rapport antérieur`). Tests in the existing `audit-detail-render.test.ts` /
`audit-report-panel-model.test.ts` style.

### Slice 7 — scripts, skill, docs

- Extend `fetch-client-report.mjs` to pull `bundle-<lang>/` and `lineage-<lang>.json` into the
  `reports/` tree, printing each file's SHA-256 as it already does for the PDFs.
- New `scripts/upload-finalized-report.mjs`, same session-cookie login/logout shape.
- Rewrite SKILL.md's **Tooling** section against the real system: `regenerate-report` is the
  renormalize path; the render command; the upload script. Keep the `.claude/settings.json`
  allowlist entries, which are already staged in the working tree.
- New trade-off entry in `docs/decisions/trade-offs.md`: the finalized PDF is the delivered
  artifact while the stored analysis keeps the pre-override text; the override file plus the
  lineage digests are the provenance link, and the render fails closed when they go stale.
  This is the CLAUDE.md provenance guardrail, so it gets a recorded decision, not skill prose.
- `docs/rules/llm-layer-rules.md`: operator overrides are operator-authored prose, not model
  output, and the writing guards still apply to them.
- `plans/README.md`: a row for 072 with its closure ledger.

### Slice 8 — verify and deploy

`pnpm run check`, `pnpm test`, `pnpm test:e2e`, `pnpm run test:deploy`, then
`deploy/odysseus-deploy.sh`. Push before deploying so the deployed build id matches a commit.

## Verification

- **Slice 0 gate:** a real hosted report re-renders from JSON alone with matching page count
  and text. Everything downstream depends on this.
- **End to end on a real audit:** fetch the bundle for one of the local hotel audits → write a
  small override file → `report:finalize-render` → read the PDF front to back → upload → confirm
  the dashboard row shows `Finalisé` and Preview serves the finalized bytes → regenerate → confirm
  the supersession badge appears and Preview flips back.
- **Refusal paths, each a test:** stale digest, non-prose field path, stale `from` text, guard
  failure, lineage 409 on upload.
- **No new live scan** at any point; no provider call outside the existing writing pass.

## Out of scope

- Changing what `regenerate-report` does.
- The `report-approvals` / immutable-bundle promotion flow — a finalized report is an ordinary
  `reports` row, and approval keeps working on whatever row is current.
- Any change to how reports are written by the pipeline itself.

## Closure ledger

Executed 2026-09-20, one commit per slice on `main`.

| Slice | Outcome | Commit |
| --- | --- | --- |
| 0 | Bundle-render fidelity proved on a saved hotel audit: identical page count and `pdftotext` output against the pipeline PDF. Throwaway script, not committed. | — |
| 1 | `buildRenderBundle`/`parseRenderBundle` live in `packages/report` rather than `interface`, so the CLI parses a bundle without loading `store`. The Mongo-reading half stayed as `resolveRenderInputs`, called by both the report stage and the route. | `e5e5bce9` |
| 2 | Splice helpers extracted to `writing-field-paths.ts`; `writing-overrides.ts` applies a lineage-bound override file. Two departures from the plan, both deliberate: sanitation rewriting an overridden field refuses, and a guard the generated prose already failed warns instead of refusing. | `7d046a6e`, `80514487` |
| 2b | `finalize-bundle.ts` rebuilds a `WritingInput` from the bundle with no bundle change - stored themes already carry every structure field, and `themeKey` re-derives as `t${i+1}`. Fallback-gate analyses and themes carrying a category no structure pass produces are refused by name. | `abf8f2ea` |
| 3+4 | `odysseus report:finalize`, root script `report:finalize-render`, `getReportsRoot()`, and `reports/` bundle read/write at `0600`. A dependency-cruiser `reachable` rule keeps `store`, `interface` and mongoose off the command's import graph. | `cad79a51` |
| 5 | `origin` and `finalization` on the reports schema, the upload route, and `GET …/report/:language/generated`. Supersession needed no route change: `getLatestReport` already sorts by `generatedAt`. | `c0425a57` |
| 6 | `Finalisé · N corrections` / `Finalisation remplacée par une régénération` badges and the generated-report link, French first. | `0d48f210` |
| 7 | Bundle fetch, the render sidecar carrying the measured page count, the upload script, SKILL.md's Tooling section rewritten against the shipped system, trade-off 41 and llm-layer-rules section 16. | `603f8ae7`, this commit |

Proved end to end on the de-identified fixture audit: bundle → one-field
override → `report:finalize-render` → 36 pages, the operator's sentence present
and the generated one absent in `pdftotext`, with no database connection and no
provider call. Refusal paths (stale digest, non-prose path, stale `from`,
sanitation rewrite, introduced guard failure, lineage 409) each have a test.

Departures from the plan as written, all recorded above: the render bundle
contract lives in `report` rather than `interface`; `report:finalize-render`
takes its flags without a leading `--`, which Commander reads as the end of
option parsing; the upload script takes the final PDF alone and reads its
lineage from the sidecar rather than taking the bundle, PDF and lineage as
three arguments.
