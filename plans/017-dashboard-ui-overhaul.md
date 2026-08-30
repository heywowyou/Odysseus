# Plan 017: Overhaul the operator dashboard UI to shippable quality

> **Executor instructions**: Plan 012 is complete (`19a1d03`). This plan
> rebuilds the four existing dashboard pages in `packages/interface` on a real
> frontend stack and an app shell. Plans 013 (operator pages) and 016
> (hosting/auth) stay out of scope but must be able to build their surfaces on
> what this plan leaves behind.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans 001-012
- **Category**: direction
- **Planned at**: working tree of `350fe2a`, 2026-08-30, operator-approved with
  the binding decisions below recorded in the approving session.

## Why this matters

The operator dashboard is the daily surface and it reads as unfinished: one
1080 px column of stacked cards, raw tables, bare link rows, plain centered
empty states, a hidden error banner, five-second polling with no feedback, no
loading skeletons, no toasts, no language switcher, and no layout below desktop
width. The CSS itself sits on a real token system, so the gap is structure and
polish, not foundation. Plan 013 will add the largest set of pages the
dashboard ever gets; building the design system and shell first means those
pages land finished instead of being built twice.

## Binding decisions (operator-approved 2026-08-30)

1. **Stack**: React 19 + Vite + Tailwind CSS 4 + Radix UI primitives in the
   shadcn/ui pattern (component source owned in-repo, not a black-box
   library), react-router for routing, lucide-react icons, sonner toasts.
   This is the recorded charter exception to dependency-free frontend code.
   Trade-off 9's Tailwind ban stays scoped to `packages/report`; the boundary
   gets its own trade-offs entry at cutover.
2. **Visual direction**: Linear/Railway-grade dense dark theme. New layered
   near-black neutral surfaces; the violet accent family and the
   WCAG-considered severity palette carry over from the report brand; Inter
   stays self-hosted.
3. **Devices**: desktop-first responsive, collapsible sidebar, usable at phone
   widths, per plan 016's anywhere-access posture.
4. **Scope**: reskin plus app shell for the four existing pages only. No new
   product areas; plan 013 supplies those.
5. **Server unchanged**: the hand-rolled `node:http` router stays. The SPA is
   served as static files under `/dashboard/` during the build-out and moves
   to the root at cutover. API routes, CSRF posture, and localhost binding are
   untouched.

## Current state

- `packages/interface/src/public`: four static HTML pages (new scan, progress,
  history, audit detail), vanilla TypeScript rendering `innerHTML` template
  strings, `styles.css` over the locked Nocturne tokens, FR/EN string tables
  with no switcher (default `fr`).
- `src/router.ts` serves `/api/*` routes plus a static fallback from
  `dist/public` (`src/routes/static.ts`).
- No dashboard unit or visual tests exist; `packages/report`'s
  strings-parity test is the pattern to port.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Dashboard build | `pnpm --filter @odysseus/interface run build` | `vite build` outputs `dist/public/dashboard` |
| Typecheck | `pnpm run typecheck` | `tsc -b` plus `tsconfig.dashboard.json` pass |
| Interface tests | `pnpm exec vitest run packages/interface/src` | all pass |
| Validation | `pnpm run check` | exit 0 |
| Manual review | `pnpm run serve`, open `http://127.0.0.1:4600/dashboard/` | app renders, API calls work |

## Scope

**In scope**: Vite/React/Tailwind scaffold inside `packages/interface`; theme
tokens; app shell (sidebar, page header pattern, FR/EN switcher, responsive
drawer); data layer (`fetchJson`, `useApi`/`usePolling`); UI primitive set
(buttons, inputs, fields, cards, badges, tables, dialogs, toasts, skeletons,
empty states); rebuilt audits list, new scan, scan progress, and audit detail
pages preserving every current behavior including the « détecté, à confirmer »
provenance hints; `/dashboard/` scoped SPA fallback in the static handler;
FR/EN parity tests; cutover, old-page removal, and the trade-offs entry.

**Out of scope**: plan 013 prospect/outreach pages, plan 016 auth/hosting/login,
API behavior changes, `packages/report`, `packages/site`, locked files.

## Git workflow

- Work directly on `main`; do not create another branch.
- One commit per slice, messages prefixed `Dashboard UI (slice N)`.

## Steps

### Step 1: Scaffold the dashboard app

Add dependencies; wire `vite.config.ts` (root `src/dashboard`, base
`/dashboard/`, outDir `dist/public/dashboard`, Inter fonts copied from
`packages/report` at build); `tsconfig.dashboard.json` with bundler resolution
and JSX; typecheck and lint integration; theme tokens; app shell with routing
and stub pages; scoped SPA fallback in `static.ts` with a unit test for the
pure path resolver.

**Verify**: `pnpm --filter @odysseus/interface run build` emits
`dist/public/dashboard`; `pnpm run typecheck`, `pnpm run lint`, and
`pnpm exec vitest run packages/interface/src/routes/static.test.ts` pass;
`pnpm run serve` serves the shell at `/dashboard/` and old pages still work.

### Step 2: Foundation: data layer, i18n, primitives

Port `fetchJson`; add `useApi`/`usePolling` (hand-rolled, abortable, polling
stops on unmount and terminal states) with tests; port the full FR/EN string
tables behind the provider with the language switcher persisted to
`localStorage` and a key-parity test; build the UI primitive set with
Radix-backed dialog, dropdown, tooltip, and sonner toasts.

**Verify**: unit tests for hooks and i18n parity pass; primitives render in a
scratch route during development and are removed before commit.

### Step 3: Audits list page

KPI chips derived client-side, search, status/type filters, date sort, dense
table with status dots and severity chips, five-second polling with a quiet
updated-at indicator, skeleton first load, empty state with CTA.

**Verify**: view-model mapping and filter/sort logic unit tests pass; manual
review against `pnpm run serve` with real scan data.

### Step 4: New scan page

Segmented scan type, validated URL and SIREN fields, transactional-flow select
with conditional reason field, advanced options disclosure, submitting state,
error toasts plus inline field errors, navigation to the progress route on
success.

**Verify**: form validation unit tests pass; a real scan starts from the page
and lands on its progress route.

### Step 5: Scan progress page

Phase cards with progress bars and ETA, live URL results, completion banner
linking to the audit detail, polling stops on terminal states.

**Verify**: polling state machine unit tests pass; a real scan run renders
phase transitions end to end.

### Step 6: Audit detail page

Header with status and actions (regenerate report, approve bilingual pair
behind a confirm dialog), severity rollup tiles, reports card with FR/EN
preview and download, enrichment form preserving provenance hints and the
SIREN check, findings table with severity grouping/filter.

**Verify**: enrichment save, SIREN check, regenerate, and approve work against
the live API; FR/EN strings complete; manual review at both breakpoints.

### Step 7: Cutover and cleanup

SPA fallback for app routes at the root, Vite base `/`, delete the old
`public/*.html`, `app-*.ts`, `styles.css`, `i18n-apply.ts`, and `strings/`;
update the interface build script; write the trade-offs entry for the
dashboard stack boundary; flip this plan to `IMPLEMENTED` in
`plans/README.md`.

**Verify**: full `pnpm run check` and interface suite green; screenshots of
every route at desktop and mobile widths in FR and EN reviewed; the operator
reads the served dashboard and approves (the step that flips the plan to
`DONE`).

## Done criteria

All steps verified, `pnpm run check` and `pnpm exec vitest run
packages/interface/src` green, no reference to the old page stack remains in
served output, and the operator has read the rebuilt dashboard.
