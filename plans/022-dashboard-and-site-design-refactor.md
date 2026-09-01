# Plan 022: Refactor the operator dashboard and public site UI with the Impeccable workflow

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update this plan's status row in
> `plans/README.md`, unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat ee64918..HEAD -- .impeccable .agents/skills/impeccable .claude/skills/impeccable .codex/hooks.json CLAUDE.md packages/interface/src/dashboard packages/site plans/README.md`
> Expected drift: plans 019 through 021 touch `plans/README.md` only, and
> plan 019 or 020 dashboard strings may move `packages/interface/src/dashboard`
> files. Stop if the Impeccable skill version changed, the report exclusion in
> `.impeccable/config.json` was narrowed or removed, or the charter entry for
> impeccable disappeared. Re-read `.agents/skills/impeccable/SKILL.md` if the
> version differs from 4.1.2 before running any command below.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MEDIUM
- **Depends on**: none in the report sequence; must not run concurrently with
  another active plan in the same working tree (one plan per session)
- **Category**: design, UI
- **Planned at**: commit `ee64918`, 2026-09-01
- **Issue**: none; operator-requested 2026-09-01 after
  `docs/research/design-skill-alternatives.md`

## Why this matters

The operator dashboard was overhauled to shippable quality by plan 017 and is
now the daily work surface for the rollout campaign hosted by plan 016. The
public site at odysseusaudit.com carries the brand for a EUR 1,600 HT offer and
serves legally constrained preview and compliance pages. Both were built by
agents without a recorded design system, so their quality rests on decisions
nobody wrote down and no tool defends.

The Impeccable skill (pbakaus/impeccable 4.1.2, installed 2026-09-01, decision
record in `docs/research/design-skill-alternatives.md`) turns that situation
into a governed workflow: product truth in `PRODUCT.md`, the incumbent visual
world in `DESIGN.md`, per-surface briefs, a deterministic detector with a
live hook, dual-agent critique with persisted snapshots, and bounded
verification. This plan runs that workflow over the two allowed surfaces and
lands the fixes it justifies. It deliberately excludes
`packages/report`: the report design is locked (trade-off 9) and any report
revision belongs to plan 023.

## Binding decisions

1. **Impeccable owns design method, not product rules.** The executor loads
   `node .agents/skills/impeccable/scripts/context.mjs` once per session and
   follows the playbook of every command it runs. No command runs without its
   explicit invocation; a bare `$impeccable` presents the routing menu instead
   of auto-running anything. Where skill taste and repository rules conflict,
   repository rules win (FR/EN parity, no em dashes, plain language, no new
   dependency, locked contracts).
2. **Two surfaces, two modes, two briefs.** `packages/interface/src/dashboard`
   is Operate mode (task completion outranks expression). `packages/site` is
   Persuade mode for the home and offre pages. Each surface gets its own brief
   under `.impeccable/surfaces/` written via
   `node .agents/skills/impeccable/scripts/surface-brief.mjs`, with the mode
   recorded only in the brief.
3. **Refinement first; redesign is gated.** The default posture is refinement
   of the incumbent world: `critique`, `audit`, then targeted `quieter`,
   `distill`, `typeset`, `layout`, `harden`, `clarify`, and closing `polish`
   passes. A whole-surface replacement goes through `new-work.md`'s direction
   contract and its decision page, and only after the operator picks the
   direction. Never split the difference into polish on a discarded look.
4. **PRODUCT.md and DESIGN.md come before fixes.** `init` captures product
   truth with the operator (it never asks aesthetic questions and never writes
   DESIGN.md). `document` derives DESIGN.md plus the
   `.impeccable/design.json` sidecar from the code as it exists today, so the
   incumbent world is recorded before anything changes it. Neither file is
   ever silently overwritten.
5. **Product copy is fenced.** All user-facing strings stay French and English
   from the start, centralized in the dashboard i18n files and the site's
   page copy, with `strings-parity` green at every step. The `harden` playbook
   expects a 30 to 40 percent text-expansion budget; French strings get it.
   Site compliance and preview pages (`/bot`, `/confidentialite-prospection`,
   `/desinscription`, `/apercu/[token]`, `/offre`) are governed by
   `docs/rules/outreach-rules.md`, `docs/rules/operator-obligations.md`, and
   `docs/rules/offer-positioning.md`: presentation may change; any wording
   change must cite the governing rule document in the step's notes, or the
   wording does not change.
6. **Accessibility is a hard floor.** Contrast at least 4.5:1 for body text,
   keyboard focus visible, states complete (hover, focus, disabled, loading,
   error, empty), reduced-motion respected. The dashboard axe suite and the
   report-level axe discipline are the regression gate; a finding fix that
   breaks an axe test is a broken step.
7. **Bounded verification, always.** One batched screenshot round (desktop and
   mobile together), one fix batch, at most one confirmation round, then stop.
   Captures go to `.impeccable/review/`. The detector runs at most once per
   changed target via
   `node .agents/skills/impeccable/scripts/detect.mjs --json <target>`; the
   session hook covers the immediate tier and the Stop hook the deep pass.
   Detector findings are verified in context before reporting; false positives
   are called out, never silently reported.
8. **The report stays excluded.** No edits under `packages/report` or
   `docs/report`. The `ignoreFiles` entries in `.impeccable/config.json` stay
   as committed. Seeing detector output about report files is a STOP
   condition, not an invitation to fix them here.
9. **No new dependency.** Motion uses CSS transitions and the Web Animations
   API only. Performance work measures first (plan 016's hosted dashboard and
   the automated release runbook stay intact; no deploy belongs to this plan).
10. **Every step ends green.** Focused vitest suites, typecheck, and lint pass
    at each step boundary; the full gate runs once at the end.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Skill context (once per session) | `node .agents/skills/impeccable/scripts/context.mjs --target <file>` | directives understood; PRODUCT.md status known |
| Product truth | `$impeccable init` | `PRODUCT.md` written with operator answers |
| Record the incumbent world | `$impeccable document` | `DESIGN.md` plus `.impeccable/design.json` |
| Surface brief | `node .agents/skills/impeccable/scripts/surface-brief.mjs write <target> <body-file>` | brief under `.impeccable/surfaces/` |
| Baseline critique | `$impeccable critique <target>` | snapshot persisted; trend line printed |
| Technical audit | `$impeccable audit <target>` | Health Score /20 report |
| Detector | `node .agents/skills/impeccable/scripts/detect.mjs --json <target>` | exit 0 clean, exit 2 findings |
| Drift report | `npx impeccable doctor --json` | no unexpected findings |
| Dashboard unit loop | `pnpm exec vitest run --project unit packages/interface/src/dashboard` | named suites pass |
| Typecheck | `pnpm run typecheck` | exit 0 |
| Site build | `pnpm --filter @odysseus/site build` | exit 0 |
| Interface build | `pnpm --filter @odysseus/interface build` | exit 0 |
| Full gate | `pnpm run format && pnpm run check && pnpm run test:all` | all exit 0 |

The refine commands (`quieter`, `distill`, `typeset`, `layout`, `harden`,
`clarify`, `polish`) are named where the steps justify them; each loads its own
reference playbook from `.agents/skills/impeccable/reference/` before acting,
and each ends by handing off to `polish`.

## Steps

### Step 1: Capture product truth with the operator (`init`)

Run `$impeccable init`. The interview records `PRODUCT.md` at the repository
root with the `<!-- impeccable:product-schema 1 -->` marker, `## Platform` set
to `web`, and product facts drawn from `docs/product/odysseus-project-brief.md`
plus the operator's answers. Record under `## Evidence on Hand` what brand
material actually exists so later steps never fabricate imagery or claims.
`init` never asks about aesthetics; do not volunteer any.

**Verify**: `PRODUCT.md` exists with the schema marker; the operator confirmed
its content in the interview; context.mjs no longer emits `NO_PRODUCT_MD`.

### Step 2: Record the incumbent world (`document`)

Run `$impeccable document` so the design system is derived from the code as it
stands: `packages/interface/src/dashboard/theme.css`, the Tailwind 4 theme
layers, `packages/site/app/globals.css` (or its equivalent), and the Radix
component wrappers under `src/dashboard/components/ui`. Two structured
question rounds at most. This writes `DESIGN.md` and the
`.impeccable/design.json` sidecar; neither pre-exists, so nothing is
overwritten.

**Verify**: both files exist; the sidecar is `schemaVersion` 2; a second
context.mjs run (fresh session) prints them without `INCUMBENT_WORLD_UNDOCUMENTED`.

### Step 3: Write the two surface briefs

Write `.impeccable/surfaces/` briefs via `surface-brief.mjs write`:

- dashboard brief: primary target
  `packages/interface/src/dashboard/App.tsx`; mode Operate; audience is the
  single operator; job is running audits, preparations, previews, and drafts;
  constraints: bilingual, single-user, keyboard-first where practical;
- site brief: primary target `packages/site/app/page.tsx` with the offre,
  bot, and compliance routes as related targets; mode Persuade; audience is
  French SMB owners; constraints: legal pages fenced per binding decision 5.

Keep each brief small: scope, mode, audience, job, constraints, unresolved
decisions. Do not copy DESIGN.md tokens into briefs.

**Verify**: `context.mjs --target` resolves `hasSurfaceBrief` true for both
targets.

### Step 4: Baseline evaluation of both surfaces

Run `$impeccable critique` and `$impeccable audit` on each surface. Critique
runs as two isolated assessments (design review plus detector evidence) and
persists snapshots under `.impeccable/critique/`; record the heuristic table,
priority issues, and the audit Health Score /20 for each surface in the session
log. Screenshots for evidence come from the repo's own Playwright
tooling against a locally started dev server; stop the server afterwards and
confirm with `pgrep`.

**Verify**: snapshots exist for both surfaces; every detector finding in the
reports was verified in source or explicitly called out as a false positive;
baseline scores recorded.

### Step 5: Operator picks the slice scope

Present both surfaces' priority issues (P0 through P2) to the operator in one
table with each issue's suggested command. The operator marks which issues this
refactor takes. Everything unmarked is recorded as deferred, not silently
dropped. A proposed visual-world replacement for the site's public pages, if
the operator wants one, is scheduled as its own new-work session with the
direction contract and decision page, not folded into these slices.

**Verify**: the chosen scope exists in writing before any fix command runs.

### Step 6: Dashboard refinement slices (Operate)

For each accepted finding, run the suggested refine command against the
dashboard target, in this order: structural commands first (`layout`,
`distill`), then surface language (`typeset`, `quieter`, `colorize` if taken),
then resilience (`harden`: French text-expansion budget, overflow, states,
empty and error states), then copy (`clarify`, editing the centralized i18n
sources only), and one closing `polish` over the whole surface. Respect the
operate-mode depth reference: consistency over surprise, no decorative motion,
motion only as state feedback at 150 to 250ms with reduced-motion paths.

Each slice is one component family or route so commits stay small.

**Verify**: `pnpm exec vitest run --project unit packages/interface/src/dashboard`
passes, including `accessibility.test.ts` and `strings-parity.test.ts`;
`pnpm run typecheck` exits 0; one batched screenshot round (desktop and
mobile) captured to `.impeccable/review/` with at most one confirm round;
hook and detector findings for edited files are clean or explicitly disposed.

### Step 7: Site refinement slices (Persuade)

Same discipline against the site. Marketing pages (home, offre) may take
expression; compliance and preview pages get presentation-only changes unless
binding decision 5's citation rule is satisfied. Never break the preview
route contract: `/apercu/[token]` must keep hash-token serving behavior and
its RGPD article 14 disclosures intact (trade-offs 42 and 43). Verify with
`pnpm --filter @odysseus/site build` plus a local browser pass over every
route in the brief.

**Verify**: site build exit 0; screenshots captured and reviewed in the one
batched round; every wording change that landed cites its governing rule
document; no route contract changed.

### Step 8: Optional live iteration (consent-gated)

If the operator wants interactive iteration on a specific component, run
`$impeccable live` against the dashboard's Vite dev server only. `live-setup`
may touch CSP configuration only after its prescribed consent prompt is
answered yes; a no still records `cspChecked` and skips the allowance. On
exit, stop the live server and remove inject markers
(`live-server.mjs stop`), and kill any dev server started for the session.

**Verify**: `pgrep` shows no leftover Vite or live server; the live journal
under `.impeccable/live/sessions/` has no incomplete session.

### Step 9: Close out

Run `npx impeccable doctor --json` and resolve `auto` findings; report
`mention` and `route` findings without acting on them. If any fix round
changed the visual system, re-run the documenter (or `$impeccable document`
with merge confirmation) so DESIGN.md matches the shipped state. Then run the
full gate, update this plan's status row to `IMPLEMENTED`, and give the
operator the screenshot pairs and baseline-versus-final scores. `DONE` waits
for the operator's browser review of both surfaces.

**Verify**:

```bash
pnpm run format
pnpm run check
pnpm run test:all
pnpm --filter @odysseus/site build
pnpm --filter @odysseus/interface build
```

All exit 0.

## Scope

**In scope**:

- `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/surfaces/`,
  `.impeccable/critique/`, `.impeccable/review/`, `.impeccable/live/`
  (session artifacts committed only when they carry durable value)
- `packages/interface/src/dashboard/**` (components, routes, i18n, theme)
- `packages/site/app/**` and `packages/site/lib/**`
- focused tests under `packages/interface/src/dashboard/**`
- `plans/README.md` (status row only)

**Out of scope**:

- `packages/report/**` and `docs/report/**` (plan 023's territory)
- locked contracts in `packages/core/src/types/` and
  `packages/core/src/normalize/severity.ts`
- any new package, runtime dependency, or a Tailwind build step beyond the
  existing Tailwind 4 usage
- the hosted deployment (plan 016 boundary, trade-off 61; releases stay
  operator-triggered)
- scanner, llm, store, cli behavior
- migrating the dashboard to Next.js or any framework swap (charter forbids)
- live third-party site scans of any kind

## Git workflow

Work on `main`. Small commits at slice boundaries (init/document artifacts;
each dashboard slice; each site slice; closeout). Do not push unless the
operator asks. Never include another plan's in-flight files; the report
sequence may be running in a parallel session.

## STOP conditions

Stop and report instead of improvising if:

- the operator is not available for `init`'s interview or step 5's scope pick
  and the session needs answers that only they can give;
- a fix requires a new dependency, a CSP change without consent, or an edit
  under `packages/report` or `docs/report`;
- the direction that would fix a finding is a visual-world replacement and
  the operator has not approved one through new-work's decision page;
- an axe, strings-parity, or typecheck failure survives one reasonable
  correction attempt;
- verification would exceed the bounded budget (a third screenshot round);
- the detector or hook reports findings about report files;
- the Impeccable version changed since this plan was written in a way that
  removed a command this plan names.

## Done criteria

- [ ] `PRODUCT.md` exists with operator-confirmed product truth.
- [ ] `DESIGN.md` and its sidecar record the shipped visual system for both
      surfaces.
- [ ] Both surface briefs exist with correct modes and constraints.
- [ ] Baseline critique snapshots and audit scores are recorded, and the
      operator-selected issues are fixed or explicitly deferred in writing.
- [ ] Dashboard and site suites, typecheck, both builds, format, check, and
      `test:all` are green.
- [ ] All copy changes are bilingual with parity tests green, and compliance
      or offer wording changes cite their governing rule document.
- [ ] No report, scanner, store, llm, or cli file changed.
- [ ] Status is `IMPLEMENTED` until the operator's browser review of both
      surfaces passes; then `DONE` in `plans/README.md`.
