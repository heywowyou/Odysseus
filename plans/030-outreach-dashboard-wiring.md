# Plan 030: Wire outreach draft generation into the operator dashboard

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (no new send capability, no schema contract change; adds a
  shared runtime module, two synchronous routes, two batch job types, and
  dashboard pages, all built on already-shipped, tested orchestrators)
- **Depends on**: 011 (Gmail drafts without send), 012 (replies, suppressions,
  outcomes), 013 (outreach operator interface) — all DONE
- **Category**: Milestone 9c, operator interface
- **Planned at**: 2026-09-07, not yet started

## Why this matters

`createOutreachDraft` (touch 1,
`packages/interface/src/outreach/create-outreach-draft.ts`) and
`createFollowUpDraft` (touch 2/3,
`packages/interface/src/outreach/create-follow-up-draft.ts`) are complete,
tested orchestrators covering evidence checks, prose generation, preview
publication, both suppression gates, and Gmail draft creation. They are
called only from `packages/cli/src/commands/prospect/draft.ts` and
`.../outreach.ts` (`sync`, `draft-due`). Plan 013's dashboard Outreach tab
(`outreach-index.tsx`, `drafts.tsx`, `replies.tsx`, `outcomes.tsx`,
`suppressions.tsx`) is entirely a review surface: it can approve or skip an
existing draft, record an outcome, check suppression — but nothing in it can
originate a draft. The tab is downstream of a CLI command someone has to
remember to run, which makes it read as decorative rather than the place the
outreach workflow actually lives.

This plan connects the existing orchestrators to the dashboard so a draft (or
a follow-up) can be generated from a candidate's own page, and so a bounded
batch can be run from the Outreach hub, without changing the manual-send
boundary plan 011 established: every action here still produces a Gmail
*draft* for a person to read and send by hand. Nothing here sends, and
nothing here schedules follow-ups automatically — `plans/README.md`'s
"Supplied proposals intentionally rejected or superseded" explicitly rejects
automatic sending, automatic follow-ups, and an SMTP/IMAP sequencer; this
plan does not reopen that.

## Scope

In scope:

- One shared runtime module (`packages/interface/src/outreach/draft-runtime.ts`)
  wrapping `createOutreachDraft` and `createFollowUpDraft` with real adapters
  (`createMongoOutreachDraftStore` / `createMongoFollowUpDraftStore`,
  `createConfiguredMailboxDraftAdapter`, `createMongoOutreachPreviewStore` +
  `createConfiguredPreviewPublisher`), so there is exactly one place that
  decides how a real draft gets built. The CLI's `draft.ts` and `outreach.ts`
  (`draft-due` action) are refactored to call it instead of inlining the same
  wiring twice.
- Two synchronous routes on `packages/interface/src/routes/prospects.ts`:
  `GET /api/prospects/:candidateId/outreach` (current thread summary, or
  `null`) and `POST /api/prospects/:candidateId/outreach/draft` (touch 1) and
  `POST /api/prospects/:candidateId/outreach/follow-up` (touch 2/3, thread
  looked up server-side via `findOutreachThreadByCandidate`). These follow
  the existing synchronous-route pattern already used for
  `POST /api/prospects/:candidateId/review` — a few seconds for one LLM call
  plus one Gmail call is a reasonable wait for a single click with immediate
  feedback, no new infrastructure needed for this part.
- Two new job types for the two batch operations (`draft batch`, `outreach
  draft-due`), since a real batch runs tens of seconds to minutes of
  sequential LLM/Gmail round trips — the same shape
  `packages/interface/src/queue/pipeline/run-prospecting-job.ts` already
  handles. Adds `'outreach-draft-batch'` / `'outreach-followup-batch'` to
  `JobType` in `packages/store/src/schemas/job.schema.ts`, two new pipeline
  runners modeled on `run-prospecting-job.ts` (sequential, no per-origin lock
  or worker pool — these are provider API calls, not site scans), registered
  in the `JobQueue` runners record, and two routes
  (`POST /api/outreach/draft-batch`, `POST /api/outreach/followup-batch`)
  mirroring `routes/prospecting.ts`'s enqueue pattern.
- Dashboard: a new `outreach` sub-page per candidate
  (`/prospects/:candidateId/outreach`, added to `prospectSubPages` in
  `prospects-model.ts`), showing thread state and the appropriate action
  button (generate first email / generate follow-up / nothing, if closed or
  already drafted), built on the existing `useInsightView` +
  `sendJson`/`toast`/`refresh` patterns from `preview.tsx` and
  `prospect-detail.tsx`. Two buttons on `outreach-index.tsx` triggering the
  batch routes. New bilingual strings in `i18n/en.ts` and `i18n/fr.ts`.
- Unit tests for the runtime module, the new routes (happy path and each
  typed refusal), and the two job runners, all against stubbed
  store/mailbox/preview ports — never a live model or Gmail call, matching
  the package's existing test discipline.

Out of scope (explicitly deferred, not blocking):

- Wiring `outreach sync` (mailbox reconciliation) into the dashboard. It
  never drafts anything; it can stay a CLI/cron concern.
- `bounce-confirm` and `object` (opt-out is already in the dashboard) stay
  CLI-only for now.
- Any change to `FORBIDDEN_MAILBOX_CAPABILITIES` or the mailbox adapter's
  method surface — this plan adds no send capability anywhere.

## Verification

- `pnpm run check`.
- New unit tests as scoped above.
- Manual: against a real, already-qualified, not-yet-contacted catalogue
  hotel, generate a first draft from its new Outreach sub-page and confirm it
  appears in `/outreach/drafts`; run both batch buttons with a small `limit`.
