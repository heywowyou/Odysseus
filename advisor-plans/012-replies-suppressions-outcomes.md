# Plan 012: Reconcile replies, suppressions, follow-up drafts, and outcomes

> **Executor instructions**: Complete plan 011 first. Read mailbox metadata
> only to support manual outreach state. Follow-ups may become drafts but are
> never sent automatically. Update plan 012 in the index when complete.
>
> **Drift check (run first)**:
> `git diff --stat f7ef7cf..HEAD -- packages/interface/src/outreach packages/store/src packages/cli/src/commands/outreach.ts docs/outreach-rules.md docs/prospect-qualification.md`
> Stop if manual-send, touch spacing, suppression, or retention rules changed.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plan 011
- **Category**: direction
- **Planned at**: commit `f7ef7cf`, 2026-08-27

## Why this matters

Manual sending creates an intentional gap between provider state and Odysseus.
Without reconciliation, the system could draft a follow-up after a reply,
re-contact an objector, or lose the outcome data needed to evaluate the
campaign. This plan makes state transitions explicit and suppression-first
while keeping interpretation and sending under human control.

## Current state

- Plan 011 creates Gmail drafts but does not know when a human sends them.
- Canonical sequence is E1 day 0, E2 no earlier than day +4, E3 no earlier than
  day +11, maximum three touches in one thread.
- Follow-ups generate only when no reply exists. E2 is two sentences with new
  evidence and no new link; E3 closes the loop and offers data/preview deletion.
- Telephone remains closed until a person has replied and is still outside this
  milestone.
- Permanent objections and completed sequences belong in hash-only suppression;
  operational mailbox/prospect data expires after 90 days.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| State tests | `pnpm exec vitest run packages/store/src/outreach-threads.test.ts` | all pass |
| Reconciliation tests | `pnpm exec vitest run packages/interface/src/outreach/reconcile-mailbox.test.ts` | all pass |
| Follow-up tests | `pnpm exec vitest run packages/interface/src/outreach/create-follow-up-draft.test.ts` | all pass |
| CLI tests | `pnpm exec vitest run packages/cli/src/commands/outreach.test.ts` | all pass |
| Validation | `pnpm run check` | exit 0 |
| Full suite | `pnpm run test` | all pass, except a reported pre-existing fixture baseline |

## Scope

**In scope**:

- Outreach thread/draft state-machine extensions in `store`
- Mailbox metadata reconciliation through plan 011's limited adapter
- Due-follow-up selection and E2/E3 draft orchestration
- Deterministic bounce/automated-response classification from trusted provider
  metadata where reliable
- Private CLI commands for sync, review, suppression, and categorical outcomes
- First-preview-load boolean/date reconciliation only if plan 009's approved
  server-log design exposes it lawfully

**Out of scope**:

- Sending, editing Gmail account settings, mailbox warmup automation, or a
  sequencer
- LLM sentiment analysis, autonomous reply interpretation, or automatic sales
  decisions
- Reading/storing full reply bodies when headers/metadata suffice
- Phone/SMS/WhatsApp, more than three touches, new links in E2/E3, or new
  contact discovery
- Tracking pixels, cookies, browser fingerprinting, or per-open history
- Permanent raw addresses or thread contents

## Git workflow

- Work directly on `main`; do not create another branch.
- Use imperative commits such as `Reconcile manual outreach thread state`.
- Do not push or create real follow-up drafts unless asked.

## Steps

### Step 1: Freeze the state machine and legal transitions

Define explicit states such as `e1-drafted`, `e1-sent`, `e2-drafted`,
`e2-sent`, `e3-drafted`, `e3-sent`, `replied`, `bounced`, `opted-out`,
`sequence-complete`, and `closed`. Store helper transitions require expected
prior state and timestamps; impossible jumps fail. Keep provider facts
(`sentAt`, message/thread IDs, labels) separate from operator outcome facts.

Define due dates from configurable spacing snapshots retained on the thread,
not constants hidden in a prompt. Defaults are day +4 and +11.

**Verify**: state-table tests cover every allowed transition, reject every
important illegal transition, preserve timestamps on idempotent sync, and prove
one terminal state prevents new drafts.

### Step 2: Reconcile manual sends and replies from minimal metadata

Use the plan-011 port to read only message IDs, thread ID, dates, From/To,
labels, `In-Reply-To`/references, and delivery-status headers needed for state.
Identify an operator-sent draft by provider thread/message facts, not merely by
draft disappearance. Identify a reply as a later external message in the same
thread. Keep ambiguous cases `needs-review` and create no follow-up.

Do not classify reply sentiment automatically. Do not persist message bodies.

**Verify**: fixtures cover draft still present, manually sent, external reply,
self-reply, automated reply, hard bounce, ambiguous disappearance, duplicate
sync, and provider pagination/error.

### Step 3: Enforce objections and hard bounces immediately

Provide an operator action for `opted-out` that, in one idempotent workflow:

- writes domain/address hashes to permanent suppression
- deletes any provider draft
- revokes the live preview
- terminally closes the thread
- schedules operational raw data for the existing 90-day expiry

Automatically detected hard-bounce metadata may use the same workflow with a
distinct reason only when classification is unambiguous; otherwise require
review. A normal negative reply is not silently treated as permission to
recontact.

**Verify**: tests prove every action, retry idempotency, suppression before
draft deletion failure recovery, and no raw value in permanent suppression.

### Step 4: Draft only due follow-ups with no reply

Add an operator-run command such as `outreach draft-due --limit N`. It first
syncs provider metadata, then selects threads whose prior touch is confirmed
sent, due date has passed, no reply/bounce/objection exists, preview/state is
valid, and suppression recheck passes. It calls plan 010 for the correct touch
and plan 011's same draft-only provider interface.

E2 must use the second selected evidence alias and no link. E3 must contain the
deterministic deletion/preview-removal offer and no link. Check suppression
again immediately before each provider draft. Re-running the command creates no
duplicate active draft.

**Verify**: fake-clock tests cover before/at/after due time, reply just before
draft, suppression races, E2 evidence separation, E3 deletion text, bounded
limit, and idempotency.

### Step 5: Close completed sequences and record operator outcomes

After E3 is confirmed sent and a documented reply window passes with no reply,
mark `sequence-complete`, add a permanent campaign-complete suppression hash,
and create no more drafts. Add operator-set outcomes:
`no-reply | reply-positive | reply-not-now | reply-negative | opt-out | call |
quoted | won | lost`, with optional controlled lost reason. Record the actor
and date. Do not ask an LLM to infer them.

Expose bounded aggregate queries needed by plans 013 and 014, grouped by score version,
evidence variant, and outcome, never raw email text.

**Verify**: tests prove sequence completion suppresses future ingestion/drafts,
outcomes are auditable/idempotent, and aggregates contain no contact address or
message body.

### Step 6: Reconcile privacy-safe preview-load signal if available

If plan 009's approved server logs expose token-hash plus calendar date, add a
one-way reconciliation that stores only `previewLoaded: boolean` and the first
load date. Disclose this in the prospecting privacy notice. Ignore bot/preload
signals where reliable headers identify them. If the provider cannot expose
this without adding tracking or retaining raw tokens/IP/user agents, omit the
metric and record it unavailable; do not weaken privacy controls.

**Verify**: tests prove first-date-only minimization, idempotency, and immediate
90-day deletion. If unavailable, canonical rollout docs explicitly say the
open-rate gate cannot be used.

## Test plan

- Exhaustive state transition table and fake-clock due-date tests.
- Metadata-only Gmail fixtures for sent/reply/bounce/ambiguous cases.
- Suppression/revocation fault injection.
- E2/E3 final-body structure and no-link tests.
- Aggregate privacy tests and optional first-load minimization tests.
- No real mailbox operation is required without explicit authorization.

## Done criteria

- [ ] Manual sends and external replies reconcile without storing bodies.
- [ ] Ambiguity blocks follow-ups and surfaces review.
- [ ] Objection/hard-bounce flows suppress, revoke, and close idempotently.
- [ ] E2/E3 drafts are due-only, reply-safe, suppression-safe, and never sent.
- [ ] Three touches is a hard maximum and completed sequences are suppressed.
- [ ] Outcomes are operator-set and available as privacy-safe aggregates.
- [ ] Focused tests and `pnpm run check` pass; plan 012 is `DONE`.

## STOP conditions

Stop if Gmail metadata cannot distinguish manual send/reply reliably; a needed
operation requires full-body retention or send capability; canonical timing or
suppression rules conflict; preview logs require tracking/raw-token retention;
or a dependency/locked contract/package seam must change.

## Maintenance notes

Provider-state reconciliation must remain conservative: false `needs-review`
costs operator time, while a false no-reply causes harmful contact. Add new
provider classifiers only with captured metadata fixtures and explicit reason
codes.
