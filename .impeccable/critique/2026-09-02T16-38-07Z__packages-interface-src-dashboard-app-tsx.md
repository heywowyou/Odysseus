---
target: packages/interface/src/dashboard (operator dashboard, mode Operate)
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
p2_count: 3
mode: Operate
audit_score: 16
audit_max: 20
timestamp: 2026-09-02T16-38-07Z
slug: packages-interface-src-dashboard-app-tsx
---
> Post-fix closing evaluation for plan 022. Evidence: the twelve
> .impeccable/review/dashboard-fix-*.png captures (desktop 1440x900, mobile
> 390x844) taken with the backend intentionally down, so error and unavailable
> states are deliberate evidence, not defects. Every claim below was verified
> against current source under packages/interface/src/dashboard. Baseline:
> 25/40 heuristics, audit 14/20 (.impeccable/critique/2026-09-02T13-32-35Z__packages-interface-src-dashboard-app-tsx.md
> and .impeccable/critique/dashboard-baseline-audit.md). The technical audit
> for this pass is included at the bottom of this file; its score is carried
> as audit_score in the frontmatter.

# Dashboard critique, post-fix pass (plan 022 close, mode Operate)

Method: single-context inline (no sub-agent tool is exposed in this session; inline is the permitted path under critique.md hard invariants). Assessment A ran first on captures and source; Assessment B evidence is the coordinator-verified final detector state, read only after the review notes were drafted. The detector was not re-run: its bounded budget is spent.

## Verification of the baseline fixes (all confirmed in captures and source)

- P1-1 raw error strings: fixed. Every full-error card now leads with the localized headline `strings.common.requestFailed` ("La requête a échoué. Réessayez.", fr.ts:41) and demotes the technical string to a muted secondary line (audits.tsx:148-149, prospects.tsx:122-123, drafts.tsx:65-66). Every `toast.error` now carries a localized headline with the raw message as description only (audits.tsx:126, 136; audit-detail.tsx:342, 374, 496, 513; prepare-report-card.tsx:189, 203, 222, 236; new-scan.tsx:66; scan-progress.tsx:109; prospect-detail.tsx:136; suppressions/replies/outcomes/drafts use localized role=alert lines).
- P1-2 unknown-as-zero: fixed. KpiTile is tri-state loaded/loading/unavailable (kpi.tsx:9, 24-37) and audits feeds it `data !== undefined ? 'loaded' : error ? 'unavailable' : 'loading'` (audits.tsx:103-104, 361-363). Hub counts are a four-state type with an explicit unavailable marker (outreach-index.tsx:13-35). Captures show "Indisponible" on all four audit KPIs and three hub counts.
- P1-3 prospects mobile overflow: fixed. SegmentedControl is now `inline-flex max-w-full flex-wrap` (segmented.tsx:22-25); the 390px prospects capture wraps the six queues onto three lines inside the viewport, no page-level pan.
- P1-4 unlabeled filter selects: fixed. All four prospects selects are wrapped in `Field` with visible labels and htmlFor/id wiring (prospects.tsx:290-401); labels visible in both captures.
- P2-1 ink-muted contrast: fixed. theme.css:57 is now #898e96 with the measured pairs recorded in the comment (base 6.05, panel 5.74, raised 5.39, row hover 5.60, accent tint over panel 4.59); independently recomputed worst pair 4.59:1, clears the 4.5:1 floor.
- P2-2 InfoTip keyboard access: fixed. Radix tooltip with a focusable button trigger, role=tooltip content in a portal, aria-describedby (info-tip.tsx:11-34).
- P2-3 axe coverage: fixed. accessibility.test.ts now scans 17 routes (login, audits, audit detail, new scan, scan progress, prospects, prospect detail, prescan, score, evidence, preview, vendors, outreach hub, drafts, replies, suppressions, outcomes) with settled stubs, not just four empty pages.

## Design specificity verdict

Authored for this product, and more so than at baseline. The failure moments now speak the product's voice instead of the fetch layer's: "La requête a échoué. Réessayez." with a muted technical line is exactly the honest, limits-first register the charter asks for, and "Indisponible" as a first-class state ("a blank where a value failed to load is honest; a confident zero is not") is a rule most consoles in this category do not have. Operator vocabulary (Audits, Prospects, Démarches, "La revue n'envoie jamais.", "La liste ne garde que des codes illisibles, jamais les adresses.") remains unfakeable. The white-accent monochrome system is unchanged and still disciplined.

### Deterministic scan (Assessment B, carried state, not re-run)

4 findings, all `overused-font` on Inter in theme.css, dismissed as false positives by the recorded decision to pin self-hosted Inter across dashboard, report, and site. The detector runs DEGRADED (htmlparser2 chain unavailable), so deterministic contrast coverage is replaced by hand-computed pairs (ink-muted #898e96 clears 4.5:1 on every surface it sits on, worst pair 4.59:1 on the accent tint) and the axe suite, which now covers all 17 routes and passes. No new deterministic findings to weigh.

## Overall impression

The two structural weaknesses the baseline called out (untruthful zeros, borrowed failure copy) are both gone, and the floor rose exactly as predicted. What remains is second-order: one unreachable retry, one state-idiom ambiguity, one raw identifier surfaced to the operator. The single biggest opportunity for the next round is finishing the honesty work at the edges: give the outreach hub a way back, and never let a failure wear the empty-state costume.

## What's working

- The tri-state value pattern is now systemic, not a patch: the same loaded/loading/unavailable contract drives KPI tiles (kpi.tsx), hub counts (outreach-index.tsx:13-35), and the localized "Indisponible" label comes from the string tables (fr.ts:51). An operator mid-outage now sees truthful everywhere.
- Error copy has a home and a pattern: localized headline, muted technical detail, explicit retry, consistent from list cards to toasts to the report preparation card (prepare-report-card.tsx:147-148), with comments documenting the contract (audit-detail.tsx:340-341, new-scan.tsx:64-65).
- The axe regression floor went from 4 routes to 17 with real document stubs and a settle loop (accessibility.test.ts:79-115), so the pages where the P1s used to live are now protected.

## Heuristic scores

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Every data surface distinguishes loading (skeleton), loaded (value), unavailable ("Indisponible"), and stale-while-error (kept data + role=alert); mutations confirm via toasts with loading spinners; polls stamp updated-at |
| 2 | Match System / Real World | 3 | French product voice everywhere headlines appear; residual raw English technical detail lines (deliberate, diagnostic) and raw candidateId in the drafts table |
| 3 | User Control and Freedom | 3 | Confirms on destructive actions, cancel, retry, pagination, Escape on drawer and dialogs; no undo after delete (confirmed instead), no reset-all on filters |
| 4 | Consistency and Standards | 3 | One shell, one header, one value pattern; new minor deviations: detail-route failure rendered in dashed empty-state chrome versus solid danger-headed error cards on list routes; suppression form label styled off-Field |
| 5 | Error Prevention | 3 | ConfirmDialog on stop/delete/clear-queue, inline URL/SIREN validation, empty-patch save short-circuit (audit-detail.tsx:357-363), clear-queue only when queued > 0, submits disabled while pending |
| 6 | Recognition Rather Than Recall | 3 | Visible filter labels and keyboard-reachable tooltips clear the baseline dings; drafts rows identified by raw candidateId force recall (drafts.tsx:110) |
| 7 | Flexibility and Efficiency | 2 | Search, sort, filters, FR/EN, ?url= prefill, row-click shortcuts; still no keyboard accelerators, no bulk draft review, no filter reset-all |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained monochrome holds in every capture; list pages leave the lower half empty on desktop; wrapped segmented row no longer crowds mobile |
| 9 | Error Recovery | 3 | Localized headline plus explicit Réessayer on every failure, keep-last-data during transient polls, dedicated 404 state; one generic headline for all causes (not cause-specific), hub failure has no retry |
| 10 | Help and Documentation | 3 | InfoTips now genuinely reachable (keyboard + screen reader), field hints, honest constraint notes; nothing searchable, acceptable for a single-operator console |
| **Total** | | **30/40** | **Good (28-35): address weak areas, solid foundation** |

## Cognitive load

Checklist failures: 1 (minimal choices). The prospects working surface still stacks six queue tabs, four filter selects, and ten columns, but the labeled filters remove the working-memory failure and the wrapping removes the mobile crowding. Low-to-moderate load; grouping filters into fewer controls is the remaining move.

## Emotional journey

Peak: the honest constraint notes and the now-honest "Indisponible" states, which read as the product keeping its word under failure. Valley: fixed at the headline level; what remains of the valley is the hub's silent dead end (see P2-1). Peak-end matters because an operator session still often ends on a poll error line, and that line now leads with the product's voice.

## Priority issues

No P0, no P1. All four baseline P1s are verified fixed. The top issues are P2.

### P2-1: Outreach hub failure is a dead end with no recovery path
- Where: routes/outreach-index.tsx:42-44 (useApi single fetch, no poll) and lib/use-api.ts:11 (intervalMs 0); the page renders no retry control.
- Why it matters: when the four hub fetches fail, every card shows "Indisponible" and nothing will change it; the operator must know to navigate away and back. Violates the page's own stated contract that "unknown never reads as zero pending items" by leaving unknown permanent.
- Evidence: dashboard-fix-outreach-desktop.png, dashboard-fix-outreach-mobile.png; source verified.
- Fix: add a retry that refetches the three paths (the useApi refresh already exists in PollingState), or poll the hub like the list pages do.
- Suggested command: harden

### P2-2: A failed detail page wears the empty-state costume
- Where: routes/audit-detail.tsx:527-541 renders the full-error state through EmptyState, whose chrome is the system's one dashed border with a neutral ink title (empty-state.tsx:12-14); list routes render failure as a solid Card with a danger-red headline (audits.tsx:144-155, prospects.tsx:118-129, drafts.tsx:61-72).
- Why it matters: "no data" and "load failed" are different facts that now share one visual signature on detail routes; the operator must read the title to tell them apart, and the danger tone disappears exactly where scans (the costliest objects) fail to load.
- Evidence: dashboard-fix-audit-detail-desktop.png and -mobile.png (dashed, neutral) versus dashboard-fix-audits-desktop.png (solid, red headline).
- Fix: give the detail route the same solid error card the list routes use, or add an explicit error variant to EmptyState with the danger headline.
- Suggested command: polish

### P2-3: Drafts review table identifies hotels by raw candidateId
- Where: routes/drafts.tsx:110 renders `draft.candidateId` as the primary cell of the hotel column.
- Why it matters: the operator approves or skips real hotels but sees pipeline identifiers ("cand-...") instead of names; the prospects pages resolve names, so the review surface demands recall the data model already answers. Against the brief's rule that every label be understandable on sight.
- Evidence: source verified; not visible in captures because the drafts route was not re-captured (its error state was, drafts.tsx:61-72 pattern intact).
- Fix: resolve and render the hotel name (and keep candidateId as the muted secondary line), or join the name into the drafts response.
- Suggested command: clarify

### P3 (polish only, carried or new)
- Staggered KPI entrance remains decorative load choreography (audits.tsx:352-357); Operate mode discourages orchestrated page-load sequences.
- Mobile drawer is role=dialog with Escape but still has no focus trap and no scroll lock (shell.tsx:80-104).
- Login page still carries no brand or product context (login.tsx:87-111); it is the one pre-auth surface and says only "Connexion".
- Small buttons are 32px tall (button.tsx:18), under the 44px touch guideline on mobile.
- Technical detail lines are unlocalized English by design (lib/api.ts:36 rendered at audits.tsx:149 and siblings); acceptable as diagnostics, worth a recorded decision.
- The axe suite scans settled initial, empty, and loaded states but no error state (accessibility.test.ts:28-37), so the DOM this pass praises in screenshots is again outside the suite's protection.
- Suppressions form label is hand-rolled `text-sm text-ink` while every Field label is `text-[13px] text-ink-soft` (suppressions.tsx:62 versus field.tsx:13).

## Persona red flags

**Alex (power user)**: unchanged verdict; no keyboard accelerators, no bulk draft review, no reset-all filters. The console is fast and predictable, not efficient. Alex will ask for bulk approve on drafts first.

**Sam (accessibility-dependent user)**: baseline blockers cleared one by one: contrast floor holds on every pair (worst 4.59:1), tooltips open on keyboard focus with role=tooltip and aria-describedby, all four prospects filters have visible labels wired by htmlFor/id, axe passes on all 17 routes. Remaining: the mobile drawer does not trap focus (shell.tsx:80-104), and 32px small buttons sit under the 44px touch floor.

**Riley (stress tester)**: the "appears to work but lies" class is closed: unknown is never zero anymore. Refreshing mid-flow stays safe (URL is state, polls re-fetch, dirty forms are never clobbered by refetch, prepare-report-card.tsx:136-141). Riley's remaining find is the hub dead end (P2-1): a failure that looks settled until you notice nothing will ever retry.

## Minor observations

- The audits page status and sort selects remain aria-label-only, but their closed state displays the chosen value ("Tous les statuts", "Plus récents d'abord"), so they are self-describing; the baseline's distinction still holds.
- Empty-patch save short-circuits with a success toast instead of a 400 round trip (audit-detail.tsx:357-363); nice prevention detail worth replicating.
- "gmail" badge on drafts (drafts.tsx:122) is a provider name in an otherwise French table; fine, but it is the only English noun left besides diagnostics.

## Technical audit (companion, Health Score 16/20)

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Verified contrast pairs clear 4.5:1 (worst 4.59:1), keyboard-reachable tooltips, axe green on 17 routes; drawer lacks a focus trap, 32px touch targets, error states unscanned |
| 2 | Performance | 3 | Skeletons over spinners, transform/opacity-only motion, keyed polling with keep-last-data, only assets are four woff2 files; nothing regressed |
| 3 | Responsive Design | 3 | 390px overflow fixed and capture-verified (segmented wraps, filters stack, tables scroll in their own containers); touch targets remain under 44px |
| 4 | Theming | 3 | Complete token system, dark-only by documented decision, the ink-muted step now documented with measured pairs in-theme; three deliberate hard-coded values remain (button.tsx:11, dialog.tsx, shell.tsx:83) |
| 5 | Implementation Integrity | 4 | The one systemic violation (error copy bypassing i18n) is eliminated with a documented pattern; detector findings are dismissed false positives; remaining deviations are isolated |
| **Total** | | **16/20** | **Good: address weak dimensions** |

Implementation integrity verdict: pass, now cleanly. The implementation expresses a coherent, intentional, product-specific system: one shell, one value-state contract, error copy flowing through the string tables with the technical string demoted by documented convention, route logic in tested model files, and comments that record reasons. The detector's four findings remain recorded false positives (pinned Inter), and the degraded parser chain is compensated by hand-computed contrast pairs and the 17-route axe suite.

Questions skipped: closing evaluation pass dispatched by the plan 022 coordinator; scores compare against the recorded baseline and new findings feed the next round rather than an interactive session.
