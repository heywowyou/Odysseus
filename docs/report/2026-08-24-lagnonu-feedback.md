# Report feedback: Domaine Lagnonu (FR, 2026-08-24)

Client-eye pass on `artifacts/www.lagnonu.fr/2026-08-24T16-45-59Z/reports/
2026-08-24T17-20-01Z-fr.pdf`, 36 pages, 145 findings, 43 pages scanned.

Reading posture: the four audiences the report itself names in section 01
(dirigeant, prestataire/agence, conseil juridique) plus the annex reader.

Fourth site in the review rotation, chosen specifically because the three
reference sites were being re-scanned repeatedly. It immediately paid for
itself: a P0 scanner defect that the full 1345-test suite passes over and
that `fixtures/spa-demo` cannot express (item 0.1).

Arithmetic checks out where it is checkable: 5 + 47 + 8 + 85 = 145
severity total; 95 + 35 + 9 + 5 + 1 = 145 category total; the five
critical findings do genuinely union to 43 of 43 pages; section 07's
eight WCAG criteria match section 04's "8 criteres".

---

## P0: fixed during this session

### 0.1 Every page lost its accessibility scan (render-diff navigation)

`render-diff.ts:89` navigated with `waitUntil: 'networkidle'`. On this
site network idle is not slow, it is **unreachable**: measured directly,
it did not arrive in 120s, while the page's visible text was complete and
byte-identical in length at 4.3s under `load`.

Because axe and every `onRenderedPage` custom check hang off that single
navigation, one unreachable condition took down three scanners at once.
The first scan of this site produced:

| | broken | after fix |
|---|---|---|
| page errors | 20/20 renderDiff failed | none |
| axe findings | **0** | 44 |
| accessibility findings | 1 | 95 |
| serious | 1 | 47 |
| total | 44 | 145 |

A report would have gone to a client titled "audit accessibilite" with
one accessibility finding in it.

Fixed: `load` plus a bounded, best-effort `waitForLoadState('networkidle')`
whose timeout is a normal outcome, not an error. New
`DEFAULT_RENDER_SETTLE_TIMEOUT_MS` (8000, `RENDER_SETTLE_TIMEOUT_MS`
overridable), recorded on `AuditConfigSnapshot.renderSettleTimeoutMs` for
provenance. `render-diff-settle.e2e.test.ts` reproduces the shape that
mattered (a page whose text is complete long before its network is) and
fails against the old code.

Raising `PAGE_TIMEOUT_MS` would **not** have fixed this, which is worth
recording: the natural first guess is wrong here.

---

## P1: blocks sending this file to a client

### 1.1 The cover names the client "Mariages et evenements prives"

The cover, and the printable checklist on page 10, both identify the
client as **Mariages et evenements prives**. The business is **Domaine
Lagnonu**.

Root cause is a two-step fall-through, not a single bad heuristic:

1. The homepage title is `Hotel de luxe Corse du Sud a Ajaccio : Votre
   sejour dans un hebergement de luxe dans le Golfe d'Ajaccio`. No
   `og:site_name`, no `|` or em-dash separator, and too long for
   `BARE_TITLE_MAX_LENGTH`, so `deriveSiteName` returns `undefined` for
   the homepage.
2. The depth-ordered fallback (added by A1 earlier the same day) then
   reaches `/fr/evenements/mariages-celebrations`, whose title is
   `Domaine Lagnonu | Mariages et evenements prives`.
   `TITLE_SITE_NAME_SEPARATORS` splits on `|` and takes the **last**
   segment.

The heuristic assumes `Page | Site`. This site uses the equally common
`Site | Page`. The correct name was in the same string, in the other half.

Suggested fix, measured against the real scan rather than reasoned about:
choose the title segment that **recurs across pages**. On this site,
`Domaine Lagnonu` appears in 6 page titles; every page-specific segment
appears exactly once:

```
  6 x  Domaine Lagnonu
  4 x  Lagnonu - Coti-Chiavari
  1 x  Les activites a pratiquer a Ajaccio.
  1 x  Blog
  1 x  Contact et coordonnees
```

Frequency across the site distinguishes a brand from a page topic without
assuming which end of the separator it sits on. Keep returning `undefined`
when nothing recurs: an absent prefill, never a guessed one.

### 1.2 The model writes legal-consequence claims (rule 6 breach)

Four model-written strings assert a legal consequence; three are rendered:

| location | text | rendered |
|---|---|---|
| `executiveSummary` | "exposent a des risques juridiques" | yes, p.4 |
| `themes[0].businessImpact` | "expose a des risques juridiques" | yes, p.7 |
| `themes[2].businessImpact` | **"expose a une amende"** | yes, p.8 |
| `themes[8].businessImpact` | "expose a des sanctions" | no (rank 9) |

"L'absence de numero SIREN ou RCS expose a une amende" is a sanction
claim about this specific client, which CLAUDE.md rule 6 forbids and
which `docs/obligation-basis.md` section 7 governs. Trade-off 28
deliberately withheld the LCEN sanction ceiling from any render path and
guarded it with a test; that guard covers the **amount** coming out of
`regimes.ts`, and does not cover the model asserting in prose that a fine
exists.

This is the same failure mode trade-off 11 already resolved for Argument
B by taking the pen away entirely.

Checked rather than assumed: `writing-prompt.ts` did **not** forbid this.
It never mentioned legal consequence at all, only that `legalRelevance`
is decided outside the pass. So the model was never instructed, which
makes this a missing control rather than an ignored one.

### 1.3 Two thirds of the site was never audited, and the report does not say so

The crawl visited 43 pages: 40 under `/fr/`, plus `/`, `/panier`,
`/legal-notice`. **Zero `/en/` and zero `/es/` pages**, though the sitemap
declares 22 of them.

The report states "43 pages analysees" and "Perimetre : 43 pages analysees
le 24 aout 2026 a partir de la page d'accueil" without disclosing that
the English and Spanish sites were not examined. A client reading
"peri­metre analyse: 43 pages" reasonably concludes the site was covered.

Two separable issues:

- The crawler discovers by link-following only and never seeds from
  `sitemap.xml`, even though `sitemap.ts` already fetches and parses it
  (a `sitemap-orphan-page` finding was emitted from that same data).
  22 declared URLs went unvisited.
- Whatever the crawl reaches, section 10 should state the language
  coverage it actually achieved when a site publishes language variants.

### 1.4 `hreflang-missing` has a severity, remediation copy, and no emitter

`severity.ts:114-115` maps `hreflang-missing` and `hreflang-invalid`;
`recommendation-templates.ts:191-206` has remediation copy for both.
Neither is emitted anywhere in the codebase. Only
`hreflang-no-return-link` is, and that requires hreflang to already exist.

This site publishes **zero hreflang on all 43 pages** while running three
language versions, and receives no finding about it. For a hotel selling
to international guests that is a commercially real miss: search engines
cannot associate the variants.

Same class as trade-off 28's LCEN regime (complete, unread, unrendered)
and trade-off 23's cost-gating predicates (documented as shipped, never
implemented). Worth a grep pass for other rule IDs that have a severity
mapping and no emitter.

Retrofittable offline: `hreflangLinks` is already stored per page, so
`normalize <dir>` can rebuild without re-scanning the client site.

---

## P2: weakens the report

### 2.1 Performance is 4 of the 5 critical findings and appears in no priority

Section 04 tells the director "43/43 pages avec au moins un constat
critique". Four of those five criticals are `total-blocking-time`,
`first-contentful-paint`, `largest-contentful-paint` and `speed-index`,
each on all 43 pages. Section 09 shows median TBT 3 936 ms against a
200 ms threshold, worst page 28 701 ms.

The Priorites section contains six chantiers and **not one of them is
performance**: the performance themes rank 12, 15 and 17. So the single
statistic on the cover is driven by a problem the priorities never
mention. For a director this reads as a contradiction, and for the
agency it buries the most measurable win.

### 2.2 Theme category is model-chosen and can disagree with its findings

Theme rank 15, "En-tetes de securite manquants", carries
`theme.category = 'performance'`. Its three findings
(`security-header-missing-csp`/`-hsts`/`-x-frame-options`) are all
`privacy` category, per trade-off 25.

Latent rather than visible here only because rank 15 is below the six
rendered priorities. The consequence is trade-off 16's B1 bug arriving by
a new route: `themes.ts` calls
`selectReferenceStats(theme.category, sector)`, so a mislabeled theme can
attach a page-speed statistic to a security priority. B1 was fixed by
retagging the stats; nothing checks the other input.

Cheap deterministic guard: assert a theme's category matches the category
of its own findings, and prefer the findings' category when they disagree.

### 2.3 Overlapping page sets presented as a split

Priority 5 renders: "37 pages relevent de votre site (votre agence peut
corriger), 36 pages relevent de un composant tiers", directly under
"Pages affectees : 37 pages sur 43".

Both numbers are correct as computed (`themes.ts:173` unions `pageUrls`
over each subset), but the sets overlap and the sentence reads as a
partition of a 43-page site. 37 + 36 = 73. Any reader who adds them
concludes the report is broken.

### 2.4 French elision bug in the same sentence

`fr.ts:314` hardcodes `relevent de {vendor}`. With the generic fallback
vendor it renders **"relevent de un composant tiers"** instead of "d'un".
Correct for "de Zenchef", wrong for every vowel-initial vendor string.

### 2.5 Model prose bypasses the guillemet and dash typography rules

Trade-off 29 replaced 23 guillemet pairs with U+00A0 and added
`guillemet-spacing.test.ts` scanning every source file. That guard covers
repo strings only. In this analysis, **6 model-written strings use an
ordinary space inside guillemets and 0 use U+00A0** - the exact defect
trade-off 29 fixed, re-entering through the model.

Same for dashes: the style rule forbids em and en dashes in report copy,
and `themes[3]` contains "Carte Google Maps - Acces a La Lagnonu" with a
U+2013.

Both are deterministic normalizations that belong on model output before
it is persisted, not prompt instructions.

### 2.6 Model-written page counts contradict the deterministic counts beside them

Recommended-action bullets state page counts that disagree with the
finding data rendered on the same card:

| priority | model prose | card says |
|---|---|---|
| 2 | "liens repetes sur 18 pages" | 43 pages sur 43 |
| 4 | "sur les 18 pages concernees" | 43 pages sur 43 |
| 5 | "sur les 18 pages concernees" | 37 pages sur 43 |
| 6 | "sur les 12 pages concernees" | 34 pages sur 43 |

Rule 1 says the model may not introduce facts absent from its input.
A page count it invented is exactly that, and it is checkable
deterministically against `pageUrls`.

---

## Verified good

Worth recording so a later pass does not re-litigate them:

- No English debug text in the French legal section (Palais Gallien 0.2).
- No `?` placeholders (Palais Gallien 0.3); section 08 renders its real
  branch.
- Section 03 correctly reports obligation status "Indetermine" on a
  missing SIREN rather than asserting scope, per rule 6.
- The LCEN block renders with the post-SREN citation (article 1-1, I, 2,
  in force 23 May 2024) and no sanction amount, per trade-off 28.
- The CrUX reconciliation note (trade-off 20) renders correctly: lab LCP
  median 3.9s against field LCP 2.0s, with the explanation between them.
- `pagesScanned` (43) matches the pages that actually returned a
  Lighthouse measurement, 43 of 43.
- Glossary uses hyphens, not em dashes.
