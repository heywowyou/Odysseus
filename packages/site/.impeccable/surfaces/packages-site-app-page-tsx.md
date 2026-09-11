---
version: 1
slug: "packages-site-app-page-tsx"
primary_target: "packages/site/app/page.tsx"
related_targets: ["packages/site/app/offre/page.tsx","packages/site/app/bot/page.tsx","packages/site/app/confidentialite-prospection/page.tsx","packages/site/app/desinscription/page.tsx","packages/site/app/apercu/[token]/route.ts"]
---

# Surface brief: public site

Scope: packages/site/app and packages/site/lib. Primary target: packages/site/app/page.tsx. Related targets: the offre, bot, confidentialite-prospection, desinscription, and apercu/[token] routes.

Mode: Persuade for the home and offre pages: the visitor decides and acts. The compliance and preview pages (bot, confidentialite-prospection, desinscription, apercu) are fenced: presentation may change, any wording change must cite its governing rule document (docs/rules/outreach-rules.md, docs/rules/operator-obligations.md, docs/rules/offer-positioning.md) or the wording does not change.

Audience: French small and mid-size business owners, non-technical, deciding whether to buy an audit. Site owners who find the crawler in their logs must find their questions answered on /bot.

Job: understand the offer quickly, trust it (honest limits stated first, diagnostic-not-RGAA framing), and contact the operator.

Constraints:
- French first; English sections exist on compliance pages; FR and EN parity maintained.
- Never break the /apercu/[token] route contract: hash-token serving and the RGPD article 14 disclosures stay intact (trade-offs 42 and 43).
- No new dependency; the site stays isolated from the workspace packages (no imports). Its typeface is self-hosted independently: Avenir Next as of 2026-09-11 (operator-licensed for the site; see PRODUCT.md, Evidence on Hand), not shared with the dashboard/report's Inter.
- Accessibility floor: WCAG 2.2 AA (operator decision, 2026-09-11), verified with axe-core against the live DOM.
- The euro-figure guard in `packages/core/src/offer/pricing.test.ts` reads offre's literal text and fails on any third figure: the full-audit price (1 600 EUR HT) and the re-audit price (450 EUR HT) are the only two allowed.

Resolved (refreshed 2026-09-11, impeccable fix plan, steps 1 to 2):
- Home leads with the correction handoff, not a construction placeholder (settled by plan 038, 2026-09-11).
- Offre has a price block, a single "Écrire à Odysseus" contact action, and now its own hero artifact: a three-row dossier card (repérage/preuve, preuve, priorité et action) mirroring home's, replacing the former five-item receive-grid that overflowed the heuristic's "over-limit grid" check. Every primary CTA cluster (home hero, home price, offre hero, offre price) pairs the mailto with the visible address and a "read personally" reassurance; offre's price section states the EUR 450 HT re-audit fact and a three-step post-contact sequence (Réponse/Questionnaire/Proposition écrite).
- The "Ce que le diagnostic vérifie" check-grid still repeats home's four-category prose close to verbatim: the marketing-copy test pins the exact bounded AI-visibility sentence, the three metric names with the field-data qualifier, and the coverage/security-header phrases on this page too (both home and offre are in `commercialSources`), so trimming that duplication further needs a test update alongside it, not a copy-only change. Left as-is in this pass; a genuine differentiation (condensing to a summary that links home for the full wording, then narrowing the pinned assertions to fire on home only) is the next opportunity if the operator wants to close this out.

Resolved (step 6, 2026-09-11):
- Typeface switched from the shared Inter to an operator-licensed, self-hosted Avenir Next (Regular/Medium/Demi/Bold at `packages/site/app/fonts`), after confirming a valid commercial license with the operator (the source files in `data/font/` carried no license and included dead `.eot` files, a red flag worth catching before embedding a commercial typeface). Report and dashboard are unaffected. The critique's `overused-font` finding on Inter no longer applies to the site; no ignore-value needed.

Open decision (not resolved this pass):
- The kicker-above-heading nameplate pattern (a `<p className="label">` above nearly every heading, sitewide) is impeccable's craft-floor's one absolute ban ("no brief earns it back"), but it is also the site's committed, operator-praised identity system (critique: "the nameplate system itself"). Removing it site-wide is a design decision bigger than this fix pass; it was deliberately not applied to the new offre hero artifact or the new "Après votre message" section (neither carries a new kicker), but the existing kickers elsewhere on offre and home were left untouched. Flagging for an explicit operator call rather than deciding unilaterally either way.
- Whether a visual-world replacement for the public pages is wanted at all: that is a separate new-work session with its own direction contract, never a slice of this plan.
