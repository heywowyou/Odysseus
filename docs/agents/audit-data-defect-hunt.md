# Audit data defect hunt

A standing brief for an agent that searches every stored audit for defects.
The operator starts it with one line:

> Run one sweep of the audit data defect hunt in
> `docs/agents/audit-data-defect-hunt.md`.

Since 2026-09-30 the hunt is **occasional**, not a gate. What stands between
the data and a client is the `audit-finalizer` skill: a read-only quick check
of each outreach preview (SEND or HOLD), and a full check of the scan data
before a paid report goes out. The quick check's backlog rows in the ledger's
Finalizer runs table are fixed in batches. A sweep runs:

- after a batch of about ten sites new to the hunt;
- after a large crawler or normalization change;
- when a finalizer run finds a blocking defect that looks systemic and wants
  to know how many stored audits share it.

Origin: on 2026-09-22 three passes over the 12 stored full audits each found
new material defects. The third pass found the worst one: homepages that were
never scanned. A search that keeps finding large defects is not finished.
This brief makes the search repeatable and says when it may stop.

## Goal

Find every way the scan's data can mislead a client: a finding that is false,
a real defect that is missing, one defect counted several times, a page that
should or should not have been analysed, a measurement that does not describe
the page, and client-facing wording that states more than the evidence shows.
Record each blocking defect as an actionable slice in the active data-quality
plan and each backlog defect as a GitHub issue.

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
- **Classified.** Every finding is blocking, backlog or minor (next
  section). Blocking defects become plan slices; backlog ones become issues.
- **New.** It is not already in the known-defect list. A known defect that
  turns out broader than recorded is a new finding only when its fix has to
  change. A defect introduced by an earlier sweep's fix is new.

Start every sweep by running `pnpm measure:audit-data-quality` in place and
reading its top-level `alerts`. For each audit it lists the page checks that
evaluated fewer than half the analysed pages they applied to (failed,
without a record, or inconclusive, like a Tab walk held by a consent banner),
and the axe rules whose raw detections mostly became no finding. An alert is
where to look, not a defect: a check that did not evaluate a site looks like a
clean site, and a filter that eats real detections looks like a fixed false
positive, so each alert is either explained in the sweep notes or recorded as
a finding.

### Blocking, backlog or minor

The open web has an endless tail of site-specific quirks, so the hunt does
not wait for zero defects. It waits until what is left cannot mislead a
client on something that matters. The classes changed on 2026-09-29, after
sweep 11: under the old rule, where any change to a finding counted, eleven
sweeps never converged while the severity of what they found kept falling.

A defect is **blocking** when it does at least one of these:

1. It makes a critical or serious finding false, missing, split or merged,
   or it changes the grade.
2. It makes a client-facing sentence state something the data does not
   support: a legal or obligation statement, a coverage or « nothing
   detected » claim, a methodology statement, a proof card or preview claim,
   or a model sentence that restates a deterministic fact.
3. It changes the analysed page population of an audit by 5 pages or more,
   or by 10 % or more of its analysed pages, or it drops a homepage, a
   language home, or a booking, contact or legal page.
4. It holds back a report that should go out, or lets through one that a
   gate should hold.
5. It stops a check from running on more than half of the pages it applies
   to on one audit, while the report states a result for that check.
6. It is a backlog defect found on 5 or more of the swept audits. At that
   scale, a small defect shapes the whole service's output.

A defect is **backlog** when it makes a moderate or minor finding false,
missing, split or merged, or it moves a count or a page population without
reaching the thresholds above. It is real and gets fixed, but it does not
hold the hunt open.

A defect is **minor** when it is cosmetic, or when it concerns a rule that
does not exist yet and matches no WCAG 2.2 AA criterion. A missing check
that corresponds to a WCAG A or AA criterion is judged as a missing finding
at that criterion's usual severity (serious for level A).

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
14. **Model prose against deterministic facts.** For every sentence of the
    stored analyses that restates a deterministic fact (the obligation
    status, a count, a page total, a coverage limit), compare it with the
    fact. Prose may describe the fact, never harden it into a verdict.
15. **Page state during interaction checks.** For each check that interacts
    with the page (the Tab walk, forms, reflow, consent), find what was
    open when it ran: a consent banner, a popup or a dialog. A check that
    measured the overlay instead of the page is a false finding or a false
    absence.
16. **Same component, same verdict.** For each vendor component or CMS
    default found on several audits (a shop's cart and account pages, a
    consent banner, a slider, a booking widget), compare the rule, severity
    and wording each audit gives it. Two verdicts for one component means at
    least one is wrong.
17. **Scan-time results older than their checker.** List the scanner and
    check changes made after each audit's scan date that a refresh cannot
    replay. For each one, find the audits whose stored result the change
    would alter. A stored scan-time result that a later fix contradicts
    needs a rescan before its report goes out.
18. **One fact stated twice.** For every fact a report states in more than
    one place (analysed and measured pages, HTTP errors, occurrence totals,
    failed checks), compare the statements with each other and with the
    manifest. Two sentences built from different sources can each look
    right and still disagree.

## Recording

For each new blocking defect:

- Add an evidence row (what was measured, with numbers and one real example)
  and a slice (fix, stored-audit consequence, tests) to the active plan, in the
  matching part. Add a closure-ledger row and, where needed, a
  definition-of-done line. Name the blocking criterion (1 to 6) in the
  evidence row.

For each new backlog defect, file one GitHub issue in the private repository
with the same evidence bar: what was measured, one real example, the fix,
the stored-audit consequence and the tests. Title it `[P3] …` and label it
`bug` and `audit-data`. List the issue number in the ledger. Backlog issues
are fixed in batches between sweeps; a backlog issue that later reaches
criterion 6 moves into the plan.

Minor items go in the ledger's minor table only.
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

## When a sweep ends

A run is **one complete sweep**. Its blocking defects become a part of the
active plan and its backlog defects become issues, as above; the run then ends.
It does not repeat until a sweep comes back empty.

The old rule (stop after two consecutive sweeps with no new blocking defect)
was retired on 2026-09-30 after twelve sweeps. New blocking defects per sweep
ran 25, 9, 8, 7, 4, 7, 7, 3, 3, 6, 5, 7: the audits the hunt had already read
converged, but each batch of sites it had not read brought about one blocking
defect per two sites, mostly in the page population. On the open web that tail
does not end, so a zero-defect stop never comes. The per-audit check in the
finalizer does end, and it runs where the harm would happen.

A sweep still reads audits the hunt has not seen before when such audits
exist, because new sites are where most defects come from. A sweep that
finds no new site to read says so in its notes.

Also end a sweep early, and report, when:

- the data can no longer answer the open questions (for example, when every
  remaining doubt needs a new full audit), or
- a finding needs an operator decision before any further search is useful.

Do not stop because a sweep is long, the context is large or the findings are
getting subtle. When the context runs low, update the ledger first so the next
context resumes from it.

## Final report to the operator

Keep it short and plain, outcome first:

- the new blocking and backlog defects of this sweep, and how many were found
  only on sites new to the hunt;
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

- Mode: occasional sweeps, and what should trigger the next one.
- Data state: what is deployed and refreshed.
- Next sweep: which audits, and where to start.

## Sweep N+1 start list

| Slice | Audit | Expected on the stored findings |
|---|---|---|

## Sweeps

| Sweep | Date | Audits | Angles (brief numbering) | Complete | New blocking | New backlog | Plan part and issues |
|---|---|---|---|---|---|---|---|

## Open doubts

| Doubt | Since | Angle | Smallest action that settles it |
|---|---|---|---|

## Minor items

| Item | Found | Status |
|---|---|---|

## Finalizer runs

| Date | Audit | Target | Status | Defects (blocking / backlog) | Fixes | Rescan |
|---|---|---|---|---|---|---|

## Sweep N notes

- Angle: what was checked, how many items were read, and the result
  (new / known / clean).
```
