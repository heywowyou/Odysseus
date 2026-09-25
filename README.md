# Odysseus

Internal tooling for a productized web audit service sold to
French small and mid-size businesses: technical/SPA-SEO and accessibility
(WCAG 2.2 AA / EN 301 549) audits, deterministic scanners plus an LLM
layer that explains and prioritizes but never detects. The main operator
surface is the private hosted dashboard (`packages/interface`); the
command-line entry points in `packages/cli` stay thin.

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
(docs links, formatting, lint, typecheck, dependency-cruiser architecture
rules, and fallow dead-code audit) locally instead of failing for the
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

At minimum, `OPENAI_API_KEY` and `MONGODB_URI` are required to run a
real audit end to end. The other variables have documented defaults in
`.env.example`.

## Prospecting source data

The prospect directory and the benchmark tooling read large public datasets
that are downloaded by hand, never fetched by the tool. Place them under the
gitignored `data/` directory at the workspace root, or point the matching
variable in `.env` at another path:

| File | Default path | Variable | Used by |
| --- | --- | --- | --- |
| Atout France classified accommodation export (CSV) | `data/atout-france/hebergements_classes.csv` | `ODYSSEUS_ATOUT_FRANCE_FILE_PATH` | `odysseus prospect directory-import` |
| INSEE Sirene stock of legal units (CSV) | `data/sirene/stock-unite-legale.csv` | `ODYSSEUS_SIRENE_STOCK_PATH` | benchmark qualification |
| AFNIC open data Fichier A, `.fr` domain names (CSV) | `data/afnic/fichier-a.csv` | `ODYSSEUS_AFNIC_FILE_PATH` | domain-first prospecting research |

`directory-import` also accepts `--file <path>` for a one-off import. Sources,
licences, and encodings are described in `docs/rules/prospect-qualification.md`.

## Running tests

```bash
pnpm run test:store:up    # starts the local mongo-test replica set and waits for its primary
pnpm run test             # runs the unit Vitest project (excludes browser e2e)
pnpm run test:e2e         # runs the e2e and e2e-serial projects; needs Chromium (below) and mongo-test
pnpm run test:all         # runs all three projects (unit, e2e, e2e-serial); this is what CI gates on
pnpm run test:store:down  # stops it again
```

Mongo-backed integration suites skip when the test database is unreachable,
so a machine without Docker still runs the rest. In CI, or locally with
`REQUIRE_MONGO_TESTS=1`, an unreachable database fails the run instead.
`mongo-test` is a single-node replica set, as production's Atlas cluster is,
so the report-bundle activation transaction runs in tests; with
`REQUIRE_MONGO_TESTS=1` a database without transactions fails the run too.
A volume created before this change keeps its data: the healthcheck
initiates the replica set on the next start.

The `test:e2e` and `test:all` commands are what drive a real Chromium via
Playwright. Some tests spin up the `fixtures/spa-demo` fixture themselves;
run `pnpm exec playwright install chromium` once if you haven't already.

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
pnpm run check         # docs, formatting, lint, typecheck, architecture and dead-code checks
```

## Running the dashboard

```bash
pnpm --filter @odysseus/interface run build # rebuild dashboard assets
pnpm run serve
pnpm run serve:full                          # builds CLI dependencies, including the interface, then serves
```

`serve` serves the existing dashboard build in `packages/interface/dist/public`; it
does not rebuild those assets. Starts the job queue and the private single-user
dashboard described in
`CLAUDE.md`'s package list (`packages/interface`).

## Learn more

`CLAUDE.md` is the compact project charter: working contract, non-negotiable
product rules, protected contracts, and package boundaries. The
[documentation map](docs/agents/documentation-map.md) routes each kind of work
to its canonical focused document, and the full numbered decision record lives
in [`docs/decisions/trade-offs.md`](docs/decisions/trade-offs.md). Read the
narrowest source that owns the work before proposing any structural change.
