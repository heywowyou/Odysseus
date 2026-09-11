---
name: Odysseus
description: Near-navy audit dashboard sharing the report and site's design language, plus a typographic marketing site, recorded exactly as implemented today.
colors:
  base: "#0e141c"
  panel: "#16202c"
  raised: "#1a2530"
  overlay: "#2b3642"
  line: "rgb(233 238 245 / 0.07)"
  line-strong: "rgb(233 238 245 / 0.13)"
  ink: "#e9eef5"
  ink-soft: "#b6c1ce"
  ink-muted: "#96a2b0"
  accent: "#e9eef5"
  accent-strong: "#b6c1ce"
  accent-bright: "#38bdf8"
  accent-tint: "rgb(56 189 248 / 0.16)"
  danger: "#eb5757"
  sev-critical: "#f2555f"
  sev-serious: "#f08b3c"
  sev-moderate: "#e5b93c"
  sev-minor: "#4cc98a"
  site-paper: "#e8edf3"
  site-paper-raised: "#ffffff"
  site-ink: "#101b2a"
  site-ink-soft: "#3f4c5e"
  site-ink-muted: "#5c6878"
  site-line: "rgb(16 27 42 / 0.14)"
  site-line-strong: "rgb(16 27 42 / 0.28)"
  site-anchor: "#18385d"
  site-signal: "#43aa8b"
  site-mark-finding: "#dc2626"
  site-mark-evidence: "#0369a1"
  site-visitor-fill-faint: "rgb(53 105 180 / 0.09)"
  site-machine-highlight: "rgb(255 255 255 / 0.11)"
  site-visitor-accent: "#075985"
  site-accent: "#0369a1"
  site-accent-strong: "#075985"
  site-accent-soft: "rgb(14 165 233 / 0.12)"
  site-machine: "#0c121b"
  site-machine-ink: "#cfd4da"
typography:
  scale:
    title: "1.25rem"
    dialog-title: "1rem"
    body: "0.875rem"
    control: "13px"
    label: "0.75rem"
    micro-label: "11px"
    site-display: "clamp(2.125rem, 1.15rem + 3.9vw, 4rem)"
    site-title: "clamp(1.875rem, 1.3rem + 2.2vw, 2.75rem)"
    site-heading: "clamp(1.375rem, 1.15rem + 0.9vw, 1.75rem)"
    site-body: "1rem"
    site-label: "0.6875rem"
    site-wordmark: "1.8rem"
    site-lede: "clamp(1.0625rem, 0.98rem + 0.4vw, 1.25rem)"
    site-exhibit-title: "clamp(1.125rem, 1.02rem + 0.4vw, 1.3125rem)"
    site-price: "clamp(2rem, 1.55rem + 1.8vw, 2.75rem)"
    site-subheading: "1.0625rem"
    site-control: "0.9375rem"
    site-figure-label: "0.8125rem"
    site-micro-label: "0.6875rem"
    site-exhibit-title-floor: "1.125rem"
    site-exhibit-title-ceiling: "1.3125rem"
    site-price-floor: "2rem"
    site-price-ceiling: "2.75rem"
  title:
    fontFamily: "Avenir Next, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Avenir Next, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Avenir Next, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "normal"
  mono:
    fontFamily: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  site-display:
    fontFamily: "Avenir Next, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "clamp(2.125rem, 1.15rem + 3.9vw, 4rem)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  site-title:
    fontFamily: "Avenir Next, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.875rem, 1.3rem + 2.2vw, 2.75rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  site-heading:
    fontFamily: "Avenir Next, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.375rem, 1.15rem + 0.9vw, 1.75rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  site-body:
    fontFamily: "Avenir Next, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  site-label:
    fontFamily: "Avenir Next, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.18em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
  site-bar: "2px"
  site-control: "3px"
  site-md: "6px"
  site-card: "10px"
  site-card-lg: "12px"
  site-full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
  4xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#0e141c"
    typography: "Avenir Next 500 0.875rem"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
  button-secondary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "Avenir Next 500 0.875rem"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 16px"
  button-secondary-hover:
    backgroundColor: "{colors.overlay}"
  button-ghost:
    textColor: "{colors.ink-soft}"
    typography: "Avenir Next 500 0.875rem"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 16px"
  button-ghost-hover:
    backgroundColor: "{colors.raised}"
  button-danger:
    textColor: "{colors.danger}"
    typography: "Avenir Next 500 0.875rem"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 16px"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "Avenir Next 400 0.875rem"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 12px"
  badge:
    typography: "Avenir Next 500 0.75rem"
    rounded: "{rounded.md}"
    padding: "2px 8px"
  card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.xl}"
    padding: "20px"
  site-button-primary:
    backgroundColor: "{colors.site-ink}"
    textColor: "{colors.site-paper}"
    typography: "Avenir Next 600 0.875rem uppercase 0.14em"
    rounded: "4px"
    height: "52px"
    padding: "0 1.625rem"
  site-button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.site-ink}"
    typography: "Avenir Next 600 0.875rem uppercase 0.14em"
    rounded: "4px"
    height: "52px"
    padding: "0 1.625rem"
  site-card:
    backgroundColor: "{colors.site-paper-raised}"
    textColor: "{colors.site-ink}"
    rounded: "{rounded.site-card-lg}"
    padding: "1.5rem"
  site-dossier:
    backgroundColor: "{colors.site-paper}"
    textColor: "{colors.site-ink}"
    rounded: "{rounded.site-md}"
    padding: "1.5rem"
  site-dossier-stamp:
    backgroundColor: "{colors.site-accent-soft}"
    textColor: "{colors.site-accent-strong}"
    typography: "Avenir Next 600 0.6875rem"
    rounded: "{rounded.site-control}"
    padding: "3px 8px"
  site-exhibit:
    backgroundColor: "{colors.site-paper-raised}"
    textColor: "{colors.site-ink}"
    rounded: "{rounded.site-card-lg}"
    padding: "clamp(1.375rem, 0.9rem + 1.6vw, 2.25rem)"
  site-replay-button:
    textColor: "{colors.site-ink-soft}"
    typography: "Avenir Next 500 0.8125rem"
    rounded: "{rounded.site-full}"
    height: "32px"
    padding: "0 0.875rem 0 0.75rem"
---

# Design System: Odysseus

## Overview

**Creative North Star: "The Evidence Desk"**

Odysseus sells findings a client can check, so both surfaces are places evidence is examined: the operator reads it in the dashboard, the prospect reads it on the site. That is what the North Star asks of any new screen: show what is actually known, never a number nobody can stand behind, and state the limit before the strength. A blank where a value failed to load is honest; a confident zero is not.

The dashboard looks the part of a single-operator tool: a near-navy, layered interface in the same family as Linear or Vercel's consoles, since plan 040 slice 3 (2026-09-12) sharing its ground, ink ladder and hairlines with the report and site rather than the near-black look it wore before. Surfaces stack from base through panel, raised, and overlay, separated by 7 percent ink-hued hairlines rather than shadows. Primary buttons stay ink-inverted, not accent-filled, matching the site's own primary button; the accent's remaining job, as a sky-blue hue, is text and tint only (active navigation, links, badges). The other chromatic colors in the product are the four severity shades shared with the PDF report (deliberately not re-tuned to the new ground, trade-off 81) plus a danger red for destructive and error states.

The marketing site is a different world, built around the conceit of a working document rather than a software landing page: reader prose and raised cards on cool, faintly blue paper (light or near-black, switched by the OS color scheme preference), plus a fixed dark "machine" register for what a program reads. It is a standalone Next.js deploy with no component library, and, since 2026-09-11, its own operator-licensed self-hosted Avenir Next, loaded through next/font/local from woff2 files copied into `packages/site/app/fonts`; the dashboard and report self-host the same operator-licensed files independently (never imported from `packages/site`), so all three surfaces read the same typeface without sharing a build dependency. A plain persistent frame (text wordmark, three-item nav, footer with the compliance links, a skip link) wraps every public page; the preview route handler still answers with standalone documents outside the frame. Since 2026-09-11 the site also carries its own accent pair, borrowed from Tailwind rather than invented: sky blue for links, the dossier stamp, and the schematics' evidence marks, and a three-colour rule set on the dossier card (red Constat, yellow Preuve, teal-green Action; the green is also the skip link's keyboard focus). The site intentionally depends on nothing in the workspace, so it shares no tokens with the dashboard even though both now transcribe the same source values independently; it is recorded here as its own minimal surface.

Motion is decoration only. Dashboard entrances use short, decelerating fades and slides (0.2 to 0.3 seconds, cubic-bezier(0.16, 1, 0.3, 1)), a `prefers-reduced-motion` rule collapses all of it, and every state stays fully readable without animation. Accessibility posture is visible in the base layer: a global 2px focus outline in the ink color (not the accent hue, matching the site's own "foreground color" focus rule), AA-contrast text pairs in both directions of the theme, and dark color-scheme declared at the root. The site carries the same posture in its own idioms: a global 2px focus outline in the foreground color with a 2px offset, and AA-contrast pairs computed in both schemes. Since 2026-09-11 the site has its own motion system, one curve (`--ease-out-expo`, cubic-bezier(0.16, 1, 0.3, 1)) and three kinds of moment. The hero dossier card assembles on load (the sheet lands, its rows are written in order, their rules are drawn red, yellow, green, the report stamp is pressed on; about 1.5 seconds, the headline never waits). Card groups settle on first scroll into view at a slight alternating tilt and a small blur-to-sharp, as if a printed sheet were set down on the desk (`lib/reveal.tsx`), and the meters of the `process` stages fill in stage order (`lib/steps.tsx`). Each check schematic plays its measurement once when on screen (`lib/exhibit.tsx`), under five seconds, with a replay button. Reduced motion keeps short opacity fades and drops every move, draw, meter fill, blur and replay; without JavaScript, everything renders in its finished state.

*Provenance: every token, measurement and rule in this file was read from the code. The North Star was confirmed by the operator on 2026-09-02; the descriptive colour names and the named rules remain derived language, still open to the operator's rewording. Re-merged 2026-09-11 (`/impeccable document`, merge mode, dashboard untouched) so the site sections match the shipped state: the raised-card system replacing hairline-only rows, the sky/orange-600 accent pair replacing the earlier desaturated blue and the dossier's fixed-white sheet, the settle-in scroll reveal, and the corrected layout, radius, and shadow facts below. Dashboard content below this point was last verified 2026-09-02 (plan 022) until plan 040 slice 3 (2026-09-12, trade-off 84) moved its colors and typeface onto the report and site's shared design language; layout, shape, elevation, and component structure are otherwise unchanged by that pass.*

**Key Characteristics:**
- Dashboard: layered near-navy surfaces with hairline borders; depth by lightness, not shadow. Buttons stay ink-inverted; the sky accent appears only as text and tint (links, active navigation, badges), plus severity and danger at small sizes or 15 percent tints.
- Site: reader prose and raised cards on cool paper, light or near-black by OS preference; a sky-blue and orange-600 accent pair, each with exactly one job (links/evidence, one warm annotation).
- Self-hosted type on both surfaces, typeset small (14px dashboard body baseline, 20px titles as the ceiling, 16px site body); the dashboard, report, and site all typeset in independently self-hosted Avenir Next (Inter is retired everywhere).
- Dashboard is genuinely flat: shadow belongs only to floating layers (dialogs, dropdown menus, toasts). The site is not: since 2026-09-11 its repeated feature grids and dossier are soft-shadowed raised cards.
- Two independent radius ladders: dashboard 12px containers / 8px controls / 6px chips / full pills; site 10-12px cards / 6px dossier / 3px controls / full pill (language toggle only).
- Dashboard motion: short decelerating fades and slides, decoration only, killed under reduced motion. Site motion: a load sequence on the hero dossier, scroll-triggered settles and rule draws, and one-shot schematic measurements with replay; reduced motion keeps fades only, and no-JS shows finished states.

## Colors

The dashboard palette is one idea executed as a value scale: five near-navy neutrals for structure, three cool greys for text hierarchy, an ink-inverted pair for buttons, a sky-blue pair for the accent's text-and-tint role, and a single chromatic family reserved for severity. Since plan 040 slice 3 (2026-09-12, trade-off 84), the neutrals, ink ladder, hairlines, and accent are all transcribed by value from the report and public site's own dark scheme (trade-off 81), the same source both already share; severity and `danger` are the one deliberate exception (trade-off 81, unchanged again here).

### Primary
Buttons stay ink-inverted, matching the site's own primary button (a light surface with a dark label, never filled with the accent hue); the accent itself is a sky-blue hue reserved for its text-and-tint role: active navigation, links, badges, and progress fills.

- **Ink Accent** (`accent`, #e9eef5): the primary button surface, equal to `ink`. Light-on-dark inversion of the whole theme; its label is the near-navy base #0e141c so contrast holds both ways.
- **Ink Soft Accent** (`accent-strong`, #b6c1ce): primary button hover; equal to `ink-soft`, the same step the site's own button hover uses.
- **Sky Accent Text** (`accent-bright`, #38bdf8): the accent's text role (links inside tables, active accent badges), transcribed from the site's own `--accent` dark value (Tailwind sky-400). No longer equal to `ink`: the accent's text role and the button's surface role are now two different tokens, unlike the retired white-accent scheme where both were the same near-white value.
- **Sky Accent Tint** (`accent-tint`, rgb(56 189 248 / 0.16)): active sidebar navigation, active segmented segments, text selection background, accent badge backgrounds. Transcribed from the site's `--accent-soft` dark value. The quietest way the system says "selected".

### Tertiary (Severity, the only chromatic family)
No secondary accent exists; the chromatic family that does exist is severity, shared 1:1 with the PDF report so a finding reads as the same shade in both places.

- **Critical Red** (`sev-critical`, #f2555f): critical findings; failed jobs; the critical KPI value.
- **Serious Orange** (`sev-serious`, #f08b3c): serious findings.
- **Moderate Amber** (`sev-moderate`, #e5b93c): moderate findings.
- **Minor Green** (`sev-minor`, #4cc98a): minor findings; completed jobs.
- **Alert Red** (`danger`, #eb5757): destructive actions and form errors, not severity. It coexists with `sev-critical` as a second, slightly different red.

Severity appears at full strength only as text and as 8px status dots; large surfaces use the shade at 15 percent opacity as a badge background.

### Neutral
- **Near-Navy Base** (`base`, #0e141c): the app background, the deepest layer. Transcribed from the site's `--paper` dark value.
- **Panel Navy** (`panel`, #16202c): cards, KPI tiles, sidebar, top bar, dialogs. Transcribed from the site's `--paper-raised` dark value.
- **Raised Navy** (`raised`, #1a2530): inputs, secondary buttons, dropdown item hover, table row hover, progress track, skeletons. One hue step above the site's own raised, on the report's own neutral ramp (`nocturne.css`'s `--color-neutral-900`).
- **Overlay Navy** (`overlay`, #2b3642): dropdown menu panels and toasts, the lightest floating layer. The next step of that same ramp (`--color-neutral-800`); the site itself has no fourth tonal layer to transcribe, so the dashboard continues the ramp on its own.
- **Hairline Ink 7 Percent** (`line`, rgb(233 238 245 / 0.07)): default borders and dividers everywhere. The site defines only one hairline strength; this is the dashboard's own lighter second stop on the same hue.
- **Hairline Ink 13 Percent** (`line-strong`, rgb(233 238 245 / 0.13)): emphasized borders on floating layers, secondary button borders, dashed empty-state borders. Transcribed from the site's `--line` dark value.
- **Ink** (`ink`, #e9eef5): primary text. Transcribed from the site's `--ink` dark value.
- **Ink Soft** (`ink-soft`, #b6c1ce): secondary text, table cell text, inactive controls. Transcribed from the site's `--ink-soft` dark value.
- **Ink Muted** (`ink-muted`, #96a2b0): hints, table headers, labels, icons, timestamps. The site's own `--ink-muted` (#909cab) clears 4.5:1 on base/panel/raised but falls to 4.41:1 on `overlay`; nudged 15 percent toward `ink-soft` along the same hue to clear 4.5:1 everywhere (4.73:1 on overlay, the worst case), the same reasoning plan 022's #898e96 used against the old near-black grounds.

### Named Rules
**The Ink-Inverted Button Rule.** Buttons never fill with the accent hue; the primary surface is `ink` itself, matching the site's own primary button. The accent's sky hue is reserved for its text-and-tint role. Hierarchy comes from brightness steps, borders, and type, not brand color.

**The Severity Monopoly Rule.** Chromatic color is reserved for severity and danger. Severity color appears as text, as 8px dots, or as 15 percent tinted badge backgrounds, never as large filled surfaces.

**The One Grey Ladder Rule.** Text hierarchy uses exactly three greys: `ink` for what matters, `ink-soft` for content, `ink-muted` for labels and hints.

### Site

The public site is a fully separate palette: a light/dark cool-paper neutral scale (site prefix below), one sky-blue accent pair, and a three-colour row-rule set reserved for the dossier card. Recast 2026-09-11: the accent moved from a desaturated corporate blue to Tailwind's sky family, and the dossier card stopped being a fixed white "printed sheet" that ignored the site's own theme.

- **Cool Paper** (`site-paper`, #e8edf3 light / #0e141c dark): the site background; a faintly blue-tinted neutral in light mode rather than warm cream, a near-navy black in dark mode. Also the dossier's own surface since 2026-09-11 (previously a fixed white "sheet" regardless of theme).
- **Raised Paper** (`site-paper-raised`, #ffffff light / #16202c dark): every raised card (the diagnostic-scope statement, and, since 2026-09-11, the check/receive/method feature grids).
- **Site Ink** (`site-ink`, #101b2a light / #e9eef5 dark), **Ink Soft** (`site-ink-soft`, #3f4c5e / #b6c1ce), **Ink Muted** (`site-ink-muted`, #5c6878 / #909cab): the same three-step text ladder as the dashboard's grey scale, in the site's own cool-paper hue.
- **Sky Accent** (`site-accent`, #0369a1 light / #38bdf8 dark): links, the dossier stamp badge, the raw-versus-rendered inset. Recast 2026-09-11 for more vibrancy; sky-700 is the darkest step of Tailwind's sky family that still clears 4.5:1 body-text contrast on `site-paper` (measured 5.0:1). The lighter sky-400/500 steps read at only 2.4:1 to 3.5:1 against the light background and are reserved for dark-mode text and for tints/borders, never for light-mode links or body copy.
- **Sky Accent Strong** (`site-accent-strong`, #075985 light / #7dd3fc dark): link hover, and the dossier stamp's own text color (chosen over plain `site-accent` because the stamp's real alpha-composited background, `site-accent-soft` over the dossier surface, measures right at 4.5:1 with `site-accent` and 5.7:1 with this stronger step).
- **Sky Accent Soft** (`site-accent-soft`, `rgb(14 165 233 / 0.12)` light / `rgb(56 189 248 / 0.16)` dark): the dossier stamp's tinted background only.
- **Signal** (`site-signal`, #43aa8b): the dossier's Action-row rule and the skip link's keyboard focus border. Changed during the 2026-09-11 live session from orange-600 (#ea580c) to this teal green. Never text.
- **Mark Finding / Mark Evidence** (`site-mark-finding`, #dc2626; `site-mark-evidence`, the page's own `site-accent`, #0369a1 light / #38bdf8 dark): the dossier's Constat and Preuve row marks, added 2026-09-11 at the operator's request; Preuve moved from yellow to blue the same day because yellow read as a warning to a client. With Signal they mark the three parts of one finding in reading order (problem, evidence, action), not a severity scale; they are decoration and the row labels carry the meaning. Never text, never anywhere but the dossier.
- **Visitor Accent** (`site-visitor-accent`, #075985, with a `rgb(14 165 233 / 0.14)` soft tint): evidence blue as it reads on the fixed light documents inside the schematics (pins, dashed flag outlines, the scan line, the JavaScript progress bar). Not re-tuned in dark mode, because those documents stay light in both schemes.
- **Anchor** (`site-anchor`, #18385d light / #8fb4ee dark): the diagnostic-scope statement's left border only. Historically also the dossier's spine before its 2026-09-11 recast; the dossier no longer uses it.
- **Machine Ink on Machine** (`site-machine`, #0c121b / #0a0e15 dark; `site-machine-ink`, #cfd4da): the raw-versus-rendered inset and every code block, fixed in both color schemes because it represents a thing (a program's view), not this site's own theme.

### Named Rules
**The Dossier Rule Set.** Red, blue and the signal green appear only as the dossier's three row dashes (plus the signal on the skip link's focus). Never text, never a severity, never a section decoration; any other use is a defect, not a new accent.

**The Card Recast Rule.** Since 2026-09-11 the dossier, the diagnostic-scope statement, and the repeated check/receive/method grids are raised cards (`site-paper-raised` background, hairline border, soft ink-tinted shadow), reversing an earlier "not a card wall" decision at the operator's explicit request. The `process` stages and the `method-grid` principles each sit in one raised panel divided by hairlines, never a card per item (operator pick in live mode, 2026-09-11, replacing flat hairline rows that read too faint): larger titles, full-size body text, and on the stages a short meter filled up to each stage's position, the last stage in `--signal` green. `lib/steps.tsx` renders the stages on both the home and offer pages so the two cannot drift.

## Typography

**Display Font:** Avenir Next (self-hosted Avenir Next Cyr woff2 at 400, 500, 600, 700, independently from the same operator-licensed files the report and site self-host; fallbacks ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif). Inter is retired here as of plan 040 slice 3 (2026-09-12, trade-off 84), the way it was already retired from the report in plan 039.
**Body Font:** Avenir Next, same stack
**Label/Mono Font:** ui-monospace, SFMono-Regular, Menlo, Consolas, monospace (URLs and IDs only)

**Character:** One utilitarian workhorse family at deliberately small sizes. The dashboard resets the body to 14px (not Tailwind's 16px), keeps a tight-tracked semibold for titles, and stops at 20px; nothing in the product is display-sized. The site's own scale is a separate system (its own fluid clamp-based sizes); see Site below.

### Hierarchy
- **Title** (Avenir Next 600, 20px / 28px, letter-spacing -0.025em): page titles and KPI values; the largest text in the product. Dialog titles sit one step down at 16px semibold.
- **Section Label** (Avenir Next 600, 12px, uppercase, tracking-wide): small section headers on the prospect detail page.
- **Body** (Avenir Next 400, 14px / 21px): the working size for almost everything, including buttons at 14px and card copy.
- **Mid-step 13px** (Avenir Next 500): a real, recurring size between xs and sm used for small buttons, field labels, and segmented control items; it exists only as the arbitrary value `text-[13px]`.
- **Label** (Avenir Next 500, 12px / 16px): badges, table headers, hints, timestamps. Uppercase only in the section labels noted above.
- **Micro Label** (Avenir Next, 11px, uppercase, tracking-wide): the smallest step, one below Label, used once (the report preparation card) for an uppercase micro heading. Rare, but a real role rather than drift, so it is on the ramp.
- **Mono** (12 to 13px): URLs and identifiers in scan and prospect views, set in the mono stack to survive long unbroken strings.

### Named Rules
**The 14px Baseline Rule.** The dashboard is typeset at 14px; sizes above it are reserved for page titles, dialog titles, and KPI values, and nothing exceeds 20px.

### Site

**Display / Body Font:** Avenir Next (self-hosted Avenir Next Cyr woff2 at 400, 500, 600, 700 via next/font/local; the real fallback chain declared in code is `ui-sans-serif, system-ui, 'Segoe UI', sans-serif`, not the generic Arial/Helvetica an earlier draft of this file recorded).

**Character:** A fluid, clamp-based scale rather than the dashboard's fixed steps: display and title sizes grow with viewport width between a mobile floor and a desktop ceiling, so headlines stay large on wide screens without overflowing narrow ones.

- **Site Display** (600, `clamp(2.125rem, 1.15rem + 3.9vw, 4rem)` / 1.04, -0.035em): the hero headline only.
- **Site Title** (600, `clamp(1.875rem, 1.3rem + 2.2vw, 2.75rem)` / 1.1, -0.03em): page `<h1>`.
- **Site Heading** (600, `clamp(1.375rem, 1.15rem + 0.9vw, 1.75rem)` / 1.2, -0.02em): section `<h2>`.
- **Site Body** (400, 1rem / 1.65): running prose; the lede variant steps up to a fluid `clamp(1.0625rem, 0.98rem + 0.4vw, 1.25rem)` in `ink-soft`.
- **Site Label** (600, 0.6875rem, uppercase, 0.18em tracking): the wordmark setting, for labels of a word or two inside a component (the statement's « Portée du diagnostic », the dossier's row terms, the table-of-contents and footer labels). Never a kicker above a heading: all 24 were removed 2026-09-11 (operator decision, detector rule `kicker-above-heading`).
- **Figure Label** (600, 0.8125rem, sentence case): captions inside a schematic, which run to a whole phrase; uppercase would read as all-caps body text.
- **Site Wordmark** (700, 1.8rem, uppercase, 0.2em tracking): header and footer. Raised twice on 2026-09-11 at the operator's request, from 0.9375rem to 1.375rem, then 30 percent more to 1.8rem. In the header below 26rem it steps down to 1.5rem so it still shares one row with the language toggle at 390px.
- **Site Button** (600, 0.875rem, uppercase, 0.14em tracking, 52px tall): every `.btn`, set in the wordmark's nameplate register (operator pick in live mode, 2026-09-11). A primary button that opens an email carries a drawn arrow (masked SVG, label colour) that slides 3px on hover.

### Named Rules
**The Fluid Scale Rule.** Display, title, and heading sizes are `clamp()` expressions tied to viewport width, not fixed steps; a value is never quoted as a single px/rem number without its clamp range.

## Layout

The dashboard is a fixed-chrome operator app. A 240px sidebar (`w-60`, panel background, hairline right border) holds the wordmark, tagline, four nav items, and the language switcher pinned to the bottom. Content is offset by the sidebar width and constrained to a 1024px reading column (`max-w-5xl`) with 16px side padding, 32px from md up, 40px top padding on desktop and 64px on mobile to clear the 48px fixed top bar that replaces the sidebar under 768px. Mobile navigation is a 256px left drawer over a 60 percent black scrim.

Every route opens with the same PageHeader: a 20px semibold title with an optional muted description on the left and action buttons on the right, followed by a 32px gap. KPI tiles sit in a 2-column grid that becomes 4 columns at 1024px, with 12px gaps and a staggered entrance of 50ms per tile. Tables live inside a 12px-radius bordered panel and scroll horizontally rather than reflowing. Breakpoints in actual use are Tailwind's `md` (768px) and `lg` (1024px).

The site's container system is two custom widths, not a Tailwind `max-w-*` utility: `.shell` (1120px, `--shell: 70rem`, 24px side padding under 40rem / 40px above) holds every section, and `.measure` (640px, `--measure: 40rem`) narrows prose and the hero lede to a readable line length inside it. The hero breaks from single-column at 64rem into `.split`: a flexible main column plus a fixed 26rem aside carrying the dossier card, deliberately offset 3rem below the prose's first line so the two read as text-and-exhibit rather than two equal columns. Below 64rem the aside stacks under the prose in DOM order. Sections are separated by hairline rules and fluid vertical padding (`clamp()`-based, 3.25rem to 6rem), never by cards; that hairline-and-whitespace rhythm is unchanged by the 2026-09-11 recast, which only changed the repeated item-level grids inside sections. A persistent frame (text wordmark, three-item nav, footer with the compliance links, a skip link) wraps every public page; the preview route handler still answers outside the frame with standalone documents. The header collapses from two items per row to a stacked two-row layout below 26rem, DOM order unchanged. The home page's checks section is a single column of full-width exhibit cards (2026-09-11, replacing a two-by-two grid): prose in a 4fr column, which sticks beside a taller figure from 60rem up, and the schematic in a 7fr column that is its own `inline-size` container, so each schematic lays out by its real width rather than the viewport's.

Since 2026-09-11 the two card grids (`check-grid`, `receive-grid`) hold `align-items: start` rather than the CSS grid default of `stretch`: with the items now visible bordered cards, a taller sibling in the same row used to stretch its shorter neighbor into a card with a large blank interior, which was invisible back when the items were flat hairline rows. Each card now hugs its own content height instead.

## Elevation & Depth

Depth is tonal, not shadowed. The four surface steps (base, panel, raised, overlay) plus hairline borders do almost all of the work; a card reads as raised because it is lighter than the base and outlined, not because it casts anything. Exactly two shadows exist in the product, both the Tailwind `shadow-xl` preset (0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)), and both belong to floating layers: dialog content and dropdown menus. Toasts float with a border and the overlay background but no shadow. Modal and drawer scrims are flat black at 70 and 60 percent.

### Shadow Vocabulary
- **Floating layer** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): dialogs and dropdown menu panels only; always paired with a `line-strong` border.

### Named Rules
**The Flat-By-Default Rule (dashboard only).** Dashboard surfaces are flat at rest. A shadow appears only when a layer floats above the page, and it is always the same preset. The site does not follow this rule; see Site below.

### Site

Depth on the site is genuinely shadowed, not tonal, since the 2026-09-11 card recast: the dossier card, the diagnostic-scope statement, the check/receive feature grids, and the single `process` and `method-grid` panels all carry a soft, ink-tinted resting shadow (never a neutral black one, so raised surfaces stay part of the cool-paper register).

### Shadow Vocabulary
- **Card** (`--shadow-card`; light: `0 1px 2px rgb(16 27 42 / 0.06), 0 10px 28px rgb(16 27 42 / 0.1)`; dark: `0 1px 2px rgb(0 0 0 / 0.35), 0 14px 32px rgb(0 0 0 / 0.45)`): the dossier, the diagnostic-scope statement, every check/receive grid item, and the `process` and `method-grid` panels.
- **Button** (`inset 0 1px 0 rgb(255 255 255 / 0.14)` over `--shadow-card`, plus a 1px `translateY` lift on hover): `.btn-primary` at rest; the secondary button stays flat with a hairline border.

### Named Rules
**The Card Shadow Rule.** Every site card shares one shadow token (`--shadow-card`); a new raised element reuses it rather than inventing a bespoke box-shadow.

## Shapes

The form language is a strict radius ladder mapped to elevation: 12px (`rounded-xl`) for containers that hold content (cards, KPI tiles, dialogs, empty states, table wrappers), 8px (`rounded-lg`) for controls (all button variants, inputs, selects, textareas, nav items, dropdown panels, segmented containers, skeleton loading rows), 6px (`rounded-md`) for inner elements (badges, dropdown items, segmented segments), and full pills only for progress bars and status dots. Empty states are the one dashed border in the system: 1px dashed `line-strong` on a 60 percent panel background. Borders elsewhere are 1px solid hairlines (7 percent ink, 13 percent for floating layers and secondary buttons).

The site has its own, independent radius ladder, tighter at every step than the dashboard's: 3px for controls (`.btn`, the skip link's focus box), 4px for the machine-register code block, 5px for the raw-versus-rendered inset, 6px for the dossier card, 10px for the diagnostic-scope statement (whose left corners stay square, carrying the `site-anchor` border-left), 12px for the repeated check/receive/method feature cards and the exhibits, 2px for bars inside the schematics, 8px for the panels inside a schematic (machine and visitor bands, the mock page, the file stack), and full pills for the language toggle, the replay button, status chips and schematic tags. Borders are the same 1px solid hairline convention as the dashboard, at the site's own opacities (14 percent / 28 percent).

## Components

### Buttons
- **Shape:** 8px radius, 36px tall at the md size, inline-flex centered with a 8px icon gap.
- **Primary:** ink surface (`accent`) with near-navy #0e141c label at 14px medium; hover steps down to `accent-strong`.
- **Secondary:** `raised` surface with a `line-strong` border and `ink` label; hover lifts to `overlay`.
- **Ghost:** no surface, `ink-soft` label; hover gains a `raised` background and brightens to `ink`.
- **Danger:** transparent surface, `danger` label, `danger` at 40 percent border; hover gains a 10 percent `danger` tint.
- **All variants:** 150ms all-property transition, `active` scales to 0.98, disabled at 50 percent opacity, optional loading spinner replaces content. Small size is 32px tall with 13px text.

### Badges
- **Style:** 6px radius, 2px by 8px padding, 12px medium text; tone sets a 15 percent tinted background plus full-strength text color.
- **State:** six tones: neutral (grey on grey), accent (sky tint on sky text), and one per severity (critical, serious, moderate, minor).

### Cards / Containers
- **Corner Style:** 12px radius.
- **Background:** `panel` on `base`.
- **Shadow Strategy:** none; hairline border only (see Elevation).
- **Border:** 1px solid `line`.
- **Internal Padding:** 20px; optional header row with 14px semibold title and 12px muted description, 16px top and 20px bottom with 4px between.

### Inputs / Fields
- **Style:** 36px tall, 8px radius, `raised` background, `line` border, 14px `ink` text, 12px horizontal padding; selects add 36px right padding for a 16px chevron; textareas are the same box at `min-height: 96px` with 8px vertical padding.
- **Focus:** border brightens to `accent` at 70 percent plus a 2px `accent` ring at 25 percent; color transition only.
- **Error / Disabled:** errors render as a 12px `danger` line under the field with `role="alert"`; disabled controls sit at 50 percent opacity. Field labels are 13px medium `ink-soft` with 6px below; hints are 12px `ink-muted`.
- **Placeholder:** `ink-muted`.

### Navigation
- **Style:** sidebar items are 8px-radius rows with a 16px icon and 14px medium label; default `ink-soft`, hover gains `raised` background and `ink` text, active is `accent-tint` (sky-tinted since plan 040 slice 3) background with `ink` text. The wordmark is text only (14px semibold, tight tracking; the operator direction is explicitly no logo mark). Dropdown menus are the floating pattern: `overlay` panel, 8px radius, `line-strong` border, shadow, 4px inner padding, 6px-radius items with `raised` hover and focus.

### Empty States
- **Style:** centered column in a 12px-radius, 1px dashed `line-strong` bordered box on `panel` at 60 percent, 40px padding; optional 24px muted icon, 14px medium title, 14px muted description, action button below.

### Signature Patterns
- **KPI Tile:** 12px-radius bordered panel, 16px by 12px padding, 12px muted label over a 20px semibold tight-tracked value; the critical tone turns the value `sev-critical`. The value is tri-state since plan 022: loaded (the number), loading (skeleton), or unavailable (the localized Indisponible marker at a muted step), so a failed load never renders as a confident zero. Outreach hub counts use the same three states. Dashboards open with a staggered 4-tile row.
- **Status Dot:** 8px full-strength circle: grey for queued and cancelled, ink-colored and pulsing for running (`accent`), green for complete, red for failed.
- **Progress Bar:** 6px full-round track on `raised`; the fill is ink-colored (`accent`) with a 300ms width transition, or a one-third-wide ink segment slides forever for uncapped work (indeterminate means no real target exists).
- **Skeleton:** `raised` block with a 110deg ink-hued 5 percent shimmer sweeping every 1.8s.
- **Toasts:** Sonner, dark theme, top right, `overlay` background with `line-strong` border and `ink` text.
- **InfoTip:** a 14px muted info icon on a focusable trigger; the hint opens on hover and keyboard focus in a portal-rendered floating panel (`overlay` background, `line-strong` border, 6px radius, 12px text), so it neither clips inside scrolling tables nor locks out keyboard users.

### Site

#### Buttons
- **Shape:** 3px radius, 44px tall, inline-flex centered with a 0.5rem gap.
- **Primary:** `site-ink` surface with `site-paper` label; hover steps to `site-ink-soft` and adds a 1px lift plus a soft ink-tinted shadow.
- **Secondary:** transparent surface, `site-line-strong` border, `site-ink` label; hover brightens the border to `site-ink` and tints the background `site-line`.
- **All variants:** a 1px hover lift (`translateY(-1px)`, cubic-bezier(0.16, 1, 0.3, 1)) added 2026-09-11 alongside the color/border transitions that already existed.

#### Cards (Statement, Dossier, Check/Receive/Method)
- **Corner Style:** 10px (statement), 6px (dossier), 12px (check/receive/method).
- **Background:** `site-paper-raised` (statement, check/receive/method) or `site-paper` (dossier).
- **Shadow Strategy:** the shared `--shadow-card` token; see Elevation & Depth, Site.
- **Border:** 1px solid `site-line` (or `site-line-strong` on the dossier); the statement additionally carries a 2px `site-anchor` left border.
- **Internal Padding:** 1.5rem, except the statement's asymmetric 1.25rem/1.25rem/1.25rem/1.5rem (extra start padding to clear its left border).
- **Grid behavior:** `align-items: start` on every multi-card grid, so a card hugs its own content instead of stretching to a taller row-mate (2026-09-11 fix; see Layout, Site).

#### Signature: the Dossier
The "what every finding contains" card, rendered from one component on every page that shows it (`lib/dossier.tsx`; two hand-kept copies had drifted to different row names, now guarded by `marketing-copy.test.ts`). A labelled header (title plus a sky-accent stamp badge), three definition-list rows separated by hairlines (Constat, Preuve, Action), each with its label (0.6875rem, uppercase, 0.16em tracking) stacked above its sentence so the sentence gets the card's full width, and a caption disclaiming that the content is illustrative. The stamp never wraps; the title wraps in its own column instead. Each label opens with a short round-capped dash (1.125rem by 3px, a `::before` on the `dt`) in the row's colour: red, blue, then the signal green on Action, whose text alone steps up to `site-ink`; the load sequence draws the three dashes in order. A full-height 4px stripe down each row was tried first and replaced, because the side stripe is the detector's `side-tab` tell. Layout picked in a live polish pass, 2026-09-11. It sits on `site-paper` in both colour schemes.

#### Signature: Exhibits and Schematics
Each check on the home page is an exhibit card: its prose beside a schematic of what the check measures (`lib/schematics.tsx`). Every schematic shares one grammar, the **artifact a program reads beside the readout a person reads**, so the three read as one instrument:
- **Render diff:** two stacked bands in the order they happen, a dark machine band (the empty application shell, and a hatched "no title, no text, no link" verdict) above a light visitor band (a JavaScript progress bar, then content bars, then a tinted verdict). Each band splits artifact and verdict side by side from a 30rem figure width, so the two loads line up column for column.
- **Accessibility:** a light mock page crossed by a scan line; each flagged element gets a dashed visitor-accent outline and a numbered pin, matched by a readout row naming the problem, the element (`<img>`, `<p>`, `<input>`) and the WCAG criterion axe-core tags that rule with.
- **AI signals:** a stack of machine-register files (robots.txt, llms.txt, the page head's JSON-LD) whose decisive lines get a highlighter sweep as they are read, matched by readout rows with status chips: present (sky tint, check), blocked (sunk paper, struck circle), missing (dashed outline, dashed circle).
The artifact side is `aria-hidden`; the readout side is real text. Every figure carries the caption "Schéma de principe : il ne représente ni un site réel, ni le résultat d'un audit." and never shows a real site, a real finding, or a figure.

Motion primitives, one per element with a `--d` delay: `fx-clip` (left-to-right clip reveal, for text), `fx-rise`, `fx-pop` (pins and chips), `fx-grow-x`/`fx-grow-y` (bars and rules), `fx-mark` (highlighter sweep), `fx-flag` (outline tightening onto an element). A primitive's resting style is always its finished frame; the start frame exists only while an armed exhibit has not yet run.

#### Replay Button
A 32px pill (`site-line-strong` border, `site-ink-soft` label, 14px counter-clockwise arrow) under each schematic beside its caption. The only way to see a measurement again; hidden under reduced motion and without JavaScript.

#### Language Toggle
- **Style:** a pill-shaped segmented control (999px radius, 1px `site-line-strong` border, 4px padding); the active segment fills `site-ink` with `site-paper` text.

### Named Rules
**The Independent Systems Rule.** The site's buttons, cards, and dossier never reference a dashboard token or component; every value above is site-prefixed and lives in the site's own `globals.css`.

## Do's and Don'ts

### Do:
- **Do** address colors by token name (`panel`, `line`, `ink-soft`); the hex values in the frontmatter are the normative source for those names.
- **Do** keep body text at 14px and push secondary content down the grey ladder (`ink` for what matters, `ink-soft` for content, `ink-muted` for labels and hints).
- **Do** reserve severity color for text, 8px dots, and 15 percent tinted badges; match the PDF report's shade exactly.
- **Do** give floating layers (dialog, dropdown) both a `line-strong` border and the shadow preset; they never appear separately.
- **Do** use the named keyframe animations (`page-in`, `overlay-in`, `content-in`, `drawer-in`) with the cubic-bezier(0.16, 1, 0.3, 1) curve for entrances, and keep state readable with animations disabled.
- **Do** keep the focus system: global 2px `accent` outline with 2px offset; inputs add the 70 percent border plus 25 percent ring.
- **Do** render unknown data as the unavailable state (the localized Indisponible marker, or a skeleton while loading), never as a confident zero; a zero means loaded and genuinely empty.
- **Do** keep every public site page inside the shared frame with its skip link; only the preview route handler answers bare.
- **Do** (site) reuse `--shadow-card` for any new raised surface rather than inventing a bespoke box-shadow; keep `align-items: start` on any new multi-card grid.
- **Do** (site) keep the sky accent's light-mode text usage at sky-700 or darker; sky-400/500 read at only 2.4:1 to 3.5:1 against the light `site-paper` background and are reserved for dark-mode text, tints, and borders.
- **Do** (site) build any new explanatory figure in the schematic grammar: artifact beside readout, readout as real text, captioned as a schematic, resting on its finished state, one run under five seconds with a replay button.
- **Do** (site) render the dossier card through `lib/dossier.tsx` only.

### Don't:
- **Don't** fill a dashboard button with the accent hue; buttons stay ink-inverted, matching the site's own primary button. The accent's sky hue is reserved for its text-and-tint role (links, active navigation, badges), alongside severity as the product's other chromatic family.
- **Don't** put shadows on resting dashboard surfaces (cards, tiles, buttons, tables); shadow means "floating". The site's own cards are the deliberate exception; see Elevation & Depth, Site.
- **Don't** typeset above 20px; below 14px the steps are 13, 12, and the single 11px micro-label in the report preparation card.
- **Don't** fill large areas with severity colors; full-strength chroma belongs to text and dots only.
- **Don't** import dashboard tokens into the site or treat the site as themed; it is deliberately standalone with its own light/dark scheme-swap token system, even though the dashboard, report, and site now all independently self-host the same operator-licensed Avenir Next files.
- **Don't** replace the wordmark with a logo mark; the brand is the name, set in semibold Avenir Next on every surface.
- **Don't** (site) put a small uppercase label above a heading, or a coloured stripe down one side of a card or row.
- **Don't** (site) use the dossier mark colours (`site-mark-finding`, `site-mark-evidence`, `site-signal`) anywhere but the dossier's rows and the skip link's focus, and never as text or as a severity.
- **Don't** (site) animate text opacity inside a schematic or loop a schematic; reveal text with clip, and play once.
- **Don't** (site) split the `process` stages or the `method-grid` principles into a card per item; each group is one panel divided by hairlines, and only the stages carry a meter and numeral, because only they are a sequence.

## Observed Inconsistencies (recorded, not judged)

These are facts about the incumbent implementation worth knowing before changing it:

1. **Superseded 2026-09-12, plan 040 slice 3 (trade-off 84).** `ink` and `accent-bright` used to be the same value (#f7f8f8) under two names, with `accent` (#f2f3f5) a few points off it, so the accent family read as nearly indistinguishable from the text greys. The restyle deliberately splits this: `accent`/`accent-strong` now equal `ink`/`ink-soft` exactly (buttons stay ink-inverted), while `accent-bright`/`accent-tint` take the sky hue, a real, visible accent distinct from the grey ladder.
2. Two reds coexist: `danger` #eb5757 (forms, destructive buttons) and `sev-critical` #f2555f (severity, failed jobs).
3. The site does not share the dashboard's token system, even though both now independently transcribe the same site/report source (trade-offs 81, 84): the site loads its own self-hosted typeface through next/font/local (Avenir Next since 2026-09-11), and it keeps its own radius ladder (3px controls up to 12px cards, tighter at every step than the dashboard's), its own button and focus classes, and a cool-paper `prefers-color-scheme` swap, unlike the dashboard's fixed dark-only theme.
4. `text-[13px]` is an arbitrary value appearing in five files (small buttons, field labels, segmented items, scan URLs, report preparation copy); it is a real step of the scale that exists only as a literal.
5. **RESOLVED 2026-09-02, plan 022 step 6: the self-hosted Inter now loads.** The four `@font-face` URLs in `theme.css` used to request `/dashboard/fonts/Inter-*.woff2`, which the built app resolved to `dist/public/dashboard/fonts/...` (a plain 404; `APP_ROUTE_PATTERN` did not cover the path either), so every `@font-face` failed and the dashboard rendered in the fallback stack. The URLs now point at `/fonts/Inter-*.woff2`, and the `copy-inter-fonts` Vite plugin both copies the canonical woff2 files to `dist/public/fonts` at build time and serves the same canonical files through a dev-server middleware, so dev and build answer identically. Verified 2026-09-02: all four URLs return 200 `font/woff2` from both the built `dist/public` output and the Vite dev server.

6. **RESOLVED 2026-09-02, plan 022 step 6.** The sidebar wordmark's one-off 15px step moved to the standard `text-sm` (14px), matching the same component's topbar variant. The detector's only real dashboard font-size finding is cleared; the `overused-font` findings on Inter across the dashboard and report are dismissed by the recorded decision to pin Inter there. See item 7 for the site's own typeface, which no longer shares this dismissal.
7. **RESOLVED 2026-09-11, impeccable fix plan step 6.** The site typeface changed from the shared Inter to an operator-licensed, self-hosted Avenir Next, replacing the four Inter woff2 files in `packages/site/app/fonts` with four Avenir Next Cyr weights (Regular 400, Medium 500, Demi 600, Bold 700). The dashboard and report are unaffected and keep Inter (trade-off 79 and PRODUCT.md, Brand Commitments). The `overused-font` detector finding on the site no longer applies, since Inter is no longer the site's typeface; no ignore-value was needed or added for `packages/site`.
8. **RESOLVED 2026-09-11, operator-requested card/color/motion pass (`impeccable live` plus direct edits).** Four site facts changed together: (a) the dossier, the diagnostic-scope statement, and the check/receive/method feature grids became raised cards with a shared `--shadow-card` token, reversing an explicit earlier "not a card wall" decision; (b) the evidence-blue accent moved from a desaturated corporate blue (#3569b4) to Tailwind's sky family, and signal orange moved from a muted burnt orange (#d56832) to orange-600 (#ea580c), both re-measured for contrast; (c) one authored scroll-triggered settle-in motion was added via a new `lib/reveal.tsx`; (d) a CSS grid `align-items: start` fix was needed on every multi-card grid, since the default `stretch` produced a large blank interior in a shorter card next to a taller sibling once cards became visible bordered surfaces (invisible before, when items were flat hairline rows). This pass also deleted the `--sheet-*` and `--navy`/`--navy-line` custom properties, dead since the dossier stopped consuming them; `--accent-line`, `--machine-raised`, `--visitor-line`, and the `@theme inline` block's `--color-*`/`--font-sans` entries remain unused but predate this pass and were left alone. This `DESIGN.md` file itself was stale before this entry: it recorded a `site-background`/`site-foreground` two-color token pair and a 672px `max-w-2xl` container that no longer matched the code, likely predating the "evidence dossier" system's introduction; `/impeccable document` (merge mode) regenerated every site section above from the current code, leaving the dashboard sections untouched.
9. **RESOLVED 2026-09-11, operator live steer and corrective pass.** The home checks section became four exhibit cards with schematics (render diff restacked into two symmetric bands after its side-by-side panels squeezed the verdict into single-word lines; new accessibility and AI-signal schematics); the site motion system replaced the single settle-in, after the operator reported seeing no animation (the old render-in ran at page load, before anyone scrolled to it). The dossier moved into one shared component with a red/yellow/green row-rule set, the wordmark grew to 1.375rem, and the `.diff`, `.diff-panel`, `.machine-code`, `.machine-empty`, `.visitor` and `render-step` rules were deleted with the markup that used them.
10. **RESOLVED 2026-09-12, plan 040 slice 3 (trade-off 84).** Items 5-7 above record that the dashboard kept Inter while the report and site moved to Avenir Next; that is now historical. The dashboard's four `@font-face` declarations, `vite.config.ts`'s font-copy plugin, and every color token were repointed to the near-navy/Avenir Next system items 5-7 describe for the other two surfaces, self-hosted independently rather than shared. The `overused-font` dismissal item 6 recorded for "the dashboard and report" pinning Inter no longer applies to the dashboard (the report's own dismissal had already been superseded by plan 039, trade-off 79, without this file being updated at the time); no new ignore was needed since the finding is now genuinely absent.

## Carrying this design into the report

Done 2026-09-11 (plan 039, trade-offs.md#81, operator direction pick: dark near-navy, Avenir Next with the licence confirmed for PDF and bucket-served web embedding, severity re-tuned, fixed dark preview, dossier motif). The report and the v2 outreach preview now wear this site's dark scheme: the ground and ink tokens, the sky accent, the raised-card and dossier treatments (the finding cards' red/blue/green row dashes, decoration only, never severity), and the Avenir Next files self-hosted in the report package. What transferred cleanly, as this section predicted: the cool-paper ink tokens (dark scheme), Avenir Next, and the dossier card's row-rule grammar. What did not, exactly as recorded here: all motion, sticky and container-query layout, and light/dark switching (the documents are one fixed dark world; the preview matches the PDF). The constraints that still bind the report held through the change: the design system stays locked under its own direction contract (`docs/report/report-design-system.md`, trade-off 9: CSS hand-maintained from `docs/report/design/`, no Tailwind), the axe self-test stayed at zero violations on the new palette, PDF glyph rendering still relies on `REPORT_PDF_CHROMIUM_ARGS` (trade-off 19), and the annex pagination rules (trade-offs 17 and 32) were untouched. Reports rendered after this baseline need a fresh approval round; the retired Nocturne look survives only in stored, already-approved artifacts.
