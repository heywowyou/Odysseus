# Plan 045: remove dead ends and gates from the operator dashboard

## Context

The operator cannot finish core jobs on their own dashboard. Four layout
plans (040, 042, 043, 044) shipped this week without touching the real
problem: dead ends and procedural gates. Verified against code and the
production database (`test`) on 2026-09-12 at `ab96bd5`:

1. **Confirmed fields, still no PDF.** Hôtel Belleval (`809b5e87`, today
   20:23): both identity fields already confirmed by the operator, FR+EN
   analyses present, zero reports, job still `needs-input`. The dashboard's
   "produce" step is enabled only when a writing candidate was approved or
   report rows already exist (`dashboard/routes/audit-detail-model.ts:476-500`),
   and a disabled step renders no button (`audit-report-stepper.tsx:362`).
   The server (`POST /api/audits/:id/regenerate-report`, `routes/audits.ts:600`)
   would accept it: `resolveSelectedAnalysisPair` falls back to the latest pair.
2. **Stale findings make old audits unreportable.** The findings fingerprint
   changed six times this week; only 3 of 22 production audits match
   `NORMALIZATION_FINGERPRINT` (`09d5e8d4d9d6033f`). Report and writing stages
   fail closed (trade-off 40, `report-stage.ts:94`, `analysis-stage.ts:239`) and
   the dashboard has no way to re-normalize (CLI only). Les Flots Bleus
   (`a7ad846f`, `6ac1b7aa`) hits this and the identity gate.
3. **Detected cover names are junk** ("Site Officiel", "→ Les Flots Bleus ·
   Hôtel Var, Lavandou", raison sociale "O2SWITCH" = the web host), so the
   identity gate fires on nearly every audit.
4. **No audit → hotel link** except the word "Prospects", and only for audits
   launched from the hub (`audit-detail.tsx:191-198`).
5. **No manual email.** No input, no write route; rules forbid it; the email
   always says the address came from the hotel's website.
6. **Reload breaks the first email.** The preview token lives only in page
   memory (`prospect-detail.tsx:222-223`); only its hash is stored. Production
   has never created a single draft (`outreach_drafts` is empty), and draft
   creation still requires prescan evidence (`findDraftRow`,
   `mongo-outreach-draft-store.ts:53`), a likely further dead end.
7. **Ceremony:** warning acknowledgement + cost checkbox before writing, a
   candidate preview/approve step, 9 confirmation dialogs, hidden (not greyed)
   controls, the report tab hidden until a hotel is marked sold.
8. **The UX audit skill missed all of this** because it never performs an
   action, and it is installed only under `.agents/skills/`.

Outcome: every core job completes from the dashboard in as few clicks as the
real constraints allow, with nothing hidden.

## Operator decisions (2026-09-12, binding)

- Three stages, each shipping working on its own: unblock, cut gates, shrink.
- **Keep:** cover identity confirmation (inline Confirm per field, PDFs then
  generate automatically); approval over both digests before client download
  (one "Approve & download" click, trade-off 44 unchanged); findings provenance
  fail-closed (made invisible by automatic refresh).
- **Remove:** candidate review before new writing replaces the current one;
  warning acknowledgement and `costWarningConfirmed`.
- **Audit page:** hotel-name header linking to the hotel; one Report panel with
  every action always visible, greyed with an inline reason when unavailable;
  findings below, collapsed by category.
- **À traiter:** one merged to-do table, one poll.
- **Manual email:** any address (named people included), honest origin wording
  chosen per source. Free-mail: warning plus an attestation checkbox override.
- **Extras:** catalogue/Sirene cover prefill; UX audit skill task-completion
  mode; production proof on real stuck audits; publish + first email merged.

## Binding implementation rules

1. No edits to `findings.ts`, `severity.ts`, `llm-output.ts`, `manifest.ts` or
   `packages/core/src/normalize/` (all fingerprinted or locked). If a slice
   seems to need one: STOP.
2. The audit→hotel link is a store-only `hotelLink` field, never the immutable
   `outreach` stamp (its contract, `manifest.ts:315-321`, forbids inference),
   and never grants preview/outreach eligibility.
3. Unavailable = greyed with reason, never hidden. Keep busy-state disables.
4. FR/EN for every string, French written first. No new dependencies.
5. Executor first copies this plan to `plans/045-dashboard-dead-ends-and-gates.md`,
   adds a row to `plans/README.md`, opens a session-log stream, and runs
   `pnpm run format` + `pnpm run check` after each slice.

---

## Stage 1: unblock every dead end

### 1.1 One server function that "just makes the PDFs"
- Extract `routes/audits.ts:600-671` into `pipeline/regenerate-reports.ts`
  (`regenerateReportsForAudit`, typed refusals). Existing route calls it.
- Move the CLI normalize body (`cli/src/commands/normalize.ts`) into
  `pipeline/renormalize-audit.ts`; CLI stays a thin caller.
- New `pipeline/make-report-ready.ts` (`makeReportReady`): if findings are
  stale (row schema version or fingerprint differs), run renormalize →
  `backfillAuditRow` (`pipeline/backfill-audit-row.ts`) → `syncAuditDirToBucket`
  → writing regeneration with `regenerateStructure: true` (new pass-through
  option to `runAnalysisStage`, trade-off 32) → select the new pair
  (`approveWritingCandidate`, `store/src/report-preparations.ts:192-233`);
  then `regenerateReportsForAudit`; then `reconcileFailedAuditJobs`
  (`store/src/reconcile-jobs.ts`) so a `needs-input` job turns `complete`.
- `POST /api/audits/:id/regenerate-report` calls `makeReportReady`. Refusals:
  `identity-unconfirmed` (with fields), `scan-data-missing`, `no-analysis`,
  plus existing ones. `GET /api/audits/:id` adds `findingsStale` and
  `analysisPair: 'selected'|'legacy-latest'|'none'`.
- Record the early auto-select in the trade-off 62 amendment (see 2.1).
- Tests: route tests for stale→refresh→render (copy of a test-audit dir with
  a changed stamp), for fresh render, for identity refusal; a backfill test
  proving `manualFields`, `reportPreparation`, `hotelLink` survive.

### 1.2 Generate PDFs is always reachable
- `reportStepperSteps` enables produce whenever `analysisPair !== 'none'`;
  the button text says when findings will be refreshed first. (The stepper
  itself is replaced in stage 3; this keeps stage 1 small.)
- Test: model test for Belleval's shape (confirmed fields, analyses, no reports).

### 1.3 Inline identity Confirm, then PDFs automatically
- `POST /api/audits/:id/manual-fields/confirm` `{field, value}` stamps
  `operator`; when no detected identity field remains and an analysis pair
  resolves, calls `makeReportReady`. Response
  `{manualFields, pdfs: 'generated'|'waiting-other-field'|<refusal>}`.
  Export `findUnconfirmedIdentityFields` from `packages/report/src/index.ts`.
- New `dashboard/routes/identity-confirm-field.tsx` (input prefilled with the
  detected value + Confirm button; reuse `nomCommercialLabel`,
  `raisonSocialeLabel`, `detectedFieldHint`). Used in the stepper's first step
  and inside `NeedsInputCard` (`scan-progress.tsx:502-526`), which today only
  links away. Remove the implicit confirm-on-Save (`detectedIdentityPatch`,
  `audit-hotel-fields-form.tsx:201-235`).
- Tests: route (auto-generate, waiting, refusal), component render.

### 1.4 Link every audit to its hotel
- `audit.schema.ts` gains `hotelLink?: {candidateId, matchedOn:
  'own-registrable-domain', linkedAt}`. New `linkAuditToHotelByDomain`
  (`store/src/audits.ts`) via `normalizeDeclaredWebsite` +
  `getLatestHotelCandidateByOwnRegistrableDomain` (already used at
  `analysis-stage.ts:126`; `ownRegistrableDomain` is set only for single-holder
  domains, so trade-off 33 holds). Writes only when neither `outreach` nor
  `hotelLink` is set. Called after `persistAudit` in `audit-stage.ts` and by an
  idempotent bounded backfill at queue startup beside `reconcileFailedAuditJobs`.
- `listOutreachAudits` (`store/src/outreach-scans.ts:245`) matches either field
  so the hub's audit picker shows linked audits; preview resolution stays
  outreach-only.
- Detail API adds `hotel: {candidateId, name} | null`; header title becomes the
  hotel name linking to `/prospects/:id`, hostname secondary.
- Tests: link, single-holder only, never overwrites, picker lists it.

### 1.5 Better cover prefill
- In `audit-stage.ts:343-374`, for linked audits: `nomCommercial` =
  `formatHotelName(candidate.name)` (`outreach/hotel-name.ts:55`);
  `raisonSociale` = `normalizeRegistryDisplayName(sireneJoin.denomination)`
  from `getHotelQualification(conn, CURRENT_QUALIFICATION_VERSION, id)`, only if
  the join matched and NAF starts with `55.` (local predicate, not
  `detectSector`, trade-off 15). Otherwise current sources, same NAF check on
  `registrySnapshot` (blocks "O2SWITCH").
- `replaceDetectedManualFields` overwrites only `detected` fields; run on link
  so existing stuck audits get the better suggestions. Still one-click confirm.
- Tests: precedence, NAF rejection, operator values untouched.

### 1.6 Manually entered email address
**A. Rules and copy (STOP gate).** Draft formal French first, then English:
origin lines for `other-public-source` (directory, booking platform) and
`provided-directly` (article 13 wording, never "public source"); the free-mail
attestation sentence. Amend `outreach-rules.md` §7 origin bullet and §9 line
338; `prospect-qualification.md` §6 (role-only, free-mail, no contact before
selection); `operator-obligations.md` §5 (attested override, status
`secondary`, run a `research` pass on CNIL B2B email guidance before first
free-mail use); `plans/README.md` binding decision 11; trade-off 39 and its
CLAUDE.md line (respect `scripts/check-agent-docs.mjs` cap); trade-off 83 note
with the approved sentences. **STOP until the operator approves the exact
wording.**

**B. Server.** `core/src/types/hotel-contact.ts` (not fingerprinted): reason
gains `'operator-entered'`; new `HotelContactAddressOrigin =
'hotel-website'|'other-public-source'|'provided-directly'`; record gains
`addressOrigin?`, `freeMailAttestedAt?`. Schema mirrors. New
`recordManualHotelContact` (upsert on `contactVersion: 'manual-v1'` +
candidateId, 90-day TTL kept) and `getEffectiveHotelContact` (manual wins),
used by `findDraftRow` and `store/src/operator-views/prospect-detail.ts`.
`PUT`/`DELETE /api/prospects/:id/contact`; refusals `invalid-address`,
`suppressed` (use `isSuppressed(conn, domain, address)`),
`free-mail-needs-attestation` (use `isFreeMailDomain`,
`core/src/prospecting/free-mail-domains.ts`). Draft origin union
(`assemble-outreach-draft.ts:49`) gains the two values; `dataOriginsFor`
(`create-outreach-draft.ts:263`) reads `addressOrigin`; copy in
`outreach-draft-copy.ts`; `draft-disclosure-guard.ts` accepts the new origins;
suppression checks get the address. Core preview `OutreachDataOrigin`
unchanged (trade-off 42).

**C. Client.** Contact block in `hub-fiche-section.tsx`: address input, origin
choice, free-mail warning + attestation checkbox, remove. i18n `hub.contact.*`.
Tests: route refusals, precedence, disclosure per origin, address suppression.

### 1.7 One "Create first email" call
- `POST /api/prospects/:id/outreach/first-email`: refuse `draft-already-live`
  if a touch-1 draft exists; otherwise publish via `publishPreviewV2` (reissue
  is safe: nobody holds a link before touch 1), revoke older live previews
  (`listLivePreviews`/`revokePreview`), then `createTouchOneDraft` with the new
  token. If drafting refuses after publish, return the URL once (`no-store`).
- Hub primary action and Emails tab call it; delete `sessionToken` handling
  (`prospect-detail.tsx:222-223, 376-383`); reuse `outreachRefusalCopy`.
- **Check first** on a real linked hotel with a live v2 preview whether
  `findDraftRow`'s prescan dependency or evidence refusals block drafting. If
  yes: STOP and ask before relaxing prescan/evidence requirements (plan 037,
  trade-off 36).

### 1.8 UX audit skill: install + task-completion mode
- Symlink `.claude/skills/dashboard-ux-audit` → `../../.agents/skills/dashboard-ux-audit`
  (same pattern as sibling skills).
- Add a "Task-completion mode" to `SKILL.md`: actually perform each job end to
  end (generate PDFs on a stale audit, confirm identity → PDFs, approve &
  download, add a manual contact → first email, launch paid audit and quick
  check). Default target: local stack (confirm which database `.env` points
  at); production only on operator-named records. Pass = visible success, and
  every greyed control shows a reason. Failures → ledger
  `docs/product/dashboard-ux-audit-2026-09-12.md` + GitHub issue. List any Gmail
  drafts created so the operator can delete them.

### 1.9 Production proof (operator present, operator deploys)
Deploy with `deploy/odysseus-deploy.sh` (trade-off 61). Then, in the dashboard:
1. **Hôtel Belleval `809b5e87`**: click Generate PDFs → both PDFs, job turns
   `complete`; Approve & download FR and EN; read both covers.
2. **Les Flots Bleus `a7ad846f`**: stale findings + detected identity. Confirm
   the prefilled names → refresh + writing + PDFs run automatically; download;
   read covers. Ask before also finishing duplicate `6ac1b7aa` (same site).
Record results in the plan's status.

### Stage 1 verification
Unit/route tests per slice; `pnpm run check` (includes fallow); local
`pnpm run serve` + `pnpm --filter @odysseus/interface dev:dashboard`, then the
skill's task-completion mode on a local audit made stale by hand; production
proof above; stop dev servers and confirm with `pgrep`.

---

## Stage 2: remove ceremony

### 2.1 New writing replaces the selection and rebuilds PDFs
`regenerate-writing.ts`: `recordReadyWritingCandidate` →
`approveWritingCandidate` → `regenerateReportsForAudit`; response carries
`pdfs`. A failed run leaves the selection untouched. If the replaced pair was
approved, show a "delivered version replaced" status line (no dialog).
**Amend trade-off 62** (auto-selection, listed as rejected at
`trade-offs.md:2895`, is now accepted, operator decision) + note on plan 019.

### 2.2 Warnings never block
Delete `MissingAcknowledgementError` + acknowledgement check
(`regenerate-writing.ts:36-49, 125-127`) and `costWarningConfirmed`
(`report-preparation.ts:170-178`). Warnings still displayed. Trade-off 62 amendment.

### 2.3 One-click Approve & download
Client: if not approved, `POST approve-reports`, then fetch `/report/:lang`.
Label states it approves both languages. Trade-off 44 unchanged; UI note added.

### 2.4 Confirmation dialogs
| Where | Action | Decision |
|---|---|---|
| `scan-progress.tsx:197` | stop scan | keep |
| `audits.tsx:396` | stop / delete / clear queue | keep |
| `prospect-detail.tsx:792` | launch full audit | remove |
| `prospect-detail.tsx:813` | accept / reject review | remove accept; remove reject if `recordHotelCandidateReview` allows re-deciding, else keep |
| `hub-outcome-section.tsx:224` | opt-out | keep |
| `hub-preview-section.tsx:268` | publish / reissue | remove publish; keep reissue only when a touch-1 draft carries the link |
| `hub-preview-section.tsx:283` | revoke | keep |
| `audit-report-stepper.tsx:368` | regenerate writing | remove |
| `audit-report-stepper.tsx:377` | approve reports | remove |

### 2.5 Hidden → greyed with reason
`hub-emails-section.tsx:67` (`canStartFirstEmail`), `hub-preview-section.tsx:146`
(`canPublish`), `outreachScan.canStart` (kept as a real authorization, now
greyed with reason). `hub-audit-section.tsx:176` paid-audit refusals: keep
`already-in-flight` (link to progress) and `no-own-domain`; drop `no-cohort`
(stamp `cohortId: 'none'`).

### Stage 2 verification
Tests updated for removed errors and auto-selection; `pnpm run check`;
task-completion mode locally; deploy; rerun on production records the operator names.

---

## Stage 3: shrink and merge

### 3.1 Audit page rebuild
- `audit-report-panel-model.ts` (pure rows `{status, action, disabledReason}`:
  findings freshness when stale, cover identity, writing FR/EN, PDFs,
  delivery) + `audit-report-panel.tsx` reusing `IdentityConfirmField`.
- Header: hotel-name link, date, pages, severity bar.
- Other manual fields and plan 019 preparation inputs (SIREN, sector,
  transactional override, recipient, trigger, journeys) go in one collapsed
  "Report details (optional)" disclosure (`report-details-form.tsx`), never a gate.
- `audit-findings-section.tsx`: grouped by category, collapsed by default.

### 3.2 Hub
Remove `isSold` / `reportRevealed` (`hub-model.ts:148-161`,
`prospect-detail.tsx:233, 532-533, 765`). The Report tab shows whenever a full
audit exists and renders `AuditReportPanel`; `hub-report-section.tsx` goes.

### 3.3 À traiter merged table
New `routes/todo.ts` `GET /api/todo` composing the store reads behind the four
queues plus audit actions (identity to confirm, PDFs not generated, pair not
approved). Row `{kind, subject, action, href, since}`. `a-traiter.tsx` becomes
one table, one 10s poll; four queue components and `a-traiter-model.ts` go.
i18n `aTraiter.actions.*`; port the model test to the server.

### 3.4 Deletions (each checked with `fallow dead-code --trace`, trade-off 80)
Client: `audit-report-stepper.tsx`, `prepare-report-card.tsx`,
`prepare-report-model.ts` (+ test), stepper types in `prepare-report-types.ts`
and `audit-detail-model.ts`, `audit-reports-section.tsx` (move `FailureCard`),
`hub-report-section.tsx`. Routes: `confirm-warnings`,
`candidate/:language/preview`, `approve-candidate`, dashboard `/outreach/draft`
(CLI/batch keep calling `createTouchOneDraft`). Server: `pipeline/candidate-preview.ts`,
`setWarningAcknowledgement`, `clearStaleWarningAcknowledgement`, core
`isAcknowledgementCurrent`. Stored `warningAcknowledgement` field stays (no migration).

### Stage 3 verification
Render tests with axe on the panel and to-do table; FR/EN parity test;
`pnpm run check`; full task-completion run local then production; update the
UX ledger; archive the plan.

---

## STOP conditions
- A slice needs a locked or fingerprinted file.
- 1.6 wording not approved, or the operator rejects an amendment.
- Refresh finds no `scan.json` locally or in the bucket for a production audit.
- 1.7 requires relaxing prescan or evidence requirements.
- Backfill drops `manualFields`, `reportPreparation` or `hotelLink`.
- Any trade-off 44 check would need weakening.
- Refresh or regeneration times out through Caddy: measure, do not raise
  timeouts blindly (consider moving it onto the job queue instead).
