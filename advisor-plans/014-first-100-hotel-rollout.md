# Plan 014: Run the controlled first 100 hotel sends and evaluate the model

> **Executor instructions**: This is an operator-controlled rollout, not a
> coding batch. Complete plan 013 and every preflight gate before touching a
> real prospect. Each real hotel scan requires current permission for that
> named site. Every send is manual. Update the index and session log daily.
>
> **Drift check (run first)**:
> `git diff --stat f7ef7cf..HEAD -- CLAUDE.md advisor-plans/README.md docs/outreach-rules.md docs/operator-obligations.md docs/obligation-basis.md docs/prospect-qualification.md docs/offer-positioning.md packages/interface/src/outreach packages/store/src/outreach* packages/site/app`
> Reconcile any drift before rollout; legal/product conflicts are STOP
> conditions, not copy choices.

## Status

- **Priority**: P2
- **Effort**: M engineering, at least 6 weeks calendar time
- **Risk**: HIGH
- **Depends on**: plans 001 through 013
- **Category**: direction
- **Planned at**: commit `f7ef7cf`, 2026-08-27

## Why this matters

The first campaign is an experiment, not a volume target. It must show whether
hotel brokenness scoring predicts replies and whether render-diff or
accessibility evidence is the stronger opener, without sacrificing domain
reputation, legal posture, or recipient trust. The stop rules are more valuable
than reaching 100 quickly.

## Current state

- Hotels are the operator-selected first vertical.
- Canonical sending is manual, plain text, maximum three touches, 20 to 30
  total daily operating volume after warmup, with role addresses only.
- `odysseusaudit.com` hosts previews; cold mail should use the separately
  approved sending domain. SPF, DKIM, DMARC, warmup, privacy, opt-out, and
  suppression must be live first.
- Current date is 2026-08-27. Canonical outreach guidance says not to land the
  first wave during the last week of August or first two weeks of September
  2026. Therefore no first-wave send occurs before 2026-09-15, and only after
  the warmup/preflight gates independently pass.
- The hotel-specific legal basis remains blocked while its source is secondary.
  Real touch copy must remain argument-A-only unless canonical legal review
  explicitly approves the deterministic facts block.

## Commands you will need

| Purpose | Command/record | Expected on success |
| --- | --- | --- |
| Code validation | `pnpm run check` | exit 0 on rollout commit |
| Full tests | `pnpm run test` | all pass or only explicitly accepted pre-existing baseline failures |
| Candidate dry run | approved private CLI `outreach ... --dry-run` from plans 011/012 | zero provider writes |
| Daily reconciliation | approved private `outreach sync` command | no ambiguous threads before drafting due follow-ups |
| Analysis | versioned aggregate export created by plan 012 | counts reconcile to 100 first touches and contain no raw addresses/bodies |

## Scope

**In scope**:

- Operational runbook/checklists under the canonical M9 documentation area
- Synthetic end-to-end rehearsal
- An explicitly authorized 10-hotel pilot, then gated cohorts totaling at most
  100 manually sent E1 messages
- Deterministic 50/50 evidence-variant assignment
- Daily bounce/reply/preview-load (if lawfully available) monitoring
- Manual thread review, categorical outcomes, and final aggregate analysis
- Score/evidence version recommendation after results

**Out of scope**:

- Automatic sending, bursts, sequencers, volume above warmup gates, or changing
  thresholds mid-cohort
- Live scanning of any unnamed/unapproved hotel
- Named/free-mail contacts, phone prospecting, tracking pixels, cookies, or
  new analytics scripts
- Population claims, legal conclusions, unapproved hotel legal wording, or
  penalty language
- Restaurants, e-commerce expansion, vendors, or a second campaign vertical
- Treating preview loads as a placement metric if plan 009 could not collect
  them under the approved privacy design

## Git workflow

- Work directly on `main`; do not create another branch.
- Commit only durable runbook or aggregate-analysis code/document changes with
  imperative messages. Daily campaign data belongs in the private 90-day store,
  not committed Markdown.
- Do not push/deploy/provision or send without the operator's explicit action at
  each relevant external gate.

## Steps

### Step 1: Close every launch gate

Record pass/fail and evidence owner for:

- plans 001 through 013 `DONE`, code validation recorded
- approved Atout France source contract, exact Sirene join provenance,
  and a reconciled ambiguity report
- verified three-to-five-star eligibility for every selected hotel, with lower
  and unknown ratings parked
- measured usable-own-domain yield in the 8,000 to 15,000 target, or the
  approved conditional Overpass adapter completed and yield remeasured
- approved `hotel-outreach-v1` score calibration
- preview 200/410/revoke/noindex/robots and privacy-safe log behavior
- privacy, opt-out, bot, identity, postal/SIRET, and legitimate-interest review
- role-address-only and permanent suppression tests
- sending domain separation, two approved mailboxes if used, SPF, DKIM, DMARC,
  monitored replies, real signatures, and completed warmup schedule
- Gmail adapter static proof of no send capability
- legal-copy gate: approved deterministic block or explicit argument-A-only
  rollout decision reconciled in canonical docs
- date no earlier than 2026-09-15 and no competing operator blackout

**Verify**: no row is unknown or waived verbally. Any failed row blocks rollout.

### Step 2: Rehearse the full path with synthetic data

Use a local synthetic hotel fixture and operator-owned test mailboxes. Run
source enrichment, prescan fixture, scoring, preview publish/load/revoke, E1/E2/
E3 generation, Gmail draft create/delete, simulated manual send metadata,
reply, objection, suppression, and outcome aggregation. No third-party site or
recipient is involved.

**Verify**: all expected states appear once, suppressed state blocks another
draft, revoked preview is unavailable, no provider send call occurs, and all
operational records expire by policy.

### Step 3: Freeze the experiment before selecting hotels

Define two E1 variants that differ only in lead evidence:

- A: render-diff/revenue visibility
- B: one reproducible accessibility/transaction failure

Assign variant by a deterministic hash of campaign version plus prospect ID,
balanced to 50/50 before sending. Freeze score, prompt, facts, preview, subject
rules, mailboxes, follow-up spacing, and outcome definitions for the first 100.
Pre-register primary questions:

1. Does brokenness score rank reply probability?
2. Does A or B produce more replies?

Do not optimize from opens or replies mid-test except to stop for safety.

**Verify**: a versioned campaign record shows exactly one assignment per
candidate and near-even groups, with no operator cherry-picking.

### Step 4: Run an authorized 10-hotel pilot

List 10 named candidate domains and obtain current explicit scan permission for
those exact sites. Run the bounded prescan, then manually inspect every source
join, page role, finding, crop/render evidence, preview, subject, body,
disclosure, address, and suppression result. Create drafts. The operator sends
each manually at non-burst intervals only after individual approval.

Pause the pilot immediately for any wrong establishment match, invented/weak
evidence, legal/prohibited phrase, broken opt-out, preview leak/expiry error,
hard bounce, spam complaint, provider warning, or unexpected send capability.

**Verify**: 10 review checklists and provider sent metadata reconcile exactly;
zero automatic sends and zero unresolved review items.

### Step 5: Ramp through explicit cohorts, not a timer

After the pilot observation window, proceed in bounded cohorts such as 10, 20,
30, and 30 first touches. At each gate:

- reconcile replies before creating follow-ups
- verify hard bounce rate remains below 2 percent
- inspect complaints/provider reputation and stop on any degradation
- if approved preview-load measurement exists, require at least 10 percent;
  otherwise omit this gate and record the metric unavailable
- manually review every draft and keep total daily volume within the warmed
  mailbox ceiling, including follow-ups
- never accelerate just to reach 100

If a gate fails, pause, suppress affected records, diagnose list/copy/provider
quality, and resume only from the prior safe volume after operator approval.

**Verify**: signed daily counters reconcile first touches, follow-ups, replies,
bounces, objections, active drafts, and sent provider metadata.

### Step 6: Close every thread correctly

Use plan 012 to create due E2/E3 drafts only after mailbox sync and suppression
checks. Review and send manually. Record categorical outcomes. Revoke previews
and suppress immediately on objection; suppress completed no-reply sequences;
stop after three touches. No phone action belongs to this plan.

**Verify**: no thread exceeds three sent messages, no follow-up follows a reply
or suppression, all objections are hash-suppressed and previews revoked, and no
overdue ambiguous thread has a draft.

### Step 7: Analyze the first 100 without leaking recipient data

Freeze the dataset at 100 sent E1s plus the agreed response window. Export only
aggregates and pseudonymous rank data needed for analysis. Report:

- deliverability: hard-bounce count/rate, objections, complaints if available
- funnel: preview-loaded boolean if approved, replies, positive/not-now/
  negative, calls, quotes, won/lost
- reply rate by brokenness decile and ability half
- A versus B reply/outcome difference with sample sizes and uncertainty
- mismatch/scan/evidence rejection rates and common reason codes
- score/version and prompt/version for every cohort

With 100 sends, avoid causal certainty. Recommend keep, tighten, revise, or
retire the score based on direction and operational evidence. Do not add more
features to rescue a score that does not rank replies.

**Verify**: totals reconcile to provider/thread state; report contains no raw
address, token, message body, exact private URL, or unapproved population/legal
claim; canonical M9 status and next decision are updated.

## Test plan

- Run code checks before synthetic rehearsal and before the pilot.
- Complete one synthetic state-machine rehearsal.
- Human-review all 10 pilot previews/drafts and every later send draft.
- Reconcile mailbox/provider state daily and before every follow-up batch.
- Maintain a written stop log even when the result is "no stop triggered".
- Have a second human/legal reviewer inspect disclosures and any argument B
  before first real send.

## Done criteria

- [ ] All launch gates passed and first wave began no earlier than 2026-09-15.
- [ ] Every scanned hotel had current named-site authorization.
- [ ] Exactly 100 E1 messages were manually reviewed and manually sent, or the
  campaign stopped early with the safety reason documented.
- [ ] Hard bounces stayed below 2 percent; any complaint/provider degradation
  caused an immediate pause.
- [ ] No suppressed/replied recipient received a later draft or send.
- [ ] No thread exceeded three touches and no automatic send occurred.
- [ ] Aggregate analysis answers the two pre-registered questions without raw
  recipient data.
- [ ] Canonical docs record the score/evidence decision and next milestone.
- [ ] Plan 014 is `DONE` or `BLOCKED: <safety reason>` in the index.

## STOP conditions

Stop for any incomplete plan/deployment/legal gate; pre-2026-09-15 launch;
unnamed-site scan permission; source match ambiguity; unapproved legal copy;
missing role address/disclosure/opt-out; preview/security/expiry failure;
automatic send capability; bounce rate at or above 2 percent; complaint or
provider reputation warning; suppression/reply race; or metrics requiring new
tracking. Do not work around a stop to reach 100.

## Maintenance notes

Preserve campaign, score, evidence, prompt, and disclosure versions so later
cohorts are comparable. The next vertical is a product decision after this
analysis, not an automatic expansion. Delete operational raw data by 90 days
while retaining only lawful aggregate learnings and permanent suppression
hashes.
