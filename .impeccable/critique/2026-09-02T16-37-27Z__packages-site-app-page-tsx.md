---
target: packages/site public marketing surface (plan 022 closing evaluation)
total_score: 27
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 0
p2_count: 5
p3_count: 6
mode: Persuade
audit_score: 16
audit_max: 20
timestamp: 2026-09-02T16-37-27Z
slug: packages-site-app-page-tsx
---
# Impeccable critique and audit: packages/site (public marketing surface), plan 022 closing evaluation

Method: DEGRADED: single-context (closing evaluation thread; no sub-agent tool exposed). The
coordinator prescribed the evidence set: the twelve post-fix captures
(.impeccable/review/site-fix-*.png, desktop 1440x900 and mobile 390x844) plus current source
under packages/site; no server was started and no new capture was taken. The detector was not
rerun: its bounded budget is spent, and the coordinator-supplied final state (verified before
this pass) is 0 findings, with the htmlparser2 chain DEGRADED, so contrast coverage comes from
hand-computed pairs (body 17.9:1 light and 16.9:1 dark; muted labels 4.7:1 and 7.3:1; button
pairs all above 4.5:1) and the suite under packages/site/lib (67 tests, passing).

Context: all operator-approved plan 022 fixes are on this surface: Inter site-wide via
next/font/local, persistent frame with skip link, real French homepage, offre price block and
mailto action, /bot metadata, custom not-found, humane 404/410 preview failure pages, 44px-plus
buttons, side-by-side bilingual presentation, full social metadata without og:image (no asset
exists; none may be fabricated). Surface mode: Persuade. The Next dev indicator bubble visible
in two captures is dev-only tooling, not shipped UI.

## Heuristics table (Nielsen, 0 to 4)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Static site; statuses are honest where it matters: the opt-out button says a person reads the message (desinscription/page.tsx:66-70) and the 410 truthfully says the preview expired (lib/preview-response.ts:81-86). Gaps: the header nav shows no current location (no aria-current, no active style, layout.tsx:56-69), and the misconfiguration 500 still answers with no humane body (lib/read-preview.ts:75-89 throws; app/apercu/[token]/route.ts:22-29 has no try/catch). |
| 2 | Match System / Real World | 4 | The homepage speaks the SMB owner's language with the limit stated first, per offer-positioning (page.tsx:16-22), and translates the technical into consequences ("l'écart entre ce qu'un moteur de recherche lit et ce que voit un visiteur", page.tsx:30-33). /bot keeps WCAG, axe-core and Lighthouse by name, which is precision for exactly the audience that checks logs, not jargon leakage. |
| 3 | User Control and Freedom | 4 | Every framed page has visible exits: wordmark home link plus three-item nav (layout.tsx:53-68), footer compliance links and mailto (layout.tsx:75-93), a home link on not-found (not-found.tsx:14-18), and mailto plus home link on the preview failure pages (lib/preview-response.ts:58-62). No flow traps anyone. |
| 4 | Consistency and Standards | 3 | One frame, one button pair (btn-primary/btn-secondary), one bilingual pattern (anchors, lg two-column, lang attributes) across all five routes. Remaining deviations: the preview failure documents are standalone with system-ui rather than Inter (deliberate route contract, lib/preview-response.ts:46-56); app/not-found.tsx is French-only while the preview failure pages are bilingual; each bilingual page shows two h1 side by side (offre/page.tsx:37 and :117). |
| 5 | Error Prevention | 3 | Nothing to misuse: no forms, the opt-out mailto pre-fills subject and body (desinscription/page.tsx:27-31), preview tokens validate before hashing and malformed, unknown and revoked all answer the same 404 (lib/preview-response.ts:120-124). Unchanged from baseline because the surface gained no new error paths. |
| 6 | Recognition Rather Than Recall | 4 | Navigation, language jump links, and compliance links are visible on every framed page; nothing requires remembering a URL or an in-text link. Baseline's core complaint (no persistent navigation anywhere) is fully resolved. |
| 7 | Flexibility and Efficiency | n/a | Persuade surface per the surface brief; no accelerator dimension applies. |
| 8 | Aesthetic and Minimalist Design | 3 | Disciplined and clean: monochrome type-led pages, a real price block, one primary action per page, zero fabricated proof. Not yet 4: the visual language is still near-default Tailwind typography (24px h1 ceiling, 4px radius, underline-only links) with no signature element, so the frame is generic even though every word is authored for this product. |
| 9 | Error Recovery | 3 | Strong progress: a French custom not-found inside the frame (not-found.tsx) and humane bilingual 404/410 preview pages that name the problem and give two next steps (lib/preview-response.ts:58-86). Gaps: not-found offers no English; the preview pages' single recovery link mixes both languages in one string (lib/preview-response.ts:62); the 500 path has no body at all. |
| 10 | Help and Documentation | n/a | Persuade surface; no help dimension applies. |

Total: 27/32 (two heuristics n/a; 84 percent, Good). Baseline was 19/32 (59 percent,
Acceptable): the fixed P0 (placeholder home) and all four P1s (frame, offer action, /bot
metadata, not-found) are verifiably landed in source and captures.

## Design specificity verdict

LLM assessment: the site now reads as one authored product end to end. The homepage could only
be Odysseus: the limit leads ("Ceci est un diagnostic technique, pas un audit RGAA"), the price
is stated flat with its own box, and every claim traces to offer-positioning.md. The frame
(wordmark, three-item nav, compliance footer, skip link) is generic by design but no longer the
whole identity. What keeps this at "coherent but not yet distinctive": the typography and
components are stock Tailwind steps (24px headings, 4px radii, underline links, inverted
buttons); nothing visual is owned the way the compliance copy is. A next visual-world pass is
character, not correctness.

Deterministic scan: not rerun on this pass (bounded budget spent). Final coordinator-verified
state: 0 findings. The baseline's single finding (overused-font on Arial, globals.css) is
obsolete: the body stack now leads with the self-hosted Inter variable and Arial is only the
pre-swap fallback (globals.css:20-28, layout.tsx:11-20). No false positives to report.

Visual overlays: none, and correctly so: this pass used the existing twelve captures and
source; no server was started and nothing was injected.

## Overall impression

The site went from "trust pages wrapped around a construction stub" to a small, honest marketing
site that a French SMB owner can act on in one visit: understand the offer, see the price, click
one button to write. The remaining gap is identity, not usability: the surface is correct,
compliant, and fast, and it looks like every other clean monochrome one-pager. The single
biggest opportunity for a next round is an owned visual voice (type scale, one signature
pattern beyond the bilingual two-column), which the surface brief correctly reserves as a
separate new-work decision for the operator.

## What's working

1. The funnel now exists and is honest at every step: home states the limit before the price,
   links to the full offer with a mailto action, and both error paths a prospect can hit
   (unknown URL, dead preview link) give plain-language explanations with a way back
   (not-found.tsx; lib/preview-response.ts:58-86). Peak-end moments are handled.
2. Frame and wayfinding: skip link, wordmark, three-item nav, and a footer carrying exactly the
   compliance pages a wary recipient needs (layout.tsx:49-109). Baseline P1s about orphan pages
   are dead.
3. Metadata discipline: per-route titles, descriptions, canonicals, Open Graph and a
   twitter summary card that renders correctly without an image, with the no-og:image decision
   documented in code (layout.tsx:22-47, bot/page.tsx:3-17, offre/page.tsx:3-15,
   desinscription/page.tsx:3-15, confidentialite-prospection/page.tsx:3-17).

## Priority issues

- P2. Header and footer navigation touch targets are about 20px tall. Why it matters: this is
  the site's only persistent navigation, on every page, and the site's own CSS names 44px as
  the touch-target floor for buttons (globals.css:45-55), so the standard is declared and then
  missed one file away. Fix: give header and footer links vertical padding or min-height to
  reach 44px. Evidence: layout.tsx:52 and :58-68 (header text-sm links, no vertical padding),
  layout.tsx:78-90 (footer). Captures: site-fix-home-mobile.png, site-fix-offre-mobile.png.
  Suggested command: $impeccable polish.
- P2. The published price now has literals outside the guard test's scope. Why it matters: the
  price is the single most load-bearing number on the site and the drift guard
  (packages/core/src/offer/pricing.test.ts:41-42) reads only packages/site/app/offre/page.tsx;
  the home Tarif block (page.tsx:58) and the meta description (layout.tsx:35) repeat
  "1 600 € HT" as plain literals, so a future price change could update l'offre, pass the
  guard, and leave the homepage and search snippets stale. Fix: extend the guard to read
  page.tsx and layout.tsx (or assert on their serialized content the same way). Suggested
  command: $impeccable harden.
- P2. The misconfiguration 500 has no humane body. Why it matters: a recipient who holds a
  valid preview link during an operator-side failure gets a bare server error with no
  explanation and no way out; the route deliberately refuses to fake a 404, which is right, but
  the honest answer is currently empty. Fix: catch reader construction and read failures in the
  route handler and answer with a bilingual "our side" failure page in the same style as the
  404/410 bodies (lib/preview-response.ts:64-72 shows the pattern; note app/error.tsx cannot
  catch a route handler). Evidence: lib/read-preview.ts:75-89 (throws), 
  app/apercu/[token]/route.ts:22-29 (no try/catch). Suggested command: $impeccable harden.
- P2. Error-page language parity is uneven. Why it matters: the audience is bilingual by
  product rule (FR and EN delivered together), yet app/not-found.tsx is French-only while the
  preview failure pages carry both languages, and their single recovery link concatenates both
  languages into one link text (lib/preview-response.ts:62), which reads oddly and gives screen
  readers a mixed-voice label. Fix: add the English paragraph to not-found.tsx and split the
  recovery link into one link per language. Suggested command: $impeccable polish.
- P2. No current-location state in the persistent nav. Why it matters: heuristic 1 wants the
  system to show where you are; all three nav items render identically on every page, including
  "Accueil" while on the home page, so the frame gives orientation but not position. Fix: set
  aria-current="page" and a visual step (underline or weight) on the active item.
  Evidence: layout.tsx:56-69. Suggested command: $impeccable polish.

## Persona red flags

Jordan (Confused First-Timer, French SMB owner): lands on a real homepage that says what this
is, who it is for, what it costs, and what to click. The limit paragraph answers the first
skeptical question before it forms. Remaining stumble: none of note on the happy path; if the
preview link is dead, the bilingual failure page explains and offers contact.

Casey (Distracted Mobile User): single column, fast, no overflow on any 390px capture; the
primary actions are real buttons at 44px-plus (globals.css:47-55). The mis-tap risk is the
header/footer nav (about 20px tall targets, P2 above); long bilingual pages are mitigated by
the top language anchors.

Sam (Accessibility-Dependent User): hand-computed pairs pass in both schemes (body 17.9:1 light
and 16.9:1 dark; muted labels 4.7:1 and 7.3:1; button pairs all above 4.5:1); visible
:focus-visible outline in the foreground color (globals.css:39-42); skip link with a visible
focus state (layout.tsx:100-105); html lang="fr" with lang="en" sections; semantic landmarks;
no images, so no alt debt. Gaps: the mixed-language link text on preview failure pages, the
French-only not-found, and the bare 500.

## Minor observations

- The mobile bilingual stack is still long on confidentialite-prospection (full FR then full
  EN); the anchors mitigate it. Presentation is fenced, so any further change stays
  presentation-only.
- Each bilingual page shows two h1 elements side by side at lg (page h1 plus the English
  section h1, offre/page.tsx:37 and :117). Valid sectioning, deliberate for parity; revisit
  only with the visual-world pass.
- Anchor jump targets (#francais/#english) are plain divs without tabindex, so focus does not
  move on jump; harmless at this scale, worth one line in a harden pass.
- The preview failure documents use system-ui rather than Inter (CSP default-src 'none' makes
  self-hosted fonts impossible there); recorded as a deliberate contract consequence, not a
  defect.
- Reduced motion: the global collapse exists (globals.css:74-81) although nothing on the site
  animates; defensive, fine.
- Price formatting on the site matches formatFullAuditPrice bytes for byte today ("1 600 € HT"
  with no-break spaces); the guard extension in the P2 above is what keeps that true.

## Questions to consider

- What is the one visual element this site could own the way its compliance copy does (a
  render-diff motif, a finding-card pattern, a typographic device for prices)?
- Should the homepage carry the re-audit figure (EUR 450 HT) or a one-line "how it works"
  sequence, or is the current single-decision homepage the right scope to keep?
- When the first real case study exists (brief section 11, still open), which page carries it
  without breaking the no-fabricated-proof rule the site currently honors by silence?

## Technical audit (audit.md)

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Contrast passes everywhere by hand-computation (detector chain degraded); skip link, focus outline, landmarks, lang attributes verified in source. Gaps: nav touch targets about 20px, error-page language parity, bare 500. |
| 2 | Performance | 4 | Static pages, self-hosted Inter with display swap through next/font/local (layout.tsx:11-20), no images, force-dynamic only where the preview contract requires it. |
| 3 | Responsive Design | 3 | Fluid max-w-2xl rising to lg two-column, no overflow at 390px on any capture, 44px-plus buttons; nav tap targets under the floor. |
| 4 | Theming | 3 | The semantic background/foreground pair drives body, buttons, focus and borders-by-inversion, but borders and label greys still use raw black/white alpha utilities with dark: twins (layout.tsx:51, :77; page.tsx:16, :57) instead of tokens. Both schemes verified working in captures and computed pairs. |
| 5 | Implementation Integrity | 3 | Coherent monochrome system, copy traceable to offer-positioning.md, compliance wording untouched (presentation-only changes, as fenced), detector 0 findings. Remaining nits: price literals outside the guard, no nav active state. |

Total: 16/20 (Good: address weak dimensions). Baseline was 15/20.

Implementation integrity verdict: pass. The implementation now expresses one coherent,
product-specific system: the same monochrome logic, one bilingual pattern, one button pair, and
copy that could not ship unedited from another product. The detector's only baseline finding is
obsolete (Arial demoted to pre-swap fallback). What keeps it at 3 rather than 4 is scope, not
drift: two new price literals sit outside the drift guard, and the visual layer is still stock
Tailwind steps rather than owned design.

Audit issue severity recap: P0 0, P1 0, P2 5 (the five items above), plus the minor
observations as P3.

Positive findings: the 404/410/500 distinction and anti-enumeration preserved intact through
the failure-page rewrite (same statuses, same headers, one shared 404 body, preview-response.ts:111-131);
security headers unchanged and exemplary; FR/EN written together with correct lang attributes;
zero-dependency isolation still enforced by tests; the no-og:image decision documented in code
instead of faked; 67 tests passing under packages/site/lib.
