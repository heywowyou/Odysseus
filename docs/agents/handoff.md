# Cross-agent handoff and recovery

Odysseus may be worked on by Claude Code, Codex, ZCode, and human sessions.
The repository is the source of truth for durable work. A session log exists
only to make substantial unfinished work recoverable.

## When a session log is warranted

Use `docs/session/current-session.md` when work is likely to be handed to
another context before it is complete, when several agents are sharing one
checkout, or when a large uncommitted tree would be expensive to reconstruct.

Routine edits, short fixes, reviews, and completed work do not need a session
log.

Start from `docs/agents/session-template.md` when a log is needed. The file is
gitignored and temporary.

## Beginning or resuming work

- Inspect `git status --short`.
- Read the session log when it exists and touches the work you are continuing.
- Treat unrelated changes as deliberate and preserve them.
- If provenance is unclear, use the diff, history, and the log to reconstruct
  it. Ask the operator only when the requested change overlaps unknown work in
  a way that cannot be safely separated.
- Read `CLAUDE.md` / `AGENTS.md`, then the focused canonical docs for the task.

A dirty tree is not a reason to stop. Work around unrelated changes.

## During substantial unfinished work

Keep the recovery log factual enough that a fresh context can continue:

- objective and current scope;
- completed and remaining steps;
- changed paths and ownership of pre-existing changes;
- important decisions or discoveries;
- verification already run and exact failures that matter;
- blockers or risks;
- one concrete next action.

Do not turn the log into a second product specification or duplicate durable
rules there. Move durable decisions to the document that owns them.

## Autonomy during handoffs

The normal project contract still applies during recovery.

Local, reversible edits and non-destructive validation proceed without an
approval ritual. Protected contracts, dependencies, and package boundaries
require impact analysis, not automatic permission prompts.

Pause only for destructive or hard-to-reverse actions, production/external
writes, secret input, a material scope expansion, or a product decision that
the repo cannot resolve.

Old plan language such as `STOP`, `locked`, or `ask first` is interpreted
through this current boundary unless it protects one of those genuine external
or irreversible cases.

## Parking work

When unfinished work must be handed off:

- leave the tree in the most coherent state available;
- update the recovery log with the exact state and next step;
- record tests/checks actually run and failures still open;
- do not overwrite or fold unrelated work;
- commit only when the active task or operator requested a commit.

If work is complete and the tree no longer needs recovery provenance, remove
the session log. If completed work intentionally remains uncommitted and
another context must pick it up, mark the log `ready-for-commit`.

The purpose is recovery, not bookkeeping.
