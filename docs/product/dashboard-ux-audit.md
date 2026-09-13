# Operator dashboard UX audit ledger

Migrated from `docs/product/dashboard-ux-audit-2026-09-12.md` (run 1's
dated report) into the register format on 2026-09-13, during plan 045's
Stage 3 verification. Ids assigned in the source document's order;
mapped to the GitHub issues run 1 filed (`#180`-`#190`). Run 1 predates
this register, so all eleven findings start as OPEN, first/last seen run
1; nothing is marked FIXED here without a live re-check, even though all
eleven issues already show closed on GitHub as of the migration (a state
this migration does not verify - a future recurring sweep does that
reconciliation properly). History is never deleted.

## Run history

| Run | Date | HEAD | New | Still open | Fixed | Regressions | Coverage | Parity |
| --- | ---- | ---- | --- | ---------- | ----- | ------------ | -------- | ------ |
| 1 | 2026-09-12 | `ab96bd5` | 11 | 11 | 0 | 0 | partial (no browser-use skill; Playwright driven directly) | no |
| 2 | 2026-09-13 | `692bd92` | 1 | 12 | 0 | 0 | local leg only, task-completion mode, plan 045 Stage 3 | no (production leg pending) |

## Run 2 notes (task-completion mode, plan 045 Stage 3, local leg)

Driven live through the browser (Playwright) against `odysseus-local`, per the
skill's task-completion protocol and its hard rule against reconstructing a
sweep from code alone. Production leg (Hôtel Belleval, Les Flots Bleus, per
plan 045 section 1.9) is pending the operator's deploy.

- Verified end-to-end, real DB evidence, no regression: PDF regeneration from
  a stale-fingerprint audit (`briketenia.com`, `auditId
  5a18626e-def8-4920-a152-7f51e5e7460f`) and identity-field confirmation
  auto-triggering `makeReportReady` (`manualFields.nomCommercial` moved from
  `"OFFICIEL"`/`detected` to operator-confirmed) both produced real,
  digest-matching PDFs at the current normalization fingerprint.
- New finding: UX-012 (P1), filed as issue #214. Fixed during the plan 045
  closeout after the run; the proof is recorded in the fixed register.
- Coverage gap, not a dashboard defect: `odysseus-local` has zero
  `hotel_candidates` documents, so hub-driven jobs (manual contact address,
  first email draft, paid audit / quick-check launch from the hub) have no
  data to exercise locally. Deferred to the production leg on the named
  records.
- Local dev tooling: found and fixed a real blocker unrelated to the
  dashboard's own UX - the Vite dev proxy's string-shorthand `/api` target
  let the browser's `Origin` header (`localhost:5173`) diverge from the
  upstream `Host` the backend received, tripping `router.ts`'s same-origin
  guard on every state-changing request and making the entire dashboard
  read-only in local dev. Fixed in `packages/interface/vite.config.ts`
  (object-form proxy target, comment explains why); left uncommitted for the
  operator's review since it touches build config, not the dashboard itself.

## Open findings

### UX-001 (P1) À traiter audit queue shows raw job UUID, not the hotel name

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: `/a-traiter`, "Audits en attente d'action" / "Audits waiting for action", FR+EN.
- Evidence: `packages/interface/src/dashboard/routes/a-traiter.tsx:286` rendered `` `${summary.jobId} · ...}` `` instead of `summary.outreachCandidateName`, which `audits.tsx:243-249` already used.
- Suggested UX fix: prefer `summary.outreachCandidateName` over the raw job id, falling back only when the candidate no longer resolves.
- Issue: #180 (closed on GitHub; not yet re-verified live in this register).

### UX-002 (P1) Most first-email draft refusal codes give no reason or remedy

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: hub, Emails tab, "Générer/Créer le premier email", FR+EN.
- Evidence: `prospect-detail.tsx:349-363` only covered 5 of the 17 `CreateOutreachDraftRefusal` codes; the other 12 fell through to a generic "the orchestrator refused" toast.
- Suggested UX fix: add the missing 12 keys to `refusalReasons` in both i18n files, mirroring the CLI's own copy.
- Issue: #181 (closed on GitHub; not yet re-verified live in this register).

### UX-003 (P2) Paid full-audit button has no upfront refusal check, unlike its sibling

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: hub, Audit tab, "Lancer un audit complet" (plan 044).
- Evidence: `hub-audit-section.tsx:167-171` always rendered the button; refusals (`no-own-domain`, `already-in-flight`, `no-cohort`) only surfaced after confirm, unlike the prospecting-audit button's proactive `scan-refused` state.
- Suggested UX fix: compute the same proactive refusal state for the paid-audit button and show it as page text before any confirm dialog.
- Issue: #182 (closed on GitHub; not yet re-verified live in this register).

### UX-004 (P2) Internal fallback codes leak to the screen where an equivalent surface already translates the same fact

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: hub Fiche tab ("Origine des données"); À traiter Replies queue.
- Evidence: `hub-fiche-section.tsx:196-205` rendered the raw `dashboard-review` fallback constant; `a-traiter.tsx:219` interpolated `reply.reviewReason` raw instead of the sentence `hub-emails-section.tsx:79-83` already has for the same flag.
- Suggested UX fix: give `dashboard-review` a real FR/EN label (or drop it from the line); route the Replies queue's secondary line through the same sentence.
- Issue: #183 (closed on GitHub; not yet re-verified live in this register).

### UX-005 (P2) Résultat tab is a silent dead end before a thread exists

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: hub, Résultat tab, any hotel before its first email.
- Evidence: `hub-outcome-section.tsx` rendered only the generic `outcomeNone` line when `thread === null`, with no reason or link to the Emails tab.
- Suggested UX fix: when `thread === null`, show a sentence naming the reason and linking to the Emails tab.
- Issue: #184 (closed on GitHub; not yet re-verified live in this register).

### UX-006 (P2) "Reveal paid report" control is mislocated and its label invites the wrong reading

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: hub, Audit tab, bottom of the findings table, unsold hotels.
- Evidence: `prospect-detail.tsx` `reportRevealed`/`showReportReveal`; the button rendered after the findings table and an unrelated identity-warning card, worded "quand même" ("anyway"), inviting a "force past this problem" reading.
- Suggested UX fix: move the control next to the sale decision or the primary action; rename away from "quand même".
- Issue: #185 (closed on GitHub; not yet re-verified live in this register).

### UX-007 (P2) Reply "mark reviewed" endpoint has no dashboard caller

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: À traiter Replies queue; hub.
- Evidence: `POST /api/outreach/replies/:threadId/review` (`routes/outreach.ts:178`) exists; `a-traiter.tsx:207-232` only calls `GET /api/outreach/replies`, never the review endpoint.
- Suggested UX fix: verify whether recording an outcome implicitly clears the flag; if not, add a "mark reviewed" action to the reply's path.
- Issue: #186 (closed on GitHub; not yet re-verified live in this register).

### UX-008 (P3) Scan-failure message is untranslated English prose with no direct link to its remedy

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: `/scans/:jobId`, "Le scan a échoué" coverage-gate failure card.
- Evidence: full English prose naming the delay/concurrency fields on `/scans/new` by name, with no direct link to them (contrast with the audit page's deliberately labeled raw-message card, which is fine as is).
- Suggested UX fix: link directly to the fields it names, or translate/label it the same deliberate way the audit-page card is.
- Issue: #187 (closed on GitHub; not yet re-verified live in this register).

### UX-009 (P3) Prospects list renders blank cells instead of "-" for not-yet-reached state

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: Prospects list, Contact/Emails/Résultat columns.
- Evidence: `vocabulary.ts`'s `vocabularyLabel()` returns `''` for `null`/`undefined`, used directly for these three columns while adjacent score columns use `?? '-'`.
- Suggested UX fix: fall back to `-` for these three columns, matching the score columns' pattern.
- Issue: #188 (closed on GitHub; not yet re-verified live in this register).

### UX-010 (P3) Six server routes have no dashboard caller (dead code)

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: `GET /api/prospects/:id/{prescan,score,evidence,preview,outreach}`, `POST /api/audits/:auditId/outreach-preview/revoke`.
- Evidence: superseded by the composed `GET /api/prospects/:id` detail payload and the candidate-scoped revoke; not user-facing, a cleanup item.
- Suggested UX fix: delete or fold into the composed endpoint's implementation.
- Issue: #189 (closed on GitHub; not yet re-verified live in this register).

### UX-011 (P3) `no-cohort` remedy names a CLI subcommand the dashboard can't run

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: paid-audit / wave refusal copy.
- Evidence: `"lancez d'abord une sélection (score select)."` names the literal CLI command, not something a dashboard-only operator can act on.
- Suggested UX fix: rephrase without the CLI command name, or point at whatever dashboard equivalent exists.
- Issue: #190 (closed on GitHub; not yet re-verified live in this register).

## Fixed register

### UX-012 (was P1) Superseded report pair shown as ready after failed regeneration - fixed in plan 045 closeout

- Proof: the audit-detail API now exposes a report only when its `analysisId`
  belongs to the currently selected writing pair. The deterministic issue #214
  regression test models digest-valid PDFs for an older pair after selection
  advances and verifies both rows return `unverified`/unavailable while the
  lifecycle remains `analysed`. The focused route suite, report-panel render
  suite, axe coverage, FR/EN parity, and repository check pass. Live
  re-verification remains part of the next recurring dashboard audit.
- Issue: #214.

## Deliberate register

(none recorded yet)
