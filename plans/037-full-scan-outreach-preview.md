# Plan 037: Replace the outreach preview with a full-scan scorecard

## Status

- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH. This replaces a public, expiring prospect artifact; it changes
  scan cost, stored preview provenance, public disclosure, dashboard workflow,
  and the first-email dependency.
- **Depends on:** the selected outreach cohort from plan 034, full-audit resume
  from plan 035, and the existing preview revocation/suppression path from
  plans 009 and 012.
- **Category:** outreach conversion and operator workflow.
- **Planned at:** commit `f555bed`, 2026-09-11, following an operator grilling
  session prompted by a live v1 preview. This plan is implementation-ready but
  intentionally contains no implementation.
- **Reviewed:** 2026-09-11, same day, against the production data and the
  verified publish path. Four operator decisions folded in: an approved
  proof-card copy catalog gates slice 3 (decision 15), a price change revokes
  and reissues live previews (decision 7), scan launching stays manual with no
  automatic cap (decision 16), and the two live v1 artifacts were removed at
  cutover (see the cutover note).

## Outcome

Replace the current three-page prescan preview with a full-site, deterministic
scorecard. For a selected hotel, the operator starts an outreach full scan; its
resulting audit page is the one place to inspect the preview, download its PDF,
publish its expiring public HTML link, revoke that link, and then create the
first email draft.

The public document proves scope without giving away the paid work: it shows
coverage, distinct-finding and affected-page totals, all four severity totals,
and three concise text proof cards. It never exposes exact URLs, selectors,
finding or rule IDs, raw HTML, screenshots, remediation, occurrences, or an
arbitrary composite score. The paid audit still re-scans after purchase and
adds fresh, complete detail, prioritisation, remediation, and the appendix.

## Why the current system is being replaced

The current `OutreachPreviewInput` is deliberately built from the hotel
prescan: its schema requires three to five summaries and permits up to two
screenshots; its publication row requires a current prescan. The prescan itself
has a three-page budget. The private dashboard makes that document available
only under a prospect subpage, and the public site still accurately says that a
prospecting analysis covers at most three pages.

That boundary was safe for a proof crop, but it does not support the new sales
argument: a prospect should see that a full-site measurement found a meaningful
pattern, not be asked to infer scale from a handful of observations. Reusing a
paid-report input remains forbidden. The replacement must be a new narrow,
public-safe projection of a completed full audit.

## Binding decisions

1. This replaces the v1 outreach-preview path for new outreach. It is not an
   experiment or an additional preview tier.
2. Cheap qualification, the hotel prescan, immutable scoring, and cohort
   selection remain the cost gate. Only selected cohort members receive the
   expensive full outreach scan.
3. An outreach full scan uses the paid audit's full content-coverage policy:
   every successfully crawled HTML page receives content-sensitive checks, and
   Lighthouse remains the normal disclosed performance sample. It must report
   inventoried, content-checked, and performance-measured counts separately.
4. The preview reports an overall count of **distinct findings**, a count of
   unique **affected pages**, and critical, serious, moderate, and minor
   distinct-finding totals. It never totals occurrences.
5. The preview has no 0-to-100 score, screenshots, or image evidence. It has
   exactly three deterministic text proof cards: public-safe title, category,
   severity, and affected-page count, with no locator or fix.
6. The public preview includes the existing deterministic factual legal block
   when it is source-permitted. It never contains model-written legal prose or
   a conclusion about the business.
7. The fixed EUR 1,600 HT price is shown. The primary action is to reply and
   request the full audit; it is not a checkout, calendar, or phone ask. A
   change to that amount revokes and reissues every live v2 preview, so no
   live link ever shows a stale price; slice 1 records this procedure with the
   offer rules.
8. The preview uses the Nocturne visual system of the paid report: its tokens,
   type, dark ground, stat and severity tiles, section-header language, cards,
   spacing, and print treatment. It remains a separate preview renderer and
   input contract, never a reduced paid-report template.
9. Every coverage-complete full audit can display an operator-only scorecard
   and downloadable PDF from its audit page. Only a selected,
   candidate-linked outreach full scan may publish an external preview.
10. An external preview remains an opaque-token, noindex, no-store, expiring
    HTML page. It offers no PDF download. The operator alone downloads a PDF
    from the private audit page.
11. A preview is built only after the full audit coverage gate passes. The
    operator must explicitly review and publish it before any public token or
    first-touch draft exists. Suppression still blocks publication and revokes
    every live external preview for the domain.
12. A paid audit is always a new, fresh scan. The outreach scan is dated
    prospecting evidence, not a paid deliverable held back behind a lock.
13. An outreach full scan is started from a selected prospect and persists its
    `candidateId` as immutable job/audit context. The dashboard then moves to
    the audit page; it never asks the operator to match an arbitrary completed
    audit to a hotel by domain.
14. Existing v1 public previews are neither rewritten nor invalidated early.
    They remain revocable and expire under their existing records. No new v1
    preview or first-touch draft may be created after this plan ships.
15. Implementation begins with a content gate: the implementer inventories the
    scanner's rule set and drafts a bilingual, public-safe proof-card catalog
    for operator approval before slice 3 is built. Today's v1 observation copy
    is model-written per site, so this reviewed static catalog exists nowhere
    in the repository yet and is real authoring scope, not a rendering
    detail. Fewer than three approved categories means most audits refuse
    publication, which is the intended fail-closed behaviour.
16. Outreach full scans have no automatic cap. The operator launches them one
    at a time from a selected prospect; cohort selection stays the only
    volume gate.

## Architecture and safety boundary

### Two document shapes, one visual language

Build a pure `OutreachPreviewSummary` from the persisted, coverage-complete
audit: audit identity and date; the three coverage counts; distinct-finding and
unique-affected-page totals; severity rollup; and three selected proof cards.
It admits no selector, exact page URL, occurrence, snippet, raw evidence,
finding ID, rule ID, model prose, or report section.

The operator scorecard consumes that summary. A selected prospect's public
preview consumes the same summary plus the already bounded recipient facts:
business name, deterministic facts block where allowed, code-owned offer copy,
per-record data origins, and privacy/objection links. Thus the audit page can
show the exact public document before publication, while an ordinary paid audit
can still have an internal scorecard without pretending to be a prospecting
contact.

The three proof cards are selected in code, not by a model. Define and test a
stable ranking: severity first, then affected-page count, then a stable
rule/title key; prefer category diversity when eligible candidates permit it.
Each card must draw its copy from reviewed deterministic rule copy and pass the
same public-content guard as every other string. If fewer than three eligible,
public-safe cards exist, the scorecard is not publishable as outreach evidence.

Do not use the paid report's `GenerateReportInput`, report HTML, analysis, or
appendix as an intermediate. Share only extracted Nocturne style primitives
within `packages/report`; do not pull Paged.js pagination or report-only data
into the preview.

### Full outreach scan workflow

Add an `outreach-full-scan` job path, or an equivalently explicit full-audit
job context, rather than overloading the three-page prescan. Its creation
accepts a selected `candidateId` only; the server re-resolves the candidate's
current own domain and verifies cohort membership, current qualification,
absence of suppression, and a valid selection state before queuing anything.
Persist the candidate and cohort provenance on the job and resulting audit.

The worker reuses the production full-audit scan, normalization, provenance,
and coverage gate. It does not invoke the LLM or create a paid report: the
outreach artifact is a deterministic projection of scanner findings. A paid
purchase uses the normal fresh full-audit pipeline later. Preserve full-audit
checkpoint/resume behaviour for this job type.

On completion, the audit detail page is the owner of the workflow. For a
candidate-linked outreach audit it offers, in order: render the exact
unpublished document in a sandboxed frame, download its PDF, publish or
reissue the external HTML link, copy that one-time link, revoke it, and create
the first outreach draft only when a current published v2 preview exists.
The prospect page may start the scan and link to its audit, but it gains no
preview renderer, publish, download, or draft shortcut.

### Public lifecycle and compatibility

Version the new preview content as v2 and record its source as a full audit,
including `auditId`, candidate identity, findings provenance, input/content
version, language, object key/hash, publication and expiry state. Make the
source discriminated so existing v1 rows still retain their required prescan
fields and can still be listed/revoked. Never reconstruct a v2 document from a
different or later audit merely because it has the same domain.

The external publisher still writes the escaped, linted HTML first and stores a
record second; revocation deletes the object before marking the record revoked.
The public Next.js route remains read-only and knows only token-to-object
resolution. It does not gain database access, a PDF route, tracking, cookies,
or a report import.

Cutover state, 2026-09-11: the only live v1 preview, the operator's
lescorderies.com test publication of 2026-09-10, was revoked through the
product CLI, and the single `e1-drafted` thread with its touch-one draft was
deleted with operator approval. Both outreach collections are now empty, so
v1 compatibility ships against fixtures alone; no real v1 artifact remains to
migrate.

Generate the operator PDF from the same validated preview HTML through a small
`packages/report` sibling renderer. Return it from the authenticated audit
route with a download disposition; do not persist a second public object or
send it to the prospect. Prove that PDF generation cannot access paid-report
fields and that its source HTML passed the preview lint first.

## Implementation slices

### 1. Freeze the replacement contract and retire the old promise

1. Update `docs/rules/outreach-rules.md`,
   `docs/rules/prospect-qualification.md`, `docs/rules/offer-positioning.md`,
   `docs/product/odysseus-project-brief.md`, and the binding decisions in
   `plans/README.md` to record the full-scan preview, its exact public fields,
   the no-screenshot decision, selected-cohort cost gate, fresh paid re-scan,
   audit-page workflow, and operator/public format split.
2. Amend the relevant trade-off entries, especially the prescan-evidence and
   preview-contract decisions, rather than silently contradicting their
   instructions. Preserve the deeper invariant: a preview is a separate,
   disclosure-minimizing document kind.
3. Update public-site offer, bot, privacy, and opt-out copy plus their parity
   tests. Remove every claim that prospecting analysis covers three pages or
   that the outgoing preview includes screenshots. Retain accurate 30-day
   preview expiry, 90-day prospect-data retention, data origin, and objection
   wording.
4. Add bilingual copy fixtures for the new scorecard. The only amounts allowed
   remain the code-owned offer price and approved deterministic legal criteria.

### 2. Add selected-candidate full-scan provenance

1. Extend the existing job/audit persistence and typed queue/API contracts with
   an explicit candidate-linked outreach full-scan context. Do not infer this
   relationship from a hostname after the fact.
2. Add one server action from a selected prospect to create that job. Validate
   cohort selection, current qualification/domain, suppression, and duplicate
   in-flight/live-audit state server-side. Navigate directly to the created
   scan progress page.
3. Run the normal full crawl and content checks with the existing resume and
   coverage machinery. Persist a normal audit/findings/provenance record, but
   stop before analysis/report generation.
4. Add a route/store projection that resolves a candidate-linked full audit
   exactly and refuses stale, failed, partial, wrong-domain, suppressed, or
   coverage-incomplete input with typed reasons.

### 3. Build the bounded full-audit preview data model

1. Gate on approved copy first: inventory the scanner's rule set, draft the
   bilingual public-safe proof-card catalog, and obtain operator approval
   before any selection code is written (binding decision 15).
2. Replace the v1 prescan-only preview input with a versioned v2 schema in
   `packages/core`. Model coverage as distinct facts, distinct finding totals,
   severity totals, affected-page union, three proof cards, and the bounded
   public recipient block. Keep schemas strict and reject report-only fields.
3. Implement pure summary and proof-card selection over normalized findings in
   the package owning those terms. Use only deterministic, reviewed copy; make
   ties stable and make fewer-than-three safe cards a publish refusal.
4. Keep the public-content lint fail-closed. Update it to permit the new
   measurement counts while continuing to reject selectors, exact URLs, raw
   snippets, rule/finding IDs, percentages, statistics, sanctions, legal
   conclusions, unapproved money, stale pricing, scripts, and remote assets.
5. Build the legal block only through `buildOutreachFactsBlock`; keep all
   argument-B source capability and byte-identity checks. Do not put legal
   wording in proof-card selection or a model prompt.

### 4. Re-render the preview in the paid report's visual system

1. Extract only reusable Nocturne screen/print tokens, fonts, severity tiles,
   cards, section-heading patterns, and print-safe colour rules from
   `packages/report` styles. Keep full-report pagination, sections, and inputs
   private to the report renderer.
2. Rebuild the preview HTML as a short, accessible document in this order:
   title and scan date; coverage facts; distinct findings and affected-page
   totals; four severity tiles; three proof cards; deterministic legal block;
   transparent EUR 1,600 HT offer and reply CTA; required privacy/origin/opt-out
   disclosure and expiry. It has no images.
3. Add a PDF generator from the validated preview HTML, using existing report
   browser infrastructure and a purpose-built print stylesheet. It is an
   operator artifact, not a stored paid report or public download.
4. Update renderer, safety, bilingual parity, accessibility, mobile, and PDF
   tests. Human review must compare the HTML and PDF with the paid report's
   Nocturne component language, not attempt to copy its A4 report pagination.

### 5. Move preview operations to the audit detail page

1. Add authenticated audit endpoints for scorecard render, PDF download, public
   publication/reissue, and revocation. Render internal HTML in an empty
   sandboxed iframe, as the existing preview UI does; do not expose token or
   raw HTML beyond the private interface.
2. Add an `Outreach preview` card to `AuditDetailPage`. Every
   coverage-complete full audit gets the internal view and PDF download.
   Candidate-linked outreach audits additionally get readiness/reason status,
   publish/reissue/revoke controls, one-time token display/copy, and a direct
   first-draft action.
3. Remove the new-preview controls and iframe from the prospect subpage. Keep
   legacy v1 deep links/revocation usable until their records expire, then
   remove the legacy-only dashboard route in a separate cleanup change.
4. Extend the dashboard/API types, routes, loading/error states, i18n tables,
   keyboard behaviour, and render tests in both French and English.

### 6. Rewire public publication and draft assembly

1. Replace the prescan-based publication port with a v2 audit-based port.
   Enforce candidate linkage, v2 coverage/summary gates, suppression, preview
   provenance identity, public expiry, and the existing write-then-record /
   delete-then-revoke ordering.
2. Change touch-one assembly so it consumes an already published v2 preview
   reference. It must never scan, render, publish, or reissue a preview as a
   side effect. A missing/currently revoked/wrong-audit preview refuses the
   draft.
3. Keep touch 2 and 3 timing, no-new-link rule, reply gate, suppression, and
   deterministic disclosures unchanged. The first email retains its one public
   preview link and no screenshot attachment.
4. Update CLI commands or explicitly deprecate their v1 preview path with a
   clear refusal. No path may silently generate a new prescan-backed preview.

### 7. Verify migration, safety, and real workflow

1. Unit-test the full-summary counts: unique finding rows per severity, unique
   affected-page union, all three coverage counts, stable proof selection,
   category diversity, and every insufficient/unsafe/coverage-failure refusal.
2. Test strict schema and final HTML lint rejection for every forbidden field
   family, plus proof that no image tag, remote asset, script, selector, exact
   page URL, raw finding ID, occurrence, or model prose reaches v2 output.
3. Test both v1 compatibility and v2 persistence: v1 rows list/revoke/expire
   unchanged; a v2 public record binds one candidate and one audit provenance;
   an audit rerun cannot substitute for the published scan.
4. Test queue/API validation: unselected, suppressed, mismatched-domain,
   duplicate-running, incomplete, and failed candidates never produce an
   outreach full-scan or publishable preview. Confirm resume works for the new
   job context.
5. Test dashboard flow end to end: selected candidate starts scan, scan page
   opens the internal preview, PDF downloads, explicit publish yields a
   one-time token, revoke disables the link, and first draft refuses before
   publication and succeeds only afterward. Confirm ordinary full audits show
   only the internal card.
6. Run preview axe tests for French and English at desktop and 320px; test the
   generated PDF with the report's relevant rendering checks. Inspect an
   operator-approved named cohort member only with current explicit permission,
   then verify the public HTML, its private headers, the internal PDF, and the
   first email draft before any real send.
7. Run `pnpm run format`, focused unit/e2e suites, `pnpm run check`, and the
   relevant full test tier. Record actual commands and results in the session
   log. Do not send any email as part of verification.

## STOP conditions

- Any proposal to derive a public preview by subtracting fields from a paid
  report input, or to expose raw findings, exact locations, selectors,
  screenshots, occurrence counts, or model prose.
- Any attempt to publish automatically, to create a first draft before explicit
  publication, to retain a public PDF, or to add tracking/cookies/scripts.
- Any candidate-to-audit association inferred only by domain, any bypass of
  cohort/qualification/suppression validation, or any preview after a failed
  coverage gate.
- Any change to a locked contract, new dependency, package-boundary change, or
  legal wording outside the already approved deterministic facts block without
  asking the operator first.
- Any live third-party scan without the operator's current, explicit
  permission for that named site.

## Done criteria

- New outreach uses only a candidate-linked, coverage-complete full scan.
- The audit page, not the prospect page, owns view, PDF download, publish,
  link-copy, revoke, and first-draft operations.
- The external HTML is simple, Nocturne-consistent, expiring, untracked, and
  contains the agreed aggregate scorecard plus exactly three text cards.
- The paid report remains a fresh scan and the sole source of exact locations,
  remediation, analysis, and appendix detail.
- v1 previews remain safely revocable until natural expiry; new v1 creation is
  impossible.
- Focused tests, full validation, and an authorized manual workflow review pass
  before any outreach is sent.
