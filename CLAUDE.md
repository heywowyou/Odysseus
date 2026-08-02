# Odysseus

Internal tooling for a productized web audit service sold to French small
and mid-size businesses. Two audit types share one engine: technical /
SPA-SEO, and accessibility against WCAG 2.2 AA and EN 301 549.

Full context: `docs/odysseus-project-brief-v2.md`. Read it before
proposing any architecture. Normalization behaviour and the reasoning
behind it: `docs/normalization-rules.md`. What the model may see, must
return, and how failures are handled: `docs/llm-layer-rules.md`.

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
   not a verdict on whether a law applies to a given client.

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
   effort level, for the same provenance reason the manifest records
   scanner versions.

6. **`packages/llm/src/output-schema.ts` is a hand-mirrored copy of the
   locked `llmOutputSchema`**, needed because the SDK's `zodOutputFormat`
   helper requires zod v4 and the locked contract is zod v3. It is an API
   shape hint, never the validation authority: `llmOutputSchema.parse()`
   runs explicitly on every response. A test asserts the two describe the
   same shape so drift fails loudly. If `core` ever moves to zod v4,
   delete the mirror and use the helper.

## Stack

Node 22, TypeScript strict, pnpm workspace, ESM.
Playwright (Chromium), `@axe-core/playwright`, Lighthouse as a Node
module, Mongoose 9, Zod, Commander, Vitest, pino, `@anthropic-ai/sdk`.

No Redis, no BullMQ, no Express API, no Next.js dashboard, no public web
interface. Those are later phases and are deliberately not being built.

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
- `llm` — the only package that talks to the Anthropic API. Peer of
  scanner, not a consumer: it depends on `core` and nothing else in the
  workspace.
- `cli` — Commander entry points, thin. Real logic lives in the packages
  above.

Five packages for a tool one person runs is close to the ceiling. If a
sixth is proposed, check that its one-sentence description does not
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

Tests never call the live Anthropic API. The LLM package is tested with
a stubbed client, including the path where retries are exhausted and the
call throws rather than returning a partial analysis. Live verification
is a manual step, and for anything client-facing it means reading the
output as the client would, not just checking that it validated.

Any fixture dev server started during a session must be stopped before the
session ends. Verify it is stopped with `pgrep` before reporting
completion.

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

Milestones 0 through 5 are complete. Milestone 6 is next. Work in
vertical slices, one milestone per session.

1. Render diff only, CLI invocable — done
2. Crawler: internal link discovery, robots.txt, depth and page caps — done
3. Scanners: axe-core and Lighthouse against one shared Chromium instance — done
4. Normalize and dedupe into MongoDB — done
5. LLM prioritization layer with schema validation — done
6. PDF report generation, bilingual

Full milestone list, including the phases beyond 6, is in the brief.

Do not start a milestone before the previous one has tests passing, and
do not consider a milestone finished until its output has been checked
against a real site rather than the fixture alone.
