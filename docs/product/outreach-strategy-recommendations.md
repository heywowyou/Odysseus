# Outreach strategy recommendations and six-month forecast

**Written:** 2026-09-13  
**Second pass:** 2026-09-13, before the first real campaign send

## Purpose and authority

This document records the pre-launch commercial strategy and six-month sales
forecast for the Odysseus outbound channel so future campaign results can be
compared against the assumptions that existed before real sales data.

It is an **advisory strategy note**, not a canonical product, legal, privacy,
pricing, or outreach-rules document. If it conflicts with a canonical source,
the canonical source wins. In particular, operating behavior remains governed
by the current outreach, qualification, offer, operator-obligation, and rollout
documents.

The second pass does not change the original forecast. It makes the document
more useful for later evaluation by defining denominators, separating operating
constraints from commercial targets, and adding decision rules for interpreting
results.

The central recommendation remains:

> Optimize Odysseus for sales per qualified prospect contacted, not for maximum
> email volume.

Odysseus already has advantages over generic cold outreach: qualification
before expensive scanning, prospect scoring, prospect-specific technical
evidence, a full-site outreach preview, bounded follow-ups, and manual review.
The largest remaining gains should come from better selection, stronger proof,
and better handling after a prospect replies.

---

## 1. Preserve the original six-month forecast

### Forecast interpretation

The original forecast treats 3, 6, or 10 emails per day as **new prospects
contacted per working day**, with follow-ups additional.

It assumes approximately **130 sending weekdays over six months**.

| Scenario | Closed-sale rate per contacted prospect |
| --- | ---: |
| Conservative | 0.2% |
| Standard | 0.5% |
| Optimistic | 1.0% |

These are planning assumptions, not measured Odysseus conversion rates.

### Estimated full-audit sales over six months

| New prospects/day | Approx. prospects | Conservative | Standard | Optimistic |
| ---: | ---: | ---: | ---: | ---: |
| 3/day | 390 | ~1 | ~2 | ~4 |
| 6/day | 780 | ~2 | ~4 | ~8 |
| 10/day | 1,300 | ~3 | ~7 | ~13 |

### Revenue equivalent at the 2026-09-13 full-audit price of EUR 1,600 HT

**The full-audit price is EUR 990 HT since 2026-09-17 (issue #405,
trade-off 96).** The figures in this section and in the per-100-touches
table below are left at the price they were computed against, because the
argument they support is about conversion ratios and sending volume, not
about the price level. Multiply by 0.62 for the current price.

| New prospects/day | Conservative | Standard | Optimistic |
| ---: | ---: | ---: | ---: |
| 3/day | ~EUR 1,600 HT | ~EUR 3,200 HT | ~EUR 6,400 HT |
| 6/day | ~EUR 3,200 HT | ~EUR 6,400 HT | ~EUR 12,800 HT |
| 10/day | ~EUR 4,800 HT | ~EUR 11,200 HT | ~EUR 20,800 HT |

This excludes re-audits, referrals, inbound, account expansion, agency
partnerships, and future price changes.

For planning purposes, the original standard case is:

> **About 7 full-audit sales in six months at 10 new qualified prospects per
> working day.**

At that nominal activity level:

- ~3 sales: weak but plausible result
- ~7 sales: standard planning case
- ~13 sales: strong result
- 10 to 15+ sales without materially increasing contact volume: strong evidence
  that targeting, proof, and sales handling outperform the initial model

### Normalize the forecast per 100 first touches

Daily pace can change because follow-ups consume mailbox capacity. For later
comparison, the cleaner unit is therefore **100 delivered first touches**.

| Scenario | Expected full-audit sales per 100 delivered first touches | Full-audit revenue per 100 | Revenue per delivered first touch |
| --- | ---: | ---: | ---: |
| Conservative | 0.2 | EUR 320 HT | EUR 3.20 HT |
| Standard | 0.5 | EUR 800 HT | EUR 8.00 HT |
| Optimistic | 1.0 | EUR 1,600 HT | EUR 16.00 HT |

This normalized view should be preferred when actual daily sending differs from
the nominal 3, 6, or 10 first-touch scenarios.

---

## 2. Treat 10 new prospects/day as a ceiling-like scenario, not a quota

The six-month table is an activity model, not an instruction to force exactly
10 new prospects into the mailbox every working day.

With a maximum three-touch sequence, 10 new prospects per day can eventually
produce up to roughly 30 daily sends before subtracting threads that replied or
were suppressed. That places the 10/day scenario near the current intended
total daily operating range once follow-ups mature.

Therefore:

- due follow-ups count before adding new first touches
- the total daily operating ceiling wins over the nominal first-touch target
- a day with fewer new prospects is not underperformance if follow-ups consume
  the safe mailbox capacity
- campaign comparisons should use delivered first touches as the denominator,
  not calendar days alone

The strategic target is **better conversion at safe volume**, not perfect
adherence to a daily first-touch number.

---

## 3. Establish a clean baseline before optimizing the campaign

The first useful campaign should keep the current first-touch email and v3
report-aligned preview stable long enough to establish a baseline.

The most important initial commercial question is:

> Does the current prospect ranking predict reply quality and eventual
> commercial outcome?

Track the chain:

`rank / score -> delivered first touch -> reply -> positive reply -> substantive conversation -> sale`

Do not change subject rules, body copy, priority-card selection/copy, targeting
rules, and follow-up timing at the same time. A clean baseline is more valuable than a
collection of small optimizations whose effects cannot be separated.

Before the first real wave, reconcile any older rollout experiment that assumes
the retired v2 scorecard/grade shape. The campaign of record should test the
current v3 report-aligned preview that is actually shipped.

---

## 4. Define the commercial funnel precisely

Use unique outreach threads/accounts as the unit wherever possible. Avoid
mixing message count with prospect count.

Recommended definitions:

| Metric | Definition |
| --- | --- |
| Delivered first touches | First-touch messages sent minus hard bounces |
| Any reply rate | Unique threads with any recipient reply / delivered first touches |
| Positive reply rate | Unique threads with a commercially positive reply / delivered first touches |
| Conversation rate | Unique threads reaching a substantive sales conversation / delivered first touches |
| Sale rate | Won full-audit customers / delivered first touches |
| Positive-reply close rate | Won full-audit customers / positive-reply threads |
| Revenue per first touch | Attributed outbound revenue / delivered first touches |
| Re-audit rate | Customers buying a re-audit / eligible completed full audits |
| Referral rate | Customers producing a qualified referred opportunity / completed customers |

Keep category definitions stable within a campaign version. A reply should not
move between positive and negative categories merely because later events make
the thread look better or worse.

Also preserve where practical:

- score version
- rank or cohort position
- priority-card categories
- campaign version
- objection category
- bounce and suppression outcome
- first-touch date
- won/lost outcome date

This is the minimum dataset needed to learn whether selection and proof are
improving.

---

## 5. Read the first 100 correctly

The first 100 is valuable, but mostly for operating quality, replies, objections,
and directional ranking evidence. It is a weak sample for estimating a low
sale rate.

If the true sale rate were the original **0.5% standard case**, the probability
of observing **zero sales in the first 100 contacts is about 61%**. Even at a
true **1.0% sale rate**, the probability of zero sales in the first 100 is about
37%.

Therefore:

> **Do not declare the channel dead because the first 100 produces zero sales.**

At that stage, positive replies and substantive conversations carry more signal
than wins alone.

Likewise, one or two wins in the first 100 are encouraging but do not prove the
long-term sale rate. Preserve uncertainty and keep accumulating comparable
observations.

---

## 6. Evolve scoring toward purchase propensity

The long-term goal is not to identify the worst websites. It is to identify
businesses where a meaningful problem, commercial value, and realistic buying
capacity overlap.

A useful future model is:

> **Pain x Value x Buyability**

### Pain

Examples already measurable or closely related to current evidence:

- booking or transactional problems
- accessibility failures
- search or rendering visibility problems
- AI-assistant visibility problems
- performance defects

### Value

Potential future signals, only where they are reliable and useful:

- importance of direct booking
- hotel size or capacity
- site complexity
- commercial importance of the website
- multi-property account potential

### Buyability

Potential future signals:

- commercial positioning
- capacity
- decision structure
- evidence of investment in the digital property
- later, observed response and purchase history for comparable prospects

Do not add speculative weights before outcomes exist. The first campaign should
determine whether the current score predicts real responses. Later versions
should be justified by measured outcomes, not intuition.

---

## 7. Build a deliberate reply-to-sale process

The largest conversion opportunity after launch may be what happens after a
prospect replies.

Recommended response categories:

- interested or wants details
- asks what was found
- price objection
- already works with an agency or provider
- timing objection or not now
- wrong recipient but willing to redirect

A useful commercial flow is:

`positive reply -> concise human response -> short substantive conversation where useful -> clear offer -> purchase`

Keep the offer simple and consistent with the canonical offer rules:

- fixed published price
- clear deliverable
- no improvised risk-band pricing
- simple purchase path

Record objection categories. If positive replies are healthy but sales are
weak, the problem is probably downstream of initial targeting and should be
investigated there before changing the cold email.

---

## 8. Turn early customers into proof

The first successful customers are strategically worth more than their invoice
value because they can reduce the trust problem for later prospects.

With customer permission, collect material that can become credible proof:

- meaningful findings before remediation
- what the client corrected
- what a re-audit verified
- measurable technical improvements where supportable
- a short testimonial
- referral willingness

Avoid unsupported revenue attribution or return-on-investment claims.

Treat the first strong case study as a major commercial milestone. When one goes
live, record the campaign version and date so later conversion can be compared
with the pre-case-study baseline rather than blended together.

---

## 9. Consider account expansion after the baseline

Some hotels may belong to groups, collections, management companies, or legal
entities controlling multiple properties.

After the baseline experiment, consider identifying whether one successful
account could expand to additional eligible domains.

The first contact should remain specific to the scanned property. Portfolio
potential matters after engagement and may eventually become an account-priority
input if it can be sourced reliably.

Measure group expansion separately from first-sale conversion so it does not
inflate the apparent cold-outreach close rate.

---

## 10. Optimize the preview only after outcome data exists

The email earns attention. The prospect-specific preview does much of the proof
work.

Keep current preview evidence selection stable during the baseline. Later,
measure whether certain proof categories correlate more strongly with positive
replies, substantive conversations, and purchases.

Commercially salient findings may eventually deserve different weighting from
findings that are technically severe but difficult for a buyer to understand.
That is a hypothesis to test, not a reason to change the current ranking before
results exist.

Desired feedback loop:

`scanner -> evidence -> preview -> outreach -> commercial outcome -> better evidence ranking`

---

## 11. Test the agency or auditor channel separately

Run a small number of exploratory conversations with accessibility specialists,
auditors, or web agencies.

Do not build a reseller product first. Ask:

- how they perform automated discovery today
- what they trust or distrust in automated tooling
- what output would save meaningful manual time
- how they would want to use or buy the product

A partner with recurring client demand may have much higher lifetime value than
a single direct sale.

Keep this experiment analytically separate from the first direct-hotel campaign.
Partner conversations and partner revenue should not be counted as hotel
outreach replies or direct-outbound wins.

---

## 12. Sending ramp recommendation

Once the sending setup is genuinely ready, use a learning-oriented progression
rather than jumping directly to maximum volume:

- first 10 prospects: about 3 new prospects per working day
- next 20: about 5 to 6 per working day if results are operationally clean
- next 30: about 8 per working day if results remain clean
- thereafter: work toward about 10 per working day only when due follow-ups and
  the total daily ceiling leave room

Do not accelerate purely to reach a calendar quota.

The ramp is an operating suggestion, not a replacement for the canonical
rollout gates or mailbox limits.

---

## 13. Commercial health metrics

The canonical rollout rules own safety stops such as bounce and mailbox
reputation limits. This table is a **commercial interpretation aid**, not a new
operating policy.

| Metric | Warning | Healthy | Excellent |
| --- | ---: | ---: | ---: |
| Hard bounce | >=2% | <2% | <1% |
| Any reply | <3% | 5 to 8% | 10%+ |
| Positive reply | <0.5% | 1 to 2% | 3%+ |
| Sale / delivered first touch | <0.2% | ~0.5% | ~1%+ |

These are directional planning bands. Odysseus's own observed funnel should
become more important than generic benchmarks as the sample grows.

Raw reply rate is not enough. A high reply rate dominated by negative responses
is not a healthy campaign.

---

## 14. Diagnose the bottleneck before changing the system

When results arrive, improve the stage that is actually weak.

| Observed pattern | Most likely area to investigate first |
| --- | --- |
| High bounce or delivery problems | contact quality, mailbox health, operating process |
| Low replies across all score bands | targeting, relevance, subject/first-touch proposition |
| Replies concentrated in high-ranked prospects | scoring is probably adding value |
| Replies unrelated to score/rank | scoring model may not predict commercial interest |
| Healthy replies but few positive replies | proof, offer relevance, target selection |
| Healthy positive replies but few conversations | human response process, trust, friction |
| Healthy conversations but few sales | offer clarity, proof, price/value perception, buying process |
| Sales but weak repeat/re-audit behavior | delivered value, remediation usefulness, follow-through |

Do not solve a downstream sales problem by increasing top-of-funnel volume.
Do not solve a targeting problem by repeatedly rewriting an email that already
earns attention from the wrong prospects.

---

## 15. Review checkpoints

### First 10

Purpose: operational and qualitative validation.

Review:

- delivery problems
- evidence quality
- weak or confusing proof
- wrong-match problems
- unexpected objections

Do not infer conversion rates from 10 prospects.

### First 100

Purpose: establish the first useful baseline.

Questions:

1. Does score or rank predict reply quality?
2. Which proof categories appear in positive outcomes?
3. Where do positive replies fail to progress?
4. Are objections mostly about trust, relevance, price, timing, or product
   scope?
5. Should the scoring model be kept unchanged for the next cohort or is there a
   clear measured reason to revise it?

Treat sales count as highly uncertain at this sample size.

### First 300 delivered first touches

Purpose: begin evaluating commercial conversion rather than only reply quality.

Review:

- sale rate and its direction versus the original scenarios
- positive-reply close rate
- performance by rank band and major prospect segment
- whether a case study or proof asset changed conversion
- repeatable objection patterns

At roughly this point, zero sales would become substantially more concerning
than zero sales in the first 100, especially if positive replies are also weak.
The diagnosis should still use the full funnel rather than sales count alone.

### Three months

Review:

- sale rate by prospect segment
- reply-to-sale conversion
- revenue per delivered first touch
- case-study impact if available
- re-audit pipeline
- group or portfolio opportunities
- agency-channel evidence, kept separate from direct outreach

If a revised forecast is created, preserve the original forecast in section 1.

### Six months

Complete this table without rewriting the original forecast:

| Item | Original estimate | Actual | Variance |
| --- | ---: | ---: | ---: |
| Delivered first touches | based on actual activity |  |  |
| Any replies | not fixed in original forecast |  |  |
| Positive replies | not fixed in original forecast |  |  |
| Substantive conversations | not fixed in original forecast |  |  |
| Full-audit sales | section 1 |  |  |
| Full-audit revenue | section 1 |  |  |
| Sale rate | 0.2% / 0.5% / 1.0% scenarios |  |  |
| Revenue per delivered first touch | EUR 3.20 / 8.00 / 16.00 HT |  |  |
| Re-audits | excluded from forecast |  |  |
| Re-audit revenue | excluded from forecast |  |  |
| Referrals or inbound | excluded from forecast |  |  |
| Group expansion | excluded from forecast |  |  |
| Agency or partner revenue | excluded from forecast |  |  |

At that point, future planning should primarily use Odysseus's observed funnel
rather than generic assumptions.

---

## 16. Long-term commercial flywheel

The desired progression is:

`better prospect selection`

-> `better replies`

-> `first customers`

-> `case studies and proof`

-> `higher trust`

-> `higher conversion at the same volume`

-> `outcome-trained prospect scoring`

-> `re-audits`

-> `referrals`

-> `portfolio expansion`

-> `agency partnerships`

-> `inbound`

The strongest long-term moat is not the email copy. It is the combination of
technical scanning capability, disciplined prospect selection,
prospect-specific evidence, and proprietary outcome data showing which
businesses and findings actually convert into customers.

---

## 17. Practices not recommended as default growth levers

- multiplying inboxes just to increase volume
- automated high-volume sequencing
- generic AI-written personalization
- changing several campaign variables before establishing a baseline
- optimizing around open rate
- reducing price reflexively because cold prospects do not buy
- unsupported revenue-loss or return-on-investment claims
- adding more follow-ups without evidence that they improve outcomes
- treating one early win as proof of a stable conversion rate
- treating zero wins in the first 100 as proof that the channel failed

---

## 18. Preservation rule

Keep section 1 as the **pre-launch forecast snapshot**.

Do not rewrite its assumptions after results arrive. Record later forecasts and
campaign results separately, or add clearly dated actual-results sections, so
forecast accuracy can be evaluated honestly.

Strategy recommendations outside section 1 may evolve as evidence accumulates.
When they do, prefer a dated revision note or a new results/decision document
rather than silently making past recommendations look prescient.