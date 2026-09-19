---
name: client-report-finalizer
description: "Explicit pre-delivery finalization of an already-generated client report: inspect the exact PDF, correct safe source defects from stored evidence, regenerate without a new scan or product-LLM polish calls, and stop only after a clean full-document pass."
disable-model-invocation: true
---

# Client report finalizer

Use this skill only when the operator explicitly asks to finalize an existing
paid client report before delivery.

Its job is not to discover another hotel's defects. It takes one already-scanned
audit and one intended delivery set, makes the rendered PDF as clean as the
current evidence allows, and leaves a clear release decision.

The target state is:

> Same audit evidence, same findings, same deterministic facts, no known
> client-facing defect in the final rendered PDF.

This is production/editorial QA, not a manual accessibility-verification layer
and not an RGAA audit. It does not change the offer's automated-diagnostic
boundary.

## Invocation

Examples:

~~~text
$client-report-finalizer <audit-id>
$client-report-finalizer <artifact-dir>
$client-report-finalizer <pdf-path>
~~~

Claude Code exposes the mirrored skill as /client-report-finalizer.

An audit id or artifact directory is preferred because it lets the final pass
prove lineage. A PDF by itself is enough for visual/editorial review, but not
for READY-FOR-CLIENT until its source audit and selected analysis can be
resolved.

Default to the French report. Review English too only when the operator says it
is part of this delivery or the current product workflow explicitly marks it as
such. Do not generate English merely because historical reports were bilingual.

## What this skill is not

Do not turn this into:

- a new crawl or live-site audit;
- the recurring scan-report-audit rehearsal;
- a manual WCAG/RGAA verification pass;
- a fresh product-LLM rewrite loop;
- a redesign session;
- a way to suppress an inconvenient finding;
- a client-send or publication action.

If a visual problem requires a genuine design choice rather than an objective
production fix, route that thread to the explicit Impeccable/report-workbench
workflow. Finalization fixes defects; it does not reinterpret the design
system.

## Hard invariants

These hold for the entire run.

1. **No new acquisition.** Never crawl the site, run a browser audit, refetch
   pages, or acquire new scan evidence. Work from the stored audit and existing
   artifacts. If a correction genuinely requires a new scan, return
   BLOCKED-NEW-SCAN-REQUIRED.
2. **No product-LLM polish calls.** The host model doing this skill is the
   reviewer/editor. Do not call the product OpenAI writer, critic, repair, or
   translation path merely to improve the report. Before using any regeneration
   command or dashboard endpoint, inspect its current call graph and prove it
   is render-only for this target. When practical, render with the product API
   credential absent from the subprocess environment so an accidental provider
   call fails closed.
3. **Findings are immutable at finalization.** Never add, remove, merge,
   downgrade, strengthen, or rewrite a deterministic finding to make the
   document read better. If a finding is actually wrong, fix its deterministic
   producer and recompute only from already-stored acquisition artifacts when
   supported. Otherwise block.
4. **Deterministic facts stay deterministic.** Counts, page populations,
   severities, occurrences, performance measurements, legal facts, obligation
   status, limitations, provenance, ranking inputs, and selected structure are
   never edited as prose.
5. **No unsupported legal or commercial conclusion.** Preserve
   docs/rules/obligation-basis.md and the business-claim restrictions in the
   writing rules. Finalization may clarify wording; it may not broaden the
   claim.
6. **No hidden edits to selected analysis.** Do not hand-edit a persisted
   analysis JSON, database document, report record, or generated PDF behind the
   product's lineage model. Report-specific prose may be changed only through a
   provenance-safe finalization/override seam that the current repo explicitly
   supports and revalidates. If no such seam exists, return
   NEEDS-WORKFLOW-SUPPORT rather than creating one ad hoc inside this run.
7. **No client-specific generator hacks.** Never add a hotel name, hostname,
   audit id, literal client sentence, or one-off selector to shared report code
   to make this one PDF pass.
8. **Do not churn acceptable prose.** A sentence is not a defect merely because
   another sentence might be nicer. Change prose when it is factually wrong,
   unclear, non-native, materially repetitive, inconsistent with the report, or
   in conflict with the canonical style.
9. **The PDF is the release artifact.** Source, HTML, tests, and JSON are
   evidence; the final rendered PDF is what must be clean.
10. **Never send or publish from this skill.** READY-FOR-CLIENT means the file
    is ready for the operator's delivery action.

## Load the minimum authoritative context

Before editing, read the current host charter and
docs/agents/documentation-map.md, then load:

- docs/rules/report-writing-style.md;
- docs/rules/llm-layer-rules.md;
- docs/report/report-design-system.md;
- docs/report/report-workbench.md;
- docs/rules/obligation-basis.md when legal/identity content is present or
  questioned;
- docs/report/report-design-tokens.md only when touching report styling.

Inspect the current code around the exact generation/rendering seam before
changing it. Active plans can add acceptance criteria, but canonical docs and
shipped code define current behavior.

For a hosted-dashboard target, the secure authentication pattern in
.agents/skills/scan-report-audit/SKILL.md may be read for cookie handling only.
Do not execute that skill's hotel-pick or scan steps.

Do **not** read the historical rehearsal ledger before the first blind PDF
pass. The blind pass must see what this client sees, not hunt for yesterday's
bug list. Reconcile known defect classes after it.

## 1. Resolve and freeze the target

Resolve as much of this identity as the repo exposes:

- audit id and hostname;
- intended delivery language(s);
- selected analysis id/generation and structure lineage;
- findings provenance/digest;
- current report/template/data version;
- current PDF path or authenticated preview endpoint.

Capture the baseline PDF and its SHA-256 digest in scratch. Record pdfinfo page
count and selected-analysis/finding lineage. Keep the working ledger outside
committed source; use the gitignored session log only when the run is long
enough to need crash recovery.

If the target is a production audit, explicit invocation with that exact audit
authorizes read-only retrieval and regeneration of **derived report artifacts
for that audit only**, provided the path is proven not to rescan or call the
product LLM. It does not authorize deployment, outreach publication, sending,
unrelated database writes, or a new audit.

If the current PDF cannot be tied back to stored evidence and selected
analysis, continue with visual/editorial inspection but final status cannot be
READY-FOR-CLIENT.

## 2. First blind pass: read the exact PDF front to back

Read every physical page in order. Use the host's PDF reader and rasterized
page images when available. The repo-native exact-PDF surface for an existing
file is:

~~~bash
pnpm run report:workbench -- --pdf <path>
~~~

Do not stop at the first ten or twenty pages. The appendix and glossary are
where pagination and continuation defects commonly hide.

Review the PDF as a French SME director receiving it for the first time.

### Editorial pass

For every client-facing sentence and heading, check:

- native formal French, not translated-English structure;
- no calques or unnecessary anglicisms;
- correct vouvoiement and professional register;
- concise noun-phrase theme titles where required;
- no unexplained jargon;
- no repetitive opening/closing scaffolds that make the report feel generated;
- no awkward positional cross-references such as "ci-dessus";
- no duplicated labels or sections saying the same thing;
- no sentence that overstates what the evidence measured;
- no internal contradiction between summary, priority, methodology, legal,
  performance, appendix, glossary, and next-step copy.

Use the canonical French writing document as the standard. Do not rewrite
acceptable sentences merely to demonstrate editing.

### Visual pass

Inspect every page image for:

- clipped or overflowing text;
- missing or duplicated fragments;
- orphaned headings or headings stranded from their first item;
- table headers missing on a continuation page;
- broken cards, tables, badges, links, selectors, or page counters;
- accidental blank interior pages;
- a tiny continuation tail left alone by pagination;
- malformed spacing, wrapping, punctuation, font substitution, or glyphs;
- hierarchy or component treatment that contradicts the design system.

Do not flag intentional sparse numbered pages merely for being sparse: the
design system explicitly allows that executive-reading choice.

### Reader-trust pass

Ask whether anything visible would make a reasonable client question the care
applied to the rest of the report: wrong identity, contradictory numbers,
opaque provenance language, visibly broken pagination, implausible advice, or
copy that sounds machine-translated.

Record issues before editing.

## 3. Reconcile against deterministic evidence

After the blind pass, verify every questioned fact against the stored source
that owns it. At minimum reconcile:

- client identity and audit date;
- inventoried/content-checked/performance-measured page populations;
- finding/severity/category totals;
- priority coverage and occurrence counts;
- performance values/status and field-versus-lab qualification;
- evidence limitations;
- legal/obligation facts and evidence status;
- finding ids, affected pages, selectors, WCAG references, and appendix
  summaries where the front matter points to them.

A PDF number is not self-validating because another PDF section repeats it.
Trace it to the deterministic source.

After this evidence pass, inspect recent relevant entries in
docs/report/audit-rehearsal-notes.md and
docs/report/report-feedback-deferred-items.md for known defect classes. Use them
as a regression checklist against this exact PDF; do not mechanically reopen
old issues.

## 4. Classify every issue before fixing it

Each issue gets two labels.

### Defect class

- **truth** — deterministic fact, finding, provenance, legal fact, or
  measurement is wrong/inconsistent;
- **prose** — client wording is non-native, unclear, repetitive, unsupported,
  or internally contradictory;
- **visual** — pagination, layout, typography, rendering, or component defect;
- **workflow** — the correct change cannot be represented safely by the
  current finalization/report pipeline.

### Scope

- **systemic** — caused by shared code, a shared prompt/guard, deterministic
  copy, a layout rule, a data projection, or an input shape that another audit
  can plausibly reproduce;
- **report-specific** — the underlying system is correct and this exact valid
  combination of content needs a local editorial choice.

Ask: "Would the same input shape produce this defect for another client?" If
yes, treat it as systemic. Do not call a bug report-specific merely because
only one hotel exposed it.

## 5. Fix the smallest source of truth

### Systemic truth defect

Fix the deterministic producer/projection, add a focused regression test, and
recompute from existing stored acquisition artifacts only. Never hide the
problem in prose. If a correct recomputation requires reacquisition, block.

### Systemic prose defect

Fix the canonical writing rule, prompt/guard, deterministic copy, or sanitation
rule that owns the defect. Keep docs/rules/report-writing-style.md and runtime
prompt behavior in sync when that contract changes.

Because this skill makes zero product-LLM polish calls, a prompt-only fix does
not repair the current client's already-generated prose. If the repo has no
provenance-safe host-authored finalization override for the affected field,
record the upstream fix and return NEEDS-WORKFLOW-SUPPORT for the current report
instead of hand-editing selected analysis.

### Report-specific prose defect

Use only an existing provenance-safe finalization override seam. It must at
minimum:

- bind the override to selected analysis/findings lineage;
- restrict editing to client prose;
- preserve finding ids, ranking, and deterministic facts;
- run the normal writing guards;
- invalidate safely when lineage changes.

If the repo does not provide that contract, do not persist a manual JSON patch.
Return NEEDS-WORKFLOW-SUPPORT with the exact field/page and correction the
missing seam needs to support.

### Systemic visual defect

Fix semantic template/CSS/PDF logic, not generated workbench output. Capture
the input shape in a fixture/test without committing client data. Run the
narrow test first, then the pagination/overflow/accessibility gates appropriate
to the change.

### Report-specific visual edge case

Prefer a principled shared layout rule safe for the same shape across reports.
Never special-case the client. If no general rule is defensible and the product
has no bounded per-report layout override, classify it as workflow support
rather than overfitting shared CSS.

### Verified operator facts

Existing manual-field, grade, and report-preparation mechanisms may be used
only when they already own the fact, the correct value is supported by stored
trusted evidence or explicit operator input, and the invocation clearly
targets that audit. Never guess a SIREN, legal entity, transactional status, or
client name to make a report look plausible.

## 6. Regenerate without changing the audit

Regenerate from the same stored audit, findings provenance, selected structure,
and selected analysis plus any supported finalization overrides.

Do not blindly call regenerate-report, regenerate-writing, analyze, or another
convenience command: current orchestration may decide to refresh writing and
therefore spend product API calls. Inspect the current implementation first.

Prefer a render-only path. A correct finalization render has:

- zero new crawled pages;
- zero new findings;
- zero product-provider calls;
- unchanged deterministic fact snapshot unless the run intentionally fixed its
  deterministic producer from stored evidence;
- unchanged selected analysis unless a supported finalization layer explicitly
  sits above it.

If the hosted dashboard cannot render the corrected document without invoking
fresh writing, but local rendering from exact stored lineage can, produce the
local candidate and report the dashboard limitation. If neither can do so
safely, return NEEDS-WORKFLOW-SUPPORT.

## 7. Verify each correction round

After a correction round:

1. run focused tests for every changed source seam;
2. render the complete target document;
3. inspect every changed page and its immediate neighbors;
4. if pagination, shared styles, section order, fonts, or common components
   changed, inspect the whole PDF immediately;
5. compare pdftotext output when prose changed;
6. compare deterministic fact snapshots when data-facing source changed;
7. update the scratch issue ledger: open, fixed, intentionally unchanged, or
   blocked.

Do not keep applying speculative variants to the same symptom. If a local fix
does not remove the defect cleanly, move to the owning upstream seam or mark the
blocker.

Use the narrowest verification that proves each source change and broaden by
risk. Typical report checks include the relevant unit test, report
typecheck/lint, Paged.js invariants, PDF overflow gate, accessibility render
test, and pnpm run docs:check.

Do not commit generated PDFs, raster pages, downloaded client artifacts,
workbench output, or copied production evidence.

Commit or push source fixes only when the operator's current request includes
that action. Deployment is never implied by this skill.

## 8. Final clean pass

Any change resets the release pass.

After the last change, regenerate one final PDF and read **every page again
from page 1 to the end**. Do not satisfy the release gate by looking only at
pages that changed.

Then perform one last deterministic reconciliation of high-trust facts and a
text diff against the baseline so unintended content movement is visible.

The loop ends only when this full post-change pass finds no new client-facing
defect, or when a true blocker is recorded.

"Perfect" here means no known factual, editorial, consistency, or rendering
defect under the current evidence and design contracts. It does not mean
endless stylistic churn.

## Release gate

READY-FOR-CLIENT requires every item:

- [ ] target audit and selected-analysis lineage resolved;
- [ ] intended delivery language set resolved;
- [ ] no new crawl/acquisition performed;
- [ ] product LLM calls during finalization: 0;
- [ ] findings and priority membership preserved;
- [ ] deterministic counts, measurements, limitations, identity and legal
      facts reconcile to their owning sources;
- [ ] no unsupported business or legal claim;
- [ ] French reads as native formal B2B French;
- [ ] no material repetition, jargon, calque, awkward cross-reference, or
      internal contradiction remains;
- [ ] every physical page of the final post-change PDF was visually inspected;
- [ ] no clipping, overflow, duplicated/missing fragment, broken continuation,
      accidental blank page, or other known rendering defect remains;
- [ ] the current report design system is preserved;
- [ ] report-specific edits, if any, use an explicit provenance-safe seam;
- [ ] focused verification for source changes passes;
- [ ] no client evidence or generated PDF/workbench scratch is staged;
- [ ] one complete clean pass occurred after the final change.

If any item is false, do not print READY-FOR-CLIENT.

## Terminal statuses

Use exactly one:

- **READY-FOR-CLIENT** — release gate fully satisfied.
- **NEEDS-WORKFLOW-SUPPORT** — the report has a known fix, but the current
  product has no provenance-safe/API-free way to represent or render it.
- **BLOCKED-NEW-SCAN-REQUIRED** — truth cannot be corrected from stored
  acquisition.
- **BLOCKED-SOURCE-DECISION** — a factual/identity/legal ambiguity requires the
  operator or an authoritative source.
- **BLOCKED-RENDER** — the exact document cannot be rendered/read reliably in
  the current host.

A blocked status is not failure theater. State the smallest missing capability
or decision and preserve every safe fix already made.

## Final response

Keep the operator summary compact:

~~~text
FINALIZATION: READY-FOR-CLIENT | <blocked status>
Audit: <id / client>
Delivery: fr | en | fr+en
Baseline PDF: sha256:<...> (<N> pages)
Final PDF: sha256:<...> (<N> pages)
Resolved: <count> factual / <count> prose / <count> visual
Systemic source fixes: <paths or none>
Report-specific overrides: <paths/ids or none>
Product LLM calls: 0
New scans: 0
Final full-document pass: clean | <blocker>
Source changes: committed/pushed only if explicitly requested
~~~

List only unresolved blockers after that. Do not dump the scratch issue ledger
unless the operator asks for it.
