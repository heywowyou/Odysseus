# First-100 rollout runbook (plan 014)

Operational record for
[plan 014](../../plans/archive/014-first-100-hotel-rollout.md), opened 2026-09-08.
Plan 014 owns the rules; this runbook owns the recorded evidence: the Step 1
launch-gate table, the drift reconciliation, and the operator decision list.
Nothing here overrides the plan. Status values for gates: `PASS` (evidence
recorded), `OPEN` (operator decision or action pending), `PENDING`
(verification queued).

## Step 0: drift check, reconciled 2026-09-08

The plan's drift command over `f7ef7cf..HEAD` reports 65 files,
+12,396/-287. Reconciliation verdict: **RECONCILABLE, no STOP condition**.
The entire diff is shipped plan work (007 through 013, 016, 030, 031) plus
the rules documents authored after the plan was written; nothing weakens the
plan's constraints. Verified holds:

- No send capability: `gmail-draft-adapter.ts` has a frozen endpoint table
  (draft create/get/delete, thread get only) and scopes exactly
  `gmail.compose` plus `gmail.metadata`; `mailbox-draft-adapter.ts` exposes
  four methods and `FORBIDDEN_MAILBOX_CAPABILITIES` is asserted by test.
- Suppression is checked immediately before every provider draft operation
  (`create-outreach-draft.ts`, `create-follow-up-draft.ts`, both pre- and
  post-generation, recording `suppressed-before-provider`).
- Role addresses only: drafts refuse any contact not in `found` state
  (allowlist plus MX confirmed); no draft path accepts a caller-supplied
  recipient address.
- Preview privacy: `/apercu/` disallowed in robots.txt, `x-robots-tag`
  noindex on the route, token never logged by the site code (hosting-log
  controls: outreach-rules section 6bis), prohibited-content detector over
  preview and linted draft body, no tracking scripts anywhere in
  `packages/site/app`.
- Deterministic legal text: the touch-3 facts block is spliced in code with
  byte-identity verification; the model never assembles it.

Carry-forward notes from the reconciliation:

1. `docs/rules/obligation-basis.md` still says the first outreach wave
   targets unambiguous e-commerce. Stale against the hotel-first decision;
   amended 2026-09-08 by the operator ruling (decision log).
2. `docs/decisions/trade-offs.md`, 9c milestone note, says hotel-specific
   legal material cannot enter a real draft until it reaches `primary`
   status, while `obligation-basis.md` has since upgraded hotels to
   `secondary` and permits the argument-B facts block. Resolved by the
   operator ruling of 2026-09-08: `obligation-basis.md` governs, recorded
   as an explicit supersession note in that document (decision log).
3. Volume ceiling: `outreach-rules.md` section 8 allows 20 to 40 per day per
   warmed mailbox; plan 014 caps total daily operating volume at 20 to 30
   including follow-ups. The tighter plan 014 bound governs.
4. Draft-body lint allows links to any `odysseusaudit.*` domain
   (`draft-body-lint.ts`). When the sending domain moves to `.fr`, pin the
   allowlist deliberately rather than by wildcard accident.

## Step 1: launch gates, recorded 2026-09-08

| # | Gate | Status | Evidence and owner |
| --- | --- | --- | --- |
| A | Plans 001-013 `DONE`, code validation | PASS | Index rows all `DONE`. `pnpm run check` exit 0, unit suite 3,565 passed / 236 skipped, store suite green (2026-09-08). Owner: ZCode session log. |
| B | Atout France contract, Sirene join provenance, reconciled ambiguity report | PASS by record | Measured source facts and the 187-item manual-review queue recorded in `plans/archive/9c-plans-index-history.md`. Owner: re-pull the current ambiguity queue immediately before cohort selection (Step 3). |
| C | Verified 3-5 star eligibility, lower and unknown parked | PASS by record | Hard gate in the identity and qualification path; 3,536 parked `below-three-stars` measured. Re-checked per hotel at prescan review. |
| D | Usable own-domain yield 8,000-15,000, or approved Overpass | PASS (waived) | Measured v2 yield is 5,995, below the 8,000 floor. Waived by the operator on 2026-09-08 with reference to the recorded 2026-08-27 Overpass deferral (`plans/README.md`, "Explicitly deferred"): the floor was set against a national-campaign target, and 5,995 supports the first-100 experiment many times over. |
| E | `hotel-outreach-v2` score calibration approved and cohort selected | PASS | Plan 034 complete 2026-09-08: `hotel-outreach-v2` approved by the operator; scored one domain at a time for the 119 approved-and-scanned candidates (110 unapproved incident candidates excluded, verified unreachable by cohort selection); v1-to-v2 diff reviewed by the operator; `prospect score select` recorded cohort `3b5c6b0c-6d93-4c51-bdf8-3b78449d9baa`, 6 hotels. Full detail: `plans/archive/034-hotel-outreach-v2-booking-detection.md`. |
| F | Preview 200/410/revoke/noindex/robots, privacy-safe logs | PASS | Suite covers publish, expiry, revoke, and log behavior. Live probe 2026-09-08 against `www.odysseusaudit.com`: robots.txt `Disallow: /apercu/`; unknown token returns 404 with `x-robots-tag: noindex, nofollow, noarchive`, `cache-control: private, no-store`, `referrer-policy: no-referrer`, CSP `default-src 'none'`. |
| G | Privacy, opt-out, bot, identity, postal/SIRET, legitimate-interest review | PASS | Pages are live (`confidentialite-prospection`, `desinscription`, `bot`, `offre`). Review pass completed by the second reviewer, reported by the operator 2026-09-10. |
| H | Role-address-only and permanent suppression tests | PASS | Suite green 2026-09-08: allowlist and MX tests for role addresses, suppression-gate tests on both draft paths. |
| I | SPF/DKIM/DMARC, monitored replies, warmup complete | OPEN (warmup in progress) | Sending domain separation did not happen as originally specified: confirmed 2026-09-12 that `contact@odysseusaudit.fr` is a Workspace alias on the same inbox as `contact@odysseusaudit.com`, not a second mailbox, so `.fr` and `.com` share one reputation. Accepted by the operator as a deliberate trade-off (trade-off 86), not reopened as a provisioning gap. Warmup is running via MailReach (SMTP/IMAP plus Gmail domain-wide delegation), started 2026-09-12 on `contact@odysseusaudit.com`; the `.fr` alias inherits the same warmup. Sender switched 2026-09-11: `ODYSSEUS_MAILBOX_SENDER_ADDRESS` is `contact@odysseusaudit.fr`, and drafting refuses any other value (trade-off 82). Gate closes on evidence: SPF, DKIM and DMARC verified, warmup reported complete (not just begun). Owner: operator provisioning; agent verifies and records. |
| J | Gmail adapter static proof of no send capability | PASS | Frozen endpoint table and scope list re-read 2026-09-08; forbidden-capability assertion in `mailbox-draft-adapter.test.ts`. |
| K | Date no earlier than 2026-09-15, no competing blackout | PASS | No send is possible before 2026-09-15 under any path. Operator confirmed 2026-09-08 no competing blackout is anticipated; reconfirm at actual scheduling if the date slips. |
| L | Legal-copy gate: approved deterministic block, or argument-A-only, reconciled in canonical docs | PASS | Ruled 2026-09-08: `obligation-basis.md` governs; hotels at `secondary` status may receive the deterministic argument-B facts block from the first send, superseding the trade-offs 9c note's primary-status requirement; the stale e-commerce sentence in `obligation-basis.md` is amended accordingly. Second human reviewer named and disclosure/argument-B review completed, reported by the operator 2026-09-10. |

Reconciliation rule: no gate is waived verbally. Each OPEN gate gets its
ruling recorded in the decision log below before the pilot starts.

## Remaining operator items

1. Confirm SPF/DKIM/DMARC verified and let MailReach warmup on
   `contact@odysseusaudit.com` run to completion (the `.fr` alias shares its
   reputation, trade-off 86); the wave-timing decision is taken, the
   execution is operator-side (gate I).
2. Name the second human reviewer for disclosures and argument-B copy, and
   schedule the privacy and legitimate-interest review pass with them
   (gates L and G): **done, reported by the operator 2026-09-10.**
3. Confirm no competing blackout when the wave is scheduled (gate K).
4. Scan permission for all 10 named pilot domains: **granted 2026-09-08.**
   The leftover plan 030 manual real-hotel dashboard pass is still due before
   the pilot.

## Pilot domain list (plan 014 Step 4), identified 2026-09-08

The `hotel-outreach-v2` cohort algorithm (`selectOutreachCohort`: top ability
half, then top brokenness decile within it) produced exactly 6 hotels for the
110-hotel eligible population - a formula result, not a shortfall. The
operator directed extending to 10 named domains by continuing the same
ranking (ability-half population, ordered by brokenness) past the decile
cutoff, verified by rerunning the real selection pipeline read-only and
confirming ranks 1-6 match the recorded cohort exactly:

| Rank | Domain | In recorded cohort `3b5c6b0c-...`? |
| --- | --- | --- |
| 1 | lescorderies.com | yes |
| 2 | hotelplatdetain.com | yes |
| 3 | hotel-espace-champerret.com | yes |
| 4 | belleval-hotel-paris.com | yes |
| 5 | hotel-maitagaria.com | yes |
| 6 | hotelmontsegur.com | yes |
| 7 | hotel-joyet-maubec.com | no (extension) |
| 8 | hotelsaintpaulparis.com | no (extension) |
| 9 | hotel-national-lourdes.fr | no (extension) |
| 10 | hotel-lancaster.com | no (extension) |

Ranks 7-10 hold no `hotel-outreach-v2` cohort membership of record (the
`hotel_score_cohorts` document only stores selected/calibration rows, not
every ranked one) - they are pilot-only, identified for this rollout step,
not a second cohort selection run. Scan permission for all 10 was granted by
the operator 2026-09-08; item 4 above is closed. None of the 10 has actually
been scanned or contacted yet - the bounded prescan and manual review in plan
014 Step 4 are still to run.

## Decision log

| Date | Gate | Decision |
| --- | --- | --- |
| 2026-09-08 | Step 0 | Drift reconciled, RECONCILABLE, no STOP. |
| 2026-09-08 | I | Provision `odysseusaudit.fr` now; the first wave is sized to warmup state, full volume only after warmup completes. |
| 2026-09-08 | D | Yield gate waived, referencing the recorded 2026-08-27 Overpass deferral. |
| 2026-09-08 | E | `hotel-outreach-v1` weights confirmed unchanged for the campaign freeze. |
| 2026-09-08 | L | `obligation-basis.md` governs: the deterministic argument-B facts block is permitted for hotel drafts from the first send; the stale e-commerce sentence amended the same day. Reviewer name still owed. |
| 2026-09-08 | E | Pre-freeze score review, two agents over code and history: no weight's meaning changed in place; v1 kept for wave 1. Recorded carry-forwards: (1) the reserved `hotel-outreach-v2` trigger stands (re-source the 30-point direct-booking weight from prescan `bookingEvidenceKinds`; today it reads the weak href probe and 26 percent of the population scores 0-10 of 30 on detection weakness); (2) the 20-point `effectif` weight is constant zero for the whole population until the operator supplies the INSEE stock file for the offline `backfillSirene`, which is ranking-neutral because it shifts every ability score equally; (3) the worthiness gate's evidence-completeness input was deliberately redefined on 08-29 as a measured defect fix, before the cohort of record, so no action. Both deferred changes are revisited only after the first-100 analysis, per plan 006: the sends decide whether the score predicts replies. |
| 2026-09-08 | E (supersedes the row above) | The operator overturned the deferral: no deadline exists, and a recorded carry-forward is a deferral that gets lost. Direction: port the September audit-side booking-detection fixes into the prescan (v4) and ship `hotel-outreach-v2` before anything real runs. The effectif weight re-sources from Atout France size data instead of waiting on the INSEE stock file; measured the same day: room count and capacity are populated for 9,765 of 9,765 eligible rows, 100 percent. Plan 034 owns the work; the prescan's existing JS-aware transactional detection stays, the missing September pieces are ported. |
| 2026-09-08 | E | Plan 034 implementation completed: prescan v4 adds kinds-only unresolved-control and bounded redirect outcomes; `hotel-outreach-v2` is present and unapproved. No live prescan, rescore, score diff, selection, or approval was performed. |
| 2026-09-08 | E | Incident: the v4 prescan batch job (`dfcc1deb-...`) scanned 110 hotels never on the operator-approved 120-site list, via a restart that does not resume the original scope (root cause and full evidence: `docs/decisions/trade-offs.md#75`; residual defect tracked as issue #114). Operator decision: treat as an incident, not a data-destroying rollback. The 119 approved-and-scanned domains are the batch of record (true evidence-incomplete count 9, not the reported 2; 1 true failure, `hotel-victoria.fr`, no record). The 110 unapproved prescans stay stored for evidence but are excluded from `hotel-outreach-v2` scoring, the v1-to-v2 diff, and wave-1 cohort selection. Gate E remains OPEN; plan 034 continues from the corrected exceptions list. |
| 2026-09-08 | E | `hotel-victoria.fr` excluded (no retry). `hotel-outreach-v2` approved by the operator against the weight table itself. Scored one domain at a time for exactly the 119 approved domains (never a bulk run), so the 110 unapproved-scan candidates hold no v2 score and cannot enter cohort selection, which reads by version. The v1-to-v2 diff (120 v1 rows, 119 v2 rows) was reviewed by the operator, who approved proceeding. `prospect score select` recorded cohort `3b5c6b0c-6d93-4c51-bdf8-3b78449d9baa` (6 hotels). Gate E closes. Contact discovery and outreach drafting remain separately gated. |
| 2026-09-08 | Step 4 | Operator directed extending the pilot from the 6-hotel recorded cohort to plan 014's literal "10 named candidate domains" by continuing the same ability-half/brokenness ranking to rank 10 (list above). Scan permission for the 4 extension domains is still outstanding; nothing has been scanned under this designation. |
| 2026-09-08 | Step 4 | Operator granted current scan permission for all 10 pilot domains. |
| 2026-09-08 | I | Operator reports warmup phase 1 in progress on the new sending setup: low daily volume to known mailboxes, limited exchanges. Gate stays OPEN until SPF/DKIM/DMARC are verified and warmup is reported complete, not merely begun. |
| 2026-09-08 | K | Operator confirmed no competing blackout is anticipated for the eventual wave date. |
| 2026-09-10 | L, G | Second human reviewer named; disclosure/argument-B review and the privacy/legitimate-interest review pass both completed, reported by the operator. Gates L and G close. Remaining OPEN gate before pilot send: I (domain warmup, still early phase 1). |

## Standing operating rules (unchanged from the plan)

- Every send is manual. Maximum three touches per thread.
- Total daily operating volume at most 20 to 30 including follow-ups.
- Every scanned hotel needs current, explicit permission for that named site.
- Suppression is checked immediately before every provider draft operation.
- Operational records expire at 90 days; permanent suppression stores hashes
  only.
- A written stop log is maintained daily, including "no stop triggered"
  days. Stop conditions are listed in plan 014 and are never worked around.
