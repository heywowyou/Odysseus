# Site-to-report token map (plan 039 step 2, item 4)

Source of the site column: `packages/site/app/globals.css` (`:root` light
block and the `prefers-color-scheme: dark` block) and the `DESIGN.md` "Site"
subsections (Colors, Typography, Layout, Elevation & Depth, Shapes,
Components). Verdicts follow `DESIGN.md`, "Carrying this design into the
report". The report column names the receiving slot in
`nocturne.css`/`paged.css`/`design-tokens.ts` (report) or `styles-v2.ts`
(preview). Nothing is imported from `packages/site`; every adopted value is
transcribed by hand with a site-origin comment.

## Ground and ink

| Site token (light) | Value | Report/preview counterpart | Verdict |
| --- | --- | --- | --- |
| `--paper` | `#e8edf3` | report sheet ground (`--bg`) | transfers: the light cool paper is the site's default reading surface and a printed document's natural world |
| `--paper-raised` | `#ffffff` | card/tile fill (`--panel`) | transfers |
| `--paper-sunk` | `#dbe3ec` | sunk fills (risk-scale band, table header tint) | transfers |
| `--ink` | `#101b2a` | primary text (`--ink`) | transfers |
| `--ink-soft` | `#3f4c5e` | secondary body (`--body`) | transfers |
| `--ink-muted` | `#5c6878` | tertiary labels (`--mute`) | transfers (meets 4.5:1 on `--paper` per the site's own measurement) |
| `--line` | `rgb(16 27 42 / 0.14)` | dividers (`--line`) | transfers |
| `--line-strong` | `rgb(16 27 42 / 0.28)` | emphasized borders | transfers |
| dark-scheme block (`#0e141c` ground etc.) | `prefers-color-scheme` | none | does-not-transfer: print is one fixed scheme picked at step 3; the preview follows the site's switch only if the operator picks that, and its PDF export stays fixed |

## Accent and marks

| Site token | Value | Report/preview counterpart | Verdict |
| --- | --- | --- | --- |
| `--accent` | `#0369a1` (sky-700) | links, eyebrow labels, rank numbers, TOC indices (replaces Nocturne violet `#9f94de`) | transfers-retuned-for-print: site measured 5.0:1 on `--paper`; verify against tinted panels as the design-tokens contrast note requires |
| `--accent-strong` | `#075985` | link/badge text on tinted fills (the site's own reason: 5.7:1 over the composited stamp fill) | transfers |
| `--accent-soft` | `rgb(14 165 233 / 0.12)` | badge/tile/stamp fills (replaces accent-tint violet) | transfers |
| `--anchor` | `#18385d` | statement spine only on the site | does-not-transfer by default (no diagnostic-scope statement in the report); available if the metadata sheet's risk band wants a left rule |
| `--signal` | `#43aa8b` | the dossier Action-row rule; report positive/quick-win accent (replaces `--good #7cd9a0` on light ground) | transfers-retuned-for-print: non-text rule on light paper; never text |
| `--mark-finding` | `#dc2626` | dossier Constat/problem row dash | transfers as non-text decoration only (problem/evidence/action, never severity) |
| `--mark-evidence` | `var(--accent)` | dossier Preuve/evidence row dash | transfers, same constraint |
| machine register (`--machine` family) | fixed dark | report's monospace rule-id tags; preview facts block | does-not-transfer as a register (no raw/code inset in either document); mono tags stay mono, in ink-muted |

## Severity (binding decision 5: a severity scale stays a severity scale)

| Source | Value | Counterpart | Verdict |
| --- | --- | --- | --- |
| report `design-tokens.ts` dark pairs | `#d97b82/#dba36c/#d6c96e/#b2b6ca` on `#34232a`… | none on a light ground | transfers-retuned-for-print: on the cool-paper ground the four shades re-derive for 4.5:1 as text on tints; paged.css's existing print-safe pairs on `#f7f7f5` are the documented starting point |
| dashboard shades (`#f2555f/#f08b3c/#e5b93c/#4cc98a`) | 1:1 with the dark report today | none | divergence from the dashboard's 1:1 severity shades is recorded in the trade-off entry, not silently introduced; dashboard untouched |
| dossier red/blue/green marks | problem/evidence/action | possible finding-card row rules (step 3 question 5) | never a severity, per DESIGN.md "The Dossier Rule Set" |

## Typography

| Site role | Value | Counterpart | Verdict |
| --- | --- | --- | --- |
| face | Avenir Next Cyr 400/500/600/700, self-hosted | report `@font-face` + preview inline (only if the operator confirms the licence covers PDF embedding and web embedding in a bucket-served document; else Inter stays and the config ignore stays) | transfers-conditionally (binding decision 9) |
| `site-title`/`site-heading` | fluid `clamp()` | fixed pt ramp on the fixed A4 width | transfers-retuned-for-print: clamp is a viewport mechanism; print takes the desktop-ceiling values converted at 1px = 0.75pt |
| `site-body` | 1rem / 1.65 | report body pt size, leading re-derived | transfers-retuned-for-print |
| `site-label` | 0.6875rem (11px), 600, uppercase, 0.18em | eyebrow/section labels, card row labels (replaces the 10px Nocturne eyebrows; also lifts the detector's smallest-size findings) | transfers-retuned-for-print (11px floor honoured) |
| heading tracking | -0.02/-0.03em | headings | transfers-retuned-for-print (glyph hinting must stay green; the 0.02em uppercase print fix stays) |
| `site-wordmark` 1.8rem, nameplate register | 700 uppercase 0.2em | cover kicker/signature treatment | transfers-retuned-for-print (a cover is not a 52px screen header; the register transfers, the size re-derives) |

## Shape, cards, spacing

| Site token | Value | Counterpart | Verdict |
| --- | --- | --- | --- |
| radius ladder | 3/4/5/6/10/12px | report `--radius` 8/6 re-mapped to the site ladder (cards 12px, dossier-style cards 6px, controls/tags 3-4px); preview's invented 10px snaps onto it | transfers-retuned-for-print |
| `--shadow-card` | ink-tinted soft shadow | report/preview cards | transfers-retuned-for-print: soft ink shadow prints acceptably with `printBackground: true` but is re-derived subtler for paper; hairline border stays the primary edge |
| card anatomy | raised fill, 1px `--line` border, 1.5rem padding, `align-items: start` | priority/theme cards, preview tiles/proof cards | transfers |
| dossier card motif | label stacked above sentence, hairline rows, 1.125rem x 3px round-capped row dashes in red/blue/green, sky stamp | proposed finding-card treatment in the report and the preview's three proof cards (step 3 question 5) | transfers (print retune: no draw animation, dashes are static) |
| spacing rhythm | rem component rhythm, `--measure 34rem` | report keeps its role ladder (`--space-1..12`), values re-derived where the site's rhythm implies a change; mm page geometry and `@page` untouched | transfers-retuned-for-print |

## Does not transfer (recorded bans, kept)

- All motion: `--ease-out-expo`, `fx-*` primitives, reveal/settle, dossier load sequence, schematic runs (print has no motion; every treatment designed from its finished frame).
- Sticky and container-query layout.
- `prefers-color-scheme` switching in the PDF (one fixed scheme; preview screen switch only by operator pick).
- Hover states and the 1px button lift.
- The machine register and visitor inset as surfaces.
