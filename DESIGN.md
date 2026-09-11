---
name: Odysseus
description: Monochrome dark audit dashboard and a typographic marketing site, recorded exactly as implemented today.
colors:
  base: "#08090a"
  panel: "#101112"
  raised: "#17181a"
  overlay: "#1e1f23"
  line: "rgb(255 255 255 / 0.07)"
  line-strong: "rgb(255 255 255 / 0.13)"
  ink: "#f7f8f8"
  ink-soft: "#9fa5ae"
  ink-muted: "#898e96"
  accent: "#f2f3f5"
  accent-strong: "#d3d6db"
  accent-bright: "#f7f8f8"
  accent-tint: "rgb(255 255 255 / 0.09)"
  danger: "#eb5757"
  sev-critical: "#f2555f"
  sev-serious: "#f08b3c"
  sev-moderate: "#e5b93c"
  sev-minor: "#4cc98a"
  site-background: "#ffffff"
  site-foreground: "#171717"
typography:
  scale:
    title: "1.25rem"
    dialog-title: "1rem"
    body: "0.875rem"
    control: "13px"
    label: "0.75rem"
    micro-label: "11px"
    site-title: "1.5rem"
    site-heading: "1.25rem"
    site-body: "1rem"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
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
  site-title:
    fontFamily: "Avenir Next, Arial, Helvetica, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.33
    letterSpacing: "normal"
  site-body:
    fontFamily: "Avenir Next, Arial, Helvetica, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
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
    textColor: "#08090a"
    typography: "Inter 500 0.875rem"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
  button-secondary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "Inter 500 0.875rem"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 16px"
  button-secondary-hover:
    backgroundColor: "{colors.overlay}"
  button-ghost:
    textColor: "{colors.ink-soft}"
    typography: "Inter 500 0.875rem"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 16px"
  button-ghost-hover:
    backgroundColor: "{colors.raised}"
  button-danger:
    textColor: "{colors.danger}"
    typography: "Inter 500 0.875rem"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 16px"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "Inter 400 0.875rem"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 12px"
  badge:
    typography: "Inter 500 0.75rem"
    rounded: "{rounded.md}"
    padding: "2px 8px"
  card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.xl}"
    padding: "20px"
---

# Design System: Odysseus

## Overview

**Creative North Star: "The Evidence Desk"**

Odysseus sells findings a client can check, so both surfaces are places evidence is examined: the operator reads it in the dashboard, the prospect reads it on the site. That is what the North Star asks of any new screen: show what is actually known, never a number nobody can stand behind, and state the limit before the strength. A blank where a value failed to load is honest; a confident zero is not.

The dashboard looks the part of a single-operator tool: a near-black, layered monochrome interface in the same family as Linear or Vercel's consoles. Surfaces stack from base through panel, raised, and overlay, separated by 7 percent white hairlines rather than shadows. The accent is white. Primary actions are the brightest object on screen, which means hierarchy is carried by brightness steps and typography, never by brand color. The only chromatic colors in the product are the four severity shades shared with the PDF report, plus a danger red for destructive and error states.

The marketing site is a different, deliberately spartan world. It is a standalone Next.js deploy with no component library: white or near-black pages (switched by the OS color scheme preference), single-column documents, and, since 2026-09-11, its own operator-licensed self-hosted Avenir Next (no longer shared with the dashboard's Inter), loaded through next/font/local from woff2 files copied into `packages/site/app/fonts`. A plain persistent frame (text wordmark, three-item nav, footer with the compliance links, a skip link) wraps every public page; the preview route handler still answers with standalone documents outside the frame. The site intentionally depends on nothing in the workspace, so it shares no tokens with the dashboard; it is recorded here as its own minimal surface.

Motion is decoration only. Entrances use short, decelerating fades and slides (0.2 to 0.3 seconds, cubic-bezier(0.16, 1, 0.3, 1)), a `prefers-reduced-motion` rule collapses all of it, and every state stays fully readable without animation. Accessibility posture is visible in the base layer: a global 2px white focus outline, AA-contrast text pairs in both directions of the monochrome theme, and dark color-scheme declared at the root. The site carries the same posture in its own idioms: a global 2px focus outline in the foreground color with a 2px offset, its own `prefers-reduced-motion` collapse (nothing on the site animates), and AA-contrast pairs computed in both schemes.

*Provenance: every token, measurement and rule in this file was read from the code. The North Star was confirmed by the operator on 2026-09-02; the descriptive colour names and the named rules remain derived language, still open to the operator's rewording. Re-merged 2026-09-02 after plan 022 steps 6 and 7 so the file matches the shipped state: the ink-muted contrast step, the site's Inter adoption and shared frame, the keyboard-accessible InfoTip, the tri-state KPI values, and the two resolved inconsistencies below.*

**Key Characteristics:**
- Layered near-black monochrome surfaces with hairline borders; depth by lightness, not shadow.
- The accent is white; color appears only as severity, at small sizes or 15 percent tints.
- Self-hosted type on both surfaces, typeset small (14px dashboard body baseline, 20px titles as the ceiling, 16px site body); the dashboard and report keep Inter, the site now typesets in its own licensed Avenir Next.
- Genuinely flat: shadow belongs only to floating layers (dialogs, dropdown menus, toasts).
- Radius ladder: 12px containers, 8px controls, 6px chips, full pills only for progress and dots.
- Short decelerating motion, decoration only, killed entirely under reduced motion.

## Colors

The dashboard palette is one idea executed as a value scale: five near-black neutrals for structure, three soft greys for text hierarchy, four white-family tokens acting as the accent, and a single chromatic family reserved for severity.

### Primary
The accent family is white, not a hue. It draws primary buttons, active navigation, progress fills, and focus rings.

- **Paper White Accent** (`accent`, #f2f3f5): the primary button surface. Light-on-dark inversion of the whole theme; its label is near-black #08090a so contrast holds both ways.
- **Pressed White** (`accent-strong`, #d3d6db): primary button hover; the pressed step of the accent.
- **Accent Text White** (`accent-bright`, #f7f8f8): the accent when it appears as text (links inside tables, active accent badges). Note it shares its exact value with `ink`.
- **White Tint 9 Percent** (`accent-tint`, rgb(255 255 255 / 0.09)): active sidebar navigation, active segmented segments, text selection background, accent badge backgrounds. The quietest way the system says "selected".

### Tertiary (Severity, the only chromatic family)
No secondary accent exists; the chromatic family that does exist is severity, shared 1:1 with the PDF report so a finding reads as the same shade in both places.

- **Critical Red** (`sev-critical`, #f2555f): critical findings; failed jobs; the critical KPI value.
- **Serious Orange** (`sev-serious`, #f08b3c): serious findings.
- **Moderate Amber** (`sev-moderate`, #e5b93c): moderate findings.
- **Minor Green** (`sev-minor`, #4cc98a): minor findings; completed jobs.
- **Alert Red** (`danger`, #eb5757): destructive actions and form errors, not severity. It coexists with `sev-critical` as a second, slightly different red.

Severity appears at full strength only as text and as 8px status dots; large surfaces use the shade at 15 percent opacity as a badge background.

### Neutral
- **Near-Black Base** (`base`, #08090a): the app background, the deepest layer.
- **Panel Charcoal** (`panel`, #101112): cards, KPI tiles, sidebar, top bar, dialogs.
- **Raised Graphite** (`raised`, #17181a): inputs, secondary buttons, dropdown item hover, table row hover, progress track, skeletons.
- **Overlay Slate** (`overlay`, #1e1f23): dropdown menu panels and toasts, the lightest floating layer.
- **Hairline White 7 Percent** (`line`, rgb(255 255 255 / 0.07)): default borders and dividers everywhere.
- **Hairline White 13 Percent** (`line-strong`, rgb(255 255 255 / 0.13)): emphasized borders on floating layers, secondary button borders, dashed empty-state borders.
- **Ink White** (`ink`, #f7f8f8): primary text.
- **Soft Steel** (`ink-soft`, #9fa5ae): secondary text, table cell text, inactive controls.
- **Muted Slate Grey** (`ink-muted`, #898e96): hints, table headers, labels, icons, timestamps. Raised in plan 022 from #7b808a to the lightest grey step that clears 4.5:1 on every surface the class sits on (worst remaining pair 4.59:1 on the accent tint, 5.39:1 on raised).
- **Site Paper White** (`site-background`, #ffffff) and **Site Ink** (`site-foreground`, #171717): the marketing site's entire token set. Under `prefers-color-scheme: dark` they flip to #0a0a0a and #ededed.

### Named Rules
**The White Accent Rule.** The accent is white; there is no brand hue anywhere in the dashboard chrome. Hierarchy comes from brightness steps, borders, and type.

**The Severity Monopoly Rule.** Chromatic color is reserved for severity and danger. Severity color appears as text, as 8px dots, or as 15 percent tinted badge backgrounds, never as large filled surfaces.

**The One Grey Ladder Rule.** Text hierarchy uses exactly three greys: `ink` for what matters, `ink-soft` for content, `ink-muted` for labels and hints.

## Typography

**Display Font:** Inter (self-hosted woff2 at 400, 500, 600, 700; fallbacks ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif)
**Body Font:** Inter, same stack
**Label/Mono Font:** ui-monospace, SFMono-Regular, Menlo, Consolas, monospace (URLs and IDs only)

**Character:** One utilitarian workhorse family at deliberately small sizes. The dashboard resets the body to 14px (not Tailwind's 16px), keeps a tight-tracked semibold for titles, and stops at 20px; nothing in the product is display-sized. The site typesets in its own self-hosted Avenir Next (next/font/local, weights 400, 500, 600, 700; the site roles fall back to Arial, Helvetica, sans-serif), h1 bold 24px, h2 semibold 20px, body 16px.

### Hierarchy
- **Title** (Inter 600, 20px / 28px, letter-spacing -0.025em): page titles and KPI values; the largest text in the product. Dialog titles sit one step down at 16px semibold.
- **Section Label** (Inter 600, 12px, uppercase, tracking-wide): small section headers on the prospect detail page.
- **Body** (Inter 400, 14px / 21px): the working size for almost everything, including buttons at 14px and card copy.
- **Mid-step 13px** (Inter 500): a real, recurring size between xs and sm used for small buttons, field labels, and segmented control items; it exists only as the arbitrary value `text-[13px]`.
- **Label** (Inter 500, 12px / 16px): badges, table headers, hints, timestamps. Uppercase only in the section labels noted above.
- **Micro Label** (Inter, 11px, uppercase, tracking-wide): the smallest step, one below Label, used once (the report preparation card) for an uppercase micro heading. Rare, but a real role rather than drift, so it is on the ramp.
- **Mono** (12 to 13px): URLs and identifiers in scan and prospect views, set in the mono stack to survive long unbroken strings.

### Named Rules
**The 14px Baseline Rule.** The dashboard is typeset at 14px; sizes above it are reserved for page titles, dialog titles, and KPI values, and nothing exceeds 20px.

## Layout

The dashboard is a fixed-chrome operator app. A 240px sidebar (`w-60`, panel background, hairline right border) holds the wordmark, tagline, four nav items, and the language switcher pinned to the bottom. Content is offset by the sidebar width and constrained to a 1024px reading column (`max-w-5xl`) with 16px side padding, 32px from md up, 40px top padding on desktop and 64px on mobile to clear the 48px fixed top bar that replaces the sidebar under 768px. Mobile navigation is a 256px left drawer over a 60 percent black scrim.

Every route opens with the same PageHeader: a 20px semibold title with an optional muted description on the left and action buttons on the right, followed by a 32px gap. KPI tiles sit in a 2-column grid that becomes 4 columns at 1024px, with 12px gaps and a staggered entrance of 50ms per tile. Tables live inside a 12px-radius bordered panel and scroll horizontally rather than reflowing. Breakpoints in actual use are Tailwind's `md` (768px) and `lg` (1024px).

The site is a single 672px column (`max-w-2xl`) with 24px side padding and 48px vertical padding per document page, wrapped in a persistent frame: a header with the text wordmark linking home plus nav to the offer and bot pages, a footer with the compliance links and the contact address, and a skip link to the main content. The home page is a real single-column page; the preview route handler answers outside the frame with standalone documents.

## Elevation & Depth

Depth is tonal, not shadowed. The four surface steps (base, panel, raised, overlay) plus hairline borders do almost all of the work; a card reads as raised because it is lighter than the base and outlined, not because it casts anything. Exactly two shadows exist in the product, both the Tailwind `shadow-xl` preset (0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)), and both belong to floating layers: dialog content and dropdown menus. Toasts float with a border and the overlay background but no shadow. Modal and drawer scrims are flat black at 70 and 60 percent.

### Shadow Vocabulary
- **Floating layer** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): dialogs and dropdown menu panels only; always paired with a `line-strong` border.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow appears only when a layer floats above the page, and it is always the same preset.

## Shapes

The form language is a strict radius ladder mapped to elevation: 12px (`rounded-xl`) for containers that hold content (cards, KPI tiles, dialogs, empty states, table wrappers), 8px (`rounded-lg`) for controls (all button variants, inputs, selects, textareas, nav items, dropdown panels, segmented containers, skeleton loading rows), 6px (`rounded-md`) for inner elements (badges, dropdown items, segmented segments), and full pills only for progress bars and status dots. Empty states are the one dashed border in the system: 1px dashed `line-strong` on a 60 percent panel background. Borders elsewhere are 1px solid hairlines (7 percent white, 13 percent for floating layers and secondary buttons). The site defaults to a 4px radius (`rounded`) on its buttons and code blocks, one step tighter than any dashboard control.

## Components

### Buttons
- **Shape:** 8px radius, 36px tall at the md size, inline-flex centered with a 8px icon gap.
- **Primary:** white surface (`accent`) with near-black #08090a label at 14px medium; hover steps down to `accent-strong`.
- **Secondary:** `raised` surface with a `line-strong` border and `ink` label; hover lifts to `overlay`.
- **Ghost:** no surface, `ink-soft` label; hover gains a `raised` background and brightens to `ink`.
- **Danger:** transparent surface, `danger` label, `danger` at 40 percent border; hover gains a 10 percent `danger` tint.
- **All variants:** 150ms all-property transition, `active` scales to 0.98, disabled at 50 percent opacity, optional loading spinner replaces content. Small size is 32px tall with 13px text.

### Badges
- **Style:** 6px radius, 2px by 8px padding, 12px medium text; tone sets a 15 percent tinted background plus full-strength text color.
- **State:** six tones: neutral (grey on grey), accent (white tint on white text), and one per severity (critical, serious, moderate, minor).

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
- **Style:** sidebar items are 8px-radius rows with a 16px icon and 14px medium label; default `ink-soft`, hover gains `raised` background and `ink` text, active is `accent-tint` background with `ink` text. The wordmark is text only (14px semibold, tight tracking; the operator direction is explicitly no logo mark). Dropdown menus are the floating pattern: `overlay` panel, 8px radius, `line-strong` border, shadow, 4px inner padding, 6px-radius items with `raised` hover and focus.

### Empty States
- **Style:** centered column in a 12px-radius, 1px dashed `line-strong` bordered box on `panel` at 60 percent, 40px padding; optional 24px muted icon, 14px medium title, 14px muted description, action button below.

### Signature Patterns
- **KPI Tile:** 12px-radius bordered panel, 16px by 12px padding, 12px muted label over a 20px semibold tight-tracked value; the critical tone turns the value `sev-critical`. The value is tri-state since plan 022: loaded (the number), loading (skeleton), or unavailable (the localized Indisponible marker at a muted step), so a failed load never renders as a confident zero. Outreach hub counts use the same three states. Dashboards open with a staggered 4-tile row.
- **Status Dot:** 8px full-strength circle: grey for queued and cancelled, white and pulsing for running, green for complete, red for failed.
- **Progress Bar:** 6px full-round track on `raised`; the fill is white with a 300ms width transition, or a one-third-wide white segment slides forever for uncapped work (indeterminate means no real target exists).
- **Skeleton:** `raised` block with a 110deg white 5 percent shimmer sweeping every 1.8s.
- **Toasts:** Sonner, dark theme, top right, `overlay` background with `line-strong` border and `ink` text.
- **InfoTip:** a 14px muted info icon on a focusable trigger; the hint opens on hover and keyboard focus in a portal-rendered floating panel (`overlay` background, `line-strong` border, 6px radius, 12px text), so it neither clips inside scrolling tables nor locks out keyboard users.

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

### Don't:
- **Don't** introduce a brand hue into dashboard chrome; white is the accent and severity is the only color.
- **Don't** put shadows on resting surfaces (cards, tiles, buttons, tables); shadow means "floating".
- **Don't** typeset above 20px; below 14px the steps are 13, 12, and the single 11px micro-label in the report preparation card.
- **Don't** fill large areas with severity colors; full-strength chroma belongs to text and dots only.
- **Don't** import dashboard tokens into the site or treat the site as themed; it is deliberately standalone with its own two-color scheme-swap system and, since 2026-09-11, its own typeface (Avenir Next, licensed for the site only).
- **Don't** replace the wordmark with a logo mark; the brand is the name, set in semibold Inter.

## Observed Inconsistencies (recorded, not judged)

These are facts about the incumbent implementation worth knowing before changing it:

1. `ink` and `accent-bright` are the same value (#f7f8f8) under two names, and `accent` (#f2f3f5) differs from it by a few points; the accent family is nearly indistinguishable from the text greys by design.
2. Two reds coexist: `danger` #eb5757 (forms, destructive buttons) and `sev-critical` #f2555f (severity, failed jobs).
3. The site does not share the dashboard's token system: it loads its own self-hosted typeface through next/font/local (Avenir Next since 2026-09-11, replacing the Inter it briefly shared with the dashboard under plan 022), and it keeps its own radius step (4px vs 8px), its own button and focus classes, and a pure black/white `prefers-color-scheme` swap instead of the near-black token scale.
4. `text-[13px]` is an arbitrary value appearing in five files (small buttons, field labels, segmented items, scan URLs, report preparation copy); it is a real step of the scale that exists only as a literal.
5. **RESOLVED 2026-09-02, plan 022 step 6: the self-hosted Inter now loads.** The four `@font-face` URLs in `theme.css` used to request `/dashboard/fonts/Inter-*.woff2`, which the built app resolved to `dist/public/dashboard/fonts/...` (a plain 404; `APP_ROUTE_PATTERN` did not cover the path either), so every `@font-face` failed and the dashboard rendered in the fallback stack. The URLs now point at `/fonts/Inter-*.woff2`, and the `copy-inter-fonts` Vite plugin both copies the canonical woff2 files to `dist/public/fonts` at build time and serves the same canonical files through a dev-server middleware, so dev and build answer identically. Verified 2026-09-02: all four URLs return 200 `font/woff2` from both the built `dist/public` output and the Vite dev server.

6. **RESOLVED 2026-09-02, plan 022 step 6.** The sidebar wordmark's one-off 15px step moved to the standard `text-sm` (14px), matching the same component's topbar variant. The detector's only real dashboard font-size finding is cleared; the `overused-font` findings on Inter across the dashboard and report are dismissed by the recorded decision to pin Inter there. See item 7 for the site's own typeface, which no longer shares this dismissal.
7. **RESOLVED 2026-09-11, impeccable fix plan step 6.** The site typeface changed from the shared Inter to an operator-licensed, self-hosted Avenir Next, replacing the four Inter woff2 files in `packages/site/app/fonts` with four Avenir Next Cyr weights (Regular 400, Medium 500, Demi 600, Bold 700). The dashboard and report are unaffected and keep Inter (trade-off 79 and PRODUCT.md, Brand Commitments). The `overused-font` detector finding on the site no longer applies, since Inter is no longer the site's typeface; no ignore-value was needed or added for `packages/site`.
