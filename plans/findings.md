# /improve deep — consolidated findings

Generated 2026-08-26, audited at commit `43060ce` on branch `fix/three-site-review`.
Depth: `deep` (whole-repo, all 9 playbook categories, up to 8 parallel category
subagents, LOW-confidence findings included).

**Status of this document**: all 8 category subagents have reported. Phase 3
vetting (opening every cited file myself before presenting) is complete for
**Test Coverage** and **Correctness**, and spot-checked for a few
cross-category items (`packages/interface/src/server.ts`,
`packages/store/src/persist-analysis.ts`, `packages/llm/src/merge.ts`,
`packages/scanner/package.json`'s lighthouse version). The remaining six
categories (Security, Performance, Tech Debt & Architecture, Dependencies &
Migrations, DX & Tooling, Docs, Direction) are reproduced here as reported by
their subagents, each already self-checked against the 32 documented
trade-offs that existed in `CLAUDE.md` at the time — there are 42 as of
2026-08-29, so an entry may now conflict with a trade-off nobody checked it
against. Full independent re-verification of every `file:line` in those
categories has not yet been done. Treat those as strong leads, not yet fully
vetted.

**Lifecycle:** this is a maintenance backlog, not a cross-agent session log
and not authority to override `CLAUDE.md`'s milestone order. Before acting on
an entry, re-verify it against current HEAD and record the selected scope in
`docs/session/current-session.md`. As findings are fixed, their sections are
deleted here so this file reflects what remains rather than a frozen audit
snapshot. Fixed so far: CORRECTNESS-01, CORRECTNESS-02, CORRECTNESS-03, CORRECTNESS-04,
SEC-01, SEC-02, SEC-03/DX-06, SEC-04, PERF-01, ARCH-03/DOCS-01, SEC-06,
TEST-01, TEST-02, TEST-03, TEST-04, TEST-07.
Still open: TEST-08 (new, found 2026-08-28), SEC-05/DEP-01 (Lighthouse 12→13 dependency/build work is done,
but the upgrade dropped rule-coverage.test.ts's recall ratchet from
87/196 to 78/172 after a live re-scan of sas-fernande.fr; closing the
remaining 9-rule gap needs a fresh decision, not a silent floor change —
left open on purpose), TEST-05/TEST-06 (deliberately deferred), plus
everything under Tech Debt & Architecture / Dependencies & Migrations /
Direction not yet independently re-vetted.

Recurring reviews of full-scan artifacts and client-facing PDFs use the
separate cross-site ledger in [`report-findings.md`](report-findings.md).

**New, not yet triaged**: separately, CI has never completed a full test
run on this repo (confirmed via `gh run list --branch main`: only 2 runs
exist total, both from this session). The first failed immediately on a
`pnpm/action-setup@v4` version conflict (fixed, see the CI log entry in
`docs/session/current-session.md`); the second got further and failed in
`packages/llm/src/build-input.test.ts` and several `packages/report`
template-section tests (33 test files / 150 tests failed) with `ENOENT`
reading `artifacts/sas-fernande.fr/2026-08-02T17-31-56Z/{findings.json,
manifest.json}`. Root cause: `fixtures/audits.json` curates several
real-scan directories under `artifacts/`, which is fully gitignored by
design (staleness incident, 2026-08-25) — nothing in
`.github/workflows/ci.yml` restores or regenerates that data, so it has
never existed on a clean checkout. Not fixed this session — needs a
decision, not a silent pick, since a naive "commit the artifacts" fix
would reintroduce the exact staleness problem `fixture-freshness.test.ts`
exists to prevent unless the freshness check travels with it. Plausible
options: (a) commit just the curated `fixtures/audits.json` directories as
a deliberate `.gitignore` exception, keeping `fixture-freshness.test.ts`
as the staleness guard; (b) skip/gate the tests that depend on these
fixtures when running in CI; (c) add a CI step that runs
`pnpm fixtures:refresh` against a running scan target before the test
step. Locally, `pnpm typecheck` is unaffected; only the fixture-backed
tests in `packages/llm` and `packages/report` fail in a fixture-less
environment.

---

## Correctness / Bugs

Clean bill of health reported (checked, not flagged): the LLM
invented-finding guard chain, legal-content splicing determinism, and the
crawl politeness core loop.

---

## Security

Full report recovered — evidence below is the subagent's own direct-read
citations, cross-checked by me against a few of the same files.

### [SEC-05 / DEP-01] `extract-zip` transitive advisory (via lighthouse → puppeteer-core) — verified likely dormant, and the dependency chain itself is gone in newer lighthouse
- **Evidence**: `pnpm audit --prod` flags `extract-zip` (moderate),
  pulled in transitively by lighthouse's `puppeteer-core` dependency.
  Per CLAUDE.md, Lighthouse is driven via a remote debugging port against
  the Playwright-launched Chromium (`packages/scanner`), not via
  `puppeteer-core`'s own browser-download/launch path — confirmed by grep:
  no `puppeteer`/`@puppeteer/browsers`/`extract-zip` imports anywhere in
  `packages/scanner/src`. So the vulnerable code path (unzipping a
  downloaded Chromium binary) is present in `node_modules` but never
  executed at runtime.
- **Follow-up verification** (done after the initial report): current pin
  is `lighthouse: ^12.8.2` (`packages/scanner/package.json:22`), whose
  `puppeteer-core@24.43.1` depends on `@puppeteer/browsers@2.13.2`. Newer
  `lighthouse@13.4.1`'s `puppeteer-core@25.3.0` depends on
  `@puppeteer/browsers@3.0.6`, whose own dependency list
  (`{ yargs, modern-tar }`) **no longer includes `extract-zip` at all** —
  it moved to `modern-tar`. So upgrading to lighthouse 13 removes the
  advisory outright rather than just leaving it dormant. Caveat:
  `lighthouse@13` requires `node >=22.19` (current pin only needs
  `>=18.16`) — check this repo's actual Node version before treating the
  upgrade as a trivial bump.
- **Effort**: S (verify Node version compatibility, bump lighthouse,
  re-run `pnpm audit --prod`). **Risk**: LOW-MED (a Lighthouse major
  version bump; re-verify no output-shape changes affect
  `LIGHTHOUSE_EXCLUDED_AUDITS`, trade-off 1). **Confidence**: HIGH.

### [SEC-07] `nanoid <3.3.18` advisory — confirmed dev-only, no action needed
- Transitively via `html-validate` → `vitest`. Never shipped or executed
  in the CLI/interface/scanner runtime paths. Recorded so the audit trail
  shows it was checked and correctly deprioritized. **Confidence**: HIGH.

### Areas checked with no findings above LOW confidence (Security)
- **Credential hygiene**: `.env` is gitignored and was never committed
  (`git log --all -- .env` empty); `.env.example` has only placeholders;
  no hardcoded keys found via grep across `packages/*/src`.
- **Injection**: only one `execFileSync` call in the whole codebase
  (`packages/scanner/src/artifacts/manifest.ts:28`, fixed literal args,
  `git rev-parse --short HEAD`) — no user input reaches it. No other
  `exec`/`spawn` calls exist anywhere.
- **XSS in the PDF report**: `html-utils.ts`'s `escapeHtml`/`escapeProse`
  applied consistently at every interpolation point checked
  (findings-appendix, themes, executive-summary, severity-badge,
  reference-stat-note), including scan-derived data and LLM-generated
  prose. Holding up well despite being a locked-contract-adjacent area
  (trade-offs 8/11).
- **XSS in the dashboard client**: `app-shared.ts`'s `escapeHtml`
  consistently applied in `app-audit.ts`/`app-history.ts`/`app-progress.ts`
  for all scan-derived strings written via `innerHTML`; site URLs go
  through `textContent`, not `innerHTML`.
- **Path traversal**: `routes/static.ts:26-31` correctly resolves the
  requested path against the real filesystem `publicDir` and rejects
  anything escaping it (`path.resolve` + `startsWith`). `buildAuditDir`
  derives its hostname segment via `new URL(...).hostname`, which the
  URL parser normalizes — no raw `..//` survives into a hostname.
- **PII/logging**: no `console.*`/logger calls in
  `packages/interface/src/sirene/*` or `prospecting/*` that would log
  SIREN numbers, prospect emails, or addresses.
- **Input validation at API boundaries**: every route file does
  hand-rolled but genuinely careful shape checking (SIREN checksum, URL
  parsing, enum checks) before touching the database — no mass-assignment
  pattern found.
- **Access control / IDOR**: no per-user/per-tenant ownership model, by
  design (single-operator tool, confirmed in CLAUDE.md) — absence of
  ownership checks on `/api/audits/:auditId` is consistent with that
  design, not a gap. The real gap is SEC-01 (no confirmation the caller
  is the operator at all), not object-level authorization between users.
- **Cookies/CSP on the dashboard**: no cookies are set anywhere in
  `packages/interface`, so cookie-flag findings don't apply. No CSP
  header on the dashboard's own HTML, but given the consistent escaping
  above and the loopback/single-operator threat model, this reads as
  defense-in-depth, not an active vulnerability — not scored as a
  standalone finding since SEC-01/SEC-02 already cover the exploitable
  paths.

---

## Performance

Full report recovered. The codebase is unusually well-engineered for
performance already — dedupe/aggregation, severity rollups, and
merge/alias logic are deliberately Map-keyed with doc comments explicitly
citing N+1 avoidance (e.g. `getSeverityRollups`,
`packages/store/src/severity-rollup.ts:28-31`). Most playbook subcategories
turned up nothing above LOW confidence; one clear issue stood out.

### Other subcategories — nothing above LOW confidence (Performance)
- **N+1 / wrong complexity**: none found. `scan-site.ts`/`scan-page.ts`
  correctly hoist every site-level fetch (sitemap, `llms.txt`, security
  headers, CrUX, cookie consent) out of the per-page loop, with doc
  comments explaining why. `translation-clusters.ts:165` has an
  `O(links²)` `.find()` inside a per-hreflang-link loop, but
  `page.hreflangLinks` is bounded to a handful of language variants in
  practice — not worth a fix.
- **Caching gaps**: none found; `RedirectHostCache` in
  `transactional-flow.ts` and the "fetch once, attribute to homepage"
  patterns in `scan-site.ts` already cover the obvious cases.
- **Payload size**: `listJobs` defaults to `limit(200)`
  (`packages/store/src/jobs.ts:117-120`); `/api/scans` batches severity
  rollups via one `$group` aggregation, not per-row queries. No unbounded
  list responses found.
- **Backend/queue**: single shared `mongoose.createConnection()` per
  process is appropriate for a single-user private server. Indexes look
  deliberately matched to query patterns (compound `{auditId, severity}`,
  `{siteUrl, dedupeKey}`, `{status, createdAt}`, etc.) — nothing implying
  a missing index.
- **CI/build**: `pnpm install --frozen-lockfile` with `cache: pnpm`
  already set up (confirmed in `.github/workflows/ci.yml` by direct
  read); `vitest.config.ts` uses a single workspace-wide glob with no
  `fileParallelism: false`, so Vitest's default parallel file execution
  already applies — no serial-suite finding.

---

## Test Coverage

Fully vetted — subagent ran `pnpm typecheck` (clean) and `pnpm test` (186
passed / 9 skipped files, 1507 tests passed, 42 skipped — all skips are
`packages/store` integration tests requiring local Docker Mongo, which CI's
`mongo-test` service does run) directly and reported real output, not
inference.

### [TEST-08] `severity-rollup.test.ts` asserts absolute counts against a database it never cleans, so it passes only on a fresh Mongo volume
- **Evidence**: Found while running the full suite for milestone 9c plan 007,
  and unrelated to that work (`git status` shows no `packages/store/src/severity-rollup*`
  change). The file's header comment deliberately skips `dropDatabase`, on the
  reasoning that "unique auditId/dedupeKey values per test keep this file's
  assertions valid without exclusive DB ownership". Only `findingId` and
  `dedupeKey` are randomized; the `auditId` values (`rollup-1`, `rollup-2`,
  `rollup-3`) are constants, so every run inserts another finding under the same
  audit and the counts grow monotonically. Observed `moderate` going 1, then 2,
  then 3 on three consecutive runs, failing at
  `packages/store/src/severity-rollup.test.ts:89`. `pnpm run test:store:down`
  keeps the volume (no `-v`), so the state survives the documented teardown; the
  suite went green again only after `docker compose down -v`.
- **Impact**: The store suite fails on every run after the first on a developer
  machine, and the failure looks like a severity-mapping regression rather than
  leftover data. CI never sees it because each job starts a fresh service
  container, which is also why it has gone unnoticed.
- **Fix shape**: give the file per-run unique `auditId` values (the mechanism its
  own comment already relies on), or delete just this file's own audits in an
  `afterAll`. Do not add a second `dropDatabase` - the header comment records a
  real race against the other Docker-gated files sharing the database.
- **Effort**: S. **Risk**: LOW. **Confidence**: HIGH (reproduced three times,
  and the counts increment by exactly one insert per run).

### [TEST-05] `scan-page.ts`/`scan-site.ts` — highest-churn scanner files (17/14 changes in 60 days) — have only slow real-browser e2e coverage
- **Evidence**: No `scan-page.test.ts`/`scan-site.test.ts` exist, only
  `.e2e.test.ts` pairs. `scan-site.e2e.test.ts` alone took 150.7s of the
  157s total suite run. Compare `crawl.ts` (12 changes), which has both a
  fast unit test and an e2e test.
- **Impact**: Pure-logic bugs (error branching, page-limit/depth logic,
  concurrency lane assignment, per-page delay enforcement) can only be
  caught by a 150s real-Chromium run — no fast feedback loop for the two
  highest-churn files in the scanner package.
- **Effort**: M. **Risk**: MED (needs care extracting seams without
  changing behavior; some logic genuinely can't be unit tested).
  **Confidence**: MED.

### [TEST-06] `write-audit.ts` (446 lines, 14 changes in 60 days) has zero unit test coverage
- **Evidence**: `packages/scanner/src/artifacts/write-audit.ts` exports
  `writeAuditArtifacts` plus pure helpers (`deriveSiteName`,
  `deriveSiteNameFromTitleFrequency`, `buildSiteSignals`). No
  `write-audit.test.ts` exists; a sibling `derive-site-name.test.ts` covers
  a *different* file. Only a `write-audit.e2e.test.ts` exists.
- **Impact**: This writes the locked artifacts layout (`manifest.json`,
  `findings.json`, `pages/*`, relative screenshot paths, hreflang cluster
  storage, prospecting site-signals). A regression would only surface via
  the slow e2e path, or worse, a real scan whose output looks fine until
  read from another machine.
- **Effort**: M. **Risk**: LOW. **Confidence**: MED.

### Considered and rejected (test coverage)
- Deeper unit tests for `packages/report/src/template/strings/fr.ts`/`en.ts`
  (highest-churn files in the repo) — rejected: these are translation
  tables, already covered by structural-invariant tests
  (`render-lint.test.ts`, guillemet-spacing, spacing-tokens); per-string
  unit tests would be the wrong shape.
- Low direct test coverage in `packages/site` and `packages/cli` — rejected:
  matches the documented package boundaries (site is a standalone
  marketing app outside the build graph; cli is deliberately thin, real
  logic lives in `core`/`scanner`/`llm`/`report` where it's actually tested).

---

## Tech Debt & Architecture

Reported by subagent, self-checked against the 32 trade-offs (confirmed
several candidates were correctly self-rejected as already-deliberate: the
zod v3/v4 mirror files, dedupe's two-pass design, `core`'s `readFileSync`
calls). Full finding-by-finding evidence text for anything beyond the
now-fixed logging gap was not retained verbatim through compaction.

---

## Dependencies & Migrations

### [DEP-01] `extract-zip` transitive advisory is fixable by upgrading Lighthouse 12 → 13
- See SEC-05/DEP-01 above (Security section) — same finding. Follow-up
  verification confirmed lighthouse 13's dependency chain
  (`puppeteer-core@25.3.0` → `@puppeteer/browsers@3.0.6`) drops
  `extract-zip` entirely (moved to `modern-tar`), so the upgrade removes
  the advisory rather than just leaving it dormant. Caveat: `lighthouse@13`
  requires `node >=22.19`; current pin only needs `>=18.16` — confirm the
  actual Node version in use before treating this as a trivial bump.

Other dependency findings from this subagent's report were not retained
verbatim through compaction.

### Checked, no finding: `packages/site` build-graph isolation
- Confirmed by direct grep: no package imports `@odysseus/site`, and
  `packages/site/src` has zero `@odysseus/*` imports. Root `tsconfig.json`'s
  `references` array does not include `packages/site`. This matches
  CLAUDE.md's claim exactly ("not part of the `tsc -b` build graph... does
  not import from and is not imported by any of them") — checked and
  holding, not drifted.

### Checked, no finding: report package's Chromium browser lifecycle
- `packages/report/src/index.ts:54,84` — `launchBrowser` from
  `@odysseus/scanner` is called once and `browser.close()` is called
  inside a `finally` block; `pdf.ts:217` closes its `context` the same
  way. Matches CLAUDE.md's "reuses scanner's browser lifecycle rather
  than adding Puppeteer as a second dependency" claim — no leak found.

---

## DX & Tooling

No open findings — the two items this section held (raw error messages
returned to API clients; missing `pino` documentation) are both fixed:
the global error handler now logs server-side and returns a generic
message, and `pino` is genuinely wired into `packages/interface`.

---

## Docs

No open findings.

---

## Direction (features & roadmap)

Presented separately per the playbook — these are options for the
maintainer to weigh, not bugs to rank. Full evidence text for this
category's 2-4 grounded suggestions was not retained verbatim through
compaction; re-fetch before treating this section as final.

---

## Known cross-category duplicates (already reconciled above)

1. **SEC-05 = DEP-01** — `extract-zip` transitive advisory, resolved by
   Lighthouse 12 → 13 (which drops the dependency entirely, not just
   makes it dormant). Confirmed by direct read of the current pin and the
   newer version's dependency tree.

## Gaps in this document (be aware before planning from it)

**Resolved since the first pass**: the user recovered the full terminal
transcript for the **Security** and **Performance** subagents, which is now
incorporated above in full (SEC-01 through SEC-07 plus "areas checked, no
findings"; PERF-01 plus other subcategories checked). The `pino`/logging
finding (DOCS-01/ARCH-03) also got a concrete grep-confirmation. The
`extract-zip` fix (SEC-05/DEP-01) got a deeper follow-up verification
(lighthouse 13 drops the dependency, not just makes it dormant, but needs a
Node-version check first).

**Still outstanding**: full finding-by-finding evidence for **Tech Debt &
Architecture** (beyond ARCH-03), **Dependencies & Migrations** (beyond
DEP-01), and **Direction** (entire category) was not preserved verbatim
through this session's context compaction and has not been independently
re-vetted by me. Before writing a plan against one of those, either re-open
the cited files directly or re-run that category's subagent to regenerate
the full finding text.
