# Odysseus

Internal command-line tool for a productized web audit service sold to
French small and mid-size businesses: technical/SPA-SEO and accessibility
(WCAG 2.2 AA / EN 301 549) audits, deterministic scanners plus an LLM
layer that explains and prioritizes but never detects.

The shared engineering charter lives in [CLAUDE.md](CLAUDE.md), regardless
of which coding agent is used. Codex additionally reads [AGENTS.md](AGENTS.md)
for its repository entry point; the cross-agent handoff protocol is
[`docs/agents/handoff.md`](docs/agents/handoff.md), and the
[documentation map](docs/agents/documentation-map.md) identifies canonical,
planned, backlog, historical, and research material. The
[shared conventions](docs/agents/coding-conventions.md) keep code and product
writing consistent between agents. Read the charter and
`docs/product/odysseus-project-brief.md` before making architectural changes.

## Prerequisites

- Node 22
- pnpm (version pinned via `packageManager` in `package.json`; run
  `corepack enable` to get it automatically)
- Docker, for the local MongoDB used by `packages/store`'s integration
  tests

## Install

```bash
pnpm install
```

This is a pnpm workspace covering `packages/*` and `fixtures/*` (the
`spa-demo` fixture used by scanner/crawler tests).

Enable the repo's git hooks once per clone. `pre-push` runs `pnpm run check`
(docs links, formatting, lint, typecheck) locally instead of failing for the
first time in CI, and `commit-msg` rejects a commit message that credits an
LLM (`docs/agents/coding-conventions.md`, "Authorship and attribution"):

```bash
git config core.hooksPath .githooks
```

## Environment variables

Copy `.env.example` to `.env` and fill in the values you need:

```bash
cp .env.example .env
```

At minimum, `MISTRAL_API_KEY` and `MONGODB_URI` are required to run a
real audit end to end. The other variables have documented defaults in
`.env.example`.

## Running tests

```bash
pnpm run test:store:up    # starts the local mongo-test container
pnpm run test             # runs the full Vitest suite
pnpm run test:store:down  # stops it again
```

Some tests spin up the `fixtures/spa-demo` fixture themselves and drive a
real Chromium instance via Playwright; run `pnpm exec playwright install
chromium` once if you haven't already.

## Typechecking and building

```bash
pnpm run typecheck   # tsc -b --pretty across the workspace
pnpm run build        # tsc -b
```

## Formatting, linting, and validation

```bash
pnpm run format        # format maintained source with Prettier
pnpm run format:check  # verify the formatter baseline without writing
pnpm run lint          # run ESLint across JavaScript and TypeScript source
pnpm run check         # docs, formatting, lint, and workspace typecheck
```

## Running the dashboard

```bash
pnpm run serve         # tsx, no build step
pnpm run serve:full    # builds packages/cli's dependency graph first, then serves
```

Starts the job queue and the private single-user dashboard described in
`CLAUDE.md`'s package list (`packages/interface`).

## Learn more

`CLAUDE.md` is the source of truth for architecture, locked contracts,
non-negotiable rules, and the full list of documented trade-offs — read it
before proposing any structural change.
