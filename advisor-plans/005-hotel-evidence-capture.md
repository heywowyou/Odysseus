# Plan 005: Capture the two hotel outreach evidence assets

> **Executor instructions**: Complete plan 004. Evidence selection is
> deterministic; the LLM does not choose, crop, annotate, or summarize it.
>
> **Drift check**: `git diff --stat f7ef7cf..HEAD -- packages/scanner/src/prescan packages/scanner/src/artifacts packages/core/src/types/findings.ts packages/store/src/prescans.ts`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plan 004
- **Category**: direction
- **Planned at**: `f7ef7cf`, 2026-08-27

## Why this matters

The supplied funnel calls the render comparison and one annotated failure the
product. The earlier plan mixed them into scoring and allowed the crop to
disappear. This slice makes evidence capture a first-class, bounded interface.

## Current state

- Scanner already retains render-diff screenshots and prunes artifacts.
- Public outreach may show one render comparison, one specific crop, and three
  to five safe observations, never full-page generic screenshots, selectors,
  finding IDs, exact URLs, raw DOM, legal conclusions, or statistics.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Evidence tests | `pnpm exec vitest run packages/scanner/src/prescan/evidence` | all pass |
| Store tests | `pnpm exec vitest run packages/store/src/prescans.test.ts` | all pass |
| Validation | `pnpm run check` | exit 0 |

## Scope

**In scope**: deterministic evidence ranking; render-diff pair; element bounding
box capture; cropped compressed image; fixed annotation primitives; safe public
summary contract; artifact limits/cleanup; prescan evidence references.

**Out of scope**: AI image generation, guessed coordinates, full-page outreach
screenshots, score weights, prose, object storage, or arbitrary image editing.

## Git workflow

- Work directly on `main`; do not create another branch.
- Commit with `Capture bounded hotel outreach evidence`.

## Steps

### Step 1: Define the evidence contract

Return at most one material render-diff pair and one specific failure asset,
each with source page role, canonical internal finding reference, dimensions,
hash, alt-text facts, selection reason, and omission reason. Public summaries
contain observation, criterion, severity, and coarse role only.

**Verify**: runtime tests reject prohibited/public fields and extra assets.

### Step 2: Select the strongest reproducible facts

Prefer blocking booking keyboard/form/focus failures, primary CTA contrast/
target-size, material booking render gap, then accommodation structured data;
generic sitewide findings rank last. Dedupe normalized findings and use stable
ties. Select three to five safe summaries.

**Verify**: table fixtures cover order, ties, dedupe, and insufficient evidence.

### Step 3: Capture and annotate from measured geometry

During the prescan context, capture bounding boxes for eligible elements before
cleanup. Crop with bounded padding and overlay only fixed callout/criterion
text. If geometry is unavailable, try the next eligible finding; if none works,
mark the prescan `evidence-incomplete` and exclude it from selection. Never guess
a crop.

**Verify**: local browser/image tests cover viewport clipping, DPR, hidden/
detached elements, compression/size caps, and deterministic pixels/metadata.

### Step 4: Retain and prune safely

Use content-addressed internal refs, two-asset maximum, 90-day expiry, and the
existing artifact-root/cleanup conventions. Persist references only after files
exist; clean partial artifacts on failure.

**Verify**: fault tests cover write failure, orphan cleanup, hash stability,
expiry, and no generic screenshots retained.

## Test plan

Selection tables, local Playwright geometry fixtures, image bounds, public
contract denial assertions, and store/artifact fault injection.

## Done criteria

- [ ] Every selectable prescan has the render pair and annotated specific crop.
- [ ] Assets derive from measured canonical evidence and are bounded/compressed.
- [ ] Public summaries expose no private technical fields or legal/stat claims.
- [ ] Tests/check pass; plan 005 is `DONE`.

## STOP conditions

Stop if evidence needs guessed geometry, new image dependency, raw contract
exposure, or scanner package-boundary changes.

## Maintenance notes

Evidence contract changes are versioned. Reviewer scrutiny belongs on whether
the asset proves the claimed observation, not whether it merely looks dramatic.
