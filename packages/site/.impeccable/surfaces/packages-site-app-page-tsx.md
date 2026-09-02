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
- No new dependency; the site stays isolated from the workspace packages (no imports, no shared fonts or tokens today).
- Accessibility floor: 4.5:1 body-text contrast, visible keyboard focus, complete states, reduced motion respected.

Unresolved decisions (operator, step 5):
- What the one-screen homepage should promise (currently a construction placeholder).
- Whether the offre page gets a price block and a single primary contact action.
- Whether a visual-world replacement for the public pages is wanted at all: that is a separate new-work session with its own direction contract, never a slice of this plan.
