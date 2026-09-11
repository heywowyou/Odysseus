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

**A second filter, added 2026-08-07, removes findings the model cannot be
trusted to give good advice about at all: wrapper pages and noindex'd
legal pages.** `packages/llm/src/diversion.ts`'s `partitionFindings` runs
after the severity floor, on the severity-filtered set, and removes any
finding whose `pageUrls` are confined entirely to pages the render diff
shows as near-total third-party embeds (`missingPercent >= 95`) or whose
URL matches a legal-page pattern (`cgu`, `mentions-legales`, `cookies`,
`privacy`, and similar). This is not a severity concern, so it is a
separate pass rather than a lower threshold: a `noindex` finding on a
cookie-policy page can be `serious` and still be the wrong thing to show
the model, because the correct response is "confirm this is intentional,"
not a recommendation the model has no way to phrase safely. The rejected
alternative was a prompt instruction telling the model not to recommend
indexing legal pages or optimizing third-party embeds; it was rejected
before being tried, on the same reasoning section 6 already proves for
language compliance, that a prompt instruction shapes behaviour but
nothing checks whether it held. Diverted findings still appear in the
report, in a deterministic "Observations" section built by
`packages/report` calling the same `partitionFindings` function against
the same `findings.json` and `manifest.json` the analysis used, so the
report can never describe a different diversion decision than the one the
model actually experienced. Full defect record in
`docs/archive/report-v2-refactor.md` part 4.1 (A1-A3).

**Post-structure-pass ranking rules, also added 2026-08-07, correct for
two things a model cannot be trusted to weigh consistently: coverage and
volume.** `packages/llm/src/structure-ranking.ts` runs immediately after
`assignThemeKeys` inside `analyzeStructure`, never inside the prompt.
`enforceSiteWideAccessibilityFloor` guarantees a WCAG-tagged finding
present on 80% or more of crawled pages cannot rank in the bottom quartile
of themes or carry `impact: 'low'` — this is what let a one-line,
site-wide blocked-zoom fix rank below a single missing meta description
in a real report. `applyOccurrenceWeighting` promotes a theme that is
high-volume (top half by summed `occurrences`) but model-ranked in the
bottom half, so a 180- or 203-occurrence finding cannot sit at the same
visual weight as a single-occurrence one. Both are deterministic
post-processing over the model's own output, not re-prompting: the model
still decides which findings belong together and why, these two rules
only correct its ranking of what it already grouped. Full reasoning,
including why occurrence weighting has no exact formula and is expected
to need tuning against more real reports, in `docs/archive/report-v2-refactor.md`
part 4.2 (A5, A6).

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

**Amended 2026-09-01 (issue #21): the writing pass's retries carry the
rejection reason.** Each retry appends the previous attempt's failure
reason to its user message (`buildWritingRetryFeedback`), so a retry is a
correction rather than a rerun of the identical conversation. The defect
this fixes was measured, not hypothetical: at temperature 0.2, a 2026-09-01
Mistral French writing pass produced an `executiveSummary` containing "graves" on
eight consecutive attempts across three runs and two regenerated structure
files, all rejected by the severity-vocabulary guard the model never saw.
The mechanism is the outreach loop's, already measured there (section 11,
issue #12); it strengthens every guard in the loop, not only the severity
one. The guard itself is unchanged - rejection before render is the
behavior that held the line - and the structure pass still re-sends an
identical conversation: its only guards are invented-ID and schema shape
over dense, short output, and it has no observed failure, so it keeps its
blind retry until one appears.

**Amended 2026-09-01 (plan 019 operator review): rate-limit errors are
paced, not burned through.** An API-error retry in either pass now waits
before re-calling when the failure is a provider rate limit (HTTP 429):
20 seconds after the first failure, 40 after the
second, scaling with the attempt number. The retry budget (`MAX_RETRIES`)
and every guard are unchanged, and guard rejections still retry
immediately. Measured live: regenerating writing for a real audit, the
French pass succeeded and the English pass then exhausted all three
immediate attempts inside one rate-limit window; with pacing the same
flow completes. (`rate-limit-pacing.ts`, shared by both passes.)

**Amended 2026-09-03 (issue #30): the pacing is provider-informed, and the
two language passes no longer share one quota window.** After the
plan-025 provider switch, a real scan's English writing pass still
exhausted all three attempts inside the old 20s+40s budget. Three
changes, retry budget and guards still unchanged:

- The backoff floor is now 60s times the attempt number (60s, then 120s).
  The 20s figure was measured against the pre-plan-025 provider; the
  current one demonstrably outlasted the whole 60s budget. Pacing delays
  are only ever paid by a run that is already being throttled.
- A `Retry-After` response header on the 429 is waited out in full, as a
  floor over the base delay, never a shortcut under it. The header is read
  off the error object (`client.ts` duck-types `status`/`headers`, because
  the SDK's own message wording is not stable across major versions) and
  travels to the pacing helper as a
  `(provider retry-after: Ns)` marker appended to the failure message.
  Whether the current provider sends the header at all is unconfirmed; if
  it does not, the floor is the only protection, and a window longer than
  roughly three minutes still fails loudly by design.
- The queued full audit (`run-full-audit-job.ts`) and the dashboard's
  writing regeneration (`regenerate-writing.ts`) pause 20s between the
  French and English analysis stages, because the French pass (structure +
  writing + review) is what drains the window the English pass then
  enters. A standalone `analyze --language X` run pauses nothing.

---

## 3. Determinism and provenance

Claude Opus 5 and other current-generation Claude models rejected the
`temperature` parameter outright (HTTP 400); the OpenAI Chat Completions API
accepts values from 0 to 2. Determinism comes from
two things instead, neither of which touches Zod validation or the
invented-finding guard: those run regardless, on every response,
independent of how the response was produced.

**Structured output**, via the OpenAI SDK's `chat.completions.create`
`response_format: { type: 'json_schema', json_schema: { name, schema,
strict: true } }`, constrains the response shape server-side. Each pass
passes its own explicit JSON Schema (`STRUCTURE_OUTPUT_JSON_SCHEMA` /
`WRITING_OUTPUT_JSON_SCHEMA`, see section 8). This is a schema guarantee about
_shape_, not a validation step in itself - the code still runs an
explicit, auditable `structurePassOutputSchema.parse()` /
`writingPassOutputSchema.parse()` on every response, because CLAUDE.md's
Zod-validation rule is a business rule, not an SDK implementation detail
to trust implicitly.

**A low `temperature`** (0.2) keeps the model from over-exploring
alternative groupings on a task that calls for a stable, repeatable
answer over the same findings. This is a client deliverable, not a
brainstorm, and two runs over the same findings should not produce
materially different priorities. The structure and reviewer passes use
`OPENAI_TEMPERATURE` (0.2) for exactly that reason. The writing pass has
no such repeatability requirement - it produces prose, not a priority
ranking - and (plan 027) uses its own `WRITING_OPENAI_TEMPERATURE` (1.0,
raised from an initial 0.7 on 2026-09-07) instead, because 0.2 was
measured to reproduce the prompt's own worked examples in the model's
output almost verbatim. All three passes still
share `OPENAI_MODEL`. Every call sets `reasoning_effort: 'none'`:
report grouping and writing do not need hidden reasoning tokens sharing the
same completion budget, the failure mode that already forced
`MAX_OUTPUT_TOKENS` to 16000 once under an earlier provider (see constants.ts).

**Record the model identifier and temperature alongside the output**,
for the same reason the audit manifest records axe and Lighthouse
versions: a model or temperature change between two monitoring
runs would otherwise read as the client's site having changed. Not
retrofittable onto stored analyses. The persisted per-language document's
`model`/`temperature` reflect the writing pass's own call specifically
(so, since plan 027, `temperature` reads 1.0, not the structure pass's
0.2) - the locked `AnalysisDocumentFields` shape has one `model`/
`temperature` slot, not one per pass. If the constants were ever changed
between a structure pass being generated and a later `--language` run
reusing it via cache-hit (section 5), that reused run's actual
structure-pass model/temperature would not be separately recorded;
adding a second pair was judged out of scope for this fix.

OpenAI exposes an explicit `message.refusal` signal. A refusal is thrown and
caught by the same retry loop as any other malformed response (see section 2);
it never becomes a partial analysis.

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

**Fix: a language-compliance guard on the writing pass's output**
(`findLanguageComplianceViolations` in `language-guard.ts`), run inside
`analyzeWriting`'s retry loop alongside the theme-key guard (section 9),
same retry-then-fail-loud treatment as an invented finding ID. It checks
every prose field (`title`, `businessImpact`, `legalRelevance`, each
`recommendedActions` entry, `executiveSummary`, `notes`) that is at least
20 characters long - shorter fields carry too little text for any
detector to call reliably. Each checked field is run through `franc-min`'s
`franc()` detector, restricted to `only: ['fra', 'eng']` rather than its
default 82-language candidate set: narrowing the candidates to just the
two languages this tool ever writes in improves accuracy specifically on
short strings like theme titles, which franc's own documentation flags as
a known weak spot under roughly 50 characters. A field is flagged if
`franc()` returns the other language of the pair; a return of `'und'`
(no confident call) is treated as no signal, not a violation.

**This guard was originally a regex heuristic (accented characters plus a
short French stopword list), and was replaced after it produced a real
false positive on real output, not a hypothetical one.** A live fr
analysis of almamia.fr flagged six already-correct French theme titles -
"Images sans texte alternatif", "Liens sans texte descriptif", and three
variants of "Affichage lent/tardif du premier/principal contenu" - because
none of them contained an accented character or hit any of the thirteen
words in the old stopword list ("du" in particular was never on it,
despite being one of the most common words in French). All three attempts
of that writing-pass run exhausted their retries and failed loudly on
titles that needed no correction at all. Real detection removes that
specific failure mode; franc-min was chosen over hand-maintaining a larger
stopword list because language identification is exactly the kind of
problem a small model-free library solves better than an ad hoc regex.

**Known limitation, reduced but not eliminated by the fra/eng
restriction:** franc's accuracy still degrades on very short strings, so a
short but technical, proper-noun-heavy, or code-like field near the
20-character floor remains a possible misdetection. Repeated violations
still fail the analysis loudly rather than shipping mixed-language
output.

**Cite WCAG 2.2.** The scanner runs axe against the WCAG 2.2 AA tag set,
so the report cites 2.2. The first live run mixed 2.1 and 2.2 citations.
Criterion numbers are identical across versions so nothing was factually
wrong, but a client's developer will notice a report claiming to audit
2.2 while citing 2.1. Guarded since 2026-08-29:
`findWcagCitationViolations` (`wcag-citation-guard.ts`) runs inside
`analyzeWriting`'s retry loop and rejects any version citation other than
`REQUIRED_WCAG_VERSION` (2.2), which the writing prompt states from the
same constant. The patterns exclude three-part criterion numbers (2.1.1,
1.2.1) and contrast ratios (2.1:1); measured against every stored
analysis, they match exactly the 10 historical fault strings and no
legitimate prose. The guard covers only model-written prose fields:
`legalRelevance` has been built in code since the v2 refactor and cites
2.2 by construction.

**Do not assert business facts that were not supplied.** The first live
run described the quote page as "la page la plus rentable du site". A
reasonable inference, stated as knowledge, and nobody had said it. This
extends section 4: without an intake file the model must not invent a
business type, a primary goal, revenue attribution, traffic assumptions,
or relative page value. It may say a page _appears_ commercially
important and why, which is inference the client can weigh, not a claim
they have to correct. Guarded since 2026-08-29:
`findBusinessClaimViolations` (`business-claim-guard.ts`) runs inside
`analyzeWriting`'s retry loop and rejects unhedged profitability and
revenue superlatives ("plus rentable", "most profitable", "génère le
plus"). Scope is calibrated against stored output: traffic superlatives
("Prioriser les pages les plus visitées", "high-traffic pages") are
legitimate generic advice phrasing and must keep passing, and a hedge
anywhere in the same sentence ("semble", "appears") makes the claim
permitted inference. The writing prompt names the fault phrase from the
guard's `BUSINESS_CLAIM_EXAMPLES` constant.

**Severity vocabulary must match the report's canonical labels, added
2026-08-10 after a real manual review of a haaitza.com full audit.** The
stats box and findings annex both use critique/majeur/modéré/mineur
throughout (report-level, code-owned strings, never written by the
model), but the writing pass's free-text `executiveSummary` said "26
sérieux" for a count every other rendering of the same figure labeled
"majeurs" - a plausible French synonym for "serious", not the report's
term for it. Same fix shape as the language-compliance guard above: a
prompt instruction alone (`writing-prompt.ts` now states the exact four
words per language and forbids a synonym) is not trusted on its own.
`findSeverityVocabularyViolations` (`severity-vocabulary-guard.ts`) scans
every prose field for a small set of known synonyms
(sérieux/grave/sévère/anodin and their inflections in French; major/severe/
trivial/negligible in English) and is run inside `analyzeWriting`'s retry
loop alongside the language guard and the theme-key guard (section 9),
same retry-then-fail-loud treatment as an invented finding ID or a
language leak. **Amended 2026-09-01 (issue #21):** the prompt originally
presented only the four canonical words, so avoiding the banned ones was
luck, and at the configured low temperature a French run reached for
"graves" on every attempt (see the section 2 amendment). The
`severityVocabularyNote` now names the banned words explicitly, read from
the guard's own `BANNED_SEVERITY_SYNONYMS` table; a two-direction test
holds that table against the guard's enforcement patterns so neither can
drift from the other, and the guard's rejecting behaviour is unchanged.

**Added 2026-09-07, plan 027.** Lever A replaced the single mandated
provider phrase with a per-language set the response picks from, so that
eighteen separate reports stop opening every action with the same string.
That change needs its own guard for the same reason the severity one does:
the prompt says in both languages never to mix two of them, and every
regenerated French analysis mixed two anyway, at 0.7 and at 1.0 alike
(Villas Foch: twenty-seven "votre prestataire technique" alongside nine
"votre prestataire web"). `findProviderPhraseViolations`
(`provider-phrase-guard.ts`, which owns the phrase table the prompt imports)
runs last among the rejecting guards, because naming the provider two ways
is a presentation defect rather than a claim the report should not make, so
a response failing this and a substantive guard records the substantive
reason. It rejects only mixing; a response that never names the provider is
left to the prompt.

Its rejection reason carries a guard-specific correction
(`PROVIDER_PHRASE_RETRY_HINT`) rather than the generic retry text alone.
Measured, not anticipated: with the generic text the retried Villas Foch
response satisfied "be consistent" the cheapest possible way, opening all
twenty-nine of its recommendedActions with "Demandez à votre prestataire
technique de" - the templated prose plan 027 exists to remove, at a worse
rate than the 100-percent baseline it replaced. With the hint naming which
words must match and which must not, the same audit came back at
fifteen-of-thirty-five shared openings with the phrasing still consistent.

**Amended 2026-09-07: the phrase is now assigned in code, not chosen by the
model.** The arrangement above was measured again after plan 028 landed and
had to be replaced. Offering three approved phrasings and then forbidding
their mixture put two instructions in tension, and the model resolved that
tension the wrong way on five of five live runs: the guard fired on the
first attempt every time, and three of the five exhausted the retry budget
and produced no analysis at all. Under trade-off 44 that means no
deliverable, since the paid deliverable is the French and English pair, and
neither stored audit could produce one.

`selectProviderPhrase(language, seed)` now picks the phrase before the call
and `buildWritingSystemPrompt` shows only that one. The mixture is
unrepresentable rather than policed, in the same spirit as trade-off 70's
per-call theme-key schema. The seed is the `auditId`, threaded through
`buildWritingInput` and `WritingInput.providerPhrase`, so that:

- regenerating a report never renames the client's provider, and
- the French and English halves of one audit land on the same index, which
  matters because they ship together.

The guard survives as the assertion that should now never fire, and its
anchor changed with it. It used to treat whichever approved phrase appeared
in the earliest-scanned field as the commitment, which made the verdict a
scan-order artifact: `notes` is scanned second, so one stray mention there
condemned sixteen internally consistent recommendedActions (Briketenia EN,
2026-09-07). It now compares against the assigned phrase and nothing else,
and `providerPhraseRetryHint` names that phrase in the correction.

Measured after the change, same two audits, same stored structure passes:
four of four runs succeeded with zero retries, against three failures in
five before it.

**One prose regression it caused, and the fix.** Removing the choice let the
model satisfy the constraint the lazy way instead: the first English run
opened twenty-one of thirty-six actions with "Your website provider". The
prompt permitted this, saying only that using the phrase "does not mean
starting with it". Because the phrase is now fixed, a variety instruction can
no longer be satisfied by swapping it, so the instruction became a
prohibition in both languages: never begin a recommendedActions entry with
the provider wording, name it later inside the sentence. Re-measured, the
same run fell to two of thirty-six, and shared five-word openings across all
four runs sit between zero and seven percent, against one hundred percent at
the pre-plan-027 baseline.

**A prompt example is an anchor, not an illustration.** Measured 2026-09-07 on
the executive summary's closing sentence: three example closings with an
explicit instruction not to reuse them produced four consecutive French runs
opening on the second example's words, one reproducing twenty-three in a row,
and adding "do not open on the same first words" did not change it. Removing
the examples and stating that no template is provided cleared it immediately.
The same effect appeared in miniature when a single recommendedActions
illustration was reworded: every action in the next run copied its opening
verb. Prefer describing the structure wanted over showing a sentence that
fills it, and treat any concrete sentence left in a prompt as something the
output will contain.

**Added 2026-09-07, plan 028, three further guards from audit-rehearsal
notes plan 027 did not cover.** All three follow the same
"no legitimate reason for this pattern to appear here" reasoning as the
guards above, run inside `analyzeWriting`'s retry loop, and are
rejected wholesale rather than repaired, same posture as
`findPageCountViolations`.

- **Finding counts, generalized from page counts.**
  `findPageCountViolations` only matches a digit next to "page(s)", so a
  digit next to the finding noun or a severity word passed it silently -
  audit-rehearsal notes recorded reports contradicting their own finding
  counts in prose ("80 findings" beside "63+19+0" elsewhere in the same
  report). `findFindingCountViolations` (`finding-count-guard.ts`) closes
  that gap with the identical reasoning: the writing pass is shown a
  severity-floor-filtered, page-truncated slice of findings, never the
  true total, and the report template already owns and renders every
  count from `WritingSiteStats`.
- **Positional references to other report content.**
  Audit-rehearsal notes recorded "la priorité 1 ci-dessus" pointing at
  content that rendered below it, recurring across three different hotel
  reports. `findPositionalReferenceViolations`
  (`positional-reference-guard.ts`) rejects a French "ci-dessus"/
  "ci-dessous" or an English positional-referencing phrase ("as noted
  above", "the theme below") anywhere in prose, on the same reasoning as
  the page-count guard: the writing pass has no visibility into where its
  text will land once the report is paginated, so any claim about
  position is a guess. Scoped narrowly to document-referencing
  constructions, not a bare ban on "above"/"below", which have
  legitimate technical readings this guard must not catch (a contrast
  ratio "below the required minimum").
- **A shared meaning for rule IDs the two language passes have described
  differently.** Audit-rehearsal notes (#67/#68) recorded the
  `alt-text-quality-heuristic` finding explained with two different
  meanings across the French and English passes of the same audit - a
  substantive disagreement, not just a wording one, since the structure
  pass is shared between languages but each writing-pass call
  independently free-describes what a rule means. `buildRuleMeaningNote`
  (`rule-meaning-notes.ts`) is not a rejecting guard: it appends a fixed,
  bilingual anchor description to the user prompt, for whichever rule IDs
  from its small table actually appear among the findings a given call is
  shown. Starts with one entry; add another only when a new drift case is
  actually observed against real output, same discipline
  `LIGHTHOUSE_EXCLUDED_AUDITS` uses.

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

Milestone 13 compares runs to produce delta reports. Analysis variance
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
`writingPassOutputSchema`, both in section 9) as an explicit, auditable JSON
Schema shape hint. The workspace remains on zod v3, and editing an
authoritative schema to satisfy an SDK helper is the wrong trade, so the
mirrors remain. (Before the two-pass split, a
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
schema fails loudly rather than quietly leaving the shape hint stale. A future
zod upgrade does not by itself justify deleting these explicit mirrors; the
sync tests are the drift guard.

**Amended 2026-09-03, issue #36.** `writing-output-schema.ts` is no longer a
literal mirror. It exports `buildWritingOutputJsonSchema(themeKeys)`, which
builds the shape per call so the expected theme keys become the response's
own required properties; the reasoning and the incident are in section 9.
Everything above still holds: it is not the validation authority,
`writingPassOutputSchema.parse()` still runs on every response, and the
shape-sync test still compares the two, now field by field with `themeKey`
excluded because the property name carries it.

---

## 9. The two-pass split and theme correlation

Milestone 6.1. Sections 6 and 7 above both document the same root cause
from two angles: a single `analyze --language X` call asked one model
response to decide grouping, ranking, _and_ write prose, in the
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
5) and shown to the writing pass per theme. `findThemeKeyMismatches`
rejects a writing-pass response whose returned `themeKey`s don't exactly
match what it was shown (missing, extra, or duplicated), the same
retry-then-fail-loud treatment as an invented finding ID.

**Amended 2026-09-03, issue #36.** That guard is no longer the primary
mechanism. The writing pass used to ask the provider for an array of theme
objects, each echoing its own `themeKey` back verbatim, so a wrong key set
could only be caught after the response arrived. A real audit of
`www.villasfoch.fr` returned the key `t8` twice on all three attempts,
including the two carrying the rejection back as a correction (the section 2
mechanism), and the completed crawl, content checks, Lighthouse run and
French pass were all thrown away with it.

`buildWritingOutputJsonSchema` now builds the provider schema per call from
the theme keys that call is showing: `themes` is an object whose properties
are exactly those keys, all `required`, `additionalProperties: false`. A
duplicate key cannot be expressed by a JSON object, a missing one violates
`required`, and an invented one violates `additionalProperties`. The array
alternative (an enum-constrained `themeKey` field) was rejected on what
OpenAI strict structured output actually supports: `uniqueItems`, `minItems`
and `maxItems` are unsupported keywords there, so it would still have
admitted the duplicate that caused the incident.

The array shape everything downstream reads is unchanged: `client.ts`
converts the keyed object back before `writingPassOutputSchema.parse()`,
which remains the validation authority. Theme order is now the input's
order rather than the model's.

No deterministic repair of a duplicate key was added, deliberately: under
this schema a duplicate cannot arrive, so a repair path would be dead code
that also weakens the reject-rather-than-patch posture this section rests
on.

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

---

## 10. Cost gating: when the LLM is not called at all

Decided 2026-08-03. Everything above assumes the model is called. This
section covers the two places it deliberately is not, so a call is not
spent when a scan has not produced enough to justify one.

Both gates reuse `SEVERITY_ORDER` (critical 4, serious 3, moderate 2,
minor 1) as the weight, rather than inventing a second scale to justify
separately. The score sums this weight across distinct findings, not
occurrences, since occurrences are already collapsed per finding by the
normalization layer (section 1 above, and `docs/rules/normalization-rules.md`
section 2), so counting findings avoids double-counting template-driven
issues.

**Audit fallback gate.** A paying client still receives a report
regardless of findings volume, so this gate only decides whether to call
the LLM or fall back to a static "no significant issues found" template
pulled from the existing `ReportStrings` chrome. Skip the LLM only when
both hold:

- No finding at `critical` or `serious` severity
- Fewer than 5 `moderate` findings total

Deliberately conservative. Expected to trigger rarely, a paying full-audit
client is unlikely to have an unusually clean site, this exists mainly as
a safety net.

**Prospecting worthiness gate.** Decides whether a scanned prospect is
worth an LLM call at all, both for the single-sentence hook and for the
personalized outreach email (see brief section 6.2 stage 6 and section
9). Intentionally stricter than the audit fallback gate, since a
prospect with only moderate or minor findings is not compelling cold
outreach evidence. Call the LLM only when at least one holds:

- At least one `critical` severity finding
- At least two `serious` severity findings
- Any page with render diff `missingPercent` at 50 or above (the
  existing `serious` floor in `severityFromRenderDiff`)

Everything below this bar is still scored and stored, it simply never
reaches the LLM.

**Where this lives.** One `computeBrokennessScore(findings)` function
plus two predicates, `isAuditFallbackEligible` and `isProspectingWorthy`,
belong in `packages/core`, since both the report path and the
prospecting path need the same numbers and neither should duplicate the
scoring logic.

**Outreach email generation, retired 2026-09-11 (trade-off 83).** No model
call writes outreach any more; the paragraph below is kept as history. The
worthiness gate still decides who is worth scanning and contacting.

**Outreach email generation is a new call, same governing rule.** When a
prospect clears the worthiness gate, the LLM writes the cold email
itself, not just a one-sentence hook, but it does not choose which
finding to lead with. That choice is already made by the deterministic
brokenness scoring and evidence selection in prospecting mode. The
anti-hallucination guard from section 6 below applies verbatim in this
context: state the WCAG criterion, never assert the EAA applies to this
specific business, and this has to be written into the outreach prompt
directly, it is not inherited automatically just because the audit
prompt has it. Output is a draft, never sent automatically. Language
follows the prospect's own site language, not a French default.

**Thresholds are starting positions**, same status as the render diff
percentage thresholds already in the codebase, revisit once milestone 9b
produces real distribution data across many scanned sites, not before.

---

## 11. Outreach generation, additional constraints

**Retired 2026-09-11 (trade-off 83).** No model writes outreach; every email
is fixed operator-approved wording in
`packages/interface/src/outreach/outreach-email-template.ts`. The content
rules below (no legal content, no statistics, no conclusions, no conformity
claims) still bind those templates; the prompt and retry mechanics described
here were removed with `packages/llm/src/outreach`.

Section 10 governs whether the model is called for a prospect. This
section governs what it may write once called. `docs/rules/outreach-rules.md`
is the full doctrine; the constraints binding the prompt are here.

**The model writes no part of the legal content.** The criteria, the
registry data and the case-law position are produced by
`assessObligations()` and spliced in as fixed text. The model writes
around the block. It may not rewrite, paraphrase, shorten or restate it
in the subject line. Stated in the outreach prompt directly, not
inherited from the audit prompt.

**Assembly order.** Deterministic evidence selection, deterministic
facts block, generated connective prose, then a validator confirming the
block is byte-identical to what was spliced and that sender identity,
data origin and opt-out are present. A draft failing either check is
discarded rather than repaired, on the same reasoning as the
language-compliance guard: a model that altered the block once will do
it again, and a repaired draft hides that.

**No statistics.** No population, prevalence or percentage claim in
outreach, including ones the model believes correct. Every number traces
to that prospect's own scan or to the facts block. Stricter than the
audit path, deliberately: a report has a methodology section and a
client who has paid, an email has neither.

**No conclusions and no penalty language.** No statement that the
recipient is subject to the EAA, no fine amount, no inspection or
litigation prediction. The EUR 50,000 figure is prohibited outright, as
it belongs to the article 47 regime.

**No conformity claims about our own output.** The model may not
describe the offer as an audit RGAA, as producing a taux de conformité,
or as a basis for a déclaration d'accessibilité.

**Age framing permitted, prevalence is not.** The model may reference an
ageing customer base where the sector supports it, with no number
attached.

**Hotels are not a special case.** The facts block treats a hotel
booking flow the same as any other e-commerce checkout; do not soften
argument B for hospitality prospects.

**Retries carry the rejection reason.** Added 2026-08-30 (issue #12).
Unlike the structure pass, whose retry attempts re-send the identical
conversation, the outreach loop feeds each rejection reason back into the
next attempt's user message via `buildOutreachRetryFeedback`, and a
word-count shortfall is stated as arithmetic (what was counted, what the
floor is, the delta to write). The writing pass adopted the same
mechanism on 2026-09-01 (issue #21, section 2), with `buildWritingRetryFeedback`
and no arithmetic variant, since none of its guards enforces a count the
model could undershoot. Measured on live Mistral in 2026-08: three identical
prompts at the configured low temperature produced three near identical
undershoots of the touch-1 floor, while the arithmetic feedback recovered
a 59-word rejection to 70 words on the next attempt. Touch 1's system
prompt also states hard per-field word bounds derived from
`OUTREACH_TOUCH_LIMITS` and a worked length example per language
(`TOUCH1_LENGTH_EXAMPLES`); the prompt tests hold those examples inside
the enforced 60 to 90 word range and clean against every guard, including
the observation-scope guard for every selectable key, so the example can
never teach a shape the retry loop then rejects.

**The benchmark study may be model-generated.** Milestone 10 prose is
not required to be hand-written. Generate it normally and add the
one-line disclosure specified in `docs/rules/operator-obligations.md` section 3
to the published page.

**Language follows the prospect's site**, unchanged.

---

## 12. The shadow reviewer pass

Added 2026-08-29. One extra model call per analysis, always on (operator
decision), that reviews the writing pass's prose against exactly the input
the writer was shown. It exists for the one fault class the deterministic
guards cannot see: a fluent, unsupported assertion about this specific
business that no pattern list anticipates.

**Shape.** `analyzeReview` (`analyze-review.ts`) takes the same
`WritingInput` the writer received plus the writer's `WritingPassOutput`,
and returns one evidence-bound verdict per guarded prose field:
`supported` / `unsupported` / `unsure`, each with a required reason
naming or quoting what was checked (`reviewer-schema.ts`). It covers the
same surface the deterministic guards scan (executiveSummary, notes,
businessImpact, recommendedActions), excluding theme titles for the same
reason. The theme-key correlation contract mirrors section 9: one review
object per shown themeKey, echoed verbatim; a mismatched set is a skip,
not a rejection.

**It never blocks anything.** One attempt, no retry loop: API errors,
malformed bodies, and correlation mismatches all become
`{ status: 'skipped', reason }` and the analysis proceeds unchanged. The
reviewer produces data for a later promotion decision; it is not a gate,
and forcing verdicts with retries would contradict the reason it is
shadow-mode. Verdicts persist insert-only to
`analyses/<timestamp>-review.json`, next to the analysis they review, and
the console gets a single summary line (per-field reasons live in the
file).

**Promotion criteria, decided up front.** The reviewer enters the
writing pass's retry loop only if the campaign data shows it catching
real unsupported facts without false positives. It never re-judges what
deterministic guards already answer exactly (language, severity
vocabulary, page counts, digits, legal vocabulary): a second, flakier
opinion on a question code answers perfectly is noise, not defense.

**Validation campaign, 2026-08-29: the reviewer is NOT promoted.**
Measured on real re-analyses (sas-fernande.fr fr and en, three runs on
`mistral-medium-latest`; lacoorniche.com fr): the medium model flags
essentially every `businessImpact` field `unsupported` for stating
exactly the generic commercial consequences ("may cost customers and
bookings", "losing leads and sales") the writing prompt itself requires
- a systematic false-positive pattern on that field type. Two
interventions failed to move it: an explicit carve-out rule (generic
consequences are never unsupported), then explicit few-shot contrast
examples ("may cost you customers": supported, every time; "your most
profitable page": unsupported). The model contradicted the examples
verbatim in its reasons. Conclusion: this is a model-capability limit,
not a prompt bug. The prompt keeps the correct specification (see
`reviewer-prompt.test.ts`, which pins both sides of it) so the same
instrument can be re-measured after the OpenAI provider switch. Until that
new evidence exists, the historical stream must be read knowing the bias:
`unsupported` on a businessImpact field meant "states consequences", while
the rare genuinely interesting catch
(an unhedged "this directly harms your SEO") is real signal buried in
it.

**Same campaign, guard-side evidence.** The two new deterministic guards
(section 6) fired zero times on three fresh real analyses and zero false
positives across all 90 stored analyses (`packages/llm/src/
lint-stored-analyses.ts`), matching the one historical fault each was
built from. The pre-existing severity-vocabulary guard rejected a real
lacoorniche.com first attempt ("graves") and the retry loop recovered -
the reject-log-retry-fail-loud machinery working as designed on live
output. Also noted in that Mistral campaign: rate limits (HTTP 429) on the medium tier
are common enough that back-to-back analyze runs need spacing; a 429
during retries fails the analysis loudly (by design), and a 429 on the
reviewer skips it (also by design).

---

### 12a. Advisory correction-review trial (plan 033)

The correction reviewer is not the shadow reviewer. It receives exactly the
accepted `WritingInput` and `WritingPassOutput`, returns one correlated record
per eligible prose field, and writes an insert-only
`*-correction-review.json` artifact. It has no access to HTML, PDFs,
screenshots, fetched pages, the merged analysis, or report output, and no path
to alter any of them.

Its closed checklist is `unsupported-specific-claim`, `unhedged-causality`,
`language-quality`, `repetition`, and `translation-parity`. Theme titles,
finding facts, legal splices, priorities, and template text are excluded.
Generic commercial consequences are explicitly not unsupported. Provider,
schema, and correlation failures are a single `skipped` outcome with no retry;
the analysis and the existing reviewer proceed unchanged.

This is a measurement instrument, not a promotion. It cannot be assessed on
stored client data until the operator gives current, audit-specific permission
for named analysis paths. A later operator decision needs at least 20 paired
French/English outputs, zero unsafe proposals, and a documented useful-catch
rate that outweighs false-positive review burden. Until then it remains an
advisory artifact only.

**Measurement campaign, 2026-09-11: the correction reviewer is NOT promotable,
and its `unsupported-specific-claim` stream reproduces the reviewer bias.**
With current operator authorization for 10 named stored audits spanning low,
medium, and high finding counts, 20 fresh French/English analyses were
generated and re-measured with the read-only command
`packages/llm/src/measure-correction-review.ts` (one call per file, no retry).
Sample: 13 measured outputs plus 7 skipped by the pass (35 percent, all
correlation mismatches where the model returned a strict subset of the
eligible field set, extras none). The 13 measured outputs reviewed 444 prose
fields and returned 151 propose-change verdicts and 0 unsure, for 282,106
tokens and 5.4 to 19.6 seconds per call. Adjudication (performed by the
measuring agent at the operator's explicit delegation of the same day,
against the four step-6 categories): 5 true useful catches (3.3 percent of
proposals: two causality hedges, one repetition reword, one wrong
metric-related word, one missing article), 43 valid but not useful editorial
preferences, 100 false positives, and 3 unsafe proposals. The zero-unsafe
promotion threshold therefore fails, and the useful-catch rate does not
outweigh the false-positive review burden: the pass stays advisory-only and
no promotion wiring may be built from this evidence. The dominant failure
repeats trade-off 55's 2026-08-29 finding on the current model: 70 of the 73
`unsupported-specific-claim` proposals strike the hedged generic commercial
consequences the writing prompt itself requires, including page-type and
audience framing derived from the findings, despite the prompt's explicit
carve-out; no prompt repair is attempted for the same reason as 2026-08-29
(the carve-out was already present). Among the false positives, 26 proposals
replace a field with text identical to the current prose. The 3 unsafe
proposals, redacted: one rewrites the notes' WCAG 2.2 version statement into
an unversioned wording, one rewrites a remediation's "WCAG 2.2 AA" into
"WCAG 2 AA", and one deletes "visible" from a visible-labels remediation,
each changing an audited fact or admitting a wrong implementation. Full
per-entry verdicts live in a local, gitignored worksheet under the artifacts
root; aggregate counts only are recorded here.

---

## 13. GitHub issue lifecycle for model-driven work

Issue lifecycle is a standard part of completing model-driven work, not
optional administration. When a verified defect is found and will not be
fixed in the current session, create a GitHub issue before the session ends
or add the evidence to the existing issue. A local note, session log, or
prompt is not a substitute for the issue tracker.

The converse is equally binding. When a verified defect has been fixed,
committed, and tested, close its GitHub issue in the same session. The
closing comment names the commit and the verification commands with their
results. Do not leave a confirmed fixed issue open for a later cleanup pass.

`docs/agents/issue-tracker.md` owns the exact GitHub commands, uniqueness
check, labels, and the full resolution lifecycle. This rule is repeated here
because model-output guards and review work routinely expose defects: the
discovery and resolution paths must be equally automatic.
