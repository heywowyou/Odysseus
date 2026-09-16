# First-100 outreach experiment, redesigned on the prospect hub

Status: design proposal, 2026-09-16 (issue #373). Not an execution plan. Once
the operator settles the decisions in section 5, it becomes a numbered plan
under `plans/`.

## 1. Why the old experiment cannot run

[Plan 014](../../plans/archive/014-first-100-hotel-rollout.md) asked two
questions:

1. Does the brokenness score rank reply probability?
2. Does render-diff evidence (A) or accessibility evidence (B) get more replies?

Plan 047 removed both inputs. There is no outreach score, cohort or wave, and
touch 1 no longer picks between two evidence families. Since template v2
(`docs/rules/outreach-rules.md` section 6), every first touch carries the same
Full-scan scorecard preview. Its proof cards are chosen in code from the audit's
findings (`packages/core/src/prospecting/outreach-preview-summary.ts`).

The operational parts of plan 014 still hold and are reused here unchanged: the
launch gates, the 10-site pilot, the bounded ramp, the stop conditions (hard
bounces at 2 percent or more, any complaint or provider warning, a wrong
establishment match, a broken opt-out), manual sending and aggregate-only
analysis. Only the questions and the data behind them change.

## 2. What the hub records today

| Data | Where | Kept for |
| --- | --- | --- |
| Hotel segment: stars, rooms, group status, website kind, department | `prospects` (`hotel.*`, `websites[].kind`) | durable |
| Contact origin: `atout-france`, `site-discovery`, `sirene`, `operator` | `prospects.emails[].origin`, joined to `outreach_threads.roleAddress` | durable |
| Prospect status: new to won, lost or opted out | `prospects.status` | durable |
| Thread state, touches sent and when, language, spacing | `outreach_threads` | 90 days (TTL) |
| Operator-recorded outcome and lost reason | `outreach_outcomes` | 90 days (TTL) |
| Text versions behind each draft | `outreach_drafts.evidenceVersion`, `outreachPromptVersion` | as drafts |
| Preview record: source audit, content version, publication, revocation | `outreach_previews` | TTL |
| What the preview showed: grade, counts, proof-card categories | only in the rendered object in the bucket | not queryable |

Two gaps follow from this table:

- **The evidence shown is not recorded.** The preview record has no grade,
  finding counts or proof-card categories. The draft schema still carries the
  comment for an "evidence family" field that no longer exists (in
  `packages/store/src/schemas/outreach-draft.schema.ts`, above `previewId`).
  Without these fields, no reply can be related to the evidence that
  preceded it.
- **Thread and outcome rows expire after 90 days.** An experiment whose
  response window ends later than that loses its own data unless it saves
  aggregates first.

## 3. Hypotheses the hub can support

Each hypothesis states the comparison, the data behind it and whether the
design controls it. With 100 first touches, none of them yields causal
certainty. The aim is a direction plus sample sizes, as plan 014 already
required.

**H1: the accessibility bridge.** Do first touches that carry the legal half of
the template-v2 bridge get a different reply rate from those that do not?
Today the bridge follows automatically from an accessibility proof card, so the
comparison is observational and confounded with what the site's findings
contain. It becomes a controlled test only if the operator approves assigning
it by hash (decision D1).

**H2: evidence weight.** Does reply rate differ across the preview's grade, or
across bands of distinct findings and affected pages? This is descriptive. The
grade is the severity-derived label the prospect already sees, and it is
**never** used to select, order or exclude prospects. Using it that way would
bring back the score that plan 047 removed.

**H3: where the contact came from.** Do hard bounces and reply rate differ by
contact origin? This is the most actionable result for deliverability, and the
data already exists.

**H4: which touch earns the reply.** How are replies spread across touches 1, 2
and 3? This shows whether touch 3's deterministic facts block adds replies or
only objections.

**H5: segment.** Does reply rate differ by stars, independent versus group
member, or rooms band? This is descriptive targeting evidence for the next
batch, not a gate on this one.

Primary metric: a reply of any kind (`reply-positive`, `reply-not-now`,
`reply-negative`) per first touch sent, within the frozen response window.
Guard metrics: hard bounces, objections and opt-outs, and complaints when
the provider reports them. Downstream counts (`call`, `quoted`, `won`) are
reported as they are, with no rate inferred from a handful of events.

## 4. Engineering needed before the first send

Kept deliberately small, and none of it changes what the prospect receives:

1. **Record the evidence shown.** When a preview is recorded, store its grade,
   its distinct-finding and affected-page counts, its proof-card categories and
   whether the bridge carried the legal half. Store these on the preview row,
   and remove the stale comment on the draft schema. No rule IDs, no URLs, no
   recipient data.
2. **Tag the experiment.** Add a campaign version to the thread, stamped when
   the thread opens, and freeze it together with `evidenceVersion`,
   `outreachPromptVersion`, `previewContentVersion` and the spacing values.
3. **Export aggregates before expiry.** Add a read-only command that produces
   the section 3 tables, as counts per group only, from the live collections,
   and run it before the first thread reaches its 90-day TTL.
4. **Bridge assignment, only if D1 is approved.** Derive the bridge from a
   deterministic hash of campaign version and prospect ID instead of from
   proof-card presence, and test that the groups are balanced.

## 5. Decisions only the operator can make

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D1 | Controlled test of the bridge? | a. Observational only (bridge follows the proof cards, as today); b. Hash-assign bridge on or off among prospects with an accessibility card | b. It is the only controlled variable left, and it is copy the operator already approved |
| D2 | How the 100 are chosen, without a score | a. Hub filter (hotel, own website, role address found, not suppressed), then ordered by a hash of prospect ID; b. Operator hand-pick | a. Avoids the cherry-picking plan 014's freeze step ruled out |
| D3 | Response window and freeze date | e.g. the configured 14-day reply window after touch 3, about 29 days after touch 1 with default spacing (touch 2 after 4 days, touch 3 after 11 more) | Fix it before the pilot. It must end well inside the 90-day retention |
| D4 | Retention during the experiment | a. Keep 90 days and export aggregates; b. Lengthen thread and outcome retention | a. The retention was set for data minimisation (`docs/rules/prospect-qualification.md`) |
| D5 | Pilot and ramp sizes | Plan 014's 10, then 20, 30, 30 | Keep |
| D6 | Where the result is recorded | New section in `first-100-rollout-runbook.md`, or a new trade-off entry | Runbook for the numbers, a trade-off only for a decision that follows from them |

Out of scope: any score, rank or priority derived from findings for choosing
prospects (plan 047); model-written outreach copy (trade-off 83); automated
sending; opens or preview-visit tracking (the preview route keeps no visitor
log).
