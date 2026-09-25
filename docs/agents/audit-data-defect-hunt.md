# Audit data defect hunt

A standing brief for an agent that searches stored audit data for defects
until the search stops finding any. The operator starts it with one line:

> Run the audit data defect hunt in `docs/agents/audit-data-defect-hunt.md`
> until its stop rule is met.

Origin: on 2026-09-22 three passes over the 12 stored full audits each found
new material defects. The third pass found the worst one: homepages that were
never scanned. A search that keeps finding large defects is not finished.
This brief makes the search repeatable and says when it may stop.

## Goal

Find every way the scan's data can mislead a client: a finding that is false,
a real defect that is missing, one defect counted several times, a page that
should or should not have been analysed, a measurement that does not describe
the page, and client-facing wording that states more than the evidence shows.
Record each one as an actionable slice in the active data-quality plan. Stop
only when the stop rule below is met.

This is a search and planning task. Do not fix product code during the hunt:
Luna or another implementer works from the plan, often in the same working
tree at the same time.

## Before the first sweep

1. Read `CLAUDE.md`, then `plans/README.md`, then the active data-quality plan
   (plan 075 at the time of writing, or the plan that supersedes it). The
   plan's evidence tables are the **known-defect list**. Re-finding a known
   defect is not a new finding.
2. Read `plans/defect-hunt-ledger.md` if it exists. It records past sweeps,
   the angles each one covered, and where the last run stopped. Continue from
   there. If it does not exist, create it with the structure given at the end
   of this document.
3. Check `git status`. Other agents' uncommitted work is preserved and never
   staged.

## Access and boundaries

The audits to hunt live on the VPS. The workstation's `artifacts/` directory
holds stale calibration copies and misses every recent scan; never sweep it.

Allowed without asking:

- Read-only reads of stored audits on the VPS (`/data/artifacts`, through the
  app container), using the deploy key referenced by
  `deploy/.deploy.local.env`. Scripts go in the session scratchpad. Copied
  results stay out of the repository, because client data never enters it.
- In-memory re-normalization of stored audits with the deployed
  `@odysseus/core` build. Nothing is written back.
- Read-only queries of the production database (find, count, aggregate,
  list). The operator approved this on 2026-09-22. Never print tokens, token
  hashes, email addresses or message bodies. Report counts, states and ids.
- Short live probes of sites that have **already been audited**: one page, a
  few requests, the crawler's user agent, and pacing respected. Skip any site
  that is currently rate-limiting or challenging the crawler (lacoorniche
  answered 429 to a single visit on 2026-09-22).
- Local builds, tests and scripts. Committing on `main` **without pushing**.

Not allowed without the operator's explicit say-so: a new full audit, a scan
of a site never audited before, any production write, publishing or sending
anything, regenerating a paid report, a push, and destructive git or database
actions. Never read, print or pass on `.env` values.

## One sweep

A sweep is one pass over **every** angle below, on **every** stored full
audit that has findings. Hold each finding to the evidence bar:

- **Measured, not assumed.** Give counts per audit and name at least one real
  page or element. Where the stored data cannot settle a question, use a live
  probe (within the boundaries above) or a reading of the code at file:line.
- **Material.** The defect changes one of these: a finding's existence, a
  severity, the grade, a total, the analysed page population, a proof card, or
  client-facing wording that asserts a fact. Cosmetic issues go in the ledger
  as minor, and do not reset the stop rule.
- **New.** It is not already in the known-defect list. A known defect that
  turns out broader than recorded is a new finding only when its fix has to
  change.

### Angles (every sweep covers all of them)

1. **Page population.** For each audit, list page statuses. Then check:
   - the homepage and language homes: are they scanned?
   - what `visited` pages really are: error, rate-limit or challenge pages;
     redirect stubs; plugin objects; archives; loops; spelling duplicates;
   - what was dropped or never scanned, and why;
   - whether a site's key pages (booking, rooms, contact, legal) are scanned.
2. **Acquisition health.** Read the check-attempt ledger. Look at failures by
   check and class, watchdog losses, retries, 429 and 5xx answers, challenge
   markers in titles and snippets, and pages where one check succeeded while
   another saw a different document.
3. **Per-rule truth.** For every rule id present, in descending count, and
   also for every rule with 3 or fewer findings:
   - read two or three real samples (selector, snippet, evidence);
   - ask whether a developer at the hotel's agency would confirm it;
   - for any doubt, verify against the live page or the code.
4. **Counting.** Look for the same failure statement split over several
   findings; cross-source twins (axe, custom, Lighthouse, CrUX); field and lab
   duplicates; the top-rule share; and occurrence totals that do not add up.
5. **Absence claims.** For every rule that says something is missing:
   - were the pages where it would appear actually read?
   - was the relevant file fetched successfully?
6. **Measurements.** Look at Lighthouse run validity (final URL, warnings,
   runtime errors, storage warnings), how plausible the lab figures are against
   CrUX, and which pages each metric is attributed to.
7. **Attribution.** For each finding, decide whether it belongs to the site,
   to a third party (frames, plugins, widgets), or to our own crawler (spelling,
   pacing, session state).
8. **Client-facing surfaces.** Render or read what the client would see from
   the stored data: grade, cover totals, "X of Y", annex, proof cards, preview
   evidence and screenshots. Check that each claim follows from the data.
   Check the French copy per rule for overstatement, following
   `docs/rules/report-writing-style.md` and the legal wording in
   `docs/rules/obligation-basis.md`.
9. **Stored products.** Check reports, approvals, previews and drafts that were
   built on data a known or new defect invalidates, using read-only production
   state.
10. **Fresh angle.** Name one angle this document does not yet list, cover it,
    and add it to this list in the same commit if it found anything.
11. **Terminal state against artifacts.** For each audit, compare the job's
    terminal status and failed phase with the reports and analyses actually
    stored, and read why any report step failed.
12. **Run-to-run determinism.** When an audit has two runs of the same
    pages, compare their findings; a difference that is not measurement
    noise is a defect.
13. **Replay against closed slices.** Re-normalize every stored audit with
    the current core build and check each closed slice's named target on
    it. A closed slice whose target site still fails on replay was never
    shipped, or never proved.

## Recording

For each new material defect:

- Add an evidence row (what was measured, with numbers and one real example)
  and a slice (fix, stored-audit consequence, tests) to the active plan, in the
  matching part. Add a closure-ledger row and, where needed, a
  definition-of-done line.
- Keep the plan's conventions: measured evidence, trade-off references, no
  guessed legal facts, French-first client copy, no em or en dashes in site or
  preview copy, and no audit-document finding ids in code comments or test
  names.
- A choice that belongs to the operator (product scope, legal exposure,
  pricing) becomes a question in the plan with a recommended option. Keep
  hunting in the meantime; do not stop to wait for the answer.

After each sweep:

- Update `plans/defect-hunt-ledger.md`: the stand and stop-rule count, the
  next sweep's start list (every new slice's named target, for angle 13), the
  sweeps table, the open doubts and minor items (mark each one settled, moot
  or still open), then append the sweep's notes.
- Run `pnpm run plans:check` and `npx prettier --write` on the touched
  Markdown.
- Commit only the plan and ledger files, without pushing. Use a plain
  imperative subject and no model credit.

## Stop rule

Stop when **two consecutive complete sweeps** find no new material defect, and
the second of the two covered at least one new angle (angle 10).

Also stop, and report, when:

- the data can no longer answer the open questions (for example, when every
  remaining doubt needs a new full audit), or
- a finding needs an operator decision before any further search is useful.

Do not stop because a sweep is long, the context is large or the findings are
getting subtle. When the context runs low, update the ledger first so the next
context resumes from it.

## Final report to the operator

Keep it short and plain, outcome first:

- how many sweeps ran, and the new material defects per sweep (the trend is
  the evidence that the search converged);
- the worst defects found in this run, one line each;
- operator questions added, each with its recommendation;
- what the data could not settle, and the smallest external action that would
  settle it (for example, a rescan of one named site);
- the commits made, which are not pushed.

## Ledger structure (`plans/defect-hunt-ledger.md`)

```markdown
# Defect hunt ledger

Active plan: plans/0NN-....md
Brief: docs/agents/audit-data-defect-hunt.md

## Where the hunt stands

- Stop rule: N of 2, and why.
- Data state: what is deployed and refreshed.
- Next sweep: which audits, and where to start.

## Sweep N+1 start list

| Slice | Audit | Expected on the stored findings |
|---|---|---|

## Sweeps

| Sweep | Date | Audits | Angles (brief numbering) | Complete | New material | Plan part |
|---|---|---|---|---|---|---|

## Open doubts

| Doubt | Since | Angle | Smallest action that settles it |
|---|---|---|---|

## Minor items (not counted toward the stop rule)

| Item | Found | Status |
|---|---|---|

## Sweep N notes

- Angle: what was checked, how many items were read, and the result
  (new / known / clean).
```
