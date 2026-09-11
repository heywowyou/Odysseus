# Plan 038: Recast the public site as a clear, evidence-led audit offer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 6bfe64d..HEAD -- packages/site/app/page.tsx packages/site/app/offre/page.tsx packages/site/app/layout.tsx packages/site/app/globals.css packages/site/lib/compliance-copy.test.ts packages/site/lib/marketing-copy.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> material mismatch, treat it as a STOP condition. `plans/README.md` is
> deliberately excluded: its expected Plan 038 index entry is already newer
> than the planned-at commit and does not change the implementation contract.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `6bfe64d`, 2026-09-11

## Why this matters

The public site currently explains the scanner before it establishes why a
business owner should buy the result. Its home page gives nearly equal visual
weight to four generic diagrams, so the sole useful visual, the raw-versus-
rendered comparison, is buried in a long technical lesson. The offer page is
accurate but reads as an unstructured legal and technical memo rather than a
decision page.

Two explanations are materially misleading. The performance timeline names
browser-internal moments without connecting them to a buyer's decision or to
the measurements Odysseus actually retains. The AI-assistant panel says an
assistant reads structured data and otherwise "devines, ou passe", which
overstates the bounded technical checks and makes a visitor-facing comparison
that proves nothing. Recast both pages around the verifiable handoff: a buyer
receives an ordered, bilingual work document that identifies what to correct,
where, and why. Preserve the product's deliberately careful claims while
giving the brand a stronger visual point of view.

## Current state

- `packages/site/app/page.tsx` is the bilingual home page. It has four long
  explanatory blocks at lines 176-359. The render-diff panel is valuable,
  but the accessibility and AI panels repeat the same dark-code/light-page
  visual grammar and make the page feel like a product demo instead of an
  offer. The current AI claim at lines 264-305 must not be retained.
- `packages/site/app/page.tsx:313-358` renders the current three-dot timeline:

  ```tsx
  <p className="subheading">Premier affichage</p>
  <p className="small muted mt-1">Le navigateur commence à peindre la page.</p>
  // ... Contenu principal visible ... Page réellement utilisable
  ```

  It visually implies an ordered customer journey, but its labels neither
  name the actual metrics nor say what an operator can do with them.
- `packages/site/app/offre/page.tsx:37-125` starts correctly with the approved
  RGAA limitation, then switches to a prose-only scope, deliverable, and price
  sequence. It also contains the obsolete, prospect-specific sentence "Si vous
  avez reçu un aperçu, celui-ci portait sur trois pages au plus". Remove that
  sentence rather than updating it: a general offer page should not explain a
  cold-outreach asset.
- `packages/site/app/globals.css` owns the shared public-site visual system.
  Its current `--paper`/`--ink`/blue tokens and `.diff`, `.timeline`,
  `.statement`, `.card`, and `.basis-row` rules are used by all public routes.
  A global change must leave `/bot`, `/confidentialite-prospection`, and
  `/desinscription` readable and accessible.
- `packages/site/app/layout.tsx:29-48` owns the root French metadata. Its
  description lists only accessibility, SEO, and performance even though the
  public offer also names bounded AI-visibility checks.
- `packages/site/lib/compliance-copy.test.ts` deliberately tests public
  copy as source text because this package has no React DOM test harness. Use
  that pattern for the marketing copy's bilingual and claims boundaries.
- `docs/rules/offer-positioning.md` is the canonical offer contract. It
  requires the following limitation to appear before promises on the offer
  page, and the English equivalent must remain aligned:

  ```text
  Ceci est un diagnostic technique, pas un audit RGAA. Il ne produit pas de
  taux de conformité officiel et ne peut pas servir de base à une déclaration
  d'accessibilité.
  ```

- `docs/decisions/trade-offs.md`, entries 14, 18, and 57 establish the
  permitted technical facts. GEO checks cover discrete signals such as
  named-AI-crawler access in `robots.txt`, `llms.txt`, FAQ markup, and
  structured-data/entity validation. They do not predict whether an assistant
  will quote, rank, recommend, or understand a business. Performance combines
  sampled Lighthouse lab measurements and optional CrUX field data. CrUX INP
  is unavailable for many smaller sites and must never be presented as a
  universal measurement.
- `packages/site` is a standalone Next.js application with no imports from
  other workspace packages. `packages/site/lib/package-isolation.test.ts`
  enforces that boundary. It already has Tailwind, Next, React, and Playwright
  available; do not add a design, chart, icon, analytics, cookie, or font
  dependency.

## Design and content contract

### Audience and page job

The primary reader is a French owner or director of a small or mid-size
business. They do not need a scanner tutorial. The home page's single job is
to make them understand: "Odysseus gives my developer a credible, usable list
of site corrections." The offer page's job is to let that reader decide
whether the fixed-price diagnostic is the right first step before an RGAA
audit, and to contact Odysseus.

### Direction: the evidence dossier

Use an **evidence dossier**, not a generic software landing page and not a
dashboard imitation. The signature element is one oversized, report-like
"fiche constat" in the home hero. It must contain three factual labels:
`Constat`, `Preuve`, and `Action` (with aligned English labels), each paired
with short generic structural text. It illustrates the *shape of the
deliverable*, never a finding from a real customer and never a score, metric,
or fabricated outcome. A small caption must say that it is an illustration of
the report format, not an audit result.

Use the card once. Do not replace it with four pseudo-screenshots, animated
charts, a fake dashboard, stock photography, generic blobs, ornamental 01/02
numbering, testimonials, logos, success percentages, or invented turnaround
times. The existing raw-versus-rendered illustration may survive only as a
compact explanatory inset under the search section if it still earns its
space. It must remain visibly labelled as a schematic, not a result.

Build the compact system from existing local assets:

| Role | Value | Use |
| --- | --- | --- |
| Ground | `#E8EDF3` | cool paper background, not warm-cream startup styling |
| Ink | `#101B2A` | headings, body, primary controls |
| Dossier navy | `#18385D` | the finding card's spine and navigation signal |
| Signal orange | `#D56832` | one annotation rule and keyboard-visible emphasis, never severity |
| Evidence blue | `#3569B4` | links and the raw-versus-rendered inset only |
| White | `#FFFFFF` | report sheet and raised controls |

Keep self-hosted Inter for reading and use the existing system monospace stack
only for field labels, URLs, and machine evidence. The contrast between the
dense, label-led dossier and generous editorial prose is the identity move;
do not add remote fonts. Keep the existing 44px minimum control height,
keyboard focus treatment, reduced-motion behavior, and light/dark support.
In dark mode, preserve the semantic distinction between the dossier sheet,
machine evidence, and reader prose rather than merely inverting every color.

### Target information architecture

Home page, in this order:

```text
Header: Odysseus | L'offre | OdysseusBot | language switch

Hero
  Eyebrow: diagnostic technique automatisé
  H1: decision and handoff benefit, not scanner mechanics
  One-sentence scope and a primary contact CTA
  Dossier-card signature: Constat | Preuve | Action

What you receive
  Whole-site content coverage, prioritized corrections, bilingual PDF,
  page and element evidence. Use four short statements, not four diagrams.

What is checked
  Accessibility | Search and rendering | Technical AI-visibility signals |
  Performance and security. Give each one a bounded, plain-language sentence.

How the handoff works
  Discover -> locate -> prioritize -> correct, shown as a real ordered
  sequence because these are actual stages of the deliverable.

Method and limits
  Keep the three existing evidence/legal principles in a calmer compact grid.

Price and contact
  EUR 1,600 HT, published and fixed, linked to the offer.
```

Offer page, in this order:

```text
Offer hero: "Diagnostic technique complet", outcome, price and contact action
Approved RGAA limitation, before any scoped promise
Four bounded scope cards
Deliverable dossier: what every finding contains
Coverage note: all eligible content pages, sampled performance measurement
Price and contact
```

At desktop widths, place prose and the dossier card in a deliberate asymmetry,
with the card offset slightly down and visually anchored by the navy spine.
At narrow widths, put the benefit text and primary action before the card;
cards become a single column with no horizontal scrolling. Use section rules
and whitespace to create rhythm, not repeated rounded white rectangles.

### Required copy boundaries

Write French first and translate it to idiomatic English in the same change.
The two languages need matching facts, not mechanically identical sentence
lengths. Use direct, non-salesy sentence case and no em or en dashes.

1. The home hero must describe the benefit in terms of a correction handoff,
   for example: "Un diagnostic technique pour savoir quoi corriger, où, et
   dans quel ordre." It may say the report identifies pages and elements;
   it must not say a site is compliant, legally obliged, accessible, or fixed.
2. On the offer page, retain the approved limitation verbatim in French and
   English before the detailed scope. It is a position, not a warning to hide.
3. Replace the AI panel and offer bullet with a bounded title such as
   "Signaux de visibilité dans les moteurs et assistants IA". Its French
   explanatory copy must communicate this exact boundary: the diagnostic
   checks technical signals that can be verified, including structured data
   where applicable and declared crawler-access rules; it does **not** predict
   whether an assistant will cite, rank, recommend, or answer about the site.
   The English copy must carry the same "does not predict" limitation.
4. Replace the performance timeline with three metric-led, decision-oriented
   cards: `Chargement du contenu principal (LCP)`, `Stabilité visuelle (CLS)`,
   and `Réactivité réelle (INP, lorsque des données terrain sont disponibles)`.
   Explain that lab performance is measured on a representative sample and
   field data, when available, supplements it. Do not call LCP "premier
   affichage", do not promise INP for every site, and do not imply that the
   three cards are one chronological sequence. Put security headers in their
   own bounded sentence or card rather than as an afterthought to loading.
5. State coverage truthfully wherever it is material: every successfully
   crawled HTML page gets content-sensitive checks; performance is a disclosed
   deterministic sample. Do not replace that distinction with an unqualified
   "every page is measured" claim.
6. Keep the fixed published price exactly `1 600 € HT` and `EUR 1,600 excl.
   VAT`, keep the one monitored `contact@odysseusaudit.com` address, and keep
   the PDF's French-and-English delivery claim. Do not mention the current
   three-page outreach preview on the general offer page.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Targeted copy tests | `pnpm run test -- packages/site/lib/compliance-copy.test.ts packages/site/lib/marketing-copy.test.ts` | exit 0; all named tests pass |
| Package build | `pnpm --filter @odysseus/site run build` | exit 0; Next reports a successful production build |
| Documentation and static checks | `pnpm run check` | exit 0; documentation, format, lint, and typecheck pass |
| Full unit suite | `pnpm run test` | exit 0; all unit suites pass |

For local visual review, run `pnpm --filter @odysseus/site run dev`, then use
the installed Playwright CLI to capture 1440px-wide full-page screenshots of
`/`, `/offre`, `/bot`, `/confidentialite-prospection`, and `/desinscription`.
Also inspect `/` and `/offre` at 390px width, in both language states and with
reduced motion. Stop the dev server after the review. Screenshots are review
artifacts only; do not add them to the repository.

## Scope

**In scope**:

- `packages/site/app/page.tsx`
- `packages/site/app/offre/page.tsx`
- `packages/site/app/layout.tsx`
- `packages/site/app/globals.css`
- `packages/site/lib/compliance-copy.test.ts`
- `packages/site/lib/marketing-copy.test.ts` (new)
- `plans/README.md` (mark Plan 038 `IMPLEMENTED` or `DONE` only when its
  stated verification has actually occurred)

**Out of scope**:

- `packages/site/app/apercu/**` and all outreach-preview rendering or
  publication work. Plan 037 owns that contract.
- `packages/site/app/bot/**`, privacy, and opt-out *copy*. Their visual review
  is required because they share CSS, but their regulated wording must not be
  rewritten in this plan.
- Any scanner check, score, report data model, pricing constant, legal rule,
  package boundary, dependency, external analytics, cookie banner, CRM form,
  remote image, or external font.
- Client-specific claims, case studies, logos, testimonials, performance
  numbers, compliance rates, or promises about rankings and AI answers.

## Git workflow

- Work on the branch the operator provides. This repository's current plan
  policy permits milestone work on `main`; do not create a parallel branch
  unless the operator asks.
- Make one logical commit after the design, bilingual copy, tests, and visual
  review pass together. Use the repository's imperative, plain commit style,
  for example `Rewrite public site copy natively in French and refresh visual
  design`.
- Do not push or open a pull request unless the operator instructs it.

## Steps

### Step 1: Freeze the evidence and claims matrix before changing markup

Add `packages/site/lib/marketing-copy.test.ts`, following the source-reading
and `prose(...)` pattern in `compliance-copy.test.ts`. Read `app/page.tsx`,
`app/offre/page.tsx`, and `app/layout.tsx` as source text. Add tests that:

- prove both the home and offer pages include French and English
  `LanguageSection` content;
- require the exact French and English RGAA limitation on the offer page;
- require the fixed French and English price spellings and the single contact
  address on both commercial pages where they appear;
- require the bounded AI-visibility wording and its explicit no-prediction
  boundary in both languages;
- require `LCP`, `CLS`, and an availability-qualified `INP` explanation in
  both languages;
- reject the removed overclaim and vague performance labels, including
  `Premier affichage`, `First paint`, and the French claim that an assistant
  will "deviner, ou passer" a page;
- reject em and en dashes in the home and offer sources.

Do not make the test depend on whitespace, class names, or a particular card
layout. It must protect public meaning, not freeze implementation detail.

**Verify**: `pnpm run test -- packages/site/lib/compliance-copy.test.ts packages/site/lib/marketing-copy.test.ts` -> exit 0 after the new test initially reflects the intended copy. If it cannot be made green without weakening the boundaries above, stop.

### Step 2: Rebuild the home page around the correction handoff

Rewrite `packages/site/app/page.tsx`'s `HomeFr` and `HomeEn` together. Preserve
the existing `LanguageSection` mechanism, `main#contenu`, valid headings, skip
link target, and keyboard-visible links. Replace the current four equal-size
demonstration blocks with the home-page architecture in the design contract.

Implement the dossier card in semantic HTML. It should be a labelled `aside`
or `section` with a concise heading and a definition list or similarly
meaningful label/value structure, rather than a pile of anonymous bars. Its
generic values must describe a finding format, not fabricate a finding. Keep a
plain-text caption that it is illustrative. Use the existing raw/rendered
example only if it has been reduced to a clear, subordinate explanation of
search rendering; otherwise remove it rather than preserving it out of
investment.

Keep the hero's limitation concise on the home page and link the visitor to
`/offre` for the full wording. The offer page remains the authoritative first
location for the full approved limitation. Give the home page one primary
action, `Écrire à Odysseus` / `Write to Odysseus`, and a clear secondary link
to the offer. Do not present a mailto link as an order commitment on the home
page.

Build the "what is checked" cards from the exact copy boundaries above. The
performance and security explanations must not share one overloaded graphic.
Use the ordered process only for the real progression from observation through
handoff, not for unrelated audit domains.

**Verify**: `pnpm run test -- packages/site/lib/marketing-copy.test.ts` -> exit 0; inspect the rendered DOM to confirm one `h1`, logical `h2` progression, and no interactive control beneath an `aria-hidden` ancestor.

### Step 3: Turn the offer page into a decision page

Rewrite `packages/site/app/offre/page.tsx` in both languages to use the offer
architecture in the design contract. Keep the approved full RGAA limitation at
the top of each language section, before any detailed scope promise. Keep the
fixed price and email destination exactly as they are today.

Replace the unstructured scope list with four short scope cards or rows whose
labels distinguish accessibility, search/rendering, bounded AI-visibility
signals, and performance/security. Follow it with a concrete "what the report
contains" dossier list: the affected page and element, evidence, explanation,
priority, and correction recommendation. State the whole-site content versus
sampled-performance distinction in the coverage note. Remove the three-page
preview paragraph entirely.

Use one confident primary contact action in the price block. Its French and
English labels must describe the actual action, for example `Écrire à
Odysseus` / `Write to Odysseus`; never imply payment, booking, or an automatic
order flow that does not exist.

Update `app/layout.tsx` root title/description and the home-page OpenGraph and
Twitter description only as needed to match the final accurate scope. Update
the route-specific `metadata` in `app/offre/page.tsx` at the same time so its
title and descriptions agree with the final offer. Keep metadata French-first,
concise, and free of the AI-outcome overclaim. Preserve canonical URLs and the
deliberate absence of an invented `og:image`.

**Verify**: `pnpm run test -- packages/site/lib/compliance-copy.test.ts packages/site/lib/marketing-copy.test.ts` -> exit 0; `pnpm --filter @odysseus/site run build` -> exit 0.

### Step 4: Apply the dossier visual system without breaking the other public routes

Refactor `packages/site/app/globals.css` deliberately, not as a local pile of
utility overrides. Set the named color roles from the design contract near the
existing root tokens, then create narrowly named component classes for the
dossier card, scope cards, metric cards, process row, and compact method grid.
Before removing any shared selector, run `rg -n "timeline|diff|card|statement|basis-row" packages/site` and remove it only when no remaining route
uses it. Retire `.timeline` and its related home-only rules once no markup uses
them. Remove any abandoned `.diff` rules only if the render inset was removed.

Preserve shared controls, focus states, language toggle, prose styles, footer,
and responsive shell behavior. Do not turn every section into a card. On large
screens, use one asymmetrical hero composition and a visible dossier spine;
on small screens use a single reading column and prevent text or controls from
overflowing. Preserve reduced-motion behavior. The orange annotation must not
be the only carrier of meaning or the only visible focus cue. If the dark
scheme no longer makes the report sheet and machine evidence distinguishable,
revise its semantic tokens rather than disabling dark mode.

**Verify**: `pnpm --filter @odysseus/site run build` -> exit 0; then perform the local screenshot review described in "Commands you will need." All five routes must remain readable, the two commercial pages must be visually coherent at 390px and 1440px, and neither language may reveal the hidden other-language content.

### Step 5: Complete regression and handoff checks

Run the full unit, static, and documentation checks. Review `git diff` for
unrelated formatting, stale copy, and accidental changes outside the scope.
Record the visual-review routes, viewports, language states, and any remaining
manual risk in the session handoff. Update Plan 038's row to `IMPLEMENTED`
only if all code checks pass but the operator has not yet accepted the visual
review, or `DONE` only after that review is accepted.

**Verify**: `pnpm run test` -> exit 0; `pnpm run check` -> exit 0; `git diff --check` -> no output; `git status --short` -> only intended in-scope files and the required session handoff record are changed.

## Test plan

- Add `packages/site/lib/marketing-copy.test.ts` as a focused source-level
  regression suite. Model its filesystem lookup, comment stripping, bilingual
  check, and text-normalization approach on
  `packages/site/lib/compliance-copy.test.ts`.
- Retain `compliance-copy.test.ts` as the guard for price, legal restraint,
  contact address, and the surrounding regulated routes. Adjust only tests
  whose expected text changes because the offer page has been deliberately
  rewritten; do not dilute a legal boundary to make new marketing copy pass.
- Run the existing isolation suite through the complete unit run. The redesign
  must leave the standalone package without workspace imports or private data
  access.
- Treat screenshots as a manual visual acceptance test, not a committed
  snapshot test. Check French and English separately because the language
  toggle hides one section at a time and text wrapping differs by language.

## Done criteria

- [ ] The home page leads with the correction handoff and has one clearly
  labelled, non-fabricated dossier-card illustration instead of four equal
  generic diagrams.
- [ ] Neither commercial page retains `Premier affichage`, `First paint`, the
  old assistant "guess or skip" claim, or the obsolete three-page-preview
  explanation.
- [ ] AI-visibility copy describes only verifiable technical signals and
  explicitly disclaims prediction of citations, rankings, recommendations, or
  answers in both languages.
- [ ] Performance copy names LCP, CLS, and availability-qualified INP, keeps
  sampled lab measurement distinct from optional field data, and treats
  security headers separately.
- [ ] The offer page retains the approved French and English diagnostic-not-
  RGAA limitation before its detailed scope, the exact fixed price, one
  monitored contact address, bilingual PDF delivery, and no client-specific
  legal conclusion.
- [ ] `/`, `/offre`, `/bot`, `/confidentialite-prospection`, and
  `/desinscription` have passed the documented desktop and mobile visual
  review; focus, reduced motion, and both language states were checked for the
  commercial pages.
- [ ] `pnpm run test`, `pnpm --filter @odysseus/site run build`, `pnpm run
  check`, and `git diff --check` all pass.
- [ ] No dependency, package-boundary, scanner, preview, price-constant, or
  legal-rule change is included.

## STOP conditions

Stop and report rather than improvising if:

- `offer-positioning.md`, the legal rules, or the price test requires a
  different claim or wording from this plan's copy boundary.
- Accurate AI-visibility copy would require a new scanner check, a new
  external data provider, a ranking/citation measurement, or a claim not
  supported by the current deterministic checks.
- The desired performance presentation needs metrics that Lighthouse or the
  optional CrUX path does not record, or it makes field data sound universal.
- The visual redesign would require a dependency, non-local font, image asset,
  analytics, cookie, form backend, private-package import, or a change to the
  shared site package boundary.
- A CSS change makes any regulated public route unreadable, hides focus,
  breaks its language switch, or cannot meet the existing contrast and
  reduced-motion behavior.
- The in-scope source no longer resembles the excerpts because another site
  redesign landed first.

## Maintenance notes

- `packages/site/app/globals.css` is shared by both commercial and compliance
  routes. Future visual work must review all routes, not only the home page.
- Marketing copy is intentionally guarded as source text because the public
  package has no React DOM test harness. Add a test whenever a future copy
  change touches offer, pricing, legal limits, AI visibility, or measurement
  semantics.
- Keep the dossier card illustrative. Once a reviewed, de-identified public
  report sample exists, a separate plan may replace it with a real artifact;
  until then, no invented customer evidence belongs there.
- Plan 037 owns the outreach preview. The offer page's removal of preview
  mechanics is intentional: it prevents an outreach implementation change from
  forcing a public marketing rewrite.
