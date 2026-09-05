# Plan 026: Faster full audits without weaker measurements

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update this plan's status row in
> `plans/README.md`, unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 991b434..HEAD -- CLAUDE.md docs/decisions/trade-offs.md packages/scanner/src packages/core/src/normalize packages/core/src/types/manifest.ts packages/interface/src/queue`
> Stop if `scan-site.ts`, `scan-page.ts`, `lighthouse-isolated.ts`,
> `lighthouse.ts`, or `full-audit-plan.ts` changed shape, or if trade-off 10
> was already rewritten by someone else.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MEDIUM (HIGH at Step 4 only)
- **Depends on**: nothing. Steps 1 and 2 are independently shippable.
- **Category**: performance
- **Planned at**: commit `991b434`, 2026-09-05
- **Issue**: not yet filed

## Why this matters

**The problem is single-audit latency, not throughput.** The operator
confirmed this on 2026-09-05: the complaint is sitting and waiting for one
site to finish, as during an audit rehearsal, not a backlog of hotels
clearing too slowly. That distinction decides which lever is even relevant,
because this repository has two unrelated ones and only one of them helps.

The lever this plan does **not** use is `QUEUE_CONCURRENCY`
(`packages/interface/src/config.ts:15`, default 1), which controls how many
whole audit jobs the dashboard runs at once. Each job already launches its
own Chromium on its own free debug port (`browser.ts`), so raising it is a
legitimate throughput fix and needs no code change. It is the wrong tool
here and actively counterproductive: a second concurrent job competes with
the audit you are waiting on for the same cores, so the run in front of you
gets slower, not faster. Recorded because the two levers are easy to
confuse, and because raising that env var is a one-line change nothing
reviews.

What is left is the work inside one audit, and the obvious lever there looks
like running several Lighthouse passes at once instead of one at a time.
Reading the shipped scanner first changes that picture in two ways, one
encouraging and one cautionary.

The encouraging half: the reason the queue exists no longer applies. The
scan used to run Lighthouse inside its own process, where two simultaneous
runs would trip over the same process-wide stopwatch and fail. Lighthouse
now runs in a separate child process per page, so each run gets its own
stopwatch and that collision is gone by construction. The code already
notices this and says so; the queue survived only because nobody had
evaluated what removing it would cost.

The cautionary half, and the reason this plan is not simply "delete the
queue": Lighthouse is the only part of the audit that measures *time*.
Every other check asks a structural question with a stable answer, like
whether alt text is present or how many resources a page pulls. Those
answers do not change if the machine is busy, which is exactly why running
them in parallel lanes was safe. Lighthouse asks how fast the page is, and
the default configuration reaches that answer by watching how long real work
takes and then scaling it up to model a slower device. Put four of those
runs on one machine and each one is timing a computer that the other three
are keeping busy. The page has not become slower; our stopwatch has. That is
not a small amount of noise around a true value, it is a bias that pushes
every number the same direction, and Core Web Vitals are sold to the client
as measurements.

So the shape of this plan is: take the free speed that costs nothing first,
measure where the time actually goes before spending effort on the expensive
change, and treat Lighthouse concurrency as a change that must prove it did
not move the numbers rather than one that is assumed safe because the old
blocker is gone.

There is also a lever nobody has looked at that may be larger than
concurrency. Lighthouse does not run on every page; a planner selects which
pages get it. That planner forces Lighthouse onto every page whose role it
could not confidently classify. On a site with thin structured data that arm
could be selecting most of the site, in which case the audit is slow because
it is running far more Lighthouse passes than intended, and no amount of
parallelism addresses the cause. Step 0 measures this before anything else
is decided.

## Binding decisions

1. **Trade-off 10's stated rationale is rewritten regardless of what this
   plan ships.** It currently tells a future reader that the queue guards a
   `perf_hooks` collision. That has been false since Lighthouse moved to a
   forked child. Leaving a stale reason in the trade-off log is its own
   defect: the next person to read it either removes the queue believing the
   only risk is a collision that cannot happen, or leaves it in place for a
   reason that stopped being true. The rewrite records the real remaining
   risks, memory and measurement validity, and it lands even if Step 4 is
   abandoned.

2. **No Lighthouse concurrency ships without a measured drift budget.** The
   gate is a comparison of the same pages measured serially and
   concurrently on the target VPS, and it is judged on the metrics the
   report actually prints. If concurrency moves them beyond the budget in
   decision 3, concurrency does not ship, and the honest outcome is that the
   speedup was not available.

3. **The drift budget is stated before the measurement, not after.** Median
   LCP and TBT across the compared pages must stay within 5 percent of their
   serial values, no single page may move more than 10 percent, and no page
   may cross a Core Web Vitals threshold boundary it did not cross serially.
   A budget chosen after seeing the numbers is not a gate. If the operator
   wants different limits, they are set at Step 0 and written into this
   plan.

4. **Measurement precedes optimization.** No step past Step 0 is justified
   by an estimate of where audit time goes. There is no committed timing
   data in the repository today; `queue/eta.ts` computes running averages at
   runtime and hardcodes nothing.

5. **Concurrent Lighthouse runs never share one Chromium instance.** Today
   every run connects to the same browser on one `debugPort`. If Step 4
   proceeds, each concurrent run gets its own browser process. Sharing is
   rejected on correctness grounds, not performance ones, and the
   verification for that is part of Step 4.

6. **Non-negotiable rule 5 is untouched.** No delay shortens, the crawl
   stays sequential, the user agent stays identifiable, and per-page
   timeouts stay. This plan changes how much work runs at once on our own
   machine, never how hard we lean on the audited site. Note that raising
   parallelism does raise concurrent request volume against the target, so
   the per-lane delay stays exactly as it is.

7. **Coverage is not narrowed to buy speed.** Trade-off 64 resolves
   ambiguity toward fuller coverage, and this plan does not reopen it. Step
   0 measures the selection rate so the operator can see it; changing the
   classifier is out of scope and would be its own plan with its own review.

## Steps

### Step 0: Measure the baseline before changing anything

Nothing else in this plan is justified without this. Produce, on the target
VPS, for one real audit of a representative hotel site:

- wall clock split by stage: crawl, rendered/axe/extended, Lighthouse;
- the count of inventoried pages, content-checked pages, and
  performance-measured pages, using the vocabulary CLAUDE.md already
  defines;
- the Lighthouse selection rate, broken down by the reason codes
  `finalizeLighthousePlan` already attaches, so
  `unknown-or-fallback-role` is visible as its own number against
  `family-representative-stable` and the rest;
- confirmation of the VPS core count and RAM, rather than assuming a KVM 4
  is 4 vCPU.

Two things in that list are the point of this step, not filler.

The reason-code breakdown is the first. If most Lighthouse runs carry
`unknown-or-fallback-role`, the audit is slow because classification is
weak, and that is a different plan than this one.

The crawl timing is the second, and it exists because a claim in the code is
currently unverified. `scan-site.ts:477` states that the crawl stays
sequential partly because "it is not the bottleneck". That was plausible
when a page cap was mandatory. It is an assertion, not a measurement, and
the numbers that make it doubtful are already in the repository: plan 021
records an uncapped audit that explored 672 URLs, and the crawl walks those
one at a time with a one second delay plus a real navigation each. If that
stage is twenty or thirty minutes of a single audit's wall clock, then
parallelising Lighthouse is optimising the wrong end and the operator is
still going to be sitting there waiting.

Measuring it does not imply changing it. Non-negotiable rule 5 names the
crawl most directly and binding decision 6 keeps it sequential. But an
honest split is what tells us whether this plan can deliver a felt
improvement at all, or whether the answer is that a large site is slow for a
reason we have deliberately chosen and should surface in the dashboard as an
expected duration instead.

Coordinate with the operator before running: an audit rehearsal was active in
another session when this plan was written, and two concurrent real audits
would corrupt exactly the timing data this step exists to collect.

**Verify**: the numbers are written into this plan's Step 0 results section
before Step 3 or Step 4 begins. Steps 1 and 2 may proceed in parallel with
this measurement, since neither depends on it.

### Step 1: Stop running two Lighthouse categories whose output is discarded

`lighthouse.ts:33` requests `performance`, `accessibility`, `seo`, and
`best-practices`. `LIGHTHOUSE_EXCLUDED_CATEGORIES` then excludes
`accessibility` and `best-practices` from finding emission, so neither can
produce a finding. Their only remaining trace is a pair of scores on
`manifest.lighthouseExcludedCategoryScores`, and nothing reads them: no
consumer exists in `report`, `llm`, or `interface`. The stated reason for
keeping them is that the numbers should not be lost.

The accessibility category is the expensive one, because Lighthouse runs
axe-core inside the page to produce it. The rendered stage already ran
`@axe-core/playwright` against that same page, so on every
performance-measured page we currently pay for axe twice and use one result.

Drop both categories from `onlyCategories`.

This is not free in one respect, which is why it needs sign-off rather than
being folded into a later step: the two manifest scores become `null` for
new audits. Nothing reads them, but a monitoring diff comparing a new audit
against a stored one would see a number become absent, and the manifest is a
stored contract. Either accept the nulls, or drop the fields and their
Mongoose schema entries outright. Do not leave the categories running purely
to keep a number nothing consumes.

**Verify**: measure one page's Lighthouse duration before and after against
the fixture. Confirm the emitted finding set is byte-identical, which it must
be, since neither category could emit. Confirm the Core Web Vitals table is
unchanged, since all five metrics come from the `performance` category.

### Step 2: Stop loading the TypeScript loader in production Lighthouse forks

`lighthouse-isolated.ts:79` passes `execArgv: ['--import', 'tsx', ...]` on
every fork. In a built deployment the worker is a `.js` file and the loader
does nothing except cost startup time and memory on every Lighthouse run.
`resolveWorkerPath` already distinguishes the two cases; use the same
signal to include `--import tsx` only when the resolved worker is `.ts`.

Small on its own. It is here because Step 4, if it proceeds, multiplies
per-fork overhead by the concurrency factor, so it is worth removing first.

**Verify**: a built-package scan still produces Lighthouse results. This is
the exact area where a dev-only assumption previously failed silently on
every page of every built scan, per the comment at `lighthouse-isolated.ts:6`,
so verify against the built package and not only under `tsx`.

### Step 3: Raise rendered-stage concurrency, guarded by the settle timeout

`SCAN_CONCURRENCY` defaults to 3 and drives the rendered/axe/extended lanes.
That stage measures structure, so parallelism does not bias its answers, and
a larger VPS is a genuine reason to raise it.

One caveat keeps this from being unconditional. `RENDER_SETTLE_TIMEOUT_MS`
is an 8 second deadline for the network to fall idle after `load`. Under
heavy CPU contention a page that would have settled may not, and the
rendered pass would then measure text before it finished painting, which
moves `missingPercent` and therefore moves a client-facing render-diff
finding. This is the one way the "structural checks are concurrency-safe"
argument leaks.

So raise it by measurement, not by choosing a number: for each candidate
value, compare the rate of pages that hit the settle timeout against the
baseline, and stop raising at the last value where that rate is unchanged.

**Verify**: settle-timeout hit rate unchanged from Step 0's baseline, and
`missingPercent` per page unchanged on a re-run of the same site. Record the
chosen value and the measured stage time.

### Step 4: Bounded Lighthouse concurrency, only if it survives its gate

Attempt this only after Step 0 shows Lighthouse is actually the dominant
stage, and only after Steps 1 and 3 have taken the cheap time out first.

Two things must be true before any concurrency is enabled.

First, the shared-browser question must be settled. Every Lighthouse fork
currently connects to the same Chromium on one `debugPort`. Lighthouse's
gather phase performs cache and storage clearing that is scoped to the
browser or to the origin rather than to a single tab, and every page in one
audit is the same origin. If that is confirmed, two concurrent runs on one
browser can corrupt each other's gathering, which is a correctness failure
and not merely noise. This must be verified directly rather than assumed in
either direction. Per binding decision 5, the design is one browser per
concurrent run regardless; the verification determines whether sharing was
actively producing bad data before now.

Second, the drift gate in binding decisions 2 and 3 must pass on the target
VPS, comparing the same set of pages measured serially against the same set
measured at the proposed concurrency.

If both hold, replace the process-wide queue with a bounded pool. Size it
from measurement, and expect it to be small: on a four-core box, with
Chromium already serving the render lanes, the plausible ceiling is two
concurrent Lighthouse runs, not four. Each run holds its own browser and its
own bounded-heap child, so memory is the second limit, and the existing
1024 MB per-child cap is the unit to multiply.

If the gate fails, stop and report that. A failed gate is a real result: it
means the speedup was not available at the accuracy we sell, and the correct
outcome is the queue staying exactly where it is with binding decision 1's
rewrite explaining why.

**Verify**: the drift budget, page by page, plus peak RSS across the run,
plus an unchanged finding set on a re-run of the same site.

### Step 5: Rewrite trade-off 10 and reconcile CLAUDE.md

Independent of Step 4's outcome. Trade-off 10 must stop citing `perf_hooks`
as the live reason for the queue and must record what is actually true:
the collision was structurally removed when Lighthouse moved to a forked
child; the queue's remaining justifications are memory and measurement
validity; and whichever of those this plan resolved or failed to resolve.

CLAUDE.md's one-line imperative for trade-off 10 needs the same treatment,
since "do not remove that queue without re-confirming the collision is gone"
sets a bar that is now trivially met and points at the wrong risk. Keep it to
one line per trade-off 66's size discipline; the narrative belongs in
trade-offs.md.

## STOP conditions

- Step 0's measurement cannot be run because another audit or rehearsal is
  active. Timing data collected against a contended machine is worse than
  none, because it will be trusted.
- Step 0 shows most Lighthouse selections carry `unknown-or-fallback-role`.
  Stop and report: the cause is classification, not serialization, and
  narrowing coverage is explicitly out of scope here per binding decision 7.
- Step 0 shows the sequential crawl, not Lighthouse, dominates single-audit
  wall clock. Stop and report before doing Steps 3 or 4. Rule 5 keeps the
  crawl sequential, so the honest response is a truthful expected-duration
  signal in the dashboard rather than shaving the stage that was not the
  problem. Correct the "it is not the bottleneck" claim at
  `scan-site.ts:477` either way, since it will then be measured rather than
  assumed.
- Step 1's manifest nulls are not acceptable to the operator and no decision
  is reached on dropping the fields instead.
- Step 4's drift gate fails. Report the numbers, keep the queue, complete
  Step 5.
- Any step would require shortening a politeness delay, making the crawl
  concurrent, or reducing which pages get render diff, axe, or the extended
  pass. None of those are on the table; they are rules 5 and trade-off 64.
- The locked contracts in `packages/core/src/types/findings.ts`,
  `severity.ts`, or `llm-output.ts` would need to change. Nothing in this
  plan should touch them; if a step seems to require it, the step is wrong.

## Success criteria

- A measured, written record of where full-audit wall clock actually goes,
  which does not exist in the repository today.
- Lighthouse stops doing work whose output is discarded.
- Any concurrency that ships is backed by a before-and-after comparison of
  the metrics the client is shown, against a budget fixed in advance.
- Trade-off 10 states a rationale that is true at the commit that ships it.
- No finding, no page's coverage, and no politeness parameter changes.
