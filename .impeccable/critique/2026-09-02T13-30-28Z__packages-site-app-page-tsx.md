---
target: packages/site public marketing surface (plan 022 step 4 baseline)
total_score: 19
max_score: 32
na_heuristics: 7,10
p0_count: 1
p1_count: 4
p2_count: 5
mode: Persuade
audit_score: 15
audit_max: 20
timestamp: 2026-09-02T13-30-28Z
slug: packages-site-app-page-tsx
---
# Impeccable critique and audit: packages/site (public marketing surface)

Method: single-context baseline (plan 022 step 4, SITE half). The coordinator
prescribed the order: detector, one batched capture round, then critique and
audit from source plus screenshots. No separate sub-assessments were spawned;
detector findings were verified in source after the design reading was done.

Context: baseline captured 2026-09-02 while another agent works unrelated
packages (plan 021) in the same working tree. Nothing under packages/ was
modified. Surface mode: Persuade (French SMB audience; the visitor decides
and acts). Next.js dev indicator bubble visible in captures is dev-only tooling,
not shipped UI.

## Heuristics table (Nielsen, 0 to 4)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Static site, little to report on. Opt-out page honestly states no automated processing behind the button; preview 410 truthfully says "expired". Gap: dev-config 500 on /apercu gives visitors a blank page rather than any status text. |
| 2 | Match System / Real World | 3 | Plain, honest French throughout. WCAG, EN 301 549, axe-core, Lighthouse appear on /bot, but that page's audience is technically curious site owners and the terms are used precisely. |
| 3 | User Control and Freedom | 2 | In-text links between bot, privacy and opt-out pages are good. No global navigation, no home link, no brand mark: from /offre there is no way back except the browser back button. |
| 4 | Consistency and Standards | 2 | Content pages share one consistent pattern (max-w-2xl, same heading scale, hr between languages). The home is a different world (centered stub), and the only button style exists on /desinscription; /offre has zero links or actions. |
| 5 | Error Prevention | 3 | No forms to misuse. Mailto on opt-out pre-fills subject and body. Preview tokens validate before hashing and 404 indistinguishably, deliberate anti-enumeration. |
| 6 | Recognition Rather Than Recall | 2 | No persistent navigation means every jump relies on remembering an in-text link or the URL. Home does not even link to /offre. |
| 7 | Flexibility and Efficiency | n/a | Persuade surface per plan 022 decision 2; no expertAccelerator dimension applies. |
| 8 | Aesthetic and Minimalist Design | 2 | Not cluttered (a strength), but the visual world is the browser default: Arial, 24px h1, default link blue, no color, no brand. Category-interchangeable for a page whose job is to persuade and carry a EUR 1,600 offer. |
| 9 | Error Recovery | 2 | Preview 404/410 bodies are truthful and bilingual but bare one-line plain text with no structure and no way back. No custom not-found page: unknown URLs serve Next's default English 404 to a French audience. |
| 10 | Help and Documentation | n/a | Persuade surface; no help dimension applies. |

Total: 19/32 (two heuristics n/a; band 59 percent, Acceptable)

## Design specificity verdict

LLM assessment: the compliance cluster (bot, confidentialite-prospection,
desinscription) is unmistakably authored for this product: the copy is
specific, legally careful, honest about limits, and cross-linked. The
persuade cluster is the opposite: the home is a literal placeholder and
l'offre is an unstyled HTML document that any product could ship unchanged.
No header, no footer, no brand mark, no color, no imagery anywhere. The site's
visual identity today is "no identity", which for the surface that must carry
a EUR 1,600 HT offer is the single biggest gap.

Deterministic scan: 1 finding, overused-font at
packages/site/app/globals.css:23 ("font-family: Arial"). Verified in source:
the rule's font set (.agents/skills/impeccable/scripts/detector/shared/constants.mjs:23-25)
does include 'arial' and 'helvetica', so this is a true positive, though the
finding's description text names only Inter/Roboto/Fraunces/Geist/Plus
Jakarta/Space Grotesk and none of those appear here; the prose list is
misleading but the rule set is authoritative. No other findings; exit code 2.

Visual overlays: none. Capture used the repository Playwright against a local
dev server with no detector injection; findings above come from the CLI scan
and manual source and screenshot review.

## Overall impression

The trust pages are quietly excellent in words and absent in form; the selling
pages do not exist yet. The single biggest opportunity: give the site one
authored visual world and one persistent frame (header with brand and nav,
footer with the compliance links), then make the offer page actually convert
(clickable contact, visible price block).

## What's working

1. Compliance copy quality: /bot and /confidentialite-prospection are precise,
   verifiable, and honest (three pages max, no Lighthouse on prospecting, 90
   day retention, named providers, CNIL route). This is rare and worth
   protecting; only presentation should change, wording is fenced by
   docs/rules.
2. Language discipline: html lang="fr" with lang="en" on the English sections
   lets screen readers switch voices; FR and EN are written together, per
   repository rule.
3. Lean, fast pages: no images, no webfonts, no client-side state; only the
   preview route is dynamic and its security headers (CSP, no-referrer,
   no-store, X-Robots-Tag) are exemplary.

## Priority issues

- P0. The homepage is a non-page for a Persuade surface. It renders one line,
  "Odysseusaudit.com, site en construction", with the same sentence as its
  meta description, and offers no offer link, no brand, no action.
  Evidence: packages/site/app/page.tsx:2-6; packages/site/app/layout.tsx:4-7;
  .impeccable/review/site-home-desktop.png, site-home-mobile.png.
  Suggested command: $impeccable shape (planning gate; any visual replacement
  is a new-work decision for the operator per plan 022 decision 3).
- P1. No persistent frame or route home. No header, nav, footer, or logo link
  on any page; the offer page is an orphan and the funnel home-to-offre does
  not exist. Evidence: packages/site/app/layout.tsx:9-15 (children only);
  page.tsx has no link to /offre. Screenshots: site-offre-desktop.png,
  site-home-desktop.png. Suggested command: $impeccable layout.
- P1. The offer page has no actionable contact. The single conversion action
  is a plain-text email address inside a paragraph, not a link, on desktop
  and worse on mobile (manual copy-paste). The published price is buried in
  running text. Evidence: packages/site/app/offre/page.tsx:73-77 (FR) and
  :121-127 (EN). Screenshots: site-offre-desktop.png, site-offre-mobile.png.
  Suggested command: $impeccable layout (action emphasis and price block).
- P1. /bot ships no page metadata. Title falls back to "Odysseusaudit.com"
  and the description to "site en construction" on the exact page a site
  owner checks before trusting the crawler. Evidence:
  packages/site/app/bot/page.tsx:11 (no metadata export, unlike offre,
  confidentialite-prospection, desinscription); capture log records
  title="Odysseusaudit.com" for /bot. Screenshot: site-bot-desktop.png.
  Suggested command: $impeccable harden.
- P1. No custom not-found or error page. Unknown URLs serve Next's default
  English 404 to a French audience; the preview route's own 404/410 bodies
  are bare plain text with no structure and no route back to the site.
  Evidence: no app/not-found.tsx or app/error.tsx exists (directory listing);
  packages/site/lib/preview-response.ts:32-33. Screenshots:
  site-apercu-invalid-token-desktop.png (dev-config 500, not judged as the
  route contract; the 500 with no body is the documented missing-env
  behavior in lib/read-preview.ts:71-74). Suggested command:
  $impeccable harden.
- P2. Default visual world: Arial with no display type, h1 at 24px, default
  link blue, no color system beyond background/foreground. Detector finding
  verified. Evidence: packages/site/app/globals.css:20-24. Screenshots: all.
  Suggested command: $impeccable typeset.
- P2. Opt-out button touch target is about 40px tall (px-4 py-2 on 16/24
  text), under the 44px floor. Evidence:
  packages/site/app/desinscription/page.tsx:36-43 and :102-109. Screenshot:
  site-desinscription-mobile.png. Suggested command: $impeccable polish.
- P2. Language duplication presentation: full FR and EN texts stack on one
  page separated only by an hr; parity rule satisfied but scanability
  suffers, most visibly on confidentialite-prospection. Presentation-only
  remedy (anchors, summary, or toggle) must keep wording fenced. Evidence:
  packages/site/app/confidentialite-prospection/page.tsx:138-141.
  Screenshot: site-confidentialite-prospection-mobile.png. Suggested
  command: $impeccable shape (IA decision first).
- P2. Social sharing metadata absent: no open graph or twitter tags on any
  route; shared links render bare. Evidence: packages/site/app/layout.tsx:4-7.
  Suggested command: $impeccable polish.

## Persona red flags

Jordan (Confused First-Timer, French SMB owner): lands on a construction
stub; cannot tell what is for sale or for whom; finds no menu anywhere; on
offre cannot click the email address and may not know how to copy it on
mobile. Would leave within seconds.

Casey (Distracted Mobile User): single column and fast, good. But the one
action that matters (contacting to buy) requires copying an address from
body text; the opt-out button is 40px, just under target; everything else
reads well on the 390px captures with no horizontal overflow.

Sam (Accessibility-Dependent User): body contrast about 17.9:1 (#171717 on
#ffffff) and link blue about 9.4:1, both pass; default focus outlines are
intact (nothing resets outline); lang attributes correct; no images (alt
n/a); no motion anywhere so reduced-motion is trivially respected. Gaps:
default English 404 breaks the language expectation; bare preview 404/410
text has no heading structure.

## Cognitive load

Checklist: single focus per page yes; chunking good (short sections); grouping
acceptable; visual hierarchy weak (uniform 24px/20px headings, no emphasis on
price or action); one decision at a time yes; minimal choices yes; working
memory not taxed; progressive disclosure fine. 1 failure: low cognitive load.
The real problem is not load, it is absence of affordances.

## Minor observations

- Two h1 elements per page (FR then EN inside section lang="en") is valid
  HTML5 sectioning and deliberate for parity; keep, but pair with the
  presentation decision above.
- /offre and /bot lack any breadcrumb or "back" affordance; in-text links
  exist only on bot and compliance pages.
- Dark mode tokens exist (globals.css:13-18) and every hard-coded color pair
  (bg-black/text-white, bg-black/5 dark:bg-white/10) has a dark variant, but
  pages use palette colors rather than the semantic tokens.
- Root title "Odysseusaudit.com" is a domain, not a brand line; fine to keep
  on home only once real pages exist.
- The dev indicator bubble in captures is Next.js dev tooling, not shipped UI.

## Questions to consider

- What if the homepage told the visitor in one screen what an audit is, what
  it costs, and how to start, with the compliance pages one click away?
- What would a confident version of l'offre look like: price as a headline
  block, one primary button, the legal caveats kept?
- Does the FR/EN stacking need a presentation pattern (anchors or summary)
  so each audience lands on its own text without splitting the page?

## Technical audit (audit.md)

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Contrast and focus pass; gaps: default English 404, bare plain-text preview 404/410 bodies, no og/alt concerns (no images). |
| 2 | Performance | 4 | No images, no webfonts, static pages, dynamic only where the contract requires; nothing to optimize yet. |
| 3 | Responsive Design | 3 | Fluid max-w-2xl + px-6, no overflow at 390px on any capture; opt-out button just under 44px. |
| 4 | Theming | 3 | Semantic tokens exist with working dark mode, but pages reach for palette colors (bg-black, text-white, bg-black/5) instead. |
| 5 | Implementation Integrity | 2 | Several verified issues: placeholder home, default Arial stack (detector verified), missing /bot metadata, missing not-found. Compliance cluster is coherent and intentional. |

Total: 15/20 (Good: address weak dimensions)

Implementation integrity verdict: fail for the persuade cluster, pass for the
compliance cluster. The trust pages could only have been written for this
product; the home and offer pages are interchangeable with any project and the
detector's only finding confirms the default identity. No detector false
positives; one misleading finding description (overused-font prose omits
Arial, the rule set includes it).

Audit issue severity recap: P0 1, P1 4, P2 5 (same items as the critique list
above; the audit adds none beyond them).

Positive findings: preview route security headers; token validation before
hashing; 404/410/200 distinction with truthful expiry message; FR/EN written
together with lang attributes; zero-dependency isolation of the site package
(enforced by tests); robots.txt with preview disallow as defence in depth.

## Capture manifest (evidence)

- .impeccable/review/site-home-desktop.png, site-home-mobile.png
- .impeccable/review/site-offre-desktop.png, site-offre-mobile.png
- .impeccable/review/site-bot-desktop.png, site-bot-mobile.png
- .impeccable/review/site-confidentialite-prospection-desktop.png,
  site-confidentialite-prospection-mobile.png
- .impeccable/review/site-desinscription-desktop.png,
  site-desinscription-mobile.png
- .impeccable/review/site-apercu-invalid-token-desktop.png,
  site-apercu-invalid-token-mobile.png (dev-config 500, documented
  missing-env behavior; route contract not judged from this)

Captured in one batched round: 1440x900 at deviceScaleFactor 1 and 390x844 at
deviceScaleFactor 2, networkidle plus 2.5s settle, full page. Dev server
stopped after capture and verified with pgrep (port 3210 closed).
