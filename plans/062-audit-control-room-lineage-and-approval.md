# Plan 062: Audit control room, artifact lineage and report approval

> **Executor instructions**: make the audit detail page the operator's quality control room over Plan 059 evidence and Plan 058 report production. Do not recreate those pipelines in React and do not reduce them to one “audit status”. The page must make evidence trust, preserved work, report candidate state, human approval, active client bytes, history and the next safe action understandable without exposing implementation ceremony.

## Status

- **Priority**: P1
- **Effort**: XL
- **Depends on**: Plans 058, 059, 060 and 061; implemented Plans 050, 051/054 and 057.
- **Coordinates with**: 063 for bounded data loading, 064 for interaction/accessibility, 065 for diagnostics.
- **Category**: audit detail, evidence lineage, report lifecycle, operator approval, re-audit, manual inputs.
- **Final review state**: repository-wide design review plus repeated convergence passes; the final fresh pass produced no additional substantive architectural change. Freeze speculative design and let implementation/evaluation evidence drive later amendments.

---

# 1. Purpose

An operator opening an audit must be able to answer:

```text
What site/scope is this?
Which evidence epoch is current?
Is the evidence reportable?
What limitations remain?
What work is running or preserved?
What findings matter?
Is there a report candidate?
Did automated quality approve the exact FR+EN bundle?
What changed since the prior candidate?
Does Jules need to decide anything?
Which exact bundle is active for the client?
What happens if I edit/retry/rescan/approve?
```

The page must scale from a one-page Quick Check to a Point-France-sized Full
scan without becoming a dump of findings, raw jobs and PDF buttons.

---

# 2. Current-state findings

## 2.1 Audit detail currently moves too much data

The current audit route loads and returns the full findings collection,
including occurrence/page/evidence detail, on the primary detail request.
Hundreds of findings and tens of thousands of occurrences make this an
inappropriate control-room payload.

It also resolves report PDF availability while building the detail response,
which can touch artifact storage simply to paint status.

063 replaces those with bounded summary and lazy detail endpoints.

## 2.2 The report panel is language-row centric, not bundle centric

The current report UI presents FR and EN rows and can approve a pair as a side
effect of download. Plan 058 makes the bilingual `ReportBundleCandidate` the
commercial unit and requires explicit exact-bundle approval.

This plan removes “approve and download”.

## 2.3 Failure text is too implementation-shaped

Current report failure UI can surface raw exception text. The operator needs a
recovery explanation first, with developer diagnostics available separately.

## 2.4 Identity ownership is already correctly moving to the prospect

Plan 057 and current store code make the linked prospect the owner of trading
name, legal name and SIREN. The audit view must not reintroduce independent
copies as editable truths.

## 2.5 Re-audit/history semantics now exceed a flat chronological list

Plans 051/054 and 059 require:

- explicit baseline;
- comparable/resolved/new pairing;
- `newly-observable`;
- `not-comparable`;
- coverage/scope disclosures.

The UI must represent comparison quality without implying that scanner
capability changes are client regressions.

---

# 3. Binding decisions

1. **Audit detail is one control room with progressive detail, not separate evidence/report admin pages.**
2. **Quick Check and Full scan use the same shell but different capability/readiness content.** A Quick Check clearly says it cannot produce ApprovedAuditEvidence/client reports.
3. **Evidence status comes only from Plan 059 or its explicit legacy adapter.**
4. **Report status comes only from Plan 058's quality-run/candidate/approval/active-bundle state after promotion.**
5. **The active client deliverable is one atomic bilingual bundle.**
6. **Viewing/downloading a private candidate is review activity, not approval.**
7. **Operator approval is an explicit command naming the exact current bundle through server state, while cryptographic detail stays out of the primary interaction.**
8. **A requested correction creates/supersedes a quality iteration; it never mutates approved bytes in place.**
9. **Any input change that is part of the Plan-058 input snapshot invalidates only the dependent report iteration, not the underlying approved evidence unless Plan 059 says the evidence itself changed.**
10. **Historical evidence/report candidates are immutable/read-only.**
11. **No “use old report anyway” bypass exists for a known objective quality defect.**
12. **No mandatory rescan is inferred from age/version alone.**
13. **The page never requires the operator to understand internal schema versions or raw database job types.**
14. **Identity edits happen through the prospect owner; audit-specific overrides/context remain audit-owned.**
15. **Findings summary and report synthesis are separate: a large occurrence count must not dominate the control layout.**

---

# 4. Audit control-room information architecture

Use one page with a stable summary followed by progressive sections.

## 4.1 Header / identity

Show:

- prospect/hotel display name;
- audited site/domain;
- Quick Check vs Full scan;
- scan date/time;
- current evidence/report summary;
- re-audit relationship when applicable;
- primary next safe action.

Do not show UUIDs/digests in the eyebrow/title. Technical IDs belong in details.

## 4.2 Quality summary

A compact set of independent states:

```text
Evidence       Approved / approved with limitations / building / needs attention / unavailable
Report         Active / awaiting approval / in quality review / needs attention / unavailable
Work           Running stage / waiting / retrying / none
Attention      Human decision required / none
```

Never collapse these into one success/failure badge.

## 4.3 Evidence section

For Full scans:

- scope summary;
- pages/inventory coverage with reconciled buckets;
- required surface/check coverage;
- evidence-quality verdict;
- limitations/disclosures;
- temporal-coherence state;
- performance confidence summary;
- current evidence epoch/date;
- recovery actions/capabilities.

The primary view does not enumerate every attempt. A technical/diagnostic
drawer may expose typed attempt metadata.

For legacy Full scans:

- exact facts the adapter can prove;
- `unknown-legacy` for missing evidence-quality facts;
- whether this evidence is usable for the requested report action;
- optional “newer scan capabilities available” advisory, never a fabricated failure.

For Quick Check:

- concise triage result;
- explicit “not sufficient for a client report” state;
- Full scan capability if appropriate.

## 4.4 Findings section

Initial payload shows only:

- severity/category counts;
- systemic/pattern summary where deterministically available;
- top/representative finding summaries;
- total findings/occurrences;
- filters/search controls.

Detailed findings and occurrences are paged/lazy through 063.

Third-party/frame attribution, observability limitations and sampled/non-sampled
distinctions must be visible where they affect interpretation. Do not let an
embed finding read as first-party ownership merely because the selector is long.

## 4.5 Report section

The unit is the current bilingual bundle.

Primary states:

```text
No report run
Producing
Needs attention
Quality approved — awaiting your approval
Approved / promotion in progress
Active client report
Superseded historical candidate
```

The panel contains:

- current quality-run stage;
- automated check summary;
- evidence limitations that must appear in the report;
- FR candidate review action;
- EN candidate review action;
- exact candidate generated time/iteration;
- what changed since prior candidate when one exists;
- explicit approval/correction actions;
- active bundle downloads after promotion.

## 4.6 History / lineage

One chronological, human-readable timeline that can filter by:

- scan/evidence epochs;
- evidence approval/repair;
- quality runs;
- report candidate iterations;
- operator approval/promotion;
- re-audit relationships;
- material operator input changes.

Do not show every low-level retry as a top-level history event. Attempt detail is
available beneath its owning run.

---

# 5. Evidence-readiness presentation

## 5.1 Verdicts

Map Plan-059 truth without weakening it:

```text
reportable-complete
  → “Evidence approved”

reportable-with-known-limitations
  → “Evidence approved with known limitations”

needs-operator-review
  → “Evidence needs your decision”

failed
  → “Evidence could not be approved”

legacy unknown
  → “Historical evidence — some quality checks were not recorded”
```

Use exact repository-defined terminal names when 059 implementation finalizes;
the text above expresses the product semantics.

## 5.2 Limitations

Each limitation is structured:

- short human title;
- affected scope/capability;
- effect on interpretation/report;
- whether it requires operator action;
- evidence/reason details on demand.

Do not dump raw scanner diagnostics as “limitations”.

## 5.3 Recovery

Examples:

- retry one page/check/surface/measurement;
- resolve a declared scope ambiguity;
- accept/document a known limitation where Plan 059 permits operator resolution;
- start a new evidence epoch only when temporal/scope rules require it;
- voluntary new Full scan if the operator wants fresher observation.

The UI must distinguish `retry` from `rescan`.

---

# 6. Report quality and operator approval

## 6.1 Candidate review

When Plan 058 reaches `quality-approved`:

- freeze the exact FR/EN candidate bytes;
- make the bundle available for internal operator review and for any downstream prospecting/outreach path whose contract needs a current automatically quality-approved report derivative;
- do **not** create an À traiter item solely because an unsold prospect now has a quality-approved private bundle;
- expose both PDFs for private review;
- show “Automated quality checks passed” plus any non-blocking preferences/known evidence limitations;
- show candidate iteration and generated time;
- show a concise change summary from the previous candidate.

Candidate PDF routes are authenticated, private and immutable. Opening or
downloading them for review has no state-changing side effect.

## 6.2 Explicit approval

When the operator is reviewing the paid deliverable for client delivery, the approval area says, in business language:

```text
Approve this bilingual report
You are approving the French and English files shown above.
If a correction is requested, a new report iteration will be created and this
approval will not apply to it.
```

The command uses the current capability/state token; server-side Plan 058 binds
it to the exact `qualityRunId + bundleDigest`.

The UI may show a short digest in “Technical details”, but the operator is not
asked to compare hashes manually.

## 6.3 Promotion

After approval:

```text
operator-approved
→ storage/read-back/atomic active-pointer promotion
→ active
```

If promotion fails, keep the operator approval record for the exact immutable
bundle but show the promotion failure/retry state. Never serve half a bilingual
pair.

The active downloads resolve only the atomic active bundle and never rerender.

## 6.4 Request correction

A correction request:

1. requires a current candidate reference;
2. captures a bounded human instruction/issue without changing the PDF;
3. creates or resumes the Plan-058 targeted-repair path;
4. marks the old candidate as superseded when a new immutable candidate is created;
5. makes any prior approval inapplicable to the new digest;
6. preserves prior iteration history.

If a deterministic/automated objective defect still exists, “Approve anyway”
is not offered.

## 6.5 No approve-on-download

Remove the current behavior in
`packages/interface/src/dashboard/routes/audit-reports-section.tsx` that
approves as part of a download action.

There are separate actions:

- **Review FR candidate**
- **Review EN candidate**
- **Request correction**
- **Approve bilingual report**
- **Download active FR**
- **Download active EN**

Only the last two are client-active deliverables.

---

# 7. Report-quality check summary

Do not reproduce Plan 058's entire internal DAG in the primary UI.

Group passed/current checks into operator concepts:

```text
Evidence and facts
Editorial quality
PDF rendering/layout
Visual review
FR/EN parity
Final bundle review
Storage/integrity
```

Each group exposes:

- state;
- current/last stage;
- issue count by objective vs preference where relevant;
- details link.

A failed group links to 065's typed issue/recovery detail, not a stack trace.

A known objective defect is visibly blocking even if categorized “minor”.

---

# 8. Candidate diff / “what changed”

The operator should not have to re-read two long reports blindly after every
targeted repair.

For candidate iteration N vs N-1, derive a deterministic change summary from
Plan-058 semantic patch/lineage artifacts:

- affected section(s);
- language(s);
- issue/reason that triggered repair;
- whether pagination/layout changed;
- whether facts/figures changed;
- whether the upstream evidence/input snapshot changed.

Do not generate this summary from an LLM if the quality-run lineage already
knows the patches.

If the entire input snapshot changed, say so explicitly and do not imply it was
a tiny editorial correction.

---

# 9. Prospect identity and manual input UX

## 9.1 Ownership

Linked audit identity follows Plan 057:

- trading/commercial name → prospect;
- legal name → prospect;
- SIREN → prospect.

The audit may present an edit affordance, but it calls the prospect-owned
writer and clearly labels the shared scope. It does not create a second value.

## 9.2 Provenance display

Preserve raw source provenance in storage. Present a simpler UI state:

```text
Detected
Confirmed
Manually overridden
Unknown
Needs reconfirmation
```

Do **not** infer “Confirmed” merely because a value exists.

Where the current schema cannot distinguish explicit confirmation from an
operator-authored value, add optional confirmation metadata only for fields
that genuinely need it for report/evidence decisions. Do not refactor every
prospect field into a new generic value wrapper.

A confirmation record must bind to the value (or value digest), actor and time
so a later changed value does not inherit stale confirmation.

## 9.3 Audit-owned inputs

Keep audit-specific decisions in the audit domain:

- transactional-flow override;
- grade override;
- manual evidence/context that 058/059 explicitly allow;
- operator resolution required by evidence quality.

Each input shows whether it is:

- detected;
- confirmed;
- overridden;
- unknown;
- stale relative to the current snapshot.

Changing one must name the downstream consequence before save.

---

# 10. Input change and invalidation rules

Never use “something changed” as a blanket invalidation.

| Change | Evidence consequence | Report consequence |
| --- | --- | --- |
| Prospect display/contact-only field not in report snapshot | none | none |
| Trading/legal name or SIREN included in current report input | none to measured website evidence | current report candidate becomes stale/new iteration required |
| Audit report-only context | none | dependent quality run/candidate stale |
| Evidence scope/check input | 059 decides repair vs new epoch | report waits for newly approved evidence |
| Scanner code version only | none by itself | none by itself |
| New approved evidence epoch | old evidence remains history | new report run required for that evidence |
| Operator correction request | none | targeted Plan-058 repair/new candidate |
| Active bundle already promoted, unrelated future scan starts | active bundle stays active until a replacement is separately approved/promoted | none until replacement |

---

# 11. Re-audit experience

A re-audit control block names:

- current scan date;
- baseline scan date;
- baseline selection rule/result;
- coverage comparability;
- scope expansion/contraction;
- counts for existing/new/resolved where comparable;
- `newly-observable`;
- `not-comparable`.

Never label `newly-observable` as “new defect” without the observability
qualification, and never label `not-comparable` as “resolved”.

If no valid baseline exists, say “No comparable baseline” rather than rendering
empty delta sections.

The current audit may be fully reportable even if the historical comparison is
partial.

---

# 12. Historical lineage

## 12.1 Human labels

Examples:

- “Full scan · 17 September 2026”
- “Evidence approved with 1 known limitation”
- “Report quality iteration 3”
- “Superseded after requested correction”
- “Approved by operator · exact bilingual bundle”
- “Active client report”
- “Historical scan from an older evidence system — usable for this report”
- “Rescan recommended, not required”

## 12.2 Technical details

Expandable/copyable:

- audit ID;
- evidence epoch and digest;
- quality run ID;
- candidate/bundle digest;
- active object version;
- build/tool fingerprint where relevant;
- legacy adapter/capability version.

Do not make these the main workflow.

---

# 13. Error/recovery presentation

Replace raw exception-first report cards with:

```text
Report PDF check failed
The candidate was not approved. Your scan evidence is preserved.
Odysseus will retry the affected render step / Retry available / Needs your decision.
[Retry affected step] [Technical details]
```

Technical details may include:

- typed issue code;
- run/stage/attempt;
- diagnostic ID;
- safe provider/tool metadata;
- timestamp.

Raw stack/provider payload stays in protected logs when necessary.

For a render-lint overflow, identify the affected report section/finding when
the producer knows it; do not require the operator to interpret a CSS selector
or `[object Object]` string.

---

# 14. Large-audit behavior

The summary remains bounded regardless of findings/occurrences.

Point-France acceptance case:

- header/quality summary loads without all findings;
- initial findings summary is aggregate/representative;
- findings filter/search is server-side;
- occurrence lists page;
- report appendix size does not inflate dashboard API;
- candidate PDF metadata loads without bytes;
- history pages instead of one unbounded DOM;
- returning from a finding preserves filters/page.

A small audit avoids empty expert controls and shows the same concepts more
compactly.

---

# 15. Accessibility requirements

In addition to Plan 064:

- quality states have text, not badge colour only;
- report candidate preview links name language + candidate state;
- approval confirmation gets focus, names both languages and consequences;
- state updates are announced only on meaningful transitions;
- tabs/accordions use semantic controls and preserve focus;
- long identifiers/URLs wrap without horizontal page breakage;
- findings table/detail is keyboard navigable;
- comparison labels do not depend on green/red alone;
- “Technical details” is a real disclosure/region, not hover-only content.

---

# 16. Migration

## Phase 1 — read-only quality projection

- add Plan-059 evidence summary/legacy adapter result to audit control data;
- add Plan-058 quality-run/candidate/active bundle summary;
- leave current reports available behind legacy labels until 058 promotion.

## Phase 2 — explicit candidate review

- add private candidate routes and bundle-level review UI;
- add change-summary/history;
- add explicit operator approval command.

## Phase 3 — active bundle delivery

- switch **paid client download readiness** to the Plan-058 active bundle;
- migrate outreach report readiness away from the legacy “fresh FR+EN rows exist” test to a current Plan-058 automated-quality/derived-artifact contract that does **not** require operator approval or active client promotion for every prospect;
- ensure outreach can never consume a known-defective/stale candidate, but does not create a manual paid-report approval bottleneck before first contact;
- remove approve-on-download.

## Phase 4 — retire old lifecycle inference

- remove old `scanned/analysed/rendered/approved` as the primary control
  model;
- retain a legacy history adapter where needed;
- remove raw report-production state once Plan-058 durable state owns it.

No migration auto-approves an old report pair.

---

# 17. Adversarial matrix

| Scenario | Required UI/result |
| --- | --- |
| Scan job failed but ApprovedAuditEvidence exists | Work failure visible; evidence still approved/usable. |
| Evidence approved with limitation | Limitation explicit; report can proceed only according to 059/058 rules. |
| Evidence repair running | Existing approved artifacts/history stay visible; current readiness names repair state. |
| Report FR clean, EN repairing | Bundle not approvable; FR candidate preserved. |
| PDF render succeeds but visual QA rejects | Candidate remains private/unapproved; exact reason group visible. |
| Automated quality passes on an ordinary prospecting Full scan | Private bundle is ready; no inbox noise solely for optional future client approval. |
| Paid delivery/review is opened for a quality-approved bundle | Explicit approval UI is available; candidate review/download still has no approval side effect. |
| User opens/downloads candidate | No approval mutation. |
| User approves, then requests edit | Old approval remains historical; new candidate requires new approval. |
| Promotion storage fails after approval | Exact approval preserved; active pointer unchanged; retry promotion only. |
| Previously approved bundle exists and a replacement quality run fails | Failed replacement never deletes or overwrites the prior approved bytes. Whether the prior bundle remains the current delivery or is shown only as historical follows Plan-058 dependency/current-delivery rules, never the failed replacement itself. |
| Prospect legal name changes | Evidence unchanged; report input becomes stale and new quality iteration required. |
| Scanner code updated | Historical evidence not invalidated by version alone. |
| Re-audit has expanded capability | Newly observable/not-comparable states prevent false delta claims. |
| Old scan lacks 059 data | Legacy unknown shown; action availability comes from adapter, not guess. |
| Point-France findings opened | Summary remains fast; details page/lazy-load. |

---

# 18. Verification matrix

## Domain integration

- exact ApprovedAuditEvidence digest shown/used by current report run;
- candidate bundle commits to both languages and shared input;
- operator approval fails on changed/superseded bundle;
- promotion is atomic and download resolves exact active bytes.

## UI/state

- all combinations of work/evidence/report independent axes render truthfully;
- quality-approved vs operator-approved vs active are distinct;
- no candidate-open/download side effect;
- correction invalidates only the dependent approval/candidate;
- existing active bundle survives failed replacement.

## Legacy/re-audit

- old audit with unknown coverage;
- reusable historical audit with advisory version age;
- comparable re-audit;
- newly-observable;
- not-comparable;
- no baseline.

## Scale

- Point-France fixture response/payload budget;
- thousands of occurrence rows paged;
- report history pages;
- no PDF object fetch on summary load.

## Accessibility/security

- keyboard review/approval flow;
- candidate iframe/viewer sandbox and auth;
- untrusted finding strings inert;
- long URLs/control characters do not break/spoof layout;
- FR/EN code parity.

---

# 18.1 Closure-proof contract

"Clearly separates" and "bundle-centric" must resolve to concrete server-owned
contracts. Commit:

- an `AuditControlSummarySchema` that carries independent work/evidence/
  report/attention axes and cannot collapse them into one lifecycle enum;
- an exhaustive `AuditActionRegistry` mapping every rendered action to its
  061 capability/reason code;
- a bundle-lineage fixture that contains prior active bundle, failed
  replacement, approved-but-not-promoted replacement, stale candidate and
  current candidate, with exact expected UI/action states;
- side-effect tests proving candidate open/preview/download perform zero
  approval/promotion mutations;
- a requirement-to-proof ledger mapping every binding decision to its API/UI
  seam and automated/manual proof.

No React component may become the authority that decides whether evidence is
approved, a bundle is quality-approved, or a command is safe.


# 19. Fail-closed conditions

Do not offer operator approval when:

- current bundle is not Plan-058 quality-approved;
- one language is absent/stale;
- candidate shared dependencies differ;
- evidence digest is no longer current for the run;
- an accepted objective defect is unresolved;
- bundle digest changed;
- state token is stale;
- a required artifact cannot be read/verified;
- the quality run is superseded/cancelled/failed.

Do not offer client-active download from a private candidate.

Do not offer report generation when the evidence authority cannot prove the
required input.

---

# 20. Explicitly rejected alternatives

- Separate “Evidence”, “Reports”, “Quality” top-level dashboard applications.
- One `audit.lifecycle` enum pretending to represent everything.
- Approve on download.
- Per-language operator approval for a bilingual deliverable.
- Editing generated PDF/HTML in place.
- Whole-report reroll for every correction.
- “Approve anyway” for known objective defects.
- Requiring manual digest comparison.
- Loading all findings/occurrences to display a control-room summary.
- Treating scanner age as invalidation.
- Treating an expanded scanner as proof a defect is new.
- Moving prospect-owned identity back into audits.
- Refactoring every prospect field into a generic provenance framework.

---

# 21. Definition of done

Plan 062 is implemented when:

1. audit detail clearly separates work, evidence, report and attention state;
2. Full scans consume only Plan-059 evidence truth and Quick Checks never masquerade as reportable evidence;
3. the current report area is bundle-centric and reflects Plan-058 quality state;
4. candidate review is private/read-only and has no approval side effect;
5. operator approval explicitly targets the exact current bilingual bundle;
6. active client download resolves only an atomically promoted bundle;
7. requested edits create immutable new iterations and obsolete only the relevant approval;
8. report/evidence failures explain preserved work and smallest safe recovery;
9. linked identity fields remain prospect-owned and confirmation/override semantics are explicit where needed;
10. re-audit UI preserves comparable/newly-observable/not-comparable semantics;
11. historical/legacy scans remain honestly usable where their adapter proves sufficiency;
12. Point-France-sized findings/report history do not inflate the control-room payload;
13. no raw stack trace/error string is the primary operator experience;
14. all state/action paths pass the 061 stale-state capability protocol;
15. the control-summary/action registries and lineage fixture prove every
    binding state/action combination without prose-only closure.
