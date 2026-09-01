# Plan 021: Keep full-site audits complete without repeating template work

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update this plan's status row in
> `plans/README.md`, unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat cc6e39f..HEAD -- CLAUDE.md docs/product/odysseus-project-brief.md docs/decisions/trade-offs.md docs/rules/normalization-rules.md docs/rules/offer-positioning.md packages/core/src packages/scanner/src packages/store/src packages/interface/src/pipeline packages/interface/src/queue packages/interface/src/routes packages/interface/src/dashboard packages/cli/src packages/llm/src/structure-ranking.ts packages/report/src plans/README.md`
> Plans 018 through 020 are expected to change report files before this plan
> starts. Re-anchor report line references against their completed state. Stop
> if they changed the meaning of a finding, occurrence, analyzed page, report
> methodology, or Core Web Vitals coverage. Do not layer this work over an
> incomplete plan 018, 019, or 020 tree.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 018, 019, and 020
- **Category**: bug, performance, architecture
- **Planned at**: commit `cc6e39f`, 2026-09-01
- **Issue**: https://github.com/heywowyou/Odysseus/issues/20

## Why this matters

An uncapped audit of `hotelpointfrance.com` explored 672 URLs and prepared
about 670 for the expensive page-analysis phase. The count was not invented:
the public sitemap declared 521 eligible URLs, including 375 posts and 69
taxonomy or listing URLs, and the link graph exposed more author, date, and
category pagination. The defect is that the scanner currently treats every
successfully loaded HTML URL as requiring the same render, axe, extended
accessibility, and Lighthouse work.

The paid audit must remain as complete as possible. It must not silently return
to a fixed page sample, and it must not hide page-specific defects behind a
template label. The safe first optimization is deliberately narrow: every
successfully crawled HTML page still receives render diff, axe, and the extended
checks, while Lighthouse runs only where another serialized performance run can
add evidence. A separate continuation-family guard prevents an unbounded link
frontier without dropping operator seeds or sitemap-declared URLs. The report
then distinguishes distinct findings, affected pages, occurrences, and
pass-specific coverage instead of presenting URL count as either defect count
or proof that every tool ran everywhere.

## Binding decisions

1. **The declared-site inventory remains uncapped by default.** Resolve every
   eligible sitemap URL and traverse the permitted internal-link frontier. Do
   not restore a global default page cap. A crawl-family safety guard may stop
   a proven link-discovered listing continuation family, but it is explicit,
   reason-coded, counted separately from inventoried URLs, and disclosed. It
   never drops an operator seed or any eligible sitemap-declared URL.
2. **Planning is deterministic.** The model does not classify pages, select
   representatives, infer templates, or decide which checks run.
3. **A page family schedules checks, not findings.** A finding may name only a
   page on which its scanner actually ran and observed the defect. Never copy a
   sampled result onto untested family members.
4. **Unknown means fuller coverage.** A page is treated as a repeated family
   member only when at least two independent structural facts support that
   classification. URL text alone is never enough. An absent or low-confidence
   classification receives Lighthouse rather than being placed in a sampled
   family.
5. **Every crawled HTML page keeps content-sensitive checks in v1.** Every
   successfully crawled content, transactional, listing, utility, seeded, and
   unknown page runs render diff, axe, and the existing extended checks. This
   includes all 375 canonical blog posts and every reached archive/listing in
   the motivating case. Page-family logic may not reduce these passes in this
   plan.
6. **Listings are checked, not merely represented.** Every reached
   listing/archive URL receives the same content-sensitive checks as any other
   HTML page. Its role and family remain useful for the continuation guard,
   performance selection, progress, and disclosure, but never justify copying
   a representative's finding or skipping axe in v1.
7. **Only Lighthouse is family-stratified.** Always measure the homepage, every
   transactional page, every operator seed, every unknown/fallback page, every
   unique family, and two representatives per repeated non-listing family and
   language: the stable first URL and the largest rendered-cost outlier. A
   family with only one member runs once. Repeated high-confidence listing
   families do not run Lighthouse unless a member is also transactional,
   unique, seeded, or unknown.
8. **The outlier choice uses measured facts, not intuition.** Add a small
   rendered-page cost profile such as DOM node count, image count, resource
   count, and available transfer-size total. In v1, compare the descending
   tuple `(resourceCount, imageCount, domNodeCount, knownTransferBytes,
   unknownTransferSizeCount)`, then URL ascending as the final tie-breaker.
   Resource count deliberately precedes known bytes so an unreported transfer
   size is not treated as evidence that the resource was free. In Resource
   Timing, a zero transfer size is unknown unless the entry supplies enough
   same-origin or timing detail to prove a genuine zero-byte transfer. Changing
   this tuple requires a planner-version bump.
9. **Existing finding identity remains authoritative.** Preserve the locked
   `Finding` v1 shape, the two-pass dedupe design, translation clusters,
   resource identities, and the allowlisted axe element-shape identities. Do
   not add selector normalization or a universal remediation key. The current
   contract already stores one distinct finding with many affected pages and
   occurrences when the evidence supports that merge.
10. **Reach and work are separate.** A shared-template correction affecting
    many pages remains high leverage, but the report calls it one distinct
    finding and shows its reach separately. Editorial rules such as image alt
    text remain per-occurrence work when each item needs an independent human
    decision.
11. **Coverage is persisted per pass and by outcome.** Navigation remains the
    existing page-status fact; rendered checks, axe, extended checks, and
    Lighthouse receive separate outcomes. Each planned pass records
    `completed`, `partial`, or `failed`; an unplanned Lighthouse pass records
    `not-planned`. A planned skip is not a scanner failure, and one failed
    subcheck must not turn a usable composite pass into a false success.
    Historical manifests remain valid through optional fields and conservative
    report fallbacks.
12. **No new dependency or package.** Profiling, planning, and scheduling stay
    in `scanner`; stable persisted coverage types stay in the non-locked
    manifest contract in `core`; storage, progress, normalization, and report
    changes remain in their owning packages.

## Corrective findings incorporated into this plan

- The original idea treated a whole page as either sampled or scanned. That is
  too coarse. Site-level, page-level, template-level, flow-level, and
  resource-level checks have different useful scopes.
- Template equality does not prove content equality. Titles, canonicals,
  headings, alternative text, structured data, embeds, and forms can differ
  inside one template, so every crawled HTML page, including listings, retains
  content-sensitive checks in v1.
- Performance can differ inside one template because of media and embeds. One
  arbitrary representative is insufficient; each repeated family also gets a
  measured outlier.
- Classification can be wrong on an unfamiliar content-management system.
  Reduced work requires multiple signals, and uncertainty falls back to fuller
  coverage.
- Sampling cannot justify stating that an untested page failed. Family counts
  describe coverage only; finding page lists remain observation-only.
- The existing manifest status `visited` is a crawl fact but report code often
  reads it as an analysis fact. Tiered execution requires explicit pass
  provenance and new denominators.
- The existing report already says repeats are collapsed, and normalization
  already has carefully measured identities. The correction should deepen
  those semantics, not replace them with broad grouping that can hide real
  editorial work.
- The earlier draft contradicted itself by both sampling listing axe work and
  saying that only Lighthouse was family-stratified. This pass resolves the
  contradiction in favor of coverage: only Lighthouse is sampled.
- The earlier one-shot `buildFullAuditPlan(profiles)` interface could not choose
  a rendered-cost outlier that does not exist until after the rendered pass.
  The planner is now explicitly staged.
- A list of `completedPasses` could not distinguish a composite extended pass
  with one failed subcheck from an atomic pass that never ran. Persist explicit
  pass outcomes and bounded failed-check reason codes instead.
- The offer is sold as a whole-site crawl rather than a sample of templates.
  `docs/rules/offer-positioning.md` therefore belongs to the canonical contract
  update; report copy alone is not enough.
- A page-family planner alone does not protect the crawl from an infinite
  calendar or filter frontier. A separate, disclosed continuation-family guard
  is required.
- Progress and ETA must follow the content-check and Lighthouse totals. One
  average over different pass costs would be false precision.

## Current state

- `packages/scanner/src/crawl.ts:253-438` navigates every admitted URL,
  extracts anchors from link-discovered pages, records ordinary HTML as
  `visited`, then appends every eligible sitemap URL. It has no page profile,
  family classification, or continuation-family guard.
- `packages/scanner/src/links.ts:152-180` admits same-origin HTML URLs and
  filters extensions plus confirmed non-public WordPress object types. It
  deliberately keeps ordinary query URLs. Do not grow a list of
  hotelpointfrance-specific paths here.
- `packages/scanner/src/scan-site.ts:154-319` turns every crawl page with status
  `visited` into `pagesToScan`, distributes those URLs across lanes, and calls
  the same `scanPage` behavior for all of them.
- `packages/scanner/src/scan-page.ts:174-467` couples render diff, axe, head and
  custom DOM checks, input-event checks, and Lighthouse into one operation.
  `skipLighthouse` is one global boolean used by prospecting; it cannot express
  a per-page full-audit schedule.
- `packages/scanner/src/scan-page.ts:454-464` runs Lighthouse after the rendered
  work. Lighthouse is serialized and performs another navigation, which is the
  repeated cost that made the motivating scan project several hours.
- `packages/scanner/src/prescan/page-roles.ts` is an existing deterministic
  role selector, but it selects three links before navigation for prospecting.
  Reuse its plain-language reason-code and stable-tie principles, not its
  vocabulary lists or three-page budget.
- `packages/core/src/types/manifest.ts:21-31,72-85,156-200` owns discovery,
  status, and per-page manifest facts. It is stable but explicitly not one of
  the three locked contracts. Add optional coverage fields here rather than to
  `Finding`.
- `packages/scanner/src/artifacts/write-audit.ts:400-470` joins crawl pages to
  scan results and writes page artifacts. It must preserve inventory-only
  pages without manufacturing empty scanner results.
- `packages/store/src/schemas/audit.schema.ts` mirrors manifest fields in
  MongoDB. Optional coverage fields must remain tolerant of historical audits.
- `packages/interface/src/queue/report-progress.ts` and `eta.ts` model one scan
  phase with one target. That target becomes misleading once rendered work and
  Lighthouse have different page sets.
- `packages/report/src/template/statistics.ts`, `sections/methodology.ts`, and
  the post-plan-018 metadata sheet derive "pages analyzed" from
  `page.status === 'visited'`. They need pass-specific coverage and a legacy
  fallback.
- `packages/report/src/template/sections/core-web-vitals-table.ts` already
  counts pages carrying successful Core Web Vitals. Preserve that factual
  basis and add the planned denominator so selected, failed, and unselected
  pages are distinguishable.
- `packages/core/src/normalize/normalize.ts:273-345,385-480` already emits one
  `Finding` with distinct `pageUrls` and a total `occurrences` count after two
  dedupe passes.
- `packages/core/src/normalize/normalize-axe.ts:54-165` uses a measured
  allowlist of rules where an element-shape identity represents one template
  correction. `image-alt` and `color-contrast` are deliberately excluded.
- `packages/llm/src/structure-ranking.ts` uses `visited` pages as the site-wide
  accessibility denominator and raw occurrence rank as a promotion signal.
  Preserve broad-impact promotion, but use the pages on which the relevant
  check actually ran as the denominator.
- `packages/report/src/template/strings/fr.ts` and `en.ts` already define a
  finding as one distinct problem after collapsing repeats. Keep that promise
  and add coverage language; do not rename occurrences into findings.
- `CLAUDE.md` rule 5 rejects a silent default page cap, and trade-off 9b.5
  requires sitemap-only content to receive real defect coverage. Amend those
  decisions explicitly for pass-specific coverage. Do not silently treat this
  plan as compatible without updating the rationale.

## Target interfaces

Keep the external seam small and make the two decision times explicit. Exact
names may move during implementation, but do not collapse this back into a
one-shot function: rendered-cost outliers cannot be selected before rendered
analysis has produced the cost facts.

```ts
export type AuditPageRole =
  | 'content'
  | 'transactional'
  | 'listing'
  | 'utility'
  | 'unknown';

export type AuditPass = 'rendered' | 'axe' | 'extended' | 'lighthouse';

export interface PageAuditProfile {
  url: string;
  language?: string;
  roleSignals: readonly PageRoleSignal[];
  templateFamilyId?: string;
}

export interface RenderedCostProfile {
  url: string;
  domNodeCount: number;
  imageCount: number;
  resourceCount: number;
  knownTransferBytes: number;
  unknownTransferSizeCount: number;
}

export interface PageAuditDecision {
  url: string;
  role: AuditPageRole;
  confidence: 'high' | 'fallback';
  templateFamilyId?: string;
  plannedPasses: readonly AuditPass[];
  reasonCodes: readonly string[];
}

export interface FullAuditPlan {
  plannerVersion: 'v1';
  decisions: readonly PageAuditDecision[];
}

/** Stage 1: every eligible HTML page receives rendered, axe, and extended. */
export function buildContentAuditPlan(
  profiles: readonly PageAuditProfile[],
): FullAuditPlan;

/** Stage 2: add Lighthouse selections after rendered cost facts exist. */
export function finalizeLighthousePlan(
  contentPlan: FullAuditPlan,
  renderedCosts: ReadonlyMap<string, RenderedCostProfile>,
): FullAuditPlan;
```

These are the interfaces callers and tests use. `buildContentAuditPlan` must put
`rendered`, `axe`, and `extended` on every decision in v1. Keep DOM parsing,
signal thresholds, family hashing, representative selection, and tie-breaking
inside the module. Do not expose a collection of caller-tuned booleans.

Persist an optional, versioned subset on each `ManifestPageEntry`, for example:

```ts
type AuditPassOutcome = 'completed' | 'partial' | 'failed' | 'not-planned';

type CheckExecutionOutcome = 'completed' | 'failed' | 'not-applicable';

interface AuditPassCoverage {
  outcome: AuditPassOutcome;
  /** Stable identifiers from the check-scope registry, never raw errors. */
  failedCheckIds?: string[];
}

interface PageAnalysisCoverage {
  plannerVersion: 'v1';
  role: AuditPageRole;
  confidence: 'high' | 'fallback';
  templateFamilyId?: string;
  reasonCodes: string[];
  passes: Record<AuditPass, AuditPassCoverage>;
}

interface ContinuationGuardSummary {
  guardVersion: 'v1';
  omittedUrlCount: number;
  unlistedFamilyCount: number;
  unlistedOmittedUrlCount: number;
  /** At most 100 families, sorted by familyId. */
  families: Array<{
    familyId: string;
    reasonCode: string;
    omittedUrlCount: number;
    /** At most three deterministic examples, sorted by URL. */
    exampleUrls: string[];
  }>;
}
```

Add a scanner-internal `checkOutcomes` map keyed by the compiled registry's
stable check IDs and populated at each check boundary. Existing detailed error
fields remain intact where they already exist, but they are not complete enough
to derive coverage: several best-effort checks currently return `undefined` for
both not applicable and caught failure. The explicit check outcome is the
coverage source of truth and must never contain raw exception text.

The persisted pass record is a bounded summary: `completed` means every
applicable registered check in the pass completed, `partial` means the
composite pass produced usable results but one or more registered subchecks
failed, `failed` means the pass produced no usable result, and `not-planned` is
valid only for Lighthouse in v1. A zero-finding result is still completed.
Navigation outcome remains owned by the existing page status rather than being
duplicated as an `AuditPass`. Do not infer one state from another in the report.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Documentation | `pnpm run docs:check` | exit 0 |
| Scanner unit loop | `pnpm exec vitest run --project unit packages/scanner/src/page-audit-profile.test.ts packages/scanner/src/full-audit-plan.test.ts packages/scanner/src/check-scope-coverage.test.ts packages/scanner/src/scan-page.test.ts packages/scanner/src/scan-site.test.ts` | all named suites pass |
| Scanner browser loop | `pnpm exec vitest run --project e2e packages/scanner/src/crawl.e2e.test.ts packages/scanner/src/scan-site.e2e.test.ts` | all pass |
| Store integration | `pnpm run test:store:up && pnpm exec vitest run --project unit packages/store/src/persist-audit.test.ts packages/store/src/audits.test.ts packages/store/src/jobs.test.ts` | Mongo starts and suites pass |
| Consumer loop | `pnpm exec vitest run --project unit packages/interface/src/pipeline/audit-stage.test.ts packages/interface/src/queue/eta.test.ts packages/interface/src/routes/audits.test.ts packages/interface/src/dashboard/routes/scan-progress-model.test.ts packages/cli/src/commands/audit.test.ts packages/llm/src/structure-ranking.test.ts packages/report/src/template` | all named suites pass |
| Format | `pnpm run format` | exit 0 |
| Project check | `pnpm run check` | docs, format, lint, and typecheck pass |
| Full suite | `pnpm run test:all` | unit and e2e projects pass |

Do not use `pnpm --filter @odysseus/report test`; the report package has no
test script. Run root Vitest with exact paths.

## Suggested executor toolkit

- Use the `tdd` skill if available. The scheduling and coverage contracts need
  red tests before the implementation changes.
- Use the `codebase-design` vocabulary when reviewing the planner interface.
  The planner should be a deep module: callers provide profiles and receive an
  auditable plan without knowing the classification implementation.
- Read `docs/rules/normalization-rules.md` and trade-offs 3, 24, 30, 31, and
  9b.5 before changing identity, coverage, or fixtures.

## Scope

**In scope**:

- `CLAUDE.md`
- `docs/product/odysseus-project-brief.md`
- `docs/decisions/trade-offs.md`
- `docs/rules/normalization-rules.md`
- `docs/rules/offer-positioning.md`
- `packages/core/src/types/manifest.ts`
- new pure coverage helpers under `packages/core/src/` only if report, LLM,
  and scanner genuinely share the same calculation
- `packages/scanner/src/page-audit-profile.ts` and focused test, create
- `packages/scanner/src/full-audit-plan.ts` and focused test, create
- `packages/scanner/src/crawl.ts`, `links.ts`, `scan-site.ts`, `scan-page.ts`,
  their focused unit/e2e tests, and public exports
- `packages/scanner/src/artifacts/manifest.ts`, `write-audit.ts`, and tests
- `packages/store/src/schemas/audit.schema.ts` and audit persistence tests
- `packages/store/src/schemas/job.schema.ts`, `packages/store/src/jobs.ts`,
  public exports, and focused job tests
- `packages/interface/src/pipeline/audit-stage.ts`, its result type, and focused
  tests
- `packages/interface/src/queue/report-progress.ts`, `eta.ts`, job progress
  schema/types, dashboard progress model, FR/EN strings, and focused tests
- `packages/interface/src/routes/audits.ts` and route tests for stored coverage
- `packages/cli/src/commands/audit.ts` and
  `packages/cli/src/commands/audit.test.ts` (create; pure coverage-output
  formatting, no live command execution)
- `packages/llm/src/structure-ranking.ts` and its tests, denominator only
- post-plan-020 report coverage/statistics/methodology/Core Web Vitals files,
  FR/EN strings, types, and focused tests
- a bounded generated profile fixture and the existing `spa-demo` fixture only
  where a real browser contract needs proof
- `plans/README.md`

**Out of scope**:

- `packages/core/src/types/findings.ts`
- `packages/core/src/normalize/severity.ts`
- `packages/core/src/types/llm-output.ts`
- selector normalization or a third finding-dedupe pass
- changing the allowlists in `normalize-axe.ts` or
  `normalize-lighthouse.ts` without a separately measured real-output case
- changing severity because a page is sampled or repeated
- sending page profiles, template IDs, URLs, or raw content to the LLM
- a new package, dependency, database migration that rejects historical
  documents, or background monitoring
- changing prospecting's existing three-page selection policy
- family-sampling render diff, axe, or any extended check in v1
- a default global page cap
- claiming that a sampled failure affects untested pages
- a live third-party scan without fresh authorization at execution time

## Git workflow

- Work on `main`, matching the operator's current repository workflow.
- Make small coherent commits at the slice boundaries below. Do not push unless
  the operator explicitly asks.
- Do not include or rewrite unrelated changes. Plan 018 through 020 work must be
  committed and reconciled before starting.
- Suggested commit slices:
  1. canonical contract, characterization tests, profile and planner;
  2. scanner execution, continuation guard, artifacts and store;
  3. progress, ranking denominators, and report disclosure;
  4. fixture refresh and complete verification.

## Steps

### Step 1: Amend the whole-site contract before changing behavior

Update `CLAUDE.md`, the project brief, normalization rules, offer positioning,
and trade-offs in one documentation slice. Preserve the 9b.5 decision that
sitemap reachability and scan coverage are different facts. Replace only the
assumption that every eligible URL receives an identical set of tools. Keep the
offer's whole-site distinction accurate by stating that content-sensitive
analysis still covers every successfully crawled HTML page while performance
measurement is a disclosed deterministic sample.

Define these terms in plain language:

- inventoried URL: successfully navigated or explicitly recorded with a
  failure/skip reason;
- omitted continuation URL: discovered behind a bound continuation family and
  counted in the top-level guard summary, but not falsely included in the
  inventoried-URL total;
- content-checked page: rendered and checked with axe plus the extended pass,
  regardless of page role or family;
- performance-measured page: selected for Lighthouse;
- performance representative: one family member actually selected for
  Lighthouse, never a substitute for content checks on its siblings;
- distinct finding, affected page, and occurrence;
- planned skip versus scanner failure.

Record the conservative scheduling and no-propagation rules from "Binding
decisions". Amend rule 5 only to allow a disclosed per-family continuation
guard. State that it is not a replacement global cap and cannot remove a seed
or any sitemap-declared eligible URL, including a taxonomy/listing URL.

**Verify**: `pnpm run docs:check` exits 0. Repository search finds no canonical
sentence still claiming that every discovered URL runs Lighthouse or that a
`visited` URL necessarily completed every scanner.

### Step 2: Add red characterization tests for the motivating failure class

Before implementation, add a generated in-memory profile fixture with:

- 375 article URLs sharing one family;
- two languages;
- one old article template;
- listing, author, date, tag, and pagination families;
- a booking page and an operator seed;
- one unique content page;
- one rendered-cost outlier inside the main article family;
- profiles with missing or contradictory role signals;
- a continuation family that exceeds the safety threshold;
- a sitemap-declared URL resembling a continuation, which must not be omitted.

Assert the intended plan totals and exact selected URLs. The tests must prove:

- every generated HTML page, including every article and listing, retains
  rendered, axe, and extended passes;
- repeated article Lighthouse work is bounded by family, language, and outlier
  rules rather than article count;
- all transactional, seeded, unique, and fallback pages receive Lighthouse;
- repeated listings receive content checks on every page but no Lighthouse
  unless another mandatory-selection rule applies;
- classification ambiguity increases work instead of reducing it;
- input order does not change decisions;
- no decision claims a finding or affected page.

Add a small browser fixture case proving that listing pagination remains
traversable for discovery, every reached listing enters content analysis, and
only planned pages enter Lighthouse. Do not commit hundreds of HTML files;
generate unit profiles and keep the e2e fixture small.

**Verify**: the new focused unit tests fail for the missing planner behavior,
and existing scanner tests remain green before production code changes.

### Step 3: Extract bounded page profiles during the crawl

Create `page-audit-profile.ts`. Extract only structured facts from the page the
crawler has already loaded, at the existing post-`load` crawl snapshot. Do not
add a settle wait or another navigation to the crawl merely to improve family
classification:

- canonical and robots-indexability signals;
- declared language;
- body/CMS page-type classes, JSON-LD top-level types, pagination relations,
  forms and transactional markers;
- landmark/element structural tokens for a versioned template-family hash;
- link/list density signals needed to distinguish a collection from a detail
  page.

Do not store raw HTML, body text, complete links, or element snippets in the
profile. Hash only a normalized structural token stream. Drop volatile IDs,
inline styles, text, URLs, dates, and attribute values. Include tag names,
landmark roles, stable class names, and attribute names only when they add
structural evidence. Record the profile algorithm version.

Classification requirements:

- a `listing` role requires at least two independent signals;
- URL path or sitemap filename alone is weak evidence and cannot reduce work;
- a form/booking signal promotes to `transactional`;
- operator seeds never receive reduced coverage;
- conflicting, missing, or unparsable facts return `unknown`;
- template-family absence means a unique family, not a shared default bucket;
- classification never decides whether rendered, axe, or extended checks run
  in v1.

Extract the profile in `crawl.ts` before closing the loaded page and retain it
on `CrawledPage`. Keep link extraction and robots behavior unchanged. A profile
failure records a reason and falls back; it must not fail the crawl.

**Verify**: profile unit tests cover WordPress-like, Shopify-like, static,
multilingual, listing, detail, transactional, empty, and contradictory shapes.
`crawl.e2e.test.ts` proves each visited HTML page receives a profile without an
extra navigation.

### Step 4: Build the staged deterministic full-audit planner

Create `full-audit-plan.ts` behind the target interface. Keep all thresholds,
sorts, reason codes, and family selection inside this module.

Build the plan through the two target interfaces:

1. Before rendered analysis, `buildContentAuditPlan` schedules rendered, axe,
   and extended checks for every successfully crawled HTML page. Role, family,
   seed, and confidence facts are recorded but cannot remove any of those three
   passes in v1.
2. After rendered results provide cost profiles, choose Lighthouse pages. Add
   mandatory homepage, transactional, seeded, unknown/fallback, and unique
   pages first, then stable and cost-outlier representatives per non-listing
   family/language. Deduplicate a page selected by more than one reason and
   preserve every reason code.

Add one compiled registry assigning each existing detector output to `site`,
`page`, `family`, `flow`, or `resource` scope, its owning pass, its applicability
rule, and its completion/error signal. This registry is documentation and a
test ratchet: every detector result and companion error field exposed by
`PageScanResult` must map to exactly one registry entry; envelope fields such as
`url` are excluded explicitly. Site checks remain once per site. Page/content
checks remain on every crawled HTML page. Only Lighthouse is
family-stratified in v1.

Populate `checkOutcomes` at each registered check boundary. A caught
best-effort failure is `failed`, an inapplicable check is `not-applicable`, and a
successful check with no finding is `completed`. Do not derive these states by
testing whether an optional result field exists.

Do not make render diff, axe, or the extended pass family-sampled in v1. Their
DOM findings include both shared-template defects and content-specific defects;
existing normalization decides which observed occurrences can merge.

**Verify**: planner tests from step 2 pass. A coverage test fails if a future
check is added without an explicit scope decision.

### Step 5: Split rendered analysis from Lighthouse execution

Refactor `scan-page.ts` without changing the individual checks:

- extract a rendered-page function that performs render diff, axe, current DOM
  extraction, extended checks, the rendered-cost profile, and explicit
  per-check outcomes;
- extract a Lighthouse function that owns the existing delay, serialized queue,
  navigation, result, and error behavior;
- retain a small compatibility wrapper only where an existing caller genuinely
  needs both;
- do not change check order inside the rendered hook, especially keyboard,
  form-validation, and reflow ordering.

Refactor `scanSite` into explicit stages:

1. crawl and profile;
2. build the all-page content plan;
3. run rendered lanes;
4. finalize the Lighthouse plan with measured outliers;
5. run the serialized Lighthouse selections and merge results by URL;
6. derive pass outcomes from the registry and return inventory, decisions,
   outcomes, and observed results.

The existing per-origin politeness delay applies to each network pass. Do not
shorten it because fewer Lighthouse pages run. Preserve the existing
`skipLighthouse` behavior for prospecting and the standalone `scan` command;
neither path may acquire full-audit representative policy accidentally.
Cancellation is checked between pages and between stages. A Lighthouse error
affects only that selected page and never converts an unselected page into a
failure.

**Verify**: focused scan-page and scan-site unit tests pass. The e2e test proves
every crawled HTML page, including listings, produces axe results; only selected
pages produce Lighthouse; and no page is navigated by Lighthouse merely because
another member shares its family. Existing prospecting and `skipLighthouse`
tests remain green.

### Step 6: Add a conservative continuation-family guard

Protect the link frontier from generated calendars, filters, and pagination
without adding a site-wide cap.

Classify an outgoing link as a continuation only from structural facts on the
source page, such as `rel=next`, a numbered pagination control, or a repeated
query-key family inside a confirmed listing. Do not infer continuation from a
date-looking or numeric path alone.

Apply a documented maximum only to link-discovered continuation URLs in the
same family. Never apply it to:

- the homepage;
- operator seeds;
- every eligible sitemap-declared URL, including taxonomy/listing URLs;
- ordinary content links discovered inside a listing;
- an unknown family.

When the guard binds, retain a bounded set of omitted URL examples and counts
by family, emit progress, persist the reason, and disclose incomplete link
discovery in the report. The threshold is compiled and versioned. The guard
must operate while enqueueing structured outgoing-link descriptors, before
URL-only normalization discards `rel`, pagination-control, and source-family
evidence. It may persist only bounded examples and counts, not the full link
list. Cap persisted family detail at 100 sorted family IDs, keep at most three
sorted examples per recorded family, and preserve aggregate family/URL counts
for the overflow so the bound never understates how much was omitted.

Before fixing the threshold, measure the generated finite and runaway fixtures,
the issue #20 URL families, and any locally available saved audit manifests.
Record the evidence and why the value catches a runaway continuation without
truncating the known finite cases. Saved manifests are supporting evidence, not
a required hidden prerequisite for a fresh executor. If the committed fixture
and issue evidence cannot establish a defensible threshold, STOP rather than
inventing one.

**Verify**: unit and crawl e2e tests cover infinite-next, filter combinations,
finite pagination below the threshold, immunity for every eligible sitemap URL,
seed immunity, and exact omission counts. No test relies on a live site.

### Step 7: Persist truthful, backward-compatible coverage

Add optional, versioned page-analysis coverage to `ManifestPageEntry` and the
Mongoose audit schema. Preserve historical documents without these fields.

Write coverage for every inventoried page, including planned pages whose
scanner failed. Persist the continuation guard separately as a bounded,
versioned top-level summary with family counts, total omission count, and a
small example list; do not manufacture one `ManifestPageEntry` per omitted URL
or include omissions in the inventoried total. Keep existing errors as errors.
Do not create page directories or empty `scan.json` files for pages with no
scanner result merely to satisfy a join. Because every successfully crawled
HTML page receives content checks in v1, an inventoried page without content
analysis is limited to crawl failure or deliberate language-homepage
discovery. A high-confidence listing is not inventory-only merely because of
its role.

Deprecate `SitemapCoverageSummary.scannedPageCount` as a legacy crawl-era name;
do not silently change the meaning of historical values. Add new derived
coverage helpers for current reports and routes. They must expose at least:

- URLs inventoried;
- content-checked pages completed/partial/failed;
- axe pages completed/failed;
- Lighthouse pages completed/failed/not-planned;
- pages recorded without content analysis, grouped by reason;
- template families represented;
- continuation URLs omitted;
- legacy coverage unknown.

Offline `normalize <dir>` must continue to work from manifest and present page
artifacts only. It must not interpret an unplanned scanner field as a failure.

Thread the derived summary through `runAuditStage`, the stored audit route, and
the thin CLI output. The CLI must print inventory, content-check, and Lighthouse
counts plus failures/guarded omissions; it must not print one undifferentiated
"pages scanned" number for a current manifest. Historical audits use an
explicit legacy/unknown message rather than invented pass counts.

**Verify**: manifest, write-audit, store schema, persistence, and legacy fixture
tests pass. Round-trip tests prove optional fields and all four pass outcomes
survive Mongo storage, a partial extended pass names only stable failed-check
IDs, and an old manifest still validates and renders with an explicit legacy
coverage state.

### Step 8: Make progress and ETA follow actual work

Replace the single scan target with two operator-visible stages:

- rendered/content analysis, target known after the first planner stage;
- performance analysis, target known after outlier selection.

Extend progress event, job schema, reporter, ETA, route type, dashboard model,
and FR/EN copy together. Preserve cancellation behavior and terminal polling.
Use explicit scanner events and persisted progress buckets for content and
Lighthouse rather than overloading the old `scan` counter. Keep legacy `scan`
progress readable in the dashboard for already-stored jobs, but new full audits
emit `content-scan`, `select-performance`, and `lighthouse` phases. The
transition event has no fabricated target or ETA.

Compute ETA independently per stage from completed pages in that stage. Do not
blend a fast rendered average with serialized Lighthouse. During the transition
between stages, show that the performance selection is being finalized rather
than displaying zero or a stale many-hour estimate.

The dashboard should expose the planned coverage summary as soon as it exists:
for example, "375 pages scheduled for content checks; performance selection in
progress." Only completed counters may use "checked" or "measured". After
selection and execution it may say "375 content pages checked; performance
measured on 6 representatives." Keep exact copy bilingual and plain.

**Verify**: queue ETA, progress reporter, store job schema, dashboard model,
route, and i18n tests cover zero pages, one page, multiple families, planned
skip, failure, cancellation, and terminal state.

### Step 9: Use pass-specific denominators and disclose reach precisely

Update ranking and report consumers after plans 018 through 020 are complete.

For `enforceSiteWideAccessibilityFloor`, divide affected pages by pages with a
completed axe pass, not every inventoried/visited URL. Preserve the existing
80 percent threshold and occurrence-weighting behavior in this plan. A broadly
repeated shared correction should still rank as high leverage; it just remains
one distinct finding.

In the metadata, audit-scale, Core Web Vitals, methodology, and appendix
surfaces, show:

- total URLs inventoried;
- pages receiving content-sensitive analysis;
- pages receiving Lighthouse;
- pages without content analysis, grouped by reason, and guarded omissions;
- scanner failures separately from planned coverage choices;
- distinct findings separately from affected pages and occurrences.

Use neutral deterministic wording such as "observed X times across Y pages."
Do not add a new shared-versus-editorial remediation taxonomy in this plan and
do not move or copy normalization allowlists. That classification is not needed
to solve issue #20 and would add a second high-risk identity seam to an already
large scanner change.

Never state that a sampled template finding affects untested pages. A family
may be named only in coverage methodology unless every listed affected URL
contains a real candidate merged into the finding.

**Verify**: ranking, statistics, metadata, methodology, Core Web Vitals,
priority, and appendix tests pass in French and English. Tests cover one finding
on 375 observed pages, 28 image-alt occurrences on 19 pages, Lighthouse
failure, planned Lighthouse skip, guarded omissions, no invented family reach,
and a legacy manifest.

### Step 10: Verify locally, then validate against an authorized real site

Run formatting, documentation, focused suites, full project checks, fixture
refresh when normalization source moved, and the complete unit/e2e suite.

Record before/after local measurements for the generated 375-post profile:

- inventoried URLs;
- rendered/axe pages;
- Lighthouse pages;
- repeated listing families;
- omitted continuation URLs;
- distinct findings and total occurrences;
- wall-clock Lighthouse invocations, not an extrapolated duration.

The expected behavioral proof is:

- content-sensitive coverage does not shrink for any successfully crawled HTML
  page, including listings;
- Lighthouse invocations scale with families/languages/outliers rather than
  post count;
- archive/listing repetition does not dominate expensive work;
- no finding gains an unobserved affected URL;
- existing fixture finding identities and occurrences stay unchanged.

After local acceptance, ask for fresh authorization before running a browser
audit of `hotelpointfrance.com` or any other third-party site. A real validation
must compare the new coverage manifest and bilingual methodology with the
public sitemap, read the report as a client, and confirm that transactional and
content-specific defects remain visible. Delete or de-identify any fixture
promoted from that run according to the existing artifact rules.

**Verify**:

```bash
pnpm run format
pnpm run docs:check
pnpm run check
pnpm run test:all
git diff --check
```

All exit 0. `pnpm fixtures:refresh` and fixture-freshness tests pass if a
normalization source file moved. Record exact test counts, generated report
paths, coverage totals, and manual FR/EN review results. Do not mark the plan
`DONE` until the authorized real-site output has been reviewed; use
`IMPLEMENTED` while that review remains.

## Test plan

- `packages/scanner/src/page-audit-profile.test.ts`: role signals, structural
  hashing, volatile-data removal, confidence, multilingual partitioning,
  conflicting facts, and missing-profile fallback.
- `packages/scanner/src/full-audit-plan.test.ts`: 375-post generated fixture,
  stable and outlier Lighthouse representatives, mandatory pages, all-page
  content coverage, input-order invariance, and no-propagation invariant.
- `packages/scanner/src/check-scope-coverage.test.ts`: every existing detector
  result and companion error field has exactly one declared scope, pass,
  applicability rule, and completion signal.
- `packages/scanner/src/crawl.e2e.test.ts`: profiles extracted during existing
  navigation, listing traversal, continuation guard, sitemap/seed immunity.
- `packages/scanner/src/scan-page.test.ts`: rendered and Lighthouse functions
  preserve errors, delay, and check ordering.
- `packages/scanner/src/scan-site.test.ts` and `.e2e.test.ts`: staged planner,
  lanes, selected Lighthouse, cancellation, and progress events.
- artifact/store tests: optional coverage round trip, pages without content
  analysis grouped by reason, completed/partial/failed/not-planned outcomes,
  omitted family, and legacy tolerance.
- audit-stage, route, and `packages/cli/src/commands/audit.test.ts`: current
  coverage summary, guarded omissions, failures, and a legacy manifest without
  pass provenance.
- queue/dashboard tests: independent targets and ETAs, transitional selection,
  cancellation, planned skips, and bilingual copy.
- `packages/llm/src/structure-ranking.test.ts`: axe-completed denominator and
  unchanged broad-impact promotion.
- report tests: inventoried/content/Lighthouse coverage, distinct findings,
  affected pages and occurrences, no invented family reach, failure versus
  planned skip, and legacy fallback.
- Existing reference fixtures: finding IDs, rule coverage, concentration,
  occurrences, translation clusters, and freshness remain reviewed.

## Done criteria

- [ ] Canonical docs define inventory, content checks, Lighthouse sampling,
      continuation guards, and coverage disclosure without claiming every tool
      runs on every URL.
- [ ] A deterministic profile and planner classify without a model, with
      unknown pages falling back to fuller coverage.
- [ ] Every successfully crawled HTML page, including every listing, receives
      rendered, axe, and extended checks.
- [ ] Lighthouse selections scale by family/language/outlier and always include
      homepage, transactional, seeded, unique, and fallback pages.
- [ ] Repeated listings are traversed and content-checked without receiving
      Lighthouse unless another mandatory rule selects them.
- [ ] The continuation-family guard never removes seeds or any eligible
      sitemap-declared URL and always records omissions.
- [ ] No sampled finding is propagated to an untested page.
- [ ] Manifest, Mongo, progress, dashboard, normalization denominators, and
      report copy distinguish completed, partial, failed, and not-planned
      passes.
- [ ] The locked `Finding` v1, severity mapping, LLM schema, and two-pass dedupe
      remain unchanged.
- [ ] French and English reports distinguish distinct findings, affected pages,
      occurrences, inventory coverage, content checks, and performance sample.
- [ ] `pnpm run check` exits 0.
- [ ] `pnpm run test:all` exits 0.
- [ ] Local 375-post measurement proves bounded Lighthouse work without losing
      content checks on any crawled HTML page.
- [ ] An authorized real-site review passes, or status remains `IMPLEMENTED`
      with that exact review outstanding.
- [ ] Only in-scope files are changed, and `plans/README.md` is current.

## STOP conditions

Stop and report instead of improvising if:

- plans 018, 019, or 020 are incomplete or have uncommitted changes;
- implementation requires modifying a locked contract;
- a new package or dependency appears necessary;
- page profiling would require storing raw HTML, body text, or full page
  content;
- the only way to classify a listing is a URL-path allowlist;
- a low-confidence page would receive fewer checks than today;
- a sampled finding would need to be copied to untested pages to make the
  report coherent;
- no defensible continuation-family threshold can be established from local
  evidence;
- the continuation guard would omit a seed or any eligible sitemap-declared
  URL;
- existing offline normalization cannot represent planned skips without
  pretending they are scanner failures;
- the change requires lowering rule-coverage or concentration ratchets;
- a focused verification fails twice after a reasonable correction;
- live validation lacks current authorization for the named site.

## Maintenance notes

- Every new scanner check must declare its scope. The coverage ratchet should
  fail when a result field is added without that decision.
- Increment the planner/profile version when classification facts, hash inputs,
  thresholds, or representative selection change. Monitoring must never compare
  two plans as if only the website changed.
- Template family IDs are scheduling provenance, not finding identity and not a
  client-facing assertion that all family members are byte-identical.
- Keep conservative fallback behavior. False splitting costs time; false
  merging can hide a real defect.
- A future decision to sample axe requires a separate measured plan. It is not
  authorized by this one.
- Revisit Lighthouse representative counts only from measured scans and report
  quality, not because one site is unusually large.
- Issue #20 remains open until implementation is committed, verified, and the
  real-site review evidence is posted with the closing commit.
