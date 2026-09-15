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
| 3 | 2026-09-14 | `48ae763` | 3 | 15 | 0 | 0 | local + production, partial (journeys 2/3/6 and full FR/EN parity not covered) | no |
| 4 | 2026-09-15 | `15bc280` | 0 | 15 | 0 | 0 | local synthetic browser fixture + stateful dashboard fixture, FR/EN surface pass | yes (surface copy) |

## Run 4 notes (Plan 048 local fixture pass)

Driven against the actual Vite dashboard at `15bc280` with Playwright and
synthetic API responses only. No production data, live model, mailbox, or
third-party site was touched. The separate stateful dashboard workflow test
also passed the directory → prospect → prepare outreach → queue draft work →
review draft → record outcome → Results count path.

- **Navigation:** both FR and EN rendered exactly three primary links:
  `Audits`, `À traiter` / `To do`, and `Prospects`. `Annuaire` remained
  reachable from Prospects and was absent from the sidebar.
- **Prospects and Results:** both languages rendered the shared progressive
  filter bar, the Results view, and the campaign status projection. Results
  kept one status badge and one outcome control per row.
- **Detail:** both languages rendered the read-only summary and one stored
  recommended action. The secondary edit/actions/history disclosures remained
  reachable in the stateful fixture test.
- **Scans:** both languages rendered exactly `Contrôle rapide`, `Préparer la
  prospection`, and `Préparer le rapport client` (English equivalents in the
  English pass); no light-audit or batch choice appeared.
- **Manual send disclosure:** the stateful queue path retained the explicit
  note that Odysseus cannot send drafts and that sending happens only in the
  operator mailbox.
- **Verification:** the dashboard workflow e2e passed, and the full e2e set
  passed when serialized (`38` files, `145` tests). The parallel full-suite
  run had one unrelated scanner timer assertion; its isolated rerun passed.
- **No new UX finding:** the fixture pass produced no new wrong or dead-end
  action, so the 15 existing register entries remain open and unchanged. This
  is not evidence that those historical findings are fixed; their last live
  verification remains the run recorded above.

**Coverage boundary.** The local `odysseus-local` database still has no
prospect/directory fixture suitable for a real browser mutation and no local
site authorized for a scanner run. The production login was not bypassed or
fed a secret, so this run does not claim a post-deploy rehearsal of the five
real-record journeys (directory add, qualifying audit/draft creation, queue
review, reply/follow-up outcome, and paid audit). The deterministic fixture
workflow and browser surface pass are the available safe evidence; a deployed
real-record rehearsal remains an external follow-up.

## Run 3 notes (local + production, partial)

Local leg driven live against `odysseus-local` (interface `pnpm run serve` on
:4600, dashboard `pnpm --filter @odysseus/interface dev:dashboard` on :5173).
Production leg driven live against `app.odysseusaudit.com` at the same HEAD,
by explicit operator instruction to navigate and mutate freely with the sole
exception of launching a full/paid audit; mutations made on real records were
reversed where the dashboard offered a way to (see below).

- **Coverage gap, unchanged from run 2**: `odysseus-local` still has zero
  `hotel_candidates` documents (confirmed via direct query), so journeys 1, 2,
  3, 4, and 6 have no local data to exercise. The catalogue fixture
  (`atout-france-sample.csv`) only contains real, named hotel domains that
  cannot be scanned without authorization, so no local substitute was
  fabricated. These journeys were instead exercised live against production
  data (see below), which is not a substitute for local-fixture coverage.
- **Verified fix, live**: the "not-qualified to qualified" transition the
  operator previously reported as broken now completes end-to-end. On a real
  rejected prospect (ARIANE HOTEL), "Qualifier manuellement" applied the
  override, "Accepter" cleared the identity-review gate, and the remaining
  block ("Aucun site propre n'est rattaché à cet hôtel") was stated in plain
  French rather than silently blocking the next action. Consistent with the
  qualification-override work landed at this HEAD and closed issue #237.
- **New: UX-013 (P1)**, issue #264. The Audits list includes non-scan job
  types (`outreach-draft-batch`, reproduced via the "Rédiger les premiers
  emails" batch button) mislabeled as "Audit léger"; clicking through crashes
  `/scans/:jobId` with a raw Zod schema-validation error in English, and the
  "Réessayer" button can never succeed.
- **New: UX-014 (P1)**, issue #265. On a real, currently relevant audit
  (HÔTEL BELLEVAL, `809b5e87-...`), "Régénérer les PDF" fails because the
  report renderer's print-overflow safety gate is correctly aborting on a
  genuine ~1794px content overflow on page 2 - but the dashboard surfaces this
  only as a raw, untranslated internal exception string in a toast that
  auto-dismisses within seconds, with no durable error state and no plain
  explanation. This client's paid PDF cannot currently be produced at all.
- **New: UX-015 (P2)**, issue #266. The hub's Aperçu tab actions (e.g.
  "Réémettre un lien") operate on whichever audit is selected via the
  separate Audit tab's own selector; the default selection (most recent
  audit) can be a full/paid audit that the preview API refuses
  (`not-an-outreach-audit`), surfaced only as a raw HTTP status line.
  Switching the Audit tab's selection to the outreach audit and returning
  fixes it, but nothing on the Aperçu tab reveals that dependency.
- **Verified working, no defect**: unknown prospect id (`/prospects/does-not-
  exist-xyz`) renders a clean "Not found." with a working "Back to prospects"
  link, in both languages checked. First-email refusal for a hotel with no
  usable contact address ("Aucune adresse de contact utilisable...") is clear
  plain French with no draft created.
- **Reverted after testing**: ARIANE HOTEL's qualification override was
  removed ("Retirer l'override") after verifying the fix, restoring the
  automatic "Rejeté" verdict. Its identity-review state could **not** be
  fully restored: the dashboard offers only Accept/Reject, no route back to
  the original "En attente" (pending) state, so it now reads "Rejeté"
  instead of pending - a residual, minor side effect of this run, not a
  reported defect (a one-way review decision may be deliberate). HÔTEL
  BELLEVAL's outreach preview was reissued to test the reissue action, then
  taken back down via "Take the preview down", restoring its original
  "Retiré" / "operator request" state.
- **Retained local artifacts**: two empty `outreach-draft-batch` jobs
  (`f631fa26-...`, `7344c803-...`, both "0 of 0 drafted") created in
  `odysseus-local` while testing the À traiter batch buttons against zero
  eligible hotels; harmless, no real drafts, surfaced UX-013.
- **No drafts created for real send**: the one first-email attempt (HÔTEL
  BELLEVAL) was refused before any draft was written; no Gmail draft exists
  from this run.
- **Not launched**: no full/paid audit was started this run, per explicit
  instruction.
- **Not covered this run**: journey 2 (quick check launch), journey 3
  (prospecting audit launch), journey 6 (outreach follow-through: due
  follow-up, reply review, outcome recording), and a full FR/EN parity sweep
  across every journey's critical text. The 11 legacy findings (UX-001
  through UX-011) were not deliberately re-verified against current source
  this run (still OPEN, last seen run 1) beyond incidental observation.
  Parity is not claimed.

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

### UX-013 (P1) Audits list mislabels non-scan jobs as an audit and the scan-detail page crashes on them

- Status: OPEN. First seen: run 3. Last seen: run 3.
- Where: `/audits`, `/scans/:jobId`, FR (reproduced locally on `odysseus-local`).
- Evidence: an `outreach-draft-batch` job (from the À traiter "Rédiger les premiers emails" batch button) appears in the Audits list mislabeled "Audit léger" via the default branch of `packages/interface/src/dashboard/routes/audits.tsx:71-80`, because `GET /api/scans` (`packages/interface/src/routes/scans.ts:174`) returns every job type unfiltered. Clicking through to `/scans/:jobId` crashes: `jobTypeSchema` (`packages/interface/src/dashboard/lib/api-schemas.ts:25-29`) only allows `full-audit`/`prospecting`/`hotel-prescan`/`outreach-full-scan`, so the response fails Zod parsing and the page shows the raw English validation error with a "Réessayer" button that can never succeed.
- Suggested UX fix: exclude non-scan job types from the Audits list, or give them their own correctly-labeled, working detail view.
- Issue: #264.

### UX-014 (P1) Report PDF regeneration failure shown only as a raw, untranslated, auto-dismissing exception - blocking a live client's paid report

- Status: OPEN. First seen: run 3. Last seen: run 3.
- Where: audit page, Rapport client, "Régénérer les PDF", production (HÔTEL BELLEVAL, audit `809b5e87-...`).
- Evidence: `POST /api/audits/:auditId/regenerate-report` returns 409 with the report renderer's raw print-overflow-guard exception (`packages/report/src/pdf.ts:198-334`, issue #118's gate; genuine ~1794px overflow on page 2). The dashboard's catch handler (`packages/interface/src/dashboard/routes/audit-report-panel.tsx:120-126`) relays that exact string in an auto-dismissing toast; no durable error state, no plain-language explanation, no remedy. This client's PDF currently cannot be produced.
- Suggested UX fix: a durable, plain-language error state on the report panel for this failure class, distinct from the raw exception text.
- Issue: #265.

### UX-015 (P2) Hub preview action silently depends on a cross-tab audit selection; wrong default is a dead end shown only as a raw HTTP status

- Status: OPEN. First seen: run 3. Last seen: run 3.
- Where: hub, Aperçu tab, "Réémettre un lien", production (HÔTEL BELLEVAL, a hotel with both a full audit and an outreach audit).
- Evidence: the Aperçu tab's action targets whichever audit is selected via the Audit tab's own selector/URL `?audit=` param (default: most recent audit, here the full/paid one), which `outreach-preview/publish` refuses (`{"published":false,"refusal":"not-an-outreach-audit"}`). The toast shows only "Request to /api/... failed (409)", not the refusal reason. Selecting the outreach audit on the Audit tab first makes the same button succeed.
- Suggested UX fix: scope preview/email hub actions to the hotel's outreach audit specifically, or surface the dependency and translate `not-an-outreach-audit` on the Aperçu tab itself.
- Issue: #266.

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
