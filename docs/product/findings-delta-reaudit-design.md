# Findings delta mechanics for the paid re-audit (design)

Written 2026-09-09 against the working tree at commit `69a24e6`. Deliverable
of issue #164; the six operator decisions below gate the follow-up build
plan, and no code, type, or schema changes here.

Status: **APPROVED 2026-09-10.** The operator approved all six defaults, so
every decision below applies as its default states it. **Built 2026-09-16** by
[plan 051](../../plans/051-findings-delta-reaudit.md) (issue #371). The
decisions this design left to the build are recorded in trade-off 93.

Drift check, run first per the plan: over `71da99a..HEAD` the plan's five
files show one change, `docs/decisions/trade-offs.md`, 18 insertions, both
amendments that landed after the plan was written: entry 23 for issue #162,
the static fallback gate with its `generationMode` marker
(`docs/decisions/trade-offs.md:887`), and the checkpoint entry for issue #132
(`docs/decisions/trade-offs.md:3896`). Neither weakens a premise. Two
line-number consequences, verified this session: trade-off 42 now sits at
`docs/decisions/trade-offs.md:2129-2206` (core line at 2141-2142), and
`GenerateReportInput` moved from `packages/report/src/types.ts:64-95` to
`packages/report/src/types.ts:69-100` with an identical field list, a line
shift, not a contract change. Everything
else in the plan's current state verified byte for byte: `computeDedupeKey`
(`packages/core/src/normalize/dedupe.ts:34-39`), `ToolVersions`
(`packages/core/src/types/manifest.ts:78-87`, `tool` at :320), the SKU
sentence (`PRODUCT.md:37`), and brief lines 202, 208, 333, 501, 655. The
existing-implementation stop check passes: the "delta" grep hits under
`packages/` are unrelated (score diffs, sort math, comments; e.g.
`packages/interface/src/dashboard/routes/insights-model.ts:289-308`). No
findings-delta mechanics exist.

## Operator decisions required

The build plan starts only after these are answered. Each carries a default
recommendation; silence means the default applies.

1. **Render shape.** Delta section inside the standard re-audit report, or a
   standalone delta document? Default: section, for the re-audit SKU's
   5 business day turnaround (`PRODUCT.md:37`, constant at
   `packages/report/src/template/html-utils.ts:108`). A standalone document
   stays a separate milestone 13 decision per trade-off 42
   (`docs/decisions/trade-offs.md:2129`). Either answer widens a package seam
   (section 4), so this needs explicit sign-off.
2. **Category scope.** Accessibility only, or both audit categories
   (technical and SPA-SEO, plus accessibility)? Default: both. The dedupe key
   is category-agnostic (`packages/core/src/normalize/dedupe.ts:34-39` hashes
   source, ruleId, and identity with no category input), `Finding.category`
   already distinguishes them (`packages/core/src/types/findings.ts:105`),
   and the paid report already renders both.
3. **Languages.** Does the delta section render in both French and English
   from day one? Default: yes. The paid deliverable is the French and English
   report pair (`CLAUDE.md:347`, trade-off 44), and all user-facing strings
   must support both languages from the start (`CLAUDE.md:788`). A
   single-language delta would make the pair asymmetric.
4. **Baseline selection.** When an audit has more than one possible
   predecessor, which is the baseline? Default: the most recent delivered
   predecessor, by its stored run date (the dashboard already sorts audits on
   `createdAt`, `packages/interface/src/dashboard/routes/audits-model.ts:124-125`),
   never a hand-picked baseline. "Delivered" means the report pair for that
   run went out; an undelivered rerun does not become the baseline.
5. **Severity changes.** Is a finding whose severity moved but whose rule set
   did not one delta class or two? Default: `changed-severity` is its own
   class, showing both the baseline and the re-audit severity (section 2
   defines the classes). Splitting it into "worse" and "better" halves is
   rejected: severity comes from a deterministic mapping
   (`packages/core/src/normalize/severity.ts:61`), so one class with both
   values states the fact without interpreting it.
6. **Pricing and marketing copy.** Confirmed out of scope of the follow-up
   build plan. The re-audit is quoted here only as an existing fact
   (`PRODUCT.md:37`, constant at
   `packages/report/src/template/html-utils.ts:107`, report-owned per
   trade-off 42): nothing re-priced, re-worded, or newly surfaced. Recorded
   here so nobody assumes otherwise.

## The delta record over dedupe keys

The delta compares exactly two runs of the same site URL: a baseline run and
the re-audit run. The join key is the stored `Finding.dedupeKey`
(`packages/core/src/types/findings.ts:138`, locked contract), computed by
`computeDedupeKey` (`packages/core/src/normalize/dedupe.ts:34-39`) as a
SHA-256 of `source|ruleId|identity`, truncated to 16 hex characters
(`packages/core/src/normalize/dedupe.ts:32`) so the key can sit in a compound
index with the site URL. The third argument is the candidate's identity, not
necessarily a selector: page-scoped findings pass the empty string, the
same-page aggregation pass passes the canonical page URL, and a candidate
carrying `FindingCandidate.dedupeIdentity` passes that
(`packages/core/src/normalize/dedupe.ts:1-27`).

Exactly four classes, from the two key sets and the severity field
(`packages/core/src/types/findings.ts:106`):

- **new**: key present in the re-audit, absent from the baseline.
- **resolved**: key present in the baseline, absent from the re-audit.
- **persistent**: key present in both, identical severity in both.
- **changed-severity**: key present in both, different severity.

Each delta row carries both runs' `ruleId`
(`packages/core/src/types/findings.ts:103`), both severities
(`packages/core/src/types/findings.ts:106`), both pageUrls counts
(`packages/core/src/types/findings.ts:123`, counts, not URL lists), and the
baseline `findingId` (`packages/core/src/types/findings.ts:93`) for
traceability. Every finding traces to a scanner rule ID, non-negotiable
rule 2 of the charter (`CLAUDE.md:36`); the rule ID is never invented, never
rewritten (`packages/core/src/types/findings.ts:99-103`).

Pass provenance caveat. The fine pass keys on `source|ruleId|selector` and
collapses one selector across pages; the coarse pass collapses different
selectors of the same rule within one page
(`docs/product/odysseus-project-brief.md:202-204`), and which pass produced a
key is part of its cross-run meaning
(`docs/product/odysseus-project-brief.md:208`). Both passes emit keys through
the same hash, so the same rule and identity compare cleanly across runs. But
a run where normalization changed (a new `dedupeIdentity`, an aggregation
change) changes keys without the site changing. Two defenses, both already
stored per run:

- The version disclosure of section 3, which stops a tooling or normalization
  shift from being read as a site change.
- The provenance stamp on every manifest: `findingsProvenance`
  (`packages/core/src/types/manifest.ts:319`) carries the findings schema
  version, the normalization fingerprint, and the findings digest
  (`packages/core/src/normalize/findings-provenance.ts:8-10`). When the two
  fingerprints differ, the key sets are not comparable as site facts. The
  pipeline already fails closed on absent or stale provenance (trade-off 40,
  `docs/decisions/trade-offs.md:1948`; assertion at
  `packages/core/src/normalize/findings-provenance.ts:37`); the delta must
  consume only provenance-stamped findings sets from both runs.

**Rescoped findings (2026-09-17).** Normalization merges same-rule selectors
that cover the same pages into one finding keyed on its sorted page list, so
the key moves whenever that page set changes: the re-audit reaches one more or
one fewer page, or the client fixed the defect on some pages only. After
pairing on `dedupeKey`, the delta therefore pairs leftover resolved and new
findings of the same rule, category and title on overlapping pages, greedily
by overlap, before classifying them. Such a row carries the re-audit's key. In
rare cases this can merge a fixed defect and a new one of the same rule on the
same pages; that was accepted because normalization already treats same-rule,
same-scope selectors as one problem.

Comparability boundary, on record: if `computeDedupeKey` ever changes (inputs,
length, or pre-hash normalization), keys stop being comparable across that
boundary for all historical runs. This document is the record of that.

## Version attribution rule

Every audit stamps the versions that produced it: `ToolVersions`
(`packages/core/src/types/manifest.ts:78-87`) carries `odysseusVersion`,
`findingsSchemaVersion`, `axeCoreVersion`, `lighthouseVersion`,
`playwrightVersion`, and `chromiumVersion`, and the manifest carries it as
`manifest.tool` (`packages/core/src/types/manifest.ts:320`). The brief fixed
why (`docs/product/odysseus-project-brief.md:333`): a scanner upgrade between
two runs otherwise reads as phantom regressions and phantom fixes with no way
to attribute them.

The rule: when the two runs' manifests differ in `odysseusVersion`,
`findingsSchemaVersion`, `axeCoreVersion`, or `lighthouseVersion`, the
re-audit report must say so next to the delta, in deterministic bilingual
prose written by code, never by the model. `axeCoreVersion` and
`lighthouseVersion` are nullable, null meaning every page's pass failed in
that run (`packages/core/src/types/manifest.ts:81-84`); null on one side and
a version on the other counts as a difference.

Honest behavior for `changed-severity` when versions differ: suppress the
class. The delta counts render without it, and a deterministic bilingual note
states that tool versions differed and the severity movement is attributed to
the tooling, not the site. Why suppression over labeling: severity is a
deterministic mapping over scanner output
(`packages/core/src/normalize/severity.ts:61`; fixed custom-check severities
at `packages/core/src/normalize/severity.ts:86-89`), so a scanner upgrade can
move severities with no site change. Labeling still shows an old and new
number beside a version bump and invites the client to read a tooling
artifact as site regression. Suppression claims neither that the site changed
nor that it did not; the pair of runs cannot answer that. The operator can
override this to labeling; suppression is the recommendation.

`playwrightVersion` and `chromiumVersion` pin the render-diff context; they
belong in the same disclosure but do not gate suppression. A normalization
fingerprint difference between the runs (section 2) triggers the same
disclosure and the same suppression, the keys-moved-without-the-site-changing
case exactly.

## Where the delta renders

Trade-off 42 (`docs/decisions/trade-offs.md:2129-2206`) built the outreach
preview as a separate document kind whose safety is structural, and its core
line applies with equal force here: "A preview built by projecting the report
input would be one careless spread away from publishing all of it"
(`docs/decisions/trade-offs.md:2141-2142`). The lesson cuts both ways for the
delta.

- A standalone delta document shares no input contract with anything. That is
  safe, but it is a second document to design, guard, and keep bilingual, and
  it needs its own strict input type on the `OutreachPreviewInput` pattern
  (`docs/decisions/trade-offs.md:2136-2140`). That cost buys nothing for the
  re-audit SKU, whose reader already has the full report in hand.
- A delta section inside the paid report means one new optional field on
  `GenerateReportInput` (`packages/report/src/types.ts:69-100`), which today
  admits only renderMetadata, auditDir, manifest, findings, analysis,
  manualFields, preparation, and browser. The template reads findings and the
  manifest already parsed, never re-read from disk
  (`packages/report/src/types.ts:72-74`), so the delta must arrive the same
  way: computed by the orchestration layer and passed in, never derived
  inside the template from a second findings file the template reads itself.

Default (decision 1), the additive shape: one optional `delta` field,
computed deterministically in `packages/core` as a pure function over two
stored finding sets plus two manifests, passed in by the orchestration layer,
and absent on every non-re-audit report. The absent-field pattern already
exists: `manualFields` is absent for audits without saved manual fields and
every consuming section renders its existing behavior unchanged
(`packages/report/src/types.ts:82-88`). Widening `GenerateReportInput` is a
report package seam decision, which is why decision 1 needs explicit operator
sign-off before the build plan, per the charter's stop-and-ask rule.

## The LLM boundary

Open question 8 of the brief
(`docs/product/odysseus-project-brief.md:655`): identical findings produced
eight quick wins in French and seven in English on the first live run, so
"monitoring deltas must be derived from the deterministic findings layer with
the analysis regenerated, not diffed." That decision, for the re-audit slice,
is this section.

Consequences for the re-audit flow:

- The re-audit runs the normal pipeline: findings are normalized fresh, and
  the analysis is regenerated per language exactly as today.
- The delta section is a deterministic splice: computed before rendering,
  passed in through the input field of section 4, rendered verbatim. Never
  model-written, never model-ranked.
- The model is never shown two analyses to compare and never asked to
  summarize a diff.
- The model may explain persistent findings, because that is what it already
  does for any finding today (grouping, ranking, business impact, brief
  stage 4, `docs/product/odysseus-project-brief.md:210-222`). It never
  writes the delta itself, never words the version disclosure, and never
  classifies anything as new, resolved, or fixed.

Landed-work interaction (issue #162, trade-offs entry 23 amendment,
`docs/decisions/trade-offs.md:887`): when findings qualify for the static
fallback (`isAuditFallbackEligible`,
`packages/interface/src/pipeline/analysis-stage.ts:259`), the analysis is
persisted with the `generationMode: 'static-fallback'` marker
(`packages/interface/src/pipeline/analysis-stage.ts:333`). The delta is
independent of analysis mode: computed from the findings layer either way,
rendered either way, the model not involved in either mode.

## Re-audit workflow mechanics

The SKU is an existing fact: a re-audit at EUR 450 HT flat within 5 business
days (`PRODUCT.md:37`; constants at
`packages/report/src/template/html-utils.ts:107-108`). Nothing here re-prices
it or adds copy to it.

The 5 business day flow:

1. The operator triggers a fresh full audit of the same site URL through the
   normal pipeline. No new scan mode, no reduced crawl: the delta is only as
   honest as the run under it.
2. The orchestration layer selects the baseline by decision 4's rule, runs
   the section 2 and 3 checks, and computes the delta with the pure
   `packages/core` function over the two stored findings sets and manifests.
3. The report renders with the delta section, in French and English
   (decision 3), through the optional input field of section 4.
4. Both runs' artifacts stay on disk: each run keeps its own findings and its
   own manifest, so the next re-audit's baseline is simply the most recent
   delivered run, and nothing ever overwrites history to manufacture a diff.

Deferred to milestone 13 (`docs/product/odysseus-project-brief.md:501`):
scheduled re-scans, regression detection across more than two runs, and delta
reports beyond the paid re-audit. Milestone 13 is technical capability only;
the subscription tier stays dropped. This design proposes no scheduled
surface, no automatic sending, and no SMTP sequencer.

## What this design does not decide

Held for the operator or for milestone 13:

- The milestone 13 render shape. Section versus standalone may legitimately
  diverge there per trade-off 42; the delta record and version attribution of
  sections 2 and 3 must be reused verbatim either way.
- Whether the delta result is persisted or computed at render from the two
  stored artifact sets. The pure-function shape (over two finding sets plus
  two manifests, offline, no I/O) keeps both open; the build plan picks one.
- Retention: how many historical runs to keep as eligible baselines. Today
  both runs' artifacts stay on disk; a cap is undecided.
- Dashboard surfacing of deltas in `packages/interface`. Not designed here.
- The exact French and English wording of the version disclosure and the
  suppression note. Deterministic prose, drafted at build time, reviewed like
  the report's deterministic legal content.
- Baselines across a site URL change (redirect or domain move). Out of scope;
  decision 4 assumes the same site URL.
- Runs with different crawl configs (`manifest.config`,
  `packages/core/src/types/manifest.ts:321`): whether a different maxPages or
  depth disqualifies a baseline is a build-plan input, not decided here.
