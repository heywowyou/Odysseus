# Report feedback: deferred items

Tracking doc for feedback-pass items that were deliberately **not** fixed
during the haaitza / Palais Gallien v1 / Palais Gallien v2 review-and-fix
cycle, so they don't get silently lost or rediscovered from scratch on a
future pass. Add to this list rather than re-triaging from the original
feedback docs each time a new pass turns up the same kind of gap.

Each entry states what was asked, why it wasn't done in the session that
found it, and what would actually be needed to close it. When one of
these ships, move it out of this file (into the relevant `CLAUDE.md`
trade-off or a commit message) rather than leaving it here marked done.

**Lifecycle rule (confirmed 2026-08-21):** once every item in a dated
feedback doc (`docs/report/<date>-<client>-feedback.md`) is either fixed
or explicitly captured here as a deferred item, move that feedback doc
itself into `docs/report/archive/` (`git mv`, never delete). Do this as
the last step of the session that closes it out, not a separate cleanup
pass later - a feedback doc left in the working folder after everything
in it has been resolved or deferred is indistinguishable at a glance from
one that still has open work. This file and whichever feedback doc is
currently active stay out of the archive until their own turn comes.

## Needs a new estimation model, not a content fix

### Remediation cost / effort-in-days / page-value weighting
Source: `archive/report-feedback-palais-gallien-v2.md` item 3.10 (Session C, "C11"
in the fix plan); the same idea appeared earlier, never built, as
haaitza's item C1 (effort-band idea).

> The client's first question after "what is broken" is "what will this
> cost me". Effort Faible/Moyen/Élevé does not answer it. [...] all 20
> pages are weighted equally, so `/mentions-legales` counts the same as
> the room pages and the booking widget.

Needs: a genuine developer-day estimation model (bands derived from rule
family and occurrence concentration) plus a page-commercial-relevance
weighting scheme (e.g. flagging booking/checkout-path pages explicitly).
Both are new domain models, not a copy or template change - out of scope
for a feedback-fix session that's otherwise deterministic-data-only.

## Needs infrastructure that doesn't exist yet

### "Reste à traiter" grouped guidance for unaddressed findings
Source: `archive/report-feedback-palais-gallien-v2.md` item 3.2 (Session C, "C3"
in the fix plan).

> The priorities section covers f001 to f007. The other 91 appear only as
> annex rows. [...] A short "reste à traiter, groupé par thème" block,
> with the fixed recommendation templates already in `packages/reference`,
> would close this without adding LLM risk.

The v2 doc's own suggested fix assumes a `packages/reference` package of
fixed recommendation templates keyed by rule ID. **That package does not
exist** - checked directly against the repo during Session C, not
assumed. Building the block as suggested means authoring remediation copy
for the ~90 non-top-7 rule IDs the report can group findings under, which
is a real content-authoring project (and arguably wants the same
deterministic-and-reviewed treatment as `docs/obligation-basis.md`'s
legal content), not something to improvise inside a bug-fix session.
Needs: someone to actually decide whether this becomes a `packages/reference`
package, what its authoring/review process is, and who writes ~90 short
remediation blurbs.

### Visual evidence / screenshots in the report
Source: `archive/report-feedback-palais-gallien-v2.md` item 1.15 (flagged, not
built, during Session B planning).

The report currently states render-diff and other evidence in text only.
Wiring actual screenshot references (`renderDiffEvidence` already has
them) into the report body is a real feature - new layout, a data-
minimisation review (trade-off 2 in `CLAUDE.md` already treats screenshot
retention carefully), and print-size/contrast implications - not a
one-session addition. Noted as a follow-up candidate for a dedicated
milestone.

### P4.2 - section-opener containment (heading + intro + first content unit as one atomic block)
Source: `archive/2026-08-21-lacoorniche-feedback.md` P4.2, deferred during the
2026-08-22 fix session.

The existing `.section-head { break-inside: avoid }` plus
`.section-head + p { break-after: avoid }` pair (`paged.css`) already keeps
a section's heading, kicker, and immediately-following intro paragraph
glued to what comes after them - the concretely-reported symptom (a header
stranded alone at a page bottom) is already fixed by this pair. What it
does not cover is the narrower gap: nothing guarantees the *first real
content unit after the intro paragraph* (a card, a table row) stays
attached too, so a pathological case could still strand heading+intro
alone with the first content item pushed to the next page. Fixing that
properly means wrapping heading+kicker+intro+first-content-unit in one
container per section template - a per-file structural change across most
of `packages/report/src/template/sections/*.ts`, not a CSS-only fix, and
risky to do broadly without a real-scan regression to target. Needs: a
real report that actually exhibits the narrower gap (not yet observed
against the stress fixture or any committed real-site artifact), so the
fix can be verified against the actual failure mode instead of guessed at.

## Paged.js limitations in fragmented tables

### Annex table headers do not repeat on continuation pages
Source: 2026-08-25 Domaine Lagnonu review, D3. **Operator decision the same
day: accept as it stands, revisit only if a later read-through still
snags on it.**

Paged.js 0.4.3 does not implement `display: table-header-group`
repetition. An annex table spanning six pages prints its header row once,
so every page after the first opens with four unlabelled columns. This is
an engine limitation, not a CSS mistake: the `paged.css` comment that
claimed the pattern worked was simply wrong and has been corrected, and
nothing ever exercised it because the Core Web Vitals table always fits on
one page.

Accepting it is defensible now specifically because D2 was fixed in the
same session: the four columns are geometrically stable across breaks and
read unambiguously as id / page count / occurrence count / selector. It
would not have been defensible while the columns were also moving.

If it does need closing later, three routes exist, in ascending cost:
1. Make each row self-describing with small inline column labels. No
   engine work at all.
2. Repeat the rule-group caption as a running header via a Paged.js hook.
3. Upgrade or patch Paged.js.

### `.appendix-url-row { break-before: avoid }` does not work
Source: 2026-08-25 Domaine Lagnonu review, found while diagnosing D2.

A finding's page-URL sub-row can be separated from the finding row it
belongs to: in a real report, page 17 opened with a URL row whose own
finding row was the last thing on page 16. Pre-existing and unrelated to
that session's changes. The likely cause is the same one that defeated the
`<thead>` and `<colgroup>` fixes for D2 - Paged.js's fragmentation of a
table does not carry the relationship the CSS rule is expressed against -
but that was not confirmed, so it needs its own diagnosis rather than an
assumed cause. Worth pairing with D3 above if either is ever picked up,
since both are the same engine's handling of fragmented tables.

## Needs a locked-contract change

### Image filename/src instead of positional selectors
Source: `archive/report-feedback-palais-gallien-v2.md` P4 item ("`img:nth-of-type(32)`
[...] is not actionable [...] the image filename or src would be far more
useful"), evaluated during Session D.

`FindingElement` (`packages/core/src/types/findings.ts`, a locked
contract) carries only `selector`, `snippet`, and `pageUrl` - no `src` or
filename field. Adding one means either extending the scanner's element-
capture logic to record `src` for image-related rules, or deriving it
from the snippet's own markup at render time (fragile: snippets aren't
guaranteed to contain the full `<img>` tag). Either path touches scanner
capture, not just the report template, and the locked-contract note above
means any `FindingElement` shape change needs an explicit ask-first
conversation before touching it. Not attempted this session per CLAUDE.md's
"don't invent new scanner capability for this" guidance already written
into the fix plan.

## Placeholder values awaiting a real answer, not a code fix

**Empty as of 2026-08-25.** The one entry this section held (the SIRET)
was closed on inspection: `html-utils.ts` already defaults
`ODYSSEUS_REGISTRATION_NUMBER` to the real registration number, and the
value in `.env` matches it exactly (compared, not eyeballed). The
pre-flight guard in `render-lint.ts` (`FORBIDDEN_PATTERNS`, matching the
`[... a renseigner]` bracket convention) stays, since it is what stops any
future placeholder shipping silently.

One live nit worth fixing whenever that file is next touched: the code
reads `process.env['ODYSSEUS_SIRET']` while `.env` defines `SIRET`, so the
environment override never actually fires. Harmless today only because the
committed default is the correct value.

**Confirmed 2026-08-19, no longer open:** `ODYSSEUS_REAUDIT_PRICE_EUR_HT`
/ `ODYSSEUS_REAUDIT_LEAD_TIME_DAYS` (EUR 450 HT / 5 business days,
now documented in `docs/offer-positioning.md` section 1) and
`ODYSSEUS_CONTACT_EMAIL` (`contact@odysseusaudit.com`, confirmed
monitored) are both canonical values now, not placeholders.

## Checked, no longer reproduces

### f087 (1 page, 20 occurrences) vs f036 (1 page, 2 occurrences) occurrence-count check
Source: `archive/report-feedback-palais-gallien-v2.md` P4 item, "worth verifying the
occurrence counter on that rule."

Checked directly against a fresh Palais Gallien regeneration (Session D,
2026-08-19): those exact finding IDs no longer refer to the same
findings the v2 doc's authors saw. Finding IDs are assigned per
regeneration, and Session B's Lighthouse-pair dedupe (item B3/1.1) and
Session C's image-weight rule-family clustering (item 1.3/C2) both
changed which findings exist and how they're numbered since that pass
was written. In the current data, `f036` is a `lighthouse`
`unsized-images` finding (3 occurrences, 1 page) and `f087` is a
`custom` `meta-description-length` finding (3 occurrences, 3 pages) -
neither resembles the pairing the v2 doc flagged. Not a bug to fix; the
concern was tied to a specific, since-superseded finding-ID assignment.
If a future pass reports a similar-looking occurrence-count mismatch,
re-check against fresh IDs rather than assuming this is the same issue
recurring.

## Previously miscategorized as "flaky" - actually fixed, not deferred

Kept here as a record, not an open item: `render-html.axe.test.ts` and
two sub-tests of `paged-invariants.test.ts` (`invariant 4`, `invariant 8a`)
were excluded from full-suite runs across Sessions A through C as "known
flaky," on the assumption they failed for environmental reasons unrelated
to the code under test. Session D's standing instruction was to stop
doing that and actually root-cause them instead of re-excluding. Both
turned out to be real, fixable bugs, not flakiness:

- **Invariant 4** (`paged-invariants.test.ts`) asserted every page has a
  non-empty page-counter rule in its top-right margin box, including the
  cover page - but `paged.css`'s `@page cover` rule deliberately sets
  `@top-right { content: ""; }` (the cover has no running header at all,
  by design). The test was asserting something the design explicitly
  contradicts on one page. Fixed by exempting the cover with its own
  assertion (`counterRule` must equal `'""'`), not a skip, so a future
  accidental counter on the cover would still be caught.
- **Invariant 8a** (post-pagination axe audit) failed on a genuine
  `color-contrast` violation: `#section-05` (the printable checklist)'s
  intro/identifier paragraphs carry an inline `opacity` (0.55 / 0.7) for
  visual hierarchy against the page's normal dark background. The
  `@media print` override (item 0.1) forces a dark text color for
  legibility against the page's light print background, but never
  neutralized that inline opacity, so the effective rendered grey landed
  at a contrast ratio (~3.87:1) borderline below WCAG's 4.5:1 minimum -
  explaining why it read as intermittent rather than a hard failure.
  Fixed in `paged.css` by adding `opacity: 1 !important` to the same
  print-override rule that already forces the text color.

Both fixes are covered by the (no-longer-excluded) tests themselves; no
separate regression test was needed since the tests that caught the bugs
now assert the fixed behaviour.

## Checked, not a bug: the 7 500 euro per-manquement figure

2026-08-19. Raised as a possible omission when asking to regenerate the
La Corniche report (`artifacts/lacoorniche.com/2026-08-19T11-15-01Z`,
manual fields copied over from the earlier same-day audit
`83bc6711-ea32-4005-b176-9c3c6ed09f2c` via `setAuditManualFields` and
re-rendered as `reports/2026-08-19T12-39-41Z-fr.pdf`). Checked directly:
the figure is present, page 4, "Exposition en cas de manquement" -
"soit jusqu'a 7 500 EUR par manquement constate pour une personne
morale, cumulable (art. R451-4 du code de la consommation)." Confirmed
both via `pdftotext` and a rendered screenshot of the page. Not an open
item; noted here only so a future session does not re-investigate the
same non-bug.


## Closed: SCAN_CONCURRENCY does not inflate Lighthouse's lab LCP

2026-08-24 (A11). Trade-off 20 left this genuinely open: a real La
Corniche report showed lab-measured LCP median 33.2s directly above
real-user CrUX LCP 4.1s, and one hypothesis was that running Lighthouse
across `SCAN_CONCURRENCY` lanes still contends for host CPU against the
throttled simulation, despite the serialization queue trade-off 10
describes. That session could not test it, because confirming it on a
live site would have needed two authorized scans of `lacoorniche.com`
and only one was authorized. Re-scanning a live third-party site for a
diagnostic nobody asked for is exactly what the politeness rule exists to
prevent.

The *mechanism* needs no live site at all. Tested against
`fixtures/spa-demo` served by `vite preview`, six full scans, three at
`SCAN_CONCURRENCY=1` and three at `SCAN_CONCURRENCY=3`, four pages each,
comparing Lighthouse's own `largest-contentful-paint` numericValue.

| | n (page measurements) | LCP median | LCP mean | min | max |
|---|---|---|---|---|---|
| `SCAN_CONCURRENCY=1` | 9 | 1402 ms | 1405 ms | 1353 | 1465 |
| `SCAN_CONCURRENCY=3` | 9 | 1403 ms | 1393 ms | 1353 | 1443 |

Per-URL medians: 0.95, 1.04, 1.00 (c3/c1). The two arms are
indistinguishable, and the spread within each arm is larger than the
difference between them. TBT was 0 ms throughout.

**Conclusion: not supported.** Lane concurrency is not what produced the
33.2s figure, and the existing Lighthouse serialization queue is doing
its job. Do not remove that queue on the strength of this result - the
collision it guards against is a `perf_hooks` mark collision, a different
failure entirely (trade-off 10), and this experiment says nothing about
it.

**What this does not rule out.** The fixture is three trivial local pages
with no real CPU work, so LCP here is dominated by Lighthouse's simulated
throttling rather than by host contention. A heavy real site doing real
main-thread work could still contend in a way this cannot show. What the
result does establish is that lane concurrency has no *inherent*
inflating effect, which was the specific claim on the table. The
remaining explanation for a 33.2s lab figure is the ordinary one already
disclosed to the client: a deliberately harsh single-run mobile
simulation against a heavy site, which is what
`core-web-vitals-table.ts`'s reconciliation note (trade-off 20) exists to
say.

Raw logs and the analysis script are session-scratch only, not committed;
the numbers above are the result.
