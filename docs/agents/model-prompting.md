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

**Context7 (issue #259, adopted as an optional project MCP).** The original
evaluation found uneven version coverage, but the repository now registers the
official Context7 MCP server in `.mcp.json` with `alwaysLoad: false`. It is
an opt-in documentation helper, not an authority.

Use it for public third-party library/API documentation when exact current docs
would materially help. Keep these limits:

- prefer primary official documentation/source when the answer is
  version-sensitive or security-critical;
- do not send private repository content, client evidence, report prose,
  credentials, `.env` data, or production records to Context7;
- a Context7 answer never overrides the repository's pinned package types,
  tests, changelogs, or official upstream docs;
- because library indexing can lag the exact pinned version, verify any
  migration/breaking-change claim against the pinned release before editing;
- the MCP remains disabled by default for agent startup so it adds no ambient
  latency or external dependency to ordinary work.

The server is invoked through the official `@upstash/context7-mcp` package.
An API key may be configured at the host level for higher limits, but no key is
stored in the repository.

## Product model layer

The product's own LLM configuration is a separate system governed by
`docs/rules/llm-layer-rules.md` and the relevant trade-offs. Host prompting
changes never silently alter the model used to generate client-facing
analysis.
