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

Since Milestone 6.1 (see section 9), a single analysis is two model
calls, a structure pass and a writing pass, each with its own
independent retry loop and its own budget. A structure-pass retry never
consumes writing-pass budget and vice versa.

**Structure pass** (`analyzeStructure`): validate the response against
`structurePassOutputSchema` with Zod, then run
`findInventedStructureFindingIds`. A non-empty result is a hard
rejection, logged with the offending IDs.
`findUnreferencedStructureFindingIds` is a warning, not a rejection, same
as before: a response that silently ignores half the findings is a
quality problem worth surfacing, but it is not a credibility failure.

**Writing pass** (`analyzeWriting`): validate the response against
`writingPassOutputSchema`, then run two guards, both hard rejections:
`findThemeKeyMismatches` (the writing pass must return exactly one theme
per `themeKey` it was shown, no more, no fewer, no invented key - see
section 9) and `findLanguageComplianceViolations` (see section 6).

Both passes retry a fixed number of times, default 2, as the same named
constant (`MAX_RETRIES`). After the last retry, **fail loudly**. Do not
ship a partial analysis, do not fall back to a template, do not silently
drop the offending theme. An audit that fails to analyse is a problem to
fix; an audit that quietly ships an untraceable finding, a mismatched
theme, or the wrong language is the failure mode that ends the business.

---

## 3. Determinism and provenance

Claude Opus 5 and other current-generation Claude models reject the
`temperature` parameter outright (HTTP 400) - it no longer exists at this
model tier. Determinism comes from two things instead, neither of which
touches Zod validation or the invented-finding guard: those run
regardless, on every response, independent of how the response was
produced.

**Structured output**, via the Anthropic SDK's `output_config.format`,
constrains the response shape server-side. Each pass passes its own
hand-built JSON Schema (`STRUCTURE_OUTPUT_JSON_SCHEMA` /
`WRITING_OUTPUT_JSON_SCHEMA`, see section 8) rather than the SDK's
`zodOutputFormat` helper. This is a schema guarantee about _shape_, not
a validation step in itself - the code still runs an explicit, auditable
`structurePassOutputSchema.parse()` / `writingPassOutputSchema.parse()`
on every response, because CLAUDE.md's Zod-validation rule is a business
rule, not an SDK implementation detail to trust implicitly.

**A low or medium `effort` level** (Claude's reasoning-depth parameter,
values `low`/`medium`/`high`/`xhigh`/`max`, set via the same
`output_config` object as `format`) keeps the model from over-exploring
alternative groupings on a task that calls for a stable, repeatable
answer over the same findings. This is a client deliverable, not a
brainstorm, and two runs over the same findings should not produce
materially different priorities. Both passes use the same
`CLAUDE_MODEL`/`CLAUDE_EFFORT` constants; there is no separate
configuration tier per pass.

**Record the model identifier and effort level alongside the output**,
for the same reason the audit manifest records axe and Lighthouse
versions: a model or effort-level change between two monthly monitoring
runs would otherwise read as the client's site having changed. Not
retrofittable onto stored analyses. The persisted per-language document's
`model`/`effort` reflect the writing pass's call. Since both passes
always use the same constants this is a non-issue today; if the
constants were ever changed between a structure pass being generated and
a later `--language` run reusing it via cache-hit (section 5), that
reused run's actual structure-pass model/effort would not be separately
recorded - the locked `AnalysisDocumentFields` shape has one
`model`/`effort` slot, and adding a second pair was judged out of scope
for this fix.

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

**The structure pass's output is also written to disk**, at
`analyses/<timestamp>-structure.json`, following the same insert-only
convention as the language files: never overwritten, filenames sort
chronologically. `odysseus analyze <dir> --language X` looks for the
newest existing `*-structure.json` for that audit and reuses it by
default, so `--language fr` and `--language en` share one grouping and
ranking rather than each deciding their own (see section 9).
`--regenerate-structure` forces a fresh structure pass even if one
exists. A reused structure file is re-validated against the current
`findings.json` before being trusted: if it references a `findingId` no
longer present (a stale structure file against a re-normalized
`findings.json`), the command fails loudly with a pointer to
`--regenerate-structure` rather than silently regenerating or silently
proceeding.

None of this changes what lands in `analyses/<timestamp>-<language>.json`
or the `analyses` Mongo collection: both are still one complete,
Zod-validated `LlmOutput` per language, byte-for-byte the same shape as
before the two-pass split.

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

**A prompt instruction alone was tried first, and did not hold.** The
fault above was fixed at the time with a system-prompt instruction (the
`LANGUAGE_INSTRUCTION` string, now in `writing-prompt.ts`). A second real
run against the same site
(`artifacts/sas-fernande.fr/2026-08-02T17-31-56Z/analyses/2026-08-02T18-28-34Z-fr.json`)
showed all eleven `theme.title` values in English again, despite that
instruction being present in the system prompt at the time, while
`businessImpact`, `recommendedActions`, and `executiveSummary` in the
same document were correctly in French. A prompt instruction is not a
guard: it shapes the model's behaviour but nothing checks whether it
worked.

**Fix: a heuristic language-compliance guard on the writing pass's
output** (`findLanguageComplianceViolations` in `language-guard.ts`),
run inside `analyzeWriting`'s retry loop alongside the theme-key guard
(section 9), same retry-then-fail-loud treatment as an invented finding
ID. It checks every prose field (`title`, `businessImpact`,
`legalRelevance`, each `recommendedActions` entry, `executiveSummary`,
`notes`) that is at least 20 characters long - shorter fields carry no
reliable signal. For a French request, a field is flagged if it contains
neither a common French accented character (`é è ê à ç ù ô î â œ`) nor a
whole-word, case-insensitive match of a common French function word
(`le la les de des un une et pour dans avec votre vous sur`). For an
English request, the reverse check (a French signal present in English
output) is included for symmetry but is explicitly lower confidence:
fluent English prose can legitimately contain a French loanword or
proper noun without being wrong-language, and the only failure actually
observed in production so far is English leaking into French, not the
reverse.

**This is a heuristic, not real language detection**, and the code says
so. Known false positives: a short field just over the length floor with
no signal in either language (a proper noun, a URL). Known false
negatives: fluent wrong-language prose that happens to contain an
accented character or a checked stopword (a French place name inside
otherwise-English prose; an English sentence using a French loanword).
Real language detection was considered and rejected as a dependency
decision of its own - this guard exists to catch one specific,
already-observed, already-recurring failure mode, and repeated failures
still fail the analysis loudly rather than shipping mixed-language
output.

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
English on the first live run
(`2026-08-02T18-28-34Z-fr.json` / `2026-08-02T18-30-16Z-en.json`). A
later run on the same site produced eleven themes in French and ten in
English from the same seventeen filtered findings
(`2026-08-02T22-51-04Z-fr.json` / `2026-08-02T22-52-23Z-en.json`).
Both were the same underlying cause: grouping and ranking, not just
prose, were decided independently per language, once per `analyze
--language` call, and an LLM grouping the same findings twice does not
reliably produce the same groups.

**Resolved by the section 9 two-pass split for the part that matters
most**: `findingIds` grouping, `priorityRank`, `effort`, `impact`,
`category`, `quickWins`, and `overallRisk` are now byte-identical across
`fr` and `en` runs of the same audit by construction, because both
languages reuse one shared structure pass rather than each deciding
their own. Only the prose - `title`, `businessImpact`,
`legalRelevance`, `recommendedActions`, `executiveSummary`, `notes` - is
still decided independently per language, which is expected and correct
(they are different languages).

**Residual variance is narrower but not eliminated.** A structure pass
is still one non-deterministic LLM call: regenerating it (a fresh audit,
or `--regenerate-structure` on an existing one) can still produce a
different grouping than a previous run over the same findings.

Milestone 10 compares runs to produce delta reports. Analysis variance
will appear there alongside real site changes, and the two must be
distinguishable. The finding layer is deterministic and diffable by
`dedupeKey`; the analysis layer is not. Monitoring deltas should be
computed from findings, with the analysis regenerated rather than
compared.

---

## 8. The hand-mirrored output schemas

Two files, `packages/llm/src/structure-output-schema.ts` and
`packages/llm/src/writing-output-schema.ts`, each hand-mirror one of the
two-pass, non-locked Zod schemas (`structurePassOutputSchema` /
`writingPassOutputSchema`, both in section 9) as a JSON Schema, because
the SDK's `zodOutputFormat` helper requires a zod v4 schema and this
workspace is on zod v3. Editing a schema to satisfy a helper was the
wrong trade, so the mirrors exist instead. (Before the two-pass split, a
single `output-schema.ts` mirrored the locked `llmOutputSchema` the same
way; it was deleted when no call any longer asks the model for a full
`LlmOutput`-shaped response in one shot.)

Each is an API shape hint only. Neither is the validation authority:
`structurePassOutputSchema.parse()` / `writingPassOutputSchema.parse()`
run explicitly on every response regardless, and the merged result goes
through the real, locked `llmOutputSchema.parse()` in `merge.ts` as a
final check, per CLAUDE.md's non-negotiable Zod-validation rule.

Unlike the locked `llmOutputSchema`/`themeSchema`, both new Zod schemas
are declared `.strict()`, so an unexpected field the model produces
(for example, a stray `findingIds` on a writing-pass theme) is a hard
Zod rejection - feeding the retry loop - rather than a silent strip.
This is a deliberate strengthening the two-pass split enabled: schemas
scoped to exactly what one pass is allowed to decide can afford to
reject anything else outright.

A hand-maintained mirror decays silently. A test asserts each mirror and
its Zod schema describe the same shape, so adding a field to either
schema fails loudly rather than quietly leaving the shape hint stale. If
this workspace ever moves to zod v4, delete the mirrors and use the SDK
helper directly.

---

## 9. The two-pass split and theme correlation

Milestone 6.1. Sections 6 and 7 above both document the same root cause
from two angles: a single `analyze --language X` call asked one model
response to decide grouping, ranking, *and* write prose, in the
requested language, all at once. That produced two independent, real
failures on the same site - different theme counts and quick-win counts
per language (section 7), and English prose surviving inside a French
analysis despite an explicit instruction not to (section 6). Splitting
grouping/ranking from writing removes the first failure by construction
and gives the second failure something to check against, which an
instruction alone cannot do.

**Structure pass** (`analyzeStructure`, `structure-schema.ts`,
`structure-prompt.ts`): language-independent, run once per audit. Input:
filtered findings plus site context (`StructureInput`, no `language`
field). Output: for each theme, `findingIds`, `category`, `effort`,
`impact`, `priorityRank`; separately, `quickWins` (`findingId[]`) and
`overallRisk`. No prose field exists in this schema at all - not
optional and ignored, genuinely absent, so there is nothing for the
model to hallucinate into.

**Writing pass** (`analyzeWriting`, `writing-schema.ts`,
`writing-prompt.ts`): run once per language, constrained by the
structure pass's fixed grouping. Input: language, site context, and for
each structure-pass theme, its finding records (title, description,
wcagCriteria, severity, etc. - what the model needs to write from, built
by `buildWritingInput`). Output: for each theme, `title`,
`businessImpact`, `legalRelevance` (accessibility themes only),
`recommendedActions`; plus `executiveSummary` and `notes` for the whole
analysis. `findingIds`, `effort`, `impact`, `priorityRank`, `category`,
`quickWins`, and `overallRisk` do not exist in this schema either - the
writing pass cannot change a decision it was never given a field to
express.

**Theme correlation.** The locked `themeSchema` has no id field, and an
LLM is not guaranteed to return themes from a second call in the same
order it was shown them. `assignThemeKeys` assigns a deterministic,
code-generated `themeKey` (`t1`, `t2`, ...) to each structure-pass theme
immediately after the structure pass's own guards pass - never chosen by
the model. It is persisted in the on-disk structure document (section
5), shown to the writing pass per theme, and required as a field the
writing pass must echo back verbatim. `findThemeKeyMismatches` rejects a
writing-pass response whose returned `themeKey`s don't exactly match
what it was shown (missing, extra, or duplicated), the same
retry-then-fail-loud treatment as an invented finding ID.

**Merge** (`mergeAnalysisPasses`, `merge.ts`): zips the structure pass's
themes with the writing pass's themes by `themeKey`, builds one
locked-shape `Theme` per pair (grouping/ranking fields from structure,
prose fields from writing, `legalRelevance` defensively stripped unless
the theme's `category` is `accessibility`), assembles the final
`LlmOutput`, and validates it against the real, locked
`llmOutputSchema.parse()`. `themeKey` is never assigned into the merged
`Theme` object - it cannot leak into `analyses/<timestamp>-<language>.json`
or the `analyses` Mongo collection, both of which remain exactly the
locked `LlmOutput` shape.

**Guard placement.** `findInventedFindingIds`/`findUnreferencedFindingIds`
in the locked `packages/core/src/types/llm-output.ts` are typed for the
locked `LlmOutput`/`Theme` shape and that file cannot be modified.
`structure-guards.ts` hand-duplicates the same ~10 lines of set-
difference logic against the structure pass's own (non-locked) shape,
the same precedent this package already used for `output-schema.ts` and
`config.ts`: duplicate a small amount of logic near a file you are not
allowed to touch, comment why, keep the two in sync by hand.

`packages/core/src/types/llm-output.ts` is unchanged by any of this. The
merged output is indistinguishable in shape from the pre-6.1 single-pass
output - this section is the one to check first if a future reader is
confused about why an `analyses/*.json` file's `themes[]` never has a
`themeKey`.
