# First-100 rollout runbook (plan 014)

Operational record for
[plan 014](../../plans/014-first-100-hotel-rollout.md), opened 2026-09-08.
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
  noindex on the route, token never logged, prohibited-content detector over
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
| B | Atout France contract, Sirene join provenance, reconciled ambiguity report | PASS by record | Measured source facts and the 187-item manual-review queue recorded in `plans/README.md`. Owner: re-pull the current ambiguity queue immediately before cohort selection (Step 3). |
| C | Verified 3-5 star eligibility, lower and unknown parked | PASS by record | Hard gate in the identity and qualification path; 3,536 parked `below-three-stars` measured. Re-checked per hotel at prescan review. |
| D | Usable own-domain yield 8,000-15,000, or approved Overpass | PASS (waived) | Measured v2 yield is 5,995, below the 8,000 floor. Waived by the operator on 2026-09-08 with reference to the recorded 2026-08-27 Overpass deferral (`plans/README.md`, "Explicitly deferred"): the floor was set against a national-campaign target, and 5,995 supports the first-100 experiment many times over. |
| E | `hotel-outreach-v1` score calibration approved | PASS | Operator-approved weight table (trade-off 38), confirmed unchanged for the campaign freeze by the operator on 2026-09-08. Freezing it at Step 3 changes nothing. |
| F | Preview 200/410/revoke/noindex/robots, privacy-safe logs | PASS | Suite covers publish, expiry, revoke, and log behavior. Live probe 2026-09-08 against `www.odysseusaudit.com`: robots.txt `Disallow: /apercu/`; unknown token returns 404 with `x-robots-tag: noindex, nofollow, noarchive`, `cache-control: private, no-store`, `referrer-policy: no-referrer`, CSP `default-src 'none'`. |
| G | Privacy, opt-out, bot, identity, postal/SIRET, legitimate-interest review | OPEN | Pages are live (`confidentialite-prospection`, `desinscription`, `bot`, `offre`). Owner: the operator's recorded review pass; may be combined with gate L's reviewer. |
| H | Role-address-only and permanent suppression tests | PASS | Suite green 2026-09-08: allowlist and MX tests for role addresses, suppression-gate tests on both draft paths. |
| I | Sending domain separation, SPF/DKIM/DMARC, monitored replies, warmup complete | OPEN (provisioning pending) | Decision recorded 2026-09-08: provision `odysseusaudit.fr` now and size the first wave to warmup state, a reduced pilot at first, reaching the full 20 to 30 daily volume only after warmup completes. Interim sender `contact@odysseusaudit.com` remains a recorded knowing deviation (`outreach-rules.md` section 10) until the switch. Gate closes on evidence: SPF, DKIM and DMARC verified on `.fr`, warmup begun, and `ODYSSEUS_MAILBOX_SENDER_ADDRESS` repointed before the first real send. Owner: operator provisioning; agent verifies and records. |
| J | Gmail adapter static proof of no send capability | PASS | Frozen endpoint table and scope list re-read 2026-09-08; forbidden-capability assertion in `mailbox-draft-adapter.test.ts`. |
| K | Date no earlier than 2026-09-15, no competing blackout | PASS for now | No send is possible before 2026-09-15 under any path. Owner: operator confirms no competing blackout when the wave is scheduled. |
| L | Legal-copy gate: approved deterministic block, or argument-A-only, reconciled in canonical docs | OPEN (reviewer name pending) | Ruled 2026-09-08: `obligation-basis.md` governs; hotels at `secondary` status may receive the deterministic argument-B facts block from the first send, superseding the trade-offs 9c note's primary-status requirement; the stale e-commerce sentence in `obligation-basis.md` is amended accordingly. Still open before the first real send: name the second human reviewer and complete the disclosure review the plan's test section requires. |

Reconciliation rule: no gate is waived verbally. Each OPEN gate gets its
ruling recorded in the decision log below before the pilot starts.

## Remaining operator items

1. Provision `odysseusaudit.fr` (mailbox, SPF/DKIM/DMARC) and begin warmup;
   the wave-timing decision is taken, the execution is operator-side
   (gate I).
2. Name the second human reviewer for disclosures and argument-B copy, and
   schedule the privacy and legitimate-interest review pass with them
   (gates L and G).
3. Confirm no competing blackout when the wave is scheduled (gate K).
4. The 10 named pilot domains with current scan permission, plus the
   leftover plan 030 manual real-hotel dashboard pass, due before the
   pilot.

## Decision log

| Date | Gate | Decision |
| --- | --- | --- |
| 2026-09-08 | Step 0 | Drift reconciled, RECONCILABLE, no STOP. |
| 2026-09-08 | I | Provision `odysseusaudit.fr` now; the first wave is sized to warmup state, full volume only after warmup completes. |
| 2026-09-08 | D | Yield gate waived, referencing the recorded 2026-08-27 Overpass deferral. |
| 2026-09-08 | E | `hotel-outreach-v1` weights confirmed unchanged for the campaign freeze. |
| 2026-09-08 | L | `obligation-basis.md` governs: the deterministic argument-B facts block is permitted for hotel drafts from the first send; the stale e-commerce sentence amended the same day. Reviewer name still owed. |

## Standing operating rules (unchanged from the plan)

- Every send is manual. Maximum three touches per thread.
- Total daily operating volume at most 20 to 30 including follow-ups.
- Every scanned hotel needs current, explicit permission for that named site.
- Suppression is checked immediately before every provider draft operation.
- Operational records expire at 90 days; permanent suppression stores hashes
  only.
- A written stop log is maintained daily, including "no stop triggered"
  days. Stop conditions are listed in plan 014 and are never worked around.
