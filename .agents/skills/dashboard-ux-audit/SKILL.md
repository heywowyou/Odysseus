---
name: dashboard-ux-audit
description: Run the recurring UX audit of the Odysseus operator dashboard: a read-only live sweep of app.odysseusaudit.com in French and English, a code-level completeness pass, and reconciliation of the findings ledger at docs/product/dashboard-ux-audit.md, once per fix cycle until a run reports parity. Use whenever the operator asks to run the dashboard UX audit, run the next audit run, sweep the operator dashboard for UX problems, or check whether the dashboard is at UX parity. Its outputs are the updated ledger and one GitHub issue per finding; it never implements fixes.
---

# Dashboard UX audit (recurring)

You are auditing the private operator dashboard of Odysseus, a tool whose
operator runs a hotel-outreach pipeline: catalogue, qualification, quick
check (prescan), scoring, selection/wave, prospecting audit, paid full
audit, public preview, email drafts (created manually, never sent by the
tool), outcomes. A single operator uses it; some batch operations (ingest,
scoring runs) deliberately stay CLI-only.

This audit runs REPEATEDLY, once between fix cycles. Each run has two
jobs: (1) find new operator-experience shortcomings, and (2) verify which
previously recorded findings are now fixed. The goal state, reached after
several fix cycles, is a full-coverage blind sweep that produces no new
P1/P2 findings and confirms every older P1/P2 fixed. When you observe
that, say so explicitly: "dashboard at UX parity". Never claim parity on a
partial sweep.

The division of labor is strict: a run finds, audits, and files GitHub
issues; fixing happens in separate fix sessions driven by those issues;
and the next run verifies what they fixed. Do not implement code. A run
is unattended: never ask the operator questions (single exception: the
login fallback below), make the conservative choice, and stop with a
clear report when blocked. A run is a full session's work on its own;
never combine it with other repo work in the same session.

## Task-completion mode (plan 045)

The recurring sweep above never performs an action, so it cannot see a
defect that only shows up when a job is actually finished end to end
(plan 045's dead ends: confirmed fields with no reachable PDF, a
stale-findings lockout, and similar). Task-completion mode is a separate,
occasional run that DOES perform actions, to verify each core job is
actually completable from the dashboard, not merely navigable.

Trigger: the operator asks to verify plan 045's fixes, "run the
task-completion check," or run the dashboard skill in task-completion
mode explicitly - never on the recurring trigger phrases above, and never
combined with a normal sweep in the same run.

Target: the local stack by default. Before starting, read
prometheus-backend/.env-equivalent for this repo (the interface package's
own `.env` / deployment config) to confirm which MongoDB database the
local stack points at - never assume. Run the interface server and
dashboard locally (`pnpm run serve` from the repo root, plus
`pnpm --filter @odysseus/interface dev:dashboard`, per CLAUDE.md's
Testing section) and drive that instance. Only touch production when the
operator names specific records to verify there (as in plan 045's slice
1.9), and even then only those named records.

Perform each job end to end, not just to the first blocker:

- generate PDFs on an audit whose findings you have made stale by hand
  (edit the manifest's stamped `normalizationFingerprint` to a fake
  value, or use a fixture under `fixtures/test-audits/` with an old
  stamp) and confirm both PDFs render and the job's status advances;
- confirm an identity field, and confirm the report is then reachable
  (or, once slice 1.3 lands, generates automatically);
- approve and download both language reports;
- add a manual contact address (once slice 1.6 lands) and create the
  first email;
- launch a paid audit and a quick check from the hub.

Pass criterion: each job either visibly succeeds, or every control that
cannot be used shows a grey state with a stated reason - never a hidden
control and never a silent no-op. Note which of these jobs are not yet
implemented (earlier plan 045 slices not yet landed) rather than treating
that as a failure of this run.

Record failures the same way a normal run does: append to
docs/product/dashboard-ux-audit.md (or, if the operator asked for a
dedicated one-off note, docs/product/dashboard-ux-audit-2026-09-12.md)
and file a GitHub issue per genuine defect, per the issue bridge below.
If the run creates any Gmail drafts (slice 1.7's "create first email"),
list every one created in the final report so the operator can delete
them - a task-completion run must never leave a real draft behind
unaccounted for.

## Host adaptation (read first)

- Drive the browser YOURSELF, in the main thread, with whatever browser
  automation your host provides. ZCode: load the
  browser-use:control-browser skill. Claude Code, Codex, and other hosts:
  use the browser, Playwright, or computer-use tooling available in the
  session. Never delegate the live sweep to a subagent: the sweep must
  stay in one context so the flow traces stay coherent.
- You MAY delegate Pass 2 (code reading) and doc gathering to subagents
  where your host supports them; fold their findings in and verify
  anything load-bearing yourself before recording it.
- If your host has no browser automation at all, stop and report
  BLOCKED-NO-BROWSER as the run outcome. Never reconstruct a "sweep" from
  code reading alone.

## Session protocol

Work in /home/heywow/code/odysseus.

1. Run `git status --short` first. If the tree is dirty, identify the
   owner of each change from the session log and do not touch those
   files. Treat existing changes as deliberate.
2. Read docs/session/current-session.md and add a stream section for this
   run ("dashboard UX audit run N", following
   docs/agents/session-template.md). Keep it current and end it with a
   clear final status.
3. Record what you are auditing: `git rev-parse --short HEAD`. If the
   deployed site clearly behaves like a different build than HEAD, say so
   in the run header instead of guessing.
4. Derive the run number N from the ledger's run history (last run + 1).

## The ledger

The canonical ledger is docs/product/dashboard-ux-audit.md. It is the one
register that carries across runs and hosts.

Bootstrap (once, idempotently): if the canonical ledger does not exist
but dated dashboard-ux-audit-*.md files do, move the newest one to the
canonical path (plain mv if untracked, git mv if tracked), restructure it
into the register format below, assign UX-001.. UX-nnn ids in document
order, and map each finding to its GitHub issue where one exists (run 1,
2026-09-12, filed its findings as issues #180-#190). Note the migration
in the run header. Never delete register history.

Then read ONLY the run history and the open findings' titles and
statuses. Do not read the evidence details yet: your sweep must stay
blind, otherwise you will walk straight to the known findings and miss
new ones.

After the ledger, read CLAUDE.md and docs/product/dashboard-ia.md. The IA
doc is the designed intent; designed-versus-shipped deltas are findings.

Register format (keep exactly this shape so every run and host produces
a comparable ledger):

```
# Operator dashboard UX audit ledger

## Run history

| Run | Date | HEAD | New | Still open | Fixed | Regressions | Coverage | Parity |
| --- | ---- | ---- | --- | ---------- | ----- | ----------- | -------- | ------ |

## Open findings

### UX-nnn (P1) Short title
- Status: OPEN. First seen: run N. Last seen: run N.
- Where: route, page state, language.
- Evidence: visible string or DOM path; file:line at the last-seen HEAD.
- Suggested UX fix: one or two sentences, no code.
- Issue: #nnn (or "none").

## Fixed register

### UX-nnn (was P2) Short title - fixed, verified run N
- Proof: what you checked that proves it is gone.

## Deliberate register

### UX-nnn (P3, possibly deliberate) Short title
- Rationale: the reference checked.
- Re-verified run N: still holds / no longer holds.
```

Counts in the run history are per run: new findings, findings still open
at run end, findings newly fixed, regressions. Coverage is "full" or a
list of gaps. Parity is yes/no.

## Login

Log in at https://app.odysseusaudit.com with the password stored as
ODYSSEUS_DASHBOARD_PASSWORD in the repo's local .env. Never echo it: not
in chat, command output, the ledger, the report, or a commit message. If
sandboxing blocks reading .env, you may ask the operator to type the
password directly into the login form; this is the ONLY operator touch a
run may request. If neither path works, stop and report BLOCKED-LOGIN as
the run outcome.

## Pass 1 - blind live sweep (read-only, main thread)

Build the page inventory from packages/interface/src/dashboard/routes/
first, then walk EVERY page in the inventory in BOTH French and English.
Record the coverage list (page x language) in your run section.

While walking, attempt each operator job below, tracing it click by
click:

- take a qualified hotel from selection to a published preview;
- find why a specific hotel cannot be scanned;
- find the failed or stuck scans and what remedy they offer;
- get from a finished audit to its findings, its reports, and its preview;
- find every place an email draft can be created, reviewed, or followed up;
- recover from each: wrong password, unknown URL, empty list, failed
  job, expired preview.

STRICTLY read-only on production: never launch scans or audits, publish
or revoke previews, change waves, create drafts, record outcomes, or
delete anything. When you must know what an action would do, read the
code instead of clicking it.

Keep evidence textual: route, page state, language, visible string or DOM
path. Text keeps the ledger greppable across hosts and runs. Breadth over
depth; if the sweep cannot finish, record exactly which pages were
covered and mark coverage partial. Parity requires full coverage.

## Pass 2 - code-level completeness check (delegatable)

Read packages/interface/src/routes/ and
packages/interface/src/dashboard/. List every server capability and every
dashboard page, and flag:

- capabilities with no UI surface;
- UI elements that call nothing;
- API states no page renders;
- data shown with no action attached;
- actions with no stated consequence.

Before recording each flag, check docs/decisions/trade-offs.md, the IA
doc, and the numbered plans for anything that looks deliberate; mark
those findings "possibly deliberate" with the reference you checked.

## Severity

- P1: blocks or misleads the operator on a core job, or risks an
  unintended production write.
- P2: significant friction or a dead end; a workaround exists.
- P3: polish, clarity, or consistency.

## What counts as a shortcoming

Dead ends (a state with no visible next action); missing launch points
(an action only on the "wrong" page, or only in the CLI when the
dashboard is where the operator needs it); discovery failures;
flow-order mismatches; data without action; action without stated
consequence; errors and refusals that name a reason but not the remedy;
raw internal identifiers or codes where operator vocabulary belongs;
FR/EN drift; two patterns for the same kind of operation; jargon where
operator vocabulary belongs.

## Pass 3 - reconcile against the ledger

Classify every ledger entry and every fresh finding:

- NEW: not in the ledger. Assign the next free UX-nnn id.
- STILL OPEN: already recorded and the evidence still reproduces. Update
  last-seen run and re-anchor the evidence to this run's HEAD (file:line
  drifts; the live visible string is the primary evidence).
- FIXED: previously open, now verified gone. Move to the fixed register
  with the run number and the proof (what you saw live, or file:line at
  this HEAD). If the finding has an open GitHub issue, close it citing
  the run.
- REGRESSION: previously FIXED and now reproducible. Re-open the same UX
  id at P1, count it as a regression, and note what likely reintroduced
  it (the diff range since the run that verified it fixed) if
  determinable. A regression is the most expensive kind of finding.

Possibly-deliberate entries stay in the register; re-verify them each run
and note whether the recorded rationale still holds.

## GitHub issue bridge

Findings are verified defects, and the GitHub issues are the run's
primary handoff to the fix sessions; the ledger is the audit's own
memory. The repo's issue-tracker protocol (docs/agents/issue-tracker.md)
applies. File every NEW finding (P1, P2, and P3) as its own GitHub issue
(needs-triage, severity in the title), self-contained with file:line
evidence and a suggested UX-level fix, and reference the UX id in both
directions (register field and issue body). Before filing, search
existing issues for the UX id or the same root cause; never open a
duplicate. If `gh` is unavailable or fails, note that in the run header
and continue; never block the run on issue filing.

## Hard rules

- STRICTLY read-only on production. No scans, publishes, revocations,
  wave changes, drafts, outcomes, or deletes, even to "test" something.
- Never echo the dashboard password. Never scan or crawl any third-party
  site.
- Do not modify source code. The only repo files you write are the ledger
  and your session-log section (the session log is gitignored; do not try
  to commit it).
- Match the repo's writing rules in everything you write: English or
  French product strings, no em dashes or en dashes, prettier-formatted
  markdown (run prettier on the files you touch, then `pnpm run
  docs:check`).
- If login fails, the site is unreachable, or the deploy looks broken,
  stop and report that as the run's outcome (BLOCKED-LOGIN,
  SITE-UNREACHABLE, DEPLOY-BROKEN) instead of forcing the sweep. A
  blocked run changes nothing in the register except a run history row.

## Deliverable

1. Update docs/product/dashboard-ux-audit.md: one new run history row
   (run, date, HEAD, counts, coverage, parity), the register updated per
   Pass 3, and a short appended dated run section: coverage walked, jobs
   traced, status changes with evidence, anything odd observed (build
   mismatch, blocked states). Suggested fixes stay UX-level, no code.
   Keep every fact a fixer will need.
2. File the GitHub issues per the issue bridge above: one per new
   finding, plus closes (citing the run) for the issues of findings
   verified fixed this run.
3. Commit the ledger path-scoped with a conventional message, e.g.
   "Dashboard UX audit run N: x new, y fixed, z open". Do NOT push.
4. In chat, give the operator the short version, outcome first: the trend
   versus the previous run (counts), new P1s verbatim, any regressions,
   the three findings to fix next, and, when it happens, the explicit
   "dashboard at UX parity" statement. Keep it short and plain.

## Ending the loop

The loop ends when the operator stops running it or when a run reports
parity. Expect the first runs to be noisy and later ones short: a late
run walks the same inventory and checklist, re-verifies the open
findings, and usually updates only statuses.
