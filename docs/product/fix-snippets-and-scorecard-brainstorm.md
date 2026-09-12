# Fix snippets and a visual scorecard: brainstorm (plan 041, Slice 1)

Research and a written proposal only. No implementation code in this
document, per the plan's Slice 1 gate. Bring this to the operator for a
direction pick before Slice 2 is written.

## Operator direction pick, 2026-09-12

- **Fix snippets**: fill-in-the-blank pattern for content-dependent rules
  (question (a)'s majority case). Fixed-shape rules keep a ready-to-paste
  snippet as recommended.
- **Scorecard basis and framing**: a letter grade is shown, against the
  brainstorm's recommendation, but only ever paired with a mandatory,
  non-removable disclaimer sentence stating that it measures scanner
  findings, not legal compliance (rule 6 mitigation the operator chose
  over dropping the grade entirely). Built from the existing deterministic
  ingredients (severity counts, benchmark percentile), never `overallRisk`.
- **Location**: both the report cover/metadata sheet and the outreach
  preview, at once, rather than staging one first.
- **Build order**: fix snippets and the scorecard as one combined Slice 2,
  not split into two.

The sections below are the research and reasoning behind these picks, kept
as-is for reference; where the operator's pick differs from a
recommendation, this note is the authoritative decision.

## Fix snippets

### a. Which reachable rule IDs have a fixed-shape fix vs. a content-dependent one

The reachable rule-ID universe is 70 axe rules, 43 Lighthouse rules, and
59 custom rules (`packages/report/src/template/reachable-rule-ids.json`,
`packages/core/src/normalize/severity.ts`'s `CUSTOM_CHECK_SEVERITY`) —
about 172 total, each already required to carry FR/EN remediation copy
(trade-off 71). Surveying that set against what a deterministic snippet
could actually say:

- **Fixed-shape (a snippet can be close to complete without touching the
  client's content):** attribute/markup rules where the fix is a known
  HTML pattern independent of the page's own words — `image-alt`
  presence, `html-has-lang`/`html-lang-valid`, `meta-viewport`,
  `duplicate-id`, `label`/`aria-*` wiring rules, `document-title`
  existence, canonical/hreflang presence rules, security-header rules,
  structured-data validity. Order of magnitude: roughly a third of the
  172.
- **Content-dependent (the "fix" is writing something, not applying a
  pattern):** anything whose remediation is "write real alt text
  describing this image," "write a descriptive link name instead of
  'click here'," "shorten this page title to under 60 characters,"
  `color-contrast` (needs a real palette decision, not a drop-in value),
  most `geo`/SEO copy-quality rules, the heuristic alt-text check. This
  is the majority.
- **Structural/no-snippet-possible:** rules about site-wide behaviour
  (crawl budget, redirect chains, third-party origin inventory) that
  don't localize to one element at all.

This is a judgement split from reading the rule set, not a machine-
checked count — worth stating plainly rather than presenting as exact.
It matters because it sets client expectations: "paste this and it's
fixed" is only honest for the fixed-shape third. For the rest, a
snippet should show the *shape* of a correct fix (a template with a
placeholder) rather than a ready-to-paste value, or the tool ends up
generating filler alt text — which is worse than no alt text, because it
passes a scanner without being true, and directly undermines rule 6's
"we report, we do not conclude" posture applied to accessibility claims.

**Recommendation:** ship snippets in two visibly different presentations
— "apply this" for fixed-shape rules, "fix following this pattern,
filling in `<your own text>`" for content-dependent ones — rather than
one uniform snippet format that quietly overpromises on the majority
case.

### b. Where a snippet lives

Not a locked contract. `packages/report/src/template/remediation/index.ts`
already holds one `remediationFor(ruleId, language)` string per rule ID,
tested by `remediation.test.ts`, consumed at two render sites
(`rendered-priorities.ts`, `remaining-work.ts`). Three options:

| Option | Cost | Effect |
|---|---|---|
| New field alongside existing remediation copy (`remediationFor` returns `{ text, snippet? }`) | Low — same file, same per-rule-ID keying, same test that already enforces full coverage | Snippet and prose stay co-located and reviewed together; `snippet` naturally optional for the no-snippet-possible rules |
| Parallel table keyed by rule ID | Medium — new file, new coverage test to write and maintain | Keeps remediation prose and snippet code separately reviewable, but duplicates the per-rule-ID key and the coverage-enforcement machinery for no real benefit |
| Snippet computed ad hoc at render time from the `Finding` | High — logic scattered per rule ID at the call site instead of one table | No single place to review "does every reachable rule have a snippet or an explicit non-applicable marker" |

**Recommendation:** the first option. It reuses the exact mechanism
trade-off 71 already enforces (a source-derived test that fails the
build until copy exists) instead of inventing a second one.

### c. Evidence interpolation — is it needed, and how, deterministically

Some fixed-shape snippets are more useful with the actual selector or
attribute value dropped in (e.g. showing the real `id` in a
`duplicate-id` fix, or the real `src` in an `image-alt` fix) rather than
a generic placeholder. `FindingElement` (locked contract,
`packages/core/src/types/findings.ts`) already carries `selector`,
`snippet` (raw HTML), and `resourceUrl` per affected element — exactly
the fields a template-string interpolation needs, with no new data
capture required.

This must be pure string substitution into an already-reviewed template
(`` `<img src="${el.resourceUrl}" alt="` `` type interpolation), never an
LLM call — the LLM never introduces or rewrites a finding (rule 1) and
never sees this raw HTML in the first place under rule 4 if it's kept
out of any LLM-bound path. Since the snippet only ever renders in the
report/dashboard, not in an LLM prompt, rule 4 isn't actually at risk
here, but rule 1 is: a model-generated snippet would effectively be the
model inventing a "finding" about what the correct markup should be,
which is exactly what rule 1 forbids.

**Recommendation:** deterministic template interpolation only, escaping
the interpolated value for safe HTML display (it's already scanner-
captured raw HTML being redisplayed, but escape defensively since it
came from a third-party page). Restrict interpolation to the fixed-shape
snippets from (a); content-dependent snippets stay generic placeholders,
since interpolating a scanner-captured string (e.g. an existing bad alt
text) into a "write better copy" template adds noise, not help.

### d. Where it renders

Both existing per-rule remediation render sites are in the paid PDF
report (`rendered-priorities.ts`'s priority list, `remaining-work.ts`'s
full findings appendix). The dashboard doesn't currently render per-
finding remediation text — `packages/interface/src/dashboard` is an
operator tool, not a client-facing surface.

**Recommendation:** report only, for this slice. The report is the paid
deliverable the client actually reads and where remediation copy already
lives end to end (copy source, tests, both render sites). Dashboard
placement is a distinct question with its own audience (operator, not
client) and no established render site to extend — worth a separate
slice if wanted later, not bundled in.

## Scorecard

### a. What it aggregates

Three deterministic ingredients already exist and could feed a scorecard
without new computation:

1. **`computeStatistics`'s severity counts**
   (`packages/report/src/template/statistics.ts`) — `critical`/
   `serious`/`moderate`/`minor` counts and `categoryCounts`, already
   rendered as the report's statistics-page tiles today.
2. **`computeBrokennessScore`** (`packages/core/src/cost-gating/brokenness.ts`)
   — a single number, sum of `SEVERITY_ORDER` weight (critical=4,
   serious=3, moderate=2, minor=1) over distinct findings. This is a cost
   gate (trade-off 38/23 forbids editing it in place, but reading it is
   fine — it's a pure function, not a database write).
3. **The milestone-10 benchmark percentile**
   (`packages/core/src/benchmark/percentile.ts`,
   `packages/report/src/template/sections/benchmark-percentile.ts`) —
   already reuses `computeBrokennessScore` to rank a site against a
   same-scoring-version cohort (minimum cohort size 20) and already
   renders in the PDF today, as prose only ("this site scores worse than
   X% of comparable sites"). No visual treatment exists yet.

There is no case here for a *new* computation. The strongest option is
visual presentation of what already exists, and the benchmark percentile
in particular is the one number in the codebase that is both fully
deterministic and already framed as comparative ranking — the natural
core of a scorecard.

**Do not build the scorecard from `overallRisk`.** `overallRisk` (low/
medium/high, `packages/core/src/types/llm-output.ts`) is LLM-generated,
not deterministic — it is the model's judgement call, validated by Zod
but not traceable to a specific finding count the way severity totals
are. A scorecard built on it (or blending it with deterministic counts)
would let a model output masquerade as a hard measurement, which is
exactly the credibility risk rule 1 exists to prevent. The existing
"risk scale" badge on the metadata sheet (moved there by plan 018 step
4) already carries this field today; a new scorecard should be visually
and conceptually distinct from that badge, not a replacement or a blend.

**Recommendation:** a scorecard built from `computeStatistics`'s severity
counts (what's broken, by how much) plus the benchmark percentile (how
that compares), both already deterministic and already computed
somewhere in the pipeline. No new scoring formula.

### b. Where it renders

Four candidate surfaces, each with its own governing rule:

| Surface | Governing rule | Fit |
|---|---|---|
| Report cover / metadata sheet | Report design system is hand-maintained CSS (trade-off 9); this is the paid deliverable's first page | Good fit — client already reads a risk badge here (plan 018); a deterministic scorecard beside/replacing it is a natural extension |
| Outreach preview | Trade-off 42 — separate contract, no finding IDs/selectors/exact URLs/statistics admitted; docstring already calls the v2 format an "aggregate scorecard" | Already the closest prior art — `severityTotals` exists but renders as four flat number tiles today, no unified visual. A visual treatment of what's already in `OutreachPreviewSummary` fits without widening the contract (trade-off 42 forbids widening it to admit new fields, but a rendering change over an existing field is not a contract widen) |
| Dashboard | Private, single-user, operator only | Weakest fit for a "client-facing scorecard" framing — would be a different feature (operator triage aid), not what the plan's P3 slice (client deliverable polish) is asking for |
| Public site (`packages/site`) | Trade-off 60/marketing site has no access to the queue, database, or any other package | Not applicable — the site has no access to per-audit data at all; a scorecard there would require a new data-sharing surface, out of scope |

**Recommendation:** report cover/metadata sheet first (pairs with the
existing benchmark-percentile prose and risk badge, in the surface that
already has the design system to extend), with the outreach preview's
existing severity tiles as a natural second target once the visual
language is proven, since it needs no contract change.

### c. Is a letter grade ever shown externally, and does that risk overstating exposure

This is the sharpest open question. A letter grade (A/B/C/F) or a single
0-100 number implies a pass/fail verdict on compliance. Non-negotiable
rule 6 requires stating criteria, not verdicts, specifically for *legal*
obligations (accessibility law applicability, sanctions, deadlines) — a
brokenness/severity scorecard is a different kind of statement (technical
finding volume, not legal conclusion), so it does not directly trip rule
6's text. But it is adjacent risk: a client or a prospect reading "Grade:
D" off a report cover could reasonably infer "this site is legally
non-compliant," which the report elsewhere goes out of its way not to
assert (rule 6's own "we report, we do not conclude" framing, the LCEN
and obligation-basis machinery's careful hedging).

**Recommendation:** never a letter grade. Use the percentile framing
already established by the benchmark mechanism ("worse than X% of
comparable sites") and/or raw severity counts, both of which describe
*measured technical findings relative to peers*, not a compliance
verdict. A percentile is legible without implying pass/fail the way a
letter does. If a single number is wanted for visual punch, present it
as a finding-severity index labelled as such, not as a grade, and pair
it with a one-line disclaimer identical in spirit to the existing legal
hedging: this measures scanner findings, not legal compliance.

## Other open questions

1. **Should the scorecard be versioned like the wave-roster/cohort data
   (trade-off 38's insert-only pattern), or computed fresh at render
   time?** Recommendation: computed fresh at render time, same as
   `computeStatistics` and `computeBrokennessScore` already are — it's a
   pure function over stored findings, not a decision that needs an
   audit trail. Main tradeoff: if the severity weighting
   (`SEVERITY_ORDER`) ever changes, old reports would show numbers
   computed under a different scale with no record of which scale was
   used — acceptable since reports are already point-in-time PDFs, not
   living documents.

2. **Does the benchmark percentile's cohort-size floor (20) create a
   "no scorecard for X" gap for early clients/sectors?** Recommendation:
   render the severity-count portion of the scorecard unconditionally,
   and add the percentile portion only when `hasBenchmarkPercentile`
   already says a comparison exists — exactly the conditional the report
   already implements today, so no new logic needed, just a decision to
   keep the same conditional in the new visual form.

3. **Should fix-snippet coverage be enforced by the same source-derived
   test mechanism as remediation copy (trade-off 71), i.e. does an
   upgrade adding a new scanner rule fail the build until a snippet (or
   an explicit "no snippet, content-dependent" marker) exists?**
   Recommendation: yes for consistency, but only require the *marker*
   (snippet vs. explicitly-generic vs. explicitly-not-applicable), not a
   snippet body for every rule — matches the actual three-way split found
   in question (a) rather than forcing every content-dependent rule into
   a fake fixed-shape template just to pass the test.

4. **Do fix snippets need FR/EN translation the same way remediation
   prose does?** Recommendation: yes for the placeholder/explanatory text
   around a snippet ("fill in your own description here" / "remplissez
   votre propre description ici"), but the interpolated HTML/attribute
   values themselves are language-neutral markup, so only the wrapper
   text needs the bilingual treatment already required by the charter's
   "all user-facing strings support French and English" rule.
