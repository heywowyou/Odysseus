# Plan 019: Prepare and personalize the paid report safely

- **Status:** DONE (2026-09-01; implemented in `b219e43`, `0310e26`,
  `a9878df`, `836f561`, `ffc1632`, `f7ced66` plus the four live-found defect
  fixes `1e87b24`, `6b7fb51`, `f9cbca5`, `6600749`; the operator's manual
  review completed the same day)
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Depends on:** Plan 018
- **Planned against:** `24f032a`
- **Approved:** 2026-08-31

## Outcome

Give the operator one simple **Prepare report** workflow that turns bounded,
typed context into a bilingual cover question, opening hook, stakeholder-aware
prose, and evidence-backed customer journeys. Keep report writing versioned:
regeneration creates a candidate that the operator previews and explicitly
approves, while the currently selected writing remains intact.

This plan does not add arbitrary prompt text, unsupported journeys, financial
estimates, or legal content. Plan 020 owns turnover, financial evidence, and the
general sanction reference.

## Drift check before implementation

Re-read these paths and stop to update this plan if their relevant contracts
have changed since `24f032a`:

- `CLAUDE.md`
- `docs/agents/coding-conventions.md`
- `docs/agents/domain.md`
- `docs/decisions/trade-offs.md`
- `docs/rules/llm-layer-rules.md`
- `docs/rules/normalization-rules.md`
- `docs/report/report-design-system.md`
- `docs/report/design/`
- `packages/core/src/audit.ts`
- `packages/core/src/finding.ts`
- `packages/core/src/manifest.ts`
- `packages/llm/src/writing-prompt.ts`
- `packages/store/src/models/`
- `packages/store/src/services/`
- `packages/interface/src/server/`
- `packages/report/src/render-html.ts`

Confirm Plan 018 is implemented and verified. This plan relies on its report
order, minimal cover, metadata sheet, generic opening, and page-count warning.

## Current state and problem

- `AuditManualFields` is a small collection of enrichment fields. Adding every
  preparation decision there would create a shallow grab bag with no policy
  boundary.
- The dashboard can render a report again, but it cannot safely collect report
  context, preview its effect, or distinguish the selected analysis writing
  from a newly generated candidate.
- Report generation resolves the latest persisted analyses. That makes a new
  writing run effective before the operator has approved it.
- The writing prompt creates useful content but does not consistently prefer
  outcome-oriented titles for new audits.
- There is no evidence-aware journey model. A journey assembled from missing
  findings could accidentally imply that untested steps passed.

The seam for this work is one deep report-preparation module. It owns the
vocabulary, validation, fallback rules, evidence resolution, warning digest,
preview view model, and selection state. HTTP handlers and report rendering
consume its bounded outputs rather than reimplementing policy.

## Locked decisions

### Operator workflow

- Add one **Prepare report** card on the audit page, separate from ordinary
  enrichment.
- Keep the form guided and easy to extend through fixed typed options, not raw
  prompt fragments.
- Show a live French and English preview of the cover question, opening hook,
  stakeholder names, journey scope, and currently selected writing.
- Warn before generation when commercial name, situation, trigger, or journey
  scope is missing. Turnover and stakeholder names are optional and do not
  trigger this warning.
- The operator may confirm despite warnings. Remember that confirmation only
  while the warning-relevant input has not changed.

### Context vocabulary

Situation choices are exactly:

1. no work started;
2. redesign planned or underway;
3. corrections underway;
4. existing accessibility programme;
5. periodic review;
6. unknown.

Trigger choices are exactly:

1. legal question;
2. customer complaint;
3. booking or conversion;
4. search visibility;
5. redesign;
6. procurement;
7. commercial discussion;
8. proactive review;
9. other.

When trigger `other` is selected, optional bounded French and English notes may
be entered. A missing language uses safe generic copy; it is never machine
translated or copied from the other language.

### Bilingual overrides and stakeholders

- The operator may optionally override the cover question in French, English,
  or both. A missing language uses the automatic safe question.
- Optional stakeholder names are limited to management, technical or IT,
  communications, and legal. Do not add free-form roles.
- All stored text is trimmed, length-bounded, treated as data, and escaped at
  render time. It never becomes a system or developer instruction.

### Automatic opening hook

Resolve one hook family from the rendered priority findings:

- accessibility;
- speed and booking;
- search and AI visibility;
- privacy;
- mixed.

Use severity weights `critical = 4`, `serious = 3`, `moderate = 2`, and
`minor = 1`. A family wins only when it holds a strict majority of the weighted
total. Otherwise use `mixed`. With no eligible findings, also use `mixed`.
Derive the family from finding categories, never from model-authored themes.

### Journeys

- The system suggests journeys from captured evidence. The operator can only
  confirm or remove suggestions.
- Do not support arbitrary custom journeys.
- Every displayed step has exactly one state: **issue observed**, **no issue
  detected**, or **not evaluated**.
- **No issue detected** is allowed only when the relevant deterministic check
  ran successfully for the applicable captured page. Absence of a finding is
  not enough.
- Initially support discovery/navigation and transaction/booking only.
  Discovery/navigation can be suggested from covered pages. Transaction is
  suggested only when the manifest contains transactional-flow evidence and a
  covered transactional page was visited.
- Contact and other journey types remain unavailable until their deterministic
  evidence predicates and step evaluators exist.

### Writing versions

- New audits use outcome-oriented generated titles.
- Existing audits keep their stored titles until the operator explicitly uses
  **Regenerate writing**.
- Regeneration displays a clear model-call and cost warning, reuses the existing
  deterministic analysis structure, and calls the writing layer for French and
  English.
- Persist the result as an immutable candidate pair. Do not overwrite or select
  it automatically.
- Preview the candidate using its exact analysis IDs and current preparation
  data. Approval atomically makes that pair selected; the old pair remains
  persisted and recoverable.
- Failure or abandonment leaves the selected pair unchanged.
- Legacy audits without explicit selection continue to use the latest complete
  pre-feature pair until the operator selects a candidate.

## Scope

Expected implementation areas:

- `packages/core/src/report-preparation/`
- `packages/core/src/index.ts`
- `packages/llm/src/writing-prompt.ts`
- `packages/llm/src/__tests__/`
- `packages/store/src/models/`
- `packages/store/src/services/`
- `packages/store/src/__tests__/`
- `packages/interface/src/server/`
- `packages/interface/src/__tests__/`
- `packages/report/src/`
- `packages/report/src/__tests__/`
- `docs/report/design/`
- `docs/report/report-design-system.md`
- `docs/decisions/trade-offs.md`

Do not change scanner outputs, the locked `AnalysisStructure`, `Theme`, or
`WritingOutput` contracts, package boundaries, dependencies, or `nocturne.css`.

## Implementation

### 1. Establish the canonical preparation contract

Before source changes, update the maintained dashboard/report design source and
add a trade-off entry that records:

- one preparation aggregate and one operator workflow;
- bounded vocabularies instead of free prompt input;
- evidence-bound journeys and tri-state wording;
- candidate-before-selection writing versions;
- bilingual fallback behaviour.

Define a cohesive core aggregate, with names adjusted to existing conventions:

```ts
interface AuditReportPreparation {
  context: {
    situation?: ReportSituation;
    trigger?: ReportTrigger;
    triggerOther?: LocalizedOptionalText;
  };
  customCoverQuestion?: LocalizedOptionalText;
  stakeholders: Partial<Record<ReportStakeholderRole, string>>;
  journeyDecisions: readonly JourneyDecision[];
  warningAcknowledgement?: {
    digest: string;
    acknowledgedAt: string;
  };
  writingSelection?: {
    selected?: AnalysisPairRef;
    candidate?: AnalysisCandidateRef;
  };
  updatedAt: string;
}
```

The final shape may separate operator input from workflow metadata internally,
but expose one module boundary. Use discriminated unions for candidate state and
journey decisions so invalid combinations are unrepresentable.

Add pure functions for normalization, missing-field calculation, stable warning
digest generation, localized question/hook resolution, hook-family selection,
journey suggestion, journey-step state, preview creation, and selected-analysis
resolution. Export bounded view models, not persistence documents.

### 2. Persist preparation and exact analysis selection

Extend the audit persistence model with the preparation aggregate using the
project's schema-validation pattern. Add service methods that own all updates;
handlers must not issue raw Mongoose updates.

Add exact-ID analysis reads if absent. Selection must refer to a complete
French/English pair belonging to the same audit and compatible structural run.
Enforce that invariant in the store service before an atomic selection update.

Candidate state needs enough information to distinguish generating, ready,
failed, and selected without mutating immutable analysis records. Retain the
previously selected references when a candidate is created or fails. For legacy
records, centralize the latest-complete-pair fallback in one selector and cover
it with migration-free compatibility tests.

### 3. Build the evidence-aware journey policy

Define a closed journey catalogue. Each journey and step declares:

- its required captured-page evidence;
- the deterministic checks that can observe an issue;
- the evidence that proves those checks executed successfully;
- its bilingual labels and remediation-neutral wording.

Use manifest page status, scanner errors, captured performance/render evidence,
transactional-flow signals, and finding provenance. A failed, skipped, absent,
or inapplicable detector resolves to `not-evaluated`. Only a successful relevant
detector with no matching finding resolves to `no-issue-detected`.

The suggestion resolver returns typed reasons for availability or exclusion.
Store only operator confirmation/removal against stable catalogue IDs. Recompute
the resolved journey preview from current evidence so stored prose cannot drift.

### 4. Resolve safe bilingual personalization

Create deterministic French and English copy tables for every situation,
trigger, hook family, missing-language fallback, stakeholder role, journey, and
step state. Keep user-facing text free of em dashes and en dashes.

The automatic cover question combines only typed context and safe copy. A
custom question replaces only the language in which it exists. The hook-family
resolver uses eligible priority findings and the locked severity weighting.
Stakeholder names may personalize an addressee but must not introduce legal or
technical assertions.

Return a preview model that says which values are automatic, overridden,
missing, or unavailable and why. It must contain only escaped/render-ready data,
not prompts or database documents.

### 5. Add the Prepare report interface

Add audit-scoped endpoints following existing authentication, CSRF, Zod, and
error-handling conventions:

- read preparation and its resolved preview;
- patch the bounded operator inputs;
- confirm current missing-context warnings;
- start writing regeneration;
- read candidate-generation status and preview;
- approve a ready candidate.

The audit page gets one **Prepare report** card with short guided controls,
French and English preview tabs, journey suggestions with confirm/remove
actions, and a single obvious save path. Do not mix it into general enrichment.

Calculate the acknowledgement digest from commercial name, situation, trigger,
localized `other` notes, custom questions, and resolved journey scope. Clear or
invalidate acknowledgement when any of these change. A name, situation,
trigger, or journey-scope warning must be visible before generation, with a
simple confirm-and-continue action. Optional stakeholder fields do not enter the
digest.

### 6. Make writing regeneration candidate-first

Adjust the writing prompt for new writing runs so titles state a useful outcome
or decision, without adding claims not present in deterministic inputs. Preserve
the locked output schema and validate every response with Zod.

The regeneration command:

1. verifies or records the current warning acknowledgement;
2. displays and requires confirmation of the model-call/cost warning;
3. reuses an existing compatible structural analysis;
4. generates both languages and persists their immutable analyses;
5. records the exact pair as a ready candidate;
6. renders a preview against those exact IDs;
7. changes selection only after explicit approval.

Do not fall back from a failed new candidate to partially generated content.
Make duplicate submissions idempotent or conflict safely under the established
interface conventions.

### 7. Consume preparation in report rendering

Change paid-report orchestration to resolve the selected analysis pair through
the core/store selector, then pass a bounded preparation preview to the report
package. Do not let `render-html.ts` query storage or derive preparation policy.

Replace Plan 018's generic cover question and opening hook with the localized
resolved values. Render only confirmed available journeys and keep every step's
tri-state wording explicit. Use optional stakeholder names only where the
canonical design calls for them. Existing audits with no preparation data must
continue to render through safe generic fallbacks.

### 8. Verify the vertical slice

Add focused tests at each boundary and run the narrowest affected suites before
the repository-wide checks.

## Required tests

### Core

- Every fixed situation, trigger, stakeholder role, hook family, journey ID,
  and step state has French and English copy.
- Missing-language custom text falls back independently and safely.
- Hook weights, strict-majority behaviour, ties, no-findings, and mixed-category
  cases are deterministic.
- Warning digest is stable and changes exactly when warning-relevant input or
  resolved journey scope changes.
- Journey suggestions require their evidence predicates.
- A missing/failed/skipped detector can never yield `no-issue-detected`.
- Stored journey decisions cannot create a journey the evidence excludes.

### Store

- Preparation round-trips without accepting unknown vocabulary values.
- Exact analysis reads are audit-scoped.
- A candidate never changes selection automatically.
- Only a complete compatible bilingual pair can be selected.
- Failed generation preserves the selected pair.
- Legacy fallback returns the latest complete pair deterministically.
- Concurrent approval or regeneration conflicts safely.

### LLM

- New prompt examples request outcome-oriented titles without changing the
  locked schema or adding unsupported claims.
- Responses remain Zod-validated and raw HTML/whole pages never enter prompts.

### Interface

- Authentication and CSRF protect every write.
- Zod rejects unknown options, oversized notes/questions/names, and malformed
  candidate references.
- The card shows both language previews and typed exclusion reasons.
- Required warning acknowledgement is enforced and invalidated on relevant
  changes; optional names do not block.
- Regeneration requires the explicit model-call/cost confirmation.
- Candidate preview uses exact IDs and approval is a separate action.

### Report

- Generic fallback reports remain bilingual and render without preparation.
- Per-language question overrides affect only their language.
- Journey steps use only the three approved states.
- Unsupported or removed journeys do not render.
- Rendering a candidate preview does not alter the selected paid report.
- Existing stored titles remain unchanged until explicit regeneration.

## Validation commands

Use the actual root test runner because `@odysseus/report` has no package-level
`test` script:

```bash
pnpm exec vitest run packages/core/src packages/llm/src packages/store/src packages/interface/src packages/report/src
pnpm run typecheck
pnpm run format
pnpm run check
```

Also perform a manual operator review with one legacy audit and one new audit:

1. confirm the form is understandable without documentation;
2. inspect French and English fallbacks;
3. verify a failed detector reads `not evaluated`;
4. regenerate writing and confirm the current report does not change;
5. approve the candidate and confirm the selection changes once;
6. generate the paid report and inspect cover, opening, and journeys.

Do not run a live third-party scan for this verification.

## Done when

- One bounded preparation workflow owns all approved context and preview rules.
- The operator can safely save, preview, and extend typed choices without
  editing prompts or code paths in multiple packages.
- Report questions and hooks are bilingual, deterministic, and safely generic
  when context is absent.
- Journeys are evidence-backed, confirm/remove only, and never turn untested
  absence into a pass.
- Writing regeneration is explicit, cost-warned, immutable, previewable, and
  candidate-first.
- Paid reports use the selected exact bilingual analysis pair, with a tested
  compatibility path for legacy audits.
- Focused tests, typecheck, formatting, and `pnpm run check` pass.
- Canonical design and trade-off records describe the shipped contract.

## Stop conditions

Stop and ask before:

- changing a locked scanner, analysis, theme, or writing-output contract;
- adding a dependency or changing package boundaries;
- allowing arbitrary journey types, roles, prompt instructions, or HTML;
- treating absence of a finding as successful journey evaluation;
- automatically selecting generated writing;
- inventing a new evidence predicate because current captured data cannot prove
  a journey step was evaluated.

## Maintenance notes

- Add a situation, trigger, role, hook, or journey only through the core
  catalogue with bilingual copy and boundary tests.
- A new journey step requires both a failure detector and positive evidence that
  the detector ran; UI copy alone is insufficient.
- Keep analysis selection centralized. Callers must not recover the old
  latest-record behaviour ad hoc.
- Plan 020 extends the same preparation module with typed turnover; it must not
  create a second preparation form or aggregate.
