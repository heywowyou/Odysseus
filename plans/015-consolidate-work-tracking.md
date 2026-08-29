# Plan 015: Make plans and issue lifecycle unambiguous

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. This plan moves itself from `advisor-plans/` to
> `plans/`; after the move, update its status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 24350ca..HEAD -- AGENTS.md CLAUDE.md README.md advisor-plans plans docs/agents/documentation-map.md docs/odysseus-project-brief-v2.md docs/decisions/trade-offs.md docs/report/report-feedback-deferred-items.md scripts/check-agent-docs.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" facts against the live files before proceeding. A semantic
> mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `24350ca`, 2026-08-29

## Why this matters

The repository currently puts executable plans in `advisor-plans/`, while the
root `plans/` directory contains only an empty codebase-findings ledger and a
stale report-review ledger. New work therefore has two plausible homes, fixed
findings remain mixed with active work, and canonical documents disagree about
which plan is next. After this plan, `plans/` means executable plans only,
GitHub issues are the intake for newly verified defects, and the existing
report deferred-items document owns report problems that require a future
trigger.

## Current state

- `advisor-plans/README.md:328-345` owns the milestone 9c execution table. It
  records plans 001 through 008 and 010 as `DONE`, plan 009 as `IMPLEMENTED`,
  and plan 011 as the next `TODO`.
- `CLAUDE.md:770` still names `plans/findings.md` as a maintenance queue, and
  `CLAUDE.md:791-810` duplicates stale milestone status by saying plan 010 is
  next.
- `plans/findings.md:1-17` says no actionable finding remains. It exists only
  to redirect report review to another file.
- `plans/report-findings.md:75-95` retains fixed rows and says RF-01 and RF-07
  through RF-17 need regeneration. New bilingual reports rendered on
  2026-08-29 at commit `222a3bc` exist under the saved Haaitza audit and close
  that verification debt. RF-10 alone remains a monitor item.
- `docs/report/report-feedback-deferred-items.md:1-10` already declares itself
  the current report-maintenance queue and says it accepts only open work or
  work with an explicit future trigger.
- `docs/agents/documentation-map.md:55-58` classifies the executable advisor
  plans and `plans/findings.md`, but does not classify
  `plans/report-findings.md`.
- `docs/agents/issue-tracker.md` already makes GitHub issues on
  `heywowyou/Odysseus` the repository issue tracker.
- `advisor-plans/README.md:401-403` and plans 011 and 012 preserve a resolved
  clean-checkout fixture exception even though `plans/findings.md` says current
  code and tests resolved it.

Applicable conventions:

- `docs/agents/documentation-map.md` owns document authority and lifecycle.
- `docs/agents/coding-conventions.md` says to update the document that owns a
  durable fact and not create a second summary.
- Closed report-review evidence remains recoverable from Git history. Durable
  decisions belong in `docs/decisions/trade-offs.md`.
- Do not edit `docs/session/current-session.md`; it belongs to the active ZCode
  implementation session and contains historical path references for recovery.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Find references | `rg -n 'advisor-plans|plans/findings|plans/report-findings|report-findings' --glob '!docs/session/current-session.md' .` | only references being deliberately migrated |
| Docs validation | `pnpm run docs:check` | exit 0 |
| Repository validation | `pnpm run check` | exit 0 |
| Final path check | `test ! -e advisor-plans && test ! -e plans/findings.md && test ! -e plans/report-findings.md` | exit 0 |

## Scope

**In scope**:

- `advisor-plans/` and `plans/`
- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/agents/documentation-map.md`
- `docs/odysseus-project-brief-v2.md`
- `docs/decisions/trade-offs.md`
- `docs/report/report-feedback-deferred-items.md`
- `scripts/check-agent-docs.mjs`

**Out of scope**:

- All application source under `packages/`
- `docs/session/current-session.md` and every path owned by its active session
- GitHub issue creation. This plan defines intake but does not publish issues
- Reopening RF-01 through RF-09 or RF-11 through RF-17 without a defect in the
  2026-08-29 regenerated pair
- Implementing RF-10 before a current report reaches its recorded trigger

## Git workflow

- Work directly on `main`, matching the operator's current milestone workflow.
- Preserve all unrelated dirty-tree changes.
- Use one documentation commit after every verification gate passes. Match the
  repository's imperative commit style, for example `Freeze the outreach output contract`.
- Do not push or open a pull request unless the operator separately asks.

## Steps

### Step 1: Reconcile the report review before removing its ledger

Read the saved 2026-08-29 French and English Haaitza reports and their
provenance sidecars. Confirm RF-01, RF-07 through RF-09, and RF-11 through
RF-17 against the regenerated pair. Record only RF-10 in
`docs/report/report-feedback-deferred-items.md`, under a heading that states
its trigger: a current normalized report must reproduce overlapping Lighthouse
legacy and successor audit families before normalization changes.

Do not copy the historical 571-line review into another file. Its evidence
stays in Git history and durable shipped decisions already live in trade-off
44.

**Verify**:
`rg -n 'Lighthouse.*successor|legacy.*successor' docs/report/report-feedback-deferred-items.md`
must return the new monitored item and its reproduction trigger.

### Step 2: Make `plans/` contain plans only

Delete the now-empty `plans/findings.md` and the reconciled
`plans/report-findings.md`. Move `advisor-plans/README.md` and every numbered
plan, including this file, into `plans/` with `git mv`. Do not renumber the
plans. After the move, there must be one plan index at `plans/README.md` and no
`advisor-plans/` directory.

In the index, mark plan 009 `DONE` because its deployment and synthetic check
are already recorded as complete in trade-off 43. Keep plan 010 `DONE` and
plan 011 as the next `TODO`. Add plan 015 to the table and mark it `IN PROGRESS`
until all steps pass.

**Verify**:
`find plans -maxdepth 1 -type f -printf '%f\n' | sort`
must list `README.md` and numbered plan files only.

### Step 3: Define one lifecycle and update every live reference

Update `docs/agents/documentation-map.md` and the plan index with these exact
roles:

1. GitHub issues are intake for a newly verified defect, request, or decision.
2. A numbered file under `plans/` is an approved, execution-ready plan. A raw
   finding is never stored there as if it were a plan.
3. `docs/report/report-feedback-deferred-items.md` holds only report work with
   a current reproduction or explicit future trigger. Fixed items are removed.
4. Durable shipped rationale moves to the owning canonical document or
   trade-off. Closed evidence stays in Git and issue history.
5. The active session log holds only in-flight recovery state and never becomes
   a backlog.

Replace live `advisor-plans/...` references with `plans/...`. Remove current
references to the deleted finding ledgers. In `CLAUDE.md` and the project brief,
replace duplicated per-plan status prose with a pointer to `plans/README.md`;
retain durable milestone decisions and measured facts. Correct the stale bot
page/deployment prerequisite in the brief.

Do not rewrite historical prose merely because it contains an old directory
name when the path is clearly part of a past command or provenance statement.
Update it only when a reader is expected to follow the path now.

**Verify**:
`rg -n 'advisor-plans|plans/findings|plans/report-findings|report-findings' --glob '!docs/session/current-session.md' .`
must return no live-path references.

### Step 4: Remove the resolved fixture exception

Delete the clean-checkout fixture exception from the plan index and plans 011
and 012. The expected baseline is now simply that `pnpm run test` passes. A
future failure must be reproduced and recorded as a new issue rather than
pre-excused by deleted history.

**Verify**:
`rg -n 'fixture-baseline|clean checkout lacks|pre-existing full-suite failure' plans`
must return no matches.

### Step 5: Guard the document topology

Extend `scripts/check-agent-docs.mjs` with narrow checks that fail when:

- `advisor-plans/` exists;
- `plans/findings.md` or `plans/report-findings.md` exists;
- maintained Markdown outside the ignored current-session log contains a live
  `advisor-plans/` reference;
- `plans/README.md` is missing.

Do not make the checker parse plan statuses or infer product state. The point is
to prevent the old topology from returning, not create a second status owner.

**Verify**: `pnpm run docs:check` exits 0 and names no broken local links.

### Step 6: Validate and close the plan

Run the documentation and repository checks. Inspect `git status --short` and
confirm that every changed path is in scope or belongs to the preserved active
ZCode session. Mark plan 015 `DONE` in `plans/README.md` only after both checks
pass.

**Verify**:

- `pnpm run docs:check` exits 0.
- `pnpm run check` exits 0.
- `test ! -e advisor-plans && test ! -e plans/findings.md && test ! -e plans/report-findings.md` exits 0.
- `git diff --check` exits 0.

## Test plan

- Extend the existing self-checking behavior in `scripts/check-agent-docs.mjs`;
  do not add a new test framework for documentation topology.
- Temporarily recreate one banned condition at a time only if it can be done
  without touching active-session files, confirm `pnpm run docs:check` fails,
  then remove the temporary condition. Never leave temporary files in the tree.
- Run `pnpm run docs:check` and `pnpm run check` after the final topology is in
  place.

## Done criteria

- [ ] `plans/` contains only `README.md` and numbered executable plans.
- [ ] `advisor-plans/`, `plans/findings.md`, and `plans/report-findings.md` do not exist.
- [ ] RF-10's monitored trigger exists once in the canonical report deferred queue.
- [ ] GitHub issues, numbered plans, deferred report items, durable decisions,
      and session recovery state each have one documented role.
- [ ] Plan 009 is `DONE`, plan 010 remains `DONE`, and plan 011 is the next product `TODO`.
- [ ] The resolved fixture-baseline exception is absent from executable plans.
- [ ] `pnpm run docs:check`, `pnpm run check`, and `git diff --check` exit 0.
- [ ] Plan 015 is marked `DONE` in `plans/README.md`.

## STOP conditions

Stop and report if:

- The active ZCode session has begun editing any in-scope documentation path.
- The regenerated bilingual reports reproduce any RF item currently described
  as fixed; preserve that item as active instead of deleting its evidence.
- RF-10 has reproduced in a current report; it needs an implementation plan,
  not a monitor entry.
- Moving the plan directory requires changing package boundaries, dependencies,
  persisted contracts, or application behavior.
- Any verification command fails twice after correcting an in-scope mistake.

## Maintenance notes

Future `/improve` runs should present vetted findings for selection. Only
selected work becomes a numbered plan; rejected findings belong in the plan
index's considered-and-rejected section, and actionable defects that are not
being planned immediately belong in GitHub issues. A report review should not
leave a permanent second backlog behind after its open items have been promoted
or closed.
