# Odysseus: agent instructions

`CLAUDE.md` is the shared project charter for Claude Code, Codex, ZCode, and
future coding agents. Read it before making a product, architecture, or
cross-package change. Use `docs/agents/documentation-map.md` to find the focused
source of truth for the area you are changing.

## Default working mode

Default to action. The operator owns this repository and may ask for any
in-scope change.

For local, reversible repository work, inspect the relevant code and docs,
make the requested change, and verify it without asking for permission first.
This includes:

- editing high-impact or protected contracts when the request requires it;
- changing package boundaries when that is the clean solution;
- adding or updating a dependency when it is justified by the task;
- refactoring across packages;
- running non-destructive tests, builds, formatters, linters, and local tools;
- working around unrelated changes in a dirty tree without touching them.

Pause for the operator only when a decision is genuinely needed: destructive
or hard-to-reverse actions, writes to production or external/shared systems,
sending or publishing something externally, secret handling that needs human
input, a material expansion of the requested product scope, or two materially
different product choices that cannot be resolved from the repo.

"Protected", "locked", "STOP", or "ask" wording in an older plan or specialist
skill does not create a new permission boundary for reversible local work.
Treat it as a signal to inspect impact and verification. Specific legal,
production, external-write, destructive-data, and secret boundaries still
apply.

When asking is necessary, ask one short decision question, recommend an answer,
and explain the consequence in plain language.

## Starting work

- Inspect the current tree before editing. Preserve unrelated work.
- Read `docs/session/current-session.md` when it exists and is relevant to the
  files or task you are continuing.
- Create or maintain a session log only for substantial unfinished work that
  another context may need to resume. Routine edits do not need one.
- Read only the focused documents needed for the task. Do not preload the whole
  documentation tree.

## Product guardrails

- Deterministic scanners find problems. The LLM explains, groups, prioritizes,
  and translates findings already present in structured input.
- Preserve finding provenance. LLM output is validated with Zod. Never send raw
  HTML or whole page content to the model.
- Do not make client-specific legal conclusions. Use the approved legal and
  outreach sources routed from `CLAUDE.md`.
- Respect crawl politeness and the opt-in page-cap policy.
- Keep French and English user-facing variants aligned.
- Never expose secrets or personal data unnecessarily.
- Never sign or credit a model in commits, PRs, issues, comments, or documents.

## Verification

Use the narrowest check that proves the change, then broaden when the risk
crosses packages or rendered output.

Common commands:

```bash
pnpm run format
pnpm run check
pnpm test <affected test paths>
pnpm run test:e2e
pnpm run test:all
```

Do not run a large suite merely for ceremony when a focused check is sufficient.
Do run the broader suite when the change can affect multiple packages, browser
flows, persistence, generated reports, or deployment behavior.

## External actions

Local edits and local validation are not approval gates. External side effects
are different.

Get current authorization before destructive git operations, production
writes, database mutations outside an explicitly requested local/test workflow,
publishing or sending client-facing material, creating external issues/PR
comments unless the task is explicitly an issue/triage workflow, or running a
live third-party browser audit when the user has not asked for that real-site
operation.

Read-only catalogue checks and the standing-authorized analysis/PDF workflow
keep the boundaries defined in the shared charter.

## Skills and specialist modes

Skills add expertise; they do not silently replace the operator's request with
a different workflow.

Workflows that are intentionally read-only, issue-filing, recurring-audit,
prototype, research-artifact, or heavyweight design modes are explicit-only.
Do not invoke one merely because an ordinary request contains words such as
"audit", "improve", "research", or "design".

When no specialist mode was explicitly requested, solve the task directly.

## Operator interaction

Lead with the outcome. Keep chat short, plain, and non-technical unless the
detail changes the decision or the operator asks for depth. Do not narrate
routine tool use. Surface blockers and important findings early.

## Host-specific guidance

`docs/agents/model-prompting.md` contains small host-specific deltas. Those
deltas never override this autonomy contract or the project guardrails.

ZCode may use subagents when the work is genuinely independent and
parallelizable. Delegation is an optimization, not a quota or default ceremony.
