# Issue tracker: GitHub

GitHub issues are the work-tracking surface when the operator asks to use them
or an explicitly invoked audit/triage workflow defines issues as its output.
Routine coding work does not create, comment on, label, or close issues merely
because a defect was found.

Use `gh` or the host's GitHub tooling when issue work is part of the task.

## Before writing externally

Creating or changing an issue is an external shared-system write. It is
authorized when:

- the operator explicitly asked to create/update/triage issues;
- the active task is an explicitly invoked workflow whose stated deliverable
  is issue tracking;
- the operator already authorized that concrete external-write workflow.

Otherwise, keep the finding in the current work/report and offer issue creation
rather than doing it silently.

## Conventions

When issues are in scope:

- Search before creating to avoid duplicates.
- One verified root cause per issue.
- Include enough evidence for a fresh context: observable problem, relevant
  paths, reproduction/verification evidence, user impact, and a suggested fix
  direction.
- Do not reproduce secrets, credentials, personal data, or sensitive client
  material.
- Reference the issue from a fixing commit or plan when useful.
- Close only after the fix is committed and verified; include the verification
  evidence when practical.
- Use `docs/agents/triage-labels.md` for label vocabulary.

A finding fixed in the current task does not need an issue just to satisfy
process.

## Pull requests

External PRs are not a general request surface for this repo unless the
operator explicitly chooses to use them that way.

When PR review/triage is requested, inspect the PR, its diff, and relevant
discussion, then use the same evidence and external-write rules above.

## Wayfinder and specialist workflows

Skills such as `triage`, `to-tickets`, and `wayfinder` may define richer issue
state machines. Those skills are explicit-only. Their workflow applies after
the operator invokes it; it does not become the default lifecycle for ordinary
repo work.

## Tool availability

Prefer the GitHub capability exposed by the active host. A documented `gh`
command is an example, not proof that a shell or authenticated CLI exists in
the current session.
