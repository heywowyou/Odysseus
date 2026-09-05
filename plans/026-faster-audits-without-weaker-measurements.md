# Plan 026: Faster single audits without weaker measurements

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update this plan's status row in
> `plans/README.md`, unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 991b434..HEAD -- CLAUDE.md docs/decisions/trade-offs.md packages/scanner/src packages/core/src/normalize packages/core/src/types/manifest.ts packages/interface/src/queue`
> Stop if `crawl.ts`, `render-diff.ts`, `scan-site.ts`, `scan-page.ts`,
> `lighthouse-isolated.ts`, `lighthouse.ts`, `full-audit-plan.ts`, or
> `artifacts/prune-screenshots.ts` changed shape, or if trade-off 10 was
> already rewritten by someone else.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MEDIUM (HIGH at Steps 5 and 6 only)
- **Depends on**: nothing. Steps 1 through 4 are independently shippable.
- **Category**: performance
- **Planned at**: commit `991b434`, 2026-09-05
- **Issue**: not yet filed

## Why this matters

The goal is one full audit finishing sooner, confirmed with the operator on
2026-09-05: the complaint is sitting and waiting on a single site, as during
an audit rehearsal, not a backlog clearing too slowly. Throughput levers are
therefore out of scope, and one of them is worth naming so it is not reached
for by mistake. `QUEUE_CONCURRENCY` (`packages/interface/src/config.ts:15`,
default 1) runs whole audit jobs at once, each with its own Chromium on its
own free debug port. It is a real fix for a backlog and the wrong tool here:
a second job competes for the same cores as the audit you are waiting on, so
the run in front of you gets slower.

### What the new machine can and cannot do

Extra cores only help a stage that already runs work in parallel. Sorting
the pipeline that way is uncomfortable, because most of it does not:

- **The crawl is sequential.** One page at a time, a full browser
  navigation each (`crawl.ts:321`), with the politeness delay between. It
  uses one core and will use one core on any machine we buy.
- **The rendered stage runs in `SCAN_CONCURRENCY` lanes**, default 3. This
  is the only stage that gets faster because the box got bigger.
- **Lighthouse is serialized** behind a process-wide queue, one page at a
  time regardless of lanes.

So two of the three stages are structurally incapable of using the hardware.
Buying more cores and changing nothing else makes a single audit faster only
to the extent that the rendered stage dominates it, and Step 0 exists because
nobody has measured whether it does. What the machine can be spent on
immediately is memory rather than cores: holding more open at once to avoid
repeating work, which is what Steps 1 and 4 do.

### Where a page's time actually goes

Every page in a full audit is loaded in a browser **three times**, and four
times if the planner selects it for Lighthouse:

1. the crawl's navigation, for links and the audit profile (`crawl.ts:321`);
2. render diff's raw pass, JavaScript disabled (`render-diff.ts:75`);
3. render diff's rendered pass, which also carries axe and every custom
   check (`render-diff.ts:114`);
4. Lighthouse's own navigation, which it must perform itself.

Loads 1 and 3 are the same navigation with the same configuration and the
same user agent. The crawl loads the page to read its links, throws it away,
and the rendered pass loads it again a stage later. That is one entirely
redundant page load per page across the whole site, and because it lives in
the sequential stage it is also the one that scales worst.

On top of that, each page pays a politeness delay before the rendered pass
and another before Lighthouse, on top of the delay between pages in its
lane. Those are deliberate and stay (binding decision 5), but they are
waiting, not computing, and no amount of hardware shortens them.

### The clearest waste

Every page writes two full-page PNG screenshots, raw and rendered. At the
end of the audit, `selectPageDirsToKeep` keeps the homepage plus at most
**three** pages, ranked by render-diff percentage above a 20 percent
threshold (`prune-screenshots.ts:29`, `constants.ts:22`). Everything else is
deleted.

A 670-page audit of the kind plan 021 documents therefore encodes roughly
1,340 full-page screenshots and keeps about eight. Full-page capture of a
long page is not cheap, and this cost is paid inside the rendered stage, on
every lane, for output that is provably discarded. Step 1 is the one change
here that is both large and free of any accuracy question, because it can be
made to produce a byte-identical final artifact directory.

## Binding decisions

1. **Measurement precedes optimization.** No step past Step 0 is justified
   by an estimate. There is no committed timing data in the repository
   today; `queue/eta.ts` computes running averages at runtime and hardcodes
   nothing.

2. **Accuracy-neutral work ships before anything with an accuracy question.**
   Steps 1 through 3 cannot change a finding. Steps 4 through 6 can, and are
   gated accordingly. If Steps 1 through 3 alone make the wait acceptable,
   stopping there is a success, not a shortfall.

3. **Lighthouse concurrency requires a drift budget fixed in advance.**
   Median LCP and TBT across the compared pages stay within 5 percent of
   their serial values, no single page moves more than 10 percent, and no
   page crosses a Core Web Vitals threshold boundary it did not cross
   serially. A budget chosen after seeing the numbers is not a gate.

4. **Concurrent Lighthouse runs never share one Chromium instance.** Today
   every run connects to the same browser on one `debugPort`. Rejected on
   correctness grounds, not performance ones: Lighthouse's gather phase
   performs cache and storage clearing that is scoped to the browser or the
   origin rather than the tab, and every page in one audit is one origin.

5. **No politeness parameter changes.** No delay shortens, the user agent
   stays identifiable, robots.txt stays honoured, per-page timeouts stay.
   Non-negotiable rule 5 is not what this plan spends. Step 5 raises a
   question about one clause of it and answers it by asking the operator,
   never by reinterpreting it unilaterally.

6. **Coverage is not narrowed to buy speed.** Trade-off 64 resolves
   ambiguity toward fuller coverage. Every successfully crawled HTML page
   keeps render diff, axe, and the extended pass. Step 0 measures the
   Lighthouse selection rate so the operator can see it; changing the
   classifier is out of scope and would be its own plan.

7. **Trade-off 10's stated rationale is rewritten regardless of outcome.**
   It cites a `perf_hooks` collision that stopped being possible when
   Lighthouse moved to a forked child process (`scan-page.ts:211-218`
   already says so). A stale reason is its own defect: the next reader
   either removes the queue believing the only risk is one that cannot
   happen, or keeps it for a reason that is no longer true.

## Steps

### Step 0: Measure the stage split before changing anything

On the target VPS, for one real audit of a representative hotel site,
record:

- wall clock split three ways: crawl, rendered/axe/extended, Lighthouse;
- inventoried URLs, content-checked pages, and performance-measured pages,
  in CLAUDE.md's own coverage vocabulary;
- the Lighthouse selection rate broken down by the reason codes
  `finalizeLighthousePlan` already attaches, so `unknown-or-fallback-role`
  is visible separately from `family-representative-stable`;
- time spent in full-page screenshot capture, so Step 1's payoff is known
  rather than argued;
- the rate of pages hitting `RENDER_SETTLE_TIMEOUT_MS`, as the baseline
  Step 4 is judged against;
- confirmed VPS core count and RAM, rather than assuming what a KVM 4 is.

Two of these decide whether the rest of the plan is aimed correctly.

The **crawl share** matters because a claim in the code is unverified.
`scan-site.ts:477` says the crawl stays sequential partly because "it is not
the bottleneck". That was plausible when a page cap was mandatory. Since the
cap became opt-in, an uncapped audit can explore hundreds of URLs, each a
sequential navigation plus a delay. If that stage is half the wall clock,
then everything downstream of it is the wrong target and you will still be
waiting.

The **reason-code breakdown** matters because if most Lighthouse selections
carry `unknown-or-fallback-role`, the audit is slow because role
classification is weak, not because Lighthouse is serialized, and no
concurrency work addresses the cause.

Coordinate before running: a rehearsal or second audit on the same machine
would corrupt exactly the timing this step exists to collect.

**Verify**: numbers written into this plan before Steps 4, 5, or 6 begin.
Steps 1 through 3 need no measurement to justify and may proceed in
parallel.

### Step 1: Stop capturing screenshots that pruning provably deletes

The keep set is the homepage plus at most three pages whose render-diff
percentage is at or above 20. A page below that threshold can never enter
the keep set, whatever the rest of the site does. Its two screenshots are
therefore guaranteed to be deleted before the audit finishes, and capturing
them is pure cost.

Both text lengths that decide the percentage are already computed before
either screenshot is taken (`render-diff.ts:81` and `:125`). The obstacle is
ordering, not information: the raw screenshot is captured and its context
closed at `:82-84`, before the rendered pass has produced the other half of
the comparison.

Restructure so the decision precedes the capture. Hold the raw context open
across the rendered pass, compute the percentage once both text lengths
exist, then capture both screenshots only for the homepage and for pages at
or above the threshold. This is precisely the memory-for-time trade the new
machine makes affordable: one extra open browser context per lane.

Pages above the threshold are still captured even though only three survive
ranking, because the ranking is not knowable until the site is finished. That
residual waste is bounded and stays.

Do not reimplement the keep predicate. Trade-off 2 makes
`selectPageDirsToKeep` the single implementation deciding which screenshots
survive; this step must read the same threshold constant, not a copy of it.
`rawScreenshotRef` and `renderedScreenshotRef` are already optional on
`RenderDiffResult` (`findings.ts:161`), so omitting them is representable.

**Verify**: run the same site before and after; the final artifact directory
must be byte-identical in which page directories and files exist. Confirm
the emitted finding set is unchanged. Confirm `pruneScreenshots` reports
fewer pruned directories only because fewer were written, never because a
kept one went missing. Record the wall-clock difference against Step 0.

### Step 2: Stop running two Lighthouse categories whose output is discarded

`lighthouse.ts:33` requests `performance`, `accessibility`, `seo`, and
`best-practices`. `LIGHTHOUSE_EXCLUDED_CATEGORIES` (`constants.ts:44`)
excludes `accessibility` and `best-practices` from finding emission, so
neither can produce one. Their only remaining trace is two scores on
`manifest.lighthouseExcludedCategoryScores`, and nothing reads them: there
is no consumer in `report`, `llm`, or `interface`.

The accessibility category is the expensive one, because Lighthouse runs
axe-core inside the page to produce it. The rendered stage already ran
`@axe-core/playwright` against that same page, so every performance-measured
page pays for axe twice and uses one result.

Drop both from `onlyCategories`.

One consequence needs sign-off rather than being folded in silently: the two
manifest scores become `null` for new audits. Nothing reads them, but the
manifest is a stored contract and a monitoring diff would see a number become
absent. Either accept the nulls or drop the fields and their Mongoose schema
entries outright. Do not keep the categories running to preserve a number
nothing consumes.

**Verify**: Lighthouse duration for one page before and after, against the
fixture. The emitted finding set must be byte-identical, since neither
category could emit. The Core Web Vitals table must be unchanged, since all
five metrics come from `performance`.

### Step 3: Stop loading the TypeScript loader in production Lighthouse forks

`lighthouse-isolated.ts:79` passes `execArgv: ['--import', 'tsx', ...]` on
every fork. In a built deployment the worker is a `.js` file and the loader
only costs startup time and memory per run. `resolveWorkerPath` already
distinguishes the two cases; use the same signal to pass `--import tsx` only
when the resolved worker is `.ts`.

Small alone, and here because Step 6 would multiply per-fork overhead by the
concurrency factor.

**Verify**: a scan through the **built** package still produces Lighthouse
results. This exact area previously failed silently on every page of every
built scan while working under `tsx` (`lighthouse-isolated.ts:6`), so
verifying under `tsx` alone is not verification.

### Step 4: Raise rendered-stage concurrency against the settle-timeout guard

`SCAN_CONCURRENCY` defaults to 3 and drives the only stage that can use
extra cores today. That stage measures structure, so parallelism does not
bias its answers.

One caveat stops this being a free dial. `RENDER_SETTLE_TIMEOUT_MS` is an
8 second deadline for the network to fall idle after `load`. Under CPU
contention a page that would have settled may not, and the rendered pass
then measures text before painting finished, which moves `missingPercent`
and therefore moves a client-facing render-diff finding. That is the one
place the "structural checks are concurrency-safe" argument leaks, and Step
1 makes it slightly worse by holding a second context open per lane.

So raise it by measurement, not by choosing a number. For each candidate
value, compare the settle-timeout hit rate against Step 0's baseline and
stop at the last value where it is unchanged.

**Verify**: settle-timeout hit rate unchanged from baseline, and per-page
`missingPercent` unchanged on a re-run of the same site. Record the chosen
value and the measured stage time.

### Step 5: Put the sequential crawl to the operator as a decision

Attempt only if Step 0 shows the crawl is a large share of wall clock.

The crawl is sequential by choice, and `scan-site.ts:477` explains that
choice as politeness: it is "the phase CLAUDE.md's politeness rule names
most directly". That reading deserves examination rather than either quiet
acceptance or quiet reversal, because the scan phase already issues
`SCAN_CONCURRENCY` concurrent request streams at the same site. The site
already sees three lanes from us. A crawl running in two or three lanes,
each keeping the full unshortened delay, would not raise the peak concurrent
load the site already experiences during the scan phase.

That is an argument, not a licence. Non-negotiable rule 5 is the operator's
rule and this plan does not reinterpret it. Present the measured crawl share,
the observation above, and these options, then stop:

| Option | Cost | Effect |
| --- | --- | --- |
| Leave the crawl sequential | None | Large sites stay slow. Honest fix is a truthful expected-duration signal in the dashboard, not a faster scan |
| Crawl in lanes, delay per lane unchanged | Rule 5 interpretation, operator sign-off | Cuts the stage roughly by the lane count; site sees no more concurrency than the scan phase already produces |
| Fuse the crawl into the rendered pass | Large refactor, high risk | Removes a whole redundant page load per page, but moves expensive work into the sequential stage unless the crawl is concurrent first, so it is strictly worse than the option above on its own |

The recommendation is the middle option **if and only if** the operator
accepts the rule 5 reading, and the first otherwise. The third is listed
because the redundant load is real and someone will propose it; it is worse
alone because it makes the sequential stage carry axe and every custom check.

**Verify**: nothing is implemented in this step. It ends in a recorded
operator decision.

### Step 6: Bounded Lighthouse concurrency, only if it survives its gate

Attempt only after Step 0 shows Lighthouse is a dominant stage and after
Steps 1 through 4 have taken the cheap time out first.

The blocker named in trade-off 10 is already gone. Lighthouse runs in a
forked child per page (`lighthouse-isolated.ts:75`), so the process-global
`perf_hooks` mark collision the queue was built for cannot occur across
forks. The queue survived on an unevaluated memory argument, and on a
measurement-validity argument the trade-off log never recorded at all.

That second argument is the real one, and it is why this step is last rather
than first. Lighthouse is the only pass in the audit that measures time.
Its default throttling observes how long real work takes and scales it up to
model a slower device, so sibling runs competing for the same cores do not
add noise around a true value, they bias every number the same direction.
On four cores with Chromium already serving the render lanes, the plausible
ceiling is two concurrent runs, not four.

Two things must hold first. The shared-browser question in binding decision
4 must be settled by direct verification rather than assumed in either
direction, and the drift budget in binding decision 3 must pass on the
target VPS comparing the same pages serially and concurrently.

If both hold, replace the process-wide queue with a bounded pool, each run
holding its own browser and its own bounded-heap child. Memory is then the
second limit and the existing 1024 MB per-child cap is the unit to multiply.

If the gate fails, stop and report. That is a real result: the speedup was
not available at the accuracy we sell, and the queue stays with binding
decision 7's rewrite explaining why.

**Verify**: the drift budget page by page, peak RSS across the run, and an
unchanged finding set on a re-run of the same site.

### Step 7: Reconcile trade-off 10, CLAUDE.md, and the crawl comment

Independent of Steps 5 and 6's outcomes.

Trade-off 10 must stop citing `perf_hooks` as the live reason for the queue
and record what is true: the collision was structurally removed by the
forked child; the remaining justifications are memory and measurement
validity; and whichever this plan resolved or failed to resolve. CLAUDE.md's
one-line imperative needs the same treatment, since "do not remove that queue
without re-confirming the collision is gone" now sets a bar that is trivially
met and points at the wrong risk. Keep it to one line per trade-off 66.

Correct `scan-site.ts:477`'s "it is not the bottleneck" either way, since
Step 0 will have measured it.

If Step 1 ships, record it as a new trade-off entry: screenshot capture is
now gated on the same predicate that governs retention, and the two must not
drift apart. Trade-off 2 already forbids a second keep-predicate
implementation; this extends its reach to capture as well as pruning.

## STOP conditions

- Step 0 cannot run because another audit or rehearsal is active. Timing
  from a contended machine is worse than none, because it will be trusted.
- Step 0 shows the sequential crawl dominates. Go to Step 5, which ends in
  an operator decision, and do not proceed to Steps 4 or 6 first.
- Step 0 shows most Lighthouse selections carry `unknown-or-fallback-role`.
  Stop and report: the cause is classification, and narrowing coverage is
  out of scope per binding decision 6.
- Step 1's before-and-after artifact directories are not identical. The
  optimization is only sound while it is provably invisible in the output.
- Step 2's manifest nulls are unacceptable and no decision is reached on
  dropping the fields instead.
- Step 6's drift gate fails. Report the numbers, keep the queue, do Step 7.
- Any step appears to require shortening a delay, dropping robots.txt
  handling, or reducing which pages get render diff, axe, or the extended
  pass. Those are rule 5 and trade-off 64.
- The locked contracts in `findings.ts`, `severity.ts`, or `llm-output.ts`
  would need to change. Nothing here should touch them; if a step seems to
  require it, the step is wrong.

## Success criteria

- A measured record of where a single audit's wall clock goes, which does
  not exist in the repository today.
- The scan stops producing output it provably deletes and stops running
  Lighthouse categories it discards.
- Any concurrency that ships is backed by a before-and-after comparison of
  the metrics the client is shown, against a budget fixed in advance.
- The crawl's cost is either reduced with the operator's explicit consent or
  disclosed honestly as an expected duration.
- Trade-off 10 and `scan-site.ts:477` state rationales that are true at the
  commit that ships them.
- No finding, no page's coverage, and no politeness parameter changes.
