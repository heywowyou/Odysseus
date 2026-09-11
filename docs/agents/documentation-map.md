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
   Claude Code, Codex, ZCode, and any future coding agent.
4. This map, then the focused documents for the task.

If there is no session log but the tree is dirty, do not infer ownership or
completion from the diff alone. Use history and ask the user when provenance
cannot be established safely.

## Keeping entry-point documents lean

`CLAUDE.md` and `AGENTS.md` are loaded into every session automatically,
not read on demand like the focused documents below — their size is a
per-turn cost every agent pays, every time. Both must hold only what is
actually load-bearing at that altitude: non-negotiable rules, locked
contracts, package boundaries, the one-line trade-off imperative (never its
full root-cause story), and pointers to where the rest lives. Root-cause
narrative, measured evidence, rejected alternatives, and amendment history
belong in the linked focused document (`docs/decisions/trade-offs.md`,
`docs/rules/*`, `docs/research/*`) and must not be duplicated back into
either entry point once they are there — that duplication is exactly what
made several `CLAUDE.md` trade-off entries drift long before this rule
existed (trade-offs.md#66 records the 2026-09-03 cleanup that prompted it).
`AGENTS.md` is capped at 24 KiB and
`CLAUDE.md` at the ratcheted ceiling in `scripts/check-agent-docs.mjs`;
`pnpm run docs:check` fails the build if either grows past its ceiling, so
raising it is a deliberate choice, not a side effect of an unrelated edit.

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
| `docs/product/odysseus-project-brief.md` | Product purpose, offer, architecture, end-to-end workflow, and long-term roadmap; explicit supersession notes inside it must be respected |
| `docs/decisions/trade-offs.md` | Full evidence and rejected alternatives behind the numbered charter guardrails |
| `docs/rules/normalization-rules.md` | Scanner-output normalization, dedupe, finding identity, evidence, and artifact behavior |
| `docs/rules/llm-layer-rules.md` | Model visibility, structured output, retries, guards, language, provenance, and cost gates |
| `docs/rules/obligation-basis.md` | Approved client-facing legal facts and their evidence status |
| `docs/rules/operator-obligations.md` | Odysseus's own regulatory and operating obligations |
| `docs/rules/prospect-qualification.md` | Who may be sourced, scanned, qualified, retained, and contacted |
| `docs/rules/outreach-rules.md` | What outreach and preview material may say and how it must be assembled |
| `docs/rules/offer-positioning.md` | Current pricing, scope, sales claims, and offer framing |
| `docs/report/report-design-system.md` and `docs/report/report-design-tokens.md` | Report visual language and implementation tokens; readable canonical design sources are under `docs/report/design/` |
| `docs/rules/manual-accessibility-checklist.md` | Known limits of automated accessibility detection |
| `docs/product/dashboard-ia.md` | Operator dashboard navigation map, page destinies, and operator vocabulary (plan 040) |
| `docs/adr/` and package ADR directories | Accepted architectural decisions at their documented scope |
| `docs/agents/coding-conventions.md` | Shared source formatting, lint, naming, testing, commenting, and product-writing conventions |

## Planned work and active queues

| Document | Status and use |
| --- | --- |
| `plans/README.md` and the active plans it indexes | Approved, execution-ready plans; the index owns order, status, dependencies, and rejected proposal choices. Only selected, execution-ready work lives at the `plans/` root; completed plans move to `plans/archive/` and raw findings are never stored as plans |
| GitHub issues on `heywowyou/Odysseus` | Intake for newly verified defects, requests, and decisions; resolved issues are closed with the commit and verification evidence (`docs/agents/issue-tracker.md`) |
| `docs/report/report-feedback-deferred-items.md` | Canonical queue for report work with a current reproduction or an explicit future trigger; fixed items are removed once verified |

GitHub issues may also hold specs and task state. `docs/agents/issue-tracker.md`
defines how to inspect them; never assume a local briefing is newer than its
linked issue without checking both.

## Historical and research material

- Closed report-review documents are removed after their unresolved work is
  promoted into `docs/report/report-feedback-deferred-items.md` and durable
  engineering rationale is promoted into `docs/decisions/trade-offs.md`. Git
  history retains the original review evidence.
- `docs/archive/report-v2-refactor.md` is implementation history and rationale for the
  shipped report-v2 work, not the current task queue.
- `docs/research/business-impact-statistics.md`,
  `docs/research/sector-reference-stats/`,
  `docs/research/llm-provider-alternatives.md`, and
  `docs/research/milestone-10-benchmark-cohort.md` retain vetted source
  research. Only facts promoted through the canonical legal, outreach, offer,
  or reference-stat rules may reach product output.

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
- `docs/agents/model-prompting.md`: per-host model identity, effort defaults,
  and current prompting deltas from each vendor's own guidance.

Tool availability is agent-specific. Repository descriptions of a skill, MCP
server, or launch command are not proof that the current agent has that
capability. Use the capabilities actually exposed in the active session and
preserve the same project guardrails when falling back.

After changing Markdown or agent entry points, run `pnpm docs:check`. Before
handoff, run `pnpm run check`. It verifies required entry-point files, local
Markdown links, cross-references, the lean size of `AGENTS.md`, formatting,
lint, workspace types, and the ignored status of the live session log.
