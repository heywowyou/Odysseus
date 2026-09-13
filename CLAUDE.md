# Odysseus

> **Shared project charter.** This file is the compact project-level contract
> consumed by Claude Code and referenced by Codex and ZCode through
> `AGENTS.md`. Detailed evidence, history, and procedures live in focused docs;
> do not grow this file back into a ledger.

Odysseus is internal tooling for a productized web-audit service sold to French
small and mid-size businesses. It runs technical / SPA-SEO audits and
accessibility audits against WCAG 2.2 AA and EN 301 549.

Product context: `docs/product/odysseus-project-brief.md`.
Document authority and routing: `docs/agents/documentation-map.md`.
Shared coding and writing rules: `docs/agents/coding-conventions.md`.
Cross-agent recovery: `docs/agents/handoff.md`.
Current execution order: `plans/README.md`.

## Working contract

Default to action.

The operator owns this repository. For local, reversible work that is within
the request, inspect, edit, refactor, add justified dependencies, change
package boundaries, and run non-destructive validation without asking first.

Ask only when the operator's decision is genuinely required: a destructive or
hard-to-reverse action, a production or external/shared-system write, sending
or publishing something externally, secret input that only the operator can
provide, a material expansion of requested product scope, or an unresolved
product choice with materially different outcomes.

Important files are **protected contracts**, not forbidden files. When a
requested change touches one, inspect downstream consumers, persistence and
migration implications, update the relevant tests and docs, and proceed when
the requested outcome is clear. Do not turn importance into a permission
ritual.

Legacy `STOP`, `locked`, or `ask first` language in plans and specialist
workflows is interpreted through this current contract. For reversible local
work it means "check impact before proceeding", not "the owner may not change
this". Specific legal, destructive-data, production, external-write, and secret
boundaries still apply.

This section explicitly supersedes the older always-ask interpretation of
protected files, dependencies, package boundaries, mandatory session logging,
and globally enabled Impeccable hooks.

## Non-negotiable product rules

1. **Deterministic scanners detect. The LLM explains, groups, prioritizes, and
   translates.** The model may never introduce a finding absent from its
   structured input.
2. Every finding traces to scanner evidence and an affected element/page.
3. LLM output is validated with the authoritative Zod schemas. A response that
   invents finding identifiers is rejected and retried.
4. The LLM never receives raw HTML or full page content. Use normalized
   findings plus bounded site context.
5. Crawling is polite: respect `robots.txt`, use the identifiable user agent,
   preserve pacing and hard timeouts. A global default page cap remains off;
   the continuation-family guard is separate and disclosed.
6. Never overstate legal exposure. Report criteria and verified facts, not a
   client-specific legal verdict. Approved legal wording and evidence live in
   `docs/rules/obligation-basis.md` and
   `docs/rules/operator-obligations.md`.

## Protected contracts

These files have unusually broad downstream impact:

- `packages/core/src/types/findings.ts`
- `packages/core/src/normalize/severity.ts`
- `packages/core/src/types/llm-output.ts`

Changing them is allowed when required by the task. Treat the change as a
migration-sensitive contract change: inspect stored-data compatibility and
every downstream consumer, update focused tests, and record any durable
decision. Do not change them casually as an unrelated cleanup.

Other schemas may also be high impact in their domain. Their owning focused
document describes the contract; use the same impact-first approach rather
than inventing a new permission gate.

## Canonical focused documents

Read the narrowest source that owns the work:

| Work | Canonical source |
| --- | --- |
| Product purpose and architecture | `docs/product/odysseus-project-brief.md` |
| Full decision rationale and rejected alternatives | `docs/decisions/trade-offs.md` |
| Normalization, dedupe, IDs, artifacts | `docs/rules/normalization-rules.md` |
| Model inputs, prompts, output guards | `docs/rules/llm-layer-rules.md` |
| Client-facing legal facts | `docs/rules/obligation-basis.md` |
| Operator regulatory obligations | `docs/rules/operator-obligations.md` |
| Prospect qualification and contact rules | `docs/rules/prospect-qualification.md` |
| Outreach and previews | `docs/rules/outreach-rules.md` |
| Pricing and offer framing | `docs/rules/offer-positioning.md` |
| Report design | `docs/report/report-design-system.md`, `docs/report/report-design-tokens.md` |
| Dashboard navigation and vocabulary | `docs/product/dashboard-ia.md` |
| Coding, tests, prose, attribution | `docs/agents/coding-conventions.md` |
| Deployment | `deploy/runbook.md` |
| Current planned work | `plans/README.md` and the selected active plan |

Trade-offs are evidence and guardrails, not an instruction to preload every
numbered entry. Read the entries that touch the change. Historical plans do not
override current canonical docs.

## Package boundaries

Node 22, TypeScript strict, pnpm workspace, ESM.

- `core`: contracts and pure normalization; no infrastructure I/O.
- `scanner`: crawl, Chromium lifecycle, render diff, axe, Lighthouse, scan
  artifacts.
- `store`: Mongoose persistence and connection handling.
- `llm`: the only workspace package that talks to the configured OpenAI API;
  depends on `core`.
- `report`: bilingual report rendering and PDF generation.
- `interface`: job queue, private operator HTTP server, hosted dashboard.
- `cli`: thin Commander entry points.
- `site`: standalone public marketing/bot-information site; deployed
  separately and does not import the audit-engine packages.

Prefer existing packages. A new package or dependency is allowed when it
creates a cleaner design for the requested outcome; justify it by architecture
and maintenance cost, not by an approval ritual.

`packages/site` is public marketing only. `packages/interface` is the private
single-user operator surface. Do not accidentally create a public interface to
the audit engine.

## High-value decision guardrails

The full numbered record is `docs/decisions/trade-offs.md`. Keep these
cross-cutting outcomes unless the requested work intentionally revisits them:

- Full audits do not silently reintroduce a global page cap.
- Dedupe and same-page occurrence aggregation remain separate concepts.
- Legal content that the rules require to be deterministic stays
  deterministic.
- The outreach preview is its own document kind, not a paid-report tier.
- Stored analyses/reports preserve findings provenance and fail closed when
  provenance is missing or stale.
- Real-scan fixtures are de-identified and rebuilt through the repository
  scripts, never hand-edited or committed raw.
- Production deploys through `deploy/odysseus-deploy.sh`, not the disabled
  GitHub release workflow.
- Outreach wording comes from operator-approved deterministic templates; no
  model writes outreach copy at runtime.
- Impeccable remains installed as an optional design workflow, but global
  edit/stop hooks are intentionally disabled. Invoke the design workflow when
  the task actually calls for it.

If a task intentionally needs to revisit one of these choices, do the analysis
and implement the better decision; update the owning trade-off instead of
treating history as immutable.

## Live and external boundaries

Local edits, builds, tests, analysis regeneration from saved audits, and
bilingual PDF rendering are standing-authorized.

Read-only prospecting checks against catalogue-declared domains remain allowed
within the crawler's politeness and batch bounds.

A live third-party **browser audit** is an external operation. Run it when the
operator asked for that real-site audit or when an explicitly invoked
real-site QA workflow requires it. Do not silently turn a generic wording or
report-review request into a new live scan.

Production mutations, sending/publishing material, destructive database work,
and destructive git actions require clear current intent for that action.

Never expose `.env` secrets. Use the capabilities actually available in the
host; a repo file mentioning a tool is not proof that the current session has
it.

## Sessions and dirty trees

Treat existing worktree changes as deliberate. Preserve unrelated work and
continue around it when possible. Ask only if the requested edit overlaps
unknown changes in a way that cannot be resolved safely from the diff/history.

`docs/session/current-session.md` is an optional crash/handoff recovery file,
not mandatory bookkeeping. Use it for substantial unfinished work that another
context may need to resume. Routine edits, reviews, and short implementation
tasks do not need a session log.

When a handoff is genuinely needed, follow `docs/agents/handoff.md`.

## Verification

Prefer the smallest proof that matches the risk.

Typical commands:

```bash
pnpm run format
pnpm run check
pnpm test <affected test paths>
pnpm run test:e2e
pnpm run test:all
```

A behavior change normally gets a focused test. Broaden verification when the
change crosses packages, persistence, browser flows, generated output, or
deployment. Client-facing output is also reviewed as a client would see it.

Tests do not call a live model API. Use stubs. Real-site or production checks
are deliberate external operations, not default test steps.

## Skills

Skills are optional specialist modes, not hidden authority layers.

A skill that is intentionally read-only, files issues, commits, creates
prototype artifacts, writes research notes, performs a recurring audit, or
runs a heavyweight design process must be explicitly invoked. Ordinary wording
such as "audit", "improve", "research", or "design" does not silently switch
the task into such a workflow.

For normal requests, solve the task directly with the repository and tools at
hand.

## Operator interaction

Keep conversation outcome-first, short, plain, and useful. Explain technical
details only when they change the decision or the operator asks for them.
Do not narrate routine commands or dump implementation detail for its own sake.

When a decision question is actually necessary, ask one question, give two to
four concrete options when useful, and put the recommended option first.

The operator is the sole author of repository work. Never add model/vendor
credits or `Co-Authored-By` trailers.

Per-host model/effort guidance lives in `docs/agents/model-prompting.md` and
never overrides this project contract.
