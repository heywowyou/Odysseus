# Plan 069: Align the outreach preview with grounded reports and scoped diagnostics

> **Executor instructions:** implement this plan against the latest `main` after
> Plans 067 and 068. Rebaseline immediately before implementation if `main`
> moves. The preview remains a separate public-safe document kind; do not turn it
> into a projection of `GenerateReportInput`, do not add another LLM call, and
> do not revive Plan 058/059 approval semantics.

## Status

- Priority: P1
- Effort: L
- Depends on: 067, 068
- Execution status: IN PROGRESS — implementation is on `main`; repository-wide validation and the stored-audit no-rescan acceptance remain externally blocked
- Planning rebaseline: `105500fed7a8c38c39257872e9ab2064803495b3`
- Target content version: `v3`

## Objective

Bring the public outreach preview into semantic alignment with the report
pipeline shipped by Plans 067 and 068.

The preview must remain deliberately thinner than the paid report, but it must
no longer tell a parallel story.

> **One Full scan, one selected report structure, one set of measured facts,
> one set of scoped client limitations. The preview is the safe public
> projection of that story, not an independently ranked scorecard.**

New preview publication therefore uses:

1. the same audit and current findings provenance as the ready reports;
2. the selected French analysis as the priority-order authority;
3. the report renderer's exact priority-selection/view-model logic;
4. deterministic reviewed public copy for the actual public wording;
5. the same Plan-068 client limitations as the report;
6. the selected analysis's deterministic obligation assessment for the bounded
   legal-facts block.

No model prose, raw evidence, finding identifiers, selectors, exact URLs,
remediation, screenshots or operational scanner warnings may enter the public
document.

## Corrective last-pass decisions

The repository call graph changes four details from the initial brainstorm.

### 1. Keep the Plan-050 crawl-completeness gate

`isOutreachQualifyingAudit()` uses `assessCrawlCoverage()` to answer whether
the declared crawl completed. Plan 068 diagnostics answer a different question:
whether some claims inside an otherwise completed audit need qualification.

Do not merge those concepts.

- incomplete declared crawl -> no preview;
- completed crawl + `complete` diagnostics -> normal v3 preview;
- completed crawl + `limited` diagnostics -> v3 preview with client
  limitations;
- completed crawl + diagnostics `unavailable` -> v3 preview with a bounded
  "detailed diagnostics unavailable" disclosure, not a refusal.

### 2. Use selected analysis only for ordering, never for public prose

The selected French analysis is allowed to decide *which* report priorities are
first because the paid report already commits to that structure. Its
`executiveSummary`, theme titles, business-impact prose, recommended actions,
notes and `overallRisk` are not public-preview copy.

Build the report's exact `RenderedPriority[]`, then turn the first three
priorities into safe preview cards using each priority's deterministic
representative finding and the existing reviewed bilingual proof-card catalog.

If the first three rendered priorities cannot each resolve reviewed public-safe
copy, fail closed rather than silently substituting unrelated lower-ranked
findings.

### 3. Remove the preview-only grade/risk hero in v3

The v2 preview computes its own severity grade and a separate three-point risk
scale because its contract has no report risk judgment. That is exactly the kind
of parallel top-level story this plan removes.

V3 leads with measured scope/results and ordered priorities. It does not render
the v2 letter-grade/risk hero. Existing v1/v2 objects remain unchanged.

### 4. Persist the exact Touch-1 bridge facts

The v2 draft resolver recomputes aggregate facts and proof-card categories from
current findings. Once card selection follows report priorities, recomputation
could describe a different story from the already-published object after a
report regeneration.

A v3 publication row therefore records the bounded public-safe facts Touch 1
needs, together with semantic lineage:

- selected French `sourceAnalysisId`;
- current `sourceFindingsDigest`;
- distinct-finding count;
- affected-page count;
- severity totals;
- the published priority-card categories.

Touch 1 reuses those recorded facts instead of recomputing them. A v3 preview
whose source analysis is no longer the selected French analysis is stale for a
new first-touch draft and must be reissued.

## Binding decisions

1. **V3 for new publications.** New preview publications use content version
   `v3`. Existing v1/v2 public objects and rows continue to load, expire,
   revoke and support already-established compatibility paths; they are not
   rewritten in place.
2. **Separate safe contract.** `OutreachPreviewSummaryV3` remains in core and
   is strict. It shares no type with `GenerateReportInput` and has no field
   capable of carrying model prose, exact URLs, selectors, IDs, remediation or
   raw evidence.
3. **Current reports still prerequisite publication.** The existing current
   FR+EN report-readiness gate remains. No rescan is introduced.
4. **French structure is canonical.** V3 priority order is derived from the
   currently selected French analysis. English rendering uses that same
   structure; it does not independently choose priorities.
5. **Exact report selection logic.** Reuse/export
   `buildRenderedPriorities()`; do not copy its selection/promote/expansion
   algorithm into outreach code.
6. **Exactly three priority cards.** V3 renders the first three report
   priorities. Each card uses the priority view model's representative finding
   only to select reviewed public copy/category/severity/page reach. If three
   safe cards cannot be built, publication refuses.
7. **No model wording.** Theme title, impact prose, actions, executive summary,
   notes and model risk never enter v3.
8. **Plan-068 limitations are shared.** V3 renders
   `complete | limited | unavailable` scan-data quality. Only
   `clientLimitations` may be shown. `operationalWarnings` are private.
9. **Limitations are bounded copy.** Render the existing bilingual
   `EvidenceLimitation.summary` strings. Do not ask a model to summarize or
   rewrite them.
10. **Legal facts use real report lineage.** Build the preview's bounded facts
    block from the selected French analysis's existing
    `obligationAssessment`, never `assessment: undefined` when the selected
    report already has that deterministic assessment.
11. **No legal widening.** The preview still never states that the prospect is
    legally bound, never prints sanctions/deadlines/case-law argumentation and
    never turns the report's legal prose into outreach copy.
12. **Touch-1 facts are snapshot facts.** V3 draft assembly consumes the exact
    bounded facts recorded at publication. It must not recompute card
    categories from a later selection.
13. **V3 lineage can become stale.** If the selected French analysis changes,
    a previously published v3 preview remains reachable until revoked/expired
    but cannot seed a new Touch-1 draft. The operator reissues it.
14. **Zero extra provider calls.** The preview consumes stored deterministic and
    already-selected report artifacts only.
15. **No rescan migration.** Existing stored Full scans can produce v3 once the
    current reports/selected analysis and diagnostics are available. Historical
    v1/v2 previews are not migrated.

## Target v3 document

The French-first reading order is:

1. shared diagnostic cover;
2. short deterministic introduction;
3. **Résultats mesurés** — inventoried/content-checked/performance-measured
   counts, distinct findings, affected pages, non-zero severity totals;
4. **À traiter en premier** — exactly three cards in the same order as the
   first three paid-report priorities, expressed only with reviewed public-safe
   representative-finding copy;
5. **Qualité des données du scan** — Complet / Exploitable avec limites /
   Diagnostic détaillé indisponible, plus bounded client limitations where
   present;
6. **Cadre réglementaire à vérifier** when source capabilities permit it;
7. **Le diagnostic complet** — EUR 990 HT offer and reply CTA;
8. Article-14/privacy/expiry disclosure.

The English version mirrors the same structure and selected priorities.

## Target v3 data contract

The public render contract should be equivalent in shape to:

```ts
interface OutreachPreviewSummaryV3 {
  contentVersion: 'v3';
  observedAt: Date;
  language: 'fr' | 'en';
  recipient: OutreachPreviewRecipientFacts;
  links: { offer: string; privacy: string; optOut: string };
  coverage: OutreachCoverageFacts;
  distinctFindingCount: number;
  affectedPageCount: number;
  severityTotals: Record<OutreachPreviewSeverity, number>;
  priorityCards: [
    OutreachPriorityCard,
    OutreachPriorityCard,
    OutreachPriorityCard,
  ];
  dataQuality: {
    status: 'complete' | 'limited' | 'unavailable';
    limitations: Array<{ code: string; summary: { fr: string; en: string } }>;
  };
  facts: OutreachFactsBlock;
}
```

The public contract deliberately does **not** contain analysis IDs, findings
digests or report IDs. Those belong to the private publication row.

## Private publication lineage

Extend v3 preview persistence with optional compatibility fields that are
required by the v3 service path:

```ts
sourceAnalysisId?: string;
sourceFindingsDigest?: string;
publishedFacts?: {
  distinctFindingCount: number;
  affectedPageCount: number;
  severityTotals: Record<OutreachPreviewSeverity, number>;
  priorityCardCategories: FindingCategory[];
};
```

V1/v2 rows remain valid without them.

## Implementation steps

### 0. Rebaseline main

Pull/read latest `main`, confirm Plans 067/068 seams, and record the execution
head in this plan before changing code.

### 1. Add the strict v3 core contract

In `packages/core/src/types/outreach-preview.ts`:

- add `OUTREACH_PREVIEW_CONTENT_VERSION_V3`;
- add strict v3 summary/data-quality/priority-card schemas;
- reuse the existing safe link, count, facts and prohibited-content guards;
- keep v1/v2 types untouched for historical compatibility;
- assert that limitation summaries and priority-card copy pass the same public
  content guard.

Add focused contract tests for unknown fields, prohibited content, count
invariants and limitation/card bounds.

### 2. Reuse the report priority view model

Export `buildRenderedPriorities` and its required public types from
`@odysseus/report`.

The v3 builder must run that exact function on:

- selected French analysis themes;
- current normalized findings;
- the audit manifest;
- French as the canonical structural language.

Take the first three `RenderedPriority` rows. For each, use
`priority.evidence.representativeFinding.ruleId` to resolve the existing
reviewed public proof-card copy. Do not render the stored theme title.

### 3. Add the v3 renderer

Create a v3 HTML renderer/string table (or a clearly versioned equivalent)
without mutating historical v2 output.

Reuse the accepted report/preview visual language, but change hierarchy to the
target v3 document above. In particular:

- no v2 grade/risk hero;
- results before priorities;
- priority rank visible as 1/2/3;
- data-quality section after priorities;
- limitations rendered only from bounded bilingual summaries;
- no operational-warning section;
- actual deterministic legal facts;
- same EUR 990 HT source and Article-14 disclosure;
- self-contained zero-network HTML.

Update operator PDF rendering to accept the current v3 editorial contract while
continuing to print historical v2 HTML where needed.

### 4. Build v3 from the exact selected report lineage

Replace the new-publication builder with a v3 path that resolves in one bounded
adapter flow:

- newest Plan-050 qualifying Full scan;
- current FR+EN report readiness;
- current selected French analysis;
- current findings;
- Plan-068 evidence diagnostics from the audit artifact;
- prospect/public-recipient facts.

Refuse when no selected French analysis exists or when it does not match the
current findings/report readiness.

Use its `obligationAssessment` in `buildOutreachFactsBlock`.

### 5. Persist lineage and exact Touch-1 facts

Extend the preview schema/service so v3 rows persist the private lineage and
bounded published facts defined above.

The stored HTML remains the public source of truth for what a visitor sees.
The stored bounded facts are the private source of truth for what Touch 1 may
say about that published preview.

### 6. Make Touch 1 v3-aware without breaking live v2

Update published-preview resolution:

- v3: require the row's source analysis still to be the current selected French
  analysis; return the row's recorded `publishedFacts`; never recompute card
  categories;
- v2: preserve the existing compatibility resolver for already-live rows;
- v1: preserve its existing historical behavior only where it is already
  supported; no new v1 path.

A stale v3 row gets a typed refusal that points the operator toward reissue, not
a rescan.

### 7. Update the audit-detail preview path

The authenticated render/PDF/publish endpoints use the same v3 builder as
publication.

Update "live preview" detection to treat v3 as current while still displaying
historical v2 live records truthfully.

No public endpoint gains database access; `packages/site` remains an opaque
object reader.

### 8. Update canonical copy and docs

Update:

- `docs/rules/outreach-rules.md`;
- `docs/rules/offer-positioning.md`;
- `docs/report/report-design-system.md`;
- `docs/rules/llm-layer-rules.md` where the no-extra-model/public-projection
  boundary is described;
- `docs/decisions/trade-offs.md`;
- relevant dashboard preview strings/comments;
- experiment documentation that currently assumes v2 grade/proof-card facts.

Be explicit that Plan-050 crawl qualification remains a gate while Plan-068
client limitations do not.

## Focused tests

Tests must prove all of the following:

- new publication records `previewContentVersion: 'v3'`;
- v1/v2 stored objects remain readable/revocable/expirable without rewrite;
- an incomplete Plan-050 crawl still refuses publication;
- a completed audit with `limited` diagnostics publishes and renders only
  client limitations;
- an operational warning alone does not appear publicly and does not block;
- diagnostics `unavailable` publishes with bounded unavailable copy;
- the three v3 cards correspond, in order, to the first three
  `buildRenderedPriorities` rows;
- v3 card copy comes from the reviewed catalog, not stored model theme text;
- a top-three priority without reviewed public copy refuses rather than
  substituting a lower-ranked finding;
- the v3 HTML contains none of the selected analysis's executive summary,
  theme titles, business-impact text, recommended actions, notes or model risk;
- v3 has no independent grade/risk hero;
- the real selected `obligationAssessment` reaches the facts builder;
- no legal conclusion, deadline or sanction wording can pass preview lint;
- v3 row records source analysis, findings digest and bounded published facts;
- Touch 1 uses those exact stored facts;
- changing the selected French analysis makes an existing v3 preview stale for
  a new first draft;
- current v2 draft compatibility remains green;
- FR/EN string parity and language-leak tests pass;
- axe tests pass at the existing preview viewport matrix;
- HTML remains self-contained with no remote asset/script;
- preview path adds zero LLM/provider calls;
- report generation/provider-call budgets from Plans 067/068 remain unchanged.

## Acceptance

Using one existing stored Full scan with current reports, without rescanning:

1. render the private French preview and operator PDF;
2. verify its three priority cards match the first three priorities in the
   selected French paid report;
3. verify measured counts match the report;
4. if diagnostics are limited, verify the same client limitations appear in
   bounded form and operational warnings do not;
5. verify the legal facts block uses the same deterministic obligation
   assessment facts without stating a verdict;
6. publish v3, load the opaque public link, and verify the stored HTML is served
   unchanged;
7. create/review Touch 1 and verify its aggregates/card categories equal the
   exact v3 publication snapshot;
8. regenerate/select a different French analysis from stored evidence and
   prove the old v3 link remains reachable but refuses to seed a new Touch 1
   until reissued.

No live third-party rescan is required for acceptance.

## Out of scope

- changing scanner crawl depth/scheduling;
- changing Plan-050 scan qualification;
- changing normalization/severity;
- exposing selectors, URLs, finding IDs, occurrences or remediation;
- preview screenshots;
- putting model prose in outreach;
- a new reviewer/model call;
- Plan-058/059 approval revival;
- migrating stored v1/v2 HTML;
- changing the public token/expiry/bucket architecture.

## Definition of done

Plan 069 is complete when all new preview publications are v3; v3 uses the
selected French report structure for its first three priorities while keeping
public wording deterministic and reviewed; Plan-068 client limitations are
shown without operational warnings; legal facts come from the selected report
lineage; Touch 1 reuses the exact publication snapshot; stale semantic lineage
cannot seed a new first email; v1/v2 compatibility remains intact; no extra LLM
call or rescan is introduced; canonical docs are updated; focused tests and the
repository validation suite are green; and the no-rescan stored-audit
acceptance above is recorded.

## Requirement-to-proof closure ledger

| Requirement | Owner/seam | Proof |
| --- | --- | --- |
| v3 strict public contract | core preview types/schema | schema/prohibited-content tests |
| same report priority order | report priority view model + v3 builder | exact first-three parity fixture |
| no model prose | v3 builder/renderer | sentinel prose absence test |
| no independent risk story | v3 renderer | grade/risk absence test |
| scoped limitations | diagnostics -> v3 summary | complete/limited/unavailable fixtures |
| no operational leakage | diagnostics projection | environment-warning fixture |
| crawl gate preserved | Plan-050 qualification adapter | incomplete-crawl refusal fixture |
| deterministic legal facts | selected FR analysis -> facts builder | assessment propagation test |
| exact Touch-1 snapshot | preview persistence + draft resolver | no-recompute/stored-facts test |
| stale lineage refusal | v3 draft resolver | changed-analysis fixture |
| v2 compatibility | legacy resolver/site/store | existing v2 tests unchanged/extended |
| public-site isolation | opaque object route | package-isolation tests |
| zero provider calls | dependency/call-budget tests | existing 067/068 budgets + preview no-provider test |
| FR/EN/a11y | report preview tests | parity, leak and axe suites |
| no-rescan acceptance | existing stored Full scan | dated operator acceptance record |

## Implementation record — 2026-09-19

Implementation landed directly on `main` after the planning/corrective pass:

- `e9aee741` — plan/rebaseline committed;
- `15427a10` — strict v3 core contract and renderer;
- `f0d6316c` — selected-report lineage, persisted snapshot facts and v3 publication;
- `875d47d1` — audit/prospect/draft workflows switched to v3 with v2 compatibility;
- `d921a472` — focused report-alignment, stale-lineage, diagnostics, FR/EN and renderer proofs;
- final corrective closure pass: restores the card-count invariant in the v3
  schema, makes the shared operator PDF validator explicitly accept both
  historical v2 and current v3 editorial contracts, and updates the canonical
  product/rules/design/experiment documentation.

The implementation makes no scan or provider call. New publication is v3;
historical v1/v2 storage/public objects remain untouched. The v3 first three
cards are selected by the exact paid-report priority view model but use only
reviewed deterministic public copy. Plan-068 client limitations are projected
without operational warnings. Touch 1 reads the exact publication snapshot and
refuses stale selected-analysis/findings lineage instead of recomputing it.

### Verification state

GitHub Actions run `35433792438` on implementation head `d921a472` failed
**before any job step started**: the Security scan, test and custom-Semgrep jobs
all ended with `runner_id: 0` / zero steps, and no job log existed to fetch.
Vercel's commit status succeeded. This is the same pre-step Actions execution
failure shape already recorded by Plans 067/068, not a test assertion from the
Plan-069 code.

Because no executable checkout/saved audit artifact is available through this
session's repository tools, the Definition-of-done items that require actual
command execution and the dated no-rescan stored-audit acceptance cannot be
truthfully marked complete here. No live rescan was run. Under
`plans/README.md`'s status definition this plan therefore remains **IN
PROGRESS** even though the code/document implementation is complete on
`main`; close/archive it only after the repository validation suite executes
green and the stored-audit acceptance is recorded.

