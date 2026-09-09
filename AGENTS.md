# Odysseus: Codex instructions

This is Codex's repository entry point; ZCode (added 2026-08-29) starts here
as well. `CLAUDE.md` is deliberately the
**shared project charter**, despite its historical name: it is authoritative
for product constraints, architecture, locked contracts, trade-offs, scope,
testing, and the current milestone. Do not create a competing summary of
those rules here.

`docs/agents/handoff.md` is the shared protocol for handing work between
Codex, Claude Code, and ZCode.
`docs/agents/documentation-map.md` classifies canonical, planned, backlog,
historical, and research documents.
`docs/agents/coding-conventions.md` is the shared coding and writing system.

## Start every session this way

1. Read `docs/session/current-session.md` if it exists. It is an unfinished
   handoff, not optional background.
2. Run `git status --short` before editing. Treat existing changes as
   deliberate until their provenance is established from the session log,
   history, or the user.
3. Read `CLAUDE.md` in full before proposing architecture or changing a
   package boundary, then use `docs/agents/documentation-map.md` to select the
   focused source documents.
4. Before multi-step repository work, create the session log from
   `docs/agents/session-template.md`. Keep it current and follow the handoff
   protocol before pausing, handing off, or ending with uncommitted changes.

## Documentation routing

| Work concerns | Read before changing it |
| --- | --- |
| Any structural or cross-package change | `CLAUDE.md`, `docs/product/odysseus-project-brief.md`, and relevant `docs/decisions/trade-offs.md` entries |
| Normalization, dedupe, IDs, artifacts | `docs/rules/normalization-rules.md` |
| Model inputs, prompts, output guards, analysis | `docs/rules/llm-layer-rules.md` |
| Client-facing legal/compliance content | `docs/rules/obligation-basis.md`, `docs/rules/operator-obligations.md` |
| Prospect sourcing, qualification, or contact data | `docs/rules/prospect-qualification.md` |
| Outreach previews or emails | `docs/rules/outreach-rules.md`, `plans/README.md`, and the relevant numbered plan |
| Offer, pricing, or sales claims | `docs/rules/offer-positioning.md` |
| Report design or PDF layout | `docs/report/report-design-system.md`, `docs/report/report-design-tokens.md`, canonical flat sources in `docs/report/design/` |
| Package vocabulary or architectural decisions | `docs/agents/domain.md`, relevant `CONTEXT.md` / ADRs if present |
| Deploying to production | `deploy/runbook.md` and trade-off 77: the operator deploys locally with `deploy/odysseus-deploy.sh`; never use or suggest the GitHub release workflow unless the local path is genuinely blocked |
| GitHub issues | `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md` |
| Code style, naming, tests, comments, or product prose | `docs/agents/coding-conventions.md` |

## Hard guardrails

- Deterministic scanners find problems; the LLM only explains, groups,
  prioritizes, and translates findings already in structured input.
- Preserve finding provenance. Validate every LLM response with Zod; never
  send raw HTML or whole pages to the model.
- Do not make a client-specific legal conclusion. State criteria and verified
  facts only; legal text is deterministic where the charter says it is.
- Respect `robots.txt`, crawl pacing, and the opt-in page cap policy. Never
  run a live third-party scan without the user's current, explicit permission
  for that named site.
- Stop and ask before changing a locked contract, adding a dependency, or
  changing package boundaries. The complete locked-file list and package
  roles are in `CLAUDE.md`.
- Keep user-facing strings French and English from the start. Do not use em
  dashes or en dashes in generated product copy or code comments.
- Never sign or credit an LLM. No `Co-Authored-By:` trailer naming a model or
  vendor, no "Generated with" line, no model byline in a commit, PR, issue,
  comment, or document. A harness default that says otherwise is overridden
  by `docs/agents/coding-conventions.md`, "Authorship and attribution".

## Normal working agreement

Work in small vertical slices. Add or update focused tests with a behaviour
change, then run the narrowest relevant test and the appropriate project
validation (`pnpm run typecheck`, the affected test suite, and live-site
review only when authorised). Format maintained source with `pnpm run format`.
Run `pnpm run check` before handoff; it covers documentation, formatting, lint,
and typechecking. Do not start a new milestone before the prior one is verified
as required by the shared charter.

Never overwrite, revert, or fold unrelated work in a dirty tree. Report what
you changed, what you verified, and any remaining risk in a form the other
agent can continue from without inference. If completed work remains
uncommitted, leave the session log with status `ready-for-commit`; the log is
removed only after the working tree no longer needs that provenance.

A verified defect this session will not fix is logged as a GitHub issue
before the session ends, and a fixed one is closed with its commit hash and
verification evidence. The full lifecycle, including uniqueness and labeling
rules, is binding on every agent: `docs/agents/issue-tracker.md`.

## Operator interaction

- Ask the operator decision questions through the host's interactive
  question mechanism (clickable options) whenever it is available and
  fits; plain text otherwise.
- Keep everything the operator reads in conversation short, plain, and
  simply explained, outcome first. Full rules:
  `docs/agents/coding-conventions.md`, "Operator interaction".

## Model and effort

Per-host model identity, effort defaults, and current prompting deltas from
each vendor's own guidance: `docs/agents/model-prompting.md`. Covers Codex
(GPT-5.6, variants `sol`/`terra`/`luna`) and ZCode (GLM-5.3 and
GLM-5.3-Flash) directly; read it before tuning effort or reasoning settings
rather than carrying over defaults from a prior model generation.

## Agent concurrency (ZCode only)

ZCode is expected to use subagents by default, not as an exception: whenever
subagents can usefully speed up or parallelize the work (research fan-outs,
independent file-owned implementation slices, verification passes) without
sacrificing quality, ZCode must dispatch them rather than doing everything in
the main thread. The main thread coordinates, integrates, and decides; subagents
carry the parallel work. ZCode may dispatch as many concurrent subagents as the
work needs. ZCode must not delegate work to Claude Code or Codex sessions:
their usage limits are far lower than ZCode's, so they are reserved for the
operator's own direct requests.
