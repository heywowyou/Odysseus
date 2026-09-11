---
target: all five public site pages (packages/site/app)
total_score: 25
max_score: 36
na_heuristics: 7
p0_count: 0
p1_count: 2
target_identity: "file:/home/heywow/code/odysseus/packages/site/app"
timestamp: 2026-09-11T01-38-00Z
slug: packages-site-app
---
# Critique: Odysseus public site (packages/site/app, five pages)

Method: dual-agent (A: design review sub-agent · B: detector sub-agent; browser inspection and overlay injection executed in the main thread because this harness reserves browser tools for the main agent).

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Language toggle shows pressed state; the render-reveal argument plays once with no replay; mailto clicks give zero feedback |
| 2 | Match System / Real World | 3 | Plain French business register mostly wins; scanner vocabulary leaks (données structurées, balisage FAQ, llms.txt, en-têtes de sécurité) |
| 3 | User Control and Freedom | 3 | Nothing traps; the one animated explanation cannot be replayed; the only contact path is a mailto |
| 4 | Consistency and Standards | 3 | Secondary CTA label changes between hero and price section on home; desinscription EN duplicates a line FR does not; header Accueil duplicates the wordmark link |
| 5 | Error Prevention | 3 | Prefilled accented opt-out mailto is real prevention; no equivalent care at the commercial CTAs |
| 6 | Recognition Rather Than Recall | 2 | bot and confidentialite-prospection: no anchors, no TOC; the 3-page cap, 1000 ms pacing, 90-day retention and objection path must be held in memory across long prose |
| 7 | Flexibility and Efficiency | n/a | Brochure site with one decision and no repeated expert flow to accelerate |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained and relevant; the LCP/CLS/INP three-column micro-grid compresses to ragged 13px density; offre hero right half is empty |
| 9 | Error Recovery | 2 | On a machine without a mailto handler, Écrire à Odysseus silently does nothing; the bare address appears only at offre's very bottom |
| 10 | Help and Documentation | 3 | The fenced pages genuinely answer a site owner's questions but force prose reading; the most-wanted action (block the bot) sits mid-paragraph |

Total: 25/36 (heuristic 7 n/a; 9 scored). Band: Good, upper-middle of the production range. The gaps are orientation and conversion plumbing, not craft.

## Design Specificity Verdict

Genuinely authored, not templated. The evidence-dossier world (cool blue-grey paper, blue-black ink, fixed-light report sheet with navy spine and mono field labels, one signal-orange annotation rule, dark machine register, evidence blue reserved for links, uppercase letterspaced nameplate labels, hairline document rhythm) could not be transplanted to an unrelated product, because the identity is the deliverable: the site looks like the document it sells. The raw-versus-rendered inset is the most product-specific element on any page; absence hatched, not blank. The weakness is section grammar, not identity: receive-grid, check-grid and method-grid are one move replayed four times per page, and home and offre reuse it with near-verbatim text, so the two Persuade surfaces read as the same document with a different h1. A distinctive book with repetitive chapter layouts.

## Deterministic scan (Assessment B) and browser overlay

- CLI scan over all nine site markup targets (.tsx pages, layout, not-found, language, site-chrome): exit 0, zero findings; verified not waiver-driven (no impeccable-disable anywhere) and styling is centralized in globals.css via variables.
- Detector sanity probe confirmed the detector itself works in this environment.
- Coverage caveat: a synthetic violating .tsx also returned clean, so the static scanner's JSX coverage is weak; the live-DOM browser overlay is the reliable evidence here.
- Browser overlay findings (live DOM, injected on home, offre, bot; overlays captured to .playwright-mcp/critique/home-overlay.png and offre-overlay.png):
  - kicker-above-heading: 16 fires across home (10), offre (4), bot (2), FR and EN both, every section nameplate
  - overused-font: Inter at 99 to 100 percent of text on every scanned page (the committed ignore covers packages/report only)
  - all-caps-body: 3 fires on home, 31 to 36 uppercase chars of body text
  - undersized-ui-text: 2 fires on home, 10px functional text Rapport Odysseus / Odysseus report (below the 11px floor)
  - line-length: about 91 chars per line on home (aim under 80)
  - cramped-padding: the lang-toggle on every page (children flush against border)
  - hero-eyebrow-chip: 2 fires (tracked-caps eyebrow above h1, FR and EN)
  - side-tab: 1 fire on home (border-left 3px with border-radius), plus 2 in globals.css (.statement, .dossier)
  - repeating-stripes-gradient: the hatched absence box in the machine panel
- False-positive calls: side-tab and repeating-stripes-gradient are documented deliberate motifs (the margin-note rule, the dossier annotation rule, absence hatched rather than blank); design review confirms them as the site's best ideas. kicker-above-heading and hero-eyebrow-chip are the nameplate system itself; whether that system is doing enough work per section is a design call, not a defect. overused-font (Inter) is brand continuity with the locked report system and the dashboard, which reuse the same canonical woff2 files; the operator decides whether to record a committed ignore-value scoped to packages/site. undersized-ui-text (10px), cramped-padding (lang-toggle) and line-length (91) look like true positives worth fixing.

## Overall Impression

The site is distinctive and honest, and the dossier world is doing real persuasive work. What holds it back is not craft but plumbing: the two pages whose whole job is conversion end on an unassisted mailto, offre clones home instead of supporting the decision, and the compliance pages bury their answers. The single biggest opportunity: make offre the decision document (its own hero artifact, the after-you-write path, the re-audit fact) instead of a second copy of home.

## What's Working

1. The dossier sheet in the home hero: a fixed-light report card on a dark-optional page, navy spine, mono uppercase field labels, one orange annotation rule marking the Action row, a caption that forbids reading it as a result. The best design-is-the-product move on the site.
2. The raw-versus-rendered inset: real generic empty app shell with a hatched absence box; the visitor panel deliberately fixed-light in both themes; the reveal animation moves only bars, never text, so contrast holds mid-animation, and it collapses under reduced motion. The animation carries the argument.
3. Limitation-first as composition, not fine print: the RGAA scope statement sits at the top of both Persuade pages as a margin note before any promise; no severity color anywhere; orange reserved for one annotation.

## Priority Issues

1. P1, home + offre. The conversion action has no floor. Every primary CTA is a bare mailto: no visible address, no copy affordance, no what-happens-next at the point of action; silent on machines without a mailto handler. Fix: keep the mailto but pair each CTA cluster with the bare address and a one-line read-by-a-person reassurance; add the after-your-message sequence (reply, questionnaire, written proposal) to offre.
2. P1, offre (duplication touches home). Offre wastes its most persuasive pixels: 40rem column in a 70rem shell leaves the hero right half empty; the four checks and three metric definitions repeat home nearly verbatim; the report's five elements form an over-limit 5-item grid. Fix: give offre its own dossier-idiom artifact in the hero aside carrying the five finding elements, and differentiate the two pages' jobs: home explains the handoff, offre supports the decision, linking home for deep scope.
3. P2, bot + confidentialite-prospection. No orientation layer: long flat prose, no anchors or TOC; the robots rule, pacing, page cap, retention and objection path are buried mid-paragraph. Fix: presentation only, a small definition-list fact summary with anchor links at the top of bot and a linked section list at the top of confidentialite; wording unchanged, citing docs/rules/operator-obligations.md and docs/rules/outreach-rules.md.
4. P2, home + offre. Micro-typography density in the performance cell: the LCP/CLS/INP metric-row becomes three columns inside a half-width cell; the INP label wraps four lines. Fix: stack metrics vertically inside half-width cells, reserve the 3-column row for full-width contexts.
5. P3, home. The price is the sixth of six sections on mobile, roughly nine screens down, under a three-row sticky header. Fix: tighten the mobile header to two rows; surface a quiet price mention earlier on mobile.

## Persona Red Flags

- Jordan (confused first-timer): the hero's Ceci est un diagnostic technique, pas un audit RGAA assumes he knows what an audit RGAA is; the link promises scope, not explanation. Écrire à Odysseus opens a mail client he may not have configured, with no fallback address at the button and no sign anyone answers.
- Riley (stress tester): limits are named but never quantified (sample size, whose field data, what happens to failed crawls); the EUR 450 HT re-audit, a real product fact, appears nowhere on the site.
- Casey (mobile): price nine screens deep; sticky three-row header eats the 390px viewport; the compact diff inset's machine code needs horizontal scrolling inside the panel.
- Project persona (non-technical French SMB decision maker, a three-star hotel owner): scanner vocabulary (données structurées, llms.txt, balisage FAQ, en-têtes de sécurité); the AI-visibility paragraph fires four negations with no what-this-means-for-your-establishment; the report's what-to-do-first summary, the headline feature for exactly this reader, is only gestured at; the buying steps (questionnaire, written proposal, included question rounds) are invisible.

## Minor Observations

- Home secondary CTA label changes between hero (Consulter l'offre) and price section (Consulter le détail de l'offre) for the same destination.
- Desinscription EN duplicates a reassurance line the FR column does not have; EN should match FR.
- Header Accueil duplicates the wordmark's home link.
- No og:image anywhere (correctly, nothing may be fabricated); the first real asset should become the OG image.
- Dark-mode paper flip documented but not verified in this pass (no dark screenshots taken).
- Language toggle aria-label is a static bilingual string; acceptable.
- 10px functional text and the lang-toggle padding are the detector's actionable small fry; fold into any polish pass.

## Questions to Consider

1. What if the whole site committed to being the report: home as a literal excerpt of a deliverable you scroll through, ending on your site's version of this is N pages?
2. Should offre trade its cloned scope section for the buying path (reply, questionnaire, written proposal, audit, report, question rounds)? Which earns the decision more, a second copy of the scope or the shape of what happens after payment?
3. Is there a minimum dose of real evidence sharable without a case study, a fully redacted single finding a prospect could verify? The site promises check it yourself; today the visitor can check nothing.
4. Would the RGAA limit land harder as a two-column boundary (what this diagnostic establishes / what only an audit RGAA establishes)?
5. Does the flat price become stronger paired with the re-audit (1 600 EUR HT now, 450 EUR HT to re-verify), turning a number into a system?
