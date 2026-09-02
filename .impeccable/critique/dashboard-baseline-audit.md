---
target: packages/interface/src/dashboard (operator dashboard, mode Operate)
snapshot: plan-022 step 4 baseline, technical audit
captured: 2026-09-02
context: >-
  Baseline captured with the backend API down (Vite-only server, /api proxy
  500s) as the task directs; error and empty states are capture context, not
  defects. Tree mid-flight from plan 021: i18n en/fr/types.ts, routes/
  scan-progress*, and lib/api-types.ts are concurrently edited and findings
  touching them may shift when plan 021 lands. Detector ran in degraded
  regex-fallback mode (parser modules unavailable), so findings are an
  undercount. This file is the companion technical audit, not a critique
  snapshot: the canonical snapshot for this surface is
  2026-09-02T13-32-35Z__packages-interface-src-dashboard-app-tsx.md, which
  carries this audit's score as audit_score. The mechanical slug for the
  dashboard target (packages/interface/src/dashboard/App.tsx) is
  packages-interface-src-dashboard-app-tsx.
audit_total: 14
audit_max: 20
p0_count: 0
p1_count: 4
p2_count: 3
---

# Dashboard audit baseline (plan 022 step 4)

## Audit Health Score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Global focus-visible, Radix dialog, role=alert, aria-valued progressbar; one marginal 4.48:1 token pair (ink-muted on raised) and title-only hints |
| 2 | Performance | 3 | Skeletons over spinners, transform/opacity-only animations, polling with keys and keep-last-data; only assets are 4 self-hosted woff2 files |
| 3 | Responsive Design | 2 | Verified 581px document on a 390px viewport on /prospects (segmented row cannot wrap or scroll, segmented.tsx:22); primary/sm touch targets are 32px tall, under 44px |
| 4 | Theming | 3 | Complete token system, dark-only by documented decision; two deliberate hard-coded values outside tokens (button.tsx:11 text-[#08090a], dialog.tsx:23 bg-black/70, shell.tsx:83 bg-black/60) |
| 5 | Implementation Integrity | 3 | Coherent, documented, product-specific system; one repeated shortcut: error copy bypasses i18n at 7+ call sites (lib/api.ts:36 rendered at audits.tsx:142, prospects.tsx:121, drafts.tsx:65; toasts at audit-detail.tsx:333, 363, 483, 499, new-scan.tsx:64) |
| **Total** | | **14/20** | **Good: address weak dimensions** |

## Implementation integrity verdict

Pass. The implementation expresses a coherent, intentional, product-specific system: one shell and one error-card idiom across routes, a documented token world (theme.css:36-41) shared deliberately with the client report (vite.config.ts:14-29), route logic extracted into tested model files, and comments that record the reasoning behind decisions rather than restating code. The detector's only findings (4x Inter at theme.css:8,15,22,29) are false positives for this surface: the font is a pinned cross-surface decision, and the detector ran degraded (regex fallback, undercount). The single integrity gap is systemic error copy: the fetch layer's English fallback message is user-facing in a French-first product, which is a repeated shortcut, not a one-off.

## Detailed findings by severity

- **[P1] Raw technical error strings replace localized error copy**
  - Location: lib/api.ts:36; rendered at routes/audits.tsx:142, routes/prospects.tsx:121, routes/drafts.tsx:65; toasts at routes/audit-detail.tsx:333, 363, 483, 499 and routes/new-scan.tsx:64
  - Category: Implementation Integrity / Accessibility (plain language)
  - Impact: operators see English URL + status in a French console and cannot classify the failure
  - Standard: charter rule that user-facing strings are French and English from the start
  - Recommendation: map ApiError statuses to i18n copy per surface; keep the technical detail as a secondary muted line
  - Suggested command: $impeccable clarify

- **[P1] Unknown data renders as confident zeros**
  - Location: routes/audits.tsx:98 (computeKpis(data ?? [])), tiles at audits.tsx:321-341; routes/outreach-index.tsx:63-65 (failed count fetch silently omits the count)
  - Category: Implementation Integrity / complete states
  - Impact: during an outage the Audits KPIs assert "En cours 0 / Termines 0 / Echecs 0 / Constats critiques 0"; hub cards cannot be distinguished from zero pending items
  - Recommendation: unknown state (em dash or muted placeholder) for KPIs and hub counts while error and no last-good data
  - Suggested command: $impeccable harden

- **[P1] /prospects overflows the 390px viewport**
  - Location: components/ui/segmented.tsx:22 (inline-flex, no wrap/scroll) with six long labels from routes/prospects.tsx:253-258
  - Category: Responsive
  - Impact: full-page horizontal pan on mobile (581px document, evidence .impeccable/review/dashboard-prospects-mobile.png at 581x1258)
  - Recommendation: allow the segmented row to scroll horizontally within its own container or wrap on narrow viewports
  - Suggested command: $impeccable adapt

- **[P1] Prospects filter selects have no visible labels**
  - Location: routes/prospects.tsx:264-338 (aria-label only on four selects, all showing "Tous")
  - Category: Accessibility (WCAG 3.3.2 intent) / Usability
  - Impact: sighted and speech-input operators cannot tell which filter is which
  - Recommendation: visible labels above selects, or a persistent prefix in the closed select
  - Suggested command: $impeccable clarify

- **[P2] ink-muted on raised is 4.48:1 (floor 4.5:1)** (code-verified, not screenshot-verified)
  - Location: theme.css:51 on theme.css:45; consumed at segmented.tsx:33, language-switcher.tsx:26, input.tsx:6 (placeholders)
  - Category: Accessibility (WCAG 1.4.3)
  - Recommendation: lighten --color-ink-muted one step (e.g. toward #83889* range) or darken --color-raised; recheck all pairs
  - Suggested command: $impeccable polish

- **[P2] InfoTip hints keyboard-inaccessible**
  - Location: components/ui/info-tip.tsx:9-15 (hint in title attribute on non-focusable span)
  - Category: Accessibility (WCAG 1.4.13 content on hover; keyboard)
  - Recommendation: focusable trigger with a real popover, or move hints inline
  - Suggested command: $impeccable polish

- **[P2] axe suite covers 4 of 17 routes, empty states only**
  - Location: accessibility.test.ts:91-117
  - Category: Implementation Integrity (regression floor)
  - Impact: AuditsPage, LoginPage, NewScanPage, detail/progress routes, and all error states are outside the suite's protection
  - Recommendation: extend coverage; the error-card state is where the current P1s live
  - Suggested command: $impeccable harden

- **[P3] Decorative staggered KPI entrance (audits.tsx:321-341); mobile drawer lacks focus trap and scroll lock (shell.tsx:80-104); login page carries no brand or context (login.tsx:87-111); primary/sm touch targets 32px tall (button.tsx:18-20) under the 44px guideline on touch devices. Suggested command: $impeccable polish (after P1/P2).**

## Patterns and systemic issues

- State architecture is genuinely complete for list routes (skeleton / keep-last-data + quiet alert / full error + retry / true empty / stale footer), but truthfulness inside those states is uneven: quantities default to zero instead of unknown.
- Error copy has no home in the string tables: lib/api.ts builds user-facing English text, so every surface inherits a charter violation from one line.
- One component (SegmentedControl) owns the only responsive failure; every table already scrolls in its own container (table.tsx:6).

## Positive findings

- Global :focus-visible with 2px accent outline (theme.css:141-144); reduced-motion block keeps all state readable and the indeterminate progress bar degrades to a static segment (progress-bar.tsx:26-27, theme.css:146-154).
- Contrast is healthy everywhere except one marginal pair: measured ink on base 18.73:1, ink-soft on panel 7.62:1, ink-muted on panel 4.77:1, danger on panel 5.43:1, severity badge text 4.76-7.71:1, primary button label 17.95:1.
- Destructive actions all pass ConfirmDialog with distinct copy per action (audits.tsx:382-421, dialog.tsx:57-101); clear-queue is shown only when queuedCount > 0 (audits.tsx:306-310).
- i18n discipline is strong: default fr with storage fallback (provider.tsx:30-39), document.lang kept in sync (provider.tsx:54-56), a strings-parity test exists (i18n/strings-parity.test.ts), and honest constraint copy is in the tables, not hardcoded.
- Polling keeps last good data on screen (use-polling.ts:21-24) and surfaces stale-then-updated timestamps (audits.tsx:284-291).

## Recommended actions

1. **[P1] $impeccable clarify**: localized, cause-specific error copy replacing raw api.ts fallbacks in cards and toasts.
2. **[P1] $impeccable harden**: unknown-state KPIs and hub counts; extend the axe suite to Audits, Login, New scan and error states.
3. **[P1] $impeccable adapt**: segmented control wrap/scroll on narrow viewports; revisit 44px touch targets on mobile while there.
4. **[P1] $impeccable clarify** (prospects filters): visible labels for the four selects.
5. **[P2] $impeccable polish**: contrast token nudge, keyboard-reachable InfoTips, then the P3 list.
