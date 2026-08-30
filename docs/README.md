# Documentation layout

Navigation only. Document authority, status, and conflict rules live in
[`agents/documentation-map.md`](agents/documentation-map.md); the shared
charter is [`../CLAUDE.md`](../CLAUDE.md).

| Folder | Contents |
| --- | --- |
| `agents/` | Coding-agent protocol: handoff, session log template, documentation map, coding conventions, domain/ADR conventions, issue tracker |
| `adr/` | Accepted system-wide architectural decisions (packages keep theirs under `packages/<name>/docs/adr/`) |
| `decisions/` | `trade-offs.md`: full evidence behind the numbered charter guardrails |
| `rules/` | Normative per-domain rules: normalization, LLM layer, legal obligations, prospect qualification, outreach, offer positioning, accessibility limits |
| `product/` | The project brief: purpose, offer, architecture, roadmap |
| `report/` | Report design system and tokens, the deferred report-work queue, and the canonical flat design sources under `design/` |
| `research/` | Vetted source research; only facts promoted through canonical rules reach product output |
| `archive/` | Completed implementation history kept for rationale, not as a task queue |
| `session/` | The gitignored live session log, written from `agents/session-template.md` |

Executable plans live outside this folder in [`../plans/`](../plans/), whose
`README.md` is the single index; completed plans are under `plans/archive/`.
