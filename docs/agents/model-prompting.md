# Per-host model prompting guidance

This file contains only host-specific deltas. The shared behavior contract is
`CLAUDE.md` / `AGENTS.md`: default to action for local reversible work, keep
operator conversation concise, and ask only for genuine destructive,
external, secret, or unresolved product decisions.

Do not copy a host's quirks into project policy.

## Claude Code

Claude benefits from a small, explicit project contract and focused context.

- Prefer direct execution once the requested outcome is clear.
- Do not add extra permission questions for protected files, dependencies, or
  package boundaries; the shared charter already defines the boundary.
- Keep replies concise and outcome-first. Put technical depth in code, tests,
  plans, or focused docs rather than chat unless the operator asks.
- Load specialist skills only when their workflow actually matches the task.
  Read-only audits and heavyweight design modes are explicit-only.
- Use subagents for genuinely independent work that saves time or isolates a
  large investigation. Do not delegate merely to create a verification ritual.
- Control difficult work with model/effort settings rather than expanding the
  repository prompt.

Re-check Anthropic's current model guidance after a model upgrade before
changing these defaults.

## Codex / GPT-5.6

Use outcome-first prompts and let the model choose the implementation steps.

- Local reversible edits and validation proceed without confirmation.
- Parallelize independent reads; keep dependent writes sequential.
- Use medium effort as a normal baseline and higher effort when the task
  genuinely benefits from deeper reasoning.
- Avoid redundant "double-check everything" scaffolding when tests and targeted
  verification already prove the change.
- Keep `AGENTS.md` short. Focused docs carry domain depth.

## ZCode / GLM

State the goal, relevant working area, tools, and success criteria explicitly
for long agentic tasks.

- Subagents are optional accelerators, not a default quota. Use them when work
  is truly independent and integration cost is low.
- Do not fan out tiny tasks or delegate only to produce extra reviews.
- Preserve the same autonomy boundary and concise operator interaction as the
  other hosts.
- Prefer a clear main-thread owner for decisions and integration.

Re-check Z.ai's current model guidance after a model upgrade before tuning
reasoning or sampling defaults.

## Third-party documentation tools

**Context7 (issue #259, evaluated, no repo-wide adoption).** A fixed
version-tied corpus (Next.js 16, React 19.2, the OpenAI SDK, Mongoose 9,
Playwright, Lighthouse) was queried against Context7 and compared with
official docs / source. Findings:

- Real value on fast-moving or source-level questions where it retrieved the
  exact official migration text: Mongoose 9's dropped-callback and stricter
  query-filter typing (`docs/migrating_to_9.md`) and React 19.2's
  `useEffectEvent` internals both came back precisely correct and directly
  cited.
- No indexed Node/TypeScript OpenAI SDK — only the Python SDK and generic
  API-reference sites are available. That is exactly the package
  `packages/llm` depends on, so Context7 offered no advantage there over the
  SDK's own TypeScript types and official docs.
- Version matching is approximate, not exact, for the other libraries (e.g.
  Playwright resolved to v1.61.0 against this repo's pinned 1.62.1, Next.js
  to v16.2.9 against 16.3.3). Answers were still correct in the cases tested,
  but a real version-specific regression would not be guaranteed to surface.
- Not configured in `.codex/config.toml` or any other repository tooling —
  it is available ambiently only inside a Claude Code session that already
  has the MCP server enabled at the host level, not something this repo
  currently sets up for any agent.

Decision: do not add a permanent Context7 MCP server or project skill
wrapper. The incremental value over primary official-documentation
browsing/tooling is real but inconsistent across the libraries this repo
depends on, and does not clear the bar for adding new external tool surface.
Where a Claude Code session already has it available, it remains a
reasonable ad hoc choice for fast-moving or source-level questions on
public libraries only — never for private repository, client, or `.env`
content, per the issue's scope boundary.

## Product model layer

The product's own LLM configuration is a separate system governed by
`docs/rules/llm-layer-rules.md` and the relevant trade-offs. Host prompting
changes never silently alter the model used to generate client-facing
analysis.
