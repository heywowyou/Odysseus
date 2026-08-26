# Odysseus

Internal command-line tool for a productized web audit service sold to
French small and mid-size businesses: technical/SPA-SEO and accessibility
(WCAG 2.2 AA / EN 301 549) audits, deterministic scanners plus an LLM
layer that explains and prioritizes but never detects.

Full project context lives in [CLAUDE.md](CLAUDE.md) and
`docs/odysseus-project-brief-v2.md` — read those before making
architectural changes.

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

## Running the dashboard

```bash
pnpm run serve         # tsx, no build step
pnpm run serve:full    # builds packages/cli's dependency graph first, then serves
```

Starts the job queue and the private single-user dashboard described in
`CLAUDE.md`'s package list (`packages/interface`).

## Learn more

`CLAUDE.md` is the source of truth for architecture, locked contracts,
non-negotiable rules, and the full list of documented trade-offs — read
it before proposing any structural change.
