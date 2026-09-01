# Design skill candidates: Impeccable and alternatives

Research date: 2026-09-01. All repository facts come from the GitHub API, raw repository files, the npm registry, the skills.sh registry CLI (`npx skills@latest search`), or the vendor documentation pages listed in Sources, queried on that date. Star and install counts are point in time. Any claim that could not be confirmed from a primary source is marked UNVERIFIED. This document does not recommend a choice; it records verified facts and a neutral fit analysis.

## Purpose and scope

The operator asked about adopting "Impeccable" for this repository and wants comparable options researched. The category under investigation is: agent consumable skills (plain SKILL.md files and their optional scripts) that raise the visual and interaction quality of UI written in an existing codebase. App generators (v0, Lovable, Bolt) are out of scope. This document covers:

1. A referent check: which project is actually named "Impeccable".
2. A detailed profile of Impeccable: content, workflow, install mechanics, compatibility, license, maintenance.
3. Verified alternatives in the same category.
4. A fit analysis against the three UI surfaces of this repo (packages/site, packages/interface, packages/report), the agent agnostic requirement, the no new npm dependency rule, and the locked report design system.

## What "Impeccable" refers to

The suggested referent, `github.com/obra/impeccable` (Jesse Vincent), does not exist:

- `gh api repos/obra/impeccable` returned HTTP 404 on 2026-09-01.
- No repository named "impeccable" appears in obra's public repository list (fetched 2026-09-01 via `gh api users/obra/repos`). Jesse Vincent's main skill project is `obra/superpowers`, whose `skills/` directory contains process skills only (brainstorming, test-driven-development, systematic-debugging, writing-plans, subagent-driven-development, and similar). It contains no design or frontend skill. (Sources: https://api.github.com/repos/obra/impeccable, https://api.github.com/users/obra/repos, https://api.github.com/repos/obra/superpowers/contents/skills)
- Community write-ups attribute Impeccable to Paul Bakaus, and list Jesse Vincent separately as the author of the Superpowers methodology. (Source: https://divadsanders.medium.com/4-skills-that-patch-claude-codes-biggest-bugs-install-these-first-fb72184c6a58)

The verified referent is **`pbakaus/impeccable`** (Paul Bakaus), home page https://impeccable.style, described in its README as "Design guidance for AI coding agents. 1 skill, 23 commands, live browser iteration, and 61 deterministic detector rules for AI-generated frontend design." (Source: https://raw.githubusercontent.com/pbakaus/impeccable/main/README.md)

The README also records a lineage fact: "Anthropic's frontend-design was the first widely-used design skill for Claude. Impeccable started from there." (Source: https://raw.githubusercontent.com/pbakaus/impeccable/main/README.md)

Other notable projects named Impeccable found during the referent check (all small derivations of pbakaus/impeccable except the last, which is unrelated):

| Repository | What it is | Stars, 2026-09-01 | Source |
| --- | --- | --- | --- |
| ilindaniel/impeccable-lite | "Inspired by Impeccable, but without the plugin machinery. Just one SKILL.md file." Apache-2.0 | 31 | https://github.com/ilindaniel/impeccable-lite |
| peterhadorn/webdesign-agency-skills | Two Claude Code skills "built on Impeccable" (client audit brief, improvement loop). Apache-2.0 | 39 | https://github.com/peterhadorn/webdesign-agency-skills |
| h3nryprod01/design-taste | A merged synthesis of emilkowalski/skills, pbakaus/impeccable, and leonxlnx/taste-skill. MIT | 43 | https://github.com/h3nryprod01/design-taste |
| jordi9/pi-impeccable | "Impeccable.style extension for Pi" | 13 | https://github.com/jordi9/pi-impeccable |
| seansmithworks/impeccable-swift | Swift/SwiftUI port, marked POC | 5 | https://github.com/seansmithworks/impeccable-swift |
| emsec/ImpeccableCircuits | Hardware fault detection research, unrelated to AI design | 23 | https://github.com/emsec/ImpeccableCircuits |

(Counts and descriptions from `gh search repos impeccable` on 2026-09-01.)

## Impeccable (pbakaus/impeccable) in detail

### Verified facts

Identity and maintenance:

- Author: Paul Bakaus (`package.json` author field: "Paul Bakaus"). (Source: https://raw.githubusercontent.com/pbakaus/impeccable/main/package.json)
- Repo: https://github.com/pbakaus/impeccable, created 2025-11-16, pushed 2026-09-01 (the day of this research), not archived, 64,566 stars, 3,986 forks, 30 contributors. (Source: `gh api repos/pbakaus/impeccable` and `gh api repos/pbakaus/impeccable/contributors`, 2026-09-01)
- Last commit at research time: 2026-09-01T04:23Z, "Sync generated provider output". (Source: `gh api repos/pbakaus/impeccable/commits`)
- Latest GitHub release: "Skill 4.1.2", tag `skill-v4.1.2`, published 2026-08-26; release tags follow a `skill-vX.Y.Z` scheme. (Source: `gh api repos/pbakaus/impeccable/releases`)
- npm package `impeccable`: latest published version 3.6.0, modified 2026-08-14. The `package.json` on main says 3.6.1, so the npm CLI version and the skill release version do not move in lockstep. (Sources: `npm view impeccable`, `gh api repos/pbakaus/impeccable/contents/package.json`)
- License: Apache-2.0 (repo license field and package.json). (Source: `gh api repos/pbakaus/impeccable`)
- Runtime requirement: `engines.node >= 22.18.0` in package.json. This repo is Node 22, so the requirement matches. (Source: https://raw.githubusercontent.com/pbakaus/impeccable/main/package.json)

What it is, concretely:

- An npm CLI (`bin: impeccable`, main export `cli/engine/detect-antipatterns.mjs`), a compiled skill payload per provider (`dist/claude-code/.claude`, `dist/gemini/.gemini`, `dist/universal/` and similar), a browser extension build, and a deterministic detector engine under `cli/engine/`. (Sources: package.json and repository root listing via `gh api repos/pbakaus/impeccable/contents/`)
- The skill source is `skill/SKILL.src.md`, plus `skill/reference/` with 35 command and guidance playbooks (audit.md, polish.md, critique.md, craft-floor.md, new-work.md, hooks.md, doctor.md, and more) and `skill/agents/` with 4 subagent prompt files (asset producer, documenter, finish reviewer, manual edit applier). (Source: `gh api repos/pbakaus/impeccable/contents/skill/reference` and `/skill/agents`)
- The detector: the README claims 61 deterministic detector rules that "run the deterministic rules with no LLM and no API key". A distinct-ID count of `cli/engine/rules/checks.mjs` on main on 2026-09-01 gives 49 distinct rule IDs (for example `overused-font`, `gray-on-color`, `low-contrast`, `gradient-text`, `ai-color-palette`, `nested-cards`, `bounce-easing`, `em-dash-overuse`, `text-overflow`, `tight-leading`, `theater-slop-phrase`). The checks file contains Tailwind-specific detection branches (for example "bg-clip-text + bg-gradient (Tailwind)"). The difference between 61 and 49 is not explained in the repo; treat the exact total as UNVERIFIED. (Sources: README, https://raw.githubusercontent.com/pbakaus/impeccable/main/cli/engine/rules/checks.mjs)

Workflow the skill imposes (from `skill/SKILL.src.md`, https://raw.githubusercontent.com/pbakaus/impeccable/main/skill/SKILL.src.md):

- One entry command, `/impeccable <command> <target>`, routed through a Commands table of 23 commands grouped as Build (init, shape, document, extract), Evaluate (critique, audit), Refine (polish, bolder, quieter, distill, harden, onboard), Enhance (animate, colorize, typeset, layout, delight, overdrive), Fix (clarify, adapt, optimize), and Iterate (live).
- Setup: a script `scripts/context.mjs` runs once per session and loads `PRODUCT.md` (durable product truth), `DESIGN.md` (the recorded visual system), and a per-surface brief. `init` interviews the operator and writes `PRODUCT.md`; `document` generates `DESIGN.md` from existing code. New surfaces are gated through init and a `new-work.md` playbook.
- Four "modes" chosen per surface: Persuade (landing pages, marketing), Operate (app UI, dashboards, settings), Read (docs, articles), Experience (portfolios, galleries).
- Before editing UI, the agent must load `reference/craft-floor.md` (a quality floor with "absolute bans"). Verification is bounded: one batched screenshot inspection (desktop and mobile together), one batched fix pass, at most one more confirmation round, then stop.
- An anti-pattern list is explicit in the README: no overused fonts (Arial, Inter, system defaults), no gray text on colored backgrounds, no pure black or gray, no nested cards, no bounce or elastic easing.
- Housekeeping commands: `pin` (create standalone command shortcuts), `hooks` (toggle the post-edit detector hook), `doctor` (report drift between installed artifacts and the current version). Drift is reported, never auto-repaired.

Install mechanics and repository footprint (from README Installation and docs/HARNESSES.md, https://raw.githubusercontent.com/pbakaus/impeccable/main/docs/HARNESSES.md):

- `npx impeccable install` detects harness folders (for example `~/.claude`, `~/.codex`, project `.cursor`), asks project vs global scope, and writes provider skill directories. Providers supported by the installer: claude, cursor, gemini, codex, github, grok, hermes, opencode, pi, qoder, trae, trae-cn, rovo-dev, vibe, veto.
- It also installs provider-native hook manifests on Claude Code, Cursor, Codex, GitHub Copilot, and Grok Build. Per HARNESSES.md: Claude Code gets a `PostToolUse` hook in `.claude/settings.json` running `.claude/skills/impeccable/scripts/hook.mjs`; Codex gets `.codex/hooks.json` running the hook from `.agents/skills/impeccable/scripts/hook.mjs` and requires a `/hooks` trust approval, with hooks disabled on Windows; Cursor gets a `preToolUse` hook in `.cursor/hooks.json` that can block proposed writes; all other harnesses get no hook, only the skill and commands.
- Non-installer options: git submodule plus `npx impeccable link --source=.impeccable --providers=...`; Claude Code plugin marketplace (`/plugin marketplace add pbakaus/impeccable`); ZIP download from impeccable.style; manual copy of `dist/<provider>` folders.
- skills.sh (the `npx skills` registry this repo uses) indexes it. `npx skills search impeccable` (2026-09-01) returns `pbakaus/impeccable@impeccable` with 256.9K installs, plus separately installable command skills `polish`, `critique`, `audit`, `animate`, `adapt`, `clarify`, `optimize`, `colorize`, `bolder` at roughly 81K to 87K installs each. The registry page lists the install command `npx skills add https://github.com/pbakaus/impeccable --skill impeccable` and "first seen Apr 8, 2026". (Sources: `npx skills search impeccable` output, https://skills.sh/pbakaus/impeccable/impeccable)

Agent compatibility (from docs/HARNESSES.md, described in the repo as the source of truth for provider configs, last verified dates printed in the file itself):

- The repo maintains a capability matrix for 15 harnesses (Claude Code, Cursor, Gemini CLI, Codex CLI, GitHub Copilot, Kiro, OpenCode, Pi, Qoder, Trae, Rovo Dev, Mistral Vibe, Grok Build, Hermes Agent, Antigravity) and states all follow the Agent Skills specification (agentskills.io) to varying degrees.
- Skill directories: Claude Code `.claude/skills/`; Codex CLI `.agents/skills/` (primary); Cursor, Gemini CLI, GitHub Copilot, Grok Build, Antigravity, Mistral Vibe, Pi also read `.agents/skills/`. So a `.agents/skills/impeccable/` install serves Codex natively and is read by most other harnesses; Claude Code expects `.claude/skills/`.
- ZCode is not listed in the matrix. This repo's existing skills are loaded by ZCode from `.agents/skills/`, so a plain `.agents/skills/` install is expected to load, but ZCode support is UNVERIFIED from a primary source.

Runtime assumptions:

- Node 22.18+ for the detector and helper scripts; skill frontmatter grants `Bash(npx impeccable *)`, so several flows shell out to the CLI via npx. (Source: skill/SKILL.src.md frontmatter)
- `/impeccable live` (browser based visual variant iteration) and the browser detector assume a browser-capable harness. The repo publishes a browser build of the detector (`cli/engine/detect-antipatterns-browser.js`). (Sources: SKILL.src.md, package.json)
- No LLM API key is needed for the detector; the guidance commands run inside whatever agent loads the skill.

### Assessment (fit, not verified fact)

- Impeccable is the only candidate checked that pairs prose guidance with a deterministic, LLM-free detector and a hook that runs it after edits. That matches this repo's charter principle that deterministic scanners find problems and the model explains them, but the hook manifests are repository machinery (settings files that run node scripts on edits) that the charter does not currently contemplate, and the skills CLI install path this repo uses would not install or track the hooks.
- Its artifact convention (`PRODUCT.md`, `DESIGN.md`, surface briefs) would add new root and per-surface files. For the site and interface this could be complementary; for the report it collides with the locked design system (see Fit for Odysseus).
- High release velocity and same-day pushes indicate active maintenance as of 2026-09-01. The multi-installer surface (5 install options, 15 provider targets) is also the largest moving part of any candidate checked, which means more drift surface to audit on update (`doctor` exists for exactly this).

## Alternatives

### anthropics/skills: frontend-design

- What it is: the official Anthropic skills repository (`anthropics/skills`, "Public repository for Agent Skills", 172,941 stars, pushed 2026-08-21). The design entry is `skills/frontend-design`, a single guidance-only SKILL.md with no scripts, no CLI, and no hooks. (Sources: `gh api repos/anthropics/skills`, https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md)
- License: the repository has no root LICENSE file; the README states "Many skills in this repo are open source (Apache 2.0)" while the document skills (docx, pdf, pptx, xlsx) are source-available, and carries a disclaimer that skills are "provided for demonstration and educational purposes only". `skills/frontend-design/LICENSE.txt` is the Apache License 2.0, and the SKILL.md frontmatter says "Complete terms in LICENSE.txt". (Sources: repo README, LICENSE.txt, SKILL.md)
- Maintenance: the repo is active, but the frontend-design skill itself was last updated 2026-06-09 ("Update frontend-design skill (#1293)"). (Source: `gh api repos/anthropics/skills/commits?path=skills/frontend-design`)
- Content summary: a persona prompt ("design lead at a small studio"), grounding in the subject, typography-first direction, an explicit list of three AI-default looks to avoid (cream plus serif plus terracotta; near-black plus acid green; broadsheet hairlines), a two-pass process: brainstorm a compact token system (4 to 6 named hex values, 2 or more type roles, a layout concept with ASCII wireframes, one signature element), self-critique it against genericness, then build to the revised plan. It also specifies a quality floor (responsive to mobile, visible keyboard focus, reduced motion respected) and a UX copy section.
- Install: indexed on skills.sh at 842.1K installs, the highest of any design skill found in the registry: `npx skills add anthropics/skills@frontend-design`. (Source: `npx skills search design`, 2026-09-01)
- Footprint: one skill directory. No artifacts, no hooks, no dependencies.
- Assessment: guidance only, zero machinery, and the provenance is the strongest available (Anthropic, Apache-2.0 per-skill license file). It is also the base Impeccable started from, so Impeccable is a superset in scope. The educational-use disclaimer and repo-level "no license file" state are worth a glance before vendoring, but the skill's own LICENSE.txt is Apache-2.0.

### vercel-labs/agent-skills: web-design-guidelines

- What it is: Vercel's official skill collection (`vercel-labs/agent-skills`, "Vercel's official collection of agent skills", 30,703 stars, pushed 2026-08-28; no license file found at the repository root, repo license field null). The skill `skills/web-design-guidelines` is a review skill: on each run it fetches the current rule set from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`, reads the target files, and outputs findings in a terse `file:line` format. (Sources: `gh api repos/vercel-labs/agent-skills`, https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/web-design-guidelines/SKILL.md)
- The rules source, `vercel-labs/web-interface-guidelines`, is MIT licensed, 831 stars, pushed 2026-08-18. (Source: `gh api repos/vercel-labs/web-interface-guidelines`)
- Install: skills.sh shows 597.5K installs for `vercel-labs/agent-skills@web-design-guidelines`. (Source: `npx skills search design`, 2026-09-01)
- Footprint and assumptions: one SKILL.md; each review performs a live network fetch of the guidelines, so it needs WebFetch or curl at runtime and always applies the latest upstream rule text. Review only; it does not rewrite code. The same collection ships `react-best-practices` (React and Next.js performance rules) and `vercel-optimize`, which are adjacent to this repo's site package.
- Assessment: the closest analogue to a deterministic scanner among the non-Impeccable candidates, but the rule text lives upstream and is fetched at review time, so results are not pinned; the rules document itself is MIT and could be vendored if pinning matters.

### leonxlnx/taste-skill

- What it is: "Taste Skill", self-described as "The Anti-Slop Frontend Framework for AI Agents" (`Leonxlnx/taste-skill`, MIT, 83,140 stars, created 2026-02-19, pushed 2026-08-24). Ships many skills: `taste-skill` (frontmatter name `design-taste-frontend`), `redesign-skill`, `stitch-skill`, `brandkit`, `minimalist-skill`, `brutalist-skill`, image generation skills, and more. (Sources: `gh api repos/Leonxlnx/taste-skill`, `gh api repos/Leonxlnx/taste-skill/contents/skills`, https://raw.githubusercontent.com/Leonxlnx/taste-skill/main/README.md)
- skills.sh installs: design-taste-frontend 430K, high-end-visual-design 319K, redesign-existing-projects 315.3K, stitch-design-taste 271.3K. (Source: `npx skills search design`, 2026-09-01)
- Content summary (from skills/taste-skill/SKILL.md): a mandatory one-line "Design Read" before generating; three configuration dials (DESIGN_VARIANCE, MOTION_INTENSITY, VISUAL_DENSITY, baseline 8/6/4) with an inference table mapping brief signals to dial values; an anti-default discipline list (no AI-purple gradients, no centered hero over dark mesh, no Inter plus slate-900 defaults); and a trust-first downgrade path (public sector, regulated, accessibility-critical audiences drop the dials to 3 to 4 / 2 to 3 / 4 to 5). The skill scopes itself: "Landing pages, portfolios, and redesigns. Not dashboards, not data tables, not multi-step product UI."
- Footprint: guidance-only SKILL.md files; agent agnostic.
- Notable: the README carries commercial sponsorship (a Kimi/Moonshot affiliate banner, sponsor table including Vercel's open source program and animations.dev). Provenance of the author (a personal handle) is thinner than the corporate-backed candidates; content quality could not be verified beyond reading the files.
- Assessment: strong opinionated guidance for marketing surfaces; explicitly out of its own scope for the interface dashboard; the dial system is conversational configuration, not a repository artifact.

### emilkowalski/skills

- What it is: "Skills for Designers and Engineers" by Emil Kowalski (`emilkowalski/skills`, MIT, 34,393 stars, created 2026-03-16, pushed 2026-08-21). Skills list: emil-design-eng, apple-design, animate, animation-vocabulary, review-animations, find-animation-opportunities, improve-animations, pick-ui-library, prototype, ask-sonner, animate-expo, write-swift. (Sources: `gh api repos/emilkowalski/skills`, `gh api repos/emilkowalski/skills/contents/skills`)
- The author is identified in the taste-skill README sponsor table as "Emil Kowalski · animations.dev"; the skill itself opens by pointing to the animations.dev course. Third-party mirrors exist (for example `attentiondotnet/emilkowalski_skills`); the canonical repo is `emilkowalski/skills`. (Sources: taste-skill README, emil-design-eng SKILL.md, `gh search repos emilkowalski`)
- skills.sh installs: emil-design-eng 242.4K, apple-design 113.6K. (Source: `npx skills search design`, 2026-09-01)
- Content summary (from skills/emil-design-eng/SKILL.md): a design engineering philosophy ("taste is trained, not innate", "unseen details compound"); a required review output format (a Before/After/Why markdown table, one row per issue); an animation decision framework gated by frequency of use, including "No animation. Ever." for actions used 100+ times a day and "Never animate keyboard-initiated actions".
- Footprint: guidance-only; agent agnostic; no artifacts, hooks, or dependencies.
- Assessment: the deepest interaction and motion guidance of the candidates checked, aimed exactly at app UI (the interface dashboard's category). It prescribes a review output format rather than a build workflow. Course promotion is embedded in the skill's initial response.

### shadcn ecosystem (improve skill installed; MCP server as a different approach)

- This repo already has the shadcn improve skill installed: `skills-lock.json` records `"improve": { "source": "shadcn/improve", "skillPath": "skills/improve/SKILL.md" }` and the file `.agents/skills/improve/SKILL.md` exists. (Source: /home/heywow/code/odysseus/skills-lock.json)
- What shadcn/improve is: a general codebase audit and planning skill, MIT, 9,049 stars, pushed 2026-06-15, described as "Use your most capable model to audit your codebase and write plans for cheaper models to execute." Its audit categories are correctness and bugs, security, performance, test coverage, tech debt and architecture, dependencies and migrations, DX and tooling, docs, and direction. There is no UI design category. Phase 1 explicitly reads `DESIGN.md` and `PRODUCT.md` where present, so it would compose with Impeccable's artifacts. (Sources: `gh api repos/shadcn/improve`, /home/heywow/code/odysseus/.agents/skills/improve/SKILL.md, lines 27 to 41)
- The shadcn MCP server is a different category of answer: instead of guidance, it gives agents registry access to browse, search, and install components, for example "Add the button, dialog and card components to my project". Documented clients: Claude Code, Cursor, VS Code with Copilot, Codex, OpenCode. Install is `pnpm dlx shadcn@latest mcp init --client claude` or a manual `.mcp.json` entry running `npx shadcn@latest mcp`. It assumes a project with shadcn installed and a `components.json` file ("registries are configured in your project's components.json file"). (Source: https://ui.shadcn.com/docs/mcp)
- This repo has no `components.json` anywhere under packages (checked 2026-09-01), and packages/interface depends on Radix UI primitives directly rather than on shadcn/ui components. Adopting the MCP therefore implies adopting the shadcn registry workflow first; it is a component sourcing route, not a design taste route.
- Assessment: shadcn/improve (installed) is complementary rather than competing: it plans non-design improvements and would read, not write, design artifacts. The MCP answers "where do components come from", which none of the skill candidates address.

### mattpocock/skills: design-an-interface (removed upstream)

- skills.sh lists `mattpocock/skills@design-an-interface` at 215.6K installs, but the current repository no longer contains it: the changelog records "design-an-interface -> /codebase-design. Nothing is lost: the 'design it twice' technique ... ships inside that skill as DESIGN-IT-TWICE.md". This repo already has codebase-design installed from the same source. (Sources: `npx skills search design`, https://raw.githubusercontent.com/mattpocock/skills/main/CHANGELOG.md, /home/heywow/code/odysseus/skills-lock.json)
- Note that codebase-design is about module and interface design in the software architecture sense (deep modules, seams, testability), not visual UI. It is not a candidate for raising visual design quality; listed here only to close the loop on the registry entry.

## Comparison table

| Candidate | Author | Form | License | Last push (2026-09-01) | skills.sh installs (main skill) | Repo footprint | Agent agnostic | Runtime assumptions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pbakaus/impeccable | Paul Bakaus | CLI + skill + commands + hooks + detector + browser extension | Apache-2.0 | 2026-09-01 (same day) | 256.9K | PRODUCT.md, DESIGN.md, surface briefs, per-provider skill dirs, hook manifests on 4 harnesses | Yes, 15 documented harnesses; hooks only on Claude Code, Codex, Cursor, Grok | Node 22.18+, npx impeccable, node scripts, browser for live mode |
| anthropics/skills@frontend-design | Anthropic | One guidance SKILL.md | Apache-2.0 (per-skill LICENSE.txt); repo disclaimer | Skill file 2026-06-09; repo 2026-08-21 | 842.1K | One skill directory | Yes (spec frontmatter only) | None |
| vercel-labs/agent-skills@web-design-guidelines | Vercel | One review SKILL.md fetching rules at runtime | Repo license null; rules repo MIT | 2026-08-28 | 597.5K | One skill directory | Yes | Network fetch each review |
| leonxlnx/taste-skill | Leonxlnx (personal) | Guidance skill family (dials, redesign, brandkit) | MIT | 2026-08-24 | 430K (design-taste-frontend) | One or more skill directories | Yes | None; excludes dashboards by its own scope |
| emilkowalski/skills | Emil Kowalski | Guidance skill family (design eng, animation) | MIT | 2026-08-21 | 242.4K (emil-design-eng) | One or more skill directories | Yes | None |
| shadcn/improve (already installed) | shadcn | General codebase audit and planner | MIT | 2026-06-15 | not checked | Already in .agents/skills + skills-lock.json | Yes (installed and used by repo agents today) | None beyond gh/git |
| shadcn MCP server | shadcn | MCP server over component registries | UNVERIFIED (not checked this session) | n/a | n/a | .mcp.json plus project components.json | Claude Code, Cursor, VS Code, Codex, OpenCode documented | shadcn project context; implies adopting registry components |
| obra/superpowers (context only) | Jesse Vincent | Process methodology skill set (no design skills) | MIT | 2026-08-31 | not checked | Plugin or skills install | Multi-harness installs documented in its README | None design related |

## Fit for Odysseus

Repo facts used here, all verified locally: packages/site is a standalone Next.js 16 marketing site using Tailwind CSS 4 (packages/site/package.json lists `tailwindcss` and `@tailwindcss/postcss`); packages/interface is a private single-user dashboard built with Vite, React 19, and Radix UI primitives with a hand-written `src/dashboard/theme.css` and no components.json; packages/report renders server HTML with the locked stylesheet `packages/report/src/styles/nocturne.css` through Paged.js in Playwright Chromium, and docs/report/report-design-system.md states "The visual design is not open for reinterpretation" with the design system CSS marked "locked, do not edit". Skills install into `.agents/skills/` via the skills CLI and are tracked in skills-lock.json with GitHub source and hash; the repo charter keeps a capability catalog of installed skills; agents in use are Claude Code, Codex, and ZCode.

Per surface:

- packages/site (marketing site, Tailwind 4): this is the surface every candidate targets. Impeccable's Persuade mode, its anti-pattern list, and its Tailwind-aware detector rules map directly onto marketing page work; anthropics frontend-design covers the same ground as prose only; taste-skill is aimed at exactly this category but self-limits to "landing pages, portfolios, and redesigns"; web-design-guidelines would review a11y and interaction rules after the fact; emil-design-eng contributes mostly on interaction polish. The detector is the differentiator here, and the site is Tailwind-based, which the detector explicitly parses.
- packages/interface (dashboard): Impeccable's Operate mode names this category (app UI, dashboards, settings). taste-skill excludes dashboards by its own scope statement. emil-design-eng's animation frequency framework (no animation on high-frequency actions) fits a single-user operator dashboard well. The dashboard uses Radix primitives, so shadcn-style component sourcing would overlap with what it already has.
- packages/report (locked PDF system): every candidate that prescribes a visual direction or a DESIGN.md convention conflicts with the locked design system if pointed at report sources. Concretely: report-design-system.md forbids reinterpretation of nocturne.css; Impeccable's `document`/`extract` commands would want to generate a DESIGN.md for the surface and its craft-floor bans include overused fonts, while the report deliberately self-hosts Inter (docs/report/report-design-system.md). Running any of these skills against packages/report would need an explicit exclusion. This is an assessment of collision risk, not a verified defect.

Per constraint:

- Agent agnostic requirement: all skill candidates are plain SKILL.md under the Agent Skills spec and load from `.agents/skills/` for Codex and, per this repo's current usage, ZCode; Claude Code reads `.claude/skills/`, so a skills CLI install that only writes `.agents/skills/` may not trigger in Claude Code without its own path or symlink, which is the current state of this repo's skills as well (verified pattern: skills-lock.json has no per-provider paths). Impeccable solves this upstream with per-provider dist folders and an installer, at the cost of writing into multiple provider directories that skills-lock.json does not track.
- No new npm dependencies: none of the skill candidates requires a package.json change; installs are file drops. Impeccable's runtime shape is different: its frontmatter authorizes `Bash(npx impeccable *)`, and its hook scripts run node from the skill directory, so the toolchain arrives through npx and vendored scripts rather than through dependencies. Whether that satisfies the "adds no npm dependencies without asking" rule is an operator call; no dependency manifest change is required either way.
- Locked report design system: see above; recommend an explicit surface exclusion whichever candidate is chosen. This is the strongest cross-cutting constraint in the analysis.
- Install bookkeeping: this repo tracks skills with source and hash in skills-lock.json. Impeccable's native installer (`npx impeccable install`) and its plugin or submodule paths bypass that file, while the skills CLI path (`npx skills add pbakaus/impeccable@impeccable`) integrates with it but delivers the skill without the hook manifests (hooks are installer-managed per HARNESSES.md). The two routes are not equivalent, and the difference matters for the charter's capability catalog.
- Governance and security posture: skills are instructions loaded into agent context. The Impeccable README quotes Hermes treating project-local skills as a prompt-injection vector gated by trust; Codex requires a `/hooks` approval for its hook manifest and disables hooks on Windows (HARNESSES.md). A hash-pinned skills-lock.json entry is the repo's existing mitigation and is only available on the skills CLI route.

Summary of differentiators (assessment):

- Impeccable: broadest scope, only candidate with a deterministic detector and post-edit hooks, heaviest footprint and fastest-moving surface area.
- anthropics frontend-design: smallest footprint, strongest institutional provenance, guidance only, no enforcement.
- vercel web-design-guidelines: lightweight recurring review pass with upstream-pinned rule text (not locally pinned); review only.
- taste-skill: opinionated marketing-page direction with an explicit dashboards exclusion; personal provenance, sponsored README.
- emil-design-eng: interaction and motion craft for app UI; review-format output; complements rather than replaces a direction skill.

## Open questions for the operator

1. Which surfaces may a design skill touch? If packages/report must stay untouched, the chosen skill needs a documented exclusion for report sources, since none of the candidates has a native "do not enter this directory" mechanism.
2. Which install route should be canonical if Impeccable is adopted: the skills CLI (tracked in skills-lock.json, no hooks) or `npx impeccable install` (hooks and provider dirs, untracked by skills-lock.json)? The charter's capability catalog needs to describe whichever lands.
3. Are post-edit agent hooks (entries in `.claude/settings.json` and `.codex/hooks.json` that run node scripts on every UI file write) acceptable repository machinery under the charter, including for the other agents that do not have a hook surface and would silently not get the enforcement?
4. Is guidance-only acceptable (frontend-design, taste-skill, emil-design-eng), or is deterministic detection a requirement? The charter's "deterministic scanners find problems" principle points at the detector, but the detector also exists standalone in the `impeccable` npm CLI without installing the skill.
5. Would the PRODUCT.md / DESIGN.md artifact convention be adopted repo wide (shadcn/improve already reads those filenames when present), and if so, does it extend to or compete with docs/report/report-design-system.md as the design source of truth for the site and interface?
6. The detector's bans include Inter and other overused fonts, gray-on-color, and pure black or gray. The report's locked design deliberately uses Inter and a dark ground (docs/report/report-design-system.md). Is a conflict between a skill's defaults and a locked canonical design resolved by surface exclusion, or should detector rules be ignored per file (the hook supports `ignore-rule` and `ignore-file`, per SKILL.src.md)?

## Sources

- https://api.github.com/repos/obra/impeccable (HTTP 404, referent check, 2026-09-01)
- https://api.github.com/users/obra/repos (2026-09-01)
- https://api.github.com/repos/obra/superpowers and /contents/skills (2026-09-01)
- https://raw.githubusercontent.com/obra/superpowers/main/README.md
- https://api.github.com/repos/pbakaus/impeccable (metadata, stars, license, 2026-09-01)
- https://api.github.com/repos/pbakaus/impeccable/commits, /releases, /tags, /contributors (2026-09-01)
- https://raw.githubusercontent.com/pbakaus/impeccable/main/README.md
- https://raw.githubusercontent.com/pbakaus/impeccable/main/package.json
- https://raw.githubusercontent.com/pbakaus/impeccable/main/skill/SKILL.src.md
- https://raw.githubusercontent.com/pbakaus/impeccable/main/docs/HARNESSES.md
- https://raw.githubusercontent.com/pbakaus/impeccable/main/cli/engine/rules/checks.mjs (distinct rule ID count, 2026-09-01)
- https://skills.sh/pbakaus/impeccable/impeccable and `npx skills search impeccable` (2026-09-01)
- `npm view impeccable` (2026-09-01)
- https://api.github.com/repos/anthropics/skills and /contents/skills, /commits?path=skills/frontend-design (2026-09-01)
- https://raw.githubusercontent.com/anthropics/skills/main/README.md
- https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md and LICENSE.txt
- https://api.github.com/repos/vercel-labs/agent-skills and /contents/skills (2026-09-01)
- https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/web-design-guidelines/SKILL.md
- https://api.github.com/repos/vercel-labs/web-interface-guidelines (2026-09-01)
- https://api.github.com/repos/Leonxlnx/taste-skill and /contents/skills (2026-09-01)
- https://raw.githubusercontent.com/Leonxlnx/taste-skill/main/README.md and skills/taste-skill/SKILL.md
- https://api.github.com/repos/emilkowalski/skills and /contents/skills (2026-09-01)
- https://raw.githubusercontent.com/emilkowalski/skills/main/skills/emil-design-eng/SKILL.md
- https://api.github.com/repos/shadcn/improve (2026-09-01)
- https://ui.shadcn.com/docs/mcp (shadcn MCP server, fetched 2026-09-01)
- /home/heywow/code/odysseus/skills-lock.json (installed skill provenance)
- /home/heywow/code/odysseus/.agents/skills/improve/SKILL.md (installed shadcn/improve content)
- /home/heywow/code/odysseus/docs/report/report-design-system.md (locked report design system)
- /home/heywow/code/odysseus/packages/site/package.json, /home/heywow/code/odysseus/packages/interface/package.json (surface stacks)
- https://raw.githubusercontent.com/mattpocock/skills/main/CHANGELOG.md (design-an-interface merged into codebase-design)
- https://divadsanders.medium.com/4-skills-that-patch-claude-codes-biggest-bugs-install-these-first-fb72184c6a58 (community attribution of Impeccable to Paul Bakaus)
- `gh search repos impeccable` (derivative and unrelated Impeccable-named repos, 2026-09-01)
- `npx skills search design` (registry install counts, 2026-09-01)
