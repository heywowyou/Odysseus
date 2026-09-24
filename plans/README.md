# Plans index

The single index of approved, execution-ready plans. An active plan is a
numbered file in this directory with a row in the table below; a finished or
frozen plan moves to [`archive/`](archive/) with its verification record.
Status cells stay one sentence plus a link, and `pnpm run docs:check` enforces
a size ceiling on this file.

Earlier indexes are kept as history, not as binding decisions:
[plans 001 to 076](archive/plans-001-076-index-history.md) and
[milestone 9c](archive/9c-plans-index-history.md).

## Active plans

| Plan | Title | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- |

No plan is active. Verified findings waiting to be planned are GitHub issues.

Status values: `TODO`, `IN PROGRESS`, `IMPLEMENTED`, `DONE`,
`BLOCKED: <reason>`, `FROZEN` (parked backlog, file under `archive/`,
contract unchanged), or `REJECTED: <reason>`. `IMPLEMENTED` means every done
criterion is met and the suite is green, but a verification step still needs a
person, typically a post-deploy rehearsal or a first read against a live
operator-named site.

## Plan closure standard

Every active/root plan is a quality contract, not merely design prose. A plan
must not be marked implemented/done because an implementation can be
interpreted as satisfying an adjective such as "strongest", "bounded",
"truthful", "clear", "safe", "responsive", "durable", or "accessible".

For every binding requirement, the plan's closure evidence must identify:

1. the concrete implementation owner/seam;
2. the exact persisted/API/type/config artifact that embodies the requirement;
3. a machine-verifiable test, invariant, budget, or fault fixture where the
   requirement is mechanically testable;
4. a named manual acceptance record only for properties that genuinely require
   human judgment;
5. the provenance/version of external models, tools, browsers, renderers, or
   security profiles that materially affect the result.

Each active plan must maintain a requirement-to-proof closure ledger (inline or
in a named canonical document). **No binding row may be blank, mapped only to
"code review", or closed by prose interpretation.** Unknown/unproven means the
plan remains open.

When a requirement says "best/strongest/fast/bounded/complete/safe" or similar,
the plan must also name the comparison set or numeric/structural acceptance
criterion. When a requirement names a role or state, the implementation must
have an exhaustive typed registry/inventory and a test proving there is no
silent default/fallback path.

A later implementation discovery that exposes a missing proof reopens the
owning plan as a completion defect; it is not automatically deferred to a new
plan number.

## Work lifecycle

Each kind of work has exactly one home:

1. GitHub issues (on `heywowyou/Odysseus`, via `gh`) are the intake for a
   newly verified defect, request, or decision. See
   `docs/agents/issue-tracker.md`.
2. A numbered file under `plans/` is an approved, execution-ready plan.
   A raw finding is never stored here as if it were a plan. A finished plan
   moves to `plans/archive/` with its verification record.
3. `docs/report/report-feedback-deferred-items.md` holds only report work
   with a current reproduction or an explicit future trigger. Fixed items
   are removed once verified; Git history retains the evidence.
4. Durable shipped rationale moves to the owning canonical document or
   `docs/decisions/trade-offs.md`. Closed evidence stays in Git and issue
   history.
5. The active session log (`docs/session/current-session.md`, gitignored)
   holds only in-flight recovery state and never becomes a backlog.
