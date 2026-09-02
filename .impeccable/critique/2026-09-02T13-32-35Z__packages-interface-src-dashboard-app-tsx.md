---
target: packages/interface/src/dashboard (operator dashboard, mode Operate)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
p2_count: 3
mode: Operate
audit_score: 14
audit_max: 20
timestamp: 2026-09-02T13-32-35Z
slug: packages-interface-src-dashboard-app-tsx
---
> Baseline caveats carried from the capture run: the working tree was
> mid-flight from plan 021 (i18n en/fr/types.ts, routes/scan-progress*,
> lib/api-types.ts are that plan's edited files), so findings on those exact
> surfaces may shift when 021 lands and are re-verified at plan 022 step 6.
> The companion technical audit for this same capture is
> `.impeccable/critique/dashboard-baseline-audit.md` (Health Score 14 of 20, also
> recorded as audit_score below). First run for this slug, so there is no trend yet.

# Dashboard critique baseline (plan 022 step 4, mode Operate)

Method: single-context inline (no sub-agent tool is exposed in this session; inline is the permitted path under critique.md hard invariants). Assessments A (design review) and B (detector + browser evidence) were run sequentially in this order: source and screenshot review first, detector output read only after the review notes were drafted.

## Capture context

- Vite-only dashboard dev server on http://localhost:3211 (strict port), stopped after the single batched capture round; `pgrep -fa vite` afterwards matched only an unrelated `pgrep -f vitest` wait loop from another session and the pgrep invocation itself, no vite process.
- Unauthenticated navigation: /login renders the login card; / redirects to /audits (App.tsx:28); every data route renders the authenticated shell with its first-load error state because the API proxy returns 500. No 401 redirect fired because no request reached the real API (lib/api.ts:28 redirect logic untested in this capture).
- Screenshots (full page, DPR 1): .impeccable/review/dashboard-{login,audits,scans-new,prospects,outreach,drafts}-{desktop,mobile}.png, desktop 1440x900, mobile 390x844. dashboard-prospects-mobile.png is 581x1258 because the page overflows horizontally (see P1-3).

## Design specificity verdict

Authored for this product, not category-interchangeable. The operator vocabulary is the charter's own (Audits, Prospects, Demarches, SIREN, Parques), severity colors are the same shades the PDF report uses (theme.css:40-41, 57-60), the honest constraint copy ("La revue n'envoie jamais.", "Odysseus ne peut pas envoyer de brouillons.") exists nowhere else in the category, and the monochrome white-accent theme is a deliberate documented world (theme.css:36-41). The standard console shell (sidebar, header, cards) is correct for Operate mode; brand lives in precise details, and the details are here. The least designed surfaces are the error states, which currently borrow their copy from the network layer instead of the product voice.

### Deterministic scan (Assessment B)

`node .agents/skills/impeccable/scripts/detect.mjs --json packages/interface/src/dashboard` ran DEGRADED: the HTML parser modules (htmlparser2, css-select, css-tree, domutils) are unavailable, so it fell back to regex matching; custom property evaluation, selector matching, and computed contrast were skipped and findings are an undercount. It reported 4 findings, all `overused-font` (Inter) at theme.css lines 8, 15, 22, 29.

Verification: these are false positives in this context. Inter is a pinned, documented cross-surface decision: the self-hosted woff2 files are canonical in packages/report/src/fonts and copied by vite.config.ts (copyInterFonts plugin, vite.config.ts:14-29) precisely so dashboard and client report cannot drift onto different fonts. Operate mode explicitly blesses one well-tuned sans for product UI. No action recommended; do not re-litigate the font as part of plan 022.

## Overall impression

A disciplined, coherent operator console that is much more considered than its age suggests: one shell, one header pattern, real loading/empty/error/polling states, Radix primitives, tokens everywhere. Its two structural weaknesses are both about truthfulness at the edges: quantities are rendered as confident zeros when the data is unknown, and failure copy is whatever the fetch layer threw. Fix those two and the floor rises sharply.

## What's working

- State architecture: every data route distinguishes first-load skeleton, keep-last-good-data with a quiet role=alert line, full error card with Retry, true empty state, and stale-while-error (audits.tsx:137-178, use-polling.ts:21-24). The keep-last-data rule is exactly right for a console an operator is reading mid-scan.
- Honest product copy as reassurance: drafts page states the never-send guarantee above the fold (drafts.tsx:197-202), login maps 401/429/400-auth-not-configured to distinct, human copy (login.tsx:62-71).
- Consistent primitives with real states: Button has default/hover/active/disabled/loading (button.tsx:24-29, 47), PageHeader keeps one opening rhythm (page-header.tsx), focus-visible is global (theme.css:141-144), Field wires label + hint + role=alert error (field.tsx).

## Heuristic scores

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Failed loads render as confident zeros: KPI tiles compute from data ?? [] (audits.tsx:98); outreach hub omits counts on failure (outreach-index.tsx:63) |
| 2 | Match System / Real World | 3 | French operator vocabulary excellent; raw English error strings leak into the French UI |
| 3 | User Control and Freedom | 3 | Confirms on destructive actions, cancel, retry, pagination, Escape on drawer; no undo after delete (confirmed instead) |
| 4 | Consistency and Standards | 3 | One shell and one error-card pattern everywhere; prospects filters visually unlabeled while audits selects are content-labeled |
| 5 | Error Prevention | 3 | ConfirmDialog on stop/delete/clear-queue, inline URL/SIREN validation, clear-queue shown only when queued > 0 (audits.tsx:306-310) |
| 6 | Recognition Rather Than Recall | 2 | Four identical "Tous" selects with aria-labels but no visible labels (prospects.tsx:264-338); InfoTip hints are title-only (info-tip.tsx:11) |
| 7 | Flexibility and Efficiency | 2 | Search, sort, filters, FR/EN present; no keyboard accelerators, no bulk review of drafts |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained monochrome, consistent tokens; 6-tab segmented row crowds mobile; right column very sparse on lists |
| 9 | Error Recovery | 2 | Retry is always offered, but the message is raw "Request to /api/... failed (500)" with no cause or next step |
| 10 | Help and Documentation | 2 | Three InfoTips and field hints only; nothing else contextual |
| **Total** | | **25/40** | **Acceptable (20-27): significant improvements needed before operators are happy** |

## Cognitive load

Checklist failures: 2 (minimal choices, working memory), both concentrated on Prospects: 6 queue tabs + 4 unlabeled filter selects + 10 table columns is one decision surface too many, and the operator must remember what each "Tous" select means. Moderate load; address with visible filter labels and grouped filters.

## Emotional journey

Peak: the honest constraint notes and the clean new-scan form. Valley: any failure moment, where the product's voice is replaced by "Request to /api/scans?limit=200 failed (500)". Peak-end matters here because an operator session often ends on whatever the last poll error said.

## Priority issues

### P1-1: Raw technical error strings replace product error copy
- Where: lib/api.ts:36 fallback `Request to ${url} failed (${response.status})`, rendered verbatim at routes/audits.tsx:142, routes/prospects.tsx:121, routes/drafts.tsx:65; same leak in toasts at routes/audit-detail.tsx:333, 363, 483, 499 and routes/new-scan.tsx:64.
- Why it matters: violates the charter rule that user-facing strings are French and English from the start; an operator cannot tell server-down from bug from permission, and the English URL breaks trust in a French-first console.
- Evidence: .impeccable/review/dashboard-audits-desktop.png, dashboard-drafts-desktop.png, dashboard-drafts-mobile.png.
- Suggested command: clarify (localized cause-specific copy with a secondary technical detail line).

### P1-2: Unknown data renders as confident zeros
- Where: routes/audits.tsx:98 (`computeKpis(data ?? [])`) feeding tiles at audits.tsx:321-341; routes/outreach-index.tsx:63-65 (count omitted when its fetch fails, so unknown and zero are indistinguishable).
- Why it matters: during an API outage the Audits page asserts "En cours 0 / Termines 0 / Echecs 0 / Constats critiques 0", which an operator can read as "nothing ran" and act on. Violates the plan's complete-states floor.
- Evidence: .impeccable/review/dashboard-audits-desktop.png, dashboard-outreach-desktop.png.
- Suggested command: harden (render an em dash or a muted unknown state for KPIs and hub counts while error and no data).

### P1-3: Prospects queue tabs force page-level horizontal scroll on mobile
- Where: components/ui/segmented.tsx:22 (`inline-flex` with no wrap or scroll) triggered by the six long French labels at routes/prospects.tsx:253-258.
- Why it matters: the 390px document is 581px wide, so the whole page, not just the tab row, pans sideways; the operator loses layout context.
- Evidence: .impeccable/review/dashboard-prospects-mobile.png (581x1258 full-page capture proves the overflow).
- Suggested command: adapt (scrollable or wrapping segmented row on narrow viewports).

### P1-4: Prospects filter selects have no visible labels
- Where: routes/prospects.tsx:264-338, four Selects carrying aria-label only (identityStatus, groupStatus, reviewState, qualification) and all rendering "Tous".
- Why it matters: recognition failure on the main working surface; sighted operators must open each select or memorize positions (WCAG 3.3.2 intent, heuristic 6).
- Evidence: .impeccable/review/dashboard-prospects-desktop.png, dashboard-prospects-mobile.png.
- Suggested command: clarify (visible labels, or floating prefix inside the closed select).

### P2-1: ink-muted on raised is 4.48:1, under the 4.5:1 floor (code-verified, not screenshot-verified)
- Where: theme.css:51 (--color-ink-muted #7b808a) on theme.css:45 (--color-raised #17181a); hit by segmented inactive labels (segmented.tsx:33), language switcher inactive (language-switcher.tsx:26), and input placeholders (input.tsx:6). All other measured token pairs pass (ink-muted on panel 4.77:1, on base 5.03:1, danger on panel 5.43:1, sev badges 4.76-7.71:1, primary button label 17.95:1).
- Why it matters: the plan's binding accessibility floor is 4.5:1 for body text; this misses by a hair on 12-13px text.
- Suggested command: polish (lighten ink-muted one step or darken raised).

### P2-2: InfoTip hints are not keyboard reachable
- Where: components/ui/info-tip.tsx:9-15, hint lives in a `title` attribute on a non-focusable span.
- Why it matters: keyboard-only operators and screen reader users get the label but never the hint that explains score, qualification, and review columns.
- Suggested command: polish (focusable trigger with a real popover, or inline the hint).

### P2-3: The axe suite covers 4 of 17 routes and only empty states
- Where: accessibility.test.ts:91-117 (Prospects, Outreach hub, Drafts, Suppressions with empty-page stubs); AuditsPage, LoginPage, NewScanPage, detail and progress routes are never axe-scanned, nor are loaded or error states.
- Why it matters: the suite is the project's regression floor for WCAG; the pages where P1-1 and P1-2 live are outside it.
- Suggested command: harden (extend coverage, including the error-card state).

### P3 (polish only)
- Staggered KPI entrance animation is decorative load choreography (audits.tsx:321-341); Operate mode discourages orchestrated page-load sequences.
- Mobile drawer is role=dialog with Escape but has no focus trap and no scroll lock (shell.tsx:80-104).
- Login page has no brand mark or product context (login.tsx:87-111); it is the one pre-auth surface and currently says only "Connexion".
- Row click navigation is mouse-only but the visible Link inside each row is the documented keyboard path (audits.tsx:211-219, prospects.tsx:171-179); acceptable, worth keeping as the pattern.

## Persona red flags

**Alex (power user)**: no keyboard accelerators anywhere; draft review is strictly one approve/skip at a time (drafts.tsx:128-150); no bulk actions on audits or prospects; filters have no reset-all. Alex stays because the console is fast and predictable, not because it is efficient.

**Sam (accessibility-dependent user)**: global focus-visible works (theme.css:141-144); row links and buttons are real focusable elements with aria-labels; status is never color-only (StatusDot is paired with a text label, audits.tsx:225-228). Sam's blockers: segmented inactive labels at 4.48:1 (P2-1), title-only hints invisible to keyboard (P2-2), speech-input users get no visible name to speak on the four prospects selects (P1-4).

**Riley (stress tester)**: refreshing mid-flow is safe (URL is state, polls re-fetch); the unknown-as-zero renders (P1-2) and silent hub counts are exactly the "appears to work but lies" class Riley hunts; reduced motion is respected and the indeterminate progress bar degrades to a readable static segment (progress-bar.tsx:26-27 with theme.css:146-154).

## Questions skipped: baseline run dispatched by the plan 022 coordinator; findings feed the plan's next step rather than an interactive session.
