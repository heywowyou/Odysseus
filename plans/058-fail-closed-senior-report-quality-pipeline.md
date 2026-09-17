# Plan 058: Make the paid report fail closed on content and exact-PDF quality

> **Executor instructions**: Follow this plan in order. The objective is not
> “better on average”. A paid report is deliverable only when the **exact PDF
> bytes** that will be delivered have passed the deterministic, editorial,
> visual, cross-renderer, bilingual, and final-approval gates below. Cost and
> model-call count are explicitly not optimization targets. Never downgrade a
> required model, skip pages, lower image fidelity, shorten review, or ship the
> least-bad iteration to save money. If the pipeline cannot converge to a clean
> candidate, stop in `needs-operator-review`. Preserve unrelated work. When
> complete, move this file to `plans/archive/`, update `plans/README.md`, and
> record the durable decisions in the owning canonical docs.
>
> **Drift check (run first)**:
> `git diff --stat 1899499c2f3d14c19cc350b248008e971d62bb16..HEAD -- CLAUDE.md docs/rules/llm-layer-rules.md docs/rules/report-writing-style.md docs/report/report-design-system.md docs/report/report-design-tokens.md docs/report/report-workbench.md packages/core/src packages/llm/src packages/report/src packages/interface/src/pipeline packages/interface/src/queue packages/interface/src/dashboard packages/store/src scripts/report-workbench.ts deploy`
> If any in-scope file changed, compare this plan with live code first. Preserve
> the outcomes and contracts below; update stale seams rather than blindly
> applying old line numbers.

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH — paid-report production, model contracts, pagination, job
  phases, artifact persistence, and final delivery all change and must fail
  closed.
- **Depends on**: plans 027, 033, 039, 050, 051 (already delivered)
- **Category**: paid-report quality, senior LLM pipeline, exact-PDF QA
- **Planned at**: commit `1899499c2f3d14c19cc350b248008e971d62bb16`,
  2026-09-17
- **Revised**: six independent hardening passes, 2026-09-17

## Scope

**In scope**: the paid full-audit FR/EN report pair, its analysis, review,
rendering, exact-PDF QA, quality artifacts, operator approval, and delivery.

**Out of scope**: the outreach preview, outreach emails, new scanner rules, a
new legal-conformity claim, and using a model to discover website findings from
screenshots. Existing scanners remain the finding authority.

Historical reports remain historical. Plan 058 governs every newly generated
or regenerated paid report after promotion; it does not retroactively mark old
reports invalid.

## Binding operator decisions

1. **Quality is the objective; cost is not.** Optimize inference or compute
   only after the shipped quality contract is measured unchanged.
2. **Content and visuals are equally blocking.** Good prose over a broken page
   is a failed report. Beautiful pages with wrong interpretation or data are a
   failed report.
3. **The exact PDF is the review artifact.** JSON, HTML and the post-Paged.js
   DOM are intermediate evidence. Every page of the emitted PDF is reviewed.
4. **Scanner evidence remains authoritative.** Models can identify a likely
   mismatch, misleading synthesis, or conditional interpretation, but cannot
   silently rewrite findings, Lighthouse measurements, legal facts, identity,
   or deterministic counts.
5. **No whole-document reroll after the first accepted draft.** Repairs are
   patches to exact structure/prose/layout addresses. Already-good work must
   not be re-randomized to fix an unrelated defect.
6. **No “ship after N tries”.** A loop ceiling only prevents runaway work.
   Reaching it means `needs-operator-review`.
7. **Report page images may be model input only for report QA.** Website raw
   HTML/full page content remains forbidden. A report image is never evidence
   from which a reviewer may invent a new website finding.
8. **No arbitrary runtime CSS/HTML from a model.** Models may select only
   predeclared layout variants. Unknown layout defects stop for a source fix.
9. **Automated approval does not replace the operator.** The quality pipeline
   ends in `awaiting-operator-approval`. The operator approves the exact digest;
   that action promotes the already-reviewed bytes without rerendering.
10. **Confidential report data is not sprayed across providers.** Cross-provider
    diversity is allowed only for providers explicitly approved for this client
    data boundary. Otherwise use independent stateless calls on the approved
    provider; never trade privacy for nominal model diversity.

## What “perfect” means operationally

No software can prove that no human will ever prefer a different aesthetic.
For Odysseus, “perfect” means **zero known material defect in the exact bytes at
approval time**, with independent attempts to falsify that result.

A candidate may reach `quality-approved` only if all of these hold:

- every report finding traces to current findings provenance;
- all exact quantities are deterministically bound to canonical facts, not
  typed freehand by a model;
- no unsupported site-specific claim remains;
- no remediation project mixes materially different work;
- systemic repetition is synthesized when evidence shows concentration;
- conditional evidence remains conditional;
- French is native, restrained, concise consulting prose and English preserves
  the same meaning;
- every deterministic content and legal guard passes;
- every existing Paged.js/render gate passes;
- the final PDF passes post-PDF text geometry, font, structure, page-size,
  extractability and cross-renderer checks;
- no visible text is overlapped, clipped, hidden, duplicated, stranded,
  unreadably dense, or outside its intended semantic block;
- every physical page is reviewed by two independent visual reviewers, and a
  fresh final visual sweep reviews every page again after the last change;
- a whole-document visual review sees no blocking/major rhythm or hierarchy
  problem;
- bilingual parity passes;
- the final independent arbiter approves with zero unresolved blocking/major
  issue;
- the exact approved bytes survive private storage and operator promotion with
  the same SHA-256 digest;
- no client-facing input changed after the quality run snapshot.

Overlap, clipping, fallback fonts, wrong numbers, mixed remediation, unsupported
claims, misleading conditionality, unreadable density, broken page fragments,
and stale content are never “minor”.

---

# Six-pass hardening review

This revision was produced by six deliberately different reviews of the first
version of plan 058. The findings below are binding changes, not commentary.

## Pass 1 — Evidence authority, arithmetic and context completeness

### Defects found

The first plan still let the model emit free-form quantities and then proposed
a verifier to discover whether they matched the fact registry. That is weaker
than preventing numeric drift. It also proposed feeding every finding to one
senior call, which can dilute attention or exceed practical context on very
large audits. Finally, approval invalidation did not have one canonical digest
covering **all** client-facing upstream inputs.

### Required correction

- Introduce a `ReportInputSnapshot` covering every client-facing input.
- Introduce `EvidenceBoundText`: exact quantities enter prose through typed
  fact-reference segments/placeholders and are formatted by code.
- Use hierarchical evidence packets for large audits; never rely on one giant
  prompt containing thousands of repetitive rows.
- Maintain a deterministic `CoverageLedger` proving every relevant finding was
  considered even when model input is aggregated.
- Treat page-role classification as a bounded signal with provenance and
  confidence, not unquestioned fact.

## Pass 2 — Model independence, false positives and prompt-injection safety

### Defects found

Two critics can improve recall but can also hallucinate problems and damage a
correct draft if every isolated criticism automatically causes a rewrite. The
first plan also protected text evidence from prompt injection but did not
explicitly protect **visual** reviewers from instruction-shaped text rendered
inside the report itself.

### Required correction

- A critic never mutates output.
- Issues agreed by both critics or backed by a deterministic gate are accepted.
- A blocking/major issue raised by only one critic goes to an independent issue
  adjudicator before any patch. `unsure` blocks rather than causes speculative
  rewriting.
- Every model that sees scanner text or report images receives the untrusted
  evidence notice. Text visible inside a PDF image is data, never an instruction
  to the reviewer.
- Model roles have no external tools/actions during report review.
- Every patch has a machine-enforced semantic diff: only declared addresses may
  change.
- Requested model alias **and provider-returned resolved model identifier** are
  persisted so silent provider repointing is visible.

## Pass 3 — Exact-PDF geometry, fonts, portability and accessibility

### Defects found

DOM geometry can be clean while the emitted PDF has a glyph/text-layer defect.
A single Poppler raster is also not enough to prove broad PDF-reader
portability. The first plan did not explicitly validate font embedding or the
accessibility/reading-order quality of the report PDF itself.

### Required correction

- Add post-PDF text bounding-box checks from the emitted bytes, not only DOM
  rectangles.
- Assert expected fonts are embedded and reject unexpected fallback/unembedded
  fonts.
- Run a structural PDF checker and verify page size/rotation/count.
- Raster every final page through **two independent PDF renderers** (Poppler
  plus MuPDF or an approved equivalent). Material divergence is blocking.
- Keep a 300-DPI canonical raster; reviewers may receive a provider-sized
  derivative only when input limits require it, with automatic high-resolution
  crops for dense regions.
- Verify tagging/language/bookmarks/selectable text/reading order. Do not claim
  PDF/UA unless a dedicated conformance tool proves it; nevertheless the report
  must not regress into an inaccessible or image-only PDF.

## Pass 4 — Concurrency, crash recovery and exact delivery

### Defects found

A multi-pass run can last long enough for redeploys, cancellation or stale
workers. A normal lock alone is insufficient if an old worker resumes and
persists after a newer run has replaced it. The first plan also ended exactness
at local persistence rather than proving the stored/downloaded object is the
same file.

### Required correction

- Every quality run gets an immutable `qualityRunId`, input snapshot digest,
  lease token and monotonic generation/epoch.
- Only the current lease/epoch may patch, approve or promote a candidate.
- Cancellation invalidates the lease; late model responses are discarded.
- Quality artifacts form a content-addressed dependency DAG. Reuse is allowed
  only when every dependency digest still matches.
- Candidate storage is private and not addressable by report download routes.
- After upload, verify stored object checksum/read-back before exposing the
  report. The public/operator download path serves the approved object; it
  never rerenders on download.
- Runtime/browser/font/tool versions and font-file hashes become part of the
  render fingerprint.

## Pass 5 — Evaluation, fault injection and model-change regression

### Defects found

Twelve real audits are useful but cannot cover the combinatorial layout surface
or prove that critics catch known bad content without damaging known-good
content. One successful evaluation run is also vulnerable to model
nondeterminism.

### Required correction

- Add deterministic property/fuzz generation over report shapes and content
  lengths with committed seeds.
- Add a **content fault-injection corpus**: wrong count, stale identity, mixed
  remediation, unsupported business claim, unconditional noindex, wrong WCAG
  version, bilingual drift, missing priority and duplicated finding.
- Add visual fault injection: overlap, clipping, fallback font, corrupted text
  layer, missing tag/bookmark, duplicate fragment and cross-renderer divergence.
- Include known-good control reports. Reviewers must not force changes to clean
  controls.
- Run repeated live evaluations on the same benchmark audits to expose unstable
  model behavior. Exact prose may vary; facts, plan coherence and gate outcome
  may not.
- Any model, prompt, schema, design-token or renderer change that can affect
  client output reruns the relevant acceptance corpus before promotion.

## Pass 6 — Design intent, typography, operator approval and final-byte UX

### Defects found

A generic visual reviewer can mistake intentional white space or the light
print insert for a bug unless it receives machine-readable page intent. The
first plan also left French typographic polish largely to taste and promoted an
automatically approved file too early.

### Required correction

- Add a machine-readable `ReportVisualContract` and per-section
  `VisualIntent`, tied to real template/token constants; do not parse Markdown
  docs at runtime.
- Add deterministic French/English typography lint/normalization where safe
  (spacing around punctuation, non-breaking units/percentages, quotation
  marks, orphan punctuation, malformed line-breaking tokens) before render.
- Automated success produces a private `quality-approved` candidate.
- The dashboard shows that exact candidate and digest to the operator.
- Operator approval promotes **the same bytes**, without rerender or mutation,
  to the client report record.
- Any requested edit creates a new quality iteration and invalidates the old
  automated approval.

---

# Current state to preserve or intentionally supersede

## LLM

- Current production uses one global model constant and constrained structure +
  writing passes.
- Structure and writing are already separate — retain that separation.
- Existing schemas, local Zod validation, invented-ID guards, language/legal
  guards, retry pacing and provenance are valuable and remain.
- Existing shadow/correction reviewers are advisory; plan 058 introduces a new
  required paid-report quality path rather than pretending the old advisory
  artifact is sufficient.

## Renderer

- Paged.js remains the canonical pagination engine.
- Existing hard gates for layout-repeated, blank interior pages, duplicate
  fragments, bounded-unit splits and element-box overflow remain.
- `docs/report/report-design-system.md` remains the human visual authority.
- `docs/report/report-workbench.md` already establishes the correct diagnostic
  principle: inspect pages rasterized from the production PDF.

## Job/UI

- Current full-audit flow ends with analysis then immediate report generation.
- Plan 058 inserts an explicit private candidate/quality/approval lifecycle.
- Existing in-flight report locks remain and are strengthened with a quality
  run lease/epoch rather than replaced.

---

# Target architecture

```text
SCAN ONCE
   │
   ▼
canonical findings / measurements / manifest
   │
   ▼
A. ReportInputSnapshot + FactRegistry + CoverageLedger
   │
   ▼
B. hierarchical Evidence Dossier / Evidence Packets
   │
   ▼
C. SeniorReportPlan (language neutral)
   │
   ▼
D. FR + EN evidence-bound first drafts
   │
   ▼
E. two independent content critics
   │
   ├─ disagreement -> issue adjudicator
   ▼
F. targeted patches only
   │
   ▼
G. deterministic content reconciliation
   │
   ▼
H. private full candidate render
   │
   ▼
I. DOM/Paged.js deterministic gates
   │
   ▼
J. exact-PDF structural/font/text-geometry gates
   │
   ▼
K. 300-DPI raster through Poppler + second renderer
   │
   ▼
L. two independent all-page visual reviews
   │
   ├─ disagreement -> visual issue adjudicator
   ▼
M. bounded prose/layout repair -> full rerender -> repeat H-L
   │
   ▼
N. bilingual parity
   │
   ▼
O. fresh FINAL all-page visual sweep
   │
   ▼
P. independent final document arbiter
   │
   ▼
quality-approved private candidate
   │
   ▼
OPERATOR APPROVES EXACT DIGEST
   │
   ▼
checksum-verified promotion of EXACT bytes
   │
   ▼
client report record
```

The website is never rescanned because report QA found a report defect. Quality
iterations consume saved canonical audit evidence.

---

# Canonical data contracts

## `ReportInputSnapshot`

One deterministic, canonical snapshot taken at quality-run start. It includes
or hashes every client-facing input:

- audit id, site URL, findings provenance, scanner/tool/build versions;
- manifest/crawl/render/Lighthouse artifacts used by report facts;
- prospect-linked trading/legal name and SIREN snapshot;
- manual fields and origins;
- grade override;
- obligation assessment inputs/result;
- report preparation data;
- verified site context;
- reference-stat version(s);
- report languages;
- report template version, design-contract version, renderer/browser build;
- font filenames + content hashes;
- deterministic quality-tool versions.

`inputSnapshotDigest` is a dependency of every downstream artifact. If a
client-facing input changes, the current quality approval becomes stale.

Selective reuse is allowed only through explicit dependency declarations; never
infer that an edit “probably does not matter”.

## `AuditEvidenceDossier`

Deterministically produced:

- distinct page-scope facts with unambiguous names;
- severity/category totals;
- normalized finding inventory;
- finding families using a **conservative** remediation-relevant signature;
- occurrences, distinct findings, affected pages and coverage;
- WCAG references;
- concentration at 50/80/90% by findings and occurrences;
- performance distribution over exactly measured rows;
- render completeness;
- page-role signals with `source`, `confidence` and `unknown` fallback;
- diverted/heuristic flags;
- verified legal/business context already allowed by existing rules.

A family signature must not merge two contexts solely because they share a rule
ID. Use rule/category/severity plus the stable remediation/component/page-role
features available from normalization. When safe grouping cannot be established,
keep families separate.

## `EvidencePacket` and `CoverageLedger`

Large audits use hierarchical context rather than one huge prompt:

- global packet: facts, concentration, family index, performance and site context;
- one detailed packet per finding family/remediation signature;
- each packet contains representative evidence plus the exact finding IDs it
  covers;
- deterministic code records every eligible finding ID in `CoverageLedger` and
  proves each is either assigned to a project, intentionally appendix-only, or
  explicitly unresolved.

A model never gets to “forget” findings because a context window was crowded.
The global planner may work over family packets; a verification pass checks
project membership against detailed packets before the plan is accepted.

## `FactRegistry`

Stable typed facts, for example:

```text
scope.urlsInventoried
scope.pagesCrawled
scope.contentPagesAnalysed
scope.axePagesMeasured
scope.lighthousePagesMeasured
findings.total
findings.accessibility.total
family.<key>.findings
family.<key>.occurrences
family.<key>.pages
performance.lcp.medianMs
performance.tbt.medianMs
```

Every fact includes type, unit, source artifact/digest and optional formatting
metadata.

## `EvidenceBoundText`

Do not ask a verifier to rediscover whether free-form numbers are correct.
Model-owned quantitative prose uses structured segments:

```text
text("...")
fact(factId, format)
standard(referenceId)
text("...")
```

Code renders `fact(...)` values from `FactRegistry`; the model never emits the
number itself. `standard(...)` similarly owns versioned references such as WCAG
where appropriate. Free-text exact quantities outside allowlisted identifiers
are rejected.

This contract applies to executive summaries, impacts, actions, notes and any
other model-owned prose that states exact quantities. Renderer-owned template
numbers continue to come directly from code.

## `SeniorReportPlan`

Language-neutral:

- exhaustive `remediationProjects[]`; **no target count**;
- project key, finding/family IDs, category, evidence/fact refs;
- likely root cause explicitly labelled as inference with confidence;
- conditionality and reason;
- effort/impact/rationale;
- `executivePriorityKeys[]` selecting only the projects deserving front matter;
- dependencies between projects where order matters.

One project = one coherent remediation job. A finding may belong to more than
one project only through an explicit `sharedDependency` edge validated by code;
default duplicate membership is rejected.

## `ReportVisualContract` / `VisualIntent`

Runtime machine-readable contract under `packages/report`, updated with the
human design docs and tested against section registry/tokens. It describes, per
page/component type:

- intended background/world;
- alignment/margins/measure;
- allowed intentional whitespace;
- expected density band;
- whether a component may split;
- whether a value must stay one line;
- allowed intentional overlays/decorations;
- checklist print inversion;
- typography role and minimum readable size;
- known compact variants.

Visual reviewers receive this contract. They do not invent a visual direction.

## `ReviewIssue`

Closed schema:

- `issueId`;
- `severity: blocking | major | minor`;
- domain: evidence-integrity, structure, priority, unsupported-claim,
  conditionality, language, typography, repetition, translation-parity,
  layout, overlap, clipping, density, pagination, table, code, font,
  cross-renderer, pdf-structure, accessibility, template;
- exact field/page/node target;
- evidence/fact/page/raster refs;
- reason;
- repair route;
- reviewer profile and resolved model ID;
- source artifact digest;
- `status: proposed | accepted | rejected | unsure | repaired | verified`.

## `ReportPatch`

A patch contains only exact changed addresses and the accepted issue IDs that
justify them. Application code computes a semantic before/after diff and rejects
any undeclared change.

Allowed changes:

- specific plan fields;
- specific prose fields/segments;
- specific predeclared layout hints.

Never allowed:

- scanner findings/evidence;
- deterministic facts/legal text;
- design tokens;
- arbitrary CSS/HTML/JS;
- client identity except through the normal upstream input layer.

## `ReportPageManifest`

Collected after final Paged.js layout and bound to candidate digest:

- physical page number/dimensions;
- page/section type + visual intent;
- stable logical `data-report-node` IDs;
- physical fragment IDs for Paged.js continuations;
- node rectangles;
- leaf text-line rectangles from `Range.getClientRects()`;
- font family/size/line-height where relevant;
- semantic invariants such as `single-line`, `no-split`, `table-header`;
- short text excerpts for diagnosis only.

## `ReportQualityRun`

Append-only lineage:

- qualityRunId, epoch, lease token hash;
- input snapshot/dossier/fact/coverage digests;
- every role/model/requested alias/resolved model/reasoning effort/prompt/schema;
- review/adjudication/patch artifacts;
- candidate digest per iteration/language;
- deterministic gate outputs;
- Poppler/MuPDF raster hashes;
- final review verdicts;
- operator approval digest;
- terminal state.

No chain-of-thought is stored. Telemetry remains metadata-only; client prose and
page PNGs stay private quality artifacts.

---

# Model role policy

Use role-specific profiles, not one global model constant:

```text
senior-analyst
writer-fr
writer-en
content-critic-a
content-critic-b
issue-adjudicator
editor
visual-reviewer-a
visual-reviewer-b
visual-issue-adjudicator
parity-reviewer
final-visual-reviewer
final-document-arbiter
```

Initial quality floor: use Sol High or a stronger approved role profile for
analysis/writing/editorial roles; visual roles must be image-capable. The
architecture remains model-configurable so future model changes do not require a
pipeline rewrite.

Rules:

- required roles never silently fall back to a cheaper/weaker profile;
- retry provider/rate-limit failures with paced backoff; inability to complete a
  required stage blocks the quality run;
- schema-constrained output + local Zod validation for every structured call;
- separate stateless contexts between writer, critics and arbiters;
- persist requested alias and the provider-returned model identifier;
- cross-provider diversity only through an approved data-processing profile;
- reviewers have no external tools/actions;
- scanner/report text and report images are untrusted data, never instructions;
- no reviewer sees hidden rationale/chain-of-thought from another role.

A model profile/prompt/schema change that may affect client output invalidates
benchmark approval until Step 22 is rerun.

---

# Content production contract

## Senior analysis

The senior analyst must:

1. explain the evidence instead of paraphrasing scanner titles;
2. detect concentration/systemic repetition;
3. distinguish fact from root-cause inference;
4. build one coherent repair job per project;
5. preserve conditionality;
6. prioritize by severity, breadth, user/business consequence and remediation
   leverage;
7. account for every eligible finding via the Coverage Ledger;
8. never invent or alter a finding.

For large audits, plan family-by-family from `EvidencePacket`s, then run a global
synthesis + deterministic coverage check. Do not force the entire raw audit into
one context window.

## Writer

Core register:

> Write as a senior French digital consultant preparing a document read first
> by the company director and then handed to the technical provider. Synthesize
> the evidence; do not narrate scanner output. Explain the practical meaning,
> distinguish systemic from isolated defects, keep one coherent remediation job
> at a time, and state only what the supplied evidence supports.

Keep hard terminology/legal rules. Remove style micromanagement that existed only
to compensate for weak writing, and move style quality into critics/lints.

Requirements:

- native, restrained French; equivalent natural English;
- no alarmism, filler, canned consultant rhetoric or repetitive AI cadence;
- significance first, technical action second;
- no fixed sentence quota when fewer sentences are complete;
- no worked runtime prose examples that invite copying;
- exact quantities through `EvidenceBoundText`, never hand-typed;
- clear fact/inference wording;
- actions concrete enough for a technical provider;
- no legal verdict beyond approved deterministic language.

## Deterministic typography polish

Before render, apply or lint safe language-specific typography without changing
meaning:

- French non-breaking spacing for punctuation/units/percentages where the
  design requires it;
- approved French quotation marks/apostrophes;
- no line beginning with stranded punctuation or unit where a non-breaking
  token can prevent it;
- preserve URLs, selectors, code and identifiers byte-for-byte;
- English punctuation rules remain separate;
- any transformation that could change semantics is a lint/review issue, not an
  automatic rewrite.

## Critics and issue adjudication

Both content critics see dossier/facts/plan/draft and independently look for:

- data/scope conflicts;
- misleading concentration presentation;
- mixed remediation;
- bad priority order or omitted high-leverage work;
- unsupported causality/site-specific claims;
- conditional noindex/legal/third-party/heuristic/wrapper errors;
- WCAG/severity/legal vocabulary contradictions;
- language quality/repetition/verbosity;
- weak or technically vague actions;
- parity defects when reviewing the pair.

They return issues only.

Issue acceptance:

- deterministic failure -> accepted;
- same blocking/major issue independently found by both critics -> accepted;
- issue found by one critic only -> independent adjudicator checks exact
  evidence/field; `accepted` may patch, `rejected` may not, `unsure` blocks for
  operator review rather than triggering speculative edits.

No automatic “majority vote” can make unsupported output true.

---

# Closed repair router

| Route | Used for | Allowed action |
| --- | --- | --- |
| `recompute-fact` | derived canonical mismatch | recompute in code; model cannot supply replacement |
| `patch-plan` | project membership/priority/conditionality | targeted plan patch + dependent prose rewrite only |
| `patch-prose` | unsupported/weak/repetitive language | exact field/segment patch |
| `layout-hint` | known shape problem | choose tested, predeclared variant |
| `rerender` | accepted content/layout change | whole candidate render from canonical state |
| `template-defect` | no safe bounded repair exists | stop, fix source globally, add regression |

Every patch runs semantic diff validation and all downstream guards again.

---

# Bounded layout hints

Add `ReportLayoutHints` keyed by stable report node. Initial safe variants:

- `breakBefore`;
- `keepWithNext` for bounded groups;
- `density: normal | compact` only on components with a designed compact form;
- `statValue: normal | compact`;
- `titleMeasure: normal | compact`;
- `disableFlow` for the short-section optimization;
- safe split marker selection for model-owned lists/cards whose template
  explicitly exposes split points.

Every variant is canonical source + fixture coverage. A model may select a
variant, never author one.

---

# Exact-PDF deterministic quality contract

## Pre-PDF / Paged.js gates

Retain all existing gates and add semantic text geometry:

1. cross-node text overlap with narrow tolerance;
2. clipped text inside bounded/overflow containers;
3. single-line invariants for KPI values/counters/marked labels;
4. sibling/foreign-node collision;
5. heading/lead keep integrity;
6. normal long-token wrapping for URLs/selectors/code;
7. existing blank/duplicate/split-atomic/overflow/layout-repeated failures.

Use semantic markers to avoid broad false positives.

## Post-PDF structural/text gates on the exact bytes

After PDF emission and before any model visual review:

- `qpdf --check` or an approved structural equivalent;
- `pdfinfo`: page count, A4 dimensions/allowed metadata, no unexpected rotation;
- `pdffonts`: expected Avenir Next variants embedded; no unexpected fallback,
  unembedded or Type3 font unless explicitly allowlisted;
- `pdftotext`: expected deterministic strings/section titles extract;
- `pdftotext -bbox-layout` (or equivalent) supplies **PDF-space text boxes**;
  reject material text-box overlaps/clipping inconsistent with semantic intent;
- verify page text order against section order and page manifest anchors;
- verify document language, outline/bookmarks and tagged/selectable text
  invariants supported by the renderer;
- never claim PDF/UA unless separately proven by a dedicated conformance tool.

This second geometry layer matters because DOM geometry cannot prove emitted
font/text-layer geometry.

## Cross-renderer portability

Raster the exact same candidate with:

1. Poppler;
2. MuPDF (`mutool draw`) or another approved independent PDF renderer.

Requirements:

- same page count and dimensions;
- each page maps one-to-one;
- material pixel/layout divergence outside bounded antialiasing tolerance is
  blocking and produces a `cross-renderer` issue;
- a divergence is diagnosed before delivery rather than choosing whichever
  renderer looks better.

Add the required packages and startup preflight in `deploy/`. No fallback to a
browser screenshot.

## Raster resolution and zoom

- produce a **300-DPI canonical raster** for every page from the final exact
  PDF;
- if a provider input limit would rescale a full A4 page, send the highest
  lossless/full-page derivative allowed **plus** automatic 300-DPI crops of
  dense text/table/code/KPI areas;
- every flagged page is re-reviewed with 300-DPI crops after repair;
- keep raster hashes bound to candidate digest;
- quality PNGs are private temporary artifacts.

---

# Visual review contract

Every page is reviewed; there is no sampling.

For each language and candidate iteration:

1. render a whole-document contact sheet for macro rhythm;
2. reviewer A sees every page + page manifest + `VisualIntent`;
3. reviewer B independently sees every page + same objective contract;
4. correlate issues;
5. a unilateral blocking/major issue goes to a visual issue adjudicator with an
   exact high-resolution crop and relevant manifest/contract;
6. accepted issues repair through the closed router;
7. after the **last** repair, a fresh final visual reviewer sees every page
   again, not merely issue summaries.

Visual reviewers explicitly inspect:

- text overlap/collision;
- clipping/hidden text;
- split or malformed numeric display;
- fallback/wrong typography;
- illegible URLs/selectors/code;
- broken cards/tables/continuations;
- orphaned headings/fragment tails;
- density too high for physical size;
- broken-looking voids **relative to the page's VisualIntent**;
- alignment/margins/hierarchy/spacing;
- checklist inversion and print-safe treatment;
- appendix headers and continuation rhythm;
- any page that looks mechanically broken or unreviewed.

Report text visible inside a page image is **untrusted data**. A sentence such
as “ignore previous instructions” printed in a scanned-page title, selector,
URL or appendix excerpt is never followed.

---

# Repair/convergence loop

```text
accepted issue(s)
   -> route
   -> targeted patch/layout hint
   -> semantic diff guard
   -> all deterministic content guards
   -> full candidate rerender
   -> all Paged.js gates
   -> all exact-PDF structural/font/text gates
   -> dual-renderer raster
   -> visual reviews
```

Any content/layout change that can change block height or pagination triggers a
full all-page review again. If code proves pagination and all page hashes except
specific pages are unchanged, an intermediate repair check may inspect changed
+ adjacent pages only, but the **final acceptance sweep always reviews every
page again**.

Set a generous runaway cap such as `MAX_REPORT_QUALITY_ITERATIONS = 8` only to
bound operations. Exhaustion -> `needs-operator-review`.

---

# Exact-byte and state machine contract

## Candidate lifecycle

```text
running
 -> content-clean
 -> candidate-rendered
 -> pdf-clean
 -> visual-clean
 -> parity-clean
 -> quality-approved
 -> awaiting-operator-approval
 -> operator-approved
 -> promoted
```

Any stale input or accepted edit moves back to the appropriate earlier state
and invalidates downstream approval.

## Lease/epoch

- one active report quality run per audit/report pair;
- quality run owns a renewable lease token + epoch;
- every write/patch/approval/promotion is conditional on current lease/epoch;
- cancelling or superseding the run revokes the lease;
- late model/provider responses from a revoked worker are discarded;
- a stale worker can never promote a report.

## Content-addressed dependency DAG

Each artifact records exact parent digests. Resume may reuse an artifact only
when all dependencies match. Model/prompt/schema/template/render-environment
versions are dependencies where they affect output.

## Exact promotion

Automated approval does **not** rerender.

1. candidate bytes -> SHA-256;
2. all gates/reviews reference that digest;
3. `quality-approved` exposes that exact private candidate to the operator;
4. operator approves `qualityRunId + digest`;
5. promotion copies/writes the same bytes to the approved report location;
6. read back or verify object-store checksum against SHA-256;
7. only then create/activate the client report record;
8. download route serves the approved object and never generates a fresh PDF.

If object storage cannot provide a trustworthy checksum, perform an authenticated
read-back and hash before promotion completes.

## Candidate privacy/retention

- private bucket/prefix and authenticated operator routes only;
- never public preview URLs;
- rejected superseded candidates cleaned after a short diagnostic retention
  window defined in canonical ops docs;
- failed-run page images retained only as long as needed for operator diagnosis;
- no page images/client prose in metadata telemetry.

---

# Implementation plan

## Step 1 — Freeze contracts and build negative fixtures first

Update canonical docs for:

- report-image QA exception;
- fact authority and exact quantities;
- candidate/approved lifecycle;
- visual contract and exact-PDF rule;
- fail-closed reviewer semantics.

Build de-identified negative fixtures **before** production code for:

- cross-node collision the old gate misses;
- clipped one-line KPI;
- unexpected fallback font;
- PDF text-layer overlap after clean DOM geometry;
- broken bookmark/tag/language metadata;
- cross-renderer disagreement;
- wrong canonical count;
- mixed remediation project;
- unconditional noindex wording;
- stale client name;
- bilingual claim drift.

The current pipeline should demonstrably miss the relevant new classes.

## Step 2 — Add `ReportInputSnapshot` and render fingerprint

Build one deterministic snapshot/digest at run start. Include manual/prospect
identity, legal/grade/preparation/reference inputs and render environment.

Render fingerprint includes at least:

- renderer build/template/design-contract version;
- Chromium/Paged.js versions;
- OS/runtime relevant to print;
- locale/timezone used by renderer;
- font file hashes;
- Poppler/MuPDF/qpdf versions.

Add invalidation tests for every client-facing input category.

## Step 3 — Add role-based model profiles

Create explicit profiles for all roles. Persist requested + resolved model,
reasoning effort, prompt/schema version and usage. Required roles have no weak
fallback. Add prompt-injection notice to all text and visual roles.

## Step 4 — Build dossier, packets, fact registry and coverage ledger

Pure deterministic builders. Tests cover:

- separate page-count semantics;
- conservative family grouping;
- concentration arithmetic;
- performance distributions over exact measured rows;
- heuristic/diverted labels;
- page-role source/confidence;
- stable fact IDs;
- exhaustive finding coverage even when evidence is packetized.

## Step 5 — Add `EvidenceBoundText`

Extend writer-side structured output so exact quantities/standards are bound
references, then compile validated segments to the renderer's current text
shape where needed.

Tests reject:

- freehand exact counts/percentages outside allowlist;
- unknown fact IDs;
- unit/format mismatch;
- stale fact registry digest;
- model attempt to replace a fact's value.

## Step 6 — Implement `SeniorReportPlan`

Remove all “8-15 themes” targets. Plan coherent projects from hierarchical
evidence. Global synthesis runs after packet-level analysis.

Hard guards:

- all finding/family refs exist;
- Coverage Ledger complete;
- root cause marked inference;
- project category compatible;
- duplicate membership rejected unless explicit shared dependency;
- executive priorities are project keys;
- no eligible critical/serious/moderate finding silently disappears.

## Step 7 — Rewrite FR/EN writer prompts for senior quality

Use same language-neutral plan. Keep truth/legal terminology guards, simplify
anti-slop generation rules, remove worked runtime prose examples, generate
supporting refs per field and apply typography lint.

Successful language work is persisted independently; the other language never
forces a reroll.

## Step 8 — Required dual content critics + adjudicator

Replace paid-report reliance on advisory review with required critics. Implement
issue correlation/adjudication and accepted/rejected/unsure states. Provider or
schema failure is blocking, not `skipped`.

## Step 9 — Targeted patch engine + semantic diff guard

Patches receive only issue, target, necessary evidence and immutable neighbor
context. Apply to a copy, compute semantic diff, reject undeclared changes, then
validate whole result.

## Step 10 — Deterministic content reconciliation

Before rendering verify:

- provenance/snapshot digests;
- all IDs/keys/coverage;
- fact/standard bindings;
- page-scope terminology;
- WCAG references/severity vocabulary;
- legal deterministic splices;
- identity/manual fields;
- conditionality;
- priority completeness;
- structural FR/EN parity.

## Step 11 — Split candidate rendering from approved persistence

Refactor report stage into:

- `renderReportCandidate(...)` -> private candidate + digest + manifest;
- quality pipeline;
- `promoteApprovedReport(...)` -> exact-byte copy after operator approval.

No candidate creates an approved/client report row.

## Step 12 — Add runtime visual contract and node manifests

Add stable `data-report-node`, physical fragment IDs and page `VisualIntent`.
Runtime contract is code-owned and tested against section registry/tokens; docs
remain human-readable authority but are not parsed at runtime.

## Step 13 — Add pre-PDF overlap/clipping/single-line gates

Implement pure reducers + Paged.js e2e collection for semantic text geometry.
Negative fixtures must fail for the intended reason; normal stress fixtures
must stay clean.

## Step 14 — Add exact-PDF toolchain/preflight

Production preflight installs/checks:

- qpdf (or approved structural checker);
- Poppler: `pdfinfo`, `pdffonts`, `pdftotext`, `pdftoppm`;
- MuPDF/second renderer.

No missing-tool fallback.

## Step 15 — Add PDF-space text/font/accessibility gates

Implement exact-byte checks for:

- structure/page dimensions/rotation;
- font embedding/fallback;
- text bbox overlap/clipping;
- section/key-string extraction;
- reading order anchors;
- language/outline/tagging/selectable text.

Keep accessibility claims precise: test what is actually supported; do not label
the PDF PDF/UA compliant without a dedicated conformance result.

## Step 16 — Dual-renderer 300-DPI raster pipeline

Raster every page through both engines, correlate page counts and images, hash
outputs and flag material rendering divergence. Generate high-resolution dense
region crops automatically from manifest geometry.

## Step 17 — Required dual all-page visual review

Each reviewer returns exactly one per-page record plus issues. Correlation
rejects missing/duplicate/unknown pages/nodes. Contact-sheet review checks macro
rhythm. Unilateral major/blocking issues are adjudicated before patching.

## Step 18 — Bounded visual repair/rerender

Route accepted visual issues through prose/layout/template paths. Never patch
PDF bytes. Template defects stop until canonical source + regression are fixed.

## Step 19 — Bilingual parity review

Compare plan/project/fact/action coverage, not literal sentence identity. A
shared-plan change invalidates both languages' dependent work. A language-only
patch invalidates that language's render/visual approval.

## Step 20 — Fresh final all-page visual sweep

After the last content/layout change, use a **fresh reviewer context** to inspect
all pages again. This pass does not inherit “we already fixed it” assumptions.
Any new major/blocking issue reopens the loop.

## Step 21 — Final document arbiter

Fresh context. Receives:

- snapshot/dossier/fact/coverage digests + relevant high-level data;
- final plan;
- final evidence-bound prose;
- deterministic gate results;
- all accepted/repaired/rejected/remaining issues;
- final PDF digest;
- final page-review coverage manifest;
- full contact sheet and exact page/crop evidence for any risk area.

Returns `approve` or structured blocking/major issues only. No edits.

## Step 22 — Build the quality evaluation harness

Read-only over saved audits; never rescans/publishes. Record role/model, usage,
iterations, elapsed time, issues and outcomes.

### Real acceptance corpus

- Hôtel Point France mandatory;
- every heterogeneous saved audit available up to at least 12 initially;
- clean/small, huge appendix, long names, performance-heavy,
  accessibility-heavy, archive-heavy SEO, multilingual/long prose shapes.

### Known-bad fault corpus

Inject and prove detection of every content/visual failure class named in this
plan.

### Known-good controls

Include clean approved fixtures. Critics/adjudicators must not force material
changes merely because they are asked to find something.

### Property/fuzz layout corpus

Deterministically generate many combinations (committed seeds), including:

- extreme client/title lengths;
- 1/4/5/7-digit and decimal/percentage/unit values;
- 0/few/hundreds/thousands of findings;
- 1/3/6/12/20+ projects;
- long URLs/selectors/code/Unicode/combining marks/bidi-control sanitization;
- cards split at page boundaries;
- table/header continuation at every plausible boundary;
- 100+ page appendices;
- flow/no-flow section boundaries;
- checklist at capacity;
- glossary continuation;
- all negative render cases.

Run enough stable seeds to exercise thousands of rendered pages before
promotion. Failures become committed regressions.

### Repeated live-model stability runs

Run the same representative audits multiple times with the candidate model
profiles. Prose may vary, but facts, project coherence, conditionality, severity,
coverage and pass/fail outcome must remain materially stable. If a role exhibits
quality oscillation, strengthen contract/prompt/adjudication or choose a more
stable model.

### Promotion rule

- corpus green after the last fix;
- zero unresolved blocking/major issues;
- every page reviewed as specified;
- operator reads the complete Point France pair plus several extreme complete
  reports and accepts content **and** visual quality;
- no known-good control was degraded by reviewer pressure;
- model/profile choice is made on quality, not price.

## Step 23 — Job phases, progress UI and conflict guards

Use manageable top-level phases with detailed subprogress rather than exploding
`JobPhase` for every call. At minimum:

```text
dossier
plan-report
write-fr
review-content-fr
write-en
review-content-en
parity
quality-pdf-fr
quality-pdf-en
final-review
awaiting-operator-approval
complete
```

Subprogress can show iteration, reviewer and `page 47 / 103` without client
prose or chain-of-thought.

The report-production lock/lease remains active through automated quality work.
Regenerate/archive/delete controls that conflict stay disabled with the exact
current stage.

## Step 24 — Crash/resume/cancel/exact promotion

Checkpoint every artifact + dependency digest. Resume only matching DAG nodes.
Cancellation revokes lease. Old workers cannot write after epoch changes.

Automated final success -> private `quality-approved` candidate ->
`awaiting-operator-approval`.

Operator approval verifies `qualityRunId`, digest and current snapshot, then
promotes exact bytes and verifies storage checksum/read-back. **No render occurs
inside the approval action.**

## Step 25 — Update canonical documentation and retire obsolete wiring

Update:

- `CLAUDE.md`;
- `docs/rules/llm-layer-rules.md`;
- `docs/rules/report-writing-style.md`;
- `docs/report/report-design-system.md`;
- `docs/report/report-workbench.md`;
- `docs/decisions/trade-offs.md`;
- product brief/dashboard IA where visible stages changed;
- deploy runbook for exact-PDF toolchain.

Mark old advisory reviewers historical/measurement-only or remove dead
production wiring after migration.

---

# Verification matrix

| Area | Required proof |
| --- | --- |
| Input snapshot | digest changes for every client-facing input, render/tool/font fingerprint tests |
| Dossier/facts | aggregate/concentration/page-scope/performance/unit/stable-ID tests |
| Coverage | every eligible finding resolved to project/appendix/unresolved state |
| EvidenceBoundText | unknown/freehand/stale/unit-mismatch claims rejected |
| LLM outputs | Zod/schema mirror, prompt injection, correlation, adjudication, patch diff tests |
| Typography | language-specific safe transforms + identifier/code preservation |
| Report DOM geometry | Paged.js overlap/clipping/single-line/overflow/atomic tests |
| Exact PDF | qpdf/pdfinfo/pdffonts/pdftotext bbox/reading order/tag/language checks |
| Portability | Poppler vs second renderer page count + material render-diff tests |
| Visual roles | every page exactly once per required reviewer; crops/contract/node correlation |
| Candidate lifecycle | no report row before operator promotion; stale digest blocked |
| Lease/epoch | stale/cancelled worker cannot patch/approve/promote |
| Storage | promoted object read-back/hash equals approved digest |
| Dashboard | phase/subprogress/conflict locks/operator digest approval |
| Store | Mongo integration for quality-run/candidate/report state |
| Full repo | format, check, unit, relevant e2e, then full test suite |

Tests do not call live models. Step 22 is the explicit live-model evaluation.

---

# Fail-closed conditions

Never promote a report when any of these is true:

- stale/missing input snapshot or findings provenance;
- conflicting canonical facts code cannot reconcile;
- incomplete Coverage Ledger;
- unknown/freehand exact quantitative claim;
- required high-quality model unavailable after paced retries;
- malformed/unvalidated model output;
- unresolved or `unsure` blocking/major issue;
- semantic patch diff exceeds declared targets;
- content reconciliation failure;
- Paged.js/DOM geometry failure;
- PDF structural/font/text-geometry/accessibility invariant failure;
- required exact-PDF tool unavailable;
- cross-renderer material divergence;
- any physical page missing any required visual review result;
- unresolved blocking/major visual issue;
- bilingual parity failure;
- final all-page sweep failure;
- final arbiter rejection;
- candidate digest/input snapshot changed after review;
- lease/epoch lost;
- storage read-back/checksum differs from approved digest;
- iteration ceiling reached;
- operator has not approved the exact digest.

Outcome: `needs-operator-review`, `cancelled`, or `failed`. Never fall back to the
old unreviewed report path.

---

# Explicitly rejected alternatives

- One Sol High “polish” call at the end.
- Letting a model correct scanner data directly.
- Reviewing only JSON/HTML/pre-PDF DOM.
- Reviewing only executive pages.
- One PDF renderer/rasterizer as the only visual truth.
- A model writing per-client CSS/HTML.
- Whole-report rerolls until a model says it likes the result.
- Automatically patching every unilateral critic opinion.
- Pushing all raw findings into one giant prompt regardless of audit size.
- Freehand model-generated numbers followed by best-effort checking.
- Shipping on the last retry because time/money was spent.
- Rerendering after operator approval.
- Cross-provider review without explicit data-boundary approval.
- Optimizing cost before the quality corpus is clean.

---

# Definition of done

Plan 058 is complete only when all are true:

1. one canonical `ReportInputSnapshot` and render fingerprint govern staleness;
2. hierarchical evidence, Fact Registry and Coverage Ledger are deterministic;
3. exact quantities in model prose are evidence-bound, not hand-typed;
4. senior remediation planning has no arbitrary theme count;
5. required dual content critics + issue adjudication + targeted patching ship;
6. semantic patch diffs prevent collateral rewrites;
7. deterministic content/typography reconciliation passes before render;
8. candidate rendering is private and separate from approved persistence;
9. machine-readable VisualIntent/node/page manifests exist;
10. pre-PDF overlap/clipping/single-line gates block bad geometry;
11. exact-PDF structural, font and text-bbox gates block emitted-byte defects;
12. PDF semantic/accessibility invariants are checked without false conformance
    claims;
13. every page is rasterized through two independent PDF renderers;
14. every page is reviewed by both primary visual reviewers;
15. visual disagreements are adjudicated rather than blindly patched;
16. the final fresh visual reviewer examines every page again after the last
    change;
17. bilingual parity and independent final arbiter are required;
18. automated success produces a private exact-digest quality-approved file;
19. operator approval promotes those same bytes with storage hash/read-back
    verification and no rerender;
20. quality run lease/epoch prevents stale workers from publishing;
21. crash/resume reuses only content-addressed matching artifacts;
22. adversarial content/visual fault injection is green;
23. property/fuzz rendering exercises thousands of pages with committed
    regressions for every discovered bug;
24. known-good controls are not degraded by reviewer pressure;
25. repeated live-model evaluations show materially stable quality;
26. Hôtel Point France and the heterogeneous real corpus rerun clean after the
    final fix;
27. the operator accepts the final complete Point France report pair and
    representative extreme reports visually and editorially;
28. dashboard stages make the quality process visible and prevent conflicting
    actions;
29. canonical docs/deployment tooling describe the shipped contract;
30. full repository validation is green.

The intended client-facing invariant is simple: **a paid Odysseus PDF can exist
as an approved report only when its evidence, interpretation, writing,
quantities, typography, pagination, fonts, exact PDF geometry, cross-reader
rendering and every physical page have been checked against the exact bytes the
operator approves and the client receives.**
