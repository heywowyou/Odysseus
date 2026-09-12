# Public website UX audit ledger

## Run history

| Run | Date       | HEAD    | New | Still open | Fixed | Regressions | Coverage | Parity |
| --- | ---------- | ------- | --- | ---------- | ----- | ------------ | -------- | ------ |
| 1   | 2026-09-12 | 02b27d7 | 8   | 8          | 0     | 0            | partial  | no     |

## Open findings

### SITE-001 (P3, possibly deliberate) "What the diagnostic checks" duplicated near-verbatim on offre and home

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: `/offre` and `/` (home), both languages, desktop.
- Evidence: the four-category check-grid prose ("Ce que le diagnostic vérifie" / "What the diagnostic checks": Accessibilité, Recherche et rendu, Signaux de visibilité IA, Performance et sécurité) is close to verbatim on both pages. Per the 2026-09-11T03-18-45Z impeccable critique: condensing offre's copy was attempted and abandoned because `lib/marketing-copy.test.ts`'s `commercialSources` pins the exact bounded AI-visibility sentence and the three metric names on BOTH pages, so a copy-only edit would fail the pinned test.
- Suggested fix: narrow the `marketing-copy.test.ts` pin to home-only (or add a second, deliberately looser pin for offre) alongside condensing offre's section into a link-back summary, so the fix is a paired copy+test change, not a copy-only one.
- Issue: #191

### SITE-002 (P3) Kicker-above-heading pattern needs an explicit operator decision

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: site-wide (every section kicker, e.g. "SCOPE OF THE DIAGNOSTIC", "ODYSSEUS REPORT").
- Evidence: impeccable's own craft-floor treats kicker-above-heading as an absolute ban ("no brief earns it back"), while the site's committed `DESIGN.md` and the 2026-09-11 critique treat the same pattern as the site's nameplate identity system, worth keeping. Neither the critique nor any trade-off entry records an operator ruling either way.
- Suggested fix: no code change; the operator states once whether the kicker pattern is a kept identity choice (record in `DESIGN.md` / trade-offs.md) or should be removed. Not implementable without that decision.
- Issue: #192

### SITE-003 (P2) Scanner vocabulary in the AI-visibility section contradicts the site's own "no jargon" promise

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: `/` and `/offre`, "AI visibility signals" section, both languages, desktop.
- Evidence: the section states technical terms without a plain-language paraphrase: FR "les données structurées déclarées par votre site... le fichier llms.txt et le balisage FAQ"; EN "the structured data your site declares... the llms.txt file and FAQ markup" (confirmed live on both pages, both languages, run 1). The home and offre pages elsewhere promise the opposite standard: offre's "Rigour of the report" section states findings are "put into plain language, without adding anything" and the home dossier card states "Le problème relevé... sans jargon" / stated "without jargon". A hotel owner reading "llms.txt" or "balisage FAQ" gets exactly the jargon the rest of the page promises they won't.
- Suggested fix: add one clause per term explaining it in plain words the first time it appears (e.g. "llms.txt, a file some AI assistants check before crawling a site" / "un fichier que certains assistants IA consultent avant d'explorer un site"), without removing the technical precision needed for credibility.
- Issue: #193

### SITE-004 (P3) "Replay the animation" button does not visibly do anything

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: `/` and `/offre`, all three schematic exhibits (accessibility, search and rendering, AI visibility), both languages, desktop.
- Evidence: live check, run 1: clicking the "Rejouer l'animation" / "Replay the animation" button produces no class or visible state change on the containing `<figure class="exhibit-figure ...">` (checked via direct DOM inspection before/after click). The button is real and focusable, not decorative, so a visitor who tries it gets no feedback that anything happened.
- Suggested fix: either make the button restart the exhibit's reveal sequence (reset and re-trigger the animation state), or remove the button and let the one-time reveal stand without an affordance that implies replay is possible.
- Issue: #194

### SITE-005 (P2) Canonical apex domain 308-redirects away from itself in production

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: every route, production (Vercel), verified via `curl -sIL`.
- Evidence: `packages/site/app/robots.ts:16` declares `host: 'https://odysseusaudit.com'` and `packages/site/app/layout.tsx:32` sets `metadataBase: new URL('https://odysseusaudit.com')`; every page's `alternates.canonical` is relative and resolves against that base, so every served page's `<link rel="canonical">` reads `https://odysseusaudit.com/...`. Live, `https://odysseusaudit.com/` returns HTTP 308 to `https://www.odysseusaudit.com/` (verified run 1 with curl on `/` and `/offre`). The canonical tag on the actually-served `www` page still reads the apex URL, so the declared canonical of every page is a URL that immediately redirects to a different one. This is a live Vercel domain-configuration fact, not a source-code inconsistency: the code is internally consistent on the apex domain throughout.
- Suggested fix: in the Vercel project's domain settings, either make the apex domain (`odysseusaudit.com`) the primary domain (redirecting `www` to it instead), or, if `www` must stay primary, change `robots.ts`'s `host`, `layout.tsx`'s `metadataBase`, and confirm `alternates.canonical` resolve against `https://www.odysseusaudit.com` instead. Either fix is one consistent choice, not a code change plus a leftover redirect the other way.
- Issue: #195

### SITE-006 (P2) Switching to English never updates the page title, description, or Open Graph tags

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: every route, English mode, desktop and mobile.
- Evidence: `packages/site/lib/language.tsx`'s `LanguageProvider` (lines ~44-47) updates `document.documentElement.lang` when the visitor toggles language, but nothing updates `document.title` or any `<head>` metadata. Verified live, run 1: after toggling to English, `document.documentElement.lang` correctly read `"en"` but `document.title` stayed `"Odysseus, diagnostic technique de site web"` (the French home title) on `/`, and `"Prospection et données personnelles | Odysseus"` (French) on `/confidentialite-prospection` while the visible page content was fully in English. Root cause: `metadata` is a Next.js server-rendered, per-route export (French only) and the language toggle is a client-side, same-URL affordance, so an English-reading visitor's browser tab, bookmark, and any social-share preview of the page stay French.
- Suggested fix: either accept this as an architectural trade-off of the single-URL bilingual design and document it, or have the toggle also swap `document.title` (and ideally description/OG meta via a client-side `useEffect`) to a maintained English variant per route when the visitor is in English mode.
- Issue: #196

### SITE-007 (P2) Opt-out mailto pre-fill stays French in the English-language view

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: `/desinscription`, English mode, desktop.
- Evidence: `packages/site/app/desinscription/page.tsx:39-46` defines one `MAILTO_SUBJECT`/`MAILTO_BODY` pair ("Opposition à la prospection" / "Bonjour, Je vous demande de ne plus me contacter...") shared by both the French and English `<LanguageSection>` blocks. Verified live, run 1: on the English-toggled page, the "Request opt-out by email" link's `href` still carries the French subject and body via `mailto:...?subject=Opposition%20%C3%A0%20la%20prospection&body=...`. An English-reading visitor trying to unsubscribe gets a French-language draft email to send.
- Suggested fix: define a second, genuinely-English `MAILTO_SUBJECT_EN`/`MAILTO_BODY_EN` pair and build two `mailto:` hrefs, one per `<LanguageSection>`, the same way the rest of the page's copy is already split.
- Issue: #197

### SITE-008 (P3) No sitemap.xml

- Status: OPEN. First seen: run 1. Last seen: run 1.
- Where: site-wide.
- Evidence: `https://www.odysseusaudit.com/sitemap.xml` returns HTTP 404 (verified run 1); `packages/site/app/` has no `sitemap.ts` alongside its existing `robots.ts`, and `robots.ts` does not declare a `sitemap` field.
- Suggested fix: add a `sitemap.ts` next to `robots.ts` listing the site's five real routes (home, offre, bot, confidentialite-prospection, desinscription), following the same one-file-per-route-list pattern Next.js uses for `robots.ts`.
- Issue: #198

## Fixed register

(none yet)

## Deliberate register

(none yet; SITE-002's kicker pattern stays in Open findings until the operator rules on it, at which point it moves here or is closed as fixed)
