# Operator journeys

Select records that can safely reach each starting state. Run journeys in French
first, then repeat the critical action, feedback, error, and recovery points in
English. Vary records and order between runs so the audit does not become a fixed
script blind to new problems.

## 1. Prospect decision and correction

- Find an unevaluated or rejected prospect without using a raw identifier.
- Understand why it is in its current state.
- Change it to qualified/accepted from the dashboard when product rules permit.
- Reload and confirm the decision, provenance, available actions, list filters,
  counts, and pipeline state agree.
- Reverse or correct a mistaken operator decision if the product promises that
  capability. If reversal is intentionally forbidden, verify the reason and
  recovery route are explicit before the first change.

This journey must directly test the transition the operator reported as broken:
not-qualified to qualified. Verify the route accepts it, persistence changes, and
the next scan action becomes reachable. A badge change alone is insufficient.

## 2. Quick check

- Launch a quick check from the prospect page.
- Confirm the UI prevents accidental duplicate launches and shows honest progress.
- Verify the queue accepted the intended prospect/domain and the worker actually
  visited the fixture page.
- Correlate browser feedback with server logs, job timestamps, attempts, visited
  page count, scanner output, stored score/evidence, and expected artifacts.
- Reload during the run and after completion. Confirm the prospect, job detail,
  lists, and next action agree.
- Exercise one refused and one failed launch. The dashboard must explain why and
  provide a usable recovery action.

A quick check completing in only a few seconds is not automatically wrong, but it
requires proof that scanning occurred. `completed` with no page visit, no expected
result, or unchanged downstream state is a P1 misleading-success defect.

## 3. Prospecting audit

- From an eligible qualified prospect, launch the full prospecting audit.
- Follow progress through refresh and navigation away/back.
- Verify real work, persisted findings, terminal status, and linkage to the
  prospect.
- Open the audit, findings, reports, and prospect hub without copying identifiers.
- Verify failed, stuck, refused, and retry states each expose a safe remedy.

## 4. Preview and first email

- Move a completed eligible audit to a preview using only dashboard controls.
- Verify preview status, expiry, public/operator artifacts, and behavior after
  refresh or a fresh browser context.
- With a test mailbox only, create the first draft, review it, and confirm the
  prospect and work queues agree.
- Verify the dashboard never sends mail and makes draft consequences clear.

## 5. Paid report

- From a completed paid audit, resolve required identity fields.
- Prepare report details, write/analyze, choose the version, generate both PDFs,
  and approve both languages in the intended order.
- Prove each artifact exists, is current, opens, and corresponds to the selected
  analysis.
- Exercise stale provenance, missing fields, generation failure, and retry. A
  disabled action must state why and how to unblock it.

## 6. Outreach follow-through

- Find a draft needing review, a due follow-up, and a received reply from the work
  queue.
- Complete review, follow-up preparation, reply review, and outcome recording with
  a test mailbox/record.
- Confirm counts, thread state, prospect state, and result history converge after
  reload.
- Verify suppression/opt-out is understandable and prevents later outreach.

## 7. Recovery and navigation

- Wrong password, expired session, unknown URL, empty list, slow request, server
  error, failed job, stale tab, and expired preview.
- Keyboard-only completion of the primary actions and dialogs.
- Narrow viewport for the work queue, prospect hub, scan progress, and audit.
- Back/forward and direct-link entry into active and completed work.

For every recovery state, the operator should know what happened, whether anything
was changed, and the next safe action.

## Exploratory pass

After the core journeys, follow confusing counts, mismatched labels, unexpected
states, controls that appear at odd times, and anything that made you inspect code
to know what to do. Compare dashboard capabilities with server routes to find
missing UI surfaces, unrendered API states, and controls that call nothing.
