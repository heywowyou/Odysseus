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
  Next.js site, the Vite fixture, and the interface dashboard app (a Vite build
  with bundler resolution) may follow their bundler conventions.
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
- Keep tests deterministic. Never call a live model API, and never scan a
  live third-party site without the user's current explicit authorization for
  that named site.
- Reuse committed fixtures. Follow the fixture-refresh and real-scan provenance
  rules in `CLAUDE.md` when normalization changes.
- A snapshot or fixture update is evidence only after its semantic change has
  been reviewed; do not accept a bulk update merely because a command offers it.
- Vitest runs two projects: `pnpm test` covers the unit tier (every suite that
  does not need a real browser or spawned process), `pnpm run test:e2e` covers
  the `*.e2e.test.ts` browser and CLI suites, and `pnpm run test:all` runs
  both. Name any test that launches Chromium, a dev server, or a child CLI
  `*.e2e.test.ts` so the fast local loop stays browser-free; CI gates on
  `test:all`, so tiering never removes coverage.

## Security scanning

CI runs Trivy (`.github/workflows/ci.yml`, issue #255) over every pull
request: dependency manifests, secrets across every text file, and
Dockerfile misconfiguration checks, gated on actionable HIGH/CRITICAL
findings only. `deploy/compose.yaml` gets secret scanning like any other
text file but not structural misconfiguration checks: Trivy's misconfig
scanner has no ruleset for Compose's schema (Dockerfile and Containerfile
only, per its own coverage docs), not a gap in this configuration.
`main` additionally builds and scans the production image and publishes a
CycloneDX SBOM artifact.

- Reproduce the PR-gate scan locally with Docker (no local Trivy install
  needed):

  ```bash
  docker run --rm -v "$PWD":/repo:ro -w /repo aquasec/trivy:0.74.0 fs \
    --scanners vuln,secret,misconfig \
    --skip-dirs node_modules,.agents,.claude,.codex,.zcode,data,artifacts,reports,coverage,.pnpm-store \
    --skip-files .env,.env.smoke,.restic.env,.restic-password \
    --severity HIGH,CRITICAL --ignore-unfixed \
    --trivyignores .trivyignore.yaml /repo
  ```

  Drop `--ignore-unfixed` and widen `--severity` to see everything CI's
  non-gating report step shows. Keep `--skip-files .env,.env.smoke`: those
  hold this repo's real local secrets and are never in git, so Trivy has
  nothing useful to say about them beyond confirming they contain
  credentials, which is what they are for.
- Reproduce the fixture self-test (proves the secret-scanning gate fires)
  with `bash deploy/trivy-secret-gate.test.sh`; it works with either a local
  `trivy` binary on `PATH` or Docker.
- `.trivyignore.yaml` is the reviewed suppression list. An entry names one
  finding ID, explains why it is safe or not actionable here, and carries an
  expiry unless the advisory has no fix at all. Prefer fixing the underlying
  dependency or configuration over adding an entry; see the file's own header
  for the format.
- Keep the `version:` pinned in the workflow, the fallback in
  `deploy/trivy-secret-gate.test.sh`, and the version used above in sync when
  bumping Trivy. Trivy versions before 0.74 do not parse this repo's
  pnpm-lock.yaml format at all and silently skip dependency scanning; do not
  downgrade below it.

### Custom Semgrep rules

CI also runs five narrow, hand-written Semgrep rules (`.semgrep/rules/`,
issue #261) targeting risk seams a generic community ruleset can't express:

- `prospecting-fetch-without-ssrf-guard` — a `fetch()` reaching a
  prospect-controlled URL without a preceding `checkFetchTarget()` call in
  the same function (issue #158's resolve-then-classify guard).
- `dangerous-shell-exec` — `exec()`/`execSync()` from `node:child_process`,
  which interpret their argument as a shell command.
- `credentials-in-logs` — a logger/console call passed something that looks
  like a secret (`process.env`, `.apiKey`, `.secret`, `.password`, a
  `getXApiKey()`-shaped call, etc).
- `preview-token-unsafe-comparison` — a preview token compared with
  `===`/`==` instead of routed through the hash-then-lookup design in
  `packages/interface/src/outreach/preview-token.ts`.
- `storage-write-outside-adapter` — `new AwsClient(...)` constructed outside
  the three approved storage adapters, bypassing the PreviewPublisher /
  ArtifactStore port.

Each rule carries positive and negative fixtures under
`.semgrep/fixtures/<rule-id>/{bad.ts,good.ts,stage-path}`, checked by
`.semgrep/test-rules.py` before the real scan runs in CI; a fixture-test
failure means the rule regressed, not that product code did.

- Reproduce the fixture check and the real scan locally with the same pinned
  image CI uses:

  ```bash
  python3 .semgrep/test-rules.py semgrep/semgrep:1.145.0

  docker run --rm -v "$PWD:/src" semgrep/semgrep:1.145.0 \
    semgrep scan --config /src/.semgrep/rules --error \
    --sarif --output /src/semgrep-odysseus.sarif.json \
    /src/packages /src/scripts
  ```

- Semgrep Community Edition analyzes one file at a time: no cross-file
  import resolution, no dataflow. A rule that gates on "was the guard
  function called nearby" (the SSRF and preview-token rules) can miss a
  guard that lives in a helper in another file, or flag a call that's
  actually guarded by a caller two files away. Each rule's `message` names
  the specific false-positive/negative shape this leaves open for that rule;
  treat a finding as a prompt to check the surrounding code, not an
  automatic violation.
- These rules are scoped to `languages: [typescript]` only. The `nosemgrep`
  markers already present in `docs/report/design/*.flat.html` belong to a
  vendored static HTML mockup bundle and are unrelated to this ruleset — do
  not read their presence as evidence of a repo-wide Semgrep policy.
- Add a sixth rule the same way: write the rule, add `bad.ts`/`good.ts`
  fixtures plus a `stage-path` file naming the directory the fixture should
  be scanned as if it lived in (so `paths.include`/`paths.exclude` behave the
  same in the fixture as in the real repo), then run `test-rules.py`.


### Secondary accessibility engine

CI runs IBM Equal Access `accessibility-checker` in addition to the existing
axe/browser tests. The wrapper is `deploy/equal-access-ci.sh`, the checker is
pinned to `4.0.34`, and `.achecker.yml` pins its rule archive to the
tool-versioned archive with the WCAG 2.2 policy. IBM telemetry is explicitly
disabled in CI.

This is an independent regression signal, not a replacement for axe or manual
keyboard/screen-reader/zoom testing. A checker disagreement is investigated;
do not weaken either engine merely to make the dashboard green. Renovate owns
the checker pin through the regex custom manager in `renovate.json`.

## Dependency maintenance

Renovate runs locally, never on GitHub (trade-off 113). `pnpm run deps:check`
(`scripts/renovate-local.mjs`, needs Docker) runs Renovate's `local` platform
against the committed `HEAD` and prints the updates `renovate.json` allows
today, grouped the way Renovate would branch them. It pushes nothing, opens no
PR or issue, and triggers no GitHub Actions run. The machine-readable list goes
to `reports/dependency-updates.json` (gitignored).

`renovate.json` stays the policy. Its groups (React/Next, TypeScript/ESLint,
Playwright/browser tooling, accessibility tooling), the minimum release age of
`config:best-practices`, and the custom managers for pinned tools all apply.
Its schedule, automerge and PR-limit settings have no effect in local mode.

Applying updates:

- Work in a separate worktree or branch, one Renovate group per commit. Apply
  the group with pnpm at the exact version the report names (`pnpm up -r
  <pkg>@<version>`, or `pnpm update -r --no-save <pkg>@<version>` for a
  lockfile-only update: a bare `pnpm update` skips the minimum release age), then run `pnpm run check` and `pnpm run test`.
  Run `pnpm run test:e2e` when the group touches Playwright, Chromium,
  Lighthouse, axe, or the report renderer, and `pnpm run test:deploy` when it
  touches `deploy/`, the Dockerfile, or compose.
- Patch, minor, pin and digest updates are routine. A major is its own
  migration: read the changelog, and commit it separately after its own
  verification. OpenAI, Lighthouse, Mongoose, Next, Playwright and pnpm majors
  always get that dedicated review (`renovate/manual-major-review` in
  `renovate.json`), because a major there carries behavior, cost, or browser
  compatibility risk.
- `.codex/config.toml`'s Playwright MCP server is pinned to an exact version
  (`@playwright/mcp@0.0.80`, not `@latest`) and tracked by a Renovate custom
  manager, like any other dependency: a floating `@latest` on agent tooling
  means the MCP server can change under an agent with no diff to review.
- To hold a group back, add a rule with `"enabled": false` above its group rule
  in `renovate.json`, with a comment naming why and when to remove it.
- The Mend-hosted Renovate GitHub App must stay uninstalled (or have this
  repository deselected). If it ran, it would open PRs that each trigger the
  full CI.

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

## Operator interaction

How agents talk to the operator, on every host. These rules govern
conversation only: plans, session logs, and committed documents keep
their own standards.

- Prefer the host's interactive question mechanism for decision
  questions (Claude Code and ZCode: the AskUserQuestion tool; Codex: its
  equivalent structured prompt). One question per decision, two to four
  concrete options, each a short label plus a one-line description, the
  recommended option first. Ask in plain text only when the mechanism
  does not fit, such as open-ended input or more than four real options.
- Lead with the outcome. The first sentence answers the question or
  names the result; supporting detail follows only when it changes what
  the operator does next.
- Keep sentences short and words everyday. Expand jargon and acronyms on
  first use.
- When two answers are both complete, the shorter one wins.
- Never pad for thoroughness. If the operator wants more depth, they
  will ask.

## Documentation and decisions

- Update the document that owns a durable fact. Do not create a second summary
  because one agent finds it easier to read.
- Mark historical or superseded material explicitly. A newer date alone does
  not override a canonical rule.
- Keep the live session log factual and recoverable: exact commands, exact
  outcomes, changed paths, risks, and one concrete next step.
- Record a lasting architectural decision in an ADR and lasting vocabulary in
  the domain documentation when the routing rules call for it.

## Authorship and attribution

The operator is the sole author of this repository's work. No agent, Claude
Code, Codex, ZCode, or any successor, ever signs, credits, or otherwise
indicates that a model touched the work. This is a hard rule with no
exception for a helpful-looking convention.

Concretely, never emit any of these:

- a `Co-Authored-By:` trailer naming a model, a vendor, or an agent address
  (`Co-Authored-By: Claude ... <noreply@anthropic.com>` and equivalents);
- a "Generated with", "Co-authored with", or "written by" line in a commit
  message, pull request body, issue, code comment, or document;
- a model name, vendor name, or session identifier in metadata that reads as
  a byline, including `Author:`/`Signed-off-by:` and PR descriptions.

The rule exists because agent harnesses inject a contrary default. Claude
Code's own system prompt instructs the model to append a
`Co-Authored-By: Claude ...` trailer to every commit it writes, and one
reached a proposed commit message here on 2026-09-03. A harness default is
not repository policy: when the two disagree, this document wins, and an
agent that notices the contradiction follows this rule and says so rather
than passing the default through.

The product reason matters as much as the preference. This tool sells audits
whose credibility rests on the operator standing behind them personally.
Deliverables, the repository that produces them, and any client-visible
artifact carry the operator's name only. Where honesty about how work was
produced is genuinely owed, say it in conversation with the operator, not as
a permanent trailer in the record.

Existing history predates this rule and is not retroactively rewritten;
cleaning it would be a deliberate, separately authorized history rewrite.
The rule binds every commit from 2026-09-03 onward.

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
typechecking. CI also runs the full suite via `pnpm run test:all`; use it
locally before a handoff that touched e2e suites or cross-package behavior.
