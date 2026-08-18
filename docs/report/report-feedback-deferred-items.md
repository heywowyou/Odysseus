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

## Needs a new estimation model, not a content fix

### Remediation cost / effort-in-days / page-value weighting
Source: `report-feedback-palais-gallien-v2.md` item 3.10 (Session C, "C11"
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
Source: `report-feedback-palais-gallien-v2.md` item 3.2 (Session C, "C3"
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
Source: `report-feedback-palais-gallien-v2.md` item 1.15 (flagged, not
built, during Session B planning).

The report currently states render-diff and other evidence in text only.
Wiring actual screenshot references (`renderDiffEvidence` already has
them) into the report body is a real feature - new layout, a data-
minimisation review (trade-off 2 in `CLAUDE.md` already treats screenshot
retention carefully), and print-size/contrast implications - not a
one-session addition. Noted as a follow-up candidate for a dedicated
milestone.

### Image filename/src instead of positional selectors
Source: `report-feedback-palais-gallien-v2.md` P4 item ("`img:nth-of-type(32)`
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

These aren't broken - they render clearly-marked-as-placeholder, per
CLAUDE.md's rule against ever showing a plausible fake number - but they
need a real decision (from Jules) before the report can ship to a client
outside internal testing:

- `ODYSSEUS_SIRET_PLACEHOLDER` (`packages/report/src/template/html-utils.ts`):
  literal `[SIRET à renseigner]`, needs the real SIRET.
- `ODYSSEUS_REAUDIT_PRICE_EUR_HT` / `ODYSSEUS_REAUDIT_LEAD_TIME_DAYS`
  (same file): EUR 450 HT / 5 business days, reasoned as ~28% of the
  EUR 1,600 HT full-audit price but with no existing reference point in
  `docs/offer-positioning.md` - needs Jules to confirm or replace.
- `ODYSSEUS_CONTACT_EMAIL` (same file): `contact@odysseusaudit.com`,
  flagged in its own code comment as "confirm this mailbox is actually
  monitored before this ships."

## Checked, no longer reproduces

### f087 (1 page, 20 occurrences) vs f036 (1 page, 2 occurrences) occurrence-count check
Source: `report-feedback-palais-gallien-v2.md` P4 item, "worth verifying the
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
