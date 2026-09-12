# Plan 040: Simplify the operator dashboard around the hotel file, then carry the site's design language

> **Executor instructions**: Follow this plan slice by slice. Run every
> verification command and confirm the expected result before moving to the
> next slice. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When a slice lands, update this plan's status row
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 1017199..HEAD -- packages/interface docs/product DESIGN.md plans/README.md`
> Stop if dashboard routes, i18n, or the IA document moved without this plan
> or a trade-off entry explaining it.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MEDIUM (the operator's daily tool; every slice must ship working;
  FR/EN parity everywhere)
- **Depends on**: 037 (the preview lifecycle the IA builds on), 039 (the
  design language reference); operator attendance at the slice 1 approval
  gate and the slices 8+ fill-in
- **Category**: dashboard, information architecture, design
- **Planned at**: commit `1017199`, 2026-09-11
- **Issue**: none; operator-requested brainstorm 2026-09-11
- **Slice 1 landed 2026-09-12**: `docs/product/dashboard-ia.md` is written and
  operator-approved, so the binding-decision-1 gate is cleared. That document
  now governs slices 2 through 7, including the operator's decisions to delete
  `/vendors`, to keep sector-neutral naming and the `/prospects` URLs, to keep
  the preview status page until slice 4 absorbs it, and to leave every label
  fix to slice 7.
- **Slice 2 landed 2026-09-12**: `/vendors` (page, route, endpoint, strings,
  dashboard model) is deleted, and the two genuinely uncalled v1 preview
  endpoints (`POST /preview/publish`, `GET /outreach/preview-render`) are
  removed from `prospects.ts`. The preview status page and its revoke
  endpoint stay, per the slice 1 decision, until slice 4. Store-level code
  that outlived its only caller (`getVendorFingerprintAggregate`) was left
  in place, out of this slice's authorized scope, for `fallow dead-code` to
  triage separately (trade-off 80).
- **Slice 3 landed 2026-09-12**: new sidebar per the approved IA ("Nouveau
  scan" moved to the Audits page header it duplicated; "À traiter" and
  "Résultats" added at their current URLs; a "Vérifier une adresse" footer
  link); the font copy plugin and `theme.css` now serve Avenir Next instead
  of Inter's removed files; the near-navy ground, ink ladder, hairlines, and
  sky accent are transcribed from the report and site (trade-off 84); the
  audit page links back to its prospect when one exists; `usePolling` pauses
  while the tab is hidden and list pages share a 10-second interval. The
  detail-page conditional 5-second-while-busy half of the poll policy is
  deferred to slice 5, which restructures the audit page anyway.
- **Slice 4 landed 2026-09-12**: the hub at `/prospects/:candidateId`
  (header with one state-driven primary action per the approved ladder, a
  six-step pipeline strip, and the Fiche / Contrôle rapide / Audit /
  Aperçu / Emails / Résultat sections); the five single-purpose subpages
  (`/prescan`, `/score`, `/evidence`, `/preview`, `/outreach`) retire as
  redirects; the "Lancer un audit" trap button is gone and a scan refusal
  is explained in plain words where the button would sit; the outcome form
  (existing `POST /api/outreach/threads/:threadId/outcome`) and the opt-out
  action with its own confirmation text live in the Résultat section.
  Additive API: `GET /api/prospects/:id` now carries `outreachAudit`
  (latest audit id, startedAt, severity totals via the indexed rollup
  aggregate) and `outreachScanJobId`; the hub's Audit section reads the
  report lifecycle from the existing `GET /api/audits/:auditId`. The hub
  polls every 5 s only while a scan it started is running (the deferred
  half of the slice 3 poll policy). The IA's additive drafts `candidateId`
  filter was deliberately not built: the composed thread view the detail
  already carries includes each draft's id and review outcome, so the
  Emails section needs no second list call; the hotel-name half of that
  item stays with slice 6.
- **Slice 5 landed 2026-09-12**: the audit page restructured around
  findings first and the five-step "Rapport client" stepper (Préparer /
  Rédiger / Choisir la version / Produire les PDF / Approuver pour
  livraison) with one Enregistrer per the duplicate-controls decision.
  The header Regenerate and Approve buttons are gone; the failure card
  routes to the step that redoes the work; the audit page's own outreach
  preview card is retired in favour of a one-line link to the hub's
  Aperçu section (orphan audits keep a read-only scorecard and operator
  PDF note); the handed-over hotel-information form draft was completed
  inside the Préparer step with its SIREN helper. The page polls every
  5 s only while the stepper reports work in flight. Recorded
  deviations, both to keep the failure card's promised route working:
  producing the PDFs also unlocks from a stored (not only fresh) report
  pair, and the retired preview card's now-unused response type and one
  dead string were removed because `fallow dead-code` fails the gate on
  them. Draft-action and session-token interaction coverage retired with
  the old cards; hub page-level tests are the place to rebuild them.
- **Slice 6 landed 2026-09-12**: `/a-traiter` is the landing page, with
  the four bounded queues (drafts, replies, identities to verify, audits
  needing input) and the batch actions moved off the retired outreach
  index. `/outreach` URLs rename to `/a-traiter`, `/resultats`, and
  `/ne-pas-contacter` with redirects so old bookmarks keep working; the
  separate drafts and replies pages are deleted (their rows open the
  hub's Emails section); the outcomes page drops the opt-out column
  (opt-out lives in the hub's Résultat section); draft, reply, and
  outcome rows carry an additive `hotelName` resolved by one bounded
  batch lookup, null when the candidate row is gone; the sidebar shows
  the À traiter count badge from a single drafts call.
- **Slice 7 landed 2026-09-12**: the operator vocabulary from the
  approved IA table, in French and English together: "Contrôle rapide"
  ends the three-names prescan problem, "Audit de prospection" for the
  outreach full scan, "Premier email" where "Relance 1 en brouillon"
  misread, "Pas encore évalué" where `not-evaluated` fell back to
  "Autre", "hôtels sélectionnés" over "cohorte contactable",
  "Réservation ou vente en ligne directe" for the transactional flow,
  SIREN expanded on first use per screen, "Dans Gmail" instead of the
  raw provider code, and candidateId and version codes only behind
  "Détails techniques". The orphan-audit scorecard is retitled
  "Aperçu"; the identity card's empty-sources text is its own sentence;
  scan progress's audit link is retitled to match its target; hub
  anchor deep links (#hub-preview, #hub-emails, #hub-outcome) now
  scroll to their section; i18n keys retired by slices 4 through 6 are
  swept. "Retour aux prospects" needed no change: its only render is
  the hub's not-found state and it already targets /prospects. UI
  strings only; no API renames.

## Why this matters

The dashboard grew one feature at a time and the operator now finds it
confusing. Facts from the 2026-09-11 audit sweep:

- 18 routes exist, 4 are in the sidebar; 13 pages are reachable only through
  in-page links or direct URL.
- The outreach flow crosses 3 nav areas and 5+ pages; the only bridge from
  "draft created" back to the queue is a toast message.
- Duplicate controls: create-first-draft in 3 places, regenerate in 3, revoke
  preview in 2, with inconsistent 409 semantics documented in code comments.
- Dead weight: the orphan `/vendors` page (zero inbound links), the retired
  v1 preview page rendering two "this moved" notes, v1 endpoints the UI never
  calls, retired i18n strings in both languages.
- The audit page stacks 6 conditional cards in one 1,556-line file plus a
  705-line card.
- The dashboard loads Inter through `theme.css` `@font-face` from files copied
  out of `packages/report/src/fonts`, which plan 039 emptied of Inter. The
  requests 404 today and the dashboard silently renders in a system font. A
  font decision is already forced.
- Meanwhile the report and the public site share one design language (plan
  039: near-navy ground, Avenir Next, dossier motif) and the dashboard wears
  a different one (neutral near-black, white accent).

## Operator decisions (interactive brainstorm, 2026-09-11)

1. Audit first, then one rebuild pass; the design language is applied as each
   screen is rebuilt, never styled twice.
2. Goals, in work order: clarity (find things fast), fewer clicks in the core
   loop, brand consistency rides along.
3. Scope: full restructure delivered in working slices, no big-bang cutover.
4. Target structure: one page per hotel is the hub; queues become lists that
   lead into hubs.
5. Slice 1 is a full UX audit ending in an IA proposal the operator approves
   before any rebuild starts.
6. The known dead weight is cleaned early, as its own small slice.
7. Severity colors stay the dashboard's own; the trade-off 81 divergence
   stands, deliberately.
8. One plan, with the IA approval as an internal gate.
9. Artifact-derived features come after the rework, as their own slices
   (slices 8+ below).
10. The kit contents are filled in by Claude Code, which created the six
    artifacts and can read them back; ZCode cannot (they sit behind the
    claude.ai login).

## Binding decisions

1. **The IA proposal gates the rebuild.** No slice 3+ work before the
   operator approves `docs/product/dashboard-ia.md` through the interactive
   question mechanism. A rejection sends work back to slice 1, never into
   improvised structure.
2. **Hotel-hub structure is settled.** The audit validates details (what
   merges, what redirects, the slice order) but does not reopen the
   one-page-per-hotel decision.
3. **Design transcription, not import.** Tokens and fonts are transcribed by
   value into `packages/interface`'s own theme layer with comments naming
   their origin (trade-off 59: separate stacks, no workspace imports in the
   browser bundle). Tailwind 4 stays; dark-only stays the incumbent; the
   dashboard keeps its own severity shades (operator decision above; note it
   in `DESIGN.md`'s dashboard section when the restyle lands, with a
   trade-off entry for the restyle itself).
4. **Outreach locks ride along.** Trade-offs 82 and 83: no model writes
   outreach, and template wording changes need operator approval. Warm-up
   automation stays out of scope (`plans/README.md`, "Explicitly deferred");
   a warm-up kit-derived surface is informational (for example warm-up status
   feeding runbook gate I) unless the operator deliberately reopens scope.
5. **No new dependencies.** WCAG 2.2 AA is the binding floor on rebuilt
   surfaces (PRODUCT.md decision). FR/EN parity tests stay green in every
   slice.
6. **Cleanup deletes only confirmed-dead things.** The legacy v1 preview page
   and route, the v1 endpoints verifiably uncalled by the UI, and their
   retired strings. The `/vendors` destiny (delete or link) is an IA-proposal
   decision, not a cleanup decision.

## Slices

### Slice 1: Full UX audit and IA proposal (gate)

- Run the dashboard locally with fixture or test data. Walk every operator
  flow in the browser with screenshots: new scan, watch queue, open audit,
  report preparation, outreach preview (render, PDF, publish, one-time link,
  revoke), draft creation and review, replies, outcomes, prospect
  management, do-not-contact lookup.
- Catalogue: steps and clicks per flow today; duplicate controls; dead ends;
  the jargon inventory (prescan, full audit, outreach scan, scorecard, SIREN,
  transactional flow) with proposed plain-language FR and EN labels; poll
  intervals; missing back links.
- Write `docs/product/dashboard-ia.md`: the target navigation map, a
  per-page destiny table (keep, merge, delete, redirect), flow-by-flow
  before/after step counts, the rebuild slice order, and the `/vendors` and
  suppressions destiny.
- STOP: present the proposal to the operator through the interactive question
  mechanism. No rebuild work before approval.

### Slice 2: Dead-weight cleanup (small, independent)

- Delete the retired `/prospects/:id/preview` page and route, the v1 preview
  endpoints the UI verifiably never calls, and their retired i18n strings
  (FR and EN together).
- Update the narrowest tests; route tests prove the removed endpoints are
  gone and the kept ones still answer.
- May run while the slice 1 proposal awaits approval; must not pre-empt its
  decisions (nothing here is load-bearing for the IA).

### Slice 3: Shell, navigation, fonts, tokens

- New navigation per the approved IA; cross-links and back links; one poll
  policy.
- Avenir Next: fix the `vite.config.ts` font copy (the Inter plugin copies
  files that no longer exist), then `theme.css` `@font-face` and
  `--font-sans`.
- Transcribe the near-navy token set (grounds, ink ladder, hairlines, sky
  accent) from `docs/report/report-design-tokens.md` and
  `packages/site/app/globals.css` into `theme.css` by value, each with an
  origin comment. Severity shades unchanged (binding decision 3).
- The rebuilt shell passes axe WCAG 2.2 AA in FR and EN.

### Slice 4: Hotel hub

- One page per hotel per the approved proposal: identity and catalogue,
  qualification, scans and audits, preview, thread, outcome as sections of
  one page. The five single-purpose prospect subpages retire or become deep
  links exactly as the proposal says.
- One primary action per state (review, start scan, publish, draft);
  duplicates removed.

### Slice 5: Audit page restructure

- Split `audit-detail.tsx` into composed sections per the proposal; one
  regenerate affordance policy; a visible link to the hotel it serves.

### Slice 6: Queues as lists into the hub

- Drafts, replies, outcomes, and do-not-contact become lists whose rows open
  the hotel hub; one create-draft entry point; the suppressions page destiny
  per the proposal.

### Slice 7: Language and labels pass

- Rename operator-facing labels to the proposal's plain-language FR and EN
  vocabulary; i18n parity tests updated; UI vocabulary only, no API renames.

### Slice 8: Tools links page (landed 2026-09-12)

Claude Code read the six operator artifacts named in the original
placeholder (a warm-up email kit, a domain warm-up timeline, the First-100
rollout tracker, the project roadmap, the audit-rehearsal defect tracker,
and a paid-delivery phase tracker) and found none of them were an
outreach-dashboard feature in the sense this slice originally imagined:
the warm-up kit and timeline cover Gate I, already closed 11 Sep; the
roadmap and rehearsal tracker are project-management and QA tooling, not
campaign UI; only First-100 Rollout and Paid Audit Delivery track
recurring operator state, and even those live behind a private claude.ai
share link the dashboard has no way to read or write.

Presented this to the operator, who asked for the simplest version: one
page in the dashboard linking out to all six, not six features rebuilt as
code. Landed as `/outils` (footer link, `Wrench` icon, next to "Vérifier
une adresse"): a static, bilingual list of the six artifact URLs with a
one-line label and description each, sourced from operator-approved copy
written into `routes/tools.tsx`, opening in a new tab. No fetch, no new
dependency, no data duplicated from the artifacts. i18n parity and an axe
check cover the new page; `pnpm --filter @odysseus/interface run
typecheck` and the full dashboard vitest suite (274 tests) are green.

Plan 040 is done: slices 1 through 8 have all landed.

## STOP conditions

- A locked contract (`findings.ts`, `severity.ts`, `llm-output.ts`) needs a
  change: stop and ask.
- A slice wants a new dependency: stop and ask.
- Any change to approved outreach template wording without an operator
  approval gate: forbidden.
- `packages/report` or `packages/site` drift: out of scope, revert.
- Store or API removals beyond the slice 2 confirmed-dead list: stop and ask.

## Verification

- Every slice: the narrowest affected suites, then `pnpm run check` green.
- Slices 3 through 7: axe WCAG 2.2 AA on rebuilt pages, FR and EN; i18n
  parity tests green.
- Close-out: the operator walks the full outreach flow (scan to draft) on the
  rebuilt dashboard and accepts it; the walkthrough screenshots are archived
  beside the IA document.
