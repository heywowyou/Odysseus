# Normalization rules

How raw scanner output becomes `Finding` documents, and why each rule is
what it is. Decided during milestone 4 and amended to match what was
actually built rather than what was originally specified.

Milestones 5 and 6 both read from this. If a rule here needs to change,
change it here first and say so, rather than working around it downstream.

The locked contracts (`findings.ts`, `severity.ts`, `llm-output.ts`) are
not repeated here. This file covers the behaviour built on top of them,
all of which survived milestone 4 without a contract change.

---

## 1. Which scanner output becomes a finding

**axe:** every violation node.

**Lighthouse:** only the `performance` and `seo` categories. Implemented
as an allowlist rather than a blocklist, so a new Lighthouse category
cannot silently start emitting findings after an upgrade.

- `accessibility` emits nothing. It is axe-core underneath, and axe is
  already run directly against the WCAG 2.2 AA tag set on the same page.
  Emitting both produced duplicate findings with two different severity
  mappings for the same underlying rule.
- `best-practices` emits nothing. It bundles HTTPS usage, deprecated
  APIs, console errors, and image aspect ratio, which have no correct home
  among the four locked `FindingCategory` values. Filing "uses a
  deprecated API" under an SEO heading in a client-facing report is
  exactly the sort of mislabelling a client's developer notices first.
  Console errors, the most useful signal in the category, are already
  captured in `RenderDiffResult.consoleErrors`.
- Both category scores are still recorded per page in the manifest, at
  `ManifestPageEntry.lighthouseExcludedCategoryScores`. The numbers are
  not lost, only unused for findings.
- Category exclusion alone is not sufficient. Lighthouse files some
  accessibility audits under `seo` as well, so `image-alt` arrived through
  the allowlisted path and duplicated axe's own `image-alt` with a
  different severity. `LIGHTHOUSE_EXCLUDED_AUDITS` in `constants.ts`
  suppresses individual audit IDs regardless of which category surfaces
  them. Add to that list only rules whose overlap has been confirmed
  against real scanner output.
- A Lighthouse insight and the legacy audits it replaces report one
  problem once (D13, `computeSupersededAudits` and
  `computeNonActionableSuccessorsToDrop`). The replaced ids come from the
  result's `replacesAudits` when present, otherwise from
  `LIGHTHOUSE_REPLACED_AUDITS`, transcribed from Lighthouse 13.4.1's own
  insight metadata: Lighthouse 13 declares the pairs but no longer copies
  the field into its result, and still runs `redirects`,
  `server-response-time` and `layout-shifts` in a hidden group, so a
  2026-09-24 audit printed both sides of two pairs. Re-transcribe the table
  when the Lighthouse major version changes.
- Audits with `scoreDisplayMode` of `informative`, `notApplicable`,
  `manual`, or `error` are skipped. They have no pass or fail state.
- Failure threshold is `score < 0.9`, as a named constant.
- Severity needs a weight that is not on the audit object. Read it from
  `lhr.categories[category].auditRefs[].weight`, matched by audit id.
- Lab severity is then capped twice. `capSeverityByCoreWebVitalRating`
  caps at `serious` when the audit's own raw value is not in the poor
  band, and `capSeverityByGoodFieldData` (issue #300) caps at `moderate`
  when Chrome's field data reports the metric that audit measures as good.
  A lab measurement cannot outrank the real measurement of the same thing:
  a critical on every crawled page while CrUX says LCP is 2.4s both
  contradicts the report's own Core Web Vitals page and empties the
  critical-pages KPI. `FIELD_METRIC_BY_AUDIT_ID` lists only audits whose
  whole subject is one Core Web Vital; advice that stands on its own
  merits (render-blocking resources, oversized images) is never capped,
  and a site with no CrUX record passes through both caps unchanged.

**Pages whose content is not their own** produce no findings at all
(issue #302). Two statuses mean the page was scanned but what was scanned
does not belong to that URL: `soft-error-page`, a 200 serving an error
template (detected in scanner's `soft-error-page.ts` from the URL's last
path segment, the title, or the first h1), and `redirect-interstitial`
(issue #85). Both were already kept out of the analysed-page list by never
receiving `analysisCoverage`; normalization now also skips their
candidates, so an error template's defects are not counted against the
site once per language.

**Render diff:** emits nothing at all for a page whose no-JavaScript
fetch did not receive the page (issue #301). `unusableRawFetches` in
`normalize-renderdiff.ts` judges that from `RenderDiffResult.rawDocument`,
which scanner's `raw-document-signals.ts` fills with markup length, visible
text length, a text signature, and matched marker names. A marker is a wall
only when the shared classifier also sees a challenge response status, sparse
visible text, or minimal markup; any non-2xx raw status is unusable. A second
rule excludes one near-empty document (markup at or below 512 characters)
answering for three or more distinct URLs. The shared-document condition is
deliberately narrow, because a site that renders everything client-side
legitimately serves one shell for every route and that is the render diff's
most valuable true positive; only a document too small to be a shell the site
built counts. A "please enable JavaScript" notice is never treated as an
interstitial for the same reason. Historical records without `rawDocument`
remain readable and receive no marker-based judgment. The report's section 08
uses the same visible-text signal from the manifest, so it excludes the same
barrier pages that normalization does.

**A barrier is shared evidence, not a vendor-name match (plan 076).** The
pure `classifyDocumentWall` rule in `packages/core/src/acquisition/host-signal.ts`
is used by scanner acquisition and normalization. A challenge title identifies
a wall directly. Otherwise a vendor challenge marker must coincide with a
barrier-shaped document: status 403, 429 or 503; fewer than 500 visible
characters; or at most 512 markup characters. A minimal meta-refresh document
is also a wall. A bare DataDome script name, a challenge script on a substantive
page, or the words “security check” on their own are not enough. HTTP 429 is a
rate-limit document even when an older artifact did not retain vendor markers.
Third-party frame markers remain evidence but never slow the audited host.

Otherwise it emits only at or above a named threshold, default 20
percent, matching the `moderate` floor in `severityFromRenderDiff`.
Without the threshold, every page of a healthy server-rendered site
produces a `minor` rendering finding that says nothing is wrong. The
measured percentage is recorded in the manifest for every page regardless,
so nothing is lost.

**Cookie classification is normalization, not scanning (issue #493).** The
scanner records every cookie with its domain; `classify-cookie.ts` in `core`
decides which ones belong to a measurement or advertising product, and
`normalizeCookieConsent` re-classifies the stored `nonEssentialCookies` on
every normalize, so a correction reaches stored audits on their next refresh.
Distinctive vendor prefixes (`_ga`, `_fbp`, `_hj`) match by prefix on any
domain. Short or generic names (`fr`, `ide`, `test_cookie`, `muid`,
`personalization_id`, LinkedIn's `lidc`, `bcookie`, `bscookie`, `li_sugr`)
match only exactly and only on the vendor's own registrable domain; Mixpanel
matches only its documented `mp_<32 hex>_mixpanel` shape. Prefix-matching `fr`
once reported Magento's first-party `frontend` cookie as a Meta cookie set
before consent.

**Both category exclusions and the audit suppression list are revisited in
milestone 8**, where custom checks arrive and a deliberate per-audit-id
mapping table can be built. Do not re-enable either category before then
without an argued change.

---

## 1a. Coverage: which pages get which passes (plan 021)

Section 1 above says which scanner output becomes a finding once a page has
been scanned. This section says which passes actually ran on a given page,
since a full audit no longer runs an identical tool set against every
successfully crawled URL. Full reasoning: `docs/decisions/trade-offs.md`
entry 64.

**Every successfully crawled HTML page keeps render diff, axe, and the
extended accessibility pass**, regardless of page role or template family.
This includes every reached listing and archive page: template equality does
not prove content equality, so a shared-layout page can still carry a unique
title, canonical, heading structure, alt text, structured-data block, or
form. Reducing these three passes for any crawled HTML page is out of scope
for v1 and requires a separately measured plan.

**Only Lighthouse is family-stratified.** A deterministic two-stage planner
(`buildContentAuditPlan`, then `finalizeLighthousePlan` once rendered-cost
facts exist) always selects the homepage, every transactional page, every
operator seed, and every unique-family page for Lighthouse, plus a stable
representative and a measured cost outlier per repeated non-listing family and
language. An unknown/fallback page inside a repeated family is covered by that
family's representatives (planner v2, trade-off 109). Before classification, a
transactional-form, transactional-link or repeated-teaser signal present on at
least a quarter of a site's pages (sites of ten pages or more) is discounted as
layout on every page that carries no more of it than the site typically does.
Template families are hashed over the page skeleton (`templateSkeleton`), not
the raw structural token stream. A family with one member runs
Lighthouse once. A repeated high-confidence listing family is content-checked
on every member but does not run Lighthouse unless another mandatory-selection
rule also selects a given member.

Because Lighthouse is sampled, no page-content defect may depend on it. The
missing meta description, non-descriptive link text, uncrawlable link and
noindex checks run on every content-checked page inside head-metadata, and
Lighthouse's `meta-description`, `link-text`, `crawlable-anchors` and
`is-crawlable` findings are dropped on any page where the replacing fact was
extracted (trade-off 110). Lighthouse keeps only what needs its throttled
navigation: lab metrics and the performance audits.

A noindex page is reported as `noindex-on-public-page` (critical) only when
something besides the sitemap marks it as public: the homepage or a language
home, or an hreflang or canonical pointer from another indexable page. When
the sitemap entry is the only public signal, the page gets the minor
`sitemap-lists-noindex` instead: CMS sitemaps list taxonomy and gallery
archives that the site deliberately keeps out of search, so the contradiction,
not a hidden public page, is the defect (La Corniche, 2026-09-24).

**Page-status vocabulary**, matching CLAUDE.md rule 5's coverage glossary:

- **inventoried URL**: successfully navigated, or explicitly recorded with a
  failure or planned-skip reason.
- **omitted continuation URL**: bound by the continuation-family guard on the
  link frontier, counted separately, never folded into the inventoried
  total, and never applied to a seed or an eligible sitemap-declared URL.
- **content-checked page**: completed render diff, axe, and the extended
  pass.
- **performance-measured page**: selected for Lighthouse.
- **performance representative**: one family member actually selected for
  Lighthouse; a scheduling fact, not a claim that its siblings were
  measured or that they are byte-identical.

**Pass outcomes are explicit, not inferred.** Each planned pass on an
inventoried page records `completed`, `partial` (a composite pass produced
usable results but one or more registered subchecks failed), `failed` (no
usable result), or `not-planned` (valid only for Lighthouse). A zero-finding
result is still `completed`. Do not read the crawl-level `visited` manifest
status as proof that every scanner pass on that page completed; it is a
navigation fact, not an analysis fact. A planned skip is not a scanner
failure.

**No propagation.** A finding observed on a performance representative, or
on any single family member, must never be attributed to an untested sibling
page. Distinct finding, affected page, and occurrence keep their existing
meaning from section 2 below: a genuinely shared defect is still reported as
one finding with many affected pages when the evidence supports that merge,
never invented by copying a sampled result onto a page no scanner actually
ran on.

---

## 2. Dedupe and aggregation: two passes, deliberately

This is the rule most likely to be broken by a future session, because the
two functions look redundant side by side. They are not.

**Fine pass, `computeDedupeKey(source, ruleId, selector)`.** Collapses the
_same selector across pages_. A footer contrast failure appearing on
eleven pages becomes one finding with `occurrences: 11` and eleven page
URLs, rather than eleven findings.

The key is a truncated SHA-256 rather than a concatenated string, because
a deeply nested selector on a real site can exceed MongoDB's index key
size limit, and the key sits in a compound index with the site URL for the
monitoring tier. The three raw components are stored in
`rawEvidence.dedupeComponents` so any collapse decision can be re-derived
and defended.

`selector` is the empty string for page-scoped findings.

**Coarse pass, `aggregateSharedScopeOccurrences`.** Collapses _different
selectors covering the same pages_ for the same source and rule. axe
emits distinct positional selectors for some rules, so on a real site 69
instances of one body-text link defect on a single page produced 69
separate findings, each with `occurrences: 1`.

Aggregation runs on fine groups that cover the identical set of canonical
pages, and only when two or more of them land in the same bucket. A group
that is the only occupant of its bucket passes through untouched with its
original `dedupeKey`, which is the common case.

The compared scope was "exactly one page" until issue #292, which was an
accident of the first case this pass was written for rather than a
principle. A 24-page Villas Foch audit reported 232 findings and 176
critical ones because every gallery image sat on all 24 pages: identical
rule, identical remediation, identical scope, and the one-page condition
let none of them meet. The annex spent about 30 pages on the rows, 168 of
which ended by pointing back at the first one's page list. Haaitza split
`target-size` into 30 findings the same way, one per menu item, each on
the same 2 pages.

The scope is therefore compared at any size. Groups covering different
scopes still stay apart, which is what keeps two sliders on two different
pages two findings, and this widens an already-accepted trade-off rather
than making a new one: per-element detail beyond the stored element
sample was already dropped by this pass whenever the scope happened to be
a single page. Because one row now stands for many elements, a merged
element-scoped finding also lifts each element's `resourceUrl` into
`rawEvidence.resourceUrls`, so the client still gets the list of files to
fix.

**Do not merge the two passes.** They key on different things for
different reasons. Cross-run identity for the monitoring tier is
`dedupeKey`, so which pass produced a given key is a fact milestone 13
will need to handle: a finding can move between fine and coarse keying
between runs if a page gains a second distinct selector for the same rule.

**Selector normalization was considered and rejected.** Stripping
`:nth-child()` and similar positional components would merge genuinely
distinct elements. A real 10-page scan confirmed that stable selectors
(IDs, classes) dedupe correctly with no normalization at all: 27 contrast
nodes collapsed to three footer selectors.

**WordPress loop items are one identity (2026-09-19, trade-off 3).** An axe
element whose selector carries a WordPress core loop token (`.post-<ID>`,
`.menu-item-<ID>` or `#menu-item-<ID>`, `.page-item-<ID>`, `.cat-item-<ID>`)
takes `dedupeIdentity` = the selector with those tokens read as `-*`, plus
axe's `failureSummary`. The displayed selector is untouched. Elements merge
only when the failure statement is identical, so a different colour pair or
ratio stays its own finding. Shape and container identities, where a rule has
one, win over this.

---

## 3. Finding shape

**`findingId`** is `f001` upward, assigned after sorting by severity
descending then `dedupeKey` ascending. Short and sequential because the
LLM layer must echo these back exactly and the guard in `llm-output.ts`
rejects the entire response over one wrong character. Deterministic
ordering means re-normalizing the same artifacts yields the same IDs.

`findingId` is stable **within an audit only**. Cross-run identity is
`dedupeKey`. Someone will eventually try to compare `findingId` across
runs.

**`elements`** is empty for page-scoped findings. It is documented as a
capped sample, not a complete record, and `pageUrls` plus `occurrences`
already carry the scope, so an empty array reads unambiguously.

- axe violations: one element per node.
- Lighthouse audits whose `details.items[]` carry a `node` object:
  populated from `node.selector` and `node.snippet`.
- Lighthouse metric audits with no node details (LCP, CLS, INP): empty.
- Render diff: empty.

Never invent sentinel selectors such as `:root`, `body`, or `"page"`.
Those strings end up printed in a client-facing appendix.

**`occurrences`** is the number of nodes for element-scoped findings, and
the number of pages for page-scoped findings.

**`firstSeenAt` and `lastSeenAt`** are both the audit's `startedAt`.
Cross-run population of `firstSeenAt` is milestone 13.

**`wcagCriteria`** is populated from axe tags for accessibility findings
and empty otherwise.

---

## 4. `rawEvidence`

For a Lighthouse finding, `rawEvidence` holds that single audit object,
never the full `LighthouseResult`. The full result is megabytes and would
hit MongoDB's 16MB document limit. `details.items` is capped and the
truncation is recorded.

When a finding merges across several pages, per-page data is keyed by URL
under `perPage`. The naive implementation overwrites `rawEvidence` with
whichever page was scanned last, silently discarding the rest. An LCP of
4.2s on the homepage and 1.1s on the contact page are different facts and
both belong in the report.

`perPage` stores `score`, `numericValue`, and `displayValue`. The score is
a normalized ranking, not a fact about the client's site; the report needs
the actual measurement, because "your homepage takes 4.2 seconds to show
content" is what a client understands.

---

## 5. What the crawler will not scan

Non-HTML resources are dropped by file extension before they are enqueued
(`links.ts`), with a Content-Type check in `crawl.ts` as a fallback for
URLs whose extension reveals nothing.

A real WordPress site linked four `wp-content/uploads/*.jpg` attachment
URLs from its gallery, and each one cost a full render, an axe pass, and a
Lighthouse pass before producing findings against binary content. Two of
those findings (`html-has-lang`, `image-alt`) disappeared entirely once
the URLs were excluded, confirming they were artifacts rather than defects
on the site.

Extension-dropped URLs never appear in the manifest at all. Only the
Content-Type path records `skipped-non-html`. That asymmetry is
deliberate, since the extension check runs before any request is made, but
it does mean the audit trail says nothing about extension-dropped URLs.

---

## 5a. Page URL identity: trailing-slash equivalence (issue #102)

`https://site.example/fr` and `https://site.example/fr/` are one page. No
document ever recorded a decision that they are distinct, and a real audit
(Briketenia) content-checked both spellings of the same homepage - two
render diffs, two axe passes, two Lighthouse runs - and counted both in
every "X pages analysed" figure. The identity rule is therefore:

**One page identity, decided before enqueue.** A URL's page identity is its
URL with the fragment stripped and a trailing slash removed from any path
longer than one character. The bare root path is preserved: it has no
shorter spelling. This is the same rule `normalizePageUrl` always applied
to discovered links; issue #102's defect was that two doors bypassed it.
Both now go through `normalizePageIdentityUrl` (`packages/scanner/src/
links.ts`), which holds the identity rule in one place:

- **link discovery** and **sitemap supplementation**, via `normalizePageUrl`,
  unchanged;
- **the crawl start URL** (issue #102's live case: the configured start URL
  carried the slash, so every internal link to the bare spelling of the
  same homepage looked like a distinct page);
- **operator seeds**, which previously stripped only the fragment.

Because the identity is decided before enqueueing, the duplicate variant
never costs a fetch, a crawl-budget slot, a politeness delay, or a page-cap
unit - merging after the fact cannot un-spend those, which is why the fix
lives in the crawler and not in normalization. Consequences worth stating:

- **Only one variant is ever linked, either spelling**: the linked spelling
  is canonicalized to the same identity as the start URL, so nothing new is
  enqueued either way.
- **The sitemap declares both variants**: they collapse onto one identity
  in `eligibleSitemapUrls` and are counted once in sitemap coverage.
- **The site root**: unchanged; `/` stays `/`.
- **Page-cap accounting**: the duplicate never enters the queue, so it
  never consumes capacity.
- **The prescan path is ruled out**: a prescan renders at most the homepage
  plus role pages chosen from `normalizePageUrl`-normalized links and never
  maintains a crawl frontier, so it has no second door for a slash variant
  (and must not grow one; trade-off 35).

**Legacy stored audits are not repaired by normalization, deliberately.**
A stored audit that crawled both spellings carries two `scan.json` files
and two page inventories. `normalize <dir>` can only re-judge scanner
output that exists; it cannot know which variant's per-page evidence
(rawEvidence.perPage) is authoritative, and the same element seen on both
variants is two candidates in a merged group, so `occurrences` would
double-count once the pages collapse. A collapse at normalize time would
also reorder or merge findings and renumber every later finding ID
(trade-off 32), invalidating stored analyses, to fix data the next re-scan
produces correctly. So: no normalize-side collapse; the repair for a
stored audit with duplicate variants is a re-scan. Reports rendering such
an audit keep its own (inflated) page inventory, honestly listing what
that audit actually crawled.

---

---

## 6. Artifacts

```
artifacts/<hostname>/<ISO-8601-UTC-timestamp>/
  manifest.json
  findings.json
  pages/<slug>-<6-char-url-hash>/
    raw.png
    rendered.png
    scan.json
```

Hostname verbatim, so `www.example.com` and `example.com` stay separate.
They are different origins.

Timestamp as ISO 8601 UTC with colons replaced by hyphens. Colons are
illegal on Windows and awkward in shells, and lexicographic order equals
chronological order.

The six-character URL hash is always appended to the page slug, not only
on collision, because `/services/audit` and `/services-audit` slug
identically and would overwrite each other.

Screenshot references are relative to the audit directory, never absolute
paths, so stored findings survive the artifacts root moving or the
database being read from another machine.

`manifest.json` and the `audits` collection share one type. That is what
lets `normalize <dir>` re-run offline against any artifacts folder with no
database attached, which matters because normalization rules will keep
changing across milestones 5 and 6 and re-scanning a client site to tune a
mapping is not acceptable.

Tool versions in the manifest are self-reported by the tools themselves
(`testEngine.version`, `lighthouseVersion`) rather than read from installed
`package.json` files, so they record what actually ran rather than what
happens to be installed. Not retrofittable onto stored audits.

**Screenshot pruning** keeps the homepage pair plus the top N pages by
render-diff `missingPercent` above the emission threshold, and deletes the
rest at the end of the scan. The reason is data minimisation rather than
disk space: full-page screenshots of a client site incidentally capture
personal data, and not capturing is a stronger position than deleting
later.

`selectPageDirsToKeep` in `prune-screenshots.ts` is the single owner of
that rule. Report generation must call it rather than reimplement the
selection, or the report will eventually ask for a screenshot the scan
already deleted.

Pruning does not affect `normalize <dir>`, which reads `scan.json` only
and never touches the images.

**`scan.json` compaction.** `compactScanJson` in `page-scan-io.ts` is the
single owner of what a stored `scan.json` keeps: axe's `violations`,
`incomplete` and `testEngine` (not `passes`, `inapplicable` or the run
environment), and Lighthouse without its `screenshot-thumbnails` and
`final-screenshot` audits or its `fullPageScreenshot`. Nothing reads those,
and findings provenance hashes normalized findings, not these bytes, so a
compacted audit renormalizes to the same `findingsDigest` (plan 077 proved
it on every normalizable local audit). New scans are written compact;
`odysseus artifacts compact-scans --apply` rewrites stored ones. The version
stays 2, because `readPageScanJson` accepts only an absent version or 2.

**Retention of stored versions (plan 077, trade-off 117).** Analyses and
reports are still inserted, never overwritten (trade-off 5), and retention
removes superseded ones afterwards, 7 days after a newer one appeared. The
policy is `planRetention` in `packages/interface/src/retention/`; its keep
reasons are one typed list (`RETENTION_KEEP_REASONS`), and an item no reason
names is removed. An older audit of the same site and kind goes once a newer
audit of equal or broader scope exists. A delivered audit is slimmed
instead: `pages/**` and the crawl state go, `manifest.json`, `findings.json`,
the audit scope, evidence files and the kept analyses and reports stay, and
the audit row carries `retention.slimmedAt`. `normalize` and every other
step that recomputes from `scan.json` cannot run on a slimmed audit; the
dashboard routes refuse it up front. Deleting an audit also removes its
private report-quality candidates under
`report-quality/candidates/<auditId>/`.

---

## 7. Reference data

`artifacts/sas-fernande.fr/` holds real-site captures. `normalize <dir>`
re-runs against them offline without touching the site, which is how both
milestone 4 bugs were verified as fixed.

Known-good numbers from the 2026-08-02 scan, useful as a regression check:
11 pages, 78 findings, render diff 0 on every page, `color-contrast` as
four findings across 35 occurrences with its three footer selectors
staying separate at 11 pages each, and `link-in-text-block` as one finding
with 69 occurrences on `/mentions-legales/`.

---

## 8. Site-level finding anchors (issue #101)

Some findings are facts about the site, not about one page: CrUX field
data (origin-level), `hreflang-missing` (absence across every crawled
page), `structured-data-entity-missing` (absence across every crawled
page). A Finding still names a page, and the report's appendix prints that
name as where the fact was established, so the anchor must be a page the
audit actually examined.

**The anchor is the crawl start URL when the start URL was itself
content-checked** (its scan.json exists among the normalized pages), which
is the common case and byte-identical to the pre-#101 behaviour. **When it
was not** - the start URL redirected and was recorded under another
status, or it is a bare language root crawled for links only, as on the
real Villas Foch audit - **the anchor is the content-checked page closest
to the homepage**: shallowest crawl depth first, ties broken by URL
ascending so the choice is deterministic regardless of page order (a live
run normalizes in crawl order, `normalize <dir>` in directory read order).
Since issue #503, `normalizeAudit` also puts its pages in URL order
(code-unit, never `localeCompare`) before anything else, and the refresh
reads page folders sorted, so a merged finding's title, description and
element sample never depend on the path or the machine. Descriptions of
page-scoped rules that merge across pages carry no per-page count; each
page's count stays in its raw evidence.
The depths come from the crawl inventory through `CrawlPageInput.depth`.

A site-level fact is never attributed to a page no scanner ran on, and is
never emitted when nothing was content-checked (no anchor means no
candidate, not an anchored-to-nothing one). This is trade-off 64's
no-propagation principle applied to the one place a site-wide emitter
could still violate it. The report's executive-summary page count is the
union of findings' own pageUrls, so the anchor rule is what keeps that
count inside the analyzed scope; the count itself is deliberately not
independently filtered.

The crawl's `homepageUrl`, when recorded, is preferred over the start URL.
The live audit and every refresh build `normalizeAudit`'s input through one
function, `buildNormalizeAuditInput` in
`packages/interface/src/pipeline/normalize-audit-input.ts` (issue #502), so a
refresh can no longer drop `homepageUrl` and move site-level findings, and
their identities, to another page.

## Plan 075 amendments to sections 1, 2, 5 and 5a

The content population is now explicit across every extractor. A URL that
returned a transient status, a bot/challenge document (including a 200), a
redirect interstitial, a soft-error template, an off-site redirect or a
failed acquisition is inventory evidence, not page content. The same
exclusion is applied to site-wide absence checks. If a blocked or failed
candidate could carry the item being tested, the manifest records blocked and
failed counts and the report says manual/undetermined; it never emits a
confident absence. Challenge frames follow the same rule. Noindex pages are
disclosed and excluded from SEO content findings.

Plan 075 also makes URL identity one shared contract: fragments, non-root
trailing slashes, uppercase percent escapes and an empty query do not create
a second page. The server's preferred served spelling is retained for
acquisition evidence, but slash-only handling does not become a `redirects`
finding. Relative links that resolve to the same identity do not create a
self-nesting finding; genuine relative nesting is bounded and reported once.
Sitemap entries that redirect or point off-site use the separate minor
`sitemap-lists-redirects` rule and are removed from stale/orphan comparisons.
A `language-redirect` page (plan 075 I1) is neither: the site sent our French
browser to its translation, and the landing page lists it among its hreflang
or language-switcher alternates. It is counted by no sitemap rule, left out
of every sitemap comparison, never an invalid hreflang or broken-link target,
and disclosed in the coverage as a version in another language.

The fine/coarse dedupe passes still preserve occurrences and provenance. They
may merge only identical rule statements and fixes. Third-party frame content
is retained as annex evidence but excluded from primary totals, grade and
outreach proof. Field metrics own a Core Web Vital when available; a lab
metric is accepted only from a valid same-identity Lighthouse run and is
diagnostic when field data exists.

## Plan 075 Part H amendments

JSON-LD is read node by node. A block may be one node, an array of nodes or a
`@graph` container (the shape Yoast and Rank Math write); every typed node in
it counts for `structured-data-entity-missing`, `entity-data-incomplete` and
`faq-content-without-schema`, the same reading the scanner's structured-data
check uses. `entity-data-incomplete` judges business entities only
(Organization, LocalBusiness and its subtypes): a `WebSite` node proves an
entity exists but is never expected to carry an address or telephone.
The rule judges the page, not each node: it reports only when no business
entity on the page carries every field, and names the fields missing from the
most complete one, since a page often declares its establishment in full next
to a thinner node for the operating company. A telephone given under
`contactPoint.telephone` counts (issue #564).

Every axe rule is one site-wide finding, plus one per third-party frame origin
(trade-off 30; Q5 for `image-alt`, Q6 for `link-name` and `button-name`, J1 for
the rest). An axe rule states one instruction, so the finding is the rule and
its occurrences, and its examples rotate through the distinct elements, with
generated id values (`_r7krylvsd`, `email-487784791`) blanked so copies of one
element read as one. Image files are listed in `rawEvidence.resourceUrls`; an
image embedded as a `data:` URI has no file and appears through its element
sample only. A frame's content never joins the site's own finding over the
same pages: the shared-scope pass keys on the frame origin.

The exceptions are `color-contrast` and `link-in-text-block`, whose identity is
axe's measured colour pair and ratio: each pair is its own design decision.
Without that check data they fall back to the selector, which ignores what
changes between page loads: runtime state classes (animation, player size,
Webflow's `w--current`, jQuery UI's `ui-state-*` and `ui-tabs-active`), the
`aria-current` attribute, generated ids (Swiper's `swiper-wrapper-<hex>`,
`_` plus a random run with a digit, a prefix plus six or more digits), and the
order of classes within one compound selector. The printed selector is never
rewritten.
