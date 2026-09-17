# Plan 059: Fail-closed full-audit evidence quality

> **Executor instructions**: implement this plan as the evidence-authority contract for paid Full scans. Plan 058 can only produce a trustworthy report if the scan/evidence graph it receives is itself complete, coherent, reproducible and provenance-bound. Cost is not an optimization target. Do not skip a required measurement, weaken a retry, accept unexplained missing evidence, bypass robots/politeness, or hide uncertainty merely to save compute or runtime. Preserve already-good work: repair only missing/unstable evidence instead of restarting a multi-hour audit unless temporal coherence proves a new epoch is required.
>
> Plan 059 owns acquisition and evidence approval. It does **not** authorize an LLM to manufacture website findings. Deterministic scanners and explicitly confirmed review processes remain the finding authority. When evidence cannot be made trustworthy, stop in `needs-operator-review` or `failed`; do not hand an ambiguous dataset to Plan 058.

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH — crawl inventory, browser surfaces, check execution, retries, performance measurement, normalization, persistence, checkpoint/resume, cross-run comparison and the Plan-058 handoff all change.
- **Depends on**: delivered/implemented plans 021, 035, 050 and 051/054 semantics.
- **Coordinates with**: Plan 058; 058 cannot be production-promoted until this plan exposes `ApprovedAuditEvidence`.
- **Category**: paid full-audit evidence, scanner reliability, normalization integrity, measurement reproducibility, scan safety.
- **Final review state**: ten-pass design + final convergence reviews. The final architecture pass produced no additional substantive change; freeze speculative design and let implementation/evaluation evidence drive later amendments.

---

# 1. Binding product decisions

1. **Evidence quality is the objective; cost is not.** Optimize scan runtime/resources only after the quality contract is measured unchanged.
2. **A perfect report cannot repair uncertain evidence.** Plan 058 starts only from `ApprovedAuditEvidence`.
3. **Site state and measurement failure are different facts.** 404/5xx, robots exclusion, soft-error/interstitial, scanner timeout, browser crash, rate-limit, anti-bot response and operator exclusion never collapse into one “failed page” bucket.
4. **Retry the smallest missing unit.** Preserve successful multi-hour work; rerun only affected page/check/surface/measurement unless a new evidence epoch is required.
5. **Never overwrite attempts.** Original attempt, retries, accepted attempt/set and rejection reason remain auditable.
6. **No bypass behavior.** Quality retries keep the published crawler identity, public-network scope, robots policy and politeness budget. They may slow down/serialize/use fresh browser contexts, never masquerade as another client or increase pressure after rate limiting.
7. **No sampled-result propagation.** A Lighthouse representative measures only itself. Pattern similarity may support remediation inference, never fabricated sibling measurements.
8. **No model-created confirmed website findings.** Model/vision assistance, if ever added, produces review signals until a separately validated confirmation methodology promotes them.
9. **Known scope omissions are explicit.** Caps, depth bounds, robots, continuation guard, non-HTML, external flows, operator exclusions, cross-origin embeds and unexplained inventory gaps all have distinct provenance.
10. **Behavioral checks cannot contaminate baseline evidence.** Focus/form/viewport/disclosure/consent/state mutation runs after immutable baseline capture or in an isolated context/state.
11. **Performance claims carry confidence.** Important client-facing lab conclusions do not rest on one unexplained noisy Lighthouse run.
12. **The entire evidence graph is content-addressed.** `findings.json` alone is insufficient because reports also use coverage, good measurements, CrUX, site signals, page roles, pattern evidence and limitations.
13. **Old scans remain useful when evidence is sufficient.** Version age alone never forces rescan; missing evidence for a requested claim does.
14. **Scanning is non-destructive.** No real booking, purchase, account mutation, payment, destructive form submission or arbitrary state-changing request is performed to improve coverage.
15. **Irreducible uncertainty is surfaced.** Site-controlled limitations can be reportable with deterministic disclosure; unexplained scanner/environment uncertainty cannot silently pass.
16. **New scanner coverage is not a fake client regression.** Re-audit comparison considers coverage observability before calling something new/resolved.
17. **Evidence storage is minimized and untrusted data stays untrusted.** No raw-HTML archive by default; redact secrets/session tokens and never feed arbitrary page text to an LLM just because it was observed.
18. **All quality work shares one host-wide politeness scheduler.** Mobile surfaces, retries, hydration and diagnostics do not create hidden extra request lanes.
19. **Network targets are public-site safe.** Full-audit navigation/fetches are protected against SSRF, loopback/private/link-local/metadata targets and DNS/redirect rebinding at the network boundary, not merely by a string URL check.
20. **Long scans keep revalidating safety policy.** A permissive robots snapshot from hours ago is not a license to ignore a later stricter policy during additional recovery/surface work.

---

# 2. Operational definition of “perfect evidence”

No crawler can prove discovery of a URL the site never links/declares/exposes, and automated accessibility checks cannot prove full WCAG/RGAA conformity. Therefore Odysseus defines perfect paid-scan evidence as:

> **zero known unexplained material measurement gap inside the declared public-site scope, complete traceability for every accepted observation, explicit bounded limitations for what cannot be measured, and a deterministic provenance chain from acquisition to normalized findings.**

Before Plan 058 may consume an audit:

- declared scope is immutable/digested for the evidence epoch;
- every known inventory candidate is reconciled to one terminal disposition;
- paid full audit is not silently truncated by a page cap or depth bound;
- rendered/hydrated discovery reaches a bounded fixed point or records a blocking/explicit scope limitation;
- start/homepage and every operator seed have required evidence or audit stops;
- every planned check has explicit outcome + immutable attempt lineage;
- scanner/environment failures undergo safe targeted recovery;
- baseline observations are not contaminated by prior state mutation;
- required desktop/mobile/hydrated/consent/local-state surfaces complete or have explicit disposition;
- cross-origin embeds/iframes are represented in coverage rather than silently disappearing;
- selected Lighthouse measurements satisfy confidence policy;
- CrUX `no public data` is distinct from acquisition failure;
- accepted evidence belongs to one coherent temporal epoch;
- network/robots/politeness safety contract remained valid throughout acquisition/recovery;
- raw accepted artifacts and the **complete attempt ledger** verify against `RawEvidenceSnapshot`;
- normalization over the raw snapshot is deterministic;
- observation/finding/signal/coverage totals reconcile;
- heuristic signals cannot leak into confirmed deterministic totals;
- role/pattern inference retains source evidence/confidence;
- capability registry matches what actually ran and exposes known manual gaps;
- final `EvidenceQualityAssessment` is `reportable-complete` or `reportable-with-known-limitations`;
- final `ApprovedAuditEvidence` references exact immutable digests and any operator resolution provenance.

---

# 3. Final convergence review — issues that supersede earlier drafts

## 3.1 Raw and normalized snapshot identity was ambiguous

Earlier drafts used `AuditEvidenceSnapshot` both for an immutable pre-normalization snapshot and for a final bundle containing normalized findings. That creates circular/unclear hashing and resume semantics.

**Correction:** split the graph:

1. `RawEvidenceSnapshot` — immutable accepted acquisition artifacts **plus the complete attempt/selection ledger** before normalization;
2. deterministic normalization/observation derivation;
3. `AuditEvidenceSnapshot` — immutable normalized evidence graph referencing the raw root;
4. `EvidenceQualityAssessment` references the final evidence snapshot;
5. `ApprovedAuditEvidence` is the approval envelope consumed by Plan 058.

## 3.2 Dynamic surfaces can discover new pages after the initial frontier

A rendered page can expose links after hydration/consent/local UI state that did not exist during initial discovery. Capturing the surface but never admitting those URLs makes “full audit” coverage incomplete.

**Correction:** add a bounded discovery fixed point. Eligible same-scope URLs discovered from approved rendered/hydrated surfaces re-enter the inventory/frontier and receive required checks. Include `<link rel="alternate" hreflang>` as an explicit head-level discovery source. Iterate until no new eligible URLs or a documented safety/scope bound triggers. Do not let arbitrary state exploration create combinatorial crawling.

## 3.3 Page-count and depth bounds are the same truth problem

A known eligible URL omitted because `maxDepth` was reached is just as unscanned as one omitted because `maxPages` was reached.

**Correction:** a normal paid Full scan cannot be declared complete when known eligible pages remain solely because of implementation `maxPages` **or `maxDepth`**. The operator may deliberately define a narrower scope before scanning; that narrowed scope then becomes an explicit `AuditScopeSnapshot` limitation.

## 3.4 Iframes/embedded third-party widgets were under-specified

A hotel may embed booking/CMP/maps/widgets in frames. Cross-origin DOM can be invisible to custom checks/axe traversal depending on tool capability.

**Correction:** inventory frame/embed contexts. Same-origin frames follow the capability contract; cross-origin frames are recorded with origin, page coverage and limitation/third-party-flow status. Never claim the containing page was fully inspected when a material cross-origin interactive surface was opaque.

## 3.5 Consent overlays can hide the audited application state

Fresh contexts are good for isolation but can leave every page permanently covered by a CMP banner, while post-consent content remains untested.

**Correction:** baseline always includes the unmodified consent state. Where a non-navigation deterministic reject/dismiss action can be proven safe, create a separate `consent-dismissed/rejected` surface and audit the underlying page. Do not automatically accept marketing consent. If safe dismissal cannot be established, record a surface limitation rather than click by text guess.

## 3.6 URL syntax validation is not an SSRF boundary

Current `isHttpUrlWithoutCredentials` correctly rejects non-HTTP(S)/credential URLs but does not itself reject public-looking hosts that resolve/redirect to private/internal addresses.

**Correction:** add a scanner network-egress policy that blocks loopback, RFC1918/private, link-local, carrier-grade/NAT ranges where relevant, cloud metadata, multicast/reserved targets and unsafe IPv4/IPv6 forms; revalidate redirect targets and resolved addresses to resist DNS rebinding. Browser subresource requests are covered by the same egress deny policy. Fail closed rather than silently bypassing.

Production has a public-network policy. Localhost/private test fixtures use an explicitly test-only isolated policy that cannot be selected through production configuration.

## 3.7 Robots can change during a long audit

A four-hour run may continue recovery/mobile phases after the site updates robots policy.

**Correction:** keep a versioned `RobotsPolicySnapshot`, revalidate at safe phase boundaries/long-run intervals, and immediately honor a stricter current policy for future requests. Evidence already collected under the earlier allowed policy remains historical evidence with timestamps; do not delete it or continue forbidden requests.

## 3.8 Mobile coverage must not change crawler identity

Server-side mobile-UA behavior cannot be safely tested by impersonating Safari/Chrome if Odysseus promises a stable published crawler UA.

**Correction:** the mobile surface changes viewport/device-scale/touch/media configuration while preserving Odysseus UA/robots identity. The capability registry states this limitation explicitly.

## 3.9 “Observed once” is not always “stable fact”

Consent/A-B/personalization/service-worker/cache behavior can make repeated accepted observations disagree.

**Correction:** contradictory materially relevant attempts become `unstable-result`. Do not cherry-pick. Store the attempt set, diagnose state/cache/epoch causes, isolate fresh context, and only accept a coherent result or disclose/stop according to materiality.

## 3.10 Evidence safety needs browser sandboxing as well as target filtering

The scanner intentionally executes arbitrary public website JavaScript.

**Correction:** production quality requires hardened browser/container isolation: Chromium sandbox where supported **or an approved equivalent isolation profile where platform constraints prevent it**, least-privilege runtime, no host filesystem credentials, restricted network egress, bounded resources, and no secrets exposed to page context. Operational hardening is part of the scan-quality preflight.

## 3.11 Accessibility capability needs explicit shadow/frame semantics

“axe completed” is not proof every custom detector traversed every open shadow root/frame state.

**Correction:** capability registry records traversal semantics for DOM, open shadow roots, same-origin frames and cross-origin frames per check. Coverage language follows actual capability rather than one generic “page checked” label.

---

# 4. Target pipeline

```text
operator scope + full-audit config
        │
        ▼
1. AuditScopeSnapshot + NetworkTargetPolicy
        │
        ▼
2. robots/sitemap/setup policy snapshot
        │
        ▼
3. initial reconciled InventoryLedger/frontier
        │
        ▼
4. immutable baseline desktop acquisition
        │
        ▼
5. mobile / hydration / safe consent/local-state surfaces
        │
        ▼
6. newly discovered in-scope URLs -> frontier
        │
        └───────────────┐
                        ▼
            bounded discovery fixed point
                        │
                        ▼
7. per-check attempt + coverage ledger
        │
   gaps/unstable ─────────► targeted safe recovery
        │                         │
        └────────────┬────────────┘
                     ▼
8. Lighthouse measurement sets + calibration + CrUX
                     │
                     ▼
9. temporal-coherence + policy revalidation
                     │
                     ▼
10. RawEvidenceSnapshot
                     │
                     ▼
11. ObservationLedger / profiles / pattern evidence
                     │
                     ▼
12. deterministic normalization
    confirmed Finding[] + AuditSignal[]
                     │
                     ▼
13. AuditEvidenceSnapshot
                     │
                     ▼
14. EvidenceConsistencyGate
                     │
                     ▼
15. EvidenceQualityAssessment
    insufficient -> needs-operator-review / failed
                     │
                     ▼
16. ApprovedAuditEvidence
          ┌──────────┴──────────┐
          ▼                     ▼
    re-audit delta          PLAN 058
    comparability           report pipeline
```

The website is not globally rescanned for isolated failures. A new whole evidence epoch is required only when scope/temporal coherence makes selective repair indefensible.

---

# 5. Canonical contracts

## 5.1 `AuditScopeSnapshot`

Immutable per evidence epoch:

- normalized start URL;
- allowed first-party host aliases/scope policy;
- scan intent;
- seeds/exclusions + source/reason;
- external booking-flow references;
- effective max pages/depth/delay/concurrency/timeouts;
- sitemap mode;
- expected language/site variants if operator-supplied;
- scope version/digest.

A mid-run scope change supersedes/restarts the epoch; it never silently changes what “full audit” meant.

## 5.2 `NetworkTargetPolicy`

Code-owned network safety contract:

- permitted schemes (`http/https` only);
- credentials forbidden;
- start/redirect/resolved IP must be public-routable under production policy;
- deny loopback/private/link-local/metadata/reserved/multicast/unsafe IPv6 mapped forms;
- DNS resolution checked immediately before connection where possible and redirect targets revalidated;
- browser subresource egress uses the same private-network deny layer;
- public third-party assets may load subject to policy; scope admission remains separate;
- blocked target is recorded as network-safety disposition, never retried by changing identity;
- localhost/private fixture policy exists only in test harness configuration and cannot be enabled by production job input.

## 5.3 `RobotsPolicySnapshot`

- exact robots text/hash/retrieval time;
- matching Odysseus user-agent policy;
- crawl-delay/effective pacing;
- sitemap directives;
- version/epoch.

Revalidate at configured phase/elapsed-time boundaries. Stricter new policy applies prospectively.

## 5.4 `InventoryLedger`

Every known candidate identity records:

- normalized/canonical identity;
- all discovery sources (`start`, `link`, `rendered-link`, `hydrated-link`, `hreflang`, `seed`, `sitemap`, and approved future sources);
- discovery time/referrer/surface;
- redirect/final URL where applicable;
- terminal disposition;
- robots/non-HTML/external/error/cap/depth/guard/safety reason;
- attempt/evidence refs.

Non-HTML extension filtering may remain prefetch, but preserve bounded aggregate + representative evidence.

Inventory is monotonic inside an epoch: new candidates can be added; prior observations are not silently forgotten.

## 5.5 `ScanSurface`

Stable surface ID contains:

- page identity;
- viewport/device-scale/touch/media profile;
- **unchanged Odysseus user-agent identity**;
- interaction state (`baseline`, `hydrated`, `consent-rejected`, specific safe local state);
- storage/context isolation group;
- readiness outcome;
- surface fingerprint.

Surface set is bounded/versioned.

## 5.6 `PageReadinessRecord`

Records why extraction occurred:

- navigation milestone/status;
- DOM readiness;
- font readiness where relevant;
- bounded network quiet;
- DOM mutation quiescence;
- lazy/hydration progress;
- significant resource failures;
- timeout/unstable reason.

A page that never settles is not silently equivalent to a stable page.

## 5.7 `FrameCoverageRecord`

Per page/surface:

- frame URL/origin;
- same-origin/cross-origin;
- interactive/material heuristic;
- which checks traversed it;
- opaque limitation/third-party-flow reason;
- evidence refs.

## 5.8 `CheckAttempt`

Append-only:

```text
attemptId / evidenceEpoch
checkId / scope
target page/site/performance
surfaceId
startedAt / finishedAt
executionProfile
outcome
failureClass / diagnosticCode
sourceArtifactDigest
accepted | rejected | superseded
```

Failure classes include at least:

- site HTTP state;
- robots policy;
- network-safety block;
- soft-error/interstitial;
- not-applicable;
- operator-excluded;
- scanner timeout/tool error;
- browser/environment error;
- dependency error;
- anti-bot/rate-limit;
- unstable-result;
- unknown.

Raw stack traces remain private diagnostics.

Attempt acceptance/supersession decisions are deterministic or explicitly operator-resolved, and their ledger is immutable provenance.

## 5.9 `EvidenceCoverageLedger`

Deterministic aggregate:

- inventory reconciliation;
- page x check x surface coverage;
- site-level checks;
- frame/embed coverage;
- performance selection/measurement sets;
- hydration/consent/local-state coverage;
- retry lineage/disposition;
- known limitations;
- unresolved gaps.

Existing `PageAnalysisCoverage` stays compatibility/view-only until migration completes.

## 5.10 `PerformanceMeasurementSet`

Per URL/profile:

- selection reasons;
- all Lighthouse run IDs/raw values;
- environment/calibration refs;
- representative statistic (normally median) + spread;
- stability/confidence classification;
- accepted values;
- field data kept separately and labelled by actual CrUX granularity.

No best-run cherry picking.

## 5.11 `RawEvidenceSnapshot`

Content-addressed immutable root over **acquisition lineage before normalization**:

- scope/network/robots/inventory digests;
- **complete attempt ledger digest, including failed/rejected/superseded attempts and acceptance decisions**;
- accepted page/site/performance artifact digests;
- evidence coverage ledger;
- readiness/frame records;
- environment/tool/config fingerprint;
- temporal-coherence result.

This is the normalization input identity. Changing which attempt is accepted necessarily changes the raw snapshot digest.

## 5.12 `ObservationRecord` / `ObservationLedger`

Derived only from `RawEvidenceSnapshot` accepted attempts; private and content-addressed. Store bounded evidence, not full HTML.

Required:

- observation ID;
- check/rule;
- page identity/surface(s);
- accepted attempt refs;
- selector/element/resource identity where applicable;
- bounded redacted snippet/value;
- native severity/measurement;
- observation time;
- source artifact digest;
- deterministic occurrence identity so retries/viewports do not double-count the same underlying defect.

## 5.13 `AuditSignal`

Separate non-confirmed evidence:

- heuristic/conditional rule ID;
- evidence refs;
- confidence/review status;
- affected pages;
- required confirmation action;
- never included in confirmed deterministic finding totals unless an explicit verified promotion path says so.

## 5.14 `PageSemanticProfile`

Report-facing interpretation aid, separate from scheduling role:

- semantic role;
- confidence;
- reason/evidence IDs;
- source `PageAuditProfile` signals/version;
- classifier version.

Unknown is valid. Low-confidence role cannot suppress scanning.

## 5.15 `PatternEvidence`

Non-authoritative root-cause support:

- rule/category;
- observation IDs;
- affected pages;
- stable component/ancestry/style/structural signature where safely available;
- confidence/reason;
- explicit “does not merge findings / does not prove source-code ownership”.

## 5.16 `AccessibilityCapabilityRegistry`

Versioned per check:

- criterion/rule scope;
- deterministic vs heuristic;
- what it proves;
- known false-negative boundary;
- DOM/open-shadow/same-origin-frame/cross-origin-frame traversal semantics;
- required surface/state;
- actual per-audit coverage outcome;
- manual gaps.

Replace broad marketing percentages with exact capabilities.

## 5.17 `AuditEnvironmentFingerprint`

At minimum:

- Odysseus/scanner build/source fingerprint;
- Node/runtime/container profile;
- OS/kernel profile;
- CPU/logical-core/memory class;
- Playwright/Chromium/axe/Lighthouse versions;
- browser flags/sandbox/isolation profile;
- viewport/device-scale/media profiles;
- locale/Accept-Language/timezone;
- configured network/egress profile ID;
- Lighthouse throttling/config;
- timeout/settle settings;
- capability/check-registry versions.

Use stable profile IDs instead of secret infrastructure identifiers.

## 5.18 `EvidenceCoverageSignature`

Cross-run observability contract:

- scope/inventory signature;
- check/rule versions;
- enabled surfaces/states/frame capability;
- capability-registry version;
- normalization contract;
- semantic-classifier version only where it changes conditional eligibility;
- digest.

Not a finding ID. `dedupeKey` remains finding identity; coverage signature decides whether presence/absence is comparable across runs.

## 5.19 `AuditEvidenceSnapshot`

Final normalized content-addressed graph referencing:

- `RawEvidenceSnapshot` digest;
- ObservationLedger digest;
- confirmed normalized findings digest;
- signals digest;
- PageSemanticProfile/PatternEvidence digests;
- capability registry/version;
- `EvidenceCoverageSignature`.

No quality verdict inside this root, avoiding circular hashing.

## 5.20 `EvidenceQualityAssessment`

References `AuditEvidenceSnapshot` and yields:

- `reportable-complete`;
- `reportable-with-known-limitations`;
- `needs-operator-review`;
- `failed`.

Includes closed reason codes, mandatory disclosure objects and any operator-resolution requirement.

## 5.21 `ApprovedAuditEvidence`

Small immutable approval envelope consumed by Plan 058:

```text
auditId
evidenceEpoch
rawEvidenceSnapshotDigest
auditEvidenceSnapshotDigest
evidenceQualityAssessmentDigest
verdict
limitations[]
evidenceCoverageSignature
capabilityRegistryVersion
approvalMode: system | operator
operatorDecisionId? / operatorDecisionDigest?
approvedAt / approvedBySystemVersion
```

No loose raw file can substitute for this handoff.

---

# 6. Scope/inventory fixed-point contract

## Initial discovery

Use current start/seed/link/sitemap logic with conservative identity normalization and continuation guard. Add deterministic `hreflang` discovery from document head where present and in scope.

## Rendered discovery

The initial crawl already reads rendered anchors after navigation. Plan 059 extends provenance so discovery source is explicit and lets **new links discovered only after bounded hydration/approved local states** enter inventory.

## Fixed-point rule

After each acquisition wave:

1. collect newly observed eligible first-party candidate URLs from approved discovery surfaces;
2. apply scope, URL identity, robots, network safety, exclusions and continuation bounds;
3. enqueue candidates not yet terminally reconciled;
4. scan admitted pages;
5. repeat until no new eligible candidate exists.

Stop/qualify when:

- explicit operator scope excludes it;
- continuation guard intentionally bounds an infinite/repetitive family;
- robots/network safety forbids it;
- a known page or depth bound would omit an otherwise eligible page — **blocking for ordinary paid Full scan unless operator explicitly narrowed scope**;
- state exploration budget prevents unbounded discovery; disclose the bounded state limitation.

Never claim unknowable global completeness; claim all **known in-scope inventory** reconciled.

---

# 7. Network/browser safety contract

## SSRF/egress

Enforce at scanner infrastructure/network request boundary, not only route validation.

- validate start/seed/redirect targets;
- deny private/internal/reserved/metadata address space for public hotel audits;
- re-resolve/revalidate against DNS rebinding;
- cover Chromium subresources and scanner-side fetches;
- reject credentials/non-http(s);
- record blocks without retry-by-identity-change;
- production jobs cannot select the test-only private/localhost fixture profile.

## Browser isolation

Production scan worker:

- Chromium sandbox where supported, otherwise an explicitly approved equivalent container isolation profile;
- least-privilege user/container;
- no cloud/DB/source-control credentials visible to page environment;
- restricted filesystem mounts;
- bounded CPU/memory/process lifetime;
- controlled public-network egress;
- page-origin code cannot access local artifact paths.

Security preflight failure blocks scan start.

---

# 8. Robots/politeness contract

- one shared host scheduler governs crawler, rendered surfaces, retries and diagnostics;
- effective delay is never reduced below config/robots floor;
- rate-limit/anti-bot reduces pressure or stops; never increases concurrency;
- robots policy is revalidated at long-run/phase boundaries under a bounded policy;
- stricter new rules apply to future requests immediately;
- never change UA to bypass policy;
- historical already-collected evidence retains its original policy timestamp.

---

# 9. Browser-state and dynamic-content contract

## Baseline first

Capture immutable baseline DOM/a11y/head/resource evidence before any mutating check.

## Storage isolation

Fresh context/storage profile per page/surface unless a check explicitly requires bounded same-page continuity. Consent/localStorage from page A must not personalize page B.

## Mobile surface

Stable viewport/device-scale/touch/media profile **without changing Odysseus crawler UA**. Record limitation for UA-negotiated mobile variants.

## Hydration sweep

Bounded deterministic scroll strategy records:

- start/end scroll height;
- DOM/resource growth;
- steps;
- quiescence;
- continued expansion at bound.

Infinite content beyond bound becomes explicit surface limitation.

## Consent state

- baseline captures banner/overlay as delivered;
- optional separate rejected/dismissed state only when safe deterministic local button semantics are established;
- never guess based on visible text alone;
- never auto-accept marketing consent merely for coverage;
- state transition recorded and isolated.

## Safe local state exploration

Initially limited to provably same-document/non-destructive controls (`details`, local `aria-controls`, non-submit disclosure/toggle patterns and explicitly tested CMP dismissal). Bounded per-page budget. No arbitrary link clicking/form submission.

## Side-effect guard

Abort scanner-initiated destructive/non-idempotent navigation/submission. Existing synthetic form validation remains synthetic.

## Occurrence identity

Same underlying defect seen on desktop/mobile/retry/hydration counts once unless evidence proves distinct defect instances. Surfaces become confirming dimensions, not occurrence multipliers.

---

# 10. Failure taxonomy and recovery

Central profiles:

1. **normal** — configured acquisition;
2. **isolated retry** — same target/check, fresh context, lower concurrency;
3. **diagnostic retry** — fresh browser process, serialized, longer bounded settle/timeout where failure class justifies it;
4. **stop/escalate** — rate-limit/anti-bot, robots/network safety, repeated contradiction, exhausted safe recovery.

Never retry a 404 simply because a generic status says “failed”.

When two otherwise successful attempts materially disagree:

- do not choose the convenient one;
- classify `unstable-result`;
- investigate state/cache/epoch/context;
- accept a coherent set or stop/disclose according to materiality.

---

# 11. Site-level coverage contract

First-class coverage for:

- mentions légales/identity extraction;
- sitemap;
- llms.txt;
- security headers;
- cookie consent;
- accessibility statement;
- CrUX acquisition;
- other site-scope checks.

Outcomes distinguish `completed`, `failed`, `not-applicable`, `unavailable`, `blocked-policy` and other closed statuses. A site-level claim may not appear in Plan 058 without site-level provenance.

---

# 12. Performance-quality contract

- preserve Lighthouse serialization unless measured evidence proves concurrency unbiased;
- homepage/start, transactional pages and operator seeds: three isolated runs by default;
- other selected pages: primary run + repeat when severe, threshold-near, environment-unstable or unexpectedly contradictory;
- store all raw values;
- representative statistic normally median + spread/confidence;
- never choose best/fastest opportunistically;
- pre/post controlled local calibration detects gross host drift; set tolerances empirically from evaluation corpus;
- store host-load/environment fingerprints;
- CrUX transport/provider failure is retried and distinct from `no public data`;
- field data stays labelled by actual granularity; Lighthouse lab values are never called CrUX or field data.

---

# 13. Temporal-coherence contract

Every accepted attempt has observation time. Use stable structural anchor comparisons that avoid volatile copy while retaining useful signals:

- page identity/canonical;
- heading/navigation structure;
- template/component signature;
- stable resource/version fingerprint where safe.

If a deployment is detected:

- selectively refresh affected family/epoch if cleanly bounded;
- otherwise start a new evidence epoch / operator review;
- never mix old/new evidence when site versions cannot be separated.

A/B/personalized materially contradictory variants are `unstable-result`, not cherry-pick candidates.

---

# 14. Normalization/observation integrity

`Finding` remains the bounded confirmed-remediation contract. Plan 059 adds evidence around it rather than turning it into a giant raw-observation document.

`EvidenceConsistencyGate` verifies at minimum:

- every finding page belongs to reconciled relevant inventory;
- occurrences/page scopes reconcile with source observations;
- accepted attempts agree with coverage outcome and attempt-selection ledger;
- completed performance rows have required raw measurements;
- not-planned Lighthouse pages were actually unselected;
- page identity uniqueness;
- site claims have site-level provenance;
- category/severity/WCAG totals recompute exactly;
- signals/heuristics do not leak into confirmed totals;
- translation clustering retains source observations;
- same raw snapshot re-normalizes deterministically to same digest;
- rejected/superseded attempts cannot silently become normalization inputs.

Failure is blocking.

---

# 15. Reportability rules

Do not encode one universal “allowed failure percentage”. Materiality and failure type govern.

## Always blocking until repaired/resolved

- start/homepage cannot be safely inventoried/rendered/content-checked;
- operator seed lacks required evidence;
- known page/depth bound truncates otherwise eligible in-scope pages;
- unexplained declared/inventory gap indicates crawler miss;
- material scanner/environment failure persists after safe recovery;
- network/robots/politeness safety invariant violated;
- material cross-origin/embed state is silently unrepresented;
- baseline contaminated by invalid check ordering/state;
- accepted artifacts fail hash/integrity;
- site-level claim has failed/unknown provenance;
- findings cannot reconcile to observations;
- temporal coherence indicates mixed unbounded deployments;
- snapshot dependency stale/corrupt;
- destructive side-effect guard violated.

## May become `reportable-with-known-limitations`

After retries/verification and deterministic disclosure:

- robots-disallowed public pages;
- explicit operator scope exclusion;
- documented continuation-family bound;
- genuine site 404/5xx/soft-error response;
- explicit third-party/cross-origin flow outside first-party inspectable scope;
- bounded infinite-scroll/state limitation;
- non-material site-controlled unmeasurable surface while critical scope is complete;
- legacy scan missing a new non-essential dimension but still able to support the requested claims.

A scanner crash/timeout never becomes a client limitation merely because retrying is inconvenient.

---

# 16. Reuse and re-audit truth

## Reusable scans

Reuse based on actual evidence capability, not scanner version alone.

- old scan supports requested historical/current claim -> reusable;
- missing non-essential new dimension with honest disclosure -> reusable-qualified;
- requested claim requires evidence never captured -> rescan that claim/scope;
- legacy adapter never fabricates attempt/coverage details from absence; ambiguous historical status is `unknown-legacy`.

## Re-audit delta

Before `new/resolved/persistent` interpretation, compare relevant `EvidenceCoverageSignature` slices.

- comparable present before/after -> existing Plan-051/054 semantics;
- current finding from previously unavailable surface/check -> `newly-observable`;
- baseline finding whose check/surface is no longer comparable -> `not-comparable`, not resolved;
- scope/inventory expansion/contraction disclosed alongside rescoped finding pairing;
- `dedupeKey` remains identity; coverage signature only decides observability.

A current audit can be perfectly reportable even when comparison to an old baseline is partly non-comparable.

---

# 17. Implementation sequence

No partial state should masquerade as the new quality contract. Keep production behavior behind feature flags until the relevant promotion gates are complete.

## Phase A — terminology, safety and fixtures

1. Update canonical docs for evidence layers, scan safety, capability registry, cross-run observability and Plan-058 handoff.
2. Build positive/negative fixtures before code.
3. Implement `AuditScopeSnapshot`.
4. Implement `NetworkTargetPolicy` + DNS/redirect/subresource private-network protection and tests.
5. Implement `RobotsPolicySnapshot` + phase revalidation/shared scheduler.
6. Add browser/container safety preflight.

## Phase B — inventory/surfaces/attempts

7. Build full `InventoryLedger` with link/rendered/hydrated/hreflang/sitemap provenance and page/depth-bound dispositions.
8. Persist full page audit profiles/signals + scheduling provenance.
9. Add baseline desktop + readiness records.
10. Add mobile surface preserving crawler UA.
11. Add bounded hydration + hydrated-link discovery.
12. Add frame/embed coverage records.
13. Add safe consent/local-state surfaces + side-effect guard.
14. Implement bounded discovery fixed point.
15. Add append-only `CheckAttempt`, acceptance ledger and failure taxonomy.
16. Implement shared targeted recovery profiles.
17. Promote site-level check coverage to first-class ledger.

## Phase C — performance/epoch integrity

18. Implement Lighthouse measurement sets/repeat policy.
19. Implement calibration + CrUX no-data/error distinction.
20. Add environment fingerprint.
21. Add temporal-coherence anchors and epoch handling.
22. Make checkpoint/resume epoch/attempt/policy aware; reject stale workers.

## Phase D — evidence graph/normalization

23. Create content-addressed `RawEvidenceSnapshot` including full attempt-selection lineage.
24. Build private redacted `ObservationLedger`.
25. Separate `AuditSignal` from confirmed findings through explicit disposition registry.
26. Add report-facing `PageSemanticProfile`.
27. Add conservative `PatternEvidence`.
28. Create/ship `AccessibilityCapabilityRegistry` including shadow/frame semantics.
29. Normalize only from accepted raw snapshot evidence.
30. Create final `AuditEvidenceSnapshot`.
31. Implement `EvidenceConsistencyGate`.
32. Implement `EvidenceQualityAssessment`.
33. Emit `ApprovedAuditEvidence` with system/operator approval provenance where applicable.

## Phase E — legacy/delta/report integration

34. Implement legacy evidence adapter consistent with Plan 050, using `unknown-legacy` rather than guessed completeness.
35. Add `EvidenceCoverageSignature` and coverage-aware Plan-051/054 delta semantics.
36. Bind Plan 058 input to `ApprovedAuditEvidence` only.
37. Add evidence-quality phases/progress/conflict guards to dashboard.
38. Harden artifact-store digest/read-back/retention/redaction.

## Phase F — evaluation/promotion

39. Build evidence-quality fault-injection/evaluation harness.
40. Run saved heterogeneous corpus, including Point France when available.
41. Establish empirical performance/readiness/temporal tolerances from corpus, not guessed constants.
42. Convert every discovered defect into fixture/invariant and rerun after last fix.
43. With current operator permission, run at least one real named-hotel end-to-end 059 -> 058 rehearsal before promotion.
44. Promote only when Definition of Done is fully satisfied.

---

# 18. Adversarial evidence matrix

## Scope/inventory

- clean linked+sitemap site;
- sitemap orphan;
- page cap with eligible remainder;
- depth bound with known eligible remainder;
- continuation-family bound;
- robots-disallowed page;
- rendered/hydrated-only link;
- hreflang-only language page;
- safe local-state-only link;
- link discovered after consent dismissal;
- same-origin iframe route;
- material cross-origin booking iframe;
- extension-dropped PDF/image;
- external redirect;
- trailing-slash/canonical duplicates that should merge;
- similar pages that must not over-merge;
- sparse graph/no sitemap;
- manual seed/exclusion;
- sitemap smaller than actual crawler inventory with explainable provenance.

## Network/security

- localhost/127.0.0.1;
- RFC1918 private IPv4;
- IPv6 loopback/link-local/unique-local;
- encoded/mapped IP forms;
- cloud metadata target;
- public URL redirecting private;
- DNS rebinding simulation;
- page subresource targeting private address;
- malformed/credential/non-http URL;
- browser sandbox/equivalent isolation preflight failure;
- production job cannot select test-only network policy.

## Measurement/recovery

- axe timeout then isolated success;
- browser crash then fresh-browser success;
- persistent anti-bot/rate-limit;
- genuine 404/500;
- partial extended pass;
- site-level dependency failure;
- corrupt artifact;
- first/retry material disagreement -> unstable;
- attempt acceptance change modifies raw snapshot digest;
- stale worker after new epoch;
- robots policy becomes stricter mid-run.

## Browser states

- mobile-only DOM defect;
- UA-negotiated mobile page (record limitation; do not impersonate UA);
- lazy content/link after scroll;
- bounded infinite scroll;
- focus-mutating keyboard check;
- form-validation mutation;
- deterministic accordion/dialog state;
- unsafe navigation/submission control blocked;
- consent banner baseline + safe reject/dismiss surface;
- unsafe/ambiguous CMP interaction not guessed;
- same defect desktop/mobile not double-counted;
- fresh storage prevents page-to-page personalization bleed;
- open-shadow-root capability case;
- same-origin/cross-origin frame capability cases.

## Performance

- stable three-run homepage;
- severe stable page;
- threshold-near noisy page;
- synthetic unstable page;
- degraded pre/post calibration;
- CrUX no data;
- CrUX provider error;
- selected Lighthouse failure;
- sampled family member with no propagation.

## Provenance/privacy/normalization

- source artifact mutation after raw snapshot;
- attempt ledger mutation after raw snapshot;
- normalization fingerprint change;
- observation/finding mismatch;
- finding page outside valid scope;
- signal leaking into confirmed total;
- duplicate page identity;
- legacy sufficient scan;
- legacy missing required evidence;
- legacy ambiguous outcome -> unknown-legacy, not invented completed;
- object-store corruption/read-back mismatch;
- deterministic renormalization;
- secret/session query parameter redaction;
- untrusted snippet not automatically sent to LLM.

## Classification/pattern

- transactional/archive/commercial/legal/unknown/conflicting roles;
- shared component defect across hundreds of pages;
- similar selectors from different components not merged;
- pattern inference does not alter finding totals/dedupe.

## Temporal coherence

- stable long scan;
- homepage/template deploy mid-run;
- volatile timestamp ignored;
- CSS/resource family change;
- selective refresh after deploy;
- broad deploy -> new epoch;
- A/B contradiction -> unstable, not cherry-picked.

## Cross-run/re-audit

- persistent comparable;
- truly fixed comparable;
- truly new comparable;
- mobile-only finding vs pre-059 baseline -> newly observable;
- removed/non-run check -> not comparable;
- expanded inventory rescopes finding without fake regression;
- newer scanner version but compatible old evidence -> reusable;
- old evidence unable to support new claim -> insufficient for that claim only.

---

# 19. Evaluation policy

Before production promotion:

- use every suitable heterogeneous saved audit up to at least 12 initially;
- Point France mandatory when saved artifacts available;
- include clean/small, large/theme-heavy, performance-heavy, archive-heavy SEO, multilingual, long-running and prior-partial/failure audits;
- build legacy snapshots rather than excluding older audits;
- run known-good controls after every gate/tolerance change;
- exercise old/new coverage delta comparability;
- fuzz inventory/failure/state transitions where practical;
- never scan a live third-party site merely to fill a corpus slot;
- after the **last** defect discovered, rerun the full applicable corpus clean.

---

# 20. Dashboard/progress contract

Expose meaningful stages:

```text
scope/network safety
inventory discovery
content acquisition
surface discovery
inventory reconciliation
content evidence repair
performance verification
temporal coherence
raw evidence snapshot
normalization verification
evidence approved
```

Show counts/stage only, not raw sensitive evidence. Conflicting report/regenerate/archive/delete actions stay guarded through evidence approval and Plan 058 ownership.

---

# 21. Fail-closed conditions

Do not create `ApprovedAuditEvidence` while any remains:

- unsafe/private network target or unresolved DNS/redirect safety ambiguity;
- browser isolation preflight failure;
- known in-scope page/depth bound truncation;
- unexplained declared/inventory gap;
- dynamic discovery has not reached its bounded fixed point/disposition;
- missing required homepage/seed evidence;
- unresolved material scanner/environment failure;
- rate-limit/anti-bot requires operator pacing/allowlisting decision;
- robots/politeness contract violated or stale permissive policy used after stricter refresh;
- baseline contaminated by mutating state;
- material frame/embed coverage silently unknown;
- selected performance evidence fails stability/confidence policy;
- CrUX failure represented as no-data;
- mixed unbounded temporal epochs;
- corrupt/stale raw artifact or attempt ledger;
- observation/finding/coverage inconsistency;
- unclassified heuristic counted as confirmed;
- missing site-level provenance;
- raw/final snapshot digest mismatch;
- stale worker/epoch conflict;
- destructive side-effect violation;
- quality assessment is `needs-operator-review` or `failed`.

Do not degrade to “generate the report with what we have” because the scan already consumed hours.

---

# 22. Explicitly rejected alternatives

- Just lower the old crawl-failure percentage.
- Restart the whole site after one failed check.
- Retry rate limiting with higher concurrency/another UA.
- Use one mutable browser state for all checks.
- Change UA to impersonate mobile browsers.
- Treat `maxDepth` omissions as harmless merely because the crawler recorded the configured value.
- Run Lighthouse three times everywhere without an uncertainty reason.
- Propagate sampled performance values to siblings.
- Let page-role classification reduce core scan coverage before proven safe.
- Aggressively normalize selectors to make finding counts smaller.
- Make `Finding` hold every raw observation.
- Count heuristics as confirmed findings for convenience.
- Let a vision model emit confirmed website findings under this plan.
- Treat every scanner-version mismatch as stale evidence.
- Call all current-only findings “new” after scanner breadth expands.
- Ignore mid-scan deployment/robots change.
- Store full HTML/cookies/session-bearing URLs for provenance.
- Validate only URL syntax and assume public-network safety.
- Click ambiguous consent/booking/form controls to improve coverage.
- Approve evidence before artifact-store read-back/hash.
- Hash only accepted attempts while leaving retry-selection lineage mutable.

---

# 23. Definition of done

Plan 059 is implemented only when all are true:

1. full audits start from immutable digested `AuditScopeSnapshot`;
2. public-site `NetworkTargetPolicy` blocks SSRF/private/metadata/rebinding across scanner and browser requests;
3. production cannot enable the test-only private/localhost network profile;
4. browser/container isolation preflight is enforced with sandbox or approved equivalent isolation;
5. versioned robots policy and shared host scheduler cover all quality requests/retries;
6. long scans revalidate robots safely and honor stricter current policy prospectively;
7. every known candidate URL has reconciled inventory disposition or bounded non-HTML summary;
8. known page **or depth** truncation cannot produce a normal paid full audit;
9. rendered/hydrated/hreflang approved sources can contribute discovery and inventory reaches a bounded fixed point;
10. every registered check has append-only attempts + typed failure class + immutable acceptance/supersession lineage;
11. safe targeted recovery exists and never bypasses identity/robots/pacing/network policy;
12. homepage/start and operator seeds have explicit required-evidence gates;
13. baseline evidence is isolated from mutating checks;
14. fresh storage/context isolation prevents cross-page state bleed;
15. readiness/hydration outcomes persist;
16. mobile surface preserves crawler UA and records UA-negotiated limitation;
17. safe consent/local-state exploration is bounded/non-destructive and ambiguous controls are not guessed;
18. frames/embeds have explicit coverage records, including cross-origin limitations;
19. open-shadow/frame traversal semantics exist in capability registry;
20. cross-surface/retry observations do not double-count defects;
21. performance measurement sets store raw runs + representative/spread/confidence;
22. critical performance pages use repeat policy and calibration tolerances are empirically established;
23. CrUX no-data/error/granularity are truthful;
24. full page-audit role signals/scheduling provenance persist;
25. temporal coherence prevents mixed-deployment bundles;
26. `RawEvidenceSnapshot` immutably identifies accepted acquisition artifacts **and the complete attempt-selection ledger**;
27. changing attempt acceptance necessarily changes raw snapshot digest;
28. private `ObservationLedger` preserves bounded/redacted occurrence lineage;
29. `AuditSignal` is separate from confirmed findings;
30. conservative PatternEvidence supports but never changes finding identity;
31. final `AuditEvidenceSnapshot` references raw root + deterministic normalized artifacts without circular hashing;
32. `EvidenceConsistencyGate` enforces cross-artifact invariants;
33. `EvidenceQualityAssessment` produces closed verdict/reasons/disclosures;
34. `ApprovedAuditEvidence` carries system/operator approval provenance and is the sole scan handoff accepted by Plan 058;
35. entire evidence graph is content-addressed and private-store read-back verified;
36. legacy adapter preserves Plan-050 reuse without fabricating missing historical facts;
37. `EvidenceCoverageSignature` makes Plan-051/054 deltas observability-aware while preserving `dedupeKey` identity;
38. scanner improvements cannot masquerade as client regressions/resolutions;
39. evidence storage redacts secrets/session material and does not default to raw HTML;
40. crash/resume is attempt/epoch/digest aware and stale workers cannot overwrite accepted evidence;
41. dashboard exposes real evidence-quality stages and conflict guards;
42. adversarial scope/network/recovery/state/performance/provenance/temporal/delta matrix is green;
43. saved heterogeneous corpus reruns clean after the final discovered defect;
44. at least one currently authorized named-hotel 059 -> 058 rehearsal succeeds before production promotion;
45. canonical docs/deployment policy describe the shipped evidence contract;
46. full repository + relevant e2e/store/browser/toolchain validation is green.

## Freeze criterion

The final architecture review was run specifically against scope completeness, measurement contamination, network/robots safety, dynamic discovery, temporal coherence, provenance, normalization, reuse/delta truth and the Plan-058 handoff. After the corrections above, it produced **no further substantive architectural change**. Freeze Plan 059 here. Later amendments should be triggered by implementation evidence, corpus failures, new scanner capabilities or a real audit defect.

The upstream invariant is:

> **Plan 058 receives one immutable `ApprovedAuditEvidence` object whose declared scope, public-network safety, inventory, measurement coverage, retries, temporal epoch, performance confidence, observations, normalized findings, limitations and provenance have all been reconciled and content-addressed — with no unexplained material gap silently hidden.**
