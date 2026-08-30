# Plan 008: Generate a public-safe hotel outreach preview

> **Executor instructions**: Complete plan 005 first. Build a separate preview
> document kind, not a report tier or small paid report. Run every safety test
> before reviewing appearance. Update plan 008 in the index when complete.
>
> **Drift check (run first)**:
> `git diff --stat f7ef7cf..HEAD -- packages/core/src/compliance packages/core/src/types/compliance.ts packages/report/src packages/report/package.json docs/rules/outreach-rules.md docs/rules/offer-positioning.md docs/report/report-design-system.md docs/report/report-design-tokens.md docs/rules/obligation-basis.md`
> Stop if the offer price, public evidence contract, or obligation-source
> status differs from this plan.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plan 005
- **Category**: direction
- **Planned at**: commit `f7ef7cf`, 2026-08-27

## Why this matters

Cold outreach needs one credible, attachment-free destination that shows the
prospect's own evidence without giving away the paid report or making a legal
conclusion. Reusing `GenerateReportInput` would expose precisely the finding
IDs, selectors, URLs, analysis, and report-only content that outreach forbids.
This plan creates a narrow preview interface with deterministic text and an
escaped HTML implementation.

## Current state

- `packages/report/src/types.ts` defines only the full paid report input. Its
  comment explicitly says the outreach preview is a separate document kind.
- `packages/report/src/template/html-utils.ts` provides `escapeHtml` for all
  untrusted scanner/model/site strings. Reuse it rather than creating a second
  escaping policy.
- `packages/report/src/index.ts` launches Chromium and produces a PDF. A preview
  must return HTML and must not launch Chromium for delivery.
- The current offer is one full audit at EUR 1,600 HT. There is no screening
  tier and no preview price.
- `docs/rules/outreach-rules.md` permits criteria, verified registry facts, and
  observations, but forbids a conclusion, population statistics, penalties,
  competitor claims, and report-only technical detail.
- Hotel-specific legal source material is still `secondary` in
  `docs/rules/obligation-basis.md`. Until primary-source promotion, preview work may
  use argument A and generic criteria only, not a hotel-sector conclusion.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Core facts tests | `pnpm exec vitest run packages/core/src/compliance/outreach-facts-block.test.ts` | all pass |
| Renderer tests | `pnpm exec vitest run packages/report/src/outreach-preview` | all pass |
| Accessibility | `pnpm exec vitest run packages/report/src/outreach-preview/render-html.axe.test.ts` | zero violations |
| Validation | `pnpm run check` | exit 0 |
| Full suite | `pnpm run test` | all pass, except a reported pre-existing fixture baseline |

## Scope

**In scope**:

- `packages/core/src/compliance/outreach-facts-block.ts` and test (create)
- `packages/core/src/index.ts`
- `packages/report/src/outreach-preview/types.ts`
- `packages/report/src/outreach-preview/strings.ts`
- `packages/report/src/outreach-preview/render-html.ts` and focused tests
- `packages/report/src/outreach-preview/styles.css` or a TypeScript-held static
  stylesheet, following current package conventions
- `packages/report/src/index.ts`
- Focused documentation updates if the exact public contract needs recording

**Out of scope**:

- `GenerateReportInput`, `generateReportPdf`, `ReportTier`, paid report
  sections, or PDF/Paged.js output
- Public hosting, opaque tokens, storage providers, expiry, or routes
- Model-generated preview prose
- JavaScript, forms, cookies, analytics, tracking pixels, or third-party assets
- Finding IDs, selectors, exact affected URLs, raw snippets, population stats,
  legal conclusions, sanction amounts, or official conformity claims
- Promoting a legal source without primary-source evidence

## Git workflow

- Work directly on `main`; do not create another branch.
- Use an imperative commit such as `Generate safe outreach preview HTML`.
- Do not push unless asked.

## Steps

### Step 1: Define a minimal preview input

Create `OutreachPreviewInput` independent of paid report types. It contains only:

- language (`fr | en`), establishment display name, scan date, and preview date
- three to five `PublicFindingSummary` values from plan 005 containing public
  observation, optional criterion, severity, and coarse page role
- at most two already-vetted embedded image assets: render comparison and
  specific annotated crop, each with bilingual alt text and dimensions
- deterministic facts block output, only when allowed
- first-contact disclosure facts, offer CTA, privacy/opt-out links, and the
  public expiry date
- current full-audit price sourced from one code-owned offer constant

Images must be local vetted `data:image/webp` or `data:image/png` assets with a
strict decoded-size cap. Do not accept arbitrary remote URLs or SVG markup.
Validate input with Zod or the repository's established runtime-schema pattern
before rendering.

**Verify**: schema tests reject extra/prohibited fields, remote URLs, scripts,
oversized data, unsupported languages, fewer than three or more than five
findings, and unrecognized image types.

### Step 2: Build the deterministic facts block in core

Add `buildOutreachFactsBlock(input)` as a pure bilingual module. It accepts
`ObligationAssessment`, verified prospect facts, source-status capabilities,
and language. It returns fixed plain text plus a version, not HTML. It must:

- state criteria and verified registry facts only
- describe `likely_in_scope` as uncertainty, never obligation
- recommend confirming scope with counsel
- include no penalty amount or population statistic
- omit argument B entirely when required primary sources are not approved
- never claim that hotels are categorically in or out of scope

Reuse `assessObligations`; do not create a second legal decision function. Add
a source-capability switch whose production value comes from canonical,
reviewed configuration rather than an executor guess.

**Verify**: tests cover every obligation status, missing facts, FR/EN, source
capability off/on, and exact prohibited-phrase absence. Snapshot the exact
block bytes because later email assembly verifies byte identity.

### Step 3: Render escaped semantic HTML

Implement `generateOutreachPreviewHtml(input): string`. Escape every dynamic
value with the established `escapeHtml`; do not treat finding observations as
trusted prose. Produce semantic landmarks, heading order, figure/figcaption,
visible focus treatment for links, sufficient contrast, responsive mobile
layout, and print-safe fallback. Use the Nocturne visual tokens and typography
as design guidance without importing Paged.js or full-report CSS.

Suggested information order:

1. Establishment-specific header and methodology disclosure
2. Render-diff evidence with plain explanation
3. Specific failure evidence
4. Three to five observations
5. Optional exact facts block
6. Full-audit offer at EUR 1,600 HT and low-commitment CTA
7. Sender identity, data origin, privacy, opt-out, and expiry

No stale mockup phrase such as "determination of obligation", "sur devis", or
a screening-tier offer may survive.

**Verify**: renderer tests inject hostile HTML into every string field and
prove it is escaped; assert no `<script>`, remote asset, prohibited technical
field, stale phrase, or unapproved number is emitted.

### Step 4: Add bilingual and accessibility gates

Keep French and English strings in one typed contract so missing keys fail at
compile time. Add language-leak tests following the paid report's pattern. Run
axe against both rendered languages at desktop and 320px. Add a small visual
fixture for human review, but do not make pixel snapshots the only correctness
test.

**Verify**: both axe tests report zero WCAG 2.2 AA violations; typed string
parity, language-leak, 320px overflow, and keyboard-link tests pass.

### Step 5: Export only the deep preview interface

Export `OutreachPreviewInput` and `generateOutreachPreviewHtml` from
`@odysseus/report`. Keep layout helpers, raw CSS, and section renderers
internal. The deletion test should show that removing this module would force
publishers to reimplement escaping, safety validation, bilingual content,
layout, and disclosures.

**Verify**: the report package public index exposes only the narrow input and
generator needed by plan 009, and `pnpm run check` passes.

## Test plan

- Unit tests for every obligation status and legal-copy capability.
- Runtime-schema negative tests for every prohibited input class.
- Escaping tests for text, alt text, establishment name, facts, and links.
- FR/EN parity and language-leak tests.
- axe at desktop and 320px with both evidence-present and optional-evidence
  branches.
- Static grep/assertions for script, cookies, trackers, finding IDs, selectors,
  exact URLs, sanctions, population percentages, and stale offer copy.

## Done criteria

- [ ] Preview uses its own minimal input and HTML renderer.
- [ ] No paid-report tier or PDF path changed.
- [ ] Facts block is code-owned, bilingual, byte-stable, and source-gated.
- [ ] Every dynamic value is escaped and every embedded image is bounded.
- [ ] FR/EN axe and safety tests pass.
- [ ] Current EUR 1,600 HT offer and required disclosures are present.
- [ ] `pnpm run check` passes and plan 008 is `DONE`.

## STOP conditions

Stop if the offer price or outreach doctrine is unclear; hotel legal wording
still lacks primary-source approval; the renderer seems to require raw audit
objects; any dependency/package seam is needed; or the design can only work
with script, cookies, remote embeds, or paid-report changes.

## Maintenance notes

Treat the preview input as a disclosure-minimizing public contract. New paid
report fields must never flow into it by spreading larger objects. Review every
new field for public necessity, source, escaping, retention, and legal status.
