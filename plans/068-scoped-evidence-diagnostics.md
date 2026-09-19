# Plan 068: Scoped evidence diagnostics without global approval

> **Executor instructions:** implement this plan against the latest `main` after
> Plan 067. The Plan 067 dependency was operator-confirmed complete, pushed and
> deployed on 2026-09-19. Rebaseline once more immediately before implementation
> if `main` has moved. Do not revive Plan 058 or create a replacement approval
> workflow.

## Status

- Priority: P1
- Effort: M
- Depends on: 067
- Execution status: IN PROGRESS (2026-09-19) — implementation and focused proof fixtures are on `main`; repository-wide command execution and the saved-artifact Villas Foch acceptance are blocked by the same environment limitations recorded by Plan 067.
- Plan 067 dependency: operator-confirmed complete/pushed/deployed 2026-09-19
- Execution rebaseline: `b5bec99fa63532e7588c1b9091790058e80a4b08`

## Post-067 rebaseline

The completed Plan 067 tree gives Plan 068 concrete integration seams:

- `packages/interface/src/pipeline/analysis-stage.ts` is the normal grounded-writer
  boundary. It now builds the deterministic `WritingSummaryEvidence` packet and the
  reconciled performance/remediation evidence before the single Luna writing call.
- `packages/report/src/template/sections/writing-evidence.ts` owns the deterministic
  performance reconciliation and trusted remediation builders. Evidence-quality
  limitations must compose with these builders rather than bypass them.
- `packages/llm/src/writing-schema.ts` already has
  `WritingSummaryEvidence.limitations: string[]`; Plan 068 should populate it from the
  deterministic diagnostics projection rather than adding another model-facing contract.
- `packages/interface/src/pipeline/report-stage.ts` is the normal PDF boundary. The
  report package already accepts `qualityLimitations?: EvidenceLimitation[]`, but the
  normal post-067 report stage does not currently supply it.
- `packages/interface/src/pipeline/generate-english-version.ts` reuses
  `runAnalysisStage` and `runReportStage` against the selected French structure, so one
  shared diagnostics reader can keep French and on-demand English on the same limitation
  set with no extra provider call.
- Plan 059's approval-centric seams remain in the full-audit evidence graph,
  audit-detail evidence summary and operator-readiness projection. Those are the seams
  this plan simplifies; the crawler/normalizer itself remains out of scope.

This rebaseline confirms that Plan 068 does not need to redesign Plan 067. It needs to
feed one deterministic limitation projection into seams that 067 already created.

## Objective

Keep the useful Plan 059 evidence graph and scan-quality diagnostics, but stop
treating them as a global certification gate for the normal report path.

> **Evidence problems narrow the claims they affect; they do not invalidate an
> otherwise usable audit.**

The normal post-067 report path must not require `ApprovedAuditEvidence` or an
evidence-approval action. Missing checks, incomplete coverage, unstable
measurements and temporal drift become scoped limitations. Operational scanner
warnings remain operator diagnostics. Normalized findings remain the
deterministic finding authority.

## Binding decisions

1. Plan 067 French report generation never depends on a Plan 059 approval.
2. Keep the evidence graph, attempt ledger, inventory, readiness, frame,
   performance, temporal, observation, pattern and re-audit coverage data.
3. Do not create a second finding authority or silently filter normalized
   findings based on the newer approval vocabulary.
4. Client-relevant evidence gaps become deterministic `EvidenceLimitation`
   records and are passed to both the Plan 067 grounded summary input and the
   existing report methodology rendering.
5. Operational/environment warnings are not client-report blockers.
6. Missing or unreadable evidence diagnostics means “diagnostics unavailable”,
   not “audit invalid”; pre-059 audits stay usable.
7. No evidence approve/reapprove workflow exists in the normal product.
8. Plan 058 approval types/loaders may remain as isolated dormant compatibility
   code, but no normal scan, report or dashboard path may depend on them.
9. Historical Plan 059 assessments must be understood without rescanning.
10. Plan 068 adds zero LLM calls and must preserve Plan 067's provider-call
    budgets.

## Target diagnostic projection

Derive one non-persisted projection from the evidence artifacts that already
exist:

```ts
interface AuditEvidenceDiagnostics {
  status: 'complete' | 'limited' | 'unavailable';
  clientLimitations: EvidenceLimitation[];
  operationalWarnings: { code: string; referenceCount: number }[];
}
```

There is one exhaustive classification table for every currently emitted
evidence-quality reason code.

Client limitations include incomplete scope/inventory, unavailable material
checks, unstable results, unavailable site-level checks, insufficient
performance evidence, material temporal drift, opaque capability gaps and
similar conditions that affect what the audit can claim.

Operational warnings include deployment/environment diagnostics that do not
change the truth of the normalized findings.

Evidence-graph/root problems that make the diagnostic layer itself unreliable
project to `unavailable`; the normal report remains governed by its own
manifest/findings provenance and schema checks.

## Dashboard target

Replace the approval-centric evidence card with a simple scan-data-quality
summary.

French direction:

- heading: **Qualité des données du scan**
- description: **Ce que le scan a pu vérifier et les limites à connaître.**
- statuses: **Complet**, **Exploitable avec limites**, **Diagnostic détaillé indisponible**
- section: **Limites à connaître**

Remove the normal-product approval badge, “not approved”, “evidence not
approvable”, “blocking reasons”, the `evidence-approved` stage and the claim
that the client report path refuses an unapproved audit.

The current stage checklist may be removed from the primary card or moved into
technical details. If retained, its states are local
`complete | partial | unavailable`; one local gap must not mark unrelated
stages blocked.

Do not hardcode performance as partial merely because an unfinished calibration
project exists; use the actual post-067 deterministic performance state.

## Villas Foch expected result

The existing stored Foch audit must work without a rescan.

Its observed issues should project as:

- browser/environment isolation concern -> operational warning only;
- unavailable site-level checks -> client limitation;
- unresolved material check -> client limitation;
- temporal drift -> client limitation.

The normal UI therefore shows **Exploitable avec limites**, while preserving
the 32 visited pages and 61 normalized findings. There is no evidence approval
requirement.

## Implementation steps

### 0. Rebaseline the execution checkout

Plan 067 is complete and the first post-067 rebaseline is recorded above. At execution time, pull latest `main`, confirm these same seams still exist, and update only the named file locations if newer commits moved them. Do not reopen Plan 067 design decisions.

### 1. Replace the normal evidence-quality summary with diagnostics

Refactor the current evidence-quality reader/projection so the normal product
returns `complete | limited | unavailable`, client limitation codes/counts
and optional operational-warning codes/counts.

It must not read approval state to determine normal-product usability.

### 2. Centralize issue classification

Add one exhaustive mapping over every `EvidenceQualityReasonCode`.

For client-relevant codes, own bounded FR/EN limitation copy in one canonical
place. Reuse existing disclosures when present and provide compatibility copy
for historical blocking issues that had no disclosure.

### 3. Remove approval work from the normal full-scan path

Continue building/persisting the evidence graph and re-audit coverage data.
Remove approval-specific read-back/write/delete work from the normal scan path.
Do not change crawl behavior.

### 4. Feed limitations into completed Plan 067

At the completed Plan 067 seams, derive diagnostics once per audit and thread the same
client limitations through:

- `analysis-stage.ts` -> `WritingSummaryEvidence.limitations` before `buildWritingInput`;
- `writing-evidence.ts` performance reconciliation where a performance limitation makes a metric unavailable/unstable;
- `report-stage.ts` -> `generateReportPdf({ qualityLimitations })` for the deterministic Methodology section;
- `generate-english-version.ts` through those same shared stage functions, without a separate English interpretation.

No extra model call.

### 5. Simplify the audit-detail API/UI

Update response types, runtime schemas, evidence-quality model/card and FR/EN
copy. Remove normal approval fields and approval/blocking wording.

### 6. Replace approval-centric operator readiness

Update the operator evidence-readiness contract and copy to availability
semantics:

```text
unavailable
legacy-unknown
building
limited
complete
superseded
```

A limited audit is not “needs attention” by default.

### 7. Isolate dormant Plan 058

Search all remaining `ApprovedAuditEvidence` and approval-mode consumers.
Every remaining use must be scanner historical/internal compatibility or
explicit dormant Plan 058 code. Normal report generation and normal dashboard
surfaces must have no dependency on it.

### 8. Update canonical docs

Update the trade-offs, LLM-layer rules, relevant dashboard/product docs and
deployment documentation so the distinction between report limitations and
operational scanner diagnostics is explicit. Keep archived Plan 059 as history;
do not rewrite it.

## Focused tests

Tests must prove:

- Foch-shaped old assessment -> `limited`, not unusable;
- environment warning alone creates no client limitation and cannot disable
  report generation;
- one unavailable site-level check still permits a report with a limitation;
- one failed page/material check still permits a report with a limitation;
- temporal drift still permits a report with a limitation;
- unavailable/unstable performance evidence cannot become a measured priority;
- pre-059/no-assessment audit -> diagnostics unavailable, report remains usable;
- old assessment with no disclosure maps without rewriting the artifact;
- stale/missing approval artifact has no effect on normal reports;
- normalized findings are unchanged by diagnostics;
- existing manifest/findings provenance failures still behave exactly as Plan
  067 specifies;
- no normal audit-detail copy refers to approval/non-approval;
- Plan 067 exact provider-call-count tests remain green.

## Acceptance

Regenerate the French Villas Foch report from its existing stored audit.

**Do not rescan.**

Acceptance requires:

1. scan data shown as usable with limitations;
2. 32 pages / 61 findings still represented truthfully;
3. operational environment warning separated from client limitations;
4. unavailable checks and temporal drift explained plainly;
5. French report generation succeeds without evidence approval;
6. deterministic methodology and grounded summary use the same limitations;
7. Plan 067 call budget is unchanged.

## Out of scope

- crawler scheduling/retry/depth changes;
- the separate crawl-trap question;
- deployment isolation work;
- network-policy weakening;
- normalization/severity redesign;
- a second per-finding confidence model;
- Plan 058 revival;
- visual report redesign;
- new LLM reviewer calls;
- rescanning old audits.

## Definition of done

Plan 068 is complete when the normal product uses evidence diagnostics rather
than evidence approval, local limitations no longer invalidate whole audits,
operational warnings are separated, old audits remain usable without rescans,
Plan 067 consumes deterministic limitations without extra calls, all approval
semantics are isolated to dormant compatibility code, focused tests and the
full repository validation are green, and the stored Foch acceptance succeeds.

## Requirement-to-proof closure ledger

| Requirement | Owner | Focused proof |
| --- | --- | --- |
| no normal approval gate | post-067 report orchestration | missing/stale approval still generates French |
| diagnostic projection | evidence-quality reader | complete/limited/unavailable fixtures |
| exhaustive reason mapping | one reason registry | exhaustiveness test |
| client limitations | diagnostics + report methodology | each client code maps to bounded limitation copy |
| operational separation | same registry | environment warning produces no client limitation |
| no shadow findings | report findings path | diagnostics leave normalized findings unchanged |
| performance scoping | 067 performance evidence | unavailable metric cannot be recommended as measured problem |
| historical compatibility | diagnostics reader | old assessment maps without rewrite/rescan |
| no approval artifact work | full-audit stage | no normal approval read-back/write edge |
| dashboard simplification | API/model/card/i18n | no normal approval fields/copy |
| operator readiness | operator contract/readiness | limited stays limited, not absent/attention |
| dormant 058 isolation | repo call graph | remaining approval consumers are 058/internal only |
| 067 cost unchanged | LLM tests | exact call-count tests unchanged |
| Foch acceptance | stored Foch audit | dated no-rescan acceptance record |

### Closure evidence

Execution rebaselined against `b5bec99fa63532e7588c1b9091790058e80a4b08`;
`main` had not moved when the implementation chain was fast-forwarded.

Implementation landed in four slices:

- `2a461eb4` — deterministic diagnostics registry/reader, Plan-067 summary and
  methodology plumbing, performance scoping, and removal of approval-artifact
  work from the normal full-scan stage;
- `886258b6` — audit-detail API/runtime schema/card and operator readiness
  moved to availability semantics;
- `2ab02f03` — the dormant Plan-058 quality-bundle widget was removed from
  the normal Reports card, leaving approval consumers isolated to the frozen
  quality pipeline/scanner compatibility code;
- `c31e7420` — focused proof fixtures for limitation plumbing and the
  unchanged one-writer-call budget;
- `6b5da99f` — restored the report failure-card locale binding found during
  the post-push static read-back;
- `e9fd7c31` — verifies canonical diagnostic/root digests before projection
  and gives `unavailable` diagnostics explicit non-clean UI copy.
- `6b5da99f` — static post-push review fixed the Reports card locale binding (`language` was still used by the fallback notice after the dormant Plan-058 widget cleanup).

The normal-path files
`audit-stage.ts`, `analysis-stage.ts`, `report-stage.ts`,
`generate-english-version.ts`, `routes/audits.ts`,
`operator/audit-readiness.ts`, `evidence-quality-model.ts`,
`evidence-quality-section.tsx` and `audit-reports-section.tsx` were read
back from current `main` after the push and contain none of
`ApprovedAuditEvidence`, `readApprovedAuditEvidence`,
`approveAuditEvidence`, `evidenceApprovalMode` or `evidence-approved`.
Remaining approval consumers are the scanner's historical artifact machinery
and the frozen Plan-058 report-quality pipeline/tests.

Focused proof now committed covers the Foch-shaped classification,
environment-only operational warning, site/material/temporal limitations,
historical no-disclosure compatibility, unavailable/tampered diagnostics,
performance-evidence suppression, grounded-summary limitation input,
deterministic Methodology input, availability readiness vocabulary, and
approval-free evidence-card copy. The Plan-067 provider-budget test continues
to assert exactly one writer call in the new limitation case and zero advisory
reviewer calls.

**Repository validation blocker recorded, not waived.** This session cannot
execute the checkout: the local tool environment cannot resolve
`github.com`, so it cannot clone the private repository, and the repository's
GitHub Actions runner remains unavailable for command execution as already
recorded in Plan 067/Plan 059. On the current post-review head, GitHub Actions still exposes no runnable verification job from this session; the only reported external status is Vercel, currently failing on its build-rate-limit rather than a repository test. That is not a substitute for `pnpm run format`, `pnpm run check` and `pnpm run test`.
Those repository commands therefore remain unproven rather than being claimed
green.

**Villas Foch acceptance blocker recorded, not waived.** The required saved
audit is `artifacts/www.villasfoch.fr/2026-09-03T20-44-46Z/`. A current
GitHub fetch of its `manifest.json` returns 404 because the artifact is
gitignored/runtime storage, and this session has no VPS/object-store/SSH
connector. No rescan was attempted. The Foch-shaped diagnostic behavior is
covered by the committed fixture, including environment warning separation,
site-level/material/temporal limitations and performance scoping, but the
required no-rescan PDF regeneration and confirmation of the stored 32-page /
61-finding audit remain pending until that existing artifact is reachable.

Accordingly the implementation is pushed but this plan stays **IN PROGRESS**:
do not mark it `IMPLEMENTED` or `DONE` until the repository validation
commands actually run green and the existing Villas Foch artifact completes
the no-rescan acceptance.
