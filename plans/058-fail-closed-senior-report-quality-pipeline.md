# Plan 058: Fail-closed senior report quality pipeline

> **Executor instructions**: implement this plan as a quality contract, not as a menu of optional improvements. A paid Odysseus report is deliverable only when the **exact bilingual PDF bundle** the operator will approve and the client will receive has passed the evidence, editorial, deterministic, exact-PDF, visual, parity, storage and delivery gates below. Cost and model-call count are not optimization targets. Never weaken a required review, skip a page, lower raster fidelity, accept an unresolved objective defect, or publish the least-bad iteration because time or money has already been spent. If the pipeline cannot converge, stop in `needs-operator-review`.
>
> Plan 059 owns whether the audit evidence is trustworthy. Plan 058 owns whether that approved evidence is interpreted, written, rendered and delivered without known defect. Plan 058 **must consume `ApprovedAuditEvidence` from Plan 059 as its only scan-evidence authority**; it must not independently reconstruct a second competing view of scan truth from loose manifest/findings files.
>
> Historical reports remain historical. This contract governs newly generated or regenerated paid reports after production promotion.

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH — paid-report analysis, model orchestration, rendering, PDF QA, persistence, approval and delivery all change.
- **Depends on**: delivered plans 027, 033, 039, 050 and 051; **Plan 059 evidence approval before production promotion**.
- **Category**: paid-report quality, senior reasoning pipeline, exact-PDF QA, bilingual delivery integrity.
- **Execution status**: core pipeline implementation landed 2026-09-18 and remains dormant behind Plan 059; **corrective closure reopened 2026-09-18** because the implementation used one generic report-quality model instead of the required validated per-role profiles. The corrective §6.1 contract is now executable: every role resolves through an exhaustive `ReportModelProfile` matrix (role/provider/prompt-version/schema-version recorded per profile), resolution fails closed with no legacy or environment fallback, model-call provenance persists the requested/resolved model, reasoning effort and prompt/schema versions, and a committed benchmark-manifest release artifact blocks production promotion while a role's corpus approval is pending. The requirement-to-proof ledger below was assembled 2026-09-18; writing its proofs exposed and closed four real defects (lease double-acquire, silent coverage-ledger omission, missing duplicate-membership rejection, missing prose-fault detectors). **Closure still requires the saved-corpus benchmark run and the outstanding rows marked OPEN in the ledger.**
- **Final review state**: original design + six hardening passes + final convergence reviews. The final architecture pass produced no additional substantive change; freeze speculative design and let implementation/evaluation evidence drive later amendments.

---

# 1. Binding product decisions

1. **Quality is the objective; cost is not.** Optimize inference/runtime only after the shipped quality contract is measured unchanged.
2. **Content and visuals are equally blocking.** Excellent prose in a broken PDF is a failed report; a beautiful PDF with wrong facts or weak interpretation is also failed.
3. **Plan 059 is the scan authority.** Report production starts only from an immutable `ApprovedAuditEvidence` handoff. Models cannot edit scanner findings, accepted measurements, evidence-quality verdicts or provenance.
4. **The exact delivered bytes are the review artifact.** JSON, HTML, Paged.js DOM and pre-PDF screenshots are intermediate artifacts only.
5. **FR and EN are one commercial deliverable.** They may be produced/repaired independently, but automated approval and operator promotion happen on one atomic bilingual `ReportBundleCandidate` whose digest commits to both exact PDFs and their provenance.
6. **No whole-report reroll after the first accepted draft.** Repairs are targeted to exact semantic addresses. Good material is not re-randomized to fix an unrelated defect.
7. **No “ship after N tries”.** A loop ceiling only prevents runaway execution. Exhaustion means `needs-operator-review`.
8. **Every accepted objective defect blocks approval, regardless of severity label.** `blocking/major/minor` controls routing and urgency, not whether a known defect may remain. Subjective preferences are classified separately and do not cause infinite polish loops.
9. **Report page images may be model input only for report QA.** They are never website evidence and may not create new website findings.
10. **No arbitrary model-authored CSS/HTML/JS.** Models may select only tested layout variants and exact prose/plan patches.
11. **No post-QA mutation.** Compression, metadata repair, tagging, optimization, encryption or other PDF post-processing must occur **before** the candidate digest and all final QA. The approved bytes are never mutated afterward.
12. **Automated approval does not replace the operator.** Automated success produces a private exact-digest candidate bundle. Operator approval promotes those same bytes atomically.
13. **Confidential report data crosses only approved provider boundaries.** Cross-provider diversity is allowed only where explicitly approved; otherwise independence comes from stateless contexts, complementary prompts and separate reviewer roles.
14. **No fallback to the legacy unreviewed report path.** If a required quality dependency is unavailable, the report remains unavailable.

---

# 2. Operational definition of “perfect”

No system can prove that no human will ever prefer a different aesthetic. For Odysseus, a perfect paid-report result means:

> **zero known objective defect in the exact FR/EN bundle at approval time, with multiple independent attempts to falsify both the content and the physical PDF output.**

A bundle may reach `quality-approved` only when all of the following are true:

- its upstream `ApprovedAuditEvidence` is current and digest-verified;
- every report finding/remediation statement traces to approved evidence;
- every mandatory limitation/disclosure from Plan 059 is present in the required report location and cannot be omitted by a writer;
- all exact scalar facts that should be deterministic — numbers, percentages, dates, URLs, company identity, SIREN, standards references, enumerated statuses and other exact tokens — are code-bound rather than retyped from model memory;
- unsupported site-specific claims are absent;
- facts are clearly distinguished from root-cause inference;
- finding concentration/systemic repetition is synthesized when evidence supports it;
- each remediation project is one coherent job;
- conditional evidence remains conditional;
- re-audit states such as `newly-observable` and `not-comparable` are not rewritten as client regressions or proven fixes;
- performance terminology distinguishes Lighthouse lab measurements from CrUX field data and never calls TBT/Speed Index Core Web Vitals;
- business-impact language is bounded by evidence and never asserts lost bookings/revenue/conversion causality without actual supporting data;
- French reads like restrained native consulting prose and English preserves the same meaning naturally;
- every accepted content-review defect is repaired;
- deterministic content/legal/reference guards pass;
- every Paged.js/DOM gate passes;
- all canonical PDF post-processing is complete before final hashing;
- exact-PDF structure, fonts, text geometry, metadata, annotations, links and active-content safety pass;
- no visible text is overlapped, clipped, hidden, duplicated, stranded, unreadably dense or visually malformed;
- every physical page is reviewed in full-page context **and at readable-detail tile/crop scale** by two independent visual roles;
- a fresh final visual reviewer inspects every page again after the last change;
- no accepted visual defect remains;
- bilingual parity passes;
- the final independent document arbiter approves;
- the bundle survives private-object storage/read-back with identical digests;
- operator approval references the exact current bundle digest;
- promotion activates FR and EN atomically with no window in which mismatched revisions can be served;
- client download resolves to immutable content-addressed objects and cannot silently serve a stale overwritten file.

---

# 3. Final convergence review — issues that supersede earlier drafts

## 3.1 Upstream authority was duplicated

Earlier versions of Plan 058 still described constructing report facts directly from manifest/findings/measurement artifacts. Plan 059 now defines the evidence authority. Duplicating derivation would create two places that can disagree.

**Correction:** `ReportInputSnapshot` references the exact `ApprovedAuditEvidence` / `AuditEvidenceSnapshot` digest from Plan 059. Report code may deterministically derive presentation facts from that approved graph, but cannot choose alternate raw attempts or bypass the evidence-quality verdict.

## 3.2 “EvidenceBoundText” was too narrow

Binding only quantities still lets a model mistype an exact hotel name, URL, date, SIREN, WCAG reference or enumerated status.

**Correction:** replace the narrow concept with `EvidenceBoundContent`. Exact factual tokens are typed references inserted by code. Free prose surrounds them; factual scalar values are not regenerated by the model when deterministic binding is practical.

## 3.3 FR/EN approval was not atomic enough

Two individually perfect PDFs can still form a bad commercial deliverable if they come from different plan/input revisions.

**Correction:** introduce a `ReportBundleCandidate` containing FR digest, EN digest, shared plan/input digests, language-specific analysis digests and bundle digest. Automated approval, operator approval and promotion are bundle-level transactions.

## 3.4 “Minor” defects could survive

Earlier approval gates emphasized zero unresolved blocking/major issues. That is inconsistent with the requirement that the delivered PDF be perfect.

**Correction:** reviewer output distinguishes `objective-defect` from `preference`. Every accepted objective defect — even typographic/minor — blocks quality approval until verified repaired. Preferences may be rejected without patching.

## 3.5 Full-page visual input can hide small defects

A 300-DPI A4 raster rescaled to fit a model input may make ordinary body text too small to judge reliably.

**Correction:** every page receives both a full-page image and deterministic high-resolution tiling/semantic crops. Dense/flagged regions may receive additional crops, but detail review is not restricted to already-suspicious pages. Review may be batched for context limits only when a machine coverage manifest proves every required page/tile was reviewed exactly as required.

## 3.6 PDF semantic safety needed a closed rule

A generated PDF can contain broken hyperlink annotations, unexpected active actions, attachments or a postprocessor that changes bytes after review even when page pixels look fine.

**Correction:** exact-PDF QA validates annotations and destinations, rejects JavaScript/Launch/embedded-file/unsafe action classes unless explicitly allowlisted, and includes every required postprocessor before hashing/review.

## 3.7 Model independence needed complementary roles, not duplicate prompts

Two identical critics can share the same blind spots.

**Correction:** reviewer A and B are independent **and orthogonal**. Content A prioritizes evidence/factual/technical integrity; Content B prioritizes editorial/client usefulness/conditionality/coherence while still checking facts. Visual A prioritizes physical defects/geometry/readability; Visual B prioritizes design hierarchy/typography/continuity while still reporting physical breakage. Correlation/adjudication remains evidence-based.

## 3.8 Reference freshness can invalidate otherwise excellent prose

External legal/reference/benchmark claims may become stale without any scanner change.

**Correction:** client-facing deterministic reference data has source/version/retrieval metadata and a freshness policy. Stale or unverifiable reference claims are refreshed, omitted or explicitly downgraded before report approval; the model never fills the gap from memory.

## 3.9 Delivery caching can violate exact-byte approval

Overwriting a stable object path can leave a CDN/browser serving an older PDF after a new approval.

**Correction:** approved PDFs use immutable content-addressed object keys. After both objects verify, a **single atomic active-bundle pointer/CAS** switches client delivery to the new pair. Do not overwrite approved PDF objects in place and do not rely on a multi-document transaction for correctness.

## 3.10 Re-audit comparability must survive editorial rewriting

Plan 059 correctly distinguishes scanner-coverage change from site change, but the report writer could accidentally flatten those states.

**Correction:** re-audit comparability is an exact structured input to the report; deterministic/critic guards reject language that describes `newly-observable` as newly introduced or `not-comparable` as resolved.

---

# 4. Target architecture

```text
PLAN 059
ApprovedAuditEvidence
  evidenceSnapshotDigest
  evidenceQualityAssessment
  EvidenceCoverageSignature
  mandatory limitations / capability registry
        │
        ▼
A. ReportInputSnapshot
   approvedEvidenceDigest + report-only inputs + re-audit comparability
        │
        ▼
B. ReportFactRegistry + ReportCoverageLedger
        │
        ▼
C. hierarchical ReportEvidenceDossier / packets
        │
        ▼
D. SeniorReportPlan (language-neutral)
        │
        ▼
E. FR + EN evidence-bound first drafts
        │
        ▼
F. complementary dual content critics
   disagreement -> issue adjudicator
        │
        ▼
G. targeted patches only
        │
        ▼
H. deterministic content/parity reconciliation
        │
        ▼
I. render FR/EN private candidates
        │
        ▼
J. Paged.js / DOM deterministic gates
        │
        ▼
K. canonical PDF post-processing, if any
        │
        ▼
L. exact-PDF structural/font/text/link/security gates
        │
        ▼
M. two independent PDF renderers
   canonical full-page + detail tiles/crops
        │
        ▼
N. complementary dual all-page visual review
   disagreement -> visual adjudicator
        │
        ▼
O. accepted defect repair -> rerender -> repeat I-N
        │
        ▼
P. bilingual parity
        │
        ▼
Q. fresh final all-page visual sweep
        │
        ▼
R. independent final document arbiter
        │
        ▼
ReportBundleCandidate
quality-approved (private)
        │
        ▼
OPERATOR APPROVES bundleDigest
        │
        ▼
checksum-verified exact FR+EN objects
        │
        ▼
atomic active-bundle pointer/CAS
        │
        ▼
client-facing active report bundle
```

No report-QA defect causes a website rescan. Only a proven upstream evidence defect routes back to Plan 059/operator review.

---

# 5. Canonical contracts

## 5.1 `ReportInputSnapshot`

One immutable snapshot at quality-run start. It contains hashes/references for:

- `ApprovedAuditEvidence` and its exact evidence snapshot digest;
- audit/site identity;
- current prospect-linked commercial/legal name and SIREN/manual-field origins;
- grade override;
- current obligation assessment inputs/result;
- report preparation data;
- verified report-only site context;
- mandatory evidence limitations/disclosures from Plan 059;
- optional re-audit delta + coverage-comparability classification;
- reference/legal/benchmark registry versions and freshness state;
- requested languages;
- report template/design-contract versions;
- renderer/browser/Paged.js/PDF-tool versions;
- font filenames + hashes;
- model-profile configuration/prompt/schema hashes relevant to output;
- quality-tool versions.

If any client-facing dependency changes, downstream approval is stale. Selective reuse requires explicit dependency declarations; never guess that a change “probably does not matter”.

## 5.2 `ReportFactRegistry`

Typed deterministic facts derived only from `ApprovedAuditEvidence` and approved report-only inputs.

Supported fact classes include:

- integer/decimal/percentage/duration/bytes;
- string identity values;
- URL;
- date/datetime;
- enum/status/comparability state;
- standard/reference ID;
- language-specific formatting metadata.

Example IDs:

```text
scope.urlsInventoried
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
client.commercialName
client.legalName
client.siren
report.auditDate
reaudit.<row>.comparability
```

Every fact has type, source digest/ref and formatting policy.

## 5.3 `EvidenceBoundContent`

Model-owned report fields use structured segments rather than freehand exact facts:

```text
text("...")
fact(factId, format)
reference(referenceId)
text("...")
```

Rules:

- code resolves facts/references after model validation;
- identity, exact dates, exact URLs, counts, percentages, measured values, comparability states and standards use bindings where they appear in model prose;
- free-form exact scalars outside a deliberately small allowlist are rejected;
- URLs/selectors/code identifiers are escaped and preserved, not interpreted as markup;
- bidi/control characters and unsafe invisible formatting are rejected or safely normalized under a deterministic policy;
- model text is rendered as text/structured primitives, never trusted raw HTML/JS; Markdown, if supported, is parsed only through an allowlisted renderer.

## 5.4 `ReportEvidenceDossier`

Deterministically produced from approved evidence:

- distinct page-scope semantics;
- severity/category totals;
- normalized finding inventory;
- Plan-059 `PatternEvidence` and conservative finding families;
- occurrence/finding/page counts;
- WCAG references;
- concentration at useful thresholds by findings and occurrences;
- performance distributions and confidence sets over exactly measured pages;
- render/content completeness;
- semantic page-role evidence with confidence;
- heuristic/review-signal separation;
- evidence-quality limitations/capabilities;
- mandatory disclosure objects;
- re-audit comparability classes;
- approved business/legal context.

Do not independently reinvent a root-cause grouping when Plan 059 already provides pattern evidence. Report grouping can combine evidence into remediation projects, but never rewrite underlying finding identity.

## 5.5 `ReportEvidencePacket` / `ReportCoverageLedger`

Large audits are packetized hierarchically:

- global packet;
- one detailed packet per family/pattern/remediation candidate;
- exact finding/observation refs covered by each packet;
- representative evidence selected deterministically.

`ReportCoverageLedger` proves every eligible finding is either:

- assigned to a remediation project;
- intentionally appendix-only with reason;
- explicitly unresolved, which blocks final approval if material.

It also proves every mandatory limitation/disclosure has a deterministic rendered destination.

This is distinct from Plan 059's `EvidenceCoverageLedger`, which describes what the scanner measured.

## 5.6 `SeniorReportPlan`

Language-neutral:

- exhaustive `remediationProjects[]`, no target count;
- project key/category/finding-family/observation refs;
- evidence/fact refs;
- likely root cause explicitly marked as inference + confidence;
- conditionality/reason;
- impact/effort/rationale;
- dependencies/shared dependencies;
- `executivePriorityKeys[]` selecting only genuinely front-matter-worthy projects.

One project = one coherent remediation job. Duplicate finding membership is rejected unless represented by an explicit shared dependency.

## 5.7 `ReviewIssue`

Closed schema:

```text
issueId
kind: objective-defect | preference
severity: blocking | major | minor
sourceRole
artifactDigest
field/page/node target
domain
supporting evidence/fact/page/raster refs
reason
repairRoute
status: proposed | accepted | rejected | unsure | repaired | verified
```

An accepted `objective-defect` of any severity prevents `quality-approved`. A `preference` may be rejected without repair. `unsure` on a potentially objective major/blocking issue routes to operator review rather than speculative rewriting.

## 5.8 `ReportPatch`

Contains only declared target addresses + accepted issue IDs. Application code computes a semantic before/after diff and rejects collateral changes.

Allowed:

- exact plan fields;
- exact prose segments;
- tested layout hints.

Forbidden:

- scanner evidence/facts;
- design tokens;
- arbitrary HTML/CSS/JS;
- identity outside normal upstream input layer;
- PDF-byte patching.

## 5.9 `ReportVisualContract` / `VisualIntent`

Machine-readable code-owned contract tied to real design tokens/templates. Per page/component it defines:

- background/world;
- margins/measure/alignment;
- expected density;
- intentional whitespace;
- split/no-split rules;
- single-line values;
- allowed decoration/overlap;
- typography roles/minimum readable sizes;
- print/checklist inversion;
- approved compact variants.

Visual reviewers judge against this contract rather than inventing a redesign.

## 5.10 `ReportPageManifest`

Bound to one candidate digest:

- physical page number/dimensions;
- section/page type + visual intent;
- stable logical node IDs;
- Paged.js fragment IDs;
- node and leaf text-line rectangles;
- relevant font/line-height info;
- semantic invariants;
- bounded diagnosis excerpts;
- deterministic tiling/crop coordinates.

## 5.11 `LanguageReportCandidate`

Per language:

- exact PDF bytes digest;
- input/plan/draft/render digests;
- page manifest digest;
- deterministic gate digest;
- raster/tiles hashes for each renderer;
- review coverage + verdicts;
- terminal per-language quality state.

## 5.12 `ReportBundleCandidate`

Atomic commercial artifact:

```text
qualityRunId
epoch
inputSnapshotDigest
approvedEvidenceDigest
seniorPlanDigest
frCandidateDigest
enCandidateDigest
parityVerdictDigest
finalArbiterVerdictDigest
bundleManifestDigest
bundleDigest
state
```

Bundle digest is canonical serialization over both language candidate digests and shared dependencies. Operator approval names `qualityRunId + bundleDigest`.

## 5.13 `ReportQualityRun`

Append-only lineage:

- run ID/epoch/lease-token hash;
- all dependency digests;
- requested model alias, provider-returned resolved ID and provider fingerprint/version metadata when available;
- reasoning effort and all relevant request parameters;
- exact prompt/schema hashes;
- review/adjudication/patch artifacts;
- candidate iteration digests;
- PDF-tool/render-environment fingerprint;
- operator approval bundle digest;
- terminal state.

Never store chain-of-thought.

---

# 6. Model role policy

Use explicit role profiles:

```text
senior-analyst
writer-fr
writer-en
content-critic-evidence
content-critic-editorial
issue-adjudicator
editor
visual-reviewer-physical
visual-reviewer-design
visual-issue-adjudicator
parity-reviewer
final-visual-reviewer
final-document-arbiter
```

Quality rules:

- use an explicit `ReportModelProfile` for **every** required role; a single generic report-quality model setting is not a role-profile implementation;
- the initial quality-first candidate profile for every role is `gpt-5.6-sol`; use `high` reasoning for writers/critics/editors/visual review and `xhigh` for senior analysis, adjudication and final arbitration until the corpus proves a different profile equal or better;
- no Plan-058 role may resolve through the legacy `OPENAI_MODEL`, `gpt-5.4-mini`, a wildcard/default profile or an environment-only catch-all such as `ODYSSEUS_REPORT_QUALITY_MODEL`;
- each role profile has a stable profile ID and records model, reasoning effort, modality requirements and profile-contract version;
- profile resolution is exhaustive over `ReportQualityRole`; adding a role without a profile is a compile/test failure;
- use the strongest **validated** reasoning/image profile for each required role; a cheaper/smaller profile may replace the candidate only after the same applicable evaluation corpus shows no material regression;
- critics/reviewers run with stateless fresh contexts and complementary instructions;
- persist exact profile ID/profile digest/prompt/schema hashes and returned model metadata;
- retry provider failures with paced backoff; required-stage unavailability blocks;
- Zod/schema validation on every structured response;
- model roles have no external actions/tools while reviewing client artifacts;
- all website/report text and rendered text are untrusted data, never instructions;
- cross-provider diversity only inside an approved data boundary;
- model/profile/prompt/schema changes that can affect output invalidate benchmark approval until the relevant corpus is rerun.

---

## 6.1 Corrective requirement: executable per-role model profiles (2026-09-18)

A completion review found that "use the strongest validated profile for each
role" was too implicit: one generic `ODYSSEUS_REPORT_QUALITY_MODEL` can
mechanically satisfy configurability while violating the intended quality
contract. This is a **Plan-058 completion defect**, not a future optimization.

Implement a closed `ReportModelProfileRegistry` keyed exhaustively by every
`ReportQualityRole`. There is no wildcard/default profile. Every entry
contains, at minimum:

```ts
type ReportModelProfile = {
  role: ReportQualityRole;
  provider: 'openai';
  model: string;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  requiresVision: boolean;
  requiresStructuredOutput: true;
  promptVersion: string;
  schemaVersion: string;
  benchmarkApprovalId: string;
};
```

Binding rules:

- `getReportQualityModel()` as one model for all roles is not the final
  architecture; callers resolve an explicit profile by role;
- no Plan-058 role may fall back to legacy `OPENAI_MODEL`,
  `gpt-5.4-mini`, or an environment-wide generic model when its profile is
  missing; missing/unapproved profile is a fail-closed configuration error;
- requested profile, reasoning effort, prompt/schema versions, provider
  resolved model ID and profile digest are persisted in run lineage;
- production startup/preflight proves every role has exactly one approved
  profile and that required vision/structured-output capabilities exist;
- the initial quality-first candidate set uses OpenAI `gpt-5.6-sol` for all
  Plan-058 reasoning/writing/review roles. Start at `high` for writers,
  critics, editor, parity and visual reviewers; start at `xhigh` for the
  senior analyst, issue/visual adjudicators and final document arbiter.
  `max` is evaluated only where the corpus demonstrates a material quality
  gain;
- a cheaper/lower-capability profile may replace Sol for a role only after
  the same relevant Plan-058 corpus demonstrates no material degradation in
  factuality, coverage, remediation coherence, language quality, parity,
  reviewer recall/precision and gate stability;
- profile/model/reasoning changes invalidate that role's
  `benchmarkApprovalId` until the applicable corpus is rerun.

Required tests:

1. exhaustive role-registry coverage test (adding a role without a profile
   fails compilation/test);
2. missing-profile/no-default-fallback test;
3. static reachability test proving the promoted Plan-058 path cannot use the
   legacy `OPENAI_MODEL`;
4. provenance persistence/read-back test for requested/resolved model,
   reasoning effort and profile digest;
5. benchmark manifest test proving every production profile names a current
   corpus approval.

The model-profile matrix and benchmark manifest are release artifacts. A
quality run is not production-promotable merely because a model string is
configured.


# 7. Senior analysis and writing contract

## Senior analyst

Must:

1. explain what the approved evidence means rather than paraphrasing scanner titles;
2. identify concentration/systemic repetition;
3. distinguish evidence from inference;
4. use Plan-059 pattern evidence where available;
5. build one coherent remediation job per project;
6. preserve conditionality;
7. prioritize by severity, breadth, user consequence and remediation leverage;
8. account for every eligible finding through `ReportCoverageLedger`;
9. never alter evidence;
10. explicitly respect known evidence limitations/capability gaps;
11. respect re-audit comparability and never infer when the defect first appeared unless evidence proves it.

## Writer

Register:

> Write as a senior French digital consultant preparing a document read first by the company director and then handed to the technical provider. Synthesize rather than dump scanner output. Explain significance, distinguish systemic from isolated defects, keep remediation jobs coherent, and state only what the approved evidence supports.

Requirements:

- native restrained French; equivalent natural English;
- no alarmism, filler, canned consulting rhetoric or repetitive model cadence;
- significance first, technical action second;
- no mandatory sentence quota;
- no example prose in prompts that invites imitation;
- exact facts via `EvidenceBoundContent`;
- explicit fact/inference wording;
- concrete developer actions;
- no legal conclusion beyond deterministic approved language;
- no unsupported booking/revenue/conversion-loss claim;
- no incorrect performance terminology: Lighthouse lab metrics and CrUX field metrics stay distinct;
- `newly-observable` means current defect newly observable under broader coverage, not proof of client regression;
- `not-comparable` is never rewritten as resolved.

## Typography/content sanitization

Before rendering:

- apply safe language-specific punctuation/non-breaking rules;
- preserve URLs/selectors/code byte-for-byte after safe escaping;
- reject/sanitize unsafe control/bidi characters according to closed rules;
- prevent raw HTML/JS injection;
- do not automatically rewrite semantics.

---

# 8. Review/adjudication contract

## Evidence critic

Primary emphasis:

- data/scope/fact conflicts;
- unsupported causality;
- evidence limitation misuse;
- mandatory-disclosure presence;
- re-audit comparability wording;
- conditionality;
- WCAG/severity/legal/reference correctness;
- remediation membership;
- performance terminology;
- omitted high-leverage evidence.

## Editorial critic

Primary emphasis:

- native language quality;
- clarity for director and technical provider;
- priority coherence;
- overstatement/understatement;
- repetition/AI cadence;
- vague actions;
- misleading presentation of large repeated counts.

Both may report any objective defect they notice.

Issue acceptance:

- deterministic gate failure -> accepted objective defect;
- independently corroborated objective issue -> accepted;
- unilateral major/blocking objective issue -> adjudicator evaluates exact evidence;
- unilateral minor objective issue may use a focused deterministic/model adjudicator where validated; otherwise review;
- preference -> does not block unless operator explicitly requests change;
- `unsure` on material correctness -> operator review.

After patching, verification must prove the issue is actually gone.

---

# 9. Closed repair router

| Route | Use | Allowed action |
| --- | --- | --- |
| `recompute-report-fact` | derived report fact disagrees with approved evidence | recompute deterministically |
| `upstream-evidence-defect` | approved evidence itself appears inconsistent | stop; route to Plan 059/operator; no report-side replacement |
| `patch-plan` | project membership/priority/conditionality | targeted plan patch + dependent prose only |
| `patch-prose` | unsupported/weak/incorrect language | exact field/segment patch |
| `layout-hint` | known shape issue | tested predeclared variant |
| `rerender` | accepted content/layout change | complete affected language candidate render |
| `template-defect` | no bounded repair | fix canonical source globally + add regression |

Every patch reruns all affected deterministic and downstream review gates.

---

# 10. Bounded layout hints

Only code-owned, fixture-tested variants, for example:

- `breakBefore`;
- `keepWithNext`;
- `density: normal | compact` on components designed for both;
- `statValue: normal | compact`;
- `titleMeasure: normal | compact`;
- safe split markers;
- short-section flow variant.

Models may select, never author variants.

---

# 11. Exact-PDF production and deterministic QA

## 11.1 Pre-PDF / Paged.js gates

Retain existing gates and add:

- cross-node text overlap with narrow tolerance;
- clipping in bounded containers;
- single-line KPI/counter invariants;
- sibling/foreign-node collisions;
- heading/lead/orphan integrity;
- long-token wrapping for URLs/selectors/code;
- duplicate fragments/blank interiors/atomic splits/overflow/layout repetition.

Use semantic markers to avoid false positives.

## 11.2 Canonical PDF post-processing boundary

If the product requires metadata/tagging/bookmark/accessibility fixes or deterministic optimization that Chromium/Paged.js cannot emit directly, apply them here through a code-owned toolchain.

Rules:

- postprocessor/tool/version/config is part of render fingerprint;
- no content invention;
- output becomes the candidate bytes;
- **all exact-PDF and visual review occurs after this stage**;
- nothing mutates the PDF after candidate hashing except byte-for-byte copy.

## 11.3 Exact-byte PDF checks

On candidate bytes:

- structural checker (`qpdf --check` or approved equivalent);
- page count/dimensions/rotation;
- expected embedded fonts; unexpected fallback/unembedded/Type3 only if explicitly approved;
- deterministic key text extraction;
- PDF-space bbox overlap/clipping checks;
- logical text order/section anchors;
- language/title/author/subject metadata policy;
- bookmarks/outlines where required;
- selectable text and report accessibility invariants supported by the toolchain;
- hyperlink annotations: destination exists/URL is syntactically valid and intended;
- reject `javascript:`, Launch actions, unexpected embedded files, executable/unsafe actions and other active content;
- no encryption/password restriction unless product deliberately adds it before QA;
- no unexpected forms/annotations.

Do not claim PDF/UA unless a dedicated conformance checker proves it. If an accessible tagged PDF becomes a product requirement, implement the tagging/postprocessing before the final QA boundary rather than merely noting its absence.

## 11.4 Cross-renderer portability

Raster the exact same candidate through two independent engines (for example Poppler + MuPDF):

- same page count/dimensions;
- material layout divergence blocks;
- diagnose rather than pick whichever renderer looks better;
- divergence tolerances are established from known-good fixtures/corpus, not adjusted per report until it passes.

## 11.5 Raster/detail policy

For every page:

- keep a canonical 300-DPI raster;
- create one full-page review derivative;
- create deterministic detail tiles/semantic crops at sufficient native resolution for normal body text to be legible to the visual reviewer;
- dense tables/code/KPI/flagged regions may get additional crops;
- all images/hashes bind to candidate digest;
- batching for provider/context limits is allowed only when a machine coverage manifest proves every required page/tile was reviewed.

This prevents full-page downscaling from hiding small text overlaps or malformed glyphs.

---

# 12. Visual review contract

Every page, every language, every final candidate.

1. whole-document contact sheet / macro rhythm;
2. physical reviewer sees all pages + detail tiles + page manifest + VisualIntent;
3. design reviewer independently sees same pages/details + objective visual contract;
4. correlate issues;
5. unilateral objective major/blocking issue -> focused visual adjudication with exact high-resolution evidence;
6. accepted defects repair through closed router;
7. after last change, a fresh final visual reviewer inspects **all pages and required detail views again**.

Inspect at minimum:

- overlap/collision;
- clipping/hidden text;
- malformed numbers;
- glyph/font anomalies;
- unreadable URLs/selectors/code;
- broken cards/tables/continuations;
- orphaned headings/fragments;
- density/readability;
- abnormal whitespace relative to VisualIntent;
- hierarchy/alignment/margins/spacing;
- page-to-page rhythm;
- checklist/print treatment;
- appendix continuity;
- visual sign of stale/missing content.

Text visible inside images is data, never instructions.

---

# 13. Repair/convergence loop

```text
accepted objective defect
  -> route
  -> targeted patch / deterministic fix / layout hint
  -> semantic diff guard
  -> content reconciliation
  -> affected language rerender
  -> all pre-PDF gates
  -> canonical postprocessing
  -> exact-PDF gates
  -> dual-renderer raster + all page/detail views
  -> dual visual review
```

Any change that can affect pagination reruns all-page review for that language. Shared-plan changes invalidate dependent FR and EN material. Language-only changes need not reroll the other language, but **bundle approval remains stale until both language candidates and parity have passed again**.

A generous operational ceiling (for example 8 iterations) prevents runaway execution. Reaching it never means “good enough”; it means operator review.

---

# 14. Bilingual parity and atomic bundle contract

Parity checks:

- same SeniorReportPlan project coverage;
- same fact/reference coverage;
- same mandatory limitations/disclosures;
- same re-audit comparability meaning;
- same priority meaning;
- equivalent conditions/caveats;
- same legal/reference conclusions;
- equivalent technical actions;
- language-specific naturalness allowed; literal translation not required.

`ReportBundleCandidate` is created only when both current language candidates are individually clean and parity-clean.

Atomic promotion:

1. calculate FR and EN candidate digests;
2. calculate bundle digest over both + shared dependencies;
3. automated final arbiter approves the bundle digest;
4. operator sees both exact PDFs + bundle digest and approves that digest;
5. upload/copy both PDFs to immutable content-addressed object keys;
6. read back/hash both objects and verify exact candidate digests;
7. create the immutable bundle manifest/record referencing both verified objects;
8. perform **one atomic compare-and-set/pointer update** making that bundle active for the audit/client;
9. only after pointer activation may client downloads resolve to the new pair;
10. prior approved bundle remains intact until the new pointer update succeeds.

No half-promoted FR/EN revision is ever client-visible.

---

# 15. State, concurrency, crash and delivery contract

## State machine

```text
running
 -> content-clean
 -> fr-candidate-clean / en-candidate-clean
 -> parity-clean
 -> bundle-final-review
 -> quality-approved
 -> awaiting-operator-approval
 -> operator-approved
 -> promoted
```

Any accepted edit or stale dependency returns to the appropriate earlier state.

## Lease/epoch

- one active quality run per audit/report bundle;
- immutable `qualityRunId`, renewable lease token and monotonic epoch;
- every patch/approval/promotion conditional on current lease/epoch;
- cancellation/supersession revokes lease;
- late provider responses discarded;
- stale workers cannot promote.

## Content-addressed DAG

Every artifact stores parent digests. Resume may reuse only nodes whose dependencies still match.

## Storage/delivery

- candidate objects private and unaddressable by client routes;
- approved FR/EN objects stored under immutable content-addressed keys;
- storage read-back/hash verified;
- one atomic active-bundle pointer selects both languages together;
- client route serves the active immutable object, never rerenders;
- ETag/digest headers derive from approved object; no overwrite-in-place cache ambiguity;
- rejected candidate images/prose follow short private diagnostic retention;
- no client prose/page PNGs in general telemetry.

---

# 16. Reference/legal freshness contract

Any deterministic client-facing external claim carries:

- reference ID;
- authoritative source metadata;
- version/publication/retrieval date where applicable;
- source hash or registry version;
- allowed freshness window or explicit “stable until changed” policy.

Before `ReportInputSnapshot` freezes:

- stale time-sensitive claims are refreshed or removed;
- unavailable source does not authorize a model-memory substitute;
- legal wording remains deterministic and scoped to what Odysseus can support;
- model reviewers may flag apparent inconsistency, but code/reference registry supplies corrections.

---

# 17. Implementation sequence

Implementation is sliced, but **no intermediate partial pipeline is marketed as quality-approved**. Keep the old production path until the new path passes its promotion corpus, or feature-flag new work privately.

## Phase A — contracts and fixtures

1. Update canonical docs for Plan-059 handoff, exact-fact authority, bilingual bundle, defect-vs-preference semantics, re-audit comparability and PDF QA boundary.
2. Build known-bad/known-good content and PDF fixtures first.
3. Add `ReportInputSnapshot`, `ReportFactRegistry`, `ReportCoverageLedger` and dependency digests.
4. Add `EvidenceBoundContent` and safe model-text rendering/sanitization.
5. Add the exhaustive `ReportModelProfile` registry and role resolver. Remove the generic report-quality-model seam from the Plan-058 path, make `gpt-5.6-sol` the initial quality-first candidate, persist profile IDs/digests/reasoning metadata, and add static/runtime tests proving no role can fall back to the legacy `OPENAI_MODEL`/`gpt-5.4-mini` path.

## Phase B — analysis/writing/review

6. Build deterministic dossier/packets from `ApprovedAuditEvidence`, including PatternEvidence, mandatory limitations and re-audit comparability.
7. Implement `SeniorReportPlan` without arbitrary project count.
8. Replace FR/EN writer prompts with senior-quality contracts.
9. Implement complementary dual content critics + issue adjudication.
10. Implement targeted patch engine + semantic diff guard.
11. Implement deterministic content/legal/reference/re-audit/performance-terminology/typography reconciliation.

## Phase C — exact candidate production

12. Split candidate rendering from approved persistence.
13. Add runtime VisualContract/VisualIntent/stable node/page manifests.
14. Add pre-PDF overlap/clipping/single-line/fragment gates.
15. Install/preflight exact-PDF toolchain.
16. Add canonical post-processing boundary if required.
17. Add exact-PDF structure/font/text/metadata/link/active-content gates.
18. Add dual-renderer 300-DPI raster + universal detail tiling + coverage manifest.

## Phase D — visual/parity/final review

19. Implement complementary dual all-page visual review.
20. Implement visual adjudication + bounded repair/rerender.
21. Implement bilingual parity including limitations and re-audit semantics.
22. Implement fresh final all-page/detail visual sweep.
23. Implement final document arbiter over exact current bundle.

## Phase E — lifecycle/delivery

24. Persist `ReportQualityRun`, leases/epochs and content-addressed dependency DAG.
25. Implement `LanguageReportCandidate` / `ReportBundleCandidate`.
26. Implement private `quality-approved` bundle and operator exact-digest approval.
27. Implement content-addressed FR/EN object persistence + atomic active-bundle pointer/CAS + immutable download routing.
28. Add dashboard stages/subprogress/conflict guards.
29. Add crash/resume/cancel/stale-worker tests.

## Phase F — evaluation/promotion

30. Build quality evaluation/fault-injection/fuzz harness.
31. Run Hôtel Point France mandatory acceptance case plus heterogeneous saved corpus.
32. Run repeated live-model stability evaluation.
33. Convert every discovered defect to a regression and rerun corpus after the last fix.
34. Operator reviews complete final Point France FR/EN bundle plus representative extreme reports.
35. Promote only when all Definition-of-Done conditions are met; retire old production wiring afterward.

---

# 18. Adversarial acceptance corpus

## Content faults

- wrong count/percentage/date/identity/SIREN/URL;
- wrong WCAG reference/version;
- Lighthouse lab metric mislabeled as field/Core Web Vital;
- mixed remediation job;
- unsupported root cause/business claim;
- unsupported lost-booking/revenue/conversion claim;
- unconditional noindex interpretation;
- omitted high-severity family;
- omitted mandatory limitation;
- duplicated finding/project membership;
- stale legal/reference claim;
- heuristic signal promoted as confirmed finding;
- newly-observable finding described as newly introduced;
- not-comparable finding described as resolved;
- FR/EN condition/action/disclosure drift;
- prompt injection text inside selector/URL/report content;
- bidi/control-character text.

## Visual/PDF faults

- DOM-clean but PDF-text-layer overlap;
- ordinary visible overlap;
- clipped one-line KPI;
- fallback/unembedded font;
- malformed glyph run;
- broken table/card continuation;
- duplicate fragment;
- blank/interior page;
- poor orphan handling;
- huge unexpected void;
- unreadably dense body text;
- cross-renderer divergence;
- broken/missing internal destination;
- malformed external hyperlink;
- PDF JavaScript/Launch/embedded file injection;
- corrupted metadata/language/outline;
- postprocessor changing layout;
- full-page image appearing fine while detail tile reveals defect.

## Shape/fuzz cases

Committed deterministic seeds covering thousands of rendered pages:

- extreme names/titles;
- 0/few/hundreds/thousands of findings;
- 1/3/6/12/20+ projects;
- varied digit lengths/percentages/units/dates;
- long URLs/selectors/code/Unicode/combining marks;
- 100+ page appendices;
- cards/tables at every page boundary;
- checklist/glossary capacity;
- flow/no-flow section transitions.

## Known-good controls

Clean fixtures/reports must stay unchanged except for explicitly allowed nondeterministic prose differences. Reviewers may not manufacture defects because they are asked to critique.

---

# 19. Evaluation policy

Before production promotion:

- Hôtel Point France is mandatory when saved evidence is available;
- include every suitable heterogeneous saved audit up to at least 12 initially;
- include clean/small, large/theme-heavy, performance-heavy, accessibility-heavy, archive-heavy SEO, multilingual, long-name and prior-failure cases;
- repeatedly run representative audits with candidate model profiles;
- facts, remediation coherence, conditionality, parity and gate outcome must remain materially stable even if wording varies;
- any model/prompt/schema/template/token/font/renderer/PDF-tool change that can affect client output reruns the relevant corpus;
- PDF/render divergence tolerances come from known-good fixtures/corpus and are not relaxed per-client to force a pass;
- no known-good control is materially degraded by reviewer pressure;
- after the **last** discovered defect, rerun the complete applicable corpus clean.

No live third-party scan is performed merely to fill a benchmark slot; use saved evidence unless the operator has current permission for the named site.

---

# 20. Dashboard/progress contract

Top-level phases remain understandable while detailed subprogress exposes real work:

```text
evidence-ready
report-plan
write-fr
review-fr
write-en
review-en
content-reconciliation
render-fr
pdf-qa-fr
visual-qa-fr
render-en
pdf-qa-en
visual-qa-en
parity
final-bundle-review
awaiting-operator-approval
complete
```

Show iteration/page/tile counts and current stage, not chain-of-thought or confidential prose. Regenerate/archive/delete controls remain disabled while conflicting work owns the audit/report bundle.

---

# 21. Fail-closed conditions

Never quality-approve/promote when any of these remains:

- Plan-059 evidence not approved/current;
- input/evidence/reference digest stale;
- conflicting deterministic facts;
- incomplete ReportCoverageLedger or missing mandatory disclosure;
- unbound exact factual scalar where binding is required;
- required model/reviewer unavailable;
- malformed/unvalidated model output;
- unresolved accepted objective defect of **any** severity;
- material `unsure` correctness issue;
- semantic patch diff outside declared target;
- unsupported/stale legal/reference claim;
- incorrect re-audit comparability language;
- content/parity reconciliation failure;
- DOM/Paged.js geometry failure;
- required postprocessor/tool missing;
- exact-PDF structure/font/text/metadata/link/security failure;
- cross-renderer material divergence;
- any physical page/detail region missing required review coverage;
- final visual sweep defect;
- final arbiter rejection;
- FR/EN candidates not derived from same current shared plan/input state;
- bundle digest/input snapshot changes after review;
- lease/epoch lost;
- storage read-back mismatch;
- atomic active-bundle pointer cannot safely switch both languages;
- operator has not approved the exact current bundle digest;
- iteration ceiling reached.

Outcome is `needs-operator-review`, `cancelled` or `failed`, never silent fallback.

---

# 22. Explicitly rejected alternatives

- One strong-model “polish” call at the end.
- Letting a model correct scanner evidence directly.
- Reconstructing scan truth independently from loose raw files after Plan 059 approval.
- Reviewing only JSON/HTML/pre-PDF DOM.
- Reviewing only executive pages.
- Full-page-only vision review with tiny unreadable text.
- One PDF renderer as the only visual truth.
- Model-authored per-client CSS/HTML.
- Whole-report rerolls until a model claims satisfaction.
- Automatically patching every unilateral criticism.
- Treating accepted minor defects as shippable.
- Treating subjective preferences as defects that loop forever.
- Letting FR and EN be promoted independently.
- Overwriting stable report object paths and trusting caches.
- Performing PDF optimization/tagging after final QA.
- Freehand model-generated exact facts followed by best-effort checking.
- Flattening `newly-observable`/`not-comparable` into ordinary delta language.
- Shipping because time/money has already been spent.
- Rerendering or mutating after operator approval.
- Cross-provider review without approved data boundary.
- Optimizing cost before the quality corpus is clean.

---

# 23. Executable closure contract

Plan 058 cannot be closed from prose review alone. Before its status may become `DONE`, maintain a requirement-to-proof table in this file or a linked committed verification artifact covering every binding section (1-21). Every row must name:

```text
requirement / invariant
owning implementation artifact
automated test or deterministic check
manual/corpus proof only where automation cannot decide quality
result / commit or artifact reference
```

A row is incomplete if the implementation or proof column is blank, says only “reviewed”, or points only to a broad `pnpm run check` without a test that exercises the invariant.

Additional mandatory closure proofs:

- a role-profile coverage test enumerates every `ReportQualityRole` and proves each resolves to an explicit profile;
- a negative test proves Plan 058 cannot use `OPENAI_MODEL`, `gpt-5.4-mini`, a wildcard profile, or a generic report-quality fallback;
- the selected profile matrix and reasoning efforts are included in the benchmark artifact;
- the benchmark compares the candidate profile matrix against the prior production baseline on the saved corpus and records factual, coverage, parity, schema/retry and editorial outcomes;
- any profile/model/reasoning change after that artifact invalidates closure until the applicable corpus is rerun;
- the final source trace searches every binding “must”, “never”, “only”, “blocking”, “required” and “fail-closed” statement and accounts for it in the requirement-to-proof table.

---

# 24. Definition of done

Plan 058 is implemented only when all are true:

1. production report generation accepts only current `ApprovedAuditEvidence` or a Plan-059 approved legacy adapter result;
2. one canonical `ReportInputSnapshot` governs all report-only inputs and staleness;
3. every mandatory evidence limitation/disclosure has a deterministic report destination and omission is blocking;
4. re-audit coverage-comparability state is a structured report input and cannot be flattened into false regression/resolution language;
5. `ReportFactRegistry` binds exact numbers, identity/date/URL/enum/reference facts used in model prose;
6. `EvidenceBoundContent` rejects freehand exact facts outside the closed allowlist;
7. model content is safely escaped/sanitized and cannot inject HTML/JS/bidi/control-layout tricks;
8. hierarchical evidence packets and `ReportCoverageLedger` are deterministic and exhaustive;
9. SeniorReportPlan uses coherent remediation projects with no arbitrary target count;
10. Plan-059 PatternEvidence/limitations are correctly consumed;
11. complementary dual content critics, adjudication and targeted patching ship;
12. accepted objective defects of any severity block approval until verified repaired;
13. preferences are distinct from objective defects and cannot force endless polishing;
14. deterministic content/legal/reference/re-audit/performance-terminology/typography reconciliation passes;
15. candidate rendering is private and separate from approved persistence;
16. runtime VisualContract/VisualIntent/page manifests exist;
17. pre-PDF overlap/clipping/single-line/fragment gates block bad DOM geometry;
18. any PDF post-processing happens before candidate hashing and final QA;
19. exact-PDF structure/font/text-bbox/metadata/link/active-content gates block emitted-byte defects;
20. report PDF accessibility invariants are checked without false PDF/UA claims;
21. every page is rasterized by two independent PDF engines;
22. every page has full-page **and readable-detail** visual-review coverage with exact batching/coverage manifests;
23. both complementary primary visual reviewers cover every page;
24. visual disagreements are adjudicated;
25. fresh final visual reviewer covers every page/detail view after the last change;
26. bilingual parity includes limitations and re-audit semantics;
27. FR and EN are bound into one atomic `ReportBundleCandidate`;
28. final independent arbiter approves the exact current bundle;
29. automated success yields a private exact-digest bundle only;
30. operator approves `qualityRunId + bundleDigest` after viewing both exact PDFs;
31. promotion stores immutable content-addressed FR/EN objects, verifies both read-back hashes, then atomically switches one active-bundle pointer/CAS;
32. download routes never rerender and cannot expose half-updated/cached stale language revisions;
33. quality-run leases/epochs prevent stale workers from writing or promoting;
34. crash/resume reuses only content-addressed matching DAG nodes;
35. reference/legal source freshness/provenance is enforced;
36. adversarial content/PDF fault injection is green;
37. deterministic layout fuzzing exercises thousands of pages;
38. known-good controls are not degraded;
39. repeated live-model evaluations show materially stable truth/quality outcomes;
40. Hôtel Point France and heterogeneous saved corpus rerun clean after the final discovered defect;
41. operator accepts the complete Point France pair and representative extreme reports editorially and visually;
42. dashboard/progress/conflict controls reflect the real pipeline;
43. canonical docs/deploy tooling describe the shipped contract;
44. full repository validation and relevant e2e/store/toolchain tests are green;
45. every Plan-058 model role resolves through the exhaustive approved
    `ReportModelProfileRegistry`, with no generic/legacy fallback;
46. the production model-profile benchmark manifest is current for every role
    and the relevant corpus has been rerun after the last profile/model/
    reasoning change;
47. a requirement-to-proof closure ledger maps every binding Plan-058
    requirement to implementation plus machine/manual acceptance evidence, with
    no prose-only closure.

## Freeze criterion

The final architecture review was run specifically against evidence authority, content truth, re-audit semantics, visual coverage, concurrency, privacy, delivery, cache behavior and evaluation. After the corrections above, it produced **no further substantive architectural change**. Freeze Plan 058 here. Later amendments should be triggered by implementation evidence, corpus failures, model/tool changes or a real delivered-report defect — not speculative expansion.

The client-facing invariant is simple:

> **An approved Odysseus audit report is one atomically versioned FR/EN bundle whose exact evidence, interpretation, factual tokens, limitations, re-audit semantics, writing, typography, pagination, fonts, PDF structure, links, rendering and every physical page have been checked against the same immutable upstream evidence and the exact bytes the operator approves and the client receives.**

---

# 25. Requirement-to-proof ledger (2026-09-18)

Every binding rule cluster maps to its owning seam and a focused,
machine-checked proof; corpus- and operator-dependent acceptance is named in
the last column, and OPEN rows keep the plan from `DONE`. Test names are
quoted from the committed suites. `R-M-P` abbreviates
`packages/llm/src/report-model-profiles.test.ts`.

| Rule / invariant (plan §) | Owning code seam | Focused automated proof | Real-data acceptance |
| --- | --- | --- | --- |
| §1/§5.1 Report production starts only from an immutable `ApprovedAuditEvidence`; refused when assessed-unapproved, root/quality digest mismatched, or findings changed after approval | `packages/interface/src/pipeline/report-quality-evidence.ts`; `packages/scanner/src/artifacts/*evidence*` readers | `report-quality-evidence.test.ts`: "refuses evidence that was assessed but never approved", "refuses evidence whose audit root or quality assessment digest does not match", "refuses when findings changed after evidence approval" (+ pipeline integration "refuses evidence that changed after approval when loading from the audit directory" in `report-quality-pipeline.test.ts`) | Plan 059 supplies the canonical approvals; legacy adapter limited to graph-less audits |
| §1/§14 FR+EN are one atomic bundle; automated approval is private; only the operator promotes exact bytes | `report-quality-pipeline.ts` bundle construction; `report-quality-promotion.ts` | pipeline "approves a clean bilingual bundle and lands in awaiting-operator-approval"; store "recording a quality-approved bundle persists private FR/EN candidates retrievable only by the exact bundle digest"; promotion "refuses a bundle that is not approvable from its current state" | Operator approval of the corpus Point France bundle (§24 DoD 41) |
| §1/§5.7-5.8 Accepted objective defects of any severity block; preferences never do; material `unsure` routes to operator; no whole-report reroll | `report-quality-pipeline.ts` adjudication loop | pipeline "stops on an accepted objective defect that needs a non-prose owner", "treats a rejected preference as non-blocking and still approves", "routes a material unsure verdict to needs-operator-review without speculative rewriting", "exhausts the bounded content repair loop and ends in needs-operator-review" | Corpus shows editors repair without unrelated drift (D40) |
| §1/§9 Repairs target exact semantic addresses; patch engine rejects collateral change | `report-quality-draft.ts` `applyTargetedWriterPatches` | `report-quality-draft.test.ts`: "applies only the accepted issue's declared targets, byte-identical elsewhere, input never mutated", "refuses unaccepted issue ids…", "refuses unsupported target formats and unknown projects" | — |
| §1/§14/§15 A missing quality dependency keeps the report unavailable; no legacy fallback path | promotion gate; `report-quality-promotion.ts` legacy-adapter refusal | promotion "refuses legacy-adapter evidence before any storage work"; profiles "never falls back to a legacy or generic environment model" | — |
| §2/§21 Zero-known-defect fail-closed conditions (L1119-1147) | pipeline gates + store state machine + promotion | pipeline fail-closed matrix (visual defect, final-sweep defect, arbiter refusal, parity rejection, unassigned finding → all end `needs-operator-review`/`failed`, never silent fallback); store "a transition outside the Plan 058 state machine is refused…" | Corpus/`unsure` inputs exercise the same gates (D36/D40) |
| §2/§5.4-5.5 Fact registry + dossier + coverage ledger are deterministic and exhaustive; every mandatory disclosure has a deterministic destination; an omitted finding is detectable | `packages/report/src/quality/dossier.ts` | `dossier.test.ts`: scalar facts bind only to approval/input digests; dispositions unassigned/project/appendix-only for every finding; "detects a finding missing from the coverage ledger" (regression for the silent-omission hole fixed 2026-09-18); every mandatory disclosure checked against its destination; packets/patterns derive from payload only | Corpus fact stability (D40) |
| §2/§3.10/§7/§8 Re-audit comparability is structured; `newly-observable` is never a regression; `not-comparable` is never resolved; no unsupported business causality; Lighthouse lab ≠ CrUX field, TBT/SI never Core Web Vitals | `packages/report/src/quality/plan-guards.ts` | `plan-guards.test.ts`: comparability accept/reject rows; "flags unsupported lost-booking/revenue/conversion causality (FR+EN)"; "flags a lab metric presented as field data or a Core Web Vital"; clean-prose negatives | Corpus editorial review (D40) |
| §3.2/§5.3/§7 Exact scalars are code-bound; freehand digits/URLs rejected outside the allowlist; bidi/control/HTML-neutralization under a closed policy; URLs/selectors survive byte-for-byte | `packages/report/src/quality/evidence-bound-content.ts`; `report-quality-draft.ts` | `evidence-bound-content.test.ts` (11 proofs incl. sanitization + byte-for-byte survival); `report-quality-draft.test.ts`: "refuses freehand digits/URLs in text segments", "refuses unknown fact bindings in any content segment" | — |
| §5.1/§5.13/§15 One canonical immutable snapshot binding evidence digests, renderer/font fingerprints and the model-profile matrix; append-only lineage; never chain-of-thought | `report-quality-pipeline.ts` snapshot assembly; `reportQualityRuns` documents | pipeline "binds the input snapshot to the approved evidence digest and model profile matrix"; store "starting a report quality run persists lineage bound to the lease epoch and token hash"; "model call provenance round-trips role, profile digest, requested/resolved model, provider fingerprint, reasoning effort, and prompt/schema digests and versions through the run lineage" | — |
| §5.6/§5.9/§5.12/§14 Senior plan: no target count, one coherent job per project, duplicate membership rejected (shared-dependency exemption), unknown findings/priorities rejected, wrong snapshot digest rejected | `plan-guards.ts` `assertSeniorReportPlan` | `plan-guards.test.ts`: duplicate-membership rows (regression for the missing rejection fixed 2026-09-18), shared-dependency exemption, unknown findings/priorities, empty projects, wrong snapshot digest | Corpus remediation coherence (D40) |
| §5.11/§14 Bundle digest is canonical over both language candidates + shared deps; recompute-without-digest reproduces it | `report-quality-pipeline.ts`; `@odysseus/report` canonical JSON | pipeline "approves a clean bilingual bundle…" recomputation block; `digest.test.ts` key-order determinism + divergence rows | — |
| §6/§6.1 Exhaustive per-role profile matrix, `gpt-5.6-sol`, `high`/`xhigh`, vision exactly where needed, stable ids/digests; fail-closed resolution; no legacy `OPENAI_MODEL`/`gpt-5.4-mini`/wildcard/env catch-all; provenance persists prompt/schema versions | `packages/llm/src/report-model-profiles.ts`; `report-quality-client.ts`; `packages/core/src/types/report-quality.ts` | R-M-P "covers every report-quality role with an explicit Sol profile", "uses xhigh for senior/adjudication/final arbitration roles", "requires vision modality exactly for the roles that review rendered pages", "fails closed on a role without an approved profile instead of defaulting", "never falls back to a legacy or generic environment model", "cannot silently reach the legacy Mini or generic report-quality model seams"; `scripts/check-plan-quality.mjs` ratchets (source scan + coverage-test presence + plan strings) | Cheaper-profile substitution needs the corpus (D46) |
| §6.1/§23 Benchmark manifest release artifact; every profile names a corpus approval; production promotion blocked while any approval is pending/stale/missing | `packages/llm/src/report-profile-benchmarks.ts`; `report-quality-promotion.ts` preflight | R-M-P "names a manifest approval for every production profile", "lets a current approval stand only with a run date and committed artifact", "blocks production promotion while any profile corpus approval is not current", "treats an approval missing from the manifest as blocked, never as approved"; promotion "is refused with `ReportProfileBenchmarkNotCurrentError` before any bundle lookup" | **OPEN:** the manifest's approval is `pending` — the mandatory saved-corpus run (§19) must record its artifact and flip it `current` |
| §7/§8 Complementary dual critics + adjudication; deterministic gate failures become accepted defects; reviewer outputs schema-validated with per-role provenance | `report-quality-client.ts` per-role prompts/schemas; pipeline critic/adjudicator stages | pipeline "records role and model provenance for every model call in run lineage"; llm zod contracts exercised by every scripted pipeline test (parsers run for real) | Critic emphasis quality is corpus-judged (D40) |
| §11.1/§17 Exact-PDF structural/text/font gates; dual-engine rasterization; deterministic gate digest; fail-fast on missing tools | `packages/report/src/quality/pdf-quality.ts` | `pdf-quality-gate.test.ts` + `pdf-quality.test.ts` (17 proofs: corrupt/truncated rejection, page-count drift, empty text layer, non-embedded font rejection, dual-engine coverage failure, post-process output checks, gate-digest determinism; real poppler on a minimal PDF where binaries exist) | **OPEN:** `qpdf`/`mutool` absent from the dev container — full-toolchain pass + cross-engine divergence tolerances from corpus fixtures (D21/D22) still need a machine with the complete §17 toolchain |
| §11.2/§12 Every page rasterized + full-page and detail tiles; two physical+design reviewers and a fresh final reviewer see every page/tile; unsured/adjudication routed | `report-quality-pipeline.ts` `renderAndReviewLanguage`/`visualReview` | pipeline "sends an accepted first-pass visual defect to operator review without looping visual repairs", "sends a fresh final visual defect to operator review", "binds… page manifests"; no batching path exists, so coverage-by-construction is enforced in code review of `VISUAL_REVIEW_PAGE_BATCH = 1` | **OPEN:** reviewer recall/precision on real pages is corpus-proven only (D22-D25) |
| §13 Content repair loop bounded at 8; exhaustion means operator review, never ship | `report-quality-pipeline.ts` `MAX_CONTENT_REPAIR_ITERATIONS` | pipeline "exhausts the bounded content repair loop and ends in needs-operator-review" (asserts `content-repair-limit`, no bundle, lease released) | — |
| §14 Parity includes limitations + comparability semantics; bundle created only when parity-clean | `report-quality-pipeline.ts` `assertParity` | pipeline "blocks the bundle on a parity rejection"; parity reviewer role validated through the real zod contract | Semantic-parity meaning is corpus-judged (D26) |
| §15 Lease/epoch exclusivity; stale workers cannot write or promote; crash cancellation releases | `packages/store/src/report-quality.ts` | store "acquiring a live lease twice for one audit conflicts…" (regression for the double-acquire hole fixed 2026-09-18), "renewing…", "releasing…", "an expired lease is taken over with a new token and a monotonic epoch bump", "asserting a lease with a wrong token, wrong epoch, or after release throws…", "a transition from a stale epoch lease is refused…", "refuses to start without the private artifact store" (lease untouched) | — |
| §15 Atomic FR/EN activation under one pointer; monotonic revision; no half-promoted pair | `store/src/report-quality.ts` `atomicallyActivateReportBundle` | store activation suite (3 tests incl. failed-half-promotion rollback) — **gated on a replica-set test database**; standalone mongod skips them | **OPEN:** run the activation suite once against a replica-set test DB |
| §15/§11.2 Content-addressed immutable objects; read-back verification; promotion refuses missing/changed candidate bytes; delivered objects immutable | `report-quality-storage.ts`; `promoteContentAddressedPdf` | `report-quality-storage.test.ts` (12 proofs: collision refusal, byte-corrupting store caught, promotion idempotency, digest mismatch refusal) | — |
| §16 Reference/legal freshness registry with source/version/retrieval metadata | **not implemented** — `ReportInputSnapshot.referenceRegistryDigest` pins an empty template-owned set; models may not author references (enforced by `report-quality-draft.test.ts` reference-binding refusals) | — | **OPEN:** implement the deterministic reference registry + freshness policy, or amend the plan to pin the template-owned reference set explicitly |
| §10 Bounded code-owned layout variants selectable by models | **not implemented** — visual defects route to `needs-operator-review` (fail-closed substitute: no unbounded visual repair loop exists) | pipeline visual rows above prove the fail-closed substitute | **OPEN:** implement §10 variants + visual repair/rerender loop, or amend |
| §20 Dashboard exposes per-language stages, subprogress counts, conflict-guarded controls | `packages/interface/src/dashboard/routes/audit-reports-section.tsx` status/approve card; `routes/audits.ts` report-quality endpoints | approve control is disabled when `evidenceApprovalMode === 'legacy-adapter'` (component logic; no focused test) | **OPEN:** focused dashboard test for the conflict guards + per-language subprogress |
| §17 wire-up/§24 D43 Canonical docs + deploy tooling describe the shipped contract | `docs/agents/plan-quality-gates.md` safeguard 4-5; deploy renderer fingerprint seam | `plans:check` model-profile ratchets | **OPEN:** deployment docs note the benchmark-manifest preflight before promotion |

Closure evidence (engineering, 2026-09-18): the ledger above. Focused suites
committed on this date: `report-model-profiles.test.ts` (10),
`report-quality-evidence.test.ts` (loader), `report-quality-draft.test.ts`
(13), `report-quality-storage.test.ts` (12), `report-quality-promotion.test.ts`
(7), `report-quality-pipeline.test.ts` (14, scripted-model fail-closed matrix),
`report-quality-benchmark.test.ts` (10), store `report-quality.test.ts` (13 +
3 replica-set-gated), `packages/report/src/quality/*.test.ts` (72). Writing
these proofs exposed and fixed: the coverage ledger silently passing omitted
findings, missing duplicate-plan-membership rejection, three missing
prose-fault detectors (business causality, re-audit comparability), the lease
double-acquire hole, and the promotion benchmark gate. `pnpm run plans:check`,
package typechecks and every suite above are green at the closing commit.

**Still required before `DONE`:**

1. the mandatory saved-corpus benchmark run (§19: Hôtel Point France + ≥12
   heterogeneous saved audits, repeated stability, comparison against the
   prior production baseline), recorded in a committed artifact that flips the
   benchmark manifest approval `current` — needs the operator's authorization
   for live model spend;
2. the operator's editorial/visual acceptance of the resulting Point France
   FR/EN pair (DoD 41);
3. the OPEN rows: §16 reference registry decision, §10 layout variants + visual
   repair loop, §20 dashboard conflict-guard proof, replica-set activation run,
   complete-PDF-toolchain corpus run;
4. rerun of every suite above plus the repository `pnpm run check` after the
   last change (DoD 44).
