# Critique: paid PDF report + v2 outreach preview (baseline evidence, plan 039 step 2)

Method: dual-agent (A: design review subagent · B: detector + browser
evidence subagent), synthesized by the main thread. Run at commit `9d5383e`,
2026-09-11, read-only. Evidence: `baseline-pdf/` (37 report pages, small-site
FR; 6 key pages, briketenia FR), `baseline-preview/` (6 preview captures),
`detector/` (raw JSON), `detector-classified.md`, `token-map.md`,
`open-residuals.md`. Companion audit of the preview:
`audit-preview-v2.md`.

## Design health score (Assessment A, report + preview as one system)

23/32 applicable (heuristics 7 and 10 n/a for a static print document and a
one-way scorecard; band Good, 72 percent). Full table in the assessment
archive below.

## Design specificity verdict

**Paid PDF report:** competent category design, almost never Odysseus design.
Strip the wordmark and it is a pentest or enterprise-SEO dossier: dark
`#161826` ground, violet accent, Inter. The skeleton (Pourquoi / observed /
what you can do; responsibility arithmetic; print-inverted checklist; constat
IDs for traceability) is genuinely authored for this product. An Odysseus
argument in an interchangeable suit.

**v2 preview:** closer to authored (business name as h1, plain-language
contract, honest partial counts) but visually a generic dark email digest on
the report's tokens with a system font stack; swap the tile colors and it is
any agency's scorecard.

**Detector:** 58 findings on the reference, 461 on the rendered report, 1 per
preview language. Classified in `detector-classified.md`: the report's bulk is
the print-tuned small-type scale (deliberate, recorded) plus one media-query
false-positive class (41 identical low-contrast hits from the checklist print
inversion). The two previews sit one finding from clean: the hero kicker,
the exact pattern the site banned on 2026-09-11. Browser: zero WCAG 2.2 AA
violations both languages both viewports; no 320px overflow.

## Overall impression

The documents work as executive audit artifacts and fail as one product's
identity. A prospect reads the sky-and-paper site on Monday and receives a
near-black violet document on Tuesday. The strongest designed moment in the
report (the light printable checklist) exists because the dark ground fails
on paper - the same doubt the site's design already answered.

## What's working

1. The print-inverted checklist: the only page designed for its real
   destination; ranked rows, severity as text-plus-colour.
2. Severity tile bands (report and preview): numbers carry, tint decorates,
   honest counts - consistent with the dashboard's severity monopoly.
3. The evidence micro-grammar on priority cards and the preview's proof
   cards: quoted rule, observed page, responsibility split. The most
   Odysseus-authored thing in either document.

## Priority issues

- **P0 - Identity discontinuity across the funnel.** Site: cool paper, ink,
  sky, Avenir Next, raised soft-shadow cards. Documents: near-black violet
  Nocturne, Inter/system, flat hairline cards. Three typefaces and two
  opposite worlds for one product. Fix: the carry-over this plan gates
  (step 3 direction round).
- **P0 - The peak artifact undercuts itself.** The checklist is the most
  shareable page and the footer stamps it "RAPPORT CONFIDENTIEL"; no tick
  boxes; brand presence is a 7px footer line. Fix note: the stamp wording and
  a checkbox column are content/structure, locked in this plan - recorded for
  a future content plan, not actioned here. The visual treatment (paper,
  ink, type) transfers under this plan.
- **P1 - Priority-card single-focus failure.** Six uppercase micro-labels and
  five block types per card; owner-facing remediation prose sits beside
  developer detail. Fix note: the two-layer split moves copy between blocks -
  locked here; the visual hierarchy (type ramp, card anatomy, dossier row
  treatment) is what this plan can change.
- **P1 - Preview CTA buried under legal prose** (~15 screens deep at 320px).
  Element order is product-specified and locked; the restyle can make the
  offer block read as a destination (card treatment, type) but not move it.
- **P2 - The cover addresses a domain, not a business** (briketenia:
  `www.briketenia.com` in 60px). Content contract (minimal cover, commercial
  identity) is locked; recorded for the operator.

## Persona red flags

- **Jordan (first-timer, small hotel owner):** severity "Elevé" on page 2
  with three words of context; WCAG numbers and selectors on the pages she is
  told to read first; price inside a prose wall; no "what is already fine"
  beat anywhere. Content-level; recorded.
- **Sam (accessibility-dependent):** an accessibility audit delivered as 37
  near-black pages; violet kickers and 10px tracked uppercase on `#161826`
  are the weakest legibility pairs; muted `#b2b6ca` fine print on `#232532`
  fatigues. The light-paper direction directly serves this persona; the axe
  self-test must stay at zero on the new palette (STOP condition).
- **Casey (mobile, preview on phone):** 320px reflow is genuinely clean (two
  -column tiles, no sideways scroll), but the CTA is ~15 screens down; the
  four severity tints blur into muddy swatches at tile size on the dark
  ground; footer opt-out links are 25px tall, AA by 1px.

## Minor observations

Page 4 repeats the cover question as a stray heading (layout accident);
briketenia p7 has two adjacent "32" tiles; the glossary is the plainest page
in the document; preview EN cites "Loi ndeg 2023-171" in French inside English
copy; preview stylesheet has three dead/undefined class hooks (`.mt` undefined
in CSS while the renderer emits it, `.tag`, `.disclosure`), an invented 10px
radius off the 4/8 scale, hard-coded CTA literals, and no `color-scheme`
declaration - all fixable inside the restyle without touching content.

## Questions to consider

1. The product is a dossier; the site's hero is a paper dossier card. Why
   does the actual dossier arrive as a black sheet with violet glow?
2. The checklist works because it was designed for its destination. What
   would it mean to design all 37 pages - and the email - for their real
   destinations?

## Archived assessments (verbatim sources)

- Assessment A (design review): heuristic table 23/32; cognitive load (2
  FAIL, 4 PARTIAL); emotional journey "dread, slog, brief competence, fade";
  strengths and issues as synthesized above. Held in the subagent transcript;
  key content reproduced here.
- Assessment B (detector + browser): with-config counts, with/without-config
  delta (only the reference's Inter hit is config-suppressed in-repo),
  verified-in-context classification table (`detector-classified.md` carries
  the classifications), axe zero-violation + no-overflow table. Raw JSON in
  `/tmp/assessb/` (session-scratch) and `detector/` (kept in the pack).
