# Plan 005: Capture the two hotel outreach evidence assets

> **Executor instructions**: Complete plan 004. Evidence selection is
> deterministic; the LLM does not choose, crop, annotate, or summarize it.
>
> **Drift check**: `git diff --stat f7ef7cf..HEAD -- packages/scanner/src/prescan packages/scanner/src/artifacts packages/core/src/types/findings.ts packages/store/src/prescans.ts`

## Status

- **Status**: DONE
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

**In scope**: deterministic evidence ranking; render-diff composite; element bounding
box capture; cropped compressed image; fixed annotation primitives; safe public
summary contract; artifact limits/cleanup; prescan evidence references.

**Out of scope**: AI image generation, guessed coordinates, full-page outreach
screenshots, score weights, prose, object storage, or arbitrary image editing.

## Git workflow

- Work directly on `main`; do not create another branch.
- Commit with `Capture bounded hotel outreach evidence`.

## Steps

### Step 1: Define the evidence contract

Return at most one material render-diff composite and one specific failure asset,
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

- [x] Every selectable prescan has the render composite and annotated specific crop.
- [x] Assets derive from measured canonical evidence and are bounded/compressed.
- [x] Public summaries expose no private technical fields or legal/stat claims.
- [x] Tests/check pass.
- [x] Repeat the authorized real-site visual acceptance after the crop-clamping fix,
  then mark plan 005 `DONE`.

## STOP conditions

Stop if evidence needs guessed geometry, new image dependency, raw contract
exposure, or scanner package-boundary changes.

## Maintenance notes

Evidence contract changes are versioned. Reviewer scrutiny belongs on whether
the asset proves the claimed observation, not whether it merely looks dramatic.

## Verification note, 2026-08-27

Implementation and local verification are complete. The first bounded v2 run
against `lacoorniche.com` loaded two pages, retained only a 253,693-byte
composite, a 6,124-byte measured crop, and the expiry manifest, and produced
five allowlisted summaries. Visual review accepted the composite but rejected
the crop because viewport-edge clamping reduced it to 104 by 104 pixels and
clipped the WCAG label. The clamping fix now preserves a minimum contextual
frame by shifting the crop inside the viewport, and local Chromium review plus
stable-hash tests pass. The one-run authorization was not stretched into a
second live navigation, so this plan remains `IMPLEMENTED` until that corrected
output is accepted on a separately authorized rerun.

Final concurrency verification on 2026-08-28 exposed pixel-level Chromium
races at native rounded borders and immediately after annotation repaint. The
capture now uses an integer-aligned temporary border overlay plus a two-frame
paint barrier. Eight concurrent copies of the two-prescan hash test then passed
without color quantization, and the final focused matrix passed 53 tests.

## Acceptance, 2026-08-28

The separately authorized rerun against `lacoorniche.com` ran once, through the
queue rather than an ad-hoc call, so the per-origin lock and crawl delay applied.
It retained a 490,365-byte render composite, a 44,505-byte measured crop, and the
expiry manifest, and produced the same five allowlisted summaries.

Visual review accepts both. The crop is now the full 240 by 160 contextual frame
with `WCAG 4.1.2` completely legible, against the rejected run's clipped 104 by
104. Reviewed against the standard this plan's maintenance note sets - whether
the asset proves the claimed observation rather than whether it looks dramatic -
it does: the outlined region is visually empty because the paired observation is
"a button has no accessible name", so an unmarked hotspot is the defect itself,
not a mis-measured crop.

The same read found one defect in this plan's own step 2, which requires the
summaries be deduped: two of the five were the identical JavaScript-dependency
sentence differing only by page role, so a reader saw one claim twice and two of
five slots said one thing. The dedupe was keyed on rule-and-role while the
observation text is a function of the rule alone. It is now keyed on the rule,
so the ranked role survives and each claim is stated once.

A consequence worth stating: a site whose third summary was only a duplicate now
yields two distinct claims and is correctly `incomplete` rather than complete on
a repeated sentence. The accepted assets above are unaffected - both are chosen
from the facts, not the summaries - but the stored `lacoorniche.com` prescan
still carries the pre-fix list of five and would need a rerun to refresh it. No
second live navigation was spent to do that.
