---
name: client-report-finalizer
description: "Explicit pre-delivery finalization of an already-generated client report: fetch the exact hosted render inputs, fix every client-facing defect (shared code, deterministic facts, report-specific prose through a bound override file), render the corrected PDF locally without a new scan, read it front to back until clean, then upload the finalized PDF to the dashboard."
disable-model-invocation: true
---

# Client report finalizer

Use this skill only when the operator explicitly asks to finalize an existing
paid client report before delivery.

It takes one already-scanned audit and one intended delivery set and **delivers
the corrected PDF itself**. It is not a bug-hunting pass that hands defects back
to the operator. It does not stop at "fixed in source, pending deploy", and it
does not send the client a report that still has known defects.

The target state is:

> Same scan evidence, correct findings, correct deterministic facts, the
> selected writing plus bound host corrections, no known client-facing defect
> in the final rendered PDF, and the finalized PDF stored on the dashboard.

This is production and editorial QA. It is not a manual accessibility
verification and not an RGAA audit, and it does not change the offer's
boundary as an automated diagnostic.

## Invocation

~~~text
$client-report-finalizer <audit-id>
~~~

Claude Code exposes the mirrored skill as /client-report-finalizer. Invoking it
with an audit id authorizes, for that audit only, everything in the
**Authorized actions** section below. It needs no further permission prompts.

Default to the French report. Review English only when the operator says it is
part of this delivery. Do not generate English merely because older reports
were bilingual.

## Authorized actions

Invoking the skill with an audit id authorizes the following. Each item is
limited to that audit, except the deploy:

1. **Read-only retrieval** of the hosted audit record, report-quality lineage,
   current PDFs, and the render bundle (see Tooling).
2. **Source fixes** to shared code, deterministic copy, layout rules, and
   deterministic producers, each with a focused test. Commit only when the
   operator asks; never push.
3. **Local rendering** from the fetched render bundle with fixed local code and
   the override file, with provider credentials removed from the environment.
4. **Deploy** with `deploy/odysseus-deploy.sh` when the skill's own tooling or a
   finding-regrouping fix must be live on the VPS. Deploy a clean tree only:
   the committed state of `main`, with no unrelated uncommitted work. If the
   tree holds uncommitted changes that are not the skill's own, stop and ask
   before deploying.
5. **One VPS regrouping pass** per run, only when a finding-grouping defect is
   confirmed (see section 5). The VPS recomputes findings from its stored scan
   artifacts and runs **exactly one** product writing pass.
6. **Upload** of the final, clean PDF to the dashboard as the finalized report
   for that audit and language, together with its override file and lineage.

It never authorizes:

- a new crawl, browser audit, or page refetch;
- any further product-LLM call beyond the single regrouping pass;
- sending, emailing, or outreach;
- a write to any other audit;
- destructive database or git actions.

## Hard invariants

1. **No new acquisition.** Work from stored scan artifacts only. If truth can
   only be corrected by rescanning, return BLOCKED-NEW-SCAN-REQUIRED.
2. **Product LLM budget: 0, or 1 when regrouping.** The host model running this
   skill is the editor. Never call the product writer, critic, repair, or
   translation path to polish prose. Render with `OPENAI_API_KEY`,
   `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`, and `MONGODB_URI` removed from the
   subprocess environment so that an accidental provider call fails closed.
3. **Findings change only through their producer.** Never add, remove, merge,
   downgrade, strengthen, or reword a finding by hand. If findings are wrong:
   - fix the deterministic producer, with a regression test;
   - recompute from stored artifacts, on the VPS (section 5).
4. **Deterministic facts are never edited as prose.** This covers counts, page
   populations, severities, occurrences, measurements, legal facts, obligation
   status, limitations, provenance, ranking inputs, and the selected structure.
   When one is wrong, fix the code that produces or renders it.
5. **No unsupported legal or commercial claim.** Keep
   docs/rules/obligation-basis.md and the writing rules' business-claim limits.
   A correction may clarify a claim; it may never broaden it.
6. **Model-written prose changes only through the override file.** Never edit
   the analysis JSON, a database document, a report record, or a PDF by hand.
   Every report-specific prose correction goes in the override file
   (see Tooling). The file is bound to the analysis digest and passes the
   normal writing guards.
7. **No client-specific hacks in shared code.** Never put a hotel name,
   hostname, audit id, literal client sentence, or one-off selector into shared
   code. Report-specific wording belongs in the override file.
8. **Do not churn acceptable prose.** Change a sentence only when it is:
   - factually wrong or unclear;
   - non-native French, or materially repetitive;
   - inconsistent with the rest of the report;
   - against the canonical style.
9. **The PDF is the release artifact.** Source, tests, and JSON are evidence.
   The locally rendered final PDF is what must be clean, and it is the file
   that gets uploaded.
10. **Never send to the client.** Uploading the finalized PDF to the dashboard
    is storage. Delivering it to the client stays the operator's action.

## Tooling

The skill relies on the tools below. If one is missing or out of date, the run
builds it to this contract first, with tests. That work is part of the run, not
a blocker. If a new tool needs a route on the VPS, deploy it (Authorized
action 4) before continuing.

### Fetch: `scripts/fetch-client-report.mjs`

~~~bash
node scripts/fetch-client-report.mjs <audit-id> <scratchpad>/<audit-id> [fr en]
~~~

It logs in with `ODYSSEUS_DASHBOARD_PASSWORD` from `.env`, which it only reads,
and keeps the session cookie in memory. It then runs GET requests only and
downloads:

- `audit.json` and `report-quality.json`;
- `<lang>.pdf`, the current hosted PDF, which is the baseline;
- `bundle-<lang>/`, the render bundle from
  `GET /api/audits/:id/render-bundle/:lang`. It holds exactly the inputs the
  report stage passes to `generateReportPdf`:
  - `manifest.json`, `findings.json`, and the selected `analysis.json`;
  - `manualFields`, `preparation`, `gradeOverride`, `delta`, and
    `qualityLimitations`;
  - `lineage.json`: the audit id, language, selected analysis id and digest,
    findings provenance digest, and the VPS build id.

It prints the SHA-256 of each file and logs out. The render bundle is the only
source of the VPS's selected writing. Never render from an older local
`artifacts/` analysis.

### Render: local, render-only

~~~bash
pnpm report:finalize-render -- --bundle <dir> --overrides <file> --out <pdf>
~~~

It runs `generateReportPdf` from the bundle with the current local code. It
never opens a Mongo connection or a provider client. It applies the override
file, re-runs the writing guards on every overridden field, and runs the
normal lint and integrity gates. It fails when:

- the override file's analysis digest does not match `lineage.json`;
- an override targets a non-prose field;
- a guard fails.

### Override file: `<scratchpad>/<audit-id>/overrides-<lang>.json`

~~~json
{
  "auditId": "<uuid>",
  "language": "fr",
  "analysisDigest": "<sha256 from lineage.json>",
  "findingsDigest": "<sha256 from lineage.json>",
  "overrides": [
    {
      "path": "<JSON pointer to a prose field in analysis.json>",
      "from": "<exact current text>",
      "to": "<corrected text>",
      "reason": "<one line: what defect this fixes>"
    }
  ]
}
~~~

The rules for override entries:

- An entry may target only model-written prose: synthesis, theme titles and
  bodies, action text, and similar fields.
- `from` must match the current text exactly. A mismatch means the analysis
  changed, and the entry is refused.
- An entry never targets finding ids, ranking, membership, counts, severities,
  or any deterministic field.
- An entry never introduces a claim, statistic, or finding that is absent from
  the structured input.

The override file is client data. It stays in the scratchpad, is uploaded with
the PDF, and is never committed.

### Upload: `scripts/upload-finalized-report.mjs`

~~~bash
node scripts/upload-finalized-report.mjs <audit-id> <lang> <final.pdf> <overrides.json> <lineage.json>
~~~

It calls `POST /api/audits/:id/report/:lang/finalized` with the PDF, the
override file, and the lineage.

On the server:
- if the lineage no longer matches the audit's current selected analysis and
  findings, the request is refused with HTTP 409;
- otherwise the server stores the PDF as that language's finalized report,
  recording the render build, the override digest, and the upload time;
- the dashboard preview then serves the stored PDF.

The upload never regenerates anything or calls a model.

### Regroup on the VPS

`POST /api/audits/:id/renormalize` recomputes findings from the audit's stored
scan artifacts with the deployed normalization code, then runs **exactly one**
writing pass and selects the result. Use it only as described in section 5.
After it runs, fetch again: the bundle, digests, and any override `from` texts
are now new.

## Load the minimum authoritative context

Before editing anything, read:

- the host charter and docs/agents/documentation-map.md;
- docs/rules/report-writing-style.md and docs/rules/llm-layer-rules.md;
- docs/report/report-design-system.md and docs/report/report-workbench.md;
- docs/rules/obligation-basis.md, when legal or identity content is present;
- docs/report/report-design-tokens.md, only when touching styles.

Do **not** read docs/report/audit-rehearsal-notes.md before the first blind
pass.

## 1. Resolve and freeze the target

Run the fetch. Record the following in a scratch ledger that is never committed:

- the baseline PDF's SHA-256 and its page count, from pdfinfo;
- the bundle lineage;
- the delivery language.

An HTTP 409 on the PDF means the hosted report is stale. The render bundle
still defines the target.

Render the bundle once with the **current local code and no overrides**. This
separates two kinds of defect:

- defects that current code already fixes;
- defects that still need work.

## 2. First blind pass: read the exact PDF front to back

Read every physical page of the baseline, in order. Rasterize each page and
inspect the images, using `pdftoppm` or `pnpm run report:workbench -- --pdf
<path>`. The appendix and glossary are where pagination defects hide, so do
not stop early.

Read as a French SME director who is receiving the report for the first time.

**Editorial.** Check that the French is native and formal, uses vouvoiement,
and has no calques or unneeded anglicisms. Also check for:
- theme titles that are not concise noun phrases;
- unexplained jargon;
- repetitive scaffolding;
- positional cross-references ("ci-dessus");
- duplicated labels or sections;
- overstated claims;
- contradictions between any two sections.

**Visual.** Look for:
- clipping, overflow, or a number wrapping inside itself;
- missing or duplicated fragments;
- a stranded heading or a lone tail line;
- a continuation page without its table header;
- broken cards, badges, or links;
- accidental blank pages;
- glyph or spacing faults;
- anything that contradicts the design system.

Sparse numbered pages are intentional and are not defects.

**Reader trust.** Ask whether anything would make a careful client doubt the
rest of the report: wrong identity, contradictory numbers, opaque provenance,
broken pagination, implausible advice, or text that reads like machine
translation.

Record every issue before fixing anything.

## 3. Reconcile against deterministic evidence

Trace every questioned fact to its owning source in the bundle:

- identity and audit date;
- page populations: inventoried, content-checked, and performance-measured;
- finding, severity, and category totals;
- priority coverage and occurrences;
- performance values;
- limitations;
- legal and obligation facts;
- finding ids, pages, selectors, and WCAG references.

A number is not verified just because another section repeats it.

Next, use the relevant entries in docs/report/audit-rehearsal-notes.md and
docs/report/report-feedback-deferred-items.md as a regression checklist.

## 4. Classify every issue

- **Class:** one of `truth`, `prose`, or `visual`.
- **Scope:**
  - `systemic` if the same input shape could produce the defect for another
    client;
  - `report-specific` if the system is correct and only this content needs an
    editorial choice.

A bug is not report-specific merely because one hotel exposed it.

## 5. Fix at the smallest source of truth

Fix **all** open issues in one planned round. Do not ship them one at a time.

| Issue | Fix |
| --- | --- |
| Systemic truth: projection, count, or population | Fix the producer or renderer, with a focused test. It takes effect in the local render. |
| Systemic truth: finding grouping (near-duplicates, wrong split or merge) | See **Regrouping** below. |
| Systemic prose: deterministic copy, glossary, labels | Fix the string or template, with a test. |
| Systemic prose: model tendency | Fix the prompt or guard for future audits **and** correct this report's text through the override file. |
| Report-specific prose | Override file entry. |
| Systemic visual | Fix the template, CSS, or PDF logic, with a test that captures the shape without client data. |
| Report-specific visual | Find a principled shared rule. If none is defensible, change the wording through an override so the layout resolves. Never special-case the client in CSS. |
| Wrong operator fact (SIREN, name, transactional flow) | Use the existing manual-field mechanism only when trusted evidence or the operator supports the value. Otherwise return BLOCKED-SOURCE-DECISION. |

**Regrouping.** When findings are confirmed near-duplicates or wrongly split:

1. Fix the normalization rule locally, with a regression test.
2. Commit it, then deploy (Authorized action 4).
3. Trigger the VPS regrouping. This is the run's single writing pass.
4. Fetch the bundle again and restart this skill at step 1 with the new
   lineage. The override file is discarded and rebuilt against the new
   writing.

A second regrouping in the same run is not allowed. Report it as
BLOCKED-SOURCE-DECISION.

Shared-code fixes stay local and in the working tree. They take effect in the
local render immediately, so the final PDF includes them even though the VPS
has not been deployed. Keep them separate from any unrelated work in the tree
when staging.

## 6. Render and verify each round

1. Run the focused tests for each changed seam.
2. Render the complete PDF from the bundle, the local code, and the override
   file.
3. Inspect each changed page and its neighbours. If pagination, shared styles,
   fonts, or section order changed, inspect the whole PDF.
4. Diff the `pdftotext` output against the previous render.
5. Update the ledger, marking each issue as open, fixed, intentionally
   unchanged, or blocked.

Do not try speculative variants of the same symptom. Move to the owning seam
instead.

## 7. Final clean pass

Any change resets the release pass. Render the final PDF and read **every page
again, from page 1 to the end**. Then reconcile the high-trust facts one last
time and diff the text against the baseline. The loop ends only when this pass
finds nothing new, or when a true blocker is recorded.

"Perfect" means no known factual, editorial, consistency, or rendering defect
under the current evidence and design contracts. It does not mean endless
stylistic churn.

## 8. Upload

Upload only after a clean final pass, and only on the READY-FOR-CLIENT path.
Fetch the PDF preview again and confirm that its SHA-256 equals the local final
PDF's.

## Release gate

READY-FOR-CLIENT requires all of these:

- [ ] render-bundle lineage fetched from the VPS and used for the render;
- [ ] delivery language set resolved;
- [ ] no new crawl or acquisition;
- [ ] product LLM calls: 0, or exactly 1 VPS regrouping pass;
- [ ] findings changed only through their producer;
- [ ] deterministic facts reconcile to their owning sources;
- [ ] no unsupported business or legal claim;
- [ ] native formal French throughout, with no material repetition, jargon,
      calque, awkward cross-reference, or contradiction;
- [ ] every page of the final PDF inspected after the last change;
- [ ] no rendering defect remains;
- [ ] design system preserved;
- [ ] all prose corrections live in the bound override file, and its guards
      pass;
- [ ] focused tests pass for every source change;
- [ ] no client data, PDF, or override file staged in git;
- [ ] finalized PDF uploaded, and the hosted SHA-256 matches the local one.

## Terminal statuses

Use exactly one:

- **READY-FOR-CLIENT**: the gate is fully satisfied and the PDF is uploaded.
- **BLOCKED-NEW-SCAN-REQUIRED**: the truth cannot be corrected from stored
  acquisition.
- **BLOCKED-SOURCE-DECISION**: a factual, identity, or legal ambiguity, or a
  second regrouping, needs the operator.
- **BLOCKED-RENDER**: the document cannot be rendered or read reliably.

If the skill's tooling is missing, build it (see Tooling). That is not a
terminal status. Preserve every safe fix when blocked.

## Final response

~~~text
FINALIZATION: READY-FOR-CLIENT | <blocked status>
Audit: <id / client>
Delivery: fr | en | fr+en
Baseline PDF: sha256:<...> (<N> pages)
Final PDF: sha256:<...> (<N> pages) — <local path>
Uploaded: yes, hosted sha256 matches | no (<reason>)
Resolved: <count> factual / <count> prose / <count> visual
Systemic source fixes: <paths or none> (uncommitted | committed <sha>)
Overrides: <count> entries, <path>
Product LLM calls: 0 | 1 (VPS regrouping)
New scans: 0
Deploys: <count and build ids, or none>
Final full-document pass: clean | <blocker>
~~~

After the summary, list only the unresolved blockers.
