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
- Audits with `scoreDisplayMode` of `informative`, `notApplicable`,
  `manual`, or `error` are skipped. They have no pass or fail state.
- Failure threshold is `score < 0.9`, as a named constant.
- Severity needs a weight that is not on the audit object. Read it from
  `lhr.categories[category].auditRefs[].weight`, matched by audit id.

**Render diff:** emits only at or above a named threshold, default 20
percent, matching the `moderate` floor in `severityFromRenderDiff`.
Without the threshold, every page of a healthy server-rendered site
produces a `minor` rendering finding that says nothing is wrong. The
measured percentage is recorded in the manifest for every page regardless,
so nothing is lost.

**Both category exclusions and the audit suppression list are revisited in
milestone 8**, where custom checks arrive and a deliberate per-audit-id
mapping table can be built. Do not re-enable either category before then
without an argued change.

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

**Coarse pass, `aggregateSamePageOccurrences`.** Collapses _different
selectors within one page_ for the same source and rule. axe emits
distinct positional selectors for some rules, so on a real site 69
instances of one body-text link defect on a single page produced 69
separate findings, each with `occurrences: 1`.

Aggregation runs only on fine groups confined to exactly one page, and
only when two or more of them land in the same bucket. Multi-page groups
pass through untouched with their original `dedupeKey`, as do single-page
groups that are the only occupant of their bucket, which is the common
case.

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
