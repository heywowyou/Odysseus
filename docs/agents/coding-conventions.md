# Shared coding and writing conventions

These conventions apply equally to Claude Code, Codex, and human contributors.
They define the repository's default syntax and writing system. `CLAUDE.md` and
the focused product documents remain authoritative for architecture, behavior,
legal constraints, and product decisions.

## Enforcement hierarchy

Use the narrowest authority for each concern:

1. Prettier owns source layout. Do not hand-tune whitespace that Prettier will
   replace.
2. ESLint owns static code-quality rules that do not require project type
   information.
3. TypeScript owns types and cross-package compile-time contracts.
4. Tests own behavior.
5. The charter and focused documents own product meaning, legal wording, and
   architecture.

If two layers appear to disagree, do not add an inline suppression immediately.
Confirm whether the code, configuration, or documented rule is wrong. Any
necessary suppression must be as narrow as possible and explain why the code is
safe.

## Formatting baseline

- `.editorconfig` owns encoding, line endings, final newlines, indentation, and
  trailing whitespace in editors that support it.
- Prettier is the only formatter. Run `pnpm run format` after editing maintained
  source, then `pnpm run format:check` before handoff.
- The repository baseline uses semicolons, single quotes, trailing commas, and a
  100-character print width.
- Markdown is not formatter-owned. Its structure and meaning are checked by
  `pnpm run docs:check` and reviewed against this guide.
- Generated design artifacts, dependency metadata, agent/plugin metadata,
  runtime data, and external fixtures listed in `.prettierignore` keep their
  owning format.
- Do not combine a behavioral change with an unrelated formatting rewrite. The
  one-time repository baseline was established in August 2026; future formatter
  diffs should be local to changed code.

## TypeScript and modules

- Keep TypeScript strict. Do not use `any`; narrow `unknown` at the boundary.
- Give exported functions explicit return types. Prefer inference for local
  expressions when the inferred type is clear.
- Use `import type` when an import is used only by the type system. Preserve the
  repository's ESM `.js` suffix on relative imports compiled by NodeNext. The
  Next.js site and Vite fixture may follow their bundler conventions.
- Validate untrusted input at the edge. Existing Zod schemas remain the runtime
  authority where the charter requires validation.
- Keep public package imports at the package entry point. Do not deep-import
  another package's internals to avoid an intended boundary.
- Keep command, route, and rendering adapters thin. Put reusable policy and pure
  decisions in the package that owns the concept.
- Do not add a barrel export merely for convenience. Add an export when it is
  part of the package's intentional public surface.

## Naming

- Use `PascalCase` for types, interfaces, classes, and React components;
  `camelCase` for functions, variables, and object fields; and
  `SCREAMING_SNAKE_CASE` for true module-level constants.
- Name booleans and predicates with a useful state or question such as `is`,
  `has`, `can`, `should`, or `meets`. Name callbacks with `on` when they report an
  event.
- New non-component source files default to kebab-case. React component files
  may use PascalCase. Preserve an established local convention when adding an
  adjacent file; do not rename old files only to normalize their spelling.
- Tests use `*.test.ts` or `*.e2e.test.ts` next to the behavior they verify. Test
  descriptions state observable behavior, not implementation steps.
- Scanner rule IDs, finding IDs, schema versions, artifact paths, and persisted
  field names are contracts. Follow their owning document and existing pattern;
  never improve their spelling casually.
- Prefer domain names over generic containers such as `data`, `item`, `helper`,
  or `manager` when a more precise name is available.

## Control flow, errors, and logging

- Prefer small functions with explicit inputs and outputs. Use early returns to
  make guard conditions visible.
- Preserve failures that affect integrity. Do not convert an invalid model
  response, incomplete scan, or persistence failure into a plausible partial
  success.
- Log structured operational context through the existing logger. Do not log
  secrets, raw personal data, raw page HTML, or model-visible content forbidden
  by the charter.
- Comments explain why a non-obvious constraint exists. Do not narrate code that
  is already clear. Link durable rationale to the relevant trade-off or focused
  document when one exists.

## Tests and fixtures

- A behavior change includes a focused test unless the behavior cannot be
  automated; document any manual verification instead.
- Prefer the smallest test level that proves the contract. Add integration or
  end-to-end coverage when the risk crosses a package, process, browser, storage,
  or rendered-output boundary.
- Keep tests deterministic. Never call the live Mistral API, and never scan a
  live third-party site without the user's current explicit authorization for
  that named site.
- Reuse committed fixtures. Follow the fixture-refresh and real-scan provenance
  rules in `CLAUDE.md` when normalization changes.
- A snapshot or fixture update is evidence only after its semantic change has
  been reviewed; do not accept a bulk update merely because a command offers it.

## Product writing

- Use plain, direct language. Expand an acronym on first use when the audience
  may not know it.
- Add or update French and English variants together. Keep keys and meaning
  aligned; neither language is a fallback draft for the other.
- Use sentence case for headings, labels, and calls to action unless a proper
  name requires different capitalization.
- Do not use em dashes or en dashes in generated product text or code comments.
  Prefer a period, comma, colon, or parentheses.
- Use domain terms consistently: an `audit` produces deterministic `findings`;
  each finding can have multiple `occurrences`; an `analysis` explains and
  prioritizes existing findings; an `outreach preview` is not a paid report
  tier.
- Preserve provenance and confidence in claims. Do not turn a criterion,
  estimate, heuristic, or unresolved fact into a verdict.
- Legal, pricing, offer, and outreach language must come from the focused
  canonical documents routed by `AGENTS.md`. Where the charter requires
  deterministic text, the model does not rewrite it.

## Documentation and decisions

- Update the document that owns a durable fact. Do not create a second summary
  because one agent finds it easier to read.
- Mark historical or superseded material explicitly. A newer date alone does
  not override a canonical rule.
- Keep the live session log factual and recoverable: exact commands, exact
  outcomes, changed paths, risks, and one concrete next step.
- Record a lasting architectural decision in an ADR and lasting vocabulary in
  the domain documentation when the routing rules call for it.

## Definition of done

For documentation or tooling-only work, run the applicable checks below. For a
behavior change, also run the narrowest affected tests and any required manual
or rendered-output review.

```bash
pnpm run format
pnpm run check
pnpm run test <affected test paths>
```

Before handing off, record which commands passed, failed, or were not run.
`pnpm run check` covers agent documentation, formatting, lint, and workspace
typechecking. CI also runs the full test suite.
