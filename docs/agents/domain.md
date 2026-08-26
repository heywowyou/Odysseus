# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **multi-context**: a pnpm workspace of eight packages
(`core`, `scanner`, `store`, `llm`, `report`, `interface`, `cli`, `site`),
each with a distinct, locked role per `CLAUDE.md`'s "Packages" section
(e.g. `llm` is a peer of `scanner`, not a consumer; `core` holds locked
contracts and no I/O). That's a real context boundary per package, not an
arbitrary folder split.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root, if it exists: it points at one
  `CONTEXT.md` per package context. Read each one relevant to the topic.
- **`docs/adr/`**: system-wide decisions. Read ADRs that touch the area
  you're about to work in.
- **`packages/<name>/docs/adr/`**: package-scoped decisions, for the
  specific package(s) you're touching.

If any of these files don't exist, **proceed silently**. Don't flag their
absence; don't suggest creating them upfront. The domain-modeling workflow,
when available, creates them lazily when terms or decisions actually get
resolved.

## File structure

```
/
├── CONTEXT-MAP.md                     ← points to each package's CONTEXT.md
├── docs/adr/                          ← system-wide decisions
└── packages/
    ├── core/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← core-specific decisions
    ├── scanner/
    │   ├── CONTEXT.md
    │   └── docs/adr/
    ├── store/
    ├── llm/
    ├── report/
    ├── interface/
    ├── cli/
    └── site/
```

Not every package needs a `CONTEXT.md` immediately; the map only lists
packages that have one. A package with no distinct domain vocabulary yet
(e.g. thin ones like `cli`) can go without until `/domain-modeling` finds
something worth recording.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor
proposal, a hypothesis, a test name), use the term as defined in the
relevant package's `CONTEXT.md`. Don't drift to synonyms the glossary
explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either
you're inventing language the project doesn't use (reconsider) or there's
a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR (root `docs/adr/` or a
package's `docs/adr/`), surface it explicitly rather than silently
overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
