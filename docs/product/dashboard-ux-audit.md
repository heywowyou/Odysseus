# Operator dashboard UX audit ledger

Migrated from run 1's
dated report) into the register format on 2026-09-13, during plan 045's
Stage 3 verification. Ids assigned in the source document's order;
mapped to the GitHub issues run 1 filed (`#180`-`#190`). Run 1 predates
this register, so all eleven findings start as OPEN, first/last seen run
1; nothing is marked FIXED here without a live re-check, even though all
eleven issues already show closed on GitHub as of the migration (a state
this migration does not verify - a future recurring sweep does that
reconciliation properly). History is never deleted.

> **Reading this ledger (issue #526, 2026-09-25).** "Open" here means *not
> re-verified live by a sweep*, not *unfixed in code*. Most items listed open
> have a closed GitHub issue: the fix is merged, and only the live re-check
> this register requires before it writes FIXED is missing. For whether a
> defect is fixed in code, the item's GitHub issue is the source of truth;
> this ledger records what a live sweep has seen. The next sweep reconciles
> the two and marks each item FIXED or REGRESSED.

## Run history

| Run | Date | HEAD | New | Still open | Fixed | Regressions | Coverage | Parity |
| --- | ---- | ---- | --- | ---------- | ----- | ------------ | -------- | ------ |
| 1 | 2026-09-12 | `ab96bd5` | 11 | 11 | 0 | 0 | partial (no browser-use skill; Playwright driven directly) | no |
| 2 | 2026-09-13 | `692bd92` | 1 | 12 | 0 | 0 | local leg only, task-completion mode, plan 045 Stage 3 | no (production leg pending) |
| 3 | 2026-09-14 | `48ae763` | 3 | 15 | 0 | 0 | local + production, partial (journeys 2/3/6 and full FR/EN parity not covered) | no |
| 4 | 2026-09-15 | `15bc280` | 0 | 15 | 0 | 0 | local synthetic browser fixture + stateful dashboard fixture, FR/EN surface pass | yes (surface copy) |
| 5 | 2026-09-15 | `Plan 048 closeout` | 0 | 15 | 0 | 0 | isolated local stateful browser fixture + real prospecting queue scan, FR detail state pass | yes (FR stateful; EN surface run 4) |
| 6 | 2026-09-15 | `13b65ea` | 14 | 16 | 0 | 0 | local stateful, authorized real site, real mailbox draft + preview bucket, FR+EN; journeys 1-5 and 7 partial, 6 blocked | no |
| 7 | 2026-09-17 | `11e5cf71` | 16 | 1 regressed + 26 not re-verified | 2 | 1 (UX-020) | production observation with operator-authorized writes, FR+EN; journeys 2, 3 (to scan launch/progress), 7 partial; 4, 5, 6 not reached (session lost) | no |
| 8 | 2026-09-21 | `8d3e1fee` | 0 | 1 regressed + 26 not re-verified | 0 | 0 | targeted production regression: La Co(o)rniche report rewrite and authenticated Gmail mailbox sync; no live draft creation | no |
| 9 | 2026-09-21 | `a74c87ab` | 3 | 43 | 2 | 0 | read-only production rehearsal after deploy; FR/EN routes, mobile shell, recovery states, audit loading, tools, and to-do API shape; no state-changing prospecting actions | no |
| 10 | 2026-09-21 | `7a9b0f41` | 1 | 43 | 1 | 0 | local stateful browser rehearsal against `odysseus-local`; FR/EN critical paths, reserved-domain failure jobs, lifecycle cleanup, mobile/back/recovery, and route/action inventory; no real-site scan or email | no |
| 11 | 2026-09-23 | `d06e8bfd` | 2 | 45 | 0 | 0 | targeted read-only production: `/audits` and one active `/scans/:id`, FR/EN, desktop/390px, and reload | no |
| 12 | 2026-09-23 | `5da97bd2` | 0 | 43 | 2 | 0 | targeted read-only post-deploy scan-progress recheck: FR desktop/mobile and EN mobile, active job, no writes | yes (progress layout) |

## Run 11 notes (production, targeted scan-progress observation)

- Mode and boundary: deployed build `d06e8bfd` on `https://app.odysseusaudit.com`; inspected the existing in-progress scan from `/audits` through `/scans/:id`. Read-only: no scan was launched or cancelled and no record was changed.
- Coverage: `/audits` and one active scan detail in French and English, desktop and 390px mobile widths, plus refresh during progress. This was a targeted observation, not a full operator-journey run; no parity claim.
- Scan state and recovery: progress API polls returned HTTP 200 and matched the displayed counts. After deployment recovery, the page showed `83/162` content checks while the active phase was a new crawl, then `0/164` when content checks restarted; the count advanced to `38/164` and survived refresh. The active job had a fresh heartbeat. A changed planner identity made the earlier checkpoint incompatible, so repeating the pass was expected; the page did not explain that restart. The scan was advancing, not stuck or failed.
- New findings: UX-050 records the unexplained prior-attempt count during the recovery crawl and subsequent reset. UX-051 records horizontal overflow from the ETA paragraph at 390px in both FR and EN (`documentElement.scrollWidth` 490px for a 390px viewport; `scan-progress.tsx:412`). The rough ETA varied while work advanced; this short sample is not enough to call estimate accuracy a defect.
- Still open: UX-041 was not reproduced during the content-check phase; a Lighthouse/performance phase was not observed. Other historical findings were outside this targeted pass.
- GitHub handoff: no issues were filed; this request was to identify the production display problems, and external issue creation was not authorized. No scan, record, or client artifact was retained or changed.

## Run 12 notes (production, post-deploy scan-progress recheck)

- Mode and boundary: commit `5da97bd2` was pushed and deployed through
  `deploy/odysseus-deploy.sh`; the script verified the running build ID.
  `/health/ready` returned HTTP 200 with database and queue both `ok`. This
  was a targeted read-only check; no scan was started or cancelled and no
  production record was changed.
- Active scan: job `517f3ce0-bf45-472e-a6bd-7f04b0dc6fd1` was already running.
  Before deployment it showed 77/232 scan pages and 15/170 Lighthouse pages.
  After deployment it advanced to 26/170 Lighthouse, then 29/170 in the
  normalize phase. A later read at 09:42 UTC showed it still running in
  Lighthouse at 42/170; its linked prospect is Château Royal, not a Plan 076
  acceptance target. It continued through the app restart.
- UX-050: the active page showed the current 232/232 content count after
  deployment. That scan had advanced past crawl, so the new recovery message
  was not observed live. A focused render regression now simulates retained
  83/162 content and 15/162 Lighthouse counts during a new crawl; it verifies
  the French recovery explanation and that stale counts are hidden. The model
  regression verifies both stage bars reset to zero. Both affected test files
  passed (34 tests total).
- UX-051: production FR at 1280px and 390px, and EN at 390px, all had
  document width equal to the viewport. The ETA and progress details remained
  visible on mobile.
- This was a targeted progress-page recheck, not a full dashboard journey.
  No other findings were added or reverified.

## Fix pass after run 11 (deployed; verified in run 12)

UX-050 and UX-051 are fixed in build `5da97bd2`.

- UX-050: crawl phase suppresses prior-attempt checked/measured counters in
  stage bars and coverage summary, and shows a localized recovery explanation.
  The local render/model regression covers a crawl carrying stale stage counts.
- UX-051: the phase label and ETA stack on compact screens; the ETA can shrink
  and wrap on wider layouts.
- Verification: `pnpm run check` passed before commit, and the pre-push hook
  passed it again. Focused dashboard progress tests passed (34 tests), and the
  provenance tests passed (7 tests) after the normalization fingerprint repair.
  The final `pnpm run test:all` passed: 5,563 tests passed and 245 skipped;
  all 535 executed test files passed, with 28 skipped. The 33 store integration
  files were skipped because local Docker MongoDB was unavailable.

## Run 10 notes (local stateful operator rehearsal)

- Mode and boundary: local `pnpm run serve` plus the Vite dashboard, with the
  server explicitly pointed at the non-production `odysseus-local` database.
  The scan fixture was a repository-local fictional site, but the scanner's
  loopback policy correctly refused it outside the test runner, so no real
  third-party site was scanned. A uniquely tagged local prospect was created
  through the UI, status-corrected, archived, restored, and permanently
  deleted through the UI. Two reserved `.invalid` failure jobs were created to
  exercise full-scan and quick-check terminal states, then deleted through
  their uniquely identified audit rows. No email was sent, no real draft was
  created, and no pre-existing client record was changed.
- Coverage: French and English navigation, status correction and reload,
  full-scan and quick-check failure/recovery surfaces, failed-job list/filter
  state, mailbox sync (HTTP 200), existing draft review read-only, archive /
  restore / permanent-delete dialogs, keyboard confirmation, back navigation,
  deleted-scan recovery, 375px work queue/prospect/audit surfaces, and the
  unknown direct server path. The supplied real-site failure was not rerun;
  its sanitized coverage counters were reconciled against the current source.
- Journey results: prospect status correction persisted after reload; archive,
  restore, and deletion completed with honest confirmation; mailbox sync
  returned zero new sends/replies and one review row. Both reserved-domain
  jobs failed honestly in roughly seconds with zero crawl work, but the
  terminal failure card showed only raw English scanner prose and no retry,
  new-scan, or remedy link. The internal processing rows still crash the scan
  detail schema, and an opted-out pre-existing prospect still contributes a
  draft row to To-do.
- Fixed and verified: UX-021 draft review now has body, recipient, language,
  preview/mailbox links, discard/revoke controls, and hash navigation; the
  local fixture lifecycle and keyboard dialogs also completed successfully.
- New finding: UX-049, a report-quality-review attention row can be emitted by
  the store and rendered by To-do, but the dashboard has no review/approve
  surface for the corresponding report-quality endpoints. GitHub search found
  no duplicate; issue creation was rejected by the connector's external-write
  policy, so the ledger records no issue.
- Re-verified still open: UX-008 (generic scan failures), UX-013 (non-scan
  jobs in Audits), UX-017 (opt-out work remains live), UX-034 (coverage
  counters), UX-046 (bare direct 404), and UX-047 (no campaign-level inbox
  overview). UX-048 and the remaining older findings were not re-run.
- To-do/count blindspot: the dashboard badge counts derived actionable rows,
  not prospects whose portfolio status is `Audité`. A status can be audited
  while having no row (for example, no usable qualifying scan/contact), and
  one prospect can also contribute multiple rows. The local database is not
  the user's reported 12-record dataset, so this run cannot identify which
  production record accounts for the difference. The existing opt-out row
  proves the current count is also polluted by terminal work, which is UX-017.
- Coverage gaps: no safe successful full audit, paid report/PDF pair,
  report-quality review, preview publication, test-mailbox draft creation,
  follow-up, reply, or outcome journey was available without mutating
  pre-existing data or using a real external site/mailbox. No parity claim.

## Fix pass after run 10 (working tree, pending live re-check)

The implementation pass addresses the six reproduced regressions and the new
quality-review blocker without rerunning the supplied real site or changing
the live database. Statuses below remain historically OPEN until a deployed
FR/EN browser rehearsal confirms them.

- UX-008: ordinary scan failures now have localized reason copy, a collapsed
  technical detail, and a new-scan or audit action.
- UX-013: scan history filters job types in the database query and again at
  the route boundary, so outreach batch jobs cannot consume scan history or
  reach the scan-detail Zod contract.
- UX-017: terminal prospects no longer expose stale work rows, and both the
  outcome and direct status opt-out paths withdraw provider drafts, previews,
  and threads.
- UX-034: staged progress persists late-discovered inventory, the coverage
  model reconciles checked pages against inventoried pages, and a missing
  checkpoint row is recovered with explicit ledger provenance.
- UX-046: extensionless direct paths now reach the branded SPA catch-all while
  file-looking and unknown API paths retain 404 behavior.
- UX-047: À traiter now exposes audited/active/actionable counts, per-kind
  counts, mailbox configuration and last-sync freshness, plus an action-kind
  filter; this makes an 11-actions/12-audits difference explicit rather than
  silently treating the two populations as equal.
- UX-049: audit detail now validates the report-quality read contract and
  provides candidate FR/EN PDF links, issue details, rerun, and exact-bundle
  approve/promote actions without exposing private object keys.

Focused verification passed for the affected store, scanner, queue, API,
static-route, dashboard, and audit-detail suites; the full live re-check and
deployment remain outside this local fix pass.

## Run 9 notes (production, read-only post-deploy rehearsal)

- Mode and boundary: deployed build `a74c87ab` on
  `https://app.odysseusaudit.com`; readiness returned
  `{"status":"ready","database":"ok","queue":"ok"}`. The browser pass
  stayed read-only: no scan launch, preview publish/revoke, draft creation,
  outcome, archive, delete, or other prospect mutation was performed.
- Coverage: authenticated FR/EN surface routes, prospect and audit detail,
  directory, suppressions, tools, scan entry, legacy redirects, unknown
  resource states, 375px mobile navigation, language switching, and the live
  to-do response. Covered stable pages had no persistent console or layout
  errors; mobile pages had no horizontal overflow.
- Verified fixes: mailbox reconciliation is now reachable through the
  dashboard's explicit sync control and was already confirmed HTTP 200 in the
  preceding deployed regression pass (UX-016); an unknown scan now renders a
  named recovery link to Audits (UX-043).
- New findings: the server returns a bare 404 for an unknown top-level
  dashboard path (UX-046); the prospecting inbox has no campaign-level
  mailbox/work-state overview or sync-freshness indicator (UX-047); and an
  audit detail can show only an unlabeled busy shell while its first request
  takes several seconds (UX-048).
- Blindspot: the live to-do payload contained 11 rows, all `first-email` /
  `create-first-email`. The source model supports replies, follow-ups, draft
  review, outcomes, and report repair, but the current production data did not
  exercise those paths. A real Gmail draft remains intentionally unverified:
  no named safe mailbox/test recipient was provided, and Odysseus does not
  send mail itself. Full journey parity is not claimed.

## Run 8 notes (production, targeted authorized regression)

- Mode and boundary: deployed dashboard `https://app.odysseusaudit.com`, first
  build `d15e990` and final build `bef037b`; the operator authorized the VPS
  exercise. No email was sent, and no real Gmail draft was created during this
  run because a named safe mailbox/test recipient was not provided.
- Report regeneration: the exact La Co(o)rniche `Réécrire le rapport` action
  first reproduced the stale legacy-manifest failure. After the evidence
  refresh fix, the replay exposed a second stale selected-structure failure;
  the follow-up fix regenerated the structure and completed successfully.
  The final French report was fresh with a PDF; no scan was launched.
- Gmail mailbox sync: the deployed endpoint initially failed with Gmail 403
  because a metadata-scoped token was implicitly requesting a full thread.
  The adapter now requests `format=metadata`; the final live check returned
  HTTP 200, `configured: true`, `threads: 2`, `sent: 0`, `replies: 0`, and
  `review: 0`. Provider failures now return a safe 502 instead of a raw 500.
- Draft path: the Gmail transport contract and draft-runtime failure paths are
  covered locally. A provider rejection/timeout now records a failed attempt,
  cleans the opt-out object, and refuses safely rather than leaving a false
  success or an unhandled exception. The remaining production coverage gap is
  one real draft creation with an explicitly named safe mailbox/test recipient;
  the adapter has no send capability.

## Run 7 notes (production, operator-authorized writes)

- Mode and boundary: deployed dashboard `https://app.odysseusaudit.com`,
  build `11e5cf71`. The operator explicitly moved the run from local to the
  VPS and authorized adding a four-star catalogue hotel, scanning it, and
  every step short of sending email. Login used the repository credential
  without printing it.
- Records created: prospect ATLANTIC HÔTEL (atlantichotel.fr, from the
  Annuaire), one quick check (audit `f2323b11…`, 1 page, 26 findings, grade
  D), one full scan (job `74940988…`, 378 URLs inventoried, content phase
  started; completion not observed). One PDF regeneration attempt on the
  existing Hôtel Ha(a)ïtza audit (failed, no state change). No preview
  published, no draft created, no email sent. All records retained.
- Journey 1 (directory → prospect): search, star filter, add and "Ouvrir le
  prospect" worked; facet, loading, provenance and label issues UX-035,
  UX-036, UX-037, UX-038, UX-039, UX-040.
- Journey 2 (quick check): full proof chain - one POST, 13 s, 1 page
  crawled and scanned, audit attached, prospect recommendation advanced to
  full scan. UX-033 found in its findings.
- Journey 3 (full scan): double click produced one job; a second launch
  from the hub was refused `host-busy` (UX-031). Progress polling recovered
  from a network failure. Coverage accounting UX-034, layout UX-041.
- Journey 5 (paid report, existing audit): regeneration reproduces the
  page-11 overflow - UX-020 regression; approve gating UX-032; Audits list
  disagreement UX-030.
- Journey 7 (recovery): invalid URL rejected client-side; bare domain
  rejected (UX-044); unknown prospect handled; unknown scan dead end
  (UX-043); expired session and wrong password (UX-042); 375 px To-do had
  no horizontal overflow.
- Fixed and verified live: UX-018 (lookup answers, POST 200), UX-026 (quick
  check audit titled with the hotel and says it is not a client report).
- Coverage gaps: the session cookie was cleared while testing expiry and
  re-login was blocked by the host permission layer, so the full scan's
  terminal state, preview, first draft, follow-up/reply and outcome
  journeys (4, 6) were not run; the other older findings were not
  re-verified.

## Run 6 notes (local stateful, operator-authorized real prospect)

- Mode and boundary: local `pnpm run serve` + Vite dashboard at `13b65ea`
  against Mongo database `odysseus-local` (production uses a different
  database). The operator explicitly authorized one named real hotel site for
  scans, edits and deletion, and every step short of sending mail. The
  configured real mailbox and preview bucket were therefore used: one Gmail
  draft (not sent) and two previews (one revoked by the product, one live)
  were created. No email was sent.
- Starting state: empty local catalogue, prospects and suppression data, so
  the Directory journey could not run (catalogue import is CLI-only via
  `prospect ingest`); the prospect was created with "Nouveau prospect".
- Journey 1 (prospect decision): created, edited (email added), status
  advanced automatically. Stale gates after edit -> UX-023. No not-qualified
  -> qualified control exists in this IA (qualification is audit-derived).
- Journey 2 (quick check): proof chain complete - double click created one
  job, 1 page visited in 14 s, audit + findings persisted, attached to the
  prospect. Labels mislead -> UX-026. Invalid-URL refusal is clear.
- Journey 3 (prospecting audit): proof chain complete - 31/31 pages crawled,
  content-scanned and measured in ~10 min, survived EN switch and reload,
  prospect advanced to Audité with a qualifying audit.
- Journey 4 (preview + first email): preview published, then silently
  superseded by the draft's own preview (UX-024); draft created in the real
  mailbox but in English because the dashboard was in EN (UX-019); review
  surface shows only the subject (UX-021); status jumped to Contacté (UX-022).
- Journey 5 (paid report): identity confirmed, writing succeeded with no
  progress feedback (UX-025), PDF production fails reproducibly (UX-020).
- Journey 6 (follow-through): blocked - mailbox reconciliation has no caller
  (UX-016). Outcome recording on an unsent thread accepted silently (UX-022);
  opt-out leaves draft, preview and task live (UX-017); suppression lookup
  404s (UX-018).
- Journey 7 (recovery/navigation): unknown prospect, unknown URL, invalid
  URL, FR/EN toggle persistence and 390 px width checked; no horizontal
  overflow. Locale leaks -> UX-028, landmarks -> UX-029. Keyboard-only
  dialogs, expired session and slow-request states not covered.
- Still open, re-seen: UX-002 (refusal falls back to "Autre"), UX-014 (raw
  English exception still displayed beside the translated PDF failure).
  Other historical entries were not re-verified in this run.
- Retained for operator review/cleanup: prospect `95058d91`, audits
  `82b11f72` (quick check) and `755d9e27` (prospecting, with FR/EN analyses)
  and their local artifact directories, outreach thread `b446543c`, draft
  `352d01f5` (Gmail provider draft still in the mailbox), previews
  `e0557524` (revoked) and `b760f0fa` (live in the bucket), and a suppression
  row for the prospect's email from the opt-out test. Deleting the prospect
  from the dashboard will not remove the Gmail draft (UX-017).
- Parity: no.

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

**Coverage boundary.** Run 5 closes the local directory/add and qualifying
audit portions with a synthetic fixture, but it does not claim a post-deploy
rehearsal of the five real-record journeys (directory add, qualifying
audit/draft creation, queue review, reply/follow-up outcome, and paid audit).
The production login was not bypassed or fed a secret, and no mailbox mutation
was performed; the deployed real-record rehearsal remains an external
follow-up.

## Plan 049 semantic closeout (2026-09-15)

The runtime contract was verified with focused route, runner, qualification,
status-policy, work-model, and launch-guard tests. The tests prove the three
operator intents' compositions and their resulting qualification and work
state without a live model, mailbox, or third-party site. This is a code-level
closeout, not a post-deploy browser rehearsal; the real-record rehearsal for
all three scan intents remains pending operator authorization.

## Run 5 notes (Plan 048 stateful local closeout)

Driven against the actual Vite dashboard and API at the Plan 048 closeout
working tree, using an isolated Mongo database and a synthetic site served on
`lvh.me` (which resolves to loopback). No production data, live model,
mailbox, or third-party site was touched.

- **Directory → prospect:** the browser selected the synthetic Atout France
  entry and the real `/api/directory/add` action returned `201`; the new row
  appeared in Prospects and linked to its prospect detail.
- **Prospecting audit:** the detail's recommended “Préparer la prospection”
  action created a real `prospecting-audit` queue job. The bounded local scan
  completed, attached an audit, advanced the prospect to `Audité`, and exposed
  `État de l’audit : qualifiant` with `Vérifier la fiche` as the next action.
- **Detail safety:** the page kept the edit, actions, history, suppression,
  and manual-status controls secondary; no literal `{state}` placeholder
  remained. A strict-Zod update regression was added after the rehearsal
  found Mongoose `_id`/`__v` metadata entering the edit service.
- **No new UX finding:** the two closeout defects were fixed before this run
  was recorded; the 15 historical entries remain open with their prior live
  verification dates. The full production-record rehearsal remains outside
  this local closeout by the no-live-third-party/mailbox boundary.

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

- Status: OPEN. First seen: run 1. Last seen: run 6.
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

- Status: OPEN. First seen: run 1. Last seen: run 10.
- Where: `/scans/:jobId`, "Le scan a échoué" coverage-gate failure card.
- Evidence: the run-10 FR and EN full-scan and quick-check failure cards rendered the raw English scanner string `crawlSite: network safety blocked robots target (unresolvable-host)` with no retry, new-scan, or remedy link. The operator-supplied real-site failure likewise exposed an internal English inventory-ledger exception beside an otherwise localized progress page. The existing coverage-gate branch only links when `coverageGateBlocked` is set (`packages/interface/src/dashboard/routes/scan-progress.tsx:578-605`), so ordinary safety/network failures remain an untranslated dead end.
- Suggested UX fix: link directly to the fields it names, or translate/label it the same deliberate way the audit-page card is.
- Issue: #187 (closed on GitHub; the broader ordinary-failure case remains reproduced in run 10).

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

- Status: OPEN. First seen: run 3. Last seen: run 10.
- Where: `/audits`, `/scans/:jobId`, FR (reproduced locally on `odysseus-local`).
- Evidence: the current local Audits list still showed two `Unknown site` / `Internal processing` rows as completed. Opening one still failed Zod validation because `outreach-draft-batch` is not in `jobTypeSchema`, leaving a raw English enum error and a retry button that cannot succeed. The route still returns every job type and the list still falls through to the generic label.
- Suggested UX fix: exclude non-scan job types from the Audits list, or give them their own correctly-labeled, working detail view.
- Issue: #264.

### UX-014 (P1) Report PDF regeneration failure shown only as a raw, untranslated, auto-dismissing exception - blocking a live client's paid report

- Status: OPEN. First seen: run 3. Last seen: run 6.
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

### UX-017 (P1) Opt-out leaves the Gmail draft, the public preview and the review task live

- Status: OPEN. First seen: run 6. Last seen: run 10.
- Where: local dashboard, prospect journey, FR+EN as noted.
- Evidence: without mutating the pre-existing record, run 10 fetched the local prospect as `opted-out` while `/api/prospect-hub/todo` returned one `draft` row for it; the English To-do page still offered "Review the draft", and the prospect detail still exposed the draft/preview state. The derivation adds created drafts before the terminal-status recommendation guard (`packages/store/src/prospect-work.ts:189,261-318`), while To-do excludes only archived prospects (`packages/store/src/prospect-hub.ts:137-140,403-415`). The earlier run-6 proof also showed the provider draft and live preview remain.
- Suggested UX fix: An opt-out (and a deletion) withdraws every pending draft in the mailbox, revokes live previews, closes the thread, and removes the work item; the operator sees what was withdrawn.
- Issue: #273.

### UX-019 (P1) Client email and preview language follow the operator's dashboard language

- Status: OPEN. First seen: run 6. Last seen: run 6.
- Where: local dashboard, prospect journey, FR+EN as noted.
- Evidence: `packages/interface/src/dashboard/routes/prospect-hub-detail.tsx:389` sends the UI `language` to `/outreach/first-email`. Repro (local, run 6): with the dashboard in EN, "First email" on a French hotel created an English draft (`language: en`, `languageSource: operator`) and published a new English preview. No language is shown or chosen before creation, and the draft card does not display it.
- Suggested UX fix: The prospect's outreach language is an explicit prospect-level choice (default French for French prospects), shown before creating the draft, independent of the dashboard UI toggle.
- Issue: #275.

### UX-020 (P1) Paid report PDFs fail reproducibly on a long third-party URL with no operator remedy

- Status: REGRESSION (issue closed 2026-09-15, reproduced run 7). First seen: run 6. Last seen: run 7.
- Where: local dashboard, prospect journey, FR+EN as noted; production audit page run 7.
- Evidence (run 7, production `11e5cf71`): Hôtel Ha(a)ïtza audit -> "Regenerate the PDFs" -> 409 "…on physical page 11 at right by 1793.7px". The `11e5cf71` section naming does not apply because the box is outside any titled `section.sheet[id]` (`packages/report/src/pdf.ts`). No operator remedy beyond an identical retry.
- Evidence (run 6): Repro (local, run 6): 31-page prospecting audit of a real 5-star hotel -> confirm identity -> "Réécrire le rapport" (writing succeeds, FR+EN analyses stored) -> PDF production aborts: "Painted content <div> extends past the printable content rectangle on physical page 2 at right by 1793.7px". "Régénérer les PDF" reproduces it. Likely cause: `findings.json` contains a 771-character unbroken third-party script URL (hotel-widget CDN) that the report renders without wrapping. The operator has no way to fix it from the dashboard, so the paid report is blocked. The raw English exception is also still displayed next to the translated explanation.
- Suggested UX fix: Report rendering wraps or truncates unbreakable evidence strings so PDFs always fit; failures that still occur name the offending finding.
- Issue: #276.

### UX-021 (P2) Draft review shows only the subject: no body, recipient, language, preview link or mailbox link

- Status: FIXED. First seen: run 6. Last seen: run 10.
- Where: local dashboard, prospect journey, FR+EN as noted.
- Evidence: run 10 reopened the existing draft read-only in EN. The `#emails` card contained a rendered `pre` body (1426 characters; content not copied), recipient metadata, a two-option outreach-language control, preview and mailbox links, discard/revoke controls, and the deep link placed the card at the viewport top (`rootTop: 0`).
- Suggested UX fix: Reviewing a draft in the dashboard shows what will be sent and where, with a link to open it in the mailbox and a safe discard/recreate path.
- Issue: #277.

### UX-022 (P2) Prospect becomes "Contacté" at draft creation and outcomes can be recorded before anything was sent

- Status: OPEN. First seen: run 6. Last seen: run 6.
- Where: local dashboard, prospect journey, FR+EN as noted.
- Evidence: Repro (local, run 6): creating the first-email draft emitted `status-changed audited -> contacted` (actor automation) although nothing was sent; the Results view counts it as contacted. Recording "Aucune réponse" on that unsent thread succeeded silently (200, event stored), the select reset to "Enregistrer…" with no confirmation.
- Suggested UX fix: Status reflects what actually happened (drafted vs sent); outcome recording explains or refuses nonsensical transitions and confirms what was saved.
- Issue: #278.

### UX-023 (P2) Outreach action gates are stale after editing, and follow-up shows "Ready" when ineligible

- Status: OPEN. First seen: run 6. Last seen: run 6.
- Where: local dashboard, prospect journey, FR+EN as noted.
- Evidence: Repro (local, run 6): add an email on the prospect page -> summary shows it, but the Preview/First email cards still say "Bloqué - aucun email disponible" until a full reload (the actionability fetch is not refreshed after the record PATCH). With a first-email draft pending, the Follow-up card shows "Prêt"; clicking returns `{"created":false,"refusal":"thread-not-eligible"}` rendered as "Action refusée : Autre" (no label for `thread-not-eligible`). The recommended-action reason also shows a permanent "Loading…" when the action is available.
- Suggested UX fix: Gates refresh after every mutation, reflect the real server refusal set, and every refusal is translated with a remedy.
- Issue: #279.

### UX-024 (P2) Manual "Publier l'aperçu" is silently superseded by the first email and the hub never links to the preview

- Status: OPEN. First seen: run 6. Last seen: run 6.
- Where: local dashboard, prospect journey, FR+EN as noted.
- Evidence: Repro (local, run 6): "Publier l'aperçu" published a FR preview; "Premier email" then published a second preview and revoked the first ("superseded by a new first-email call"). The hub history lists previews only as status + raw preview UUID: no public link, no expiry, no revoke, and "Publier l'aperçu" stays offered as "Prêt".
- Suggested UX fix: One preview per outreach attempt, reused by the draft; the hub shows its link, expiry and a revoke action.
- Issue: #280.

### UX-025 (P2) Report writing gives no progress for a multi-minute model run and the request is dropped by the page

- Status: OPEN. First seen: run 6. Last seen: run 6.
- Where: local dashboard, prospect journey, FR+EN as noted.
- Evidence: Repro (local, run 6): "Réécrire le rapport" (label shown although nothing was ever written) -> `POST .../report-preparation/regenerate-writing` ended `ERR_ABORTED` in the browser while the server continued and finished FR+EN analyses ~5 min later. For the whole run the panel showed no busy state and still said "Aucune rédaction bilingue n'est encore disponible"; the button stayed enabled (double-launch risk). The result appeared only after a manual reload.
- Suggested UX fix: Writing runs as tracked background work with visible progress, a disabled launch while running, and automatic refresh on completion.
- Issue: #281.

### UX-027 (P2) Scan visits the page publishing the contact email but the operator must find and type it manually

- Status: OPEN. First seen: run 6. Last seen: run 6.
- Where: local dashboard, prospect journey, FR+EN as noted.
- Evidence: Repro (local, run 6): the prospecting audit crawled 31 pages including the homepage that publishes a generic contact address; the prospect stayed "Vérifier la fiche - ajoutez un email". The operator had to leave the dashboard to find the address. (Check `docs/rules/prospect-qualification.md` for whether role-address capture is deliberately excluded before fixing.)
- Suggested UX fix: Publicly published role addresses found during the scan are suggested on the prospect (with origin), for one-click operator acceptance.
- Issue: #283.

### UX-028 (P3) Prospect page and errors leak non-localized text and raw identifiers

- Status: OPEN. First seen: run 6. Last seen: run 6.
- Where: local dashboard, prospect journey, FR+EN as noted.
- Evidence: Repro (local, run 6), FR and EN: prospect history timestamps render as `9/15/2026, 8:44:55 PM` in both languages while Audits uses `15 sept. 2026, 20:45`; actors show raw `operator`/`scanner`/`automation`; unknown prospect shows raw `prospect not found`; the prospect eyebrow shows the prospect UUID; finding rows show internal ids such as `f006[html-validate:element-permitted-content]`; the email input placeholder stays French in EN; the detected commercial name defaults to the raw page title including rating stars and "Site Officiel".
- Suggested UX fix: Dates, actors and errors localized; internal ids hidden from operator surfaces; identity defaults reuse the prospect name.
- Issue: #284.

### UX-029 (P3) Nested main landmarks and buttons wrapped in links

- Status: OPEN. First seen: run 6. Last seen: run 6.
- Where: local dashboard, prospect journey, FR+EN as noted.
- Evidence: Every AppShell route renders a `<main>` inside the shell `<main>` (e.g. `/prospects`, `/annuaire`, prospect detail). "Ajouter depuis l'annuaire", "Ouvrir l'annuaire" and "Prospects" are `<button>` elements inside `<a>`, producing nested interactive controls. Unknown URLs redirect silently to `/audits` rather than the À traiter landing page.
- Suggested UX fix: One main landmark per page; links styled as buttons instead of nested controls.
- Issue: #285.

### UX-030 (P2) Audits list shows Complete and zero report issues for an audit whose report production failed

- Status: OPEN. First seen: run 7. Last seen: run 7.
- Where: production `/audits` vs `/audits/:id` vs `/a-traiter`, EN.
- Evidence: Hôtel Ha(a)ïtza audit reads Complete / "Report issues 0" while its page says report production failed and À traiter says Rapport à corriger. Status derives from the scan job only (`packages/interface/src/dashboard/routes/audits-model.ts:76`, `lib/job-outcome.ts`), so post-job regeneration failures never surface.
- Suggested UX fix: The Audits row, KPI and filter reflect the audit's current report-production state.
- Issue: #389.

### UX-031 (P2) Prospect page recommends a full scan while one is already running and hides the running job

- Status: OPEN. First seen: run 7. Last seen: run 7.
- Where: production prospect hub during full scan, FR.
- Evidence: Recommendation stays "Lancer un scan complet"; clicking returns `200 {started:false, refusal:"host-busy"}`, shown under outreach preparation with no link; response has no job id.
- Suggested UX fix: Show the in-flight scan with a progress link; refusals link to the blocking job next to the refused action.
- Issue: #390.

### UX-032 (P2) Approve-and-download is offered while the other language has no usable PDF

- Status: OPEN. First seen: run 7. Last seen: run 7.
- Where: production audit report panel, EN.
- Evidence: FR row offers "Approve (both languages) and download" while EN is Unverified; `audit-reports-section.tsx` gates on the row's own PDF only; server 409 would surface raw English (traced from source, not clicked on a client record).
- Suggested UX fix: Disable approval with a localized reason until both languages are fresh and verified.
- Issue: #391.

### UX-033 (P2) Findings inside a YouTube embed read as the site's own critical accessibility defects

- Status: OPEN. First seen: run 7. Last seen: run 7.
- Where: production quick-check audit page, FR.
- Evidence: Critique findings on `iframe[frameborder="0"] >>> .ytmVideoInfo…`; report-only `third-party-attribution.ts` table has no YouTube entry and the dashboard does not use it.
- Suggested UX fix: Attribute third-party embed findings in the dashboard and totals; decide grade treatment.
- Issue: #392.

### UX-034 (P2) Scan coverage counts do not reconcile: inventoried URLs vanish before the content check

- Status: OPEN. First seen: run 7. Last seen: run 10.
- Where: production `/scans/:id`, EN.
- Evidence: the operator-supplied real-site failure showed `Performance measured 216`, `Content checked 216`, `Inventoried 185`, and `Left out 0`, while the job also reported a visited-page URL missing from the inventory ledger. This violates the dashboard model's own nesting invariant: `coverageSegments` derives reached pages as `max(0, visited - checked - excluded)` and never validates `checked <= visited` (`packages/interface/src/dashboard/routes/scan-progress-model.ts:86-125`).
- Suggested UX fix: Every inventoried URL is in a visible bucket and counts reconcile.
- Issue: #393.

### UX-035 (P3) Directory marks chain portal sites as own websites and brand hotels as independent

- Status: OPEN. First seen: run 7. Last seen: run 7.
- Where: production `/annuaire`, FR.
- Evidence: marriott.fr, accor.com, hotel-bb.com rows show Site propre; MGallery and 25hours rows show Indépendant; `hotel-sources/directory-entry.ts:19`.
- Suggested UX fix: Chain portal domains get their own kind; brand names are not asserted independent.
- Issue: #394.

### UX-036 (P3) Outreach gates report a missing email before the missing full scan

- Status: OPEN. First seen: run 7. Last seen: run 7.
- Where: production prospect hub, new prospect, FR.
- Evidence: Preview/first email/follow-up all "aucun email disponible" before any scan; `packages/store/src/guards.ts:119` checks contact first.
- Suggested UX fix: Name the earliest missing prerequisite or all blockers.
- Issue: #395.

### UX-037 (P3) Outreach preparation says the primary site is not provided when it means no audit yet

- Status: OPEN. First seen: run 7. Last seen: run 7.
- Where: production prospect hub, FR.
- Evidence: "Site principal — Non renseigné" beside a Résumé that shows the URL; later "il y a 0 jour(s)".
- Suggested UX fix: Say "no audit of the primary site"; natural relative dates.
- Issue: #396.

### UX-038 (P3) Raw sector value, browser-locale dates and mixed commune casing on prospect surfaces

- Status: OPEN. First seen: run 7. Last seen: run 7.
- Where: production prospects list and hub, FR+EN.
- Evidence: Secteur `hotel` for directory adds; list dates `9/17/2026` in FR (`prospect-hub-list.tsx:440`); "ANTIBES" vs "La Teste-de-Buch". Follow-up to UX-028.
- Suggested UX fix: Localized sector labels, dashboard-language dates, consistent commune casing.
- Issue: #397.

### UX-039 (P3) Adding a prospect from the directory is logged as a record edit

- Status: OPEN. First seen: run 7. Last seen: run 7.
- Where: production prospect hub, FR.
- Evidence: First event "Fiche modifiée · Opérateur" after Annuaire add (`addDirectoryEntriesToProspects`, `field-edited`).
- Suggested UX fix: Creation event names its directory origin.
- Issue: #398.

### UX-040 (P3) Directory shows 0 establishments while a filter change is loading

- Status: OPEN. First seen: run 7. Last seen: run 7.
- Where: production `/annuaire`, FR.
- Evidence: "0 établissement(s)" before "2735" (`directory.tsx:101`).
- Suggested UX fix: Loading state or previous results while fetching.
- Issue: #399.

### UX-041 (P3) Content-check progress text renders under the performance phase

- Status: OPEN. First seen: run 7. Last seen: run 7.
- Where: production `/scans/:id`, EN.
- Evidence: "Content pages checked: 34/341." under Performance measurement (`scan-progress.tsx` stagedSummary placement).
- Suggested UX fix: Phase text sits under its phase.
- Issue: #400.

### UX-042 (P3) Login drops the requested page and does not associate the wrong-password error

- Status: OPEN. First seen: run 7. Last seen: run 7.
- Where: production `/login`, EN.
- Evidence: Expired session on `/prospects/:id` → `/login` with no return path (`lib/api.ts:45`); wrong password message without `aria-invalid`/`aria-describedby`.
- Suggested UX fix: Return to the requested same-origin path; associate the error.
- Issue: #401.

### UX-044 (P3) New scan rejects a bare domain instead of normalizing it

- Status: OPEN. First seen: run 7. Last seen: run 7.
- Where: production `/scans/new`, EN.
- Evidence: `atlantichotel.fr` rejected (`new-scan-model.ts:~152`).
- Suggested UX fix: Normalize to https and show the result.
- Issue: #403.

### UX-045 (P3) Audits table labels every prospect link Prospects instead of the hotel name

- Status: OPEN. First seen: run 7. Last seen: run 7.
- Where: production `/audits`, EN.
- Evidence: Link text is `strings.nav.prospects` (`audits.tsx:~258`) though summaries carry `prospectName`.
- Suggested UX fix: Link text is the prospect name.
- Issue: #404.

### UX-046 (P3) Unknown top-level dashboard paths return a bare server 404

- Status: OPEN. First seen: run 9. Last seen: run 10.
- Where: direct navigation to an unknown dashboard path, FR/EN.
- Evidence: the local interface server's direct `/does-not-exist` request still returns only the plain
  server body `Not found`: no dashboard shell, heading, language, or recovery
  link. `packages/interface/src/routes/static.ts` deliberately refuses the
  SPA fallback outside `APP_ROUTE_PREFIXES`, so the client router's catch-all
  recovery route never runs.
- Suggested UX fix: return a branded dashboard not-found state with a link to
  À traiter, or serve the shell for unknown authenticated paths and let the
  client catch-all handle them.
- Issue: none filed (run 10 audit only).

### UX-047 (P2) Prospecting inbox has no campaign-level mailbox/work-state overview

- Status: OPEN. First seen: run 9. Last seen: run 10.
- Where: `/a-traiter`, the operator's prospecting inbox.
- Evidence: the run-10 EN page still exposes only a row table and `Sync mailbox`;
  its successful `POST /api/outreach/mailbox-sync` response is reduced to one
  transient sentence and no freshness timestamp, account status, draft/sent/
  awaiting-reply counters, failure count, or state filters. The underlying work
  model can derive replies, follow-ups, draft review, outcomes, and report
  repair, yet the operator has no campaign-level view for those states.
- Suggested UX fix: add a compact campaign control plane with sync freshness,
  provider status, counts by actionable state, and filters linking to the
  corresponding prospect rows.
- Issue: none filed (run 9 audit only).

### UX-048 (P3) Audit detail shows no visible progress while its initial data request is slow

- Status: OPEN. First seen: run 9. Last seen: run 9.
- Where: `/audits/:auditId`, FR/EN.
- Evidence: 750ms after navigation to a live audit, the page had a `main` with
  `aria-busy="true"` but no visible heading, status text, or error; the same
  page settled into the audit content only after several seconds. The route
  has an accessible loading label, but it is not visible to the operator while
  waiting.
- Suggested UX fix: render an explicit visible loading state with the audit
  context and a slow-request/retry affordance, while retaining the accessible
  busy semantics.
- Issue: none filed (run 9 audit only).

### UX-049 (P1) Report-quality review tasks have no completable dashboard path

- Status: OPEN. First seen: run 10. Last seen: run 10.
- Where: `/a-traiter` report-quality attention row → `/audits/:auditId`,
  FR/EN by code contract; not reachable from the current local data because
  no safe quality-review fixture was available.
- Evidence: `packages/store/src/prospect-work.ts:457-476` emits a
  `report-quality-review` To-do row when a Plan-058 run is
  `needs-operator-review`; `packages/interface/src/dashboard/routes/a-traiter.tsx:129-155`
  renders the row and navigates to the audit. The server exposes the matching
  candidate/read/approve workflow at `packages/interface/src/routes/audits.ts:1107-1212`,
  but the dashboard has no caller for those endpoints and no candidate-bundle,
  exact-version review, approve/promote, or recovery controls. The audit route
  currently builds its operator snapshot with `attention: []` and no
  capabilities (`packages/interface/src/routes/audits.ts:731-752`); the
  browser action inventory confirmed the audit detail exposes no report-quality
  review action. A test-quality review item therefore lands in the inbox as a
  human gate that the operator cannot complete from the product.
- Suggested UX fix: open a localized review surface that shows the exact
  candidate and both language artifacts, provides safe review/approve or
  recovery actions, and clears the row only after the corresponding server
  state transition is confirmed.
- Issue: none (GitHub search found no duplicate; connector rejected the
  external issue creation during run 10).

### UX-050 (P2) Recovery shows prior-attempt progress during a new crawl

- Status: FIXED. First seen: run 11. Last seen: run 12.
- Where: production `/scans/:id`, active job after deployment recovery, FR.
- Evidence: run 11 showed the previous content-check count during a new crawl.
  Build `5da97bd2` now suppresses prior content and Lighthouse counts during
  crawl and explains that the new pass will count afterward. The deployed
  production job had passed crawl by run 12, so the message was not observed
  live; focused render and model regressions cover that state.
- Suggested UX fix: hide or identify progress from an incompatible prior checkpoint and explain when recovery has to restart a phase, so a reset does not look like lost or contradictory work.
- Issue: none (production finding recorded; no external issue filed).

### UX-051 (P3) Scan ETA forces horizontal overflow on a narrow screen

- Status: FIXED. First seen: run 11. Last seen: run 12.
- Where: production `/scans/:id`, active scan, FR and EN, 390px viewport.
- Evidence: after build `5da97bd2`, production FR at desktop and mobile widths
  and EN at 390px had no horizontal overflow; the ETA and progress details
  remained visible on mobile.
- Suggested UX fix: let the ETA fit or wrap within the viewport without hiding the phase label or progress details.
- Issue: none (production finding recorded; no external issue filed).

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

### UX-018 (was P1) Suppression lookup always failed with 404 - fixed, verified run 7

- Proof: production `11e5cf71`, `/ne-pas-contacter`, checking a test address -> `POST /api/outreach/suppression-check 200`, "This address is not on the do-not-contact list."
- Issue: #274.

### UX-026 (was P2) Audit detail always titled as client-report work - fixed, verified run 7

- Proof: production quick-check audit page shows eyebrow "Contrôle rapide", the hotel name as heading, and "Contrôle rapide : il sert à trier les prospects et ne couvre pas assez le site pour un rapport client"; the prospect hub says a quick check is not enough for outreach.
- Issue: #282.

### UX-016 (was P1) Mailbox reconciliation never ran - fixed, verified run 8

- Proof: the deployed dashboard now exposes `Synchroniser la boîte mail` /
  `Sync mailbox` on À traiter; the final production regression pass returned
  HTTP 200 with a configured mailbox and zero new sent/reply/review rows.
  Provider failures are surfaced as a safe failure response rather than an
  unhandled 500. The real draft-creation write remains separately unverified.
- Issue: #272.

### UX-043 (was P3) Unknown scan page was a dead end - fixed, verified run 9

- Proof: production `/scans/<unknown>` now renders the localized not-found
  state with a recovery link to `/audits` in the deployed build.
- Issue: #402.

### UX-050 (P2) Recovered crawl showed counts from the previous attempt - fixed in build 5da97bd2

- Proof: focused scan-progress render/model regressions verify stale 83/162 and
  15/162 counters are hidden during a new crawl and the localized recovery
  explanation appears. The live production scan had advanced beyond crawl
  before the post-deploy check, so that exact state was not observed live.
- Issue: none.

### UX-051 (P3) Scan ETA overflowed on a narrow screen - fixed in build 5da97bd2

- Proof: production FR desktop/mobile and EN mobile checks at 390px showed
  document width equal to viewport width; ETA and progress details remained
  visible.
- Issue: none.

## Deliberate register

(none recorded yet)
