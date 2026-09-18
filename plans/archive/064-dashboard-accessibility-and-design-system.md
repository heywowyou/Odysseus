# Plan 064: Dashboard accessibility and design-system hardening

> **Executor instructions**: make the Odysseus operator interface exemplary accessibility software without redesigning it for novelty. Preserve the existing visual language where it works, consolidate repeated interaction/state patterns, and prove keyboard, focus, semantic, zoom, responsive and live-update behavior in real browser tests. Screenshot tests alone are insufficient.

## Status

- **Execution status:** FROZEN (2026-09-18). Parked as backlog by operator decision: the priority is selling the first paid reports on the existing report path. Reopen only on a real incident or once a report has sold; the contract below is unchanged.
- **Priority**: P1
- **Effort**: L
- **Depends on**: Plan 060; consumes 061-063 state/data contracts as they land.
- **Coordinates with**: 062 approval UX and 065 error/recovery UX.
- **Category**: accessibility, interaction design, design system, terminology, visual consistency.
- **Final review state**: repository-wide design review plus repeated convergence passes; the final fresh pass produced no additional substantive architectural change. Freeze speculative design and let implementation/evaluation evidence drive later amendments.

---

# 1. Purpose

Odysseus sells accessibility expertise. Its internal control room should not
contain obvious accessibility failures or interaction ambiguity.

The current dashboard already has a useful foundation:

- visible global `:focus-visible`;
- reduced-motion support;
- semantic Radix dialogs for most modal flows;
- text labels alongside most status colours;
- responsive layouts;
- reusable Button/Card/Table/Badge/Field primitives;
- axe coverage on several screens.

The objective is to harden and complete that foundation, not replace it with a
decorative redesign.

---

# 2. Current-state findings

## 2.1 Automated accessibility coverage is incomplete

`packages/interface/src/dashboard/accessibility.test.ts` covers several
directory/prospect/new-scan surfaces, but not the most important quality flows:

- À traiter;
- Audits active queue/history;
- scan progress;
- audit detail/findings;
- evidence repair;
- report candidate review/approval;
- error/recovery;
- shell/mobile navigation.

jsdom + axe also cannot prove keyboard order, focus trapping/restoration,
responsive reflow or live-region quality.

## 2.2 The mobile navigation is a custom modal

`packages/interface/src/dashboard/app/shell.tsx` gives the mobile menu
`role="dialog"`, `aria-modal` and Escape handling, but it does not provide
the focus trapping/restoration behavior of the existing Radix dialog primitive.

Migrate it to the shared accessible dialog/sheet primitive or prove equivalent
focus behavior explicitly. Reusing the tested primitive is preferred.

## 2.3 Historical UX audits found semantic failures that are useful regressions

The dashboard audit ledger records prior cases such as nested main landmarks,
nested interactive controls, raw/unlocalized errors, dead-end not-found pages
and misleading progress placement.

Even where individual issues have since been fixed, add the failure class to
regression coverage rather than relying on a one-time patch.

## 2.4 Dense quality state will multiply badges unless constrained

Plans 058/059 add many legitimate states. Displaying each as a coloured badge
would make the interface noisier, less accessible and harder to scan.

Use hierarchy and plain language first; badges/status indicators are compact
secondary signals.

---

# 3. Binding decisions

1. **One shared interaction pattern per concept.** Status, unavailable action, destructive confirmation, progress, error/recovery, disclosure and table navigation must not be reinvented per page.
2. **Accessibility is tested in a real browser as well as axe.**
3. **The existing visual language remains the base.** Change tokens/components only where consistency, readability, responsiveness or accessibility requires it.
4. **State is never colour-only.**
5. **Unavailable actions remain explainable to keyboard and screen-reader users.**
6. **Do not announce every polling update.** Announce meaningful stage/state transitions and action results.
7. **No nested interactive controls and no clickable row as the only navigation path.**
8. **One main landmark per page.**
9. **All dialogs/drawers trap focus, close by expected methods and restore focus.**
10. **200% and 400% zoom are first-class regression cases.**
11. **Reduced motion disables nonessential transitions/entrance movement without removing state feedback.**
12. **Tables remain semantic and paginated rather than visually virtualized by default.**
13. **FR/EN terminology/copy coverage is exhaustive for closed state/reason codes.**
14. **Technical identifiers are secondary details, not visual hierarchy.**
15. **Do not chase WCAG checklists mechanically; test whether the operator can complete the real workflow.**

---

# 4. Shared status pattern

Create/standardize one reusable status presentation that accepts the semantic
state from 060/061 and renders:

- concise text;
- optional icon;
- tone;
- optional supporting sentence;
- accessible name independent of colour.

It must cover at least:

```text
queued
running
waiting
retrying
blocked
needs attention
cancel requested
failed
completed
cancelled
superseded
evidence approved
approved with limitation
quality approved
awaiting operator approval
active report
legacy/unknown
```

Do not use animated spinners as the only indication of activity.

Do not display multiple badges when one sentence such as “Evidence approved;
report review in progress” is clearer.

---

# 5. Unavailable action pattern

Native `disabled` buttons often become impossible to focus, which makes the
reason inaccessible.

For a consequential action that is visible but unavailable:

- use an interaction pattern that remains discoverable by keyboard
  (`aria-disabled` where appropriate, while preventing activation);
- provide concise persistent or focus-reachable reason text;
- associate it with `aria-describedby`;
- link to the blocking work/item when useful;
- never rely on a mouse-only tooltip.

For actions that are irrelevant in the current state, omit them rather than
showing a cemetery of disabled buttons.

The server capability from 061 remains the authority.

---

# 6. Progress and live updates

## 6.1 Visual

- determinate bar only for true bounded progress;
- indeterminate state for unknown duration;
- stage label always present;
- page/item counts use readable numeric formatting;
- waiting/retry distinguishes itself from active computation.

## 6.2 Assistive announcements

Use a polite live region for meaningful transitions:

- queued → running;
- phase/stage category change;
- running → waiting/retrying;
- needs attention;
- completed/failed/cancelled;
- operator command result.

Do not announce every page counter increment or every poll.

Ensure repeated identical server snapshots produce no repeated announcement.

---

# 7. Dialogs, drawers and confirmations

Use the existing Radix-based `Dialog` primitive or one equally tested
accessible primitive for:

- mobile navigation;
- destructive confirmations;
- report approval;
- candidate correction;
- queue batch/reorder detail;
- advanced scan options.

Requirements:

- focus starts at a meaningful heading/first control;
- Tab/Shift+Tab stays inside;
- Escape works unless a truly non-dismissible operation exists;
- background is inert;
- close restores focus to the trigger;
- title and description are programmatically associated;
- destructive confirmation names the object and consequence;
- loading state prevents duplicate confirmation without trapping the user
  forever after failure.

---

# 8. Landmarks and navigation

- exactly one `main` landmark in the shell/page composition;
- primary nav labelled once;
- current destination exposed through link semantics;
- three operational destinations remain À traiter / Prospects / Audits;
- secondary Directory/Tools/Do-not-contact do not compete visually;
- mobile menu has the same logical order as desktop;
- unknown/not-found states include a real navigation recovery link;
- skip-to-main link is available when repeated navigation would otherwise
  burden keyboard users.

The sidebar attention count must have an understandable accessible label and
must update without repeatedly stealing announcement focus.

---

# 9. Tables and dense data

For Prospects, Audits, findings, queue and history:

- real `table`, `thead`, `th`, `tbody` where data is tabular;
- column header scope/semantics;
- no row click as the only path — the primary subject is a real link;
- row action buttons stop pointer propagation but remain independent focusable
  controls;
- horizontal overflow only where unavoidable, with a usable scroll region;
- columns collapse/reformat intentionally on narrow widths;
- sort state uses `aria-sort`;
- filters have labels;
- result count/loading is announced appropriately;
- pagination controls name target/current page.

At 400% zoom, transform wide tables to a purposeful stacked/list presentation
if necessary rather than requiring two-dimensional scrolling for core actions.

---

# 10. Forms and provenance

Every field has:

- visible label;
- programmatic label;
- input purpose/type where relevant;
- hint/error association;
- `aria-invalid` on invalid value;
- error message after validation failure;
- preservation of entered value after recoverable failure.

For detected/confirmed/overridden field provenance from Plan 062:

- use text/icon label;
- do not encode provenance only by colour;
- confirmation/override action describes what record will change;
- stale/reconfirmation state names why.

Advanced scan inputs retain seconds as the user-facing delay unit. Internal
milliseconds never leak into the form.

---

# 11. Error/recovery pattern

One reusable error component supports:

```text
title
plain-language explanation
what was preserved
automatic retry state
primary recovery action
secondary safe navigation
diagnostic-details disclosure
diagnostic ID
```

The component:

- uses `role=alert` only for newly surfaced errors that need immediate notice;
- does not turn static historical failure rows into repeated alerts;
- focuses a page-level fatal heading only when navigation/render truly failed;
- never dumps a stack trace into the primary surface.

Keep and extend the current dashboard error boundary's useful incident/reference
pattern.

---

# 12. Visual hierarchy

Use a restrained hierarchy:

1. page identity and primary action;
2. current quality/work state;
3. human-attention blocker;
4. summary facts;
5. detailed data;
6. technical diagnostics.

Do not place severity counts, digests, job IDs and every quality gate at the
same visual weight.

## 12.1 Typography and numeric data

- preserve current font/token system;
- use tabular/numeric treatment for counts/durations where comparison matters;
- wrap/truncate hostile long URLs/identifiers safely;
- avoid very small text for essential state;
- maintain readable line length for explanations.

## 12.2 Colour/tone

Retain existing semantic tokens only after contrast verification across:

- base/panel/raised backgrounds;
- normal/soft/muted text;
- severity states;
- danger/warning;
- focus ring;
- disabled states.

Add no new near-duplicate colour solely for a new pipeline state. Reuse status
structure/text before expanding the palette.

---

# 13. Responsive and touch behavior

Test at minimum:

- 320 CSS px;
- 375/390 CSS px;
- tablet width;
- common desktop width;
- 200% zoom;
- 400% zoom/reflow.

Primary controls should meet an approximately 44x44 CSS-pixel touch target
where practical, especially:

- menu;
- primary action;
- queue move/cancel;
- report review/approval;
- dialog close.

Dense secondary table controls may use compact visuals only if the effective
interactive target remains adequate.

No core action requires hover.

---

# 14. Reduced motion

The existing `prefers-reduced-motion` support becomes a tested invariant.

Disable/simplify:

- page entrance animation;
- drawer/overlay transitions;
- progress embellishments;
- decorative hover movement.

Do not suppress:

- visible focus;
- state changes;
- loading text;
- error/success feedback.

---

# 15. Internationalization and terminology

Closed codes from 060/061/062/065 must have exhaustive FR and EN maps.

CI fails for:

- missing code in either language;
- raw server enum displayed as fallback on a control-room path;
- a raw technical actor/status identifier where a human label exists.

Dates/times use dashboard language/locale consistently, not browser-default
locale.

No business workflow may depend on the interface language. In particular,
outreach/report language remains domain state, not the dashboard toggle.

---

# 16. Testing architecture

## 16.1 Static/component

Keep `vitest-axe` for fast regressions on stable component/page fixtures.

Add fixtures for:

- À traiter;
- Audits queue/history;
- scan/evidence progress;
- audit control summary;
- findings browser;
- report candidate review/approval;
- error/recovery;
- mobile shell.

## 16.2 Browser keyboard tests

Using Playwright or the repository's current browser harness:

- skip link → main;
- primary navigation entirely by keyboard;
- queue reorder;
- open/close dialogs, focus trap, focus return;
- report candidate review → approval confirmation;
- unavailable action reason;
- findings filters/pagination;
- error recovery;
- mobile drawer;
- session expiry/relogin return.

Do not attempt to automate a specific screen reader as the only proof. Semantic
DOM + keyboard + accessible-name assertions + targeted manual screen-reader
checks form the practical suite.

## 16.3 Zoom/responsive tests

Use browser viewport/device scale and computed overflow assertions.

At 200/400%:

- no clipped primary action;
- no horizontal document overflow for control-room core;
- dialogs remain usable;
- tables transform/scroll intentionally;
- long URL fixture does not widen the page.

## 16.4 Live-region tests

Assert:

- meaningful transition announces once;
- poll with same state announces nothing;
- high-frequency page count does not spam;
- error/action outcome is announced.

## 16.5 Visual regression

Use screenshots only for a small set of stable structural states:

- empty;
- active work;
- needs attention;
- report approval;
- fatal/recovery;
- mobile control room.

A screenshot mismatch is never the only accessibility test.

---

# 17. Manual accessibility verification

Before promotion, manually verify the integrated production-like build with:

- keyboard only;
- one mainstream screen reader/browser combination on desktop;
- 200% and 400% zoom;
- reduced motion;
- narrow mobile viewport;
- high-density Point-France fixture;
- long hostile URL/string fixture.

Record defects as tests before closing them.

---

# 18. Migration / implementation order

1. Inventory existing primitives and remove duplicate/nested interactive patterns.
2. Standardize status, unavailable action and error/recovery primitives.
3. Move mobile navigation onto the accessible dialog/sheet primitive.
4. Fix landmarks/skip link/navigation recovery.
5. Wire new 061/062 states through the shared status/action components.
6. Harden tables/forms/provenance/live progress.
7. Add browser keyboard/live-region/zoom suites.
8. Refine responsive density and contrast from measured defects.
9. Run FR/EN parity and recurring dashboard audit.

Do not block backend quality work on cosmetic refactoring; land shared primitives
incrementally as their consuming pages migrate.

---

# 19. Adversarial matrix

| Scenario | Required behavior |
| --- | --- |
| Keyboard-only operator queues/reorders/cancels scans | Every command reachable; resulting position/state announced. |
| Disabled report approval | Reason discoverable without mouse; cannot activate. |
| Mobile menu opens | Focus enters/traps; Escape/close works; focus returns to menu button. |
| Poll updates page count | No screen-reader spam. |
| Work becomes needs-attention | Meaningful announcement once. |
| 400% zoom on audit control room | Core state/actions reflow without document-level horizontal loss. |
| 770-character URL | Wrap/truncate/copy without layout break. |
| Status colours unavailable | Text/icon still communicates state. |
| FR/EN toggle | Same semantics; no raw codes; dates localized. |
| Render error | Recovery first, diagnostic detail secondary. |
| Point-France findings page | Keyboard paging/filtering remains practical. |
| Reduced motion | No nonessential entrance/drawer motion. |

---

# 19.1 Accessibility acceptance record

"Exemplary" and "no substantive defect" are replaced by a concrete closure
bar for the named control-room workflows:

- target **WCAG 2.2 A/AA** for operator UI behavior in scope;
- axe: zero unexplained serious/critical violations in the named automated
  workflow fixtures;
- IBM Equal Access checker (`deploy/equal-access-ci.sh` + `.achecker.yml`): zero unwaived Level 1/2 violations in the same
  rendered fixtures; any waiver is committed with
  rule, rationale, owner and expiry/review date;
- manual keyboard: every named primary workflow completes without pointer;
- focus: dialogs/drawers/mobile nav have scripted open/trap/Escape/return
  assertions;
- zoom: 200% and 400% checks preserve every core state and consequential
  action without document-level horizontal loss;
- screen reader: commit a manual acceptance record for at least one supported
  Windows pairing (NVDA + current Firefox or Chrome) covering shell nav,
  attention table, audit summary, dialog, error/recovery and report approval;
- FR/EN closed-state/reason/action parity is exhaustive.

Record manual results in a dated canonical dashboard-accessibility acceptance
document. Plan closure requires **no known WCAG 2.2 A/AA failure** in the named
workflows; preference/cosmetic issues may remain only when explicitly
classified as non-conformance-neutral.


# 20. Fail-closed conditions

Do not consider a migrated control-room workflow complete when:

- its primary action is pointer-only;
- a modal can lose/trap focus incorrectly;
- an unavailable consequential action has no accessible reason;
- status depends on colour alone;
- a live polling state creates repeated announcement noise;
- 200/400% zoom clips a core action/content;
- a raw untranslated state/reason appears on the primary path;
- axe/browser regression has an unexplained serious violation;
- the current page has nested main landmarks/interactive elements;
- a screenshot is the only proof of correctness.

---

# 21. Explicitly rejected alternatives

- A total visual redesign.
- More badges/colours for every new state.
- Tooltips as the only explanation for disabled controls.
- Screenshot-only accessibility testing.
- Axe-only accessibility testing.
- Custom modal/drawer behavior when the tested primitive already exists.
- Row-click-only navigation.
- Frontend virtualization as the default large-table fix.
- Announcing every progress counter.
- Hiding technical IDs by deleting access to them; they remain in details.
- Treating internal/operator software as exempt from accessibility quality.

---

# 22. Executable closure contract

“Exemplary”, “usable” and “no substantive defect” require a named accessibility acceptance record.

Before closure:

- migrated operator workflows target **WCAG 2.2 AA** for applicable web UI success criteria;
- automated axe coverage is paired with named manual checks for keyboard-only use, focus order/return, 200% and 400% zoom, reflow, reduced motion and screen-reader announcements;
- the manual acceptance artifact records browser/OS, viewport/zoom, screen reader when used, routes exercised, FR/EN coverage, defects and disposition;
- every shared dialog/menu/table/pagination/status primitive has focused accessibility tests so page tests are not the only protection;
- serious/critical axe findings are zero; any lower-severity accepted exception must have a documented rationale and owner rather than “looks fine”;
- a closed-code/i18n parity test prevents raw status/reason leakage in either language;
- the requirement-to-proof table maps every binding accessibility/design-system rule to a component seam and automated/manual proof.

Screenshot review alone is never completion evidence.

---

# 23. Definition of done Definition of done

Plan 064 is implemented when:

1. the main quality workflows have axe and browser keyboard coverage;
2. one main landmark and a usable skip path exist throughout the shell;
3. mobile navigation and every control-room dialog trap/restore focus correctly;
4. every consequential unavailable action has an accessible explanation;
5. progress/live updates announce meaningful transitions without polling spam;
6. all status/provenance/comparison meanings survive without colour;
7. tables/forms/pagination are semantic and keyboard-usable;
8. 200/400% zoom, narrow mobile and reduced-motion regressions are green;
9. long URLs/identifiers cannot break core layout;
10. FR/EN closed-code parity prevents raw status/reason leakage;
11. existing visual design is more consistent without unnecessary new palette/components;
12. the dated manual acceptance record contains no known WCAG 2.2 A/AA
    failure in the named workflows;
13. axe + IBM Equal Access + keyboard/focus/zoom regression gates and the
    requirement-to-proof ledger are green.
