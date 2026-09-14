---
name: dashboard-ux-audit
description: "Explicit, critical operator rehearsal of the Odysseus dashboard that exercises real local workflows, proves their effects, and records bugs, blockers, misleading success states, and UX friction."
disable-model-invocation: true
---

# Dashboard operator audit

Use the dashboard as the Odysseus operator would. The purpose is not to inventory
screens or review visual polish in isolation. It is to discover anything that makes
real work fail, lie, stall, become hard to understand, or require the CLI when the
dashboard should suffice.

This is an explicit, audit-only workflow. Do not implement fixes during the run.
Record verified findings in the existing ledger and create GitHub issues as the
handoff to a later fix session.

## What a good run proves

A run follows complete operator journeys through the browser and verifies their
effects below the UI. It must catch failures such as:

- a quick check that reports success after seconds but did no scan work;
- a prospect whose qualification cannot be changed from the dashboard;
- a button that returns 2xx or shows a toast but does not persist the intended
  state;
- a queued job that finishes without pages, findings, artifacts, or a usable next
  step;
- a disabled, hidden, stale, or circular action that blocks the operator;
- an error that explains an internal cause but gives no recovery path;
- confusing order, terminology, state, feedback, or navigation;
- a capability that is only reachable through the CLI even though it belongs in
  the operator workflow;
- French and English behavior or meaning that diverges.

Anything affecting the operator experience is in scope: frontend, API, queue,
persistence, scanner execution, artifacts, polling, errors, performance,
accessibility, responsive behavior, and the fit between product rules and the
shipped flow.

## Choose the run mode

Default to **local stateful rehearsal**. Use **production observation** only when
the operator explicitly asks for the deployed dashboard or names production
records.

### Local stateful rehearsal (default)

Run the local interface and dashboard and use controls that mutate local test
state. Before any mutation:

1. Read the root charter, `docs/product/dashboard-ia.md`, and the focused product
   rules needed for the journeys selected.
2. Inspect the interface environment configuration without printing secrets.
   Resolve the exact MongoDB database and artifact paths. Do not assume that
   "localhost" or a development command means disposable data.
3. Prove the target is not production. If that cannot be proved, downgrade to
   production observation and do not mutate.
4. Prefer existing fictional fixtures or uniquely tagged audit records. Never
   scan a real third-party site unless the operator explicitly authorized that
   named target. A local fixture site is preferred for scan journeys.

Local mutations made through the dashboard are part of the audit. Avoid direct
database edits as a substitute for the operator flow. Direct setup is acceptable
only to create a missing precondition that the product does not claim the
dashboard can create; record it separately from the journey result.

### Production observation (explicit only)

Drive `https://app.odysseusaudit.com` with the credential in the repository
`.env`, without exposing it. Production is read-only unless the operator has
explicitly authorized named records and named actions for this run. Do not infer
write permission from the fact that an action is reversible.

Never launch scans, publish or revoke previews, change qualification or wave
state, create drafts, record outcomes, or delete data in a read-only production
run. Trace unsafe actions through UI state, network shape, and source instead.

If no browser automation is available, report `BLOCKED-NO-BROWSER`. Code reading
alone is not a dashboard audit.

## Run protocol

1. Inspect `git status --short` and preserve unrelated work.
2. Read only the run history plus open finding titles and statuses in
   `docs/product/dashboard-ux-audit.md`. Do not read their detailed evidence
   before the blind browser pass.
3. Record the audited commit with `git rev-parse --short HEAD` and derive the next
   run number from the ledger.
4. Build the current route and action inventory from
   `packages/interface/src/dashboard/App.tsx` and the dashboard route directory.
5. Start the interface with `pnpm run serve` and the dashboard with
   `pnpm --filter @odysseus/interface dev:dashboard`, unless current repository
   instructions supersede them. Capture server and browser console output
   throughout the run.
6. Drive the browser yourself in the main thread. Do not delegate the live
   journey, because its UI, network, log, and persistence evidence must remain in
   one trace.
7. Run the core journeys in [references/operator-journeys.md](references/operator-journeys.md).
   Add exploratory journeys based on states encountered. Do not walk every page
   mechanically at the expense of completing work.
8. After the blind pass, inspect relevant frontend, route, queue, store, and
   scanner code to explain failures and find missing states or unreachable
   capabilities. Check deliberate choices in `docs/product/dashboard-ia.md`,
   `docs/decisions/trade-offs.md`, and active plans before calling them defects.
9. Reconcile results and produce the ledger and issue handoff using
   [references/evidence-and-reporting.md](references/evidence-and-reporting.md).

Keep the run uninterrupted and unattended where possible. Make conservative
choices when optional data is missing. Ask the operator only when a secret they
must enter or a genuinely external/destructive decision prevents further safe
progress.

## Browser method

Use Playwright or the host's available browser/computer tool. Exercise normal
controls, keyboard navigation, browser back/forward, refresh, and a narrow mobile
viewport where relevant. Inspect:

- visible state before and after each action;
- request method, endpoint, status, response body, and elapsed time;
- console errors and failed requests;
- polling or live refresh behavior;
- the persisted record or artifact after the action;
- behavior after reload and in a fresh browser context;
- whether the next operator action becomes available and makes sense.

Do not count an action as successful because the click worked, a toast appeared,
the endpoint returned 2xx, or the job status became `completed`.

For every state-changing journey, establish a small proof chain:

`operator action -> accepted request -> real backend work -> persisted/artifact effect -> usable next step`

If any link is absent, delayed without honest progress, or contradicted by another
surface, record a defect. Suspiciously fast completion is a trigger to inspect job
timestamps, page counts, findings, attempts, logs, and artifacts. Zero work must
never masquerade as a completed scan.

## Critical stance

Judge the product as an operator under time pressure, not as its implementer.
Follow the natural next action without using repository knowledge to compensate
for weak discovery. Treat repeated hesitation, hunting, unexpected CLI use, and
manual cross-checking as evidence even when the task is technically possible.

Explore beyond known findings. Try realistic recovery paths, stale tabs, reloads,
double clicks, interrupted jobs, empty states, failures, and conflicting records.
Distinguish a defect from an intentional rule, but challenge intentional choices
that make the operator's job materially worse.

Breadth still matters. Cover both French and English for navigation, critical
actions, errors, and recovery text. A full run must exercise every core journey;
record exact gaps when time or missing data makes coverage partial.

## Safety and cleanup

- Never expose credentials, personal data, private contact details, raw HTML, or
  client artifacts in logs, screenshots, issues, or chat.
- Never send email. Draft creation is allowed only with an in-memory/test mailbox
  or explicit authorization, and every created draft must be listed in the final
  report.
- Never scan an unqualified or unauthorized third-party site.
- Do not delete or rewrite pre-existing data. Clean up only uniquely tagged local
  records created by this run, and only when their ownership and deletion scope
  are certain. Report anything intentionally retained.
- Stop a runaway or duplicate local job. Do not let audit automation create
  unbounded scans, model calls, drafts, or artifacts.

## Completion bar

A run is complete when every available core journey has either:

- succeeded with the full proof chain;
- failed with a minimal reproduction and corroborating evidence; or
- been named as a precise coverage gap with its blocker.

"Dashboard at UX parity" is reserved for a full local stateful run in both
languages that finds no new or regressed P1/P2 issues and verifies every older
P1/P2 as fixed. A read-only production observation or partial run cannot claim
parity.
