# Plan 031: Let the operator view the pre-purchase preview's current content

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (pure read-and-render path; touches no token, bucket, or
  `outreach_previews` record)
- **Depends on**: 008 (safe outreach preview HTML), 009 (expiring preview
  publication) — both DONE
- **Category**: Milestone 9c, operator interface
- **Completed at**: 2026-09-07

## Why this matters

`/prospects/:candidateId/preview` (`preview.tsx`) already exists and shows a
preview's status (live/revoked/expired) and dates, but never its rendered
content. That is deliberate at the publication boundary: `publish-preview.ts`
generates a raw bearer token, returns it exactly once, and never stores it,
so the public link cannot be recovered from the database afterward. But that
same discipline currently means the operator has no way to see what a
prospect is actually looking at, either before or after sending — they would
have to trust the pipeline blind, or reconstruct the link from mail sent to
the hotel.

The renderer itself, `generateOutreachPreviewHtml`
(`packages/report/src/outreach-preview/render-html.ts`), is a pure,
synchronous function of `OutreachPreviewInput` — no browser, no token, no
bucket dependency. The operator does not need the actual published bytes to
check the document; regenerating it from the hotel's current stored evidence
is enough, and carries none of the public link's security weight because it
never touches the bucket or the token. Operator's explicit choice
(2026-09-07): render on demand from current evidence, not a byte-exact
snapshot of what was published — cheaper to build, no schema change, with the
disclosed trade-off that it can drift from the exact document a prospect
received if the site was rescanned after that preview was published.

## Scope

In scope:

- Extract the "row to `OutreachPreviewInput`" mapping already inlined in
  `publish-preview.ts` (evidence and Sirene-assessment mapping via
  `embedOutreachEvidenceAsset` and `registryAssessment`) into a small,
  exported `buildPreviewInput(row, language)` function, so the real publish
  path and the new operator-render path share one mapping and cannot
  silently diverge.
- New route `GET /api/prospects/:candidateId/outreach/preview-render` on
  `packages/interface/src/routes/prospects.ts`: reads the same
  `PreviewPublicationRow` via the existing
  `createMongoOutreachPreviewStore().findPublicationRow` (no new store
  method), builds the input with `buildPreviewInput`, calls
  `generateOutreachPreviewHtml`, and returns the HTML. Refuses with the same
  typed codes `publishPreview` already uses for `no-prescan` /
  `evidence-incomplete` / `evidence-schema-outdated` / `prescan-expired`.
  Touches no token, no bucket, no `outreach_previews` write.
- Dashboard: extend `preview.tsx` with a "show current preview" disclosure
  that lazily fetches the new route and renders it in a sandboxed
  `<iframe sandbox srcDoc={html}>` (so the embedded document cannot execute
  against the dashboard's own origin), with a short note that this reflects
  current evidence, not necessarily the exact document already sent if the
  site was rescanned since publication.

Out of scope:

- Snapshotting the exact published HTML for byte-identical historical
  playback — explicitly declined for now; revisit only if drift between
  "current" and "sent" turns out to matter in practice (e.g. during a
  dispute or a reply referencing something no longer on the page).
- Any change to `publish-preview.ts`'s token, bucket, or revocation
  behavior.

## Verification

- `pnpm run check`.
- Unit test asserting `buildPreviewInput`'s extracted output is unchanged
  from what `publishPreview` assembled inline before the refactor
  (regression guard).
- Unit test for the new route: happy path plus each refusal code.
- Manual: open a published preview's operator page, expand "show current
  preview", confirm it renders and matches the live public link's content
  for a hotel whose evidence has not changed since publication.
