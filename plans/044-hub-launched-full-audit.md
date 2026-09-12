# Plan 044: launch a paid full audit from the hotel hub, linked to the hotel

> **Executor instructions**: Follow this plan slice by slice. Run every
> verification command and confirm the expected result before moving to the
> next slice. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When a slice lands, update this plan's status row
> in `plans/README.md`.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MEDIUM. Touches a fingerprinted core type
  (`OutreachAuthorizationSource` gains a value) - the known two-test
  fingerprint ratchet applies and is resolved in-slice by the documented
  bump-and-restamp procedure. The paid audit must never be gated by the
  prospecting scan gate.
- **Depends on**: 042 (hub Audit tab + picker), 043 (roster precedent for
  recorded context)
- **Category**: dashboard, prospecting, sales
- **Planned at**: commit `e954668`, 2026-09-12
- **Issue**: none; operator-requested 2026-09-12 ("it's only logical")
  after learning a paid full audit could only be launched from
  `/scans/new` with no hotel linkage.

## Why this matters

A prospecting audit is the full audit's first stage, deliberately stopped
before the analysis and report. When a hotel buys, the deliverable path is
a fresh full-audit job ("a paid purchase always runs a fresh full-audit
job", run-outreach-full-scan-job.ts) launched from `/scans/new` - a page
unconnected to the hotel, producing an audit unconnected to the hotel. The
operator must remember a bare URL, and the resulting audit never appears in
the hotel's hub. The hub gains the launch point, and the audit carries the
hotel link so the hub's picker shows it.

## Binding decisions

1. **Prospect-scoped route, plan-037 shape.** `POST
   /api/prospects/:candidateId/full-audit` mints the `full-audit` job; the
   candidate id comes from the URL, the site from the candidate's own
   registrable domain (https://domain, same as the outreach scan). The
   public `/api/scans` whitelist stays untouched.
2. **A new authorization source value, `paid`.** `OutreachAuthorizationSource`
   gains `'paid'`: the operator's own decision to produce a deliverable for
   this candidate. The `outreach` stamp keeps meaning "why does this audit
   exist for this candidate"; `cohortId`/`scoringVersion` ride along as
   recorded context (the newest cohort at launch, the same
   context-not-claim rule the wave roster documents). No cohort ever
   recorded is a refusal (`no-cohort`), with the remedy in the sentence:
   run the selection once.
3. **No scan gate for the paid audit.** Selection, qualification currency,
   and wave membership do not gate a paid job - it is the operator's
   billable decision. Suppression does not gate it either (suppression
   governs contact, not the operator's own audit of a site), and no
   outreach action (preview, drafts) becomes available through it: those
   keep their own gates. One duplicate guard applies: no second browser
   scan of the same hostname while one is queued or running
   (`findActiveScanJobForHost`, refusal `already-in-flight`).
4. **The runner stamps, the stage stays generic.** `run-full-audit-job.ts`
   passes `outreachContext` when the job carries candidate options;
   `runAuditStage` is unchanged. Claim-time re-authorization does not apply
   (nothing to re-authorize for `paid`), but the context values themselves
   come from the job options snapshot exactly as persisted at creation.
5. **The picker needs no change.** `listOutreachAudits` queries
   `outreach.candidateId`; a stamped paid audit appears newest-first with
   `jobType: 'full-audit'`, already labelled. Consequence, accepted: the
   hotel's newest outreach-linked audit becomes the paid one, so preview
   publication (`resolveOutreachAuditForCandidate`) will prefer it - a
   fresher audit is the better preview source.

## What this plan does not do

- No change to `planOutreachFullScan`, the prospecting scan, the preview
  gate, or any draft/email path.
- No automatic launching: the operator clicks; the audit runs; nothing
  chains analysis or reports onto it automatically - the paid chain stays
  the stepper's five operator-driven steps.
- No new page; the launch lives on the hub's Audit tab.

## Slice 1: core, store, route

**Landed 2026-09-12 by ZCode.** `OutreachAuthorizationSource` gained
`'paid'` with updated doc comments; `NORMALIZATION_FINGERPRINT` bumped to
`09d5e8d4d9d6033f` and every committed fixture stamped file updated (one
textual line each). `run-full-audit-job.ts` builds `outreachContext` from
the job's four outreach options when a candidate link is present, failing
loudly on an incomplete link, and passes it to the unchanged audit stage.
`POST /api/prospects/:candidateId/full-audit` implements the planned
refusals; one implementation correction: the schema returns `null` (not
`undefined`) for a missing own domain, so the refusal check is
`!domain`. Route tests cover success shape, refusals, and 404; runner
tests cover the stamp and the incomplete-link failure. The two
fingerprint-ratchet tests are green for the first time since plan 041
Part B.

- `manifest.ts`: `OutreachAuthorizationSource` gains `'paid'`; doc comments
  updated (the stamp is present on candidate-linked audits; prospecting
  scans by cohort or roster, hub-launched paid audits by the operator).
- Fingerprint bump: recompute the source fingerprint, update
  `NORMALIZATION_FINGERPRINT`, restamp the committed test-audits'
  `normalizationFingerprint` lines (one textual line each, the
  stream-G/2322c29 procedure; `fixtures:refresh` only covers absent
  artifacts dirs). The two pre-existing fingerprint reds go green.
- `run-full-audit-job.ts`: when `options.outreachCandidateId` is present,
  validate the source value and pass `outreachContext` to the audit stage.
- `POST /api/prospects/:candidateId/full-audit`: 404 unknown candidate;
  200 `{ started: false, refusal }` for `no-own-domain`, `no-cohort`,
  `already-in-flight`; 201 `{ started: true, jobId }` otherwise. Job:
  `type: 'full-audit'`, `siteUrl: https://<domain>`, options carrying the
  four outreach fields with `outreachAuthorizedBy: 'paid'`.
- Route tests: success shape, each refusal, the job options as persisted.

## Slice 2: the hub's launch control

**Landed 2026-09-12 by ZCode.** The Audit tab's action row gained "Lancer
un audit complet" beside "Ouvrir l'audit"; the confirm dialog states the
fresh crawl and that the paid chain is then driven from the audit page.
Success toasts and navigates to `/scans/:jobId`; refusals map to
sentences under `hub.audit.launchRefusals`. FR/EN structural parity;
render test covers tab-switch, dialog, and the posted route.

- Audit tab, beside "Ouvrir l'audit": "Lancer un audit complet" with a
  confirm dialog stating the fresh crawl and that the paid chain
  (analyse, rapport, approbation) is then driven from the audit page.
- On 201, toast + navigate to `/scans/:jobId` (the outreach scan
  precedent). On refusal, the mapped sentence.
- FR/EN strings under `hub.audit`; render tests (button, dialog, posted
  job, refusal sentence); axe clean.

## Whole-plan landing state (2026-09-12)

- Committed on main; no operator push/deploy order yet for this plan.
- No STOP condition occurred: no gate beyond the duplicate-scan guard, no
  prospecting/preview gate change, no stamping of unlinked audits.
- `pnpm run check` fully clean; the ENTIRE unit suite green for the first
  time since plan 041 Part B - 4,027 passed, 0 failed (the fingerprint
  restamp fixed the two pre-existing reds, and the separately-tracked
  `outils` prefix gap landed its one-line fix in the same session).
- The manual pass (launch a paid audit from a hub on the deployed
  dashboard, watch it complete, see it labelled "Audit complet" in the
  picker) is the acceptance gate, pending a deploy order.

## Verification for the whole plan

- `findings-provenance.test.ts` and `fixture-freshness.test.ts` green
  (first time since plan 041 Part B).
- Narrowest suites + `pnpm run check` + interface suite (only the
  `app-routes.test.ts` red remaining, tracked separately).
- Manual: launch a paid audit from a hub on the deployed dashboard, watch
  it complete, see it in the picker labelled "Audit complet".

## STOP conditions

1. Any gate appearing on the paid launch beyond the duplicate-scan guard.
2. Any change to the prospecting scan or preview gates.
3. The stamping of `outreach` on audits with no candidate link.
4. Locked contracts touched.
