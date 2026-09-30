# Documentation map

This map tells coding agents which Odysseus documents are authoritative and
when to read them. The goal is high signal: load the smallest amount of
context that can safely answer the task.

## Start here

For repository work:

1. Inspect the working tree before editing.
2. Read `docs/session/current-session.md` only when it exists and is relevant
   to work you are continuing.
3. Read the host entry point (`CLAUDE.md` for Claude Code, `AGENTS.md` for
   Codex/ZCode). Both implement the same autonomy contract.
4. Read this map, then only the focused documents that own the requested work.

A dirty tree is not itself a blocker. Preserve unrelated changes and continue
around them. Ask only when the requested edit materially overlaps changes whose
intent cannot be reconstructed safely.

## Keeping entry points lean

`CLAUDE.md` and `AGENTS.md` are high-frequency context. They hold only:

- the local/reversible versus external/destructive autonomy boundary;
- non-negotiable product invariants;
- protected-contract semantics;
- package roles and the highest-value cross-cutting guardrails;
- routing to focused documents;
- concise operator-interaction rules.

Root-cause history, measured evidence, rejected alternatives, detailed
procedures, and long workflow checklists belong in focused docs or explicit
skills.

`scripts/check-agent-docs.mjs` enforces small entry-point ceilings and checks
that workflow-changing skills remain explicit-only.

## Authority and conflicts

Use this order when sources disagree:

1. the operator's current explicit instruction;
2. the current shared charter and the focused canonical document that owns the
   subject;
3. an active execution plan for its scoped acceptance criteria;
4. historical plans, archived notes, and research.

An older plan's `STOP`, `locked`, or `ask` wording does not override the
current autonomy contract for reversible local work. Specific legal,
production, external-write, destructive-data, and secret restrictions remain
binding.

Explicit supersession notes win over dates alone. If two current canonical
sources still imply materially different product outcomes, surface the
conflict concisely and ask for the one decision that cannot be inferred.
Otherwise use the narrower, better-supported source and continue.

Code and tests show what is shipped; canonical docs show intended behavior. A
mismatch is evidence to resolve, not a reason to freeze the task.

## Canonical project documents

| Document | Owns |
| --- | --- |
| `CLAUDE.md` | Compact shared project charter and autonomy contract |
| `AGENTS.md` | Compact Codex/ZCode entry point matching the same contract |
| `docs/product/odysseus-project-brief.md` | Product purpose, offer, architecture, workflow, roadmap |
| `docs/decisions/trade-offs.md` | Full evidence and rejected alternatives behind durable decisions |
| `docs/rules/normalization-rules.md` | Scanner-output normalization, dedupe, finding identity, evidence, artifacts |
| `docs/rules/llm-layer-rules.md` | Model visibility, structured output, retries, guards, language, provenance, cost gates |
| `docs/rules/report-writing-style.md` | Report prose style, structure, terminology, and bilingual writing constraints |
| `docs/rules/obligation-basis.md` | Approved client-facing legal facts and evidence status |
| `docs/rules/operator-obligations.md` | Odysseus's regulatory and operating obligations |
| `docs/rules/prospect-qualification.md` | Sourcing, qualification, retention, and contact rules |
| `docs/rules/outreach-rules.md` | Outreach and preview assembly rules |
| `docs/rules/offer-positioning.md` | Pricing, scope, sales claims, offer framing |
| `docs/rules/telemetry-rules.md` | Metadata-only job/LLM telemetry contracts, Sentry/Langfuse sink behavior, production-enablement boundaries |
| `docs/report/report-design-system.md` and `docs/report/report-design-tokens.md` | Report visual language and implementation tokens |
| `docs/report/report-workbench.md` | PDF-native Impeccable iteration, acceptance, verification, and commit workflow |
| `docs/rules/manual-accessibility-checklist.md` | Known limits of automated accessibility detection |
| `docs/product/dashboard-ia.md` | Dashboard navigation, page destinies, operator vocabulary |
| `docs/adr/` and package ADR directories | Accepted architecture decisions at their documented scope |
| `docs/agents/coding-conventions.md` | Shared source, test, prose, interaction, and attribution conventions |
| `docs/agents/model-prompting.md` | Small host-specific model and effort deltas |
| `docs/agents/tooling-integrations.md` | Implementation register for repository tooling/integration hardening |

## Planned work and active queues

`plans/README.md` owns execution order, status, dependencies, and selected
active plans. Plans specify scoped work and acceptance criteria; they do not
create stronger permission boundaries than the current charter.

A long plan whose execution spans sessions may carry a committed
`plans/<nnn>-execution-handoff.md` beside it. That file holds execution state
only - what shipped, which operator decisions are already settled, and where
work is blocked - so a fresh context can continue without re-deriving it. The
plan stays the contract; the handoff never amends it, and it is deleted when
the plan reaches DONE. Unlike `docs/session/current-session.md`, it is
committed, because an agent working from a fresh clone cannot read a gitignored
file.

GitHub issues are the system of record when the operator or an explicitly
invoked audit/triage workflow chooses to track work there. Routine work does
not create issues merely because a defect was noticed.

`docs/report/report-feedback-deferred-items.md` is the focused queue for report
items with a current reproduction or explicit future trigger.

## Historical and research material

Archived plans, closed reviews, and `docs/research/*` preserve useful evidence
and rationale. They are not live instructions unless a current canonical
document explicitly promotes their content.

## Agent and workflow documents

- `docs/agents/handoff.md`: recovery protocol for substantial unfinished work.
- `docs/agents/session-template.md`: structure for a recovery log when one is
  actually needed.
- `docs/agents/issue-tracker.md`: issue workflow when issues are being used.
- `docs/agents/triage-labels.md`: issue-label vocabulary.
- `docs/agents/model-prompting.md`: host-specific deltas.
- `docs/agents/audit-data-defect-hunt.md`: explicit-only brief for an
  occasional read-only search of every stored audit, after a batch of new
  sites or a large crawler change.
- `.agents/skills/audit-finalizer/SKILL.md`: pre-send check of audits, on the
  operator's request: a read-only quick check of the outreach preview (SEND or
  HOLD, one audit or a batch), or the full finalization of one audit's scan
  data and then its preview (`--fix`) or its paid report against the exact PDF
  and stored lineage.
- `.agents/skills/*`: optional specialist workflows. Workflow-changing modes
  are explicit-only.

Tool availability is host-specific. Use the capabilities actually exposed in
the current session.

After changing maintained Markdown or agent entry points, run
`pnpm run docs:check`. Before a handoff that changed code, run the verification
appropriate to the risk; `pnpm run check` is the broad repository validation.
