# Documentation map

This map tells any coding agent which Odysseus documents are authoritative,
which are active work queues, and which are retained only as history or
research. It prevents a plausible-looking old plan from silently overriding a
newer product or engineering decision.

## Start here

For repository work, read in this order:

1. `docs/session/current-session.md`, if present. It is the live handoff.
2. `git status --short`. Reconcile the tree with the handoff before editing.
3. `CLAUDE.md`. Despite its filename, this is the shared project charter for
   Claude Code, Codex, and any future coding agent.
4. This map, then the focused documents for the task.

If there is no session log but the tree is dirty, do not infer ownership or
completion from the diff alone. Use history and ask the user when provenance
cannot be established safely.

## Authority and conflicts

The current charter and focused canonical document govern intent. The code and
tests show what is actually shipped. If they disagree, report the mismatch;
do not silently rewrite either side to match the other.

Within documentation, explicit supersession notes win. Dates alone do not.
Historical rationale remains useful, but never restores a decision that a
canonical document says was superseded.

## Canonical project documents

| Document | Owns |
| --- | --- |
| `CLAUDE.md` | Non-negotiable rules, locked contracts, package boundaries, compact trade-off index, testing policy, and current milestone order |
| `docs/odysseus-project-brief-v2.md` | Product purpose, offer, architecture, end-to-end workflow, and long-term roadmap; explicit supersession notes inside it must be respected |
| `docs/decisions/trade-offs.md` | Full evidence and rejected alternatives behind the numbered charter guardrails |
| `docs/normalization-rules.md` | Scanner-output normalization, dedupe, finding identity, evidence, and artifact behavior |
| `docs/llm-layer-rules.md` | Model visibility, structured output, retries, guards, language, provenance, and cost gates |
| `docs/obligation-basis.md` | Approved client-facing legal facts and their evidence status |
| `docs/operator-obligations.md` | Odysseus's own regulatory and operating obligations |
| `docs/prospect-qualification.md` | Who may be sourced, scanned, qualified, retained, and contacted |
| `docs/outreach-rules.md` | What outreach and preview material may say and how it must be assembled |
| `docs/offer-positioning.md` | Current pricing, scope, sales claims, and offer framing |
| `docs/report-design-system.md` and `docs/report-design-tokens.md` | Report visual language and implementation tokens; canonical mockups remain under `docs/mockups/` |
| `docs/manual-accessibility-checklist.md` | Known limits of automated accessibility detection |
| `docs/adr/` and package ADR directories | Accepted architectural decisions at their documented scope |
| `docs/agents/coding-conventions.md` | Shared source formatting, lint, naming, testing, commenting, and product-writing conventions |

## Planned work and active queues

| Document | Status and use |
| --- | --- |
| `docs/m9-prospecting-pipeline.md` | Reconciled design for later milestone 9c; not authority to skip the charter's queued 9b.5 milestone |
| `docs/m9-technical-spec.md` | Companion 9c technical design; reconcile proposed shapes against shipped 9a/9b code before implementation |
| `plans/findings.md` | Maintenance backlog generated against the commit named in its header; some entries are intentionally unverified. Re-check every item against current HEAD before acting. Its presence does not make it the active session or override milestone order |
| `docs/report/2026-08-24-lagnonu-feedback.md` | Current dated report-review record until its items are fixed or moved into the deferred queue |
| `docs/report/report-feedback-deferred-items.md` | Canonical queue for report-review items deliberately deferred |
| `docs/next-session-outreach-preview-prompt.md` | Deferred 9c briefing retained for useful constraints. It is not the current handoff and must not be treated as “next” while 9b.5 remains queued first |

GitHub issues may also hold specs and task state. `docs/agents/issue-tracker.md`
defines how to inspect them; never assume a local briefing is newer than its
linked issue without checking both.

## Historical and research material

- `docs/milestone-8-scope-addendum.md` is a mixed historical record. Its
  automated-check scope remains useful, but its paid-tier model is explicitly
  superseded.
- `docs/report/archive/` contains closed review evidence. Do not use an
  archived request as an active task.
- `docs/report-v2-refactor.md` is implementation history and rationale for the
  shipped report-v2 work, not the current task queue.
- `docs/research/` contains source research. Only facts promoted through the
  canonical legal, outreach, offer, or reference-stat rules may reach product
  output.

## Agent and workflow documents

- `AGENTS.md`: Codex entry point only.
- `docs/agents/handoff.md`: shared handoff and recovery protocol.
- `docs/agents/session-template.md`: required structure for a new live session
  log.
- `docs/agents/coding-conventions.md`: shared coding and writing system enforced
  by repository tooling and review.
- `docs/agents/domain.md`: domain glossary and ADR conventions.
- `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`: GitHub
  workflow.

Tool availability is agent-specific. Repository descriptions of a skill, MCP
server, or launch command are not proof that the current agent has that
capability. Use the capabilities actually exposed in the active session and
preserve the same project guardrails when falling back.

After changing Markdown or agent entry points, run `pnpm docs:check`. Before
handoff, run `pnpm run check`. It verifies required entry-point files, local
Markdown links, cross-references, the lean size of `AGENTS.md`, formatting,
lint, workspace types, and the ignored status of the live session log.
