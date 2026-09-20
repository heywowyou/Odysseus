# Re-measuring page-role classification fallback rates on persisted audit data

Research date: 9 September 2026. This document is the deliverable of issue
#163 (advisor plan 033, planned at commit `71da99a`). It is a spike record:
no production code was changed, and the measurement reads data that was
already on disk. Trade-off 74 in `docs/decisions/trade-offs.md` remains the
canonical statement of why classification is load-bearing; this note measures
whether the two follow-up commits moved its numbers.

## Boundary statement

No live third-party site was crawled for this measurement. The data sources
were the local, untracked `artifacts/` directories (read-only) and the
committed `fixtures/spa-demo` fixture, served on localhost by the existing
scanner e2e suite. No new hostname directory appeared under `artifacts/`, and
nothing under `artifacts/` or `fixtures/` was modified.

## Why a re-measurement was owed

Trade-off 74 measured, on a real 33-page hotel audit, that all 32 pages
carrying coverage came back `role: unknown` with `confidence: fallback`, so
the mandatory arm of Lighthouse selection fired site-wide and template-family
stratification removed nothing. Two follow-up commits added transactional
page-role signals afterwards, and nobody had re-measured their effect:

- `b318308` "Add external booking-link-out as a transactional page-role
  signal": adds the `external-transactional-link` signal kind plus
  `Hotel`, `LodgingBusiness`, `Resort`, and `BedAndBreakfast` to the content
  JSON-LD type table.
- `f0fff69` "Exclude site-wide chrome from the transactional link signal,
  name its reason honestly": anchors inside `header`, `footer`, `nav`, or an
  equivalent ARIA landmark no longer produce the link-out signal, and the
  reason codes now name which mechanism fired.

`git show --stat b318308 f0fff69` confirms both commits touched only
`packages/scanner/src/` files (plus their tests), matching the descriptions
above.

## The classifier's current signal set

All paths are relative to the repository root; line numbers verified on
9 September 2026 against the working tree (the drift check
`git diff --stat 71da99a..HEAD` shows neither scanner file changed since the
plan's base commit).

### Signal kinds (`packages/scanner/src/page-audit-profile.ts`)

The `PageRoleSignalKind` union lists twelve kinds (lines 29 to 41). Where
each comes from:

| Signal kind | Produced at | Evidence it reads |
| --- | --- | --- |
| `transactional-form` | lines 143 to 145 | Forms whose action, id, name, or class match the booking/checkout/contact pattern (extracted at lines 288 to 299) |
| `external-transactional-link` | lines 146 to 148 | A cross-origin anchor whose visible text matches the same pattern, outside site-wide chrome (extracted at lines 319 to 338; added by `b318308`, chrome exclusion added by `f0fff69`) |
| `pagination-relation` | lines 149 to 155 | `link[rel=next/prev]` or `a[rel~=next/prev]` |
| `numbered-pagination-control` | lines 156 to 158 | Numeric page-number links inside a pagination-labelled container |
| `listing-structural-class` | lines 159 to 164 | Body or html class tokens matching the listing pattern at lines 114 to 115 |
| `listing-json-ld-type` | lines 165 to 168 | JSON-LD `@type` in the listing table at line 102 |
| `content-json-ld-type` | lines 165 to 168 | JSON-LD `@type` in the content table at lines 103 to 113 (lodging types added by `b318308`) |
| `repeated-teaser-links` | lines 169 to 171 | Six or more near-identical repeated link structures (threshold at line 100) |
| `noindex-robots` | lines 172 to 174 | `meta[name=robots]` containing `noindex` |
| `canonical-elsewhere` | lines 223 to 225 in `buildPageAuditProfile` | Canonical href pointing at a different URL |
| `homepage-url` | line 226 | The crawl's own start URL context flag |
| `operator-seed` | line 227 | `discoveryMethod === 'seed'` context flag |

Site-wide chrome is defined by `SITE_WIDE_CHROME_SELECTOR` at lines 124 to
125 and checked by `anchorIsInSiteWideChrome` at lines 127 to 129; the
extraction closure inlines the same selector (issue #89 comment at lines 308
to 318) because an evaluate closure cannot reference module scope.

### Role outcomes (`packages/scanner/src/full-audit-plan.ts`, `classifyRole`, lines 92 to 160)

| Outcome | Confidence | Condition | Lines |
| --- | --- | --- | --- |
| `transactional` | `high` | `transactional-form` or `external-transactional-link` present | 108 to 118 |
| `unknown` | `fallback` | Strong listing evidence and a content JSON-LD type conflict | 124 to 133 |
| `listing` | `high` | Two or more distinct listing signal kinds (threshold at line 72) | 134 to 142 |
| `content` | `high` | `content-json-ld-type` present | 143 to 145 |
| `unknown` | `fallback` | Exactly one listing signal kind, reason `insufficient-listing-signals` | 146 to 155 |
| `utility` | `fallback` | `noindex-robots` or `canonical-elsewhere` only | 156 to 158 |
| `unknown` | `fallback` | No role signals at all, reason `no-role-signals` | 159 |

The transactional reason codes name the mechanism that actually fired:
`transactional-form-detected`, `transactional-link-out-detected`, or both
(lines 109 to 112).

### The mandatory Lighthouse arm (`isMandatoryRegardlessOfFamily`, lines 194 to 210)

A page is Lighthouse-mandatory regardless of template family if it carries
the homepage marker (lines 197 to 199), the `transactional` role (lines 200
to 202), or the operator-seed marker (lines 203 to 205), or if
`decision.confidence === 'fallback' || decision.role === 'unknown'`, which
returns reason code `unknown-or-fallback-role` (lines 206 to 208). The last
arm is the one that fired site-wide in trade-off 74 and still fires on every
fallback page measured below.

### Where decisions are persisted, and where signals are not

Role decisions reach disk only through `pages[].analysisCoverage` in the
audit manifest (`role`, `confidence`, `reasonCodes`, `templateFamilyId`,
`passes`). The `reasonCodes` array merges classification reasons with
stage-2 Lighthouse selection reasons (`homepage`, `unknown-or-fallback-role`,
`unique-template-family`, family representative codes). The raw
`roleSignals` and `RawPageAuditFacts` are never persisted: per-page
`scan.json` files carry scan results only (verified keys on a real page
directory: `url`, `renderDiff`, `axe`, `lighthouse`,
`transactionalFlowEvidence`, `transactionalFlowRedirectChecks`,
`transactionalFlowAmbiguities`, `headMetadata`, `canonicalTarget`,
`mixedContent`, `keyboardNavigation`, `formErrorHandling`, `videoCaptions`,
`altText`, `napConsistency`, `reflow`, `htmlValidity`, `structuredData`).
The classifier therefore cannot be re-run over old data; it can only be
observed through decisions persisted at scan time. Profiles are built during
the crawl at `packages/scanner/src/crawl.ts:662`.

## Distributions measured

A throwaway Node script (created, run, and deleted for this spike; no
dependencies) globbed `artifacts/*/*/manifest.json` and tabulated every
`pages[].analysisCoverage` entry. Nine manifests exist on disk: six
`www.briketenia.com` runs and three `www.villasfoch.fr` runs. No hostname
directory dated on or after 2026-09-09 exists.

The harness reproduced both pre-verified distributions exactly before any
number below was trusted:

- `www.briketenia.com/2026-09-08T01-03-04Z`: 32 page records, 32 coverage
  entries, `unknown/fallback` 24, `transactional/high` 8.
- `www.villasfoch.fr/2026-09-07T20-49-46Z`: 32 page records, 24 coverage
  entries (8 discovered-not-scanned without coverage), all 24
  `unknown/fallback`.

Full table. "Fallback share" is fallback entries over coverage entries. No
manifest on disk contains any `listing`, `content`, or `utility` role; every
coverage entry is either `unknown/fallback` or `transactional/high`.

| Manifest (hostname/timestamp) | Page records | Coverage entries | unknown/fallback | transactional/high | Fallback share | Distinct template families |
| --- | --- | --- | --- | --- | --- | --- |
| www.briketenia.com/2026-09-04T19-06-02Z | 33 | 32 | 32 | 0 | 100% | 18 |
| www.briketenia.com/2026-09-07T17-24-30Z | 33 | 33 | 0 | 33 | 0% | 20 |
| www.briketenia.com/2026-09-07T20-33-25Z | 33 | 33 | 25 | 8 | 76% | 20 |
| www.briketenia.com/2026-09-07T20-35-09Z | 33 | 33 | 25 | 8 | 76% | 20 |
| www.briketenia.com/2026-09-07T21-02-27Z | 33 | 33 | 25 | 8 | 76% | 20 |
| www.briketenia.com/2026-09-08T01-03-04Z | 32 | 32 | 24 | 8 | 75% | 20 |
| www.villasfoch.fr/2026-09-03T20-44-46Z | 32 | 28 | 28 | 0 | 100% | 11 |
| www.villasfoch.fr/2026-09-07T20-35-31Z | 32 | 24 | 24 | 0 | 100% | 12 |
| www.villasfoch.fr/2026-09-07T20-49-46Z | 32 | 24 | 24 | 0 | 100% | 9 |

Reason-code frequencies among fallback entries on the two named manifests
(remember these arrays also carry stage-2 selection codes):

- `www.briketenia.com/2026-09-08T01-03-04Z` (24 fallback entries):
  `insufficient-listing-signals` 20, `no-role-signals` 4,
  `unknown-or-fallback-role` 23, `unique-template-family` 22,
  `family-representative-cost-outlier` 1, `family-representative-stable` 1,
  `homepage` 1, `homepage-url-present` 1.
- `www.villasfoch.fr/2026-09-07T20-49-46Z` (24 fallback entries):
  `insufficient-listing-signals` 24, `unknown-or-fallback-role` 24,
  `unique-template-family` 24.

The classification-level codes are the first group: on villasfoch every
single coverage page failed listing classification with exactly one listing
signal kind, and on briketenia 20 of 24 did. The transactional arm now
catches 8 content-area pages on briketenia and nothing on villasfoch.

## Local fixture observation (spa-demo)

The plan's optional Step 3 was attempted within its boundaries. The existing
scanner e2e suite was run against the committed localhost fixture
(`pnpm test:e2e packages/scanner/src/scan-site.e2e.test.ts`, 5 of 5 tests
passed). Its planner-staging test observes role decisions for spa-demo in
memory: 4 pages, every page either the homepage or `unknown` with fallback
confidence, so all 4 are Lighthouse-mandatory. This step contributes no
table row because no persisted local manifest exists to tabulate: the
scan-site e2e holds decisions in memory only, and the write-audit e2e writes
its manifest into a scratch directory it deletes afterwards and does not
enable `fullAuditPlanning` (so that manifest carries no
`analysisCoverage` at all). No new scan pipeline was improvised. The
fixture's dev server was started and torn down by the suite's own global
setup, and `fixtures/` was left untouched.

## Comparison against trade-off 74

Trade-off 74's baseline: on a real 33-page hotel audit, all 32 pages
carrying coverage came back `role: unknown` with `confidence: fallback`
(100 percent of coverage pages), the mandatory Lighthouse arm fired
site-wide, and `unique-template-family` at 30 of 32 showed family grouping
collapsed.

Against the two named manifests:

- `www.briketenia.com/2026-09-08T01-03-04Z`: 24 of 32 coverage entries are
  still `unknown/fallback` (75 percent), with 8 of 32 now
  `transactional/high`. Fallback is no longer universal but still dominates,
  so the mandatory arm still fires on three coverage pages out of four.
- `www.villasfoch.fr/2026-09-07T20-49-46Z`: 24 of 24 coverage entries are
  `unknown/fallback` (100 percent). Unchanged from the baseline shape.

Combined: 48 of 56 coverage entries (86 percent) across the two named
manifests remain fallback. The measured sites differ from the audit trade-off
74 describes, so this is a directional comparison, not a controlled one.

The on-disk run history sharpens the picture within one site. The
briketenia run of 2026-09-04 has exactly the shape trade-off 74 describes
(33 page records, 32 coverage entries, all fallback); the trade-off text
does not name the site, so this is recorded as a shape match, not a confirmed
identification of that run. The run of 2026-09-07T17-24-30Z shows the
opposite extreme, 33 of 33 `transactional/high`, which matches the
over-correction `f0fff69`'s own message describes for the Briketenia re-scan
before the site-wide chrome exclusion landed (that commit is dated later the
same day). Every briketenia run from 20:33 UTC onwards, after `f0fff69`,
shows the settled 25 plus 8 or 24 plus 8 split. The manifests do not record
which code version produced them, so this timeline is correlation, not
proof. What it supports: the link-out signal moved exactly the 8 pages that
carry a content-area booking link-out, the chrome exclusion stopped it from
flooding the whole site, and nothing else moved. Family grouping remains
collapsed: briketenia's newest run still spreads 32 coverage pages over 20
distinct template families, and `unique-template-family` still appears on 22
of its 24 fallback entries.

## Recommendation

`role: unknown` with `confidence: fallback` still dominates the coverage
pages of both named manifests (75 and 100 percent; 86 percent combined), so
per the plan's decision rule this spike recommends a follow-up plan over the
classifier's signals. Candidate signal sources the prescan or crawl already
computes and persists, verified present in the measured manifests and page
directories:

- Crawl provenance and discovery method: `pages[].discoveryMethod`
  (observed values `link` and `sitemap-only`), `pages[].discoveredFrom`, and
  `pages[].depth` on every manifest page record.
- Sitemap paths: `crawl.sitemapCoverage` (declared, eligible, scanned, and
  cap-omitted counts) plus the `sitemap-only` discovery method.
- Transactional flow evidence per page: `scan.json` keys
  `transactionalFlowEvidence`, `transactionalFlowRedirectChecks`, and
  `transactionalFlowAmbiguities`.
- Booking and contact signals at site level: `siteSignals.hasTransactionalFlow`,
  `siteSignals.transactionalFlowEvidence`, and
  `siteSignals.transactionalFlowRedirectChecks`.

This spike does not design the fix. One measurement note the follow-up plan
should carry: because raw role signals are never persisted, the next
re-measurement can only stay directional unless the fix plan also persists
`roleSignals` alongside `analysisCoverage`, which would make the next
comparison exact.

## Measurement budget

This spike consumed effort M: one throwaway script, one e2e run, and this
document. Any classifier rework is its own plan and is out of scope here.

## Verification log

| Command | Result |
| --- | --- |
| `git diff --stat 71da99a..HEAD -- packages/scanner/src/full-audit-plan.ts packages/scanner/src/page-audit-profile.ts docs/decisions/trade-offs.md` | Exit 0. Only `docs/decisions/trade-offs.md` changed (+18 lines: unrelated amendments for issues #162 and #132). The trade-off 74 passage matches the plan's excerpt verbatim, and every cited code line number still holds, so the drift check passes. |
| `git show --stat b318308 f0fff69` | Exit 0. File lists printed for both commits; subjects match the plan's Current state section. |
| `git show b318308 -- packages/scanner/src/page-audit-profile.ts` | Exit 0. Shows the `external-transactional-link` kind, fact, and extraction being added. |
| `pnpm install` | Exit 0 (already up to date, pnpm 12.3.4). |
| `node scripts/tmp-role-remeasure.mjs` | Exit 0. Table covers all nine manifests; the two named manifests match the pre-verified distributions exactly. Script deleted afterwards; `git status --short scripts/` empty. |
| `pnpm run typecheck` | Exit 0, no errors. |
| `pnpm test` | Exit 0. 362 test files, 4018 tests, all passed. |
| `pnpm test:e2e packages/scanner/src/scan-site.e2e.test.ts` | Exit 0. 5 of 5 tests passed (spa-demo observation above). |
| `git status --short fixtures/` and `git status --short artifacts/` | Both empty. |
| `pnpm run format` | Run after this document was written; exit 0. |

Deliberate deviations from the plan's own git steps, both per dispatch
instructions: no `git add`, no commit, and no branch (the coordinating
thread commits), and `pnpm run check` was not run by this spike (the
coordinating thread runs the full gate).
