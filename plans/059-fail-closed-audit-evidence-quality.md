# Plan 059: Make full-audit evidence fail closed before report generation

> **Executor instructions**: Follow this plan in order. Plan 058 can make the
> report interpretation and PDF extraordinarily strong, but it must never be
> asked to rescue weak evidence. A paid full audit may enter the Plan 058 report
> pipeline only after the exact scan/normalization evidence snapshot has passed
> the completeness, provenance, consistency, repeatability, and safety gates
> below. Cost is not an optimization target. Do not weaken a scan, skip a retry,
> reduce a required measurement, or accept unexplained missing evidence merely
> to save API/CPU/runtime cost. Preserve already-good work: retries target only
> missing or unstable evidence and never restart a multi-hour audit without a
> factual reason. Never bypass robots.txt, change the published crawler identity,
> or increase load to force coverage. If the evidence cannot become trustworthy,
> stop in `needs-operator-review` or `failed`; do not hand an ambiguous dataset
> to the report model.
>
> **Drift check (run first)**:
> `git diff --stat 2316109d9b8bc0eb2e054e04edbc6a7483e86c70..HEAD -- CLAUDE.md docs/rules/normalization-rules.md docs/rules/manual-accessibility-checklist.md docs/decisions/trade-offs.md packages/core/src packages/scanner/src packages/store/src packages/interface/src/pipeline packages/interface/src/queue packages/interface/src/dashboard deploy scripts plans/058-fail-closed-senior-report-quality-pipeline.md`
> If any in-scope seam changed, compare this plan with live code before editing.
> Preserve the outcomes and invariants below; update stale module seams rather
> than applying an old excerpt mechanically.

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH — crawl inventory, browser measurement, pass coverage,
  normalization, persistence, checkpoint/resume, and the contract consumed by
  Plan 058 all change.
- **Depends on**: plans 021, 035, 050 and 051 (delivered/implemented as noted in
  the plan index). Coordinates with Plan 058; **058 must not be promoted to
  production until this plan's evidence-approval contract is available.**
- **Category**: paid full-audit quality, scanner evidence, normalization
  integrity, measurement reproducibility
- **Planned at**: commit `2316109d9b8bc0eb2e054e04edbc6a7483e86c70`,
  2026-09-17
- **Review state**: initial design hardened through **ten distinct review
  passes** before implementation.

## Scope

**In scope**: paid `full-audit` acquisition from scope/inventory through
normalization and evidence approval; page/site/performance coverage; selective
retries; browser-state isolation; mobile/hydrated coverage; performance
repeatability; evidence provenance; observation retention; page classification;
systemic-pattern evidence; temporal coherence; crash/resume; evidence-quality
UI; and the exact upstream contract consumed by Plan 058.

**Out of scope**:

- outreach `quick-check` behavior except for shared primitives that remain
  backward compatible;
- allowing a model to invent website findings from screenshots or raw page
  content;
- claiming formal RGAA/WCAG conformity from automated evidence;
- authenticated/private client areas unless a later, explicit scoped plan adds
  safe credentials and authorization;
- arbitrary crawling of third-party booking engines or payment flows;
- replacing deterministic scanner findings with model judgment.

## Binding operator decisions

1. **Evidence quality is the objective; cost is not.** Optimize scan time or
   compute only after the quality contract is measured unchanged.
2. **A perfect report cannot repair uncertain evidence.** Plan 058 may start
   only from an approved `AuditEvidenceSnapshot`.
3. **Site behavior and measurement failure are different facts.** HTTP 404,
   robots exclusion, a genuine soft-error page, scanner timeout, browser crash,
   anti-bot interstitial, and operator exclusion must never collapse to one
   generic "failed page" bucket.
4. **Retry missing evidence, not the whole audit.** A three-hour successful
   crawl is not repeated because three checks failed. Re-run the smallest safe
   unit whose evidence is absent or unstable.
5. **Never overwrite an attempt.** First result, retries, accepted result and
   rejection reason remain independently auditable.
6. **No bypass behavior.** Retries keep the published user agent, robots rules,
   crawl-delay floor and safe scope. They may slow down, serialize, extend a
   timeout, or use a fresh browser; they never masquerade as a different client
   or raise load.
7. **No sampled-result propagation.** A Lighthouse family representative is a
   measurement of that URL only. A repeated template may support an inference
   about shared remediation, never fabricated measurements on siblings.
8. **No model-created website findings.** Website screenshots/raw HTML remain
   outside the model finding path. Heuristic/manual gaps may become review
   signals, not confirmed findings, until deterministically or manually
   verified.
9. **Known scope omissions are explicit.** Hitting a page cap, omitting a
   continuation family, robots exclusions, non-HTML drops, manual exclusions,
   external redirects and unexplained inventory gaps each have distinct
   provenance and disclosure.
10. **Behavioral checks may not contaminate baseline checks.** Any check that
    changes focus, form validity, viewport, disclosure state, cookies or DOM
    state runs in an isolated state/context or after all baseline evidence it
    could affect has been captured.
11. **Performance claims carry measurement confidence.** Important performance
    conclusions do not rest on one unexplained noisy Lighthouse observation.
12. **The entire evidence bundle is content-addressed.** `findings.json` alone
    is insufficient provenance because the report also uses coverage, good
    metrics, CrUX, roles, site signals and below-threshold measurements.
13. **Old scans remain usable when their evidence is sufficient.** Tool/data
    version mismatch is advisory per Plan 050. A historical scan is rejected
    only when the requested current output requires evidence it genuinely does
    not contain or its stored artifacts fail integrity checks.
14. **Scanning is non-destructive.** No real form submission, booking,
    purchase, account mutation or destructive request is performed to improve
    evidence quality.
15. **Irreducible uncertainty is surfaced, not guessed away.** A report may be
    generated with explicitly known site-controlled limitations only under the
    verdict rules below; unexplained scanner uncertainty stops for operator
    review.

## Operational definition of perfect evidence

No crawler can prove that it discovered a URL the site never links, declares,
or exposes, and no automated accessibility scanner can prove full WCAG
conformity. For Odysseus, "perfect scan data" therefore means **zero known
unexplained material measurement gap in the declared audit scope, complete
traceability for every accepted observation, and explicit bounded limitations
for what cannot be measured**.

Before Plan 058 may consume an audit:

- the audit scope and every inventory source/omission are recorded;
- no known page cap silently truncates a paid full audit;
- homepage/start URL and every operator seed have complete required content
  evidence or the audit stops;
- every planned check has an explicit outcome and attempt lineage;
- transient/environment/tool failures have undergone the configured targeted
  recovery sequence;
- persistent gaps are classified as site-observed, site-controlled limitation,
  scanner/environment failure, or operator decision rather than one generic
  error;
- baseline evidence is not contaminated by a prior state-mutating check;
- required desktop/mobile/hydration surfaces completed or have an explicit
  quality disposition;
- selected Lighthouse measurements pass the performance confidence policy;
- CrUX `no data` is distinct from a failed CrUX acquisition;
- accepted evidence belongs to one coherent scan epoch, or temporal drift has
  been detected and repaired/qualified;
- every raw page artifact and derived evidence artifact verifies against the
  approved snapshot digest;
- normalization is deterministic over that snapshot and all finding/signal
  totals reconcile;
- heuristic/conditional review signals are not silently counted as confirmed
  deterministic findings;
- page-role and template/systemic inferences carry source evidence and
  confidence;
- the known automated-accessibility capability/gap registry matches what
  actually ran;
- the final `EvidenceQualityAssessment` is `reportable-complete` or
  `reportable-with-known-limitations`; otherwise 058 is blocked.

---

# Ten-pass hardening review

The following ten reviews were performed from deliberately different failure
perspectives. Their conclusions are binding parts of the plan, not optional
future ideas.

## Pass 1 — Scope, inventory and crawl-completeness falsification

### Defects found in the first sketch

The existing `crawl-coverage-gate.ts` answers a useful but coarse question. It
rejects more than 30% crawl failures and, only under a clean uncapped sitemap,
a scan below 70% of sitemap coverage. That leaves several premium-audit blind
spots:

- a paid audit can be below the failure threshold while a critical entry page
  is the one that failed;
- a known `maxPages` truncation can disable the sitemap corroboration instead
  of proving the audit complete;
- site-observed 404/5xx responses are mixed with scanner/navigation failures in
  one headline failure share;
- continuation omissions, robots exclusions, extension-dropped resources,
  manual exclusions and external redirects have different meanings;
- extension-dropped non-HTML URLs currently disappear before manifest
  inventory and therefore leave no audit-trail summary;
- "not discovered" cannot be treated as "does not exist".

### Hardening decision

Add an immutable `AuditScopeSnapshot` and complete `InventoryLedger` before
content scanning. Every discovered candidate has discovery sources, normalized
page identity and one terminal inventory disposition. Full-audit quality uses
**reasoned dispositions, not one percentage threshold**.

A known page cap with additional eligible pages is blocking for an ordinary
paid full audit. It is allowed only when the operator explicitly changes the
scope before scanning; the narrowed scope is then part of the snapshot and
client-facing limitation.

Never promise unknowable completeness. The quality statement is "all known
in-scope inventory reconciled" rather than "every URL on the internet version
of this site was discovered".

## Pass 2 — Check completeness, failure taxonomy and recovery

### Defects found

The current scanner already records `completed | partial | failed |
not-planned`, and `checkOutcomes` is an excellent foundation, but reportability
is still more strongly gated at crawl level than at individual measurement
level. A page can survive with a partial extended pass after a timeout and
continue downstream without a quality-repair stage.

Blindly retrying all failures is also wrong: a genuine HTTP 404 is evidence;
an axe/browser crash is missing evidence; repeated anti-bot blocks require an
allowlist/slowdown, not more requests.

### Hardening decision

Introduce typed `CheckAttempt` history plus a `FailureClass` registry:

- `site-http-state`;
- `robots-policy`;
- `soft-error-or-interstitial`;
- `not-applicable`;
- `operator-excluded`;
- `scanner-timeout`;
- `scanner-tool-error`;
- `browser-environment-error`;
- `dependency-error`;
- `anti-bot-or-rate-limit`;
- `unstable-result`;
- `unknown`.

Recovery is smallest-unit first: normal attempt -> isolated retry -> fresh
browser/serial/slow diagnostic retry where safe. Anti-bot/rate-limit stops
escalating load and asks for pacing/allowlisting. The accepted result points to
one or more attempts; previous attempts remain immutable.

## Pass 3 — Browser-state contamination, page readiness and dynamic surfaces

### Defects found

`runRenderedAnalysis` intentionally reuses one rendered navigation for axe and
many custom checks. That was an efficiency win, but quality mode cannot assume
that focus walking, form validation, viewport changes, consent state or other
behavioral checks leave later checks unchanged. A single navigation also misses
responsive DOM that exists only on mobile and content materialized only after
safe scrolling/lazy hydration.

### Hardening decision

Split full-audit acquisition into explicit `ScanSurface`s and isolation groups:

- immutable baseline desktop surface;
- immutable baseline mobile surface;
- bounded hydrated surface after a safe scroll sweep when the DOM materially
  expands;
- separate fresh contexts for state-mutating behavioral checks (keyboard,
  form-error interaction, reflow/viewport-specific routines, and future safe
  state exploration).

Baseline extraction always happens before mutating checks. Add a deterministic
readiness record: navigation milestone, font readiness, bounded network quiet,
DOM mutation quiescence, hydration outcome and timeout reason. A page that never
settles is not silently treated as an ordinary stable page.

Add a `ScanSideEffectGuard` around interaction checks. It refuses real form
submission and destructive/non-idempotent navigation initiated by the scanner.
Existing synthetic untrusted form validation stays safe. Safe state exploration
is limited to same-document controls with deterministic local targets; never
click arbitrary booking/payment links merely to increase coverage.

Multi-surface observations must not inflate occurrence counts. Attempts and
viewports are observation dimensions, not automatically separate defects.

## Pass 4 — Performance measurement repeatability and host calibration

### Defects found

The current staged Lighthouse planner is honest about sampling and serializes
Lighthouse to reduce CPU contention. The remaining quality gap is statistical:
one noisy lab observation can become a strong client-facing claim, and the
scanner currently lacks a recorded host-health calibration around a long
performance run.

### Hardening decision

Keep the current no-propagation planner, then add `PerformanceMeasurementSet`:

- homepage, transactional pages and operator seeds receive three isolated
  Lighthouse runs by default;
- other selected pages receive one primary run and automatic repeats when the
  result is severe, near a report threshold, internally inconsistent, or the
  environment/calibration flags instability;
- reports consume median/representative value plus spread/confidence, while all
  raw runs remain stored;
- no cherry-picking the best run;
- a local controlled calibration fixture runs before and after the Lighthouse
  window to detect gross CPU/runtime drift; thresholds are set from measured
  corpus variance, not guessed constants;
- capture host load/memory and the Lighthouse environment fingerprint;
- CrUX acquisition is retried on transport/provider error and explicitly
  distinguishes `no public data` from `fetch failed`.

Do **not** triple every Lighthouse page merely because cost is available. Extra
measurements must increase confidence rather than multiply crawl time without
an uncertainty question.

## Pass 5 — End-to-end evidence provenance and artifact integrity

### Defects found

`FindingsProvenance` hashes normalized findings, schema version and
normalization fingerprint. Plan 058 also relies on facts that never become
findings: pass coverage, good metrics, CrUX, site signals, page roles, sitemap
facts and below-threshold render/performance values. A findings digest alone
cannot prove that entire input stayed unchanged.

### Hardening decision

Create content-addressed `AuditEvidenceSnapshot` with hashes for:

- `AuditScopeSnapshot`;
- inventory ledger;
- manifest;
- accepted per-page scan artifacts / attempt ledger;
- site-level evidence;
- performance measurement sets;
- observation ledger;
- normalized findings;
- review signals;
- coverage ledger;
- classification/pattern evidence;
- scanner/config/environment fingerprint.

Use canonical serialization and a top-level SHA-256/Merkle-style root. Verify
private artifact-store sync by digest/read-back rather than trusting a write
return. Plan 058's `ReportInputSnapshot` references this root digest. Any
upstream mutation invalidates downstream report approval.

Version mismatch alone does not invalidate an old scan. A compatibility adapter
can construct a legacy evidence snapshot when the required facts exist; missing
facts become explicit legacy limitations rather than forcing every historical
site to be rescanned after harmless code changes.

## Pass 6 — Lossless observations, normalization consistency and signal/finding separation

### Defects found

`Finding.elements` is intentionally capped and coarse aggregation deliberately
collapses repetitive selectors. That is appropriate for a bounded client-facing
finding, but not ideal as the only source for Plan 058's systemic/root-cause
analysis. Some current outputs are heuristic or conditional yet can still sit
near deterministic findings in totals.

### Hardening decision

Add a private, derived `ObservationLedger` (compressed NDJSON is sufficient;
no new database megadocument) that indexes every normalized scanner observation
without storing full raw HTML. Each observation carries source/check, page,
surface, accepted attempt, selector/resource identifier where applicable,
bounded snippet/value evidence, native severity, timestamps and source artifact
hash.

`Finding` remains the bounded confirmed-remediation contract. Add separate
`AuditSignal` for heuristic/conditional review signals. Do not inflate the
headline deterministic finding count with unconfirmed signals. Provide a
compatibility classifier for legacy heuristic rule IDs so old audits can be
rendered honestly without rewriting their historical `findings.json`.

Add a global `EvidenceConsistencyGate` that verifies at minimum:

- every finding page belongs to the reconciled inventory/coverage set it claims;
- occurrences and page scopes reconcile with source observations;
- no accepted attempt contradicts its pass outcome;
- completed Lighthouse rows have required measurement data;
- not-planned Lighthouse pages were actually unselected;
- page identities are unique under the canonical identity rule;
- site-level conclusions have site-level acquisition provenance;
- category/severity/WCAG totals recompute exactly;
- heuristics/signals do not leak into confirmed totals;
- normalization over the same approved raw snapshot is deterministic and
  digest-stable.

## Pass 7 — Page classification and systemic-pattern evidence

### Defects found

The repo's own 2026-09 page-role remeasurement found fallback/unknown still
dominant on the measured real audits, and the raw `roleSignals` are not
persisted. The classifier therefore cannot be re-run exactly against an old
scan. At the same time, Plan 058 needs better evidence for statements such as
"this looks like a shared template/component defect" without weakening the
normalizer's deliberately conservative dedupe.

### Hardening decision

Persist versioned `PageAuditProfile` evidence (role signals, template-family
fingerprint inputs, language, classifier version) so classification can be
recomputed offline.

Separate two concepts:

- **scan scheduling role** — conservative current role used to decide expensive
  measurement coverage; changes here must never reduce coverage until measured;
- **semantic/report role** — versioned, evidence-backed classification such as
  homepage, commercial/service, room/product, booking/transactional, contact,
  legal, editorial, archive/taxonomy, utility, unknown. Initially this informs
  interpretation/conditionality only; it does not authorize skipping content
  checks.

Add non-authoritative `PatternEvidence` built from the full observation ledger:
rule, page scope, stable element/component signature, class/role/ancestor
features when available, relevant computed-style signature for rules where it
is meaningful, and confidence. Pattern evidence may support a probable shared
root-cause statement; it never merges findings by itself and never changes a
scanner count.

## Pass 8 — Temporal coherence, crash/resume and concurrency

### Defects found

A 3-4 hour audit can straddle a client deployment. A successful page from hour
one and a retry from hour four may both be individually correct while describing
different site versions. Existing checkpointing protects work from process
failure but does not by itself prove temporal coherence of the final bundle.

### Hardening decision

Record per-attempt acquisition timestamps and stable structural fingerprints.
At the end of a long full audit, re-observe a deterministic anchor set
(homepage/start URL, critical seeded/transactional pages, and stable
representatives of materially different template families). Compare a bounded
`DocumentStructuralFingerprint` that ignores obvious volatile text but tracks
identity/structure/resource-version signals.

If anchors show a likely deployment during the scan:

- do not silently mix epochs;
- identify affected families/time ranges where possible;
- selectively refresh them under one new evidence epoch, or stop for operator
  review when the change cannot be bounded;
- never choose old/new observations opportunistically based on which produces a
  nicer result.

Extend checkpoint/resume to immutable attempt artifacts and snapshot
dependencies. A resumed worker reuses accepted evidence only when scope,
scanner/tool contract and source artifact hashes are compatible. A stale worker
cannot overwrite a newer accepted attempt.

## Pass 9 — Accessibility depth and claim honesty

### Defects found

The existing manual-accessibility checklist already acknowledges remaining
manual/partial areas. Plan 058 can perfect presentation, but that must not turn
an automated technical audit into an implied formal conformity audit. A generic
"automation catches 30-40%" sentence is also weaker than a versioned record of
what this exact scanner actually did.

### Hardening decision

Create a versioned `AuditCapabilityRegistry` mapping each accessibility check to
its exact capability:

- deterministic covered behavior;
- partial/heuristic behavior;
- known non-covered behavior;
- WCAG criterion/tag relation;
- required surface/state;
- scanner/check version.

Generate methodology/limitations from the registry + actual coverage ledger,
not a stale prose percentage. Re-audit current claims that a narrow heuristic
"fully resolves" a broader manual checklist item and downgrade the capability
label where appropriate.

Desktop/mobile/hydrated surfaces improve deterministic breadth, but no model is
allowed to inspect website screenshots and emit confirmed findings under this
plan. Semantic alt-text quality, visual reading order and other genuinely human
judgments remain explicit gaps or operator review signals until a separate
approved methodology exists.

## Pass 10 — Falsification, operations and Plan 058 handoff

### Defects found

A sophisticated quality gate can become too permissive **or too strict**. Only
negative fixtures would teach it to reject bad audits; it also needs known-good
controls so it does not block valid paid audits or manufacture uncertainty. The
handoff to 058 must also be one immutable contract rather than another loose set
of files.

### Hardening decision

Build a read-only evidence-quality evaluation harness with:

- synthetic known-bad fault injection;
- known-good controls;
- saved heterogeneous audit corpus;
- repeated execution to test determinism;
- explicit false-positive/false-negative review for new gates;
- no live third-party crawl without current named-site permission.

Plan 058 may start only with:

```text
ApprovedAuditEvidence {
  auditId
  evidenceSnapshotDigest
  evidenceQualityVerdict
  limitations[]
  coverageLedgerDigest
  capabilityRegistryVersion
  normalizedFindingsDigest
  signalsDigest
  scannerFingerprint
}
```

No downstream layer reconstructs quality ad hoc from optional manifest fields.

---

# Current-state facts this plan preserves

The implementation must respect these existing strengths rather than rebuild
from scratch:

- `docs/rules/normalization-rules.md` already distinguishes inventoried,
  content-checked and performance-measured populations and explicitly prohibits
  propagation of sampled Lighthouse results.
- `packages/scanner/src/check-scope-coverage.ts` has an exhaustive registry and
  explicit `checkOutcomes`; a new detector cannot silently escape a scope
  decision.
- `PageAnalysisCoverage` already records pass outcomes and failed check IDs.
- `packages/core/src/coverage-summary.ts` derives current coverage from those
  persisted outcomes rather than inferring success from `status === visited`.
- `packages/core/src/crawl-coverage-gate.ts` is a useful first safety gate, but
  its broad thresholds are not the final premium evidence verdict.
- plan 021's full-audit planner runs rendered/axe/extended checks on every
  eligible content page and selectively runs Lighthouse without propagation.
- `packages/scanner/src/scan-site.ts` has watchdogs, page-work cleanup,
  streaming page artifacts and checkpoint/resume; quality recovery should
  extend these mechanisms, not disable them.
- `packages/core/src/normalize/findings-provenance.ts` and the source-derived
  normalization fingerprint already prove normalized-finding freshness.
- the locked `Finding` contract keeps scanner evidence/source IDs, page scope,
  occurrences, bounded elements and raw evidence; Plan 059 adds evidence around
  it rather than casually widening it.
- the page-role research already documented that raw role signals are not
  persisted and fallback remains common on measured real hotel scans.
- `docs/rules/manual-accessibility-checklist.md` is the canonical starting point
  for known automation gaps.
- Plan 050's old-data policy is advisory compatibility, not automatic
  invalidation after every tool release.

---

# Target pipeline

```text
operator scope + full-audit config
              │
              ▼
  1. AuditScopeSnapshot
              │
              ▼
  2. reconciled InventoryLedger
              │
              ▼
  3. baseline scan surfaces
     desktop + mobile + bounded hydration
              │
              ▼
  4. isolated behavioral/site checks
              │
              ▼
  5. per-check attempt/coverage ledger
              │
        gaps ─┴─ clean
         │         │
         ▼         │
  6. targeted evidence recovery
         │         │
         └────┬────┘
              ▼
  7. Lighthouse measurement sets
     + environment calibration + CrUX
              │
              ▼
  8. temporal-coherence verification
              │
              ▼
  9. immutable raw evidence snapshot
              │
              ▼
 10. ObservationLedger + page/profile facts
              │
              ▼
 11. deterministic normalization
     confirmed findings + review signals
              │
              ▼
 12. EvidenceConsistencyGate
              │
              ▼
 13. EvidenceQualityAssessment
              │
       insufficient ───► needs-operator-review / failed
              │
       reportable
              ▼
 14. ApprovedAuditEvidence
              │
              ▼
        PLAN 058 starts
```

The website is crawled once per evidence epoch. Recovery reuses accepted work
and targets only missing/unstable units unless temporal coherence proves the
site changed too broadly for selective repair.

---

# Canonical data contracts

Add focused types under `packages/core/src/types/audit-evidence.ts` (or a small
folder under `types/`) rather than overloading `Finding` or `AuditManifest` with
all quality-lineage data. Store schemas mirror the runtime types where
persistence is required.

## `AuditScopeSnapshot`

Immutable at scan start unless the operator explicitly restarts/supersedes the
run:

- normalized start URL and accepted first-party host aliases;
- scan intent;
- operator seeds/exclusions and reason/source;
- booking-engine/external-flow references;
- effective max pages/depth/delay/concurrency/timeouts;
- sitemap mode;
- scope version;
- digest.

A mid-run scope edit invalidates the current evidence epoch. It never silently
changes what "full audit" meant after pages were measured.

## `InventoryLedger`

For each known candidate URL/page identity:

- canonical identity URL;
- all discovery sources (`start`, `link`, `seed`, `sitemap`, and any later
  explicit source such as hreflang if implemented);
- first discovery time/referrer;
- terminal disposition;
- redirect/final URL where relevant;
- robots/non-HTML/external/error reason;
- whether known-but-omitted by cap or continuation guard;
- evidence/attempt reference.

Non-HTML extension filtering may stay pre-fetch, but record a bounded summary by
extension/source plus representative examples so the audit trail can explain
what was intentionally not a page without bloating the page inventory.

## `ScanSurface`

A stable identifier for where evidence was observed:

- viewport profile/version;
- interaction state (`baseline`, `hydrated`, or a specific safe local state);
- context isolation group;
- readiness outcome;
- page identity;
- surface fingerprint.

The initial production surface set is bounded and versioned. Do not allow a
state explorer to grow combinatorially.

## `CheckAttempt`

Append-only:

- attempt ID/epoch;
- check ID and scope;
- page/site/performance target;
- surface ID where applicable;
- started/finished time;
- execution profile (`normal`, `isolated-retry`, `fresh-browser-retry`, etc.);
- outcome;
- `FailureClass` + bounded diagnostic code;
- source artifact digest;
- accepted/rejected/superseded disposition.

Raw stack traces stay private diagnostics rather than becoming model/report
input.

## `EvidenceCoverageLedger`

One deterministic aggregate over attempts:

- page inventory coverage;
- per-page per-check coverage;
- site-level check coverage;
- performance-selection + measurement-set coverage;
- mobile/hydration surface coverage;
- retry counts/dispositions;
- known limitations;
- unresolved gaps.

This supersedes ad-hoc downstream inference from optional fields. Existing
`PageAnalysisCoverage` remains a compatibility/view layer until all readers are
migrated.

## `PerformanceMeasurementSet`

For one measured URL/profile:

- selection reason(s);
- all Lighthouse run IDs/raw measurements;
- environment/calibration IDs;
- median and spread per metric;
- stability/confidence classification;
- accepted representative value;
- CrUX origin-level facts separately, never relabelled as page-level data.

## `ObservationRecord` / `ObservationLedger`

Derived from accepted scanner attempts, private and content-addressed. Keep
bounded public-site evidence only; never store full page HTML merely to make the
ledger "complete".

Required dimensions:

- observation ID;
- source/check/rule;
- page identity;
- surface(s);
- accepted attempt(s);
- selector/element/resource identity where applicable;
- bounded snippet/value evidence;
- native severity/measurement;
- observation timestamp;
- source artifact digest;
- deterministic occurrence identity used to dedupe the same defect seen across
  retries/viewports without double-counting.

## `AuditSignal`

A separate type for evidence that is useful but not yet a confirmed
scanner-derived defect:

- heuristic/conditional rule ID;
- evidence references;
- confidence/review status;
- affected pages;
- required confirmation action;
- never included in deterministic finding totals before confirmation.

Do not mass-migrate rules by intuition. Create an explicit disposition registry
and review each existing heuristic/conditional rule.

## `PageSemanticProfile`

Separate from the scheduling role:

- semantic role;
- confidence;
- reason/evidence IDs;
- source `PageAuditProfile` version/signals;
- classifier version.

Unknown is a valid result. A low-confidence role may shape a conditional phrase;
it must not suppress a real scanner measurement.

## `PatternEvidence`

Non-authoritative root-cause support:

- rule/category;
- observation IDs;
- affected pages;
- stable component/element signature;
- relevant style/structural features where available;
- confidence/reason;
- explicit statement that this does not merge findings or prove source-code
  ownership.

## `AuditEnvironmentFingerprint`

At minimum:

- Odysseus/scanner build fingerprint;
- Node/runtime;
- OS/kernel/runtime container image identifier where available;
- CPU/logical-core/memory class;
- Playwright/Chromium/axe/Lighthouse versions;
- browser flags;
- viewport profiles;
- locale/timezone;
- Lighthouse configuration/throttling;
- important timeout/settle settings;
- capability/check-registry version.

## `AuditEvidenceSnapshot`

Top-level content-addressed dependency graph. It points to digests for every
canonical artifact above plus normalized findings/signals. It is the only
upstream identity Plan 058 needs.

## `EvidenceQualityAssessment`

Terminal verdict:

- `reportable-complete`;
- `reportable-with-known-limitations`;
- `needs-operator-review`;
- `failed`.

Contains reason codes, mandatory disclosure objects and the evidence snapshot
digest it assessed.

---

# Reportability rules

Do not encode one universal allowed-failure percentage. Evaluate materiality and
failure type.

## Always blocking until repaired or explicitly operator-resolved

- start/homepage cannot be inventoried/rendered/content-checked;
- an operator seed cannot receive required content evidence;
- known page cap truncates otherwise in-scope eligible pages;
- unexplained sitemap/inventory gap indicates the crawler missed declared pages;
- persistent scanner/environment failure on a material page/check;
- accepted artifacts fail digest/integrity verification;
- site-level fact is used while its acquisition is failed/unknown;
- normalized findings cannot reconcile to source observations;
- temporal-coherence gate indicates mixed deployments that cannot be bounded;
- evidence snapshot dependencies are stale/incompatible;
- full-audit side-effect safety invariant is violated.

## Can become `reportable-with-known-limitations`

Only after targeted retries/verification and only with deterministic disclosure:

- robots-disallowed public pages;
- intentionally operator-excluded scope;
- known continuation-family omissions made by the documented guard;
- genuine site 404/5xx/soft-error responses (these are site observations, not
  missing scanner evidence);
- explicit third-party flow outside the first-party audit scope;
- a non-material page/check that remains unmeasurable for a site-controlled
  reason while critical scope is complete;
- legacy scan missing a new non-essential evidence dimension but still able to
  support the requested report statements.

A scanner crash/timeout is never converted into a client limitation merely
because retries were inconvenient.

---

# Recovery policy

Implement retry profiles centrally rather than ad hoc inside every check.

1. **Normal attempt** — current configured pacing/context.
2. **Isolated retry** — fresh context, same user agent/scope, affected check or
   minimal page analysis only, lower concurrency.
3. **Diagnostic retry** — fresh browser process, serialized execution, longer
   bounded settle/timeout where the failure class justifies it.
4. **Stop/escalate** — anti-bot/rate-limit, deterministic site exclusion,
   repeated contradictory evidence, or exhausted safe recovery.

All profiles continue to respect robots/crawl-delay. A rate-limit response
reduces request pressure. There is no "try harder" mode that increases
concurrency.

Retry eligibility is typed per failure class. Never retry a 404 three times
because the generic page status contains the word "failed".

---

# Browser-state and dynamic-content contract

## Baseline isolation

Collect immutable baseline DOM/a11y/head/resource evidence before any mutating
behavioral routine. Axe and baseline metadata use that state.

## Mobile surface

Add a fixed mobile viewport surface for checks whose DOM/visibility can change
responsively. Do not duplicate all expensive site-level network checks merely
because a second viewport exists.

## Hydration sweep

Use a bounded, deterministic scroll strategy to materialize ordinary lazy
content, then wait for bounded quiescence. Record:

- initial/final scroll height;
- DOM/resource growth;
- number of scroll steps;
- whether content continued expanding at the bound.

If a page behaves like infinite scroll beyond the safety bound, record a known
surface limitation; never scroll without limit.

## Safe local state exploration

Initially limited to controls that can be proven same-document and
non-destructive (for example `details`, local `aria-controls` disclosure,
non-submit toggles). No arbitrary link clicks or form submissions. Every state
is capped by a per-page exploration budget and has a stable state ID.

## Occurrence identity

The same underlying element defect observed on desktop, mobile, retry 2 and a
hydrated surface counts once unless the DOM exposes genuinely distinct defect
instances. Observation metadata records every confirming surface; occurrence
counts represent unique defect identities, not number of test executions.

---

# Performance-quality contract

- Preserve Lighthouse serialization unless measured evidence proves concurrent
  runs do not bias results.
- Record raw run values, not only scores.
- Three runs by default on homepage/start URL, transactional pages and operator
  seeds.
- Repeat another selected page when severe, threshold-near, unexpectedly
  contradictory to CrUX/site pattern, or environment calibration is unstable.
- Use a deterministic representative statistic (normally median) plus spread;
  never choose the fastest/slowest opportunistically.
- If repeated values remain highly unstable, report the instability and route
  through the quality verdict rather than presenting false precision.
- Run a local performance calibration before/after the performance window and
  record system-load signals; establish tolerances empirically in Step 25.
- CrUX is origin-level. Store/fetch/retry it separately and never imply it is a
  per-page Lighthouse measurement.

---

# Temporal-coherence contract

Every accepted page/check attempt has an observation time. Build end-of-run
anchor comparisons using structural fingerprints that deliberately avoid
obvious volatile copy while retaining:

- canonical/identity signals;
- document structural signature;
- heading/navigation structure signature;
- stable resource/version signature where available;
- template-family fingerprint.

A detected site deployment is not automatically a total rescan. Selectively
refresh the affected families/epoch when it can be bounded. If the site changed
so broadly that old/new evidence cannot be separated defensibly, stop and ask
for a fresh evidence epoch.

---

# Accessibility capability contract

The capability registry replaces broad marketing-like percentages with exact
versioned statements about this scanner.

For every automated accessibility check record:

- criterion/rule scope;
- what it actually proves;
- known false-negative boundary;
- whether it is deterministic or heuristic;
- required surface/state;
- actual coverage outcome in this audit.

Known manual gaps remain visible. Plan 059 does not authorize a vision model to
turn screenshots into confirmed WCAG findings. A later plan can add an
operator-reviewed assisted-verification lane if desired, but it must define its
own evidence and false-positive methodology first.

---

# Implementation steps

## Step 1 — Freeze evidence-quality terminology and negative/positive fixtures

Update canonical docs first:

- `docs/rules/normalization-rules.md` — evidence layers, confirmed finding vs
  review signal, new coverage terms;
- `docs/rules/manual-accessibility-checklist.md` — point to capability registry;
- `docs/decisions/trade-offs.md` — fail-closed evidence, retry and no-bypass
  rationale;
- `CLAUDE.md` — scanner/model authority and evidence snapshot handoff;
- Plan 058 — consume approved evidence snapshot, not loosely assembled inputs.

Create synthetic fixtures for all adversarial cases listed later, with known-good
controls beside each negative case.

## Step 2 — Add core evidence-quality schemas

Implement the types above with Zod/store mirrors where persistence crosses the
DB boundary. Version each contract independently. Do not widen `Finding`
casually.

## Step 3 — Build immutable `AuditScopeSnapshot`

Snapshot effective scope/config before crawl. Persist its digest in checkpoints,
manifest/evidence metadata and job state. A changed scope/config creates a new
evidence epoch rather than mutating a run already in progress.

## Step 4 — Replace coarse inventory accounting with `InventoryLedger`

Keep existing crawler behavior but record every known page candidate and
terminal disposition. Add bounded summaries for pre-fetch extension-dropped
non-HTML discoveries. Record cap/continuation omissions explicitly.

Add deterministic inventory-quality checks and critical-entry-page rules.

## Step 5 — Introduce typed check attempts and failure classification

Wrap registered checks at their existing execution boundaries. Persist
append-only attempts and the accepted-attempt pointer. Map current error paths
to typed `FailureClass`; unknown stays unknown rather than guessed.

## Step 6 — Implement targeted recovery orchestration

After primary page/site acquisition, derive only missing/unstable units and run
the recovery profiles. Do not rerun completed checks unnecessarily. Add progress
events for `evidence-repair` with repaired/remaining counts.

## Step 7 — Split baseline and mutating browser work

Refactor `runRenderedAnalysis` so baseline evidence is captured in an immutable
state. Run keyboard/form/reflow or other state-mutating checks in appropriate
fresh contexts/surfaces. Add tests proving order changes cannot change baseline
results.

## Step 8 — Add page readiness and hydration evidence

Implement bounded readiness/quiescence and scroll hydration with explicit
outcomes. A timeout produces a coverage fact, not an implicit success. Add
infinite-scroll safety bounds.

## Step 9 — Add mobile and bounded safe-state surfaces

Define the first versioned viewport/state set. Run only checks that gain real
coverage from that surface. Add occurrence-identity logic so repeated
observations do not double-count findings.

## Step 10 — Add scan side-effect guard

During scanner-initiated behavioral exploration, block/abort destructive
submissions or navigation. Assert the existing form-error check remains
synthetic/untrusted. Record attempted blocked side effects privately for
operator diagnosis.

## Step 11 — Promote site-level coverage to a first-class ledger

Represent mentions-legales, sitemap, llms.txt, security headers, cookie
consent, accessibility statement, CrUX and other site-scope checks explicitly.
`unavailable`, `not-applicable`, `failed`, and `completed` must be distinct.

## Step 12 — Implement performance measurement sets and calibration

Preserve the planner's selection reasons, then run the repeat policy. Build a
small deterministic local calibration target and capture pre/post results plus
environment load. Store median/spread/confidence, never only a single chosen
number.

## Step 13 — Persist full page-audit profiles and classifier provenance

Persist `PageAuditProfile.roleSignals`, template-family fingerprint inputs,
profile version and scheduling decision provenance. Old scans remain readable
without these fields.

## Step 14 — Add report-facing semantic page classification

Build and validate a separate deterministic semantic classifier. Initially it
may influence interpretation/conditionality only. It may **not** reduce scan
coverage until the saved-audit corpus proves that change independently.

## Step 15 — Build the private `ObservationLedger`

Derive from accepted attempt artifacts after recovery. Use bounded snippets and
hashes; no full HTML dump. Ensure it can reconstruct the page/rule/occurrence
scope behind every current `Finding` while retaining multi-surface evidence.

## Step 16 — Separate review signals from confirmed findings

Create the explicit evidence-disposition registry and `signals.json` (or
content-addressed equivalent). Migrate only reviewed heuristic/conditional
rules. Add legacy adapters for historical audits.

## Step 17 — Add `PatternEvidence`

Compute conservative component/style/structure signatures from observations.
Test false merges aggressively. Pattern evidence supports root-cause synthesis
but cannot change dedupe keys, finding totals or page scope.

## Step 18 — Add complete environment/scanner fingerprint

Extend current tool/config provenance with runtime/host/browser/check-registry
facts that materially affect measurement. Derive a source/build fingerprint so
resume/evaluation can answer exactly which scanner contract produced evidence.

## Step 19 — Add temporal-coherence anchors

Record structural fingerprints during primary scan and re-observe the bounded
anchor set after recovery/performance. Detect likely deployment drift and route
to selective refresh/new epoch/operator review.

## Step 20 — Create the content-addressed `AuditEvidenceSnapshot`

Canonicalize/hash every dependency, including accepted page artifacts and
normalization outputs. Persist file-level digests and root digest. Verify local
files before normalization and private object-store bytes after sync.

## Step 21 — Implement `EvidenceConsistencyGate`

Encode the cross-artifact invariants from Pass 6 as pure checks where possible.
Failures are blocking. The gate emits machine-readable reason codes and exact
artifact/observation targets.

## Step 22 — Implement `EvidenceQualityAssessment`

Apply materiality/reportability rules to inventory, coverage, retries,
performance confidence, temporal coherence and integrity. Produce explicit
limitations/disclosures for reportable-qualified evidence.

## Step 23 — Integrate normalization with approved evidence

Normalization reads only accepted attempts/approved observation sources.
Persist findings/signals digests into the snapshot. Add deterministic
re-normalization/idempotency tests. A normalization rerun cannot silently switch
to a rejected scan attempt.

## Step 24 — Add legacy-evidence adapter consistent with Plan 050

For stored audits predating 059, derive as much of the snapshot/coverage ledger
as their persisted artifacts support. Label unavailable dimensions. Do not force
a rescan just because the current scanner version is newer. Block only when the
requested current report cannot be supported honestly.

## Step 25 — Build the evidence-quality evaluation/fault-injection harness

Run without publication. Measure:

- quality verdict;
- retry counts/reasons;
- performance variance/calibration;
- classifier confidence;
- temporal-coherence decisions;
- consistency-gate failures;
- runtime and resource use (for operations only, not acceptance price).

Use results to set empirical tolerances such as performance-calibration drift or
geometry/stability windows. Do not invent thresholds in code before this
measurement.

## Step 26 — Add evidence quality to job phases/dashboard

Extend progress after primary scan with meaningful states such as:

```text
inventory verification
content evidence repair
performance verification
temporal coherence
normalization verification
evidence approved
```

Show counts and current stage, not raw client evidence. Conflicting regenerate,
archive or delete actions stay disabled through evidence approval and Plan 058.

## Step 27 — Make crash/resume quality-aware

Checkpoint accepted attempts, evidence epoch and dependency digests. On resume,
reuse only compatible immutable evidence. Late/stale workers cannot overwrite a
newer epoch or accepted attempt. Selective repair resumes where it stopped.

## Step 28 — Harden artifact-store persistence and cleanup

Keep page attempts/evidence private. Verify digest on sync/read-back. Define
retention for rejected diagnostic attempts and large temporary surface assets;
keep canonical accepted evidence required for future report regeneration and
re-normalization.

## Step 29 — Bind Plan 058 to `ApprovedAuditEvidence`

Change 058's dossier/input builder to accept the single approved handoff. It
must consume coverage limitations, capability registry version and evidence
snapshot digest directly. Any upstream change invalidates the report-quality
run.

## Step 30 — Promote only after corpus + real-site rehearsal

Run the complete evaluation matrix. Convert every newly discovered defect into
a fixture/invariant before rerunning. Then, with current operator permission,
perform a real paid-report-style scan on at least one named hotel and read the
resulting 059 evidence assessment plus 058 PDF end to end before production
promotion.

---

# Adversarial evidence matrix

At minimum cover these cases with known expected outcomes:

### Inventory/scope

- clean linked+sitemap site;
- sitemap orphan page;
- known cap with remaining eligible pages;
- continuation-family omission;
- robots-disallowed page;
- extension-dropped PDF/image discovery;
- internal link to external redirect;
- trailing-slash duplicate;
- duplicate/canonical-equivalent content that must **not** be over-merged;
- missing sitemap and sparse link graph;
- manual seed/exclusion;
- sitemap count smaller than crawler inventory (Point France/Haaitza-style
  shape) with every extra URL provenance explainable.

### Measurement/recovery

- axe timeout then successful isolated retry;
- browser crash then fresh-browser success;
- persistent anti-bot interstitial;
- genuine 404;
- site 500;
- partial extended pass;
- site-level dependency failure;
- corrupt/absent scan artifact;
- retry that disagrees materially with first successful attempt;
- stale worker returning after a newer epoch.

### Browser states

- responsive mobile-only navigation defect;
- lazy-loaded image/content after scroll;
- bounded infinite scroll;
- keyboard check that mutates focus/DOM;
- form-validation state mutation;
- safe local accordion/dialog state;
- control that would trigger navigation/submission and must not be explored;
- same defect observed on desktop+mobile without double counting.

### Performance

- stable three-run homepage;
- severe but stable page;
- threshold-near noisy page;
- intentionally noisy synthetic page;
- calibration degradation between pre/post fixture;
- CrUX no-data;
- CrUX fetch error;
- selected Lighthouse failure;
- sampled family member with no propagation to siblings.

### Provenance/normalization

- changed page artifact after snapshot hash;
- changed normalization fingerprint;
- observation count mismatch;
- finding page outside valid scope;
- signal leaking into confirmed count;
- duplicate page identity;
- stale legacy audit with sufficient evidence;
- legacy audit genuinely missing required current evidence;
- object-store corruption/read-back mismatch;
- normalization rerun over identical snapshot producing identical digest.

### Classification/patterns

- high-confidence transactional page;
- archive/taxonomy page;
- commercial page;
- legal page;
- genuinely unknown page;
- conflicting role signals;
- shared component defect across hundreds of pages;
- visually/syntactically similar selectors that are actually different
  components and must not be merged.

### Temporal coherence

- stable site throughout long scan;
- homepage deploy between first/last anchor;
- one isolated dynamic timestamp that must not cause false deployment alarm;
- CSS/asset version change across a template family;
- selective retry after deployment;
- broad deployment requiring new evidence epoch.

### Accessibility capability

- every capability-registry rule maps to an actual check/outcome;
- heuristic alt quality remains a signal unless explicitly confirmed;
- mobile/reflow surface coverage is disclosed;
- known manual gap appears in methodology;
- no wording implies formal conformity or complete manual WCAG coverage.

---

# Saved-audit evaluation corpus

Before production promotion:

1. use every suitable existing heterogeneous saved audit up to at least 12;
2. include Hôtel Point France as a mandatory large/high-finding case when its
   saved artifacts are available;
3. include a small clean site, large WordPress/theme-heavy site,
   performance-heavy site, archive-heavy SEO site, multilingual site,
   long-running site and one scan with prior partial/failure history;
4. build compatibility snapshots for older audits rather than silently
   excluding them from testing;
5. run known-good controls after every gate/tolerance change;
6. rerun the entire corpus clean after the final discovered defect.

No live site is scanned merely to fill a corpus slot. Use saved evidence unless
the operator explicitly authorizes a named site in that session.

---

# Verification matrix

| Area | Minimum verification |
| --- | --- |
| Scope/inventory | pure identity/disposition tests, cap/robots/continuation cases, crawl fixture e2e |
| Attempts/recovery | failure-class router tests, selective retry, no-bypass pacing/user-agent assertions |
| Browser isolation | baseline-before-mutation tests, fresh-context behavioral e2e, side-effect guard |
| Dynamic surfaces | desktop/mobile/hydration fixtures, infinite-scroll bound, cross-surface dedupe |
| Site coverage | explicit completed/failed/not-applicable/unavailable tests for site-scope checks |
| Performance | repeated-run reducer, calibration handling, CrUX no-data/error distinction |
| Profiles/patterns | persisted role signals, classifier fixtures, conservative pattern false-merge tests |
| Observations/signals | complete observation lineage, bounded snippets, legacy heuristic adapter |
| Normalization | existing normalize suite + idempotency/digest + consistency-gate invariants |
| Temporal coherence | stable/dynamic/deployment fixtures and selective refresh decisions |
| Provenance | file/root digest, mutation detection, object-store read-back verification |
| Legacy reuse | current-vs-old version advisory behavior and genuinely missing evidence block |
| Pipeline/store | evidence-approved handoff only, crash/resume epochs, stale-worker rejection |
| 058 integration | report input digest equals approved evidence digest; upstream mutation invalidates report run |
| Full repo | `pnpm run format && pnpm run check && pnpm run test` plus relevant e2e/store suites |

Live performance/evidence evaluation is a separate operator-run harness; unit/CI
tests must not crawl arbitrary third-party sites.

---

# STOP / fail-closed conditions

Do not create `ApprovedAuditEvidence` when any of these remains unresolved:

- known in-scope inventory cap or unexplained declared-page gap;
- missing homepage/start or operator-seed required evidence;
- unresolved material scanner/environment failure after safe recovery;
- anti-bot/rate-limit state requiring operator pacing/allowlisting decision;
- baseline contaminated by an invalid check order/context;
- performance evidence selected for the report but quality/stability contract
  not met;
- CrUX transport failure presented as `no public data`;
- mixed scan epochs after a detected broad deployment;
- stale/corrupt source artifact;
- observation/finding/coverage inconsistency;
- unclassified heuristic counted as confirmed deterministic finding;
- missing site-level provenance for a site-level claim;
- snapshot digest mismatch locally or after artifact sync;
- stale resume worker/epoch conflict;
- side-effect safety violation;
- evidence-quality gate returns `needs-operator-review` or `failed`.

Do not degrade to "generate the report with what we have" merely because the
scan already consumed hours.

---

# Explicitly rejected alternatives

- **Just lower the 30% crawl-failure threshold.** Materiality and failure type
  matter more than one percentage.
- **Rerun the entire website after any failed check.** Wasteful and creates more
  temporal drift; retry the smallest missing unit.
- **Retry a site that is rate-limiting by increasing concurrency or changing
  user agent.** Violates the crawler identity/politeness contract.
- **Use one browser state for every check because it is faster.** Mutating checks
  can contaminate later evidence.
- **Run Lighthouse three times on every page blindly.** Quality comes from
  uncertainty reduction, not repetition for its own sake.
- **Propagate a family representative's Lighthouse values.** A representative
  explains selection, not unmeasured sibling performance.
- **Use page-role classification to skip core content checks immediately.** The
  current measured fallback rate is too high; classification improvements must
  first prove safety.
- **Aggressively normalize selectors/components to reduce finding count.** It
  can merge genuinely distinct defects; use PatternEvidence beside conservative
  findings instead.
- **Make the bounded `Finding` document carry every observation.** It would
  bloat DB/client artifacts; keep a private observation ledger and bounded
  finding contract.
- **Count heuristic signals as findings because they are useful.** Keep them
  visible but separate until confirmed.
- **Let a vision/LLM inspect website screenshots and emit findings.** Not under
  this plan; it changes the evidence authority and needs a separate verified
  methodology.
- **Treat every scanner-version mismatch as stale evidence requiring a rescan.**
  Conflicts with Plan 050 and wastes valid multi-hour scans.
- **Ignore a possible mid-scan deployment.** Individually valid measurements can
  still form an incoherent bundle when the site changed underneath them.
- **Approve evidence before private artifact sync, then trust the upload.** The
  stored bytes are part of the provenance chain and must verify.

---

# Definition of done

Plan 059 is implemented only when all are true:

1. full audits start from an immutable, digested `AuditScopeSnapshot`;
2. every known candidate URL has a reconciled inventory disposition or bounded
   non-HTML summary;
3. known page-cap truncation cannot silently produce a normal paid full audit;
4. every registered check has append-only attempt lineage and typed failure
   classification;
5. safe targeted recovery exists and never bypasses user-agent/robots/pacing;
6. homepage/start and operator seeds have explicit required-evidence gates;
7. baseline checks are isolated from mutating behavioral checks;
8. page readiness/hydration outcomes are persisted;
9. mobile/dynamic surface coverage is versioned and cross-surface observations
   do not double-count defects;
10. scanner-initiated behavioral checks cannot perform destructive submissions
    or transactions;
11. site-level checks have first-class coverage/provenance;
12. key performance pages use repeated measurement sets and all reportable
    performance claims carry stability/confidence metadata;
13. pre/post performance calibration and environment fingerprinting are
    implemented and empirically tuned;
14. CrUX no-data and acquisition failure are distinct;
15. full page-audit role signals/profile provenance are persisted;
16. report-facing semantic roles are versioned, evidence-backed and cannot yet
    reduce scan coverage without separate measured approval;
17. private `ObservationLedger` preserves occurrence evidence beyond the
    bounded `Finding.elements` sample;
18. heuristic/conditional `AuditSignal`s are separate from confirmed finding
    totals, with legacy compatibility;
19. conservative `PatternEvidence` supports systemic synthesis without changing
    finding identity/counts;
20. long scans run temporal-coherence checks and cannot silently mix broad
    deployments;
21. `AuditEnvironmentFingerprint` and scanner/build/check-registry fingerprints
    exist;
22. the entire canonical evidence bundle has one content-addressed
    `AuditEvidenceSnapshot` root digest;
23. local/private-store artifact bytes verify against the snapshot;
24. `EvidenceConsistencyGate` proves coverage/finding/observation invariants;
25. normalization is deterministic/idempotent over an approved evidence
    snapshot;
26. `EvidenceQualityAssessment` produces only the four documented terminal
    verdicts with exact reason/disclosure objects;
27. legacy audits remain reusable when their evidence is genuinely sufficient;
28. job resume cannot reuse or overwrite stale incompatible evidence epochs;
29. dashboard progress exposes verification/repair instead of hiding it behind
    one scan state;
30. Plan 058 consumes only `ApprovedAuditEvidence` and binds its report input
    to the evidence snapshot digest;
31. adversarial negative fixtures and known-good controls are green;
32. saved-audit evaluation corpus is rerun clean after the last discovered
    defect;
33. at least one operator-authorized real full-audit rehearsal proves the 059 ->
    058 chain end to end;
34. canonical docs/trade-offs describe the shipped evidence-quality contract;
35. full repository validation is green.

The intended end state is simple: **before Odysseus spends frontier-model effort
making a report perfect, it has already proved that the dataset being explained
is the strongest, internally consistent, reproducible evidence the scanner can
safely obtain for that declared site scope.**
