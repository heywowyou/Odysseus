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

Query the `hotel-candidates` collection (`packages/store/src/hotel-candidates.ts`)
for rows that are:

- not `already-engaged` (or otherwise flagged as a live/real client
  relationship) per their qualification outcome, and
- not already scanned: no existing `artifacts/<hostname>/` directory.

Pick one eligible candidate at random. Do not hand-pick for variety or
try to rotate across site types — let it emerge naturally across repeated
runs.

**Stop and show your pick before scanning.** State the hotel's name, URL,
and why it was eligible, and wait for a go-ahead. This is the one veto
point before a multi-hour run is sunk into it.

### 2. Scan

Run the audit uncapped, the same way a real client's audit would run:

```
odysseus audit <url>
```

No `--max-pages`. A real audit is deliberately uncapped (non-negotiable
rule 5's 2026-08-24 amendment exists because a page cap once silently
under-reported a real site by more than a third) and a capped rehearsal
could hide exactly the kind of defect this workflow is meant to catch
(see trade-offs.md#64, where an uncapped real audit reached ~672 URLs).
Accept the multi-hour runtime as the cost of a realistic test.

Note the printed `auditId` and `artifacts/<host>/<timestamp>/` path.

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
re-scanning the site.

### 4. Read both PDFs and write the critique

Read the actual rendered PDF for both languages, not just the underlying
`findings.json`/analysis JSON — layout and rendering defects (see
trade-offs.md#19, #20) are exactly the kind of thing a text-only read
misses.

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
to avoid filing a duplicate of something already tracked.

**Copy or wording nits** (stiff phrasing, a term that could be clearer,
anything cosmetic that isn't actually wrong) — these do not become
issues. They go in the log instead (step 6).

**Show all drafted issues together and wait for approval before filing
anything.** Nothing gets created on GitHub without a go-ahead — batch the
review rather than confirming one at a time.

### 6. Log the run

Append one entry to `docs/report/audit-rehearsal-notes.md` (create it from
the template there if this is the first run) with:

- date, hostname, URL, `auditId`
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

There is no hard stop for the overall practice. Track it loosely via the
log; treat several consecutive clean runs across visibly different hotels
as an informal signal of readiness, not a number to hit.
