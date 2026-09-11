---
target: packages/site/app
total_score: 31
max_score: 36
na_heuristics: 7
p0_count: 0
p1_count: 0
target_identity: "file:/home/heywow/code/odysseus/packages/site/app"
timestamp: 2026-09-11T03-18-45Z
slug: packages-site-app
---
⚠️ DEGRADED: single-context (operator asked to conclude and ship this pass; no sub-agent dispatch)

# Re-critique: Odysseus public site (packages/site/app), after the seven-step fix plan

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Mailto clusters now carry a visible address and reassurance line, but there is still no confirmation once a message is sent |
| 2 | Match System / Real World | 3 | Unchanged: AI-visibility section still leans on scanner vocabulary (données structurées, llms.txt, balisage FAQ) |
| 3 | User Control and Freedom | 3 | The animated raw/rendered comparison still cannot be replayed; contact is still mailto-only, now with an address fallback |
| 4 | Consistency and Standards | 4 | Fixed: home's secondary CTA label unified, the duplicate "Accueil" header link removed, EN opt-out duplicate line removed |
| 5 | Error Prevention | 3 | Unchanged |
| 6 | Recognition Rather Than Recall | 4 | Fixed: bot gained a fact-summary grid, confidentialite-prospection gained a numbered table of contents, both linking into the existing prose |
| 7 | Flexibility and Efficiency | n/a | Brochure site, no repeated expert flow |
| 8 | Aesthetic and Minimalist Design | 4 | Fixed: offre's empty hero half now holds its own dossier artifact, the metric-row density issue is gone (container query), mobile header no longer eats a third of the viewport |
| 9 | Error Recovery | 3 | The mailto-with-no-client problem is mitigated by a visible address everywhere now, but still not a true fallback if mailto itself is unsupported |
| 10 | Help and Documentation | 4 | Fixed: the "block the bot" fact is now one click from the top of /bot instead of buried mid-paragraph |

**Total: 31/36** (heuristic 7 n/a; 9 scored). Band: Good, upper range. Up from 25/36 at baseline.

## What Changed and Verified

- **P1 (conversion floor)**: every CTA cluster on home and offre (hero + price, both languages) pairs the mailto with the visible address and a "read personally, never by an automated system" line. Offre also states the after-contact sequence (reply, questionnaire, written proposal) and the EUR 450 HT re-audit fact.
- **P1 (offre clones home)**: offre's hero now carries its own three-row dossier artifact (Repérage/Preuve/Priorité et action), replacing the empty right half and the over-limit five-item grid further down. The check-grid duplication with home was investigated and left in place deliberately: `marketing-copy.test.ts` pins the exact bounded AI-visibility sentence and the three metric names on both pages, so condensing it needs a test change alongside the copy change, not a copy-only edit. Recorded as an open opportunity, not silently dropped.
- **P2 (compliance orientation)**: bot gained a four-item fact grid (identification, pacing, prospecting cap, retention) linking to existing paragraphs; confidentialite-prospection gained an eight-item numbered table of contents linking to its existing headings. No wording changed on either fenced page.
- **P2 (metric density)**: the LCP/CLS/INP row used a viewport breakpoint that didn't know whether it sat in a full-width or half-width column; switched to a CSS container query so three columns only appear when there's actually room.
- **P3 (mobile price depth)**: the price used to sit about 7.5 screens down on a 390px viewport; a quiet, `md:hidden` mention now appears about one screen down, right under the primary CTA.
- **Small fry**: the 10px "Rapport Odysseus" stamp is now 11px; the language toggle's outer padding no longer reads as flush against the pill border; the header's duplicate "Accueil" link (redundant with the wordmark) is gone; the home hero's lede is now capped at the same measure every other lede on the site uses (was running to roughly 91 characters per line).
- **Typeface**: switched from the shared Inter to an operator-licensed, self-hosted Avenir Next, after flagging that the three commercial font bundles staged for this had no license file and contained dead `.eot` artifacts (a red flag caught and confirmed with the operator before use). Report and dashboard keep Inter.

Deterministic scan (`impeccable detect --json packages/site/app`): 22 findings, all CSS-level advisories on `globals.css` — 2 `side-tab` (the anchor-rule margin note and the dossier spine, both documented deliberate motifs from the baseline run), 7 `design-system-radius` and 13 `design-system-font-size` (the site's own committed 4px-radius/smaller-type-scale departure from DESIGN.md's dashboard ramp, already recorded as an observed inconsistency). No new findings introduced by this pass. The scanner's JSX coverage stays weak by its own admission; browser-overlay re-injection was not re-run this pass — verification instead came from direct axe-core WCAG 2.2 AA runs (zero violations, all five routes, both 1440px and 390px) and manual screenshot review at each step.

## What's Still Open (not resolved this pass, not silently dropped)

1. The "Ce que le diagnostic vérifie" check-grid still repeats home's four-category prose close to verbatim on offre — blocked on a test change, not a design decision.
2. The kicker-above-heading pattern is impeccable's own craft-floor absolute ban, but it's the site's committed, critique-praised nameplate identity — flagged for an explicit operator call, not resolved either way.
3. Scanner vocabulary in the AI-visibility section (données structurées, llms.txt) is unchanged.
4. The raw/rendered reveal animation still cannot be replayed once it has run.

Questions skipped: operator asked to conclude this pass and ship rather than open new scope.
