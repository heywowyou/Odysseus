# Cross-agent working agreement

Odysseus is maintained through Claude Code, Codex, and ZCode (added
2026-08-29). They work in the same checkout, so the repository, not any chat
transcript, is the source of truth for in-flight work.

## Sources of truth

1. `CLAUDE.md` is the shared engineering charter. Its filename is historical;
   both agents must follow it. Durable project rules, package boundaries,
   locked contracts, trade-offs, testing policy, and milestone state belong
   there or in the documents it cites.
2. `AGENTS.md` is the small Codex-specific entry point. It must link to the
   charter rather than duplicate it.
3. The focused documents under `docs/` own their subjects. Update the owning
   document when a durable decision, rule, or fact changes.
4. `docs/session/current-session.md` is an ignored, temporary crash-recovery
   log. It owns only in-flight state. It must never become the only record of
   a durable decision.
5. `docs/agents/documentation-map.md` classifies documents by authority and
   lifecycle; `docs/agents/session-template.md` defines the recovery fields.
6. `docs/agents/coding-conventions.md` defines shared formatting, linting,
   naming, testing, commenting, and product-writing conventions.

If two documents conflict, stop and identify the conflict. Do not silently
choose the newer-looking wording or make the implementation match one of
them.

## Beginning work

- Read the session log if it exists, then inspect `git status --short`.
- Treat uncommitted work as intentional. Establish whether it is complete,
  partial, or unrelated before touching it.
- Read the shared charter and the focused source documents before changing
  behaviour. Read the relevant trade-off entry before touching a protected
  area.
- Create a missing log from `docs/agents/session-template.md` before a
  multi-step edit, then put the plan and checklist there.
- Read `docs/agents/coding-conventions.md` before writing code or product copy.

## During work

- Record completed checks immediately, including negative findings and failed
  commands. State facts, commands, and outcomes; avoid vague summaries such
  as “tests look good”.
- Update the log whenever the next safe step changes. A task is not complete
  merely because code has been written.
- Do not use either model's remembered chat state as evidence. Re-check the
  workspace and source documents after a handoff or interruption.
- Keep changes within the task. Ask the user before locked-contract,
  dependency, package-boundary, legal-policy, or live-site-scan changes
  requiring their permission.
- Run Prettier after maintained-source edits. Resolve ESLint findings in code
  where possible; keep any suppression narrow and justified.

## Parking or handing off work

Before reaching a usage limit, stopping, or asking the other agent to take
over, leave the tree in the most coherent buildable state available. Update
`docs/session/current-session.md` with:

- objective and scope;
- completed and remaining checklist items;
- changed paths and whether they are staged, committed, or uncommitted;
- commands run and exact results, including tests not run;
- formatting, lint, typecheck, affected tests, and manual review status;
- known risks, blockers, and decisions needing the user's input;
- one concrete next command or edit.

Commit only coherent work when authorised by the active task. At genuine
completion, move durable information into its owning document. Delete the
session log only after the tree no longer needs its provenance. If completed
work remains uncommitted, set the log to `ready-for-commit` and leave it for
the next agent; its presence always requires reconciliation before new work.

## Maintaining this agreement

When a process rule applies to both agents, put it in `CLAUDE.md` or this
document, not in only one tool's instruction file. When a rule is specific
to Codex, put it in `AGENTS.md`; when it is specific to Claude Code, put it
in `CLAUDE.md` only if it cannot be expressed in shared language. Keep links
and file paths valid when moving documentation.
