# Plan 073 — Light-theme full report export

- **Execution status:** DONE (2026-09-21)
- **Priority:** P2
- **Effort:** L
- **Depends on:** Plan 039's report design system and Plan 072's finalized-report workflow.

## Outcome

After a full client report is ready, the audit dashboard offers one presentation choice beside the existing Preview / Download actions:

**Rapport client**

Thème : Sombre / Clair

Sombre remains the default and canonical appearance. Clair is an alternative rendering of the exact same paid report: same audit, same selected analysis, same findings, same finalized operator corrections, same section order, same wording, same approval event. It is not a second report tier and it must never create a second content lineage.

The operator can preview either appearance and download the selected one. Theme selection is an export/presentation choice, not a scan option, report-writing option, or client-data field.

## Why this is a separate plan

The current implementation is intentionally dark-only:

- packages/report/src/template/render-html.ts has no theme input and always inlines packages/report/src/styles/nocturne.css plus paged.css.
- docs/report/report-design-system.md explicitly defines the paid report as dark everywhere except the printable Plan d'action insert.
- packages/report/src/template/design-tokens.ts contains badge/tile pairs derived specifically for the dark ground.
- packages/report/src/styles/paged.css still contains several dark-specific page, footer, code-block, and print literals.
- packages/site/app/globals.css already contains the corresponding public-site light palette, so the light report can stay inside the existing Odysseus design language instead of inventing a new identity.
- Plan 072 changes the delivery authority: when a report is finalized, the finalized PDF supersedes the generated PDF, while the stored analysis deliberately keeps the pre-override model prose.
- report approval currently binds reportId plus the exact PDF digest. Serving a newly recoloured PDF without extending that binding would bypass the exact-artifact approval contract.
- the delivery route checks an active immutable Plan-058 bundle before ordinary report rows. Those frozen/dormant bundles currently contain only one PDF per language and therefore cannot silently pretend to support a light variant.

The implementation must solve those seams together. A CSS toggle in the dashboard alone is not sufficient.

## Binding decisions

### 1. One paid report, two presentation variants

Introduce the report-level type:

    type ReportTheme = 'dark' | 'light'

The dark variant is canonical and preserves today's behaviour. The light variant is a sibling PDF of the same ReportDocument, not another ReportDocument and not another reportId.

No finding, prose, score, priority, legal statement, table row, section, page evidence decision, or finalized correction may depend on ReportTheme.

A normalized text extraction of the two variants from the same render input must be identical. Page count must also be identical: colour/theme work is not allowed to change geometry or pagination.

### 2. Theme is explicit and deterministic

GenerateReportInput gains an explicit optional theme, defaulting to dark for every existing caller.

The rendered HTML carries the resolved theme as a root data attribute. CSS selects from that attribute.

Never use prefers-color-scheme, browser appearance, OS appearance, time of day, or a dashboard-global dark/light setting to choose report appearance. A stored/downloaded PDF is a permanent artifact and must reproduce from explicit inputs.

### 3. Preserve the current dark report exactly

The first implementation slice is a dark-theme invariance pass.

Refactor the current dark values into semantic theme tokens without intentionally changing them. Existing dark visual baselines, contrast gates, PDF integrity gates, pagination fixtures, and the printable-insert behaviour remain green before light styling is accepted.

REPORT_TEMPLATE_VERSION is bumped when the new theme-capable renderer ships, because renderer semantics and persisted artifact shape changed even when the default dark appearance did not.

### 4. The light palette comes from the public site's light design language

The light report uses packages/site/app/globals.css as the palette source:

- paper: #e8edf3
- raised paper: #ffffff
- sunk paper: #dbe3ec
- ink: #101b2a
- soft ink: #3f4c5e
- muted ink: #5c6878
- line: rgb(16 27 42 / 0.14)
- accent: #0369a1
- stronger accent: #075985
- the site's light card shadow family

Those are source values, not permission to copy site CSS directly into the report package. packages/report remains self-contained and zero-network at render time.

The cover keeps its current composition but receives a restrained light sky/paper treatment derived from the same palette. There is no separate template or light-only layout.

### 5. Theme-sensitive colour data becomes semantic

Audit every literal colour in:

- packages/report/src/styles/nocturne.css
- packages/report/src/styles/paged.css
- packages/report/src/template/design-tokens.ts
- section templates that emit inline colour styles
- PDF margin-box chrome and code/evidence blocks

Move only theme-sensitive values behind semantic theme tokens/palettes. Intentionally fixed semantic marks may remain fixed when their meaning is independent of theme, for example the dossier finding mark, evidence mark, and action signal, but their contrast/non-text visibility must be proved on both grounds.

Severity, category, grade, positive-state, and urgency pairs must have explicit dark and light values or semantic CSS variables. Re-derive light text/fill pairs rather than reusing pale dark-theme text colours on white.

Acceptance floors:

- normal text: WCAG 2.x contrast >= 4.5:1;
- large text where applicable: >= 3:1;
- meaningful non-text boundaries/indicators: >= 3:1 where WCAG requires it;
- both themes pass the existing axe render suite.

### 6. The printable Plan d'action insert stays one semantic component

The dark report keeps the current deliberate print inversion to the light printable insert.

In the light report, the same page is already in the light register. It keeps the Enc﻿art à imprimer / Printable insert semantics, structure, wording, and print-safe severity colours, but it must not perform a pointless dark-to-light inversion or introduce a second set of content.

Dark and light extracted text remains identical.

### 7. Persist variants on one report row

Keep the existing ReportDocument fields as the canonical dark/legacy fields:

- fileRef
- pdfDigest
- pageCount

Add an optional light variant record on the same document, conceptually:

    variants?: {
      light?: {
        fileRef: string
        pdfDigest: string
        pageCount?: number
      }
    }

Legacy rows have no variants and are dark-only.

Add one shared helper in packages/store or packages/interface that resolves the requested ReportTheme to the correct file reference/digest/page count. Routes and dashboard models must use the helper rather than duplicating fallback logic.

There is no silent light-to-dark fallback. Asking for light when a report has no light variant returns a typed unavailability result.

### 8. Generate both variants from the same content snapshot before persistence

The normal report stage resolves render inputs once and renders dark then light through the same Chromium instance.

There is no second scan, normalization, structure pass, writing pass, critic call, or provider call.

The report row is inserted only after the render attempt has established the complete artifact set for that row. Dark remains the primary deliverable:

- a dark-render failure keeps the existing fail-closed report-generation behaviour;
- a light-only render failure must not destroy an otherwise valid dark report or substitute dark bytes under a light label;
- if light fails, persist the dark report with no light variant, surface a typed operator warning, and make Clair unavailable for that row;
- enabling light later requires a new report generation/finalization row rather than mutating the insert-only report document.

This keeps the additive feature from making the established dark deliverable less reliable.

### 9. Plan 072 finalization renders both themes from the same override-applied bundle

The finalizer is the most important lineage rule in this plan.

packages/cli/src/commands/finalize-report.ts applies the operator override file once to the fetched render bundle, then renders dark and light from that same in-memory finalized bundle. The light PDF must therefore contain the exact finalized wording, never the stored pre-override analysis.

The CLI writes the canonical dark final PDF plus a clearly named light sibling and records both page counts/digests/paths in its sidecar metadata.

scripts/upload-finalized-report.mjs uploads the pair in one request. The finalized-report upload route:

- verifies both PDFs are valid PDF bytes;
- verifies the normal analysis/findings lineage once;
- stores both files beside the same override file;
- inserts one origin=finalized report row with the optional light variant;
- never accepts a light PDF as a separate finalization with a separate reportId.

A light-only finalizer render failure is surfaced and the operator may upload/store the dark finalized row without a light variant; it must never silently upload generated/pre-finalization light bytes beside finalized dark bytes.

### 10. Exact approval covers the exact available variant digests

Extend ApprovedReportRef compatibly. Keep the current pdfDigest as the canonical dark digest for old rows and approvals, and add an optional light digest, for example:

    variantDigests?: {
      light?: string
    }

When the operator approves the current report, the approval snapshot records the light digest if that exact report row has one.

Delivery rules:

- dark delivery requires the existing reportId + dark pdfDigest match;
- light delivery additionally requires the approval's light digest to match the current row's light variant digest;
- a legacy approval with no light digest approves only dark;
- adding a light variant after approval is impossible because report rows are insert-only;
- a regenerated or re-finalized row still invalidates the old approval exactly as today.

This preserves the meaning of approval: the client receives bytes that were part of the approved report artifact set.

### 11. Dashboard interaction is local presentation state

In packages/interface/src/dashboard/routes/audit-reports-section.tsx, put the theme control beside the current Preview / Download controls for each available language:

    Thème :  Sombre  Clair

Requirements:

- native/accessible radio-group or equivalent segmented control semantics;
- keyboard operable;
- visible focus;
- Sombre selected on every initial page load;
- no database field and no scan/report-generation setting;
- the selected theme governs both Preview and Download so the operator can inspect the exact appearance before sending;
- dark filename remains the existing convention;
- light filename adds a clear suffix such as -clair for French UI;
- if the current report row is dark-only, Clair is disabled/unavailable with concise operator copy rather than hidden behind a failing click.

Do not persist a per-prospect or per-audit theme preference in Plan 073. This is an export choice, not client state.

### 12. Routes accept an explicit theme without breaking old links

The existing endpoints gain a strict optional query parameter:

- GET /api/audits/:auditId/report/:language/preview?theme=dark|light
- GET /api/audits/:auditId/report/:language?theme=dark|light

Omitted means dark, preserving every existing link and caller.

Unknown theme values return 400. Missing light variants return 409 with a typed/clear message. Preview keeps its current freshness checks. Download keeps its current freshness and approval checks, now against the selected variant digest.

No endpoint may answer a light request with dark bytes.

### 13. Frozen Plan-058 immutable bundles remain truthful

The active immutable report-bundle schema currently stores one PDF per language, and the delivery route gives that authority precedence over ordinary report rows.

Plan 073 does not reactivate or redesign the frozen 058 quality pipeline.

For an audit whose active delivery authority is a legacy/dark-only immutable bundle:

- dark continues to work unchanged;
- the dashboard reports light as unavailable for that authority;
- a light request is refused, never served from a different ordinary report row and never silently mapped to dark.

If Plan 058 is reopened later, adding variant digests/object keys to its candidate, approval, promotion, and active-bundle contracts is a prerequisite to exposing Clair for those bundles.

### 14. Outreach preview and permanent reference example do not change

The outreach preview remains its deliberately fixed dark document.

Plan 071's permanent reference audit continues to call the paid renderer with the default dark theme. Plan 073 does not add a public theme toggle to /exemple-audit and does not create two reference-report URLs.

The new theme API must therefore preserve dark as the default for generateReferenceAuditPdf and every existing renderer caller.

## Implementation slices

### Slice 0 — inventory and dark invariance gate

1. Inventory theme-sensitive literals in report CSS, design-tokens.ts, inline section styles, and paged margin boxes.
2. Render the existing stress fixture and one stored audit without rescanning.
3. Record dark page count, normalized text, integrity result, and the existing visual-regression surfaces.
4. Add the ReportTheme type and default-dark plumbing without changing CSS values.
5. Prove the default call and theme=dark produce the same normalized text, page count, and dark visual baselines.

Stop if the refactor changes existing dark pagination or a guarded screenshot before any light styling is added.

### Slice 1 — semantic theme tokens and light palette

1. Split the current report token layer into shared geometry/type tokens plus explicit dark/light colour tokens.
2. Port the public-site light palette.
3. Replace theme-sensitive literals in paged.css and component CSS.
4. Make grade/category/severity/positive pairs theme-aware.
5. Preserve fixed dossier semantic marks only where contrast/visibility proves they work in both modes.
6. Adapt the printable insert to both themes without changing its content.
7. Add axe + contrast-matrix tests for both themes.

### Slice 2 — render contract and PDF parity

1. Thread theme through RenderHtmlInput and GenerateReportInput.
2. Put data-report-theme on the document root.
3. Render a representative dark/light pair from one input.
4. Assert:
   - identical normalized text;
   - identical section ids/order;
   - identical page count;
   - no missing/duplicate fragments;
   - PDF integrity passes for both;
   - no host fonts/network resources;
   - light output contains the expected light ground/ink computed styles in real Paged.js output.

### Slice 3 — persisted report variants and approval

1. Add the optional light variant to ReportDocument.
2. Add the one variant resolver helper and tests for legacy/dark/light/missing cases.
3. Extend ApprovedReportRef with the optional light digest.
4. Update approval creation/matching helpers.
5. Prove a light download cannot pass on dark approval alone and a changed light digest cannot pass an approval for older bytes.
6. No migration: legacy reports/approvals remain valid dark-only history.

### Slice 4 — pipeline generation and finalization

1. Render dark and light sequentially from one resolved input set and one Chromium process.
2. Persist/sync both files under one report row.
3. Surface a typed light-variant warning without invalidating a valid dark render.
4. Update report:finalize to render both from the same override-applied bundle.
5. Update finalized sidecar/upload parsing/storage for the light sibling.
6. Prove with the de-identified Plan-072 fixture that an operator override appears in both dark and light PDFs and the original generated sentence appears in neither.
7. Prove zero additional provider calls and zero scans.

### Slice 5 — routes and dashboard

1. Add strict theme query parsing.
2. Resolve preview/download bytes through the selected variant helper and actual delivery authority.
3. Add light availability to ReportStatusResponse.
4. Add the accessible Sombre / Clair selector beside Preview / Download.
5. Use the selected theme for both actions and filename construction.
6. Add render/API tests for:
   - default dark;
   - explicit dark;
   - light available;
   - light unavailable;
   - invalid theme;
   - legacy dark-only approval;
   - exact light approval;
   - finalized report;
   - superseded finalization;
   - active immutable dark-only bundle.

### Slice 6 — design acceptance, docs, and release proof

1. Update docs/report/report-design-system.md with the two-variant contract while keeping dark canonical.
2. Update docs/report/report-design-tokens.md with light palette and contrast measurements.
3. Record the artifact/approval decision in docs/decisions/trade-offs.md.
4. Update the Plan-072 finalizer skill/tooling docs for paired theme output.
5. Run the repository baseline plus report E2E suites.
6. Review a representative light PDF page by page: cover, metadata, TOC, scoreboard, priority cards, Plan d'action, detailed evidence, legal section, appendix, glossary.
7. Review the dark sibling beside it to prove no visual regression.
8. Use a saved audit only; no new third-party scan is authorized by this plan.

## Verification baseline

Focused tests land beside every seam, then:

    pnpm run format
    pnpm run check
    pnpm run test
    pnpm test:e2e

Store integration tests use the normal Mongo test service:

    pnpm run test:store:up
    pnpm run test -- packages/store/src packages/interface/src
    pnpm run test:store:down

Report-specific proof must include real Paged.js/Playwright renders for both themes. Unit tests over CSS strings are not enough for page grounds, margin boxes, printable insert behaviour, or pagination parity.

## Definition of done

- The audit dashboard shows Sombre / Clair beside the client report's Preview / Download actions when the light variant exists.
- Sombre is the default and today's dark report retains its established visual/pagination behaviour.
- Both variants come from one report lineage and one content snapshot.
- A finalized report's light PDF contains the same operator corrections as its dark PDF.
- Dark/light normalized text and page count are identical for the same input.
- Both variants pass PDF integrity, render-lint, accessibility, contrast, font, and pagination gates.
- The light palette is recognizably the public site's light design language, not a generic white inversion.
- Approval records and verifies the exact light digest before a light PDF can be delivered.
- Legacy reports and approvals remain dark-only and valid.
- No report, route, or dashboard control silently substitutes dark bytes for a requested light variant.
- The feature adds no scan and no LLM/provider call.
- Outreach previews and the permanent reference example remain unchanged/default-dark.
- The requirement-to-proof closure ledger below is complete before this plan moves to DONE.

## Executable closure contract

| Requirement | Owning seam / artifact | Focused proof required |
| --- | --- | --- |
| explicit deterministic theme | report types + render-html | omitted = dark; explicit dark/light; no system-preference branch |
| dark invariance | report CSS + existing visual fixtures | pre/post dark screenshot/page-count/text parity |
| light design language | report CSS + design docs | reviewed light palette values and page-by-page acceptance |
| theme-independent content | render-html / PDF pair | identical normalized text and section order |
| pagination invariance | Paged.js render | exact dark/light page-count equality on stress + saved audit fixtures |
| contrast/accessibility | design tokens + axe suites | both themes pass contrast matrix and axe |
| printable insert | paged.css | real print-media test for dark and light variants |
| one report lineage | report schema | one reportId with optional light variant; legacy row fixture |
| finalization parity | report:finalize + upload route | same override text in both PDFs; generated text absent in both |
| exact approval | report approval schema/helpers | unapproved/mismatched light digest refused; matching digest served |
| no silent fallback | variant resolver + routes | light-missing returns typed refusal, never dark bytes |
| dashboard interaction | audit-reports-section.tsx | accessible selector, dark default, preview/download share selected theme |
| dormant immutable compatibility | delivery authority resolver | active dark-only bundle exposes dark only and refuses light |
| no extra model/scan | pipeline/finalizer architecture | call-count/import tests and saved-fixture E2E |
| docs/provenance | design-system, tokens, trade-offs, Plan-072 tooling docs | docs checks + entries match implementation |

No binding row may close by code review alone.

## Closure ledger — completed 2026-09-21

Closure evidence: 2026-09-21, the paired renderer, persistence, approval,
delivery, dashboard, documentation, and real report-render gates below were
executed in the working tree; repository checks pass, with only the noted
Mongo/network-bound suites unavailable in this workspace.

| Requirement | Proof completed |
| --- | --- |
| explicit deterministic theme | `ReportTheme`, default-dark render input, root `data-report-theme`, strict query parser, and no paid-renderer `prefers-color-scheme` branch; covered by `render-html.test.ts` and `report-theme.test.ts` |
| dark invariance | Existing dark render tests plus the real dark/light parity render; omitted theme and explicit dark both remain canonical dark paths |
| light design language | Self-contained light register, semantic severity/category/grade/positive pairs, screen-safe muted companion, and the documented site-derived palette in `nocturne.css` and the report token docs |
| theme-independent content | `theme-parity.e2e.test.ts`: normalized text and ordered section IDs are identical |
| pagination invariance | `theme-parity.e2e.test.ts`: real Paged.js/Chromium dark/light page counts are equal; the paired renderer also refuses a light page-count mismatch |
| contrast/accessibility | `render-html.axe.e2e.test.ts`: both themes pass WCAG 2.2 AA on the normal and privacy-palette fixtures |
| printable insert | `print-inversion.e2e.test.ts`: real print-media Paged.js output verifies the checklist insert in both themes |
| one report lineage | One `ReportDocument` row carries optional `variants.light`; resolver and legacy/missing-light tests live in `report-variants.test.ts` |
| finalization parity | Finalizer renders paired siblings from one override-applied bundle and writes one sidecar/upload payload; finalized upload parsing and paired-page-count guards are covered by `finalized-report-upload.test.ts` |
| exact approval | `report-approvals.test.ts` proves exact light digest approval, changed/missing light refusal, and legacy dark-only approval behavior |
| no silent fallback | Resolver and preview/download code return 409 for unavailable light; no route maps light to canonical dark bytes |
| dashboard interaction | Native per-language radio controls default to dark, disable missing light, and switch both explicit preview/download URLs; covered by `audit-detail-render.test.ts` |
| dormant immutable compatibility | Active Plan-058 bundle delivery remains dark-only and refuses light before ordinary-row resolution |
| no extra model/scan | Normal and finalized pipelines call the paired renderer over already-resolved inputs; no scanner/provider imports or calls were added to the theme path |
| docs/provenance | Design-system, token, trade-off, and Plan-072 finalizer-tooling docs updated; `pnpm run check` passes |

Focused unit proof: 9 feature files, 151 tests passed, 1 Mongo-gated integration skip (the local Mongo service was unavailable), with an additional 5-file rerun at 54 passed and the new upload guard covered. Real report e2e proof passed for parity, both-theme axe, and both-theme printable insertion. The repository-wide unit/e2e commands also contain unrelated network/security and long-running suites that cannot complete in the restricted workspace; those were not used as feature acceptance evidence.

## Out of scope

- Changing report wording, findings, priorities, section order, or business logic.
- A shorter or cheaper report product.
- A client-facing interactive theme toggle inside a PDF.
- System-driven prefers-color-scheme behaviour.
- Persisting a client's preferred theme.
- Re-theming the outreach preview.
- Publishing a second light /exemple-audit artifact.
- Reopening Plan 058's dormant quality pipeline; its existing active bundles remain truthfully dark-only until that plan is explicitly reopened and made variant-aware.
- Rescanning any hotel or making an additional LLM call solely for theme generation.
