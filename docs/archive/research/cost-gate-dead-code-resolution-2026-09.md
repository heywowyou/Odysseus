# Cost gate dead code resolution

Research date: 9 September 2026. This note records the investigation behind
the prospecting job header comment correction (issue #159, advisor plan 029,
planned at commit 71da99a). It is a tech-debt resolution record, not a
policy change: trade-off 23 in `docs/decisions/trade-offs.md` remains the
authority on the milestone 9b cost gates, and nothing here reverses it in
either direction.

## The question

`packages/core/src/cost-gating/brokenness.ts` ships three exported gates:
`computeBrokennessScore`, `isAuditFallbackEligible`, and
`isProspectingWorthy`. Which of them have production call sites, what does
the code claim about them, and does that claim still hold?

## Call-site census

Run on 9 September 2026 at commit 07c6d49 ("Wire the audit fallback gate so
thin audits skip the model", issue #162):

```
grep -rn "computeBrokennessScore\|isAuditFallbackEligible\|isProspectingWorthy" \
  --include="*.ts" packages/ | grep -v dist/
```

Hits, grouped:

- Definition and tests: `packages/core/src/cost-gating/brokenness.ts`
  (exports at lines 29, 44, and 70) and
  `packages/core/src/cost-gating/brokenness.test.ts` (describe blocks for
  all three symbols).
- One production call site: `packages/interface/src/pipeline/analysis-stage.ts`
  imports `isAuditFallbackEligible` at line 28 and evaluates it on the
  audit's full findings at line 259. This is new since the plan was
  written: issue #162 wired the audit fallback gate into the analysis
  stage, and trade-off 23 carries an amendment dated the same day recording
  it. The plan's premise that all three gates were unwired therefore holds
  for two of the three symbols only.
- Comments only, no code:
  - The header comment of
    `packages/interface/src/queue/pipeline/run-prospecting-job.ts`, the
    stale claim this resolution fixes.
  - `packages/core/src/prospecting/hotel-outreach-score.ts` lines 14 to 21,
    "Why the shipped cost gates are not reused": an accurate explanation of
    why the hotel path does not synthesize findings to reach
    `isProspectingWorthy`.

So after issue #162: `isAuditFallbackEligible` is wired;
`computeBrokennessScore` and `isProspectingWorthy` have no production call
site anywhere; their only consumers are tests and comments.

## Supersession evidence

Why the prospecting path does not use these gates:

1. Trade-off 23 (`docs/decisions/trade-offs.md`, entry 23, "Milestone 9b
   (prospecting throughput), 2026-08-22", starting near line 865) records
   that the gates were documented as decided policy before they existed,
   that "Neither gate was ever actually enforced", and that the milestone
   adds the implementation without wiring `isAuditFallbackEligible`, which
   "stays a documented gap rather than something silently built or silently
   left claimed-but-missing". The amendment dated 2026-09-09 closes that
   gap for `isAuditFallbackEligible` only.
2. The hotel path (the direction prospecting worthiness actually took) does
   not reuse the gates on purpose: a prescan produces no findings at all,
   so reaching `isProspectingWorthy` would mean inventing finding records
   the prescan never produced. Worthiness on that path is its own
   prescan-side predicate, `isHotelOutreachWorthy` and
   `computeHotelOutreachScore` in
   `packages/core/src/prospecting/hotel-outreach-score.ts`, which score
   prescan facts instead of findings.
3. Git histories, read side by side:
   `git log --oneline -- packages/core/src/cost-gating/` shows only the
   milestone 9b ship (81c1999) and later documentation and style
   reorganizations (ca65e8c, 1d3962c); the hotel scorer's history is
   independent (207fd9e, c750a96, 924278d). No commit after the gates
   landed ever wired any of them into `run-prospecting-job.ts`; the file's
   only reference to them was the header comment, and the census above
   confirms the job body calls none of the gates.

## What the stale comment claimed

`packages/interface/src/queue/pipeline/run-prospecting-job.ts` (lines 1 to
7 at the plan's base commit) said the gates "are available for a caller
that wants to score these results". That phrasing presented unwired
helpers, none of them called by this job, as a live option for scoring
prospect results, which contradicted trade-off 23's record and the actual
call graph.

## Decision taken

- Comment fix (applied): the header comment now states that nothing on the
  prospecting path is brokenness-gated, that the LLM and PDF stages are
  skipped unconditionally here, that `isAuditFallbackEligible` is wired
  into the audit analysis stage as of issue #162, that
  `computeBrokennessScore` and `isProspectingWorthy` remain unwired by
  decision per trade-off 23, and that the hotel path's real worthiness
  gate is `isHotelOutreachWorthy` and `computeHotelOutreachScore`. No code
  changed in that file; the diff touches comments only.
- Deletion (declined or unanswered): the plan gated any deletion of the
  still-unwired gates on an explicit operator decision, reached through
  the interactive question mechanism. The question was put on 9 September
  2026; no answer was given. One mechanical adaptation was needed before
  asking: the plan's question assumed all three gates were unwired, but
  issue #162 had just wired `isAuditFallbackEligible`, so the question
  covered only the two still-unwired symbols and deleting the wired one was
  not on offer (that would undo landed issue #162 behavior). Per the
  plan's own rule, unanswered means no deletion: the status quo stands.

## Follow-up

- `computeBrokennessScore` and `isProspectingWorthy` remain exported,
  tested, and unwired. Any change to that status needs a new trade-off
  entry or an explicit supersession note against trade-off 23; do not
  delete or wire them silently.
- `isProspectingWorthy`'s documented consumer (milestone 9c personalized
  outreach) is still unbuilt; the hotel scorer is the current worthiness
  gate for prospecting.
- If the gates' status changes again, update the fixed header comment in
  `run-prospecting-job.ts` and the "Why the shipped cost gates are not
  reused" section of `hotel-outreach-score.ts` in the same change.
