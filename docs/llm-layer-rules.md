# LLM layer rules

What the model is allowed to see, what it must return, and how failures
are handled. Decided before milestone 5 was built, so the build session
reads rules rather than being handed them in a prompt.

The contract itself is locked in `packages/core/src/types/llm-output.ts`
and is not repeated here. This file covers the behaviour built on top of
it.

Governing rule, restated because everything below serves it:
**deterministic scanners detect; the LLM explains, groups, prioritizes,
and translates.** The model may never introduce a finding absent from its
structured input.

---

## 1. Which findings the model sees

**Findings at `critical`, `serious`, and `moderate` severity are sent.
`minor` findings are not.**

On the sas-fernande scan, 61 of 78 findings were `minor`, almost all
low-weight Lighthouse audits: unminified JavaScript, unused CSS, images
that could be smaller. Real, but not what a client is paying to be told.
Sending all 78 spends roughly three quarters of the model's attention on
trivia and risks a theme about image formats ranking beside a theme about
an unusable contact form.

**Minor findings are not discarded.** They still appear in the report's
findings appendix, which the brief already describes as a full listing
grouped by category. The filter shapes the themed narrative at the front
of the report, not the completeness of the document. Milestone 6 renders
both sections and must read the unfiltered `findings.json` for the
appendix.

The threshold is a named constant, not a literal. If real reports show
the filter dropping something clients ask about, the alternative already
considered is to send everything with minor findings marked low priority
and capped at one or two catch-all themes. That change belongs here, in
this file, not in a prompt.

**The guard functions receive exactly what the model received.** Both
`findInventedFindingIds` and `findUnreferencedFindingIds` take the
filtered array, never the full set. Passing the full set to the guard
while sending the filtered set to the model would let a response reference
a finding it never saw and still pass validation.

---

## 2. Failure handling

Validate every response against `llmOutputSchema` with Zod, then run
`findInventedFindingIds`. A non-empty result is a hard rejection, logged
with the offending IDs.

Retry a fixed number of times, default 2, as a named constant. After the
last retry, **fail loudly**. Do not ship a partial analysis, do not fall
back to a template, do not silently drop the offending theme. An audit
that fails to analyse is a problem to fix; an audit that quietly ships an
untraceable finding is the failure mode that ends the business.

`findUnreferencedFindingIds` is a warning, not a rejection. Log the count.
A response that silently ignores half the findings is a quality problem
worth surfacing, but it is not a credibility failure.

---

## 3. Determinism and provenance

Claude Opus 5 and other current-generation Claude models reject the
`temperature` parameter outright (HTTP 400) - it no longer exists at this
model tier. Determinism comes from two things instead, neither of which
touches Zod validation or the invented-finding guard: those run
regardless, on every response, independent of how the response was
produced.

**Structured output**, via the Anthropic SDK's `output_config.format`
(built from `llmOutputSchema` with `zodOutputFormat`), constrains the
response shape server-side. This is a schema guarantee about _shape_, not
a validation step in itself - the code still runs an explicit,
auditable `llmOutputSchema.parse()` on every response, because CLAUDE.md's
Zod-validation rule is a business rule, not an SDK implementation detail
to trust implicitly.

**A low or medium `effort` level** (Claude's reasoning-depth parameter,
values `low`/`medium`/`high`/`xhigh`/`max`, set via the same
`output_config` object as `format`) keeps the model from over-exploring
alternative groupings on a task that calls for a stable, repeatable
answer over the same findings. This is a client deliverable, not a
brainstorm, and two runs over the same findings should not produce
materially different priorities.

**Record the model identifier and effort level alongside the output**,
for the same reason the audit manifest records axe and Lighthouse
versions: a model or effort-level change between two monthly monitoring
runs would otherwise read as the client's site having changed. Not
retrofittable onto stored analyses.

---

## 4. Site context

`LlmInput.siteContext` comes from the intake questionnaire, which does not
exist yet as a form.

Until it does, accept it as an optional JSON file passed on the command
line. When absent, send a minimal context derived from the audit itself
and say so in the output, rather than inventing a business type or a
primary goal. A model told the primary goal is "leads" when nobody said so
will rank findings against a fiction.

Language is a required parameter, not a default buried in code. French is
the expected common case, but bilingual delivery is a product requirement
and the parameter exists from the first call.

---

## 5. Where output goes

Same pattern as milestone 4: written to the audit's artifacts directory
and persisted to MongoDB, keyed by `auditId`.

Stored separately from the audit document rather than embedded, because
the same audit can be analysed more than once: once per language, and
again if the analysis is re-run after a prompt change. Each analysis
records its language, model identifier, effort level, and timestamp.

The analysis step reads `findings.json` from disk and never re-scans.
Re-running an analysis must never touch the client's site.

---

## 6. Output language and factual restraint

Added after the first live run, which produced good French prose with
three specific faults.

**Every prose field is in the requested language, including `title`.**
The first live run returned all eleven theme titles in English inside a
French analysis. Titles become the section headings in the PDF, so they
are the first thing a French client reads. `title`, `businessImpact`,
`legalRelevance`, `recommendedActions`, `executiveSummary`, and `notes`
are all prose. The only fields that stay fixed are the enums and the
finding IDs.

**Cite WCAG 2.2.** The scanner runs axe against the WCAG 2.2 AA tag set,
so the report cites 2.2. The first live run mixed 2.1 and 2.2 citations.
Criterion numbers are identical across versions so nothing was factually
wrong, but a client's developer will notice a report claiming to audit
2.2 while citing 2.1.

**Do not assert business facts that were not supplied.** The first live
run described the quote page as "la page la plus rentable du site". A
reasonable inference, stated as knowledge, and nobody had said it. This
extends section 4: without an intake file the model must not invent a
business type, a primary goal, revenue attribution, traffic assumptions,
or relative page value. It may say a page _appears_ commercially
important and why, which is inference the client can weigh, not a claim
they have to correct.

---

## 7. Analysis variance across runs

Identical findings produced eight quick wins in French and seven in
English on the first live run. Expected: the model is grouping and
ranking, not computing.

Milestone 10 compares runs to produce delta reports. Analysis variance
will appear there alongside real site changes, and the two must be
distinguishable. The finding layer is deterministic and diffable by
`dedupeKey`; the analysis layer is not. Monitoring deltas should be
computed from findings, with the analysis regenerated rather than
compared.

---

## 8. The hand-mirrored output schema

`packages/llm/src/output-schema.ts` hand-mirrors the locked
`llmOutputSchema` as a JSON Schema, because the SDK's `zodOutputFormat`
helper requires a zod v4 schema and the locked contract is built with
zod v3. Editing the locked contract to satisfy a helper was the wrong
trade, so the mirror exists instead.

It is an API shape hint only. It is **not** the validation authority:
`llmOutputSchema.parse()` runs explicitly on every response regardless.

A hand-maintained mirror decays silently. A test asserts the two describe
the same shape, so adding a field to the locked contract fails loudly
rather than quietly leaving the shape hint stale. If `packages/core` ever
moves to zod v4, delete the mirror and use the helper directly.
