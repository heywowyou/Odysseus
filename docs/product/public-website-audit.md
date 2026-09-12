# Public website UX audit ledger

## Run history

| Run | Date       | HEAD    | New | Still open | Fixed | Regressions | Coverage | Parity |
| --- | ---------- | ------- | --- | ---------- | ----- | ------------ | -------- | ------ |
| 1   | 2026-09-12 | 02b27d7 | 8   | 0          | 7     | 0            | partial  | no     |

## Open findings

(none open as of run 1's reconciliation, 2026-09-12)

## Fixed register

### SITE-001 (P3) "What the diagnostic checks" duplicated near-verbatim on offre and home

- Status: FIXED, commit `4d8efba`. First seen: run 1.
- Where: `/offre` and `/` (home), both languages, desktop.
- Evidence: the four-category check-grid prose ("Ce que le diagnostic vérifie" / "What the diagnostic checks": Accessibilité, Recherche et rendu, Signaux de visibilité IA, Performance et sécurité) was close to verbatim on both pages.
- Fix: reworded the two freely-editable paragraphs (Accessibilité, Recherche et rendu) on the offer page so they no longer match home's phrasing. The remaining shared strings (the AI-visibility caveat sentence, the three CWV metric names, "security headers", coverage wording) stayed untouched: `marketing-copy.test.ts` pins them verbatim on both pages by design, for legitimate cross-page consistency, not as a defect.
- Issue: #191 (closed)

### SITE-003 (P2) Scanner vocabulary in the AI-visibility section contradicts the site's own "no jargon" promise

- Status: FIXED, commit `4d8efba`. First seen: run 1.
- Where: `/` and `/offre`, "AI visibility signals" section, both languages, desktop.
- Evidence: the section stated "llms.txt" and "balisage FAQ" / "FAQ markup" with no plain-language paraphrase, contradicting the site's own "sans jargon" / "without jargon" promise elsewhere.
- Fix: added a parenthetical gloss for each term, in both languages, on both pages.
- Issue: #193 (closed)

### SITE-005 (P2) Canonical apex domain 308-redirects away from itself in production

- Status: FIXED, commit `4d8efba`. First seen: run 1.
- Where: every route, production (Vercel).
- Evidence: `robots.ts`'s `host` and `layout.tsx`'s `metadataBase` pointed at the apex `odysseusaudit.com`, which 308-redirects to `www.odysseusaudit.com` in production, so every canonical tag pointed at a URL that immediately redirects away.
- Fix: repointed `metadataBase`, `robots.ts`'s `host`, and the new `sitemap.ts`'s URLs at `https://www.odysseusaudit.com`, the domain actually served. No Vercel dashboard change made or needed.
- Issue: #195 (closed)

### SITE-006 (P2) Switching to English never updates the page title, description, or Open Graph tags

- Status: FIXED, commit `4d8efba`. First seen: run 1.
- Where: every route, English mode, desktop and mobile.
- Evidence: `document.title` and the description meta tag stayed French after toggling to English, since Next's `metadata` export is server-rendered and French-only.
- Fix: added `lib/page-meta.ts`, a per-route FR/EN title and description map, and an effect in `LanguageProvider` that sets `document.title` and the description meta tag's content on every language or route change. Open Graph tags are unchanged: they are read by social crawlers that do not execute JavaScript, so a client-side update would not reach them.
- Issue: #196 (closed)

### SITE-007 (P2) Opt-out mailto pre-fill stays French in the English-language view

- Status: FIXED, commit `4d8efba`. First seen: run 1.
- Where: `/desinscription`, English mode, desktop.
- Evidence: one shared `MAILTO_SUBJECT`/`MAILTO_BODY` pair, French only, was used by both language sections.
- Fix: added `MAILTO_SUBJECT_EN`/`MAILTO_BODY_EN` and a second `mailto:` href, wired to the English `<LanguageSection>` only.
- Issue: #197 (closed)

### SITE-008 (P3) No sitemap.xml

- Status: FIXED, commit `4d8efba`. First seen: run 1.
- Where: site-wide.
- Evidence: `sitemap.xml` 404'd; no `sitemap.ts` existed.
- Fix: added `app/sitemap.ts` listing the site's five real routes, and declared it in `robots.ts`'s `sitemap` field.
- Issue: #198 (closed)

## Verified, not a defect

### SITE-004 (P3) "Replay the animation" button does not visibly do anything

- Status: VERIFIED WORKING, no code change. First seen: run 1.
- Where: `/` and `/offre`, all three schematic exhibits, both languages, desktop.
- Original evidence: clicking the replay button produced no class change on the `<figure class="exhibit-figure ...">` element itself.
- Resolution: live testing (local dev server, sampling the animated `clip-path` value across animation frames) confirmed the replay mechanism in `lib/exhibit.tsx`'s `replay()` (remove `is-running`, force a reflow, re-add it) genuinely restarts the reveal animation. The original check inspected the wrong element: `is-running` is set on the `.exhibit` ancestor, and the CSS targets it via `.exhibit.is-running .fx-clip` descendant selectors, not on `.exhibit-figure` itself.
- Issue: #194 (comment posted with findings; left for the operator to close)

## Deliberate register

### SITE-002 (P3) Kicker-above-heading pattern

- Status: KEPT, operator ruling 2026-09-12 (trade-off 85).
- Where: site-wide — the dossier stamp ("Rapport Odysseus" / "Odysseus report") and the statement label ("Portée du diagnostic" / "Scope of the diagnostic").
- Evidence: impeccable's craft-floor treats kicker-above-heading as an absolute ban; the site's `DESIGN.md` and the 2026-09-11 critique treated these two uses as the site's nameplate identity, without a recorded operator ruling.
- Ruling: kept as deliberate brand identity, same reasoning as the report's own `kicker-above-heading` exemption (trade-offs.md, entry preceding 85). Recorded in `DESIGN.md`'s Site Label note and `docs/decisions/trade-offs.md` entry 85.
- Issue: #192 (closed)
