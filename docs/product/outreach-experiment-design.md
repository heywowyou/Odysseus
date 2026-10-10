# First-100 outreach experiment, redesigned on the prospect hub

Status: dropped by the operator on 2026-09-25 (trade-off 121). First emails go
out at the operator's own pace; none of the hypotheses, selection order,
bridge test or freeze window below is run. Only the stop signals in
[first-100-rollout-runbook.md](first-100-rollout-runbook.md) apply. The
campaign tag and the `outreach-funnel` counts (section 4) stay in the product
as plain reporting. Kept as a record of the proposal (issue #373, 2026-09-16).

## 1. Why the old experiment cannot run

[Plan 014](../../plans/archive/014-first-100-hotel-rollout.md) asked two
questions:

1. Does the brokenness score rank reply probability?
2. Does render-diff evidence (A) or accessibility evidence (B) get more replies?

Plan 047 removed both inputs. There is no outreach score, cohort or wave, and
touch 1 no longer picks between two evidence families. Since Plan 069, every
new first touch carries the same v3 report-aligned Full-scan preview. Its three
public cards follow the selected French report's first three rendered
priorities, while their wording still comes from reviewed deterministic copy.

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
| Preview record: source audit, content version, selected-analysis lineage, findings digest, publication, revocation | `outreach_previews` | TTL |
| Touch-1 preview facts: finding/page counts, severity totals, priority-card categories | `outreach_previews.publishedFacts` (v3) | TTL |
| Full rendered v3 document, including bounded data-quality limitations | private preview object | public link: 30 days |

One material retention gap remains:

- **Thread and outcome rows expire after 90 days.** An experiment whose
  response window ends later than that loses its own data unless it saves
  aggregates first.

## 3. Hypotheses the hub can support

Each hypothesis states the comparison, the data behind it and whether the
design controls it. With 100 first touches, none of them yields causal
certainty. The aim is a direction plus sample sizes, as plan 014 already
required.

**H1: the accessibility bridge.** Do first touches that carry the legal half of
the fixed bridge get a different reply rate from those that do not? In v3 the
bridge follows automatically from an accessibility priority-card category, so
the comparison is observational and confounded with what the selected report
priorities contain. It becomes a controlled test only if the operator approves
assigning it by hash (decision D1).

**H2: evidence weight.** Does reply rate differ across bands of distinct
findings, affected pages, severity composition, or the categories occupying the
three report-aligned priority-card slots? This is descriptive. V3 deliberately
has no outreach grade, and none of these evidence facts is used to select,
order or exclude prospects.

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

1. **Evidence snapshot — done by Plan 069.** V3 stores distinct-finding and
   affected-page counts, severity totals, the three priority-card categories,
   selected-analysis lineage and the findings digest on the preview row. The
   legal half of the fixed bridge is derivable from whether those categories
   include accessibility. No rule IDs, URLs or recipient evidence are added.
2. **Tag the experiment — done (issue #533).** Each thread carries a
   `campaignVersion`, stamped when it opens and never changed, from
   `ODYSSEUS_OUTREACH_CAMPAIGN_VERSION` (default `first-100-2026-09`). Set a
   new value whenever `evidenceVersion`, the email template,
   `previewContentVersion` or the spacing changes. The five threads opened on
   2026-09-24, before the field existed, count as the first campaign.
3. **Export aggregates before expiry — done (issue #533).**
   `odysseus outreach-funnel --json` prints, per campaign, threads opened,
   first emails sent, replies (with the touch they followed, H4), bounces,
   opt-outs, wins and current outcomes, as counts only; the To do page shows
   the same counts. Since issue #561 the daily retention sweep also stores
   those counts per day and campaign in `outreach_funnel_snapshots`, with no
   TTL, and `odysseus outreach-funnel --history` reads them, so no manual
   export is needed before the first threads expire on 2026-12-23. Since
   Plan 078 the same command, the snapshot and the dashboard's `Campagne`
   page also count delivered and matured first emails, decline reasons and
   three stored segments (stars, group status, accessibility among the
   preview cards). The
   per-group tables for H1, H2,
   H3 and H5 still need the operator's D1 and D2 rulings before they can be
   grouped.
4. **Bridge assignment, only if D1 is approved.** Derive the bridge from a
   deterministic hash of campaign version and prospect ID instead of from
   priority-card category presence, and test that the groups are balanced.

## 5. Decisions only the operator can make

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D1 | Controlled test of the bridge? | a. Observational only (bridge follows the published priority-card categories, as today); b. Hash-assign bridge on or off among prospects with an accessibility priority card | b. It is the only controlled variable left, and it is copy the operator already approved |
| D2 | How the 100 are chosen, without a score | a. Hub filter (hotel, own website, role address found, not suppressed), then ordered by a hash of prospect ID; b. Operator hand-pick | a. Avoids the cherry-picking plan 014's freeze step ruled out |
| D3 | Response window and freeze date | e.g. the configured 14-day reply window after touch 3, about 29 days after touch 1 with default spacing (touch 2 after 4 days, touch 3 after 11 more) | Fix it before the pilot. It must end well inside the 90-day retention |
| D4 | Retention during the experiment | a. Keep 90 days and export aggregates; b. Lengthen thread and outcome retention | a. The retention was set for data minimisation (`docs/rules/prospect-qualification.md`) |
| D5 | Pilot and ramp sizes | Plan 014's 10, then 20, 30, 30 | Keep |
| D6 | Where the result is recorded | New section in `first-100-rollout-runbook.md`, or a new trade-off entry | Runbook for the numbers, a trade-off only for a decision that follows from them |

Out of scope: any score, rank or priority derived from findings for choosing
prospects (plan 047); model-written outreach copy (trade-off 83); automated
sending; opens or preview-visit tracking (the preview route keeps no visitor
log).
