# Odysseus

Internal tooling for a productized web audit service sold to French small
and mid-size businesses. Two audit types share one engine: technical /
SPA-SEO, and accessibility against WCAG 2.2 AA and EN 301 549.

Full context: `docs/odysseus-project-brief-v2.md`. Read it before
proposing any architecture. Normalization behaviour and the reasoning
behind it: `docs/normalization-rules.md`. What the model may see, must
return, and how failures are handled: `docs/llm-layer-rules.md`.

Client-facing legal claims are governed by `docs/obligation-basis.md`;
nothing legal may be stated anywhere in the product unless it appears
there with status `primary`. Odysseus's own regulatory position (AI Act,
electronic invoicing, the perimeter of legal advice, prospecting channel
rules) is `docs/operator-obligations.md`. Prospecting is governed by
`docs/prospect-qualification.md` (who may be scanned and contacted) and
`docs/outreach-rules.md` (what may be said). Pricing and offer framing:
`docs/offer-positioning.md`.

## Non-negotiable rules

1. **Deterministic scanners detect. The LLM explains, groups, prioritizes,
   and translates.** The model may never introduce a finding absent from
   its structured input. This single rule is the credibility of the whole
   business.
2. Every finding traces back to a scanner rule ID and an affected element.
3. All LLM output is validated with Zod. Any response referencing a
   finding ID not present in the input is rejected, logged, and retried.
   See `packages/core/src/types/llm-output.ts`.
4. The LLM never receives raw HTML or full page content. Normalized
   findings plus site context only.
5. Crawling is polite: respect robots.txt, identifiable user agent,
   delay between requests, hard page cap, hard per-page timeout. The
   delay is enforced between scanner passes on a page as well, not only
   between crawl requests.
6. Never overstate legal exposure in any generated text. Accessibility
   obligations depend on company size and sector. State the criterion,
   not a verdict on whether a law applies to a given client. This is the
   "we report, we do not conclude" rule: reproduce the criteria, state
   the company's own registry data, describe where the case law stands
   including the current split between courts, and recommend confirming
   scope with a lawyer. Never state that a specific business is bound,
   never give a deadline, never state a sanction amount for that client,
   never present scope as settled. Binds report templates and the
   outreach LLM prompt equally. Full rule and legal basis:
   `docs/obligation-basis.md` section 7 and `docs/operator-obligations.md`
   section 2.

## Locked contracts, do not modify without asking

- `packages/core/src/types/findings.ts` — findings model v1
- `packages/core/src/normalize/severity.ts` — severity mapping
- `packages/core/src/types/llm-output.ts` — LLM schema and guards

Every downstream layer reads these shapes. Changing them invalidates
stored audits and breaks monitoring diffs. If a change is genuinely
needed, say so and stop. Do not change them and continue.

## Known trade-offs, do not silently reverse

1. **Lighthouse's `accessibility` and `best-practices` categories emit no
   findings**, decided in Milestone 4. `accessibility` is axe-core
   underneath, and axe already scans WCAG 2.2 AA directly against the same
   page, so emitting both produced duplicate findings with two different
   severity mappings for the same rule. `best-practices` bundles unrelated
   concerns (HTTPS usage, deprecated APIs, console errors, image aspect
   ratio) that have no correct home among the four locked
   `FindingCategory` values; forcing one onto a client-facing report
   section mislabels it. Both category scores are still recorded per page
   in the audit manifest (`ManifestPageEntry.lighthouseExcludedCategoryScores`),
   so the numbers are not lost, only unused for findings.

   Category-level exclusion is not sufficient on its own. Lighthouse files
   some accessibility audits under `seo` as well, so `image-alt` arrived
   through the allowlisted path and duplicated axe's own `image-alt` with
   a different severity. `LIGHTHOUSE_EXCLUDED_AUDITS` in `constants.ts`
   suppresses individual audit IDs that axe already reports, regardless of
   which category surfaces them. Add to that list only rules whose overlap
   has been confirmed against real scanner output, not assumed.

   This is why `heading-order` (documented in
   `docs/manual-accessibility-checklist.md` as a confirmed axe detection
   gap, tagged best-practice rather than WCAG) remains a real gap rather
   than something a future session should "fix" by re-adding Lighthouse's
   accessibility category. `best-practices` gets a deliberate per-audit-id
   mapping table in Milestone 8, alongside the custom checks. Do not
   re-enable either category for finding emission without that argued
   change.

2. **Screenshot pruning has one canonical implementation.**
   `packages/scanner/src/artifacts/prune-screenshots.ts`'s
   `selectPageDirsToKeep` / `pruneScreenshots` is the single place that
   decides which page screenshots survive a scan (always the homepage,
   plus the top N pages by render-diff `missingPercent`). Report
   generation (Milestone 6) must import and call these functions rather
   than reimplementing the selection logic, or the report will eventually
   ask for a screenshot the scan already deleted.

   The rationale is data minimisation, not disk space. Full-page
   screenshots of a client site incidentally capture personal data, and
   not capturing is a stronger position than deleting later.

3. **Dedupe and aggregation are two separate passes, deliberately.**
   `computeDedupeKey` (`source|ruleId|selector`) collapses the _same
   selector across pages_, so a footer contrast failure appearing on
   eleven pages becomes one finding with a count.
   `aggregateSamePageOccurrences` collapses _different selectors within a
   single page_ for the same source and rule, because axe emits distinct
   positional selectors for rules like `link-in-text-block`, and sixty
   nine instances of one defect on one page otherwise become sixty nine
   separate findings each with `occurrences: 1`.

   Aggregation runs only on fine groups confined to exactly one page.
   Multi-page groups pass through untouched with their original
   `dedupeKey`. Do not merge the two passes: they use different keys for
   different reasons, and cross-run identity for the monitoring tier is
   `dedupeKey`, so it matters which pass produced it.

   Selector normalization was considered and rejected. Stripping
   `:nth-child()` would merge genuinely distinct elements, and a real
   scan confirmed that stable selectors dedupe correctly without it.

4. **Non-HTML resources are never crawled as pages.** A real WordPress
   site linked four `wp-content/uploads/*.jpg` attachment URLs from its
   gallery, and each one cost a full render, an axe pass, and a Lighthouse
   pass, producing findings against binary content. Links are dropped by
   extension before being enqueued (`links.ts`), with a Content-Type check
   in `crawl.ts` as a fallback for URLs whose extension reveals nothing.
   Extension-dropped URLs never appear in the manifest at all; only the
   Content-Type path records `skipped-non-html`.

5. **Analyses are inserted, never upserted.** `persistAudit` upserts by
   `auditId` because an audit re-run under the same ID is a retry of the
   same work. `persistAnalysis` inserts, because an analysis re-run is
   not: one per language, and again after a prompt change, are all
   legitimately distinct documents. Each records its model identifier and
   temperature, for the same provenance reason the manifest records
   scanner versions.

6. **The LLM is not called when a scan has not produced enough to justify
   it**, decided 2026-08-03. Two gates: a conservative audit fallback
   (falls back to a static template only when there is no critical or
   serious finding and fewer than 5 moderate findings) and a stricter
   prospecting worthiness gate before spending a call on outreach
   generation (at least one critical finding, or two serious, or a page
   with render diff missing 50 percent or more). Full thresholds and
   reasoning in `docs/llm-layer-rules.md` section 10. Both gates score
   findings using the existing `SEVERITY_ORDER` weights rather than a new
   scale, and count distinct findings rather than occurrences. Do not
   remove either gate to "always get a full analysis" without revisiting
   the reasoning there first.

7. **`packages/llm/src/structure-output-schema.ts` and
   `writing-output-schema.ts` are hand-mirrored copies of their
   respective non-locked Zod schemas**, needed because the SDK's
   `responseFormatFromZodObject` helper requires zod v4 and this
   workspace is zod v3. Each is an API shape hint, never the validation
   authority: `structurePassOutputSchema.parse()` /
   `writingPassOutputSchema.parse()` run explicitly on every response.
   A test asserts each mirror and its Zod schema describe the same
   shape so drift fails loudly. If `core` ever moves to zod v4, delete
   the mirrors and use the helper.

8. **Findings the LLM cannot give good advice about are diverted before
   the structure pass, not passed in with a prompt instruction to be
   careful**, decided during the report v2 refactor (2026-08-07) after a
   real second-client scan (haaitza.com) put SEO advice about indexing a
   third-party Facebook embed at rank 1 of the whole report.
   `packages/llm/src/diversion.ts`'s `partitionFindings` removes findings
   confined entirely to wrapper pages (`missingPercent >= 95`) or to a
   `noindex`-legal-page URL pattern before they ever reach
   `buildStructureInput`. Diverted findings are not dropped: they render
   in a fixed-copy "Observations" section in the report template, built
   from the same `partitionFindings` call against the same
   `findings.json` and `manifest.json`, so the report's account of what
   was diverted can never drift from what the model actually saw.
   `packages/report` depends on `packages/llm` specifically for this
   function; that dependency edge exists so there is exactly one
   implementation of the diversion rule, not two hand-synced ones. Do not
   revert to explaining these findings to the model instead of filtering
   them, and do not duplicate the predicate in `packages/report` instead
   of importing it. Similarly, `legalRelevance` on an accessibility theme
   is built by `packages/llm/src/legal-relevance.ts` from a code-owned
   WCAG criterion name table, never written by the writing pass (which
   has no field for it at all) — the model choosing zero words of a legal
   claim is the point. Full defect list and reasoning in
   `docs/report-v2-refactor.md`.

9. **`packages/report`'s template is hand-maintained CSS, not Tailwind**,
   since the same 2026-08-07 refactor. The compiled-Tailwind approach from
   milestone 6 is gone: no `tailwind-input.css`, no `build:css` script, no
   `tailwindcss`/`@tailwindcss/cli` dependency. `report.css` is written
   directly, ported from a hand-designed, print-verified prototype
   (`docs/report-v2-prototype-haaitza-fr.html`) rather than derived from
   utility classes. Do not reintroduce a Tailwind build step for this
   package without first checking whether the prototype's design system
   (color tokens, badge/scale/tile components, print rules) still covers
   the need; it was chosen specifically because re-deriving that design
   in a utility framework risked drifting from the one version that was
   actually print-tested.

10. **Scan-phase concurrency runs pages in lanes, not the crawl.** Shipped
    2026-08-07. The crawl stays sequential; render-diff, axe, and Lighthouse
    now run across `SCAN_CONCURRENCY` lanes (default 3) instead of one page
    at a time, with the per-origin politeness delay unchanged in every lane,
    per the "concurrency, not a shorter delay" rule already in the project
    brief. Lighthouse calls are additionally serialized behind a small
    in-process queue even though the lanes themselves run in parallel:
    concurrent `lighthouse()` calls collide on Node's process-global
    `perf_hooks` marks, confirmed 100% reproducible against the spa-demo
    fixture, and unrelated to the CDP debug port each lane already gets its
    own connection to. Do not remove that serialization queue to "let
    Lighthouse run in the lanes too" without re-confirming the collision is
    gone; `scanConcurrency` is recorded on `AuditConfigSnapshot` for the
    same provenance reason other scan config fields are.

11. **Argument B (the legal content) is a deterministic splice, in both
    the report and outreach, never model prose**, decided 2026-08-15
    alongside `docs/obligation-basis.md`, `docs/operator-obligations.md`,
    and `docs/outreach-rules.md`. `assessObligations()` produces the
    criteria, the company's registry data, and the case-law position as
    fixed text; the compliance section of the report and milestone 9c's
    outreach draft both splice that text in unmodified rather than asking
    the model to write around it carefully. A validator confirms the
    spliced block is byte-identical to what `assessObligations()`
    produced before a report renders or a draft is created; a mismatch is
    discarded, not repaired, on the same reasoning as the
    language-compliance guard elsewhere in the LLM layer. Do not revert
    to a prompt instruction telling the model to "be careful" with legal
    claims instead of withholding the pen entirely; that was tried once
    already for wrapper-page and noindex findings (trade-off 8) and
    failed for the same reason it would fail here.

## Stack

Node 22, TypeScript strict, pnpm workspace, ESM.
Playwright (Chromium), `@axe-core/playwright`, Lighthouse as a Node
module, Mongoose 9, Zod, Commander, Vitest, pino, `@mistralai/mistralai`.

No Redis, no BullMQ, no Express API, no Next.js dashboard, no public web
interface to the audit engine itself. Those are later phases and are
deliberately not being built. `packages/site` (added 2026-08-07) is not
an exception to this: it is a standalone Next.js marketing/bot-info site
with no access to the queue, the database, or any other package, not a
public front end for the tool.

PDF generation uses Playwright's Chromium, not Puppeteer. One browser
dependency, not two.

Lighthouse cannot accept a Playwright `Page`. Launch Chromium with a
remote debugging port and pass that port to Lighthouse, reusing the same
browser instance used for rendering and the axe pass. Playwright makes
at most two explicit loads per page (once raw, once rendered). Lighthouse
adds its own internal navigation on top of that when run in navigation
mode. That extra load is unavoidable and required to produce trace based
Core Web Vitals (LCP, CLS, INP). Snapshot mode was considered and
rejected because it cannot produce those metrics.

## Packages

- `core` — locked contracts plus pure normalization. No I/O, no database
  driver. This package is defined by the contracts it holds; keep live
  infrastructure out of it.
- `scanner` — owns the Chromium lifecycle, render diff, crawler, axe,
  Lighthouse, config, and the artifacts layout.
- `store` — Mongoose models and connection handling. Nothing else.
- `llm` — the only package that talks to the Mistral API. Peer of
  scanner, not a consumer: it depends on `core` and nothing else in the
  workspace.
- `report` — renders a stored analysis and the findings appendix into a
  branded, bilingual PDF via Playwright's Chromium, reusing `scanner`'s
  browser lifecycle rather than adding Puppeteer as a second dependency.
- `interface` — runs the job queue and a small private HTTP server that
  serves the single-user dashboard. The only package that binds a
  network port.
- `cli` — Commander entry points, thin. Real logic lives in the packages
  above.
- `site` — the public marketing site and bot-information page at
  odysseusaudit.com, added 2026-08-07. A standalone Next.js app deployed
  separately to Vercel, not part of the `tsc -b` build graph the other
  packages share, and does not import from and is not imported by any of
  them. Exists so `ODYSSEUS_USER_AGENT` points at a domain that actually
  resolves, per the crawling-politeness rule.

Eight packages for a tool one person runs is close to the ceiling. If a
ninth is proposed, check that its one-sentence description does not
overlap an existing package before agreeing.

## Artifacts layout

```
artifacts/<hostname>/<ISO-8601-UTC-timestamp>/
  manifest.json
  findings.json
  pages/<slug>-<6-char-url-hash>/
    raw.png
    rendered.png
    scan.json
  analyses/<ISO-timestamp>-<language>.json
```

One `analyses/` file per run rather than one per audit, since multiple
analyses per audit are expected and must not overwrite each other.

Screenshot references are relative to the audit directory, never absolute
paths, so stored findings survive the artifacts root moving or the
database being read from another machine. The manifest and the `audits`
collection share one type, which is what lets `normalize <dir>` re-run
offline against any artifacts folder with no database attached.

Tool versions in the manifest are self-reported by the tools themselves
(`testEngine.version`, `lighthouseVersion`) rather than read from
installed `package.json` files, so they record what actually ran. Not
retrofittable onto stored audits, and the monitoring tier depends on them
to tell a real regression from a scanner upgrade.

## Scope discipline

This is a command-line tool. Do not scaffold an API, a queue, a UI, or a
public-facing scanner unless explicitly asked. Do not add dependencies
without asking first. Prefer standard library and existing dependencies.

When a task is ambiguous, ask rather than assuming. Inventing structure
is worse than pausing.

## Testing

Run against `fixtures/spa-demo`, a local client-rendered React app with
deliberately seeded faults. Never run development scans against live
third-party sites. Vitest for unit tests, with scanner output fixtures
committed so tests do not require a browser.

The fixture is two pages and cannot exercise everything. Both bugs found
after Milestone 4 (attachment URLs crawled as pages, positional selectors
defeating dedupe) passed the entire test suite and were visible only in a
real-site scan. Saved artifacts under `artifacts/sas-fernande.fr/` are
real-site reference data; `normalize <dir>` re-runs against them offline
without touching the site.

Tests never call the live Mistral API. The LLM package is tested with
a stubbed client, including the path where retries are exhausted and the
call throws rather than returning a partial analysis. Live verification
is a manual step, and for anything client-facing it means reading the
output as the client would, not just checking that it validated.

Any fixture dev server started during a session must be stopped before the
session ends. Verify it is stopped with `pgrep` before reporting
completion.

## MCP servers

Start Claude Code sessions in this repo with `codysseus` (alias for
`./scripts/dev.sh`), not a bare `claude`, so `.env` is sourced and the
MCP servers below authenticate correctly.

Three MCP servers are available during development:

- **context7** — current documentation for any library in the stack.
- **mongodb-readonly** — a read-only view into the Atlas cluster, through
  a dedicated read-only database user separate from the app's own
  pro_db_user, for inspecting real findings and audit data while
  debugging.
- **playwright** — a separate Playwright instance for ad hoc, local page
  inspection during development: the dashboard UI, the spa-demo fixture,
  or a real page while writing a milestone 8 custom check. Not wired
  into the scanner package's own Playwright dependency.

Both mongodb-readonly and playwright are set to ask before every call,
not auto-allow. mongodb-readonly can read real audit and prospect data;
playwright can navigate to arbitrary URLs, including live client or
prospect sites. Each call is approved before it runs.

## Style

- TypeScript strict, no `any`, explicit return types on exported functions.
- Plain language in every user-facing string. No jargon, no acronyms
  without expansion on first use.
- All user-facing strings must support French and English from the start.
  Structure them accordingly, do not hardcode English and retrofit.
- No em dashes or en dashes in generated text, code comments, or report
  copy.
- Comments explain why, not what.

## Build order

Milestones 0 through 8 are complete. Milestone 9a is next. Work in
vertical slices, one milestone per session.

1. Render diff only, CLI invocable — done
2. Crawler: internal link discovery, robots.txt, depth and page caps — done
3. Scanners: axe-core and Lighthouse against one shared Chromium instance — done
4. Normalize and dedupe into MongoDB — done
5. LLM prioritization layer with schema validation — done
6. PDF report generation, bilingual — done
7. Interface: queue and a private single-user dashboard (`odysseus serve`) — done
8. Custom checks: meta/canonical/JSON-LD/sitemap/hreflang/heading-hierarchy plus the extended accessibility pass (keyboard traps, focus order, form error handling, video captions, alt-text heuristic) — done

Milestone 9 (originally "prospecting mode") was split 2026-08-15 into
9a (prospect acquisition and qualification), 9b (prospecting
throughput), and 9c (outreach generation); milestones 10 through 13
(benchmark study, regime 2 documentation generator, free scope check,
monitoring) follow. Full milestone list, including the phases beyond 8,
is in the brief, section 7.

Do not start a milestone before the previous one has tests passing, and
do not consider a milestone finished until its output has been checked
against a real site rather than the fixture alone.
