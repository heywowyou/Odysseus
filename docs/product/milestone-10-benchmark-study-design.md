# Milestone 10 benchmark study design

Written 2026-09-09. The plan was written at commit `71da99a`; this document was
written at commit `340ac39` and every citation below was re-verified against the
live tree the same day. The plan's drift check (`71da99a..HEAD` over
`docs/product/`, `docs/rules/operator-obligations.md`,
`packages/core/src/normalize/severity.ts`, `packages/core/src/types/findings.ts`,
`packages/site/`) shows one change: dependency range pins in
`packages/site/package.json` (react and react-dom from exact `19.2.8` to
`^19.2.8`). It touches no premise below. The milestone 10 paragraph
(`docs/product/odysseus-project-brief.md:474-482`), the disclosure line
(`docs/rules/operator-obligations.md:87-88`), the severity order and finding
categories, and the absence of any percentile-over-stored-findings
implementation were all re-verified live on 2026-09-09.

Status: awaiting the operator decisions in section 1. This document implements
nothing; implementation happens in a follow-up plan after operator sign-off.

## Operator decisions required

These decisions are the operator's, not this document's. Each carries a
one-line default recommendation so approval can be by exception. Answers are
recorded in this section with dates once given.

1. **Cohort vertical.** The brief specifies e-commerce
   (`docs/product/odysseus-project-brief.md:475`); the live funnel is hotels,
   with a wave-1 pilot list of 10 named domains identified 2026-09-08
   (`docs/product/first-100-rollout-runbook.md:87-104`). E-commerce needs a
   fresh bounded source list, roughly one to two days of assembly, because the
   qualified catalogue is hotel-only (measured v2 yield 5,995 domains,
   `docs/product/first-100-rollout-runbook.md:61`). Hotels are operational
   today, but the 10 pilot permissions were granted for the rollout pilot, not
   for a published study (`docs/product/first-100-rollout-runbook.md:114`), and
   the study lands next to an e-commerce enforcement line
   (`docs/rules/obligation-basis.md:194`).
   Default recommendation: e-commerce with a fresh bounded list; hotels only as
   the fallback if no defensible e-commerce list exists by 2026-09-12.
2. **Cohort size, source stage, and page cap.** Binding decision 18 requires
   explicit limits, checkpoints, and reasoned yields on every operational batch
   (`plans/README.md:96-103`). The audit path defaults to unlimited pages
   (`packages/scanner/src/config.ts:59`), so the cap must be passed explicitly
   on every invocation (`packages/cli/src/commands/audit.ts:64`).
   Default recommendation: 30 sites as the target with a hard floor of 20
   scored sites, qualified from the source list before any scan, 15-page cap
   per site.
3. **Stored audit data in published statistics, and de-identification.**
   Existing artifacts are verification material, not publishable social proof
   (`PRODUCT.md:85`), and those sites were scanned for other purposes.
   Default recommendation: published statistics come only from the benchmark
   batch; existing artifacts are excluded unless the operator confirms their
   permission scope covers published aggregate use; the published page names no
   domain, only cohort size, vertical, and scan dates.
4. **Percentile axes.** Severity levels are the locked four
   (`packages/core/src/normalize/severity.ts:298-303`); categories are the
   locked six, privacy included (`packages/core/src/types/findings.ts:45-46`).
   Default recommendation: headline percentile over the severity-weighted
   per-site score across all six categories; per-category figures shown as
   cohort medians only, never as percentile claims; an accessibility-only axis
   is the alternative if the operator wants a tighter story.
5. **Sequencing versus plan 014.** The rollout pilot's prescan and manual
   review are still to run and none of the 10 pilot domains has been scanned
   (`docs/product/first-100-rollout-runbook.md:114`); no send is possible
   before 2026-09-15 (`docs/product/first-100-rollout-runbook.md:68`).
   Default recommendation: benchmark scanning starts on or after 2026-09-15 and
   never runs concurrently with pilot scanning; one crawl capacity at a time.
6. **In-report percentile timing.** The brief requires the percentile surfaced
   in the paid report (`docs/product/odysseus-project-brief.md:475-476`).
   Default recommendation: the in-report percentile ships first and the study
   second; the in-report slice is independent of the batch and is provable on
   fixture data.
7. **Publication date and French review.** The disclosure line must sit near
   the top of the published page, not in a footer
   (`docs/rules/operator-obligations.md:87-88`); the gate L second human
   reviewer is still unnamed (`docs/product/first-100-rollout-runbook.md:66`).
   Default recommendation: publish 2026-09-19 with a hard cutoff of 2026-09-21;
   French text reviewed by the gate L reviewer plus the operator; if no
   reviewer is named by 2026-09-16, the study does not publish and the
   in-report percentile stands alone.
8. **Permission posture for the benchmark batch.** Trade-off 75 records a
   batch that visited 110 sites nobody approved
   (`docs/decisions/trade-offs.md:3796`).
   Default recommendation: one explicit operator permission record naming the
   benchmark purpose and the exact domain list, recorded before the first
   request.

## Scope for 22 September

The smallest honest scope is two slices, in this order.

- **Slice A, must land before 22 September:** the deterministic percentile
  function in `packages/core` and the in-report paid-report section with
  bilingual strings. This is the part the product carries; the brief's
  milestone 10 requirement is the percentile in the paid report
  (`docs/product/odysseus-project-brief.md:475-476`).
- **Slice B, target:** the bounded benchmark batch over the cohort from
  sections 3 and 4, and the static French study page of section 7.

Deliberately descoped: per-site drill-downs in the study, multi-vertical
comparison, any interactive element (charts, filters, calculators), any change
to the offer or the EUR 1,600 HT published price (`PRODUCT.md:87`), and any
imagery (`PRODUCT.md:83`).

## Cohort definition

Written so it survives either answer to decision 1.

Common mechanics, both verticals:

- The cohort is a fixed, ordered list of domains written to the job before the
  first request. Trade-off 75's root cause was a restart that re-paged a live
  query instead of resuming a persisted list
  (`docs/decisions/trade-offs.md:3796`).
- Selection is a deterministic, recorded, rerunnable rule, the same discipline
  as the rollout's cohort selection (`docs/product/first-100-rollout-runbook.md:87-90`).
- Eligibility per site: reachable over HTTPS, French market, a
  vertical-identifying check passes, robots respected by the existing engine.
- The 110 incident domains stay excluded from anything cohort-shaped unless the
  operator overturns the recorded exclusion
  (`docs/product/first-100-rollout-runbook.md:130`).

E-commerce branch: the source list itself is assembled with recorded
provenance (where each candidate came from), then cheap qualification runs
before any crawl, then the fixed list is frozen and permissioned per decision
8. Hotel branch: the existing ranked catalogue and `hotel-outreach-v2` score
order (`docs/product/first-100-rollout-runbook.md:61-62`) supplies the
ranking, continued past the pilot's decile cutoff the same way the pilot
extended from 6 to 10 (`docs/product/first-100-rollout-runbook.md:87-104`);
pilot permissions do not transfer to the study.

## Batch scan mechanics

Reuse the existing full-audit pipeline; do not build a new one.
`packages/cli/src/commands/audit.ts` drives `runAuditStage` from
`@odysseus/interface` (`packages/cli/src/commands/audit.ts:3`) and results land
in the `audits` and `findings` collections (`packages/store/src/audits.ts:2-9`).
The benchmark batch is a thin runner over that pipeline adding what binding
decision 18 of the milestone 9c plans index requires
(`plans/archive/9c-plans-index-history.md`, "Binding decisions"):

- Dry-run mode: prints the exact cohort, per-site cap, and planned page counts,
  crawls nothing.
- Explicit limits: the per-site page cap is passed on every invocation
  (`packages/cli/src/commands/audit.ts:64`); the engine default is unlimited
  (`packages/scanner/src/config.ts:59`).
- Persisted candidate list: the ordered domain list is written to the job
  before the first request; a restart resumes that list and can never page past
  it (`docs/decisions/trade-offs.md:3796` names the missing persistence as the
  root cause).
- Checkpoints: one per completed site, so a resumed batch skips finished sites
  and the duplicate visits of trade-off 75 cannot recur.
- Reasoned yields: the batch summary reports cumulative reality, planned versus
  crawled versus findings, not the last internal pass
  (`docs/decisions/trade-offs.md:3796` records the misleading progress
  message).

## Percentile aggregation design

A deterministic pure function in `packages/core`. No model choice anywhere in
it.

- Inputs: the stored finding documents of each cohort audit, carrying the
  locked `Severity` and `FindingCategory` values
  (`packages/core/src/types/findings.ts:45`).
- Site score: the sum of `SEVERITY_ORDER` weights over the site's findings,
  critical 4, serious 3, moderate 2, minor 1
  (`packages/core/src/normalize/severity.ts:298-303`).
- Percentile: the share of cohort sites with a strictly lower, meaning better,
  score than this site's. Ties break on critical count, then do not split
  further.
- Honesty rule: below a minimum cohort floor the function returns no percentile
  at all, only a too-small marker. The recommended floor is 20 scored sites.
  The report section then renders one fixed sentence stating the cohort was too
  small, and nothing else.
- Output: the percentile, the cohort size, and the scan date range, so the
  report and the study page print the provenance next to the number.

## In-report percentile section

A deterministic splice into the paid report:

- One new section under `packages/report/src/template/sections/`, following the
  existing pattern where each section ships with its own test file (verified
  listing, 2026-09-09).
- All wording lives in `packages/report/src/template/strings/`, where `fr.ts`
  and `en.ts` already exist; bilingual from day one, because user-facing
  strings are French and English from the start (`PRODUCT.md:75`).
- Never an LLM sentence. The percentile is a computed fact, printed with its
  cohort size and scan dates beside it.
- Styling uses the locked Nocturne system only (`PRODUCT.md:76`).

## Published study page

A static French page in `packages/site/app/`, following the existing
French-slug page conventions (`apercu/`, `bot/`, `confidentialite-prospection/`,
`desinscription/`, `offre/`; verified listing, 2026-09-09). Proposed slug:
`etude-accessibilite-ecommerce`.

- The disclosure line is fixed copy, quoted verbatim, placed near the top of
  the page, never in a footer
  (`docs/rules/operator-obligations.md:87-88`;
  `docs/product/odysseus-project-brief.md:480-482`):

  > Cette étude a été rédigée avec l'assistance d'un outil d'intelligence artificielle, à partir de données de scan automatisées.

- No imagery anywhere on the page; the repository contains none
  (`PRODUCT.md:83`).
- Generation: the study prose is generated with OpenAI as with everything else,
  per the brief (`docs/product/odysseus-project-brief.md:479-480`), from the
  aggregate statistics only. Every number in the page is injected from the
  aggregation output, never recomputed by the model, and the model response is
  validated with Zod before it is rendered.
- Static content only, no client-side interactivity.

## Schedule and risk

13 days from 2026-09-09 to the 22 September target. The target date is the
Créteil hearing (`docs/rules/obligation-basis.md:194`) and the brief aims
before it (`docs/product/odysseus-project-brief.md:477-478`).

Collision: plan 014's rollout occupies the same window. Gate I (warmup) and
gate L (reviewer) are open, the pilot prescan and manual review are still to
run, and no send is possible before 2026-09-15
(`docs/product/first-100-rollout-runbook.md:66-68,114`).

Descope ladder:

1. Both slices land: full milestone 10.
2. In-report percentile alone: acceptable. It lands before the hearing and
   carries the brief's paid-report requirement
   (`docs/product/odysseus-project-brief.md:475-476`).
3. Study alone: not acceptable. Without the in-report percentile the study is
   marketing and the brief's product requirement is unmet.
4. Neither: the only acceptable reason is rollout destabilization; the rollout
   is the revenue path and wins any conflict.

Risks, ranked: the eight operator decisions in section 1 are unmade; the gate L
reviewer is unnamed (`docs/product/first-100-rollout-runbook.md:66`); cohort
assembly can slip; crawl capacity contention with the pilot.

## Build-slice outline

Implementation happens in a follow-up plan after operator sign-off on this
document. Order and sizing:

1. Aggregation function in `packages/core`, with unit tests over fixture
   findings: S.
2. In-report report section, fr/en strings, tests: M. Does not wait for slice
   3; it is provable on fixtures.
3. Batch runner with dry-run, persisted candidate list, checkpoints, and
   reasoned yields, over the existing audit pipeline: M.
4. Site page with the disclosure line and the reviewed French text: S.

Total: roughly one to one and a half weeks of focused work, against a 13-day
window that also contains the rollout pilot. That arithmetic is why decisions 5
to 7 in section 1 cannot wait past this week.

## What this design does not decide

- The eight operator decisions in section 1. When the operator answers, the
  answers are recorded in that section with dates, the same way
  `docs/product/first-100-rollout-runbook.md` records gate evidence.
- The final page slug and the full French copy of the study. Only the
  disclosure line is fixed (`docs/rules/operator-obligations.md:87-88`).
- Whether stored artifacts may additionally feed published statistics beyond
  decision 3's default.
- The study prose outline; that belongs to the follow-up plan, written with the
  reviewer.
- Interactions with milestone 12 (free scope check): if it is ever revisited,
  its percentile and disclosure mechanics are read together with this
  document.
- Any pricing or offer claim: the EUR 1,600 HT published price is untouched
  (`PRODUCT.md:87`).
- If 22 September passes without operator sign-off, section 2's descope ladder
  is the record of what was cut; the scope is not silently reshaped afterwards.
