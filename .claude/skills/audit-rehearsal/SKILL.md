---
name: audit-rehearsal
description: Run a full live audit against a real, not-yet-scanned hotel from the catalogue, generate the bilingual report, and critique it in character as the hotel's owner/GM to surface defects before a real client sees them. Use when the user asks to "dogfood a hotel," "run an audit rehearsal," or otherwise QA the report pipeline against a real site.
---

# Audit rehearsal

A repeatable QA pass: pick a real hotel we have not audited yet, run the
audit end to end exactly as a paying client would receive it, then read the
output in character as that hotel's owner or GM seeing it for the first
time. The goal is to catch the kind of defect that only shows up on a real
site with a real report in front of a real reader, before a paying client
is the one who finds it.

This complements, not replaces, the existing test suite: unit tests and the
fixture-based suite (`fixtures/spa-demo`, `fixtures/test-audits/`) catch
regressions in known behavior. This skill exists to catch what nobody
has looked for yet.

## Scope

The paid full-audit report only (crawl, scan, normalize, analyze, PDF).
The outreach preview (9c) and the operator dashboard are separate surfaces
with their own QA needs and are out of scope here.

## Steps

### 1. Pick a hotel

Eligible means both of:

- `qualification.outcome` is `qualified` under the current qualification
  version, and
- not already scanned: no existing `artifacts/<hostname>/` directory.

The outcome test is a positive filter on `qualified`, not merely "not
`already-engaged`". The outcome vocabulary also holds `parked`, `rejected`,
and `group-routed` (`packages/store/src/schemas/hotel-candidate.schema.ts`),
and none of those describes a hotel this audit would ever be sold to, so
rehearsing on one tests something the client never receives. `qualified` is
also the only outcome that guarantees the candidate holds a domain of its
own (`qualify-hotels.ts`, the `ownRegistrableDomain` guard), which is the
thing there is to audit.

The concrete route:

```
odysseus prospect hotel-qualify reasons --outcome qualified --limit 500
```

It prints `candidateId`, `domain`, `finalUrl`, and `evaluatedAt` per row.
Two things about it matter here:

- It sorts by `evaluatedAt` descending and then truncates to `--limit`, so a
  small limit samples the tail of the last qualification batch rather than
  the catalogue. Pull a large limit and pick randomly across the whole
  returned set.
- Audit the row's `finalUrl`, the URL qualification actually resolved after
  redirects, not the declared domain. A hotel whose declared domain
  redirects to one it alone holds has had that target adopted as its own
  (trade-off 37), and the declared domain is then the wrong site to scan.

Pick at random. Do not hand-pick for variety or try to rotate across site
types — let it emerge naturally across repeated runs.

Fetch the candidate's SIREN too; step 2 needs it. It sits on the candidate
(`hotel_candidates.siren`) and on the qualification row's
`siteFacts.siren`, but the `reasons` command prints neither, so read it
through the mongodb-readonly MCP server.

**Stop and show your pick before scanning.** State the hotel's name, URL,
SIREN, and why it was eligible, and wait for a go-ahead. This is the one
veto point before a multi-hour run is sunk into it.

### 2. Scan

Run the audit uncapped, the same way a real client's audit would run:

```
odysseus audit <finalUrl> --siren <siren>
```

No `--max-pages`. A real audit is deliberately uncapped (non-negotiable
rule 5's 2026-08-24 amendment exists because a page cap once silently
under-reported a real site by more than a third) and a capped rehearsal
could hide exactly the kind of defect this workflow is meant to catch
(see trade-offs.md#64, where an uncapped real audit reached ~672 URLs).
Accept the multi-hour runtime as the cost of a realistic test.

Omitting `--max-pages` is not by itself enough to be uncapped. `getMaxPages()`
reads a `MAX_PAGES` environment variable (`packages/scanner/src/config.ts`)
and `codysseus` sources `.env`, so a cap left there applies silently to a run
this skill believes is uncapped. Confirm it is unset before starting.

Pass `--siren`. Without it, `assessObligations` takes its `siren-missing`
path (`packages/core/src/compliance/assessObligations.ts`), and the legal
section, the most sensitive copy in the report and the part non-negotiable
rule 6 governs directly, is rehearsed in a configuration no real client's
audit would run in. The catalogue holds a SIREN for these hotels, so a real
engagement would supply one.

Note the printed `auditId` and `artifacts/<host>/<timestamp>/` path.

Record hostname, URL, `auditId`, and artifacts path in
`docs/session/current-session.md` as soon as the run starts, per CLAUDE.md's
session-log rule. A multi-hour uncapped scan is precisely the crash case
that rule exists for.

If the crawl is blocked by robots.txt or the homepage turns out to be
unreachable, that is a hotel to discard rather than a defect to file. Pick
another and note the discarded one in the log.

**There is no schema field yet to mark an audit as a rehearsal rather
than a real client engagement** (`packages/store/src/schemas/audit.schema.ts`
has no such field). Don't invent one as a side effect of this skill.
Instead, record the hostname, URL, and `auditId` in the log (step 5) as
the source of truth for "this was a rehearsal, not a client audit."
If this ever becomes a recurring pain point (e.g. a rehearsal accidentally
feeding a real prospecting/outreach pipeline), that is a real gap worth
raising to the user as its own piece of work, not something to patch
here.

### 3. Generate the report

```
odysseus analyze <artifacts-dir> --language fr
odysseus analyze <artifacts-dir> --language en
odysseus report <artifacts-dir> --all
```

This produces both bilingual PDFs from the stored analyses, without
re-scanning the site. `report --all` prints the written path per language;
note both, step 4 reads them.

Before analyzing, check the audit's detected transactional flow against
what the site plainly does. Hotels take bookings, often through an
off-domain vendor the detector can miss, and `hasTransactionalFlow` feeds
`assessObligations` alongside the SIREN. If it is wrong, do not re-scan:
a standalone `analyze` consults `--override-transactional-flow` and
`--siren` exactly because no audit process is holding an obligation
determination already.

### 4. Read both PDFs and write the critique

Read the actual rendered PDF for both languages, not just the underlying
`findings.json`/analysis JSON — layout and rendering defects (see
trade-offs.md#19, #20) are exactly the kind of thing a text-only read
misses.

A real audit's report is long, and `Read` takes a PDF in windows of at most
20 pages, requiring an explicit range past 10. So reading it means paging
front to back on purpose. Do not stop at the first window: the technical
appendix and the glossary are the last two sections (trade-off 44) and
annex pagination is a known risk area (trade-off 17), which puts the
defects this step exists to catch exactly where a partial read never
arrives.

Then compare the two languages against each other. The paid deliverable is
the pair (trade-off 44), so a section that renders correctly in French and
wrongly in English is a defect neither single-language read surfaces.

Write the critique in character as the hotel's owner or general manager,
seeing this report for the first time, with no inside knowledge of what
"correct" looks like. Use this fixed structure every time, so critiques
stay comparable across runs:

1. **First impression** — would this person keep reading, or does
   something in the first page make them stop trusting it?
2. **Trust and credibility** — anything that reads as sloppy, wrong, or
   would make them doubt the audit's competence.
3. **Confusing or unclear findings** — jargon, unclear remediation steps,
   ambiguous severity, anything a non-technical reader would misread.
4. **Layout and rendering** — PDF-specific defects: broken pagination,
   orphaned headers, overlapping text, inconsistent tokens, anything
   visual.
5. **Verdict** — in one paragraph, would they pay for this, recommend it,
   or feel talked down to / misled? Be honest and specific, not diplomatic.

### 5. Triage the findings

Split what the critique surfaced into two buckets:

**Genuine defects** (wrong finding, broken rendering, misleading claim,
anything that would actually need a code or content fix) — draft each as
a GitHub issue per `docs/agents/issue-tracker.md`'s format: self-contained
body, file/line pointers where known, the reproduction evidence (which
hotel, which audit, which page of which PDF), user-visible impact, and a
suggested fix direction. Label `needs-triage`. Search open issues first
(`gh issue list --state open --search "..."`) to avoid filing a duplicate;
where one already exists, add the new evidence to it as a comment instead.

**Copy or wording nits** (stiff phrasing, a term that could be clearer,
anything cosmetic that isn't actually wrong) — these do not become
issues. They go in the log instead (step 6).

**Show all drafted issues together and wait for approval before filing
anything.** Nothing gets created on GitHub without a go-ahead — batch the
review rather than confirming one at a time.

### 6. Log the run

Append one entry to `docs/report/audit-rehearsal-notes.md` (create it from
the template there if this is the first run) with:

- date, hostname, URL, `auditId`, and the `artifacts/<host>/<timestamp>/`
  path, which is the way back to the data behind the entry
- any hotel discarded before this one (blocked by robots.txt, unreachable),
  so a picking rule that keeps landing on dead sites is visible as a pattern
- any nits found (the cosmetic bucket from step 5)
- a short summary of the critique: the verdict paragraph, plus the top
  one or two concerns from earlier sections — not the full write-up
  verbatim, so the log stays skimmable
- links to any GitHub issues filed from this run

### 7. Stop

The skill's job ends once issues are filed and the log is updated. Fixing
filed issues happens later through the normal `ready-for-agent` triage
pipeline, in whatever session picks that work up — not immediately, in
this same pass. Mixing discovery and fixing in one rushed pass skips the
triage and test discipline the rest of this project relies on.

Leave the artifacts where they are. They are real-scan data for a business
that is not a client, `artifacts/` is gitignored, and nothing from the run
gets committed. If a run produces something worth keeping as a test
fixture, that is its own piece of work, through `scripts/deidentify-audit.mjs`
and `fixtures/audits.json`, never by committing the directory as it stands
(trade-off 34).

There is no hard stop for the overall practice. Track it loosely via the
log; treat several consecutive clean runs across visibly different hotels
as an informal signal of readiness, not a number to hit.
