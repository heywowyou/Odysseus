# Plan 011: Create reviewed Gmail drafts without sending

> **Executor instructions**: Complete plans 007, 009, and 010 first. The mailbox
> interface must have no send capability. Stop before OAuth/dependency changes
> until the operator approves them. Update plan 011 in the index when complete.
>
> **Drift check (run first)**:
> `git diff --stat f7ef7cf..HEAD -- packages/interface/src packages/store/src packages/cli/src/commands packages/core/src/prospecting docs/outreach-rules.md docs/operator-obligations.md packages/site/app`
> Stop if suppression, manual-send, required-disclosure, or role-address rules
> changed.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 007, 009, and 010
- **Category**: direction
- **Planned at**: commit `f7ef7cf`, 2026-08-27

## Why this matters

The system should remove repetitive drafting work while keeping the human
review and send decision. A deliberately capability-limited Gmail adapter makes
automatic sending structurally unavailable, and two suppression checks prevent
a stale queued action from creating a draft that could be sent by reflex.

## Current state

- Canonical policy is manual sending with no sequencer. Automation stops at a
  provider draft.
- Qualified contacts are role addresses on the prospect's own domain. Named
  individual and free-mail addresses remain prohibited.
- `isSuppressed(connection, domain, address?)` is the permanent hash-backed
  enforcement point.
- Plan 009 supplies an unexpired preview URL and live compliance pages. Plan
  010 supplies validated prose plus deterministic assembly. Plan 007 supplies
  an approved own-domain role contact.
- No Gmail client, OAuth configuration, sending domain verification, mailbox
  schema, or draft state currently exists.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Adapter tests | `pnpm exec vitest run packages/interface/src/outreach/mailbox-draft-adapter.test.ts` | all pass |
| Orchestration tests | `pnpm exec vitest run packages/interface/src/outreach/create-outreach-draft.test.ts` | all pass |
| Store tests | `pnpm exec vitest run packages/store/src/outreach-drafts.test.ts packages/store/src/outreach-threads.test.ts` | all pass |
| CLI tests | `pnpm exec vitest run packages/cli/src/commands/outreach.test.ts` | all pass |
| Validation | `pnpm run check` | exit 0 |
| Full suite | `pnpm run test` | all pass, except a reported pre-existing fixture baseline |

## Scope

**In scope**:

- `MailboxDraftAdapter` port, in-memory adapter, and approved Gmail adapter
  under `packages/interface/src/outreach/`
- Interface config and OAuth token handling through environment/approved secret
  storage, never repository files
- Outreach thread/draft schemas, store helpers, tests, and exports
- Draft orchestration and private CLI commands
- Plain-text MIME construction and deterministic required headers
- Documentation for operator prerequisites and manual review

**Out of scope**:

- Any Gmail send endpoint/method, scheduled sending, SMTP submission, sequencer,
  randomized sending, or automatic volume ramp
- Named/free-mail recipients, address guessing, SMTP probing, telephone, or
  additional contact discovery
- OAuth secrets/tokens committed or printed
- Real draft creation without explicit mailbox authorization
- DNS changes, Workspace account changes, dependency installation, or external
  provisioning without operator approval

## Git workflow

- Work directly on `main`; do not create another branch.
- Use imperative commits such as `Create suppression-safe Gmail drafts`.
- Do not push or create a real provider draft unless asked.

## Steps

### Step 1: Verify external prerequisites and Gmail contract

Using current official Google documentation, identify the minimum OAuth scopes
for creating/deleting drafts and reading thread metadata. Record endpoint paths,
token refresh behavior, MIME requirements, quotas, and required redirect/secret
handling. Present dependency versus built-in-fetch options and obtain operator
approval before adding one.

Before real draft creation, require a recorded manual preflight:

- approved sending domain/mailbox, separate from `odysseusaudit.com`
- SPF, DKIM, and DMARC verified
- monitored reply address and complete signature/postal/SIRET facts
- live privacy, opt-out, and bot pages
- mailbox warmup in progress or complete

**Verify**: the provider/dependency decision and preflight state are recorded
without secret values. Missing prerequisites keep production draft creation
disabled.

### Step 2: Define a capability-limited mailbox port

Create an interface with only methods required now, for example:

- `createDraft(input)`
- `getDraft(providerDraftId)`
- `deleteDraft(providerDraftId)`
- `getThreadMetadata(providerThreadId)` for plan 012

There must be no `send`, `sendDraft`, raw generic request, or arbitrary endpoint
method. The Gmail adapter allowlists only draft and metadata endpoints. Provide
an in-memory adapter that records calls and validates MIME. Inject it into the
orchestrator; do not instantiate Gmail inside business logic.

**Verify**: type/static tests prove no send-like method or endpoint string is
reachable; adapter contract tests run against in-memory and a stubbed HTTP
transport.

### Step 3: Persist immutable draft attempts and thread state

Create 90-day TTL collections or clearly separated documents for:

- thread: internal ID, prospect/prescan/preview IDs, provider thread ID when
  known, role address, domain, language, status, current touch, timestamps
- draft attempt: internal/thread ID, touch, evidence/prompt/facts versions,
  subject/body hash, provider draft/message ID, created/deleted timestamps,
  status, and validation result

Raw role address and draft body may exist only inside the 90-day operational
record. Permanent suppression remains hash-only in the existing collection.
State transitions belong in store helpers and use compare-and-set semantics so
retries cannot create duplicate live drafts.

**Verify**: store tests prove TTL, one active draft per thread/touch,
idempotency, legal state transitions, and permanent suppression separation.

### Step 4: Create E1 through a suppression-safe orchestration module

The deep interface accepts a selected prescan/thread ID, not loose email
content. It performs, in order:

1. Load latest eligible prospect/prescan and live preview.
2. Confirm role/own-domain address and first-touch eligibility.
3. Check suppression immediately before the model call.
4. Generate and assemble plan-010 E1.
5. Run final language, disclosure, link-count, word-count, prohibited-claim,
   preview-expiry, and plain-text validators.
6. Check suppression again immediately before provider `createDraft`.
7. Create Gmail draft and persist provider metadata atomically/idempotently.

If any guard fails, create no provider draft. Use plain text, exactly one
preview link, no image/attachment, and deterministic List-Unsubscribe headers
only after their public target is working and operator-approved.

**Verify**: fault-injection tests prove both suppression checks, no model call
when first check fails, no provider call when second check fails, no duplicate
on retry, one-link/plain-text constraints, and cleanup/reconciliation after
partial provider success.

### Step 5: Add explicit operator commands and review output

Add private commands to create one E1 draft, create a bounded batch of drafts,
list pending review, inspect the exact subject/body/preview/version facts, and
delete/reject a draft. Batch mode has an explicit small limit and stops on
provider/authentication errors. It never sends and does not pace sends.

Print recipient domain/local role, evidence source, validation checks, and Gmail
draft URL/ID, but do not print OAuth tokens. Require a positive per-draft human
review outside the program before the operator manually sends in Gmail.

**Verify**: CLI tests cover bounds, dry-run/in-memory mode, invalid state,
suppression, rejection, and absence of any send command/help text.

### Step 6: Run one authorized synthetic provider smoke test

After explicit mailbox authorization, create one draft addressed to an
operator-owned test role mailbox using synthetic hotel evidence. Inspect it in
Gmail, verify plain text/headers/thread metadata, then delete it. Do not send it.
Record only non-secret IDs and outcomes.

**Verify**: smoke-test record states created, visually reviewed, deleted, and
not sent. Provider audit/logs contain no unexpected send call.

## Test plan

- Shared adapter contract tests with an in-memory implementation.
- Static send-capability/endpoint deny tests.
- Store state-machine, TTL, and idempotency tests.
- Orchestration tests for every failure between the two suppression gates.
- FR/EN final-body validators for E1 word count, one link, disclosures, plain
  text, and prohibited claims.
- CLI tests and one explicitly authorized synthetic Gmail draft smoke test.

## Done criteria

- [ ] Mailbox interface and Gmail adapter expose no send capability.
- [ ] Production prerequisites and provider/dependency choice are approved.
- [ ] Suppression is checked before generation and immediately before draft
  creation.
- [ ] Draft/thread records expire by 90 days and retries are idempotent.
- [ ] E1 is plain text, one link, no attachment, and fully disclosed.
- [ ] Synthetic Gmail draft was deleted without sending, if authorized.
- [ ] Focused tests and `pnpm run check` pass; plan 011 is `DONE`.

## STOP conditions

Stop if OAuth/dependency/account approval is absent; SPF/DKIM/DMARC or public
compliance pages are not verified; the required operation needs a send/generic
request capability; only a named/free-mail address exists; suppression cannot
be checked immediately; or a locked contract/package seam must change.

## Maintenance notes

Review Gmail endpoint allowlists whenever the adapter changes. A future request
for automatic sending is a new product/legal decision and must not be smuggled
in as another adapter method.
